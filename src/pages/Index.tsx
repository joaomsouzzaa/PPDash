import {
  DollarSign,
  TrendingUp,
  Users,
  ShoppingCart,
  Target,
  Crown,
  User,
  Users2,
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { KpiCard } from "@/components/KpiCard";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesChart } from "@/components/SalesChart";
import { CampaignTable } from "@/components/CampaignTable";

const Index = () => {
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
            <DashboardFilters />

            {/* KPI Row 1 - Financial */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Investimento Total"
                value="R$ 12.580"
                change="+12.5% vs período anterior"
                changeType="positive"
                icon={DollarSign}
                iconColor="bg-primary/10 text-primary"
              />
              <KpiCard
                title="Faturamento Total"
                value="R$ 48.200"
                change="+8.3% vs período anterior"
                changeType="positive"
                icon={TrendingUp}
                iconColor="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
              />
              <KpiCard
                title="CPA Médio"
                value="R$ 68,26"
                change="-5.2% vs período anterior"
                changeType="positive"
                icon={Target}
                iconColor="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
              />
              <KpiCard
                title="Ticket Médio"
                value="R$ 261,41"
                change="+2.1% vs período anterior"
                changeType="positive"
                icon={ShoppingCart}
                iconColor="bg-accent/10 text-accent"
              />
            </div>

            {/* KPI Row 2 - Sales breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Total de Participantes"
                value="246"
                change="+18 esta semana"
                changeType="positive"
                icon={Users}
              />
              <KpiCard
                title="Total de VIPs"
                value="52"
                change="21% do total"
                changeType="neutral"
                icon={Crown}
                iconColor="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
              />
              <KpiCard
                title="Vendas Individuais"
                value="118"
                icon={User}
                change="64% das vendas"
                changeType="neutral"
              />
              <KpiCard
                title="Vendas de Duplos"
                value="66"
                icon={Users2}
                change="36% das vendas"
                changeType="neutral"
              />
            </div>

            {/* Charts */}
            <SalesChart />

            {/* Campaign Table */}
            <CampaignTable />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Index;
