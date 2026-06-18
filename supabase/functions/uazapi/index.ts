import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
};

// ===================================================================
// Endpoints do UAZAPI. Ajuste aqui caso a sua instância use caminhos
// diferentes. Por padrão o UAZAPI usa:
//   - header "admintoken" para criar/instanciar
//   - header "token" para operações da instância (status, send, grupos)
// ===================================================================
// Servidor e admin token GLOBAIS (modelo revenda — a conta UAZAPI é do dono do SaaS).
const BASE = (Deno.env.get("UAZAPI_SERVER_URL") || "").replace(/\/$/, "");
const ADMIN = Deno.env.get("UAZAPI_ADMIN_TOKEN") || "";

const UAZAPI = {
  init: () => `${BASE}/instance/init`,
  del: () => `${BASE}/instance`,
  connect: () => `${BASE}/instance/connect`,
  disconnect: () => `${BASE}/instance/disconnect`,
  status: () => `${BASE}/instance/status`,
  groups: () => `${BASE}/group/list`,
  sendText: () => `${BASE}/send/text`,
};

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Resolve a organização ATIVA (multi-tenant N:N):
//   1) header `x-org-slug` (UI do cliente) → org por slug, validando acesso
//      (super_admin acessa qualquer org; demais precisam de membership ativa).
//   2) legado: profiles.org_id (contas antigas 1:1).
//   3) body.org_id (chamadas internas dos triggers, com service role).
async function getOrgId(supabase: any, req: Request, body: any): Promise<string | null> {
  const slug = req.headers.get("x-org-slug");
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (token) {
    const { data: u } = await supabase.auth.getUser(token);
    if (u?.user) {
      const userId = u.user.id;
      const { data: p } = await supabase.from("profiles").select("org_id, papel").eq("id", userId).maybeSingle();
      if (slug) {
        const { data: org } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle();
        if (org?.id) {
          if (p?.papel === "super_admin") return org.id as string;
          const { data: mem } = await supabase.from("memberships")
            .select("org_id").eq("user_id", userId).eq("org_id", org.id).eq("status", "ativo").maybeSingle();
          if (mem) return org.id as string;
        }
      }
      if (p?.org_id) return p.org_id as string;
    }
  }
  return body?.org_id ?? null;
}

// Token de uma instância conectada da org (para enviar mensagens).
async function getOrgToken(supabase: any, orgId: string | null): Promise<string | null> {
  if (!orgId) return null;
  const { data } = await supabase.from("whatsapp_instancias")
    .select("instance_token,status").eq("org_id", orgId).not("instance_token", "is", null);
  const list = data || [];
  const conn = list.find((i: any) => i.status === "connected");
  return (conn || list[0])?.instance_token || null;
}

// Limite de instâncias do plano da org.
async function limiteInstancias(supabase: any, orgId: string): Promise<number> {
  const { data: org } = await supabase.from("organizations").select("plano_id").eq("id", orgId).maybeSingle();
  if (!org?.plano_id) return 0;
  const { data: pl } = await supabase.from("planos").select("max_instancias").eq("id", org.plano_id).maybeSingle();
  return pl?.max_instancias ?? 0;
}

async function uazFetch(path: string, token: string, body?: unknown, method?: string, admintoken?: string) {
  const res = await fetch(path, {
    method: method || (body !== undefined ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", token, admintoken: admintoken || token },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(json?.error || json?.message || `WhatsApp API ${res.status}`);
  return json;
}

// Substitui {{var}} pelos valores do mapa
function render(template: string, vars: Record<string, string | number>): string {
  // Remove linhas cujos placeholders ficaram todos vazios (ex.: Investimento/Time sem dado).
  return template
    .split("\n")
    .filter((linha) => {
      const ph = linha.match(/\{\{\s*\w+\s*\}\}/g);
      if (!ph) return true; // linha sem placeholder (cabeçalho/rodapé) — mantém
      const algumPreenchido = ph.some((p) => {
        const k = p.replace(/[{}\s]/g, "");
        return vars[k] != null && String(vars[k]).trim() !== "";
      });
      return algumPreenchido;
    })
    .join("\n")
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
}

const fmtBRL = (n: number) => `R$ ${(Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Envia uma mensagem de texto via UAZAPI
async function enviarTexto(token: string | null, destinatario: string, mensagem: string) {
  if (!BASE || !token) throw new Error("WhatsApp não conectado para esta organização");
  return uazFetch(UAZAPI.sendText(), token, { number: destinatario, text: mensagem });
}

// Lista de destinatários de uma notificação (novo formato `destinatarios` ou legado)
function destinatariosDe(n: any, soNumeros = false): string[] {
  if (Array.isArray(n.destinatarios) && n.destinatarios.length) {
    return n.destinatarios
      .filter((d: any) => !soNumeros || d.tipo === "numero")
      .map((d: any) => d.valor).filter(Boolean);
  }
  if (soNumeros && n.destinatario_tipo !== "numero") return [];
  return n.destinatario ? [n.destinatario] : [];
}

// Grava uma linha no Google Sheets (via função google-sheets) se ativo na notificação.
async function enviarSheets(n: any, vars: Record<string, string | number>) {
  if (!n.sheets_ativo || !n.sheets_spreadsheet_id || !n.sheets_aba) return;
  const mapa = n.sheets_mapa || {};
  const valores: Record<string, string> = {};
  for (const [col, tpl] of Object.entries(mapa)) {
    if (!tpl) continue;
    valores[col] = render(String(tpl), vars);
  }
  if (Object.keys(valores).length === 0) return;
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/google-sheets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ action: "append", org_id: n.org_id, spreadsheet_id: n.sheets_spreadsheet_id, aba: n.sheets_aba, valores }),
    });
  } catch (e) { console.log("Sheets append falhou:", (e as any)?.message || e); }
}

// "vip_duplo" -> "Vip Duplo", "convite" -> "Convite" (tira _ e capitaliza cada palavra)
function formatTipo(s: string): string {
  return (s || "").split(/[_\s]+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// Status do pagamento como texto amigável (igual à planilha): "Pagamento aprovado" etc.
const STATUS_LABEL: Record<string, string> = {
  aprovada: "Pagamento aprovado",
  pendente: "Pagamento pendente",
  cancelada: "Pagamento cancelado",
  reembolsada: "Pagamento reembolsado",
};
function formatStatus(s: string): string {
  return STATUS_LABEL[(s || "").toLowerCase()] || formatTipo(s);
}

// Monta as variáveis a partir de uma venda
function varsDaVenda(v: any): Record<string, string | number> {
  return {
    nome: v.nome_comprador || "",
    email: v.email_comprador || "",
    telefone: v.telefone_comprador || "",
    documento: v.documento || "",
    produto: v.produto || "",
    cidade: v.cidade || "",
    valor: fmtBRL(v.valor || 0),
    tipo: formatTipo(v.tipo_ingresso || ""),
    status: formatStatus(v.status || ""),
    quantidade: v.quantidade || 1,
    pagamento: v.metodo_pagamento || "",            // legado (mantido p/ templates antigos)
    forma_pagamento: formatTipo(v.metodo_pagamento || ""),
    data: v.data_venda ? new Date(v.data_venda).toLocaleDateString("pt-BR") : "",
  };
}

function varsDaLead(l: any): Record<string, string | number> {
  return {
    nome: l.nome || "",
    email: l.email || "",
    telefone: l.telefone || l.whatsapp || "",
    cidade: l.cidade || "",
    status: l.status || "",
    campanha: l.campaign_name || "",
    origem: l.utm_source || (l.clint_deal_id ? "Inserido Manual" : ""),
    anuncio: l.ad_name || "",
    instagram: l.instagram || "",
    data: l.data_lead ? new Date(l.data_lead).toLocaleDateString("pt-BR") : "",
    capacidade: (l.custom && l.custom.capacidade_investimento) || l.faturamento || "",
    tempo: (l.custom && l.custom.quando_iniciar) || "",
    utm_source: l.utm_source || "",
    utm_campaign: l.utm_campaign || "",
    utm_medium: l.utm_medium || "",
    utm_content: l.utm_content || "",
  };
}

// ---- Meta Ads (server-side, usa token salvo no banco) ----
function slugVariants(slug: string): string[] {
  return (slug || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function stripLower(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
const META_EXCLUDE = ["lead", "meteorico"];
function campMatch(name: string, variants: string[]): boolean {
  const n = (name || "").toLowerCase();
  if (!variants.some((v) => n.includes(v))) return false;
  const na = stripLower(name);
  if (META_EXCLUDE.some((t) => na.includes(t))) return false;
  return true;
}
const GRAPH = "https://graph.facebook.com/v21.0";

async function metaSpend(meta: any, slug: string): Promise<number> {
  const variants = slugVariants(slug);
  // Considera apenas campanhas ATIVAS que casam o slug (ignora antigas/pausadas
  // de eventos passados que tenham o mesmo slug no nome).
  const cj = await (await fetch(`${GRAPH}/${meta.account_id}/campaigns?fields=id,name,status&limit=500&access_token=${meta.access_token}`)).json();
  const ativos = new Set<string>((cj.data || []).filter((c: any) => c.status === "ACTIVE" && campMatch(c.name, variants)).map((c: any) => c.name));
  if (ativos.size === 0) return 0;
  const r = await fetch(`${GRAPH}/${meta.account_id}/insights?level=campaign&fields=spend,campaign_name&date_preset=maximum&limit=500&access_token=${meta.access_token}`);
  const j = await r.json();
  let spend = 0;
  for (const row of j.data || []) if (ativos.has(row.campaign_name)) spend += parseFloat(row.spend) || 0;
  return spend;
}
async function metaDailyBudget(meta: any, slug: string): Promise<number> {
  const variants = slugVariants(slug);
  const cj = await (await fetch(`${GRAPH}/${meta.account_id}/campaigns?fields=id,name,daily_budget,status&limit=500&access_token=${meta.access_token}`)).json();
  const camps = (cj.data || []).filter((c: any) => c.status === "ACTIVE" && campMatch(c.name, variants));
  let total = 0; const need = new Set<string>();
  for (const c of camps) { if (c.daily_budget && +c.daily_budget > 0) total += +c.daily_budget / 100; else need.add(c.id); }
  if (need.size) {
    const aj = await (await fetch(`${GRAPH}/${meta.account_id}/adsets?fields=daily_budget,status,campaign&limit=500&access_token=${meta.access_token}`)).json();
    for (const a of aj.data || []) {
      if (a.campaign?.id && need.has(a.campaign.id) && a.status === "ACTIVE" && a.daily_budget && +a.daily_budget > 0) total += +a.daily_budget / 100;
    }
  }
  return total;
}

// Calcula um resumo de cidade (métricas do banco + Meta, se o token estiver salvo)
async function resumoCidade(supabase: any, cidadeSlug: string | null) {
  // Usa a MESMA RPC do dashboard (filtra por cidade no servidor) para o report
  // bater com os números do dashboard e evitar o limite de 1000 linhas que
  // subcontava cidades quando carregávamos todas as vendas e filtrávamos no JS.
  // Janela de 90 dias para trás: evita misturar vendas de um evento anterior
  // na MESMA cidade (eventos podem se repetir). 90 dias é seguro entre eventos.
  const inicio90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data } = await supabase.rpc("buscar_vendas", {
    p_status: "aprovada",
    p_start: inicio90,
    p_end: "2030-01-01T00:00:00Z",
    p_city_slug: cidadeSlug || null,
  });
  const rows = (data || []) as any[];

  // Usa o nome COMPLETO do produto que vem nas vendas (com a data),
  // ex.: "Workshop Scale | Porto Alegre - RS | 09/06/2026" — ignora upgrades.
  const prodCount: Record<string, number> = {};
  for (const r of rows) {
    const p = (r.produto || "").trim();
    if (p && !p.toLowerCase().includes("upgrade")) prodCount[p] = (prodCount[p] || 0) + 1;
  }
  const cidadeNome = Object.keys(prodCount).sort((a, b) => prodCount[b] - prodCount[a])[0]
    || (rows.find((r: any) => r.produto)?.produto)
    || cidadeSlug || "Todas";

  let participantes = 0, pagantes = 0, vips = 0, convidados = 0, bilheteria = 0;
  for (const r of rows) {
    const qty = r.quantidade || 1; const valor = Number(r.valor) || 0; bilheteria += valor;
    const prod = (r.produto || "").toLowerCase();
    if (prod.includes("upgrade")) { vips += qty; continue; }
    participantes += qty;
    if ((r.tipo_ingresso || prod).toLowerCase().includes("vip")) vips += qty;
    const convite = (r.tipo_ingresso || "").toLowerCase().includes("convite") || valor === 0;
    if (convite) convidados += qty; else pagantes += qty;
  }

  let investimento = "-", cac = "-", projecao = "-", projecao_investimento = "-";
  let spendNum = 0;
  const meta = (await supabase.from("meta_config").select("*").maybeSingle()).data;
  if (meta?.access_token && meta?.account_id && cidadeSlug) {
    try {
      const spend = await metaSpend(meta, cidadeSlug);
      spendNum = spend;
      investimento = fmtBRL(spend);
      const cacNum = pagantes > 0 && spend > 0 ? spend / pagantes : 0;
      if (cacNum > 0) cac = fmtBRL(cacNum);
      // Projeções (precisam da data do evento + orçamento diário)
      const { data: cid } = await supabase.from("cidades").select("data_evento").eq("slug", cidadeSlug).maybeSingle();
      if (cid?.data_evento) {
        const budget = await metaDailyBudget(meta, cidadeSlug);
        // Dias restantes (fuso SP): dia do evento só capta até 12h; depois disso zera.
        const spDate = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        const ev = spDate(new Date(cid.data_evento));
        const agora = spDate(new Date());
        const evDia = Date.UTC(ev.getFullYear(), ev.getMonth(), ev.getDate());
        const hojeDia = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
        const diffDias = Math.round((evDia - hojeDia) / 86400000);
        const dias = diffDias < 0 ? 0 : diffDias === 0 ? (agora.getHours() < 12 ? 0.5 : 0) : diffDias + 0.5;
        if (budget > 0) {
          // Investimento projetado = gasto atual + orçamento diário × dias restantes
          projecao_investimento = fmtBRL(spend + budget * dias);
          if (cacNum > 0) projecao = String(Math.ceil(participantes + (budget / cacNum) * dias));
        }
      }
    } catch (_) { /* mantém "-" */ }
  }

  return {
    cidade: cidadeNome,
    participantes, vips, convidados,
    bilheteria: fmtBRL(bilheteria),
    bilheteria_resultado: fmtBRL(bilheteria - spendNum), // Bilheteria (+/-): bilheteria menos investimento
    cac, projecao, investimento, projecao_investimento,
    _bilheteriaNum: bilheteria, _investimentoNum: spendNum,
  };
}

// Data de hoje (YYYY-MM-DD) em horário de São Paulo.
function hojeSPstr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
// Cidade ATIVA = evento de hoje em diante. Compara só a data (YYYY-MM-DD) para
// evitar erros de fuso. Sem data_evento => não bloqueia (legado).
function eventoAtivo(dataEvento: string | null): boolean {
  if (!dataEvento) return true;
  return String(dataEvento).slice(0, 10) >= hojeSPstr();
}
// Data do evento (YYYY-MM-DD) no fuso de São Paulo.
function eventoDataSP(dataEvento: string | null): string {
  if (!dataEvento) return "";
  return new Date(dataEvento).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
// Slugs das cidades cujo evento é HOJE (respeitando a cidade específica da notificação, se houver).
async function slugsEventoHoje(supabase: any, n: any): Promise<string[]> {
  const { data: cids } = await supabase.from("cidades").select("slug,data_evento");
  const hoje = hojeSPstr();
  const eventoHoje = (cids || []).filter((c: any) => eventoDataSP(c.data_evento) === hoje);
  if (!n.cidade_slug) return eventoHoje.map((c: any) => c.slug);
  const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]/g, "");
  const parts = String(n.cidade_slug).split(",").map((p: string) => norm(p)).filter(Boolean);
  return eventoHoje
    .filter((c: any) => { const cs = norm(c.slug); return parts.some((p) => p === cs || cs.includes(p) || p.includes(cs)); })
    .map((c: any) => c.slug);
}

// Resumo consolidado de todas as cidades ativas (gatilho resumo_geral).
async function resumoGeral(supabase: any): Promise<Record<string, string | number>> {
  const { data: cids } = await supabase.from("cidades").select("slug,data_evento");
  const ativas = (cids || []).filter((c: any) => eventoAtivo(c.data_evento));
  let participantes = 0, bilheteria = 0, investimento = 0;
  for (const c of ativas) {
    const r = await resumoCidade(supabase, c.slug);
    participantes += Number(r.participantes) || 0;
    bilheteria += Number(r._bilheteriaNum) || 0;
    investimento += Number(r._investimentoNum) || 0;
  }
  return {
    total_cidades: ativas.length,
    participantes_total: participantes,
    bilheteria_total: fmtBRL(bilheteria),
    investimento_total: fmtBRL(investimento),
    bilheteria_resultado_total: fmtBRL(bilheteria - investimento), // Bilheteria (+/-) consolidada
    data: new Date().toLocaleDateString("pt-BR"),
  };
}

// Gasto total no período somando as contas conectadas (account_ids do meta_config).
async function metaSpendDia(token: string, accs: string[], since: string, until: string): Promise<number> {
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  if (accs.length === 0) return 0;
  let s = 0;
  for (const acc of accs) {
    try {
      const r = await fetch(`${GRAPH}/${acc}/insights?fields=spend&time_range=${tr}&access_token=${token}`);
      const j = await r.json();
      for (const row of j.data || []) s += parseFloat(row.spend) || 0;
    } catch { /* ignora conta sem dados */ }
  }
  return s;
}

// Diário de Performance: métricas do DIA ANTERIOR (investimento, leads, CPL, MQL, CPL/MQL, taxa MQL).
// Gasto de um canal Meta no dia (campanhas que casam o slug; sem slug = todas as campanhas das contas).
async function metaSpendCanalDia(token: string, accounts: string[], slug: string, day: string): Promise<number> {
  const tr = encodeURIComponent(JSON.stringify({ since: day, until: day }));
  const variants = slugVariants(slug);
  let s = 0;
  for (const acc of accounts) {
    try {
      const r = await fetch(`${GRAPH}/${acc}/insights?level=campaign&fields=spend,campaign_name&time_range=${tr}&limit=500&access_token=${token}`);
      const j = await r.json();
      for (const row of j.data || []) {
        if (variants.length && !variants.some((v) => (row.campaign_name || "").toLowerCase().includes(v))) continue;
        s += parseFloat(row.spend) || 0;
      }
    } catch { /* ignora */ }
  }
  return s;
}

async function resumoDiarioPerformance(supabase: any, orgId: string | null, canaisIds?: string[]): Promise<Record<string, string | number>> {
  const now = new Date();
  const ini = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 3, 0, 0));
  const fim = new Date(ini.getTime() + 86400000 - 1);
  const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ontemStr = ini.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Canais: os selecionados; sem seleção = todos Meta+Google (padrão).
  let pq = supabase.from("produtos").select("id, nome, plataforma, conta_id, slug, slug_source, google_conta_id, investimento_manual, ativo");
  if (orgId) pq = pq.eq("org_id", orgId);
  const { data: prods } = await pq;
  let canais = (prods as any[]) || [];
  if (Array.isArray(canaisIds) && canaisIds.length) canais = canais.filter((p) => canaisIds.includes(p.id));
  else canais = canais.filter((p) => p.plataforma === "meta" || p.plataforma === "google");

  // Leads do dia, filtrados pelos utm_source dos canais (slug_source). Sem alvos = todos.
  const alvos: string[] = [];
  for (const c of canais) for (const v of String(c.slug_source || "").split(",")) { const n = norm(v.trim()); if (n) alvos.push(n); }
  // data_lead é gravado como data em meia-noite UTC para parte dos leads, então a
  // janela de leads usa limites de DIA EM UTC (o gasto do Meta segue o dia BR).
  // Caso contrário, leads de 00:00Z caíam no dia anterior (MQL sumia do dia certo).
  const [ly, lm, ld] = ymd(ini).split("-").map(Number);
  const leadIni = new Date(Date.UTC(ly, lm - 1, ld, 0, 0, 0));
  const leadFim = new Date(Date.UTC(ly, lm - 1, ld + 1, 0, 0, 0) - 1);
  let q = supabase.from("leads").select("custom, utm_source").gte("data_lead", leadIni.toISOString()).lte("data_lead", leadFim.toISOString());
  if (orgId) q = q.eq("org_id", orgId);
  const { data: leadsRaw } = await q;
  const leads = (leadsRaw || []).filter((l: any) => alvos.length === 0 || (l.utm_source && alvos.some((a) => norm(l.utm_source).includes(a))));

  let cq = supabase.from("lead_campos").select("chave,padrao,mql_valores");
  if (orgId) cq = cq.eq("org_id", orgId);
  const { data: campos } = await cq;
  const triggers = ((campos as any[]) || [])
    .filter((c) => Array.isArray(c.mql_valores) && c.mql_valores.length)
    .map((c) => ({ chave: c.chave, padrao: !!c.padrao, valores: new Set((c.mql_valores as any[]).map((v) => String(v).trim())) }));
  const isMql = (l: any) => triggers.some((t) => {
    const raw = t.padrao ? l[t.chave] : l.custom?.[t.chave];
    return raw != null && t.valores.has(String(raw).trim());
  });
  const totalLeads = leads.length;
  const mql = leads.filter(isMql).length;

  // Token + contas conectadas do Meta.
  const { data: cfgs } = await supabase.from("meta_config")
    .select("account_id, contas, access_token, token_expires_at").not("access_token", "is", null)
    .order("token_expires_at", { ascending: false });
  const metaToken = (cfgs as any[])?.[0]?.access_token as string | undefined;
  const accSet = new Set<string>();
  for (const c of (cfgs as any[]) || []) {
    if (Array.isArray(c.contas)) for (const a of c.contas) accSet.add(String(a).startsWith("act_") ? a : `act_${a}`);
    if (c.account_id) accSet.add(c.account_id);
  }

  // Investimento agregado dos canais selecionados.
  let inv = 0;
  for (const c of canais) {
    if (c.plataforma === "meta" && metaToken) {
      const accs = c.conta_id ? [c.conta_id] : [...accSet];
      try { inv += await metaSpendCanalDia(metaToken, accs, c.slug || "", ymd(ini)); } catch { /* off */ }
    } else if (c.plataforma === "none" && c.investimento_manual != null) {
      // Investimento manual = TOTAL do mês corrente até hoje. Para o resumo de
      // 1 dia, rateia: diária = total / (dia do mês atual em SP). Sem isso o
      // diário somava o total inteiro (puxava o mês todo em vez do dia).
      const diaAtual = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-")[2]) || 1;
      inv += (Number(c.investimento_manual) || 0) / diaAtual;
    }
    // google: API ainda sem acesso (Basic Access pendente) → soma 0 por ora.
  }

  const cpl = totalLeads ? inv / totalLeads : 0;
  const cplMql = mql ? inv / mql : 0;
  const taxaMql = totalLeads ? (mql / totalLeads) * 100 : 0;
  return {
    investimento: fmtBRL(inv),
    leads: totalLeads,
    cpl: fmtBRL(cpl),
    mql,
    cpl_mql: fmtBRL(cplMql),
    taxa_mql: `${taxaMql.toFixed(1)}%`,
    data: ontemStr,
  };
}

// Slugs a processar: 1 por cidade ATIVA (evento >= hoje) quando "todas",
// senão a cidade específica da notificação.
async function slugsDaNotif(supabase: any, n: any): Promise<(string | null)[]> {
  const { data: cids } = await supabase.from("cidades").select("slug,data_evento");
  const lista = (cids || []) as any[];

  // "Todas as cidades": só as ATIVAS (evento de hoje em diante).
  if ((n.gatilho === "resumo_cidade" || n.gatilho === "manual") && !n.cidade_slug) {
    return lista.filter((c) => eventoAtivo(c.data_evento)).map((c) => c.slug);
  }

  // Cidade específica: NUNCA envia se o evento já passou (cidade inativa).
  const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]/g, "");
  const parts = String(n.cidade_slug || "").split(",").map((p: string) => norm(p)).filter(Boolean);
  const cidade = lista.find((c) => {
    const cs = norm(c.slug);
    return parts.some((p) => p === cs || cs.includes(p) || p.includes(cs));
  });
  // Se a cidade está cadastrada e o evento passou, bloqueia. Sem match => legado (envia).
  if (cidade && !eventoAtivo(cidade.data_evento)) return [];
  return [n.cidade_slug || null];
}

// Lista de conjuntos de variáveis: 1 por cidade ativa (resumo) ou 1 (venda/geral)
async function buildVarsList(supabase: any, n: any): Promise<Record<string, string | number>[]> {
  if (n.gatilho === "nova_venda") {
    return [varsDaVenda({ nome_comprador: "Fulano (teste)", produto: "Workshop Scale | Belém - PA", cidade: "Belém", valor: 247, tipo_ingresso: "individual", quantidade: 1, metodo_pagamento: "pix", data_venda: new Date().toISOString() })];
  }
  if (n.gatilho === "novo_lead") {
    return [varsDaLead({ nome: "Fulano (teste)", email: "teste@email.com", telefone: "(11) 99999-0000", cidade: "Belém", status: "lead", campaign_name: "Campanha Teste", utm_source: "facebook", data_lead: new Date().toISOString() })];
  }
  if (n.gatilho === "sync_concluido") {
    return [{
      data: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      periodo: "desde 16/06/2026 08:00",
      clint: 27, ja_tinha: 25, inseridos: 2, total: 27,
      detalhes: "🆕 Faltavam no nosso banco:\n✅ Fulano (teste) · teste@email.com · SQL — inserido\n   ↳ Motivo provável: provável falha/timeout do webhook no momento do envio",
    }];
  }
  if (n.gatilho === "resumo_geral") {
    return [await resumoGeral(supabase)];
  }
  if (n.gatilho === "diario_performance") {
    return [await resumoDiarioPerformance(supabase, n.org_id, Array.isArray(n.canais) ? n.canais : undefined)];
  }
  const slugs = await slugsDaNotif(supabase, n);
  const out: Record<string, string | number>[] = [];
  for (const slug of slugs) out.push(await resumoCidade(supabase, slug));
  return out;
}

Deno.serve(async (req) => {
  console.log("uazapi v21 - resend_log");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = svc();
    const { action, ...payload } = await req.json();
    const orgId = await getOrgId(supabase, req, payload);

    // helper: busca uma instância da org pelo id (com validação de propriedade)
    const getInstancia = async (id: string) => {
      const { data } = await supabase.from("whatsapp_instancias").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
      return data;
    };

    switch (action) {
      // ---------- Gestão de instâncias (modelo revenda) ----------
      case "list_instances": {
        if (!orgId) return json({ instancias: [], limite: 0 });
        const { data: inst } = await supabase.from("whatsapp_instancias").select("*").eq("org_id", orgId).order("created_at");
        return json({ instancias: inst || [], limite: await limiteInstancias(supabase, orgId) });
      }
      case "create_instance": {
        if (!orgId) return json({ error: "Organização não identificada" }, 401);
        if (!BASE || !ADMIN) return json({ error: "WhatsApp não configurado pelo administrador do sistema" }, 400);
        const limite = await limiteInstancias(supabase, orgId);
        const { count } = await supabase.from("whatsapp_instancias").select("*", { count: "exact", head: true }).eq("org_id", orgId);
        if (count !== null && count >= limite) return json({ error: `Limite do seu plano atingido (${limite} conexões de WhatsApp).` }, 400);
        const nome = String(payload.nome || "WhatsApp").slice(0, 40);
        const slug = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "whatsapp";
        const uazName = `${slug}-${Date.now().toString(36)}`;
        const data = await uazFetch(UAZAPI.init(), ADMIN, { name: uazName, systemName: nome });
        const inst = data.instance || data;
        const { data: row } = await supabase.from("whatsapp_instancias")
          .insert({ org_id: orgId, nome, instance_token: inst.token, status: inst.status || "desconectado" })
          .select().single();
        return json({ ok: true, instancia: row });
      }
      case "connect_instance": {
        const row = await getInstancia(payload.id);
        if (!row) return json({ error: "Instância não encontrada" }, 404);
        const data = await uazFetch(UAZAPI.connect(), row.instance_token, {});
        const inst = data.instance || {};
        const qrcode = inst.qrcode || data.qrcode || inst.paircode || null;
        const status = inst.status || (data.connected ? "connected" : "connecting");
        await supabase.from("whatsapp_instancias").update({ status }).eq("id", row.id);
        return json({ qrcode, status });
      }
      case "disconnect_instance": {
        const row = await getInstancia(payload.id);
        if (!row) return json({ error: "Instância não encontrada" }, 404);
        await uazFetch(UAZAPI.disconnect(), row.instance_token, {});
        await supabase.from("whatsapp_instancias").update({ status: "desconectado", numero: null }).eq("id", row.id);
        return json({ ok: true });
      }
      case "status_instance": {
        const row = await getInstancia(payload.id);
        if (!row) return json({ error: "Instância não encontrada" }, 404);
        const data = await uazFetch(UAZAPI.status(), row.instance_token);
        const inst = data.instance || {};
        const connected = inst.status === "connected" || data.connected === true;
        const status = connected ? "connected" : (inst.status || "desconectado");
        const numero = inst.owner || null;
        await supabase.from("whatsapp_instancias").update({ status, numero }).eq("id", row.id);
        return json({ status, numero, connected, qrcode: inst.qrcode || null });
      }
      case "delete_instance": {
        const row = await getInstancia(payload.id);
        if (!row) return json({ error: "Instância não encontrada" }, 404);
        // Remove PRIMEIRO na UAZAPI. Só apaga do banco se a UAZAPI confirmar a
        // remoção (ou se a instância já não existir lá — 404). Em qualquer outra
        // falha, mantém a linha para o usuário tentar de novo e NÃO criar órfã na
        // UAZAPI (que continua consumindo licença).
        if (row.instance_token) {
          try {
            await uazFetch(UAZAPI.del(), row.instance_token, undefined, "DELETE", ADMIN);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // 404 = já não existe na UAZAPI. "Invalid token"/401 = o token desta
            // instância não é mais reconhecido pelo servidor (instância já removida
            // ou recriada lá fora) — não dá para gerenciá-la via API de qualquer
            // forma, então liberamos a limpeza local para não prender a linha.
            if (!/404|not[ _]?found|não encontrad|invalid[ _]?token|401|unauthorized/i.test(msg)) {
              return json({ error: `Falha ao remover na UAZAPI: ${msg}. Tente novamente.` }, 502);
            }
          }
        }
        await supabase.from("whatsapp_instancias").delete().eq("id", row.id);
        return json({ ok: true });
      }
      case "resend_log": {
        // Reenvia um log que falhou. Em caso de sucesso, marca o MESMO log como
        // "enviado" e limpa o erro (fica verde no histórico). created_at é
        // preservado para não reordenar o histórico.
        if (!orgId) return json({ error: "Organização não identificada" }, 401);
        const { data: log } = await supabase.from("notificacao_logs").select("*").eq("id", payload.id).eq("org_id", orgId).maybeSingle();
        if (!log) return json({ error: "Log não encontrado" }, 404);
        const token = await getOrgToken(supabase, orgId);
        if (!token) return json({ error: "Conecte um WhatsApp antes de reenviar." }, 400);
        try {
          await enviarTexto(token, log.destinatario, log.mensagem);
          await supabase.from("notificacao_logs").update({ status: "enviado", erro: null }).eq("id", log.id);
          return json({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabase.from("notificacao_logs").update({ erro: msg }).eq("id", log.id);
          return json({ error: msg }, 502);
        }
      }
      case "groups": {
        const token = await getOrgToken(supabase, orgId);
        if (!token) return json({ groups: [] });
        const data = await uazFetch(UAZAPI.groups(), token);
        const list = data.groups || data.data || data || [];
        const groups = (Array.isArray(list) ? list : []).map((g: any) => ({
          id: g.JID || g.id || g.jid || g.gid || g.group_id,
          name: g.Name || g.name || g.subject || g.title || g.JID || g.id,
        })).filter((g: any) => g.id);
        return json({ groups });
      }
      case "send": {
        const token = await getOrgToken(supabase, orgId);
        await enviarTexto(token, payload.destinatario, payload.mensagem);
        return json({ success: true });
      }
      case "send_test": {
        const { data: n } = await supabase.from("notificacoes").select("*").eq("id", payload.notificacao_id).maybeSingle();
        if (!n) return json({ error: "Notificação não encontrada" }, 404);
        const token = await getOrgToken(supabase, orgId ?? n.org_id);
        if (!token) return json({ error: "Conecte um WhatsApp antes de enviar." }, 400);
        const ds = destinatariosDe(n);
        if (ds.length === 0) return json({ error: "Notificação sem destinatário" }, 400);
        // 1 mensagem por cidade ativa (quando "todas") — enviadas separadamente
        const varsList = await buildVarsList(supabase, n);
        let enviados = 0;
        const erros: string[] = [];
        for (const vars of varsList) {
          const msg = render(n.mensagem, vars) + "\n\n_(mensagem de teste)_";
          for (const dest of ds) {
            try {
              await enviarTexto(token, dest, msg);
              await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, org_id: n.org_id, destinatario: dest, mensagem: msg, status: "enviado", cidade: (vars as any).cidade || null });
              enviados++;
            } catch (e) {
              // Um número/cidade que falha não pode abortar o restante do lote.
              erros.push(`${(vars as any).cidade || ""} → ${dest}: ${e instanceof Error ? e.message : e}`);
              await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, org_id: n.org_id, destinatario: dest, mensagem: msg, status: "erro", erro: String(e), cidade: (vars as any).cidade || null });
            }
          }
          await enviarSheets(n, vars);
        }
        return json({ success: true, enviados, erros });
      }
      case "nova_venda": {
        // Chamado pelo trigger do banco quando uma venda é inserida
        const v = payload.venda;
        if (!v) return json({ error: "venda ausente" }, 400);
        // só as notificações da MESMA organização da venda
        const { data: notifs } = await supabase.from("notificacoes").select("*").eq("ativo", true).eq("gatilho", "nova_venda").eq("org_id", v.org_id);
        const tokenVenda = await getOrgToken(supabase, v.org_id);
        const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]/g, "");
        let enviados = 0;
        for (const n of notifs || []) {
          if (n.cidade_slug) {
            const parts = n.cidade_slug.split(",").map((p: string) => norm(p)).filter(Boolean);
            const match = parts.some((s) => norm(v.cidade || "").includes(s) || norm(v.produto || "").includes(s));
            if (!match) continue;
          }
          const vendaVars = varsDaVenda(v);
          const msg = render(n.mensagem, vendaVars);
          for (const dest of destinatariosDe(n)) {
            try {
              await enviarTexto(tokenVenda, dest, msg);
              await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, org_id: n.org_id, destinatario: dest, mensagem: msg, status: "enviado", cidade: v.cidade || null });
              enviados++;
            } catch (e) {
              await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, org_id: n.org_id, destinatario: dest, mensagem: msg, status: "erro", erro: String(e), cidade: v.cidade || null });
            }
          }
          await enviarSheets(n, vendaVars);
        }
        return json({ success: true, enviados });
      }
      case "novo_lead": {
        // Chamado pelo trigger do banco quando um lead é inserido
        const l = payload.lead;
        if (!l) return json({ error: "lead ausente" }, 400);
        const { data: notifs } = await supabase.from("notificacoes").select("*").eq("ativo", true).eq("gatilho", "novo_lead").eq("org_id", l.org_id);
        const tokenLead = await getOrgToken(supabase, l.org_id);
        const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]/g, "");
        // Origem do lead p/ filtro da notificação: meta = Lead Ads do Meta; crm = webhook/sync de CRM.
        const origemLead = l.crm_origem === "meta_leads" ? "meta" : "crm";
        let enviados = 0;
        for (const n of notifs || []) {
          if (n.origem_lead && n.origem_lead !== "ambos" && n.origem_lead !== origemLead) continue;
          if (n.cidade_slug) {
            const parts = n.cidade_slug.split(",").map((p: string) => norm(p)).filter(Boolean);
            const match = parts.some((s) => norm(l.cidade || "").includes(s));
            if (!match) continue;
          }
          const leadVars = varsDaLead(l);
          const msg = render(n.mensagem, leadVars);
          for (const dest of destinatariosDe(n)) {
            try {
              await enviarTexto(tokenLead, dest, msg);
              await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, org_id: n.org_id, destinatario: dest, mensagem: msg, status: "enviado", cidade: l.cidade || null });
              enviados++;
            } catch (e) {
              await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, org_id: n.org_id, destinatario: dest, mensagem: msg, status: "erro", erro: String(e), cidade: l.cidade || null });
            }
          }
          await enviarSheets(n, leadVars);
        }
        return json({ success: true, enviados });
      }
      case "run_scheduled": {
        // Chamado por um cron; envia os resumos cujo horário == agora (HH:MM)
        const agora = payload.horario || new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        const { data: notifs } = await supabase.from("notificacoes").select("*").eq("ativo", true).in("gatilho", ["resumo_cidade", "resumo_geral", "diario_performance"]);
        let enviados = 0;
        const hhmm = agora.slice(0, 5);
        const tokenCache = new Map<string, string | null>();
        const tokenDaOrg = async (oid: string | null) => {
          if (!oid) return null;
          if (!tokenCache.has(oid)) tokenCache.set(oid, await getOrgToken(supabase, oid));
          return tokenCache.get(oid)!;
        };
        for (const n of notifs || []) {
          // Disparo normal (ex.: 9h): todas as cidades ativas.
          const normalMatch = (n.horario || "").slice(0, 5) === hhmm;
          // Disparo extra NO DIA do evento (ex.: 12h): só a(s) cidade(s) com evento hoje.
          const eventoMatch = n.disparo_dia_evento && n.gatilho === "resumo_cidade"
            && (n.horario_evento || "12:00").slice(0, 5) === hhmm;
          if (!normalMatch && !eventoMatch) continue;

          let varsList: Record<string, string | number>[];
          if (normalMatch) {
            varsList = await buildVarsList(supabase, n);
          } else {
            // Só cidades cujo evento é hoje (ignora as demais).
            const slugs = await slugsEventoHoje(supabase, n);
            varsList = [];
            for (const slug of slugs) varsList.push(await resumoCidade(supabase, slug));
          }
          // No disparo do dia do evento: só números (ignora grupos). No normal: todos.
          const soEventoDia = eventoMatch && !normalMatch;
          const dests = destinatariosDe(n, soEventoDia);
          const tokenN = await tokenDaOrg(n.org_id);
          for (const vars of varsList) {
            const msg = render(n.mensagem, vars);
            for (const dest of dests) {
              try {
                await enviarTexto(tokenN, dest, msg);
                await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, org_id: n.org_id, destinatario: dest, mensagem: msg, status: "enviado", cidade: (vars as any).cidade || null });
                enviados++;
              } catch (e) {
                await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, org_id: n.org_id, destinatario: dest, mensagem: msg, status: "erro", erro: String(e), cidade: (vars as any).cidade || null });
              }
            }
            await enviarSheets(n, vars);
          }
        }
        return json({ success: true, enviados });
      }
      default:
        return json({ error: "ação desconhecida" }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "erro interno" }, 500);
  }
});
