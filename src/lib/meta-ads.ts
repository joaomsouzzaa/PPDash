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

function graphApiFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) return Promise.reject(new Error("Meta não conectado"));

  const url = new URL(`https://graph.facebook.com/v21.0${path}`);
  url.searchParams.set("access_token", token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  return fetch(url.toString()).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Graph API error ${res.status}`);
    }
    return res.json();
  });
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
  endDate?: Date
): Promise<AdSpendResult[]> {
  const timeRange = startDate && endDate
    ? { since: startDate.toISOString().split("T")[0], until: endDate.toISOString().split("T")[0] }
    : buildTimeRange(dateRange);
  const timeRangeParam = JSON.stringify(timeRange);

  const results = await Promise.all(
    accountIds.map(async (id) => {
      try {
        const res = await graphApiFetch<{ data: Array<{ spend: string }> }>(
          `/${id}/insights`,
          {
            fields: "spend",
            time_range: timeRangeParam,
          }
        );
        const spend = res.data?.[0]?.spend ? parseFloat(res.data[0].spend) : 0;
        return { accountId: id, accountName: "", spend };
      } catch {
        return { accountId: id, accountName: "", spend: 0 };
      }
    })
  );

  return results;
}
