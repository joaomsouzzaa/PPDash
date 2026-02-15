import { useState, useEffect } from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Filters } from "@/lib/mockData";
import { fetchAdAccounts, type AdAccount } from "@/lib/meta-ads";

interface DashboardFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export function DashboardFilters({ filters, onFiltersChange }: DashboardFiltersProps) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const isMetaConnected = localStorage.getItem("meta_connected") === "true";

  useEffect(() => {
    if (!isMetaConnected) {
      setAdAccounts([]);
      return;
    }
    setLoadingAccounts(true);
    fetchAdAccounts()
      .then((accounts) => setAdAccounts(accounts))
      .catch(() => setAdAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [isMetaConnected]);

  const update = (partial: Partial<Filters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={filters.dateRange} onValueChange={(v) => update({ dateRange: v })}>
        <SelectTrigger className="w-[160px] bg-card">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">Últimos 7 dias</SelectItem>
          <SelectItem value="30d">Últimos 30 dias</SelectItem>
          <SelectItem value="this_month">Este mês</SelectItem>
          <SelectItem value="last_month">Mês passado</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {filters.dateRange === "custom" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[200px] justify-start text-left font-normal bg-card",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, "dd/MM/yyyy", { locale: pt }) : "Selecionar data"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      )}

      <Select value={filters.adAccount} onValueChange={(v) => update({ adAccount: v })}>
        <SelectTrigger className="w-[240px] bg-card">
          <SelectValue placeholder={loadingAccounts ? "Carregando contas..." : "Conta de Anúncios"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as contas</SelectItem>
          {adAccounts.length > 0 ? (
            adAccounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.name || `Conta ${acc.account_id}`}
              </SelectItem>
            ))
          ) : (
            !loadingAccounts && !isMetaConnected && (
              <>
                <SelectItem value="acc1">Meta Ads - Conta 1</SelectItem>
                <SelectItem value="acc2">Meta Ads - Conta 2</SelectItem>
              </>
            )
          )}
        </SelectContent>
      </Select>

      <Select value={filters.city} onValueChange={(v) => update({ city: v })}>
        <SelectTrigger className="w-[180px] bg-card">
          <SelectValue placeholder="Cidade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as cidades</SelectItem>
          <SelectItem value="sp">São Paulo</SelectItem>
          <SelectItem value="rj">Rio de Janeiro</SelectItem>
          <SelectItem value="bh">Belo Horizonte</SelectItem>
          <SelectItem value="ctb">Curitiba</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
