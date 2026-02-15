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
import { useCidades } from "@/hooks/useCidades";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown } from "lucide-react";
import { toast } from "sonner";

type SortKey = "data_venda" | "nome_comprador" | "produto" | "cidade" | "tipo_ingresso" | "quantidade" | "valor" | "metodo_pagamento" | "status" | "cupom" | "plataforma";
type SortDir = "asc" | "desc";

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

type VendaRow = {
  id: string;
  data_venda: string;
  nome_comprador: string | null;
  email_comprador: string | null;
  produto: string | null;
  cidade: string | null;
  tipo_ingresso: string | null;
  valor: number;
  metodo_pagamento: string | null;
  status: string;
  cupom: string | null;
  plataforma: string;
  telefone_comprador: string | null;
  documento: string | null;
  quantidade: number | null;
};

const VendasEventos = () => {
  const [dateRange, setDateRange] = useState("30d");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [city, setCity] = useState("all");
  const [tipoIngressoFilter, setTipoIngressoFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("aprovada");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>("data_venda");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Edit / Delete state
  const [editingVenda, setEditingVenda] = useState<VendaRow | null>(null);
  const [editForm, setEditForm] = useState<Partial<VendaRow>>({});
  const [deletingVenda, setDeletingVenda] = useState<VendaRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const queryClient = useQueryClient();
  const { data: cidades = [] } = useCidades();
  const hiddenCidades = getHiddenCidades();
  const visibleCidades = cidades.filter((c) => !hiddenCidades.includes(c.id));

  const { start, end } = useMemo(
    () => getDateRange(dateRange, startDate, endDate),
    [dateRange, startDate, endDate]
  );

  const { data: vendas = [], isLoading } = useQuery({
    queryKey: ["vendas-tabela", start, end, city, statusFilter],
    queryFn: async () => {
      const citySlug = city !== "all" ? city : null;
      const { data, error } = await supabase.rpc("buscar_vendas", {
        p_status: statusFilter,
        p_start: start,
        p_end: end,
        p_city_slug: citySlug,
      });
      if (error) throw error;
      return data || [];
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

  const tipoIngressoOptions = useMemo(() => {
    const set = new Set<string>();
    vendas.forEach((v) => { if (v.tipo_ingresso) set.add(v.tipo_ingresso); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [vendas]);

  const filteredVendas = useMemo(() => {
    if (tipoIngressoFilter.length === 0) return vendas;
    return vendas.filter((v) => v.tipo_ingresso != null && tipoIngressoFilter.includes(v.tipo_ingresso));
  }, [vendas, tipoIngressoFilter]);

  const sortedVendas = useMemo(() => {
    const arr = [...filteredVendas];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      const cmp = String(av).localeCompare(String(bv), "pt-BR", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredVendas, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedVendas.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedVendas = sortedVendas.slice((currentPage - 1) * perPage, currentPage * perPage);

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

  const statusColor = (s: string) => {
    switch (s) {
      case "aprovada": return "default";
      case "pendente": return "secondary";
      case "cancelada": return "destructive";
      default: return "outline";
    }
  };

  const openEdit = (v: VendaRow) => {
    setEditingVenda(v);
    setEditForm({
      nome_comprador: v.nome_comprador,
      email_comprador: v.email_comprador,
      produto: v.produto,
      cidade: v.cidade,
      tipo_ingresso: v.tipo_ingresso,
      valor: v.valor,
      metodo_pagamento: v.metodo_pagamento,
      status: v.status,
      cupom: v.cupom,
      quantidade: v.quantidade,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingVenda) return;
    const { error } = await supabase
      .from("vendas")
      .update({
        nome_comprador: editForm.nome_comprador,
        email_comprador: editForm.email_comprador,
        produto: editForm.produto,
        cidade: editForm.cidade,
        tipo_ingresso: editForm.tipo_ingresso,
        valor: Number(editForm.valor) || 0,
        metodo_pagamento: editForm.metodo_pagamento,
        status: editForm.status || "aprovada",
        cupom: editForm.cupom,
        quantidade: Number(editForm.quantidade) || 1,
      })
      .eq("id", editingVenda.id);

    if (error) {
      toast.error("Erro ao atualizar venda");
      return;
    }
    toast.success("Venda atualizada com sucesso");
    setEditingVenda(null);
    queryClient.invalidateQueries({ queryKey: ["vendas-tabela"] });
  };

  const handleDelete = async () => {
    if (!deletingVenda) return;
    const { error } = await supabase
      .from("vendas")
      .delete()
      .eq("id", deletingVenda.id);

    if (error) {
      toast.error("Erro ao excluir venda");
      return;
    }
    toast.success("Venda excluída com sucesso");
    setDeletingVenda(null);
    queryClient.invalidateQueries({ queryKey: ["vendas-tabela"] });
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allPageSelected = paginatedVendas.length > 0 && paginatedVendas.every((v) => selectedIds.has(v.id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedVendas.forEach((v) => next.delete(v.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedVendas.forEach((v) => next.add(v.id));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("vendas").delete().in("id", ids);
    if (error) {
      toast.error("Erro ao excluir vendas");
      return;
    }
    toast.success(`${ids.length} venda${ids.length > 1 ? "s" : ""} excluída${ids.length > 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    setShowBulkDelete(false);
    queryClient.invalidateQueries({ queryKey: ["vendas-tabela"] });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Vendas Eventos</h1>
              <p className="text-sm text-muted-foreground">
                Espelho completo de todas as vendas registradas
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
                }}
              />
              <Select value={city} onValueChange={(v) => { setCity(v); setPage(1); }}>
                <SelectTrigger className="w-[240px] bg-card">
                  <SelectValue placeholder="Cidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as cidades</SelectItem>
                  {visibleCidades.map((c) => (
                    <SelectItem key={c.id} value={c.slug}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-between bg-card font-normal">
                    {tipoIngressoFilter.length === 0
                      ? "Todos os tipos"
                      : `${tipoIngressoFilter.length} tipo(s)`}
                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-2" align="start">
                  <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                    {tipoIngressoOptions.map((t) => (
                      <label key={t} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer">
                        <Checkbox
                          checked={tipoIngressoFilter.includes(t)}
                          onCheckedChange={(checked) => {
                            setTipoIngressoFilter((prev) =>
                              checked ? [...prev, t] : prev.filter((x) => x !== t)
                            );
                            setPage(1);
                          }}
                        />
                        {t}
                      </label>
                    ))}
                    {tipoIngressoFilter.length > 0 && (
                      <Button variant="ghost" size="sm" className="mt-1" onClick={() => { setTipoIngressoFilter([]); setPage(1); }}>
                        Limpar filtro
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[180px] bg-card">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="aprovada">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      Aprovada
                    </div>
                  </SelectItem>
                  <SelectItem value="cancelada">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      Cancelada
                    </div>
                  </SelectItem>
                  <SelectItem value="pendente">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-yellow-500" />
                      Pendente
                    </div>
                  </SelectItem>
                  <SelectItem value="reembolsada">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-orange-500" />
                      Reembolsada
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground ml-auto">
                {sortedVendas.length} venda{sortedVendas.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Bulk delete banner */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
                <span className="text-sm font-medium">
                  {selectedIds.size} venda{selectedIds.size > 1 ? "s" : ""} selecionada{selectedIds.size > 1 ? "s" : ""}
                </span>
                <Button variant="destructive" size="sm" onClick={() => setShowBulkDelete(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir selecionadas
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
                    {sortableHead("Data", "data_venda")}
                    {sortableHead("Comprador", "nome_comprador")}
                    {sortableHead("Produto", "produto")}
                    {sortableHead("Cidade", "cidade")}
                    {sortableHead("Tipo", "tipo_ingresso")}
                    {sortableHead("Qtd.", "quantidade", "text-center")}
                    {sortableHead("Valor", "valor", "text-right")}
                    {sortableHead("Pagamento", "metodo_pagamento")}
                    {sortableHead("Status", "status")}
                    {sortableHead("Cupom", "cupom")}
                    {sortableHead("Plataforma", "plataforma")}
                    <TableHead className="w-10"></TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                         {Array.from({ length: 13 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : vendas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                        Nenhuma venda encontrada no período selecionado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedVendas.map((v) => (
                      <TableRow key={v.id} data-state={selectedIds.has(v.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(v.id)}
                            onCheckedChange={() => toggleSelectId(v.id)}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {new Date(v.data_venda).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{v.nome_comprador || "—"}</p>
                            <p className="text-xs text-muted-foreground">{v.email_comprador || ""}</p>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{v.produto || "—"}</TableCell>
                        <TableCell>{v.cidade || "—"}</TableCell>
                        <TableCell>{v.tipo_ingresso || "—"}</TableCell>
                        <TableCell className="text-center">{v.quantidade ?? 1}</TableCell>
                        <TableCell className="text-right font-semibold whitespace-nowrap">
                          R$ {Number(v.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>{v.metodo_pagamento || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusColor(v.status)}>{v.status}</Badge>
                        </TableCell>
                        <TableCell>{v.cupom || "—"}</TableCell>
                        <TableCell>{v.plataforma}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(v as VendaRow)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeletingVenda(v as VendaRow)}
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
            {sortedVendas.length > perPage && (
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    Mostrando {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, sortedVendas.length)} de {sortedVendas.length}
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
      <Dialog open={!!editingVenda} onOpenChange={(open) => !open && setEditingVenda(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Venda</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Nome do Comprador</Label>
              <Input
                value={editForm.nome_comprador || ""}
                onChange={(e) => setEditForm({ ...editForm, nome_comprador: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                value={editForm.email_comprador || ""}
                onChange={(e) => setEditForm({ ...editForm, email_comprador: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Produto</Label>
              <Input
                value={editForm.produto || ""}
                onChange={(e) => setEditForm({ ...editForm, produto: e.target.value })}
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
              <Label>Tipo de Ingresso</Label>
              <Input
                value={editForm.tipo_ingresso || ""}
                onChange={(e) => setEditForm({ ...editForm, tipo_ingresso: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={editForm.quantidade ?? 1}
                onChange={(e) => setEditForm({ ...editForm, quantidade: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                value={editForm.valor ?? ""}
                onChange={(e) => setEditForm({ ...editForm, valor: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Método de Pagamento</Label>
              <Input
                value={editForm.metodo_pagamento || ""}
                onChange={(e) => setEditForm({ ...editForm, metodo_pagamento: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Input
                value={editForm.status || ""}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Cupom</Label>
              <Input
                value={editForm.cupom || ""}
                onChange={(e) => setEditForm({ ...editForm, cupom: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingVenda(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingVenda} onOpenChange={(open) => !open && setDeletingVenda(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir venda?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. A venda de{" "}
              <strong>{deletingVenda?.nome_comprador || "comprador desconhecido"}</strong>{" "}
              no valor de{" "}
              <strong>
                R$ {Number(deletingVenda?.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </strong>{" "}
              será removida permanentemente.
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
            <AlertDialogTitle>Excluir {selectedIds.size} venda{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. As <strong>{selectedIds.size}</strong> vendas selecionadas serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default VendasEventos;
