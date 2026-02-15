import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Users,
  Target,
  UserCheck,
  UserPlus,
  Percent,
  TrendingDown,
  CalendarCheck,
  Video,
  ShoppingCart,
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { KpiCard } from "@/components/KpiCard";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesFunnel } from "@/components/SalesFunnel";
import { fmt, type Filters } from "@/lib/mockData";
import { fetchAdAccounts, fetchAdSpend } from "@/lib/meta-ads";
import { useCidades } from "@/hooks/useCidades";

const InsideSales = () => {
  const [filters, setFilters] = useState<Filters>(() => {
    const savedAccount = localStorage.getItem("selected_ad_account");
    const savedCity = localStorage.getItem("selected_city");
    return {
      dateRange: "30d",
      startDate: undefined,
      endDate: undefined,
      adAccount: savedAccount || "all",
      city: savedCity || "all",
      produtos: [],
    };
  });

  const handleFiltersChange = (newFilters: Filters) => {
    if (newFilters.adAccount !== filters.adAccount) {
      localStorage.setItem("selected_ad_account", newFilters.adAccount);
    }
    localStorage.setItem("selected_city", newFilters.city);
    setFilters(newFilters);
  };

  const [metaInvestimento, setMetaInvestimento] = useState<number | null>(null);
  const [loadingSpend, setLoadingSpend] = useState(false);

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
  }, [loadSpend]);

  // Placeholder values — will be replaced with real data integration
  const investimento = metaInvestimento ?? 0;
  const leads = 0;
  const cpl = leads > 0 ? investimento / leads : 0;
  const mql = 0;
  const mqlPercent = leads > 0 ? (mql / leads) * 100 : 0;
  const cplMql = mql > 0 ? investimento / mql : 0;
  const sql = 0;
  const sqlPercent = mql > 0 ? (sql / mql) * 100 : 0;
  const cplSql = sql > 0 ? investimento / sql : 0;
  const reunioesAgendadas = 0;
  const reunioesAgendadasPercent = sql > 0 ? (reunioesAgendadas / sql) * 100 : 0;
  const reunioesRealizadas = 0;
  const reunioesRealizadasPercent = reunioesAgendadas > 0 ? (reunioesRealizadas / reunioesAgendadas) * 100 : 0;
  const vendas = 0;
  const vendasPercent = reunioesRealizadas > 0 ? (vendas / reunioesRealizadas) * 100 : 0;

  const funnelSteps = [
    { label: "Investimento", value: fmt(investimento), count: null, conversionLabel: null },
    { label: "Leads", value: String(leads), count: leads, conversionLabel: null },
    { label: "MQL", value: String(mql), count: mql, conversionLabel: "MQL %" },
    { label: "SQL", value: String(sql), count: sql, conversionLabel: "SQL %" },
    { label: "Reunião Agendada", value: String(reunioesAgendadas), count: reunioesAgendadas, conversionLabel: "RA %" },
    { label: "Reunião Realizada", value: String(reunioesRealizadas), count: reunioesRealizadas, conversionLabel: "RR %" },
    { label: "Vendas", value: String(vendas), count: vendas, conversionLabel: "Vendas %" },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Inside Sales</h1>
              <p className="text-sm text-muted-foreground">
                Métricas de funil e qualificação de leads
              </p>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <DashboardFilters filters={filters} onFiltersChange={handleFiltersChange} hideCityFilter showProductFilter />

            {/* Row 1: Investimento, Leads, CPL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                title="Investimento Total"
                value={loadingSpend ? "Carregando..." : fmt(investimento)}
                icon={DollarSign}
              />
              <KpiCard
                title="Leads Totais"
                value={String(leads)}
                icon={Users}
              />
              <KpiCard
                title="Custo por Lead (CPL)"
                value={fmt(cpl)}
                icon={Target}
              />
            </div>

            {/* Row 2: MQL, MQL%, CPL MQL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                title="Leads MQL"
                value={String(mql)}
                icon={UserCheck}
              />
              <KpiCard
                title="Percentual MQL"
                value={`${mqlPercent.toFixed(1)}%`}
                icon={Percent}
              />
              <KpiCard
                title="Custo por MQL"
                value={fmt(cplMql)}
                icon={TrendingDown}
              />
            </div>

            {/* Row 3: SQL, SQL%, CPL SQL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                title="Leads SQL"
                value={String(sql)}
                icon={UserPlus}
              />
              <KpiCard
                title="Percentual SQL"
                value={`${sqlPercent.toFixed(1)}%`}
                icon={Percent}
              />
              <KpiCard
                title="Custo por SQL"
                value={fmt(cplSql)}
                icon={TrendingDown}
              />
            </div>

            {/* Row 4: Reunião Agendada, Reunião Realizada, Vendas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                title="Reunião Agendada"
                value={String(reunioesAgendadas)}
                icon={CalendarCheck}
              />
              <KpiCard
                title="Reunião Realizada"
                value={String(reunioesRealizadas)}
                icon={Video}
              />
              <KpiCard
                title="Vendas"
                value={String(vendas)}
                icon={ShoppingCart}
              />
            </div>

            {/* Funnel */}
            <SalesFunnel steps={funnelSteps} />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default InsideSales;
