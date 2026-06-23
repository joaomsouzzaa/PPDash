import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Webhook do Instagram (Auto-DM, estilo ManyChat). Trata 2 tipos de evento:
//  A) `comments` (entry.changes): casa palavra/post com as automações ativas → responde o
//     comentário e envia a DM de ABERTURA (Private Reply).
//     - modo "optin": texto + botão SEM link (postback). Quando a pessoa toca o botão, abre a
//       janela de mensagens (não é spam) e enviamos a 2ª DM com o link (ver evento B).
//     - modo "direto": DM única já com o link no botão.
//     Se followup_ativo, agenda o follow-up (ig_followups) usando o IGSID retornado no envio.
//  B) `messaging_postbacks` (entry.messaging): a pessoa tocou o botão de opt-in → enviamos a
//     2ª DM com o link de fato.
//  GET -> verificação do webhook (hub.challenge) com META_WEBHOOK_VERIFY_TOKEN.
// Roteia a org pelo ig_user_id (tabela ig_contas). Dedup por comment_id / mid (ig_automacao_logs).

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const GRAPH = "https://graph.facebook.com/v21.0";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function casaGatilho(auto: any, texto: string): boolean {
  if (auto.gatilho_tipo === "qualquer_comentario") return true;
  const palavras: string[] = Array.isArray(auto.palavras) ? auto.palavras : [];
  if (palavras.length === 0) return false;
  const t = norm(texto);
  if (auto.match_tipo === "exato") return palavras.some((p) => norm(p) === t);
  return palavras.some((p) => { const w = norm(p); return w.length > 0 && t.includes(w); });
}

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

async function responderComentario(token: string, commentId: string, mensagem: string) {
  return graphPost(token, `/${commentId}/replies`, { message: mensagem });
}

// Monta um objeto `message` com texto + botões de LINK (web_url). Sem botões = texto puro.
function msgComLinks(texto: string, botoes: any[]): any {
  const bs = (botoes || []).filter((b) => b?.url).slice(0, 3);
  if (bs.length === 0) return { text: texto || "👇" };
  return {
    attachment: { type: "template", payload: {
      template_type: "button", text: texto || "👇",
      buttons: bs.map((b) => ({ type: "web_url", title: b.titulo || "Abrir", url: b.url })),
    } },
  };
}

// Monta a DM de opt-in: texto + 1 botão de POSTBACK (sem link). O toque vira o evento B.
function msgOptin(texto: string, botaoTitulo: string, payload: string): any {
  return {
    attachment: { type: "template", payload: {
      template_type: "button", text: texto || "👇",
      buttons: [{ type: "postback", title: botaoTitulo || "Me envie o link", payload }],
    } },
  };
}

const modoDM = (dm: any): "optin" | "direto" =>
  dm?.modo === "direto" ? "direto" : (dm?.modo === "optin" || dm?.optin_texto ? "optin" : "direto");

// Envia a DM de abertura como Private Reply ao comentário. Retorna o IGSID do destinatário.
async function enviarAbertura(token: string, pageId: string, commentId: string, auto: any): Promise<string | null> {
  const dm = auto.dm_payload || {};
  const message = modoDM(dm) === "optin"
    ? msgOptin(dm.optin_texto, dm.optin_botao_titulo, `AUTODM_OPTIN:${auto.id}`)
    : msgComLinks(dm.texto, dm.botoes || []);
  const resp = await graphPost(token, `/${pageId}/messages`, { recipient: { comment_id: commentId }, message });
  return resp?.recipient_id ? String(resp.recipient_id) : null;
}

// Envia a 2ª DM (com o link) para o IGSID, após o opt-in.
async function enviarLink(token: string, pageId: string, igsid: string, auto: any) {
  const dm = auto.dm_payload || {};
  const message = msgComLinks(dm.link_texto, dm.link_botoes || []);
  return graphPost(token, `/${pageId}/messages`, { recipient: { id: igsid }, message });
}

function escolherResposta(auto: any): string {
  const tpls: string[] = Array.isArray(auto.resposta_comentario_templates)
    ? auto.resposta_comentario_templates.filter((t: any) => typeof t === "string" && t.trim()) : [];
  if (tpls.length === 0) return "Te enviei no direct! 📩";
  return tpls[Math.floor(Math.random() * tpls.length)];
}

// Agenda o follow-up (sempre) para o IGSID que recebeu a DM de abertura.
async function agendarFollowup(supabase: any, orgId: string, pageId: string, auto: any, igsid: string) {
  if (!auto.followup_ativo || !igsid) return;
  const delay = Math.max(1, Number(auto.followup_delay_min) || 60);
  const sendAt = new Date(Date.now() + delay * 60_000).toISOString();
  await supabase.from("ig_followups").insert({
    org_id: orgId, automacao_id: auto.id, page_id: pageId,
    recipient_igsid: igsid, payload: auto.followup_payload || {}, send_at: sendAt, status: "pendente",
  });
}

// Dedup genérico via ig_automacao_logs (unique org_id+comment_id). Retorna true se já processado.
async function jaProcessado(supabase: any, orgId: string, chave: string): Promise<boolean> {
  const { data } = await supabase.from("ig_automacao_logs").select("id").eq("org_id", orgId).eq("comment_id", chave).maybeSingle();
  return !!data;
}

async function contaPorIg(supabase: any, igUserId: string) {
  const { data } = await supabase.from("ig_contas")
    .select("org_id, ig_user_id, page_id, page_token, ativo").eq("ig_user_id", igUserId).eq("ativo", true).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);

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
      const igUserId = String(entry.id ?? "");

      // ---- A) Comentários ----
      for (const ch of entry.changes || []) {
        if (ch.field !== "comments") continue;
        const v = ch.value || {};
        const commentId = String(v.id ?? "");
        const mediaId = String(v.media?.id ?? "");
        const texto = String(v.text ?? "");
        const fromId = String(v.from?.id ?? "");
        const fromUser = v.from?.username ?? null;
        if (!commentId) continue;

        const conta = await contaPorIg(supabase, igUserId);
        if (!conta?.org_id || !conta.page_token) { console.warn("[ig] conta não vinculada:", igUserId); continue; }
        const orgId = conta.org_id as string;
        const token = conta.page_token as string;
        const pageId = String(conta.page_id ?? "");

        if (fromId && fromId === String(conta.ig_user_id)) continue; // ignora o dono
        if (await jaProcessado(supabase, orgId, commentId)) continue;

        const { data: autos } = await supabase.from("ig_automacoes").select("*").eq("org_id", orgId).eq("status", "live");
        const auto = (autos || []).find((a: any) => casaEscopo(a, mediaId) && casaGatilho(a, texto));
        if (!auto) continue;

        const acoes: any = { reply_ok: false, dm_ok: false, followup: false, erros: [] };
        if (auto.responder_comentario) {
          try { await responderComentario(token, commentId, escolherResposta(auto)); acoes.reply_ok = true; }
          catch (e) { acoes.erros.push(`reply: ${e instanceof Error ? e.message : "erro"}`); }
        }
        if (auto.enviar_dm) {
          try {
            const igsid = await enviarAbertura(token, pageId, commentId, auto);
            acoes.dm_ok = true;
            if (igsid) { await agendarFollowup(supabase, orgId, pageId, auto, igsid); acoes.followup = !!auto.followup_ativo; }
          } catch (e) { acoes.erros.push(`dm: ${e instanceof Error ? e.message : "erro"}`); }
        }

        await supabase.from("ig_automacao_logs").insert({
          org_id: orgId, automacao_id: auto.id, comment_id: commentId, media_id: mediaId,
          from_username: fromUser, comment_text: texto, acoes,
        });
      }

      // ---- B) Postbacks (toque no botão de opt-in) ----
      for (const m of entry.messaging || []) {
        const pb = m.postback;
        if (!pb) continue;
        const payload = String(pb.payload ?? "");
        if (!payload.startsWith("AUTODM_OPTIN:")) continue;
        const automacaoId = payload.split(":")[1];
        const igsid = String(m.sender?.id ?? "");
        const mid = String(pb.mid ?? `${igsid}:${automacaoId}`);
        const igAcc = String(m.recipient?.id ?? igUserId);

        const conta = await contaPorIg(supabase, igAcc);
        if (!conta?.org_id || !conta.page_token) continue;
        const orgId = conta.org_id as string;
        const token = conta.page_token as string;
        const pageId = String(conta.page_id ?? "");

        if (await jaProcessado(supabase, orgId, `pb:${mid}`)) continue;

        const { data: auto } = await supabase.from("ig_automacoes").select("*").eq("org_id", orgId).eq("id", automacaoId).maybeSingle();
        const acoes: any = { link_ok: false, erros: [] };
        if (auto && igsid) {
          try { await enviarLink(token, pageId, igsid, auto); acoes.link_ok = true; }
          catch (e) { acoes.erros.push(`link: ${e instanceof Error ? e.message : "erro"}`); }
        }
        await supabase.from("ig_automacao_logs").insert({
          org_id: orgId, automacao_id: automacaoId || null, comment_id: `pb:${mid}`,
          from_username: null, comment_text: "[opt-in tocado]", acoes,
        });
      }
    }
  } catch (e) {
    console.error("[ig] exception:", e instanceof Error ? e.message : "unknown");
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
