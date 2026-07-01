import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Conexão de canal do YouTube via Google OAuth (escopo youtube.upload), para
// publicar/agendar Shorts a partir do card de tarefa (Workflow). Reaproveita o
// app OAuth Google global (GOOGLE_CLIENT_ID/SECRET) e o mesmo REDIRECT_URI do
// google-sheets — por isso usamos state=youtube para o front rotear o `exchange`.
// Tokens guardados por canal em yt_canais (1+ por org). Ações (frontend):
//  - get_auth_url: monta a URL de consentimento (state=youtube).
//  - exchange:     troca o code por tokens, lê os canais (mine=true) e upserta.
//  - listar_canais / status / disconnect.
// Multi-tenant: resolve a org pelo header x-org-slug (igual instagram-connect).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
};

const REDIRECT_URI = "https://appgrowthstack.vercel.app/integracoes";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// client_id/secret do app OAuth são GLOBAIS (do dono do SaaS) — mesmos do google-sheets.
function clientCreds() {
  return {
    client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
  };
}

// Resolve a org ATIVA (multi-tenant). Mesmo helper de instagram-connect.
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

async function gapi(token: string, url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Google API ${r.status}`);
  return j;
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

    if (action === "get_auth_url") {
      const { client_id } = clientCreds();
      if (!client_id) throw new Error("O YouTube ainda não foi configurado pelo administrador do sistema.");
      const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      u.searchParams.set("client_id", client_id);
      u.searchParams.set("redirect_uri", REDIRECT_URI);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", SCOPES);
      u.searchParams.set("access_type", "offline");
      u.searchParams.set("prompt", "consent");
      u.searchParams.set("state", "youtube"); // o front usa isto p/ rotear o exchange
      return json({ url: u.toString() });
    }

    if (action === "exchange") {
      const { client_id, client_secret } = clientCreds();
      const form = new URLSearchParams({
        code: body.code, client_id, client_secret,
        redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
      });
      const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(`Erro no OAuth: ${j.error_description || j.error}`);
      const expiry = new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString();

      // Lê os canais do usuário (normalmente 1). Cada canal vira uma linha em yt_canais.
      const chan = await gapi(j.access_token, "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true");
      const itens: any[] = chan.items || [];
      if (itens.length === 0) throw new Error("Nenhum canal do YouTube encontrado nesta conta Google.");

      const canais: any[] = [];
      for (const it of itens) {
        const row: any = {
          org_id: orgId,
          channel_id: String(it.id),
          channel_title: it.snippet?.title ?? null,
          thumbnail_url: it.snippet?.thumbnails?.default?.url ?? null,
          access_token: j.access_token,
          token_expiry: expiry,
          ativo: true,
          updated_at: new Date().toISOString(),
        };
        if (j.refresh_token) row.refresh_token = j.refresh_token; // só vem na 1ª autorização
        await supabase.from("yt_canais").upsert(row, { onConflict: "org_id,channel_id" });
        canais.push({ channel_id: row.channel_id, channel_title: row.channel_title, thumbnail_url: row.thumbnail_url });
      }
      return json({ ok: true, canais });
    }

    if (action === "listar_canais") {
      const { data } = await supabase.from("yt_canais")
        .select("id,channel_id,channel_title,thumbnail_url").eq("org_id", orgId).eq("ativo", true).order("created_at");
      return json({ canais: data || [] });
    }

    if (action === "status") {
      const { data } = await supabase.from("yt_canais")
        .select("channel_title,refresh_token").eq("org_id", orgId).eq("ativo", true);
      const conectado = (data || []).some((c: any) => !!c.refresh_token);
      return json({ connected: conectado, canais: (data || []).map((c: any) => c.channel_title), has_client: !!clientCreds().client_id });
    }

    if (action === "disconnect") {
      // body.id opcional p/ desconectar um canal específico; sem id, desconecta todos da org.
      const q = supabase.from("yt_canais").delete().eq("org_id", orgId);
      if (body.id) q.eq("id", body.id);
      await q;
      return json({ ok: true });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 400);
  }
});
