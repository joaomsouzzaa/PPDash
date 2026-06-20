import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Agente de Tráfego: conversa no chat para subir/duplicar/editar campanhas no Meta.
// Usa tool-use (Anthropic) para ler o Drive (criativos) e operar a Graph API via
// a edge function meta-ads-manager. Mantém o streaming NDJSON do agente-chat
// ({type:"step"} em tempo real + {type:"done"}).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
};

type Msg = { role: "user" | "assistant"; content: any };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

// Escolhe o provider com tool-use disponível. Respeita a preferência (provider
// configurado no agente) e cai para o que houver chave: Anthropic ou OpenAI.
async function getKey(supabase: any, orgId: string | null, prefer?: string | null): Promise<{ key: string; provider: "anthropic" | "openai" }> {
  const fromCfg = async (p: string): Promise<string | undefined> => {
    if (!orgId) return undefined;
    const { data } = await supabase.from("ai_config").select("api_key").eq("provider", p).eq("org_id", orgId).maybeSingle();
    return data?.api_key ?? undefined;
  };
  const envName: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" };
  // Ordem de tentativa: provider preferido primeiro, depois os demais.
  const ordem = [...new Set([prefer, "anthropic", "openai"].filter(Boolean) as string[])].filter((p) => p === "anthropic" || p === "openai");
  for (const p of ordem) {
    const k = (await fromCfg(p)) ?? Deno.env.get(envName[p]) ?? undefined;
    if (k) return { key: k, provider: p as "anthropic" | "openai" };
  }
  throw new Error("Configure a API key da Anthropic ou OpenAI em Agentes → Configurar modelos para usar o Agente de Tráfego.");
}

// Resolve a org ATIVA: header x-org-slug (com verificação de acesso) > body.org_id > profiles.org_id.
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
        const { data: m } = await supabase.from("memberships").select("user_id").eq("user_id", u.user.id).eq("org_id", org.id).eq("status", "ativo").maybeSingle();
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

// Chama uma edge function irmã (Drive ou meta-ads-manager) server-to-server.
async function callFn(name: string, body: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Falha ao chamar ${name}`);
  return j;
}

const SYSTEM = `Você é o **Agente de Tráfego** do PPDash. Você opera o Gerenciador de Anúncios do Meta
de verdade (cria, duplica e edita campanhas) conversando com o usuário, e lê os criativos do
Google Drive. Você é o MESMO agente em qualquer chat (página Meta Ads ou módulo Growth) e
também quando o CEO te delega uma tarefa.

# Formato das respostas (MUITO IMPORTANTE)
- Responda em texto simples e enxuto. NÃO use markdown: nada de asteriscos (**), nem # de título, nem links/imagens.
- Não cole URLs, thumbnails nem IDs longos, a menos que o usuário peça o ID explicitamente.
- Use listas curtas com hífen. Vá direto ao ponto; resuma em vez de despejar todos os dados.
- Ex.: "Campanhas ativas:\n- Captação Franquia (Leads) — 1 conjunto ativo". Sem negrito, sem links.

# Princípios (siga à risca)
- Fale em português, direto e prático, como um gestor de tráfego experiente.
- Trabalhe SEMPRE com dados reais: use as ferramentas para ler o gerenciador e o Drive. NUNCA invente IDs, nomes de campanha/conjunto ou nomes de arquivo.
- RESPEITE o filtro pedido: se o usuário pedir "apenas ativas/ativos", chame meta_listar_campanhas com somente_ativos=true e NÃO mostre itens pausados. Se pedir pausados ou todos, ajuste de acordo. Sempre liste exatamente o que foi pedido.
- Antes de QUALQUER ação que escreve no Meta (criar/duplicar/editar), mostre um RESUMO do que será feito e peça confirmação explícita ("posso subir?"). Só execute após o "sim".
- Ao DUPLICAR conjunto ou campanha, SEMPRE pergunte antes se o orçamento deve ser o MESMO do original ou um valor diferente (e qual). Passe daily_budget só se for diferente; omita para manter igual.
- Padrão de segurança: tudo sobe **PAUSADO** (status_inicial="PAUSED"). Só suba ativo se o usuário pedir claramente.
- A conta de anúncio usada é a conta padrão da organização (já configurada). Não peça account_id.
- Se faltar conexão (Meta ou Google/Drive) ou uma informação obrigatória, diga exatamente o que falta.
- Seja proativo: ao listar criativos/campanhas, mostre as opções numeradas e pergunte o que o usuário quer.

# O que você sabe fazer (ferramentas)
- Ler o gerenciador: meta_listar_campanhas (árvore campanha→conjunto→anúncio, com IDs e status) e meta_listar_campanhas_base (campanhas para usar de base).
- Ler o Drive: drive_listar_pastas e drive_listar_criativos(folder_id) — mostram os arquivos (imagens/vídeos) e seus IDs.
- Criar campanha do zero: meta_criar_campanha.
- Duplicar uma campanha existente: meta_duplicar_campanha.
- Criar um conjunto novo numa campanha existente: meta_novo_conjunto.
- Duplicar um conjunto existente trocando APENAS os criativos (herda segmentação/orçamento): meta_duplicar_conjunto.
- Editar status/orçamento/nome (campanha, conjunto ou anúncio): meta_atualizar.

# Fluxo dos criativos (sempre assim)
1. Pergunte/identifique a PASTA do Drive (use drive_listar_pastas se não souber).
2. Liste os arquivos com drive_listar_criativos e MOSTRE a lista numerada.
3. Pergunte QUAIS subir (pode haver 10 e o usuário querer só 5) e o texto do anúncio (message) e o link/destino.
4. Use os file_id reais dos escolhidos ao chamar a ferramenta de criação.

# Perguntas de configuração (cubra o que faltar, conforme o tipo de pedido)
- Objetivo (OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_AWARENESS).
- Nome (siga a nomenclatura do usuário) e Página do Facebook (page_id) / Instagram.
- Orçamento: diário? valor? no nível de campanha (CBO) ou do conjunto?
- Otimização (optimization_goal) e categorias especiais (emprego/crédito/habitação/política — geralmente nenhuma).
- Público/segmentação, posicionamentos, datas de início/fim, destino (URL/leadform) e CTA, pixel/evento quando fizer sentido.

# Atalhos que você deve oferecer
- "Quero o mesmo conjunto com criativos novos" → meta_duplicar_conjunto (liste a campanha e os conjuntos com meta_listar_campanhas para pegar o adset_id certo).
- "Replicar uma campanha boa" → meta_duplicar_campanha a partir de meta_listar_campanhas_base.
- "Mais um conjunto nesta campanha" → meta_novo_conjunto.

Quando tudo estiver definido e confirmado, chame a ferramenta correta e, ao final, informe os IDs criados e que estão PAUSADOS aguardando ativação.`;

const TOOLS = [
  { name: "drive_listar_pastas", description: "Lista as pastas do Google Drive conectado, para encontrar onde estão os criativos.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "drive_listar_criativos", description: "Lista imagens e vídeos dentro de uma pasta do Drive.", input_schema: { type: "object", properties: { folder_id: { type: "string" } }, required: ["folder_id"] } },
  { name: "meta_listar_campanhas", description: "Lista campanhas/conjuntos/anúncios da conta (espelho do gerenciador). Use somente_ativos=true quando o usuário pedir apenas o que está ATIVO.", input_schema: { type: "object", properties: { somente_ativos: { type: "boolean", description: "true = retorna só itens com status ACTIVE" } }, required: [] } },
  { name: "meta_listar_campanhas_base", description: "Lista campanhas existentes que podem servir de base para duplicação.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "meta_duplicar_campanha", description: "Duplica uma campanha existente como base para uma nova (cópia profunda).", input_schema: { type: "object", properties: { source_campaign_id: { type: "string" }, novo_nome: { type: "string" }, status_inicial: { type: "string", enum: ["PAUSED", "ACTIVE"] } }, required: ["source_campaign_id"] } },
  {
    name: "meta_novo_conjunto", description: "Cria um NOVO conjunto de anúncios dentro de uma campanha existente, com criativos do Drive.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" }, status_inicial: { type: "string", enum: ["PAUSED", "ACTIVE"] },
        adset: { type: "object", properties: { nome: { type: "string" }, daily_budget: { type: "number" }, optimization_goal: { type: "string" }, billing_event: { type: "string" }, targeting: { type: "object" }, promoted_object: { type: "object" } } },
        creatives: { type: "array", items: { type: "object", properties: { file_id: { type: "string" }, file_name: { type: "string" }, mime: { type: "string" }, ad_name: { type: "string" }, page_id: { type: "string" }, message: { type: "string" }, link: { type: "string" }, call_to_action: { type: "string" } }, required: ["file_id", "page_id"] } },
      }, required: ["campaign_id"],
    },
  },
  {
    name: "meta_duplicar_conjunto", description: "Duplica um conjunto existente (herda segmentação/orçamento). SEM 'creatives' = cópia completa com os mesmos anúncios. COM 'creatives' = troca os criativos pelos novos do Drive.",
    input_schema: {
      type: "object",
      properties: {
        source_adset_id: { type: "string" }, target_campaign_id: { type: "string" }, novo_nome: { type: "string" },
        status_inicial: { type: "string", enum: ["PAUSED", "ACTIVE"] }, page_id: { type: "string" },
        daily_budget: { type: "number", description: "orçamento diário em R$; omita para manter o mesmo do conjunto original" },
        creatives: { type: "array", description: "opcional; deixe vazio para copiar com os mesmos anúncios", items: { type: "object", properties: { file_id: { type: "string" }, file_name: { type: "string" }, mime: { type: "string" }, ad_name: { type: "string" }, page_id: { type: "string" }, message: { type: "string" }, link: { type: "string" }, call_to_action: { type: "string" } }, required: ["file_id"] } },
      }, required: ["source_adset_id"],
    },
  },
  { name: "meta_atualizar", description: "Atualiza status, orçamento ou nome de uma campanha/conjunto/anúncio.", input_schema: { type: "object", properties: { entity_id: { type: "string" }, nivel: { type: "string", enum: ["campaign", "adset", "ad"] }, status: { type: "string", enum: ["ACTIVE", "PAUSED"] }, daily_budget: { type: "number" }, name: { type: "string" } }, required: ["entity_id"] } },
  {
    name: "meta_criar_campanha", description: "Cria uma campanha completa do zero (campanha → conjunto → criativos do Drive → anúncios). Só chame após confirmação do usuário.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" }, objetivo: { type: "string" },
        special_ad_categories: { type: "array", items: { type: "string" } },
        status_inicial: { type: "string", enum: ["PAUSED", "ACTIVE"] },
        daily_budget: { type: "number", description: "orçamento diário no nível de campanha (R$), opcional" },
        adset: {
          type: "object",
          properties: {
            nome: { type: "string" }, daily_budget: { type: "number" },
            optimization_goal: { type: "string" }, billing_event: { type: "string" },
            start_time: { type: "string" }, end_time: { type: "string" },
            targeting: { type: "object" }, promoted_object: { type: "object" },
          },
        },
        creatives: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file_id: { type: "string" }, file_name: { type: "string" }, mime: { type: "string" },
              ad_name: { type: "string" }, page_id: { type: "string" }, instagram_actor_id: { type: "string" },
              message: { type: "string" }, link: { type: "string" }, call_to_action: { type: "string" },
            }, required: ["file_id", "page_id"],
          },
        },
      }, required: ["nome", "objetivo"],
    },
  },
];

async function runTool(name: string, input: any, orgId: string): Promise<any> {
  switch (name) {
    case "drive_listar_pastas":
      return await callFn("google-sheets", { action: "list_drive_folders", org_id: orgId });
    case "drive_listar_criativos":
      return await callFn("google-sheets", { action: "list_drive_files", folder_id: input.folder_id, org_id: orgId });
    case "meta_listar_campanhas":
      return await callFn("meta-ads-manager", { action: "list_campaigns", org_id: orgId, somente_ativos: !!input.somente_ativos });
    case "meta_listar_campanhas_base":
      return await callFn("meta-ads-manager", { action: "list_source_campaigns", org_id: orgId });
    case "meta_duplicar_campanha":
      return await callFn("meta-ads-manager", { action: "duplicate_campaign", org_id: orgId, ...input });
    case "meta_novo_conjunto":
      return await callFn("meta-ads-manager", { action: "create_adset", org_id: orgId, ...input });
    case "meta_duplicar_conjunto":
      return await callFn("meta-ads-manager", { action: "duplicate_adset", org_id: orgId, ...input });
    case "meta_atualizar":
      return await callFn("meta-ads-manager", { action: "update_entity", org_id: orgId, ...input });
    case "meta_criar_campanha":
      return await callFn("meta-ads-manager", { action: "create_campaign", org_id: orgId, ...input });
    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = svc();
    const body = await req.json();
    const { messages, model, agente_id } = body;
    if (!Array.isArray(messages)) return json({ error: "Parâmetros inválidos" }, 400);

    // Org ATIVA (multi-tenant): header x-org-slug (cliente visualizado) tem prioridade,
    // depois body.org_id (server-to-server, ex.: CEO delegando), depois profiles.org_id.
    const orgId = await resolveOrg(supabase, req, body);
    if (!orgId) return json({ error: "Organização não identificada (faça login / selecione o cliente)" }, 401);

    // Carrega o agente configurado na página Agentes (por id, ou pelo slug "trafego").
    // Usa o provider/modelo/system_prompt dele — assim o agente de tráfego é ÚNICO,
    // valendo igual neste chat, no chat do Growth e quando o CEO delega a ele.
    let agente: any = null;
    if (agente_id) {
      const { data } = await supabase.from("agentes").select("*").eq("id", agente_id).maybeSingle();
      agente = data ?? null;
    }
    if (!agente) {
      const { data } = await supabase.from("agentes").select("*").eq("slug", "trafego").maybeSingle();
      agente = data ?? null;
    }
    const { key, provider } = await getKey(supabase, orgId, agente?.provider);
    const mdl = model || agente?.modelo || (provider === "anthropic" ? "claude-opus-4-8" : "gpt-4o");
    // Persona configurada pelo usuário + regras operacionais das ferramentas (Drive/Meta).
    const sys = agente?.system_prompt ? `${agente.system_prompt}\n\n---\n\n${SYSTEM}` : SYSTEM;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
        // Remove campos pesados/desnecessários (thumbnails, URLs longas) dos resultados
        // antes de mandar ao modelo — evita respostas cheias de links.
        const limpar = (_k: string, v: any) => (_k === "thumbnail" || _k === "thumbnailLink" ? undefined : v);
        const exec = async (name: string, input: any) => {
          send({ type: "step", step: { autor: "Agente de Tráfego", conteudo: `🔧 ${name}` } });
          try { return JSON.stringify(await runTool(name, input || {}, orgId!), limpar).slice(0, 12000); }
          catch (e) { return JSON.stringify({ error: e instanceof Error ? e.message : "erro" }); }
        };
        try {
          if (provider === "anthropic") {
            const convo: Msg[] = messages.map((m: any) => ({ role: m.role, content: m.content }));
            for (let round = 0; round < 10; round++) {
              const r = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
                body: JSON.stringify({ model: mdl, max_tokens: 4096, system: sys, tools: TOOLS, messages: convo }),
              });
              const j = await r.json();
              if (!r.ok) throw new Error(j?.error?.message || "Erro Anthropic");
              const blocks = j.content || [];
              const textOut = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
              const toolUses = blocks.filter((b: any) => b.type === "tool_use");
              if (toolUses.length === 0) { send({ type: "done", reply: textOut }); break; }
              if (textOut.trim()) send({ type: "step", step: { autor: "Agente de Tráfego", conteudo: textOut } });
              convo.push({ role: "assistant", content: blocks });
              const results: any[] = [];
              for (const tu of toolUses) results.push({ type: "tool_result", tool_use_id: tu.id, content: await exec(tu.name, tu.input) });
              convo.push({ role: "user", content: results });
            }
          } else {
            // OpenAI (function-calling)
            const oaiTools = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
            const msgs: any[] = [{ role: "system", content: sys }, ...messages.map((m: any) => ({ role: m.role, content: m.content }))];
            for (let round = 0; round < 10; round++) {
              const r = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
                body: JSON.stringify({ model: mdl, messages: msgs, tools: oaiTools }),
              });
              const j = await r.json();
              if (!r.ok) throw new Error(j?.error?.message || "Erro OpenAI");
              const msg = j.choices?.[0]?.message;
              const calls = msg?.tool_calls || [];
              if (calls.length === 0) { send({ type: "done", reply: msg?.content || "(sem resposta)" }); break; }
              if (msg?.content?.trim()) send({ type: "step", step: { autor: "Agente de Tráfego", conteudo: msg.content } });
              msgs.push(msg);
              for (const c of calls) {
                let input: any = {}; try { input = JSON.parse(c.function.arguments || "{}"); } catch { /* args inválidos */ }
                const content = await exec(c.function.name, input);
                msgs.push({ role: "tool", tool_call_id: c.id, content });
              }
            }
          }
        } catch (e) {
          send({ type: "error", error: e instanceof Error ? e.message : "Erro interno" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "application/x-ndjson" } });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
