import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Filters } from "@/lib/mockData";
import { removeAccents } from "@/lib/utils";

interface VendaRow {
  valor: number;
  quantidade: number;
  tipo_ingresso: string | null;
  produto: string | null;
  cidade: string | null;
  data_venda: string;
  status: string;
}

function getDateRange(filters: Filters): { start: string; end: string } {
  if (filters.startDate && filters.endDate) {
    return {
      start: filters.startDate.toISOString(),
      end: new Date(filters.endDate.getTime() + 86400000 - 1).toISOString(), // end of day
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

export function useVendasData(filters: Filters) {
  return useQuery({
    queryKey: ["vendas-kpi", filters.dateRange, filters.startDate?.toISOString(), filters.endDate?.toISOString(), filters.city],
    queryFn: async () => {
      const { start, end } = getDateRange(filters);

      let query = supabase
        .from("vendas")
        .select("valor, quantidade, tipo_ingresso, produto, cidade, data_venda, status")
        .eq("status", "aprovada")
        .gte("data_venda", start)
        .lte("data_venda", end)
        .order("data_venda", { ascending: true });

      if (filters.city !== "all") {
        const normalizedCity = removeAccents(filters.city);
        query = query.ilike("cidade", `%${normalizedCity}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      return calcularKpis((data as VendaRow[]) || []);
    },
    refetchInterval: 60_000, // auto-refresh every minute
  });
}

function isVip(row: VendaRow): boolean {
  const nome = (row.tipo_ingresso || row.produto || "").toLowerCase();
  return nome.includes("vip");
}

function isDuplo(row: VendaRow): boolean {
  const tipo = (row.tipo_ingresso || "").toLowerCase();
  const nome = (row.produto || "").toLowerCase();
  return tipo.includes("duplo") || tipo === "duplo" || nome.includes("duplo") || nome.includes("2 pessoas");
}

function calcularKpis(vendas: VendaRow[]) {
  let bilheteriaTotal = 0;
  let bilheteriaVip = 0;
  let bilheteriaIngressos = 0;
  let vendasIndividuais = 0;
  let vendasDuplas = 0;
  let totalVips = 0;
  let participantes = 0;

  for (const v of vendas) {
    const valor = Number(v.valor) || 0;
    bilheteriaTotal += valor;

    const duplo = isDuplo(v);
    const vip = isVip(v);

    if (duplo) {
      vendasDuplas++;
      participantes += 2;
    } else {
      vendasIndividuais++;
      participantes += v.quantidade || 1;
    }

    if (vip) {
      bilheteriaVip += valor;
      totalVips += duplo ? 2 : 1;
    } else {
      bilheteriaIngressos += valor;
    }
  }

  const totalVendas = vendasIndividuais + vendasDuplas;
  const ticketMedio = totalVendas > 0 ? bilheteriaTotal / totalVendas : 0;

  // Chart data: agrupar por dia
  const porDia = new Map<string, { investimento: number; faturamento: number }>();
  for (const v of vendas) {
    const dia = new Date(v.data_venda).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const entry = porDia.get(dia) || { investimento: 0, faturamento: 0 };
    entry.faturamento += Number(v.valor) || 0;
    porDia.set(dia, entry);
  }

  const chartData = Array.from(porDia.entries()).map(([name, d]) => ({
    name,
    investimento: d.investimento,
    faturamento: d.faturamento,
  }));

  return {
    bilheteriaTotal,
    bilheteriaVip,
    bilheteriaIngressos,
    vendasIndividuais,
    vendasDuplas,
    totalVips,
    participantes,
    ticketMedio,
    investimentoTotal: 0, // comes from Meta Ads
    cacVenda: 0,
    cacParticipante: 0,
    lucro: 0,
    chartData,
  };
}
