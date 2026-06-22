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

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 400);
  }
});
