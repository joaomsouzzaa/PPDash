import { useState, useEffect } from "react";
import { Plug, Wifi, WifiOff, Loader2, ShoppingCart, Copy, Check, Users, Sheet, SlidersHorizontal, BarChart3, Youtube } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MapeamentoLeads } from "@/components/MapeamentoLeads";
import { CrmSyncSection } from "@/components/CrmSyncSection";
import { MetaContasSelecao } from "@/components/MetaContasSelecao";
import { MetaLeadsPaginas } from "@/components/MetaLeadsPaginas";
import { toast as sonner } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  loadFacebookSDK,
  loginWithFacebook,
  logoutFromFacebook,
} from "@/lib/facebook-sdk";
import { exchangeForLongLivedToken, isTokenExpired, clearTokenExpired, clearAdAccountsCache, clearRateLimitFlag, hydrateMetaTokenFromServer } from "@/lib/meta-ads";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listDriveFolders, getDriveConfig, saveDriveConfig, type DriveFolder } from "@/lib/meta-ads-manager";

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;

/** Carrega o token de webhook exclusivo da organização do usuário logado. */
function useWebhookToken() {
  const { profile } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!profile?.org_id) return;
    supabase
      .from("organizations")
      .select("webhook_token")
      .eq("id", profile.org_id)
      .maybeSingle()
      .then(({ data }: any) => setToken(data?.webhook_token ?? null));
  }, [profile?.org_id]);
  return token;
}

/** Lê/atualiza o flag de ativação do webhook de leads do CRM da org logada. */
function useWebhookLeadsAtivo() {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;
  const [ativo, setAtivo] = useState<boolean | null>(null);
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("organizations")
      .select("webhook_leads_ativo")
      .eq("id", orgId)
      .maybeSingle()
      .then(({ data }: any) => setAtivo(data?.webhook_leads_ativo !== false));
  }, [orgId]);
  return { orgId, ativo, setAtivo };
}

const WebhookSection = () => {
  const [copied, setCopied] = useState(false);
  const token = useWebhookToken();
  const url = token ? `${SB_URL}/functions/v1/webhook-vendas?token=${token}` : "Gerando sua URL exclusiva…";

  const handleCopy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[hsl(var(--success))]/10 flex items-center justify-center">
            <ShoppingCart className="h-5 w-5 text-[hsl(var(--success))]" />
          </div>
          <div>
            <CardTitle className="text-base">Checkout de Vendas</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cole esta URL nas configurações de webhook do checkout de vendas.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono text-foreground break-all select-all">
            {url}
          </code>
          <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
            {copied ? <Check className="h-4 w-4 text-[hsl(var(--success))]" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure este endpoint como URL de webhook/postback nas plataformas de checkout para receber as vendas automaticamente.
        </p>
      </CardContent>
    </Card>
  );
};

const CrmWebhookSection = () => {
  const [copied, setCopied] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const token = useWebhookToken();
  const { orgId, ativo, setAtivo } = useWebhookLeadsAtivo();
  const url = token ? `${SB_URL}/functions/v1/webhook-leads?token=${token}` : "Gerando sua URL exclusiva…";

  const handleCopy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleAtivo = async (valor: boolean) => {
    if (!orgId) return;
    setSalvando(true);
    const anterior = ativo;
    setAtivo(valor);
    const { error } = await supabase
      .from("organizations")
      .update({ webhook_leads_ativo: valor } as any)
      .eq("id", orgId);
    setSalvando(false);
    if (error) {
      setAtivo(anterior);
      sonner.error("Não foi possível alterar: " + error.message);
    } else {
      sonner.success(valor ? "Recebimento de leads do CRM ativado." : "Recebimento de leads do CRM desativado.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[hsl(var(--info))]/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-[hsl(var(--info))]" />
          </div>
          <div>
            <CardTitle className="text-base">CRM — Leads</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cole esta URL nas configurações de webhook do seu CRM para enviar e receber dados de leads.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono text-foreground break-all select-all">
            {url}
          </code>
          <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
            {copied ? <Check className="h-4 w-4 text-[hsl(var(--success))]" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Cole a URL acima no webhook (POST) do seu CRM. Depois, no <strong>mapeamento</strong> abaixo, diga
          qual variável do CRM preenche cada campo.
        </p>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
          <div>
            <Label htmlFor="webhook-leads-ativo" className="text-sm font-medium">Receber leads do CRM</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ativo === false
                ? "Desligado: a URL continua existindo, mas os leads enviados são ignorados."
                : "Ligado: os leads enviados a esta URL entram automaticamente."}
            </p>
          </div>
          <Switch
            id="webhook-leads-ativo"
            checked={ativo ?? true}
            disabled={ativo === null || salvando}
            onCheckedChange={toggleAtivo}
          />
        </div>

        <div className="border-t pt-3">
          <Button variant="outline" size="sm" onClick={() => setMapOpen(true)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" /> Gerenciar campos e mapeamento
          </Button>
        </div>

        <Dialog open={mapOpen} onOpenChange={setMapOpen}>
          <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Gerenciar campos e mapeamento do CRM</DialogTitle></DialogHeader>
            <MapeamentoLeads />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

const Integracoes = () => {
  const [metaConnected, setMetaConnected] = useState(() => {
    return localStorage.getItem("meta_connected") === "true";
  });
  const [userName, setUserName] = useState<string | null>(() => {
    return localStorage.getItem("meta_user_name");
  });
  const [tokenExpired, setTokenExpired] = useState(() => isTokenExpired());
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadFacebookSDK();
    // Conexão Meta vale entre dispositivos: hidrata o token salvo no banco.
    (async () => {
      const ok = await hydrateMetaTokenFromServer();
      if (ok) {
        setMetaConnected(true);
        setTokenExpired(false);
        setUserName(localStorage.getItem("meta_user_name"));
      }
    })();
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await loadFacebookSDK();
      const result = await loginWithFacebook();
      if (result.status === "connected") {
        // Tenta trocar pelo token de longa duração; se falhar (ex.: META_APP_SECRET
        // não configurado), usa o token curto mesmo — conecta sem erro falso.
        let accessToken = result.accessToken!;
        let expiresAt = Date.now() + 60 * 60 * 1000; // ~1h (token curto)
        let longa = false;
        try {
          const longLived = await exchangeForLongLivedToken(result.accessToken!);
          accessToken = longLived.access_token;
          expiresAt = Date.now() + longLived.expires_in * 1000;
          longa = true;
        } catch (ex) {
          console.warn("[Integracoes] Falha na troca por token longo, usando token curto:", (ex as Error)?.message);
        }

        localStorage.setItem("meta_access_token", accessToken);
        localStorage.setItem("meta_token_expires_at", String(expiresAt));

        clearTokenExpired();
        setTokenExpired(false);
        setMetaConnected(true);
        setUserName(result.userName ?? null);
        localStorage.setItem("meta_connected", "true");
        localStorage.setItem("meta_user_name", result.userName ?? "");

        toast({
          title: tokenExpired ? "Token renovado!" : "Conectado com sucesso!",
          description: longa
            ? `Conta "${result.userName}" vinculada com token de longa duração.`
            : `Conta "${result.userName}" conectada. (Token de curta duração — configure o META_APP_SECRET para sessão longa.)`,
        });
      } else {
        toast({
          title: "Conexão cancelada",
          description: "O login com o Facebook foi cancelado ou negado.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      console.error("[Integracoes] Connect error:", e?.message || e);
      toast({
        title: "Erro ao conectar",
        description: "Não foi possível conectar com o Meta. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReconnect = async () => {
    setLoading(true);
    try {
      // Clear everything first
      await logoutFromFacebook().catch(() => {});
      localStorage.removeItem("meta_access_token");
      localStorage.removeItem("meta_token_expires_at");
      localStorage.removeItem("meta_token_expired");
      clearAdAccountsCache();
      clearRateLimitFlag();

      // Now reconnect
      await loadFacebookSDK();
      const result = await loginWithFacebook();
      if (result.status === "connected") {
        const longLived = await exchangeForLongLivedToken(result.accessToken!);
        localStorage.setItem("meta_access_token", longLived.access_token);
        const expiresAt = Date.now() + longLived.expires_in * 1000;
        localStorage.setItem("meta_token_expires_at", String(expiresAt));
        clearTokenExpired();
        setTokenExpired(false);
        setMetaConnected(true);
        setUserName(result.userName ?? null);
        localStorage.setItem("meta_connected", "true");
        localStorage.setItem("meta_user_name", result.userName ?? "");
        toast({
          title: "Reconectado com sucesso!",
          description: `Token renovado para "${result.userName}".`,
        });
      }
    } catch (e: any) {
      console.error("[Integracoes] Reconnect error:", e?.message || e);
      toast({
        title: "Erro ao reconectar",
        description: "Tente novamente em alguns minutos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await logoutFromFacebook();
      setMetaConnected(false);
      setUserName(null);
      localStorage.removeItem("meta_connected");
      localStorage.removeItem("meta_user_name");
      localStorage.removeItem("meta_access_token");
      localStorage.removeItem("meta_token_expires_at");
      localStorage.removeItem("meta_token_expired");
      clearAdAccountsCache();
      toast({ title: "Desconectado", description: "Conta Meta desvinculada." });
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível desconectar.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Integrações</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie suas conexões com plataformas externas
              </p>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <Collapsible open={open} onOpenChange={setOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-secondary/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-[hsl(var(--info))]/10 flex items-center justify-center">
                          <Plug className="h-5 w-5 text-[hsl(var(--info))]" />
                        </div>
                        <div>
                          <CardTitle className="text-base">Meta Ads</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Conecte sua conta para importar dados de campanhas
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={metaConnected ? "default" : "destructive"}
                        className={
                          metaConnected
                            ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]"
                            : ""
                        }
                      >
                        {metaConnected ? (
                          <>
                            <Wifi className="h-3 w-3 mr-1" /> Conectada
                          </>
                        ) : (
                          <>
                            <WifiOff className="h-3 w-3 mr-1" /> Desconectada
                          </>
                        )}
                      </Badge>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-4">
                    <div
                      className={`rounded-lg p-4 text-sm font-medium ${
                        metaConnected && !tokenExpired
                          ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                          : tokenExpired
                          ? "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {metaConnected && !tokenExpired
                        ? `✅ Conta conectada: ${userName}`
                        : tokenExpired
                        ? `⚠️ Token expirado — reconecte a conta: ${userName}`
                        : "⚠️ Conta desconectada"}
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={handleConnect}
                        disabled={metaConnected && !tokenExpired || loading}
                      >
                        {loading && !metaConnected ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        {tokenExpired ? "Reconectar" : "Conectar com Meta"}
                      </Button>
                      {metaConnected && !tokenExpired && (
                        <Button
                          variant="outline"
                          onClick={handleReconnect}
                          disabled={loading}
                        >
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          Reconectar (novo token)
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        onClick={handleDisconnect}
                        disabled={!metaConnected || loading}
                      >
                        Desconectar
                      </Button>
                    </div>

                    {metaConnected && !tokenExpired && (
                      <div className="border-t pt-4">
                        <h4 className="text-sm font-medium mb-2">Contas de anúncio exibidas no dashboard</h4>
                        <MetaContasSelecao />
                      </div>
                    )}

                    {metaConnected && !tokenExpired && (
                      <div className="border-t pt-4">
                        <h4 className="text-sm font-medium mb-2">Captação de leads nativos (Formulários do Meta)</h4>
                        <MetaLeadsPaginas />
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Checkout de Vendas */}
            <WebhookSection />

            {/* CRM — Leads */}
            <CrmWebhookSection />

            {/* Sincronização de CRM (pull + relatório) */}
            <CrmSyncSection />

            {/* Google Sheets */}
            <GoogleSheetsSection />

            {/* Google Ads */}
            <GoogleAdsSection />

            {/* YouTube (publicar Shorts pelo Workflow) */}
            <YouTubeSection />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

const GoogleSheetsSection = () => {
  const [open, setOpen] = useState(false);
  const [hasClient, setHasClient] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const status = async () => {
    const { data } = await supabase.functions.invoke("google-sheets", { body: { action: "status" } });
    if (data) { setConnected(!!data.connected); setEmail(data.email || null); setHasClient(!!data.has_client); }
  };

  useEffect(() => {
    status();
    // Callback do OAuth: ?code= na URL → troca por tokens.
    // O YouTube usa o MESMO redirect com state=youtube — deixa a seção do YouTube tratar esse.
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && params.get("state") !== "youtube") {
      (async () => {
        setLoading(true);
        const { data, error } = await supabase.functions.invoke("google-sheets", { body: { action: "exchange", code } });
        setLoading(false);
        window.history.replaceState({}, "", "/integracoes");
        if (error || data?.error) sonner.error(`Erro ao conectar Google: ${data?.error || error?.message}`);
        else { sonner.success(`Google conectado: ${data.email || ""}`); setOpen(true); status(); }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conectar = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("google-sheets", { body: { action: "get_auth_url" } });
    setLoading(false);
    if (error || data?.error) { sonner.error(data?.error || error?.message || "Erro"); return; }
    window.location.href = data.url;
  };

  const desconectar = async () => {
    await supabase.functions.invoke("google-sheets", { body: { action: "disconnect" } });
    sonner.success("Google desconectado"); status();
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-secondary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Sheet className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Google Sheets</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Enviar dados das notificações para planilhas</p>
                </div>
              </div>
              <Badge variant={connected ? "default" : "outline"} className="gap-1">
                {connected ? <><Wifi className="h-3 w-3" /> {email || "Conectado"}</> : <><WifiOff className="h-3 w-3" /> Desconectado</>}
              </Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {!hasClient ? (
              <p className="text-xs text-muted-foreground">
                A integração com o Google ainda não foi habilitada pelo administrador do sistema.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Conecte sua conta Google para enviar os dados das notificações para as suas planilhas.
                  Você só precisa autorizar com o seu e-mail — nada de configuração técnica.
                </p>
                <div className="flex gap-2">
                  {!connected ? (
                    <Button onClick={conectar} disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sheet className="mr-2 h-4 w-4" />} Conectar Google
                    </Button>
                  ) : (
                    <Button variant="destructive" onClick={desconectar}>Desconectar</Button>
                  )}
                </div>
                {connected && <p className="text-xs text-muted-foreground">Conectado. Configure a planilha em cada notificação (Notificações → editar).</p>}
                {connected && <DrivePastaCriativos />}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

// Pasta default do Drive com os criativos (usada pela página Meta Ads).
const DrivePastaCriativos = () => {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [folderId, setFolderId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listDriveFolders().then(setFolders).catch(() => { /* sem permissão ainda */ });
    getDriveConfig().then((c) => { if (c?.pasta_criativos_id) setFolderId(c.pasta_criativos_id); }).catch(() => {});
  }, []);

  const salvar = async (id: string) => {
    setFolderId(id);
    const nome = folders.find((f) => f.id === id)?.name || "";
    setLoading(true);
    try {
      await saveDriveConfig(id, nome);
      sonner.success("Pasta de criativos salva");
    } catch (e: any) {
      sonner.error(e?.message || "Falha ao salvar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t pt-3 mt-3 space-y-2">
      <p className="text-xs font-medium">Pasta de criativos (Meta Ads)</p>
      <p className="text-xs text-muted-foreground">
        Defina a pasta do Drive onde estão os criativos. A página Meta Ads usa essa pasta como padrão ao subir campanhas.
      </p>
      <Select value={folderId} onValueChange={salvar} disabled={loading}>
        <SelectTrigger className="max-w-md"><SelectValue placeholder={folders.length ? "Selecione a pasta" : "Nenhuma pasta encontrada"} /></SelectTrigger>
        <SelectContent>
          {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
};

const GoogleAdsSection = () => {
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [hasDevToken, setHasDevToken] = useState(false);
  const [savedMcc, setSavedMcc] = useState<string | null>(null);
  const [acessiveis, setAcessiveis] = useState<{ id: string; name: string; manager: boolean }[]>([]);
  const [loading, setLoading] = useState(false);

  const status = async () => {
    const [ga, sheets] = await Promise.all([
      supabase.functions.invoke("google-ads", { body: { action: "status" } }),
      supabase.functions.invoke("google-sheets", { body: { action: "status" } }),
    ]);
    if (ga.data) { setConnected(!!ga.data.connected); setHasDevToken(!!ga.data.has_dev_token); setSavedMcc(ga.data.login_customer_id || null); }
    if (sheets.data) setEmail(sheets.data.email || null);
  };
  useEffect(() => { status(); }, []);

  // Conecta usando o MESMO OAuth do Google Sheets (o callback ?code= é tratado na seção Sheets).
  const conectar = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("google-sheets", { body: { action: "get_auth_url" } });
    setLoading(false);
    if (error || data?.error) { sonner.error(data?.error || error?.message || "Erro"); return; }
    window.location.href = data.url;
  };
  const desconectar = async () => {
    await supabase.functions.invoke("google-sheets", { body: { action: "disconnect" } });
    sonner.success("Google desconectado"); setAcessiveis([]); status();
  };

  const detectar = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("google-ads", { body: { action: "list_accessible" } });
    setLoading(false);
    if (error || data?.error) { sonner.error(data?.error || error?.message || "Erro"); return; }
    setAcessiveis(data.accounts || []);
    if (!(data.accounts || []).length) sonner.error("Nenhuma conta acessível encontrada para este Gmail.");
  };

  const escolherMcc = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("google-ads", { body: { action: "set_login_customer", login_customer_id: id } });
    if (error || data?.error) { sonner.error(data?.error || error?.message || "Erro"); return; }
    sonner.success("Conta gerenciadora definida"); status();
  };

  const pronto = connected && hasDevToken && !!savedMcc;
  const fmtId = (id: string) => id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-secondary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Google Ads</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Puxar investimento das campanhas do Google</p>
                </div>
              </div>
              <Badge variant={pronto ? "default" : "outline"} className="gap-1">
                {pronto ? <><Wifi className="h-3 w-3" /> Pronto</> : <><WifiOff className="h-3 w-3" /> Configurar</>}
              </Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* 1. Conexão Google */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">1. Conecte a conta Google (mesma conexão do Google Sheets).</p>
              <div className="flex items-center gap-2">
                {!connected ? (
                  <Button onClick={conectar} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />} Conectar com Google
                  </Button>
                ) : (
                  <>
                    <Badge variant="default" className="gap-1"><Wifi className="h-3 w-3" /> {email || "Conectado"}</Badge>
                    <Button variant="outline" size="sm" onClick={conectar} disabled={loading}>Reautorizar</Button>
                    <Button variant="destructive" size="sm" onClick={desconectar}>Desconectar</Button>
                  </>
                )}
              </div>
              {!hasDevToken && <p className="text-xs text-destructive">Developer Token ausente — configure o secret GOOGLE_ADS_DEVELOPER_TOKEN.</p>}
            </div>

            {/* 2. Escolher conta gerenciadora */}
            {connected && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">2. Escolha a conta gerenciadora (MCC) entre as que este Gmail acessa.</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={detectar} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Listar contas do Google
                  </Button>
                  {savedMcc && <Badge variant="secondary">MCC atual: {fmtId(savedMcc)}</Badge>}
                </div>
                {acessiveis.length > 0 && (
                  <div className="space-y-1">
                    {acessiveis.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 rounded border border-border px-3 py-1.5 text-sm">
                        <span>{a.name} <span className="text-xs text-muted-foreground">({fmtId(a.id)})</span> {a.manager && <Badge variant="outline" className="ml-1 text-[10px]">MCC</Badge>}</span>
                        <Button size="sm" variant={savedMcc === a.id ? "default" : "outline"} onClick={() => escolherMcc(a.id)}>
                          {savedMcc === a.id ? "Selecionada" : "Usar esta"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {pronto && <p className="text-xs text-muted-foreground">Pronto! Crie um canal em <strong>Canais de Aquisição</strong> com a plataforma <strong>Google Ads</strong>.</p>}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

// Conexão de canal do YouTube (Google OAuth com escopo youtube.upload) para
// publicar/agendar Shorts pelo Workflow. Usa o MESMO redirect do Google Sheets,
// distinguido por state=youtube (a seção Sheets ignora esse callback).
const YouTubeSection = () => {
  const [open, setOpen] = useState(false);
  const [hasClient, setHasClient] = useState(false);
  const [connected, setConnected] = useState(false);
  const [canais, setCanais] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const status = async () => {
    const { data } = await supabase.functions.invoke("youtube-connect", { body: { action: "status" } });
    if (data) { setConnected(!!data.connected); setCanais(data.canais || []); setHasClient(!!data.has_client); }
  };

  useEffect(() => {
    status();
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && params.get("state") === "youtube") {
      (async () => {
        setLoading(true);
        const { data, error } = await supabase.functions.invoke("youtube-connect", { body: { action: "exchange", code } });
        setLoading(false);
        window.history.replaceState({}, "", "/integracoes");
        if (error || data?.error) sonner.error(`Erro ao conectar YouTube: ${data?.error || error?.message}`);
        else { sonner.success(`YouTube conectado: ${(data.canais || []).map((c: any) => c.channel_title).join(", ")}`); setOpen(true); status(); }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conectar = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("youtube-connect", { body: { action: "get_auth_url" } });
    setLoading(false);
    if (error || data?.error) { sonner.error(data?.error || error?.message || "Erro"); return; }
    window.location.href = data.url;
  };

  const desconectar = async () => {
    await supabase.functions.invoke("youtube-connect", { body: { action: "disconnect" } });
    sonner.success("YouTube desconectado"); status();
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-secondary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Youtube className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <CardTitle className="text-base">YouTube</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Publicar e agendar Shorts pelo Workflow</p>
                </div>
              </div>
              <Badge variant={connected ? "default" : "outline"} className="gap-1">
                {connected ? <><Wifi className="h-3 w-3" /> {canais[0] || "Conectado"}</> : <><WifiOff className="h-3 w-3" /> Desconectado</>}
              </Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {!hasClient ? (
              <p className="text-xs text-muted-foreground">
                A integração com o Google ainda não foi habilitada pelo administrador do sistema.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Conecte seu canal do YouTube para publicar e agendar Shorts a partir dos cards do Workflow.
                  Autorize com a conta Google dona do canal.
                </p>
                <div className="flex gap-2">
                  {!connected ? (
                    <Button onClick={conectar} disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Youtube className="mr-2 h-4 w-4" />} Conectar canal do YouTube
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={conectar} disabled={loading}>Reautorizar</Button>
                      <Button variant="destructive" size="sm" onClick={desconectar}>Desconectar</Button>
                    </>
                  )}
                </div>
                {connected && <p className="text-xs text-muted-foreground">Canal(is): {canais.join(", ")}. Agora escolha o canal ao publicar um card no Workflow.</p>}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default Integracoes;
