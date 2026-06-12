import { useEffect, useState } from "react";
import { fetchTodasAdAccounts, getContasSelecionadas, setContasSelecionadas, type AdAccount } from "@/lib/meta-ads";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export function MetaContasSelecao() {
  const [contas, setContas] = useState<AdAccount[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

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

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Marque as contas que devem aparecer no dashboard. Deixe <strong>nenhuma marcada</strong> para usar todas.
      </p>
      <div className="space-y-1 max-h-56 overflow-auto rounded-md border p-2">
        {contas.map((c) => (
          <label key={c.account_id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
            <Checkbox checked={sel.has(c.account_id)} onCheckedChange={() => toggle(c.account_id)} />
            <span className="flex-1 truncate">{c.name}</span>
            <span className="text-[10px] text-muted-foreground font-mono">{c.account_id}</span>
          </label>
        ))}
      </div>
      <Button size="sm" onClick={salvar} disabled={salvando}>
        {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Salvar contas ({sel.size || "todas"})
      </Button>
    </div>
  );
}
