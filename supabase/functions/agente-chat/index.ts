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

// Descobre a coluna do Kanban do agente (etapa atual) e a próxima
async function colunaDoAgente(supabase: any, child: any): Promise<{ atual: any; proxima: any } | null> {
  const { data: cols } = await supabase.from("kanban_colunas").select("*").order("ordem");
  if (!cols || cols.length === 0) return null;
  let atual = cols.find((c: any) => c.agente_id === child.id)
    || cols.find((c: any) => norm(c.nome) === norm(child.nome))
    || cols.find((c: any) => norm(child.nome).includes(norm(c.nome)) && (c.nome || "").length > 2);
  if (!atual) atual = cols[Math.min(1, cols.length - 1)];
  const idx = cols.findIndex((c: any) => c.id === atual.id);
  return { atual, proxima: cols[idx + 1] || atual };
}

type Step = { autor: string; conteudo: string };

// Executa um agente com capacidade de DELEGAR aos seus filhos ativos (hierarquia).
// onStep é chamado em tempo real a cada passo (delegação, ação, resposta).
async function runAgente(supabase: any, agente: any, messages: Msg[], onStep?: (s: Step) => void): Promise<{ text: string; trace: string[] }> {
  const { data: children } = await supabase.from("agentes").select("*").eq("parent_id", agente.id).eq("ativo", true);
  const apiKey = await getKey(supabase, agente.provider);
  const trace: string[] = [];
  const emit = (s: Step) => { try { onStep?.(s); } catch { /* ignore */ } };

  if (!children || children.length === 0) {
    return { text: await callModel(agente, apiKey, messages), trace };
  }

  const lista = children.map((c: any) => `- ${c.nome}: ${c.descricao || "sem descrição"}`).join("\n");
  const orchSystem = `${agente.system_prompt || ""}

# Seu papel: CEO / Orquestrador
Você comanda a equipe. SÓ você delega — os outros agentes nunca acionam uns aos outros,
eles só obedecem a você. Você orquestra e SEMPRE recebe o resultado de cada agente de
volta para APROVAR (ou pedir ajuste) ANTES de seguir para o próximo agente.

# Equipe (você pode DELEGAR tarefas a estes agentes)
${lista}

# Regras de fluxo (siga à risca)
- Faça UMA delegação por vez. Espere a resposta, avalie/aprove, e só então delegue o próximo passo.
- **Copy**: desenvolve toda a parte ESCRITA de anúncios (textos de anúncio, headlines, criativos escritos).
- **Agente de Conteúdo**: use APENAS quando for preciso desenvolver conteúdo para redes sociais, blog, etc.
- **Designer**: cria as artes. O Designer SEMPRE recebe de você (CEO) a copy aprovada (vinda do Copy)
  ou o conteúdo aprovado (vindo do Conteúdo). Nunca mande o Designer trabalhar sem antes ter a copy/conteúdo aprovada.
- **Vendas**: acione SOMENTE quando houver questões de vendas.
- Exemplo de fluxo de uma arte: você → Copy (escreve) → volta pra você (aprova) → você → Designer (com a copy aprovada).

# Como delegar
Quando precisar que um agente da sua equipe execute algo, responda APENAS com um
bloco JSON (nada de texto antes ou depois):
{"delegar": "NOME EXATO DO AGENTE", "tarefa": "descrição clara e completa da tarefa (inclua a copy/conteúdo aprovado quando for pro Designer)"}

Você receberá a resposta do agente e poderá delegar novamente (a outro ou ao mesmo)
ou então responder ao usuário. Quando tiver a resposta final, responda em TEXTO
normal (sem JSON), consolidando o trabalho da equipe.`;
  const agenteOrq = { ...agente, system_prompt: orchSystem };

  // Um ÚNICO card representa toda a sessão de delegação; cada agente acrescenta
  // suas respostas dentro dele (em vez de criar um card por delegação).
  const pedidoOriginal = String([...messages].reverse().find((m) => m.role === "user")?.content || "Tarefa");
  let tarefaId: string | null = null;

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

    // Mensagem do CEO delegando ao agente (briefing).
    emit({ autor: `${agente.nome} → ${child.nome}`, conteudo: `📋 ${deleg.tarefa}` });

    // Cria o card uma única vez (na 1ª delegação); depois apenas reaproveita.
    try {
      const col = await colunaDoAgente(supabase, child);
      const etapa = col?.atual?.nome || "";
      if (!tarefaId) {
        const { data: t } = await supabase.from("tarefas").insert({
          titulo: pedidoOriginal.slice(0, 70),
          descricao: pedidoOriginal, coluna_id: col?.atual?.id || null,
          agente_id: child.id, origem: "delegacao",
        }).select("id").single();
        tarefaId = t?.id || null;
        emit({ autor: agente.nome, conteudo: `🗂️ Criou a tarefa "${pedidoOriginal.slice(0, 60)}"${etapa ? ` em *${etapa}*` : ""}` });
      } else {
        // move o card para a etapa do agente que vai atuar agora
        await supabase.from("tarefas").update({ coluna_id: col?.atual?.id || null, agente_id: child.id, updated_at: new Date().toISOString() }).eq("id", tarefaId);
        if (etapa) emit({ autor: agente.nome, conteudo: `➡️ Moveu a tarefa para *${etapa}*` });
      }
    } catch (_) { /* tabela pode não existir ainda */ }

    let childResp = "";
    try {
      const childKey = await getKey(supabase, child.provider);
      childResp = await callModel(child, childKey, [{ role: "user", content: deleg.tarefa }]);
    } catch (e) {
      childResp = `(falha ao executar ${child.nome}: ${e instanceof Error ? e.message : "erro"})`;
    }

    // Resposta do agente de volta ao CEO.
    emit({ autor: `${child.nome} → ${agente.nome}`, conteudo: childResp });

    // Registra o briefing e a resposta DENTRO do card único, e avança a etapa.
    if (tarefaId) {
      try {
        await supabase.from("tarefa_respostas").insert([
          { tarefa_id: tarefaId, autor: `${agente.nome} → ${child.nome}`, conteudo: `📋 Briefing: ${deleg.tarefa}` },
          { tarefa_id: tarefaId, autor: child.nome, conteudo: childResp },
        ]);
      } catch (_) { /* ignora */ }
    }

    convo.push({ role: "user", content: `[Resposta do agente ${child.nome}]:\n${childResp}\n\nContinue: delegue novamente se precisar, ou responda ao usuário em texto.` });
  }
  return { text: "Não consegui concluir a tarefa (muitas delegações seguidas).", trace };
}

Deno.serve(async (req) => {
  console.log('agente-chat v7 - stream');
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { agente_id, messages } = await req.json();
    if (!agente_id || !Array.isArray(messages)) return json({ error: "Parâmetros inválidos" }, 400);

    const { data: agente } = await supabase.from("agentes").select("*").eq("id", agente_id).maybeSingle();
    if (!agente) return json({ error: "Agente não encontrado" }, 404);

    // Stream NDJSON: cada passo do time é enviado em tempo real, e por fim a
    // resposta consolidada do CEO ({type:"done"}).
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
        try {
          const result = await runAgente(supabase, agente, messages as Msg[], (step) => send({ type: "step", step }));
          send({ type: "done", reply: result.text, trace: result.trace });
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
