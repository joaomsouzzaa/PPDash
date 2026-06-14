import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const CLINT = "https://api.clint.digital/v1";
const ORIGINS = [
  { id: "58e1c948-1cac-4757-aff4-578982c123ad", nome: "PP | Leads Qualificadas" },
  { id: "86a02d2c-a7bc-4363-96d3-3260258b9b38", nome: "PP | Leads Desqualificadas" },
];
const DEST = "5581996125512"; // GoBot
const JANELA_H = 12;

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function clintGet(path: string): Promise<any> {
  const r = await fetch(`${CLINT}${path}`, { headers: { "api-token": Deno.env.get("CLINT_API_TOKEN") || "" } });
  return r.json();
}
// Todos os negócios de uma origem criados a partir do cutoff (a API não filtra por data, então pagina e filtra).
async function dealsRecentes(originId: string, cutoffIso: string): Promise<any[]> {
  const first = await clintGet(`/deals?origin_id=${originId}&limit=1000&page=1`);
  let rows: any[] = [...(first.data || [])];
  const pages = first.totalPages || 1;
  for (let p = 2; p <= pages; p++) {
    const j = await clintGet(`/deals?origin_id=${originId}&limit=1000&page=${p}`);
    rows = rows.concat(j.data || []);
  }
  return rows.filter((d) => d.created_at && d.created_at >= cutoffIso);
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

    const cutoff = new Date(Date.now() - JANELA_H * 3600 * 1000).toISOString();
    const fmtBRdt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

    // 1) Candidatos da Clint (janela): cada NEGÓCIO é um candidato (dedup por deal_id).
    let deals: any[] = [];
    for (const o of ORIGINS) deals = deals.concat(await dealsRecentes(o.id, cutoff));
    const candidatos = new Map<string, any>(); // chave = deal_id
    for (const d of deals) if (d.id && !candidatos.has(d.id)) candidatos.set(d.id, d);

    // 2) Quais desses negócios já temos (por clint_deal_id).
    const dealIds = [...candidatos.keys()];
    const { data: existentes } = dealIds.length
      ? await supabase.from("leads").select("clint_deal_id").in("clint_deal_id", dealIds)
      : { data: [] as any[] };
    const existSet = new Set((existentes || []).map((l: any) => l.clint_deal_id).filter(Boolean));

    // 3) Faltantes (negócios que não temos) + inserção.
    const inseridos: { nome: string; email: string; stage: string; motivo: string }[] = [];
    const naoInseridos: { nome: string; email: string; motivo: string }[] = [];
    const rowsToInsert: any[] = [];
    for (const d of candidatos.values()) {
      if (existSet.has(d.id)) continue; // negócio já está no nosso banco
      // Busca o contato completo (campos/utm).
      let f: any = {};
      let tags = "";
      try {
        const cj = await clintGet(`/contacts?email=${encodeURIComponent(d.contact?.email || "")}&limit=1`);
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
      inseridos.push({ nome: d.contact?.name || "(sem nome)", email: d.contact?.email || "", stage: d.stage || "", motivo });
    }

    if (rowsToInsert.length) {
      const { error } = await supabase.from("leads").insert(rowsToInsert);
      if (error) {
        // marca todos como não inseridos por erro
        for (const i of inseridos) naoInseridos.push({ nome: i.nome, email: i.email, motivo: "erro ao inserir: " + error.message });
        inseridos.length = 0;
      }
    }

    // 4) Totais (janela 12h) — sobre os negócios do Clint e quantos desses já temos.
    const clintCount = candidatos.size;
    const jaTinha = [...candidatos.values()].filter((d) => existSet.has(d.id)).length;
    const nossoCount = jaTinha + inseridos.length; // após a sincronização

    // 5) Monta mensagem.
    const linhas: string[] = [];
    linhas.push("🔄 Sincronização Clint → Banco");
    linhas.push(`🕐 ${fmtBRdt(new Date())} · janela: últimas ${JANELA_H}h (BRT)`);
    linhas.push("");
    linhas.push("📊 Resumo");
    linhas.push(`• Clint (PP Qualif + Desqualif): ${clintCount}`);
    linhas.push(`• Já tínhamos no banco: ${jaTinha}`);
    linhas.push(`• Inseridos agora: ${inseridos.length}`);
    linhas.push(`• Total no nosso banco: ${nossoCount}`);
    if (inseridos.length || naoInseridos.length) {
      linhas.push("");
      linhas.push("🆕 Faltavam no nosso banco:");
      for (const i of inseridos) { linhas.push(`✅ ${i.nome} · ${i.email} · ${i.stage} — inserido`); linhas.push(`   ↳ Motivo provável: ${i.motivo}`); }
      for (const n of naoInseridos) { linhas.push(`⚠️ ${n.nome} · ${n.email} — não inserido`); linhas.push(`   ↳ Motivo: ${n.motivo}`); }
    } else {
      linhas.push("");
      linhas.push("✅ Tudo sincronizado — nenhum lead faltando.");
    }
    linhas.push("");
    linhas.push("🤖 By: GoBot");
    const mensagem = linhas.join("\n");

    // 6) Envia pelo GoBot (via função uazapi).
    try {
      const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}`, apikey: anon },
        body: JSON.stringify({ action: "send", org_id: orgId, destinatario: DEST, mensagem }),
      });
    } catch { /* envio falhou; segue */ }

    return json({ ok: true, clint: clintCount, nosso: nossoCount, inseridos: inseridos.length, nao_inseridos: naoInseridos.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});
