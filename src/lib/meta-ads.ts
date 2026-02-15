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

/** Mark Meta as disconnected due to token expiration. */
export function markTokenExpired() {
  localStorage.removeItem("meta_connected");
  localStorage.removeItem("meta_access_token");
  localStorage.removeItem("meta_token_expires_at");
}

async function graphApiFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) return Promise.reject(new Error("Meta não conectado"));

  const url = new URL(`https://graph.facebook.com/v21.0${path}`);
  url.searchParams.set("access_token", token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errMsg = err?.error?.message || `Graph API error ${res.status}`;
    // Detect expired / invalid token
    const errCode = err?.error?.code;
    if (errCode === 190 || res.status === 401) {
      markTokenExpired();
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

export async function fetchAdAccounts(): Promise<AdAccount[]> {
  const res = await graphApiFetch<{ data: AdAccount[] }>("/me/adaccounts", {
    fields: "name,account_id,currency",
    limit: "100",
  });
  return res.data || [];
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

export async function fetchAdSpend(
  accountIds: string[],
  dateRange: string,
  startDate?: Date,
  endDate?: Date,
  campaignSlug?: string
): Promise<AdSpendResult[]> {
  const timeRange = startDate && endDate
    ? { since: startDate.toISOString().split("T")[0], until: endDate.toISOString().split("T")[0] }
    : buildTimeRange(dateRange);
  const timeRangeParam = JSON.stringify(timeRange);

  const results = await Promise.all(
    accountIds.map(async (id) => {
      try {
        if (campaignSlug) {
          // Fetch campaign-level insights filtered by slug in campaign name
          const campaignsRes = await graphApiFetch<{ data: Array<{ id: string; name: string }> }>(
            `/${id}/campaigns`,
            { fields: "id,name", limit: "500", filtering: JSON.stringify([{ field: "name", operator: "CONTAIN", value: campaignSlug }]) }
          );
          const campaigns = campaignsRes.data || [];
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

  return results;
}

/** Fetch the sum of daily budgets for active campaigns matching a slug */
export async function fetchCampaignDailyBudget(
  accountIds: string[],
  slug: string
): Promise<number> {
  let totalDailyBudget = 0;

  await Promise.all(
    accountIds.map(async (id) => {
      try {
        const campaignsRes = await graphApiFetch<{
          data: Array<{ id: string; name: string; daily_budget?: string; status: string }>;
        }>(`/${id}/campaigns`, {
          fields: "id,name,daily_budget,status",
          limit: "500",
          filtering: JSON.stringify([
            { field: "name", operator: "CONTAIN", value: slug },
          ]),
        });

        const campaigns = campaignsRes.data || [];
        for (const c of campaigns) {
          if (c.status === "ACTIVE" && c.daily_budget) {
            // daily_budget is returned in cents (smallest currency unit)
            totalDailyBudget += parseFloat(c.daily_budget) / 100;
          }
        }
      } catch {}
    })
  );

  return totalDailyBudget;
}
