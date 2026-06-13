import { useState, useMemo, useCallback, useRef, Fragment } from "react";
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
import { MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown, X, SlidersHorizontal } from "lucide-react";
import { MapeamentoLeads } from "@/components/MapeamentoLeads";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TagSelector } from "@/components/TagSelector";

type SortKey = "data_lead" | "nome" | "email" | "telefone" | "status" | "is_sql" | "is_reuniao_agendada" | "is_reuniao_realizada" | "is_venda_realizada" | "faturamento_venda" | "data_venda_realizada" | "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "cidade" | "deal_user" | "tags" | "whatsapp" | "instagram" | "area_atuacao" | "papel" | "faturamento" | "situacao_atual" | "ad_name" | "campaign_name";
type SortDir = "asc" | "desc";

type LeadRow = {
  id: string;
  data_lead: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  status: string;
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
  faturamento: string | null;
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


function getDateRange(dateRange: string, startDate?: Date, endDate?: Date) {
  if (startDate && endDate) {
    return {
      start: startDate.toISOString(),
      end: new Date(endDate.getTime() + 86400000 - 1).toISOString(),
    };
  }

  const now = new Date();
  let start: Date;

  switch (dateRange) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "yesterday": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return {
        start: start.toISOString(),
        end: new Date(start.getTime() + 86400000 - 1).toISOString(),
      };
    }
    case "7d":
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      break;
    case "14d":
      start = new Date(now);
      start.setDate(start.getDate() - 14);
      break;
    case "30d":
      start = new Date(now);
      start.setDate(start.getDate() - 30);
      break;
    case "this_month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last_month": {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start: start.toISOString(), end: endOfMonth.toISOString() };
    }
    case "lifetime":
      return { start: "2000-01-01T00:00:00Z", end: now.toISOString() };
    default:
      start = new Date(now);
      start.setDate(start.getDate() - 30);
  }

  return { start: start.toISOString(), end: now.toISOString() };
}

const statusLabels: Record<string, string> = {
  lead: "Lead",
  mql: "MQL",
  sql: "SQL",
  reuniao_agendada: "Reunião Agendada",
  reuniao_realizada: "Reunião Realizada",
  venda: "Venda",
  perdido: "Perdido",
};

const statusColor = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "venda": return "default";
    case "mql":
    case "sql": return "secondary";
    case "perdido": return "destructive";
    default: return "outline";
  }
};

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
  const [statusFilter, setStatusFilter] = useState("all");
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

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads-tabela", start, end, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("id, data_lead, nome, email, telefone, status, is_sql, is_reuniao_agendada, is_reuniao_realizada, is_venda_realizada, faturamento_venda, data_venda_realizada, utm_source, utm_medium, utm_campaign, utm_content, utm_term, cidade, deal_user, tags, whatsapp, instagram, area_atuacao, papel, faturamento, situacao_atual, ad_name, campaign_name, custom")
        .gte("data_lead", start)
        .lte("data_lead", end)
        .order("data_lead", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

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
      const { data } = await (supabase as any).from("lead_campos").select("id, chave, label, ordem, padrao, oculto").order("ordem");
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

  // Ordem das colunas definida no gerenciador (organizations.lead_ordem).
  const { data: ordemRow, refetch: refetchOrdem } = useQuery({
    queryKey: ["lead_ordem"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("organizations").select("lead_ordem").limit(1).maybeSingle();
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

  const filteredLeads = useMemo(() => {
    let result = leads;
    if (nomeFilter.trim()) {
      const term = nomeFilter.trim().toLowerCase();
      result = result.filter(
        (l) =>
          l.nome?.toLowerCase().includes(term) ||
          l.email?.toLowerCase().includes(term) ||
          l.telefone?.toLowerCase().includes(term)
      );
    }
    return result;
  }, [leads, nomeFilter]);

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

  const sortableHead = (label: string, col: SortKey, className?: string) => (
    <TableHead className={`${className || ""} relative group`} style={{ minWidth: 80 }}>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors whitespace-nowrap"
        onClick={() => toggleSort(col)}
      >
        {label}
        <SortIcon col={col} />
      </button>
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
    setEditForm({
      nome: l.nome,
      email: l.email,
      telefone: l.telefone,
      status: l.status,
      cidade: l.cidade,
      
      deal_user: l.deal_user,
      tags: l.tags,
      whatsapp: l.whatsapp,
      instagram: l.instagram,
      area_atuacao: l.area_atuacao,
      papel: l.papel,
      faturamento: l.faturamento,
      situacao_atual: l.situacao_atual,
      
      utm_medium: l.utm_medium,
      utm_campaign: l.utm_campaign,
      utm_content: l.utm_content,
      utm_term: l.utm_term,
      ad_name: l.ad_name,
      campaign_name: l.campaign_name,
      is_sql: l.is_sql,
      is_reuniao_agendada: l.is_reuniao_agendada,
      is_reuniao_realizada: l.is_reuniao_realizada,
      is_venda_realizada: l.is_venda_realizada,
      faturamento_venda: l.faturamento_venda,
      data_venda_realizada: l.data_venda_realizada,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingLead) return;

    // Auto-sync is_sql and is_reuniao_agendada based on tags
    const tags = editForm.tags || "";
    const tagList = tags.toLowerCase().split(",").map((t) => t.trim());
    const computedIsSql = tagList.some((t) => t === "sql") ? "Sim" : null;
    const computedIsRa = tagList.some((t) => t === "reunião agendada" || t === "reuniao agendada") ? "Sim" : null;
    const computedIsRr = tagList.some((t) => t === "reunião realizada" || t === "reuniao realizada") ? "Sim" : null;
    const computedIsVr = tagList.some((t) => t === "venda realizada") ? "Sim" : null;

    const { error } = await supabase
      .from("leads")
      .update({
        nome: editForm.nome,
        email: editForm.email,
        telefone: editForm.telefone,
        status: editForm.status || "lead",
        cidade: editForm.cidade,
        deal_user: editForm.deal_user,
        tags: editForm.tags,
        whatsapp: editForm.whatsapp,
        instagram: editForm.instagram,
        area_atuacao: editForm.area_atuacao,
        papel: editForm.papel,
        faturamento: editForm.faturamento,
        situacao_atual: editForm.situacao_atual,
        utm_medium: editForm.utm_medium,
        utm_campaign: editForm.utm_campaign,
        utm_content: editForm.utm_content,
        utm_term: editForm.utm_term,
        ad_name: editForm.ad_name,
        campaign_name: editForm.campaign_name,
        is_sql: computedIsSql,
        is_reuniao_agendada: computedIsRa,
        is_reuniao_realizada: computedIsRr,
        is_venda_realizada: computedIsVr,
        faturamento_venda: editForm.faturamento_venda,
        data_venda_realizada: editForm.data_venda_realizada,
      })
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
            <Button variant="outline" size="sm" onClick={() => setGerenciarCampos(true)}>
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Gerenciar campos
            </Button>
          </header>

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
              {(statusFilter !== "all" || nomeFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("all");
                    setNomeFilter("");
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
                    {colunas.map((c) => (
                      <Fragment key={c.key}>
                        {c.sortable
                          ? sortableHead(c.label, c.key as SortKey)
                          : <TableHead style={{ minWidth: 100 }} className="whitespace-nowrap">{c.label}</TableHead>}
                      </Fragment>
                    ))}
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
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={editForm.nome || ""} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={editForm.email || ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={editForm.telefone || ""} onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>WhatsApp Digitado</Label>
              <Input value={editForm.whatsapp || ""} onChange={(e) => setEditForm({ ...editForm, whatsapp: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Instagram</Label>
              <Input value={editForm.instagram || ""} onChange={(e) => setEditForm({ ...editForm, instagram: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={editForm.status || "lead"} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="mql">MQL</SelectItem>
                  <SelectItem value="sql">SQL</SelectItem>
                  <SelectItem value="reuniao_agendada">Reunião Agendada</SelectItem>
                  <SelectItem value="reuniao_realizada">Reunião Realizada</SelectItem>
                  <SelectItem value="venda">Venda</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>SQL</Label>
              <Select value={editForm.is_sql || ""} onValueChange={(v) => setEditForm({ ...editForm, is_sql: v || null })}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sim">Sim</SelectItem>
                  <SelectItem value="Nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reunião Agendada</Label>
              <Select value={editForm.is_reuniao_agendada || ""} onValueChange={(v) => setEditForm({ ...editForm, is_reuniao_agendada: v || null })}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sim">Sim</SelectItem>
                  <SelectItem value="Nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reunião Realizada</Label>
              <Select value={editForm.is_reuniao_realizada || ""} onValueChange={(v) => setEditForm({ ...editForm, is_reuniao_realizada: v || null })}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sim">Sim</SelectItem>
                  <SelectItem value="Nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Venda Realizada</Label>
              <Select value={editForm.is_venda_realizada || ""} onValueChange={(v) => setEditForm({ ...editForm, is_venda_realizada: v || null })}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sim">Sim</SelectItem>
                  <SelectItem value="Nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Área de Atuação</Label>
              <Input value={editForm.area_atuacao || ""} onChange={(e) => setEditForm({ ...editForm, area_atuacao: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Papel na Empresa</Label>
              <Input value={editForm.papel || ""} onChange={(e) => setEditForm({ ...editForm, papel: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Faturamento Atual</Label>
              <Input value={editForm.faturamento || ""} onChange={(e) => setEditForm({ ...editForm, faturamento: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Situação Atual</Label>
              <Input value={editForm.situacao_atual || ""} onChange={(e) => setEditForm({ ...editForm, situacao_atual: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Utm Campaign</Label>
              <Input value={editForm.utm_campaign || ""} onChange={(e) => setEditForm({ ...editForm, utm_campaign: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>UTM Medium</Label>
              <Input value={editForm.utm_medium || ""} onChange={(e) => setEditForm({ ...editForm, utm_medium: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>UTM Content</Label>
              <Input value={editForm.utm_content || ""} onChange={(e) => setEditForm({ ...editForm, utm_content: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>UTM Term</Label>
              <Input value={editForm.utm_term || ""} onChange={(e) => setEditForm({ ...editForm, utm_term: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Nome Campanha</Label>
              <Input value={editForm.campaign_name || ""} onChange={(e) => setEditForm({ ...editForm, campaign_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Nome do Anúncio</Label>
              <Input value={editForm.ad_name || ""} onChange={(e) => setEditForm({ ...editForm, ad_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Input value={editForm.deal_user || ""} onChange={(e) => setEditForm({ ...editForm, deal_user: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Faturamento da Venda</Label>
              <Input type="number" value={editForm.faturamento_venda ?? ""} onChange={(e) => setEditForm({ ...editForm, faturamento_venda: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="space-y-1">
              <Label>Data Venda Realizada</Label>
              <Input type="date" value={editForm.data_venda_realizada ? new Date(editForm.data_venda_realizada).toISOString().split("T")[0] : ""} onChange={(e) => setEditForm({ ...editForm, data_venda_realizada: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Tags</Label>
              <TagSelector
                value={editForm.tags || ""}
                onChange={(v) => setEditForm({ ...editForm, tags: v })}
              />
            </div>
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
