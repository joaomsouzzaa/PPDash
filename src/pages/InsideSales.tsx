import { useState, useEffect, useCallback, useRef } from "react";
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
  Camera,
  Tv,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { KpiCard } from "@/components/KpiCard";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesFunnel } from "@/components/SalesFunnel";
import { LeadsPlacement } from "@/components/LeadsPlacement";
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
    const dr = savedDateRange || "90d";
    // Só restaura datas salvas quando o período é "personalizado"; nos presets
    // (90d, 30d, etc.) usa o cálculo do preset — evita um range antigo travado.
    const isCustom = dr === "custom";
    return {
      dateRange: dr,
      startDate: isCustom && savedStartDate ? new Date(savedStartDate) : undefined,
      endDate: isCustom && savedEndDate ? new Date(savedEndDate) : undefined,
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

  // ---- Print relatório (16:9) + Modo TV (tela cheia fixa) ----
  const kpisRef = useRef<HTMLDivElement>(null);
  const [capturando, setCapturando] = useState(false);
  const [tvMode, setTvMode] = useState(false);

  const gerarPrint = async () => {
    if (!kpisRef.current) return;
    setCapturando(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const bg = getComputedStyle(document.body).backgroundColor || "#0a0a0a";
      const shot = await html2canvas(kpisRef.current, {
        backgroundColor: bg, scale: 2, useCORS: true, logging: false,
        windowWidth: kpisRef.current.scrollWidth, windowHeight: kpisRef.current.scrollHeight,
      });
      const W = 1920, H = 1080, pad = 90, titleH = 110;
      const out = document.createElement("canvas");
      out.width = W; out.height = H;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff"; ctx.textBaseline = "middle";
      ctx.font = "bold 44px Inter, system-ui, sans-serif";
      ctx.fillText("Inside Sales", pad, pad + 22);
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "26px Inter, system-ui, sans-serif";
      ctx.textAlign = "right"; ctx.fillText(new Date().toLocaleDateString("pt-BR"), W - pad, pad + 22); ctx.textAlign = "left";
      const availW = W - pad * 2, availH = H - pad - titleH - pad;
      const scale = Math.min(availW / shot.width, availH / shot.height);
      const dw = shot.width * scale, dh = shot.height * scale;
      const dx = (W - dw) / 2, dy = titleH + pad + (availH - dh) / 2;
      ctx.drawImage(shot, dx, dy, dw, dh);
      const link = document.createElement("a");
      link.download = `inside-sales-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = out.toDataURL("image/png");
      link.click();
      toast.success("Print 16:9 gerado e baixado!");
    } catch (e: any) {
      toast.error(`Erro ao gerar print: ${e?.message || "falhou"}`);
    } finally {
      setCapturando(false);
    }
  };

  const entrarTvMode = async () => {
    try { await document.documentElement.requestFullscreen(); } catch { /* ignore */ }
    setTvMode(true);
  };
  const sairTvMode = async () => {
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* ignore */ } }
    setTvMode(false);
  };
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setTvMode(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {!tvMode && <AppSidebar />}
        <main className={tvMode ? "flex-1 tv-mode" : "flex-1 min-w-0 overflow-y-auto overflow-x-hidden"}>
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            {!tvMode && <SidebarTrigger />}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight">Inside Sales</h1>
              <p className="text-sm text-muted-foreground">
                Métricas de funil e qualificação de leads
              </p>
            </div>
            {!tvMode && (
              <Button variant="outline" size="sm" className="gap-2" onClick={gerarPrint} disabled={capturando}>
                {capturando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {capturando ? "Gerando..." : "Print relatório"}
              </Button>
            )}
            {tvMode ? (
              <Button variant="default" size="sm" className="gap-2" onClick={sairTvMode}><Tv className="h-4 w-4" /> Sair do Modo TV</Button>
            ) : (
              <Button variant="outline" size="sm" className="gap-2" onClick={entrarTvMode}><Tv className="h-4 w-4" /> Modo TV</Button>
            )}
          </header>

          <div className={tvMode ? "tv-content" : "p-6 space-y-6"}>
            {!tvMode && <DashboardFilters filters={filters} onFiltersChange={handleFiltersChange} hideCityFilter showProductFilter />}

            <div ref={kpisRef} className="space-y-6">
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

            {/* Funil + Origem dos leads (2 colunas) */}
            <div className="grid gap-4 lg:grid-cols-2 items-stretch">
              <SalesFunnel steps={funnelSteps} />
              <LeadsPlacement filters={filters} />
            </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default InsideSales;
