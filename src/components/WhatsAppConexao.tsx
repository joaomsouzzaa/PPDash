import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Smartphone, Plus, QrCode, Trash2, RefreshCw, Loader2, Wifi, WifiOff, LogOut } from "lucide-react";
import { toast } from "sonner";

interface Inst { id: string; nome: string; numero: string | null; status: string; }

const conectadoStatus = (s: string) => s === "connected";

export function WhatsAppConexao() {
  const [insts, setInsts] = useState<Inst[]>([]);
  const [limite, setLimite] = useState(0);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [qr, setQr] = useState<{ id: string; img: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const call = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("uazapi", { body: { action, ...payload } });
    if (error) {
      let m = error.message;
      try { const c = (error as any).context; if (c?.json) { const b = await c.json(); if (b?.error) m = b.error; } } catch { /* ignore */ }
      throw new Error(m);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  // Consulta o status REAL (servidor uazapi) de cada instância e atualiza a badge.
  // Usado no carregamento e no polling — reflete quedas/desconexões sem clicar em Atualizar.
  const sincronizarStatus = useCallback(async (ids: string[]) => {
    for (const id of ids) {
      try {
        const d = await call("status_instance", { id });
        const status = d.connected ? "connected" : (d.status || "desconectado");
        setInsts((prev) => prev.map((i) => (i.id === id ? { ...i, status, numero: d.numero ?? i.numero } : i)));
      } catch { /* ignore */ }
    }
  }, [call]);

  const carregar = useCallback(async () => {
    try {
      const d = await call("list_instances");
      const lista = d.instancias || [];
      setInsts(lista);
      setLimite(d.limite || 0);
      // Sincroniza o status real logo após carregar (sem bloquear a renderização),
      // para o F5 já refletir a realidade em vez do valor salvo no banco.
      sincronizarStatus(lista.map((i: Inst) => i.id));
    } catch { /* ignore */ }
    setLoading(false);
  }, [call, sincronizarStatus]);

  useEffect(() => { carregar(); }, [carregar]);

  // Mantém os ids atuais para o polling não depender do estado (evita recriar o intervalo).
  const idsRef = useRef<string[]>([]);
  useEffect(() => { idsRef.current = insts.map((i) => i.id); }, [insts]);

  // Re-sincroniza periodicamente enquanto a aba está visível.
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.hidden) return; // não consome enquanto a aba está em segundo plano
      sincronizarStatus(idsRef.current);
    }, 20000);
    return () => clearInterval(iv);
  }, [sincronizarStatus]);

  const pollStatus = useCallback((id: string) => {
    let t = 0;
    const iv = setInterval(async () => {
      t++;
      try {
        const d = await call("status_instance", { id });
        if (d.connected) { clearInterval(iv); setQr((q) => (q?.id === id ? null : q)); toast.success("WhatsApp conectado!"); carregar(); }
      } catch { /* ignore */ }
      if (t >= 20) clearInterval(iv);
    }, 3000);
  }, [call, carregar]);

  const criar = async () => {
    setCriando(true);
    try { await call("create_instance", { nome: novoNome.trim() || "WhatsApp" }); setNovoNome(""); toast.success("Conexão criada"); await carregar(); }
    catch (e: any) { toast.error(e.message); }
    setCriando(false);
  };

  const conectar = async (id: string) => {
    setBusyId(id);
    try {
      const d = await call("connect_instance", { id });
      if (d.qrcode) { setQr({ id, img: d.qrcode }); pollStatus(id); }
      else toast.info("Sem QR Code — tente Atualizar status.");
    } catch (e: any) { toast.error(e.message); }
    setBusyId(null);
  };

  const atualizar = async (id: string) => {
    setBusyId(id);
    try { const d = await call("status_instance", { id }); if (d.connected) setQr((q) => (q?.id === id ? null : q)); await carregar(); }
    catch (e: any) { toast.error(e.message); }
    setBusyId(null);
  };

  const desconectar = async (id: string) => {
    if (!confirm("Desconectar este WhatsApp? A conexão é mantida e você pode reconectar com o QR Code.")) return;
    setBusyId(id);
    try { await call("disconnect_instance", { id }); setQr((q) => (q?.id === id ? null : q)); toast.success("WhatsApp desconectado"); await carregar(); }
    catch (e: any) { toast.error(e.message); }
    setBusyId(null);
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir esta conexão de WhatsApp? A instância será removida.")) return;
    setBusyId(id);
    try { await call("delete_instance", { id }); setQr((q) => (q?.id === id ? null : q)); toast.success("Conexão excluída"); await carregar(); }
    catch (e: any) { toast.error(e.message); }
    setBusyId(null);
  };

  const podeCriar = insts.length < limite;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading ? "Carregando…" : `${insts.length} de ${limite} conexões usadas`}
        </p>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Nome (ex.: Vendas)"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="h-9 w-40"
          />
          <Button size="sm" onClick={criar} disabled={criando || !podeCriar} title={!podeCriar ? "Limite do plano atingido" : undefined}>
            {criando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Nova conexão
          </Button>
        </div>
      </div>

      {!loading && limite === 0 && (
        <p className="text-xs text-muted-foreground">Seu plano não inclui conexões de WhatsApp. Fale com o administrador para fazer upgrade.</p>
      )}

      {insts.map((i) => {
        const on = conectadoStatus(i.status);
        const showQr = qr?.id === i.id;
        return (
          <Card key={i.id}>
            <CardContent className="py-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                    <Smartphone className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{i.nome}</p>
                    <p className="text-xs text-muted-foreground truncate">{i.numero || "sem número"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={on ? "default" : "outline"} className="gap-1">
                    {on ? <><Wifi className="h-3 w-3" /> Conectado</> : <><WifiOff className="h-3 w-3" /> {i.status}</>}
                  </Badge>
                  {!on && (
                    <Button size="sm" variant="outline" disabled={busyId === i.id} onClick={() => conectar(i.id)}>
                      <QrCode className="mr-1 h-4 w-4" /> {showQr ? "Atualizar QR" : "Conectar"}
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busyId === i.id} onClick={() => atualizar(i.id)} title="Atualizar status">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  {on && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busyId === i.id} onClick={() => desconectar(i.id)} title="Desconectar">
                      <LogOut className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={busyId === i.id} onClick={() => excluir(i.id)} title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {showQr && !on && (
                <div className="flex flex-col items-center gap-2 border-t pt-3">
                  <img src={qr!.img} alt="QR Code WhatsApp" className="h-56 w-56 rounded-lg border bg-white p-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → escaneie.
                    Conecta sozinho ao escanear.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
