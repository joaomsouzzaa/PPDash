import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Normaliza telefone BR p/ chave de dedup (últimos 11 díg., tira 55). Espelha _shared/telefone.ts.
function normalizarTelefone(raw?: string | null): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length > 11) d = d.slice(-11);
  return d || null;
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const CLINT = "https://api.clint.digital/v1";
const ORIGINS = [
  { id: "58e1c948-1cac-4757-aff4-578982c123ad", nome: "PP | Leads Qualificadas" },
  { id: "86a02d2c-a7bc-4363-96d3-3260258b9b38", nome: "PP | Leads Desqualificadas" },
];
const DEST = "5581996125512"; // GoBot
const JANELA_H = 24 * 3; // 3 dias: roda 1x/dia (08h BRT); 3 dias dá margem p/ recuperar o dia anterior mesmo se uma execução falhar. Janela maior puxaria histórico antigo desnecessário.

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Busca TODOS os leads (paginado). O PostgREST devolve no máx. 1000 linhas por
// request; sem paginar, o snapshot de dedup fica incompleto e o sync duplica/
// não vincula os leads além da linha 1000.
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

async function clintGet(path: string): Promise<any> {
  const r = await fetch(`${CLINT}${path}`, { headers: { "api-token": Deno.env.get("CLINT_API_TOKEN") || "" } });
  return r.json();
}
// Negócios de uma origem criados na janela [cutoff, ate] (a API não filtra por data, então pagina e filtra).
async function dealsRecentes(originId: string, cutoffIso: string, ateIso?: string): Promise<any[]> {
  const first = await clintGet(`/deals?origin_id=${originId}&limit=1000&page=1`);
  let rows: any[] = [...(first.data || [])];
  const pages = first.totalPages || 1;
  for (let p = 2; p <= pages; p++) {
    const j = await clintGet(`/deals?origin_id=${originId}&limit=1000&page=${p}`);
    rows = rows.concat(j.data || []);
  }
  return rows.filter((d) => d.created_at && d.created_at >= cutoffIso && (!ateIso || d.created_at <= ateIso));
}

function mapStatus(stage: string): string {
  const s = norm(stage);
  if (s === "sql") return "sql";
  if (s.includes("reuni") && s.includes("agendad")) return "reuniao_agendada";
  if (s.includes("reuni") && s.includes("realizad")) return "reuniao_realizada";
  if (s.includes("venda") || s.includes("ganho")) return "venda";
  return "lead";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const supabase = svc();
    const body = await req.json().catch(() => ({}));
    // Org (single tenant) — usa a passada ou a ativa mais antiga.
    let orgId = body.org_id as string | null;
    if (!orgId) {
      const { data: org } = await supabase.from("organizations").select("id").eq("status", "ativo").order("created_at").limit(1).maybeSingle();
      orgId = org?.id || null;
    }

    // Janela: padrão 12h, mas aceita override `desde` (ISO) p/ auditoria completa.
    const cutoff = (body.desde as string) || new Date(Date.now() - JANELA_H * 3600 * 1000).toISOString();
    const ate = (body.ate as string) || undefined; // limite superior opcional (ISO) p/ processar em janelas menores
    const dry = body.dry === true; // não insere/vincula, só relata
    const notificar = body.notificar !== false; // envia o resumo no WhatsApp (default sim; backfill pode passar false)
    const fmtBRdt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

    // 1) Candidatos da Clint (janela): cada NEGÓCIO é um candidato (dedup por deal_id), marcado com a origem.
    let deals: any[] = [];
    const porOrigem: Record<string, number> = {};
    for (const o of ORIGINS) {
      const r = await dealsRecentes(o.id, cutoff, ate);
      porOrigem[o.nome] = r.length;
      for (const d of r) d._origem = o.nome;
      deals = deals.concat(r);
    }
    const candidatos = new Map<string, any>(); // chave = deal_id
    for (const d of deals) if (d.id && !candidatos.has(d.id)) candidatos.set(d.id, d);

    // 2) Snapshot do nosso banco: já-temos por deal_id e leads por email (p/ vincular o que o webhook salvou).
    const nossos = await fetchAllLeads(supabase, "id, email, telefone, data_lead, clint_deal_id", orgId);
    const existSet = new Set((nossos || []).map((l: any) => l.clint_deal_id).filter(Boolean));
    const porEmail = new Map<string, any[]>();
    for (const l of nossos || []) { const e = norm(l.email || ""); if (!e) continue; (porEmail.get(e) || porEmail.set(e, []).get(e)).push(l); }
    const porTel = new Map<string, any[]>();
    for (const l of nossos || []) { const t = normalizarTelefone(l.telefone); if (!t) continue; (porTel.get(t) || porTel.set(t, []).get(t)).push(l); }

    // 3) Para cada negócio: vincular (backfill deal_id num lead do webhook) ou inserir.
    const inseridos: { nome: string; email: string; stage: string; motivo: string; origem: string; criado: string; utm_source: string | null }[] = [];
    const naoInseridos: { nome: string; email: string; motivo: string }[] = [];
    const rowsToInsert: any[] = [];
    const vinculos: { id: string; deal: string }[] = [];
    const claimed = new Set<string>();
    let vinculados = 0;
    for (const d of candidatos.values()) {
      if (existSet.has(d.id)) continue; // já temos esse negócio
      // Já temos esse contato (por telefone ou email)? Não duplica.
      // Se ainda não tiver deal_id, vincula (backfill); se já tiver outro deal
      // (contato com 2º negócio), apenas pula a inserção.
      const telDeal = normalizarTelefone(d.contact?.fullPhone || d.contact?.phone || null);
      const emailNorm = norm(d.contact?.email || "");
      const mesmos: any[] = [];
      const seen = new Set<string>();
      for (const l of [...(telDeal ? porTel.get(telDeal) || [] : []), ...(emailNorm ? porEmail.get(emailNorm) || [] : [])]) {
        if (!seen.has(l.id)) { seen.add(l.id); mesmos.push(l); }
      }
      if (mesmos.length) {
        const semDeal = mesmos
          .filter((l) => !l.clint_deal_id && !claimed.has(l.id))
          .sort((a, b) => Math.abs(+new Date(a.data_lead) - +new Date(d.created_at)) - Math.abs(+new Date(b.data_lead) - +new Date(d.created_at)));
        if (semDeal.length) { claimed.add(semDeal[0].id); vinculos.push({ id: semDeal[0].id, deal: d.id }); vinculados++; }
        continue; // já temos o contato — não insere duplicata
      }

      // Busca o contato completo (campos/utm). Só quando há email — sem email a busca não filtra e fica lenta.
      let f: any = {};
      let tags = "";
      const emailDeal = (d.contact?.email || "").trim();
      if (emailDeal) try {
        const cj = await clintGet(`/contacts?email=${encodeURIComponent(emailDeal)}&limit=1`);
        const c = (cj.data || [])[0] || {};
        f = c.fields || {};
        tags = (c.tags || []).map((t: any) => t.name).join(", ");
      } catch { /* segue com o básico do deal */ }

      const motivo = (!f.utm_source && !f.pp_origem_do_lead)
        ? "cadastro manual no Clint (sem utm/origem de formulário) — webhook não dispara"
        : "provável falha/timeout do webhook no momento do envio";

      const st = norm(d.stage);
      const custom: Record<string, string> = {};
      if (f.estado) custom.estado = f.estado;
      if (f.pp_gp_quando_voce_pr) custom.quando_iniciar = f.pp_gp_quando_voce_pr;
      if (f.pp_gp_qual_e_a_sua_c) custom.capacidade_investimento = f.pp_gp_qual_e_a_sua_c;

      rowsToInsert.push({
        org_id: orgId,
        clint_deal_id: d.id,
        nome: d.contact?.name || null,
        email: d.contact?.email || null,
        telefone: d.contact?.fullPhone || d.contact?.phone || null,
        cidade: (f.cidade || "").trim() || null,
        data_lead: d.created_at,
        utm_source: f.utm_source || null,
        utm_medium: f.utm_medium || null,
        utm_campaign: f.utm_campaign || null,
        utm_content: f.utm_content || null,
        utm_term: f.utm_term || null,
        tags: tags || null,
        situacao_atual: d.stage || null,
        status: mapStatus(d.stage || ""),
        is_sql: /sql|reuni|venda|ganho/.test(st) ? "Sim" : null,
        is_reuniao_agendada: /reuni|venda|ganho/.test(st) ? "Sim" : null,
        is_reuniao_realizada: /realizad|venda|ganho/.test(st) ? "Sim" : null,
        is_venda_realizada: /venda|ganho/.test(st) ? "Sim" : null,
        custom,
      });
      // Registra o contato para não duplicar dentro da mesma execução (ex.: 2 negócios do mesmo lead novo).
      const marcador = { id: `pending:${d.id}`, clint_deal_id: d.id, data_lead: d.created_at };
      if (telDeal) (porTel.get(telDeal) || porTel.set(telDeal, []).get(telDeal))!.push(marcador);
      if (emailNorm) (porEmail.get(emailNorm) || porEmail.set(emailNorm, []).get(emailNorm))!.push(marcador);
      inseridos.push({ nome: d.contact?.name || "(sem nome)", email: d.contact?.email || "", stage: d.stage || "", motivo, origem: d._origem || "?", criado: d.created_at, utm_source: f.utm_source || null });
    }

    // Vincula (backfill deal_id) os leads que o webhook já tinha salvo.
    if (!dry) for (const v of vinculos) {
      await supabase.from("leads").update({ clint_deal_id: v.deal }).eq("id", v.id);
    }

    if (!dry && rowsToInsert.length) {
      // upsert com ignoreDuplicates: rede de segurança do índice único (org_id, telefone_norm).
      const { error } = await supabase.from("leads").upsert(rowsToInsert, { onConflict: "org_id,telefone_norm", ignoreDuplicates: true });
      if (error) {
        for (const i of inseridos) naoInseridos.push({ nome: i.nome, email: i.email, motivo: "erro ao inserir: " + error.message });
        inseridos.length = 0;
      }
    }

    // 4) Totais — negócios do Clint na janela e quantos já temos.
    const clintCount = candidatos.size;
    const jaTinhaDeal = [...candidatos.values()].filter((d) => existSet.has(d.id)).length;
    const jaTinha = jaTinhaDeal + vinculados; // já existiam (por deal_id ou vinculados do webhook)
    const nossoCount = jaTinha + inseridos.length; // após a sincronização

    // 5) Monta o bloco de DETALHES (lista dinâmica de leads) — vira a variável {{detalhes}}.
    const detLinhas: string[] = [];
    if (inseridos.length || naoInseridos.length) {
      detLinhas.push("🆕 Faltavam no nosso banco:");
      for (const i of inseridos) { detLinhas.push(`✅ ${i.nome} · ${i.email} · ${i.stage} — inserido`); detLinhas.push(`   ↳ Motivo provável: ${i.motivo}`); }
      for (const n of naoInseridos) { detLinhas.push(`⚠️ ${n.nome} · ${n.email} — não inserido`); detLinhas.push(`   ↳ Motivo: ${n.motivo}`); }
    } else {
      detLinhas.push("✅ Tudo sincronizado — nenhum lead faltando.");
    }
    const detalhes = detLinhas.join("\n");

    // Variáveis disponíveis no template editável da notificação `sync_concluido`.
    const vars: Record<string, string | number> = {
      data: fmtBRdt(new Date()),
      periodo: `desde ${fmtBRdt(new Date(cutoff))}`,
      clint: clintCount,
      ja_tinha: jaTinha,
      inseridos: inseridos.length,
      total: nossoCount,
      detalhes,
    };

    // Template PADRÃO (usado quando não há notificação `sync_concluido` cadastrada).
    const TEMPLATE_PADRAO = [
      "🔄 Sincronização diária Clint → Banco",
      "🕐 {{data}} · {{periodo}} (BRT)",
      "",
      "📊 Resumo",
      "• Clint (PP Qualif + Desqualif): {{clint}}",
      "• Já tínhamos no banco: {{ja_tinha}}",
      "• Inseridos agora: {{inseridos}}",
      "• Total no nosso banco: {{total}}",
      "",
      "{{detalhes}}",
      "",
      "🤖 By: GoBot",
    ].join("\n");

    // Substitui {{var}} pelos valores (remove linhas cujos placeholders ficaram vazios).
    const render = (template: string, v: Record<string, string | number>): string =>
      template
        .split("\n")
        .filter((linha) => {
          const ph = linha.match(/\{\{\s*\w+\s*\}\}/g);
          if (!ph) return true;
          return ph.some((p) => { const k = p.replace(/[{}\s]/g, ""); return v[k] != null && String(v[k]).trim() !== ""; });
        })
        .join("\n")
        .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (v[k] != null ? String(v[k]) : ""));

    // Destinatários de uma notificação (formato `destinatarios` jsonb ou legado).
    const destinatariosDe = (n: any): string[] => {
      if (Array.isArray(n.destinatarios) && n.destinatarios.length) return n.destinatarios.map((d: any) => d.valor).filter(Boolean);
      return n.destinatario ? [n.destinatario] : [];
    };

    // 6) Envia. Em dry-run ou com notificar=false não envia.
    let enviados = 0;
    if (!dry && notificar) {
      const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const send = (destinatario: string, mensagem: string) =>
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}`, apikey: anon },
          body: JSON.stringify({ action: "send", org_id: orgId, destinatario, mensagem }),
          signal: AbortSignal.timeout(20000),
        });

      // Notificações `sync_concluido` ATIVAS desta org (editáveis pelo usuário na tela de Notificações).
      const { data: notifs } = await supabase.from("notificacoes")
        .select("*").eq("ativo", true).eq("gatilho", "sync_concluido").eq("org_id", orgId);

      if (notifs && notifs.length) {
        for (const n of notifs) {
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
      } else {
        // Fallback (sem notificação cadastrada): comportamento legado — GoBot fixo.
        try { await send(DEST, render(TEMPLATE_PADRAO, vars)); enviados++; } catch { /* segue */ }
      }
    }

    return json({
      ok: true, dry, enviados, desde: cutoff, clint: clintCount, por_origem: porOrigem,
      ja_tinha: jaTinha, vinculados, nosso: nossoCount,
      inseridos: inseridos.length, nao_inseridos: naoInseridos.length,
      faltantes: inseridos.map((i) => ({ nome: i.nome, email: i.email, origem: i.origem, stage: i.stage, criado: i.criado, utm_source: i.utm_source, motivo: i.motivo })),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});
