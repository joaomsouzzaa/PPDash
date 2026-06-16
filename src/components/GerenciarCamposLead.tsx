import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOrgId } from "@/lib/org";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

interface Campo { id: string; chave: string; label: string; ordem: number; }

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function GerenciarCamposLead({ open, onOpenChange, onChanged }: {
  open: boolean; onOpenChange: (v: boolean) => void; onChanged: () => void;
}) {
  const [campos, setCampos] = useState<Campo[]>([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("lead_campos").select("id, chave, label, ordem").order("ordem");
    setCampos((data as Campo[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (open) void carregar(); }, [open, carregar]);

  const criar = async () => {
    const label = novo.trim();
    if (!label) return;
    const chave = slugify(label);
    if (!chave) return toast.error("Nome inválido.");
    if (campos.some((c) => c.chave === chave)) return toast.error("Já existe um campo com esse nome.");
    setSalvando(true);
    try {
      const orgId = await getOrgId();
      if (!orgId) throw new Error("Organização não identificada.");
      const { error } = await supabase.from("lead_campos").insert({ label, chave, ordem: campos.length, org_id: orgId });
      if (error) throw new Error(error.message);
      setNovo(""); await carregar(); onChanged();
    } catch (e) { toast.error((e as Error).message); }
    setSalvando(false);
  };

  const renomear = async (id: string) => {
    if (!editLabel.trim()) return;
    try {
      const { error } = await supabase.from("lead_campos").update({ label: editLabel.trim() }).eq("id", id);
      if (error) throw new Error(error.message);
      setEditId(null); await carregar(); onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };

  const excluir = async (c: Campo) => {
    if (!confirm(`Excluir o campo "${c.label}"? Os valores já recebidos ficam guardados, mas a coluna some.`)) return;
    try {
      const { error } = await supabase.from("lead_campos").delete().eq("id", c.id);
      if (error) throw new Error(error.message);
      await carregar(); onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Campos personalizados de leads</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Nome do novo campo (ex.: Origem do lead)" value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") criar(); }} />
            <Button onClick={criar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : campos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum campo personalizado ainda.</p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-auto">
              {campos.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  {editId === c.id ? (
                    <>
                      <Input autoFocus value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") renomear(c.id); if (e.key === "Escape") setEditId(null); }}
                        className="h-8" />
                      <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => renomear(c.id)} title="Salvar"><Check className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setEditId(null)} title="Cancelar"><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm truncate">
                        {c.label} <span className="text-xs text-muted-foreground font-mono">({c.chave})</span>
                      </span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setEditId(c.id); setEditLabel(c.label); }} title="Renomear"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => excluir(c)} title="Excluir"><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Depois de criar, vá em <strong>Integrações → Mapeamento</strong> e ligue cada campo à variável do CRM.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
