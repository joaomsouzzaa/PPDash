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
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { KpiCard } from "@/components/KpiCard";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesChart } from "@/components/SalesChart";
import { fmt, type Filters } from "@/lib/mockData";
import { fetchAdAccounts, fetchAdSpend, fetchDailySpendBySlug } from "@/lib/meta-ads";
import { useVendasData } from "@/hooks/useVendasData";
import { useCidades } from "@/hooks/useCidades";
import { differenceInDays } from "date-fns";

const Index = () => {
  const [filters, setFilters] = useState<Filters>(() => {
    const savedAccount = localStorage.getItem("selected_ad_account");
    const savedDateRange = localStorage.getItem("selected_date_range");
    const savedStartDate = localStorage.getItem("selected_start_date");
    const savedEndDate = localStorage.getItem("selected_end_date");
    return {
      dateRange: savedDateRange || "30d",
      startDate: savedStartDate ? new Date(savedStartDate) : undefined,
      endDate: savedEndDate ? new Date(savedEndDate) : undefined,
      adAccount: savedAccount || "all",
      city: "all",
    };
  });

  const handleFiltersChange = (newFilters: Filters) => {
    if (newFilters.adAccount !== filters.adAccount) {
      localStorage.setItem("selected_ad_account", newFilters.adAccount);
    }
    localStorage.setItem("selected_date_range", newFilters.dateRange);
    if (newFilters.startDate) {
      localStorage.setItem("selected_start_date", newFilters.startDate.toISOString());
    } else {
      localStorage.removeItem("selected_start_date");
    }
    if (newFilters.endDate) {
      localStorage.setItem("selected_end_date", newFilters.endDate.toISOString());
    } else {
      localStorage.removeItem("selected_end_date");
    }
    setFilters(newFilters);
  };

  const [metaInvestimento, setMetaInvestimento] = useState<number | null>(null);
  const [loadingSpend, setLoadingSpend] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [projecaoParticipantes, setProjecaoParticipantes] = useState<number | null>(null);

  const { data: cidades = [] } = useCidades();
  const isMetaConnected = localStorage.getItem("meta_connected") === "true";

  const selectedCidade = cidades.find((c) => c.slug === filters.city);

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
      const results = await fetchAdSpend(accountIds, filters.dateRange, filters.startDate, filters.endDate, slug);
      const totalSpend = results.reduce((sum, r) => sum + r.spend, 0);
      setMetaInvestimento(totalSpend);
    } catch {
      setMetaInvestimento(null);
    } finally {
      setLoadingSpend(false);
    }
  }, [isMetaConnected, filters.adAccount, filters.dateRange, filters.startDate, filters.endDate, selectedCidade?.slug]);

  useEffect(() => {
    loadSpend();
  }, [loadSpend, refreshKey]);

  // Auto-refresh every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: vendasData, isLoading: loadingVendas } = useVendasData(filters);
  const kpi = vendasData || {
    investimentoTotal: 0, bilheteriaTotal: 0, cacVenda: 0, cacParticipante: 0,
    participantes: 0, totalVips: 0, vendasIndividuais: 0, vendasDuplas: 0,
    ticketMedio: 0, bilheteriaIngressos: 0, bilheteriaVip: 0, lucro: 0, chartData: [],
  };

  const investimentoDisplay = metaInvestimento !== null ? metaInvestimento : kpi.investimentoTotal;

  const totalVendas = kpi.vendasIndividuais + kpi.vendasDuplas;
  const cacVendaDisplay = metaInvestimento !== null && totalVendas > 0
    ? metaInvestimento / totalVendas
    : kpi.cacVenda;
  const cacParticipanteDisplay = metaInvestimento !== null && kpi.participantes > 0
    ? metaInvestimento / kpi.participantes
    : kpi.cacParticipante;
  const lucroDisplay = metaInvestimento !== null
    ? kpi.bilheteriaTotal - metaInvestimento
    : kpi.lucro;

  // Calculate projection when we have a selected city with event date
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

        const dailySpend = await fetchDailySpendBySlug(
          accountIds, selectedCidade.slug, filters.dateRange, filters.startDate, filters.endDate
        );

        const eventDate = new Date(selectedCidade.data_evento);
        const today = new Date();
        const daysRemaining = Math.max(0, differenceInDays(eventDate, today));

        if (cacParticipanteDisplay <= 0 || dailySpend <= 0) {
          setProjecaoParticipantes(kpi.participantes);
          return;
        }

        const dailyNewParticipants = dailySpend / cacParticipanteDisplay;
        const projected = Math.round(kpi.participantes + dailyNewParticipants * daysRemaining);
        setProjecaoParticipantes(projected);
      } catch {
        setProjecaoParticipantes(null);
      }
    };

    calcProjection();
  }, [selectedCidade, isMetaConnected, filters.adAccount, filters.dateRange, filters.startDate, filters.endDate, kpi.participantes, cacParticipanteDisplay]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Visão geral de métricas e performance
              </p>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <DashboardFilters filters={filters} onFiltersChange={handleFiltersChange} />

            {/* Row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Investimento Total"
                value={loadingSpend ? "Carregando..." : fmt(investimentoDisplay)}
                icon={DollarSign}
                iconColor="bg-primary/10 text-primary"
              />
              <KpiCard
                title="Bilheteria Total"
                value={fmt(kpi.bilheteriaTotal)}
                icon={TrendingUp}
                iconColor="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
              />
              <KpiCard
                title="CAC por Venda"
                value={fmt(cacVendaDisplay)}
                icon={Target}
                iconColor="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
              />
              <KpiCard
                title="CAC por Participante"
                value={fmt(cacParticipanteDisplay)}
                icon={Users}
                iconColor="bg-primary/10 text-primary"
              />
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <KpiCard
                title="Total de Participantes"
                value={String(kpi.participantes)}
                icon={Users}
              />
              <KpiCard
                title="Total de VIPs"
                value={String(kpi.totalVips)}
                icon={Crown}
                iconColor="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
              />
              <KpiCard
                title="Projeção de Participantes"
                value={projecaoParticipantes !== null ? String(projecaoParticipantes) : "—"}
                icon={BarChart3}
                iconColor="bg-primary/10 text-primary"
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
                iconColor="bg-accent/10 text-accent"
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
                iconColor="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
              />
              <KpiCard
                title="Lucro"
                value={fmt(lucroDisplay)}
                icon={Banknote}
                iconColor="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
              />
            </div>

            {/* Charts */}
            <SalesChart data={kpi.chartData} />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Index;
