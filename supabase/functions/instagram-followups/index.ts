import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Processa os follow-ups devidos do Auto-DM Instagram. Chamado por cron (pg_cron) a cada 5 min.
// Seleciona ig_followups pendentes com send_at <= agora e envia a DM para o IGSID via
// /{page_id}/messages. Tenta free-form (dentro da janela de 24h); se a janela estiver fechada,
// reenvia com a tag HUMAN_AGENT (janela de 7 dias). Marca enviado/falhou.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const GRAPH = "https://graph.facebook.com/v21.0";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function graphPost(token: string, path: string, params: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${GRAPH}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, access_token: token }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j?.error?.error_user_msg || j?.error?.message || `Graph API ${r.status}`); (e as any).fb = j?.error; throw e; }
  return j;
}

function msgComLinks(texto: string, botoes: any[]): any {
  const bs = (botoes || []).filter((b) => b?.url).slice(0, 3);
  if (bs.length === 0) return { text: texto || "👋" };
  return { attachment: { type: "template", payload: {
    template_type: "button", text: texto || "👋",
    buttons: bs.map((b) => ({ type: "web_url", title: b.titulo || "Abrir", url: b.url })),
  } } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const supabase = svc();
  let enviados = 0, falhas = 0;
  try {
    const agora = new Date().toISOString();
    const { data: pend } = await supabase.from("ig_followups")
      .select("*").eq("status", "pendente").lte("send_at", agora).order("send_at").limit(100);

    // Cache de token por page_id.
    const tokens: Record<string, string> = {};
    const tokenDe = async (pageId: string): Promise<string | null> => {
      if (tokens[pageId]) return tokens[pageId];
      const { data } = await supabase.from("ig_contas").select("page_token").eq("page_id", pageId).eq("ativo", true).maybeSingle();
      if (data?.page_token) { tokens[pageId] = data.page_token; return data.page_token; }
      return null;
    };

    for (const f of pend || []) {
      const token = await tokenDe(String(f.page_id));
      if (!token) {
        await supabase.from("ig_followups").update({ status: "falhou", erro: "sem page_token", sent_at: new Date().toISOString() }).eq("id", f.id);
        falhas++; continue;
      }
      const message = msgComLinks(f.payload?.texto, f.payload?.botoes || []);
      const base = { recipient: { id: String(f.recipient_igsid) }, message };
      try {
        await graphPost(token, `/${f.page_id}/messages`, base);
        await supabase.from("ig_followups").update({ status: "enviado", sent_at: new Date().toISOString(), erro: null }).eq("id", f.id);
        enviados++;
      } catch (e1) {
        // Janela fechada? Tenta com a tag HUMAN_AGENT (até 7 dias após a última interação).
        try {
          await graphPost(token, `/${f.page_id}/messages`, { ...base, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
          await supabase.from("ig_followups").update({ status: "enviado", sent_at: new Date().toISOString(), erro: null }).eq("id", f.id);
          enviados++;
        } catch (e2) {
          await supabase.from("ig_followups").update({ status: "falhou", erro: e2 instanceof Error ? e2.message : "erro", sent_at: new Date().toISOString() }).eq("id", f.id);
          falhas++;
        }
      }
    }
  } catch (e) {
    console.error("[ig-followups] exception:", e instanceof Error ? e.message : "unknown");
  }
  return new Response(JSON.stringify({ enviados, falhas }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
