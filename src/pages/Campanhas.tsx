import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardFilters } from "@/components/DashboardFilters";
import { useCidades } from "@/hooks/useCidades";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import type { Filters } from "@/lib/mockData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAdAccounts, fetchCampaignBreakdown, fetchAdSetBreakdown, fetchAdBreakdown,
  hydrateMetaTokenFromServer, isTokenExpired, type CampaignRow,
} from "@/lib/meta-ads";
import { BarChart3, Trophy, AlertTriangle, Bookmark, TrendingUp, Image as ImageIcon, Lightbulb, Sparkles, ShoppingCart, Target, Loader2 } from "lucide-react";

const fmtBRL = (n: number) => `R$ ${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => (n || 0).toLocaleString("pt-BR");
const fmtPct = (n: number) => `${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

// Topo (Leads) x Fundo (Vendas) de funil pelo nome da campanha.
function funil(nome: string): { label: string; cls: string } | null {
  const n = nome.toLowerCase();
  if (n.includes("[vendas]") || n.includes("vendas")) return { label: "FUNDO DE FUNIL", cls: "bg-green-500/15 text-green-400 border-green-500/30" };
  if (n.includes("lead") || n.includes("meteorico")) return { label: "TOPO DE FUNIL", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  return null;
}
// Status de frequência: <3 ok, 3–5 atenção, >5 saturado.
function freqStatus(f: number): { label: string; cls: string; dot: string } {
  if (f > 5) return { label: "Saturado", cls: "bg-destructive/20 text-destructive", dot: "bg-destructive" };
  if (f >= 3) return { label: "Atenção", cls: "bg-yellow-500/20 text-yellow-500", dot: "bg-yellow-500" };
  return { label: "Saudável", cls: "bg-green-500/15 text-green-400", dot: "bg-green-500" };
}

export default function Campanhas() {
  const [metaConnected, setMetaConnected] = useState(() => localStorage.getItem("meta_connected") === "true");
  const init = (() => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 89); return { s, e }; })();
  const [filters, setFilters] = useState<Filters>({
    dateRange: "90d", startDate: init.s, endDate: init.e,
    adAccount: localStorage.getItem("selected_ad_account") || "all",
    city: localStorage.getItem("selected_city") || "all", produtos: [],
  });
  // Persiste a cidade (todas as páginas mantêm a última selecionada, inclusive no F5).
  const onFiltersChange = (f: Filters) => { setFilters(f); localStorage.setItem("selected_city", f.city); };
  // Critério do Top Criativos: menor CAC ou mais vendas.
  const [creativoRank, setCreativoRank] = useState<"cac" | "vendas">("cac");

  const { data: cidades = [] } = useCidades();
  const selectedCidade = cidades.find((c) => c.slug === filters.city);
  // Cidades ativas (evento de hoje em diante, não ocultas).
  const hojeC = new Date(); hojeC.setHours(0, 0, 0, 0);
  const hidden = getHiddenCidades();
  const activeCidades = cidades.filter((c) => !hidden.includes(c.id) && (!c.data_evento || new Date(c.data_evento) >= hojeC));
  // "Todas as cidades" = agrega APENAS as cidades ativas (não a conta inteira).
  const slug = filters.city !== "all"
    ? selectedCidade?.slug
    : (activeCidades.map((c) => c.slug).join(",") || undefined);

  useEffect(() => { (async () => { if (await hydrateMetaTokenFromServer()) setMetaConnected(true); })(); }, []);
  const enabled = metaConnected && !isTokenExpired();
  const getAccountIds = async () => filters.adAccount !== "all" ? [filters.adAccount] : (await fetchAdAccounts()).map((a) => a.id);
  const qk = [filters.dateRange, filters.startDate?.toISOString(), filters.endDate?.toISOString(), filters.adAccount, slug];

  // keepPreviousData: mantém layout/tabelas enquanto novos dados carregam (só os dados mudam).
  const { data: campanhas = [], isFetching: lc } = useQuery({
    queryKey: ["camp", ...qk], enabled, placeholderData: (p) => p,
    queryFn: async () => fetchCampaignBreakdown(await getAccountIds(), filters.startDate, filters.endDate, filters.dateRange, slug, true),
  });
  const { data: adsets = [] } = useQuery({
    queryKey: ["adsets", ...qk], enabled, placeholderData: (p) => p,
    queryFn: async () => fetchAdSetBreakdown(await getAccountIds(), filters.startDate, filters.endDate, filters.dateRange, slug, true),
  });
  const { data: ads = [], isFetching: loadingAds } = useQuery({
    queryKey: ["ads", ...qk], enabled, placeholderData: (p) => p,
    queryFn: async () => fetchAdBreakdown(await getAccountIds(), filters.startDate, filters.endDate, filters.dateRange, slug, true),
  });

  // Alertas & Insights gerados pela IA (Gestor de Tráfego), por cidade (cron 9h).
  const { data: insightsIA = [] } = useQuery({
    queryKey: ["insights-trafego", selectedCidade?.slug],
    enabled: filters.city !== "all" && !!selectedCidade,
    queryFn: async () => {
      const { data } = await (supabase as any).from("insights_trafego").select("insights").eq("cidade_slug", selectedCidade!.slug).maybeSingle();
      return (data?.insights || []) as { nivel: string; titulo: string; texto: string }[];
    },
  });

  const totalSpend = campanhas.reduce((s, c) => s + c.spend, 0);
  // Alertas e insights (heurísticas a partir do agregado).
  const totalClicks = campanhas.reduce((s, c) => s + c.clicks, 0);
  const totalImpr = campanhas.reduce((s, c) => s + c.impressions, 0);
  const ctrMedio = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;
  const freqMedia = campanhas.length ? campanhas.reduce((s, c) => s + c.frequency, 0) / campanhas.length : 0;
  const totalSaves = campanhas.reduce((s, c) => s + c.saves, 0);
  const topAd = ads.slice().sort((a, b) => b.ctr - a.ctr)[0];

  const alertas: { icon: any; cls: string; titulo: string; texto: string }[] = [];
  if (campanhas.length) {
    alertas.push({ icon: AlertTriangle, cls: "border-l-yellow-500", titulo: `CTR ${fmtPct(ctrMedio)} — ${ctrMedio < 2 ? "abaixo da média" : "dentro da média"}`, texto: "Considere testar novos criativos, headlines ou públicos para melhorar o CTR." });
    alertas.push({ icon: BarChart3, cls: freqMedia > 5 ? "border-l-destructive" : "border-l-yellow-500", titulo: `Frequência ${freqMedia.toFixed(1)} — ${freqMedia > 5 ? "saturada" : "atenção"}`, texto: "Frequência subindo. Monitore o CTR e considere renovar criativos." });
    if (totalSaves > 0) alertas.push({ icon: Bookmark, cls: "border-l-green-500", titulo: `${fmtNum(totalSaves)} salvamentos — alta intenção`, texto: 'Crie um público de "Pessoas que salvaram o post" para remarketing.' });
    if (topAd) alertas.push({ icon: Trophy, cls: "border-l-green-500", titulo: `Top criativo: CTR ${fmtPct(topAd.ctr)}`, texto: `"${topAd.name}" está performando bem. Considere aumentar o orçamento.` });
  }

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pt-2">{children}</div>
  );

  // Estilo do card conforme o nível do insight da IA.
  const nivelStyle = (nivel: string) => {
    const n = (nivel || "").toLowerCase();
    if (n.includes("alerta") || n.includes("risco")) return { icon: AlertTriangle, cls: "border-l-yellow-500" };
    if (n.includes("oportun") || n.includes("positiv")) return { icon: Trophy, cls: "border-l-green-500" };
    return { icon: Lightbulb, cls: "border-l-blue-500" };
  };
  // Usa os insights da IA quando uma cidade está selecionada e há dados; senão, as heurísticas.
  const usandoIA = filters.city !== "all" && insightsIA.length > 0;
  const itensInsight = usandoIA
    ? insightsIA.map((i) => { const s = nivelStyle(i.nivel); return { icon: s.icon, cls: s.cls, titulo: i.titulo, texto: i.texto }; })
    : alertas;

  // Top 3 criativos conforme o critério escolhido (menor CAC ou mais vendas).
  const topCriativos = (() => {
    const comV = ads.filter((a) => a.purchases > 0);
    const ordenado = creativoRank === "vendas"
      ? [...comV].sort((a, b) => (b.purchases - a.purchases) || (a.cac - b.cac))
      : [...comV].sort((a, b) => a.cac - b.cac);
    return (ordenado.length ? ordenado : ads).slice(0, 3);
  })();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> Campanhas</h1>
              <p className="text-sm text-muted-foreground">Campanhas, conjuntos de anúncios e criativos (Meta Ads)</p>
            </div>
          </header>

          <div className="p-6 space-y-6 min-w-0 max-w-full">
            <DashboardFilters filters={filters} onFiltersChange={onFiltersChange} />

            {!enabled ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground">
                Conecte o Meta Ads em <span className="text-foreground font-medium">Integrações</span> para ver as campanhas.
              </CardContent></Card>
            ) : (
              <>
                {/* PERFORMANCE POR CAMPANHA */}
                <SectionTitle>Performance por Campanha {campanhas.length > 0 && `· ${campanhas.length} campanhas`}{lc && <span className="text-primary normal-case font-normal"> · atualizando…</span>}</SectionTitle>
                {(
                  <div className="grid grid-cols-1 gap-4">
                    {campanhas.map((c: CampaignRow) => {
                      const f = funil(c.name);
                      return (
                        <Card key={c.id}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                {f && <Badge variant="outline" className={`mb-1 text-[10px] ${f.cls}`}>{f.label}</Badge>}
                                <p className="text-sm font-medium truncate" title={c.name}>{c.name}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-lg font-bold text-green-400">{fmtBRL(c.spend)}</p>
                                <p className="text-[11px] text-muted-foreground">{totalSpend > 0 ? fmtPct((c.spend / totalSpend) * 100) : "—"} do total</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 border-t border-border pt-3">
                              {([
                                ["Investimento", fmtBRL(c.spend)],
                                ["Frequência", c.frequency.toFixed(1)],
                                ["Impressões", fmtNum(c.impressions)],
                                ["CPM", fmtBRL(c.cpm)],
                                ["CTR", fmtPct(c.ctr)],
                                ["Cliques no link", fmtNum(c.linkClicks)],
                                ["CPC", fmtBRL(c.cpc)],
                                ["Connect Rate", fmtPct(c.connectRate)],
                                ["Page View", fmtNum(c.pageViews)],
                                ["Custo Page View", fmtBRL(c.costPerPageView)],
                                ["Checkouts iniciados", fmtNum(c.checkouts)],
                                ["% Conv. LP/Checkout", fmtPct(c.convLP)],
                                ["Vendas", fmtNum(c.purchases)],
                                ["CAC", c.cac > 0 ? fmtBRL(c.cac) : "—"],
                              ] as [string, string][]).map(([lbl, val]) => (
                                <div key={lbl} className="rounded-md bg-muted/40 p-2 text-center">
                                  <p className="text-[10px] text-muted-foreground leading-tight min-h-[2.4em] flex items-center justify-center">{lbl}</p>
                                  <p className="text-sm font-bold">{val}</p>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                    {campanhas.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma campanha no período/filtro.</p>}
                  </div>
                )}

                {/* CONJUNTOS DE ANÚNCIOS — mesmas 14 métricas do funil, em cards */}
                <SectionTitle>Conjuntos de Anúncios {adsets.length > 0 && `· ${adsets.length} ad sets`}</SectionTitle>
                {adsets.length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum conjunto.</CardContent></Card>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {adsets.map((a, i) => (
                      <Card key={i}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" title={a.name}>{a.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{a.campaign}</p>
                            </div>
                            <p className="text-lg font-bold text-green-400 shrink-0">{fmtBRL(a.spend)}</p>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 border-t border-border pt-3">
                            {([
                              ["Investimento", fmtBRL(a.spend)],
                              ["Frequência", a.frequency.toFixed(1)],
                              ["Impressões", fmtNum(a.impressions)],
                              ["CPM", fmtBRL(a.cpm)],
                              ["CTR", fmtPct(a.ctr)],
                              ["Cliques no link", fmtNum(a.linkClicks)],
                              ["CPC", fmtBRL(a.cpc)],
                              ["Connect Rate", fmtPct(a.connectRate)],
                              ["Page View", fmtNum(a.pageViews)],
                              ["Custo Page View", fmtBRL(a.costPerPageView)],
                              ["Checkouts iniciados", fmtNum(a.checkouts)],
                              ["% Conv. LP/Checkout", fmtPct(a.convLP)],
                              ["Vendas", fmtNum(a.purchases)],
                              ["CAC", a.cac > 0 ? fmtBRL(a.cac) : "—"],
                            ] as [string, string][]).map(([lbl, val]) => (
                              <div key={lbl} className="rounded-md bg-muted/40 p-2 text-center">
                                <p className="text-[10px] text-muted-foreground leading-tight min-h-[2.4em] flex items-center justify-center">{lbl}</p>
                                <p className="text-sm font-bold">{val}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* TOP CRIATIVOS — top 3 em cards, com a thumbnail/imagem do criativo */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Top Criativos</span>
                  <div className="flex rounded-md border border-border overflow-hidden shrink-0">
                    <button type="button" onClick={() => setCreativoRank("cac")} title="Menor CAC"
                      className={`px-2 py-1 flex items-center gap-1 text-xs ${creativoRank === "cac" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60"}`}>
                      <Target className="h-3.5 w-3.5" /> Menor CAC
                    </button>
                    <button type="button" onClick={() => setCreativoRank("vendas")} title="Mais vendas"
                      className={`px-2 py-1 flex items-center gap-1 text-xs ${creativoRank === "vendas" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60"}`}>
                      <ShoppingCart className="h-3.5 w-3.5" /> Mais vendas
                    </button>
                  </div>
                </div>
                {topCriativos.length === 0 && loadingAds ? (
                  <Card><CardContent className="py-10 flex flex-col items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /> Carregando...</CardContent></Card>
                ) : topCriativos.length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum criativo.</CardContent></Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {topCriativos.map((a, i) => (
                      <Card key={i} className="overflow-hidden">
                        <div className="aspect-[4/5] bg-muted/40 flex items-center justify-center overflow-hidden">
                          {a.thumbnail
                            ? <img src={a.thumbnail} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                            : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
                        </div>
                        <CardContent className="p-3 space-y-2">
                          <div>
                            <p className="text-sm font-medium leading-tight line-clamp-2">{a.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{a.campaign}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                            <div><span className="text-muted-foreground">Investimento</span><br /><span className="font-semibold">{fmtBRL(a.spend)}</span></div>
                            <div><span className="text-muted-foreground">CTR</span><br /><span className="font-semibold text-blue-400">{fmtPct(a.ctr)}</span></div>
                            <div><span className="text-muted-foreground">Vendas</span><br /><span className="font-semibold">{fmtNum(a.purchases)}</span></div>
                            <div><span className="text-muted-foreground">CAC</span><br /><span className="font-semibold">{a.cac > 0 ? fmtBRL(a.cac) : "—"}</span></div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* ALERTAS E INSIGHTS */}
                {itensInsight.length > 0 && (
                  <>
                    <SectionTitle>Alertas e Insights</SectionTitle>
                    {usandoIA && (
                      <p className="-mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-primary" /> Análise do Gestor de Tráfego (IA) · atualiza todo dia às 9h
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {itensInsight.map((al, i) => (
                        <Card key={i} className={`border-l-4 ${al.cls}`}>
                          <CardContent className="p-4 flex gap-3">
                            <al.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium text-sm">{al.titulo}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{al.texto}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
