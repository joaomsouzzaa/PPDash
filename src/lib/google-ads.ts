import { supabase } from "@/integrations/supabase/client";

export interface GoogleAdAccount { id: string; name: string }

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("google-ads", { body: { action, ...extra } });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export function getGoogleAdsStatus() {
  return call<{ connected: boolean; email: string | null; has_dev_token: boolean; login_customer_id: string | null }>("status");
}

export function setGoogleAdsLoginCustomer(loginCustomerId: string) {
  return call<{ ok: boolean }>("set_login_customer", { login_customer_id: loginCustomerId });
}

export async function fetchGoogleAdAccounts(): Promise<GoogleAdAccount[]> {
  const { accounts } = await call<{ accounts: GoogleAdAccount[] }>("list_accounts");
  return accounts || [];
}

// Contas que o Gmail conectado acessa (para escolher a gerenciadora/MCC).
export async function listAccessibleGoogleAccounts(): Promise<{ id: string; name: string; manager: boolean }[]> {
  const { accounts } = await call<{ accounts: { id: string; name: string; manager: boolean }[] }>("list_accessible");
  return accounts || [];
}

// Soma o gasto de várias contas Google (sem filtro de campanha) — usado no "Geral".
export async function fetchGoogleTotalSpend(
  customerIds: string[], dateRange: string, startDate?: Date, endDate?: Date,
): Promise<number> {
  const ids = [...new Set(customerIds.filter(Boolean))];
  let total = 0;
  for (const id of ids) {
    try { total += await fetchGoogleAdSpend(id, dateRange, startDate, endDate, ""); } catch { /* sem acesso ainda */ }
  }
  return total;
}

// Gasto de uma conta Google Ads no período, filtrado pelo nome da campanha (slug), como no Meta.
export async function fetchGoogleAdSpend(
  customerId: string,
  dateRange: string,
  startDate?: Date,
  endDate?: Date,
  campaignSlug?: string,
): Promise<number> {
  const { spend } = await call<{ spend: number }>("spend", {
    customer_id: customerId,
    dateRange,
    start: startDate?.toISOString(),
    end: endDate?.toISOString(),
    campaignSlug: campaignSlug || "",
  });
  return spend || 0;
}
