import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Map as MapIcon } from "lucide-react";
import type { Filters } from "@/lib/mockData";
import { getDateRange } from "@/hooks/useLeadsData";
import { useProdutos } from "@/hooks/useProdutos";

const GEO_URL = "/brazil-states.geojson";

// Interpola do vermelho claro ao vermelho forte do painel conforme a intensidade.
function cor(count: number, max: number): string {
  if (!count || !max) return "hsl(var(--muted))";
  const t = Math.min(1, count / max);
  const a = [253, 224, 226], b = [225, 29, 42];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function BrazilHeatMap({ filters }: { filters: Filters }) {
  const { start, end } = getDateRange(filters);
  const { data: produtos = [] } = useProdutos();
  const slugSource = filters.canalId
    ? produtos.find((p) => p.id === filters.canalId)?.slug_source || null
    : null;
  const [hover, setHover] = useState<{ uf: string; n: number } | null>(null);

  const { data: counts = {} } = useQuery({
    queryKey: ["leads-por-estado", start, end, slugSource],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("utm_source, custom")
        .gte("data_lead", start)
        .lte("data_lead", end);
      const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const alvos = slugSource ? slugSource.split(",").map((s) => norm(s.trim())).filter(Boolean) : [];
      const c: Record<string, number> = {};
      (data || [])
        .filter((l: any) => alvos.length === 0 || (l.utm_source && alvos.some((s) => norm(l.utm_source).includes(s))))
        .forEach((l: any) => {
          const uf = String(l.custom?.estado || "").trim().toUpperCase();
          if (uf) c[uf] = (c[uf] || 0) + 1;
        });
      return c;
    },
    refetchInterval: 60_000,
  });

  const max = Math.max(0, ...Object.values(counts));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><MapIcon className="h-4 w-4 text-primary" /> Leads por estado</span>
          {hover && <span className="text-sm font-normal text-muted-foreground">{hover.uf}: <strong className="text-foreground">{hover.n}</strong></span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {max === 0 ? (
          <div className="h-[360px] flex items-center justify-center text-sm text-muted-foreground">Sem leads no período.</div>
        ) : (
          <ComposableMap projection="geoMercator" projectionConfig={{ scale: 620, center: [-54, -15] }} height={380} style={{ width: "100%", height: "auto" }}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const uf = geo.properties.sigla as string;
                  const n = counts[uf] || 0;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={cor(n, max)}
                      stroke="hsl(var(--border))"
                      strokeWidth={0.5}
                      onMouseEnter={() => setHover({ uf, n })}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        default: { outline: "none" },
                        hover: { outline: "none", opacity: 0.85, cursor: "pointer" },
                        pressed: { outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        )}
      </CardContent>
    </Card>
  );
}
