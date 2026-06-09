import { useState, useEffect, useCallback, useRef } from "react";
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
  Camera,
  Loader2,
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

import { KpiCard } from "@/components/KpiCard";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesChart } from "@/components/SalesChart";
import { PaymentMethodChart } from "@/components/PaymentMethodChart";
import { fmt, type Filters } from "@/lib/mockData";
import { fetchAdAccounts, fetchAdSpend, fetchCampaignDailyBudget, fetchDailySpendBreakdown, syncMetaTokenToServer } from "@/lib/meta-ads";
import { useVendasData } from "@/hooks/useVendasData";
import { useCidades } from "@/hooks/useCidades";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import { differenceInDays } from "date-fns";

const Index = () => {
  const [filters, setFilters] = useState<Filters>(() => {
    const savedAccount = localStorage.getItem("selected_ad_account");
    const savedCity = localStorage.getItem("selected_city");
    // Filtro de data SEMPRE inicia em "últimos 90 dias" (não restaura o último escolhido).
    return {
      dateRange: "90d",
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
  const [loadingProjecao, setLoadingProjecao] = useState(false);
  const [spendFor, setSpendFor] = useState(""); // assinatura do filtro a que o metaInvestimento pertence
  const [dailySpendMap, setDailySpendMap] = useState<Map<string, number>>(new Map());

  const { data: cidades = [] } = useCidades();
  const isMetaConnected = localStorage.getItem("meta_connected") === "true";

  const selectedCidade = cidades.find((c) => c.slug === filters.city);

  // TV Mode: fullscreen + rotate through active cities every 20s
  const [tvMode, setTvMode] = useState(false);
  const [tvLayout, setTvLayout] = useState<"16:9" | "3:1">("16:9");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Print dos KPIs em 16:9 (apresentação) para relatório no Canva
  const kpisRef = useRef<HTMLDivElement>(null);
  const [capturando, setCapturando] = useState(false);
  const gerarPrint = async () => {
    if (!kpisRef.current) return;
    setCapturando(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const bg = getComputedStyle(document.body).backgroundColor || "#0a0a0a";
      // 1) Captura só os KPIs em alta resolução.
      const shot = await html2canvas(kpisRef.current, {
        backgroundColor: bg, scale: 2, useCORS: true, logging: false,
        windowWidth: kpisRef.current.scrollWidth, windowHeight: kpisRef.current.scrollHeight,
      });

      // 2) Compõe num canvas 16:9 (1920x1080) com margem, centralizado + título.
      const W = 1920, H = 1080, pad = 90, titleH = 110;
      const out = document.createElement("canvas");
      out.width = W; out.height = H;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // Título
      const titulo = `Dashboard${selectedCidade?.nome ? ` — ${selectedCidade.nome}` : ""}`;
      const dataBR = new Date().toLocaleDateString("pt-BR");
      ctx.fillStyle = "#ffffff"; ctx.textBaseline = "middle";
      ctx.font = "bold 44px Inter, system-ui, sans-serif";
      ctx.fillText(titulo, pad, pad + 22);
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "26px Inter, system-ui, sans-serif";
      ctx.textAlign = "right"; ctx.fillText(dataBR, W - pad, pad + 22); ctx.textAlign = "left";

      // Área disponível para os KPIs (abaixo do título, com margem)
      const availW = W - pad * 2, availH = H - pad - titleH - pad;
      const scale = Math.min(availW / shot.width, availH / shot.height);
      const dw = shot.width * scale, dh = shot.height * scale;
      const dx = (W - dw) / 2, dy = titleH + pad + (availH - dh) / 2;
      ctx.drawImage(shot, dx, dy, dw, dh);

      // 3) Baixa o PNG.
      const cidade = selectedCidade?.nome ? `-${selectedCidade.nome.replace(/\s+/g, "_")}` : "";
      const link = document.createElement("a");
      link.download = `dashboard${cidade}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = out.toDataURL("image/png");
      link.click();
      toast.success("Print 16:9 gerado e baixado!");
    } catch (e: any) {
      toast.error(`Erro ao gerar print: ${e?.message || "falhou"}`);
    } finally {
      setCapturando(false);
    }
  };

  // Fecha a sidebar ao entrar no Modo TV e reabre ao sair (botão ou ESC)
  useEffect(() => {
    setSidebarOpen(!tvMode);
  }, [tvMode]);

  const hiddenCidades = getHiddenCidades();
  const activeCidades = cidades.filter((c) => {
    if (hiddenCidades.includes(c.id)) return false;
    const eventDate = new Date(c.data_evento);
    const today = new Date();
    eventDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return eventDate >= today;
  });

  const entrarTvMode = async (layout: "16:9" | "3:1") => {
    setTvLayout(layout);
    try { await document.documentElement.requestFullscreen(); } catch {}
    setTvMode(true);
  };
  const sairTvMode = async () => {
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} }
    setTvMode(false);
  };

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setTvMode(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Keep latest values in refs so the rotation timer isn't reset by re-renders
  const activeCidadesRef = useRef(activeCidades);
  const filtersRef = useRef(filters);
  const handleFiltersChangeRef = useRef(handleFiltersChange);
  useEffect(() => { activeCidadesRef.current = activeCidades; });
  useEffect(() => { filtersRef.current = filters; });
  useEffect(() => { handleFiltersChangeRef.current = handleFiltersChange; });

  useEffect(() => {
    if (!tvMode) return;
    const tick = () => {
      const list = activeCidadesRef.current;
      if (list.length === 0) return;
      const currentSlug = filtersRef.current.city;
      const idx = list.findIndex((c) => c.slug === currentSlug);
      const nextIdx = idx === -1 ? 0 : (idx + 1) % list.length;
      console.log(`[TV Mode] Rotating ${currentSlug} -> ${list[nextIdx].slug} (${list.length} active)`);
      handleFiltersChangeRef.current({ ...filtersRef.current, city: list[nextIdx].slug });
    };
    // Switch immediately to the first active city on entering TV mode
    const list = activeCidadesRef.current;
    if (list.length > 0 && !list.some((c) => c.slug === filtersRef.current.city)) {
      handleFiltersChangeRef.current({ ...filtersRef.current, city: list[0].slug });
    }
    const interval = setInterval(tick, 20000);
    return () => clearInterval(interval);
  }, [tvMode]);



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

      const chave = `${filters.adAccount}|${filters.dateRange}|${filters.startDate?.toISOString() || ""}|${filters.endDate?.toISOString() || ""}|${selectedCidade?.slug || "all"}`;
      if (accountIds.length === 0) {
        setMetaInvestimento(0);
        setSpendFor(chave);
        return;
      }

      const slug = selectedCidade?.slug;
      const [results, dailyBreakdown] = await Promise.all([
        fetchAdSpend(accountIds, filters.dateRange, filters.startDate, filters.endDate, slug, true),
        fetchDailySpendBreakdown(accountIds, filters.dateRange, filters.startDate, filters.endDate, slug, true),
      ]);
      const totalSpend = results.reduce((sum, r) => sum + r.spend, 0);
      setMetaInvestimento(totalSpend);
      setDailySpendMap(dailyBreakdown);
      setSpendFor(chave);
    } catch {
      setMetaInvestimento(null);
    } finally {
      setLoadingSpend(false);
    }
  }, [isMetaConnected, filters.adAccount, filters.dateRange, filters.startDate, filters.endDate, selectedCidade?.slug]);

  useEffect(() => {
    loadSpend();
  }, [loadSpend, refreshKey]);

  // Mantém o token do Meta sincronizado no servidor (resumos do WhatsApp)
  useEffect(() => { syncMetaTokenToServer(); }, []);

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

  // Assinatura do filtro atual (conta + período + cidade) para o investimento Meta.
  const spendKey = `${filters.adAccount}|${filters.dateRange}|${filters.startDate?.toISOString() || ""}|${filters.endDate?.toISOString() || ""}|${selectedCidade?.slug || "all"}`;

  // Enquanto carrega (1ª carga ou troca de cidade/período), mostra "Carregando..."
  // em vez de piscar valor antigo → 0 → real.
  const carregando = loadingVendas;
  const sv = (v: string) => (carregando ? "Carregando..." : v);              // métricas de vendas
  // Métricas que dependem do Meta: só mostra quando o valor corresponde ao filtro atual.
  const svMeta = (v: string) => (carregando || loadingSpend || spendFor !== spendKey ? "Carregando..." : v);

  // Calculate projection using campaign's configured daily budget
  useEffect(() => {
    if (!selectedCidade || !isMetaConnected) {
      setProjecaoParticipantes(null);
      setLoadingProjecao(false);
      return;
    }
    // Espera as vendas carregarem antes de projetar (senão calcula com participantes=0 → pisca 0).
    if (loadingVendas) {
      setLoadingProjecao(true);
      return;
    }

    setLoadingProjecao(true);
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

        const dailyBudget = await fetchCampaignDailyBudget(accountIds, selectedCidade.slug, true);

        const eventDate = new Date(selectedCidade.data_evento);
        const today = new Date();
        // Strip time components to count full calendar days (inclusive)
        const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const diffDias = differenceInDays(eventDateOnly, todayOnly);
        // Dia do evento só capta até as 12h: depois disso (ou evento passado) não projeta mais.
        const daysRemaining = diffDias < 0
          ? 0
          : diffDias === 0
            ? (today.getHours() < 12 ? 0.5 : 0)
            : diffDias + 0.5;

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
      } finally {
        setLoadingProjecao(false);
      }
    };

    calcProjection();
  }, [selectedCidade, isMetaConnected, filters.adAccount, kpi.participantes, cacParticipanteDisplay, loadingVendas]);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className={tvMode ? `flex-1 tv-mode${tvLayout === "3:1" ? " tv-3x1" : ""}` : "flex-1 overflow-auto"}>
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight">
                Dashboard{tvMode && selectedCidade ? ` — ${selectedCidade.nome}` : ""}
              </h1>
              {!tvMode && (
                <p className="text-sm text-muted-foreground">
                  Visão geral de métricas e performance
                </p>
              )}
            </div>
            {!tvMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={gerarPrint}
                disabled={capturando}
                className="gap-2"
                title="Gera e baixa um print do dashboard para relatório"
              >
                {capturando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {capturando ? "Gerando..." : "Print relatório"}
              </Button>
            )}
            {tvMode ? (
              <Button variant="default" size="sm" onClick={sairTvMode} className="gap-2">
                <Tv className="h-4 w-4" /> Sair do Modo TV
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Tv className="h-4 w-4" /> Modo TV
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => entrarTvMode("16:9")}>📺 16:9 (1 TV)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => entrarTvMode("3:1")}>🖥️ 3:1 (3 TVs lado a lado)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </header>

          <div className={tvMode ? "tv-content" : "p-6 space-y-6"}>
            {!tvMode && <DashboardFilters filters={filters} onFiltersChange={handleFiltersChange} />}

            <div ref={kpisRef} className="space-y-4">
            {/* Row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Investimento Total"
                value={svMeta(fmt(investimentoDisplay))}
                icon={DollarSign}
              />
              <KpiCard
                title="Bilheteria Total"
                value={sv(fmt(kpi.bilheteriaTotal))}
                icon={TrendingUp}
              />
              <KpiCard
                title="CAC por Venda"
                value={svMeta(fmt(cacVendaDisplay))}
                icon={Target}
              />
              <KpiCard
                title="CAC por Participante"
                value={svMeta(fmt(cacParticipanteDisplay))}
                icon={Users}
              />
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Total de Participantes"
                value={sv(String(kpi.participantes))}
                icon={Users}
              />
              <KpiCard
                title="Total de VIPs"
                value={sv(String(kpi.totalVips))}
                icon={Crown}
              />
              <KpiCard
                title="Convidados"
                value={sv(String(kpi.totalConvidados))}
                icon={Gift}
              />
              <KpiCard
                title="Projeção de Participantes"
                value={(carregando || loadingProjecao) ? "Carregando..." : (projecaoParticipantes !== null ? String(projecaoParticipantes) : "—")}
                icon={BarChart3}
              />
            </div>

            {/* Row 2b */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                title="Vendas Individuais"
                value={sv(String(kpi.vendasIndividuais))}
                icon={User}
              />
              <KpiCard
                title="Vendas Duplas"
                value={sv(String(kpi.vendasDuplas))}
                icon={Users2}
              />
              <KpiCard
                title="Ticket Médio"
                value={sv(fmt(kpi.ticketMedio))}
                icon={ShoppingCart}
              />
            </div>

            {/* Row 3 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                title="Bilheteria Ingressos"
                value={sv(fmt(kpi.bilheteriaIngressos))}
                icon={Ticket}
              />
              <KpiCard
                title="Bilheteria VIP"
                value={sv(fmt(kpi.bilheteriaVip))}
                icon={Gift}
              />
              <KpiCard
                title="Bilheteria (+/-)"
                value={svMeta(fmt(lucroDisplay))}
                icon={Banknote}
              />
            </div>
            </div>
            {/* fim dos KPIs (kpisRef) */}

            {/* Charts */}
            <div className={tvMode ? "tv-charts" : "space-y-6"}>
            {/* Investimento x Faturamento primeiro */}
            <div className={tvMode ? "tv-chart" : ""}>
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

            {/* Método de Pagamento depois */}
            <div className={tvMode ? "tv-pay" : ""}>
              <PaymentMethodChart data={kpi.pagamentoPorMetodo} />
            </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Index;
