import { useState, useEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import type { Filters } from "@/lib/mockData";
import { fetchAdAccounts, clearAdAccountsCache, type AdAccount, isTokenExpired, isGloballyRateLimited } from "@/lib/meta-ads";
import { DateRangePicker } from "@/components/DateRangePicker";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import { useCidades } from "@/hooks/useCidades";
import { useProdutos } from "@/hooks/useProdutos";

interface DashboardFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  hideCityFilter?: boolean;
  showProductFilter?: boolean;
}

export function DashboardFilters({ filters, onFiltersChange, hideCityFilter = false, showProductFilter = false }: DashboardFiltersProps) {
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const fetchingRef = useRef(false);

  const { data: cidades = [], isLoading: loadingCidades } = useCidades();
  const hiddenCidades = getHiddenCidades();
  const visibleCidades = cidades.filter((c) => !hiddenCidades.includes(c.id));

  const { data: produtos = [], isLoading: loadingProdutos } = useProdutos();
  const activeProdutos = produtos.filter((p) => p.ativo);

  const loadAccounts = () => {
    const connected = localStorage.getItem("meta_connected") === "true";
    const token = localStorage.getItem("meta_access_token");
    const expired = isTokenExpired();

    // Always clear rate limit on new attempt
    setRateLimited(false);

    console.log("[DashboardFilters] loadAccounts called:", { connected, hasToken: !!token, tokenLen: token?.length, expired, fetching: fetchingRef.current });

    if (!connected || !token || expired) {
      setAdAccounts([]);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    setLoadingAccounts(true);

    fetchAdAccounts()
      .then((accounts) => {
        console.log("[DashboardFilters] Fetched accounts:", accounts.length);
        setAdAccounts(accounts);
        setRateLimited(false);
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
        if (msg.toLowerCase().includes("too many calls") || msg.toLowerCase().includes("rate limit") || msg.includes("cooldown")) {
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

      {showProductFilter && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[240px] justify-between bg-card font-normal">
              <span className="truncate">
                {filters.produtos.length === 0
                  ? "Todos os produtos"
                  : filters.produtos.length === 1
                    ? activeProdutos.find((p) => p.slug === filters.produtos[0])?.nome || filters.produtos[0]
                    : `${filters.produtos.length} produtos`}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-2" align="start">
            {loadingProdutos ? (
              <p className="text-sm text-muted-foreground p-2">Carregando...</p>
            ) : activeProdutos.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">Nenhum produto ativo</p>
            ) : (
              <div className="space-y-1">
                <label
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent font-medium"
                >
                  <Checkbox
                    checked={filters.produtos.length === 0}
                    onCheckedChange={() => {
                      update({ produtos: [] });
                    }}
                  />
                  Todos os produtos
                </label>
                <div className="border-t border-border my-1" />
                {activeProdutos.map((p) => {
                  const checked = filters.produtos.includes(p.slug);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          const next = checked
                            ? filters.produtos.filter((s) => s !== p.slug)
                            : [...filters.produtos, p.slug];
                          update({ produtos: next });
                        }}
                      />
                      {p.nome}
                    </label>
                  );
                })}
                {filters.produtos.length > 0 && (
                  <>
                    <div className="border-t border-border my-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted-foreground"
                      onClick={() => update({ produtos: [] })}
                    >
                      Limpar filtro
                    </Button>
                  </>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}

      {!hideCityFilter && (
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
      )}
    </div>
  );
}
