import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  Users,
  ShoppingCart,
  Target,
  Crown,
  User,
  Users2,
  Ticket,
  Gift,
  Banknote,
  BarChart3,
  Tv,
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";

import { KpiCard } from "@/components/KpiCard";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesChart } from "@/components/SalesChart";
import { PaymentMethodChart } from "@/components/PaymentMethodChart";
import { fmt, type Filters } from "@/lib/mockData";
import { fetchAdAccounts, fetchAdSpend, fetchCampaignDailyBudget, fetchDailySpendBreakdown } from "@/lib/meta-ads";
import { useVendasData } from "@/hooks/useVendasData";
import { useCidades } from "@/hooks/useCidades";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import { differenceInDays } from "date-fns";

const Index = () => {
  const [filters, setFilters] = useState<Filters>(() => {
    const savedAccount = localStorage.getItem("selected_ad_account");
    const savedDateRange = localStorage.getItem("dashboard11_date_range");
    const savedStartDate = localStorage.getItem("dashboard11_start_date");
    const savedEndDate = localStorage.getItem("dashboard11_end_date");
    const savedCity = localStorage.getItem("selected_city");
    return {
      dateRange: savedDateRange || "30d",
      startDate: savedStartDate ? new Date(savedStartDate) : undefined,
      endDate: savedEndDate ? new Date(savedEndDate) : undefined,
      adAccount: savedAccount || "all",
      city: savedCity || "all",
      produtos: [],
    };
  });

  const handleFiltersChange = (newFilters: Filters) => {
    if (newFilters.adAccount !== filters.adAccount) {
      localStorage.setItem("selected_ad_account", newFilters.adAccount);
    }
    localStorage.setItem("dashboard11_date_range", newFilters.dateRange);
    if (newFilters.startDate) {
      localStorage.setItem("dashboard11_start_date", newFilters.startDate.toISOString());
    } else {
      localStorage.removeItem("dashboard11_start_date");
    }
    if (newFilters.endDate) {
      localStorage.setItem("dashboard11_end_date", newFilters.endDate.toISOString());
    } else {
      localStorage.removeItem("dashboard11_end_date");
    }
    localStorage.setItem("selected_city", newFilters.city);
    setFilters(newFilters);
  };

  const [metaInvestimento, setMetaInvestimento] = useState<number | null>(null);
  const [loadingSpend, setLoadingSpend] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [projecaoParticipantes, setProjecaoParticipantes] = useState<number | null>(null);
  const [dailySpendMap, setDailySpendMap] = useState<Map<string, number>>(new Map());

  const { data: cidades = [] } = useCidades();
  const isMetaConnected = localStorage.getItem("meta_connected") === "true";

  const selectedCidade = cidades.find((c) => c.slug === filters.city);

  // TV Mode: fullscreen + rotate through active cities every 20s
  const [tvMode, setTvMode] = useState(false);
  const hiddenCidades = getHiddenCidades();
  const activeCidades = cidades.filter((c) => {
    if (hiddenCidades.includes(c.id)) return false;
    const eventDate = new Date(c.data_evento);
    const today = new Date();
    eventDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return eventDate >= today;
  });

  const toggleTvMode = async () => {
    if (!tvMode) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {}
      setTvMode(true);
    } else {
      if (document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch {}
      }
      setTvMode(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setTvMode(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!tvMode || activeCidades.length === 0) return;
    // Initialize with first active city if current isn't in list
    const currentIdx = activeCidades.findIndex((c) => c.slug === filters.city);
    if (currentIdx === -1) {
      handleFiltersChange({ ...filters, city: activeCidades[0].slug });
      return;
    }
    const interval = setInterval(() => {
      const idx = activeCidades.findIndex((c) => c.slug === filters.city);
      const nextIdx = (idx + 1) % activeCidades.length;
      handleFiltersChange({ ...filters, city: activeCidades[nextIdx].slug });
    }, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvMode, filters.city, activeCidades.length]);


  const loadSpend = useCallback(async () => {
    if (!isMetaConnected) {
      setMetaInvestimento(null);
      return;
    }
    setLoadingSpend(true);
    try {
      let accountIds: string[];

      if (filters.adAccount !== "all") {
        accountIds = [filters.adAccount];
      } else {
        const accounts = await fetchAdAccounts();
        accountIds = accounts.map((a) => a.id);
      }

      if (accountIds.length === 0) {
        setMetaInvestimento(0);
        return;
      }

      const slug = selectedCidade?.slug;
      const [results, dailyBreakdown] = await Promise.all([
        fetchAdSpend(accountIds, filters.dateRange, filters.startDate, filters.endDate, slug),
        fetchDailySpendBreakdown(accountIds, filters.dateRange, filters.startDate, filters.endDate, slug),
      ]);
      const totalSpend = results.reduce((sum, r) => sum + r.spend, 0);
      setMetaInvestimento(totalSpend);
      setDailySpendMap(dailyBreakdown);
    } catch {
      setMetaInvestimento(null);
    } finally {
      setLoadingSpend(false);
    }
  }, [isMetaConnected, filters.adAccount, filters.dateRange, filters.startDate, filters.endDate, selectedCidade?.slug]);

  useEffect(() => {
    loadSpend();
  }, [loadSpend, refreshKey]);

  // Auto-refresh every 10 minutes (was 60s — caused Meta rate limiting)
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: vendasData, isLoading: loadingVendas } = useVendasData(filters);
  const kpi = vendasData || {
    investimentoTotal: 0, bilheteriaTotal: 0, cacVenda: 0, cacParticipante: 0,
    participantes: 0, participantesParaCAC: 0, vendasParaCAC: 0, totalVips: 0,
    totalConvidados: 0, vendasIndividuais: 0, vendasDuplas: 0, ticketMedio: 0,
    bilheteriaIngressos: 0, bilheteriaVip: 0, lucro: 0, chartData: [] as any[],
    pagamentoPorMetodo: {} as Record<string, number>,
  };

  const investimentoDisplay = metaInvestimento !== null ? metaInvestimento : kpi.investimentoTotal;

  const cacVendaDisplay = metaInvestimento !== null && kpi.vendasParaCAC > 0
    ? metaInvestimento / kpi.vendasParaCAC
    : kpi.cacVenda;
  const cacParticipanteDisplay = metaInvestimento !== null && kpi.participantesParaCAC > 0
    ? metaInvestimento / kpi.participantesParaCAC
    : kpi.cacParticipante;
  const lucroDisplay = metaInvestimento !== null
    ? kpi.bilheteriaTotal - metaInvestimento
    : kpi.lucro;

  // Calculate projection using campaign's configured daily budget
  useEffect(() => {
    if (!selectedCidade || !isMetaConnected) {
      setProjecaoParticipantes(null);
      return;
    }

    const calcProjection = async () => {
      try {
        let accountIds: string[];
        if (filters.adAccount !== "all") {
          accountIds = [filters.adAccount];
        } else {
          const accounts = await fetchAdAccounts();
          accountIds = accounts.map((a) => a.id);
        }
        if (accountIds.length === 0) {
          setProjecaoParticipantes(null);
          return;
        }

        const dailyBudget = await fetchCampaignDailyBudget(accountIds, selectedCidade.slug);

        const eventDate = new Date(selectedCidade.data_evento);
        const today = new Date();
        // Strip time components to count full calendar days (inclusive)
        const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const daysRemaining = Math.max(0, differenceInDays(eventDateOnly, todayOnly) + 1);

        console.log(`[Projeção] CAC=${cacParticipanteDisplay}, dailyBudget=${dailyBudget}, daysRemaining=${daysRemaining}, participantes=${kpi.participantes}`);

        if (cacParticipanteDisplay <= 0 || dailyBudget <= 0) {
          setProjecaoParticipantes(kpi.participantes);
          return;
        }

        // Formula: projection = currentParticipants + (dailyBudget / CAC) * daysRemaining
        const dailyNewParticipants = dailyBudget / cacParticipanteDisplay;
        const projected = Math.ceil(kpi.participantes + dailyNewParticipants * daysRemaining);
        console.log(`[Projeção] dailyNew=${dailyNewParticipants}, projected=${projected}`);
        setProjecaoParticipantes(projected);
      } catch {
        setProjecaoParticipantes(null);
      }
    };

    calcProjection();
  }, [selectedCidade, isMetaConnected, filters.adAccount, kpi.participantes, cacParticipanteDisplay]);

  return (
    <SidebarProvider>
      
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight">
                Dashboard{tvMode && selectedCidade ? ` — ${selectedCidade.nome}` : ""}
              </h1>
              <p className="text-sm text-muted-foreground">
                {tvMode ? `Modo TV — rotacionando ${activeCidades.length} cidades a cada 20s` : "Visão geral de métricas e performance"}
              </p>
            </div>
            <Button
              variant={tvMode ? "default" : "outline"}
              size="sm"
              onClick={toggleTvMode}
              className="gap-2"
            >
              <Tv className="h-4 w-4" />
              {tvMode ? "Sair do Modo TV" : "Modo TV"}
            </Button>
          </header>

          <div className="p-6 space-y-6">
            <DashboardFilters filters={filters} onFiltersChange={handleFiltersChange} />

            {/* Row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Investimento Total"
                value={loadingSpend ? "Carregando..." : fmt(investimentoDisplay)}
                icon={DollarSign}
              />
              <KpiCard
                title="Bilheteria Total"
                value={fmt(kpi.bilheteriaTotal)}
                icon={TrendingUp}
              />
              <KpiCard
                title="CAC por Venda"
                value={fmt(cacVendaDisplay)}
                icon={Target}
              />
              <KpiCard
                title="CAC por Participante"
                value={fmt(cacParticipanteDisplay)}
                icon={Users}
              />
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
              <KpiCard
                title="Total de Participantes"
                value={String(kpi.participantes)}
                icon={Users}
              />
              <KpiCard
                title="Total de VIPs"
                value={String(kpi.totalVips)}
                icon={Crown}
              />
              <KpiCard
                title="Convidados"
                value={String(kpi.totalConvidados)}
                icon={Gift}
              />
              <KpiCard
                title="Projeção de Participantes"
                value={projecaoParticipantes !== null ? String(projecaoParticipantes) : "—"}
                icon={BarChart3}
              />
              <KpiCard
                title="Vendas Individuais"
                value={String(kpi.vendasIndividuais)}
                icon={User}
              />
              <KpiCard
                title="Vendas Duplas"
                value={String(kpi.vendasDuplas)}
                icon={Users2}
              />
              <KpiCard
                title="Ticket Médio"
                value={fmt(kpi.ticketMedio)}
                icon={ShoppingCart}
              />
            </div>

            {/* Row 3 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                title="Bilheteria Ingressos"
                value={fmt(kpi.bilheteriaIngressos)}
                icon={Ticket}
              />
              <KpiCard
                title="Bilheteria VIP"
                value={fmt(kpi.bilheteriaVip)}
                icon={Gift}
              />
              <KpiCard
                title="Bilheteria (+/-)"
                value={fmt(lucroDisplay)}
                icon={Banknote}
              />
            </div>

            {/* Payment Method Donut Chart */}
            <PaymentMethodChart data={kpi.pagamentoPorMetodo} />

            {/* Charts */}
            <SalesChart data={(() => {
              // Merge daily Meta spend into chart data
              const merged = kpi.chartData.map((d) => {
                // Convert chart label "dd/mm" to "YYYY-MM-DD" to match Meta's date_start
                const [day, month] = d.name.split("/");
                const year = new Date().getFullYear();
                const dateKey = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
                return { ...d, investimento: dailySpendMap.get(dateKey) || 0 };
              });
              // Add days with spend but no sales
              for (const [dateKey, spend] of dailySpendMap) {
                const date = new Date(dateKey);
                const label = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                if (!merged.find((m) => m.name === label)) {
                  merged.push({ name: label, investimento: spend, faturamento: 0 });
                }
              }
              // Sort by date
              merged.sort((a, b) => {
                const [da, ma] = a.name.split("/").map(Number);
                const [db, mb] = b.name.split("/").map(Number);
                return ma !== mb ? ma - mb : da - db;
              });
              return merged;
            })()} />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Index;
