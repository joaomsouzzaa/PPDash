import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Normaliza telefone BR p/ chave de dedup (últimos 11 díg., tira 55). Espelha _shared/telefone.ts.
function normalizarTelefone(raw?: string | null): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length > 11) d = d.slice(-11);
  return d || null;
}

// Dispatcher genérico de sincronização de CRM por organização.
// Lê public.integracoes (crm + credenciais + config) e despacha para o conector certo:
//   - clint:      pull dos /deals (igual ao antigo clint-sync), backfill por email/deal_id.
//   - rd_station: reprocessa public.webhook_eventos com status 'erro' (rede de segurança;
//                 a API do RD Marketing não lista leads, então o "pull" é reprocessar o que
//                 o webhook recebeu mas não conseguiu inserir).
// Comum: monta o relatório, envia no WhatsApp (gatilho `sync_concluido`), grava logs e
// atualiza integracoes.last_sync_*.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug" };

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const fmtBRdt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Busca TODOS os leads (paginado). PostgREST devolve no máx. 1000 linhas/request;
// sem paginar, o snapshot de dedup fica incompleto e o sync duplica/não vincula
// os leads além da linha 1000.
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
const getPath = (obj: any, path: string): any => path.split(".").reduce((acc: any, seg: string) => (acc == null ? undefined : acc[seg]), obj);

// ---- Render do template editável (mesmo do clint-sync) ----
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
  "• Recebidos do CRM: {{recebidos}}",
  "• Já tínhamos no banco: {{ja_tinha}}",
  "• Inseridos agora: {{inseridos}}",
  "• Total no nosso banco: {{total}}",
  "",
  "{{detalhes}}",
  "",
  "🤖 By: GoBot",
].join("\n");

async function notificar(supabase: any, orgId: string | null, vars: Record<string, string | number>, dry: boolean, notificar: boolean): Promise<number> {
  if (dry || !notificar) return 0;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const send = (destinatario: string, mensagem: string) =>
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}`, apikey: anon },
      body: JSON.stringify({ action: "send", org_id: orgId, destinatario, mensagem }),
      signal: AbortSignal.timeout(20000),
    });
  const { data: notifs } = await supabase.from("notificacoes").select("*").eq("ativo", true).eq("gatilho", "sync_concluido").eq("org_id", orgId);
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

// ===================== Conector CLINT =====================
function mapStatusClint(stage: string): string {
  const s = norm(stage);
  if (s === "sql") return "sql";
  if (s.includes("reuni") && s.includes("agendad")) return "reuniao_agendada";
  if (s.includes("reuni") && s.includes("realizad")) return "reuniao_realizada";
  if (s.includes("venda") || s.includes("ganho")) return "venda";
  return "lead";
}
async function syncClint(supabase: any, orgId: string | null, integ: any, body: any) {
  const CLINT = "https://api.clint.digital/v1";
  const token = integ?.credenciais?.api_token || Deno.env.get("CLINT_API_TOKEN") || "";
  const origins: { id: string; nome: string }[] = (integ?.config?.origins?.length ? integ.config.origins : [
    { id: "58e1c948-1cac-4757-aff4-578982c123ad", nome: "PP | Leads Qualificadas" },
    { id: "86a02d2c-a7bc-4363-96d3-3260258b9b38", nome: "PP | Leads Desqualificadas" },
  ]);
  const dias = Number(body.dias);
  const janelaH = dias > 0 ? dias * 24 : (Number(integ?.config?.janela_h) || 24 * 3);
  const clintGet = async (path: string) => (await fetch(`${CLINT}${path}`, { headers: { "api-token": token } })).json();
  const dealsRecentes = async (originId: string, cutoffIso: string, ateIso?: string) => {
    const first = await clintGet(`/deals?origin_id=${originId}&limit=1000&page=1`);
    let rows: any[] = [...(first.data || [])];
    const pages = first.totalPages || 1;
    for (let p = 2; p <= pages; p++) rows = rows.concat((await clintGet(`/deals?origin_id=${originId}&limit=1000&page=${p}`)).data || []);
    return rows.filter((d) => d.created_at && d.created_at >= cutoffIso && (!ateIso || d.created_at <= ateIso));
  };

  const cutoff = (body.desde as string) || new Date(Date.now() - janelaH * 3600 * 1000).toISOString();
  const ate = (body.ate as string) || undefined;
  const dry = body.dry === true;

  let deals: any[] = [];
  for (const o of origins) { const r = await dealsRecentes(o.id, cutoff, ate); for (const d of r) d._origem = o.nome; deals = deals.concat(r); }
  const candidatos = new Map<string, any>();
  for (const d of deals) if (d.id && !candidatos.has(d.id)) candidatos.set(d.id, d);

  const nossos = await fetchAllLeads(supabase, "id, email, telefone, data_lead, clint_deal_id", orgId);
  const existSet = new Set((nossos || []).map((l: any) => l.clint_deal_id).filter(Boolean));
  const porEmail = new Map<string, any[]>();
  for (const l of nossos || []) { const e = norm(l.email || ""); if (!e) continue; if (!porEmail.has(e)) porEmail.set(e, []); porEmail.get(e)!.push(l); }
  const porTel = new Map<string, any[]>();
  for (const l of nossos || []) { const t = normalizarTelefone(l.telefone); if (!t) continue; if (!porTel.has(t)) porTel.set(t, []); porTel.get(t)!.push(l); }

  const inseridos: any[] = []; const naoInseridos: any[] = []; const rowsToInsert: any[] = []; const vinculos: any[] = []; const claimed = new Set<string>(); let vinculados = 0;
  for (const d of candidatos.values()) {
    if (existSet.has(d.id)) continue;
    // Já temos esse contato (por telefone ou email)? Não duplica. Se não tiver
    // deal_id, vincula (backfill); se já tiver outro deal, só pula a inserção.
    const telDeal = normalizarTelefone(d.contact?.fullPhone || d.contact?.phone || null);
    const emailNorm = norm(d.contact?.email || "");
    const seen = new Set<string>(); const mesmos: any[] = [];
    for (const l of [...(telDeal ? porTel.get(telDeal) || [] : []), ...(emailNorm ? porEmail.get(emailNorm) || [] : [])]) {
      if (!seen.has(l.id)) { seen.add(l.id); mesmos.push(l); }
    }
    if (mesmos.length) {
      const semDeal = mesmos.filter((l) => !l.clint_deal_id && !claimed.has(l.id))
        .sort((a, b) => Math.abs(+new Date(a.data_lead) - +new Date(d.created_at)) - Math.abs(+new Date(b.data_lead) - +new Date(d.created_at)));
      if (semDeal.length) { claimed.add(semDeal[0].id); vinculos.push({ id: semDeal[0].id, deal: d.id }); vinculados++; }
      continue;
    }
    let f: any = {}; let tags = "";
    const emailDeal = (d.contact?.email || "").trim();
    if (emailDeal) try { const cj = await clintGet(`/contacts?email=${encodeURIComponent(emailDeal)}&limit=1`); const c = (cj.data || [])[0] || {}; f = c.fields || {}; tags = (c.tags || []).map((t: any) => t.name).join(", "); } catch { /* segue */ }
    const motivo = (!f.utm_source && !f.pp_origem_do_lead) ? "cadastro manual no Clint (sem utm/origem) — webhook não dispara" : "provável falha/timeout do webhook";
    const st = norm(d.stage);
    const custom: Record<string, string> = {};
    if (f.estado) custom.estado = f.estado;
    if (f.pp_gp_quando_voce_pr) custom.quando_iniciar = f.pp_gp_quando_voce_pr;
    if (f.pp_gp_qual_e_a_sua_c) custom.capacidade_investimento = f.pp_gp_qual_e_a_sua_c;
    rowsToInsert.push({
      org_id: orgId, clint_deal_id: d.id, crm_external_id: d.id, crm_origem: "clint",
      nome: d.contact?.name || null, email: d.contact?.email || null, telefone: d.contact?.fullPhone || d.contact?.phone || null,
      cidade: (f.cidade || "").trim() || null, data_lead: d.created_at,
      utm_source: f.utm_source || null, utm_medium: f.utm_medium || null, utm_campaign: f.utm_campaign || null, utm_content: f.utm_content || null, utm_term: f.utm_term || null,
      tags: tags || null, situacao_atual: d.stage || null, status: mapStatusClint(d.stage || ""),
      is_sql: /sql|reuni|venda|ganho/.test(st) ? "Sim" : null, is_reuniao_agendada: /reuni|venda|ganho/.test(st) ? "Sim" : null,
      is_reuniao_realizada: /realizad|venda|ganho/.test(st) ? "Sim" : null, is_venda_realizada: /venda|ganho/.test(st) ? "Sim" : null, custom,
    });
    // Registra o contato p/ não duplicar dentro da mesma execução (2 negócios do mesmo lead novo).
    const marcador = { id: `pending:${d.id}`, clint_deal_id: d.id, data_lead: d.created_at };
    if (telDeal) { if (!porTel.has(telDeal)) porTel.set(telDeal, []); porTel.get(telDeal)!.push(marcador); }
    if (emailNorm) { if (!porEmail.has(emailNorm)) porEmail.set(emailNorm, []); porEmail.get(emailNorm)!.push(marcador); }
    inseridos.push({ nome: d.contact?.name || "(sem nome)", email: d.contact?.email || "", stage: d.stage || "", motivo });
  }
  if (!dry) for (const v of vinculos) await supabase.from("leads").update({ clint_deal_id: v.deal }).eq("id", v.id);
  if (!dry && rowsToInsert.length) {
    // upsert com ignoreDuplicates: rede de segurança do índice único (org_id, telefone_norm).
    const { error } = await supabase.from("leads").upsert(rowsToInsert, { onConflict: "org_id,telefone_norm", ignoreDuplicates: true });
    if (error) { for (const i of inseridos) naoInseridos.push({ nome: i.nome, email: i.email, motivo: "erro ao inserir: " + error.message }); inseridos.length = 0; }
  }
  const clintCount = candidatos.size;
  const jaTinha = [...candidatos.values()].filter((d) => existSet.has(d.id)).length + vinculados;
  const total = jaTinha + inseridos.length;
  const det: string[] = [];
  if (inseridos.length || naoInseridos.length) { det.push("🆕 Faltavam no nosso banco:"); for (const i of inseridos) { det.push(`✅ ${i.nome} · ${i.email} · ${i.stage} — inserido`); det.push(`   ↳ ${i.motivo}`); } for (const n of naoInseridos) det.push(`⚠️ ${n.nome} · ${n.email} — ${n.motivo}`); }
  else det.push("✅ Tudo sincronizado — nenhum lead faltando.");
  return { recebidos: clintCount, ja_tinha: jaTinha, inseridos: inseridos.length, total, detalhes: det.join("\n"), periodo: `desde ${fmtBRdt(new Date(cutoff))}`, crmLabel: "Clint", extra: { vinculados, nao_inseridos: naoInseridos.length } };
}

// ===================== Conector RD STATION =====================
function detectTag(tags: string, alvos: string[]): boolean {
  const n = norm(tags); return n.split(",").some((t) => alvos.includes(t.trim()));
}
async function syncRdStation(supabase: any, orgId: string | null, _integ: any, body: any) {
  const dry = body.dry === true;
  const dias = Number(body.dias);
  const janelaH = dias > 0 ? dias * 24 : (Number(body.janela_h) || 24 * 7); // reprocessa erros da última semana por padrão
  const cutoff = (body.desde as string) || new Date(Date.now() - janelaH * 3600 * 1000).toISOString();

  // Mapeamento + campos personalizados da org (mesma lógica do webhook-leads).
  const { data: mapRows } = await supabase.from("lead_mapeamento").select("app_field, crm_key").eq("org_id", orgId);
  const mapa: Record<string, string> = {}; for (const r of mapRows || []) mapa[r.app_field] = r.crm_key;
  const { data: customDefs } = await supabase.from("lead_campos").select("chave").eq("org_id", orgId).eq("padrao", false);

  // Eventos com erro (não inseridos) na janela.
  const { data: eventos } = await supabase.from("webhook_eventos").select("id, payload, external_id")
    .eq("org_id", orgId).eq("status", "erro").gte("created_at", cutoff);

  // Snapshot p/ dedupe.
  const nossos = await fetchAllLeads(supabase, "id, email, telefone, crm_external_id", orgId);
  const byExt = new Set((nossos || []).map((l: any) => l.crm_external_id).filter(Boolean));
  const byEmail = new Set((nossos || []).map((l: any) => norm(l.email || "")).filter(Boolean));
  const byTel = new Set((nossos || []).map((l: any) => normalizarTelefone(l.telefone)).filter(Boolean));

  const recebidos = (eventos || []).length;
  const inseridos: any[] = []; const det: string[] = [];
  let jaTinha = 0;
  for (const ev of eventos || []) {
    const payload = ev.payload || {};
    const val = (appField: string): any => { const k = mapa[appField]; return k == null ? undefined : getPath(payload, k); };
    const ext = (val("crm_external_id") != null ? String(val("crm_external_id")) : ev.external_id) || null;
    const email = val("email") ? String(val("email")) : null;
    const telNorm = normalizarTelefone(val("telefone") != null ? String(val("telefone")) : null);
    if ((ext && byExt.has(ext)) || (telNorm && byTel.has(telNorm)) || (email && byEmail.has(norm(email)))) { jaTinha++; if (!dry) await supabase.from("webhook_eventos").update({ status: "duplicado" }).eq("id", ev.id); continue; }
    const tagsRaw = String(val("tags") ?? "");
    const custom: Record<string, unknown> = {};
    for (const d of customDefs || []) { const v = val("custom:" + d.chave); if (v !== undefined) custom[d.chave] = v; }
    const lead: Record<string, unknown> = {
      org_id: orgId, crm_origem: "rd_station", crm_external_id: ext,
      nome: val("nome") ?? null, email, telefone: val("telefone") ?? null, whatsapp: val("whatsapp") ?? null,
      instagram: val("instagram") ?? null, cidade: val("cidade") ?? null,
      utm_source: val("utm_source") ?? null, utm_medium: val("utm_medium") ?? null, utm_campaign: val("utm_campaign") ?? null,
      utm_content: val("utm_content") ?? null, utm_term: val("utm_term") ?? null,
      data_lead: (() => { const d = new Date(String(val("data_lead") ?? "")); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); })(),
      tags: tagsRaw || null,
      is_sql: detectTag(tagsRaw, ["sql"]) ? "Sim" : null,
      is_reuniao_agendada: detectTag(tagsRaw, ["reuniao agendada", "reunião agendada", "ra"]) ? "Sim" : null,
      is_reuniao_realizada: detectTag(tagsRaw, ["reuniao realizada", "reunião realizada", "rr"]) ? "Sim" : null,
      is_venda_realizada: detectTag(tagsRaw, ["venda realizada", "vr"]) ? "Sim" : null,
      custom, payload,
    };
    if (dry) { inseridos.push({ nome: lead.nome, email }); continue; }
    const { data: ins, error } = await supabase.from("leads").insert(lead).select("id").maybeSingle();
    if (error) { det.push(`⚠️ ${lead.nome || "(sem nome)"} · ${email || ""} — erro: ${error.message}`); continue; }
    await supabase.from("webhook_eventos").update({ status: "processado", lead_id: ins?.id ?? null }).eq("id", ev.id);
    if (ext) byExt.add(ext); if (email) byEmail.add(norm(email)); if (telNorm) byTel.add(telNorm);
    inseridos.push({ nome: lead.nome, email });
  }
  const total = (nossos || []).length + inseridos.length;
  if (inseridos.length) { det.unshift("🆕 Recuperados de eventos com erro:"); for (const i of inseridos) det.push(`✅ ${i.nome || "(sem nome)"} · ${i.email || ""} — inserido`); }
  else det.unshift("✅ Nenhum evento pendente — nada a recuperar.");
  return { recebidos, ja_tinha: jaTinha, inseridos: inseridos.length, total, detalhes: det.join("\n"), periodo: `eventos com erro desde ${fmtBRdt(new Date(cutoff))}`, crmLabel: "RD Station", extra: {} };
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

    // Resolve as integrações a processar: a org pedida (body.org_id ou x-org-slug) ou todas ativas.
    let integs: any[] = [];
    let orgId = (body.org_id as string) || null;
    if (!orgId) {
      const slug = req.headers.get("x-org-slug");
      if (slug) { const { data: o } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle(); orgId = o?.id || null; }
    }
    if (orgId) {
      const { data } = await supabase.from("integracoes").select("*").eq("org_id", orgId).eq("ativo", true);
      integs = data || [];
    } else {
      const { data } = await supabase.from("integracoes").select("*").eq("ativo", true);
      integs = data || [];
    }
    if (!integs.length) return json({ ok: true, processados: 0, msg: "nenhuma integração ativa" });

    const resultados: any[] = [];
    for (const integ of integs) {
      const oid = integ.org_id as string;
      try {
        let r: any;
        if (integ.crm === "clint") r = await syncClint(supabase, oid, integ, body);
        else if (integ.crm === "rd_station") r = await syncRdStation(supabase, oid, integ, body);
        else { resultados.push({ org_id: oid, crm: integ.crm, erro: "CRM não suportado" }); continue; }

        const vars: Record<string, string | number> = {
          crm: r.crmLabel, data: fmtBRdt(new Date()), periodo: r.periodo,
          recebidos: r.recebidos, ja_tinha: r.ja_tinha, inseridos: r.inseridos, total: r.total, detalhes: r.detalhes,
        };
        const enviados = await notificar(supabase, oid, vars, dry, wantNotificar);
        const resultado = { recebidos: r.recebidos, ja_tinha: r.ja_tinha, inseridos: r.inseridos, total: r.total, enviados, ...r.extra };
        if (!dry) await supabase.from("integracoes").update({ last_sync_at: new Date().toISOString(), last_sync_status: "sucesso", last_sync_result: resultado }).eq("id", integ.id);
        resultados.push({ org_id: oid, crm: integ.crm, ok: true, ...resultado });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "erro";
        if (!dry) await supabase.from("integracoes").update({ last_sync_at: new Date().toISOString(), last_sync_status: "erro", last_sync_result: { erro: msg } }).eq("id", integ.id);
        resultados.push({ org_id: oid, crm: integ.crm, erro: msg });
      }
    }
    return json({ ok: true, processados: resultados.length, resultados });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});
