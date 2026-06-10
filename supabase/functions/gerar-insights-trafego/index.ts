import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

const fmtBRL = (n: number) => `R$ ${(Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => (Number(n) || 0).toLocaleString("pt-BR");
const fmtPct = (n: number) => `${(Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function slugVariants(slug: string): string[] {
  return (slug || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function stripLower(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
const META_EXCLUDE = ["lead", "meteorico"];
function campMatch(name: string, variants: string[]): boolean {
  const n = (name || "").toLowerCase();
  if (!variants.some((v) => n.includes(v))) return false;
  const na = stripLower(name);
  if (META_EXCLUDE.some((t) => na.includes(t))) return false;
  return true;
}
function pickAction(actions: Array<{ action_type: string; value: string }> | undefined, types: string[]): number {
  if (!actions) return 0;
  for (const t of types) {
    const a = actions.find((x) => x.action_type === t);
    if (a) return parseInt(a.value) || 0;
  }
  return 0;
}

// Chamada ao modelo do agente (suporta openai / anthropic / google).
async function callAgent(agente: any, apiKey: string, system: string, user: string): Promise<string> {
  const model = agente.modelo;
  if (agente.provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: "user", content: user }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Erro Anthropic");
    return j.content?.map((c: any) => c.text).join("") || "";
  }
  if (agente.provider === "google") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Erro Google");
    return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
  }
  // openai (default)
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Erro OpenAI");
  return j.choices?.[0]?.message?.content || "";
}

function parseInsights(text: string): Array<{ nivel: string; titulo: string; texto: string }> {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((i: any) => i && (i.titulo || i.texto))
      .map((i: any) => ({ nivel: String(i.nivel || "info"), titulo: String(i.titulo || ""), texto: String(i.texto || "") }));
  } catch { return []; }
}

// Métricas agregadas + por campanha (vida das campanhas) de uma cidade.
async function metricasCidade(meta: any, slug: string) {
  const variants = slugVariants(slug);
  const r = await fetch(`${GRAPH}/${meta.account_id}/insights?level=campaign&fields=campaign_name,spend,impressions,clicks,ctr,cpc,cpm,frequency,reach,actions&date_preset=maximum&limit=500&access_token=${meta.access_token}`);
  const j = await r.json();
  const rows = (j.data || []).filter((row: any) => campMatch(row.campaign_name, variants));
  let spend = 0, impressions = 0, clicks = 0, reach = 0, purchases = 0, saves = 0, freqSum = 0, freqN = 0;
  const camps: string[] = [];
  for (const row of rows) {
    const s = parseFloat(row.spend) || 0;
    const imp = parseInt(row.impressions) || 0;
    const clk = parseInt(row.clicks) || 0;
    const p = pickAction(row.actions, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);
    spend += s; impressions += imp; clicks += clk;
    reach += parseInt(row.reach) || 0;
    purchases += p;
    saves += pickAction(row.actions, ["onsite_conversion.post_save", "post_save"]);
    if (row.frequency) { freqSum += parseFloat(row.frequency); freqN++; }
    camps.push(`- ${row.campaign_name}: ${fmtBRL(s)} | CTR ${fmtPct(parseFloat(row.ctr) || 0)} | Freq ${(parseFloat(row.frequency) || 0).toFixed(1)} | ${p} vendas`);
  }
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cac = purchases > 0 ? spend / purchases : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const freq = freqN > 0 ? freqSum / freqN : 0;
  return { spend, impressions, clicks, reach, purchases, saves, ctr, cac, cpc, cpm, freq, nCampanhas: rows.length, camps };
}

Deno.serve(async (req) => {
  console.log("gerar-insights-trafego v1");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = svc();

    const meta = (await supabase.from("meta_config").select("*").maybeSingle()).data;
    if (!meta?.access_token || !meta?.account_id) return json({ error: "Meta não configurado" }, 400);

    // Agente Gestor de Tráfego + chave do provider.
    const { data: agentes } = await supabase.from("agentes").select("*");
    const agente = (agentes || []).find((a: any) => stripLower(a.nome).includes("trafego") || stripLower(a.nome).includes("trafico"));
    if (!agente) return json({ error: "Agente Gestor de Tráfego não encontrado" }, 404);
    const { data: cfg } = await supabase.from("ai_config").select("api_key").eq("provider", agente.provider).maybeSingle();
    const apiKey = cfg?.api_key || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: `Configure a API key do provider ${agente.provider}` }, 400);

    // Cidades ativas (evento de hoje em diante, fuso SP).
    const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const { data: cids } = await supabase.from("cidades").select("nome,slug,data_evento");
    const ativas = (cids || []).filter((c: any) => !c.data_evento || String(c.data_evento).slice(0, 10) >= hojeSP);

    let geradas = 0;
    const erros: string[] = [];
    for (const c of ativas) {
      try {
        const m = await metricasCidade(meta, c.slug);
        if (m.nCampanhas === 0) continue; // sem campanhas ativas, nada a analisar
        const user = `Analise os dados de tráfego pago da cidade "${c.nome}" (evento em ${c.data_evento ? new Date(c.data_evento).toLocaleDateString("pt-BR") : "sem data"}) e gere ALERTAS e INSIGHTS acionáveis.

Métricas (vida das campanhas ativas):
- Investimento: ${fmtBRL(m.spend)}
- Vendas: ${fmtNum(m.purchases)} | CAC: ${m.cac > 0 ? fmtBRL(m.cac) : "—"}
- CTR médio: ${fmtPct(m.ctr)} | CPC: ${fmtBRL(m.cpc)} | CPM: ${fmtBRL(m.cpm)}
- Frequência média: ${m.freq.toFixed(1)} | Alcance: ${fmtNum(m.reach)} | Impressões: ${fmtNum(m.impressions)}
- Salvamentos: ${fmtNum(m.saves)}

Campanhas (${m.nCampanhas}):
${m.camps.join("\n")}

Responda APENAS com um array JSON (nada fora dele). Cada item:
{"nivel":"alerta"|"oportunidade"|"info","titulo":"título curto","texto":"recomendação acionável em 1-2 frases"}
Gere de 4 a 8 itens, priorizando o que mais impacta o CAC e o volume de vendas até a data do evento.`;

        const resp = await callAgent(agente, apiKey, agente.system_prompt || "", user);
        const insights = parseInsights(resp);
        if (insights.length === 0) { erros.push(`${c.nome}: IA não retornou insights`); continue; }
        await supabase.from("insights_trafego").upsert({ cidade_slug: c.slug, insights, updated_at: new Date().toISOString() });
        geradas++;
      } catch (e) {
        erros.push(`${c.nome}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }

    return json({ success: true, cidades: ativas.length, geradas, erros });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "erro interno" }, 500);
  }
});
