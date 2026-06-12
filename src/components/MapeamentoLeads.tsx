import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { LEAD_CAMPOS_PADRAO } from "@/lib/leadFields";

interface Campo { key: string; label: string; isCustom: boolean; chave?: string; }

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function MapeamentoLeads() {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;
  const [campos, setCampos] = useState<Campo[]>([]);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novo, setNovo] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const carregar = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [{ data: custom }, { data: mapRows }] = await Promise.all([
      (supabase as any).from("lead_campos").select("chave, label").eq("org_id", orgId).order("ordem"),
      (supabase as any).from("lead_mapeamento").select("app_field, crm_key").eq("org_id", orgId),
    ]);
    const padrao: Campo[] = LEAD_CAMPOS_PADRAO.map((f) => ({ key: f.key, label: f.label, isCustom: false }));
    const customs: Campo[] = ((custom as any[]) ?? []).map((c) => ({ key: `custom:${c.chave}`, label: c.label, isCustom: true, chave: c.chave }));
    setCampos([...padrao, ...customs]);
    const m: Record<string, string> = {};
    ((mapRows as any[]) ?? []).forEach((r) => { m[r.app_field] = r.crm_key; });
    setMapa(m);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const salvar = async () => {
    if (!orgId) return;
    setSalvando(true);
    try {
      await (supabase as any).from("lead_mapeamento").delete().eq("org_id", orgId);
      const rows = Object.entries(mapa).filter(([, v]) => (v ?? "").trim())
        .map(([app_field, crm_key]) => ({ app_field, crm_key: crm_key.trim() }));
      if (rows.length) {
        const { error } = await (supabase as any).from("lead_mapeamento").insert(rows);
        if (error) throw new Error(error.message);
      }
      toast.success("Mapeamento salvo.");
    } catch (e) { toast.error((e as Error).message); }
    setSalvando(false);
  };

  const criarCampo = async () => {
    const label = novo.trim();
    if (!label) return;
    const chave = slugify(label);
    if (!chave) return toast.error("Nome inválido.");
    if (campos.some((c) => c.chave === chave)) return toast.error("Já existe um campo com esse nome.");
    try {
      const { error } = await (supabase as any).from("lead_campos").insert({ label, chave, ordem: campos.length });
      if (error) throw new Error(error.message);
      setNovo(""); await carregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  const renomearCampo = async (chave: string) => {
    if (!editLabel.trim()) return;
    try {
      const { error } = await (supabase as any).from("lead_campos").update({ label: editLabel.trim() }).eq("org_id", orgId).eq("chave", chave);
      if (error) throw new Error(error.message);
      setEditKey(null); await carregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  const excluirCampo = async (c: Campo) => {
    if (!confirm(`Excluir o campo "${c.label}"? A coluna some da tabela de Leads (os valores recebidos ficam guardados).`)) return;
    try {
      await (supabase as any).from("lead_campos").delete().eq("org_id", orgId).eq("chave", c.chave);
      await (supabase as any).from("lead_mapeamento").delete().eq("org_id", orgId).eq("app_field", c.key);
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Para cada campo, informe o <strong>nome exato da variável</strong> que o webhook do seu CRM envia
        (ex.: <code className="px-1 rounded bg-muted">contact_name</code>). Campos personalizados podem ser renomeados/excluídos.
      </p>

      <div className="space-y-1.5">
        {campos.map((c) => (
          <div key={c.key} className="flex items-center gap-2">
            {editKey === c.key ? (
              <Input autoFocus value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") renomearCampo(c.chave!); if (e.key === "Escape") setEditKey(null); }}
                className="h-8 w-44 shrink-0" />
            ) : (
              <span className="text-sm text-muted-foreground truncate w-44 shrink-0 flex items-center gap-1" title={c.label}>
                {c.label}
                {c.isCustom && <span className="text-[10px] text-primary" title="campo personalizado">•</span>}
              </span>
            )}
            <Input value={mapa[c.key] ?? ""} onChange={(e) => setMapa((m) => ({ ...m, [c.key]: e.target.value }))}
              placeholder="campo do CRM" className="h-8 flex-1 font-mono text-xs" />
            {c.isCustom ? (
              editKey === c.key ? (
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => renomearCampo(c.chave!)} title="Salvar nome"><Check className="h-4 w-4" /></Button>
              ) : (
                <>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setEditKey(c.key); setEditLabel(c.label); }} title="Renomear campo"><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={() => excluirCampo(c)} title="Excluir campo"><Trash2 className="h-3.5 w-3.5" /></Button>
                </>
              )
            ) : (
              <span className="w-[72px] shrink-0" />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t pt-3">
        <Input placeholder="Novo campo personalizado (ex.: Origem do lead)" value={novo}
          onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") criarCampo(); }}
          className="h-8 max-w-xs" />
        <Button size="sm" variant="outline" onClick={criarCampo}><Plus className="mr-1 h-4 w-4" /> Adicionar campo</Button>
      </div>

      <Button size="sm" onClick={salvar} disabled={salvando}>
        {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Salvar mapeamento
      </Button>
    </div>
  );
}
