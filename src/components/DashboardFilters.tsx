import { useState, useEffect, useRef, useCallback } from "react";
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
  const [rateLimited, setRateLimited] = useState(false);
  const lastTokenRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);

  const { data: cidades = [], isLoading: loadingCidades } = useCidades();
  const hiddenCidades = getHiddenCidades();
  const visibleCidades = cidades.filter((c) => !hiddenCidades.includes(c.id));

  const doFetch = useCallback(() => {
    const connected = localStorage.getItem("meta_connected") === "true";
    const token = localStorage.getItem("meta_access_token");
    const expired = isTokenExpired();

    if (!connected || !token || expired) {
      setAdAccounts([]);
      return;
    }

    // Skip if already fetched with the same token
    if (lastTokenRef.current === token || fetchingRef.current) return;
    fetchingRef.current = true;

    setLoadingAccounts(true);
    setRateLimited(false);

    fetchAdAccounts()
      .then((accounts) => {
        lastTokenRef.current = token;
        setAdAccounts(accounts);
        if (
          filters.adAccount !== "all" &&
          !accounts.some((a) => a.id === filters.adAccount)
        ) {
          onFiltersChange({ ...filters, adAccount: "all" });
        }
      })
      .catch((err) => {
        const msg = err?.message || "";
        if (msg.toLowerCase().includes("too many calls") || msg.includes("rate")) {
          setRateLimited(true);
        } else {
          console.warn("[DashboardFilters] Error fetching accounts:", msg);
        }
        setAdAccounts([]);
      })
      .finally(() => {
        fetchingRef.current = false;
        setLoadingAccounts(false);
      });
  }, [filters, onFiltersChange]);

  // Fetch on mount
  useEffect(() => {
    doFetch();
  }, [doFetch]);

  // Re-fetch when user navigates back to this tab (e.g. after reconnecting on Integracoes)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") doFetch();
    };
    const onFocus = () => doFetch();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [doFetch]);

  const update = (partial: Partial<Filters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const isMetaConnected = localStorage.getItem("meta_connected") === "true";

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
          ) : rateLimited ? (
            <SelectItem value="_rate" disabled>Limite de requisições — aguarde alguns minutos</SelectItem>
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
