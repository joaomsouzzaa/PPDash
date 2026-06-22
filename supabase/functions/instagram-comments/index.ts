import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Webhook de comentários do Instagram (Auto-DM, estilo ManyChat). Fluxo:
//  GET  -> verificação do webhook (hub.challenge) usando META_WEBHOOK_VERIFY_TOKEN.
//  POST -> evento `comments`: casa palavra/post com as automações ativas da org e, se bater,
//          responde o comentário publicamente e envia um DM (Private Reply).
// Roteia a org pelo ig_user_id (tabela ig_contas). Dedup por comment_id (ig_automacao_logs).

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const GRAPH = "https://graph.facebook.com/v21.0";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Casa o texto do comentário contra as palavras-gatilho da automação.
function casaGatilho(auto: any, texto: string): boolean {
  if (auto.gatilho_tipo === "qualquer_comentario") return true;
  const palavras: string[] = Array.isArray(auto.palavras) ? auto.palavras : [];
  if (palavras.length === 0) return false;
  const t = norm(texto);
  if (auto.match_tipo === "exato") {
    return palavras.some((p) => norm(p) === t);
  }
  return palavras.some((p) => { const w = norm(p); return w.length > 0 && t.includes(w); });
}

// Casa o escopo da automação (post específico / qualquer / próxima publicação).
function casaEscopo(auto: any, mediaId: string): boolean {
  if (auto.escopo === "qualquer" || auto.escopo === "proximo") return true;
  const ids: string[] = Array.isArray(auto.media_ids) ? auto.media_ids.map(String) : [];
  return ids.includes(String(mediaId));
}

async function graphPost(token: string, path: string, params: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, access_token: token }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.error_user_msg || j?.error?.message || `Graph API ${r.status}`);
  return j;
}

// Resposta pública no comentário.
async function responderComentario(token: string, commentId: string, mensagem: string) {
  return graphPost(token, `/${commentId}/replies`, { message: mensagem });
}

// DM via Private Reply (Instagram Messaging API) — usa recipient.comment_id.
// IMPORTANTE: o endpoint é /{page_id}/messages (com o page_token). Usar /{ig_user_id}/messages
// retorna "(#3) Application does not have the capability to make this API call".
async function enviarDM(token: string, pageId: string, commentId: string, payload: any) {
  const texto: string = payload?.texto || "";
  const botoes: any[] = Array.isArray(payload?.botoes) ? payload.botoes.filter((b: any) => b?.url) : [];
  let message: any;
  if (botoes.length > 0) {
    message = {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: texto || "👇",
          buttons: botoes.slice(0, 3).map((b) => ({ type: "web_url", title: b.titulo || "Abrir", url: b.url })),
        },
      },
    };
  } else {
    message = { text: texto };
  }
  return graphPost(token, `/${pageId}/messages`, { recipient: { comment_id: commentId }, message });
}

// Escolhe uma variação de resposta pública aleatoriamente (como o ManyChat).
function escolherResposta(auto: any): string {
  const tpls: string[] = Array.isArray(auto.resposta_comentario_templates)
    ? auto.resposta_comentario_templates.filter((t: any) => typeof t === "string" && t.trim())
    : [];
  if (tpls.length === 0) return "Te enviei no direct! 📩";
  return tpls[Math.floor(Math.random() * tpls.length)];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);

  // 1) Verificação do webhook (Meta chama via GET).
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const verify = (url.searchParams.get("hub.verify_token") || "").trim();
    const challenge = url.searchParams.get("hub.challenge");
    const expected = (Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "").trim();
    if (mode === "subscribe" && verify && expected && verify === expected) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const supabase = svc();

  try {
    for (const entry of body.entry || []) {
      // No objeto `instagram`, entry.id é o ig_user_id da conta.
      const igUserId = String(entry.id ?? "");
      for (const ch of entry.changes || []) {
        if (ch.field !== "comments") continue;
        const v = ch.value || {};
        const commentId = String(v.id ?? "");
        const mediaId = String(v.media?.id ?? "");
        const texto = String(v.text ?? "");
        const fromId = String(v.from?.id ?? "");
        const fromUser = v.from?.username ?? null;
        if (!commentId) continue;

        // Org + token/conta a partir do ig_user_id.
        const { data: conta } = await supabase.from("ig_contas")
          .select("org_id, ig_user_id, page_id, page_token, ativo").eq("ig_user_id", igUserId).eq("ativo", true).maybeSingle();
        if (!conta?.org_id || !conta.page_token) { console.warn("[ig-comments] conta não vinculada:", igUserId); continue; }
        const orgId = conta.org_id as string;
        const token = conta.page_token as string;
        const pageId = String(conta.page_id ?? "");

        // Ignora comentários do próprio dono da conta.
        if (fromId && fromId === String(conta.ig_user_id)) continue;

        // Dedup por comment_id.
        const { data: jaProc } = await supabase.from("ig_automacao_logs")
          .select("id").eq("org_id", orgId).eq("comment_id", commentId).maybeSingle();
        if (jaProc) continue;

        // Automações ativas (status=live) da org.
        const { data: autos } = await supabase.from("ig_automacoes")
          .select("*").eq("org_id", orgId).eq("status", "live");

        const auto = (autos || []).find((a: any) => casaEscopo(a, mediaId) && casaGatilho(a, texto));
        if (!auto) continue;

        const acoes: any = { reply_ok: false, dm_ok: false, erros: [] };
        if (auto.responder_comentario) {
          try { await responderComentario(token, commentId, escolherResposta(auto)); acoes.reply_ok = true; }
          catch (e) { acoes.erros.push(`reply: ${e instanceof Error ? e.message : "erro"}`); }
        }
        if (auto.enviar_dm) {
          try { await enviarDM(token, pageId, commentId, auto.dm_payload); acoes.dm_ok = true; }
          catch (e) { acoes.erros.push(`dm: ${e instanceof Error ? e.message : "erro"}`); }
        }

        await supabase.from("ig_automacao_logs").insert({
          org_id: orgId, automacao_id: auto.id, comment_id: commentId, media_id: mediaId,
          from_username: fromUser, comment_text: texto, acoes,
        });
      }
    }
  } catch (e) {
    console.error("[ig-comments] exception:", e instanceof Error ? e.message : "unknown");
  }

  // Meta exige 200 sempre (senão reenvia/desativa).
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
