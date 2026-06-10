import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { fetchBreakdown, type BreakdownRow } from "@/lib/meta-ads";
import { BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { BarChart, Bar, Cell, PieChart, Pie, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const BR_COLORS = ["#ff2d75", "#00d4ff", "#39ff14", "#faff00", "#bf5af2", "#ff6600"];
const GENERO: Record<string, string> = { male: "Masculino", female: "Feminino", unknown: "Desconhecido" };
const PRETTY: Record<string, string> = {
  iphone: "iPhone", android_smartphone: "Android", desktop: "Desktop", ipad: "iPad",
  android_tablet: "Android Tablet", facebook: "Facebook", instagram: "Instagram",
  audience_network: "Audience Network", messenger: "Messenger", mobile_app: "App Mobile",
  mobile_web: "Web Mobile", unknown: "Desconhecido",
  feed: "Feed", instagram_stories: "Stories (IG)", facebook_stories: "Stories (FB)",
  instagram_reels: "Reels (IG)", facebook_reels: "Reels (FB)", instream_video: "Vídeo In-stream",
  right_hand_column: "Coluna Direita", marketplace: "Marketplace", search: "Busca",
  story: "Stories", instant_article: "Instant Article", an_classic: "Audience Network", mobile: "Mobile",
};
const lbl = (s: string) => GENERO[s] || PRETTY[s] || s;

const renderPct = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null;
  const RAD = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{(percent * 100).toFixed(0)}%</text>;
};

export function BreakCard({ title, rows, type, max }: { title: string; rows: BreakdownRow[]; type: "pie" | "bar"; max?: number }) {
  const [tipo, setTipo] = useState<"pie" | "bar">(type);
  const data = rows.map((r) => ({ name: lbl(r.label), value: r.purchases })).filter((d) => d.value > 0).slice(0, max ?? 99);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex rounded-md border border-border overflow-hidden shrink-0">
          <button type="button" onClick={() => setTipo("pie")} title="Pizza/Rosca"
            className={`p-1.5 ${tipo === "pie" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60"}`}>
            <PieChartIcon className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => setTipo("bar")} title="Barras"
            className={`p-1.5 ${tipo === "bar" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60"}`}>
            <BarChart3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          {data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem compras neste segmento</div>
          ) : tipo === "pie" ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={45} outerRadius={78} paddingAngle={2} label={renderPct} labelLine={false}>
                  {data.map((_, i) => <Cell key={i} fill={BR_COLORS[i % BR_COLORS.length]} />)}
                </Pie>
                <Tooltip separator="" contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#fff", fontWeight: 600 }} formatter={(v: number) => [`${v} compras`, ""]} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 10, right: 16 }}>
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={90} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip cursor={{ fill: "hsl(var(--muted)/0.3)" }} separator="" contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#fff", fontWeight: 600 }} formatter={(v: number) => [`${v} compras`, ""]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {data.map((_, i) => <Cell key={i} fill={BR_COLORS[i % BR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface Props {
  enabled: boolean;
  getAccountIds: () => Promise<string[]>;
  startDate?: Date; endDate?: Date; dateRange: string; slug?: string;
}

// Hook que busca os 6 breakdowns (reaproveitável p/ compor os gráficos avulsos).
export function useBreakdownData({ enabled, getAccountIds, startDate, endDate, dateRange, slug }: Props) {
  const qkey = [dateRange, startDate?.toISOString(), endDate?.toISOString(), slug];
  const bq = (breakdown: string, keyField?: string) => ({
    queryKey: ["bd", breakdown, keyField || "", ...qkey],
    enabled,
    queryFn: async () => fetchBreakdown(await getAccountIds(), breakdown, startDate, endDate, dateRange, slug, true, keyField),
  });
  const { data: genero = [] } = useQuery(bq("gender"));
  const { data: idade = [] } = useQuery(bq("age"));
  const { data: dispositivo = [] } = useQuery(bq("impression_device"));
  const { data: plataforma = [] } = useQuery(bq("publisher_platform"));
  const { data: mobileDesktop = [] } = useQuery(bq("device_platform"));
  const { data: posicao = [] } = useQuery(bq("publisher_platform,platform_position", "platform_position"));
  return { genero, idade, dispositivo, plataforma, mobileDesktop, posicao };
}

export function BreakdownCharts(props: Props) {
  const { genero: bdGenero, idade: bdIdade, dispositivo: bdDispositivo, plataforma: bdPlataforma, mobileDesktop: bdMobileDesktop, posicao: bdPosicao } = useBreakdownData(props);

  if (!props.enabled) return null;
  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Público &amp; Dispositivos · por compras</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BreakCard title="Plataforma" rows={bdPlataforma} type="pie" />
        <BreakCard title="Posição (Feed/Reels/Stories)" rows={bdPosicao} type="pie" max={8} />
        <BreakCard title="Dispositivo" rows={bdDispositivo} type="pie" />
        <BreakCard title="Mobile vs Desktop" rows={bdMobileDesktop} type="pie" />
        <BreakCard title="Gênero" rows={bdGenero} type="pie" />
        <BreakCard title="Faixa Etária" rows={bdIdade} type="bar" />
      </div>
    </div>
  );
}
