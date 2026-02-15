import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useProdutos, type Produto } from "@/hooks/useProdutos";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

function normalizeSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

const CadastroProdutos = () => {
  const { data: produtos = [], isLoading } = useProdutos();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null);
  const [deletingProduto, setDeletingProduto] = useState<Produto | null>(null);
  const [form, setForm] = useState({ nome: "", slug: "" });

  const openAdd = () => {
    setForm({ nome: "", slug: "" });
    setAddOpen(true);
  };

  const openEdit = (p: Produto) => {
    setEditingProduto(p);
    setForm({ nome: p.nome, slug: p.slug });
  };

  const handleAdd = async () => {
    if (!form.nome || !form.slug) {
      toast.error("Preencha todos os campos");
      return;
    }
    const { error } = await supabase.from("produtos").insert({
      nome: form.nome,
      slug: normalizeSlug(form.slug),
    });
    if (error) {
      toast.error("Erro ao cadastrar produto");
      return;
    }
    toast.success("Produto cadastrado com sucesso");
    setAddOpen(false);
    queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  const handleEdit = async () => {
    if (!editingProduto || !form.nome || !form.slug) return;
    const { error } = await supabase
      .from("produtos")
      .update({ nome: form.nome, slug: normalizeSlug(form.slug) })
      .eq("id", editingProduto.id);
    if (error) {
      toast.error("Erro ao atualizar produto");
      return;
    }
    toast.success("Produto atualizado com sucesso");
    setEditingProduto(null);
    queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  const handleDelete = async () => {
    if (!deletingProduto) return;
    const { error } = await supabase
      .from("produtos")
      .delete()
      .eq("id", deletingProduto.id);
    if (error) {
      toast.error("Erro ao excluir produto");
      return;
    }
    toast.success("Produto excluído com sucesso");
    setDeletingProduto(null);
    queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  const toggleAtivo = async (produto: Produto) => {
    const { error } = await supabase
      .from("produtos")
      .update({ ativo: !produto.ativo })
      .eq("id", produto.id);
    if (error) {
      toast.error("Erro ao alterar status");
      return;
    }
    toast.success(produto.ativo ? `${produto.nome} desativado` : `${produto.nome} ativado`);
    queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight">Cadastro de Produtos</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie os produtos do Inside Sales
              </p>
            </div>
            <Button onClick={openAdd} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Produto
            </Button>
          </header>

          <div className="p-6">
            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Slug (UTM Medium)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : produtos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhum produto cadastrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    produtos.map((p) => (
                      <TableRow key={p.id} className={!p.ativo ? "opacity-50" : ""}>
                        <TableCell className="font-medium">{p.nome}</TableCell>
                        <TableCell className="text-muted-foreground">{p.slug}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={p.ativo}
                              onCheckedChange={() => toggleAtivo(p)}
                            />
                            <span className="text-sm text-muted-foreground">
                              {p.ativo ? "Ativo" : "Desativado"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingProduto(p)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
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
            <DialogTitle>Novo Produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome do Produto</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Curso de Marketing"
              />
            </div>
            <div className="space-y-1">
              <Label>Slug (termo para filtrar UTM Medium)</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="Ex: curso-marketing"
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
      <Dialog open={!!editingProduto} onOpenChange={(open) => !open && setEditingProduto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome do Produto</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Slug (termo para filtrar UTM Medium)</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProduto(null)}>Cancelar</Button>
            <Button onClick={handleEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingProduto} onOpenChange={(open) => !open && setDeletingProduto(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto <strong>{deletingProduto?.nome}</strong> será removido permanentemente. Esta ação é irreversível.
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

export default CadastroProdutos;
