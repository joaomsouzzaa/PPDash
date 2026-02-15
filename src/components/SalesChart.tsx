import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface SalesChartProps {
  data: { name: string; investimento: number; faturamento: number }[];
}

export function SalesChart({ data }: SalesChartProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-base font-semibold text-card-foreground mb-4">
        Investimento vs Faturamento
      </h3>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="investGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff2d75" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#ff2d75" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#39ff14" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#39ff14" stopOpacity={0.02} />
              </linearGradient>
              <filter id="neonGlow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
            <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "13px",
                color: "hsl(var(--card-foreground))",
              }}
              formatter={(value: number) =>
                `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              }
            />
            <Legend
              formatter={(value: string) => (
                <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>
              )}
            />
            <Area
              type="monotone"
              dataKey="investimento"
              stroke="#ff2d75"
              fill="url(#investGrad)"
              strokeWidth={2.5}
              name="Investimento"
              filter="url(#neonGlow)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="faturamento"
              stroke="#39ff14"
              fill="url(#fatGrad)"
              strokeWidth={2.5}
              name="Faturamento"
              filter="url(#neonGlow)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
