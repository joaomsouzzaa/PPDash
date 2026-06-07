import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sparkles, Plus, Pencil, Trash2, Bot, Settings, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Providers de IA e seus modelos. Ajuste/adicione conforme integrar novos.
const PROVIDERS: Record<string, { label: string; models: string[] }> = {
  anthropic: { label: "Anthropic", models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-3-5-sonnet-20240620"] },
  openai: { label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-mini"] },
  google: { label: "Google", models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"] },
};

type Agente = {
  id: string;
  nome: string;
  slug: string | null;
  descricao: string | null;
  provider: string;
  modelo: string | null;
  system_prompt: string | null;
  ativo: boolean;
};

const emptyForm = {
  nome: "", slug: "", descricao: "",
  provider: "anthropic", modelo: PROVIDERS.anthropic.models[0],
  system_prompt: "", ativo: true,
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function Agentes() {
  const queryClient = useQueryClient();
  const { data: agentes = [] } = useQuery({
    queryKey: ["agentes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("agentes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Agente[];
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [slugTouched, setSlugTouched] = useState(false);
  const [deleting, setDeleting] = useState<Agente | null>(null);

  // ---- Configuração das API keys dos providers (multi-tenant, no banco) ----
  const [configOpen, setConfigOpen] = useState(false);
  const [aiKeys, setAiKeys] = useState<Record<string, string>>({ anthropic: "", openai: "", google: "" });
  const [savedProviders, setSavedProviders] = useState<Set<string>>(new Set());
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [savingKeys, setSavingKeys] = useState(false);

  const carregarProvidersSalvos = async () => {
    const { data } = await (supabase as any).from("ai_config").select("provider");
    setSavedProviders(new Set((data || []).map((r: any) => r.provider)));
  };
  useEffect(() => { carregarProvidersSalvos(); }, []);

  const salvarKeys = async () => {
    setSavingKeys(true);
    try {
      for (const [provider, key] of Object.entries(aiKeys)) {
        if (!key.trim()) continue; // só grava o que foi preenchido
        const { data: existing } = await (supabase as any).from("ai_config").select("provider").eq("provider", provider).maybeSingle();
        if (existing) await (supabase as any).from("ai_config").update({ api_key: key.trim() }).eq("provider", provider);
        else await (supabase as any).from("ai_config").insert({ provider, api_key: key.trim() });
      }
      toast.success("Chaves salvas");
      setAiKeys({ anthropic: "", openai: "", google: "" });
      await carregarProvidersSalvos();
      setConfigOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar chaves");
    } finally {
      setSavingKeys(false);
    }
  };

  const abrirNovo = () => { setEditingId(null); setForm({ ...emptyForm }); setSlugTouched(false); setDialogOpen(true); };
  const abrirEdicao = (a: Agente) => {
    setEditingId(a.id);
    setForm({
      nome: a.nome, slug: a.slug || "", descricao: a.descricao || "",
      provider: a.provider || "anthropic", modelo: a.modelo || PROVIDERS[a.provider || "anthropic"]?.models[0] || "",
      system_prompt: a.system_prompt || "", ativo: a.ativo,
    });
    setSlugTouched(true);
    setDialogOpen(true);
  };

  const onNome = (nome: string) => setForm((f) => ({ ...f, nome, slug: slugTouched ? f.slug : slugify(nome) }));
  const onProvider = (provider: string) => setForm((f) => ({ ...f, provider, modelo: PROVIDERS[provider]?.models[0] || "" }));

  const salvar = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome do agente"); return; }
    const payload = {
      nome: form.nome.trim(), slug: (form.slug || slugify(form.nome)).trim(),
      descricao: form.descricao || null, provider: form.provider, modelo: form.modelo,
      system_prompt: form.system_prompt || null, ativo: form.ativo,
    };
    const res = editingId
      ? await (supabase as any).from("agentes").update(payload).eq("id", editingId)
      : await (supabase as any).from("agentes").insert(payload);
    if (res.error) { toast.error("Erro ao salvar agente"); return; }
    toast.success("Agente salvo");
    setDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["agentes"] });
  };

  const excluir = async () => {
    if (!deleting) return;
    await (supabase as any).from("agentes").delete().eq("id", deleting.id);
    setDeleting(null);
    queryClient.invalidateQueries({ queryKey: ["agentes"] });
    toast.success("Agente excluído");
  };

  const toggleAtivo = async (a: Agente) => {
    await (supabase as any).from("agentes").update({ ativo: !a.ativo }).eq("id", a.id);
    queryClient.invalidateQueries({ queryKey: ["agentes"] });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Agentes
              </h1>
              <p className="text-sm text-muted-foreground">Agentes de IA e automações inteligentes</p>
            </div>
            <Button variant="outline" onClick={() => setConfigOpen(true)}>
              <Settings className="mr-2 h-4 w-4" /> Configurar modelos
            </Button>
            <Button onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" /> Novo agente</Button>
          </header>

          <div className="p-6">
            {agentes.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold">Nenhum agente configurado ainda</h2>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                    Crie seu primeiro agente de IA: dê um nome, escolha o modelo e defina o system prompt (personalidade/instruções).
                  </p>
                  <Button className="mt-4" onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" /> Criar primeiro agente</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {agentes.map((a) => (
                  <Card key={a.id} className="flex flex-col">
                    <CardContent className="p-4 flex flex-col gap-3 flex-1">
                      <div className="flex items-start justify-between">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Bot className="h-5 w-5 text-primary" />
                        </div>
                        <Badge variant={a.ativo ? "default" : "secondary"}>{a.ativo ? "ATIVO" : "inativo"}</Badge>
                      </div>
                      <div>
                        <p className="font-semibold leading-tight">{a.nome}</p>
                        {a.descricao && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.descricao}</p>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-auto">
                        <Badge variant="secondary" className="text-[10px]">{PROVIDERS[a.provider]?.label || a.provider}</Badge>
                        {a.modelo && <Badge variant="outline" className="text-[10px]">{a.modelo}</Badge>}
                      </div>
                      <div className="flex items-center gap-1 border-t border-border pt-2">
                        <Switch checked={a.ativo} onCheckedChange={() => toggleAtivo(a)} className="mr-auto" />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicao(a)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting(a)} title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Agente" : "Novo Agente"}</DialogTitle>
            <DialogDescription>Configurações do agente de IA</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => onNome(e.target.value)} placeholder="Ex: CEO" />
            </div>
            <div className="space-y-1">
              <Label>Slug (identificador único)</Label>
              <Input value={form.slug} onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value }); }} placeholder="ceo" />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex: Assistente executivo que gerencia estratégia, metas, projetos e equipe" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Provider</Label>
                <Select value={form.provider} onValueChange={onProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROVIDERS).map(([k, p]) => <SelectItem key={k} value={k}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Modelo</Label>
                <Select value={form.modelo} onValueChange={(v) => setForm({ ...form, modelo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(PROVIDERS[form.provider]?.models || []).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>System Prompt</Label>
              <Textarea rows={6} value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="Defina a personalidade e instruções do agente..." />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Ativo</Label>
                <p className="text-xs text-muted-foreground">Agentes inativos não participam das execuções.</p>
              </div>
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={salvar}>{editingId ? "Salvar alterações" : "Criar agente"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de configuração das API keys */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurar modelos (API keys)</DialogTitle>
            <DialogDescription>
              Cole a API key de cada provider que você usa. Por segurança, as chaves não são exibidas depois de salvas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {Object.entries(PROVIDERS).map(([prov, p]) => (
              <div key={prov} className="space-y-1">
                <Label className="flex items-center gap-2">
                  {p.label}
                  {savedProviders.has(prov) && <Badge variant="secondary" className="text-[10px]">salvo</Badge>}
                </Label>
                <div className="relative">
                  <Input
                    type={showKey[prov] ? "text" : "password"}
                    className="pr-9"
                    placeholder={savedProviders.has(prov) ? "•••••••• (salvo — deixe em branco p/ manter)" : "cole a API key"}
                    value={aiKeys[prov]}
                    onChange={(e) => setAiKeys({ ...aiKeys, [prov]: e.target.value })}
                  />
                  <button type="button" onClick={() => setShowKey({ ...showKey, [prov]: !showKey[prov] })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showKey[prov] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              As chaves ficam no servidor (usadas pelos agentes para chamar os modelos). Quando entrar o login multi-usuário, serão isoladas por conta.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>Cancelar</Button>
            <Button onClick={salvarKeys} disabled={savingKeys}>{savingKeys ? "Salvando..." : "Salvar chaves"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
            <AlertDialogDescription>"{deleting?.nome}" será removido permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
