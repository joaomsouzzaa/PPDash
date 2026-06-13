import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart as PieIcon } from "lucide-react";
import type { Filters } from "@/lib/mockData";
import { getDateRange } from "@/hooks/useLeadsData";
import { useProdutos } from "@/hooks/useProdutos";

// Tom sobre tom (vermelho do painel) + cinza para "Outros".
const COR_POR_NOME: Record<string, string> = {
  Feed: "#e11d2a",
  Stories: "#a31621",
  Reels: "#6e0d16",
  Explore: "#3d0a0e",
  Outros: "#6b7280",
};

function classificar(s: string): string {
  const t = (s || "").toLowerCase();
  if (/reel/.test(t)) return "Reels";
  if (/stor/.test(t)) return "Stories";
  if (/feed/.test(t)) return "Feed";
  if (/explore/.test(t)) return "Explore";
  return "Outros";
}

const renderPct = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.06) return null;
  const RAD = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return <text x={x} y={y} fill="#fff" fontSize={12} fontWeight={700} textAnchor="middle" dominantBaseline="central">{`${(percent * 100).toFixed(0)}%`}</text>;
};

export function LeadsPlacement({ filters }: { filters: Filters }) {
  const { start, end } = getDateRange(filters);
  const { data: produtos = [] } = useProdutos();
  const slugSource = filters.canalId
    ? produtos.find((p) => p.id === filters.canalId)?.slug_source || null
    : null;

  const { data = [] } = useQuery({
    queryKey: ["leads-placement", start, end, slugSource],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("utm_content, ad_name, utm_term, utm_source")
        .gte("data_lead", start)
        .lte("data_lead", end);
      const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const alvos = slugSource ? slugSource.split(",").map((s) => norm(s.trim())).filter(Boolean) : [];
      const counts: Record<string, number> = {};
      (data || [])
        .filter((l: any) => alvos.length === 0 || (l.utm_source && alvos.some((s) => norm(l.utm_source).includes(s))))
        .forEach((l: any) => {
        const k = classificar(`${l.utm_content || ""} ${l.ad_name || ""} ${l.utm_term || ""}`);
        counts[k] = (counts[k] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    },
    refetchInterval: 60_000,
  });

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PieIcon className="h-4 w-4 text-primary" /> Origem dos leads (posicionamento)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">
            Sem leads no período (ou sem dado de posicionamento).
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="60%" height={320}>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={125} innerRadius={62}
                  labelLine={false} label={renderPct} stroke="hsl(var(--card))" strokeWidth={2}>
                  {data.map((d) => <Cell key={d.name} fill={COR_POR_NOME[d.name] ?? "#6b7280"} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, n: string) => [`${v} leads (${((v / total) * 100).toFixed(1)}%)`, n]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {data.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ background: COR_POR_NOME[d.name] ?? "#6b7280" }} />
                    {d.name}
                  </span>
                  <span className="font-medium">{d.value} <span className="text-xs text-muted-foreground">({((d.value / total) * 100).toFixed(0)}%)</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
