import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Publica/agenda YouTube Shorts a partir do card de tarefa (Workflow).
// Faz upload do vídeo via YouTube Data API v3 (resumable upload) usando o token
// OAuth do canal (yt_canais), renovado pelo refresh_token quando expira.
// Agendamento é NATIVO: privacyStatus="private" + status.publishAt (ISO) — o
// próprio YouTube publica no horário, sem cron. Ações: publicar_agora | agendar | cancelar.
// Multi-tenant: resolve a org pelo header x-org-slug (igual instagram-publish).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
};

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function clientCreds() {
  return {
    client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
  };
}

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

// Access token válido do canal (renova com refresh_token se expirado). Mesmo padrão do google-sheets.
async function getCanalToken(supabase: any, canal: any): Promise<string> {
  if (!canal?.refresh_token) throw new Error("Canal do YouTube não conectado. Reconecte na tela de Integrações.");
  const exp = canal.token_expiry ? new Date(canal.token_expiry).getTime() : 0;
  if (canal.access_token && exp > Date.now() + 60000) return canal.access_token;
  const { client_id, client_secret } = clientCreds();
  const form = new URLSearchParams({
    client_id, client_secret, refresh_token: canal.refresh_token, grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: form });
  const j = await r.json();
  if (!r.ok) throw new Error(`Falha ao renovar token YouTube: ${j.error_description || j.error}`);
  const expiry = new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString();
  await supabase.from("yt_canais").update({ access_token: j.access_token, token_expiry: expiry, updated_at: new Date().toISOString() }).eq("id", canal.id);
  return j.access_token;
}

// Upload de vídeo (resumable) + metadata. Retorna o videoId publicado/agendado.
async function uploadVideo(token: string, video_url: string, snippet: any, status: any): Promise<string> {
  // 1) Baixa os bytes do vídeo (URL pública do bucket artes-tarefas ou da VPS).
  const vr = await fetch(video_url);
  if (!vr.ok) throw new Error(`Não consegui baixar o vídeo (${vr.status}).`);
  const bytes = new Uint8Array(await vr.arrayBuffer());
  const contentType = vr.headers.get("content-type") || "video/mp4";

  // 2) Inicia a sessão resumable com a metadata (snippet + status).
  const meta = JSON.stringify({ snippet, status });
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(bytes.byteLength),
      },
      body: meta,
    },
  );
  if (!init.ok) {
    const j = await init.json().catch(() => ({}));
    throw new Error(j?.error?.message || `Falha ao iniciar upload no YouTube (${init.status}).`);
  }
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube não devolveu a URL de upload.");

  // 3) Envia os bytes do vídeo.
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(bytes.byteLength) },
    body: bytes,
  });
  const pj = await put.json().catch(() => ({}));
  if (!put.ok) throw new Error(pj?.error?.message || `Falha no upload do vídeo (${put.status}).`);
  if (!pj.id) throw new Error("YouTube não devolveu o id do vídeo.");
  return String(pj.id);
}

// Lógica central de publicação. Atualiza yt_posts conforme avança.
async function processarPost(supabase: any, post: any): Promise<{ done: boolean; erro?: string }> {
  const { data: canal } = await supabase.from("yt_canais")
    .select("id,refresh_token,access_token,token_expiry").eq("id", post.yt_canal_id).maybeSingle();
  if (!canal) {
    await supabase.from("yt_posts").update({ status: "falhou", erro: "Canal do YouTube não encontrado." }).eq("id", post.id);
    return { done: true, erro: "Canal do YouTube não encontrado." };
  }
  try {
    await supabase.from("yt_posts").update({ status: "processando" }).eq("id", post.id);
    const token = await getCanalToken(supabase, canal);

    const agendado = !!post.publish_at;
    const titulo = (post.titulo || "Short").slice(0, 100);
    // #Shorts no título/descrição ajuda o YouTube a classificar como Short.
    const descricao = `${post.descricao || ""}\n\n#Shorts`.trim();
    const snippet = { title: titulo, description: descricao };
    const status = agendado
      ? { privacyStatus: "private", publishAt: new Date(post.publish_at).toISOString(), selfDeclaredMadeForKids: false }
      : { privacyStatus: "public", selfDeclaredMadeForKids: false };

    const videoId = await uploadVideo(token, post.video_url, snippet, status);
    await supabase.from("yt_posts").update({
      status: "publicado", youtube_video_id: videoId,
      permalink: `https://youtu.be/${videoId}`,
      published_at: new Date().toISOString(), erro: null,
    }).eq("id", post.id);
    return { done: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao publicar";
    await supabase.from("yt_posts").update({ status: "falhou", erro: msg }).eq("id", post.id);
    return { done: true, erro: msg };
  }
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

    if (action === "cancelar") {
      await supabase.from("yt_posts").delete().eq("id", body.id).eq("org_id", orgId).eq("status", "pendente");
      return json({ ok: true });
    }

    if (action === "agendar" || action === "publicar_agora") {
      const video_url = body.video_url as string | undefined;
      if (!body.yt_canal_id) return json({ error: "Selecione o canal do YouTube." }, 400);
      if (!video_url) return json({ error: "O YouTube exige um vídeo." }, 400);

      const { data: canal } = await supabase.from("yt_canais")
        .select("id").eq("id", body.yt_canal_id).eq("org_id", orgId).maybeSingle();
      if (!canal) return json({ error: "Canal do YouTube inválido." }, 400);

      const publishAt = action === "agendar" ? (body.publish_at || null) : null;
      const { data: post, error } = await supabase.from("yt_posts").insert({
        org_id: orgId, tarefa_id: body.tarefa_id || null, yt_canal_id: body.yt_canal_id,
        titulo: body.titulo || null, descricao: body.descricao || null, video_url,
        publish_at: publishAt, status: "pendente",
      }).select("*").single();
      if (error) return json({ error: error.message }, 400);

      const { done, erro } = await processarPost(supabase, post);
      if (erro) return json({ error: erro, id: post.id }, 400);
      return json({ ok: true, id: post.id, agendado: action === "agendar", processando: !done });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 400);
  }
});
