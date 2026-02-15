import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import type { Cidade } from "@/hooks/useCidades";

interface ManageHiddenCidadesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cidades: Cidade[];
  onUpdated: () => void;
}

export function ManageHiddenCidadesDialog({
  open,
  onOpenChange,
  cidades,
  onUpdated,
}: ManageHiddenCidadesDialogProps) {
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const hiddenCidades = cidades.filter((c) => hiddenIds.includes(c.id));

  useEffect(() => {
    if (open) {
      setHiddenIds(getHiddenCidades());
    }
  }, [open]);

  const toggleCidade = (id: string, activate: boolean) => {
    const updated = activate
      ? hiddenIds.filter((hid) => hid !== id)
      : [...hiddenIds, id];
    setHiddenIds(updated);
    localStorage.setItem("hidden_cidades", JSON.stringify(updated));
    onUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Cidades Desativadas</DialogTitle>
        </DialogHeader>
        {hiddenCidades.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhuma cidade desativada no momento.
          </p>
        ) : (
          <div className="grid gap-3 py-4">
            {hiddenCidades.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-4 rounded-md border p-3"
              >
                <Label className="text-sm font-medium">{c.nome}</Label>
                <Switch
                  checked={false}
                  onCheckedChange={(checked) => toggleCidade(c.id, checked)}
                />
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
