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
  BadgeDollarSign,
  TrendingUp,
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { KpiCard } from "@/components/KpiCard";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesFunnel } from "@/components/SalesFunnel";
import { fmt, type Filters } from "@/lib/mockData";
import { fetchAdAccounts, fetchAdSpend } from "@/lib/meta-ads";
import { useCidades } from "@/hooks/useCidades";
import { useLeadsData } from "@/hooks/useLeadsData";

const InsideSales = () => {
  const [filters, setFilters] = useState<Filters>(() => {
    const savedAccount = localStorage.getItem("selected_ad_account");
    const savedCity = localStorage.getItem("selected_city");
    const savedDateRange = localStorage.getItem("is_date_range");
    const savedStartDate = localStorage.getItem("is_start_date");
    const savedEndDate = localStorage.getItem("is_end_date");
    const savedProdutos = localStorage.getItem("is_produtos");
    return {
      dateRange: savedDateRange || "30d",
      startDate: savedStartDate ? new Date(savedStartDate) : undefined,
      endDate: savedEndDate ? new Date(savedEndDate) : undefined,
      adAccount: savedAccount || "all",
      city: savedCity || "all",
      produtos: savedProdutos ? JSON.parse(savedProdutos) : [],
    };
  });

  const handleFiltersChange = (newFilters: Filters) => {
    if (newFilters.adAccount !== filters.adAccount) {
      localStorage.setItem("selected_ad_account", newFilters.adAccount);
    }
    localStorage.setItem("selected_city", newFilters.city);
    localStorage.setItem("is_date_range", newFilters.dateRange);
    if (newFilters.startDate) localStorage.setItem("is_start_date", newFilters.startDate.toISOString()); else localStorage.removeItem("is_start_date");
    if (newFilters.endDate) localStorage.setItem("is_end_date", newFilters.endDate.toISOString()); else localStorage.removeItem("is_end_date");
    localStorage.setItem("is_produtos", JSON.stringify(newFilters.produtos));
    setFilters(newFilters);
  };

  const [metaInvestimento, setMetaInvestimento] = useState<number | null>(null);
  const [loadingSpend, setLoadingSpend] = useState(false);

  const { data: cidades = [] } = useCidades();
  const { data: leadsKpis } = useLeadsData(filters);
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

      // When products are selected, fetch spend per product slug and sum
      const slugs = filters.produtos.length > 0 ? filters.produtos : [undefined];
      let totalSpend = 0;
      await Promise.all(
        slugs.map(async (slug) => {
          const results = await fetchAdSpend(accountIds, filters.dateRange, filters.startDate, filters.endDate, slug);
          totalSpend += results.reduce((sum, r) => sum + r.spend, 0);
        })
      );
      setMetaInvestimento(totalSpend);
    } catch {
      setMetaInvestimento(null);
    } finally {
      setLoadingSpend(false);
    }
  }, [isMetaConnected, filters.adAccount, filters.dateRange, filters.startDate, filters.endDate, filters.produtos]);

  useEffect(() => {
    loadSpend();
  }, [loadSpend]);

  // Use real leads data from database
  const investimento = metaInvestimento ?? 0;
  const leads = leadsKpis?.totalLeads ?? 0;
  const cpl = leads > 0 ? investimento / leads : 0;
  const mql = leadsKpis?.mql ?? 0;
  const mqlPercent = leads > 0 ? (mql / leads) * 100 : 0;
  const cplMql = mql > 0 ? investimento / mql : 0;
  const sql = leadsKpis?.sql ?? 0;
  const sqlPercent = mql > 0 ? (sql / mql) * 100 : 0;
  const cplSql = sql > 0 ? investimento / sql : 0;
  const reunioesAgendadas = leadsKpis?.reunioesAgendadas ?? 0;
  const reunioesAgendadasPercent = sql > 0 ? (reunioesAgendadas / sql) * 100 : 0;
  const reunioesRealizadas = leadsKpis?.reunioesRealizadas ?? 0;
  const reunioesRealizadasPercent = reunioesAgendadas > 0 ? (reunioesRealizadas / reunioesAgendadas) * 100 : 0;
  const vendas = leadsKpis?.vendas ?? 0;
  const vendasPercent = reunioesRealizadas > 0 ? (vendas / reunioesRealizadas) * 100 : 0;
  const vendasRealizadas = leadsKpis?.vendasRealizadas ?? 0;
  const faturamentoVenda = leadsKpis?.faturamentoVenda ?? 0;
  const roas = investimento > 0 ? faturamentoVenda / investimento : 0;

  const funnelSteps = [
    { label: "Investimento", value: fmt(investimento), count: null, conversionLabel: null },
    { label: "Leads", value: String(leads), count: leads, conversionLabel: null },
    { label: "MQL", value: String(mql), count: mql, conversionLabel: "MQL %" },
    { label: "SQL", value: String(sql), count: sql, conversionLabel: "SQL %" },
    { label: "Reunião Agendada", value: String(reunioesAgendadas), count: reunioesAgendadas, conversionLabel: "RA %" },
    { label: "Reunião Realizada", value: String(reunioesRealizadas), count: reunioesRealizadas, conversionLabel: "RR %" },
    { label: "Vendas", value: String(vendas), count: vendas, conversionLabel: "Vendas %" },
    { label: "Faturamento", value: fmt(faturamentoVenda), count: null, conversionLabel: null },
    { label: "ROAS", value: `${roas.toFixed(2)}x`, count: null, conversionLabel: null },
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

            {/* Row 5: Venda Realizada, Faturamento, ROAS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                title="Venda Realizada"
                value={String(vendasRealizadas)}
                icon={ShoppingCart}
              />
              <KpiCard
                title="Faturamento"
                value={fmt(faturamentoVenda)}
                icon={BadgeDollarSign}
              />
              <KpiCard
                title="ROAS"
                value={`${roas.toFixed(2)}x`}
                icon={TrendingUp}
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
