// Métricas/blocos do dashboard de Inside Sales que podem ser ligados/desligados
// por canal (produtos.metricas). Sem config (null) = mostra todos.

export interface MetricDef { key: string; label: string; grupo: "KPI" | "Gráfico" }

export const DASHBOARD_METRICS: MetricDef[] = [
  { key: "investimento", label: "Investimento Total", grupo: "KPI" },
  { key: "leads", label: "Leads Totais", grupo: "KPI" },
  { key: "cpl", label: "Custo por Lead (CPL)", grupo: "KPI" },
  { key: "mql", label: "Leads MQL", grupo: "KPI" },
  { key: "mql_pct", label: "Percentual MQL", grupo: "KPI" },
  { key: "cpl_mql", label: "Custo por MQL", grupo: "KPI" },
  { key: "sql", label: "Leads SQL", grupo: "KPI" },
  { key: "sql_pct", label: "Percentual SQL", grupo: "KPI" },
  { key: "cpl_sql", label: "Custo por SQL", grupo: "KPI" },
  { key: "reuniao_agendada", label: "Reunião Agendada", grupo: "KPI" },
  { key: "reuniao_realizada", label: "Reunião Realizada", grupo: "KPI" },
  { key: "vendas", label: "Vendas", grupo: "KPI" },
  { key: "faturamento", label: "Faturamento", grupo: "KPI" },
  { key: "roas", label: "ROAS", grupo: "KPI" },
  { key: "funil", label: "Funil de vendas", grupo: "Gráfico" },
  { key: "mapa", label: "Mapa do Brasil + Estados", grupo: "Gráfico" },
  { key: "origem", label: "Origem dos leads (pizza)", grupo: "Gráfico" },
  { key: "criativos", label: "Criativos (UTM Content)", grupo: "Gráfico" },
  { key: "cidades", label: "Cidades com mais leads", grupo: "Gráfico" },
];

export const ALL_METRIC_KEYS = DASHBOARD_METRICS.map((m) => m.key);
