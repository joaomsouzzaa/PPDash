import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart as PieIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Filters } from "@/lib/mockData";
import { getDateRange } from "@/hooks/useLeadsData";
import { useProdutos } from "@/hooks/useProdutos";

// Paleta tom sobre tom (vermelho do painel) + cinza para "Outros".
const PALETA = ["#e11d2a", "#a31621", "#6e0d16", "#3d0a0e", "#f97316", "#b45309", "#7c3aed", "#2563eb", "#0891b2", "#15803d"];
const COR_OUTROS = "#6b7280";
const cor = (i: number, name: string) => (name === "Outros" || name === "(sem resposta)" ? COR_OUTROS : PALETA[i % PALETA.length]);

const renderPct = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.06) return null;
  const RAD = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return <text x={x} y={y} fill="#fff" fontSize={12} fontWeight={700} textAnchor="middle" dominantBaseline="central">{`${(percent * 100).toFixed(0)}%`}</text>;
};

/**
 * Pizza com o percentual de respostas de um campo `custom` dos leads
 * (ex.: capacidade_investimento, quando_iniciar). Mesma lógica de período e
 * filtro de canal do LeadsPlacement (Origem dos leads).
 */
export function LeadsCustomPie({
  filters,
  field,
  title,
  icon: Icon = PieIcon,
}: {
  filters: Filters;
  field: string;
  title: string;
  icon?: LucideIcon;
}) {
  const { data: produtos = [] } = useProdutos();
  const slugSource = filters.canalId
    ? produtos.find((p) => p.id === filters.canalId)?.slug_source || null
    : null;

  const { data = [] } = useQuery({
    queryKey: ["leads-custom-pie", field, filters.dateRange, filters.startDate?.toISOString() ?? "", filters.endDate?.toISOString() ?? "", slugSource],
    queryFn: async () => {
      const { start, end } = getDateRange(filters);
      const { data } = await supabase
        .from("leads")
        .select("utm_source, custom")
        .gte("data_lead", start)
        .lte("data_lead", end);
      const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const alvos = slugSource ? slugSource.split(",").map((s) => norm(s.trim())).filter(Boolean) : [];
      const counts: Record<string, number> = {};
      (data || [])
        .filter((l: any) => alvos.length === 0 || (l.utm_source && alvos.some((s) => norm(l.utm_source).includes(s))))
        .forEach((l: any) => {
          const k = ((l.custom?.[field] as string) || "").trim() || "(sem resposta)";
          counts[k] = (counts[k] || 0) + 1;
        });
      const arr = Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
      // Agrupa a cauda longa em "Outros" para a pizza não ficar poluída.
      if (arr.length > 8) {
        const top = arr.slice(0, 7);
        const outros = arr.slice(7).reduce((s, d) => s + d.value, 0);
        top.push({ name: "Outros", value: outros });
        return top;
      }
      return arr;
    },
    refetchInterval: 60_000,
  });

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">
            Sem leads no período (ou sem respostas registradas).
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45}
                  labelLine={false} label={renderPct} stroke="hsl(var(--card))" strokeWidth={2}>
                  {data.map((d, i) => <Cell key={d.name} fill={cor(i, d.name)} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "#fff", fontWeight: 600 }}
                  formatter={(v: number, n: string) => [`${v} leads (${((v / total) * 100).toFixed(1)}%)`, n]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5">
              {data.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: cor(i, d.name) }} />
                    {d.name}
                  </span>
                  <span className="font-medium whitespace-nowrap">{d.value} <span className="text-xs text-muted-foreground">({((d.value / total) * 100).toFixed(0)}%)</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
