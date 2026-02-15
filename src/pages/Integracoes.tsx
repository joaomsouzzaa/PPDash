import { useState, useEffect } from "react";
import { Plug, Wifi, WifiOff, Loader2 } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const Integracoes = () => {
  const [metaConnected, setMetaConnected] = useState(() => {
    return localStorage.getItem("meta_connected") === "true";
  });
  const [userName, setUserName] = useState<string | null>(() => {
    return localStorage.getItem("meta_user_name");
  });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadFacebookSDK();
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await loadFacebookSDK();
      const result = await loginWithFacebook();
      if (result.status === "connected") {
        setMetaConnected(true);
        setUserName(result.userName ?? null);
        localStorage.setItem("meta_connected", "true");
        localStorage.setItem("meta_user_name", result.userName ?? "");
        localStorage.setItem("meta_access_token", result.accessToken ?? "");
        toast({
          title: "Conectado com sucesso!",
          description: `Conta "${result.userName}" vinculada.`,
        });
      } else {
        toast({
          title: "Conexão cancelada",
          description: "O login com o Facebook foi cancelado ou negado.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Erro ao conectar",
        description: "Não foi possível conectar com o Meta. Tente novamente.",
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
        <main className="flex-1 overflow-auto">
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
                        metaConnected
                          ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {metaConnected
                        ? `✅ Conta conectada: ${userName}`
                        : "⚠️ Conta desconectada"}
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={handleConnect}
                        disabled={metaConnected || loading}
                      >
                        {loading && !metaConnected ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Conectar com Meta
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleDisconnect}
                        disabled={!metaConnected || loading}
                      >
                        {loading && metaConnected ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Desconectar
                      </Button>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Integracoes;
