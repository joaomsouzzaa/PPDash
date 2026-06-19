import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Gerenciador de campanhas do Meta (escrita real na Graph API v21.0).
// Espelha o Gerenciador de Anúncios: lista (snapshot em meta_campanhas),
// cria/duplica campanhas e edita orçamento/status. Token vem de meta_config (por org).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
};

const GRAPH = "https://graph.facebook.com/v21.0";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Resolve a org: via JWT do usuário logado, ou via body.org_id (chamadas server-side).
async function getOrgId(supabase: any, req: Request, body: any): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (token) {
    const { data: u } = await supabase.auth.getUser(token);
    if (u?.user) {
      const { data: p } = await supabase.from("profiles").select("org_id").eq("id", u.user.id).maybeSingle();
      if (p?.org_id) return p.org_id as string;
    }
  }
  return body?.org_id ?? null;
}

async function getMetaCfg(supabase: any, orgId: string): Promise<{ token: string; account: string }> {
  const { data } = await supabase
    .from("meta_config").select("access_token,account_id,token_expires_at").eq("org_id", orgId).maybeSingle();
  if (!data?.access_token) throw new Error("Meta não conectado. Conecte na tela de Integrações.");
  if (data.token_expires_at && Date.now() >= Number(data.token_expires_at)) {
    throw new Error("Token do Meta expirado. Reconecte na tela de Integrações.");
  }
  return { token: data.access_token as string, account: (data.account_id as string) || "" };
}

// Garante o prefixo act_ no id da conta.
function actId(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`;
}

// Chamada à Graph API. method GET usa querystring; POST usa form-urlencoded.
async function graph(
  token: string, path: string, params: Record<string, any> = {}, method: "GET" | "POST" | "DELETE" = "GET",
): Promise<any> {
  const url = new URL(`${GRAPH}${path}`);
  const init: RequestInit = { method };
  if (method === "GET" || method === "DELETE") {
    url.searchParams.set("access_token", token);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
  } else {
    const form = new URLSearchParams();
    form.set("access_token", token);
    for (const [k, v] of Object.entries(params)) {
      form.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    init.body = form;
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }
  const r = await fetch(url.toString(), init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = j?.error || {};
    const msg = e.error_user_msg || e.message || `Graph API ${r.status}`;
    throw new Error(msg);
  }
  return j;
}

// Busca TODAS as páginas (segue cursor `after`).
async function graphAll(token: string, path: string, params: Record<string, any> = {}, maxPages = 25): Promise<any[]> {
  const out: any[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const p = { ...params, limit: params.limit ?? 200 };
    if (after) p.after = after;
    const res = await graph(token, path, p);
    out.push(...(res.data || []));
    if (res.paging?.next && res.paging?.cursors?.after) after = res.paging.cursors.after;
    else break;
  }
  return out;
}

const num = (v: any) => (v == null || v === "" ? null : parseFloat(v) / 100); // budgets vêm em centavos

// Lê toda a estrutura da conta e grava o snapshot em meta_campanhas.
async function listCampaigns(supabase: any, orgId: string, token: string, account: string) {
  const acc = actId(account);
  const [campaigns, adsets, ads] = await Promise.all([
    graphAll(token, `/${acc}/campaigns`, { fields: "id,name,objective,status,daily_budget,lifetime_budget,effective_status" }),
    graphAll(token, `/${acc}/adsets`, { fields: "id,name,status,daily_budget,lifetime_budget,campaign_id,optimization_goal,effective_status" }),
    graphAll(token, `/${acc}/ads`, { fields: "id,name,status,adset_id,creative{id,thumbnail_url,image_url},effective_status" }),
  ]);

  const adsByAdset = new Map<string, any[]>();
  for (const a of ads) {
    const arr = adsByAdset.get(a.adset_id) || [];
    arr.push({ id: a.id, name: a.name, status: a.status, effective_status: a.effective_status,
      thumbnail: a.creative?.thumbnail_url || a.creative?.image_url || null });
    adsByAdset.set(a.adset_id, arr);
  }
  const adsetsByCampaign = new Map<string, any[]>();
  for (const s of adsets) {
    const arr = adsetsByCampaign.get(s.campaign_id) || [];
    arr.push({ id: s.id, name: s.name, status: s.status, effective_status: s.effective_status,
      daily_budget: num(s.daily_budget), lifetime_budget: num(s.lifetime_budget),
      optimization_goal: s.optimization_goal, ads: adsByAdset.get(s.id) || [] });
    adsetsByCampaign.set(s.campaign_id, arr);
  }

  const tree = campaigns.map((c) => ({
    id: c.id, name: c.name, objetivo: c.objective, status: c.status, effective_status: c.effective_status,
    daily_budget: num(c.daily_budget), lifetime_budget: num(c.lifetime_budget),
    adsets: adsetsByCampaign.get(c.id) || [],
  }));

  // Upsert do snapshot (espelho).
  const now = new Date().toISOString();
  for (const c of tree) {
    await supabase.from("meta_campanhas").upsert({
      org_id: orgId, account_id: acc, meta_campaign_id: c.id, nome: c.name, objetivo: c.objetivo,
      status: c.status, daily_budget: c.daily_budget, lifetime_budget: c.lifetime_budget,
      estrutura: { adsets: c.adsets }, last_synced_at: now, updated_at: now,
    }, { onConflict: "org_id,meta_campaign_id" });
  }
  return tree;
}

// Edita status / orçamento / nome de campaign | adset | ad e reflete no snapshot.
async function updateEntity(supabase: any, orgId: string, token: string, body: any) {
  const { entity_id, nivel, status, daily_budget, lifetime_budget, name } = body;
  if (!entity_id) throw new Error("entity_id é obrigatório");
  const params: Record<string, any> = {};
  if (status) params.status = status;                                   // ACTIVE | PAUSED
  if (name) params.name = name;
  if (daily_budget != null) params.daily_budget = Math.round(Number(daily_budget) * 100);
  if (lifetime_budget != null) params.lifetime_budget = Math.round(Number(lifetime_budget) * 100);
  if (Object.keys(params).length === 0) throw new Error("Nada para atualizar");
  await graph(token, `/${entity_id}`, params, "POST");

  // Atualiza o snapshot quando a edição é no nível de campanha.
  if (nivel === "campaign") {
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    if (name) patch.nome = name;
    if (daily_budget != null) patch.daily_budget = Number(daily_budget);
    if (lifetime_budget != null) patch.lifetime_budget = Number(lifetime_budget);
    await supabase.from("meta_campanhas").update(patch).eq("org_id", orgId).eq("meta_campaign_id", entity_id);
  }
  return { ok: true };
}

// Duplica uma campanha existente (campanha + adsets + ads) como base para a nova.
// Usa a Graph API de cópia profunda (/{id}/copies), que herda toda a config.
async function duplicateCampaign(token: string, account: string, body: any) {
  const { source_campaign_id, novo_nome, status_inicial } = body;
  if (!source_campaign_id) throw new Error("source_campaign_id é obrigatório");
  const res = await graph(token, `/${source_campaign_id}/copies`, {
    deep_copy: true,
    status_option: status_inicial === "ACTIVE" ? "INHERITED_FROM_SOURCE" : "PAUSED",
    rename_options: novo_nome ? { rename_strategy: "DEEP_RENAME", rename_suffix: "" } : undefined,
  }, "POST");
  const newId = res.copied_campaign_id || res.id;
  if (novo_nome && newId) {
    try { await graph(token, `/${newId}`, { name: novo_nome }, "POST"); } catch { /* nome opcional */ }
  }
  return { ok: true, campaign_id: newId };
}

// Cria uma campanha do zero (campanha → adset → creative(s) → ad(s)).
// Espera um payload já validado pelo wizard/agente.
async function createCampaign(supabase: any, orgId: string, token: string, account: string, body: any) {
  const acc = actId(account);
  const {
    nome, objetivo, special_ad_categories = [], status_inicial = "PAUSED",
    adset, creatives = [],
  } = body;
  if (!nome || !objetivo) throw new Error("nome e objetivo são obrigatórios");

  // 1. Campanha
  const camp = await graph(token, `/${acc}/campaigns`, {
    name: nome, objective: objetivo, status: status_inicial,
    special_ad_categories, ...(body.daily_budget ? { daily_budget: Math.round(Number(body.daily_budget) * 100) } : {}),
  }, "POST");
  const campaignId = camp.id;

  // 2. Conjunto de anúncios
  if (!adset) return { ok: true, campaign_id: campaignId };
  const adsetParams: Record<string, any> = {
    name: adset.nome || `${nome} - Conjunto 1`,
    campaign_id: campaignId,
    status: status_inicial,
    billing_event: adset.billing_event || "IMPRESSIONS",
    optimization_goal: adset.optimization_goal || "LINK_CLICKS",
    targeting: adset.targeting || { geo_locations: { countries: ["BR"] } },
  };
  if (adset.daily_budget) adsetParams.daily_budget = Math.round(Number(adset.daily_budget) * 100);
  if (adset.start_time) adsetParams.start_time = adset.start_time;
  if (adset.end_time) adsetParams.end_time = adset.end_time;
  if (adset.bid_amount) adsetParams.bid_amount = Math.round(Number(adset.bid_amount) * 100);
  if (adset.promoted_object) adsetParams.promoted_object = adset.promoted_object;
  const adsetRes = await graph(token, `/${acc}/adsets`, adsetParams, "POST");
  const adsetId = adsetRes.id;

  // 3. Criativos (a partir do Drive) + anúncios
  const adIds: string[] = [];
  for (const cr of creatives) {
    const creativeId = await createCreativeFromDrive(supabase, orgId, token, acc, cr);
    const adRes = await graph(token, `/${acc}/ads`, {
      name: cr.ad_name || cr.file_name || "Anúncio",
      adset_id: adsetId, creative: { creative_id: creativeId }, status: status_inicial,
    }, "POST");
    adIds.push(adRes.id);
  }
  return { ok: true, campaign_id: campaignId, adset_id: adsetId, ad_ids: adIds };
}

// Baixa um criativo do Drive (via google-sheets), faz upload ao Meta e cria o adcreative.
async function createCreativeFromDrive(
  supabase: any, orgId: string, token: string, acc: string, cr: any,
): Promise<string> {
  const { file_id, file_name, mime, page_id, instagram_actor_id, message, link, call_to_action } = cr;
  if (!file_id) throw new Error("file_id do criativo é obrigatório");
  if (!page_id) throw new Error("page_id (página do Facebook) é obrigatório para o criativo");

  // Baixa bytes do Drive via a edge function google-sheets (server-to-server).
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const dl = await fetch(`${supabaseUrl}/functions/v1/google-sheets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! },
    body: JSON.stringify({ action: "download_drive_file", file_id, org_id: orgId }),
  });
  const dlj = await dl.json();
  if (!dl.ok) throw new Error(dlj.error || "Falha ao baixar criativo do Drive");
  const fileMime: string = mime || dlj.mime || "";
  const isVideo = fileMime.startsWith("video/");

  // Converte base64 -> bytes p/ upload binário ao Meta.
  const bin = atob(dlj.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const objectStorySpec: any = { page_id };
  if (instagram_actor_id) objectStorySpec.instagram_actor_id = instagram_actor_id;

  if (isVideo) {
    // Upload de vídeo
    const fd = new FormData();
    fd.set("access_token", token);
    fd.set("source", new Blob([bytes], { type: fileMime }), file_name || "video.mp4");
    const vr = await fetch(`${GRAPH}/${acc}/advideos`, { method: "POST", body: fd });
    const vj = await vr.json();
    if (!vr.ok) throw new Error(vj?.error?.message || "Falha ao subir vídeo ao Meta");
    objectStorySpec.video_data = {
      video_id: vj.id,
      message: message || "",
      ...(link ? { call_to_action: { type: call_to_action || "LEARN_MORE", value: { link } } } : {}),
    };
  } else {
    // Upload de imagem
    const fd = new FormData();
    fd.set("access_token", token);
    fd.set("filename", new Blob([bytes], { type: fileMime }), file_name || "image.jpg");
    const ir = await fetch(`${GRAPH}/${acc}/adimages`, { method: "POST", body: fd });
    const ij = await ir.json();
    if (!ir.ok) throw new Error(ij?.error?.message || "Falha ao subir imagem ao Meta");
    const imageHash = ij.images?.[Object.keys(ij.images)[0]]?.hash;
    objectStorySpec.link_data = {
      message: message || "", link: link || "https://facebook.com", image_hash: imageHash,
      ...(call_to_action ? { call_to_action: { type: call_to_action, value: { link: link || "https://facebook.com" } } } : {}),
    };
  }

  const creative = await graph(token, `/${acc}/adcreatives`, {
    name: file_name || "Criativo", object_story_spec: objectStorySpec,
  }, "POST");
  return creative.id;
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

    const { token, account: defaultAccount } = await getMetaCfg(supabase, orgId);
    const account = body.account_id || defaultAccount;
    if (!account && action !== "list_source_campaigns") {
      return json({ error: "Nenhuma conta de anúncio selecionada" }, 400);
    }

    if (action === "list_campaigns") {
      return json({ campaigns: await listCampaigns(supabase, orgId, token, account) });
    }
    if (action === "list_source_campaigns") {
      const acc = actId(account);
      const camps = await graphAll(token, `/${acc}/campaigns`, { fields: "id,name,objective,status" });
      return json({ campaigns: camps });
    }
    if (action === "duplicate_campaign") {
      return json(await duplicateCampaign(token, account, body));
    }
    if (action === "create_campaign") {
      return json(await createCampaign(supabase, orgId, token, account, body));
    }
    if (action === "update_entity") {
      return json(await updateEntity(supabase, orgId, token, body));
    }

    return json({ error: "ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 400);
  }
});
