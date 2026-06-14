import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import type { Filters } from "@/lib/mockData";
import { getDateRange } from "@/hooks/useLeadsData";
import { useProdutos } from "@/hooks/useProdutos";

type Field =
  | { kind: "column"; key: "cidade" | "utm_content" | "utm_source" }
  | { kind: "custom"; key: string };

interface Props {
  filters: Filters;
  title: string;
  icon: LucideIcon;
  field: Field;
  limit?: number;
  /** Rótulo para valores vazios (não exibido — vazios são ignorados no ranking). */
}

export function LeadsRanking({ filters, title, icon: Icon, field, limit = 8 }: Props) {
  const { data: produtos = [] } = useProdutos();
  const slugSource = filters.canalId
    ? produtos.find((p) => p.id === filters.canalId)?.slug_source || null
    : null;

  const { data = [] } = useQuery({
    queryKey: ["leads-ranking", field.kind, field.key, filters.dateRange, filters.startDate?.toISOString() ?? "", filters.endDate?.toISOString() ?? "", slugSource],
    queryFn: async () => {
      const { start, end } = getDateRange(filters);
      const { data } = await supabase
        .from("leads")
        .select("utm_source, cidade, utm_content, custom")
        .gte("data_lead", start)
        .lte("data_lead", end);
      const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const alvos = slugSource ? slugSource.split(",").map((s) => norm(s.trim())).filter(Boolean) : [];
      const getVal = (l: any): string => {
        const raw = field.kind === "custom" ? l.custom?.[field.key] : l[field.key];
        return raw == null ? "" : String(raw).trim();
      };
      const counts: Record<string, number> = {};
      (data || [])
        .filter((l: any) => alvos.length === 0 || (l.utm_source && alvos.some((s) => norm(l.utm_source).includes(s))))
        .forEach((l: any) => {
          const v = getVal(l);
          if (!v) return; // ignora vazios no ranking
          counts[v] = (counts[v] || 0) + 1;
        });
      return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    },
    refetchInterval: 60_000,
  });

  const top = data.slice(0, limit);
  const max = top.length ? top[0].value : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</div>
        ) : (
          <div className="space-y-2.5">
            {top.map((d, i) => (
              <div key={d.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground w-4 shrink-0 text-right">{i + 1}.</span>
                    <span className="truncate" title={d.name}>{d.name}</span>
                  </span>
                  <span className="font-medium shrink-0">{d.value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${max ? (d.value / max) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
