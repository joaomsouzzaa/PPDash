import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/KpiCard";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAdAccounts, fetchAccountInsights, fetchDailyMetrics,
  hydrateMetaTokenFromServer, isTokenExpired,
} from "@/lib/meta-ads";
import {
  DollarSign, Eye, Layers, MousePointerClick, Target, TrendingUp, BarChart3, Link2, CreditCard,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const fmtBRL = (n: number) => `R$ ${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => (n || 0).toLocaleString("pt-BR");
const fmtPct = (n: number) => `${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

async function getAccountIds(): Promise<string[]> {
  const sel = localStorage.getItem("selected_ad_account");
  if (sel && sel !== "all") return [sel];
  const accounts = await fetchAdAccounts();
  return accounts.map((a) => a.id);
}

export default function Performance() {
  const [metaConnected, setMetaConnected] = useState(() => localStorage.getItem("meta_connected") === "true");
  const init = (() => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 89); return { s, e }; })();
  const [preset, setPreset] = useState("90d");
  const [startDate, setStartDate] = useState<Date | undefined>(init.s);
  const [endDate, setEndDate] = useState<Date | undefined>(init.e);

  useEffect(() => {
    (async () => {
      const ok = await hydrateMetaTokenFromServer();
      if (ok) setMetaConnected(true);
    })();
  }, []);

  const enabled = metaConnected && !isTokenExpired();

  const { data: kpis, isLoading: loadingKpis } = useQuery({
    queryKey: ["perf-kpis", startDate?.toISOString(), endDate?.toISOString(), preset],
    enabled,
    queryFn: async () => fetchAccountInsights(await getAccountIds(), startDate, endDate, preset),
  });
  const { data: daily = [], isLoading: loadingDaily } = useQuery({
    queryKey: ["perf-daily", startDate?.toISOString(), endDate?.toISOString(), preset],
    enabled,
    queryFn: async () => fetchDailyMetrics(await getAccountIds(), startDate, endDate, preset),
  });

  const chartData = daily.map((d) => ({
    name: new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    Investimento: Math.round(d.spend),
    Cliques: d.clicks,
  }));

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
            <DateRangePicker
              preset={preset}
              startDate={startDate}
              endDate={endDate}
              onApply={(p, s, e) => { setPreset(p); setStartDate(s); setEndDate(e); }}
            />

            {!enabled ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground">
                Conecte o Meta Ads em <span className="text-foreground font-medium">Integrações</span> para ver a performance.
              </CardContent></Card>
            ) : (
              <>
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Resumo Executivo</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
                  <KpiCard title="Investimento Total" value={loadingKpis ? "..." : fmtBRL(kpis?.spend || 0)} icon={DollarSign} />
                  <KpiCard title="Impressões" value={loadingKpis ? "..." : fmtNum(kpis?.impressions || 0)} icon={Eye} />
                  <KpiCard title="CPM" value={loadingKpis ? "..." : fmtBRL(kpis?.cpm || 0)} icon={Layers} />
                  <KpiCard title="CTR" value={loadingKpis ? "..." : fmtPct(kpis?.ctr || 0)} icon={Target} />
                  <KpiCard title="Cliques" value={loadingKpis ? "..." : fmtNum(kpis?.clicks || 0)} icon={MousePointerClick} />
                  <KpiCard title="CPC" value={loadingKpis ? "..." : fmtBRL(kpis?.cpc || 0)} icon={DollarSign} />
                  <KpiCard title="Connect Rate" value={loadingKpis ? "..." : fmtPct(kpis?.connectRate || 0)} icon={Link2} />
                  <KpiCard title="Page Views" value={loadingKpis ? "..." : fmtNum(kpis?.pageViews || 0)} icon={BarChart3} />
                  <KpiCard title="Custo por Page View" value={loadingKpis ? "..." : fmtBRL(kpis?.costPerPageView || 0)} icon={CreditCard} />
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
