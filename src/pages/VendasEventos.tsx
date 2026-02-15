import { useState, useMemo } from "react";
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
import { useCidades } from "@/hooks/useCidades";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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

const VendasEventos = () => {
  const [dateRange, setDateRange] = useState("30d");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [city, setCity] = useState("all");

  const { data: cidades = [] } = useCidades();
  const hiddenCidades = getHiddenCidades();
  const visibleCidades = cidades.filter((c) => !hiddenCidades.includes(c.id));

  const { start, end } = useMemo(
    () => getDateRange(dateRange, startDate, endDate),
    [dateRange, startDate, endDate]
  );

  const { data: vendas = [], isLoading } = useQuery({
    queryKey: ["vendas-tabela", start, end, city],
    queryFn: async () => {
      const citySlug = city !== "all" ? city : null;
      const { data, error } = await supabase.rpc("buscar_vendas", {
        p_status: "aprovada",
        p_start: start,
        p_end: end,
        p_city_slug: citySlug,
      });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "aprovada": return "default";
      case "pendente": return "secondary";
      case "cancelada": return "destructive";
      default: return "outline";
    }
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
                }}
              />
              <Select value={city} onValueChange={setCity}>
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
              <span className="text-sm text-muted-foreground ml-auto">
                {vendas.length} venda{vendas.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Comprador</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cupom</TableHead>
                    <TableHead>Plataforma</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 10 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : vendas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        Nenhuma venda encontrada no período selecionado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    vendas.map((v) => (
                      <TableRow key={v.id}>
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
                        <TableCell className="text-right font-semibold whitespace-nowrap">
                          R$ {Number(v.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>{v.metodo_pagamento || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusColor(v.status)}>{v.status}</Badge>
                        </TableCell>
                        <TableCell>{v.cupom || "—"}</TableCell>
                        <TableCell>{v.plataforma}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default VendasEventos;
