import { useState, useEffect } from "react";
import { Plug, Wifi, WifiOff, Loader2, ShoppingCart, Copy, Check, Users, Sheet } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MapeamentoLeads } from "@/components/MapeamentoLeads";
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

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;

/** Carrega o token de webhook exclusivo da organização do usuário logado. */
function useWebhookToken() {
  const { profile } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!profile?.org_id) return;
    (supabase as any)
      .from("organizations")
      .select("webhook_token")
      .eq("id", profile.org_id)
      .maybeSingle()
      .then(({ data }: any) => setToken(data?.webhook_token ?? null));
  }, [profile?.org_id]);
  return token;
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
  const token = useWebhookToken();
  const url = token ? `${SB_URL}/functions/v1/webhook-leads?token=${token}` : "Gerando sua URL exclusiva…";

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

        <div className="border-t pt-3">
          <h4 className="text-sm font-medium mb-2">Mapeamento de campos do CRM</h4>
          <MapeamentoLeads />
        </div>
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
      console.log("[Integracoes] Login result:", { status: result.status, hasToken: !!result.accessToken });
      if (result.status === "connected") {
        console.log("[Integracoes] Exchanging token...");
        const longLived = await exchangeForLongLivedToken(result.accessToken!);
        console.log("[Integracoes] Long-lived token OK, expires_in:", longLived.expires_in);
        localStorage.setItem("meta_access_token", longLived.access_token);
        const expiresAt = Date.now() + longLived.expires_in * 1000;
        localStorage.setItem("meta_token_expires_at", String(expiresAt));

        clearTokenExpired();
        setTokenExpired(false);
        setMetaConnected(true);
        setUserName(result.userName ?? null);
        localStorage.setItem("meta_connected", "true");
        localStorage.setItem("meta_user_name", result.userName ?? "");

        console.log("[Integracoes] Stored:", {
          connected: localStorage.getItem("meta_connected"),
          tokenLen: localStorage.getItem("meta_access_token")?.length,
        });

        toast({
          title: tokenExpired ? "Token renovado!" : "Conectado com sucesso!",
          description: `Conta "${result.userName}" vinculada com token de longa duração.`,
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
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Checkout de Vendas */}
            <WebhookSection />

            {/* CRM — Leads */}
            <CrmWebhookSection />

            {/* Google Sheets */}
            <GoogleSheetsSection />
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
    const { data } = await (supabase as any).functions.invoke("google-sheets", { body: { action: "status" } });
    if (data) { setConnected(!!data.connected); setEmail(data.email || null); setHasClient(!!data.has_client); }
  };

  useEffect(() => {
    status();
    // Callback do OAuth: ?code= na URL → troca por tokens.
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      (async () => {
        setLoading(true);
        const { data, error } = await (supabase as any).functions.invoke("google-sheets", { body: { action: "exchange", code } });
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
    const { data, error } = await (supabase as any).functions.invoke("google-sheets", { body: { action: "get_auth_url" } });
    setLoading(false);
    if (error || data?.error) { sonner.error(data?.error || error?.message || "Erro"); return; }
    window.location.href = data.url;
  };

  const desconectar = async () => {
    await (supabase as any).functions.invoke("google-sheets", { body: { action: "disconnect" } });
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
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default Integracoes;
