import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Save, Plus, Pencil, Trash2, Check, Eye, EyeOff, GripVertical, Target } from "lucide-react";
import { toast } from "sonner";
import { LEAD_CAMPOS_PADRAO } from "@/lib/leadFields";
import { ordenarPor } from "@/lib/leadColumns";

interface Campo { key: string; label: string; isCustom: boolean; chave?: string; oculto: boolean; fixo: boolean; mqlValores: string[]; }

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
  const [dragKey, setDragKey] = useState<string | null>(null);
  // Configuração do gatilho de MQL (escolher quais valores contam).
  const [mqlField, setMqlField] = useState<Campo | null>(null);
  const [mqlOptions, setMqlOptions] = useState<string[]>([]);
  const [mqlSelected, setMqlSelected] = useState<Set<string>>(new Set());
  const [mqlLoading, setMqlLoading] = useState(false);

  const salvarOrdem = async (arr: Campo[]) => {
    if (!orgId) return;
    try {
      await supabase.from("organizations").update({ lead_ordem: arr.map((c) => c.key) }).eq("id", orgId);
    } catch (e) { toast.error("Falha ao salvar a ordem."); }
  };

  const soltarSobre = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return; }
    const arr = [...campos];
    const from = arr.findIndex((c) => c.key === dragKey);
    const to = arr.findIndex((c) => c.key === targetKey);
    if (from === -1 || to === -1) { setDragKey(null); return; }
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    setCampos(arr);
    setDragKey(null);
    salvarOrdem(arr);
  };

  const carregar = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [{ data: rows }, { data: mapRows }, { data: orgRow }] = await Promise.all([
      supabase.from("lead_campos").select("chave, label, padrao, oculto, excluido, mql_valores").eq("org_id", orgId).order("ordem"),
      supabase.from("lead_mapeamento").select("app_field, crm_key").eq("org_id", orgId),
      supabase.from("organizations").select("lead_ordem").eq("id", orgId).maybeSingle(),
    ]);
    const ordem: string[] = (orgRow?.lead_ordem as string[]) ?? [];
    const mqlArr = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map(String) : []);
    const overrides = new Map<string, { label: string; oculto: boolean; excluido: boolean; mqlValores: string[] }>();
    const customs: any[] = [];
    ((rows as any[]) ?? []).forEach((r) => {
      if (r.padrao) overrides.set(r.chave, { label: r.label, oculto: r.oculto, excluido: !!r.excluido, mqlValores: mqlArr(r.mql_valores) });
      else customs.push(r);
    });
    const padrao: Campo[] = LEAD_CAMPOS_PADRAO
      .filter((f) => !overrides.get(f.key)?.excluido)
      .map((f) => {
        const o = overrides.get(f.key);
        return { key: f.key, label: o?.label ?? f.label, isCustom: false, oculto: !!o?.oculto, fixo: !!f.fixo, mqlValores: o?.mqlValores ?? [] };
      });
    const customDefs: Campo[] = customs.map((c) => ({ key: `custom:${c.chave}`, label: c.label, isCustom: true, chave: c.chave, oculto: !!c.oculto, fixo: false, mqlValores: mqlArr(c.mql_valores) }));
    const todos = [...padrao, ...customDefs];
    const ordenados = ordenarPor(todos.map((c) => c.key), ordem).map((k) => todos.find((c) => c.key === k)!);
    setCampos(ordenados);
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
      await supabase.from("lead_mapeamento").delete().eq("org_id", orgId);
      const rows = Object.entries(mapa).filter(([, v]) => (v ?? "").trim())
        .map(([app_field, crm_key]) => ({ app_field, crm_key: crm_key.trim(), org_id: orgId }));
      if (rows.length) {
        const { error } = await supabase.from("lead_mapeamento").insert(rows);
        if (error) throw new Error(error.message);
      }
      toast.success("Mapeamento salvo.");
    } catch (e) { toast.error((e as Error).message); }
    setSalvando(false);
  };

  const criarCampo = async () => {
    if (!orgId) return;
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
      await supabase.from("lead_campos").delete().eq("org_id", orgId).eq("chave", chave).eq("padrao", true);
      const { error } = await supabase.from("lead_campos").insert({ label, chave, ordem: campos.length, padrao: false, org_id: orgId });
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
        const { error } = await supabase.from("lead_campos").update({ label }).eq("org_id", orgId).eq("chave", c.chave);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("lead_campos")
          .upsert({ chave: c.key, padrao: true, label, oculto: c.oculto, org_id: orgId! }, { onConflict: "org_id,chave" });
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
        await supabase.from("lead_campos").delete().eq("org_id", orgId).eq("chave", c.chave);
        await supabase.from("lead_mapeamento").delete().eq("org_id", orgId).eq("app_field", c.key);
        await carregar();
      } catch (e) { toast.error((e as Error).message); }
    } else {
      try {
        const { error } = await supabase.from("lead_campos")
          .upsert({ chave: c.key, padrao: true, label: c.label, oculto: true, org_id: orgId! }, { onConflict: "org_id,chave" });
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
        await supabase.from("lead_campos").delete().eq("org_id", orgId).eq("chave", c.chave);
        await supabase.from("lead_mapeamento").delete().eq("org_id", orgId).eq("app_field", c.key);
      } else {
        const { error } = await supabase.from("lead_campos")
          .upsert({ chave: c.key, padrao: true, label: c.label, oculto: true, excluido: true, org_id: orgId! }, { onConflict: "org_id,chave" });
        if (error) throw new Error(error.message);
        await supabase.from("lead_mapeamento").delete().eq("org_id", orgId).eq("app_field", c.key);
      }
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  const restaurarCampo = async (c: Campo) => {
    try {
      const { error } = await supabase.from("lead_campos")
        .upsert({ chave: c.key, padrao: true, label: c.label, oculto: false, excluido: false, org_id: orgId! }, { onConflict: "org_id,chave" });
      if (error) throw new Error(error.message);
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  // Abre o seletor de valores de MQL e carrega os valores distintos do campo.
  const abrirMql = async (c: Campo) => {
    setMqlField(c);
    setMqlSelected(new Set(c.mqlValores));
    setMqlOptions([]);
    setMqlLoading(true);
    try {
      const col = c.isCustom ? "custom" : c.key;
      const { data } = await supabase.from("leads").select(col).limit(5000);
      const set = new Set<string>();
      ((data as any[]) ?? []).forEach((r) => {
        const v = c.isCustom ? r.custom?.[c.chave!] : r[c.key];
        if (v != null && String(v).trim()) set.add(String(v).trim());
      });
      setMqlOptions([...set].sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      toast.error("Falha ao carregar os valores do campo.");
    }
    setMqlLoading(false);
  };

  const salvarMql = async () => {
    if (!mqlField) return;
    const valores = [...mqlSelected];
    try {
      if (mqlField.isCustom) {
        const { error } = await supabase.from("lead_campos")
          .update({ mql_valores: valores.length ? valores : null })
          .eq("org_id", orgId).eq("chave", mqlField.chave);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("lead_campos")
          .upsert({ chave: mqlField.key, padrao: true, label: mqlField.label, oculto: mqlField.oculto, mql_valores: valores.length ? valores : null, org_id: orgId! }, { onConflict: "org_id,chave" });
        if (error) throw new Error(error.message);
      }
      toast.success(valores.length ? "Gatilho de MQL salvo." : "Campo removido do MQL.");
      setMqlField(null);
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const visiveis = campos.filter((c) => mostrarOcultos || !c.oculto);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground flex-1">
          Arraste pelo <GripVertical className="inline h-3 w-3" /> para reordenar (a ordem vale também nas colunas da tela de Leads).
          Informe a variável do CRM em cada campo; lápis renomeia, lixeira oculta/exclui.
        </p>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setMostrarOcultos((v) => !v)}>
          {mostrarOcultos ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
          {mostrarOcultos ? "Ocultar" : "Ver ocultos"}
        </Button>
      </div>

      <div className="space-y-1.5">
        {visiveis.map((c) => (
          <div
            key={c.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => soltarSobre(c.key)}
            className={`flex items-center gap-2 rounded ${c.oculto ? "opacity-50" : ""} ${dragKey === c.key ? "opacity-40" : ""}`}
          >
            <button
              type="button"
              draggable
              onDragStart={() => setDragKey(c.key)}
              onDragEnd={() => setDragKey(null)}
              className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
              title="Arraste para reordenar"
            >
              <GripVertical className="h-4 w-4" />
            </button>
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
            {editKey !== c.key && (
              <Button size="icon" variant="ghost"
                className={`h-8 w-8 shrink-0 ${c.mqlValores.length ? "text-primary" : "text-muted-foreground/50"}`}
                onClick={() => abrirMql(c)}
                title={c.mqlValores.length ? `Gatilho de MQL (${c.mqlValores.length} valor(es))` : "Definir gatilho de MQL"}>
                <Target className="h-3.5 w-3.5" />
              </Button>
            )}
            {editKey === c.key ? (
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => salvarRename(c)} title="Salvar nome"><Check className="h-4 w-4" /></Button>
            ) : c.fixo ? (
              <>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setEditKey(c.key); setEditLabel(c.label); }} title="Renomear"><Pencil className="h-3.5 w-3.5" /></Button>
                <span className="w-8 shrink-0" />
              </>
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

      {/* Seletor de valores que contam como MQL para o campo escolhido */}
      <Dialog open={!!mqlField} onOpenChange={(v) => !v && setMqlField(null)}>
        <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Gatilho de MQL — {mqlField?.label}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Marque os valores deste campo que devem contabilizar o lead como <strong>MQL</strong>.
            Um lead é MQL se o valor dele estiver entre os marcados (vale para qualquer campo gatilho).
          </p>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[120px]">
            {mqlLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : mqlOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum valor encontrado para este campo nos leads.</p>
            ) : (
              mqlOptions.map((opt) => (
                <label key={opt} className="flex items-start gap-2 text-sm cursor-pointer rounded px-1 py-1 hover:bg-muted/50">
                  <Checkbox
                    className="mt-0.5"
                    checked={mqlSelected.has(opt)}
                    onCheckedChange={() => setMqlSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(opt)) next.delete(opt); else next.add(opt);
                      return next;
                    })}
                  />
                  <span className="leading-snug">{opt}</span>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMqlField(null)}>Cancelar</Button>
            <Button onClick={salvarMql}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
