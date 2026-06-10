import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/KpiCard";
import { DashboardFilters } from "@/components/DashboardFilters";
import { useCidades } from "@/hooks/useCidades";
import type { Filters } from "@/lib/mockData";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAdAccounts, fetchAccountInsights, fetchDailyMetrics,
  hydrateMetaTokenFromServer, isTokenExpired,
} from "@/lib/meta-ads";
import {
  DollarSign, Eye, Layers, MousePointerClick, Target, TrendingUp, BarChart3, Link2, CreditCard,
  ShoppingCart, MessageSquare, Bookmark, Heart, MessageCircle, PlayCircle,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const fmtBRL = (n: number) => `R$ ${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => (n || 0).toLocaleString("pt-BR");
const fmtPct = (n: number) => `${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export default function Performance() {
  const [metaConnected, setMetaConnected] = useState(() => localStorage.getItem("meta_connected") === "true");
  const init = (() => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 89); return { s, e }; })();
  const [filters, setFilters] = useState<Filters>({
    dateRange: "90d", startDate: init.s, endDate: init.e,
    adAccount: localStorage.getItem("selected_ad_account") || "all",
    city: "all", produtos: [],
  });

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

  const chartData = daily.map((d) => ({
    name: new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    Investimento: Math.round(d.spend),
    Cliques: d.clicks,
  }));
  const L = (v: string) => (loadingKpis ? "Carregando..." : v);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Performance</h1>
              <p className="text-sm text-muted-foreground">Resumo executivo de mídia paga (Meta Ads)</p>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <DashboardFilters filters={filters} onFiltersChange={setFilters} />

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
                  <KpiCard title="Vendas (compras)" value={L(fmtNum(kpis?.purchases || 0))} icon={MousePointerClick} />
                  <KpiCard title="CAC" value={L(fmtBRL(kpis?.cac || 0))} icon={DollarSign} />
                </div>

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
                              {stages.map((s, i) => (
                                <div key={s.label} className="flex flex-col items-center justify-center text-white">
                                  <span className="font-bold text-sm drop-shadow">{fmtPct(pcts[i] * 100)}</span>
                                  <span className="text-[10px] opacity-90 drop-shadow">{fmtNum(s.value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

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
