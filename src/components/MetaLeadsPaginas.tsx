import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const GRAPH = "https://graph.facebook.com/v21.0";

interface Pagina { id: string; name: string; access_token: string; }

// Seletor de páginas para captação de leads nativos do Meta (Lead Ads).
// Marcar uma página inscreve o app no webhook `leadgen` dela e guarda o token em meta_lead_paginas.
export function MetaLeadsPaginas() {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [ativas, setAtivas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");

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
        setPaginas(pgs);
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
        // Inscreve a página no webhook leadgen do app.
        const r = await fetch(`${GRAPH}/${pg.id}/subscribed_apps?subscribed_fields=leadgen&access_token=${pg.access_token}`, { method: "POST" });
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        const { error } = await supabase.from("meta_lead_paginas")
          .upsert({ org_id: orgId, page_id: pg.id, page_name: pg.name, page_token: pg.access_token, ativo: true }, { onConflict: "org_id,page_id" });
        if (error) throw new Error(error.message);
        setAtivas((s) => new Set(s).add(pg.id));
        toast.success(`Captação de leads ativada para "${pg.name}".`);
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

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Marque as páginas de onde os leads dos formulários do Meta devem chegar automaticamente (igual ao webhook do CRM).
        Cada lead novo cai na tela de Leads e dispara a notificação de novo lead (origem Meta).
      </p>
      <div className="rounded-md border border-border divide-y max-h-64 overflow-y-auto">
        {paginas.map((pg) => (
          <label key={pg.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
            {salvandoId === pg.id
              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              : <Checkbox checked={ativas.has(pg.id)} onCheckedChange={(v) => toggle(pg, !!v)} />}
            <span className="flex-1 truncate">{pg.name}</span>
            {ativas.has(pg.id) && <span className="text-[10px] text-[hsl(var(--success))]">captando</span>}
          </label>
        ))}
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
