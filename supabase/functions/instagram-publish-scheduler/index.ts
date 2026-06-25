import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cron (a cada 5 min): publica os posts devidos da fila ig_posts.
// Pega status 'pendente' com publish_at vencido + 'processando' (Reels que
// ainda estavam renderizando) e finaliza. Sem auth (chamado pelo cron com anon key).
// Lógica de publicação duplicada de instagram-publish (funções autocontidas).

const GRAPH = "https://graph.facebook.com/v21.0";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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

async function aguardarContainer(token: string, creationId: string, tentativas = 8, intervaloMs = 5000): Promise<boolean> {
  for (let i = 0; i < tentativas; i++) {
    const st = await graphGet(token, `/${creationId}`, { fields: "status_code" }).catch(() => null);
    if (st?.status_code === "FINISHED") return true;
    if (st?.status_code === "ERROR") throw new Error("Falha ao processar o vídeo (container ERROR).");
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return false;
}

function normEtapa(s: string) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Move o card vinculado ao post para a etapa "Postado" (coluna da org do card).
async function moverCardPostado(supabase: any, tarefaId: string) {
  const { data: tarefa } = await supabase.from("tarefas").select("org_id").eq("id", tarefaId).maybeSingle();
  if (!tarefa) return;
  const { data: cols } = await supabase.from("kanban_colunas").select("id,nome").eq("org_id", tarefa.org_id);
  const col = (cols || []).find((c: any) => normEtapa(c.nome).includes("postado"));
  if (col) await supabase.from("tarefas").update({ coluna_id: col.id, updated_at: new Date().toISOString() }).eq("id", tarefaId);
}

async function finalizar(supabase: any, token: string, postId: string, mediaId: string) {
  let permalink: string | null = null;
  try { const p = await graphGet(token, `/${mediaId}`, { fields: "permalink" }); permalink = p?.permalink ?? null; } catch { /* ignore */ }
  const { data: post } = await supabase.from("ig_posts").update({
    status: "publicado", ig_media_id: mediaId, permalink, published_at: new Date().toISOString(), erro: null,
  }).eq("id", postId).select("tarefa_id").maybeSingle();
  if (post?.tarefa_id) { try { await moverCardPostado(supabase, post.tarefa_id); } catch { /* ignore */ } }
}

async function processarPost(supabase: any, post: any): Promise<{ done: boolean }> {
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

    if (post.tipo === "reels") {
      let creationId = post.creation_id as string | null;
      if (!creationId) {
        const c = await graphPost(token, `/${ig}/media`, { media_type: "REELS", video_url: midias[0], caption });
        creationId = c.id;
        await supabase.from("ig_posts").update({ creation_id: creationId }).eq("id", post.id);
      }
      const pronto = await aguardarContainer(token, creationId!);
      if (!pronto) return { done: false };
      const pub = await graphPost(token, `/${ig}/media_publish`, { creation_id: creationId! });
      await finalizar(supabase, token, post.id, pub.id);
      return { done: true };
    }

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

    const c = await graphPost(token, `/${ig}/media`, { image_url: midias[0], caption });
    const pub = await graphPost(token, `/${ig}/media_publish`, { creation_id: c.id });
    await finalizar(supabase, token, post.id, pub.id);
    return { done: true };
  } catch (e) {
    await supabase.from("ig_posts").update({ status: "falhou", erro: e instanceof Error ? e.message : "Erro ao publicar" }).eq("id", post.id);
    return { done: true };
  }
}

Deno.serve(async (_req) => {
  const supabase = svc();
  const nowIso = new Date().toISOString();
  // pendentes vencidos + processando (Reels que ficaram renderizando)
  const { data: posts } = await supabase.from("ig_posts")
    .select("*")
    .in("status", ["pendente", "processando"])
    .or(`publish_at.is.null,publish_at.lte.${nowIso}`)
    .order("publish_at", { ascending: true })
    .limit(20);

  let processados = 0;
  for (const post of posts || []) {
    await processarPost(supabase, post);
    processados++;
  }
  return new Response(JSON.stringify({ ok: true, processados }), { headers: { "Content-Type": "application/json" } });
});
