import { useState, useMemo, useCallback } from "react";
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
import { useCidades } from "@/hooks/useCidades";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, X, Plus, Upload, Download, Copy } from "lucide-react";
import { toast } from "sonner";
import { useProdutos } from "@/hooks/useProdutos";

// ---- Importação de vendas via CSV ----
const CSV_FIELD_ALIASES: Record<string, string> = {
  data: "data_venda", "data da venda": "data_venda", data_venda: "data_venda", "data venda": "data_venda",
  nome: "nome_comprador", comprador: "nome_comprador", "nome do comprador": "nome_comprador", nome_comprador: "nome_comprador",
  email: "email_comprador", "e-mail": "email_comprador", email_comprador: "email_comprador",
  telefone: "telefone_comprador", celular: "telefone_comprador", telefone_comprador: "telefone_comprador",
  produto: "produto",
  tipo: "tipo_ingresso", "tipo de ingresso": "tipo_ingresso", tipo_ingresso: "tipo_ingresso", lote: "tipo_ingresso", ingresso: "tipo_ingresso",
  cidade: "cidade",
  quantidade: "quantidade", qtd: "quantidade", qtde: "quantidade",
  valor: "valor", preco: "valor", "valor total": "valor", valor_total: "valor",
  pagamento: "metodo_pagamento", "metodo de pagamento": "metodo_pagamento", metodo_pagamento: "metodo_pagamento", forma_pagamento: "metodo_pagamento",
  status: "status",
  cupom: "cupom",
};

function stripAccentsLower(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function parseBRNumber(raw: string): number {
  if (!raw) return 0;
  let s = String(raw).trim().replace(/[R$\s]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseCsvDate(raw: string): string {
  if (!raw) return new Date().toISOString();
  const s = raw.trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const dt = new Date(year, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delim) { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

type ParsedCsv = { rows: Record<string, unknown>[]; recognized: string[]; ignored: string[] };

// Normaliza o status da planilha para o padrão do sistema (feminino: "aprovada")
function normalizeStatus(raw?: string): string {
  const s = (raw || "").toLowerCase().trim();
  if (!s) return "aprovada";
  if (s.startsWith("aprov") || s.includes("approv") || s.includes("paid") || s.includes("pago") || s.includes("complet")) return "aprovada";
  if (s.includes("reembol") || s.includes("refund")) return "reembolsada";
  if (s.includes("cancel") || s.includes("chargeback")) return "cancelada";
  if (s.includes("pend") || s.includes("aguard") || s.includes("waiting")) return "pendente";
  return s;
}

function parseVendasCsv(text: string): ParsedCsv {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return { rows: [], recognized: [], ignored: [] };
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const rawHeaders = parseCsvLine(lines[0], delim);
  const headers = rawHeaders.map((h) => CSV_FIELD_ALIASES[stripAccentsLower(h)] || "");
  const recognized = rawHeaders.filter((_, i) => headers[i]);
  const ignored = rawHeaders.filter((h, i) => !headers[i] && h.trim() !== "");
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delim);
    const rec: Record<string, string> = {};
    headers.forEach((field, idx) => { if (field) rec[field] = cells[idx] ?? ""; });
    if (!rec.produto && !rec.nome_comprador && !rec.valor) continue;
    rows.push({
      plataforma: "importacao",
      produto: rec.produto || null,
      nome_comprador: rec.nome_comprador || null,
      email_comprador: rec.email_comprador || null,
      telefone_comprador: rec.telefone_comprador || null,
      cidade: rec.cidade || null,
      tipo_ingresso: rec.tipo_ingresso ? rec.tipo_ingresso.toLowerCase() : null,
      metodo_pagamento: rec.metodo_pagamento || null,
      cupom: rec.cupom || null,
      status: normalizeStatus(rec.status),
      quantidade: rec.quantidade ? Math.max(1, parseInt(rec.quantidade, 10) || 1) : 1,
      valor: parseBRNumber(rec.valor || "0"),
      data_venda: parseCsvDate(rec.data_venda || ""),
    });
  }
  return { rows, recognized, ignored };
}

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
    case "90d":
      start = new Date(now);
      start.setDate(start.getDate() - 89); // 90 dias incl. hoje
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
  // Filtro de data SEMPRE inicia em "últimos 90 dias" (não restaura o último escolhido).
  const [dateRange, setDateRange] = useState<string>("90d");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [city, setCity] = useState("all");
  const [tipoIngressoFilter, setTipoIngressoFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("aprovada");
  const [nomeFilter, setNomeFilter] = useState("");
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
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    produto: "",
    quantidade: 1,
    valor: 0,
    nome_comprador: "",
    email_comprador: "",
    telefone_comprador: "",
    cidade: "",
    tipo_ingresso: "",
    metodo_pagamento: "",
    status: "aprovada",
    plataforma: "manual",
  });
  const queryClient = useQueryClient();
  const { tableRef, onResizeStart, onResizeDoubleClick } = useColumnResize();
  const { data: cidades = [] } = useCidades();
  const { data: produtos = [] } = useProdutos();
  const hiddenCidades = getHiddenCidades();
  const visibleCidades = cidades.filter((c) => !hiddenCidades.includes(c.id));
  // Cidades ativas (evento de hoje em diante) — usado só no filtro da página.
  const hojeCidades = new Date(); hojeCidades.setHours(0, 0, 0, 0);
  const activeCidades = visibleCidades.filter((c) => {
    if (!c.data_evento) return true;
    const ev = new Date(c.data_evento); ev.setHours(0, 0, 0, 0);
    return ev >= hojeCidades;
  });

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
    let result = vendas;
    if (tipoIngressoFilter.length > 0) {
      result = result.filter((v) => v.tipo_ingresso != null && tipoIngressoFilter.includes(v.tipo_ingresso));
    }
    if (nomeFilter.trim()) {
      const term = nomeFilter.trim().toLowerCase();
      result = result.filter((v) => v.nome_comprador?.toLowerCase().includes(term) || v.email_comprador?.toLowerCase().includes(term));
    }
    return result;
  }, [vendas, tipoIngressoFilter, nomeFilter]);

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

  const duplicarVenda = async (v: VendaRow) => {
    const { error } = await supabase.from("vendas").insert({
      produto: v.produto,
      quantidade: v.quantidade ?? 1,
      valor: v.valor ?? 0,
      nome_comprador: v.nome_comprador,
      email_comprador: v.email_comprador,
      telefone_comprador: v.telefone_comprador,
      documento: v.documento,
      cidade: v.cidade,
      tipo_ingresso: v.tipo_ingresso,
      metodo_pagamento: v.metodo_pagamento,
      status: v.status,
      cupom: v.cupom,
      plataforma: v.plataforma || "manual",
      data_venda: v.data_venda || new Date().toISOString(),
    });
    if (error) {
      toast.error("Erro ao duplicar venda");
      console.error(error);
      return;
    }
    toast.success("Venda duplicada!");
    queryClient.invalidateQueries({ queryKey: ["vendas-tabela"] });
  };

  const handleCreateVenda = async () => {
    if (!createForm.produto) {
      toast.error("Informe o produto");
      return;
    }
    const { error } = await supabase.from("vendas").insert({
      produto: createForm.produto,
      quantidade: createForm.quantidade || 1,
      valor: createForm.valor || 0,
      nome_comprador: createForm.nome_comprador || null,
      email_comprador: createForm.email_comprador || null,
      telefone_comprador: createForm.telefone_comprador || null,
      cidade: createForm.cidade || null,
      tipo_ingresso: createForm.tipo_ingresso || null,
      metodo_pagamento: createForm.metodo_pagamento || null,
      status: createForm.status || "aprovada",
      plataforma: "manual",
      data_venda: new Date().toISOString(),
    });
    if (error) {
      toast.error("Erro ao cadastrar venda");
      console.error(error);
      return;
    }
    toast.success("Venda cadastrada com sucesso!");
    setShowCreateDialog(false);
    setCreateForm({
      produto: "",
      quantidade: 1,
      valor: 0,
      nome_comprador: "",
      email_comprador: "",
      telefone_comprador: "",
      cidade: "",
      tipo_ingresso: "",
      metodo_pagamento: "",
      status: "aprovada",
      plataforma: "manual",
    });
    queryClient.invalidateQueries({ queryKey: ["vendas-tabela"] });
  };

  // ---- Importação CSV ----
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<Record<string, unknown>[]>([]);
  const [importError, setImportError] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importRecognized, setImportRecognized] = useState<string[]>([]);
  const [importIgnored, setImportIgnored] = useState<string[]>([]);

  const resetImport = () => {
    setImportPreview([]);
    setImportError("");
    setImportFileName("");
    setImportRecognized([]);
    setImportIgnored([]);
  };

  const handleImportFile = async (file: File) => {
    setImportError("");
    setImportFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseVendasCsv(text);
      setImportRecognized(parsed.recognized);
      setImportIgnored(parsed.ignored);
      if (parsed.rows.length === 0) {
        setImportPreview([]);
        setImportError("Nenhuma linha válida encontrada. Confira se o cabeçalho tem as colunas corretas.");
        return;
      }
      setImportPreview(parsed.rows);
    } catch {
      setImportPreview([]);
      setImportError("Falha ao ler o arquivo. Salve como CSV e tente novamente.");
    }
  };

  const handleImportConfirm = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);
    try {
      let inserted = 0;
      for (let i = 0; i < importPreview.length; i += 500) {
        const chunk = importPreview.slice(i, i + 500);
        const { error } = await supabase.from("vendas").insert(chunk as any);
        if (error) throw error;
        inserted += chunk.length;
      }
      toast.success(`${inserted} venda(s) importada(s) com sucesso!`);
      setImportOpen(false);
      resetImport();
      queryClient.invalidateQueries({ queryKey: ["vendas-tabela"] });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao importar vendas");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = "data;nome;email;telefone;produto;tipo;cidade;quantidade;valor;pagamento;status;cupom";
    const exemplo = "16/06/2026;João Silva;joao@email.com;+5591999999999;Workshop Scale | Belém - PA;individual;Belém;1;247,00;pix;aprovada;";
    const blob = new Blob(["﻿" + headers + "\n" + exemplo], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-importacao-vendas.csv";
    a.click();
    URL.revokeObjectURL(url);
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
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Importar Vendas (CSV)
              </Button>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Cadastrar Venda Manualmente
              </Button>
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
                  localStorage.setItem("vendas_date_range", preset);
                  if (s) localStorage.setItem("vendas_start_date", s.toISOString()); else localStorage.removeItem("vendas_start_date");
                  if (e) localStorage.setItem("vendas_end_date", e.toISOString()); else localStorage.removeItem("vendas_end_date");
                }}
              />
              <Select value={city} onValueChange={(v) => { setCity(v); setPage(1); }}>
                <SelectTrigger className="w-[240px] bg-card">
                  <SelectValue placeholder="Cidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as cidades</SelectItem>
                  {activeCidades.map((c) => (
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
              <Input
                placeholder="Nome ou email..."
                value={nomeFilter}
                onChange={(e) => { setNomeFilter(e.target.value); setPage(1); }}
                className="w-[200px] bg-card"
              />
              {(statusFilter !== "aprovada" || nomeFilter || tipoIngressoFilter.length > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("aprovada");
                    setNomeFilter("");
                    setTipoIngressoFilter([]);
                    setPage(1);
                  }}
                  className="text-muted-foreground"
                >
                  <X className="mr-1 h-4 w-4" />
                  Limpar filtros
                </Button>
              )}
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
                              <DropdownMenuItem onClick={() => duplicarVenda(v as VendaRow)}>
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicar
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

      {/* Import CSV Dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) resetImport(); }}>
        <DialogContent className={`${importPreview.length > 0 ? "max-w-4xl" : "max-w-lg"} overflow-hidden`}>
          <DialogHeader>
            <DialogTitle>Importar Vendas (CSV)</DialogTitle>
          </DialogHeader>

          {importPreview.length === 0 ? (
            /* Etapa 1: instruções + upload */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Importe vendas antigas (anteriores à integração) a partir de uma planilha CSV.
                As colunas reconhecidas (cabeçalho na 1ª linha):
              </p>
              <code className="block text-xs bg-muted rounded p-2 leading-relaxed">
                data; nome; email; telefone; produto; tipo; cidade; quantidade; valor; pagamento; status; cupom
              </code>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                <li><strong>data</strong>: dd/mm/aaaa (ex.: 16/06/2026). Se vazia, usa a data atual.</li>
                <li><strong>tipo</strong>: individual, duplo ou vip (define a métrica do dashboard).</li>
                <li><strong>valor</strong>: aceita 247,00 ou 247.00.</li>
                <li>Só <strong>produto</strong> é essencial; os demais são opcionais.</li>
                <li>As vendas entram com plataforma <strong>"importacao"</strong>.</li>
              </ul>

              <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Baixar modelo (CSV)
              </Button>

              <div className="space-y-1">
                <Label>Arquivo CSV</Label>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
                />
              </div>

              {importError && <p className="text-sm text-destructive">{importError}</p>}
            </div>
          ) : (
            /* Etapa 2: conferência (de-para + tabela) */
            <div className="space-y-3">
              <p className="text-sm">
                <span className="font-medium text-success">{importPreview.length} venda(s)</span> prontas para importar
                {importFileName ? ` de "${importFileName}"` : ""}. Confira abaixo antes de confirmar:
              </p>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="text-muted-foreground">Colunas reconhecidas:</span>
                {importRecognized.map((c) => (
                  <Badge key={c} variant="secondary">{c}</Badge>
                ))}
              </div>
              {importIgnored.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-destructive">Ignoradas (nome não reconhecido):</span>
                  {importIgnored.map((c) => (
                    <Badge key={c} variant="outline" className="text-destructive border-destructive/40">{c}</Badge>
                  ))}
                </div>
              )}

              <div className="max-h-[360px] w-full overflow-auto rounded-md border border-border bg-card">
                <Table className="min-w-[640px]">
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Data</TableHead>
                      <TableHead className="whitespace-nowrap">Comprador</TableHead>
                      <TableHead className="whitespace-nowrap">Produto</TableHead>
                      <TableHead className="whitespace-nowrap">Cidade</TableHead>
                      <TableHead className="whitespace-nowrap">Tipo</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Qtd</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Valor</TableHead>
                      <TableHead className="whitespace-nowrap">Pagamento</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.slice(0, 50).map((r: any, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(r.data_venda).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.nome_comprador || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[220px] truncate">{r.produto || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.cidade || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.tipo_ingresso || "—"}</TableCell>
                        <TableCell className="text-right text-xs">{r.quantidade}</TableCell>
                        <TableCell className={`text-right text-xs ${Number(r.valor) === 0 ? "text-destructive" : ""}`}>
                          R$ {Number(r.valor || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.metodo_pagamento || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.status || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {importPreview.length > 50 && (
                <p className="text-xs text-muted-foreground">Mostrando as primeiras 50 de {importPreview.length} linhas.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Valores em <span className="text-destructive">vermelho</span> estão R$ 0,00 — confira se a coluna de valor foi reconhecida.
              </p>
            </div>
          )}

          <DialogFooter>
            {importPreview.length > 0 && (
              <Button variant="ghost" onClick={resetImport}>Trocar arquivo</Button>
            )}
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={handleImportConfirm} disabled={importing || importPreview.length === 0}>
              {importing ? "Importando..." : importPreview.length > 0 ? `Confirmar e importar ${importPreview.length}` : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Manual Sale Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadastrar Venda Manualmente</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Produto *</Label>
              <Select value={createForm.produto} onValueChange={(v) => setCreateForm({ ...createForm, produto: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {visibleCidades.map((c) => (
                    <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={createForm.quantidade}
                onChange={(e) => setCreateForm({ ...createForm, quantidade: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={createForm.valor}
                onChange={(e) => setCreateForm({ ...createForm, valor: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Cidade</Label>
              <Select value={createForm.cidade} onValueChange={(v) => setCreateForm({ ...createForm, cidade: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a cidade" />
                </SelectTrigger>
                <SelectContent>
                  {visibleCidades.map((c) => (
                    <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Nome do Comprador</Label>
              <Input
                value={createForm.nome_comprador}
                onChange={(e) => setCreateForm({ ...createForm, nome_comprador: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email_comprador}
                onChange={(e) => setCreateForm({ ...createForm, email_comprador: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input
                value={createForm.telefone_comprador}
                onChange={(e) => setCreateForm({ ...createForm, telefone_comprador: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Tipo de Ingresso</Label>
              <Input
                value={createForm.tipo_ingresso}
                onChange={(e) => setCreateForm({ ...createForm, tipo_ingresso: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Método de Pagamento</Label>
              <Input
                value={createForm.metodo_pagamento}
                onChange={(e) => setCreateForm({ ...createForm, metodo_pagamento: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={createForm.status} onValueChange={(v) => setCreateForm({ ...createForm, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aprovada">Aprovada</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateVenda}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default VendasEventos;
