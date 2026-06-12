import { useEffect, useState } from "react";
import { fetchTodasAdAccounts, getContasSelecionadas, setContasSelecionadas, type AdAccount } from "@/lib/meta-ads";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Save, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";

export function MetaContasSelecao() {
  const [contas, setContas] = useState<AdAccount[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let ativo = true;
    fetchTodasAdAccounts()
      .then((cs) => { if (ativo) { setContas(cs); setSel(new Set(getContasSelecionadas())); } })
      .catch(() => { if (ativo) setContas([]); })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, []);

  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const salvar = async () => {
    setSalvando(true);
    try { await setContasSelecionadas([...sel]); toast.success("Contas atualizadas. Atualize o dashboard."); }
    catch { toast.error("Falha ao salvar."); }
    setSalvando(false);
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (contas.length === 0) return <p className="text-xs text-muted-foreground">Nenhuma conta de anúncio encontrada.</p>;

  const resumo = sel.size === 0
    ? "Todas as contas"
    : sel.size === 1
      ? contas.find((c) => sel.has(c.account_id))?.name ?? "1 conta"
      : `${sel.size} contas selecionadas`;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Escolha as contas que aparecem no dashboard. Sem nenhuma marcada = todas.
      </p>
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-72 justify-between font-normal">
              <span className="truncate">{resumo}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <div className="flex items-center justify-between px-3 py-2 border-b text-xs">
              <button className="text-primary hover:underline" onClick={() => setSel(new Set(contas.map((c) => c.account_id)))}>Marcar todas</button>
              <button className="text-muted-foreground hover:underline" onClick={() => setSel(new Set())}>Limpar</button>
            </div>
            <ScrollArea className="h-64">
              <div className="p-1">
                {contas.map((c) => (
                  <label key={c.account_id} className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted/60 cursor-pointer text-sm">
                    <Checkbox checked={sel.has(c.account_id)} onCheckedChange={() => toggle(c.account_id)} />
                    <span className="flex-1 truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
        <Button size="sm" onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
