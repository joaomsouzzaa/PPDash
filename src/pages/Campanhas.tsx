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
import {
  fetchAdAccounts, fetchCampaignBreakdown, fetchAdSetBreakdown, fetchAdBreakdown,
  hydrateMetaTokenFromServer, isTokenExpired, type CampaignRow,
} from "@/lib/meta-ads";
import { BarChart3, Trophy, AlertTriangle, Bookmark, TrendingUp, Image as ImageIcon } from "lucide-react";

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
  const { data: ads = [] } = useQuery({
    queryKey: ["ads", ...qk], enabled, placeholderData: (p) => p,
    queryFn: async () => fetchAdBreakdown(await getAccountIds(), filters.startDate, filters.endDate, filters.dateRange, slug, true),
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
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {campanhas.map((c: CampaignRow) => {
                      const f = funil(c.name); const fs = freqStatus(c.frequency);
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
                            <div className="grid grid-cols-4 gap-2 text-center border-t border-border pt-2">
                              <div><p className="text-[10px] text-muted-foreground uppercase">Alcance</p><p className="text-sm font-bold">{fmtNum(c.reach)}</p></div>
                              <div><p className="text-[10px] text-muted-foreground uppercase">CTR</p><p className="text-sm font-bold text-blue-400">{fmtPct(c.ctr)}</p></div>
                              <div><p className="text-[10px] text-muted-foreground uppercase">CPC</p><p className="text-sm font-bold">{fmtBRL(c.cpc)}</p></div>
                              <div><p className="text-[10px] text-muted-foreground uppercase">Freq.</p><p className="text-sm font-bold">{c.frequency.toFixed(1)}</p><span className={`text-[9px] px-1 rounded ${fs.cls}`}>{fs.label}</span></div>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              {[["Views", c.views], ["Reações", c.reactions], ["Saves", c.saves], ["Comments", c.comments]].map(([lbl, val]) => (
                                <div key={lbl as string} className="rounded-md bg-muted/40 p-2 text-center">
                                  <p className="text-sm font-bold">{fmtNum(val as number)}</p>
                                  <p className="text-[10px] text-muted-foreground">{lbl}</p>
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

                {/* CONJUNTOS DE ANÚNCIOS */}
                <SectionTitle>Conjuntos de Anúncios {adsets.length > 0 && `· ${adsets.length} ad sets`}</SectionTitle>
                {(
                  <Card><CardContent className="p-0">
                    <div className="max-h-[420px] overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-card text-muted-foreground text-xs">
                          <tr className="border-b border-border">
                            <th className="text-left p-3">Conjunto</th><th className="text-right p-3">Gasto</th>
                            <th className="text-right p-3">Alcance</th><th className="text-right p-3">Cliques</th>
                            <th className="text-right p-3">CTR</th><th className="text-right p-3">CPC</th><th className="text-right p-3">Freq.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adsets.map((a, i) => {
                            const fs = freqStatus(a.frequency);
                            return (
                              <tr key={i} className="border-b border-border/50">
                                <td className="p-3"><span className="font-medium">{a.name}</span><br /><span className="text-[11px] text-muted-foreground">{a.campaign}</span></td>
                                <td className="p-3 text-right">{fmtBRL(a.spend)}</td>
                                <td className="p-3 text-right">{fmtNum(a.reach)}</td>
                                <td className="p-3 text-right">{fmtNum(a.clicks)}</td>
                                <td className="p-3 text-right text-blue-400">{fmtPct(a.ctr)}</td>
                                <td className="p-3 text-right">{fmtBRL(a.cpc)}</td>
                                <td className="p-3 text-right"><span className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${fs.dot}`} />{a.frequency.toFixed(1)}</span></td>
                              </tr>
                            );
                          })}
                          {adsets.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Nenhum conjunto.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </CardContent></Card>
                )}

                {/* TOP CRIATIVOS — top 3 em cards, com a thumbnail/imagem do criativo */}
                <SectionTitle>Top Criativos</SectionTitle>
                {ads.length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum criativo.</CardContent></Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {ads.slice(0, 3).map((a, i) => (
                      <Card key={i} className="overflow-hidden">
                        <div className="aspect-video bg-muted/40 flex items-center justify-center">
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
                {alertas.length > 0 && (
                  <>
                    <SectionTitle>Alertas e Insights</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {alertas.map((al, i) => (
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
