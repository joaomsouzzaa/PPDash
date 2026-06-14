import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/KpiCard";
import { DashboardFilters } from "@/components/DashboardFilters";
import { CacCriativos } from "@/components/CacCriativos";
import { CacSemanalGeral } from "@/components/CacSemanalGeral";
import { CacSemanalPorCriativo } from "@/components/CacSemanalPorCriativo";
import { useCidades } from "@/hooks/useCidades";
import type { Filters } from "@/lib/mockData";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAdAccounts, fetchAccountInsights, fetchDailyMetrics, fetchBreakdown,
  hydrateMetaTokenFromServer, isTokenExpired, type BreakdownRow,
} from "@/lib/meta-ads";
import {
  DollarSign, Eye, Layers, MousePointerClick, Target, TrendingUp, BarChart3, Link2, CreditCard,
  ShoppingCart, MessageSquare, Bookmark, Heart, MessageCircle, PlayCircle, PieChart as PieChartIcon, Loader2,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell, PieChart, Pie,
} from "recharts";

const BR_COLORS = ["#ff2d75", "#00d4ff", "#39ff14", "#faff00", "#bf5af2", "#ff6600"];
const GENERO: Record<string, string> = { male: "Masculino", female: "Feminino", unknown: "Desconhecido" };
const PRETTY: Record<string, string> = {
  iphone: "iPhone", android_smartphone: "Android", desktop: "Desktop", ipad: "iPad",
  android_tablet: "Android Tablet", facebook: "Facebook", instagram: "Instagram",
  audience_network: "Audience Network", messenger: "Messenger", mobile_app: "App Mobile",
  mobile_web: "Web Mobile", "unknown": "Desconhecido",
  // Posições
  feed: "Feed", instagram_stories: "Stories (IG)", facebook_stories: "Stories (FB)",
  instagram_reels: "Reels (IG)", facebook_reels: "Reels (FB)", instream_video: "Vídeo In-stream",
  right_hand_column: "Coluna Direita", marketplace: "Marketplace", search: "Busca",
  story: "Stories", instant_article: "Instant Article", an_classic: "Audience Network",
  // device_platform
  mobile: "Mobile",
};
const lbl = (s: string) => GENERO[s] || PRETTY[s] || s;

// % dentro da fatia (só pras relevantes >= 5%, pra não sobrepor nas pequenas).
const renderPct = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null;
  const RAD = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{(percent * 100).toFixed(0)}%</text>;
};

function BreakCard({ title, rows, type, max, loading }: { title: string; rows: BreakdownRow[]; type: "pie" | "bar"; max?: number; loading?: boolean }) {
  const [tipo, setTipo] = useState<"pie" | "bar">(type);
  const data = rows.map((r) => ({ name: lbl(r.label), value: r.purchases })).filter((d) => d.value > 0).slice(0, max ?? 99);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-base leading-tight min-h-[2.5rem] flex items-start">{title}</CardTitle>
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
          {loading && data.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" /> Carregando...
            </div>
          ) : data.length === 0 ? (
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

const fmtBRL = (n: number) => `R$ ${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => (n || 0).toLocaleString("pt-BR");
const fmtPct = (n: number) => `${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export default function Performance() {
  const [metaConnected, setMetaConnected] = useState(() => localStorage.getItem("meta_connected") === "true");
  // Performance abre sempre no mês atual (reseta no F5).
  const init = (() => { const e = new Date(); const s = new Date(e.getFullYear(), e.getMonth(), 1); return { s, e }; })();
  const [filters, setFilters] = useState<Filters>({
    dateRange: "this_month", startDate: init.s, endDate: init.e,
    adAccount: localStorage.getItem("selected_ad_account") || "all",
    city: localStorage.getItem("selected_city") || "all", produtos: [], canalId: "",
  });
  // Persiste a cidade (todas as páginas mantêm a última selecionada, inclusive no F5).
  const onFiltersChange = (f: Filters) => { setFilters(f); localStorage.setItem("selected_city", f.city); };

  const { data: cidades = [] } = useCidades();
  const selectedCidade = cidades.find((c) => c.slug === filters.city);
  const slug = filters.city !== "all" ? selectedCidade?.slug : undefined;

  useEffect(() => {
    (async () => { if (await hydrateMetaTokenFromServer()) setMetaConnected(true); })();
  }, []);

  const enabled = metaConnected && !isTokenExpired();

  const getAccountIds = async () => {
    if (filters.adAccount !== "all") return [filters.adAccount];
    const accounts = await fetchAdAccounts();
    return accounts.map((a) => a.id);
  };

  const qkey = [filters.dateRange, filters.startDate?.toISOString(), filters.endDate?.toISOString(), filters.adAccount, slug];

  const { data: kpis, isLoading: loadingKpis } = useQuery({
    queryKey: ["perf-kpis", ...qkey],
    enabled,
    queryFn: async () => fetchAccountInsights(await getAccountIds(), filters.startDate, filters.endDate, filters.dateRange, slug, true),
  });
  const { data: daily = [], isLoading: loadingDaily } = useQuery({
    queryKey: ["perf-daily", ...qkey],
    enabled,
    queryFn: async () => fetchDailyMetrics(await getAccountIds(), filters.startDate, filters.endDate, filters.dateRange, slug, true),
  });

  const bq = (breakdown: string, keyField?: string) => ({
    queryKey: ["perf-bd", breakdown, keyField || "", ...qkey],
    enabled,
    queryFn: async () => fetchBreakdown(await getAccountIds(), breakdown, filters.startDate, filters.endDate, filters.dateRange, slug, true, keyField),
  });
  const qGenero = useQuery(bq("gender"));
  const qIdade = useQuery(bq("age"));
  const qDispositivo = useQuery(bq("impression_device"));
  const qPlataforma = useQuery(bq("publisher_platform"));
  const qMobileDesktop = useQuery(bq("device_platform"));
  // Posição (feed/reels/stories) exige combinar com publisher_platform; agregamos por platform_position.
  const qPosicao = useQuery(bq("publisher_platform,platform_position", "platform_position"));
  const bdGenero = qGenero.data || [], bdIdade = qIdade.data || [], bdDispositivo = qDispositivo.data || [];
  const bdPlataforma = qPlataforma.data || [], bdMobileDesktop = qMobileDesktop.data || [], bdPosicao = qPosicao.data || [];
  const ldBd = (q: { isPending: boolean; isFetching: boolean }) => enabled && (q.isPending || q.isFetching);

  const chartData = daily.map((d) => ({
    name: new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    Investimento: Math.round(d.spend),
    Cliques: d.clicks,
  }));
  const L = (v: string) => (loadingKpis ? "Carregando..." : v);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full min-w-0">
        <AppSidebar />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Performance</h1>
              <p className="text-sm text-muted-foreground">Resumo executivo de mídia paga (Meta Ads)</p>
            </div>
          </header>

          <div className="p-6 space-y-6 min-w-0 max-w-full overflow-x-hidden">
            <DashboardFilters filters={filters} onFiltersChange={onFiltersChange} />

            {!enabled ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground">
                Conecte o Meta Ads em <span className="text-foreground font-medium">Integrações</span> para ver a performance.
              </CardContent></Card>
            ) : (
              <>
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Resumo Executivo</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <KpiCard title="Investimento Total" value={L(fmtBRL(kpis?.spend || 0))} icon={DollarSign} />
                  <KpiCard title="Impressões" value={L(fmtNum(kpis?.impressions || 0))} icon={Eye} />
                  <KpiCard title="CPM" value={L(fmtBRL(kpis?.cpm || 0))} icon={Layers} />
                  <KpiCard title="CTR" value={L(fmtPct(kpis?.ctr || 0))} icon={Target} />
                  <KpiCard title="Cliques" value={L(fmtNum(kpis?.clicks || 0))} icon={MousePointerClick} />
                  <KpiCard title="CPC" value={L(fmtBRL(kpis?.cpc || 0))} icon={DollarSign} />
                  <KpiCard title="Connect Rate" value={L(fmtPct(kpis?.connectRate || 0))} icon={Link2} />
                  <KpiCard title="Page Views" value={L(fmtNum(kpis?.pageViews || 0))} icon={BarChart3} />
                  <KpiCard title="Custo por Page View" value={L(fmtBRL(kpis?.costPerPageView || 0))} icon={CreditCard} />
                </div>

                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Métricas de Conversão</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <KpiCard title="Conversão da LP" value={L(fmtPct(kpis?.convLP || 0))} icon={Target} />
                  <KpiCard title="Inicialização de Checkout" value={L(fmtNum(kpis?.checkouts || 0))} icon={ShoppingCart} />
                  <KpiCard title="Conversão do Checkout" value={L(fmtPct(kpis?.convCheckout || 0))} icon={Target} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <KpiCard title="Vendas (compras)" value={L(fmtNum(kpis?.purchases || 0))} icon={MousePointerClick} />
                  <KpiCard title="CAC" value={L(fmtBRL(kpis?.cac || 0))} icon={DollarSign} />
                </div>

                <CacSemanalGeral filters={filters} />
                <CacCriativos filters={filters} />
                <CacSemanalPorCriativo filters={filters} />

                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Métricas de Engajamento</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <KpiCard title="DMs Iniciadas" value={L(fmtNum(kpis?.dms || 0))} icon={MessageSquare} />
                  <KpiCard title="Salvamentos" value={L(fmtNum(kpis?.saves || 0))} icon={Bookmark} />
                  <KpiCard title="Reações" value={L(fmtNum(kpis?.reactions || 0))} icon={Heart} />
                  <KpiCard title="Comentários" value={L(fmtNum(kpis?.comments || 0))} icon={MessageCircle} />
                  <KpiCard title="Video Views" value={L(fmtNum(kpis?.videoViews || 0))} icon={PlayCircle} />
                </div>

                {/* FUNIL DE CONVERSÃO */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Funil de Conversão</CardTitle></CardHeader>
                  <CardContent>
                    {loadingKpis ? (
                      <div className="h-[170px] flex items-center justify-center text-muted-foreground">Carregando...</div>
                    ) : (() => {
                      const stages = [
                        { label: "Impressões", value: kpis?.impressions || 0 },
                        { label: "Cliques", value: kpis?.clicks || 0 },
                        { label: "Page Views", value: kpis?.pageViews || 0 },
                        { label: "Inic. Checkout", value: kpis?.checkouts || 0 },
                        { label: "Vendas", value: kpis?.purchases || 0 },
                      ];
                      const top = stages[0].value || 1;
                      const N = stages.length;
                      const pcts = stages.map((s) => s.value / top); // 0..1 relativo ao topo
                      // Pontos da área do funil (viewBox 0..100). Banda centralizada que afunila.
                      const x = (i: number) => (i / (N - 1)) * 100;
                      const halfPad = 6; // margem vertical
                      const topY = (p: number) => halfPad + (1 - p) * (50 - halfPad);
                      const botY = (p: number) => 100 - topY(p);
                      const topPts = pcts.map((p, i) => `${x(i)},${topY(p)}`);
                      const botPts = pcts.map((p, i) => `${x(i)},${botY(p)}`).reverse();
                      const pathD = `M ${topPts.join(" L ")} L ${botPts.join(" L ")} Z`;
                      return (
                        <div>
                          {/* rótulos no topo */}
                          <div className="grid grid-cols-5 mb-1">
                            {stages.map((s) => (
                              <div key={s.label} className="text-center text-xs font-semibold px-1 leading-tight">{s.label}</div>
                            ))}
                          </div>
                          {/* funil (SVG) com % centralizada por coluna */}
                          <div className="relative h-[150px]">
                            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
                              <defs>
                                <linearGradient id="funilGrad" x1="0" y1="0" x2="1" y2="0">
                                  <stop offset="0%" stopColor="#2d6cff" />
                                  <stop offset="55%" stopColor="#7b2dff" />
                                  <stop offset="100%" stopColor="#ff2d75" />
                                </linearGradient>
                              </defs>
                              <path d={pathD} fill="url(#funilGrad)" />
                            </svg>
                            <div className="absolute inset-0 grid grid-cols-5">
                              {stages.map((s) => (
                                <div key={s.label} className="flex items-center justify-center text-white">
                                  <span className="font-bold text-sm drop-shadow">{fmtNum(s.value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* PÚBLICO & DISPOSITIVOS (por compras) */}
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Público & Dispositivos · por compras</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <BreakCard title="Plataforma" rows={bdPlataforma} loading={ldBd(qPlataforma)} type="pie" />
                  <BreakCard title="Posição (Feed/Reels/Stories)" rows={bdPosicao} loading={ldBd(qPosicao)} type="pie" max={8} />
                  <BreakCard title="Dispositivo" rows={bdDispositivo} loading={ldBd(qDispositivo)} type="pie" />
                  <BreakCard title="Mobile vs Desktop" rows={bdMobileDesktop} loading={ldBd(qMobileDesktop)} type="pie" />
                  <BreakCard title="Gênero" rows={bdGenero} loading={ldBd(qGenero)} type="pie" />
                  <BreakCard title="Faixa Etária" rows={bdIdade} loading={ldBd(qIdade)} type="bar" />
                </div>

                <Card>
                  <CardHeader><CardTitle className="text-base">Investimento e Cliques por dia</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[320px]">
                      {loadingDaily ? (
                        <div className="h-full flex items-center justify-center text-muted-foreground">Carregando...</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ff2d75" stopOpacity={0.6} />
                                <stop offset="95%" stopColor="#ff2d75" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="gClk" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#39ff14" stopOpacity={0.5} />
                                <stop offset="95%" stopColor="#39ff14" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                            <YAxis yAxisId="l" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                            <YAxis yAxisId="r" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                            <Legend />
                            <Area yAxisId="l" type="monotone" dataKey="Investimento" stroke="#ff2d75" fill="url(#gInv)" strokeWidth={2} />
                            <Area yAxisId="r" type="monotone" dataKey="Cliques" stroke="#39ff14" fill="url(#gClk)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
