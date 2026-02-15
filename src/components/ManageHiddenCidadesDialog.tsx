import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import { EditCidadeDialog } from "@/components/EditCidadeDialog";
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
  const [editCidade, setEditCidade] = useState<Cidade | null>(null);

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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Cidades Desativadas</DialogTitle>
          </DialogHeader>
          {hiddenCidades.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhuma cidade desativada no momento.
            </p>
          ) : (
            <Table>
              <TableHeader>
              <TableRow>
                  <TableHead>Editar</TableHead>
                  <TableHead>Nome da Cidade</TableHead>
                  <TableHead>Data do Evento</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Ativar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hiddenCidades.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span
                        role="button"
                        className="inline-flex items-center justify-center rounded p-0.5 hover:bg-muted cursor-pointer"
                        onClick={() => setEditCidade(c)}
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </span>
                    </TableCell>
                    <TableCell>{c.nome}</TableCell>
                    <TableCell>
                      {format(new Date(c.data_evento), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.slug}</TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={false}
                        onCheckedChange={(checked) => toggleCidade(c.id, checked)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <EditCidadeDialog
        open={!!editCidade}
        onOpenChange={(o) => { if (!o) setEditCidade(null); }}
        cidade={editCidade}
        onCidadeUpdated={onUpdated}
      />
    </>
  );
}
