import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { fmt, type Filters } from "@/lib/mockData";
import { getDateRange } from "@/hooks/useLeadsData";
import { fetchAdAccounts, fetchActiveAdNames, fetchAdSpendByName, type AdMetric } from "@/lib/meta-ads";
import { useCriativos, type Criativo } from "@/hooks/useCriativos";
import { getOrgId } from "@/lib/org";
import { useDistinctUtmContent } from "@/hooks/useDistinctUtmContent";
import { MultiSelectCombobox } from "@/components/MultiSelectCombobox";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Chave de matching de anúncio: normaliza e ignora colchetes (o nome no Meta pode vir sem eles).
const normKey = (s: string) => norm(s).replace(/[\[\]]/g, "").trim();

interface LinhaCac {
  id: string; nome: string; investimento: number; ctr: number; leads: number; cpl: number;
  mql: number; mqlPct: number; custoMql: number; vendas: number; cac: number; faturamento: number; roas: number;
}

export function CacCriativos({ filters }: { filters: Filters }) {
  const { data: criativos = [] } = useCriativos();
  const { data: utmOptions = [] } = useDistinctUtmContent();
  const queryClient = useQueryClient();

  const [adNames, setAdNames] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      try { const accs = await fetchAdAccounts(); setAdNames(await fetchActiveAdNames(accs.map((a) => a.id))); }
      catch { /* meta desconectado */ }
    })();
  }, []);

  const [editing, setEditing] = useState<Criativo | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ nome: string; utm: string[]; ads: string[]; ativo: boolean }>({ nome: "", utm: [], ads: [], ativo: true });

  const openAdd = () => { setForm({ nome: "", utm: [], ads: [], ativo: true }); setAddOpen(true); };
  const openEdit = (c: Criativo) => { setEditing(c); setForm({ nome: c.nome, utm: c.utm_contents || [], ads: c.ad_names || [], ativo: c.ativo }); };

  const salvar = async (id?: string) => {
    if (!form.nome.trim()) { toast.error("Informe o nome do criativo"); return; }
    const payload = { nome: form.nome.trim(), utm_contents: form.utm, ad_names: form.ads, ativo: form.ativo };
    const q = id
      ? supabase.from("criativos").update(payload).eq("id", id)
      : supabase.from("criativos").insert({ ...payload, ordem: criativos.length, org_id: await getOrgId() });
    const { error } = await q;
    if (error) { toast.error("Erro ao salvar criativo"); return; }
    toast.success(id ? "Criativo atualizado" : "Criativo cadastrado");
    setAddOpen(false); setEditing(null);
    queryClient.invalidateQueries({ queryKey: ["criativos"] });
  };

  const excluir = async (c: Criativo) => {
    if (!confirm(`Excluir o criativo "${c.nome}"?`)) return;
    const { error } = await supabase.from("criativos").delete().eq("id", c.id);
    if (error) { toast.error("Erro ao excluir"); return; }
    queryClient.invalidateQueries({ queryKey: ["criativos"] });
  };

  const toggleAtivo = async (c: Criativo) => {
    await supabase.from("criativos").update({ ativo: !c.ativo }).eq("id", c.id);
    queryClient.invalidateQueries({ queryKey: ["criativos"] });
  };

  // Calcula as métricas por criativo no período selecionado.
  const linkKey = JSON.stringify(criativos.map((c) => ({ i: c.id, u: c.utm_contents, a: c.ad_names, at: c.ativo, n: c.nome })));
  const { data: linhas = [], isFetching } = useQuery({
    queryKey: ["cac-criativos", filters.dateRange, filters.startDate?.toISOString() ?? "", filters.endDate?.toISOString() ?? "", linkKey],
    queryFn: async (): Promise<LinhaCac[]> => {
      const { start, end } = getDateRange(filters);
      const ativos = criativos.filter((c) => c.ativo);
      if (ativos.length === 0) return [];

      let spendByName: Record<string, AdMetric> = {};
      try {
        const accs = await fetchAdAccounts();
        spendByName = await fetchAdSpendByName(accs.map((a) => a.id), filters.startDate, filters.endDate, filters.dateRange);
      } catch { /* meta off */ }
      // Índice por chave normalizada para casar mesmo com diferença de caixa/colchetes.
      const spendByKey: Record<string, AdMetric> = {};
      for (const [nome, m] of Object.entries(spendByName)) {
        const dst = (spendByKey[normKey(nome)] ||= { spend: 0, impressions: 0, clicks: 0 });
        dst.spend += m.spend; dst.impressions += m.impressions; dst.clicks += m.clicks;
      }

      const { data: leads } = await supabase
        .from("leads")
        .select("utm_content, custom, is_venda_realizada, faturamento_venda")
        .gte("data_lead", start).lte("data_lead", end);

      const { data: campos } = await supabase.from("lead_campos").select("chave, padrao, mql_valores");
      const triggers = ((campos as any[]) || [])
        .filter((c) => Array.isArray(c.mql_valores) && c.mql_valores.length)
        .map((c) => ({ chave: c.chave as string, padrao: !!c.padrao, valores: new Set((c.mql_valores as unknown[]).map((v) => String(v).trim())) }));
      const isMql = (l: any) => triggers.some((t) => {
        const raw = t.padrao ? l[t.chave] : (l.custom as Record<string, unknown> | null)?.[t.chave];
        return raw != null && t.valores.has(String(raw).trim());
      });

      return ativos.map((c) => {
        const uset = (c.utm_contents || []).map(norm).filter(Boolean);
        const ls = (leads || []).filter((l: any) => l.utm_content && uset.includes(norm(l.utm_content)));
        const adm = (c.ad_names || []).reduce((s, n) => {
          const m = spendByKey[normKey(n)];
          if (m) { s.spend += m.spend; s.impressions += m.impressions; s.clicks += m.clicks; }
          return s;
        }, { spend: 0, impressions: 0, clicks: 0 });
        const investimento = adm.spend;
        const leadsN = ls.length;
        const mqlN = ls.filter(isMql).length;
        const vendaLs = ls.filter((l: any) => l.is_venda_realizada === "Sim");
        const vendasN = vendaLs.length;
        const faturamento = vendaLs.reduce((s, l: any) => s + (Number(l.faturamento_venda) || 0), 0);
        return {
          id: c.id, nome: c.nome, investimento,
          ctr: adm.impressions ? (adm.clicks / adm.impressions) * 100 : 0,
          leads: leadsN,
          cpl: leadsN ? investimento / leadsN : 0,
          mql: mqlN, mqlPct: leadsN ? (mqlN / leadsN) * 100 : 0,
          custoMql: mqlN ? investimento / mqlN : 0,
          vendas: vendasN, cac: vendasN ? investimento / vendasN : 0,
          faturamento, roas: investimento ? faturamento / investimento : 0,
        };
      });
    },
  });

  const formBody = (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Nome do criativo</Label>
        <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: VDs Depoimento" />
      </div>
      <div className="space-y-1">
        <Label>UTM Content (leads / vendas)</Label>
        <MultiSelectCombobox options={utmOptions} selected={form.utm} onChange={(v) => setForm({ ...form, utm: v })} placeholder="Selecione os utm_content" allowCustom />
      </div>
      <div className="space-y-1">
        <Label>Anúncios do Meta (investimento)</Label>
        <MultiSelectCombobox options={adNames} selected={form.ads} onChange={(v) => setForm({ ...form, ads: v })} placeholder={adNames.length ? "Selecione os anúncios" : "Meta desconectado / sem anúncios ativos"} allowCustom emptyText="Nenhum anúncio ativo encontrado." />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
        <Label className="cursor-pointer">Ativo</Label>
      </div>
    </div>
  );

  const num = (n: number) => n.toLocaleString("pt-BR");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4 text-primary" /> CAC geral por criativo {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}</CardTitle>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Novo criativo</Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {criativos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum criativo cadastrado. Clique em "Novo criativo".</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Criativo</TableHead>
                <TableHead className="text-right">Investimento</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">CPL</TableHead>
                <TableHead className="text-right">MQL</TableHead>
                <TableHead className="text-right">MQL %</TableHead>
                <TableHead className="text-right">Custo MQL</TableHead>
                <TableHead className="text-right">Venda</TableHead>
                <TableHead className="text-right">CAC</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {criativos.map((c) => {
                const l = linhas.find((x) => x.id === c.id);
                return (
                  <TableRow key={c.id} className={!c.ativo ? "opacity-40" : ""}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="text-right">{l ? fmt(l.investimento) : "—"}</TableCell>
                    <TableCell className="text-right">{l ? `${l.ctr.toFixed(2)}%` : "—"}</TableCell>
                    <TableCell className="text-right">{l ? num(l.leads) : "—"}</TableCell>
                    <TableCell className="text-right">{l ? fmt(l.cpl) : "—"}</TableCell>
                    <TableCell className="text-right">{l ? num(l.mql) : "—"}</TableCell>
                    <TableCell className="text-right">{l ? `${l.mqlPct.toFixed(1)}%` : "—"}</TableCell>
                    <TableCell className="text-right">{l ? fmt(l.custoMql) : "—"}</TableCell>
                    <TableCell className="text-right">{l ? num(l.vendas) : "—"}</TableCell>
                    <TableCell className="text-right">{l ? fmt(l.cac) : "—"}</TableCell>
                    <TableCell className="text-right">{l ? fmt(l.faturamento) : "—"}</TableCell>
                    <TableCell className="text-right">{l ? `${l.roas.toFixed(2)}x` : "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Switch checked={c.ativo} onCheckedChange={() => toggleAtivo(c)} className="scale-75" />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => excluir(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo criativo</DialogTitle></DialogHeader>
          {formBody}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={() => salvar()}>Cadastrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar criativo</DialogTitle></DialogHeader>
          {formBody}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => salvar(editing!.id)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
