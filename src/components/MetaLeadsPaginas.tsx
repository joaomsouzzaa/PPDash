import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";

const GRAPH = "https://graph.facebook.com/v21.0";

interface Pagina { id: string; name: string; access_token: string; }

// Seletor de páginas para captação de leads nativos do Meta (Lead Ads), em lista suspensa
// (mesmo padrão do seletor de contas de anúncio). Marcar inscreve o app no webhook `leadgen`
// da página e guarda o token em meta_lead_paginas.
export function MetaLeadsPaginas() {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [ativas, setAtivas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const token = localStorage.getItem("meta_access_token");
        if (!token) { setErro("Conecte sua conta Meta primeiro."); setLoading(false); return; }
        const res = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token&limit=200&access_token=${token}`);
        const j = await res.json();
        if (j.error) throw new Error(j.error.message);
        const pgs: Pagina[] = (j.data || []).map((p: any) => ({ id: p.id, name: p.name, access_token: p.access_token }));
        const { data: vinc } = await supabase.from("meta_lead_paginas").select("page_id, ativo").eq("ativo", true);
        if (!vivo) return;
        setPaginas(pgs.sort((a, b) => a.name.localeCompare(b.name)));
        setAtivas(new Set(((vinc as any[]) ?? []).map((v) => v.page_id)));
      } catch (e) { if (vivo) setErro((e as Error).message); }
      finally { if (vivo) setLoading(false); }
    })();
    return () => { vivo = false; };
  }, []);

  const toggle = async (pg: Pagina, ligar: boolean) => {
    if (!orgId) return;
    setSalvandoId(pg.id); setErro("");
    try {
      if (ligar) {
        const r = await fetch(`${GRAPH}/${pg.id}/subscribed_apps?subscribed_fields=leadgen&access_token=${pg.access_token}`, { method: "POST" });
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        const { error } = await supabase.from("meta_lead_paginas")
          .upsert({ org_id: orgId, page_id: pg.id, page_name: pg.name, page_token: pg.access_token, ativo: true }, { onConflict: "org_id,page_id" });
        if (error) throw new Error(error.message);
        setAtivas((s) => new Set(s).add(pg.id));
        toast.success(`Captação ativada para "${pg.name}".`);
      } else {
        await fetch(`${GRAPH}/${pg.id}/subscribed_apps?access_token=${pg.access_token}`, { method: "DELETE" }).catch(() => {});
        const { error } = await supabase.from("meta_lead_paginas").update({ ativo: false }).eq("org_id", orgId).eq("page_id", pg.id);
        if (error) throw new Error(error.message);
        setAtivas((s) => { const n = new Set(s); n.delete(pg.id); return n; });
        toast.success(`Captação desativada para "${pg.name}".`);
      }
    } catch (e) { setErro((e as Error).message); toast.error("Falha: " + (e as Error).message); }
    setSalvandoId(null);
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (erro && paginas.length === 0) return <p className="text-xs text-destructive">{erro}</p>;
  if (paginas.length === 0) return <p className="text-xs text-muted-foreground">Nenhuma página encontrada nesta conta do Facebook.</p>;

  const resumo = ativas.size === 0
    ? "Nenhuma página captando"
    : ativas.size === 1
      ? (paginas.find((p) => ativas.has(p.id))?.name ?? "1 página")
      : `${ativas.size} páginas captando`;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Marque as páginas de onde os leads dos formulários do Meta devem chegar automaticamente.
        Cada lead novo cai na tela de Leads e dispara a notificação de novo lead (origem Meta).
      </p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-72 justify-between font-normal">
            <span className="truncate">{resumo}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <ScrollArea className="h-64">
            <div className="p-1">
              {paginas.map((pg) => (
                <label key={pg.id} className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted/60 cursor-pointer text-sm">
                  {salvandoId === pg.id
                    ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    : <Checkbox checked={ativas.has(pg.id)} onCheckedChange={(v) => toggle(pg, !!v)} />}
                  <span className="flex-1 truncate">{pg.name}</span>
                  {ativas.has(pg.id) && <span className="text-[10px] text-[hsl(var(--success))]">captando</span>}
                </label>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
