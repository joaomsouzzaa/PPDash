import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ===================================================================
// Endpoints do UAZAPI. Ajuste aqui caso a sua instância use caminhos
// diferentes. Por padrão o UAZAPI usa:
//   - header "admintoken" para criar/instanciar
//   - header "token" para operações da instância (status, send, grupos)
// ===================================================================
const UAZAPI = {
  connect: (base: string) => `${base}/instance/connect`,
  status: (base: string) => `${base}/instance/status`,
  groups: (base: string) => `${base}/group/list`,
  sendText: (base: string) => `${base}/send/text`,
};

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function getConfig(supabase: any) {
  const { data } = await supabase.from("whatsapp_config").select("*").maybeSingle();
  return data;
}

async function uazFetch(base: string, path: string, token: string, body?: unknown) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", token, admintoken: token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(json?.error || json?.message || `UAZAPI ${res.status}`);
  return json;
}

// Substitui {{var}} pelos valores do mapa
function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
}

const fmtBRL = (n: number) => `R$ ${(Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Envia uma mensagem de texto via UAZAPI
async function enviarTexto(cfg: any, destinatario: string, mensagem: string) {
  const base = (cfg.server_url || "").replace(/\/$/, "");
  const token = cfg.admin_token;
  if (!base || !token) throw new Error("Configuração UAZAPI incompleta");
  return uazFetch(base, UAZAPI.sendText(base), token, { number: destinatario, text: mensagem });
}

// Lista de destinatários de uma notificação (novo formato `destinatarios` ou legado)
function destinatariosDe(n: any): string[] {
  if (Array.isArray(n.destinatarios) && n.destinatarios.length) {
    return n.destinatarios.map((d: any) => d.valor).filter(Boolean);
  }
  return n.destinatario ? [n.destinatario] : [];
}

// Monta as variáveis a partir de uma venda
function varsDaVenda(v: any): Record<string, string | number> {
  return {
    nome: v.nome_comprador || "",
    produto: v.produto || "",
    cidade: v.cidade || "",
    valor: fmtBRL(v.valor || 0),
    tipo: v.tipo_ingresso || "",
    quantidade: v.quantidade || 1,
    pagamento: v.metodo_pagamento || "",
    data: v.data_venda ? new Date(v.data_venda).toLocaleString("pt-BR") : "",
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
  const { data } = await supabase.rpc("buscar_vendas", {
    p_status: "aprovada",
    p_start: "2000-01-01T00:00:00Z",
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
  const meta = (await supabase.from("meta_config").select("*").maybeSingle()).data;
  if (meta?.access_token && meta?.account_id && cidadeSlug) {
    try {
      const spend = await metaSpend(meta, cidadeSlug);
      investimento = fmtBRL(spend);
      const cacNum = pagantes > 0 && spend > 0 ? spend / pagantes : 0;
      if (cacNum > 0) cac = fmtBRL(cacNum);
      // Projeções (precisam da data do evento + orçamento diário)
      const { data: cid } = await supabase.from("cidades").select("data_evento").eq("slug", cidadeSlug).maybeSingle();
      if (cid?.data_evento) {
        const budget = await metaDailyBudget(meta, cidadeSlug);
        const dias = Math.max(0, Math.ceil((new Date(cid.data_evento).getTime() - Date.now()) / 86400000) + 1);
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
    cac, projecao, investimento, projecao_investimento,
  };
}

// Slugs a processar: 1 por cidade ATIVA (evento >= hoje) quando "todas",
// senão a cidade específica da notificação.
async function slugsDaNotif(supabase: any, n: any): Promise<(string | null)[]> {
  if ((n.gatilho === "resumo_cidade" || n.gatilho === "manual") && !n.cidade_slug) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const { data: cids } = await supabase.from("cidades").select("slug,data_evento");
    return (cids || []).filter((c: any) => new Date(c.data_evento) >= hoje).map((c: any) => c.slug);
  }
  return [n.cidade_slug || null];
}

// Lista de conjuntos de variáveis: 1 por cidade ativa (resumo) ou 1 (venda/geral)
async function buildVarsList(supabase: any, n: any): Promise<Record<string, string | number>[]> {
  if (n.gatilho === "nova_venda") {
    return [varsDaVenda({ nome_comprador: "Fulano (teste)", produto: "Workshop Scale | Belém - PA", cidade: "Belém", valor: 247, tipo_ingresso: "individual", quantidade: 1, metodo_pagamento: "pix", data_venda: new Date().toISOString() })];
  }
  if (n.gatilho === "resumo_geral") {
    return [{ total_cidades: "—", participantes_total: "—", bilheteria_total: "—", investimento_total: "—", data: new Date().toLocaleDateString("pt-BR") }];
  }
  const slugs = await slugsDaNotif(supabase, n);
  const out: Record<string, string | number>[] = [];
  for (const slug of slugs) out.push(await resumoCidade(supabase, slug));
  return out;
}

Deno.serve(async (req) => {
  console.log("uazapi v9 - rpc check");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = svc();
    const { action, ...payload } = await req.json();
    const cfg = await getConfig(supabase);

    switch (action) {
      case "connect": {
        if (!cfg?.server_url || !cfg?.admin_token) return json({ error: "Configure URL e token primeiro" }, 400);
        const base = cfg.server_url.replace(/\/$/, "");
        const data = await uazFetch(base, UAZAPI.connect(base), cfg.admin_token, {});
        const inst = data.instance || {};
        const qrcode = inst.qrcode || data.qrcode || inst.paircode || null;
        const status = inst.status || (data.connected ? "connected" : "aguardando_qr");
        await supabase.from("whatsapp_config").update({ status }).eq("id", cfg.id);
        return json({ qrcode, status });
      }
      case "status": {
        if (!cfg?.server_url || !cfg?.admin_token) return json({ status: "desconectado" });
        const base = cfg.server_url.replace(/\/$/, "");
        const data = await uazFetch(base, UAZAPI.status(base), cfg.admin_token);
        const inst = data.instance || {};
        const connected = inst.status === "connected" || data.connected === true;
        const status = connected ? "connected" : (inst.status || "desconectado");
        const numero = inst.owner || inst.profileName || null;
        const qrcode = inst.qrcode || null;
        await supabase.from("whatsapp_config").update({ status, numero }).eq("id", cfg.id);
        return json({ status, numero, connected, qrcode });
      }
      case "groups": {
        if (!cfg?.server_url || !cfg?.admin_token) return json({ groups: [] });
        const base = cfg.server_url.replace(/\/$/, "");
        const data = await uazFetch(base, UAZAPI.groups(base), cfg.admin_token);
        const list = data.groups || data.data || data || [];
        const groups = (Array.isArray(list) ? list : []).map((g: any) => ({
          id: g.JID || g.id || g.jid || g.gid || g.group_id,
          name: g.Name || g.name || g.subject || g.title || g.JID || g.id,
        })).filter((g: any) => g.id);
        return json({ groups });
      }
      case "send": {
        await enviarTexto(cfg, payload.destinatario, payload.mensagem);
        return json({ success: true });
      }
      case "send_test": {
        const { data: n } = await supabase.from("notificacoes").select("*").eq("id", payload.notificacao_id).maybeSingle();
        if (!n) return json({ error: "Notificação não encontrada" }, 404);
        const ds = destinatariosDe(n);
        if (ds.length === 0) return json({ error: "Notificação sem destinatário" }, 400);
        // 1 mensagem por cidade ativa (quando "todas") — enviadas separadamente
        const varsList = await buildVarsList(supabase, n);
        let enviados = 0;
        for (const vars of varsList) {
          const msg = render(n.mensagem, vars) + "\n\n_(mensagem de teste)_";
          for (const dest of ds) {
            await enviarTexto(cfg, dest, msg);
            await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, destinatario: dest, mensagem: msg, status: "enviado" });
            enviados++;
          }
        }
        return json({ success: true, enviados });
      }
      case "nova_venda": {
        // Chamado pelo trigger do banco quando uma venda é inserida
        const v = payload.venda;
        if (!v) return json({ error: "venda ausente" }, 400);
        const { data: notifs } = await supabase.from("notificacoes").select("*").eq("ativo", true).eq("gatilho", "nova_venda");
        const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]/g, "");
        let enviados = 0;
        for (const n of notifs || []) {
          if (n.cidade_slug) {
            const parts = n.cidade_slug.split(",").map((p: string) => norm(p)).filter(Boolean);
            const match = parts.some((s) => norm(v.cidade || "").includes(s) || norm(v.produto || "").includes(s));
            if (!match) continue;
          }
          const msg = render(n.mensagem, varsDaVenda(v));
          for (const dest of destinatariosDe(n)) {
            try {
              await enviarTexto(cfg, dest, msg);
              await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, destinatario: dest, mensagem: msg, status: "enviado" });
              enviados++;
            } catch (e) {
              await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, destinatario: dest, mensagem: msg, status: "erro", erro: String(e) });
            }
          }
        }
        return json({ success: true, enviados });
      }
      case "run_scheduled": {
        // Chamado por um cron; envia os resumos cujo horário == agora (HH:MM)
        const agora = payload.horario || new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        const { data: notifs } = await supabase.from("notificacoes").select("*").eq("ativo", true).in("gatilho", ["resumo_cidade", "resumo_geral"]);
        let enviados = 0;
        for (const n of notifs || []) {
          if ((n.horario || "").slice(0, 5) !== agora.slice(0, 5)) continue;
          // 1 mensagem por cidade ativa (quando "todas") — uma após a outra
          const varsList = await buildVarsList(supabase, n);
          for (const vars of varsList) {
            const msg = render(n.mensagem, vars);
            for (const dest of destinatariosDe(n)) {
              try {
                await enviarTexto(cfg, dest, msg);
                await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, destinatario: dest, mensagem: msg, status: "enviado" });
                enviados++;
              } catch (e) {
                await supabase.from("notificacao_logs").insert({ notificacao_id: n.id, destinatario: dest, mensagem: msg, status: "erro", erro: String(e) });
              }
            }
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
