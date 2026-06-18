import { useState, useMemo, useCallback, useRef } from "react";
import { TABLE_COL_KEYS, SORTABLE, STANDARD_RENDER, LABEL_PADRAO, ordenarPor } from "@/lib/leadColumns";
import { useColumnResize } from "@/hooks/useColumnResize";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DateRangePicker } from "@/components/DateRangePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown, X, SlidersHorizontal, Filter, RefreshCw, Loader2, Upload } from "lucide-react";
import { MapeamentoLeads } from "@/components/MapeamentoLeads";
import { LeadsImport } from "@/components/LeadsImport";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TagSelector } from "@/components/TagSelector";

type SortKey = "data_lead" | "nome" | "email" | "telefone" | "is_sql" | "is_reuniao_agendada" | "is_reuniao_realizada" | "is_venda_realizada" | "faturamento_venda" | "data_venda_realizada" | "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "cidade" | "deal_user" | "tags" | "whatsapp" | "instagram" | "area_atuacao" | "papel" | "situacao_atual" | "ad_name" | "campaign_name";
type SortDir = "asc" | "desc";

type LeadRow = {
  id: string;
  data_lead: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  cidade: string | null;
  deal_user: string | null;
  tags: string | null;
  whatsapp: string | null;
  instagram: string | null;
  area_atuacao: string | null;
  papel: string | null;
  situacao_atual: string | null;
  ad_name: string | null;
  campaign_name: string | null;
  is_sql: string | null;
  is_reuniao_agendada: string | null;
  is_reuniao_realizada: string | null;
  is_venda_realizada: string | null;
  faturamento_venda: number | null;
  data_venda_realizada: string | null;
  custom: Record<string, unknown> | null;
};

type CampoLead = { id: string; chave: string; label: string; ordem: number };


// Limites de DIA em horário do Brasil (America/Sao_Paulo, UTC-3) — IDÊNTICOS aos do
// dashboard (useLeadsData.getDateRange) para as duas telas baterem. Meia-noite BRT = 03:00Z.
function getDateRange(dateRange: string, startDate?: Date, endDate?: Date) {
  const brtStart = (d: Date) =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 3, 0, 0)).toISOString();
  const brtEnd = (d: Date) =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 1, 3, 0, 0) - 1).toISOString();

  if (startDate && endDate) {
    return { start: brtStart(startDate), end: brtEnd(endDate) };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diasAtras = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };

  switch (dateRange) {
    case "today":
      return { start: brtStart(today), end: brtEnd(today) };
    case "yesterday": {
      const y = diasAtras(1);
      return { start: brtStart(y), end: brtEnd(y) };
    }
    case "7d":
      return { start: brtStart(diasAtras(7)), end: brtEnd(today) };
    case "14d":
      return { start: brtStart(diasAtras(14)), end: brtEnd(today) };
    case "30d":
      return { start: brtStart(diasAtras(30)), end: brtEnd(today) };
    case "this_month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: brtStart(s), end: brtEnd(today) };
    }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: brtStart(s), end: brtEnd(e) };
    }
    case "lifetime":
      return { start: "2000-01-01T00:00:00Z", end: brtEnd(today) };
    default:
      return { start: brtStart(diasAtras(30)), end: brtEnd(today) };
  }
}

// Tipo de controle de cada campo padrão no modal de edição (default = texto).
type FieldKind = "text" | "simnao" | "number" | "date" | "datetime" | "tags";
const FIELD_KIND: Record<string, FieldKind> = {
  is_sql: "simnao",
  is_reuniao_agendada: "simnao",
  is_reuniao_realizada: "simnao",
  is_venda_realizada: "simnao",
  faturamento_venda: "number",
  data_venda_realizada: "date",
  data_lead: "datetime",
  tags: "tags",
};

// Filtro por coluna (estilo Google Sheets): lista os valores da coluna para marcar/desmarcar.
function ColumnFilter({ values, selected, onChange }: { values: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const active = selected.length > 0;
  const lbl = (v: string) => (v === "" ? "(vazio)" : v);
  const filtered = values.filter((v) => lbl(v).toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn("shrink-0 rounded p-0.5 hover:bg-muted", active ? "text-primary" : "text-muted-foreground/50")}
          title={active ? `Filtrando (${selected.length})` : "Filtrar coluna"}
        >
          <Filter className={cn("h-3 w-3", active && "fill-current")} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="p-2 border-b">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar valor..." className="h-8" />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum valor.</p>
          ) : filtered.map((v) => (
            <label key={v} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50">
              <Checkbox checked={selected.includes(v)} onCheckedChange={() => toggle(v)} />
              <span className="truncate" title={lbl(v)}>{lbl(v)}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between border-t p-1.5">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange(filtered)}>Marcar todos</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange([])}>Limpar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const LeadsInsideSales = () => {
  const [dateRange, setDateRange] = useState(() => localStorage.getItem("leads_date_range") || "30d");
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem("leads_start_date");
    return saved ? new Date(saved) : undefined;
  });
  const [endDate, setEndDate] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem("leads_end_date");
    return saved ? new Date(saved) : undefined;
  });
  const [nomeFilter, setNomeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [sortKey, setSortKey] = useState<SortKey>("data_lead");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [editingLead, setEditingLead] = useState<LeadRow | null>(null);
  const [editForm, setEditForm] = useState<Partial<LeadRow>>({});
  const [deletingLead, setDeletingLead] = useState<LeadRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const queryClient = useQueryClient();
  const { tableRef, onResizeStart, onResizeDoubleClick } = useColumnResize();

  const { start, end } = useMemo(
    () => getDateRange(dateRange, startDate, endDate),
    [dateRange, startDate, endDate]
  );

  const { data: leads = [], isLoading, refetch: refetchLeads } = useQuery({
    queryKey: ["leads-tabela", start, end],
    queryFn: async () => {
      const query = supabase
        .from("leads")
        .select("id, data_lead, nome, email, telefone, is_sql, is_reuniao_agendada, is_reuniao_realizada, is_venda_realizada, faturamento_venda, data_venda_realizada, utm_source, utm_medium, utm_campaign, utm_content, utm_term, cidade, deal_user, tags, whatsapp, instagram, area_atuacao, papel, situacao_atual, ad_name, campaign_name, custom")
        .gte("data_lead", start)
        .lte("data_lead", end)
        .order("data_lead", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as LeadRow[];
    },
    refetchInterval: 60_000,
  });

  // Configuração de campos da organização (custom + overrides dos padrão).
  const { data: camposRaw = [], refetch: refetchCampos } = useQuery({
    queryKey: ["lead_campos_all"],
    queryFn: async () => {
      const { data } = await supabase.from("lead_campos").select("id, chave, label, ordem, padrao, oculto").order("ordem");
      return (data || []) as Array<CampoLead & { padrao: boolean; oculto: boolean }>;
    },
  });
  // Overrides dos campos padrão: rótulo customizado e ocultar.
  const overrides = useMemo(() => {
    const m = new Map<string, { label: string; oculto: boolean }>();
    camposRaw.filter((r) => r.padrao).forEach((r) => m.set(r.chave, { label: r.label, oculto: r.oculto }));
    return m;
  }, [camposRaw]);
  // Campos personalizados visíveis (colunas dinâmicas).
  const campos = useMemo(() => camposRaw.filter((r) => !r.padrao && !r.oculto) as CampoLead[], [camposRaw]);
  const lbl = (key: string, def: string) => overrides.get(key)?.label ?? def;
  const vis = (key: string) => !overrides.get(key)?.oculto;
  const [gerenciarCampos, setGerenciarCampos] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncDias, setSyncDias] = useState("7");

  const sincronizarAgora = useCallback(async () => {
    const d = Math.max(1, Math.min(365, parseInt(syncDias, 10) || 7));
    setSincronizando(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-sync", { body: { dias: d } });
      if (error) throw new Error(error.message);
      const r = (data as any)?.resultados?.[0];
      if (r?.erro) throw new Error(r.erro);
      toast.success(`Sincronizado (${d} dias): ${r?.inseridos ?? 0} novo(s) · ${r?.total ?? 0} no total.`);
      setSyncOpen(false);
      await refetchLeads();
    } catch (e) {
      toast.error("Falha na sincronização: " + (e as Error).message);
    } finally {
      setSincronizando(false);
    }
  }, [refetchLeads, syncDias]);

  // Ordem das colunas definida no gerenciador (organizations.lead_ordem).
  const { data: ordemRow, refetch: refetchOrdem } = useQuery({
    queryKey: ["lead_ordem"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("lead_ordem").limit(1).maybeSingle();
      return data;
    },
  });
  const ordem: string[] = (ordemRow?.lead_ordem as string[]) ?? [];

  // Colunas visíveis da tabela, na ordem definida (padrão visíveis + custom).
  const colunas = useMemo(() => {
    const std = TABLE_COL_KEYS.filter((k) => vis(k)).map((k) => ({
      key: k, label: lbl(k, LABEL_PADRAO[k] || k), sortable: SORTABLE.has(k), isCustom: false, chave: undefined as string | undefined,
    }));
    const cus = campos.map((c) => ({ key: `custom:${c.chave}`, label: c.label, sortable: false, isCustom: true, chave: c.chave }));
    const all = [...std, ...cus];
    return ordenarPor(all.map((c) => c.key), ordem).map((k) => all.find((c) => c.key === k)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campos, overrides, JSON.stringify(ordem)]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }, [sortKey]);

  // Filtros por coluna (valores selecionados por chave de coluna).
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});

  // Texto da célula usado tanto para exibir no filtro quanto para comparar.
  const cellText = useCallback((l: LeadRow, col: { key: string; isCustom: boolean; chave?: string }): string => {
    if (col.isCustom) { const v = (l.custom as Record<string, unknown> | null)?.[col.chave!]; return v == null ? "" : String(v); }
    if (col.key === "data_lead") return l.data_lead ? new Date(l.data_lead).toLocaleDateString("pt-BR") : "";
    const v = (l as Record<string, unknown>)[col.key];
    return v == null ? "" : String(v);
  }, []);

  // Aplica o filtro de nome + filtros de coluna (exceto a coluna informada).
  const aplicarFiltros = useCallback((list: LeadRow[], exceto?: string) => {
    let result = list;
    if (nomeFilter.trim()) {
      const term = nomeFilter.trim().toLowerCase();
      result = result.filter((l) =>
        l.nome?.toLowerCase().includes(term) || l.email?.toLowerCase().includes(term) || l.telefone?.toLowerCase().includes(term));
    }
    for (const c of colunas) {
      if (c.key === exceto) continue;
      const sel = colFilters[c.key];
      if (sel && sel.length) result = result.filter((l) => sel.includes(cellText(l, c)));
    }
    return result;
  }, [nomeFilter, colunas, colFilters, cellText]);

  const filteredLeads = useMemo(() => aplicarFiltros(leads), [leads, aplicarFiltros]);

  // Valores distintos por coluna (considerando os demais filtros ativos).
  const valoresPorColuna = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of colunas) {
      const base = aplicarFiltros(leads, c.key);
      const set = new Set<string>();
      for (const l of base) set.add(cellText(l, c));
      map[c.key] = [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    return map;
  }, [leads, colunas, aplicarFiltros, cellText]);

  const sortedLeads = useMemo(() => {
    const arr = [...filteredLeads];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = String(av).localeCompare(String(bv), "pt-BR", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredLeads, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedLeads.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedLeads = sortedLeads.slice((currentPage - 1) * perPage, currentPage * perPage);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const renderHead = (c: typeof colunas[number]) => (
    <TableHead key={c.key} className="relative group whitespace-nowrap" style={{ minWidth: 110 }}>
      <div className="flex items-center gap-1">
        {c.sortable ? (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
            onClick={() => toggleSort(c.key as SortKey)}
          >
            {c.label}
            <SortIcon col={c.key as SortKey} />
          </button>
        ) : (
          <span>{c.label}</span>
        )}
        <ColumnFilter
          values={valoresPorColuna[c.key] || []}
          selected={colFilters[c.key] || []}
          onChange={(v) => { setColFilters((p) => ({ ...p, [c.key]: v })); setPage(1); }}
        />
      </div>
      <div
        onMouseDown={onResizeStart}
        onTouchStart={onResizeStart}
        onDoubleClick={onResizeDoubleClick}
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-border/0 hover:bg-primary/40 group-hover:bg-border/30 transition-colors"
      />
    </TableHead>
  );

  const openEdit = (l: LeadRow) => {
    setEditingLead(l);
    // Carrega todos os campos; o modal exibe só os visíveis (Gerenciar campos).
    setEditForm({ ...l, custom: { ...(l.custom || {}) } });
  };

  const setCustom = (chave: string, value: string) =>
    setEditForm((f) => ({ ...f, custom: { ...(f.custom || {}), [chave]: value } }));

  const handleSaveEdit = async () => {
    if (!editingLead) return;

    // Atualiza apenas os campos visíveis na tela (colunas), preservando os ocultos.
    const update: Record<string, unknown> = {};
    for (const col of colunas) {
      if (col.isCustom) continue;
      const k = col.key;
      if (k === "faturamento_venda") {
        update.faturamento_venda = editForm.faturamento_venda ?? null;
      } else {
        update[k] = (editForm as Record<string, unknown>)[k] ?? null;
      }
    }
    // Campos personalizados (JSONB) — preserva o que já havia e aplica edições.
    update.custom = { ...(editingLead.custom || {}), ...(editForm.custom || {}) };

    const { error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", editingLead.id);

    if (error) {
      toast.error("Erro ao atualizar lead");
      return;
    }
    toast.success("Lead atualizado com sucesso");
    setEditingLead(null);
    queryClient.invalidateQueries({ queryKey: ["leads-tabela"] });
  };

  const handleDelete = async () => {
    if (!deletingLead) return;
    const { error } = await supabase
      .from("leads")
      .delete()
      .eq("id", deletingLead.id);

    if (error) {
      toast.error("Erro ao excluir lead");
      return;
    }
    toast.success("Lead excluído com sucesso");
    setDeletingLead(null);
    queryClient.invalidateQueries({ queryKey: ["leads-tabela"] });
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Renderiza o controle de edição de uma coluna visível.
  const renderEditField = (col: { key: string; label: string; isCustom: boolean; chave?: string }) => {
    if (col.isCustom) {
      const v = (editForm.custom as Record<string, unknown> | undefined)?.[col.chave!];
      return (
        <div key={col.key} className="space-y-1">
          <Label>{col.label}</Label>
          <Input value={v != null ? String(v) : ""} onChange={(e) => setCustom(col.chave!, e.target.value)} />
        </div>
      );
    }
    const kind = FIELD_KIND[col.key] || "text";
    const val = (editForm as Record<string, unknown>)[col.key];

    if (kind === "tags") {
      return (
        <div key={col.key} className="space-y-1 col-span-2">
          <Label>{col.label}</Label>
          <TagSelector value={editForm.tags || ""} onChange={(v) => setEditForm({ ...editForm, tags: v })} />
        </div>
      );
    }
    if (kind === "simnao") {
      return (
        <div key={col.key} className="space-y-1">
          <Label>{col.label}</Label>
          <Select value={(val as string) || ""} onValueChange={(v) => setEditForm({ ...editForm, [col.key]: v || null })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Sim">Sim</SelectItem>
              <SelectItem value="Nao">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    }
    if (kind === "number") {
      return (
        <div key={col.key} className="space-y-1">
          <Label>{col.label}</Label>
          <Input type="number" value={val != null ? String(val) : ""} onChange={(e) => setEditForm({ ...editForm, [col.key]: e.target.value ? Number(e.target.value) : null })} />
        </div>
      );
    }
    if (kind === "date" || kind === "datetime") {
      const iso = val ? new Date(val as string).toISOString().split("T")[0] : "";
      return (
        <div key={col.key} className="space-y-1">
          <Label>{col.label}</Label>
          <Input type="date" value={iso} onChange={(e) => setEditForm({ ...editForm, [col.key]: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </div>
      );
    }
    // text
    return (
      <div key={col.key} className="space-y-1">
        <Label>{col.label}</Label>
        <Input value={(val as string) || ""} onChange={(e) => setEditForm({ ...editForm, [col.key]: e.target.value })} />
      </div>
    );
  };

  const allPageSelected = paginatedLeads.length > 0 && paginatedLeads.every((l) => selectedIds.has(l.id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedLeads.forEach((l) => next.delete(l.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedLeads.forEach((l) => next.add(l.id));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("leads").delete().in("id", ids);
    if (error) {
      toast.error("Erro ao excluir leads");
      return;
    }
    toast.success(`${ids.length} lead${ids.length > 1 ? "s" : ""} excluído${ids.length > 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    setShowBulkDelete(false);
    queryClient.invalidateQueries({ queryKey: ["leads-tabela"] });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight">Leads</h1>
              <p className="text-sm text-muted-foreground">
                Espelho completo de todos os leads cadastrados
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)} disabled={sincronizando}>
              <RefreshCw className={`mr-2 h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} /> {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Importar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setGerenciarCampos(true)}>
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Gerenciar campos
            </Button>
          </header>

          <LeadsImport open={importOpen} onOpenChange={setImportOpen} onImported={() => refetchLeads()} />

          <Dialog open={syncOpen} onOpenChange={(v) => { if (!sincronizando) setSyncOpen(v); }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Sincronizar agora</DialogTitle>
                <DialogDescription>Buscar e recuperar leads de quantos dias para trás?</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="leads-sync-dias" className="text-sm">Dias para trás</Label>
                <Input id="leads-sync-dias" type="number" min={1} max={365} value={syncDias}
                  onChange={(e) => setSyncDias(e.target.value)} className="max-w-[120px]" />
                <p className="text-xs text-muted-foreground">Recupera os leads que falharam ao entrar nesse período e atualiza a partir do CRM configurado.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSyncOpen(false)} disabled={sincronizando}>Cancelar</Button>
                <Button onClick={sincronizarAgora} disabled={sincronizando}>
                  {sincronizando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Sincronizar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={gerenciarCampos} onOpenChange={(v) => { setGerenciarCampos(v); if (!v) { refetchCampos(); refetchOrdem(); } }}>
            <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Gerenciar campos e mapeamento do CRM</DialogTitle></DialogHeader>
              <MapeamentoLeads />
            </DialogContent>
          </Dialog>

          <div className="p-6 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <DateRangePicker
                preset={dateRange}
                startDate={startDate}
                endDate={endDate}
                onApply={(preset, s, e) => {
                  setDateRange(preset);
                  setStartDate(s);
                  setEndDate(e);
                  setPage(1);
                  localStorage.setItem("leads_date_range", preset);
                  if (s) localStorage.setItem("leads_start_date", s.toISOString()); else localStorage.removeItem("leads_start_date");
                  if (e) localStorage.setItem("leads_end_date", e.toISOString()); else localStorage.removeItem("leads_end_date");
                }}
              />
              <Input
                placeholder="Nome, email ou telefone..."
                value={nomeFilter}
                onChange={(e) => { setNomeFilter(e.target.value); setPage(1); }}
                className="w-[220px] bg-card"
              />
              {(nomeFilter || Object.values(colFilters).some((v) => v.length)) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNomeFilter("");
                    setColFilters({});
                    setPage(1);
                  }}
                  className="text-muted-foreground"
                >
                  <X className="mr-1 h-4 w-4" />
                  Limpar filtros
                </Button>
              )}
              <span className="text-sm text-muted-foreground ml-auto">
                {sortedLeads.length} lead{sortedLeads.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Bulk delete banner */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
                <span className="text-sm font-medium">
                  {selectedIds.size} lead{selectedIds.size > 1 ? "s" : ""} selecionado{selectedIds.size > 1 ? "s" : ""}
                </span>
                <Button variant="destructive" size="sm" onClick={() => setShowBulkDelete(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir selecionados
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Limpar seleção
                </Button>
              </div>
            )}

            {/* Table */}
            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allPageSelected} onCheckedChange={toggleSelectAll} />
                    </TableHead>
                    {colunas.map((c) => renderHead(c))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 25 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : leads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={25} className="text-center text-muted-foreground py-8">
                        Nenhum lead encontrado no período selecionado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedLeads.map((l) => (
                      <TableRow key={l.id} data-state={selectedIds.has(l.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(l.id)}
                            onCheckedChange={() => toggleSelectId(l.id)}
                          />
                        </TableCell>
                        {colunas.map((c) => (
                          <TableCell key={c.key} className="max-w-[180px] truncate">
                            {c.isCustom
                              ? (() => { const v = (l.custom as Record<string, unknown> | null)?.[c.chave!]; return v != null && v !== "" ? String(v) : "—"; })()
                              : STANDARD_RENDER[c.key](l)}
                          </TableCell>
                        ))}
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(l)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeletingLead(l)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {sortedLeads.length > perPage && (
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    Mostrando {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, sortedLeads.length)} de {sortedLeads.length}
                  </span>
                  <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
                    <SelectTrigger className="w-[80px] h-8 bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 20, 50, 100].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">por página</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm font-medium">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingLead} onOpenChange={(open) => !open && setEditingLead(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Lead</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {colunas.map((c) => renderEditField(c))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLead(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingLead} onOpenChange={(open) => !open && setDeletingLead(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O lead{" "}
              <strong>{deletingLead?.nome || deletingLead?.email || "desconhecido"}</strong>{" "}
              será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} lead{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Os <strong>{selectedIds.size}</strong> leads selecionados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default LeadsInsideSales;
