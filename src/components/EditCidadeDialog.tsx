import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Cidade } from "@/hooks/useCidades";

export function getHiddenCidades(): string[] {
  try {
    return JSON.parse(localStorage.getItem("hidden_cidades") || "[]");
  } catch {
    return [];
  }
}

function setHiddenCidades(ids: string[]) {
  localStorage.setItem("hidden_cidades", JSON.stringify(ids));
}

interface EditCidadeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cidade: Cidade | null;
  onCidadeUpdated: () => void;
}

export function EditCidadeDialog({ open, onOpenChange, cidade, onCidadeUpdated }: EditCidadeDialogProps) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [dataEvento, setDataEvento] = useState<Date>();
  const [saving, setSaving] = useState(false);
  const [ativa, setAtiva] = useState(true);

  useEffect(() => {
    if (cidade) {
      setNome(cidade.nome);
      setSlug(cidade.slug);
      setDataEvento(new Date(cidade.data_evento));
      const hidden = getHiddenCidades();
      setAtiva(!hidden.includes(cidade.id));
    }
  }, [cidade]);

  const handleSave = async () => {
    if (!cidade || !nome.trim() || !slug.trim() || !dataEvento) {
      toast.error("Preencha todos os campos");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("cidades")
        .update({
          nome: nome.trim(),
          slug: slug.trim().toLowerCase(),
          data_evento: dataEvento.toISOString(),
        })
        .eq("id", cidade.id);

      if (error) throw error;

      // Update visibility in localStorage
      const hidden = getHiddenCidades();
      if (cidade) {
        if (ativa) {
          setHiddenCidades(hidden.filter((id) => id !== cidade.id));
        } else if (!hidden.includes(cidade.id)) {
          setHiddenCidades([...hidden, cidade.id]);
        }
      }

      toast.success("Cidade atualizada com sucesso!");
      onOpenChange(false);
      onCidadeUpdated();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar cidade");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Cidade</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-nome">Nome da Cidade</Label>
            <Input
              id="edit-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-slug">Slug da Cidade</Label>
            <Input
              id="edit-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A slug será usada para filtrar campanhas no Meta Ads pelo nome.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="edit-ativa" className="text-sm font-medium">Exibir no filtro</Label>
              <p className="text-xs text-muted-foreground">Mostrar esta cidade na lista de filtros</p>
            </div>
            <Switch id="edit-ativa" checked={ativa} onCheckedChange={setAtiva} />
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
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
