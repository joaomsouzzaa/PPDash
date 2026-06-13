import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Plus, Pencil, Trash2, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { LEAD_CAMPOS_PADRAO } from "@/lib/leadFields";

interface Campo { key: string; label: string; isCustom: boolean; chave?: string; oculto: boolean; fixo: boolean; }

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
  const [mostrarOcultos, setMostrarOcultos] = useState(false);

  const carregar = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [{ data: rows }, { data: mapRows }] = await Promise.all([
      (supabase as any).from("lead_campos").select("chave, label, padrao, oculto, excluido").eq("org_id", orgId).order("ordem"),
      (supabase as any).from("lead_mapeamento").select("app_field, crm_key").eq("org_id", orgId),
    ]);
    const overrides = new Map<string, { label: string; oculto: boolean; excluido: boolean }>();
    const customs: any[] = [];
    ((rows as any[]) ?? []).forEach((r) => {
      if (r.padrao) overrides.set(r.chave, { label: r.label, oculto: r.oculto, excluido: !!r.excluido });
      else customs.push(r);
    });
    const padrao: Campo[] = LEAD_CAMPOS_PADRAO
      .filter((f) => !overrides.get(f.key)?.excluido)
      .map((f) => {
        const o = overrides.get(f.key);
        return { key: f.key, label: o?.label ?? f.label, isCustom: false, oculto: !!o?.oculto, fixo: !!f.fixo };
      });
    const customDefs: Campo[] = customs.map((c) => ({ key: `custom:${c.chave}`, label: c.label, isCustom: true, chave: c.chave, oculto: !!c.oculto, fixo: false }));
    setCampos([...padrao, ...customDefs]);
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
    const existente = campos.find((c) => c.chave === chave || c.key === chave);
    if (existente) {
      if (existente.oculto) {
        await restaurarCampo(existente);
        setNovo("");
        return toast.success(`O campo "${existente.label}" já existia oculto e foi restaurado.`);
      }
      return toast.error("Já existe um campo com esse nome.");
    }
    try {
      // Remove eventual override de um campo padrão excluído com a mesma chave (libera o unique).
      await (supabase as any).from("lead_campos").delete().eq("org_id", orgId).eq("chave", chave).eq("padrao", true);
      const { error } = await (supabase as any).from("lead_campos").insert({ label, chave, ordem: campos.length, padrao: false });
      if (error) throw new Error(error.message);
      setNovo(""); await carregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  // Renomeia o rótulo de qualquer campo (padrão vira override; custom altera o label).
  const salvarRename = async (c: Campo) => {
    const label = editLabel.trim();
    if (!label) return;
    try {
      if (c.isCustom) {
        const { error } = await (supabase as any).from("lead_campos").update({ label }).eq("org_id", orgId).eq("chave", c.chave);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await (supabase as any).from("lead_campos")
          .upsert({ chave: c.key, padrao: true, label, oculto: c.oculto }, { onConflict: "org_id,chave" });
        if (error) throw new Error(error.message);
      }
      setEditKey(null); await carregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  // Padrão: oculta (esconde da visão). Custom: exclui de vez.
  const removerCampo = async (c: Campo) => {
    if (c.isCustom) {
      if (!confirm(`Excluir o campo "${c.label}"? A coluna some da tabela de Leads (os valores recebidos ficam guardados).`)) return;
      try {
        await (supabase as any).from("lead_campos").delete().eq("org_id", orgId).eq("chave", c.chave);
        await (supabase as any).from("lead_mapeamento").delete().eq("org_id", orgId).eq("app_field", c.key);
        await carregar();
      } catch (e) { toast.error((e as Error).message); }
    } else {
      try {
        const { error } = await (supabase as any).from("lead_campos")
          .upsert({ chave: c.key, padrao: true, label: c.label, oculto: true }, { onConflict: "org_id,chave" });
        if (error) throw new Error(error.message);
        await carregar();
      } catch (e) { toast.error((e as Error).message); }
    }
  };

  // Exclui de vez (campos ocultos): custom some do banco; padrão recebe a flag excluido
  // e deixa de ser tratado como campo do sistema (a chave fica livre para recriar como personalizado).
  const excluirCampo = async (c: Campo) => {
    if (!confirm(`Excluir o campo "${c.label}"? Ele some da lista. (Os valores já recebidos ficam guardados.)`)) return;
    try {
      if (c.isCustom) {
        await (supabase as any).from("lead_campos").delete().eq("org_id", orgId).eq("chave", c.chave);
        await (supabase as any).from("lead_mapeamento").delete().eq("org_id", orgId).eq("app_field", c.key);
      } else {
        const { error } = await (supabase as any).from("lead_campos")
          .upsert({ chave: c.key, padrao: true, label: c.label, oculto: true, excluido: true }, { onConflict: "org_id,chave" });
        if (error) throw new Error(error.message);
        await (supabase as any).from("lead_mapeamento").delete().eq("org_id", orgId).eq("app_field", c.key);
      }
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  const restaurarCampo = async (c: Campo) => {
    try {
      const { error } = await (supabase as any).from("lead_campos")
        .upsert({ chave: c.key, padrao: true, label: c.label, oculto: false, excluido: false }, { onConflict: "org_id,chave" });
      if (error) throw new Error(error.message);
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const visiveis = campos.filter((c) => mostrarOcultos || !c.oculto);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground flex-1">
          Para cada campo, informe o <strong>nome exato da variável</strong> que o webhook do seu CRM envia
          (ex.: <code className="px-1 rounded bg-muted">contact_name</code>). Use o lápis para renomear e a lixeira para
          ocultar (padrão) ou excluir (personalizado).
        </p>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setMostrarOcultos((v) => !v)}>
          {mostrarOcultos ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
          {mostrarOcultos ? "Ocultar" : "Ver ocultos"}
        </Button>
      </div>

      <div className="space-y-1.5">
        {visiveis.map((c) => (
          <div key={c.key} className={`flex items-center gap-2 ${c.oculto ? "opacity-50" : ""}`}>
            {editKey === c.key ? (
              <Input autoFocus value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") salvarRename(c); if (e.key === "Escape") setEditKey(null); }}
                className="h-8 w-44 shrink-0" />
            ) : (
              <span className="text-sm text-muted-foreground truncate w-44 shrink-0 flex items-center gap-1" title={c.label}>
                {c.label}{c.isCustom && <span className="text-[10px] text-primary" title="personalizado">•</span>}
              </span>
            )}
            <Input value={mapa[c.key] ?? ""} onChange={(e) => setMapa((m) => ({ ...m, [c.key]: e.target.value }))}
              placeholder="campo do CRM" className="h-8 flex-1 font-mono text-xs" />
            {c.fixo ? (
              <span className="w-[72px] shrink-0" />
            ) : editKey === c.key ? (
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => salvarRename(c)} title="Salvar nome"><Check className="h-4 w-4" /></Button>
            ) : (
              <>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setEditKey(c.key); setEditLabel(c.label); }} title="Renomear"><Pencil className="h-3.5 w-3.5" /></Button>
                {c.oculto ? (
                  <>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => restaurarCampo(c)} title="Restaurar"><Eye className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={() => excluirCampo(c)} title="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={() => removerCampo(c)} title={c.isCustom ? "Excluir" : "Ocultar"}><Trash2 className="h-3.5 w-3.5" /></Button>
                )}
              </>
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
