import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCidades, type Cidade } from "@/hooks/useCidades";
import { getHiddenCidades } from "@/components/EditCidadeDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const CadastroCidades = () => {
  const { data: cidades = [], isLoading } = useCidades();
  const queryClient = useQueryClient();
  const [hiddenCidades, setHiddenCidades] = useState<string[]>(getHiddenCidades());

  const [addOpen, setAddOpen] = useState(false);
  const [editingCidade, setEditingCidade] = useState<Cidade | null>(null);
  const [deletingCidade, setDeletingCidade] = useState<Cidade | null>(null);
  const [form, setForm] = useState({ nome: "", slug: "", data_evento: "" });

  const openAdd = () => {
    setForm({ nome: "", slug: "", data_evento: "" });
    setAddOpen(true);
  };

  const openEdit = (c: Cidade) => {
    setEditingCidade(c);
    setForm({
      nome: c.nome,
      slug: c.slug,
      data_evento: new Date(c.data_evento).toISOString().slice(0, 16),
    });
  };

  // Slug é preenchido manualmente (deve casar com o nome da campanha no Meta)
  const handleNomeChange = (nome: string) => {
    setForm((f) => ({ ...f, nome }));
  };

  const handleSlugChange = (slug: string) => {
    setForm((f) => ({ ...f, slug }));
  };

  const handleAdd = async () => {
    if (!form.nome || !form.slug || !form.data_evento) {
      toast.error("Preencha todos os campos");
      return;
    }
    const { error } = await supabase.from("cidades").insert({
      nome: form.nome,
      slug: form.slug.trim(),
      data_evento: new Date(form.data_evento).toISOString(),
    });
    if (error) {
      toast.error("Erro ao cadastrar cidade");
      return;
    }
    toast.success("Cidade cadastrada com sucesso");
    setAddOpen(false);
    queryClient.invalidateQueries({ queryKey: ["cidades"] });
  };

  const handleEdit = async () => {
    if (!editingCidade || !form.nome || !form.slug || !form.data_evento) return;
    const { error } = await supabase
      .from("cidades")
      .update({
        nome: form.nome,
        slug: form.slug.trim(),
        data_evento: new Date(form.data_evento).toISOString(),
      })
      .eq("id", editingCidade.id);
    if (error) {
      toast.error("Erro ao atualizar cidade");
      return;
    }
    toast.success("Cidade atualizada com sucesso");
    setEditingCidade(null);
    queryClient.invalidateQueries({ queryKey: ["cidades"] });
  };

  const handleDelete = async () => {
    if (!deletingCidade) return;
    const { error } = await supabase
      .from("cidades")
      .delete()
      .eq("id", deletingCidade.id);
    if (error) {
      toast.error("Erro ao excluir cidade");
      return;
    }
    toast.success("Cidade excluída com sucesso");
    setDeletingCidade(null);
    queryClient.invalidateQueries({ queryKey: ["cidades"] });
  };

  const toggleHidden = (cidade: Cidade) => {
    const isHidden = hiddenCidades.includes(cidade.id);
    const updated = isHidden
      ? hiddenCidades.filter((id: string) => id !== cidade.id)
      : [...hiddenCidades, cidade.id];
    localStorage.setItem("hidden_cidades", JSON.stringify(updated));
    setHiddenCidades(updated);
    toast.success(isHidden ? `${cidade.nome} reativada` : `${cidade.nome} desativada`);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight">Cadastro de Cidades</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie as cidades dos seus eventos
              </p>
            </div>
            <Button onClick={openAdd} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nova Cidade
            </Button>
          </header>

          <div className="p-6">
            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Data do Evento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : cidades.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma cidade cadastrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    cidades.map((c) => {
                      const isExpired = new Date(c.data_evento) < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                      const isHidden = hiddenCidades.includes(c.id) || isExpired;
                      return (
                        <TableRow key={c.id} className={isHidden ? "opacity-50" : ""}>
                          <TableCell className="font-medium">{c.nome}</TableCell>
                          <TableCell className="text-muted-foreground">{c.slug}</TableCell>
                          <TableCell>
                            {new Date(c.data_evento).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </TableCell>
                          <TableCell>
                          <div className="flex items-center gap-2">
                              <Switch
                                checked={!isHidden}
                                onCheckedChange={() => toggleHidden(c)}
                                disabled={isExpired}
                              />
                              <span className="text-sm text-muted-foreground">
                                {isExpired ? "Expirada" : isHidden ? "Desativada" : "Ativa"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEdit(c)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => setDeletingCidade(c)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </main>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Cidade</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome da Cidade</Label>
              <Input
                value={form.nome}
                onChange={(e) => handleNomeChange(e.target.value)}
                placeholder="Ex: São Paulo"
              />
            </div>
            <div className="space-y-1">
              <Label>Slug da Cidade</Label>
              <Input
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="Ex: Belém"
              />
              <p className="text-xs text-muted-foreground">
                Deve bater com o trecho da cidade no nome da campanha do Meta (ex.: <strong>Belém</strong>). Pode usar vários separados por vírgula (ex.: <strong>Porto Alegre, POA</strong>) — casa se qualquer um aparecer. Também casa as vendas pela cidade.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Data do Evento</Label>
              <Input
                type="datetime-local"
                value={form.data_evento}
                onChange={(e) => setForm({ ...form, data_evento: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Cadastrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingCidade} onOpenChange={(open) => !open && setEditingCidade(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cidade</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome da Cidade</Label>
              <Input
                value={form.nome}
                onChange={(e) => handleNomeChange(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Slug da Cidade</Label>
              <Input
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="Ex: Belém"
              />
              <p className="text-xs text-muted-foreground">
                Deve bater com o trecho da cidade no nome da campanha do Meta (ex.: <strong>Belém</strong>). Pode usar vários separados por vírgula (ex.: <strong>Porto Alegre, POA</strong>) — casa se qualquer um aparecer. Também casa as vendas pela cidade.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Data do Evento</Label>
              <Input
                type="datetime-local"
                value={form.data_evento}
                onChange={(e) => setForm({ ...form, data_evento: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCidade(null)}>Cancelar</Button>
            <Button onClick={handleEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingCidade} onOpenChange={(open) => !open && setDeletingCidade(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cidade?</AlertDialogTitle>
            <AlertDialogDescription>
              A cidade <strong>{deletingCidade?.nome}</strong> será removida permanentemente. Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default CadastroCidades;
