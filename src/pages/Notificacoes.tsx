import { useState, useEffect, useCallback, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bot, Plus, Pencil, Trash2, Send, Wifi, WifiOff, RefreshCw, QrCode, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { syncMetaTokenToServer } from "@/lib/meta-ads";
import { useCidades } from "@/hooks/useCidades";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Gatilhos disponíveis e as variáveis que cada um disponibiliza no template
const GATILHOS: Record<string, { label: string; desc: string; vars: string[] }> = {
  nova_venda: {
    label: "Nova venda",
    desc: "Dispara quando uma venda é registrada",
    vars: ["nome", "produto", "cidade", "valor", "tipo", "quantidade", "pagamento", "data"],
  },
  resumo_cidade: {
    label: "Resumo de cidade (agendado)",
    desc: "Resumo periódico de uma cidade",
    vars: ["cidade", "participantes", "vips", "convidados", "bilheteria", "cac", "projecao", "investimento"],
  },
  resumo_geral: {
    label: "Resumo geral diário (agendado)",
    desc: "Consolidado de todas as cidades, 1x/dia",
    vars: ["total_cidades", "participantes_total", "bilheteria_total", "investimento_total", "data"],
  },
  manual: {
    label: "Manual / sob demanda",
    desc: "Enviado quando você clicar em Enviar",
    vars: [],
  },
};

type Notificacao = {
  id: string;
  nome: string;
  gatilho: string;
  ativo: boolean;
  destinatario_tipo: string; // grupo | numero
  destinatario: string;
  destinatario_nome: string | null;
  mensagem: string;
  cidade_slug: string | null;
  horario: string | null;
};

const emptyForm: Omit<Notificacao, "id"> = {
  nome: "",
  gatilho: "nova_venda",
  ativo: true,
  destinatario_tipo: "grupo",
  destinatario: "",
  destinatario_nome: "",
  mensagem: "",
  cidade_slug: null,
  horario: "09:00",
};

export default function Notificacoes() {
  const queryClient = useQueryClient();
  const { data: cidades = [] } = useCidades();

  // ---- Conexão WhatsApp (UAZAPI) ----
  const [cfg, setCfg] = useState({ server_url: "", admin_token: "", instance: "" });
  const [cfgStatus, setCfgStatus] = useState<string>("desconectado");
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [numeroConectado, setNumeroConectado] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [testando, setTestando] = useState(false);     // botão do dialog
  const [testandoId, setTestandoId] = useState<string | null>(null); // botão da linha

  useEffect(() => {
    (supabase as any).from("whatsapp_config").select("server_url,instance,status,numero").maybeSingle().then(({ data }: any) => {
      if (data) {
        setCfg({ server_url: data.server_url || "", admin_token: "", instance: data.instance || "" });
        setCfgStatus(data.status || "desconectado");
        setNumeroConectado(data.numero || null);
      }
    });
  }, []);

  const salvarConfig = async () => {
    // Salva a config (uma linha). admin_token só é gravado se preenchido.
    const { data: existing } = await (supabase as any).from("whatsapp_config").select("id").maybeSingle();
    const patch: Record<string, unknown> = {
      server_url: cfg.server_url.replace(/\/$/, ""),
      instance: cfg.instance,
    };
    if (cfg.admin_token) patch.admin_token = cfg.admin_token;
    const res = existing
      ? await (supabase as any).from("whatsapp_config").update(patch).eq("id", existing.id)
      : await (supabase as any).from("whatsapp_config").insert(patch);
    if (res.error) { toast.error("Erro ao salvar configuração"); return; }
    toast.success("Configuração salva");
  };

  const chamarUazapi = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("uazapi", { body: { action, ...payload } });
    if (error) {
      // tenta extrair a mensagem real do corpo da resposta (ex.: "Invalid token")
      let msg = error.message;
      try { const ctx = (error as any).context; if (ctx?.json) { const b = await ctx.json(); if (b?.error) msg = b.error; } } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  // Atualiza o status. silent=true não mostra toasts (usado no auto-poll).
  const refreshStatus = useCallback(async (silent = false): Promise<boolean> => {
    if (!silent) setLoadingStatus(true);
    try {
      const data = await chamarUazapi("status");
      const connected = data?.status === "connected" || data?.connected;
      setCfgStatus(data?.status || "desconectado");
      setNumeroConectado(data?.numero || null);
      if (connected) { setQrCode(null); if (!silent) toast.success("Conectado!"); }
      else if (data?.qrcode) setQrCode(data.qrcode);
      return !!connected;
    } catch (e: any) {
      if (!silent) toast.error(e?.message || "Falha ao consultar status");
      else setCfgStatus("erro");
      return false;
    } finally {
      if (!silent) setLoadingStatus(false);
    }
  }, [chamarUazapi]);

  // Após conectar, consulta o status a cada 3s por ~1min até conectar (detecta o scan sozinho)
  const pollUntilConnected = useCallback(() => {
    let tries = 0;
    const id = setInterval(async () => {
      tries++;
      const ok = await refreshStatus(true);
      if (ok || tries >= 20) clearInterval(id);
    }, 3000);
  }, [refreshStatus]);

  const conectar = async () => {
    setConnecting(true);
    setQrCode(null);
    try {
      await salvarConfig();
      const data = await chamarUazapi("connect");
      if (data?.qrcode) setQrCode(data.qrcode);
      if (data?.status) setCfgStatus(data.status);
      toast.success("Escaneie o QR Code no WhatsApp");
      pollUntilConnected();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao conectar. Confira URL e token.");
    } finally {
      setConnecting(false);
    }
  };

  // Auto-poll do status: ao abrir e a cada 30s (reflete desconexões sozinho)
  useEffect(() => {
    refreshStatus(true);
    const id = setInterval(() => refreshStatus(true), 30000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  // Grupos do WhatsApp (carregados sob demanda)
  const [grupos, setGrupos] = useState<Array<{ id: string; name: string }>>([]);
  const carregarGrupos = async () => {
    setLoadingGrupos(true);
    try {
      const data = await chamarUazapi("groups");
      setGrupos(data?.groups || []);
      toast.success(`${(data?.groups || []).length} grupo(s) carregado(s)`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao listar grupos (conecte o WhatsApp primeiro)");
    } finally {
      setLoadingGrupos(false);
    }
  };

  // Sincroniza (em silêncio) o token do Meta para o servidor ao abrir a página
  useEffect(() => { syncMetaTokenToServer(); }, []);

  // ---- Notificações (CRUD) ----
  const { data: notificacoes = [] } = useQuery({
    queryKey: ["notificacoes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("notificacoes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Notificacao[];
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleting, setDeleting] = useState<Notificacao | null>(null);

  // Carrega os grupos automaticamente ao escolher "Grupo" no dialog (se ainda não carregou)
  useEffect(() => {
    if (dialogOpen && form.destinatario_tipo === "grupo" && isConnected && grupos.length === 0 && !loadingGrupos) {
      carregarGrupos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.destinatario_tipo]);

  const abrirNovo = () => { setEditingId(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const abrirEdicao = (n: Notificacao) => {
    setEditingId(n.id);
    setForm({
      nome: n.nome, gatilho: n.gatilho, ativo: n.ativo,
      destinatario_tipo: n.destinatario_tipo, destinatario: n.destinatario,
      destinatario_nome: n.destinatario_nome || "", mensagem: n.mensagem,
      cidade_slug: n.cidade_slug, horario: n.horario || "09:00",
    });
    setDialogOpen(true);
  };

  // Persiste e retorna o id (sem fechar o dialog)
  const salvar = async (): Promise<string | null> => {
    if (!form.nome || !form.destinatario || !form.mensagem) {
      toast.error("Preencha nome, destinatário e mensagem"); return null;
    }
    const payload = { ...form, destinatario_nome: form.destinatario_nome || null };
    if (editingId) {
      const { error } = await (supabase as any).from("notificacoes").update(payload).eq("id", editingId);
      if (error) { toast.error("Erro ao salvar notificação"); return null; }
      queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
      return editingId;
    }
    const { data, error } = await (supabase as any).from("notificacoes").insert(payload).select("id").single();
    if (error) { toast.error("Erro ao salvar notificação"); return null; }
    setEditingId(data.id);
    queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
    return data.id;
  };

  const salvarEFechar = async () => {
    const id = await salvar();
    if (id) { toast.success("Notificação salva"); setDialogOpen(false); }
  };

  const salvarETestar = async () => {
    setTestando(true);
    try {
      const id = await salvar();
      if (id) { await chamarUazapi("send_test", { notificacao_id: id }); toast.success("Teste enviado"); }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar teste");
    } finally {
      setTestando(false);
    }
  };

  const excluir = async () => {
    if (!deleting) return;
    await (supabase as any).from("notificacoes").delete().eq("id", deleting.id);
    setDeleting(null);
    queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
    toast.success("Notificação excluída");
  };

  const toggleAtivo = async (n: Notificacao) => {
    await (supabase as any).from("notificacoes").update({ ativo: !n.ativo }).eq("id", n.id);
    queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
  };

  const enviarTeste = async (id: string) => {
    setTestandoId(id);
    try {
      await chamarUazapi("send_test", { notificacao_id: id });
      toast.success("Mensagem de teste enviada");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar teste");
    } finally {
      setTestandoId(null);
    }
  };

  const mensagemRef = useRef<HTMLTextAreaElement>(null);
  const inserirVar = (v: string) => {
    const token = `{{${v}}}`;
    const ta = mensagemRef.current;
    if (ta) {
      const start = ta.selectionStart ?? form.mensagem.length;
      const end = ta.selectionEnd ?? form.mensagem.length;
      const novo = form.mensagem.slice(0, start) + token + form.mensagem.slice(end);
      setForm((f) => ({ ...f, mensagem: novo }));
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + token.length;
        ta.setSelectionRange(pos, pos);
      });
    } else {
      setForm((f) => ({ ...f, mensagem: f.mensagem + token }));
    }
  };

  const isConnected = cfgStatus === "connected" || cfgStatus === "conectado";
  const gatilhoAtual = GATILHOS[form.gatilho];
  const precisaCidade = form.gatilho === "nova_venda" || form.gatilho === "resumo_cidade";
  const precisaHorario = form.gatilho === "resumo_cidade" || form.gatilho === "resumo_geral";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" /> Notificações
              </h1>
              <p className="text-sm text-muted-foreground">
                Envie notificações no WhatsApp (UAZAPI) para grupos ou números
              </p>
            </div>
            <Button onClick={abrirNovo} disabled={!isConnected}>
              <Plus className="mr-2 h-4 w-4" /> Nova notificação
            </Button>
          </header>

          <div className="p-6 space-y-6 max-w-5xl">
            {/* Conexão WhatsApp */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {isConnected ? <Wifi className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                  Conexão WhatsApp (UAZAPI)
                  <Badge variant={isConnected ? "default" : "secondary"} className="ml-2">
                    {isConnected ? `Conectado${numeroConectado ? ` · ${numeroConectado}` : ""}` : cfgStatus}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Informe os dados da sua instância UAZAPI e conecte escaneando o QR Code no WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>URL do servidor UAZAPI</Label>
                    <Input placeholder="https://sua-instancia.uazapi.com"
                      value={cfg.server_url} onChange={(e) => setCfg({ ...cfg, server_url: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Token (admin/instância)</Label>
                    <div className="relative">
                      <Input type={showToken ? "text" : "password"} placeholder="cole o token" className="pr-9"
                        value={cfg.admin_token} onChange={(e) => setCfg({ ...cfg, admin_token: e.target.value })} />
                      <button type="button" onClick={() => setShowToken((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showToken ? "Ocultar token" : "Mostrar token"}>
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Nome da instância</Label>
                    <Input placeholder="ex: scaledash"
                      value={cfg.instance} onChange={(e) => setCfg({ ...cfg, instance: e.target.value })} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={conectar} disabled={connecting}>
                    <QrCode className="mr-2 h-4 w-4" /> {connecting ? "Conectando..." : "Conectar / Gerar QR"}
                  </Button>
                  <Button variant="outline" onClick={() => refreshStatus(false)} disabled={loadingStatus}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loadingStatus ? "animate-spin" : ""}`} />
                    {loadingStatus ? "Atualizando..." : "Atualizar status"}
                  </Button>
                  <Button variant="outline" onClick={carregarGrupos} disabled={!isConnected || loadingGrupos}>
                    {loadingGrupos && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                    {loadingGrupos ? "Carregando..." : "Carregar grupos"}
                  </Button>
                </div>
                {qrCode && (
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <img
                      src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                      alt="QR Code WhatsApp" className="h-56 w-56 rounded-lg border border-border bg-white p-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      WhatsApp → Aparelhos conectados → Conectar aparelho → escaneie
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lista de notificações */}
            <div className="space-y-3">
              {!isConnected && (
                <p className="text-sm text-muted-foreground">
                  Conecte o WhatsApp acima para criar e enviar notificações.
                </p>
              )}
              {notificacoes.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-muted-foreground">
                  Nenhuma notificação configurada ainda.
                </CardContent></Card>
              ) : (
                notificacoes.map((n) => (
                  <Card key={n.id}>
                    <CardContent className="flex items-center gap-4 py-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{n.nome}</span>
                          <Badge variant="secondary">{GATILHOS[n.gatilho]?.label || n.gatilho}</Badge>
                          {!n.ativo && <Badge variant="outline" className="text-muted-foreground">inativa</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          → {n.destinatario_tipo === "grupo" ? "Grupo" : "Número"}: {n.destinatario_nome || n.destinatario}
                          {n.cidade_slug ? ` · ${n.cidade_slug}` : ""}{n.horario && (n.gatilho.startsWith("resumo")) ? ` · ${n.horario}` : ""}
                        </p>
                      </div>
                      <Switch checked={n.ativo} onCheckedChange={() => toggleAtivo(n)} />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => enviarTeste(n.id)} disabled={testandoId === n.id} title="Enviar teste">
                        {testandoId === n.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicao(n)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting(n)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Dialog de edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar notificação" : "Nova notificação"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Aviso de venda no grupo" />
            </div>
            <div className="space-y-1">
              <Label>Gatilho</Label>
              <Select value={form.gatilho} onValueChange={(v) => setForm({ ...form, gatilho: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GATILHOS).map(([k, g]) => (
                    <SelectItem key={k} value={k}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{gatilhoAtual?.desc}</p>
            </div>

            <div className="space-y-1">
              <Label>Destinatário</Label>
              <Select value={form.destinatario_tipo} onValueChange={(v) => setForm({ ...form, destinatario_tipo: v, destinatario: "", destinatario_nome: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grupo">Grupo</SelectItem>
                  <SelectItem value="numero">Número</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{form.destinatario_tipo === "grupo" ? "Grupo" : "Número (com DDI)"}</Label>
              {form.destinatario_tipo === "grupo" ? (
                loadingGrupos ? (
                  <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-input text-sm text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Carregando grupos...
                  </div>
                ) : grupos.length > 0 ? (
                  <Select value={form.destinatario}
                    onValueChange={(v) => {
                      const g = grupos.find((x) => x.id === v);
                      setForm({ ...form, destinatario: v, destinatario_nome: g?.name || "" });
                    }}>
                    <SelectTrigger><SelectValue placeholder="Selecione um grupo" /></SelectTrigger>
                    <SelectContent>
                      {grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-1">
                    <Input value={form.destinatario}
                      onChange={(e) => setForm({ ...form, destinatario: e.target.value })}
                      placeholder="ID do grupo (xxxx@g.us)" />
                    <button type="button" onClick={carregarGrupos} className="text-xs text-primary hover:underline">
                      Recarregar lista de grupos
                    </button>
                  </div>
                )
              ) : (
                <Input value={form.destinatario}
                  onChange={(e) => setForm({ ...form, destinatario: e.target.value })}
                  placeholder="5591999999999" />
              )}
            </div>

            {precisaCidade && (
              <div className="space-y-1">
                <Label>Cidade (filtro)</Label>
                <Select value={form.cidade_slug || "all"} onValueChange={(v) => setForm({ ...form, cidade_slug: v === "all" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as cidades</SelectItem>
                    {cidades.map((c) => <SelectItem key={c.id} value={c.slug}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {precisaHorario && (
              <div className="space-y-1">
                <Label>Horário do envio</Label>
                <Input type="time" value={form.horario || ""} onChange={(e) => setForm({ ...form, horario: e.target.value })} />
              </div>
            )}

            <div className="space-y-1 md:col-span-2">
              <Label>Mensagem</Label>
              {gatilhoAtual?.vars.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  <span className="text-xs text-muted-foreground mr-1">Variáveis:</span>
                  {gatilhoAtual.vars.map((v) => (
                    <button key={v} type="button" onClick={() => inserirVar(v)}
                      className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-accent transition-colors">
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              )}
              <Textarea ref={mensagemRef} rows={5} value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
                placeholder={"Ex: 🎉 Nova venda em {{cidade}}!\nProduto: {{produto}}\nValor: {{valor}}\nComprador: {{nome}}"} />
            </div>

            <div className="flex items-center justify-between md:col-span-2 rounded-md border p-3">
              <div>
                <Label>Ativa</Label>
                <p className="text-xs text-muted-foreground">Notificações inativas não disparam.</p>
              </div>
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button variant="secondary" onClick={salvarETestar} disabled={testando}>
              {testando ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {testando ? "Enviando..." : "Salvar e testar"}
            </Button>
            <Button onClick={salvarEFechar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir notificação?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.nome}" será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
