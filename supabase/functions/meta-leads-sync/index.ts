import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Normaliza telefone BR p/ chave de dedup (últimos 11 díg., tira 55). Espelha _shared/telefone.ts.
function normalizarTelefone(raw?: string | null): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length > 11) d = d.slice(-11);
  return d || null;
}

// Pull/sincronização do Meta Lead Ads (espelha o "Sincronizar agora" do CRM, mas via Graph API).
// Para cada org com página ativa em meta_lead_paginas:
//   - lista os formulários da página (requer pages_manage_ads) e puxa os leads do período;
//   - insere os que faltam (dedupe por leadgen_id/email) com UTMs completas;
//   - enriquece leads meta_leads existentes sem utm_campaign/utm_content/utm_medium;
//   - monta o relatório e envia no WhatsApp (gatilho `sync_meta_concluido`).
// Body: { org_id?, dias?, dry?, notificar? }. Sem org_id => todas as orgs com página ativa.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug" };
const GRAPH = "https://graph.facebook.com/v21.0";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const fmtBRdt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Busca TODOS os leads (paginado). PostgREST devolve no máx. 1000 linhas/request;
// sem paginar, o snapshot de dedup fica incompleto e o sync duplica os leads
// além da linha 1000.
async function fetchAllLeads(supabase: any, cols: string, orgId: string | null): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from("leads").select(cols).range(from, from + 999);
    if (orgId) q = q.eq("org_id", orgId);
    const { data, error } = await q;
    if (error || !data || !data.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// ---- Mapeia os campos do formulário do Meta (mesma lógica do webhook meta-leads) ----
function mapMetaFields(fd: { name: string; values: string[] }[]) {
  const byName: Record<string, string> = {};
  for (const f of fd) { const v = (f.values || [])[0]; if (v != null) byName[norm(f.name)] = v; }
  const exact = (...keys: string[]) => { for (const k of keys) if (byName[k] != null) return byName[k]; return null; };
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

// ---- Notificação (mesmo padrão do crm-sync, mas gatilho sync_meta_concluido) ----
function render(template: string, v: Record<string, string | number>): string {
  return template.split("\n")
    .filter((linha) => {
      const ph = linha.match(/\{\{\s*\w+\s*\}\}/g);
      if (!ph) return true;
      return ph.some((p) => { const k = p.replace(/[{}\s]/g, ""); return v[k] != null && String(v[k]).trim() !== ""; });
    })
    .join("\n")
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (v[k] != null ? String(v[k]) : ""));
}
const destinatariosDe = (n: any): string[] => {
  if (Array.isArray(n.destinatarios) && n.destinatarios.length) return n.destinatarios.map((d: any) => d.valor).filter(Boolean);
  return n.destinatario ? [n.destinatario] : [];
};
const TEMPLATE_PADRAO = [
  "🔄 Sincronização {{crm}} → Banco",
  "🕐 {{data}} · {{periodo}} (BRT)",
  "",
  "📊 Resumo",
  "• Recebidos do Meta: {{recebidos}}",
  "• Já tínhamos no banco: {{ja_tinha}}",
  "• Inseridos agora: {{inseridos}}",
  "• Atualizados (rastreio): {{atualizados}}",
  "• Total no nosso banco: {{total}}",
  "",
  "{{detalhes}}",
  "",
  "🤖 By: GoBot",
].join("\n");

async function notificar(supabase: any, orgId: string | null, vars: Record<string, string | number>, dry: boolean, wantNotificar: boolean): Promise<number> {
  if (dry || !wantNotificar) return 0;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const send = (destinatario: string, mensagem: string) =>
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}`, apikey: anon },
      body: JSON.stringify({ action: "send", org_id: orgId, destinatario, mensagem }),
      signal: AbortSignal.timeout(20000),
    });
  const { data: notifs } = await supabase.from("notificacoes").select("*").eq("ativo", true).eq("gatilho", "sync_meta_concluido").eq("org_id", orgId);
  let enviados = 0;
  for (const n of notifs || []) {
    const mensagem = render(n.mensagem || TEMPLATE_PADRAO, vars);
    for (const dest of destinatariosDe(n)) {
      try {
        await send(dest, mensagem);
        await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, org_id: orgId, destinatario: dest, mensagem, status: "enviado" });
        enviados++;
      } catch (e) {
        await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, org_id: orgId, destinatario: dest, mensagem, status: "erro", erro: String(e) });
      }
    }
  }
  return enviados;
}

// ---- Graph helpers ----
async function graphGet(url: string): Promise<any> {
  const r = await fetch(url);
  return r.json();
}
// Lista os formulários da página (paginado). Requer pages_manage_ads.
async function listForms(pageId: string, token: string): Promise<{ forms: { id: string; name: string }[]; permErro: string | null }> {
  const forms: { id: string; name: string }[] = [];
  let url: string | null = `${GRAPH}/${pageId}/leadgen_forms?fields=id,name&limit=100&access_token=${token}`;
  while (url) {
    const d: any = await graphGet(url);
    if (d.error) return { forms, permErro: d.error.message || "erro ao listar formulários" };
    for (const f of d.data || []) forms.push({ id: String(f.id), name: f.name || "" });
    url = d.paging?.next || null;
  }
  return { forms, permErro: null };
}
// Puxa leads de um formulário desde cutoffUnix (paginado).
async function fetchFormLeads(formId: string, token: string, cutoffUnix: number): Promise<any[]> {
  const filtering = JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: cutoffUnix }]);
  const fields = "id,created_time,field_data,campaign_name,adset_name,ad_name,form_id";
  let url: string | null = `${GRAPH}/${formId}/leads?fields=${fields}&filtering=${encodeURIComponent(filtering)}&limit=200&access_token=${token}`;
  const rows: any[] = [];
  while (url) {
    const d: any = await graphGet(url);
    if (d.error) break;
    rows.push(...(d.data || []));
    url = d.paging?.next || null;
  }
  return rows;
}

// Monta a linha do lead a partir do objeto do Graph (mapeamento de UTMs definido com o usuário).
function montarLead(orgId: string | null, lead: any) {
  const m = mapMetaFields(lead.field_data || []);
  const email = m.email ? String(m.email) : null;
  return {
    row: {
      org_id: orgId,
      crm_origem: "meta_leads",
      crm_external_id: String(lead.id),
      nome: m.nome,
      email,
      telefone: m.telefone ? String(m.telefone) : null,
      whatsapp: m.whatsapp ? String(m.whatsapp) : (m.telefone ? String(m.telefone) : null),
      cidade: m.cidade ? String(m.cidade) : null,
      utm_source: "Facebook Lead Ads",
      utm_medium: lead.adset_name ?? null,
      utm_campaign: lead.campaign_name ?? null,
      utm_content: lead.ad_name ?? null,
      utm_term: "lead_ads",
      campaign_name: lead.campaign_name ?? null,
      ad_name: lead.ad_name ?? null,
      data_lead: lead.created_time || new Date().toISOString(),
      custom: m.custom,
      payload: { meta: lead },
    },
    email,
  };
}

async function syncOrg(supabase: any, orgId: string, dias: number, dry: boolean) {
  const cutoffMs = Date.now() - Math.max(1, dias) * 24 * 3600 * 1000;
  const cutoffUnix = Math.floor(cutoffMs / 1000);

  const { data: paginas } = await supabase.from("meta_lead_paginas").select("page_id, page_token, page_name, ativo").eq("org_id", orgId).eq("ativo", true);
  if (!paginas?.length) return { recebidos: 0, ja_tinha: 0, inseridos: 0, atualizados: 0, total: 0, detalhes: "✅ Nenhuma página Meta ativa.", periodo: "", avisos: ["sem página ativa"] };

  // Snapshot dos leads da org p/ dedupe e enriquecimento.
  const nossos = await fetchAllLeads(supabase, "id, email, telefone, crm_external_id, crm_origem, utm_campaign, utm_content, utm_medium", orgId);
  const porExt = new Map<string, any>();
  const porEmail = new Map<string, any>();
  const porTel = new Map<string, any>();
  for (const l of nossos || []) {
    if (l.crm_external_id) porExt.set(String(l.crm_external_id), l);
    const e = norm(l.email || ""); if (e && !porEmail.has(e)) porEmail.set(e, l);
    const t = normalizarTelefone(l.telefone); if (t && !porTel.has(t)) porTel.set(t, l);
  }

  const avisos: string[] = [];
  let recebidos = 0;
  const rowsToInsert: any[] = [];
  const inseridosInfo: { nome: string; email: string; ad: string }[] = [];
  const updates: { id: string; campos: any }[] = [];
  let jaTinha = 0;

  for (const pg of paginas) {
    if (!pg.page_token) { avisos.push(`página ${pg.page_name || pg.page_id} sem token`); continue; }
    const { forms, permErro } = await listForms(String(pg.page_id), String(pg.page_token));
    if (permErro) { avisos.push(`página ${pg.page_name || pg.page_id}: ${permErro}`); continue; }
    for (const form of forms) {
      const leads = await fetchFormLeads(form.id, String(pg.page_token), cutoffUnix);
      recebidos += leads.length;
      for (const lead of leads) {
        const { row, email } = montarLead(orgId, lead);
        const ext = String(lead.id);
        const tel = normalizarTelefone(row.telefone);
        const existente = porExt.get(ext) || (tel ? porTel.get(tel) : null) || (email ? porEmail.get(norm(email)) : null);
        if (existente) {
          jaTinha++;
          // Enriquece se faltar rastreio.
          const faltaUtm = !existente.utm_campaign || !existente.utm_content || !existente.utm_medium;
          if (faltaUtm && existente.crm_origem === "meta_leads") {
            updates.push({ id: existente.id, campos: {
              utm_campaign: existente.utm_campaign || row.utm_campaign,
              utm_content: existente.utm_content || row.utm_content,
              utm_medium: existente.utm_medium || row.utm_medium,
              utm_term: "lead_ads",
              campaign_name: row.campaign_name,
              ad_name: row.ad_name,
            } });
          }
          continue;
        }
        rowsToInsert.push(row);
        porExt.set(ext, row); if (email) porEmail.set(norm(email), row); if (tel) porTel.set(tel, row);
        inseridosInfo.push({ nome: String(row.nome || "(sem nome)"), email: email || "", ad: String(row.ad_name || "") });
      }
    }
  }

  let inseridos = 0, atualizados = 0;
  const det: string[] = [];
  if (!dry) {
    if (rowsToInsert.length) {
      // upsert com ignoreDuplicates: o índice único (org_id, telefone_norm) é a rede
      // de segurança — um conflito ignora a linha em vez de derrubar o lote inteiro.
      const { error } = await supabase.from("leads").upsert(rowsToInsert, { onConflict: "org_id,telefone_norm", ignoreDuplicates: true });
      if (error) det.push(`⚠️ erro ao inserir: ${error.message}`); else inseridos = rowsToInsert.length;
    }
    for (const u of updates) {
      const { error } = await supabase.from("leads").update(u.campos).eq("id", u.id);
      if (!error) atualizados++;
    }
  } else {
    inseridos = rowsToInsert.length; atualizados = updates.length;
  }

  if (inseridosInfo.length) {
    det.push("🆕 Faltavam no nosso banco:");
    for (const i of inseridosInfo) det.push(`✅ ${i.nome} · ${i.email}${i.ad ? ` · ${i.ad}` : ""} — inserido`);
  } else det.push("✅ Nenhum lead novo no período.");
  if (atualizados) det.push(`♻️ ${atualizados} lead(s) tiveram o rastreio (campanha/conjunto/criativo) preenchido.`);
  if (avisos.length) det.push("", "⚠️ " + avisos.join(" · "));

  const total = (nossos || []).length + inseridos;
  return {
    recebidos, ja_tinha: jaTinha, inseridos, atualizados, total,
    detalhes: det.join("\n"), periodo: `desde ${fmtBRdt(new Date(cutoffMs))}`, avisos,
  };
}

// ===================== Handler =====================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const supabase = svc();
    const body = await req.json().catch(() => ({}));
    const dry = body.dry === true;
    const wantNotificar = body.notificar !== false;
    const dias = Number(body.dias) > 0 ? Number(body.dias) : 7;

    // Resolve as orgs a processar.
    let orgId = (body.org_id as string) || null;
    if (!orgId) {
      const slug = req.headers.get("x-org-slug");
      if (slug) { const { data: o } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle(); orgId = o?.id || null; }
    }
    let orgIds: string[] = [];
    if (orgId) orgIds = [orgId];
    else {
      const { data } = await supabase.from("meta_lead_paginas").select("org_id").eq("ativo", true);
      orgIds = [...new Set((data || []).map((r: any) => r.org_id).filter(Boolean))];
    }
    if (!orgIds.length) return json({ ok: true, processados: 0, msg: "nenhuma página Meta ativa" });

    const resultados: any[] = [];
    for (const oid of orgIds) {
      try {
        const r = await syncOrg(supabase, oid, dias, dry);
        const vars: Record<string, string | number> = {
          crm: "Meta Lead Ads", data: fmtBRdt(new Date()), periodo: r.periodo,
          recebidos: r.recebidos, ja_tinha: r.ja_tinha, inseridos: r.inseridos, atualizados: r.atualizados, total: r.total, detalhes: r.detalhes,
        };
        const enviados = await notificar(supabase, oid, vars, dry, wantNotificar);
        resultados.push({ org_id: oid, ok: true, recebidos: r.recebidos, ja_tinha: r.ja_tinha, inseridos: r.inseridos, atualizados: r.atualizados, total: r.total, enviados, avisos: r.avisos });
      } catch (e) {
        resultados.push({ org_id: oid, erro: e instanceof Error ? e.message : "erro" });
      }
    }
    return json({ ok: true, processados: resultados.length, resultados });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});
