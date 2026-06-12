import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { LEAD_CAMPOS_PADRAO, type LeadFieldDef } from "@/lib/leadFields";

export function MapeamentoLeads() {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;
  const [campos, setCampos] = useState<LeadFieldDef[]>([]);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [{ data: custom }, { data: mapRows }] = await Promise.all([
      (supabase as any).from("lead_campos").select("chave, label").eq("org_id", orgId).order("ordem"),
      (supabase as any).from("lead_mapeamento").select("app_field, crm_key").eq("org_id", orgId),
    ]);
    const customDefs: LeadFieldDef[] = ((custom as any[]) ?? []).map((c) => ({ key: `custom:${c.chave}`, label: c.label }));
    setCampos([...LEAD_CAMPOS_PADRAO, ...customDefs]);
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
      const rows = Object.entries(mapa)
        .filter(([, v]) => (v ?? "").trim())
        .map(([app_field, crm_key]) => ({ app_field, crm_key: crm_key.trim() }));
      if (rows.length) {
        const { error } = await (supabase as any).from("lead_mapeamento").insert(rows);
        if (error) throw new Error(error.message);
      }
      toast.success("Mapeamento salvo.");
    } catch (e) { toast.error((e as Error).message); }
    setSalvando(false);
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Para cada campo da aplicação, informe o <strong>nome exato da variável</strong> que o webhook do seu CRM envia
        (ex.: <code className="px-1 rounded bg-muted">contact_name</code>). Deixe em branco os que não usa.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {campos.map((c) => (
          <div key={c.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-2">
            <span className="text-sm text-muted-foreground truncate" title={c.label}>{c.label}</span>
            <Input
              value={mapa[c.key] ?? ""}
              onChange={(e) => setMapa((m) => ({ ...m, [c.key]: e.target.value }))}
              placeholder="campo do CRM"
              className="h-8 font-mono text-xs"
            />
          </div>
        ))}
      </div>
      <Button size="sm" onClick={salvar} disabled={salvando}>
        {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Salvar mapeamento
      </Button>
    </div>
  );
}
