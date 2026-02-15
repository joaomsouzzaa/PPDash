import { useState, useEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Filters } from "@/lib/mockData";
import { fetchAdAccounts, clearAdAccountsCache, type AdAccount, isTokenExpired } from "@/lib/meta-ads";
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
  const fetchingRef = useRef(false);

  const { data: cidades = [], isLoading: loadingCidades } = useCidades();
  const hiddenCidades = getHiddenCidades();
  const visibleCidades = cidades.filter((c) => !hiddenCidades.includes(c.id));

  const loadAccounts = () => {
    const connected = localStorage.getItem("meta_connected") === "true";
    const token = localStorage.getItem("meta_access_token");
    const expired = isTokenExpired();

    console.log("[DashboardFilters] loadAccounts called:", { connected, hasToken: !!token, tokenLen: token?.length, expired, fetching: fetchingRef.current });

    if (!connected || !token || expired) {
      setAdAccounts([]);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    setLoadingAccounts(true);
    setRateLimited(false);

    fetchAdAccounts()
      .then((accounts) => {
        console.log("[DashboardFilters] Fetched accounts:", accounts.length);
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
        console.error("[DashboardFilters] Fetch error:", msg);
        if (msg.toLowerCase().includes("too many calls") || msg.includes("rate")) {
          setRateLimited(true);
        }
        setAdAccounts([]);
      })
      .finally(() => {
        fetchingRef.current = false;
        setLoadingAccounts(false);
      });
  };

  // Fetch on mount
  useEffect(() => {
    loadAccounts();
  }, []);

  // Re-fetch when returning to tab
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("[DashboardFilters] Tab visible, re-checking...");
        loadAccounts();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

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
