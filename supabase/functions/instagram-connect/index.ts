import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Conexão da conta Instagram para a automação de comentários (Auto-DM, estilo ManyChat).
// Reaproveita o token Meta da org (meta_config). Ações chamadas pelo frontend:
//  - listar_contas:   lê /me/accounts (páginas + instagram_business_account), salva em ig_contas.
//  - assinar_webhook: POST /{page_id}/subscribed_apps com subscribed_fields=comments.
//  - listar_midias:   GET /{ig_user_id}/media para o seletor de posts/Reels.
// Multi-tenant: resolve a org pelo header x-org-slug (com verificação de acesso) — igual a meta-ads-manager.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
};

const GRAPH = "https://graph.facebook.com/v21.0";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Resolve a org ATIVA (multi-tenant). Mesmo helper de meta-ads-manager.
async function getOrgId(supabase: any, req: Request, body: any): Promise<string | null> {
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

// Token de usuário do Meta (mesma fonte do gerenciador de campanhas).
async function getUserToken(supabase: any, orgId: string): Promise<string> {
  const { data } = await supabase.from("meta_config").select("access_token,token_expires_at").eq("org_id", orgId).maybeSingle();
  if (!data?.access_token) throw new Error("Meta não conectado. Conecte na tela de Integrações.");
  if (data.token_expires_at && Date.now() >= Number(data.token_expires_at)) {
    throw new Error("Token do Meta expirado. Reconecte na tela de Integrações.");
  }
  return data.access_token as string;
}

async function graphGet(token: string, path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.error_user_msg || j?.error?.message || `Graph API ${r.status}`);
  return j;
}

async function graphPost(token: string, path: string, params: Record<string, string> = {}): Promise<any> {
  const form = new URLSearchParams();
  form.set("access_token", token);
  for (const [k, v] of Object.entries(params)) form.set(k, v);
  const r = await fetch(`${GRAPH}${path}`, { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.error_user_msg || j?.error?.message || `Graph API ${r.status}`);
  return j;
}

// Lista páginas com Instagram Business vinculado e persiste/atualiza em ig_contas.
async function listarContas(supabase: any, orgId: string, token: string) {
  const res = await graphGet(token, "/me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username,profile_picture_url}",
    limit: "100",
  });
  const contas: any[] = [];
  for (const pg of res.data || []) {
    const iba = pg.instagram_business_account;
    if (!iba?.id) continue; // só páginas com IG Business
    const row = {
      org_id: orgId,
      page_id: String(pg.id),
      page_name: pg.name ?? null,
      ig_user_id: String(iba.id),
      ig_username: iba.username ?? null,
      page_token: pg.access_token ?? null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("ig_contas").upsert(row, { onConflict: "org_id,ig_user_id" });
    contas.push({
      ig_user_id: row.ig_user_id, ig_username: row.ig_username,
      page_id: row.page_id, page_name: row.page_name,
      profile_picture_url: iba.profile_picture_url ?? null,
    });
  }
  return contas;
}

// Vincula o app à Página (subscribed_apps) para que o app receba os eventos dos ativos
// conectados a ela. Os comentários do Instagram chegam pela inscrição do app no OBJETO
// `instagram` (nível do app, configurado no painel da Meta) — `comments` NÃO é um campo
// válido de subscribed_apps da Página (esses são campos de Página, ex.: `feed`).
// Aqui apenas garantimos (idempotente) que o app está vinculado à Página.
async function assinarWebhook(supabase: any, orgId: string, igUserId: string) {
  const { data: conta } = await supabase.from("ig_contas")
    .select("page_id,page_token").eq("org_id", orgId).eq("ig_user_id", igUserId).maybeSingle();
  if (!conta?.page_id || !conta.page_token) throw new Error("Conta Instagram não encontrada. Conecte novamente.");
  // Já existe? (evita erro se o app já estiver vinculado à Página)
  const atual = await graphGet(conta.page_token, `/${conta.page_id}/subscribed_apps`).catch(() => null);
  const jaVinculado = Array.isArray(atual?.data) && atual.data.length > 0;
  if (!jaVinculado) {
    await graphPost(conta.page_token, `/${conta.page_id}/subscribed_apps`, { subscribed_fields: "feed" });
  }
  await supabase.from("ig_contas").update({ webhook_assinado: true, updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("ig_user_id", igUserId);
  return { ok: true, ja_vinculado: jaVinculado };
}

// Lista posts/Reels da conta IG para o seletor de mídia.
async function listarMidias(supabase: any, orgId: string, igUserId: string) {
  const { data: conta } = await supabase.from("ig_contas")
    .select("page_token,ig_user_id").eq("org_id", orgId).eq("ig_user_id", igUserId).maybeSingle();
  if (!conta?.page_token) throw new Error("Conta Instagram não encontrada. Conecte novamente.");
  const res = await graphGet(conta.page_token, `/${conta.ig_user_id}/media`, {
    fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
    limit: "50",
  });
  return (res.data || []).map((m: any) => ({
    id: String(m.id),
    caption: m.caption ?? "",
    media_type: m.media_type,
    thumbnail: m.thumbnail_url || m.media_url || null,
    permalink: m.permalink,
    timestamp: m.timestamp,
  }));
}

// ============================================================
// Backfill: rodar a automação nos comentários ANTIGOS de um post (que ainda não foram
// processados/respondidos). Reproduz a lógica do webhook instagram-comments: responde o
// comentário + envia a DM de abertura + agenda follow-up, com dedup por ig_automacao_logs.
// Obs.: Private Reply (DM) só é aceito pelo Instagram dentro da janela permitida após o
// comentário (~7 dias). Comentários mais antigos contam em "fora_janela".
// ============================================================
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function casaGatilho(auto: any, texto: string): boolean {
  if (auto.gatilho_tipo === "qualquer_comentario") return true;
  const palavras: string[] = Array.isArray(auto.palavras) ? auto.palavras : [];
  if (palavras.length === 0) return false;
  const t = norm(texto);
  if (auto.match_tipo === "exato") return palavras.some((p) => norm(p) === t);
  return palavras.some((p) => { const w = norm(p); return w.length > 0 && t.includes(w); });
}

function escolherResposta(auto: any): string {
  const tpls: string[] = Array.isArray(auto.resposta_comentario_templates)
    ? auto.resposta_comentario_templates.filter((t: any) => typeof t === "string" && t.trim()) : [];
  return tpls.length ? tpls[Math.floor(Math.random() * tpls.length)] : "Te enviei no direct! 📩";
}

function msgComLinks(texto: string, botoes: any[]): any {
  const bs = (botoes || []).filter((b) => b?.url).slice(0, 3);
  if (bs.length === 0) return { text: texto || "👇" };
  return { attachment: { type: "template", payload: {
    template_type: "button", text: texto || "👇",
    buttons: bs.map((b) => ({ type: "web_url", title: b.titulo || "Abrir", url: b.url })),
  } } };
}
function msgOptin(texto: string, botaoTitulo: string, payload: string): any {
  return { attachment: { type: "template", payload: {
    template_type: "button", text: texto || "👇",
    buttons: [{ type: "postback", title: botaoTitulo || "Me envie o link", payload }],
  } } };
}
const modoDM = (dm: any): "optin" | "direto" =>
  dm?.modo === "direto" ? "direto" : (dm?.modo === "optin" || dm?.optin_texto ? "optin" : "direto");

async function graphPostJson(token: string, path: string, payload: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${GRAPH}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, access_token: token }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.error_user_msg || j?.error?.message || `Graph API ${r.status}`);
  return j;
}

async function enviarAbertura(token: string, pageId: string, commentId: string, auto: any): Promise<string | null> {
  const dm = auto.dm_payload || {};
  const message = modoDM(dm) === "optin"
    ? msgOptin(dm.optin_texto, dm.optin_botao_titulo, `AUTODM_OPTIN:${auto.id}`)
    : msgComLinks(dm.texto, dm.botoes || []);
  const resp = await graphPostJson(token, `/${pageId}/messages`, { recipient: { comment_id: commentId }, message });
  return resp?.recipient_id ? String(resp.recipient_id) : null;
}

async function agendarFollowup(supabase: any, orgId: string, pageId: string, auto: any, igsid: string) {
  if (!auto.followup_ativo || !igsid) return;
  const delay = Math.max(1, Number(auto.followup_delay_min) || 60);
  const sendAt = new Date(Date.now() + delay * 60_000).toISOString();
  await supabase.from("ig_followups").insert({
    org_id: orgId, automacao_id: auto.id, page_id: pageId,
    recipient_igsid: igsid, payload: auto.followup_payload || {}, send_at: sendAt, status: "pendente",
  });
}

// Estimativa rápida de quantos comentários existem (soma comments_count das mídias-alvo) — p/ a barra de progresso.
async function estimarAntigos(supabase: any, orgId: string, automacaoId: string) {
  const { data: auto } = await supabase.from("ig_automacoes").select("escopo,media_ids,ig_conta_id").eq("org_id", orgId).eq("id", automacaoId).maybeSingle();
  if (!auto) throw new Error("Automação não encontrada.");
  const { data: conta } = await supabase.from("ig_contas").select("ig_user_id,page_token").eq("org_id", orgId).eq("id", auto.ig_conta_id).maybeSingle();
  if (!conta?.page_token) throw new Error("Conta Instagram não encontrada.");
  const token = conta.page_token as string;
  let medias: string[] = [];
  if (auto.escopo === "post_especifico") medias = (auto.media_ids || []).map(String);
  else { const res = await graphGet(token, `/${conta.ig_user_id}/media`, { fields: "id", limit: "25" }); medias = (res.data || []).map((m: any) => String(m.id)); }
  let total = 0;
  for (const id of medias) {
    const r = await graphGet(token, `/${id}`, { fields: "comments_count" }).catch(() => null);
    total += Number(r?.comments_count || 0);
  }
  return { total: Math.min(total, 200) };  // o backfill processa até 200 por vez
}

async function processarAntigos(supabase: any, orgId: string, automacaoId: string) {
  const { data: auto } = await supabase.from("ig_automacoes").select("*").eq("org_id", orgId).eq("id", automacaoId).maybeSingle();
  if (!auto) throw new Error("Automação não encontrada.");
  const { data: conta } = await supabase.from("ig_contas")
    .select("id,ig_user_id,ig_username,page_id,page_token").eq("org_id", orgId).eq("id", auto.ig_conta_id).maybeSingle();
  if (!conta?.page_token) throw new Error("Conta Instagram não encontrada. Reconecte na tela.");
  const token = conta.page_token as string, pageId = String(conta.page_id ?? ""), igUserId = String(conta.ig_user_id ?? "");
  const igUsername = conta.ig_username ?? null;

  // Mídias-alvo: posts específicos, ou as 25 mais recentes (escopo qualquer/próximo).
  let medias: string[] = [];
  if (auto.escopo === "post_especifico") medias = (auto.media_ids || []).map(String);
  else { const res = await graphGet(token, `/${igUserId}/media`, { fields: "id", limit: "25" }); medias = (res.data || []).map((m: any) => String(m.id)); }
  if (medias.length === 0) throw new Error("Nenhum post associado a esta automação.");

  const out = { processados: 0, respostas: 0, dms: 0, fora_janela: 0, pulados: 0, erros: [] as string[] };
  const LIMITE = 200; let vistos = 0;
  const msg = (e: unknown) => (e instanceof Error ? e.message : "erro");

  for (const mediaId of medias) {
    let next: string | null = `${GRAPH}/${mediaId}/comments?fields=${encodeURIComponent("id,text,username,timestamp,from,replies{id,username,from}")}&limit=50&access_token=${encodeURIComponent(token)}`;
    let pages = 0;
    while (next && vistos < LIMITE && pages < 12) {
      const r = await fetch(next); const j: any = await r.json().catch(() => ({}));
      if (!r.ok) { out.erros.push(j?.error?.message || `comments ${r.status}`); break; }
      for (const c of j.data || []) {
        if (vistos >= LIMITE) break;
        vistos++;
        const commentId = String(c.id ?? ""); const texto = String(c.text ?? "");
        const fromId = String(c.from?.id ?? ""); const uname = c.username ?? c.from?.username ?? null;
        if (!commentId) continue;
        if (fromId && fromId === igUserId) { out.pulados++; continue; }     // comentário do próprio dono
        if (igUsername && uname && uname === igUsername) { out.pulados++; continue; }
        if (!casaGatilho(auto, texto)) { out.pulados++; continue; }
        // já respondemos esse comentário? (resposta nossa nas replies)
        const jaRespondido = Array.isArray(c.replies?.data) && c.replies.data.some((rep: any) =>
          String(rep.from?.id ?? "") === igUserId || (igUsername && rep.username === igUsername));
        // dedup por log
        const { data: jl } = await supabase.from("ig_automacao_logs").select("id").eq("org_id", orgId).eq("comment_id", commentId).maybeSingle();
        if (jl) { out.pulados++; continue; }
        if (jaRespondido && !auto.enviar_dm) { out.pulados++; continue; }

        const acoes: any = { reply_ok: false, dm_ok: false, followup: false, backfill: true, erros: [] };
        if (auto.responder_comentario && !jaRespondido) {
          try { await graphPostJson(token, `/${commentId}/replies`, { message: escolherResposta(auto) }); acoes.reply_ok = true; out.respostas++; }
          catch (e) { acoes.erros.push(`reply: ${msg(e)}`); }
        }
        if (auto.enviar_dm) {
          try {
            const igsid = await enviarAbertura(token, pageId, commentId, auto);
            acoes.dm_ok = true; out.dms++;
            if (igsid) { await agendarFollowup(supabase, orgId, pageId, auto, igsid); acoes.followup = !!auto.followup_ativo; }
          } catch (e) {
            const m = msg(e);
            // janela de 7 dias do Instagram (private reply). Cobre PT e EN.
            if (/antig|privad|window|outside|too old|expir|7 ?day|24 ?h|allowed|muito antigo/i.test(m)) out.fora_janela++;
            acoes.erros.push(`dm: ${m}`);
          }
        }
        await supabase.from("ig_automacao_logs").insert({
          org_id: orgId, automacao_id: auto.id, comment_id: commentId, media_id: mediaId,
          from_username: uname, comment_text: texto, acoes,
        });
        out.processados++;
      }
      next = j.paging?.next || null; pages++;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const supabase = svc();
  try {
    const body = await req.json();
    const action = body.action;
    const orgId = await getOrgId(supabase, req, body);
    if (!orgId) return json({ error: "Organização não identificada (faça login)" }, 401);

    const token = await getUserToken(supabase, orgId);

    if (action === "listar_contas") return json({ contas: await listarContas(supabase, orgId, token) });
    if (action === "assinar_webhook") return json(await assinarWebhook(supabase, orgId, String(body.ig_user_id)));
    if (action === "listar_midias") return json({ midias: await listarMidias(supabase, orgId, String(body.ig_user_id)) });
    if (action === "estimar_antigos") return json(await estimarAntigos(supabase, orgId, String(body.automacao_id)));
    if (action === "processar_antigos") return json(await processarAntigos(supabase, orgId, String(body.automacao_id)));

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 400);
  }
});
