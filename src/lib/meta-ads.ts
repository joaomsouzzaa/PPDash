export interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
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
    if (errCode === 32 || errCode === 4 || res.status === 429 ||
        errMsg.toLowerCase().includes("too many calls") ||
        errMsg.toLowerCase().includes("rate limit")) {
      console.warn("[Meta API] Rate limited — activating 5min cooldown");
      flagRateLimited();
    }
    throw new Error(errMsg);
  }
  return res.json();
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

// Apenas a conta Scale Company é usada no dashboard (as demais não são necessárias)
const ALLOWED_ACCOUNT_IDS = ["1207875286360718"];

export async function fetchAdAccounts(skipCache = false): Promise<AdAccount[]> {
  if (!skipCache && _adAccountsCache && Date.now() - _adAccountsCache.ts < AD_ACCOUNTS_CACHE_TTL) {
    return _adAccountsCache.data;
  }
  const res = await graphApiFetch<{ data: AdAccount[] }>("/me/adaccounts", {
    fields: "name,account_id,currency",
    limit: "100",
  });
  const accounts = (res.data || []).filter((a) => ALLOWED_ACCOUNT_IDS.includes(a.account_id));
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
    case "7d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 7);
      return { since: fmt(s), until };
    }
    case "30d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 30);
      return { since: fmt(s), until };
    }
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
function campaignMatchesSlug(name: string, variants: string[]): boolean {
  const n = (name || "").toLowerCase();
  return variants.some((v) => n.includes(v));
}

// Cache for spend results (10 min TTL — matches dashboard refresh)
const _spendCache = new Map<string, { data: any; ts: number }>();
const SPEND_CACHE_TTL = 10 * 60 * 1000;

function spendCacheKey(ids: string[], dateRange: string, start?: Date, end?: Date, slug?: string) {
  return `${ids.sort().join(",")}_${dateRange}_${start?.toISOString() || ""}_${end?.toISOString() || ""}_${slug || ""}`;
}

export async function fetchAdSpend(
  accountIds: string[],
  dateRange: string,
  startDate?: Date,
  endDate?: Date,
  campaignSlug?: string
): Promise<AdSpendResult[]> {
  const cacheKey = "spend_" + spendCacheKey(accountIds, dateRange, startDate, endDate, campaignSlug);
  const cached = _spendCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SPEND_CACHE_TTL) return cached.data;
  const timeRange = clampTimeRange(startDate && endDate
    ? { since: startDate.toISOString().split("T")[0], until: endDate.toISOString().split("T")[0] }
    : buildTimeRange(dateRange));
  const timeRangeParam = JSON.stringify(timeRange);

  const results = await Promise.all(
    accountIds.map(async (id) => {
      try {
        if (campaignSlug) {
          // Busca as campanhas e filtra pelo(s) slug(s) no nome (client-side, multi-slug)
          const variants = slugVariants(campaignSlug);
          const campaignsRes = await graphApiFetch<{ data: Array<{ id: string; name: string }> }>(
            `/${id}/campaigns`,
            { fields: "id,name", limit: "500" }
          );
          const campaigns = (campaignsRes.data || []).filter((c) => campaignMatchesSlug(c.name, variants));
          if (campaigns.length === 0) return { accountId: id, accountName: "", spend: 0 };

          let totalSpend = 0;
          await Promise.all(
            campaigns.map(async (c) => {
              try {
                const insightRes = await graphApiFetch<{ data: Array<{ spend: string }> }>(
                  `/${c.id}/insights`,
                  { fields: "spend", time_range: timeRangeParam }
                );
                totalSpend += insightRes.data?.[0]?.spend ? parseFloat(insightRes.data[0].spend) : 0;
              } catch {}
            })
          );
          return { accountId: id, accountName: "", spend: totalSpend };
        } else {
          const res = await graphApiFetch<{ data: Array<{ spend: string }> }>(
            `/${id}/insights`,
            { fields: "spend", time_range: timeRangeParam }
          );
          const spend = res.data?.[0]?.spend ? parseFloat(res.data[0].spend) : 0;
          return { accountId: id, accountName: "", spend };
        }
      } catch {
        return { accountId: id, accountName: "", spend: 0 };
      }
    })
  );

  _spendCache.set(cacheKey, { data: results, ts: Date.now() });
  return results;
}

/** Fetch daily spend breakdown (date → spend) for accounts, optionally filtered by campaign slug */
export async function fetchDailySpendBreakdown(
  accountIds: string[],
  dateRange: string,
  startDate?: Date,
  endDate?: Date,
  campaignSlug?: string
): Promise<Map<string, number>> {
  const cacheKey = "daily_" + spendCacheKey(accountIds, dateRange, startDate, endDate, campaignSlug);
  const cached = _spendCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SPEND_CACHE_TTL) return cached.data;
  const timeRange = clampTimeRange(startDate && endDate
    ? { since: startDate.toISOString().split("T")[0], until: endDate.toISOString().split("T")[0] }
    : buildTimeRange(dateRange));
  const timeRangeParam = JSON.stringify(timeRange);

  const dailyMap = new Map<string, number>();

  await Promise.all(
    accountIds.map(async (id) => {
      try {
        if (campaignSlug) {
          const variants = slugVariants(campaignSlug);
          const campaignsRes = await graphApiFetch<{ data: Array<{ id: string; name: string }> }>(
            `/${id}/campaigns`,
            { fields: "id,name", limit: "500" }
          );
          const campaigns = (campaignsRes.data || []).filter((c) => campaignMatchesSlug(c.name, variants));
          await Promise.all(
            campaigns.map(async (c) => {
              try {
                const insightRes = await graphApiFetch<{ data: Array<{ spend: string; date_start: string }> }>(
                  `/${c.id}/insights`,
                  { fields: "spend", time_range: timeRangeParam, time_increment: "1" }
                );
                for (const row of insightRes.data || []) {
                  const date = row.date_start;
                  const spend = parseFloat(row.spend) || 0;
                  dailyMap.set(date, (dailyMap.get(date) || 0) + spend);
                }
              } catch {}
            })
          );
        } else {
          const res = await graphApiFetch<{ data: Array<{ spend: string; date_start: string }> }>(
            `/${id}/insights`,
            { fields: "spend", time_range: timeRangeParam, time_increment: "1" }
          );
          for (const row of res.data || []) {
            const date = row.date_start;
            const spend = parseFloat(row.spend) || 0;
            dailyMap.set(date, (dailyMap.get(date) || 0) + spend);
          }
        }
      } catch {}
    })
  );

  _spendCache.set(cacheKey, { data: dailyMap, ts: Date.now() });
  return dailyMap;
}

/** Fetch the sum of daily budgets for active campaigns matching a slug.
 *  Checks campaign-level daily_budget first, then falls back to adset-level budgets. */
export async function fetchCampaignDailyBudget(
  accountIds: string[],
  slug: string
): Promise<number> {
  const cacheKey = "budget_" + accountIds.sort().join(",") + "_" + slug;
  const cached = _spendCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SPEND_CACHE_TTL) return cached.data;

  let totalDailyBudget = 0;

  await Promise.all(
    accountIds.map(async (id) => {
      try {
        const variants = slugVariants(slug);
        const campaignsRes = await graphApiFetch<{
          data: Array<{ id: string; name: string; daily_budget?: string; status: string }>;
        }>(`/${id}/campaigns`, {
          fields: "id,name,daily_budget,status",
          limit: "500",
        });

        const campaigns = (campaignsRes.data || []).filter((c) => campaignMatchesSlug(c.name, variants));
        for (const c of campaigns) {
          if (c.status !== "ACTIVE") continue;

          if (c.daily_budget && parseFloat(c.daily_budget) > 0) {
            // Campaign-level daily_budget (returned in cents)
            totalDailyBudget += parseFloat(c.daily_budget) / 100;
          } else {
            // No campaign-level budget — check adsets for this campaign
            try {
              const adsetsRes = await graphApiFetch<{
                data: Array<{ id: string; daily_budget?: string; status: string }>;
              }>(`/${c.id}/adsets`, {
                fields: "id,daily_budget,status",
                limit: "500",
              });
              const adsets = adsetsRes.data || [];
              for (const adset of adsets) {
                if (adset.status === "ACTIVE" && adset.daily_budget && parseFloat(adset.daily_budget) > 0) {
                  totalDailyBudget += parseFloat(adset.daily_budget) / 100;
                }
              }
            } catch {}
          }
        }
      } catch {}
    })
  );

  console.log(`[Projeção] slug=${slug} dailyBudget=${totalDailyBudget}`);
  _spendCache.set(cacheKey, { data: totalDailyBudget, ts: Date.now() });
  return totalDailyBudget;
}
