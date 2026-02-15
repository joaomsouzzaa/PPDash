import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Filters } from "@/lib/mockData";
import { fetchAdAccounts, type AdAccount, isTokenExpired } from "@/lib/meta-ads";
import { DateRangePicker } from "@/components/DateRangePicker";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import { useCidades } from "@/hooks/useCidades";

interface DashboardFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export function DashboardFilters({ filters, onFiltersChange }: DashboardFiltersProps) {
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const { data: cidades = [], isLoading: loadingCidades } = useCidades();
  const hiddenCidades = getHiddenCidades();
  const visibleCidades = cidades.filter((c) => !hiddenCidades.includes(c.id));

  // Re-check meta connection status on every render to pick up changes from Integracoes page
  const isMetaConnected = localStorage.getItem("meta_connected") === "true";
  const hasToken = !!localStorage.getItem("meta_access_token");
  const [refreshKey, setRefreshKey] = useState(0);

  // Listen for storage changes (from other tabs) and visibility changes (same tab navigation)
  useEffect(() => {
    const onStorage = () => setRefreshKey((k) => k + 1);
    const onVisibility = () => {
      if (document.visibilityState === "visible") setRefreshKey((k) => k + 1);
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const connected = localStorage.getItem("meta_connected") === "true";
    const token = localStorage.getItem("meta_access_token");
    const expired = isTokenExpired();
    
    console.log("[DashboardFilters] Meta check:", { connected, hasToken: !!token, tokenLength: token?.length, expired, refreshKey });

    if (!connected || !token) {
      console.log("[DashboardFilters] Skipping fetch - not connected or no token");
      setAdAccounts([]);
      return;
    }
    if (expired) {
      console.log("[DashboardFilters] Skipping fetch - token expired");
      setAdAccounts([]);
      return;
    }
    setLoadingAccounts(true);
    console.log("[DashboardFilters] Fetching ad accounts...");
    fetchAdAccounts()
      .then((accounts) => {
        console.log("[DashboardFilters] Accounts fetched:", accounts.length, accounts.map(a => a.name));
        setAdAccounts(accounts);
        if (
          filters.adAccount !== "all" &&
          !accounts.some((a) => a.id === filters.adAccount)
        ) {
          onFiltersChange({ ...filters, adAccount: "all" });
        }
      })
      .catch((err) => {
        console.error("[DashboardFilters] Error fetching accounts:", err?.message);
        setAdAccounts([]);
      })
      .finally(() => setLoadingAccounts(false));
  }, [isMetaConnected, hasToken, refreshKey]);

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
          ) : isTokenExpired() || !localStorage.getItem("meta_access_token") ? (
            <SelectItem value="_expired" disabled>Token expirado — reconecte nas Integrações</SelectItem>
          ) : (
            <SelectItem value="_empty" disabled>Nenhuma conta encontrada</SelectItem>
          )}
        </SelectContent>
      </Select>

      <Select value={filters.city} onValueChange={(v) => update({ city: v })}>
        <SelectTrigger className="w-[240px] bg-card">
          <SelectValue placeholder="Cidade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as cidades</SelectItem>
          {loadingCidades ? (
            <SelectItem value="_loading" disabled>Carregando...</SelectItem>
          ) : (
            visibleCidades.map((c) => (
              <SelectItem key={c.id} value={c.slug}>
                {c.nome}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
