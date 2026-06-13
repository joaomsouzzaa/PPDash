import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Filters } from "@/lib/mockData";
import { useProdutos } from "@/hooks/useProdutos";

export function getDateRange(filters: Filters): { start: string; end: string } {
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
    case "90d":
      start = new Date(now);
      start.setDate(start.getDate() - 90);
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
      const { data: camposRaw } = await (supabase as any)
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
