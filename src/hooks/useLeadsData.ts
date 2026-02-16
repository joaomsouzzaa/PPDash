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

export interface LeadsKpis {
  totalLeads: number;
  mql: number;
  sql: number;
  reunioesAgendadas: number;
  reunioesRealizadas: number;
  vendas: number;
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
        .select("status, utm_medium, campaign_name")
        .gte("data_lead", start)
        .lte("data_lead", end);

      const { data, error } = await query;

      if (error) throw error;

      let leads = data || [];

      // Filter by product slugs via campaign_name
      if (filters.produtos.length > 0) {
        leads = leads.filter((l) =>
          l.campaign_name && filters.produtos.some((slug) =>
            l.campaign_name!.toLowerCase().includes(slug.toLowerCase())
          )
        );
      }

      let totalLeads = 0;
      let mql = 0;
      let sql = 0;
      let reunioesAgendadas = 0;
      let reunioesRealizadas = 0;
      let vendas = 0;

      for (const l of leads) {
        totalLeads++;
        const s = l.status;
        // Count cumulatively — a lead that reached "venda" also counts as MQL, SQL, etc.
        if (s === "mql" || s === "sql" || s === "reuniao_agendada" || s === "reuniao_realizada" || s === "venda") {
          mql++;
        }
        if (s === "sql" || s === "reuniao_agendada" || s === "reuniao_realizada" || s === "venda") {
          sql++;
        }
        if (s === "reuniao_agendada" || s === "reuniao_realizada" || s === "venda") {
          reunioesAgendadas++;
        }
        if (s === "reuniao_realizada" || s === "venda") {
          reunioesRealizadas++;
        }
        if (s === "venda") {
          vendas++;
        }
      }

      return { totalLeads, mql, sql, reunioesAgendadas, reunioesRealizadas, vendas };
    },
    refetchInterval: 600_000, // 10 minutes
  });
}
