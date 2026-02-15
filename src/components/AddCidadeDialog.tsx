import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, removeAccents } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddCidadeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCidadeAdded: () => void;
}

export function AddCidadeDialog({ open, onOpenChange, onCidadeAdded }: AddCidadeDialogProps) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [dataEvento, setDataEvento] = useState<Date>();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim() || !slug.trim() || !dataEvento) {
      toast.error("Preencha todos os campos");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("cidades").insert({
        nome: nome.trim(),
        slug: removeAccents(slug.trim().toLowerCase()),
        data_evento: dataEvento.toISOString(),
      });

      if (error) throw error;

      toast.success("Cidade cadastrada com sucesso!");
      setNome("");
      setSlug("");
      setDataEvento(undefined);
      onOpenChange(false);
      onCidadeAdded();
    } catch (err: any) {
      toast.error(err.message || "Erro ao cadastrar cidade");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Cadastrar Nova Cidade</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="nome">Nome da Cidade</Label>
            <Input
              id="nome"
              placeholder="Ex: Recife"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="slug">Slug da Cidade</Label>
            <Input
              id="slug"
              placeholder="Ex: recife (usado para filtrar campanhas)"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A slug será usada para filtrar campanhas no Meta Ads pelo nome.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Data do Evento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dataEvento && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dataEvento ? format(dataEvento, "dd/MM/yyyy") : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dataEvento}
                  onSelect={setDataEvento}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
