export interface Filters {
  dateRange: string;
  startDate: Date | undefined;
  endDate: Date | undefined;
  adAccount: string;
  city: string;
  produtos: string[];
  canalId: string; // canal de aquisição selecionado ("" = Geral)
}

interface SaleRecord {
  date: string;
  city: string;
  adAccount: string;
  investimento: number;
  faturamento: number;
  vendasIndividuais: number;
  vendasDuplas: number;
  vipIndividuais: number;
  vipDuplas: number;
}

const rawData: SaleRecord[] = [
  { date: "2026-01-03", city: "sp", adAccount: "acc1", investimento: 1200, faturamento: 4800, vendasIndividuais: 12, vendasDuplas: 6, vipIndividuais: 3, vipDuplas: 2 },
  { date: "2026-01-07", city: "rj", adAccount: "acc2", investimento: 1800, faturamento: 6200, vendasIndividuais: 18, vendasDuplas: 8, vipIndividuais: 5, vipDuplas: 3 },
  { date: "2026-01-12", city: "sp", adAccount: "acc1", investimento: 2200, faturamento: 7800, vendasIndividuais: 22, vendasDuplas: 10, vipIndividuais: 6, vipDuplas: 4 },
  { date: "2026-01-18", city: "bh", adAccount: "acc1", investimento: 1600, faturamento: 5400, vendasIndividuais: 14, vendasDuplas: 5, vipIndividuais: 4, vipDuplas: 1 },
  { date: "2026-01-22", city: "ctb", adAccount: "acc2", investimento: 2800, faturamento: 9200, vendasIndividuais: 28, vendasDuplas: 14, vipIndividuais: 8, vipDuplas: 5 },
  { date: "2026-01-28", city: "sp", adAccount: "acc1", investimento: 3200, faturamento: 11000, vendasIndividuais: 24, vendasDuplas: 12, vipIndividuais: 7, vipDuplas: 6 },
  { date: "2026-02-02", city: "rj", adAccount: "acc2", investimento: 2600, faturamento: 8800, vendasIndividuais: 20, vendasDuplas: 11, vipIndividuais: 5, vipDuplas: 4 },
  { date: "2026-02-08", city: "sp", adAccount: "acc1", investimento: 1900, faturamento: 6500, vendasIndividuais: 16, vendasDuplas: 7, vipIndividuais: 4, vipDuplas: 3 },
  { date: "2026-02-12", city: "bh", adAccount: "acc2", investimento: 2100, faturamento: 7200, vendasIndividuais: 19, vendasDuplas: 9, vipIndividuais: 6, vipDuplas: 2 },
  { date: "2026-02-15", city: "ctb", adAccount: "acc1", investimento: 1500, faturamento: 5100, vendasIndividuais: 13, vendasDuplas: 6, vipIndividuais: 3, vipDuplas: 2 },
];

function filterByDate(data: SaleRecord[], filters: Filters): SaleRecord[] {
  // If explicit dates are provided, use them
  if (filters.startDate && filters.endDate) {
    return data.filter((r) => {
      const d = new Date(r.date);
      return d >= filters.startDate! && d <= filters.endDate!;
    });
  }

  const now = new Date("2026-02-15");
  let cutoff: Date;

  switch (filters.dateRange) {
    case "today":
      return data.filter((r) => r.date === "2026-02-15");
    case "yesterday":
      return data.filter((r) => r.date === "2026-02-14");
    case "7d":
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
      break;
    case "14d":
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 14);
      break;
    case "30d":
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 30);
      break;
    case "this_month":
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return data.filter((r) => {
        const d = new Date(r.date);
        return d >= start && d <= end;
      });
    }
    case "lifetime":
      return data;
    default:
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 30);
  }

  return data.filter((r) => new Date(r.date) >= cutoff);
}

export function getFilteredData(filters: Filters) {
  let data = filterByDate(rawData, filters);
  if (filters.adAccount !== "all") {
    data = data.filter((r) => r.adAccount === filters.adAccount);
  }
  if (filters.city !== "all") {
    data = data.filter((r) => r.city === filters.city);
  }

  const investimentoTotal = data.reduce((s, r) => s + r.investimento, 0);
  const bilheteriaTotal = data.reduce((s, r) => s + r.faturamento, 0);
  const vendasIndividuais = data.reduce((s, r) => s + r.vendasIndividuais, 0);
  const vendasDuplas = data.reduce((s, r) => s + r.vendasDuplas, 0);
  const totalVendas = vendasIndividuais + vendasDuplas;
  const vipIndividuais = data.reduce((s, r) => s + r.vipIndividuais, 0);
  const vipDuplas = data.reduce((s, r) => s + r.vipDuplas, 0);
  const totalVips = vipIndividuais + vipDuplas * 2;
  const participantes = vendasIndividuais + vendasDuplas * 2;
  const cacVenda = totalVendas > 0 ? investimentoTotal / totalVendas : 0;
  const cacParticipante = participantes > 0 ? investimentoTotal / participantes : 0;
  const ticketMedio = totalVendas > 0 ? bilheteriaTotal / totalVendas : 0;
  const lucro = bilheteriaTotal - investimentoTotal;

  // Bilheteria VIP ~30% of total, Ingressos normais ~70%
  const bilheteriaVip = data.reduce((s, r) => s + (r.vipIndividuais + r.vipDuplas * 2) * 300, 0);
  const bilheteriaIngressos = bilheteriaTotal - bilheteriaVip;

  const chartData = data.map((r) => ({
    name: new Date(r.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    investimento: r.investimento,
    faturamento: r.faturamento,
  }));

  return {
    investimentoTotal,
    bilheteriaTotal,
    cacVenda,
    cacParticipante,
    participantes,
    totalVips,
    vendasIndividuais,
    vendasDuplas,
    ticketMedio,
    bilheteriaIngressos,
    bilheteriaVip,
    lucro,
    chartData,
  };
}

export const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
