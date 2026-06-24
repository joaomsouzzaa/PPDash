import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Endpoint PÚBLICO das Pesquisas (estilo Typeform).
// Respondentes não têm conta, então usamos o service_role (ignora RLS) e
// resolvemos a org pelo slug recebido. Ações (POST { acao, ... }):
//  - acao: "get"    { slug, org }              -> pesquisa publicada + perguntas
//  - acao: "enviar" { slug, org, respostas }   -> grava em pesquisa_respostas
// Só aceita pesquisas com status = 'publicada'.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Resolve o org_id pelo slug da organização (sem exigir login).
async function resolveOrgId(supabase: any, orgSlug: string | null): Promise<string | null> {
  if (!orgSlug) return null;
  const { data } = await supabase.from("organizations").select("id").eq("slug", orgSlug).maybeSingle();
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "método não suportado" }, 405);

  try {
    const supabase = svc();
    const body = await req.json().catch(() => ({}));
    const acao = body?.acao as string | undefined;
    const slug = body?.slug as string | undefined;
    const orgSlug = (body?.org as string | undefined) || req.headers.get("x-org-slug");

    if (!slug) return json({ error: "slug ausente" }, 400);
    const orgId = await resolveOrgId(supabase, orgSlug);
    if (!orgId) return json({ error: "org não encontrada" }, 404);

    const { data: pesquisa } = await supabase
      .from("pesquisas")
      .select("id, titulo, descricao, status")
      .eq("org_id", orgId)
      .eq("slug", slug)
      .maybeSingle();
    if (!pesquisa || pesquisa.status !== "publicada") return json({ error: "pesquisa não disponível" }, 404);

    if (acao === "get") {
      const { data: perguntas } = await supabase
        .from("pesquisa_perguntas")
        .select("id, ordem, titulo, descricao, tipo, obrigatoria, opcoes, logica")
        .eq("pesquisa_id", pesquisa.id)
        .order("ordem", { ascending: true });
      return json({
        pesquisa: { id: pesquisa.id, titulo: pesquisa.titulo, descricao: pesquisa.descricao },
        perguntas: perguntas || [],
      });
    }

    if (acao === "enviar") {
      const { error } = await supabase.from("pesquisa_respostas").insert({
        org_id: orgId,
        pesquisa_id: pesquisa.id,
        respostas: body?.respostas ?? {},
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
