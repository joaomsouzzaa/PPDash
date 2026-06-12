import { useState, useEffect, useCallback, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { WhatsAppConexao } from "@/components/WhatsAppConexao";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Bot, Plus, Pencil, Trash2, Send, Wifi, WifiOff, RefreshCw, QrCode, Eye, EyeOff, Check, ChevronsUpDown, History, CheckCircle2, XCircle } from "lucide-react";
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
    vars: ["nome", "email", "telefone", "documento", "produto", "cidade", "valor", "tipo", "status", "quantidade", "forma_pagamento", "data"],
  },
  resumo_cidade: {
    label: "Resumo de cidade (agendado)",
    desc: "Resumo periódico de uma cidade",
    vars: ["cidade", "participantes", "vips", "convidados", "bilheteria", "bilheteria_resultado", "cac", "projecao", "investimento", "projecao_investimento"],
  },
  resumo_geral: {
    label: "Resumo geral diário (agendado)",
    desc: "Consolidado de todas as cidades, 1x/dia",
    vars: ["total_cidades", "participantes_total", "bilheteria_total", "investimento_total", "bilheteria_resultado_total", "data"],
  },
  manual: {
    label: "Manual / sob demanda",
    desc: "Enviado quando você clicar em Enviar. Usa o resumo da cidade selecionada.",
    vars: ["cidade", "participantes", "vips", "convidados", "bilheteria", "bilheteria_resultado", "cac", "projecao", "investimento", "projecao_investimento"],
  },
};

type Dest = { tipo: string; valor: string; nome: string }; // tipo: grupo | numero

type Notificacao = {
  id: string;
  nome: string;
  gatilho: string;
  ativo: boolean;
  destinatario_tipo: string; // legado (1º destinatário)
  destinatario: string;      // legado (1º destinatário)
  destinatario_nome: string | null;
  destinatarios?: Dest[] | null;
  mensagem: string;
  cidade_slug: string | null;
  horario: string | null;
};

const emptyForm = {
  nome: "",
  gatilho: "nova_venda",
  ativo: true,
  destinatarios: [{ tipo: "grupo", valor: "", nome: "" }] as Dest[],
  mensagem: "",
  cidade_slug: null as string | null,
  horario: "09:00" as string | null,
  disparo_dia_evento: false,
  horario_evento: "12:00" as string | null,
  sheets_ativo: false,
  sheets_spreadsheet_id: "" as string,
  sheets_spreadsheet_nome: "" as string,
  sheets_aba: "" as string,
  sheets_mapa: {} as Record<string, string>,
};

export default function Notificacoes() {
  const queryClient = useQueryClient();
  const { data: cidades = [] } = useCidades();

  // ---- Grupos do WhatsApp (para escolher destinatários) ----
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [testando, setTestando] = useState(false);     // botão do dialog
  const [testandoId, setTestandoId] = useState<string | null>(null); // botão da linha

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

  // Histórico de envios de uma notificação
  const [logNotif, setLogNotif] = useState<Notificacao | null>(null);
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["notificacao_logs", logNotif?.id],
    enabled: !!logNotif,
    queryFn: async () => {
      const { data } = await (supabase as any).from("notificacao_logs")
        .select("*").eq("notificacao_id", logNotif!.id).order("created_at", { ascending: false }).limit(200);
      return (data || []) as any[];
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleting, setDeleting] = useState<Notificacao | null>(null);
  const [grupoPopoverIdx, setGrupoPopoverIdx] = useState<number | null>(null);

  // Carrega os grupos automaticamente ao abrir o dialog (se ainda não carregou)
  useEffect(() => {
    if (dialogOpen && grupos.length === 0 && !loadingGrupos) {
      carregarGrupos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  const addDest = () => setForm((f) => ({ ...f, destinatarios: [...f.destinatarios, { tipo: "grupo", valor: "", nome: "" }] }));
  const removeDest = (i: number) => setForm((f) => ({ ...f, destinatarios: f.destinatarios.filter((_, idx) => idx !== i) }));
  const updateDest = (i: number, patch: Partial<Dest>) =>
    setForm((f) => ({ ...f, destinatarios: f.destinatarios.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));

  const abrirNovo = () => {
    setEditingId(null);
    setForm({ ...emptyForm, destinatarios: [{ tipo: "grupo", valor: "", nome: "" }] });
    setDialogOpen(true);
  };
  const abrirEdicao = (n: Notificacao) => {
    setEditingId(n.id);
    const dests: Dest[] = (n.destinatarios && n.destinatarios.length)
      ? n.destinatarios.map((d) => ({ tipo: d.tipo, valor: d.valor, nome: d.nome || "" }))
      : [{ tipo: n.destinatario_tipo || "grupo", valor: n.destinatario || "", nome: n.destinatario_nome || "" }];
    setForm({
      nome: n.nome, gatilho: n.gatilho, ativo: n.ativo,
      destinatarios: dests, mensagem: n.mensagem,
      cidade_slug: n.cidade_slug, horario: n.horario || "09:00",
      disparo_dia_evento: (n as any).disparo_dia_evento || false,
      horario_evento: (n as any).horario_evento || "12:00",
      sheets_ativo: (n as any).sheets_ativo || false,
      sheets_spreadsheet_id: (n as any).sheets_spreadsheet_id || "",
      sheets_spreadsheet_nome: (n as any).sheets_spreadsheet_nome || "",
      sheets_aba: (n as any).sheets_aba || "",
      sheets_mapa: (n as any).sheets_mapa || {},
    });
    setDialogOpen(true);
  };

  // Persiste e retorna o id (sem fechar o dialog)
  const salvar = async (): Promise<string | null> => {
    const dests = form.destinatarios.filter((d) => d.valor.trim());
    if (!form.nome || dests.length === 0 || !form.mensagem) {
      toast.error("Preencha nome, ao menos um destinatário e a mensagem"); return null;
    }
    const payload = {
      nome: form.nome, gatilho: form.gatilho, ativo: form.ativo,
      mensagem: form.mensagem, cidade_slug: form.cidade_slug, horario: form.horario,
      disparo_dia_evento: form.disparo_dia_evento,
      horario_evento: form.horario_evento,
      destinatarios: dests,
      // legado (1º destinatário) para compatibilidade
      destinatario_tipo: dests[0].tipo, destinatario: dests[0].valor, destinatario_nome: dests[0].nome || null,
      sheets_ativo: form.sheets_ativo,
      sheets_spreadsheet_id: form.sheets_spreadsheet_id || null,
      sheets_spreadsheet_nome: form.sheets_spreadsheet_nome || null,
      sheets_aba: form.sheets_aba || null,
      sheets_mapa: form.sheets_mapa || {},
    };
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

  // ---- Google Sheets (config por notificação) ----
  const [sheetsList, setSheetsList] = useState<{ id: string; name: string }[]>([]);
  const [tabsList, setTabsList] = useState<string[]>([]);
  const [headersList, setHeadersList] = useState<string[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [sheetsPopover, setSheetsPopover] = useState(false);
  const [colarLink, setColarLink] = useState("");
  const [testandoSheets, setTestandoSheets] = useState(false);

  const testarSheets = async () => {
    if (!form.sheets_spreadsheet_id || !form.sheets_aba) { toast.error("Selecione planilha e aba"); return; }
    setTestandoSheets(true);
    const exemplo: Record<string, string> = {
      nome: "Fulano (teste)", email: "fulano@email.com", telefone: "5511999999999", documento: "000.000.000-00",
      produto: "Workshop Scale | São Paulo - SP", cidade: "São Paulo",
      valor: "R$ 247,00", tipo: "Individual", status: "Pagamento aprovado", quantidade: "1", pagamento: "Pix", forma_pagamento: "Pix",
      data: new Date().toLocaleDateString("pt-BR"),
      participantes: "120", vips: "15", convidados: "8", bilheteria: "R$ 30.000,00", bilheteria_resultado: "R$ 18.000,00",
      cac: "R$ 180,00", projecao: "150", investimento: "R$ 12.000,00", projecao_investimento: "R$ 20.000,00",
      total_cidades: "6", participantes_total: "540", bilheteria_total: "R$ 130.000,00", investimento_total: "R$ 60.000,00", bilheteria_resultado_total: "R$ 70.000,00",
    };
    const valores: Record<string, string> = {};
    for (const [col, tpl] of Object.entries(form.sheets_mapa)) {
      if (!tpl) continue;
      valores[col] = String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => exemplo[k] ?? "");
    }
    if (Object.keys(valores).length === 0) { toast.error("Mapeie ao menos uma coluna"); setTestandoSheets(false); return; }
    try {
      await gs("append", { spreadsheet_id: form.sheets_spreadsheet_id, aba: form.sheets_aba, valores });
      toast.success("Linha de teste adicionada na planilha!");
    } catch (e: any) { toast.error(e.message || "Erro ao escrever no Sheets"); }
    finally { setTestandoSheets(false); }
  };

  const usarLink = async () => {
    const m = colarLink.match(/\/d\/([a-zA-Z0-9-_]+)/) || colarLink.match(/([a-zA-Z0-9-_]{30,})/);
    const id = m?.[1];
    if (!id) { toast.error("Link ou ID inválido"); return; }
    try {
      const d = await gs("list_tabs", { spreadsheet_id: id });
      setForm((f) => ({ ...f, sheets_spreadsheet_id: id, sheets_spreadsheet_nome: d.title || "Planilha", sheets_aba: "", sheets_mapa: {} }));
      setTabsList(d.tabs || []); setHeadersList([]); setColarLink("");
      toast.success(`Planilha carregada: ${d.title || id}`);
    } catch (e: any) { toast.error(e.message || "Não consegui acessar (sem permissão?)"); }
  };

  const gs = async (action: string, extra: any = {}) => {
    const { data, error } = await (supabase as any).functions.invoke("google-sheets", { body: { action, ...extra } });
    if (error || data?.error) throw new Error(data?.error || error?.message || "Erro Google");
    return data;
  };
  const carregarPlanilhas = async () => {
    setLoadingSheets(true);
    try { const d = await gs("list_spreadsheets"); setSheetsList(d.files || []); }
    catch (e: any) { toast.error(e.message); } finally { setLoadingSheets(false); }
  };
  const carregarAbas = async (spreadsheetId: string) => {
    try { const d = await gs("list_tabs", { spreadsheet_id: spreadsheetId }); setTabsList(d.tabs || []); } catch (e: any) { toast.error(e.message); }
  };
  const carregarCabecalhos = async (spreadsheetId: string, aba: string) => {
    try { const d = await gs("list_headers", { spreadsheet_id: spreadsheetId, aba }); setHeadersList(d.headers || []); } catch (e: any) { toast.error(e.message); }
  };

  // Ao abrir uma notificação que já tem Sheets, recarrega abas/cabeçalhos.
  useEffect(() => {
    if (dialogOpen && form.sheets_ativo) {
      if (sheetsList.length === 0) carregarPlanilhas();
      if (form.sheets_spreadsheet_id) carregarAbas(form.sheets_spreadsheet_id);
      if (form.sheets_spreadsheet_id && form.sheets_aba) carregarCabecalhos(form.sheets_spreadsheet_id, form.sheets_aba);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  const gatilhoAtual = GATILHOS[form.gatilho];
  const precisaCidade = form.gatilho === "nova_venda" || form.gatilho === "resumo_cidade" || form.gatilho === "manual";
  const precisaHorario = form.gatilho === "resumo_cidade" || form.gatilho === "resumo_geral";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
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
            <Button onClick={abrirNovo}>
              <Plus className="mr-2 h-4 w-4" /> Nova notificação
            </Button>
          </header>

          <div className="p-6 space-y-6">
            {/* Conexão WhatsApp (modelo revenda — instâncias por organização) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wifi className="h-4 w-4 text-success" /> Conexões de WhatsApp
                </CardTitle>
                <CardDescription>
                  Crie as conexões de WhatsApp do seu plano e conecte escaneando o QR Code no celular.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <WhatsAppConexao />
                <div className="pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={carregarGrupos} disabled={loadingGrupos}>
                    {loadingGrupos && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                    {loadingGrupos ? "Carregando..." : "Carregar grupos do WhatsApp"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1">Use após conectar, para listar grupos ao escolher destinatários.</p>
                </div>
              </CardContent>
            </Card>

            {/* Lista de notificações */}
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Configure suas notificações abaixo. Conecte um WhatsApp acima para <strong>enviar</strong> (testes e disparos).
              </p>
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
                          → {((n.destinatarios && n.destinatarios.length)
                              ? n.destinatarios
                              : [{ tipo: n.destinatario_tipo, valor: n.destinatario, nome: n.destinatario_nome }]
                            ).map((d: any) => d.nome || d.valor).join(", ")}
                          {n.cidade_slug ? ` · ${n.cidade_slug}` : ""}{n.horario && (n.gatilho.startsWith("resumo")) ? ` · ${n.horario}` : ""}
                        </p>
                      </div>
                      <Switch checked={n.ativo} onCheckedChange={() => toggleAtivo(n)} />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => enviarTeste(n.id)} disabled={testandoId === n.id} title="Enviar teste">
                        {testandoId === n.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLogNotif(n)} title="Histórico de envios">
                        <History className="h-4 w-4" />
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

            <div className="space-y-2 md:col-span-2">
              <Label>Destinatários</Label>
              {form.destinatarios.map((d, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select value={d.tipo} onValueChange={(v) => updateDest(i, { tipo: v, valor: "", nome: "" })}>
                    <SelectTrigger className="w-[110px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grupo">Grupo</SelectItem>
                      <SelectItem value="numero">Número</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex-1 min-w-0">
                    {d.tipo === "grupo" ? (
                      loadingGrupos ? (
                        <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-input text-sm text-muted-foreground">
                          <RefreshCw className="h-4 w-4 animate-spin" /> Carregando...
                        </div>
                      ) : grupos.length > 0 ? (
                        <Popover open={grupoPopoverIdx === i} onOpenChange={(o) => setGrupoPopoverIdx(o ? i : null)}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                              <span className="truncate">{d.valor ? (d.nome || d.valor) : "Selecione um grupo"}</span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Pesquisar grupo..." />
                              <CommandList>
                                <CommandEmpty>Nenhum grupo encontrado.</CommandEmpty>
                                <CommandGroup>
                                  {grupos.map((g) => (
                                    <CommandItem key={g.id} value={`${g.name} ${g.id}`}
                                      onSelect={() => { updateDest(i, { valor: g.id, nome: g.name }); setGrupoPopoverIdx(null); }}>
                                      <Check className={`mr-2 h-4 w-4 ${d.valor === g.id ? "opacity-100" : "opacity-0"}`} />
                                      <span className="truncate">{g.name}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <Input value={d.valor} onChange={(e) => updateDest(i, { valor: e.target.value })}
                          placeholder="ID do grupo (xxxx@g.us)" />
                      )
                    ) : (
                      <Input value={d.valor} onChange={(e) => updateDest(i, { valor: e.target.value })}
                        placeholder="5591999999999" />
                    )}
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive"
                    onClick={() => removeDest(i)} disabled={form.destinatarios.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addDest}>
                <Plus className="mr-2 h-4 w-4" /> Adicionar destinatário
              </Button>
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

            {form.gatilho === "resumo_cidade" && (
              <div className="md:col-span-2 space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Disparo extra no dia do evento</Label>
                    <p className="text-[11px] text-muted-foreground">
                      No dia do evento, dispara também só da cidade do evento daquele dia (ignora as demais)
                      e envia <strong>apenas para os números</strong> (não para grupos).
                    </p>
                  </div>
                  <Switch checked={form.disparo_dia_evento} onCheckedChange={(v) => setForm({ ...form, disparo_dia_evento: v })} />
                </div>
                {form.disparo_dia_evento && (
                  <div className="space-y-1">
                    <Label>Horário do disparo no dia do evento</Label>
                    <Input type="time" value={form.horario_evento || ""} onChange={(e) => setForm({ ...form, horario_evento: e.target.value })} />
                  </div>
                )}
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

            {/* Google Sheets */}
            <div className="md:col-span-2 rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enviar também ao Google Sheets</Label>
                  <p className="text-xs text-muted-foreground">Grava uma linha na planilha a cada envio.</p>
                </div>
                <Switch checked={form.sheets_ativo} onCheckedChange={(v) => {
                  setForm({ ...form, sheets_ativo: v });
                  if (v && sheetsList.length === 0) carregarPlanilhas();
                }} />
              </div>
              {form.sheets_ativo && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs flex items-center gap-2">Planilha
                      <button type="button" onClick={() => carregarPlanilhas()} className="text-muted-foreground hover:text-foreground" title="Atualizar lista">
                        <RefreshCw className={`h-3 w-3 ${loadingSheets ? "animate-spin" : ""}`} />
                      </button>
                    </Label>
                      <Popover open={sheetsPopover} onOpenChange={setSheetsPopover}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between font-normal">
                            <span className="truncate">{form.sheets_spreadsheet_nome || (loadingSheets ? "Carregando..." : "Selecione")}</span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar planilha..." />
                            <CommandList>
                              <CommandEmpty>Nenhuma planilha encontrada</CommandEmpty>
                              <CommandGroup>
                                {sheetsList.map((s) => (
                                  <CommandItem key={s.id} value={s.name} onSelect={() => {
                                    setForm({ ...form, sheets_spreadsheet_id: s.id, sheets_spreadsheet_nome: s.name, sheets_aba: "", sheets_mapa: {} });
                                    setHeadersList([]); carregarAbas(s.id); setSheetsPopover(false);
                                  }}>
                                    <Check className={`mr-2 h-4 w-4 ${form.sheets_spreadsheet_id === s.id ? "opacity-100" : "opacity-0"}`} />
                                    <span className="truncate">{s.name}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1"><Label className="text-xs flex items-center gap-2">Aba
                      <button type="button" disabled={!form.sheets_spreadsheet_id} onClick={() => carregarAbas(form.sheets_spreadsheet_id)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Atualizar abas">
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    </Label>
                      <Select value={form.sheets_aba || undefined} disabled={!form.sheets_spreadsheet_id}
                        onValueChange={(v) => { setForm({ ...form, sheets_aba: v }); carregarCabecalhos(form.sheets_spreadsheet_id, v); }}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{tabsList.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Ou cole o link/ID da planilha (ex.: Drive compartilhado)</Label>
                      <Input value={colarLink} onChange={(e) => setColarLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
                    </div>
                    <Button variant="outline" onClick={usarLink} disabled={!colarLink.trim()}>Usar</Button>
                  </div>
                  {headersList.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs">Mapear colunas → dados</Label>
                      {headersList.map((h) => (
                        <div key={h} className="flex items-center gap-2">
                          <span className="text-xs w-32 truncate" title={h}>{h}</span>
                          <Select value={form.sheets_mapa[h] || "_none"}
                            onValueChange={(v) => setForm({ ...form, sheets_mapa: { ...form.sheets_mapa, [h]: v === "_none" ? "" : v } })}>
                            <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">— vazio</SelectItem>
                              {gatilhoAtual?.vars.map((v) => <SelectItem key={v} value={`{{${v}}}`}>{`{{${v}}}`}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                      <p className="text-[11px] text-muted-foreground">As colunas vêm do cabeçalho (linha 1) da aba. Deixe "vazio" nas que não quer preencher.</p>
                      <Button variant="outline" size="sm" onClick={testarSheets} disabled={testandoSheets}>
                        {testandoSheets ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        {testandoSheets ? "Enviando..." : "Testar no Sheets (linha de exemplo)"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
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

      {/* Histórico de envios */}
      <Dialog open={!!logNotif} onOpenChange={(o) => !o && setLogNotif(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> Histórico — {logNotif?.nome}
            </DialogTitle>
          </DialogHeader>
          {logNotif && (
            <p className="text-xs text-muted-foreground -mt-2">
              Gatilho: {GATILHOS[logNotif.gatilho]?.label || logNotif.gatilho}
            </p>
          )}
          <div className="space-y-2">
            {loadingLogs ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum envio registrado ainda.</p>
            ) : (
              logs.map((l) => (
                <div key={l.id} className="rounded-md border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      {l.status === "erro"
                        ? <XCircle className="h-3.5 w-3.5 text-destructive" />
                        : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {l.cidade && <Badge variant="outline" className="text-[10px]">{l.cidade}</Badge>}
                      <Badge variant="secondary" className="text-[10px]">{l.destinatario}</Badge>
                    </div>
                  </div>
                  {l.erro && <p className="text-xs text-destructive">Erro: {l.erro}</p>}
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground bg-muted/40 rounded p-2">{l.mensagem}</p>
                </div>
              ))
            )}
          </div>
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
