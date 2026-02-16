import { useState, useMemo, useCallback } from "react";
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
import { MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type SortKey = "data_lead" | "nome" | "email" | "telefone" | "status" | "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "cidade" | "origem" | "deal_user" | "tags" | "whatsapp" | "instagram" | "area_atuacao" | "papel" | "faturamento" | "situacao_atual" | "ad_name" | "campaign_name" | "produto_slug";
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
  origem: string | null;
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
  produto_slug: string | null;
};

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

  const { start, end } = useMemo(
    () => getDateRange(dateRange, startDate, endDate),
    [dateRange, startDate, endDate]
  );

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads-tabela", start, end, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("id, data_lead, nome, email, telefone, status, utm_source, utm_medium, utm_campaign, utm_content, utm_term, cidade, origem, deal_user, tags, whatsapp, instagram, area_atuacao, papel, faturamento, situacao_atual, ad_name, campaign_name, produto_slug")
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
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
        onClick={() => toggleSort(col)}
      >
        {label}
        <SortIcon col={col} />
      </button>
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
      origem: l.origem,
      deal_user: l.deal_user,
      tags: l.tags,
      whatsapp: l.whatsapp,
      instagram: l.instagram,
      area_atuacao: l.area_atuacao,
      papel: l.papel,
      faturamento: l.faturamento,
      situacao_atual: l.situacao_atual,
      utm_source: l.utm_source,
      utm_medium: l.utm_medium,
      utm_campaign: l.utm_campaign,
      utm_content: l.utm_content,
      utm_term: l.utm_term,
      ad_name: l.ad_name,
      campaign_name: l.campaign_name,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingLead) return;
    const { error } = await supabase
      .from("leads")
      .update({
        nome: editForm.nome,
        email: editForm.email,
        telefone: editForm.telefone,
        status: editForm.status || "lead",
        cidade: editForm.cidade,
        origem: editForm.origem,
        deal_user: editForm.deal_user,
        tags: editForm.tags,
        whatsapp: editForm.whatsapp,
        instagram: editForm.instagram,
        area_atuacao: editForm.area_atuacao,
        papel: editForm.papel,
        faturamento: editForm.faturamento,
        situacao_atual: editForm.situacao_atual,
        utm_source: editForm.utm_source,
        utm_medium: editForm.utm_medium,
        utm_campaign: editForm.utm_campaign,
        utm_content: editForm.utm_content,
        utm_term: editForm.utm_term,
        ad_name: editForm.ad_name,
        campaign_name: editForm.campaign_name,
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
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Leads</h1>
              <p className="text-sm text-muted-foreground">
                Espelho completo de todos os leads cadastrados
              </p>
            </div>
          </header>

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
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[200px] bg-card">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="mql">MQL</SelectItem>
                  <SelectItem value="sql">SQL</SelectItem>
                  <SelectItem value="reuniao_agendada">Reunião Agendada</SelectItem>
                  <SelectItem value="reuniao_realizada">Reunião Realizada</SelectItem>
                  <SelectItem value="venda">Venda</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                </SelectContent>
              </Select>
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
                    {sortableHead("Data", "data_lead")}
                    {sortableHead("Nome", "nome")}
                    {sortableHead("Email", "email")}
                    {sortableHead("Telefone", "telefone")}
                    {sortableHead("WhatsApp", "whatsapp")}
                    {sortableHead("Instagram", "instagram")}
                    {sortableHead("Status", "status")}
                    {sortableHead("Origem", "origem")}
                    
                    {sortableHead("Área de Atuação", "area_atuacao")}
                    {sortableHead("Papel", "papel")}
                    {sortableHead("Faturamento", "faturamento")}
                    {sortableHead("Situação Atual", "situacao_atual")}
                    {sortableHead("UTM Source", "utm_source")}
                    {sortableHead("UTM Medium", "utm_medium")}
                    {sortableHead("Campanha UTM", "utm_campaign")}
                    {sortableHead("UTM Content", "utm_content")}
                    {sortableHead("UTM Term", "utm_term")}
                    {sortableHead("Nome Anúncio", "ad_name")}
                    {sortableHead("Nome Campanha", "campaign_name")}
                    
                    {sortableHead("Responsável", "deal_user")}
                    {sortableHead("Tags", "tags")}
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
                        <TableCell className="whitespace-nowrap">
                          {new Date(l.data_lead).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="font-medium">{l.nome || "—"}</TableCell>
                        <TableCell><span className="text-sm">{l.email || "—"}</span></TableCell>
                        <TableCell>{l.telefone || "—"}</TableCell>
                        <TableCell>{l.whatsapp || "—"}</TableCell>
                        <TableCell>{l.instagram || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusColor(l.status)}>
                            {statusLabels[l.status] || l.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{l.origem || "—"}</TableCell>
                        
                        <TableCell className="max-w-[150px] truncate">{l.area_atuacao || "—"}</TableCell>
                        <TableCell>{l.papel || "—"}</TableCell>
                        <TableCell>{l.faturamento || "—"}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{l.situacao_atual || "—"}</TableCell>
                        <TableCell>{l.utm_source || "—"}</TableCell>
                        <TableCell>{l.utm_medium || "—"}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{l.utm_campaign || "—"}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{l.utm_content || "—"}</TableCell>
                        <TableCell>{l.utm_term || "—"}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{l.ad_name || "—"}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{l.campaign_name || "—"}</TableCell>
                        
                        <TableCell className="max-w-[150px] truncate">{l.deal_user || "—"}</TableCell>
                        <TableCell>{l.tags || "—"}</TableCell>
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
              <Input
                value={editForm.nome || ""}
                onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                value={editForm.email || ""}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input
                value={editForm.telefone || ""}
                onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })}
              />
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
              <Label>WhatsApp</Label>
              <Input
                value={editForm.whatsapp || ""}
                onChange={(e) => setEditForm({ ...editForm, whatsapp: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Instagram</Label>
              <Input
                value={editForm.instagram || ""}
                onChange={(e) => setEditForm({ ...editForm, instagram: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Cidade</Label>
              <Input
                value={editForm.cidade || ""}
                onChange={(e) => setEditForm({ ...editForm, cidade: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Origem</Label>
              <Input
                value={editForm.origem || ""}
                onChange={(e) => setEditForm({ ...editForm, origem: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Input
                value={editForm.deal_user || ""}
                onChange={(e) => setEditForm({ ...editForm, deal_user: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Área de Atuação</Label>
              <Input
                value={editForm.area_atuacao || ""}
                onChange={(e) => setEditForm({ ...editForm, area_atuacao: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Papel</Label>
              <Input
                value={editForm.papel || ""}
                onChange={(e) => setEditForm({ ...editForm, papel: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Faturamento</Label>
              <Input
                value={editForm.faturamento || ""}
                onChange={(e) => setEditForm({ ...editForm, faturamento: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Situação Atual</Label>
              <Input
                value={editForm.situacao_atual || ""}
                onChange={(e) => setEditForm({ ...editForm, situacao_atual: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Tags</Label>
              <Input
                value={editForm.tags || ""}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>UTM Source</Label>
              <Input
                value={editForm.utm_source || ""}
                onChange={(e) => setEditForm({ ...editForm, utm_source: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>UTM Medium</Label>
              <Input
                value={editForm.utm_medium || ""}
                onChange={(e) => setEditForm({ ...editForm, utm_medium: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Campanha UTM</Label>
              <Input
                value={editForm.utm_campaign || ""}
                onChange={(e) => setEditForm({ ...editForm, utm_campaign: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>UTM Content</Label>
              <Input
                value={editForm.utm_content || ""}
                onChange={(e) => setEditForm({ ...editForm, utm_content: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>UTM Term</Label>
              <Input
                value={editForm.utm_term || ""}
                onChange={(e) => setEditForm({ ...editForm, utm_term: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Nome do Anúncio</Label>
              <Input
                value={editForm.ad_name || ""}
                onChange={(e) => setEditForm({ ...editForm, ad_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Nome da Campanha</Label>
              <Input
                value={editForm.campaign_name || ""}
                onChange={(e) => setEditForm({ ...editForm, campaign_name: e.target.value })}
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
