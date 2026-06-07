import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Msg = { role: "user" | "assistant"; content: string };

// Chama o modelo certo conforme o provider do agente
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { agente_id, messages } = await req.json();
    if (!agente_id || !Array.isArray(messages)) return json({ error: "Parâmetros inválidos" }, 400);

    const { data: agente } = await supabase.from("agentes").select("*").eq("id", agente_id).maybeSingle();
    if (!agente) return json({ error: "Agente não encontrado" }, 404);

    const { data: cfg } = await supabase.from("ai_config").select("api_key").eq("provider", agente.provider).maybeSingle();
    if (!cfg?.api_key) return json({ error: `Configure a API key do provider "${agente.provider}" em Agentes → Configurar modelos` }, 400);

    const reply = await callModel(agente, cfg.api_key, messages as Msg[]);
    return json({ reply });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
