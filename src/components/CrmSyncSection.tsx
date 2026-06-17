import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Loader2, Save, Wifi, WifiOff, Database } from "lucide-react";
import { toast } from "sonner";

// CRMs com conector pronto no backend (crm-sync). Para adicionar um novo: criar o conector
// na edge function e incluir aqui na lista.
const CRMS: { value: string; label: string; help: string }[] = [
  { value: "rd_station", label: "Recuperação de Erros (7 dias)", help: "Os leads chegam pelo webhook (tempo real). A sincronização reprocessa eventos que falharam nos últimos 7 dias e envia o relatório no WhatsApp. Não puxa histórico via API — só reprocessa erros nossos." },
  { value: "clint", label: "Clint", help: "Puxa os negócios (deals) das origens configuradas e insere os que faltarem na base. Informe o token da API do Clint." },
];

interface Integracao {
  id: string;
  crm: string;
  ativo: boolean;
  credenciais: Record<string, any>;
  config: Record<string, any>;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_result: any;
}

export function CrmSyncSection() {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [integ, setInteg] = useState<Integracao | null>(null);
  const [crm, setCrm] = useState<string>("rd_station");
  const [ativo, setAtivo] = useState(true);
  const [clintToken, setClintToken] = useState("");

  const carregar = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase.from("integracoes").select("*").eq("org_id", orgId).maybeSingle();
    if (data) {
      const row = data as unknown as Integracao;
      setInteg(row);
      setCrm(row.crm);
      setAtivo(row.ativo);
      setClintToken((row.credenciais as any)?.api_token ?? "");
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const salvar = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const credenciais = crm === "clint" ? { api_token: clintToken.trim() } : {};
      const payload = { org_id: orgId, crm, ativo, credenciais };
      const { error } = await supabase.from("integracoes").upsert(payload as any, { onConflict: "org_id,crm" });
      if (error) throw new Error(error.message);
      toast.success("Integração salva.");
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  };

  const sincronizar = async () => {
    if (!orgId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-sync", { body: { org_id: orgId } });
      if (error) throw new Error(error.message);
      const r = (data as any)?.resultados?.[0];
      if (r?.erro) throw new Error(r.erro);
      toast.success(`Sincronizado: ${r?.inseridos ?? 0} novo(s) · ${r?.total ?? 0} no total.`);
      await carregar();
    } catch (e) { toast.error("Falha na sincronização: " + (e as Error).message); }
    setSyncing(false);
  };

  const crmDef = CRMS.find((c) => c.value === crm);
  const lastSync = integ?.last_sync_at
    ? new Date(integ.last_sync_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-secondary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[hsl(var(--info))]/10 flex items-center justify-center">
                  <Database className="h-5 w-5 text-[hsl(var(--info))]" />
                </div>
                <div>
                  <CardTitle className="text-base">Sincronização de CRM</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Recupera leads que possam ter faltado e envia o relatório diário no WhatsApp
                  </p>
                </div>
              </div>
              <Badge variant={integ?.ativo ? "default" : "outline"} className={integ?.ativo ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] gap-1" : "gap-1"}>
                {integ?.ativo ? <><Wifi className="h-3 w-3" /> Ativa</> : <><WifiOff className="h-3 w-3" /> Inativa</>}
              </Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">CRM do cliente</Label>
                  <Select value={crm} onValueChange={setCrm}>
                    <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CRMS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {crmDef && <p className="text-xs text-muted-foreground">{crmDef.help}</p>}
                </div>

                {crm === "clint" && (
                  <div className="space-y-2">
                    <Label className="text-sm">Token da API do Clint</Label>
                    <Input type="password" value={clintToken} onChange={(e) => setClintToken(e.target.value)}
                      placeholder="api-token do Clint" className="max-w-sm font-mono text-xs" />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Switch checked={ativo} onCheckedChange={setAtivo} id="crm-ativo" />
                  <Label htmlFor="crm-ativo" className="text-sm">Sincronização diária ativa (08h)</Label>
                </div>

                {(lastSync || integ?.last_sync_status) && (
                  <p className="text-xs text-muted-foreground">
                    Última sincronização: {lastSync || "—"}
                    {integ?.last_sync_status && ` · ${integ.last_sync_status}`}
                    {integ?.last_sync_result?.inseridos != null && ` · ${integ.last_sync_result.inseridos} inserido(s)`}
                  </p>
                )}

                <div className="flex gap-2 border-t pt-3">
                  <Button size="sm" onClick={salvar} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar
                  </Button>
                  <Button size="sm" variant="outline" onClick={sincronizar} disabled={syncing}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Sincronizando…" : "Sincronizar agora"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
