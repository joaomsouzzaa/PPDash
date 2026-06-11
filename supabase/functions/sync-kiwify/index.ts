import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://public-api.kiwify.com/v1";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]/g, "");
const hojeSPstr = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// OAuth client credentials → access_token (Bearer, validade 24h).
async function getToken(): Promise<string> {
  const id = Deno.env.get("KIWIFY_CLIENT_ID");
  const secret = Deno.env.get("KIWIFY_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Configure KIWIFY_CLIENT_ID e KIWIFY_CLIENT_SECRET");
  const r = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}`,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`OAuth Kiwify falhou: ${j?.message || r.status}`);
  return j.access_token;
}

function authHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "x-kiwify-account-id": Deno.env.get("KIWIFY_ACCOUNT_ID") || "",
    "Content-Type": "application/json",
  };
}

// Lista paginada onde `data` é um ARRAY (ex.: /products).
async function listarTudo(path: string, token: string, maxPages = 50): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${BASE}${path}${sep}page_size=100&page_number=${page}`, { headers: authHeaders(token) });
    if (!r.ok) break;
    const j = await r.json().catch(() => ({}));
    const data = Array.isArray(j.data) ? j.data : [];
    out.push(...data);
    const count = j.pagination?.count ?? out.length;
    if (data.length === 0 || out.length >= count) break;
  }
  return out;
}

// Participantes de um evento: a resposta é { pagination, data: { ...metadados, participants: [...] } }.
async function listarParticipantes(productId: string, token: string, maxPages = 50): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await fetch(`${BASE}/events/${productId}/participants?page_size=100&page_number=${page}`, { headers: authHeaders(token) });
    if (!r.ok) break;
    const j = await r.json().catch(() => ({}));
    const parts = j.data?.participants || [];
    out.push(...parts);
    const count = j.pagination?.count ?? out.length;
    if (parts.length === 0 || out.length >= count) break;
  }
  return out;
}

Deno.serve(async (req) => {
  console.log("sync-kiwify v1 - cortesias");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = svc();
    const token = await getToken();

    // Cidades ATIVAS (evento de hoje em diante).
    const hoje = hojeSPstr();
    const { data: cids } = await supabase.from("cidades").select("nome,slug,data_evento");
    const ativas = (cids || []).filter((c: any) => !c.data_evento || String(c.data_evento).slice(0, 10) >= hoje);
    if (ativas.length === 0) return json({ success: true, msg: "Nenhuma cidade ativa", inseridos: 0 });

    // Convites já existentes no banco (dedup por e-mail).
    const { data: existentes } = await supabase.from("vendas").select("email_comprador").eq("tipo_ingresso", "convite");
    const jaTem = new Set((existentes || []).map((r: any) => norm(r.email_comprador)).filter(Boolean));

    // Produtos do Kiwify → casa cada um com uma cidade ativa pelo nome.
    const produtos = await listarTudo("/products", token);
    const matchCidade = (nomeProduto: string) => {
      const np = norm(nomeProduto);
      return ativas.find((c: any) => {
        const partes = String(c.slug || "").split(",").map((x: string) => norm(x)).filter(Boolean);
        return partes.some((s) => np.includes(s)) || np.includes(norm(c.nome));
      });
    };

    let inseridos = 0;
    const detalhe: string[] = [];
    for (const p of produtos) {
      const cidade = matchCidade(p.name || "");
      if (!cidade) continue; // produto que não é de cidade ativa
      let participantes: any[] = [];
      try { participantes = await listarParticipantes(p.id, token); } catch { continue; }

      for (const part of participantes) {
        const ehCortesia = /convite|cortesia/i.test(String(part.batch_name || "")) || !part.order_id;
        if (!ehCortesia) continue; // pagos vêm pelo webhook
        const email = norm(part.email);
        if (!email || jaTem.has(email)) continue; // já temos
        const { error } = await supabase.from("vendas").insert({
          plataforma: "kiwify",
          id_transacao: part.id || null,
          status: "aprovada",
          valor: 0,
          quantidade: 1,
          tipo_ingresso: "convite",
          produto: p.name || null,
          cidade: cidade.nome,
          nome_comprador: part.name || null,
          email_comprador: part.email || null,
          telefone_comprador: part.phone || null,
          documento: part.cpf || null,
          data_venda: part.created_at || new Date().toISOString(),
          payload: part,
        });
        if (!error) { inseridos++; jaTem.add(email); detalhe.push(`${cidade.nome}: ${part.name} <${part.email}>`); }
      }
    }

    return json({ success: true, cidades_ativas: ativas.length, inseridos, detalhe });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "erro interno" }, 500);
  }
});
