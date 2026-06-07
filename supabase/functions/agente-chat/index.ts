import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Msg = { role: "user" | "assistant"; content: string };

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

async function getKey(supabase: any, provider: string): Promise<string> {
  const { data } = await supabase.from("ai_config").select("api_key").eq("provider", provider).maybeSingle();
  if (!data?.api_key) throw new Error(`Configure a API key do provider "${provider}" em Agentes → Configurar modelos`);
  return data.api_key;
}

// Chamada simples a um modelo (sem ferramentas)
async function callModel(agente: any, apiKey: string, messages: Msg[]): Promise<string> {
  const system = agente.system_prompt || "";
  const model = agente.modelo;

  if (agente.provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 2048, system, messages }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Erro Anthropic");
    return j.content?.map((c: any) => c.text).join("") || "";
  }
  if (agente.provider === "openai") {
    const msgs = [{ role: "system", content: system }, ...messages];
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: msgs }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Erro OpenAI");
    return j.choices?.[0]?.message?.content || "";
  }
  if (agente.provider === "google") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Erro Google");
    return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
  }
  throw new Error(`Provider desconhecido: ${agente.provider}`);
}

// Detecta um pedido de delegação no texto do modelo
function parseDelegacao(text: string): { delegar: string; tarefa: string } | null {
  const m = text.match(/\{[\s\S]*?"delegar"[\s\S]*?\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (o.delegar && o.tarefa) return { delegar: String(o.delegar), tarefa: String(o.tarefa) };
  } catch { /* ignora */ }
  return null;
}

// Executa um agente com capacidade de DELEGAR aos seus filhos ativos (hierarquia)
async function runAgente(supabase: any, agente: any, messages: Msg[]): Promise<{ text: string; trace: string[] }> {
  const { data: children } = await supabase.from("agentes").select("*").eq("parent_id", agente.id).eq("ativo", true);
  const apiKey = await getKey(supabase, agente.provider);
  const trace: string[] = [];

  if (!children || children.length === 0) {
    return { text: await callModel(agente, apiKey, messages), trace };
  }

  const lista = children.map((c: any) => `- ${c.nome}: ${c.descricao || "sem descrição"}`).join("\n");
  const orchSystem = `${agente.system_prompt || ""}

# Equipe (você pode DELEGAR tarefas a estes agentes)
${lista}

# Como delegar
Quando precisar que um agente da sua equipe execute algo, responda APENAS com um
bloco JSON (nada de texto antes ou depois):
{"delegar": "NOME EXATO DO AGENTE", "tarefa": "descrição clara e completa da tarefa"}

Você receberá a resposta do agente e poderá delegar novamente (a outro ou ao mesmo)
ou então responder ao usuário. Quando tiver a resposta final, responda em TEXTO
normal (sem JSON), consolidando o trabalho da equipe.`;
  const agenteOrq = { ...agente, system_prompt: orchSystem };

  const convo: Msg[] = [...messages];
  for (let round = 0; round < 6; round++) {
    const out = await callModel(agenteOrq, apiKey, convo);
    const deleg = parseDelegacao(out);
    if (!deleg) return { text: out, trace };

    const child = (children as any[]).find((c) => norm(c.nome) === norm(deleg.delegar));
    convo.push({ role: "assistant", content: out });
    if (!child) {
      convo.push({ role: "user", content: `Agente "${deleg.delegar}" não encontrado. Válidos: ${children.map((c: any) => c.nome).join(", ")}.` });
      continue;
    }
    trace.push(`${agente.nome} → ${child.nome}`);
    let childResp = "";
    try {
      const childKey = await getKey(supabase, child.provider);
      childResp = await callModel(child, childKey, [{ role: "user", content: deleg.tarefa }]);
    } catch (e) {
      childResp = `(falha ao executar ${child.nome}: ${e instanceof Error ? e.message : "erro"})`;
    }
    convo.push({ role: "user", content: `[Resposta do agente ${child.nome}]:\n${childResp}\n\nContinue: delegue novamente se precisar, ou responda ao usuário em texto.` });
  }
  return { text: "Não consegui concluir a tarefa (muitas delegações seguidas).", trace };
}

Deno.serve(async (req) => {
  console.log('agente-chat v2');
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { agente_id, messages } = await req.json();
    if (!agente_id || !Array.isArray(messages)) return json({ error: "Parâmetros inválidos" }, 400);

    const { data: agente } = await supabase.from("agentes").select("*").eq("id", agente_id).maybeSingle();
    if (!agente) return json({ error: "Agente não encontrado" }, 404);

    const result = await runAgente(supabase, agente, messages as Msg[]);
    return json({ reply: result.text, trace: result.trace });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
