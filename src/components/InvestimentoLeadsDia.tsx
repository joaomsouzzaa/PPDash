import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { getDateRange } from "@/hooks/useLeadsData";
import { useProdutos } from "@/hooks/useProdutos";
import { fetchAdAccounts, fetchDailySpendBreakdown } from "@/lib/meta-ads";
import { fetchGoogleAdSpend, fetchGoogleTotalSpend } from "@/lib/google-ads";
import { rateioInvestimentoManual, somaManualRateada } from "@/lib/investimento";
import type { Filters } from "@/lib/mockData";

const DIA_MS = 86_400_000;
const fmtBRL = (n: number) => `R$ ${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Chave YYYY-MM-DD em UTC.
const ymdUTC = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
// Label DD/MM a partir da chave YYYY-MM-DD.
const labelFromKey = (key: string) => { const [, m, d] = key.split("-"); return `${d}/${m}`; };

export function InvestimentoLeadsDia({ filters }: { filters: Filters }) {
  const { data: produtos = [] } = useProdutos();
  const canal = filters.canalId ? produtos.find((p) => p.id === filters.canalId) : null;
  const slugSource = canal?.slug_source || null;
  const canalSlug = canal?.slug || undefined; // UTM Campaign (filtra investimento)
  const canalPlataforma = canal?.plataforma || "meta";
  const canalContaId = canal?.conta_id || null;
  const canalGoogleId = canal?.google_conta_id || null;
  const canalInvManual = canal?.investimento_manual ?? null;
  const isMetaConnected = localStorage.getItem("meta_connected") === "true";

  const { data = [], isFetching } = useQuery({
    queryKey: [
      "invest-leads-dia",
      filters.dateRange,
      filters.startDate?.toISOString(),
      filters.endDate?.toISOString(),
      filters.canalId,
      slugSource,
    ],
    queryFn: async () => {
      const { start, end } = getDateRange(filters);

      // Eixo de dias (UTC) do intervalo do filtro.
      const startMid = new Date(Date.UTC(
        new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), new Date(start).getUTCDate(),
      ));
      const endMid = new Date(Date.UTC(
        new Date(end).getUTCFullYear(), new Date(end).getUTCMonth(), new Date(end).getUTCDate(),
      ));
      const dias: string[] = [];
      for (let t = startMid.getTime(); t <= endMid.getTime(); t += DIA_MS) {
        dias.push(ymdUTC(new Date(t)));
      }
      const numDias = dias.length || 1;

      // ---- Leads por dia (tabela leads, filtrado por slug_source do canal) ----
      const { data: leadsRaw, error } = await supabase
        .from("leads")
        .select("data_lead, utm_source")
        .gte("data_lead", start)
        .lte("data_lead", end);
      if (error) throw error;
      let leads = leadsRaw || [];
      if (slugSource) {
        const alvos = slugSource.split(",").map((s) => norm(s.trim())).filter(Boolean);
        leads = leads.filter((l: any) => l.utm_source && alvos.some((s) => norm(l.utm_source).includes(s)));
      }
      const leadsPorDia = new Map<string, number>();
      for (const l of leads as Array<{ data_lead: string }>) {
        if (!l.data_lead) continue;
        const key = ymdUTC(new Date(l.data_lead));
        leadsPorDia.set(key, (leadsPorDia.get(key) || 0) + 1);
      }

      // ---- Investimento por dia conforme a plataforma do canal ----
      const investPorDia = new Map<string, number>();
      const addFlat = (total: number) => {
        if (!total) return;
        const diaria = total / numDias;
        for (const k of dias) investPorDia.set(k, (investPorDia.get(k) || 0) + diaria);
      };
      const addMetaDaily = async (accountIds: string[], slug?: string) => {
        if (!isMetaConnected || accountIds.length === 0) return;
        try {
          const map = await fetchDailySpendBreakdown(accountIds, filters.dateRange, filters.startDate, filters.endDate, slug);
          for (const [k, v] of map) investPorDia.set(k, (investPorDia.get(k) || 0) + v);
        } catch { /* meta off */ }
      };

      if (!filters.canalId) {
        // Geral: Meta diário (todas as contas) + Google flat + Portal/manual flat.
        let metaAccounts: string[] = [];
        if (isMetaConnected) {
          try { metaAccounts = (await fetchAdAccounts()).map((a) => a.id); } catch { /* meta off */ }
        }
        await addMetaDaily(metaAccounts);
        const gids = [...new Set(produtos.filter((p) => p.plataforma === "google" && p.google_conta_id).map((p) => p.google_conta_id as string))];
        if (gids.length) {
          try { addFlat(await fetchGoogleTotalSpend(gids, filters.dateRange, filters.startDate, filters.endDate)); } catch { /* google off */ }
        }
        addFlat(somaManualRateada(produtos, filters.dateRange, filters.startDate, filters.endDate));
      } else if (canalPlataforma === "google") {
        if (canalGoogleId) {
          try { addFlat(await fetchGoogleAdSpend(canalGoogleId, filters.dateRange, filters.startDate, filters.endDate, canalSlug)); } catch { /* google off */ }
        }
      } else if (canalPlataforma === "none") {
        addFlat(rateioInvestimentoManual(canalInvManual, filters.dateRange, filters.startDate, filters.endDate));
      } else {
        // Meta (canal específico ou conta padrão).
        let accountIds: string[] = [];
        if (canalContaId) accountIds = [canalContaId];
        else if (isMetaConnected) { try { accountIds = (await fetchAdAccounts()).map((a) => a.id); } catch { /* meta off */ } }
        await addMetaDaily(accountIds, canalSlug);
      }

      return dias.map((k) => ({
        name: labelFromKey(k),
        Investimento: Math.round((investPorDia.get(k) || 0) * 100) / 100,
        Leads: leadsPorDia.get(k) || 0,
      }));
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Investimento e Leads por dia</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[320px]">
          {isFetching && data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">Carregando...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gInvLeadsInv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff2d75" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#ff2d75" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gInvLeadsLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#39ff14" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#39ff14" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis yAxisId="l" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis yAxisId="r" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  itemStyle={{ color: "#fff" }} labelStyle={{ color: "#fff", fontWeight: 600 }}
                  formatter={(v: number, n: string) => [n === "Investimento" ? fmtBRL(v) : v, n]}
                />
                <Legend />
                <Area yAxisId="l" type="monotone" dataKey="Investimento" stroke="#ff2d75" fill="url(#gInvLeadsInv)" strokeWidth={2} />
                <Area yAxisId="r" type="monotone" dataKey="Leads" stroke="#39ff14" fill="url(#gInvLeadsLeads)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
