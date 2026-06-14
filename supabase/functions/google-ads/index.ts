import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADS_API = "https://googleads.googleapis.com/v17";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
function clientCreds() {
  return {
    client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
  };
}
const devToken = () => Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || "";

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

async function getCfg(supabase: any, orgId: string) {
  const { data } = await supabase.from("google_config").select("*").eq("org_id", orgId).maybeSingle();
  return data || {};
}
async function saveCfg(supabase: any, orgId: string, patch: Record<string, unknown>) {
  await supabase.from("google_config").upsert({ org_id: orgId, ...patch }, { onConflict: "org_id" });
}

// Renova o access token do Google (mesmo refresh_token do Sheets — precisa ter o escopo adwords).
async function getAccessToken(supabase: any, orgId: string): Promise<string> {
  const cfg = await getCfg(supabase, orgId);
  if (!cfg.refresh_token) throw new Error("Google não conectado");
  const exp = cfg.token_expiry ? new Date(cfg.token_expiry).getTime() : 0;
  if (cfg.access_token && exp > Date.now() + 60000) return cfg.access_token;
  const { client_id, client_secret } = clientCreds();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id, client_secret, refresh_token: cfg.refresh_token, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Falha ao renovar token Google: ${j.error_description || j.error}`);
  const expiry = new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString();
  await saveCfg(supabase, orgId, { access_token: j.access_token, token_expiry: expiry });
  return j.access_token;
}

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

async function adsHeaders(supabase: any, orgId: string, loginCustomerId?: string) {
  const token = await getAccessToken(supabase, orgId);
  const dt = devToken();
  if (!dt) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN não configurado");
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": dt,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) h["login-customer-id"] = onlyDigits(loginCustomerId);
  return h;
}

// Roda GAQL (searchStream) num customer e devolve as linhas agregadas.
async function gaql(supabase: any, orgId: string, customerId: string, query: string, loginCustomerId?: string): Promise<any[]> {
  const headers = await adsHeaders(supabase, orgId, loginCustomerId);
  const r = await fetch(`${ADS_API}/customers/${onlyDigits(customerId)}/googleAds:searchStream`, {
    method: "POST", headers, body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok) {
    const msg = j?.error?.message || j?.[0]?.error?.message || `Google Ads API ${r.status}`;
    throw new Error(msg);
  }
  // searchStream retorna um array de chunks { results: [...] }
  const out: any[] = [];
  const chunks = Array.isArray(j) ? j : [j];
  for (const c of chunks) for (const row of (c.results || [])) out.push(row);
  return out;
}

// Datas YYYY-MM-DD para o BETWEEN do GAQL.
function range(dateRange: string, start?: string, end?: string) {
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  if (start && end) return { since: start.split("T")[0], until: end.split("T")[0] };
  const now = new Date();
  const until = fmt(now);
  const back = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return fmt(d); };
  switch (dateRange) {
    case "today": return { since: until, until };
    case "yesterday": { const y = back(1); return { since: y, until: y }; }
    case "7d": return { since: back(6), until };
    case "14d": return { since: back(13), until };
    case "30d": return { since: back(29), until };
    case "90d": return { since: back(89), until };
    case "this_month": return { since: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), until };
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { since: fmt(s), until: fmt(e) };
    }
    case "lifetime": return { since: "2020-01-01", until };
    default: return { since: back(30), until };
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

    if (action === "status") {
      const cfg = await getCfg(supabase, orgId);
      return json({
        connected: !!cfg.refresh_token,
        email: cfg.email,
        has_dev_token: !!devToken(),
        login_customer_id: cfg.ads_login_customer_id || null,
      });
    }

    if (action === "set_login_customer") {
      await saveCfg(supabase, orgId, { ads_login_customer_id: onlyDigits(body.login_customer_id) });
      return json({ ok: true });
    }

    // Lista as contas que o Gmail conectado acessa (com nome e se é gerenciadora/MCC).
    if (action === "list_accessible") {
      const headers = await adsHeaders(supabase, orgId);
      const r = await fetch(`${ADS_API}/customers:listAccessibleCustomers`, { headers });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || `Google Ads API ${r.status}`);
      const ids: string[] = (j.resourceNames || []).map((rn: string) => rn.split("/")[1]);
      const accounts: { id: string; name: string; manager: boolean }[] = [];
      for (const id of ids) {
        try {
          const rows = await gaql(supabase, orgId, id, "SELECT customer.descriptive_name, customer.manager FROM customer LIMIT 1", id);
          const c = rows[0]?.customer;
          accounts.push({ id, name: c?.descriptiveName || id, manager: !!c?.manager });
        } catch {
          accounts.push({ id, name: id, manager: false });
        }
      }
      return json({ accounts });
    }

    // Lista as contas (customers) acessíveis sob o MCC, com nome e id.
    if (action === "list_accounts") {
      const cfg = await getCfg(supabase, orgId);
      const mcc = cfg.ads_login_customer_id;
      if (!mcc) throw new Error("Informe o ID da conta gerenciadora (MCC) primeiro.");
      const rows = await gaql(supabase, orgId, mcc, `
        SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status
        FROM customer_client
        WHERE customer_client.status = 'ENABLED'
      `, mcc);
      const accounts = rows
        .map((r) => r.customerClient)
        .filter((c) => c && !c.manager)
        .map((c) => ({ id: String(c.id), name: c.descriptiveName || String(c.id) }));
      return json({ accounts });
    }

    // Gasto por campanha num período, filtrando pelo nome (slug) como no Meta.
    if (action === "spend") {
      const cfg = await getCfg(supabase, orgId);
      const mcc = cfg.ads_login_customer_id;
      const customerId = body.customer_id;
      if (!customerId) throw new Error("customer_id obrigatório");
      const { since, until } = range(body.dateRange, body.start, body.end);
      const rows = await gaql(supabase, orgId, customerId, `
        SELECT campaign.name, metrics.cost_micros
        FROM campaign
        WHERE segments.date BETWEEN '${since}' AND '${until}'
      `, mcc);
      const variants: string[] = (body.campaignSlug || "").split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
      let total = 0;
      for (const r of rows) {
        const name = (r.campaign?.name || "").toLowerCase();
        if (variants.length && !variants.some((v) => name.includes(v))) continue;
        total += Number(r.metrics?.costMicros || 0) / 1_000_000;
      }
      return json({ spend: total, currency: "BRL" });
    }

    return json({ error: "ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 400);
  }
});
