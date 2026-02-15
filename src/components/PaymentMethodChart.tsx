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
  "hsl(220, 90%, 56%)",   // blue
  "hsl(142, 71%, 45%)",   // green
  "hsl(38, 92%, 50%)",    // amber
  "hsl(340, 82%, 52%)",   // rose
  "hsl(262, 83%, 58%)",   // purple
  "hsl(190, 90%, 50%)",   // cyan
];

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), "Faturamento"]}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--card-foreground))",
                }}
              />
              <Legend
                formatter={(value: string) => (
                  <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-2">
          Total: {formatCurrency(total)}
        </p>
      </CardContent>
    </Card>
  );
}
