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

async function getKey(supabase: any, orgId: string | null): Promise<{ key: string; provider: string }> {
  // Preferência: Anthropic (tool-use). Cai para a env ANTHROPIC_API_KEY.
  let key: string | undefined;
  if (orgId) {
    const { data } = await supabase.from("ai_config").select("api_key").eq("provider", "anthropic").eq("org_id", orgId).maybeSingle();
    key = data?.api_key ?? undefined;
  }
  if (!key) key = Deno.env.get("ANTHROPIC_API_KEY") ?? undefined;
  if (!key) throw new Error('Configure a API key da Anthropic em Agentes → Configurar modelos para usar o Agente de Tráfego.');
  return { key, provider: "anthropic" };
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

const SYSTEM = `Você é o **Agente de Tráfego** do PPDash. Sua missão é configurar e subir campanhas
no Gerenciador de Anúncios do Meta conversando com o usuário, sem que nada fique faltando.

# Regras
- Fale em português, de forma objetiva e profissional.
- NUNCA suba uma campanha sem antes ter TODAS as informações obrigatórias e SEM a confirmação final explícita do usuário.
- Antes de criar, mostre um RESUMO completo do que será subido e peça "confirma?".
- Por padrão suba a campanha como **PAUSADA** (status_inicial = "PAUSED"), salvo se o usuário pedir ativa.
- Use as ferramentas para ler o Drive e operar o Meta — não invente IDs.

# Perguntas que você precisa cobrir antes de subir uma campanha
1. Objetivo (ex.: OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_AWARENESS).
2. Conta de anúncio (se houver mais de uma) e Página do Facebook (page_id) / conta do Instagram.
3. Categorias especiais de anúncio (emprego, crédito, habitação, política) — geralmente nenhuma.
4. Nome da campanha (siga a nomenclatura que o usuário usar).
5. Orçamento: diário ou vitalício? Valor? No nível de campanha (CBO) ou do conjunto?
6. Otimização e cobrança (optimization_goal e billing_event).
7. Público/segmentação: localização, idade, gênero, interesses, públicos personalizados.
8. Posicionamentos (automáticos ou manuais).
9. Datas de início/fim.
10. Destino: URL da landing, ou formulário de leads; CTA.
11. Pixel/evento de conversão quando aplicável (promoted_object).
12. Criativos: peça a PASTA do Drive, liste os arquivos encontrados e pergunte QUAIS subir
    (pode haver 10 e o usuário querer só 5). Pergunte texto do anúncio (message) por criativo se necessário.

# Alternativa mais rápida
- Se o usuário preferir, ofereça DUPLICAR uma campanha existente como base (use meta_listar_campanhas_base
  e meta_duplicar_campanha) e depois ajustar o que mudar.

Quando tiver tudo e o usuário confirmar, chame meta_criar_campanha (ou meta_duplicar_campanha).`;

const TOOLS = [
  { name: "drive_listar_pastas", description: "Lista as pastas do Google Drive conectado, para encontrar onde estão os criativos.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "drive_listar_criativos", description: "Lista imagens e vídeos dentro de uma pasta do Drive.", input_schema: { type: "object", properties: { folder_id: { type: "string" } }, required: ["folder_id"] } },
  { name: "meta_listar_campanhas", description: "Lista as campanhas atuais da conta (espelho do gerenciador).", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "meta_listar_campanhas_base", description: "Lista campanhas existentes que podem servir de base para duplicação.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "meta_duplicar_campanha", description: "Duplica uma campanha existente como base para uma nova (cópia profunda).", input_schema: { type: "object", properties: { source_campaign_id: { type: "string" }, novo_nome: { type: "string" }, status_inicial: { type: "string", enum: ["PAUSED", "ACTIVE"] } }, required: ["source_campaign_id"] } },
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
      return await callFn("meta-ads-manager", { action: "list_campaigns", org_id: orgId });
    case "meta_listar_campanhas_base":
      return await callFn("meta-ads-manager", { action: "list_source_campaigns", org_id: orgId });
    case "meta_duplicar_campanha":
      return await callFn("meta-ads-manager", { action: "duplicate_campaign", org_id: orgId, ...input });
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
    let orgId: string | null = null;
    const authToken = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (authToken) {
      const { data: u } = await supabase.auth.getUser(authToken);
      if (u?.user) {
        const { data: p } = await supabase.from("profiles").select("org_id").eq("id", u.user.id).maybeSingle();
        orgId = p?.org_id ?? null;
      }
    }
    if (!orgId) return json({ error: "Organização não identificada (faça login)" }, 401);

    const { messages, model } = await req.json();
    if (!Array.isArray(messages)) return json({ error: "Parâmetros inválidos" }, 400);
    const { key } = await getKey(supabase, orgId);
    const mdl = model || "claude-opus-4-8";

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
        // Histórico no formato Anthropic (content pode ser string ou blocos).
        const convo: Msg[] = messages.map((m: any) => ({ role: m.role, content: m.content }));
        try {
          for (let round = 0; round < 10; round++) {
            const r = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
              body: JSON.stringify({ model: mdl, max_tokens: 4096, system: SYSTEM, tools: TOOLS, messages: convo }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error?.message || "Erro Anthropic");

            const blocks = j.content || [];
            const textOut = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
            const toolUses = blocks.filter((b: any) => b.type === "tool_use");

            if (toolUses.length === 0) {
              send({ type: "done", reply: textOut });
              break;
            }

            // Mostra o que o agente está fazendo e a fala parcial.
            if (textOut.trim()) send({ type: "step", step: { autor: "Agente de Tráfego", conteudo: textOut } });
            convo.push({ role: "assistant", content: blocks });

            const results: any[] = [];
            for (const tu of toolUses) {
              send({ type: "step", step: { autor: "Agente de Tráfego", conteudo: `🔧 ${tu.name}` } });
              let content: string;
              try {
                const out = await runTool(tu.name, tu.input || {}, orgId!);
                content = JSON.stringify(out).slice(0, 12000);
              } catch (e) {
                content = JSON.stringify({ error: e instanceof Error ? e.message : "erro" });
              }
              results.push({ type: "tool_result", tool_use_id: tu.id, content });
            }
            convo.push({ role: "user", content: results });
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
