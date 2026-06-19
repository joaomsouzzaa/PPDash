import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
};

const REDIRECT_URI = "https://appgrowthstack.vercel.app/integracoes";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/adwords", // Google Ads (mesma conexão Google serve Sheets + Ads)
].join(" ");

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// client_id/secret do app OAuth são GLOBAIS (do dono do SaaS).
function clientCreds() {
  return {
    client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
  };
}

// Resolve a organização: via JWT do usuário logado, ou via body.org_id (chamadas server-side).
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

// Token de acesso válido (renova com refresh_token se expirado).
async function getAccessToken(supabase: any, orgId: string): Promise<string> {
  const cfg = await getCfg(supabase, orgId);
  if (!cfg.refresh_token) throw new Error("Google não conectado");
  const exp = cfg.token_expiry ? new Date(cfg.token_expiry).getTime() : 0;
  if (cfg.access_token && exp > Date.now() + 60000) return cfg.access_token;
  // refresh
  const { client_id, client_secret } = clientCreds();
  const body = new URLSearchParams({
    client_id, client_secret,
    refresh_token: cfg.refresh_token, grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  const j = await r.json();
  if (!r.ok) throw new Error(`Falha ao renovar token Google: ${j.error_description || j.error}`);
  const expiry = new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString();
  await saveCfg(supabase, orgId, { access_token: j.access_token, token_expiry: expiry });
  return j.access_token;
}

async function gapi(token: string, url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Google API ${r.status}`);
  return j;
}

// Append de uma linha mapeando { "Coluna": "valor" } para a ordem do cabeçalho.
async function appendRow(supabase: any, orgId: string, spreadsheetId: string, aba: string, valoresPorColuna: Record<string, string>) {
  const token = await getAccessToken(supabase, orgId);
  const range = `${aba}!1:1`;
  const head = await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`);
  const headers: string[] = head.values?.[0] || [];
  if (headers.length === 0) throw new Error("A aba não tem cabeçalho na linha 1");
  const linha = headers.map((h) => valoresPorColuna[h] ?? "");
  await gapi(token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(aba)}:append?valueInputOption=USER_ENTERED`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: [linha] }) });
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

    if (action === "get_auth_url") {
      const { client_id } = clientCreds();
      if (!client_id) throw new Error("O Google Sheets ainda não foi configurado pelo administrador do sistema.");
      const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      u.searchParams.set("client_id", client_id);
      u.searchParams.set("redirect_uri", REDIRECT_URI);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", SCOPES);
      u.searchParams.set("access_type", "offline");
      u.searchParams.set("prompt", "consent");
      return json({ url: u.toString() });
    }

    if (action === "exchange") {
      const { client_id, client_secret } = clientCreds();
      const form = new URLSearchParams({
        code: body.code, client_id, client_secret,
        redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
      });
      const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(`Erro no OAuth: ${j.error_description || j.error}`);
      const expiry = new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString();
      let email = null;
      try {
        const ui = await gapi(j.access_token, "https://www.googleapis.com/oauth2/v2/userinfo");
        email = ui.email;
      } catch { /* ignore */ }
      const patch: any = { access_token: j.access_token, token_expiry: expiry, email, updated_at: new Date().toISOString() };
      if (j.refresh_token) patch.refresh_token = j.refresh_token; // só vem na 1ª vez
      await saveCfg(supabase, orgId, patch);
      return json({ ok: true, email });
    }

    if (action === "status") {
      const cfg = await getCfg(supabase, orgId);
      return json({ connected: !!cfg.refresh_token, email: cfg.email, has_client: !!clientCreds().client_id });
    }

    if (action === "disconnect") {
      await saveCfg(supabase, orgId, { access_token: null, refresh_token: null, token_expiry: null, email: null });
      return json({ ok: true });
    }

    if (action === "list_spreadsheets") {
      const token = await getAccessToken(supabase, orgId);
      // Pagina por TODAS as planilhas (não só as 100 recentes) p/ aparecer renomeadas/antigas.
      const files: any[] = [];
      let pageToken = "";
      do {
        const u = "https://www.googleapis.com/drive/v3/files?q=" +
          encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false") +
          "&orderBy=modifiedTime desc&pageSize=1000&fields=nextPageToken,files(id,name)" +
          "&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives" +
          (pageToken ? `&pageToken=${pageToken}` : "");
        const j = await gapi(token, u);
        files.push(...(j.files || []));
        pageToken = j.nextPageToken || "";
      } while (pageToken && files.length < 5000);
      return json({ files });
    }

    if (action === "list_tabs") {
      const token = await getAccessToken(supabase, orgId);
      const j = await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${body.spreadsheet_id}?fields=properties.title,sheets.properties.title`);
      const tabs = (j.sheets || []).map((s: any) => s.properties.title);
      return json({ tabs, title: j.properties?.title });
    }

    if (action === "list_drive_folders") {
      const token = await getAccessToken(supabase, orgId);
      const files: any[] = [];
      let pageToken = "";
      do {
        const u = "https://www.googleapis.com/drive/v3/files?q=" +
          encodeURIComponent("mimeType='application/vnd.google-apps.folder' and trashed=false") +
          "&orderBy=modifiedTime desc&pageSize=1000&fields=nextPageToken,files(id,name)" +
          "&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives" +
          (pageToken ? `&pageToken=${pageToken}` : "");
        const j = await gapi(token, u);
        files.push(...(j.files || []));
        pageToken = j.nextPageToken || "";
      } while (pageToken && files.length < 5000);
      return json({ folders: files });
    }

    if (action === "list_drive_files") {
      if (!body.folder_id) throw new Error("folder_id é obrigatório");
      const token = await getAccessToken(supabase, orgId);
      const files: any[] = [];
      let pageToken = "";
      do {
        const q = `'${body.folder_id}' in parents and trashed=false and (mimeType contains 'image/' or mimeType contains 'video/')`;
        const u = "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q) +
          "&orderBy=name&pageSize=1000&fields=nextPageToken,files(id,name,mimeType,thumbnailLink,size)" +
          "&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives" +
          (pageToken ? `&pageToken=${pageToken}` : "");
        const j = await gapi(token, u);
        files.push(...(j.files || []));
        pageToken = j.nextPageToken || "";
      } while (pageToken && files.length < 5000);
      return json({ files });
    }

    if (action === "download_drive_file") {
      // Retorna o arquivo do Drive em base64 (usado server-to-server por meta-ads-manager).
      if (!body.file_id) throw new Error("file_id é obrigatório");
      const token = await getAccessToken(supabase, orgId);
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${body.file_id}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) throw new Error(`Falha ao baixar arquivo do Drive (${r.status})`);
      const mime = r.headers.get("content-type") || "application/octet-stream";
      const buf = new Uint8Array(await r.arrayBuffer());
      // base64 em chunks p/ não estourar a pilha em arquivos grandes
      let bin = "";
      const CH = 0x8000;
      for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode(...buf.subarray(i, i + CH));
      return json({ base64: btoa(bin), mime });
    }

    if (action === "list_headers") {
      const token = await getAccessToken(supabase, orgId);
      const range = `${body.aba}!1:1`;
      const j = await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${body.spreadsheet_id}/values/${encodeURIComponent(range)}`);
      return json({ headers: j.values?.[0] || [] });
    }

    if (action === "append") {
      await appendRow(supabase, orgId, body.spreadsheet_id, body.aba, body.valores || {});
      return json({ ok: true });
    }

    return json({ error: "ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 400);
  }
});
