import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarRange, Loader2 } from "lucide-react";
import { fmt, type Filters } from "@/lib/mockData";
import { getDateRange } from "@/hooks/useLeadsData";
import { fetchAdAccounts, fetchDailyAdSpendByName } from "@/lib/meta-ads";
import { useCriativos } from "@/hooks/useCriativos";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function segunda(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

interface Linha { key: string; label: string; investimento: number; leads: number; cpl: number; mql: number; mqlPct: number; custoMql: number; vendas: number; cac: number; faturamento: number; roas: number }

export function CacSemanalPorCriativo({ filters }: { filters: Filters }) {
  const { data: criativos = [] } = useCriativos();
  const { start, end } = getDateRange(filters);
  const ativos = criativos.filter((c) => c.ativo);
  const linkKey = JSON.stringify(ativos.map((c) => ({ i: c.id, u: c.utm_contents, a: c.ad_names, n: c.nome })));

  const { data, isFetching } = useQuery({
    queryKey: ["cac-semanal-criativo", start, end, linkKey],
    queryFn: async () => {
      const startD = new Date(start), endD = new Date(end);
      const semanas: { key: string; label: string }[] = [];
      let cur = segunda(startD);
      while (cur <= endD) {
        const fim = new Date(cur); fim.setDate(fim.getDate() + 6);
        semanas.push({ key: ymd(cur), label: `${ddmm(cur)} a ${ddmm(fim)}` });
        cur = new Date(cur); cur.setDate(cur.getDate() + 7);
      }
      const idxSemana = (d: Date) => ymd(segunda(d));

      let spendByAd: Record<string, Record<string, number>> = {};
      try {
        const accs = await fetchAdAccounts();
        spendByAd = await fetchDailyAdSpendByName(accs.map((a) => a.id), filters.dateRange, filters.startDate, filters.endDate);
      } catch { /* meta off */ }

      const { data: leads } = await supabase
        .from("leads")
        .select("utm_content, data_lead, custom, is_venda_realizada, faturamento_venda")
        .gte("data_lead", start).lte("data_lead", end);

      const { data: campos } = await (supabase as any).from("lead_campos").select("chave, padrao, mql_valores");
      const triggers = ((campos as any[]) || [])
        .filter((c) => Array.isArray(c.mql_valores) && c.mql_valores.length)
        .map((c) => ({ chave: c.chave as string, padrao: !!c.padrao, valores: new Set((c.mql_valores as unknown[]).map((v) => String(v).trim())) }));
      const isMql = (l: any) => triggers.some((t) => {
        const raw = t.padrao ? l[t.chave] : (l.custom as Record<string, unknown> | null)?.[t.chave];
        return raw != null && t.valores.has(String(raw).trim());
      });

      // Para cada criativo: linhas semanais.
      const porCriativo: Record<string, Linha[]> = {};
      for (const c of ativos) {
        const uset = (c.utm_contents || []).map(norm).filter(Boolean);
        const ls = (leads || []).filter((l: any) => l.utm_content && uset.includes(norm(l.utm_content)));
        const agg: Record<string, { leads: number; mql: number; vendas: number; faturamento: number }> = {};
        for (const l of ls) {
          const k = idxSemana(new Date((l as any).data_lead));
          const a = (agg[k] ||= { leads: 0, mql: 0, vendas: 0, faturamento: 0 });
          a.leads++;
          if (isMql(l)) a.mql++;
          if ((l as any).is_venda_realizada === "Sim") { a.vendas++; a.faturamento += Number((l as any).faturamento_venda) || 0; }
        }
        // investimento semanal = soma do gasto diário dos ad_names do criativo.
        const invSem: Record<string, number> = {};
        for (const adn of c.ad_names || []) {
          const daily = spendByAd[adn] || {};
          for (const [dateStr, sp] of Object.entries(daily)) {
            const k = idxSemana(new Date(dateStr + "T12:00:00"));
            invSem[k] = (invSem[k] || 0) + sp;
          }
        }
        porCriativo[c.id] = semanas.map((s) => {
          const a = agg[s.key] || { leads: 0, mql: 0, vendas: 0, faturamento: 0 };
          const investimento = invSem[s.key] || 0;
          return {
            key: s.key, label: s.label, investimento, leads: a.leads,
            cpl: a.leads ? investimento / a.leads : 0,
            mql: a.mql, mqlPct: a.leads ? (a.mql / a.leads) * 100 : 0,
            custoMql: a.mql ? investimento / a.mql : 0,
            vendas: a.vendas, cac: a.vendas ? investimento / a.vendas : 0,
            faturamento: a.faturamento, roas: investimento ? a.faturamento / investimento : 0,
          };
        });
      }
      return porCriativo;
    },
  });

  const num = (n: number) => n.toLocaleString("pt-BR");
  const corMql = (p: number) => (p >= 35 ? "text-green-500" : p >= 20 ? "text-yellow-500" : "text-red-500");

  if (ativos.length === 0) return null;

  return (
    <div className="space-y-4">
      {ativos.map((c) => {
        const linhas = data?.[c.id] || [];
        return (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="h-4 w-4 text-primary" /> CAC semanal — {c.nome} {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Semana</TableHead>
                    <TableHead className="text-right">Investimento</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">CPL</TableHead>
                    <TableHead className="text-right">MQL</TableHead>
                    <TableHead className="text-right">MQL %</TableHead>
                    <TableHead className="text-right">Custo MQL</TableHead>
                    <TableHead className="text-right">Venda</TableHead>
                    <TableHead className="text-right">CAC</TableHead>
                    <TableHead className="text-right">Faturamento</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={l.key}>
                      <TableCell className="font-medium whitespace-nowrap">{l.label}</TableCell>
                      <TableCell className="text-right">{fmt(l.investimento)}</TableCell>
                      <TableCell className="text-right">{num(l.leads)}</TableCell>
                      <TableCell className="text-right">{fmt(l.cpl)}</TableCell>
                      <TableCell className="text-right">{num(l.mql)}</TableCell>
                      <TableCell className={`text-right font-medium ${corMql(l.mqlPct)}`}>{l.mqlPct.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{fmt(l.custoMql)}</TableCell>
                      <TableCell className="text-right">{num(l.vendas)}</TableCell>
                      <TableCell className="text-right">{fmt(l.cac)}</TableCell>
                      <TableCell className="text-right">{fmt(l.faturamento)}</TableCell>
                      <TableCell className="text-right">{l.roas.toFixed(2)}x</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
