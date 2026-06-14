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
import { Checkbox } from "@/components/ui/checkbox";
import { DASHBOARD_METRICS, ALL_METRIC_KEYS } from "@/lib/dashboardMetrics";
import { useProdutos, type Produto } from "@/hooks/useProdutos";
import { useDistinctUtmSources } from "@/hooks/useDistinctUtmSources";
import { MultiSelectCombobox } from "@/components/MultiSelectCombobox";
import { fetchAdAccounts, fetchCampaignNames, hydrateMetaTokenFromServer, type AdAccount } from "@/lib/meta-ads";
import { fetchGoogleAdAccounts, type GoogleAdAccount } from "@/lib/google-ads";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

// Páginas onde o botão do canal pode aparecer.
const PAGINAS: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "performance", label: "Performance" },
  { key: "campanhas", label: "Campanhas" },
];

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
  const [form, setForm] = useState({ nome: "", slug: "", slug_source: "", conta_id: "", plataforma: "meta", google_conta_id: "", investimento_manual: "" });
  // Métricas visíveis no dash para o canal (null/[] tratados como "todas").
  const [metricas, setMetricas] = useState<string[] | null>(null);
  // Páginas onde o botão do canal aparece (null = todas).
  const [paginas, setPaginas] = useState<string[] | null>(null);

  // Contas do Google Ads (carregadas sob demanda quando a plataforma é Google).
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAdAccount[]>([]);
  const [googleErro, setGoogleErro] = useState<string | null>(null);

  // Campanhas do Meta para a conta selecionada (ou todas as contas, se vazio).
  const [campaignOptions, setCampaignOptions] = useState<string[]>([]);
  const formOpen = addOpen || !!editing;
  useEffect(() => {
    if (!formOpen || form.plataforma !== "meta") { setCampaignOptions([]); return; }
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
  }, [formOpen, form.conta_id, form.plataforma, adAccounts]);

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
    setForm({ nome: "", slug: "", slug_source: "", conta_id: "", plataforma: "meta", google_conta_id: "", investimento_manual: "" });
    setMetricas(null);
    setPaginas(null);
    setAddOpen(true);
  };

  const openEdit = (c: Produto) => {
    setEditing(c);
    setForm({ nome: c.nome, slug: c.slug, slug_source: c.slug_source ?? "", conta_id: c.conta_id ?? "", plataforma: c.plataforma ?? "meta", google_conta_id: c.google_conta_id ?? "", investimento_manual: c.investimento_manual != null ? String(c.investimento_manual) : "" });
    setMetricas(Array.isArray(c.metricas) ? c.metricas : null);
    setPaginas(Array.isArray(c.paginas) ? c.paginas : null);
  };

  // Carrega as contas do Google quando a plataforma é Google.
  useEffect(() => {
    if (!formOpen || form.plataforma !== "google") return;
    let cancelled = false;
    setGoogleErro(null);
    (async () => {
      try {
        const accs = await fetchGoogleAdAccounts();
        if (!cancelled) setGoogleAccounts(accs);
      } catch (e) {
        if (!cancelled) { setGoogleAccounts([]); setGoogleErro((e as Error).message); }
      }
    })();
    return () => { cancelled = true; };
  }, [formOpen, form.plataforma]);

  const payload = () => ({
    nome: form.nome,
    plataforma: form.plataforma,
    // UTM Campaign: nomes reais das campanhas — NÃO normalizar (casa via includes com o nome da campanha).
    slug: splitCsv(form.slug).join(","),
    // UTM Source: valores vêm dos utm_source reais dos leads — NÃO normalizar.
    slug_source: splitCsv(form.slug_source).join(",") || null,
    conta_id: form.plataforma === "meta" ? (form.conta_id || null) : null,
    google_conta_id: form.plataforma === "google" ? (form.google_conta_id || null) : null,
    investimento_manual: form.investimento_manual.trim() ? Number(form.investimento_manual.replace(",", ".")) : null,
    // null = todas as métricas; array = só as selecionadas.
    metricas: metricas && metricas.length < ALL_METRIC_KEYS.length ? metricas : null,
    // null = todas as páginas; array = só as marcadas.
    paginas: paginas && paginas.length < PAGINAS.length ? paginas : null,
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
        <Label>Plataforma (de onde vem o investimento)</Label>
        <Select value={form.plataforma} onValueChange={(v) => setForm({ ...form, plataforma: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="meta">Meta Ads</SelectItem>
            <SelectItem value="google">Google Ads</SelectItem>
            <SelectItem value="none">Nenhuma (sem investimento)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.plataforma === "meta" && (
        <div className="space-y-1">
          <Label>Conta de Anúncios (Meta)</Label>
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
      )}
      {form.plataforma === "google" && (
        <div className="space-y-1">
          <Label>Conta do Google Ads</Label>
          {googleErro ? (
            <p className="text-sm text-destructive">{googleErro} (conecte o Google Ads em Integrações e informe o MCC)</p>
          ) : (
            <Select value={form.google_conta_id} onValueChange={(v) => setForm({ ...form, google_conta_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder={googleAccounts.length ? "Selecione a conta" : "Carregando contas..."} />
              </SelectTrigger>
              <SelectContent>
                {googleAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({a.id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      {form.plataforma === "none" && (
        <div className="space-y-1">
          <Label>Investimento total (R$) — manual</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={form.investimento_manual}
            onChange={(e) => setForm({ ...form, investimento_manual: e.target.value })}
            placeholder="Ex: 1576,86 (deixe vazio para zerar)"
          />
          <p className="text-xs text-muted-foreground">Opcional. Mostrado no dashboard exatamente como digitado (não muda com o período). Vazio = investimento zerado.</p>
        </div>
      )}
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

      <div className="space-y-1.5">
        <Label>Aparece nas páginas</Label>
        <p className="text-xs text-muted-foreground">Em quais telas o botão deste canal aparece. (Nenhuma marcada = todas.)</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {PAGINAS.map((p) => {
            const sel = paginas === null || paginas.includes(p.key);
            return (
              <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={sel}
                  onCheckedChange={() => {
                    const base = paginas === null ? PAGINAS.map((x) => x.key) : [...paginas];
                    setPaginas(sel ? base.filter((k) => k !== p.key) : [...base, p.key]);
                  }}
                />
                {p.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Métricas visíveis no dashboard</Label>
          <div className="flex gap-2">
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setMetricas(null)}>Todas</button>
            <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setMetricas([])}>Nenhuma</button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Desmarque o que não faz sentido para este canal. (Vazio/Todas = mostra tudo.)</p>
        {(["KPI", "Gráfico"] as const).map((grupo) => (
          <div key={grupo} className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{grupo === "KPI" ? "Indicadores" : "Gráficos"}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {DASHBOARD_METRICS.filter((m) => m.grupo === grupo).map((m) => {
                const sel = metricas === null || metricas.includes(m.key);
                return (
                  <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={sel}
                      onCheckedChange={() => {
                        const base = metricas === null ? [...ALL_METRIC_KEYS] : [...metricas];
                        setMetricas(sel ? base.filter((k) => k !== m.key) : [...base, m.key]);
                      }}
                    />
                    <span className="truncate" title={m.label}>{m.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
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
