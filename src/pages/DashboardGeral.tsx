import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Crown,
  BarChart3,
  Target,
  Banknote,
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useCidades, type Cidade } from "@/hooks/useCidades";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAdAccounts, fetchAdSpend, fetchCampaignDailyBudget } from "@/lib/meta-ads";
import { differenceInDays } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

function getDateRange(dateRange: string, startDate?: Date, endDate?: Date) {
  if (startDate && endDate) {
    return {
      start: startDate.toISOString(),
      end: new Date(endDate.getTime() + 86400000 - 1).toISOString(),
    };
  }
  const now = new Date();
  let start: Date;
  switch (dateRange) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "yesterday": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { start: start.toISOString(), end: new Date(start.getTime() + 86400000 - 1).toISOString() };
    }
    case "7d":
      start = new Date(now); start.setDate(start.getDate() - 7); break;
    case "14d":
      start = new Date(now); start.setDate(start.getDate() - 14); break;
    case "30d":
      start = new Date(now); start.setDate(start.getDate() - 30); break;
    case "90d":
      start = new Date(now); start.setDate(start.getDate() - 89); break; // 90 dias incl. hoje
    case "this_month":
      start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "last_month": {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start: start.toISOString(), end: endOfMonth.toISOString() };
    }
    case "lifetime":
      return { start: "2000-01-01T00:00:00Z", end: now.toISOString() };
    default:
      start = new Date(now); start.setDate(start.getDate() - 30);
  }
  return { start: start.toISOString(), end: now.toISOString() };
}

function isVip(produto: string | null, tipo: string | null): boolean {
  return ((tipo || produto || "").toLowerCase()).includes("vip");
}

function isUpgrade(produto: string | null): boolean {
  return (produto || "").toLowerCase().includes("upgrade");
}

interface CityKpis {
  participantes: number;
  totalVips: number;
  bilheteria: number;
  cacParticipante: number;
  projecao: number | null;
}

const fmt = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DashboardGeral = () => {
  // Filtro de data SEMPRE inicia em "últimos 90 dias" (não restaura o último escolhido).
  const [dateRange, setDateRange] = useState<string>("90d");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const { data: cidades = [] } = useCidades();
  const hiddenCidades = getHiddenCidades();
  const now = new Date();
  const visibleCidades = cidades.filter((c) => !hiddenCidades.includes(c.id) && new Date(c.data_evento) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()));

  const { start, end } = useMemo(
    () => getDateRange(dateRange, startDate, endDate),
    [dateRange, startDate, endDate]
  );

  // Fetch ALL approved sales for the period (no city filter)
  const { data: allVendas = [], isLoading } = useQuery({
    queryKey: ["vendas-geral", start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("buscar_vendas", {
        p_status: "aprovada",
        p_start: start,
        p_end: end,
        p_city_slug: null,
      });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const isMetaConnected = localStorage.getItem("meta_connected") === "true";
  const [metaSpendMap, setMetaSpendMap] = useState<Map<string, number>>(new Map());
  const [projecaoMap, setProjecaoMap] = useState<Map<string, number | null>>(new Map());

  // Fetch Meta spend per city
  useEffect(() => {
    if (!isMetaConnected || visibleCidades.length === 0) return;

    const fetchSpend = async () => {
      try {
        const accounts = await fetchAdAccounts();
        const accountIds = accounts.map((a) => a.id);
        if (accountIds.length === 0) return;

        const spendMap = new Map<string, number>();
        const projMap = new Map<string, number | null>();

        await Promise.all(
          visibleCidades.map(async (cidade) => {
            try {
              const results = await fetchAdSpend(accountIds, dateRange, startDate, endDate, cidade.slug, true);
              const totalSpend = results.reduce((sum, r) => sum + r.spend, 0);
              spendMap.set(cidade.slug, totalSpend);

              // Projection
              const dailyBudget = await fetchCampaignDailyBudget(accountIds, cidade.slug, true);
              const eventDate = new Date(cidade.data_evento);
              const today = new Date();
              const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
              const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              const daysRemaining = Math.max(0, differenceInDays(eventDateOnly, todayOnly) + 1);

              // Will calculate projection after we have participantes
              projMap.set(cidade.slug, daysRemaining > 0 && dailyBudget > 0 ? dailyBudget : null);
            } catch {
              // ignore per-city errors
            }
          })
        );

        setMetaSpendMap(spendMap);
        setProjecaoMap(projMap);
      } catch {
        // ignore
      }
    };

    fetchSpend();
  }, [isMetaConnected, visibleCidades.length, dateRange, startDate, endDate]);

  // Calculate KPIs per city
  const cityKpis = useMemo(() => {
    const result = new Map<string, CityKpis>();

    for (const cidade of visibleCidades) {
      // Filter vendas matching this city (same logic as buscar_vendas).
      // Suporta m\u00faltiplos slugs separados por v\u00edrgula (ex.: "portoalegre, POA").
      const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]/g, "");
      const slugParts = cidade.slug.split(",").map((p) => norm(p)).filter(Boolean);
      const cityVendas = allVendas.filter((v) => {
        const vendaCidade = norm(v.cidade || "");
        const vendaProduto = norm(v.produto || "");
        return slugParts.some((slug) => vendaCidade.includes(slug) || vendaProduto.includes(slug));
      });

      let participantes = 0;
      let pagantes = 0; // exclui convites e cortesias — base do CAC (igual ao WS)
      let totalVips = 0;
      let bilheteria = 0;

      for (const v of cityVendas) {
        const qty = v.quantidade || 1;
        const valor = Number(v.valor) || 0;
        bilheteria += valor;

        // Upgrade (orderbump): conta só em VIPs, não como participante
        if (isUpgrade(v.produto)) {
          totalVips += qty;
          continue;
        }

        participantes += qty;
        if (isVip(v.produto, v.tipo_ingresso)) totalVips += qty;

        const convite = (v.tipo_ingresso || "").toLowerCase().includes("convite") || valor === 0;
        const isManual = (v as any).plataforma === "manual";
        if (!convite && (!isManual || valor > 0)) pagantes += qty;
      }

      const spend = metaSpendMap.get(cidade.slug) || 0;
      const cacParticipante = pagantes > 0 && spend > 0 ? spend / pagantes : 0;

      // Calculate projection
      let projecao: number | null = null;
      const dailyBudgetOrNull = projecaoMap.get(cidade.slug);
      if (dailyBudgetOrNull && dailyBudgetOrNull > 0 && cacParticipante > 0) {
        const eventDate = new Date(cidade.data_evento);
        const today = new Date();
        const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const daysRemaining = Math.max(0, differenceInDays(eventDateOnly, todayOnly) + 1);
        const dailyNew = dailyBudgetOrNull / cacParticipante;
        projecao = Math.ceil(participantes + dailyNew * daysRemaining);
      }

      result.set(cidade.slug, {
        participantes,
        totalVips,
        bilheteria,
        cacParticipante,
        projecao,
      });
    }

    return result;
  }, [allVendas, visibleCidades, metaSpendMap, projecaoMap]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Resumo City</h1>
              <p className="text-sm text-muted-foreground">
                Visão consolidada de todas as cidades ativas
              </p>
            </div>
          </header>

          <div className="p-6 space-y-4">
            <DateRangePicker
              preset={dateRange}
              startDate={startDate}
              endDate={endDate}
              onApply={(preset, s, e) => {
                setDateRange(preset);
                setStartDate(s);
                setEndDate(e);
                localStorage.setItem("geral_date_range", preset);
                if (s) localStorage.setItem("geral_start_date", s.toISOString()); else localStorage.removeItem("geral_start_date");
                if (e) localStorage.setItem("geral_end_date", e.toISOString()); else localStorage.removeItem("geral_end_date");
              }}
            />

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
                    <CardContent className="space-y-3">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Skeleton key={j} className="h-4 w-full" />
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : visibleCidades.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma cidade ativa. Cadastre cidades em Configurações → Cadastro de Cidades.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleCidades.map((cidade) => {
                  const kpi = cityKpis.get(cidade.slug) || {
                    participantes: 0,
                    totalVips: 0,
                    bilheteria: 0,
                    cacParticipante: 0,
                    projecao: null,
                  };

                  return (
                    <Card key={cidade.id} className="animate-fade-in">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{cidade.nome}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Evento: {new Date(cidade.data_evento).toLocaleDateString("pt-BR")}
                        </p>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                            <Target className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">CAC Participante</p>
                              <p className="text-sm font-bold">
                                {kpi.cacParticipante > 0 ? fmt(kpi.cacParticipante) : "—"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                            <Users className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Participantes</p>
                              <p className="text-sm font-bold">{kpi.participantes}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                            <Crown className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Total VIPs</p>
                              <p className="text-sm font-bold">{kpi.totalVips}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                            <BarChart3 className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Projeção</p>
                              <p className="text-sm font-bold">
                                {kpi.projecao !== null ? kpi.projecao : "—"}
                              </p>
                            </div>
                          </div>
                          <div className="col-span-2 flex items-center gap-2 p-2 rounded-md bg-muted/50">
                            <Banknote className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Bilheteria (+/-)</p>
                              {(() => {
                                const spend = metaSpendMap.get(cidade.slug) || 0;
                                const diff = kpi.bilheteria - spend;
                                return (
                                  <p className={`text-sm font-bold ${diff >= 0 ? "text-[hsl(var(--success))]" : "text-primary"}`}>
                                    {fmt(diff)}
                                  </p>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default DashboardGeral;
