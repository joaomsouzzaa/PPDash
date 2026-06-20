import { useState, useEffect, useCallback, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Megaphone, Send, Bot, Copy, FolderOpen, Plus, ChevronRight, ChevronDown, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getTenantSlug } from "@/lib/tenant";
import { fetchAdAccounts, type AdAccount } from "@/lib/meta-ads";
import {
  listCampaigns, listSourceCampaigns, duplicateCampaign, createCampaign, updateEntity,
  createAdSet, duplicateAdSet, listDriveFolders, listDriveFiles, getDriveConfig,
  type CampaignTree, type SourceCampaign, type DriveFolder, type DriveFile,
} from "@/lib/meta-ads-manager";

const money = (v?: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

export default function MetaAds() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [account, setAccount] = useState<string>("");

  useEffect(() => {
    fetchAdAccounts().then((a) => {
      setAccounts(a);
      if (a.length) setAccount(a[0].account_id);
    }).catch(() => { /* não conectado */ });
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="shrink-0 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex items-center gap-2 flex-1">
              <Megaphone className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold tracking-tight">Meta Ads</h1>
            </div>
            {accounts.length > 0 && (
              <div className="w-64">
                <Select value={account} onValueChange={setAccount}>
                  <SelectTrigger><SelectValue placeholder="Conta de anúncio" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => <SelectItem key={a.account_id} value={a.account_id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto">
            <Tabs defaultValue="gerenciador" className="p-6">
              <TabsList>
                <TabsTrigger value="gerenciador">Gerenciador</TabsTrigger>
                <TabsTrigger value="wizard">Nova campanha</TabsTrigger>
                <TabsTrigger value="agente">Agente de tráfego</TabsTrigger>
              </TabsList>

              <TabsContent value="gerenciador" className="mt-4">
                <Gerenciador accountId={account} />
              </TabsContent>
              <TabsContent value="wizard" className="mt-4">
                <Wizard accountId={account} />
              </TabsContent>
              <TabsContent value="agente" className="mt-4">
                <AgenteTrafego />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

// ============================= Aba 1: Gerenciador (espelho hierárquico) =============================
function Gerenciador({ accountId }: { accountId: string }) {
  const [campaigns, setCampaigns] = useState<CampaignTree[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string>("");
  const [openC, setOpenC] = useState<Set<string>>(new Set());
  const [openS, setOpenS] = useState<Set<string>>(new Set());

  const sync = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      setCampaigns(await listCampaigns(accountId));
    } catch (e: any) {
      toast.error(e?.message || "Falha ao listar campanhas");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { sync(); }, [sync]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n);
  };

  // Atualiza um nó da árvore imutavelmente (campanha/conjunto/anúncio).
  const patchTree = (level: "campaign" | "adset" | "ad", id: string, patch: any) => {
    setCampaigns((prev) => prev.map((c) => {
      if (level === "campaign") return c.id === id ? { ...c, ...patch } : c;
      return {
        ...c,
        adsets: c.adsets.map((s) => {
          if (level === "adset") return s.id === id ? { ...s, ...patch } : s;
          return { ...s, ads: s.ads.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
        }),
      };
    }));
  };

  const toggleStatus = async (level: "campaign" | "adset" | "ad", id: string, atual: string) => {
    const novo = atual === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setSaving(id);
    try {
      await updateEntity({ entity_id: id, nivel: level, status: novo });
      patchTree(level, id, { status: novo, effective_status: novo });
      toast.success(novo === "ACTIVE" ? "Ativado" : "Pausado");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar");
    } finally {
      setSaving("");
    }
  };

  const saveBudget = async (level: "campaign" | "adset", id: string, valor: number) => {
    setSaving(id);
    try {
      await updateEntity({ entity_id: id, nivel: level, daily_budget: valor });
      patchTree(level, id, { daily_budget: valor });
      toast.success("Orçamento atualizado no Meta");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar orçamento");
    } finally {
      setSaving("");
    }
  };

  const BudgetInput = ({ value, onSave, disabled }: { value?: number | null; onSave: (v: number) => void; disabled?: boolean }) => (
    <Input
      type="number" step="0.01" defaultValue={value ?? ""} disabled={disabled}
      className="h-7 w-28 text-xs"
      onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== value) onSave(v); }}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Espelho do Gerenciador de Anúncios. Expanda campanha → conjunto → anúncio. Alterações refletem no Meta.</p>
        <Button variant="outline" size="sm" onClick={sync} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Sincronizar agora</span>
        </Button>
      </div>

      {campaigns.length === 0 && !loading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma campanha encontrada nesta conta.</CardContent></Card>
      ) : (
        <Card>
          {/* Cabeçalho de colunas */}
          <div className="grid grid-cols-[1fr_90px_140px] gap-2 px-3 py-2 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span>Campanha / Conjunto / Anúncio</span>
            <span className="text-center">Status</span>
            <span>Orçamento diário</span>
          </div>
          <div className="divide-y">
            {campaigns.map((c) => {
              const cOpen = openC.has(c.id);
              return (
                <div key={c.id}>
                  {/* Nível CAMPANHA */}
                  <div className="grid grid-cols-[1fr_90px_140px] gap-2 px-3 py-2 items-center hover:bg-accent/40">
                    <button className="flex items-center gap-2 min-w-0 text-left" onClick={() => toggle(openC, setOpenC, c.id)}>
                      {c.adsets.length ? (cOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />) : <span className="w-4 shrink-0" />}
                      <span className="font-medium text-sm truncate">{c.name}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{c.objetivo || "—"}</Badge>
                    </button>
                    <div className="flex justify-center">
                      <Switch checked={(c.status) === "ACTIVE"} disabled={saving === c.id} onCheckedChange={() => toggleStatus("campaign", c.id, c.status)} />
                    </div>
                    <div className="flex items-center gap-1">
                      {c.daily_budget != null ? <BudgetInput value={c.daily_budget} disabled={saving === c.id} onSave={(v) => saveBudget("campaign", c.id, v)} />
                        : <span className="text-[11px] text-muted-foreground">no conjunto</span>}
                    </div>
                  </div>

                  {/* Nível CONJUNTO */}
                  {cOpen && c.adsets.map((s) => {
                    const sOpen = openS.has(s.id);
                    return (
                      <div key={s.id}>
                        <div className="grid grid-cols-[1fr_90px_140px] gap-2 px-3 py-2 items-center bg-muted/30 hover:bg-accent/40">
                          <button className="flex items-center gap-2 min-w-0 text-left pl-6" onClick={() => toggle(openS, setOpenS, s.id)}>
                            {s.ads.length ? (sOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />) : <span className="w-4 shrink-0" />}
                            <span className="text-sm truncate">{s.name}</span>
                            {s.optimization_goal && <Badge variant="outline" className="shrink-0 text-[10px]">{s.optimization_goal}</Badge>}
                          </button>
                          <div className="flex justify-center">
                            <Switch checked={s.status === "ACTIVE"} disabled={saving === s.id} onCheckedChange={() => toggleStatus("adset", s.id, s.status)} />
                          </div>
                          <div className="flex items-center gap-1">
                            {s.daily_budget != null ? <BudgetInput value={s.daily_budget} disabled={saving === s.id} onSave={(v) => saveBudget("adset", s.id, v)} />
                              : <span className="text-[11px] text-muted-foreground">no CBO</span>}
                          </div>
                        </div>

                        {/* Nível ANÚNCIO */}
                        {sOpen && s.ads.map((a) => (
                          <div key={a.id} className="grid grid-cols-[1fr_90px_140px] gap-2 px-3 py-1.5 items-center hover:bg-accent/40">
                            <div className="flex items-center gap-2 min-w-0 pl-14">
                              {a.thumbnail ? <img src={a.thumbnail} alt="" className="h-8 w-8 rounded object-cover shrink-0" /> : <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>}
                              <span className="text-xs truncate">{a.name}</span>
                            </div>
                            <div className="flex justify-center">
                              <Switch checked={a.status === "ACTIVE"} disabled={saving === a.id} onCheckedChange={() => toggleStatus("ad", a.id, a.status)} />
                            </div>
                            <span className="text-[11px] text-muted-foreground">—</span>
                          </div>
                        ))}
                        {sOpen && s.ads.length === 0 && <div className="px-3 py-2 pl-14 text-[11px] text-muted-foreground">Sem anúncios.</div>}
                      </div>
                    );
                  })}
                  {cOpen && c.adsets.length === 0 && <div className="px-3 py-2 pl-12 text-[11px] text-muted-foreground">Sem conjuntos.</div>}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================= Aba 2: Wizard (nova/duplicar) =============================
// Seletor de criativos do Drive reutilizável: escolhe a pasta e marca os arquivos.
// Notifica o pai com os DriveFile selecionados.
function CreativePicker({ onChange }: { onChange: (files: DriveFile[]) => void }) {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [folderId, setFolderId] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listDriveFolders().then(setFolders).catch(() => { /* drive não conectado */ });
    getDriveConfig().then((c) => { if (c?.pasta_criativos_id) setFolderId(c.pasta_criativos_id); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!folderId) return;
    setLoading(true);
    listDriveFiles(folderId).then((f) => { setFiles(f); setSel(new Set()); })
      .catch((e) => toast.error(e?.message)).finally(() => setLoading(false));
  }, [folderId]);

  useEffect(() => { onChange(files.filter((f) => sel.has(f.id))); }, [sel, files]);

  const toggle = (id: string) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="border-t pt-3">
      <div className="flex items-center gap-2 mb-2">
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
        <Label className="text-xs">Pasta de criativos no Drive</Label>
      </div>
      <Select value={folderId} onValueChange={setFolderId}>
        <SelectTrigger><SelectValue placeholder={folders.length ? "Selecione a pasta" : "Conecte o Google em Integrações"} /></SelectTrigger>
        <SelectContent>{folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
      </Select>
      {loading ? (
        <div className="py-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando criativos...</div>
      ) : files.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-2">{files.length} criativo(s) na pasta — marque quais subir ({sel.size} selecionado(s)):</p>
          <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
            {files.map((f) => (
              <label key={f.id} className={`border rounded-lg p-2 cursor-pointer flex flex-col gap-1 ${sel.has(f.id) ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className="flex items-center gap-2">
                  <Checkbox checked={sel.has(f.id)} onCheckedChange={() => toggle(f.id)} />
                  <span className="text-xs truncate flex-1">{f.name}</span>
                </div>
                {f.thumbnailLink && <img src={f.thumbnailLink} alt={f.name} className="w-full h-20 object-cover rounded" />}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Converte DriveFiles selecionados em payload de criativos.
const toCreatives = (files: DriveFile[], pageId: string, message: string, link: string) =>
  files.map((f) => ({
    file_id: f.id, file_name: f.name, mime: f.mimeType, ad_name: f.name,
    page_id: pageId || undefined, message, link: link || undefined,
    call_to_action: link ? "LEARN_MORE" : undefined,
  }));

type WizardModo = "duplicar" | "zero" | "novo-conjunto" | "dup-conjunto";
function Wizard({ accountId }: { accountId: string }) {
  const [modo, setModo] = useState<WizardModo>("duplicar");
  const botoes: { k: WizardModo; label: string; icon: any }[] = [
    { k: "duplicar", label: "Duplicar campanha", icon: Copy },
    { k: "zero", label: "Criar do zero", icon: Plus },
    { k: "novo-conjunto", label: "Novo conjunto", icon: Plus },
    { k: "dup-conjunto", label: "Duplicar conjunto (trocar criativos)", icon: Copy },
  ];
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex gap-2 flex-wrap">
        {botoes.map((b) => (
          <Button key={b.k} variant={modo === b.k ? "default" : "outline"} size="sm" onClick={() => setModo(b.k)}>
            <b.icon className="h-4 w-4 mr-2" /> {b.label}
          </Button>
        ))}
      </div>
      {modo === "duplicar" && <WizardDuplicar accountId={accountId} />}
      {modo === "zero" && <WizardZero accountId={accountId} />}
      {modo === "novo-conjunto" && <WizardNovoConjunto accountId={accountId} />}
      {modo === "dup-conjunto" && <WizardDuplicarConjunto accountId={accountId} />}
    </div>
  );
}

function WizardDuplicar({ accountId }: { accountId: string }) {
  const [sources, setSources] = useState<SourceCampaign[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [nome, setNome] = useState("");
  const [ativa, setAtiva] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    listSourceCampaigns(accountId).then(setSources).catch((e) => toast.error(e?.message)).finally(() => setLoading(false));
  }, [accountId]);

  const duplicar = async () => {
    if (!sourceId) { toast.error("Escolha a campanha base"); return; }
    setSaving(true);
    try {
      const r = await duplicateCampaign({ source_campaign_id: sourceId, novo_nome: nome || undefined, status_inicial: ativa ? "ACTIVE" : "PAUSED", account_id: accountId });
      toast.success(`Campanha duplicada (id ${r.campaign_id}). Ajuste o que precisar no Gerenciador.`);
      setSourceId(""); setNome("");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao duplicar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Duplicar campanha como base</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs">Campanha base {loading && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger><SelectValue placeholder="Selecione uma campanha existente" /></SelectTrigger>
            <SelectContent>
              {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Novo nome (opcional)</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Deixe vazio para herdar o nome com sufixo de cópia" />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={ativa} onCheckedChange={setAtiva} id="ativa-dup" />
          <Label htmlFor="ativa-dup" className="text-sm">Subir já ativa (padrão: pausada)</Label>
        </div>
        <Button onClick={duplicar} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />} Duplicar campanha
        </Button>
      </CardContent>
    </Card>
  );
}

function WizardZero({ accountId }: { accountId: string }) {
  const [nome, setNome] = useState("");
  const [objetivo, setObjetivo] = useState("OUTCOME_LEADS");
  const [budget, setBudget] = useState("");
  const [pageId, setPageId] = useState("");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [ativa, setAtiva] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creativeFiles, setCreativeFiles] = useState<DriveFile[]>([]);

  const criar = async () => {
    if (!nome || !objetivo) { toast.error("Preencha nome e objetivo"); return; }
    if (!pageId) { toast.error("Informe o page_id da Página do Facebook"); return; }
    if (creativeFiles.length === 0) { toast.error("Selecione ao menos um criativo"); return; }
    setSaving(true);
    try {
      const r = await createCampaign({
        account_id: accountId, nome, objetivo, status_inicial: ativa ? "ACTIVE" : "PAUSED",
        daily_budget: budget ? Number(budget) : undefined,
        adset: { nome: `${nome} - Conjunto 1`, daily_budget: budget ? Number(budget) : undefined },
        creatives: toCreatives(creativeFiles, pageId, message, link),
      });
      toast.success(`Campanha criada (id ${r.campaign_id}) com ${r.ad_ids?.length || 0} anúncio(s).`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar campanha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Criar campanha do zero</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Nome da campanha</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Objetivo</Label>
            <Select value={objetivo} onValueChange={setObjetivo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OUTCOME_LEADS">Leads</SelectItem>
                <SelectItem value="OUTCOME_SALES">Vendas</SelectItem>
                <SelectItem value="OUTCOME_TRAFFIC">Tráfego</SelectItem>
                <SelectItem value="OUTCOME_ENGAGEMENT">Engajamento</SelectItem>
                <SelectItem value="OUTCOME_AWARENESS">Reconhecimento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Orçamento diário (R$)</Label><Input type="number" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
          <div><Label className="text-xs">Page ID (Facebook)</Label><Input value={pageId} onChange={(e) => setPageId(e.target.value)} /></div>
          <div><Label className="text-xs">Link de destino</Label><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." /></div>
        </div>
        <div><Label className="text-xs">Texto do anúncio</Label><Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} /></div>

        <CreativePicker onChange={setCreativeFiles} />

        <div className="flex items-center gap-2">
          <Switch checked={ativa} onCheckedChange={setAtiva} id="ativa-zero" />
          <Label htmlFor="ativa-zero" className="text-sm">Subir já ativa (padrão: pausada)</Label>
        </div>
        <Button onClick={criar} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />} Criar campanha
        </Button>
      </CardContent>
    </Card>
  );
}

// Novo conjunto numa campanha existente.
function WizardNovoConjunto({ accountId }: { accountId: string }) {
  const [tree, setTree] = useState<CampaignTree[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [nome, setNome] = useState("");
  const [budget, setBudget] = useState("");
  const [otim, setOtim] = useState("LINK_CLICKS");
  const [pageId, setPageId] = useState("");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [ativa, setAtiva] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creativeFiles, setCreativeFiles] = useState<DriveFile[]>([]);

  useEffect(() => {
    if (!accountId) return;
    setLoadingTree(true);
    listCampaigns(accountId).then(setTree).catch((e) => toast.error(e?.message)).finally(() => setLoadingTree(false));
  }, [accountId]);

  const criar = async () => {
    if (!campaignId) { toast.error("Escolha a campanha"); return; }
    if (!pageId) { toast.error("Informe o page_id da Página do Facebook"); return; }
    if (creativeFiles.length === 0) { toast.error("Selecione ao menos um criativo"); return; }
    setSaving(true);
    try {
      const r = await createAdSet({
        account_id: accountId, campaign_id: campaignId, status_inicial: ativa ? "ACTIVE" : "PAUSED",
        adset: { nome: nome || "Novo conjunto", daily_budget: budget ? Number(budget) : undefined, optimization_goal: otim },
        creatives: toCreatives(creativeFiles, pageId, message, link),
      });
      toast.success(`Conjunto criado (id ${r.adset_id}) com ${r.ad_ids?.length || 0} anúncio(s).`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar conjunto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Novo conjunto em campanha existente</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs">Campanha {loadingTree && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}</Label>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger><SelectValue placeholder="Selecione a campanha" /></SelectTrigger>
            <SelectContent>{tree.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Nome do conjunto</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Otimização</Label>
            <Select value={otim} onValueChange={setOtim}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LINK_CLICKS">Cliques no link</SelectItem>
                <SelectItem value="LANDING_PAGE_VIEWS">Visitas à LP</SelectItem>
                <SelectItem value="LEAD_GENERATION">Leads</SelectItem>
                <SelectItem value="OFFSITE_CONVERSIONS">Conversões</SelectItem>
                <SelectItem value="REACH">Alcance</SelectItem>
                <SelectItem value="IMPRESSIONS">Impressões</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Orçamento diário (R$)</Label><Input type="number" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="vazio = usa CBO da campanha" /></div>
          <div><Label className="text-xs">Page ID (Facebook)</Label><Input value={pageId} onChange={(e) => setPageId(e.target.value)} /></div>
          <div><Label className="text-xs">Link de destino</Label><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." /></div>
        </div>
        <div><Label className="text-xs">Texto do anúncio</Label><Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} /></div>

        <CreativePicker onChange={setCreativeFiles} />

        <div className="flex items-center gap-2">
          <Switch checked={ativa} onCheckedChange={setAtiva} id="ativa-nc" />
          <Label htmlFor="ativa-nc" className="text-sm">Subir já ativo (padrão: pausado)</Label>
        </div>
        <Button onClick={criar} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />} Criar conjunto
        </Button>
      </CardContent>
    </Card>
  );
}

// Duplica um conjunto existente trocando apenas os criativos (herda segmentação/orçamento).
function WizardDuplicarConjunto({ accountId }: { accountId: string }) {
  const [tree, setTree] = useState<CampaignTree[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [adsetId, setAdsetId] = useState("");
  const [nome, setNome] = useState("");
  const [pageId, setPageId] = useState("");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [ativa, setAtiva] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creativeFiles, setCreativeFiles] = useState<DriveFile[]>([]);

  useEffect(() => {
    if (!accountId) return;
    setLoadingTree(true);
    listCampaigns(accountId).then(setTree).catch((e) => toast.error(e?.message)).finally(() => setLoadingTree(false));
  }, [accountId]);

  const adsets = tree.find((c) => c.id === campaignId)?.adsets || [];

  const duplicar = async () => {
    if (!adsetId) { toast.error("Escolha o conjunto base"); return; }
    if (creativeFiles.length === 0) { toast.error("Selecione ao menos um criativo novo"); return; }
    setSaving(true);
    try {
      const r = await duplicateAdSet({
        account_id: accountId, source_adset_id: adsetId, target_campaign_id: campaignId || undefined,
        novo_nome: nome || undefined, status_inicial: ativa ? "ACTIVE" : "PAUSED",
        page_id: pageId || undefined,
        creatives: toCreatives(creativeFiles, pageId, message, link),
      });
      toast.success(`Conjunto duplicado (id ${r.adset_id}) com ${r.ad_ids?.length || 0} criativo(s) novo(s).`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao duplicar conjunto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Duplicar conjunto trocando os criativos</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">Herda toda a segmentação e orçamento do conjunto escolhido; só os criativos mudam.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Campanha {loadingTree && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}</Label>
            <Select value={campaignId} onValueChange={(v) => { setCampaignId(v); setAdsetId(""); }}>
              <SelectTrigger><SelectValue placeholder="Selecione a campanha" /></SelectTrigger>
              <SelectContent>{tree.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Conjunto base</Label>
            <Select value={adsetId} onValueChange={setAdsetId} disabled={!campaignId}>
              <SelectTrigger><SelectValue placeholder={campaignId ? "Selecione o conjunto" : "Escolha a campanha"} /></SelectTrigger>
              <SelectContent>{adsets.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Novo nome (opcional)</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div><Label className="text-xs">Page ID (opcional)</Label><Input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="vazio = mesma página do conjunto base" /></div>
          <div><Label className="text-xs">Link de destino</Label><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." /></div>
        </div>
        <div><Label className="text-xs">Texto do anúncio</Label><Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} /></div>

        <CreativePicker onChange={setCreativeFiles} />

        <div className="flex items-center gap-2">
          <Switch checked={ativa} onCheckedChange={setAtiva} id="ativa-dc" />
          <Label htmlFor="ativa-dc" className="text-sm">Subir já ativo (padrão: pausado)</Label>
        </div>
        <Button onClick={duplicar} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />} Duplicar conjunto
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================= Aba 3: Agente de tráfego (chat) =============================
type ChatMsg = { role: "user" | "assistant"; content: string };
function AgenteTrafego() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [verbo, setVerbo] = useState<"pensando" | "executando">("pensando");
  const [agenteId, setAgenteId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Usa o MESMO "Agente de Tráfego" configurado na página Agentes (slug "trafego" ou nome).
  useEffect(() => {
    supabase.from("agentes").select("id,nome,slug").eq("ativo", true).then(({ data }) => {
      const a = (data || []).find((x: any) => (x.slug || "").toLowerCase() === "trafego"
        || (x.nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes("trafego"));
      if (a) setAgenteId(a.id);
    });
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  const enviar = async () => {
    const texto = input.trim();
    if (!texto) return;
    setInput("");
    const novaLista: ChatMsg[] = [...messages, { role: "user", content: texto }];
    setMessages(novaLista);
    setLoading(true);
    setVerbo("pensando");
    try {
      const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const SB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token || SB_KEY;
      const resp = await fetch(`${SB_URL}/functions/v1/agente-trafego`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${jwt}`, "x-org-slug": getTenantSlug() },
        body: JSON.stringify({ messages: novaLista, agente_id: agenteId }),
      });
      if (!resp.ok || !resp.body) {
        let msg = `Erro ${resp.status}`;
        try { const b = await resp.json(); if (b?.error) msg = b.error; } catch { /* */ }
        throw new Error(msg);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const processar = (obj: any) => {
        if (obj.type === "step" && obj.step) {
          setVerbo(String(obj.step.conteudo || "").trim().startsWith("🔧") ? "executando" : "pensando");
          setMessages((prev) => [...prev, { role: "assistant", content: obj.step.conteudo }]);
        } else if (obj.type === "done") {
          setMessages((prev) => [...prev, { role: "assistant", content: obj.reply || "(sem resposta)" }]);
        } else if (obj.type === "error") {
          throw new Error(obj.error || "Erro");
        }
      };
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const linhas = buffer.split("\n");
        buffer = linhas.pop() || "";
        for (const l of linhas) if (l.trim()) processar(JSON.parse(l));
      }
      if (buffer.trim()) processar(JSON.parse(buffer));
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar");
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${e?.message || "Erro"}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-[70vh]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Agente de Tráfego</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground text-sm">
              <Bot className="h-8 w-8 mb-2 text-primary" />
              <p>Peça para o agente subir ou duplicar uma campanha.</p>
              <p className="text-xs">Ele fará todas as perguntas de configuração e lerá os criativos do Drive.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{m.content}</div>
            </div>
          ))}
          {loading && <div className="flex justify-start"><div className="bg-muted rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {verbo === "executando" ? "Executando..." : "Pensando..."}</div></div>}
        </div>
        <div className="flex items-end gap-2 pt-3 border-t mt-3">
          <Textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder="Ex.: suba uma campanha de leads para a página X..." className="resize-none min-h-[44px] max-h-40" />
          <Button onClick={enviar} disabled={loading || !input.trim()} size="icon" className="h-11 w-11 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
