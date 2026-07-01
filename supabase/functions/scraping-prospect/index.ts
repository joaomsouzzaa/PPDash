import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
};

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Resolve a org ATIVA: header x-org-slug (com verificação de acesso) > body.org_id > profiles.org_id.
// Mesmo padrão de agente-trafego, para não vazar dados entre clientes.
async function resolveOrg(supabase: any, req: Request, body: any): Promise<string | null> {
  const slug = req.headers.get("x-org-slug");
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");

  if (slug) {
    const { data: org } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (org?.id) {
      if (!token) return org.id;
      const { data: u } = await supabase.auth.getUser(token);
      if (u?.user) {
        const { data: p } = await supabase.from("profiles").select("papel").eq("id", u.user.id).maybeSingle();
        if (p?.papel === "super_admin") return org.id;
        const { data: m } = await supabase.from("memberships").select("user_id")
          .eq("user_id", u.user.id).eq("org_id", org.id).eq("status", "ativo").maybeSingle();
        if (m) return org.id;
      }
    }
  }
  if (body?.org_id) return body.org_id;
  if (token) {
    const { data: u } = await supabase.auth.getUser(token);
    if (u?.user) {
      const { data: p } = await supabase.from("profiles").select("org_id").eq("id", u.user.id).maybeSingle();
      if (p?.org_id) return p.org_id as string;
    }
  }
  return null;
}

// Lê a chave de um provider (org primeiro, depois variável de ambiente).
async function getKey(supabase: any, provider: string, orgId: string | null, envName: string): Promise<string> {
  let key: string | undefined;
  if (orgId) {
    const { data } = await supabase.from("ai_config").select("api_key").eq("provider", provider).eq("org_id", orgId).limit(1);
    key = data?.[0]?.api_key ?? undefined;
  }
  if (!key) {
    const { data } = await supabase.from("ai_config").select("api_key").eq("provider", provider).limit(1);
    key = data?.[0]?.api_key ?? undefined;
  }
  if (!key) key = Deno.env.get(envName) ?? undefined;
  if (!key) throw new Error(`Configure a chave do provider "${provider}" em Agentes → Configurar modelos`);
  return key;
}

// Config do modelo de IA (org sobrescreve; default Anthropic Claude).
async function getAIConfig(supabase: any, orgId: string | null): Promise<{ provider: string; modelo: string; apiKey: string }> {
  let provider = "anthropic";
  let modelo = "claude-opus-4-8";
  if (orgId) {
    const { data } = await supabase.from("ai_config").select("provider,modelo").eq("org_id", orgId).limit(1);
    if (data?.[0]?.provider) { provider = data[0].provider; if (data[0].modelo) modelo = data[0].modelo; }
  }
  const envName = provider === "openai" ? "OPENAI_API_KEY" : provider === "google" ? "GOOGLE_API_KEY" : "ANTHROPIC_API_KEY";
  const apiKey = await getKey(supabase, provider, orgId, envName);
  return { provider, modelo, apiKey };
}

function handleLimpo(raw: string): string {
  return (raw || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").trim();
}

// ---------------------------------------------------------------------------
// Apify
// ---------------------------------------------------------------------------
async function apifyRun(token: string, actor: string, input: unknown): Promise<any[]> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Apify (${actor}): ${txt.slice(0, 300)}`);
  let arr: any[];
  try { arr = JSON.parse(txt); } catch { throw new Error(`Resposta inesperada do Apify (${actor})`); }
  return Array.isArray(arr) ? arr : [];
}

// Busca dados completos de 1+ perfis (bio, categoria, seguidores) via instagram-profile-scraper.
async function buscarPerfis(token: string, usernames: string[]): Promise<any[]> {
  if (usernames.length === 0) return [];
  const arr = await apifyRun(token, "apify~instagram-profile-scraper", { usernames });
  return arr.map((it) => ({
    handle: it.username || "",
    nome: it.fullName || "",
    bio: it.biography || "",
    foto_url: it.profilePicUrl || it.profilePicUrlHD || null,
    is_business: !!(it.isBusinessAccount || it.businessCategoryName),
    business_category: it.businessCategoryName || it.categoryName || null,
    followers: Number(it.followersCount ?? 0) || null,
    is_private: !!it.private,
  })).filter((p) => p.handle);
}

// Puxa uma lista de seguidores do perfil isca via instagram-follower-scraper.
// Retorna username/fullName (SEM bio — precisa de buscarPerfis depois).
async function buscarSeguidores(token: string, perfilIsca: string, limite: number): Promise<string[]> {
  const arr = await apifyRun(token, "apify~instagram-follower-scraper", {
    usernames: [perfilIsca],
    resultsLimit: limite,
  });
  const handles = arr
    .map((it) => it.username || it.handle || "")
    .filter((h: string) => !!h);
  return [...new Set(handles)] as string[];
}

// Extrai o @ de empresa/clínica citado na bio (heurística; a IA confirma depois).
function acharEmpresaHandle(bio: string, proprio: string): string | null {
  const m = (bio || "").match(/@([a-zA-Z0-9._]{2,})/g);
  if (!m) return null;
  for (const raw of m) {
    const h = raw.replace("@", "");
    if (h.toLowerCase() !== (proprio || "").toLowerCase()) return h;
  }
  return null;
}

// ---------------------------------------------------------------------------
// IA de social selling
// ---------------------------------------------------------------------------
async function callModel(cfg: { provider: string; modelo: string; apiKey: string }, system: string, user: string): Promise<string> {
  if (cfg.provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: cfg.modelo, max_tokens: 1500, system, messages: [{ role: "user", content: user }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Erro Anthropic");
    return j.content?.map((c: any) => c.text).join("") || "";
  }
  if (cfg.provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: cfg.modelo, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Erro OpenAI");
    return j.choices?.[0]?.message?.content || "";
  }
  if (cfg.provider === "google") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.modelo}:generateContent?key=${cfg.apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Erro Google");
    return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
  }
  throw new Error(`Provider desconhecido: ${cfg.provider}`);
}

function extrairJson(txt: string): any {
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("IA não retornou JSON");
  return JSON.parse(m[0]);
}

function produtosContexto(produtos: any[]): string {
  if (!produtos || produtos.length === 0) return "(Nenhum produto cadastrado. Sugira apenas se fizer muito sentido.)";
  return produtos.map((p) =>
    `- ${p.nome}\n  Resolve: ${p.descricao || "-"}\n  Público ideal: ${p.publico_alvo || "-"}\n  Gatilhos: ${(p.gatilhos || []).join("; ") || "-"}`,
  ).join("\n");
}

const SYSTEM_SOCIAL_SELLING = `Você é uma agente de SOCIAL SELLING sênior que analisa perfis de Instagram para prospecção B2B.
Sua análise precisa ser ACERTIVA: identifique o segmento, se é um perfil PESSOAL/profissional ou de EMPRESA,
e se na bio há o @ de uma clínica/empresa (mesmo quando o perfil principal é da pessoa física).

Cruze o perfil com a lista de PRODUTOS fornecida e sugira quais fazem sentido (pode ser mais de um; pode ser nenhum).
Diretrizes de encaixe: empresa já estruturada e com marca forte → consultoria/formatar em franquia;
especialista/médico sem empresa própria que não monetiza o conhecimento → transformar conhecimento em produto (mentoria).

Depois gere UMA mensagem de prospecção para o direct, VARIADA e ajustada a este perfil específico (nunca template fixo),
dividida em DUAS partes (para enviar em 2 tempos e soar humano):
- mensagem_parte1: saudação curta e calorosa, informal, usando o primeiro nome quando der (ex: "Falaaa Gabiii").
- mensagem_parte2: uma observação REAL e específica sobre o perfil/negócio + uma pergunta/CTA leve conectada ao produto.
Exemplo de tom (NÃO copie literalmente):
  parte1: "Falaaa Gabiii"
  parte2: "Tava dando uma olhada no perfil da Infinity e gostei do posicionamento com carros de luxo. Vocês já tão pensando em franquia??"

REGRAS DA MENSAGEM: português do Brasil, tom humano/informal, SEM markdown (não use * nem **),
sem parecer robô, sem "prezado", curta. Não invente fatos que não estão na bio.

Responda SOMENTE com um objeto JSON válido (sem texto antes/depois), neste formato:
{
  "score": 0-100,                       // quão bom é este prospect
  "segmento": "medicos" | "estetica" | "outro" | "...",
  "is_business": true|false,
  "empresa_handle": "@daempresa" | null, // o @ da empresa/clínica citado na bio, se houver
  "resumo": "1-2 frases sobre quem é e o potencial",
  "produtos_sugeridos": [{ "produto": "nome exato do produto", "motivo": "por que encaixa" }],
  "sinais": ["sinais observados na bio que embasam a análise"],
  "mensagem_parte1": "...",
  "mensagem_parte2": "..."
}`;

async function analisarComIA(cfg: any, perfil: any, produtos: any[]): Promise<any> {
  const user = `PERFIL A ANALISAR
handle: @${perfil.handle}
nome: ${perfil.nome || "-"}
é conta business: ${perfil.is_business ? "sim" : "não/desconhecido"}
categoria (Meta): ${perfil.business_category || "-"}
seguidores: ${perfil.followers ?? "-"}
bio:
"""
${perfil.bio || "(sem bio)"}
"""

PRODUTOS DISPONÍVEIS (cruze o perfil com estes):
${produtosContexto(produtos)}`;
  const raw = await callModel(cfg, SYSTEM_SOCIAL_SELLING, user);
  return extrairJson(raw);
}

// Monta o registro a gravar em prospect_analises a partir do perfil + análise da IA.
function montarRegistro(orgId: string | null, perfil: any, ia: any, origem: string, jobId: string | null, nichoAlvo?: string) {
  const empresaHandle = (ia.empresa_handle && String(ia.empresa_handle).replace(/^@/, "")) || acharEmpresaHandle(perfil.bio, perfil.handle);
  const segmento = ia.segmento || null;
  const nicheMatch = nichoAlvo ? String(segmento || "").toLowerCase() === nichoAlvo.toLowerCase() : true;
  return {
    org_id: orgId,
    job_id: jobId,
    handle: perfil.handle,
    nome: perfil.nome || null,
    bio: perfil.bio || null,
    foto_url: perfil.foto_url || null,
    is_business: typeof ia.is_business === "boolean" ? ia.is_business : perfil.is_business,
    empresa_handle: empresaHandle || null,
    niche_match: nicheMatch,
    segmento,
    followers: perfil.followers ?? null,
    analise: {
      score: ia.score ?? null,
      resumo: ia.resumo ?? "",
      produtos_sugeridos: Array.isArray(ia.produtos_sugeridos) ? ia.produtos_sugeridos : [],
      sinais: Array.isArray(ia.sinais) ? ia.sinais : [],
    },
    mensagem_parte1: ia.mensagem_parte1 || "",
    mensagem_parte2: ia.mensagem_parte2 || "",
    origem,
  };
}

async function carregarProdutos(supabase: any, orgId: string | null): Promise<any[]> {
  const { data } = await supabase.from("prospect_produtos").select("*").eq("org_id", orgId).eq("ativo", true);
  return data || [];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function analisarPerfil(supabase: any, orgId: string | null, handle: string) {
  const conta = handleLimpo(handle);
  if (!conta) throw new Error("Informe um @ de Instagram válido");
  const apifyToken = await getKey(supabase, "apify", orgId, "APIFY_TOKEN");
  const [perfil] = await buscarPerfis(apifyToken, [conta]);
  if (!perfil) throw new Error(`Perfil @${conta} não encontrado`);

  const cfg = await getAIConfig(supabase, orgId);
  const produtos = await carregarProdutos(supabase, orgId);
  const ia = await analisarComIA(cfg, perfil, produtos);

  const registro = montarRegistro(orgId, perfil, ia, "avulso", null);
  const { data, error } = await supabase.from("prospect_analises")
    .upsert(registro, { onConflict: "org_id,handle,job_id" }).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return { analise: data };
}

async function scrapeSeguidores(supabase: any, orgId: string | null, perfilIsca: string, nicho: string, limite: number) {
  const isca = handleLimpo(perfilIsca);
  if (!isca) throw new Error("Informe o @ do perfil isca");
  const alvo = Math.min(Math.max(limite || 50, 1), 50);
  const apifyToken = await getKey(supabase, "apify", orgId, "APIFY_TOKEN");
  const cfg = await getAIConfig(supabase, orgId);
  const produtos = await carregarProdutos(supabase, orgId);

  const { data: job } = await supabase.from("prospect_jobs")
    .insert({ org_id: orgId, perfil_isca: isca, nicho, status: "rodando" }).select("*").single();
  const jobId = job?.id ?? null;

  const logs: string[] = [];
  let salvos = 0;
  try {
    // 1) Lista de seguidores (bound de segurança: no máx ~300 candidatos).
    const MAX_CANDIDATOS = 300;
    const candidatos = await buscarSeguidores(apifyToken, isca, MAX_CANDIDATOS);
    logs.push(`${candidatos.length} seguidores coletados de @${isca}.`);

    // 2) Buscar bios em batches e analisar até atingir o alvo do nicho.
    const BATCH = 30;
    for (let i = 0; i < candidatos.length && salvos < alvo; i += BATCH) {
      const lote = candidatos.slice(i, i + BATCH);
      let perfis: any[] = [];
      try { perfis = await buscarPerfis(apifyToken, lote); }
      catch (e) { logs.push(`Falha ao buscar bios do lote ${i / BATCH + 1}: ${e instanceof Error ? e.message : "erro"}`); continue; }

      for (const perfil of perfis) {
        if (salvos >= alvo) break;
        if (perfil.is_private) continue;
        let ia: any;
        try { ia = await analisarComIA(cfg, perfil, produtos); }
        catch { continue; }
        const registro = montarRegistro(orgId, perfil, ia, "scraping", jobId, nicho);
        if (!registro.niche_match) continue;
        const { error } = await supabase.from("prospect_analises")
          .upsert(registro, { onConflict: "org_id,handle,job_id" });
        if (!error) salvos++;
      }
      logs.push(`Lote ${i / BATCH + 1}: ${salvos}/${alvo} do nicho até agora.`);
    }
    await supabase.from("prospect_jobs").update({
      status: "concluido", total_encontrados: salvos, log: logs.join("\n"), updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  } catch (e) {
    await supabase.from("prospect_jobs").update({
      status: "erro", total_encontrados: salvos, log: [...logs, `ERRO: ${e instanceof Error ? e.message : "erro"}`].join("\n"),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    throw e;
  }
  return { job_id: jobId, total: salvos };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = svc();
    const body = await req.json();
    const orgId = await resolveOrg(supabase, req, body);
    const action = body?.action;

    if (action === "analisar_perfil") {
      return json(await analisarPerfil(supabase, orgId, body.handle));
    }
    if (action === "scrape_seguidores") {
      return json(await scrapeSeguidores(supabase, orgId, body.perfil_isca, body.nicho, body.limite));
    }
    return json({ error: "Ação inválida" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
