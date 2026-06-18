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
  MapPin,
  Sparkles,
  Wallet,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { KpiCard } from "@/components/KpiCard";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesFunnel } from "@/components/SalesFunnel";
import { LeadsPlacement } from "@/components/LeadsPlacement";
import { LeadsCustomPie } from "@/components/LeadsCustomPie";
import { LeadsRanking } from "@/components/LeadsRanking";
import { BrazilHeatMap } from "@/components/BrazilHeatMap";
import { InvestimentoLeadsDia } from "@/components/InvestimentoLeadsDia";
import { fmt, type Filters } from "@/lib/mockData";
import { fetchAdAccounts, fetchAdSpend, getSelectedAccount, setSelectedAccount } from "@/lib/meta-ads";
import { rateioInvestimentoManual, somaManualRateada } from "@/lib/investimento";
import { fetchGoogleAdSpend, fetchGoogleTotalSpend } from "@/lib/google-ads";
import { useCidades } from "@/hooks/useCidades";
import { useLeadsData } from "@/hooks/useLeadsData";
import { useProdutos } from "@/hooks/useProdutos";

const InsideSales = () => {
  const [filters, setFilters] = useState<Filters>(() => {
    const savedAccount = getSelectedAccount();
    const savedCity = localStorage.getItem("selected_city");
    const savedDateRange = localStorage.getItem("is_date_range");
    const savedStartDate = localStorage.getItem("is_start_date");
    const savedEndDate = localStorage.getItem("is_end_date");
    const savedProdutos = localStorage.getItem("is_produtos");
    const savedCanal = localStorage.getItem("is_canal");
    // Dashboard sempre abre no mês atual (até hoje), reseta no F5.
    void savedDateRange; void savedStartDate; void savedEndDate;
    return {
      dateRange: "this_month",
      startDate: undefined,
      endDate: undefined,
      adAccount: savedAccount || "all",
      city: savedCity || "all",
      produtos: savedProdutos ? JSON.parse(savedProdutos) : [],
      canalId: savedCanal || "",
    };
  });

  const handleFiltersChange = (newFilters: Filters) => {
    if (newFilters.adAccount !== filters.adAccount) {
      setSelectedAccount(newFilters.adAccount);
    }
    localStorage.setItem("selected_city", newFilters.city);
    localStorage.setItem("is_date_range", newFilters.dateRange);
    if (newFilters.startDate) localStorage.setItem("is_start_date", newFilters.startDate.toISOString()); else localStorage.removeItem("is_start_date");
    if (newFilters.endDate) localStorage.setItem("is_end_date", newFilters.endDate.toISOString()); else localStorage.removeItem("is_end_date");
    localStorage.setItem("is_produtos", JSON.stringify(newFilters.produtos));
    localStorage.setItem("is_canal", newFilters.canalId);
    setFilters(newFilters);
  };

  const [metaInvestimento, setMetaInvestimento] = useState<number | null>(null);
  const [loadingSpend, setLoadingSpend] = useState(false);

  const { data: cidades = [] } = useCidades();
  const { data: produtos = [] } = useProdutos();
  const { data: leadsKpis } = useLeadsData(filters);
  const isMetaConnected = localStorage.getItem("meta_connected") === "true";
  const selectedCidade = cidades.find((c) => c.slug === filters.city);

  const canal = filters.canalId ? produtos.find((p) => p.id === filters.canalId) : null;
  const canalContaId = canal?.conta_id || null;
  const canalSlug = canal?.slug || undefined; // slug do UTM Campaign (filtra investimento)
  const canalPlataforma = canal?.plataforma || "meta";
  const canalGoogleId = canal?.google_conta_id || null;
  const canalInvManual = canal?.investimento_manual ?? null;
  // Canal selecionado mas produtos ainda não carregaram → não puxar (evita
  // mostrar o investimento do Meta por engano num canal Google).
  const canalCarregando = !!filters.canalId && !canal;
  // Métricas/blocos visíveis para o canal (sem config = mostra tudo).
  const metricasCanal = canal?.metricas ?? null;
  // Canais Orgânico e YouTube não exibem o Funil de Conversão.
  const canalSemFunil = (() => {
    const norm = (s: string) =>
      (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const txt = `${norm(canal?.nome || "")} ${norm(canal?.slug || "")}`;
    return txt.includes("organico") || txt.includes("youtube");
  })();
  const show = (key: string) => {
    if (key === "funil" && canalSemFunil) return false;
    return !metricasCanal || metricasCanal.includes(key);
  };
  // Gráfico "Investimento e Leads por dia": só nos canais Geral, Google Ads, Meta Ads e Portal do Franchising.
  const mostrarGraficoDia = (() => {
    if (!filters.canalId) return true; // Geral
    const nm = (canal?.nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    return ["google ads", "meta ads", "portal do franchising"].includes(nm);
  })();

  const loadSpend = useCallback(async () => {
    if (canalCarregando) return;
    setLoadingSpend(true);
    try {
      // Geral (sem canal) → soma Meta (todas as contas) + Google (contas dos canais Google).
      if (!filters.canalId) {
        let total = 0;
        if (isMetaConnected) {
          try {
            const accounts = await fetchAdAccounts();
            const res = await fetchAdSpend(accounts.map((a) => a.id), filters.dateRange, filters.startDate, filters.endDate);
            total += res.reduce((s, r) => s + r.spend, 0);
          } catch { /* meta off */ }
        }
        const gids = [...new Set(produtos.filter((p) => p.plataforma === "google" && p.google_conta_id).map((p) => p.google_conta_id as string))];
        if (gids.length) total += await fetchGoogleTotalSpend(gids, filters.dateRange, filters.startDate, filters.endDate);
        // Canais sem plataforma (ex.: Portal/Google manual) somam o investimento
        // manual rateado pelo período (total do mês ÷ dia atual × dias do filtro).
        total += somaManualRateada(produtos, filters.dateRange, filters.startDate, filters.endDate);
        setMetaInvestimento(total);
        return;
      }
      // Sem plataforma → investimento manual rateado pelo período (ou zero).
      if (canalPlataforma === "none") { setMetaInvestimento(rateioInvestimentoManual(canalInvManual, filters.dateRange, filters.startDate, filters.endDate)); return; }
      // Canal do Google Ads → puxa da API google-ads.
      if (canalPlataforma === "google") {
        if (!canalGoogleId) { setMetaInvestimento(null); return; }
        try {
          const spend = await fetchGoogleAdSpend(canalGoogleId, filters.dateRange, filters.startDate, filters.endDate, canalSlug);
          setMetaInvestimento(spend);
        } catch {
          setMetaInvestimento(null);
        }
        return;
      }
      // Meta Ads (padrão).
      if (!isMetaConnected) { setMetaInvestimento(null); return; }
      let accountIds: string[];
      if (canalContaId) {
        accountIds = [canalContaId];
      } else {
        const accounts = await fetchAdAccounts();
        accountIds = accounts.map((a) => a.id);
      }
      if (accountIds.length === 0) {
        setMetaInvestimento(0);
        return;
      }
      const results = await fetchAdSpend(accountIds, filters.dateRange, filters.startDate, filters.endDate, canalSlug);
      setMetaInvestimento(results.reduce((sum, r) => sum + r.spend, 0));
    } catch {
      setMetaInvestimento(null);
    } finally {
      setLoadingSpend(false);
    }
  }, [isMetaConnected, canalCarregando, canalContaId, canalSlug, canalPlataforma, canalGoogleId, canalInvManual, produtos, filters.canalId, filters.dateRange, filters.startDate, filters.endDate]);

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
            {!tvMode && <DashboardFilters filters={filters} onFiltersChange={handleFiltersChange} hideCityFilter showChannelButtons pagina="dashboard" />}

            <div ref={kpisRef} className="space-y-6">
            {/* KPIs (grade única; cada card respeita as métricas do canal) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {show("investimento") && <KpiCard title="Investimento Total" value={loadingSpend ? "Carregando..." : fmt(investimento)} icon={DollarSign} />}
              {show("leads") && <KpiCard title="Leads Totais (CRM)" value={String(leads)} icon={Users} />}
              {show("cpl") && <KpiCard title="Custo por Lead (CPL)" value={fmt(cpl)} icon={Target} />}
              {show("mql") && <KpiCard title="Leads MQL" value={String(mql)} icon={UserCheck} />}
              {show("mql_pct") && <KpiCard title="Percentual MQL" value={`${mqlPercent.toFixed(1)}%`} icon={Percent} />}
              {show("cpl_mql") && <KpiCard title="Custo por MQL" value={fmt(cplMql)} icon={TrendingDown} />}
              {show("sql") && <KpiCard title="Leads SQL" value={String(sql)} icon={UserPlus} />}
              {show("sql_pct") && <KpiCard title="Percentual SQL" value={`${sqlPercent.toFixed(1)}%`} icon={Percent} />}
              {show("cpl_sql") && <KpiCard title="Custo por SQL" value={fmt(cplSql)} icon={TrendingDown} />}
              {show("reuniao_agendada") && <KpiCard title="Reunião Agendada" value={String(reunioesAgendadas)} icon={CalendarCheck} />}
              {show("reuniao_realizada") && <KpiCard title="Reunião Realizada" value={String(reunioesRealizadas)} icon={Video} />}
              {show("vendas") && <KpiCard title="Vendas" value={String(vendas)} icon={ShoppingCart} />}
              {/* Sem ROAS no canal → Faturamento entra na grade principal, ao lado de Vendas */}
              {show("faturamento") && !show("roas") && <KpiCard title="Faturamento" value={fmt(faturamentoVenda)} icon={BadgeDollarSign} />}
            </div>

            {/* Faturamento + ROAS: linha própria de 2 colunas (quando há ROAS) */}
            {show("roas") && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {show("faturamento") && <KpiCard title="Faturamento" value={fmt(faturamentoVenda)} icon={BadgeDollarSign} />}
              <KpiCard title="ROAS" value={`${roas.toFixed(2)}x`} icon={TrendingUp} />
            </div>
            )}

            {/* Linha 1: Funil | Mapa + ranking de estados (mesma altura).
                Sem funil (Orgânico/YouTube), o mapa ocupa a linha inteira. */}
            {(show("funil") || show("mapa")) && (
            <div className={`grid gap-4 items-stretch ${show("funil") && show("mapa") ? "lg:grid-cols-2" : "grid-cols-1"}`}>
              {show("funil") && <SalesFunnel steps={funnelSteps} />}
              {show("mapa") && <BrazilHeatMap filters={filters} />}
            </div>
            )}

            {/* Linha 2: (Origem + Criativos) | Cidades ao lado, mesma altura */}
            {(show("origem") || show("criativos") || show("cidades")) && (
            <div className="grid gap-4 lg:grid-cols-2 items-stretch">
              {(show("origem") || show("criativos")) && (
                <div className="space-y-4">
                  {show("origem") && <LeadsPlacement filters={filters} />}
                  {show("criativos") && <LeadsRanking filters={filters} title="Criativos com mais leads (UTM Content)" icon={Sparkles} field={{ kind: "column", key: "utm_content" }} limit={10} />}
                </div>
              )}
              {show("cidades") && <LeadsRanking filters={filters} title="Cidades com mais leads" icon={MapPin} field={{ kind: "column", key: "cidade" }} limit={16} />}
            </div>
            )}

            {/* Linha 3: pizzas com % de respostas (capacidade x tempo de investimento) */}
            <div className="grid gap-4 lg:grid-cols-2 items-stretch">
              <LeadsCustomPie filters={filters} field="capacidade_investimento" title="Capacidade de investimento" icon={Wallet} />
              <LeadsCustomPie filters={filters} field="quando_iniciar" title="Tempo de investimento" icon={Clock} />
            </div>
            </div>

            {/* Investimento e Leads por dia — só nos canais Geral, Google Ads, Meta Ads e Portal do Franchising */}
            {mostrarGraficoDia && <InvestimentoLeadsDia filters={filters} />}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default InsideSales;
