import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Webhook do Meta Lead Ads (leadgen). Fluxo:
//  GET  -> verificação do webhook (hub.challenge) usando META_WEBHOOK_VERIFY_TOKEN.
//  POST -> evento leadgen: busca o lead na Graph API com o token da página e insere em `leads`.
// Roteia a org pelo page_id (tabela meta_lead_paginas). Dedup por leadgen_id / email.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const GRAPH = "https://graph.facebook.com/v21.0";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Mapeia os campos do formulário do Meta (field_data) para colunas/custom do lead.
function mapMetaFields(fd: { name: string; values: string[] }[]) {
  const byName: Record<string, string> = {};
  for (const f of fd) { const v = (f.values || [])[0]; if (v != null) byName[norm(f.name)] = v; }
  // Igualdade exata (campos padrão do Meta: first_name, last_name, email, phone_number, city, state...).
  const exact = (...keys: string[]) => { for (const k of keys) if (byName[k] != null) return byName[k]; return null; };
  // "Contém" (perguntas personalizadas) — usar só onde não há risco de colisão.
  const incl = (...subs: string[]) => { for (const [n, v] of Object.entries(byName)) if (subs.some((s) => n.includes(s))) return v; return null; };

  const firstName = exact("first_name");
  const lastName = exact("last_name");
  const fullName = exact("full_name") || [firstName, lastName].filter(Boolean).join(" ") || null;
  const custom: Record<string, unknown> = {};
  if (lastName) custom.sobrenome = lastName;
  const uf = exact("state", "uf", "estado"); if (uf) custom.uf = uf;
  const cap = incl("capacidade", "investimento"); if (cap) custom.capacidade_investimento = cap;
  return {
    nome: fullName || firstName || null,
    email: exact("email") || incl("e-mail", "email"),
    telefone: exact("phone_number", "telefone", "celular") || incl("whatsapp", "telefone", "celular"),
    whatsapp: exact("phone_number") || incl("whatsapp"),
    cidade: exact("city", "cidade"),
    custom,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);

  // 1) Verificação do webhook (Meta chama via GET).
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const verify = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && verify && verify === Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // 2) Evento leadgen. Responde 200 rápido; processa o melhor possível.
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const supabase = svc();

  try {
    for (const entry of body.entry || []) {
      for (const ch of entry.changes || []) {
        if (ch.field !== "leadgen") continue;
        const v = ch.value || {};
        const pageId = String(v.page_id ?? entry.id ?? "");
        const leadgenId = String(v.leadgen_id ?? "");
        if (!leadgenId) continue;

        // Org + token da página.
        const { data: pagina } = await supabase.from("meta_lead_paginas")
          .select("org_id, page_token, ativo").eq("page_id", pageId).eq("ativo", true).maybeSingle();
        if (!pagina?.org_id || !pagina.page_token) { console.warn("[meta-leads] página não vinculada:", pageId); continue; }
        const orgId = pagina.org_id as string;

        // Busca os dados completos do lead.
        const r = await fetch(`${GRAPH}/${leadgenId}?fields=field_data,created_time,campaign_name,ad_name,form_id&access_token=${pagina.page_token}`);
        const lead = await r.json();
        if (lead.error) { console.error("[meta-leads] graph error:", lead.error?.message); continue; }

        const m = mapMetaFields(lead.field_data || []);
        const email = m.email ? String(m.email) : null;

        // Dedup por leadgen_id ou email.
        let existe = false;
        const { data: porExt } = await supabase.from("leads").select("id").eq("org_id", orgId).eq("crm_external_id", leadgenId).maybeSingle();
        if (porExt) existe = true;
        if (!existe && email) {
          const { data: porEmail } = await supabase.from("leads").select("id").eq("org_id", orgId).eq("email", email).maybeSingle();
          if (porEmail) existe = true;
        }
        if (existe) continue;

        const row = {
          org_id: orgId,
          crm_origem: "meta_leads",
          crm_external_id: leadgenId,
          nome: m.nome,
          email,
          telefone: m.telefone ? String(m.telefone) : null,
          whatsapp: m.whatsapp ? String(m.whatsapp) : (m.telefone ? String(m.telefone) : null),
          cidade: m.cidade ? String(m.cidade) : null,
          utm_source: "Facebook Lead Ads",
          utm_medium: "lead_ads",
          campaign_name: lead.campaign_name ?? null,
          ad_name: lead.ad_name ?? null,
          data_lead: lead.created_time || v.created_time || new Date().toISOString(),
          custom: m.custom,
          payload: { meta: lead, change: v },
        };
        const { error } = await supabase.from("leads").insert(row);
        if (error) console.error("[meta-leads] insert error:", error.message);
      }
    }
  } catch (e) {
    console.error("[meta-leads] exception:", e instanceof Error ? e.message : "unknown");
  }

  // Meta exige 200 sempre (senão reenvia/desativa).
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
