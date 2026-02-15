import { useState, useEffect } from "react";
import { PlusCircle, Pencil } from "lucide-react";
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
import { AddCidadeDialog } from "@/components/AddCidadeDialog";
import { EditCidadeDialog } from "@/components/EditCidadeDialog";
import { useCidades, type Cidade } from "@/hooks/useCidades";
import { useQueryClient } from "@tanstack/react-query";

interface DashboardFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export function DashboardFilters({ filters, onFiltersChange }: DashboardFiltersProps) {
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [addCidadeOpen, setAddCidadeOpen] = useState(false);
  const [editCidade, setEditCidade] = useState<Cidade | null>(null);
  const queryClient = useQueryClient();

  const { data: cidades = [], isLoading: loadingCidades } = useCidades();

  const isMetaConnected = localStorage.getItem("meta_connected") === "true";

  useEffect(() => {
    if (!isMetaConnected) {
      setAdAccounts([]);
      return;
    }
    setLoadingAccounts(true);
    fetchAdAccounts()
      .then((accounts) => {
        setAdAccounts(accounts);
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

  const handleCityChange = (v: string) => {
    if (v === "_add_new") {
      setAddCidadeOpen(true);
      return;
    }
    update({ city: v });
  };

  return (
    <>
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
            ) : isTokenExpired() ? (
              <SelectItem value="_expired" disabled>Token expirado — reconecte nas Integrações</SelectItem>
            ) : (
              <SelectItem value="_empty" disabled>Nenhuma conta encontrada</SelectItem>
            )}
          </SelectContent>
        </Select>

        <Select value={filters.city} onValueChange={handleCityChange}>
          <SelectTrigger className="w-[180px] bg-card">
            <SelectValue placeholder="Cidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as cidades</SelectItem>
            {loadingCidades ? (
              <SelectItem value="_loading" disabled>Carregando...</SelectItem>
            ) : (
              cidades.map((c) => (
                <SelectItem key={c.id} value={c.slug}>
                  <span className="flex items-center justify-between w-full gap-2">
                    {c.nome}
                    <Pencil
                      className="h-3 w-3 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditCidade(c);
                      }}
                    />
                  </span>
                </SelectItem>
              ))
            )}
            <SelectItem value="_add_new">
              <span className="flex items-center gap-1.5">
                <PlusCircle className="h-3.5 w-3.5" />
                Cadastrar nova cidade
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AddCidadeDialog
        open={addCidadeOpen}
        onOpenChange={setAddCidadeOpen}
        onCidadeAdded={() => queryClient.invalidateQueries({ queryKey: ["cidades"] })}
      />

      <EditCidadeDialog
        open={!!editCidade}
        onOpenChange={(open) => { if (!open) setEditCidade(null); }}
        cidade={editCidade}
        onCidadeUpdated={() => queryClient.invalidateQueries({ queryKey: ["cidades"] })}
      />
    </>
  );
}
