import { useState, useEffect } from "react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useProdutos, type Produto } from "@/hooks/useProdutos";
import { useDistinctUtmSources } from "@/hooks/useDistinctUtmSources";
import { MultiSelectCombobox } from "@/components/MultiSelectCombobox";
import { fetchAdAccounts, fetchCampaignNames, hydrateMetaTokenFromServer, type AdAccount } from "@/lib/meta-ads";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

// Converte string vírgula-separada <-> array (para os seletores múltiplos).
function splitCsv(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

const CadastroProdutos = () => {
  const { data: canais = [], isLoading } = useProdutos();
  const { data: sourceOptions = [] } = useDistinctUtmSources();
  const queryClient = useQueryClient();

  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  useEffect(() => {
    (async () => {
      await hydrateMetaTokenFromServer();
      try { setAdAccounts(await fetchAdAccounts()); } catch { /* sem conexão */ }
    })();
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [deleting, setDeleting] = useState<Produto | null>(null);
  const [form, setForm] = useState({ nome: "", slug: "", slug_source: "", conta_id: "" });

  // Campanhas do Meta para a conta selecionada (ou todas as contas, se vazio).
  const [campaignOptions, setCampaignOptions] = useState<string[]>([]);
  const formOpen = addOpen || !!editing;
  useEffect(() => {
    if (!formOpen) return;
    let cancelled = false;
    (async () => {
      const ids = form.conta_id ? [form.conta_id] : adAccounts.map((a) => a.id);
      if (ids.length === 0) { setCampaignOptions([]); return; }
      try {
        const names = await fetchCampaignNames(ids);
        if (!cancelled) setCampaignOptions(names);
      } catch { if (!cancelled) setCampaignOptions([]); }
    })();
    return () => { cancelled = true; };
  }, [formOpen, form.conta_id, adAccounts]);

  // Reconcilia valores salvos com as opções reais: converte para a grafia
  // canônica (case-insensitive) e remove duplicados. Cura valores legados
  // (ex.: "instagramfeed" -> "Instagram_Feed") que quebravam o filtro de leads.
  // Chave "frouxa": ignora caixa, acentos e separadores (_ . - espaço) para
  // casar valores legados (ex.: "instagramfeed") com a opção real ("Instagram_Feed").
  const looseKey = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const reconcile = (csv: string, options: string[]): string => {
    const byKey = new Map(options.map((o) => [looseKey(o), o]));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of splitCsv(csv)) {
      const key = looseKey(v);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(byKey.get(key) ?? v);
    }
    return out.join(",");
  };
  useEffect(() => {
    if (!formOpen) return;
    setForm((f) => {
      const slug = campaignOptions.length ? reconcile(f.slug, campaignOptions) : f.slug;
      const slug_source = sourceOptions.length ? reconcile(f.slug_source, sourceOptions) : f.slug_source;
      if (slug === f.slug && slug_source === f.slug_source) return f;
      return { ...f, slug, slug_source };
    });
  }, [formOpen, campaignOptions, sourceOptions]);

  const openAdd = () => {
    setForm({ nome: "", slug: "", slug_source: "", conta_id: "" });
    setAddOpen(true);
  };

  const openEdit = (c: Produto) => {
    setEditing(c);
    setForm({ nome: c.nome, slug: c.slug, slug_source: c.slug_source ?? "", conta_id: c.conta_id ?? "" });
  };

  const payload = () => ({
    nome: form.nome,
    // UTM Campaign: nomes reais das campanhas do Meta — NÃO normalizar (precisa
    // casar literalmente, via includes, com o campaign_name).
    slug: splitCsv(form.slug).join(","),
    // UTM Source: valores vêm dos utm_source reais dos leads — NÃO normalizar
    // (normalizeSlug removeria "_" e quebraria o match em useLeadsData, que já
    // faz a comparação case-insensitive via includes).
    slug_source: splitCsv(form.slug_source).join(",") || null,
    conta_id: form.conta_id || null,
  });

  const handleAdd = async () => {
    if (!form.nome) {
      toast.error("Informe o nome do canal");
      return;
    }
    const { error } = await (supabase as any).from("produtos").insert(payload());
    if (error) {
      toast.error("Erro ao cadastrar canal");
      return;
    }
    toast.success("Canal cadastrado com sucesso");
    setAddOpen(false);
    queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  const handleEdit = async () => {
    if (!editing || !form.nome) return;
    const { error } = await (supabase as any)
      .from("produtos")
      .update(payload())
      .eq("id", editing.id);
    if (error) {
      toast.error("Erro ao atualizar canal");
      return;
    }
    toast.success("Canal atualizado com sucesso");
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("produtos").delete().eq("id", deleting.id);
    if (error) {
      toast.error("Erro ao excluir canal");
      return;
    }
    toast.success("Canal excluído com sucesso");
    setDeleting(null);
    queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  const toggleAtivo = async (c: Produto) => {
    const { error } = await supabase.from("produtos").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) {
      toast.error("Erro ao alterar status");
      return;
    }
    toast.success(c.ativo ? `${c.nome} desativado` : `${c.nome} ativado`);
    queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  const nomeConta = (id: string | null) =>
    id ? (adAccounts.find((a) => a.id === id)?.name || id) : "Todas as contas";

  const formFields = (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Nome do Canal</Label>
        <Input
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          placeholder="Ex: Meta ADS"
        />
      </div>
      <div className="space-y-1">
        <Label>Conta de Anúncios (de onde vem o investimento)</Label>
        <Select value={form.conta_id || "all"} onValueChange={(v) => setForm({ ...form, conta_id: v === "all" ? "" : v })}>
          <SelectTrigger>
            <SelectValue placeholder="Todas as contas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as contas</SelectItem>
            {adAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name || a.account_id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>UTM Campaign (nome da campanha — filtra o investimento)</Label>
        <MultiSelectCombobox
          options={campaignOptions}
          selected={splitCsv(form.slug)}
          onChange={(values) => setForm({ ...form, slug: values.join(",") })}
          placeholder="Todas as campanhas da conta"
          allowCustom
          emptyText="Nenhuma campanha encontrada (Meta desconectado?)."
        />
      </div>
      <div className="space-y-1">
        <Label>UTM Source (filtra os leads)</Label>
        <MultiSelectCombobox
          options={sourceOptions}
          selected={splitCsv(form.slug_source)}
          onChange={(values) => setForm({ ...form, slug_source: values.join(",") })}
          placeholder="Todos os leads"
          allowCustom
          emptyText="Nenhum utm_source encontrado nos leads."
        />
      </div>
    </div>
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight">Canais de Aquisição</h1>
              <p className="text-sm text-muted-foreground">
                Cada canal vira um botão no Dashboard Geral e filtra investimento e leads automaticamente
              </p>
            </div>
            <Button onClick={openAdd} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Canal
            </Button>
          </header>

          <div className="p-6">
            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>UTM Campaign</TableHead>
                    <TableHead>UTM Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : canais.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhum canal cadastrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    canais.map((c) => (
                      <TableRow key={c.id} className={!c.ativo ? "opacity-50" : ""}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{nomeConta(c.conta_id)}</TableCell>
                        <TableCell className="text-muted-foreground">{c.slug || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{c.slug_source || "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch checked={c.ativo} onCheckedChange={() => toggleAtivo(c)} />
                            <span className="text-sm text-muted-foreground">
                              {c.ativo ? "Ativo" : "Desativado"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting(c)}>
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
            <DialogTitle>Novo Canal de Aquisição</DialogTitle>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Cadastrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Canal de Aquisição</DialogTitle>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir canal?</AlertDialogTitle>
            <AlertDialogDescription>
              O canal <strong>{deleting?.nome}</strong> será removido permanentemente. Esta ação é irreversível.
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
