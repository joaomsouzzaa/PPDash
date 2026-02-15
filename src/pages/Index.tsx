import { useState, useMemo, useEffect } from "react";
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
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { KpiCard } from "@/components/KpiCard";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesChart } from "@/components/SalesChart";
import { getFilteredData, fmt, type Filters } from "@/lib/mockData";
import { fetchAdAccounts, fetchAdSpend } from "@/lib/meta-ads";

const Index = () => {
  const [filters, setFilters] = useState<Filters>({
    dateRange: "30d",
    adAccount: "all",
    city: "all",
  });

  const [metaInvestimento, setMetaInvestimento] = useState<number | null>(null);
  const [loadingSpend, setLoadingSpend] = useState(false);

  const isMetaConnected = localStorage.getItem("meta_connected") === "true";

  useEffect(() => {
    if (!isMetaConnected) {
      setMetaInvestimento(null);
      return;
    }

    const loadSpend = async () => {
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

        const results = await fetchAdSpend(accountIds, filters.dateRange);
        const totalSpend = results.reduce((sum, r) => sum + r.spend, 0);
        setMetaInvestimento(totalSpend);
      } catch {
        setMetaInvestimento(null);
      } finally {
        setLoadingSpend(false);
      }
    };

    loadSpend();
  }, [isMetaConnected, filters.adAccount, filters.dateRange]);

  const kpi = useMemo(() => getFilteredData(filters), [filters]);

  const investimentoDisplay = metaInvestimento !== null ? metaInvestimento : kpi.investimentoTotal;

  // Recalculate dependent KPIs when using real investment data
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
            <DashboardFilters filters={filters} onFiltersChange={setFilters} />

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
