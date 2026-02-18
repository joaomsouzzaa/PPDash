import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Filters } from "@/lib/mockData";

function getDateRange(filters: Filters): { start: string; end: string } {
  if (filters.startDate && filters.endDate) {
    return {
      start: filters.startDate.toISOString(),
      end: new Date(filters.endDate.getTime() + 86400000 - 1).toISOString(),
    };
  }

  const now = new Date();
  let start: Date;
  const end = now;

  switch (filters.dateRange) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "yesterday": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return {
        start: start.toISOString(),
        end: new Date(start.getTime() + 86400000 - 1).toISOString(),
      };
    }
    case "7d":
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      break;
    case "14d":
      start = new Date(now);
      start.setDate(start.getDate() - 14);
      break;
    case "30d":
      start = new Date(now);
      start.setDate(start.getDate() - 30);
      break;
    case "this_month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last_month": {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start: start.toISOString(), end: endOfMonth.toISOString() };
    }
    case "lifetime":
      return { start: "2000-01-01T00:00:00Z", end: now.toISOString() };
    default:
      start = new Date(now);
      start.setDate(start.getDate() - 30);
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

function parseFaturamento(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.toLowerCase().replace(/[r$\s]/g, "").replace(/_/g, " ");

  // Handle range formats like "entre 50 mil e 100 mil" or "entre 100 mil e 300 mil"
  // Use the highest value in the range for comparison
  const rangeMatch = s.match(/entre\s*([\d.,]+)\s*(mil|k)?\s*e\s*([\d.,]+)\s*(mil|k)?/i);
  if (rangeMatch) {
    const high = parseNumWithMil(rangeMatch[3], rangeMatch[4]);
    return high;
  }

  // Handle "até X mil" — use the value itself (e.g. "até 15 mil" = 15000)
  const ateMatch = s.match(/at[eé]\s*([\d.,]+)\s*(mil|k)?/i);
  if (ateMatch) {
    return parseNumWithMil(ateMatch[1], ateMatch[2]);
  }

  // Handle "acima de X mil" or "mais de X mil"
  const acimaMatch = s.match(/(?:acima|mais)\s*(?:de)?\s*([\d.,]+)\s*(mil|k)?/i);
  if (acimaMatch) {
    return parseNumWithMil(acimaMatch[1], acimaMatch[2]);
  }

  // Handle simple "50 mil", "50mil", "100k", "50.000"
  const simpleMatch = s.match(/([\d.,]+)\s*(mil|k)?/);
  if (simpleMatch) {
    return parseNumWithMil(simpleMatch[1], simpleMatch[2]);
  }

  return null;
}

function parseNumWithMil(numStr: string, suffix?: string): number {
  const cleaned = numStr.replace(/\./g, "").replace(",", ".");
  let num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  if (suffix && (suffix.toLowerCase() === "mil" || suffix.toLowerCase() === "k")) {
    num *= 1000;
  }
  return num;
}

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
  return useQuery({
    queryKey: [
      "leads-kpi",
      filters.dateRange,
      filters.startDate?.toISOString(),
      filters.endDate?.toISOString(),
      filters.produtos,
    ],
    queryFn: async (): Promise<LeadsKpis> => {
      const { start, end } = getDateRange(filters);

      let query = supabase
        .from("leads")
        .select("status, utm_medium, campaign_name, faturamento, is_sql, is_reuniao_agendada, is_reuniao_realizada, is_venda_realizada, faturamento_venda")
        .gte("data_lead", start)
        .lte("data_lead", end);

      const { data, error } = await query;

      if (error) throw error;

      let leads = data || [];

      // Filter by product slugs via campaign_name (accent-insensitive)
      if (filters.produtos.length > 0) {
        const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const normalizedSlugs = filters.produtos.map(normalize);
        leads = leads.filter((l) =>
          l.campaign_name && normalizedSlugs.some((slug) =>
            normalize(l.campaign_name!).includes(slug)
          )
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
        const s = l.status;

        // Parse faturamento: extract numeric value from string (e.g. "R$ 50.000", "100000", "50k")
        const faturamentoNum = parseFaturamento(l.faturamento);
        const isMqlByFaturamento = faturamentoNum !== null && faturamentoNum > 50000;

        // Count cumulatively — a lead that reached "venda" also counts as MQL, SQL, etc.
        // Also count as MQL if faturamento > 50k
        if (isMqlByFaturamento || s === "mql" || s === "sql" || s === "reuniao_agendada" || s === "reuniao_realizada" || s === "venda") {
          mql++;
        }
        if (l.is_sql === "Sim" || s === "sql" || s === "reuniao_agendada" || s === "reuniao_realizada" || s === "venda") {
          sql++;
        }
        if (l.is_reuniao_agendada === "Sim" || s === "reuniao_agendada" || s === "reuniao_realizada" || s === "venda") {
          reunioesAgendadas++;
        }
        if (l.is_reuniao_realizada === "Sim" || s === "reuniao_realizada" || s === "venda") {
          reunioesRealizadas++;
        }
        if (s === "venda") {
          vendas++;
        }
        if ((l as any).is_venda_realizada === "Sim") {
          vendasRealizadas++;
          const fv = Number((l as any).faturamento_venda);
          if (!isNaN(fv)) faturamentoVenda += fv;
        }
      }

      return { totalLeads, mql, sql, reunioesAgendadas, reunioesRealizadas, vendas, vendasRealizadas, faturamentoVenda };
    },
    refetchInterval: 600_000, // 10 minutes
  });
}
