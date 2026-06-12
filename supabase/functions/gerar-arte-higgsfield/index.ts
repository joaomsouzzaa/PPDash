import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://platform.higgsfield.ai";
// Caminhos dos modelos (sob o BASE). Ajustar se o plano usar outros slugs.
const MODELO = {
  imagem: "flux-pro/kontext/max/text-to-image",
  video: "higgsfield/image-to-video",
};

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function bytesDe(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  return new Uint8Array(await r.arrayBuffer());
}

// Sobrepõe a logo do projeto na arte (topo-centro ou base-centro, tamanho discreto).
async function aplicarLogo(supabase: any, baseUrl: string, logoUrl: string, posicao: string, orgId: string | null): Promise<string> {
  const [baseBytes, logoBytes] = await Promise.all([bytesDe(baseUrl), bytesDe(logoUrl)]);
  const base = await Image.decode(baseBytes);
  const logo = await Image.decode(logoBytes);
  // Logo a ~16% da largura — visível mas sem competir com o texto principal.
  const targetW = Math.round(base.width * 0.16);
  const targetH = Math.max(1, Math.round(logo.height * (targetW / logo.width)));
  logo.resize(targetW, targetH);
  const margem = Math.round(base.height * 0.05);
  const x = Math.round((base.width - targetW) / 2);
  const y = posicao === "cima-centro" ? margem : base.height - targetH - margem;
  base.composite(logo, x, y);
  const out = await base.encode();
  const path = `${orgId || "global"}/${crypto.randomUUID()}.png`;
  await supabase.storage.createBucket("artes-tarefas", { public: true }).catch(() => {});
  const up = await supabase.storage.from("artes-tarefas").upload(path, out, { contentType: "image/png" });
  if (up.error) throw new Error(up.error.message);
  return supabase.storage.from("artes-tarefas").getPublicUrl(path).data.publicUrl;
}

// Procura uma URL de mídia em formatos de resposta variados.
function extrairUrl(obj: any): string | null {
  if (!obj) return null;
  return obj.images?.[0]?.url || obj.image?.url || obj.video?.url
    || obj.results?.raw?.url || obj.result?.url || obj.url
    || obj.output?.[0]?.url || null;
}

// Gera imagem na OpenAI (gpt-image-1) e sobe no Storage (devolve base64).
// Se houver refUrls (imagens de referência do projeto), usa images/edits (image-to-image)
// para que a arte seja GUIADA pelas referências; senão usa text-to-image (generations).
async function gerarOpenAI(supabase: any, apiKey: string, prompt: string, aspect: string, refUrls: string[] = [], orgId: string | null = null): Promise<string> {
  const size = aspect === "9:16" ? "1024x1536" : aspect === "16:9" ? "1536x1024" : "1024x1024";
  let res: Response;
  if (refUrls.length > 0) {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("n", "1");
    for (const u of refUrls.slice(0, 4)) {
      try {
        const r = await fetch(u);
        const buf = new Uint8Array(await r.arrayBuffer());
        const ct = r.headers.get("content-type") || "image/png";
        const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : ct.includes("webp") ? "webp" : "png";
        form.append("image[]", new Blob([buf], { type: ct }), `ref.${ext}`);
      } catch { /* ignora referência que falhar */ }
    }
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { "Authorization": `Bearer ${apiKey.trim()}` }, body: form,
    });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
    });
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${j?.error?.message || "falha ao gerar imagem"}`);
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI não retornou a imagem");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const path = `${orgId || "global"}/${crypto.randomUUID()}.png`;
  // Garante que o bucket existe (cria na hora se a migration não rodou).
  await supabase.storage.createBucket("artes-tarefas", { public: true }).catch(() => {});
  let up = await supabase.storage.from("artes-tarefas").upload(path, bytes, { contentType: "image/png", upsert: false });
  if (up.error && /not found|bucket/i.test(up.error.message)) {
    await supabase.storage.createBucket("artes-tarefas", { public: true }).catch(() => {});
    up = await supabase.storage.from("artes-tarefas").upload(path, bytes, { contentType: "image/png", upsert: false });
  }
  if (up.error) throw new Error(`Erro ao salvar no storage: ${up.error.message}`);
  return supabase.storage.from("artes-tarefas").getPublicUrl(path).data.publicUrl;
}

Deno.serve(async (req) => {
  console.log("gerar-arte-higgsfield v6 - refs image-to-image (openai edits)");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = svc();
  let anexoId: string | null = null;

  // Resolve a organização de quem chamou (chaves por org)
  let orgId: string | null = null;
  const authToken = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (authToken) {
    const { data: u } = await supabase.auth.getUser(authToken);
    if (u?.user) {
      const { data: p } = await supabase.from("profiles").select("org_id").eq("id", u.user.id).maybeSingle();
      orgId = p?.org_id ?? null;
    }
  }

  try {
    const body = await req.json();
    const tarefaId: string = body.tarefa_id;
    const tipo: "imagem" | "video" = body.tipo === "video" ? "video" : "imagem";
    const aspect: string = body.aspect_ratio || "9:16";
    let provider: "higgsfield" | "openai" = body.provider === "openai" ? "openai" : "higgsfield";
    if (tipo === "video") provider = "higgsfield"; // OpenAI não gera vídeo
    if (!tarefaId) throw new Error("tarefa_id é obrigatório");

    const { data: tarefa } = await supabase
      .from("tarefas").select("titulo,descricao").eq("id", tarefaId).maybeSingle();
    if (!tarefa) throw new Error("Tarefa não encontrada");

    let prompt: string = (body.prompt && String(body.prompt).trim())
      || [tarefa.titulo, tarefa.descricao].filter(Boolean).join(" — ");
    if (!prompt) throw new Error("Sem copy/prompt para gerar a arte");

    // Projeto/marca: contexto pra IA + logo pra sobrepor no final.
    // Pode vir um projeto específico (body.projeto_id) OU detectar automaticamente
    // pelo briefing quando body.auto_marca = true (nome/palavras-chave do projeto).
    const projetoId: string | null = body.projeto_id || null;
    let logoUrl: string | null = null;
    let logoPos = "baixo-centro";
    let refUrls: string[] = []; // imagens de referência (image-to-image no OpenAI)
    let proj: any = null;
    if (projetoId) {
      proj = (await supabase.from("projetos_design").select("*").eq("id", projetoId).maybeSingle()).data;
    } else if (body.auto_marca) {
      const texto = `${tarefa.titulo || ""} ${tarefa.descricao || ""} ${prompt}`.toLowerCase();
      const { data: projs } = await supabase.from("projetos_design").select("*");
      for (const p of projs || []) {
        const chaves = [p.nome, ...String(p.palavras_chave || "").split(",")]
          .map((x: string) => x.trim().toLowerCase()).filter(Boolean);
        if (chaves.some((k: string) => texto.includes(k))) { proj = p; break; }
      }
      if (proj) console.log("marca auto-detectada:", proj.nome);
    }
    if (proj) {
      logoPos = proj.logo_posicao || "baixo-centro";
      const ctx = [
        proj.cores ? `Use a paleta de cores da marca: ${proj.cores}.` : "",
        proj.descricao ? `Identidade visual: ${proj.descricao}.` : "",
      ].filter(Boolean).join(" ");
      if (ctx) prompt = `${prompt}\n\n${ctx} Respeite a identidade visual da marca.`;
      const { data: ass } = await supabase.from("projeto_assets").select("tipo,url").eq("projeto_id", proj.id);
      logoUrl = (ass || []).find((a: any) => a.tipo === "logo")?.url || null;
      // Referências de layout/identidade viram entrada de imagem (image-to-image no OpenAI).
      refUrls = (ass || []).filter((a: any) => a.tipo === "referencia" || a.tipo === "identidade").map((a: any) => a.url).filter(Boolean);
    }

    const ins = await supabase.from("tarefa_anexos")
      .insert({ tarefa_id: tarefaId, tipo, prompt, status: "gerando", origem: provider })
      .select("id").single();
    anexoId = ins.data?.id ?? null;

    let url: string | null = null;

    if (provider === "openai") {
      const { data: oa } = orgId
        ? await supabase.from("ai_config").select("api_key").eq("provider", "openai").eq("org_id", orgId).maybeSingle()
        : { data: null };
      const oaKey = oa?.api_key || Deno.env.get("OPENAI_API_KEY");
      if (!oaKey) throw new Error("Configure a chave da OpenAI em Agentes → Configurar modelos");
      url = await gerarOpenAI(supabase, oaKey, prompt, aspect, refUrls, orgId);
    } else {
      const { data: cfg } = orgId
        ? await supabase.from("ai_config").select("api_key").eq("provider", "higgsfield").eq("org_id", orgId).maybeSingle()
        : { data: null };
      const creds = cfg?.api_key || Deno.env.get("HIGGSFIELD_CREDENTIALS");
      if (!creds) throw new Error("Configure a chave do Higgsfield em Agentes → Configurar modelos");
      const authHeaders = {
        "Authorization": `Key ${creds.trim()}`,
        "Content-Type": "application/json",
        "User-Agent": "scaledash/1.0",
      };

      // 1) Submete o job.
      const submitRes = await fetch(`${BASE}/${MODELO[tipo]}`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ prompt, aspect_ratio: aspect, safety_tolerance: 2 }),
      });
      const submitText = await submitRes.text();
      let submit: any = {};
      try { submit = JSON.parse(submitText); } catch { submit = { raw: submitText }; }
      if (!submitRes.ok) {
        const detalhe = submit?.detail || submit?.error || submit?.message || submitText.slice(0, 200);
        if (submitRes.status === 403 && /credit/i.test(String(detalhe))) {
          throw new Error("Sua conta Higgsfield está sem créditos — adicione saldo em cloud.higgsfield.ai");
        }
        throw new Error(`Higgsfield ${submitRes.status}: ${detalhe}`);
      }

      const requestId = submit.request_id || submit.id || submit.requestId;
      url = extrairUrl(submit); // alguns modelos já retornam pronto

      // 2) Polling até concluir (máx ~2 min).
      if (!url && requestId) {
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const stRes = await fetch(`${BASE}/requests/${requestId}/status`, { headers: authHeaders });
          const st = await stRes.json().catch(() => ({}));
          const status = (st.status || "").toLowerCase();
          if (status === "completed" || status === "succeeded" || status === "success") {
            url = extrairUrl(st);
            break;
          }
          if (status === "failed" || status === "error" || status === "nsfw") {
            throw new Error(`Geração falhou no Higgsfield (status: ${status})`);
          }
        }
      }
    }

    if (!url) throw new Error("Não foi possível obter a arte (timeout ou formato inesperado)");

    // Sobrepõe a logo do projeto (apenas em imagem).
    if (logoUrl && tipo === "imagem") {
      try { url = await aplicarLogo(supabase, url, logoUrl, logoPos, orgId); }
      catch (e) { console.log("overlay da logo falhou:", (e as any)?.message || e); }
    }

    await supabase.from("tarefa_anexos").update({ url, status: "pronto" }).eq("id", anexoId);
    await supabase.from("tarefa_respostas").insert({
      tarefa_id: tarefaId, autor: provider === "openai" ? "OpenAI" : "Higgsfield",
      conteudo: `Arte (${tipo}) gerada: ${url}`,
    });

    return new Response(JSON.stringify({ ok: true, url, tipo, anexo_id: anexoId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (anexoId) await supabase.from("tarefa_anexos").update({ status: "erro" }).eq("id", anexoId);
    return new Response(JSON.stringify({ ok: false, error: String((e as any)?.message || e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
