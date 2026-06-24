import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Publica/agenda posts no Instagram a partir do card de tarefa (Workflow).
// Reaproveita ig_contas.page_token (token da Página) e o bucket público
// artes-tarefas (URLs públicas servem de image_url/video_url p/ a Graph API).
// Ações (frontend): agendar, publicar_agora, cancelar.
// Multi-tenant: resolve a org pelo header x-org-slug (igual a instagram-connect).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
};

const GRAPH = "https://graph.facebook.com/v21.0";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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

// Espera o container de vídeo (Reels) ficar pronto. Retorna true se FINISHED.
async function aguardarContainer(token: string, creationId: string, tentativas = 8, intervaloMs = 5000): Promise<boolean> {
  for (let i = 0; i < tentativas; i++) {
    const st = await graphGet(token, `/${creationId}`, { fields: "status_code" }).catch(() => null);
    if (st?.status_code === "FINISHED") return true;
    if (st?.status_code === "ERROR") throw new Error("Falha ao processar o vídeo (container ERROR).");
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return false;
}

// Lógica central de publicação. Atualiza ig_posts conforme avança.
// Retorna { done: boolean } — done=false significa "ainda processando" (Reels assíncrono).
export async function processarPost(supabase: any, post: any): Promise<{ done: boolean }> {
  const { data: conta } = await supabase.from("ig_contas")
    .select("page_token,ig_user_id").eq("id", post.ig_conta_id).maybeSingle();
  if (!conta?.page_token || !conta.ig_user_id) {
    await supabase.from("ig_posts").update({ status: "falhou", erro: "Conta Instagram não encontrada." }).eq("id", post.id);
    return { done: true };
  }
  const token = conta.page_token as string;
  const ig = conta.ig_user_id as string;
  const midias: string[] = Array.isArray(post.midias) ? post.midias : [];
  const caption = post.legenda || "";

  try {
    await supabase.from("ig_posts").update({ status: "processando" }).eq("id", post.id);

    // ---- REELS (vídeo, assíncrono) ----
    if (post.tipo === "reels") {
      let creationId = post.creation_id as string | null;
      if (!creationId) {
        const c = await graphPost(token, `/${ig}/media`, { media_type: "REELS", video_url: midias[0], caption });
        creationId = c.id;
        await supabase.from("ig_posts").update({ creation_id: creationId }).eq("id", post.id);
      }
      const pronto = await aguardarContainer(token, creationId!);
      if (!pronto) return { done: false }; // o cron tenta de novo depois
      const pub = await graphPost(token, `/${ig}/media_publish`, { creation_id: creationId! });
      await finalizar(supabase, token, post.id, pub.id);
      return { done: true };
    }

    // ---- CARROSSEL ----
    if (post.tipo === "carrossel") {
      const childIds: string[] = [];
      for (const url of midias) {
        const ch = await graphPost(token, `/${ig}/media`, { image_url: url, is_carousel_item: "true" });
        childIds.push(ch.id);
      }
      const parent = await graphPost(token, `/${ig}/media`, { media_type: "CAROUSEL", children: childIds.join(","), caption });
      const pub = await graphPost(token, `/${ig}/media_publish`, { creation_id: parent.id });
      await finalizar(supabase, token, post.id, pub.id);
      return { done: true };
    }

    // ---- IMAGEM ÚNICA ----
    const c = await graphPost(token, `/${ig}/media`, { image_url: midias[0], caption });
    const pub = await graphPost(token, `/${ig}/media_publish`, { creation_id: c.id });
    await finalizar(supabase, token, post.id, pub.id);
    return { done: true };
  } catch (e) {
    await supabase.from("ig_posts").update({ status: "falhou", erro: e instanceof Error ? e.message : "Erro ao publicar" }).eq("id", post.id);
    return { done: true };
  }
}

async function finalizar(supabase: any, token: string, postId: string, mediaId: string) {
  let permalink: string | null = null;
  try { const p = await graphGet(token, `/${mediaId}`, { fields: "permalink" }); permalink = p?.permalink ?? null; } catch { /* ignore */ }
  await supabase.from("ig_posts").update({
    status: "publicado", ig_media_id: mediaId, permalink, published_at: new Date().toISOString(), erro: null,
  }).eq("id", postId);
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
      await supabase.from("ig_posts").delete().eq("id", body.id).eq("org_id", orgId).eq("status", "pendente");
      return json({ ok: true });
    }

    if (action === "agendar" || action === "publicar_agora") {
      const midias: string[] = Array.isArray(body.midias) ? body.midias : [];
      if (!body.ig_conta_id) return json({ error: "Selecione a conta do Instagram." }, 400);
      if (midias.length === 0) return json({ error: "Selecione ao menos uma mídia." }, 400);

      const { data: conta } = await supabase.from("ig_contas")
        .select("ig_user_id").eq("id", body.ig_conta_id).eq("org_id", orgId).maybeSingle();
      if (!conta?.ig_user_id) return json({ error: "Conta Instagram inválida." }, 400);

      const tipo = body.tipo || (midias.length > 1 ? "carrossel" : "imagem");
      const publishAt = action === "agendar" ? (body.publish_at || null) : null;

      const { data: post, error } = await supabase.from("ig_posts").insert({
        org_id: orgId, tarefa_id: body.tarefa_id || null, ig_conta_id: body.ig_conta_id,
        ig_user_id: conta.ig_user_id, tipo, legenda: body.legenda || null, midias,
        publish_at: publishAt, status: "pendente",
      }).select("*").single();
      if (error) return json({ error: error.message }, 400);

      if (action === "publicar_agora") {
        const { done } = await processarPost(supabase, post);
        return json({ ok: true, id: post.id, processando: !done });
      }
      return json({ ok: true, id: post.id, agendado: true });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 400);
  }
});
