import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Filters } from "@/lib/mockData";
import { fetchAdAccounts, isTokenValid, type AdAccount } from "@/lib/meta-ads";
import { DateRangePicker } from "@/components/DateRangePicker";

interface DashboardFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export function DashboardFilters({ filters, onFiltersChange }: DashboardFiltersProps) {
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const isMetaConnected = localStorage.getItem("meta_connected") === "true" && isTokenValid();

  useEffect(() => {
    if (!isMetaConnected) {
      setAdAccounts([]);
      return;
    }
    setLoadingAccounts(true);
    fetchAdAccounts()
      .then((accounts) => {
        setAdAccounts(accounts);
        // If saved account doesn't exist in fetched list, reset to "all"
        if (
          filters.adAccount !== "all" &&
          !accounts.some((a) => a.id === filters.adAccount)
        ) {
          onFiltersChange({ ...filters, adAccount: "all" });
        }
      })
      .catch(() => setAdAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [isMetaConnected]);

  const update = (partial: Partial<Filters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <DateRangePicker
        preset={filters.dateRange}
        startDate={filters.startDate}
        endDate={filters.endDate}
        onApply={(preset, start, end) =>
          update({ dateRange: preset, startDate: start, endDate: end })
        }
      />

      <Select value={filters.adAccount} onValueChange={(v) => update({ adAccount: v })}>
        <SelectTrigger className="w-[240px] bg-card">
          <SelectValue placeholder={loadingAccounts ? "Carregando contas..." : "Conta de Anúncios"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as contas</SelectItem>
          {loadingAccounts ? (
            <SelectItem value="_loading" disabled>Carregando contas...</SelectItem>
          ) : adAccounts.length > 0 ? (
            adAccounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.name || `Conta ${acc.account_id}`}
              </SelectItem>
            ))
          ) : !isMetaConnected ? (
            <SelectItem value="_none" disabled>Conecte o Meta Ads primeiro</SelectItem>
          ) : (
            <SelectItem value="_empty" disabled>Nenhuma conta encontrada</SelectItem>
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
