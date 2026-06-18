import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Filters } from "@/lib/mockData";
import { useProdutos } from "@/hooks/useProdutos";

export function getDateRange(filters: Filters): { start: string; end: string } {
  // Limites de DIA em horário do Brasil (America/Sao_Paulo, UTC-3) — devem ser
  // IDÊNTICOS aos da tela de Leads (LeadsInsideSales.getDateRange) para as duas
  // telas baterem. Meia-noite BRT = 03:00Z; fim do dia = 03:00Z do dia seguinte - 1ms.
  // (Leads gravados como data pura 00:00Z foram normalizados para meio-dia.)
  const utcStart = (d: Date) =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 3, 0, 0)).toISOString();
  const utcEnd = (d: Date) =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 1, 3, 0, 0) - 1).toISOString();

  if (filters.startDate && filters.endDate) {
    return { start: utcStart(filters.startDate), end: utcEnd(filters.endDate) };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diasAtras = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };

  switch (filters.dateRange) {
    case "today":
      return { start: utcStart(today), end: utcEnd(today) };
    case "yesterday": {
      const y = diasAtras(1);
      return { start: utcStart(y), end: utcEnd(y) };
    }
    case "7d":
      return { start: utcStart(diasAtras(7)), end: utcEnd(today) };
    case "14d":
      return { start: utcStart(diasAtras(14)), end: utcEnd(today) };
    case "30d":
      return { start: utcStart(diasAtras(30)), end: utcEnd(today) };
    case "90d":
      return { start: utcStart(diasAtras(90)), end: utcEnd(today) };
    case "this_month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: utcStart(s), end: utcEnd(today) };
    }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: utcStart(s), end: utcEnd(e) };
    }
    case "lifetime":
      return { start: "2000-01-01T00:00:00Z", end: utcEnd(today) };
    default:
      return { start: utcStart(diasAtras(30)), end: utcEnd(today) };
  }
}

// Campos marcados como gatilho de MQL (lead_campos.mql_valores preenchido).
type MqlTrigger = { chave: string; padrao: boolean; valores: Set<string> };

export interface LeadsKpis {
  totalLeads: number;
  mql: number;
  sql: number;
  reunioesAgendadas: number;
  reunioesRealizadas: number;
  vendas: number;
  vendasRealizadas: number;
  faturamentoVenda: number;
}

export function useLeadsData(filters: Filters) {
  const { data: produtos = [] } = useProdutos();
  // Canal de aquisição selecionado → slug_source (filtra leads por utm_source).
  const canal = filters.canalId ? produtos.find((p) => p.id === filters.canalId) : null;
  const slugSource = canal?.slug_source || null;

  return useQuery({
    queryKey: [
      "leads-kpi",
      filters.dateRange,
      filters.startDate?.toISOString(),
      filters.endDate?.toISOString(),
      filters.canalId,
      slugSource,
    ],
    queryFn: async (): Promise<LeadsKpis> => {
      const { start, end } = getDateRange(filters);

      // Campos que disparam MQL (mql_valores preenchido no Gerenciar Campos).
      const { data: camposRaw } = await supabase
        .from("lead_campos")
        .select("chave, padrao, mql_valores");
      const mqlTriggers: MqlTrigger[] = ((camposRaw as any[]) || [])
        .filter((c) => Array.isArray(c.mql_valores) && c.mql_valores.length)
        .map((c) => ({
          chave: c.chave as string,
          padrao: !!c.padrao,
          valores: new Set((c.mql_valores as unknown[]).map((v) => String(v).trim())),
        }));

      const query = supabase
        .from("leads")
        .select("utm_source, utm_medium, campaign_name, custom, is_sql, is_reuniao_agendada, is_reuniao_realizada, is_venda_realizada, faturamento_venda")
        .gte("data_lead", start)
        .lte("data_lead", end);

      const { data, error } = await query;

      if (error) throw error;

      let leads = data || [];

      // Filtra leads por UTM Source (slug_source do canal selecionado).
      if (slugSource) {
        const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const alvos = slugSource.split(",").map((s) => normalize(s.trim())).filter(Boolean);
        leads = leads.filter((l: any) =>
          l.utm_source && alvos.some((s) => normalize(l.utm_source).includes(s))
        );
      }

      let totalLeads = 0;
      let mql = 0;
      let sql = 0;
      let reunioesAgendadas = 0;
      let reunioesRealizadas = 0;
      let vendas = 0;
      let vendasRealizadas = 0;
      let faturamentoVenda = 0;

      for (const l of leads) {
        totalLeads++;

        // MQL: o valor de QUALQUER campo gatilho está na lista de valores que contam.
        const isMql = mqlTriggers.some((t) => {
          const raw = t.padrao
            ? (l as Record<string, unknown>)[t.chave]
            : (l.custom as Record<string, unknown> | null)?.[t.chave];
          return raw != null && t.valores.has(String(raw).trim());
        });
        if (isMql) mql++;
        // SQL, reuniões e vendas vêm exclusivamente das colunas dedicadas (= "Sim").
        if (l.is_sql === "Sim") sql++;
        if (l.is_reuniao_agendada === "Sim") reunioesAgendadas++;
        if (l.is_reuniao_realizada === "Sim") reunioesRealizadas++;
        if (l.is_venda_realizada === "Sim") {
          vendas++;
          vendasRealizadas++;
          const fv = Number(l.faturamento_venda);
          if (!isNaN(fv)) faturamentoVenda += fv;
        }
      }

      return { totalLeads, mql, sql, reunioesAgendadas, reunioesRealizadas, vendas, vendasRealizadas, faturamentoVenda };
    },
    refetchInterval: 600_000, // 10 minutes
  });
}
