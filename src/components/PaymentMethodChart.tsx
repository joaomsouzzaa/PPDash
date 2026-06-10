import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard } from "lucide-react";

interface PaymentMethodData {
  name: string;
  value: number;
  color: string;
}

interface PaymentMethodChartProps {
  data: Record<string, number>;
}

const LABEL_MAP: Record<string, string> = {
  cartaoCredito: "Cartão de Crédito",
  pix: "PIX",
  doisCartoes: "Dois Cartões",
  gratuidade: "Gratuidade",
  boleto: "Boleto",
};

const COLORS = [
  "#39ff14",   // neon green (lime)
  "#ff2d75",   // neon pink
  "#00d4ff",   // electric blue
  "#ff6600",   // fluorescent orange
  "#faff00",   // neon yellow
  "#bf5af2",   // neon purple
];

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// % desenhado DENTRO do anel (evita cortar no topo do card). Só fatias >= 5%.
const renderPctInside = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null;
  const RAD = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{(percent * 100).toFixed(1)}%</text>;
};

export function PaymentMethodChart({ data }: PaymentMethodChartProps) {
  const chartData: PaymentMethodData[] = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([key, value], i) => ({
      name: LABEL_MAP[key] || key,
      value,
      color: COLORS[i % COLORS.length],
    }));

  if (chartData.length === 0) return null;

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <CreditCard className="h-4 w-4 text-primary" />
        </div>
        <CardTitle className="text-base font-semibold">Faturamento por Método de Pagamento</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4">
          {/* Donut Chart — mesmos raios/altura dos demais gráficos pizza (padronizado) */}
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={78}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                  label={renderPctInside}
                  labelLine={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  separator=""
                  formatter={(value: number, _n, p: any) => [`${formatCurrency(value)}`, p?.payload?.name || ""]}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "#fff", fontWeight: 600 }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown List */}
          <div className="w-full space-y-3">
            {chartData.map((item) => {
              const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
              return (
                <div key={item.name} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm font-medium truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold">{formatCurrency(item.value)}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="border-t border-border pt-2 mt-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-sm font-bold">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
