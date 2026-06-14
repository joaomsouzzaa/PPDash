import { supabase } from "@/integrations/supabase/client";

export interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
}

// Sincroniza (silenciosamente) o token do Meta do navegador para o servidor,
// para os resumos agendados de WhatsApp calcularem CAC/investimento/projeção.
// Só grava quando o token muda — sem chamadas à toa.
export async function syncMetaTokenToServer(): Promise<void> {
  try {
    const token = localStorage.getItem("meta_access_token");
    if (!token) return;
    const acc = localStorage.getItem("selected_ad_account");
    // conta específica selecionada; se "all"/nenhuma, usa a 1ª conta disponível
    let account_id: string | null = acc && acc !== "all" ? acc : null;
    if (!account_id) {
      try { account_id = (await fetchAdAccounts())[0]?.id ?? null; } catch { account_id = null; }
    }
    const expires = localStorage.getItem("meta_token_expires_at");
    const user_name = localStorage.getItem("meta_user_name");
    const payload: any = { access_token: token };
    if (account_id) payload.account_id = account_id;
    if (expires) payload.token_expires_at = Number(expires);
    if (user_name) payload.user_name = user_name;
    const { data: existing } = await (supabase as any)
      .from("meta_config").select("id,access_token").maybeSingle();
    if (existing?.id && existing.access_token === token) return; // já está atualizado
    if (existing?.id) {
      await (supabase as any).from("meta_config").update(payload).eq("id", existing.id);
    } else {
      await (supabase as any).from("meta_config").insert(payload);
    }
  } catch {
    /* silencioso — não atrapalha o dashboard */
  }
}

// Carrega o token do Meta salvo no banco para o navegador atual, para a conexão
// valer em qualquer dispositivo (não só onde foi conectado). Retorna true se hidratou.
export async function hydrateMetaTokenFromServer(): Promise<boolean> {
  try {
    // Já tem token válido localmente? Não precisa.
    if (localStorage.getItem("meta_access_token") && isTokenValid()) return false;
    const { data } = await (supabase as any)
      .from("meta_config").select("access_token,account_id,token_expires_at,user_name,contas").maybeSingle();
    if (!data?.access_token) return false;
    // Token do banco expirado? Não hidrata (precisa reconectar de verdade).
    if (data.token_expires_at && Date.now() >= Number(data.token_expires_at)) return false;
    localStorage.setItem("meta_access_token", data.access_token);
    localStorage.setItem("meta_connected", "true");
    if (data.token_expires_at) localStorage.setItem("meta_token_expires_at", String(data.token_expires_at));
    if (data.account_id) localStorage.setItem("selected_ad_account", data.account_id);
    if (data.user_name) localStorage.setItem("meta_user_name", data.user_name);
    if (Array.isArray(data.contas)) localStorage.setItem("meta_contas", JSON.stringify(data.contas));
    localStorage.removeItem("meta_token_expired");
    return true;
  } catch {
    return false;
  }
}

export interface AdSpendResult {
  accountId: string;
  accountName: string;
  spend: number;
}

function getAccessToken(): string | null {
  return localStorage.getItem("meta_access_token");
}

/** Returns true if the stored token is still valid (not expired). */
export function isTokenValid(): boolean {
  const expiresAt = localStorage.getItem("meta_token_expires_at");
  if (!expiresAt) return false;
  return Date.now() < Number(expiresAt);
}

/** Mark token as expired but keep the connection status. */
export function markTokenExpired() {
  localStorage.setItem("meta_token_expired", "true");
  localStorage.removeItem("meta_access_token");
  localStorage.removeItem("meta_token_expires_at");
}

/** Check if the token has been flagged as expired. */
export function isTokenExpired(): boolean {
  return localStorage.getItem("meta_token_expired") === "true";
}

/** Clear the expired flag (after successful reconnection). */
export function clearTokenExpired() {
  localStorage.removeItem("meta_token_expired");
}

// Global rate-limit cooldown: block ALL Meta API calls for 5 min after a rate-limit error
let _rateLimitedUntil = 0;
const RATE_LIMIT_COOLDOWN = 5 * 60 * 1000; // 5 minutes

export function isGloballyRateLimited(): boolean {
  return Date.now() < _rateLimitedUntil;
}

function flagRateLimited() {
  _rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN;
}

export function clearRateLimitFlag() {
  _rateLimitedUntil = 0;
}

async function graphApiFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) return Promise.reject(new Error("Meta não conectado"));

  // Block calls during cooldown to avoid deepening the rate limit
  if (isGloballyRateLimited()) {
    return Promise.reject(new Error("rate limit cooldown"));
  }

  const url = new URL(`https://graph.facebook.com/v21.0${path}`);
  url.searchParams.set("access_token", token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errMsg = err?.error?.message || `Graph API error ${res.status}`;
    const errCode = err?.error?.code;
    if (errCode === 190 || res.status === 401) {
      markTokenExpired();
    }
    // Detect rate limiting and activate global cooldown
    // (code 17 = "User request limit reached", 4/32 = app/account limits)
    if (errCode === 32 || errCode === 4 || errCode === 17 || res.status === 429 ||
        errMsg.toLowerCase().includes("too many calls") ||
        errMsg.toLowerCase().includes("request limit") ||
        errMsg.toLowerCase().includes("rate limit")) {
      console.warn("[Meta API] Rate limited — activating 5min cooldown");
      flagRateLimited();
    }
    throw new Error(errMsg);
  }
  return res.json();
}

/** Busca TODAS as páginas de um endpoint de lista (segue o cursor `after`),
 *  agregando `data`. Necessário p/ breakdowns combinados que estouram o limit
 *  (ex.: publisher_platform,platform_position) e ficavam subcontados. */
async function graphApiFetchAll(path: string, params: Record<string, string> = {}, maxPages = 25): Promise<any[]> {
  const out: any[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const p = { ...params };
    if (after) p.after = after;
    const res = await graphApiFetch<{ data: any[]; paging?: { next?: string; cursors?: { after?: string } } }>(path, p);
    out.push(...(res.data || []));
    if (res.paging?.next && res.paging?.cursors?.after) after = res.paging.cursors.after;
    else break;
  }
  return out;
}

/** Exchange a short-lived token for a long-lived one via the backend. */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${supabaseUrl}/functions/v1/exchange-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ short_lived_token: shortLivedToken }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Falha ao trocar token");
  }

  return res.json();
}
// In-memory cache for ad accounts (5 min TTL)
let _adAccountsCache: { data: AdAccount[]; ts: number } | null = null;
const AD_ACCOUNTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Busca TODAS as contas que o perfil acessa (sem filtro) — para a tela de seleção.
export async function fetchTodasAdAccounts(): Promise<AdAccount[]> {
  const res = await graphApiFetch<{ data: AdAccount[] }>("/me/adaccounts", {
    fields: "name,account_id,currency",
    limit: "200",
  });
  return res.data || [];
}

// Contas escolhidas pelo cliente (filtro do dashboard). Vazio = todas.
export function getContasSelecionadas(): string[] {
  try { return JSON.parse(localStorage.getItem("meta_contas") || "[]"); } catch { return []; }
}

export async function setContasSelecionadas(ids: string[]): Promise<void> {
  localStorage.setItem("meta_contas", JSON.stringify(ids));
  clearAdAccountsCache();
  try {
    const { data: existing } = await (supabase as any).from("meta_config").select("id").maybeSingle();
    if (existing?.id) await (supabase as any).from("meta_config").update({ contas: ids }).eq("id", existing.id);
    else await (supabase as any).from("meta_config").insert({ contas: ids });
  } catch { /* silencioso */ }
}

export async function fetchAdAccounts(skipCache = false): Promise<AdAccount[]> {
  if (!skipCache && _adAccountsCache && Date.now() - _adAccountsCache.ts < AD_ACCOUNTS_CACHE_TTL) {
    return _adAccountsCache.data;
  }
  const todas = await fetchTodasAdAccounts();
  // Mostra apenas as contas selecionadas pelo cliente (se houver seleção).
  const sel = getContasSelecionadas();
  const accounts = sel.length ? todas.filter((a) => sel.includes(a.account_id)) : todas;
  _adAccountsCache = { data: accounts, ts: Date.now() };
  return accounts;
}

export function clearAdAccountsCache() {
  _adAccountsCache = null;
}

function buildTimeRange(dateRange: string): { since: string; until: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const until = fmt(now);

  switch (dateRange) {
    case "today":
      return { since: until, until };
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { since: fmt(y), until: fmt(y) };
    }
    case "7d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { since: fmt(s), until };
    }
    case "14d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 13);
      return { since: fmt(s), until };
    }
    case "30d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      return { since: fmt(s), until };
    }
    case "90d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 89);
      return { since: fmt(s), until };
    }
    case "lifetime":
      return { since: "2020-01-01", until };
    case "this_month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: fmt(s), until };
    }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { since: fmt(s), until: fmt(e) };
    }
    default: {
      const s = new Date(now);
      s.setDate(s.getDate() - 30);
      return { since: fmt(s), until };
    }
  }
}

// A API do Meta limita insights a ~37 meses. Garante que o "since" não seja
// mais antigo que isso (ex.: período "vitalício", que começa em 2020/2000),
// senão a chamada falha e o investimento volta zerado.
const META_MAX_MONTHS = 37;
function clampTimeRange(range: { since: string; until: string }): { since: string; until: string } {
  const until = new Date(range.until + "T00:00:00Z");
  const minSince = new Date(until);
  minSince.setUTCMonth(minSince.getUTCMonth() - META_MAX_MONTHS);
  const since = new Date(range.since + "T00:00:00Z");
  if (since < minSince) {
    return { since: minSince.toISOString().split("T")[0], until: range.until };
  }
  return range;
}

// Suporta múltiplos slugs por cidade separados por vírgula (ex.: "Porto Alegre, POA").
// A correspondência é case-insensitive e basta UM dos termos aparecer no nome da campanha.
function slugVariants(slug?: string): string[] {
  return (slug || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// Termos de campanhas que NÃO são de venda de ingresso (lead-gen). Aplicado apenas
// quando strictSales=true (dashboards de evento WS / Resumo City), nunca no Inside Sales.
const SALES_EXCLUDE_TERMS = ["lead", "meteorico"];
function stripAccentsLower(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function campaignMatchesSlug(name: string, variants: string[], strictSales = false): boolean {
  const n = (name || "").toLowerCase();
  if (!variants.some((v) => n.includes(v))) return false;
  if (strictSales) {
    const na = stripAccentsLower(name);
    if (SALES_EXCLUDE_TERMS.some((t) => na.includes(t))) return false;
  }
  return true;
}

// Cache for spend results (10 min TTL — matches dashboard refresh)
const _spendCache = new Map<string, { data: any; ts: number }>();
const SPEND_CACHE_TTL = 10 * 60 * 1000;

// Persistência da última leitura boa no localStorage, para usar como fallback
// quando a API estourar o limite (evita zerar investimento/orçamento/projeção).
function persistResult(key: string, value: unknown) {
  try {
    localStorage.setItem("meta_cache_" + key, JSON.stringify({ v: value, ts: Date.now() }));
  } catch { /* storage cheio/indisponível — ignora */ }
}
function loadPersisted<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem("meta_cache_" + key);
    if (!raw) return null;
    return (JSON.parse(raw).v as T) ?? null;
  } catch {
    return null;
  }
}

function spendCacheKey(ids: string[], dateRange: string, start?: Date, end?: Date, slug?: string) {
  return `${ids.sort().join(",")}_${dateRange}_${start?.toISOString() || ""}_${end?.toISOString() || ""}_${slug || ""}`;
}

// Lista os nomes das campanhas das contas informadas (todas as campanhas,
// independente de gasto). Usado para popular o seletor de UTM Campaign no
// cadastro de canais de aquisição.
export async function fetchCampaignNames(accountIds: string[]): Promise<string[]> {
  const names = new Set<string>();
  for (const id of accountIds) {
    try {
      const rows = await graphApiFetchAll(`/${id}/campaigns`, { fields: "name", limit: "500" });
      for (const r of rows) if (r?.name) names.add(r.name as string);
    } catch { /* sem conexão / rate limit — ignora */ }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function fetchAdSpend(
  accountIds: string[],
  dateRange: string,
  startDate?: Date,
  endDate?: Date,
  campaignSlug?: string,
  strictSales = false
): Promise<AdSpendResult[]> {
  const cacheKey = "spend_" + spendCacheKey(accountIds, dateRange, startDate, endDate, campaignSlug) + "_" + strictSales;
  const cached = _spendCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SPEND_CACHE_TTL) return cached.data;
  const timeRange = clampTimeRange(startDate && endDate
    ? { since: startDate.toISOString().split("T")[0], until: endDate.toISOString().split("T")[0] }
    : buildTimeRange(dateRange));
  const timeRangeParam = JSON.stringify(timeRange);

  try {
    const results = await Promise.all(
      accountIds.map(async (id) => {
        if (campaignSlug) {
          // UMA chamada por conta: insights no nível de campanha; filtra por nome (multi-slug)
          const variants = slugVariants(campaignSlug);
          const res = await graphApiFetch<{ data: Array<{ spend: string; campaign_name: string }> }>(
            `/${id}/insights`,
            { level: "campaign", fields: "spend,campaign_name", time_range: timeRangeParam, limit: "500" }
          );
          let totalSpend = 0;
          for (const row of res.data || []) {
            if (campaignMatchesSlug(row.campaign_name, variants, strictSales)) {
              totalSpend += parseFloat(row.spend) || 0;
            }
          }
          return { accountId: id, accountName: "", spend: totalSpend };
        } else {
          const res = await graphApiFetch<{ data: Array<{ spend: string }> }>(
            `/${id}/insights`,
            { fields: "spend", time_range: timeRangeParam }
          );
          const spend = res.data?.[0]?.spend ? parseFloat(res.data[0].spend) : 0;
          return { accountId: id, accountName: "", spend };
        }
      })
    );

    _spendCache.set(cacheKey, { data: results, ts: Date.now() });
    persistResult(cacheKey, results);
    return results;
  } catch (e) {
    // Estouro de limite / erro de rede: usa a última leitura boa em vez de zerar
    const fb = loadPersisted<AdSpendResult[]>(cacheKey);
    if (fb) {
      console.warn("[Meta API] fetchAdSpend via fallback (última leitura salva)");
      return fb;
    }
    throw e;
  }
}

/** Fetch daily spend breakdown (date → spend) for accounts, optionally filtered by campaign slug */
export async function fetchDailySpendBreakdown(
  accountIds: string[],
  dateRange: string,
  startDate?: Date,
  endDate?: Date,
  campaignSlug?: string,
  strictSales = false
): Promise<Map<string, number>> {
  const cacheKey = "daily_" + spendCacheKey(accountIds, dateRange, startDate, endDate, campaignSlug) + "_" + strictSales;
  const cached = _spendCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SPEND_CACHE_TTL) return cached.data;
  const timeRange = clampTimeRange(startDate && endDate
    ? { since: startDate.toISOString().split("T")[0], until: endDate.toISOString().split("T")[0] }
    : buildTimeRange(dateRange));
  const timeRangeParam = JSON.stringify(timeRange);

  try {
    const dailyMap = new Map<string, number>();
    const variants = campaignSlug ? slugVariants(campaignSlug) : [];

    await Promise.all(
      accountIds.map(async (id) => {
        // UMA chamada por conta: insights diários no nível de campanha
        // Pagina (segue cursor): dias × campanhas pode passar de 500 e cortava os dias recentes.
        const rows = await graphApiFetchAll(
          `/${id}/insights`,
          campaignSlug
            ? { level: "campaign", fields: "spend,campaign_name", time_range: timeRangeParam, time_increment: "1", limit: "500" }
            : { fields: "spend", time_range: timeRangeParam, time_increment: "1", limit: "500" }
        );
        for (const row of rows as Array<{ spend: string; date_start: string; campaign_name?: string }>) {
          if (campaignSlug && !campaignMatchesSlug(row.campaign_name || "", variants, strictSales)) continue;
          const spend = parseFloat(row.spend) || 0;
          dailyMap.set(row.date_start, (dailyMap.get(row.date_start) || 0) + spend);
        }
      })
    );

    _spendCache.set(cacheKey, { data: dailyMap, ts: Date.now() });
    persistResult(cacheKey, Array.from(dailyMap.entries()));
    return dailyMap;
  } catch (e) {
    const fb = loadPersisted<Array<[string, number]>>(cacheKey);
    if (fb) {
      console.warn("[Meta API] fetchDailySpendBreakdown via fallback (última leitura salva)");
      return new Map(fb);
    }
    throw e;
  }
}

export interface AccountInsights {
  spend: number; impressions: number; clicks: number; linkClicks: number;
  reach: number; pageViews: number; checkouts: number; purchases: number;
  cpm: number; ctr: number; cpc: number; connectRate: number; costPerPageView: number;
  convLP: number; convCheckout: number; cac: number;
  // Engajamento
  dms: number; saves: number; reactions: number; comments: number; videoViews: number;
}

function sumAction(actions: Array<{ action_type: string; value: string }> | undefined, types: string[]): number {
  if (!actions) return 0;
  let t = 0;
  for (const a of actions) if (types.includes(a.action_type)) t += parseFloat(a.value) || 0;
  return t;
}

// Para eventos que o Meta reporta em MÚLTIPLOS aliases (ex.: purchase / omni_purchase /
// offsite_conversion.fb_pixel_purchase = a MESMA compra). Pega só o 1º presente na ordem
// de prioridade — evita contar a mesma venda 2-3x.
function pickAction(actions: Array<{ action_type: string; value: string }> | undefined, typesByPriority: string[]): number {
  if (!actions) return 0;
  for (const t of typesByPriority) {
    const found = actions.find((a) => a.action_type === t);
    if (found) return parseFloat(found.value) || 0;
  }
  return 0;
}

/** KPIs agregados da conta (Resumo Executivo da Performance). Filtra por cidade (slug) se informado. */
export async function fetchAccountInsights(
  accountIds: string[], startDate?: Date, endDate?: Date, dateRange = "30d", campaignSlug?: string, strictSales = false
): Promise<AccountInsights> {
  const timeRange = clampTimeRange(startDate && endDate
    ? { since: startDate.toISOString().split("T")[0], until: endDate.toISOString().split("T")[0] }
    : buildTimeRange(dateRange));
  const timeRangeParam = JSON.stringify(timeRange);
  const agg = { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, reach: 0, pageViews: 0, checkouts: 0, purchases: 0, dms: 0, saves: 0, reactions: 0, comments: 0, videoViews: 0 };
  const variants = campaignSlug ? slugVariants(campaignSlug) : [];
  const acc = (r: any) => {
    agg.spend += parseFloat(r.spend) || 0;
    agg.impressions += parseInt(r.impressions) || 0;
    agg.clicks += parseInt(r.clicks) || 0;
    agg.linkClicks += parseInt(r.inline_link_clicks) || 0;
    agg.reach += parseInt(r.reach) || 0;
    agg.pageViews += sumAction(r.actions, ["landing_page_view"]);
    agg.checkouts += pickAction(r.actions, ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"]);
    agg.purchases += pickAction(r.actions, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);
    agg.dms += pickAction(r.actions, ["onsite_conversion.messaging_conversation_started_7d", "messaging_conversation_started_7d"]);
    agg.saves += pickAction(r.actions, ["onsite_conversion.post_save", "post_save"]);
    agg.reactions += sumAction(r.actions, ["post_reaction"]);
    agg.comments += sumAction(r.actions, ["comment"]);
    agg.videoViews += sumAction(r.actions, ["video_view"]);
  };
  await Promise.all(accountIds.map(async (id) => {
    if (campaignSlug) {
      const res = await graphApiFetch<{ data: Array<any> }>(`/${id}/insights`, {
        level: "campaign", fields: "campaign_name,spend,impressions,clicks,inline_link_clicks,reach,actions",
        time_range: timeRangeParam, limit: "500",
      });
      for (const r of res.data || []) if (campaignMatchesSlug(r.campaign_name, variants, strictSales)) acc(r);
    } else {
      const res = await graphApiFetch<{ data: Array<any> }>(`/${id}/insights`, {
        fields: "spend,impressions,clicks,inline_link_clicks,reach,actions", time_range: timeRangeParam,
      });
      if (res.data?.[0]) acc(res.data[0]);
    }
  }));
  return {
    ...agg,
    cpm: agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0,
    ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
    cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
    connectRate: agg.linkClicks > 0 ? (agg.pageViews / agg.linkClicks) * 100 : 0,
    costPerPageView: agg.pageViews > 0 ? agg.spend / agg.pageViews : 0,
    convLP: agg.pageViews > 0 ? (agg.checkouts / agg.pageViews) * 100 : 0,
    convCheckout: agg.checkouts > 0 ? (agg.purchases / agg.checkouts) * 100 : 0,
    cac: agg.purchases > 0 ? agg.spend / agg.purchases : 0,
  };
}

/** Série diária (data → gasto/impressões/cliques) para o gráfico da Performance. Filtra por cidade (slug) se informado. */
export async function fetchDailyMetrics(
  accountIds: string[], startDate?: Date, endDate?: Date, dateRange = "30d", campaignSlug?: string, strictSales = false
): Promise<Array<{ date: string; spend: number; impressions: number; clicks: number }>> {
  const timeRange = clampTimeRange(startDate && endDate
    ? { since: startDate.toISOString().split("T")[0], until: endDate.toISOString().split("T")[0] }
    : buildTimeRange(dateRange));
  const timeRangeParam = JSON.stringify(timeRange);
  const variants = campaignSlug ? slugVariants(campaignSlug) : [];
  const map = new Map<string, { spend: number; impressions: number; clicks: number }>();
  await Promise.all(accountIds.map(async (id) => {
    const rows = await graphApiFetchAll(`/${id}/insights`,
      campaignSlug
        ? { level: "campaign", fields: "campaign_name,spend,impressions,clicks", time_range: timeRangeParam, time_increment: "1", limit: "500" }
        : { fields: "spend,impressions,clicks", time_range: timeRangeParam, time_increment: "1", limit: "500" });
    for (const row of rows) {
      if (campaignSlug && !campaignMatchesSlug(row.campaign_name || "", variants, strictSales)) continue;
      const d = row.date_start;
      const cur = map.get(d) || { spend: 0, impressions: 0, clicks: 0 };
      cur.spend += parseFloat(row.spend) || 0;
      cur.impressions += parseInt(row.impressions) || 0;
      cur.clicks += parseInt(row.clicks) || 0;
      map.set(d, cur);
    }
  }));
  return Array.from(map.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface CampaignRow {
  id: string; name: string; spend: number; reach: number; impressions: number;
  clicks: number; ctr: number; cpc: number; frequency: number;
  views: number; reactions: number; saves: number; comments: number;
  // Funil de conversão
  linkClicks: number; cpm: number; pageViews: number; checkouts: number; purchases: number;
  connectRate: number; costPerPageView: number; convLP: number; cac: number;
}
export interface AdSetRow {
  campaign: string; name: string; spend: number; reach: number; impressions: number; clicks: number; ctr: number; cpc: number; frequency: number;
  linkClicks: number; cpm: number; pageViews: number; checkouts: number; purchases: number;
  connectRate: number; costPerPageView: number; convLP: number; cac: number;
}
export interface AdRow {
  name: string; campaign: string; spend: number; impressions: number; clicks: number; ctr: number;
  purchases: number; cac: number;
  adId?: string; thumbnail?: string;
}

// Thumbnail do criativo do anúncio (imagem do estático ou preview do vídeo).
async function fetchAdThumbnail(adId: string): Promise<string | undefined> {
  try {
    const r = await graphApiFetch<{ creative?: { image_url?: string; thumbnail_url?: string } }>(
      `/${adId}`, { fields: "creative{image_url,thumbnail_url}" });
    return r.creative?.image_url || r.creative?.thumbnail_url;
  } catch { return undefined; }
}

function rangeParam(startDate?: Date, endDate?: Date, dateRange = "30d"): string {
  return JSON.stringify(clampTimeRange(startDate && endDate
    ? { since: startDate.toISOString().split("T")[0], until: endDate.toISOString().split("T")[0] }
    : buildTimeRange(dateRange)));
}

/** Insights por CAMPANHA (cards de Performance por Campanha). */
export async function fetchCampaignBreakdown(
  accountIds: string[], startDate?: Date, endDate?: Date, dateRange = "30d", campaignSlug?: string, strictSales = false
): Promise<CampaignRow[]> {
  const time_range = rangeParam(startDate, endDate, dateRange);
  const variants = campaignSlug ? slugVariants(campaignSlug) : [];
  const rows: CampaignRow[] = [];
  await Promise.all(accountIds.map(async (id) => {
    const res = await graphApiFetch<{ data: Array<any> }>(`/${id}/insights`, {
      level: "campaign", time_range, limit: "500",
      fields: "campaign_id,campaign_name,spend,reach,impressions,clicks,ctr,cpc,frequency,inline_link_clicks,actions",
    });
    for (const r of res.data || []) {
      if (campaignSlug && !campaignMatchesSlug(r.campaign_name, variants, strictSales)) continue;
      const spend = parseFloat(r.spend) || 0;
      const impressions = parseInt(r.impressions) || 0;
      const linkClicks = parseInt(r.inline_link_clicks) || 0;
      const pageViews = sumAction(r.actions, ["landing_page_view"]);
      const checkouts = pickAction(r.actions, ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"]);
      const purchases = pickAction(r.actions, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);
      rows.push({
        id: r.campaign_id, name: r.campaign_name || "—",
        spend, reach: parseInt(r.reach) || 0, impressions,
        clicks: parseInt(r.clicks) || 0, ctr: parseFloat(r.ctr) || 0, cpc: parseFloat(r.cpc) || 0, frequency: parseFloat(r.frequency) || 0,
        views: sumAction(r.actions, ["video_view"]),
        reactions: sumAction(r.actions, ["post_reaction"]),
        saves: pickAction(r.actions, ["onsite_conversion.post_save", "post_save"]),
        comments: sumAction(r.actions, ["comment"]),
        linkClicks, cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        pageViews, checkouts, purchases,
        connectRate: linkClicks > 0 ? (pageViews / linkClicks) * 100 : 0,
        costPerPageView: pageViews > 0 ? spend / pageViews : 0,
        convLP: pageViews > 0 ? (checkouts / pageViews) * 100 : 0,
        cac: purchases > 0 ? spend / purchases : 0,
      });
    }
  }));
  return rows.sort((a, b) => b.spend - a.spend);
}

/** Insights por CONJUNTO DE ANÚNCIOS (tabela). */
export async function fetchAdSetBreakdown(
  accountIds: string[], startDate?: Date, endDate?: Date, dateRange = "30d", campaignSlug?: string, strictSales = false
): Promise<AdSetRow[]> {
  const time_range = rangeParam(startDate, endDate, dateRange);
  const variants = campaignSlug ? slugVariants(campaignSlug) : [];
  const rows: AdSetRow[] = [];
  await Promise.all(accountIds.map(async (id) => {
    const res = await graphApiFetch<{ data: Array<any> }>(`/${id}/insights`, {
      level: "adset", time_range, limit: "500",
      fields: "campaign_name,adset_name,spend,reach,impressions,clicks,ctr,cpc,frequency,inline_link_clicks,actions",
    });
    for (const r of res.data || []) {
      if (campaignSlug && !campaignMatchesSlug(r.campaign_name, variants, strictSales)) continue;
      const spend = parseFloat(r.spend) || 0;
      const impressions = parseInt(r.impressions) || 0;
      const linkClicks = parseInt(r.inline_link_clicks) || 0;
      const pageViews = sumAction(r.actions, ["landing_page_view"]);
      const checkouts = pickAction(r.actions, ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"]);
      const purchases = pickAction(r.actions, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);
      rows.push({
        campaign: r.campaign_name || "—", name: r.adset_name || "—",
        spend, reach: parseInt(r.reach) || 0, impressions, clicks: parseInt(r.clicks) || 0,
        ctr: parseFloat(r.ctr) || 0, cpc: parseFloat(r.cpc) || 0, frequency: parseFloat(r.frequency) || 0,
        linkClicks, cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        pageViews, checkouts, purchases,
        connectRate: linkClicks > 0 ? (pageViews / linkClicks) * 100 : 0,
        costPerPageView: pageViews > 0 ? spend / pageViews : 0,
        convLP: pageViews > 0 ? (checkouts / pageViews) * 100 : 0,
        cac: purchases > 0 ? spend / purchases : 0,
      });
    }
  }));
  return rows.sort((a, b) => b.spend - a.spend);
}

/** Insights por ANÚNCIO/CRIATIVO (top por gasto). */
// Nomes dos anúncios ATIVOS das contas (para vincular criativos ao investimento).
export async function fetchActiveAdNames(accountIds: string[]): Promise<string[]> {
  const names = new Set<string>();
  for (const id of accountIds) {
    try {
      const rows = await graphApiFetchAll(`/${id}/ads`, { fields: "name,effective_status", limit: "500" });
      for (const r of rows) if (r?.name && r.effective_status === "ACTIVE") names.add(r.name as string);
    } catch { /* sem conexão / rate limit */ }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

// Gasto por nome de anúncio (ad_name -> spend) no período. Usado no CAC por criativo.
export async function fetchAdSpendByName(
  accountIds: string[], startDate?: Date, endDate?: Date, dateRange = "30d"
): Promise<Record<string, number>> {
  const time_range = rangeParam(startDate, endDate, dateRange);
  const out: Record<string, number> = {};
  await Promise.all(accountIds.map(async (id) => {
    try {
      const res = await graphApiFetch<{ data: Array<{ ad_name?: string; spend?: string }> }>(`/${id}/insights`, {
        level: "ad", time_range, limit: "500", fields: "ad_name,spend",
      });
      for (const r of res.data || []) {
        const n = (r.ad_name || "").trim();
        if (!n) continue;
        out[n] = (out[n] || 0) + (parseFloat(r.spend || "0") || 0);
      }
    } catch { /* ignora conta sem dados */ }
  }));
  return out;
}

export async function fetchAdBreakdown(
  accountIds: string[], startDate?: Date, endDate?: Date, dateRange = "30d", campaignSlug?: string, strictSales = false
): Promise<AdRow[]> {
  const time_range = rangeParam(startDate, endDate, dateRange);
  const variants = campaignSlug ? slugVariants(campaignSlug) : [];
  const rows: AdRow[] = [];
  await Promise.all(accountIds.map(async (id) => {
    const res = await graphApiFetch<{ data: Array<any> }>(`/${id}/insights`, {
      level: "ad", time_range, limit: "500",
      fields: "ad_id,ad_name,campaign_name,spend,impressions,clicks,ctr,actions",
    });
    for (const r of res.data || []) {
      if (campaignSlug && !campaignMatchesSlug(r.campaign_name, variants, strictSales)) continue;
      const spend = parseFloat(r.spend) || 0;
      const purchases = pickAction(r.actions, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);
      rows.push({
        adId: r.ad_id, name: r.ad_name || "—", campaign: r.campaign_name || "—",
        spend, impressions: parseInt(r.impressions) || 0,
        clicks: parseInt(r.clicks) || 0, ctr: parseFloat(r.ctr) || 0,
        purchases, cac: purchases > 0 ? spend / purchases : 0,
      });
    }
  }));
  const top50 = rows.sort((a, b) => b.spend - a.spend).slice(0, 50);
  // Busca thumbnail da UNIÃO dos tops dos dois critérios (menor CAC e mais vendas),
  // pra alternar o ranking no front sem ficar sem imagem. Evita muitas chamadas.
  const comVendas = top50.filter((r) => r.purchases > 0);
  const porCac = [...comVendas].sort((a, b) => a.cac - b.cac).slice(0, 4);
  const porVendas = [...comVendas].sort((a, b) => b.purchases - a.purchases).slice(0, 4);
  const aThumb = new Map<string, AdRow>();
  for (const a of [...porCac, ...porVendas, ...top50.slice(0, 3)]) if (a.adId) aThumb.set(a.adId, a);
  await Promise.all([...aThumb.values()].map(async (a) => { a.thumbnail = await fetchAdThumbnail(a.adId!); }));
  return top50;
}

export interface BreakdownRow { label: string; spend: number; impressions: number; clicks: number; purchases: number; }

/** Insights segmentados por um breakdown do Meta (age, gender, impression_device, publisher_platform, device_platform...). */
export async function fetchBreakdown(
  accountIds: string[], breakdown: string, startDate?: Date, endDate?: Date, dateRange = "30d", campaignSlug?: string, strictSales = false, keyField?: string
): Promise<BreakdownRow[]> {
  const time_range = rangeParam(startDate, endDate, dateRange);
  const variants = campaignSlug ? slugVariants(campaignSlug) : [];
  // Cache em memória (10 min) — deixa a rotação do Modo TV instantânea ao reusar a cidade.
  const cacheKey = `bd_${accountIds.join(",")}_${breakdown}_${keyField || ""}_${time_range}_${campaignSlug || "all"}_${strictSales}`;
  const cached = _spendCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SPEND_CACHE_TTL) return cached.data as BreakdownRow[];
  // Alguns breakdowns só funcionam combinados (ex.: publisher_platform,platform_position).
  // keyField define por qual campo agregar (default = o próprio breakdown).
  const kf = keyField || breakdown;
  const map = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number }>();
  await Promise.all(accountIds.map(async (id) => {
    const params: Record<string, string> = campaignSlug
      ? { level: "campaign", breakdowns: breakdown, fields: "campaign_name,spend,impressions,clicks,actions", time_range, limit: "500" }
      : { breakdowns: breakdown, fields: "spend,impressions,clicks,actions", time_range, limit: "500" };
    const rows = await graphApiFetchAll(`/${id}/insights`, params);
    for (const r of rows) {
      if (campaignSlug && !campaignMatchesSlug(r.campaign_name, variants, strictSales)) continue;
      const key = String(r[kf] ?? "—");
      const cur = map.get(key) || { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
      cur.spend += parseFloat(r.spend) || 0;
      cur.impressions += parseInt(r.impressions) || 0;
      cur.clicks += parseInt(r.clicks) || 0;
      cur.purchases += pickAction(r.actions, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);
      map.set(key, cur);
    }
  }));
  const out = Array.from(map.entries()).map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => (b.purchases - a.purchases) || (b.spend - a.spend));
  _spendCache.set(cacheKey, { data: out, ts: Date.now() });
  return out;
}

// Os 6 breakdowns usados nos gráficos pizza/barra.
const BREAKDOWN_DEFS: Array<{ breakdown: string; keyField?: string }> = [
  { breakdown: "gender" }, { breakdown: "age" }, { breakdown: "impression_device" },
  { breakdown: "publisher_platform" }, { breakdown: "device_platform" },
  { breakdown: "publisher_platform,platform_position", keyField: "platform_position" },
];

/** Aquece o cache dos 6 breakdowns para VÁRIAS cidades com apenas 1 chamada por tipo
 *  (em vez de 1 por cidade) — evita estourar o rate limit do Meta no Modo TV.
 *  Busca todas as campanhas uma vez e separa por cidade em memória, gravando no MESMO
 *  cache que fetchBreakdown(slug, strictSales=true) lê. */
export async function warmBreakdownsForCities(
  accountIds: string[], cities: Array<{ slug: string }>, startDate?: Date, endDate?: Date, dateRange = "30d"
): Promise<void> {
  const time_range = rangeParam(startDate, endDate, dateRange);
  for (const def of BREAKDOWN_DEFS) {
    const { breakdown, keyField } = def;
    const kf = keyField || breakdown;
    // 1 chamada (paginada) por conta, TODAS as campanhas.
    const allRows: any[] = [];
    for (const id of accountIds) {
      const rows = await graphApiFetchAll(`/${id}/insights`, {
        level: "campaign", breakdowns: breakdown,
        fields: "campaign_name,spend,impressions,clicks,actions", time_range, limit: "500",
      });
      allRows.push(...rows);
    }
    // Separa/agrega por cidade e grava no cache de fetchBreakdown.
    for (const c of cities) {
      const variants = slugVariants(c.slug);
      const map = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number }>();
      for (const r of allRows) {
        if (!campaignMatchesSlug(r.campaign_name, variants, true)) continue;
        const key = String(r[kf] ?? "—");
        const cur = map.get(key) || { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
        cur.spend += parseFloat(r.spend) || 0;
        cur.impressions += parseInt(r.impressions) || 0;
        cur.clicks += parseInt(r.clicks) || 0;
        cur.purchases += pickAction(r.actions, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);
        map.set(key, cur);
      }
      const out = Array.from(map.entries()).map(([label, v]) => ({ label, ...v }))
        .sort((a, b) => (b.purchases - a.purchases) || (b.spend - a.spend));
      const cacheKey = `bd_${accountIds.join(",")}_${breakdown}_${keyField || ""}_${time_range}_${c.slug}_true`;
      _spendCache.set(cacheKey, { data: out, ts: Date.now() });
    }
  }
}

/** Aquece spend total, spend diário e orçamento diário de VÁRIAS cidades com pouquíssimas
 *  chamadas (3 por conta no total, não por cidade) — evita o rate limit no Modo TV.
 *  Grava nos MESMOS caches que fetchAdSpend / fetchDailySpendBreakdown / fetchCampaignDailyBudget leem. */
export async function warmSpendForCities(
  accountIds: string[], cities: Array<{ slug: string }>, startDate?: Date, endDate?: Date, dateRange = "30d"
): Promise<void> {
  const timeRange = clampTimeRange(startDate && endDate
    ? { since: startDate.toISOString().split("T")[0], until: endDate.toISOString().split("T")[0] }
    : buildTimeRange(dateRange));
  const timeRangeParam = JSON.stringify(timeRange);

  // 1 chamada/conta: diário por campanha (deriva spend total E série diária por cidade).
  const dailyByAccount: Array<{ account: string; rows: any[] }> = [];
  for (const id of accountIds) {
    const rows = await graphApiFetchAll(`/${id}/insights`, {
      level: "campaign", fields: "campaign_name,spend,date_start", time_range: timeRangeParam, time_increment: "1", limit: "500",
    });
    dailyByAccount.push({ account: id, rows });
  }
  // 1 chamada/conta cada: campanhas e adsets (p/ orçamento diário).
  const campaignsByAccount: Array<{ account: string; campaigns: any[] }> = [];
  const adsetsByAccount: Array<{ account: string; adsets: any[] }> = [];
  for (const id of accountIds) {
    campaignsByAccount.push({ account: id, campaigns: await graphApiFetchAll(`/${id}/campaigns`, { fields: "id,name,daily_budget,status", limit: "500" }) });
    adsetsByAccount.push({ account: id, adsets: await graphApiFetchAll(`/${id}/adsets`, { fields: "daily_budget,status,campaign", limit: "500" }) });
  }

  for (const c of cities) {
    const variants = slugVariants(c.slug);
    // Spend total (por conta) + série diária.
    const results: AdSpendResult[] = [];
    const dailyMap = new Map<string, number>();
    for (const { account, rows } of dailyByAccount) {
      let accSpend = 0;
      for (const r of rows) {
        if (!campaignMatchesSlug(r.campaign_name || "", variants, true)) continue;
        const sp = parseFloat(r.spend) || 0;
        accSpend += sp;
        dailyMap.set(r.date_start, (dailyMap.get(r.date_start) || 0) + sp);
      }
      results.push({ accountId: account, accountName: "", spend: accSpend });
    }
    _spendCache.set("spend_" + spendCacheKey(accountIds, dateRange, startDate, endDate, c.slug) + "_true", { data: results, ts: Date.now() });
    _spendCache.set("daily_" + spendCacheKey(accountIds, dateRange, startDate, endDate, c.slug) + "_true", { data: dailyMap, ts: Date.now() });

    // Orçamento diário (CBO no nível de campanha + fallback adset).
    let totalDailyBudget = 0;
    for (const { account, campaigns } of campaignsByAccount) {
      const matched = campaigns.filter((cc) => cc.status === "ACTIVE" && campaignMatchesSlug(cc.name, variants, true));
      const semBudget = new Set<string>();
      for (const cc of matched) {
        if (cc.daily_budget && parseFloat(cc.daily_budget) > 0) totalDailyBudget += parseFloat(cc.daily_budget) / 100;
        else semBudget.add(cc.id);
      }
      if (semBudget.size > 0) {
        const adsets = adsetsByAccount.find((x) => x.account === account)?.adsets || [];
        for (const a of adsets) {
          const cid = a.campaign?.id;
          if (cid && semBudget.has(cid) && a.status === "ACTIVE" && a.daily_budget && parseFloat(a.daily_budget) > 0) {
            totalDailyBudget += parseFloat(a.daily_budget) / 100;
          }
        }
      }
    }
    _spendCache.set("budget_" + accountIds.slice().sort().join(",") + "_" + c.slug + "_true", { data: totalDailyBudget, ts: Date.now() });
  }
}

/** Fetch the sum of daily budgets for active campaigns matching a slug.
 *  Checks campaign-level daily_budget first, then falls back to adset-level budgets. */
export async function fetchCampaignDailyBudget(
  accountIds: string[],
  slug: string,
  strictSales = false
): Promise<number> {
  const cacheKey = "budget_" + accountIds.sort().join(",") + "_" + slug + "_" + strictSales;
  const cached = _spendCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SPEND_CACHE_TTL) return cached.data;

  try {
    const variants = slugVariants(slug);
    let totalDailyBudget = 0;

    await Promise.all(
      accountIds.map(async (id) => {
        // 1 chamada: campanhas ativas que casam o slug
        const campaignsRes = await graphApiFetch<{
          data: Array<{ id: string; name: string; daily_budget?: string; status: string }>;
        }>(`/${id}/campaigns`, { fields: "id,name,daily_budget,status", limit: "500" });
        const campaigns = (campaignsRes.data || []).filter(
          (c) => c.status === "ACTIVE" && campaignMatchesSlug(c.name, variants, strictSales)
        );
        if (campaigns.length === 0) return;

        // Campanhas com orçamento no nível de campanha (CBO)
        const semBudgetCampanha = new Set<string>();
        for (const c of campaigns) {
          if (c.daily_budget && parseFloat(c.daily_budget) > 0) {
            totalDailyBudget += parseFloat(c.daily_budget) / 100;
          } else {
            semBudgetCampanha.add(c.id);
          }
        }

        // Para as demais, busca TODOS os adsets da conta numa única chamada
        if (semBudgetCampanha.size > 0) {
          const adsetsRes = await graphApiFetch<{
            data: Array<{ daily_budget?: string; status: string; campaign?: { id: string } }>;
          }>(`/${id}/adsets`, { fields: "daily_budget,status,campaign", limit: "500" });
          for (const a of adsetsRes.data || []) {
            const cid = a.campaign?.id;
            if (cid && semBudgetCampanha.has(cid) && a.status === "ACTIVE" && a.daily_budget && parseFloat(a.daily_budget) > 0) {
              totalDailyBudget += parseFloat(a.daily_budget) / 100;
            }
          }
        }
      })
    );

    _spendCache.set(cacheKey, { data: totalDailyBudget, ts: Date.now() });
    persistResult(cacheKey, totalDailyBudget);
    return totalDailyBudget;
  } catch (e) {
    // Estouro de limite: usa o último orçamento válido (evita projeção = participantes)
    const fb = loadPersisted<number>(cacheKey);
    if (fb != null) {
      console.warn("[Meta API] fetchCampaignDailyBudget via fallback (última leitura salva)");
      return fb;
    }
    throw e;
  }
}
