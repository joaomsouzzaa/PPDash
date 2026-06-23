import { useState, useEffect, useCallback } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Instagram, Plus, Trash2, Plug, RefreshCw, CheckCircle2, AlertTriangle,
  Heart, MessageCircle, Send as SendIcon, Bookmark, ChevronLeft, X, Link2, Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listarContas, assinarWebhook, listarMidias, type IgConta, type IgMidia, type IgAutomacao, type DmBotao, type DmPayload } from "@/lib/instagram";
import { toast } from "sonner";

// Tabelas novas ainda não regeneradas em supabase/types.ts — cast pontual.
const db = supabase as any;

// Conversão de minutos <-> unidade amigável para o input de delay do follow-up.
type Unidade = "min" | "horas" | "dias";
const toMinutos = (valor: number, u: Unidade) => Math.max(1, Math.round(valor * (u === "dias" ? 1440 : u === "horas" ? 60 : 1)));
function deMinutos(min: number): { valor: number; unidade: Unidade } {
  if (min % 1440 === 0 && min >= 1440) return { valor: min / 1440, unidade: "dias" };
  if (min % 60 === 0 && min >= 60) return { valor: min / 60, unidade: "horas" };
  return { valor: min, unidade: "min" };
}

const AUTOMACAO_VAZIA: Omit<IgAutomacao, "id"> = {
  ig_conta_id: null,
  nome: "Auto-DM de links dos comentários",
  status: "pausada",
  escopo: "post_especifico",
  media_ids: [],
  gatilho_tipo: "palavra",
  palavras: [],
  match_tipo: "contem",
  responder_comentario: true,
  resposta_comentario_templates: [
    "Te enviei no direct! 📩",
    "Acabei de te chamar na DM, dá uma olhada! 👀",
    "Prontinho! Te mandei tudo no direct 💬",
  ],
  enviar_dm: true,
  dm_payload: {
    modo: "optin",
    // direto (caso troque o modo)
    texto: "Aqui está o link que você pediu 👇",
    botoes: [],
    // optin (padrão)
    optin_texto: "TOP! Você comentou no post certo! 🎉\n\nÉ só clicar no botão abaixo que eu te envio o link 👇",
    optin_botao_titulo: "Me envie o link",
    link_texto: "Aqui está o link para você se cadastrar e tirar suas dúvidas com meu time! 🚀",
    link_botoes: [],
  },
  followup_ativo: false,
  followup_delay_min: 60,
  followup_payload: { texto: "E aí, conseguiu abrir o link e se cadastrar? Qualquer dúvida é só me chamar! 😉", botoes: [] },
};

export default function AutoDmInstagram() {
  const [contas, setContas] = useState<IgConta[]>([]);
  const [contaSel, setContaSel] = useState<IgConta | null>(null);
  const [conectando, setConectando] = useState(false);
  const [midias, setMidias] = useState<IgMidia[]>([]);

  const [automacoes, setAutomacoes] = useState<IgAutomacao[]>([]);
  const [execucoes, setExecucoes] = useState<Record<string, number>>({});
  const [edit, setEdit] = useState<IgAutomacao | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Conta selecionada persiste entre reloads (senão o seletor volta pro 1º da lista).
  const SEL_KEY = "autodm_conta_sel";
  const selecionarConta = useCallback((c: IgConta) => {
    setContaSel(c);
    try { localStorage.setItem(SEL_KEY, c.ig_user_id); } catch { /* ignore */ }
  }, []);

  // ---- Carregamento inicial: contas conectadas (ig_contas) + automações ----
  const carregar = useCallback(async () => {
    const { data: cts } = await db.from("ig_contas").select("*").eq("ativo", true);
    const mapped: IgConta[] = (cts || []).map((c: any) => ({
      id: c.id, ig_user_id: c.ig_user_id, ig_username: c.ig_username, page_id: c.page_id,
      page_name: c.page_name, profile_picture_url: null,
    }));
    setContas(mapped);
    if (mapped.length) {
      const salvo = (() => { try { return localStorage.getItem(SEL_KEY); } catch { return null; } })();
      const escolhida = mapped.find((m) => m.ig_user_id === salvo) || mapped[0];
      setContaSel((atual) => atual ?? escolhida);
    }
    const { data: autos } = await db.from("ig_automacoes").select("*").order("created_at", { ascending: false });
    setAutomacoes((autos || []) as IgAutomacao[]);
    // Contagem de execuções (logs) por automação — estilo ManyChat.
    const { data: logs } = await db.from("ig_automacao_logs").select("automacao_id");
    const cont: Record<string, number> = {};
    for (const l of (logs || []) as any[]) { if (l.automacao_id) cont[l.automacao_id] = (cont[l.automacao_id] || 0) + 1; }
    setExecucoes(cont);
  }, []);

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!contaSel) { setMidias([]); return; }
    listarMidias(contaSel.ig_user_id).then(setMidias).catch(() => setMidias([]));
  }, [contaSel]);

  // ---- Conectar Instagram (reusa token Meta) ----
  const conectar = async () => {
    setConectando(true);
    try {
      const cts = await listarContas();
      if (cts.length === 0) {
        toast.error("Nenhuma conta Instagram Business encontrada. Verifique a conexão Meta em Integrações e se a Página tem um IG Business vinculado.");
      } else {
        toast.success(`${cts.length} conta(s) Instagram conectada(s).`);
      }
      await carregar(); // recarrega as contas do banco (com id) — base p/ filtrar automações
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao conectar Instagram.");
    } finally {
      setConectando(false);
    }
  };

  const ativarWebhook = async () => {
    if (!contaSel) return;
    try {
      await assinarWebhook(contaSel.ig_user_id);
      toast.success("Webhook de comentários ativado para @" + (contaSel.ig_username || contaSel.ig_user_id));
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ativar o webhook.");
    }
  };

  // ---- CRUD de automações ----
  const novaAutomacao = () => {
    if (!contaSel) { toast.error("Conecte uma conta Instagram primeiro."); return; }
    setEdit({ id: "", ...AUTOMACAO_VAZIA, ig_conta_id: null } as IgAutomacao);
  };

  // Abre uma automação existente preenchendo campos que automações antigas não tinham
  // (modo opt-in da DM, follow-up). Mantém o que já existe.
  const abrirEdicao = (a: IgAutomacao) => {
    const dmV = AUTOMACAO_VAZIA.dm_payload;
    setEdit({
      ...a,
      dm_payload: { ...dmV, ...(a.dm_payload || {}) },
      followup_ativo: a.followup_ativo ?? false,
      followup_delay_min: a.followup_delay_min ?? 60,
      followup_payload: { ...AUTOMACAO_VAZIA.followup_payload, ...(a.followup_payload || {}) },
    });
  };

  const salvar = async () => {
    if (!edit || !contaSel) return;
    setSalvando(true);
    try {
      const { data: conta } = await db.from("ig_contas").select("id").eq("ig_user_id", contaSel.ig_user_id).maybeSingle();
      const payload = {
        ig_conta_id: conta?.id ?? null,
        nome: edit.nome,
        status: edit.status,
        escopo: edit.escopo,
        media_ids: edit.media_ids,
        gatilho_tipo: edit.gatilho_tipo,
        palavras: edit.palavras,
        match_tipo: edit.match_tipo,
        responder_comentario: edit.responder_comentario,
        resposta_comentario_templates: edit.resposta_comentario_templates,
        enviar_dm: edit.enviar_dm,
        dm_payload: edit.dm_payload,
        followup_ativo: edit.followup_ativo,
        followup_delay_min: edit.followup_delay_min,
        followup_payload: edit.followup_payload,
        updated_at: new Date().toISOString(),
      };
      if (edit.id) {
        const { error } = await db.from("ig_automacoes").update(payload).eq("id", edit.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("ig_automacoes").insert(payload);
        if (error) throw error;
      }
      toast.success("Automação salva.");
      setEdit(null);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: string) => {
    const { error } = await db.from("ig_automacoes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Automação excluída.");
    await carregar();
  };

  const toggleStatus = async (a: IgAutomacao) => {
    const novo = a.status === "live" ? "pausada" : "live";
    const { error } = await db.from("ig_automacoes").update({ status: novo }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    await carregar();
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <SidebarTrigger />
            <Instagram className="h-5 w-5 text-pink-600" />
            <h1 className="text-lg font-semibold">Auto-DM Instagram</h1>
            <span className="text-sm text-muted-foreground hidden md:inline">Responda comentários e envie DMs automaticamente</span>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {/* Conexão da conta */}
            <ConexaoCard
              contas={contas} contaSel={contaSel} setContaSel={selecionarConta}
              conectando={conectando} onConectar={conectar} onAtivarWebhook={ativarWebhook}
            />

            {edit ? (
              <Editor
                edit={edit} setEdit={setEdit} midias={midias} contaSel={contaSel}
                salvando={salvando} onSalvar={salvar} onCancelar={() => setEdit(null)}
              />
            ) : (
              <ListaAutomacoes
                automacoes={automacoes.filter((a) => a.ig_conta_id === (contaSel?.id ?? null))}
                conta={contaSel} execucoes={execucoes} midias={midias} onNova={novaAutomacao}
                onEditar={abrirEdicao} onExcluir={excluir} onToggle={toggleStatus}
              />
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

// ============================================================
// Conexão da conta
// ============================================================
function ConexaoCard({ contas, contaSel, setContaSel, conectando, onConectar, onAtivarWebhook }: {
  contas: IgConta[]; contaSel: IgConta | null; setContaSel: (c: IgConta) => void;
  conectando: boolean; onConectar: () => void; onAtivarWebhook: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Plug className="h-4 w-4" /> Conta Instagram</CardTitle>
        <CardDescription>
          Reusa a conexão Meta da org. Requer Instagram Business vinculado a uma Página do Facebook e as
          permissões <code>instagram_manage_comments</code> e <code>instagram_manage_messages</code> aprovadas pela Meta.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button onClick={onConectar} disabled={conectando} variant="outline">
          {conectando ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Instagram className="h-4 w-4 mr-2" />}
          {contas.length ? "Atualizar contas" : "Conectar Instagram"}
        </Button>
        {contas.length > 0 && (
          <Select
            value={contaSel?.ig_user_id}
            onValueChange={(v) => { const c = contas.find((x) => x.ig_user_id === v); if (c) setContaSel(c); }}
          >
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.ig_user_id} value={c.ig_user_id}>@{c.ig_username || c.ig_user_id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {contaSel && (
          <Button onClick={onAtivarWebhook} variant="secondary" size="sm">
            <CheckCircle2 className="h-4 w-4 mr-2" /> Ativar webhook de comentários
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Lista de automações
// ============================================================
function ListaAutomacoes({ automacoes, conta, execucoes, midias, onNova, onEditar, onExcluir, onToggle }: {
  automacoes: IgAutomacao[]; conta: IgConta | null; execucoes: Record<string, number>; midias: IgMidia[]; onNova: () => void;
  onEditar: (a: IgAutomacao) => void; onExcluir: (id: string) => void; onToggle: (a: IgAutomacao) => void;
}) {
  const thumbDe = (a: IgAutomacao) => {
    if (a.escopo !== "post_especifico" || a.media_ids.length === 0) return null;
    return midias.find((m) => m.id === a.media_ids[0])?.thumbnail || null;
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">
          Automações {conta && <span className="text-muted-foreground font-normal">· @{conta.ig_username || conta.ig_user_id}</span>}
        </CardTitle>
        <Button onClick={onNova} size="sm"><Plus className="h-4 w-4 mr-2" /> Nova automação</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {automacoes.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma automação ainda para @{conta?.ig_username || "esta conta"}. Crie a primeira.</p>
        )}
        {/* Cabeçalho de colunas estilo ManyChat */}
        {automacoes.length > 0 && (
          <div className="hidden md:flex items-center gap-3 px-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">Nome</span>
            <span className="w-20 text-center">Execuções</span>
            <span className="w-16 text-center">Post</span>
            <span className="w-[150px]" />
          </div>
        )}
        {automacoes.map((a) => {
          const thumb = thumbDe(a);
          const execs = execucoes[a.id] || 0;
          return (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
              <Badge variant={a.status === "live" ? "default" : "secondary"}
                className={a.status === "live" ? "bg-green-600" : ""}>
                {a.status === "live" ? "LIVE" : "Pausada"}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{a.nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {a.gatilho_tipo === "palavra" ? `Palavras: ${a.palavras.join(", ") || "—"}` : "Qualquer comentário"}
                  {" · "}
                  {a.escopo === "post_especifico" ? `${a.media_ids.length} post(s)` : a.escopo === "qualquer" ? "Qualquer post" : "Próximo post"}
                </p>
              </div>
              {/* Execuções */}
              <div className="w-20 text-center shrink-0">
                <span className="text-base font-semibold tabular-nums">{execs}</span>
                <p className="text-[10px] text-muted-foreground -mt-0.5">execuções</p>
              </div>
              {/* Miniatura do post setado */}
              <div className="w-16 flex justify-center shrink-0">
                {thumb ? (
                  <img src={thumb} alt="" className="h-12 w-12 rounded-md object-cover border" />
                ) : (
                  <div className="h-12 w-12 rounded-md border bg-muted flex items-center justify-center text-muted-foreground">
                    <Instagram className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 w-[150px] justify-end">
                <Switch checked={a.status === "live"} onCheckedChange={() => onToggle(a)} />
                <Button variant="ghost" size="sm" onClick={() => onEditar(a)}>Editar</Button>
                <Button variant="ghost" size="icon" onClick={() => onExcluir(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Editor (construtor à esquerda + preview à direita)
// ============================================================
function Editor({ edit, setEdit, midias, contaSel, salvando, onSalvar, onCancelar }: {
  edit: IgAutomacao; setEdit: (a: IgAutomacao) => void; midias: IgMidia[]; contaSel: IgConta | null;
  salvando: boolean; onSalvar: () => void; onCancelar: () => void;
}) {
  const set = (patch: Partial<IgAutomacao>) => setEdit({ ...edit, ...patch });
  const [verTodas, setVerTodas] = useState(false);
  const palavrasStr = edit.palavras.join(", ");
  const respostas = edit.resposta_comentario_templates;

  const toggleMidia = (id: string) => {
    const has = edit.media_ids.includes(id);
    set({ media_ids: has ? edit.media_ids.filter((x) => x !== id) : [...edit.media_ids, id] });
  };

  const dm = edit.dm_payload;
  const setDm = (patch: Partial<DmPayload>) => set({ dm_payload: { ...dm, ...patch } });

  // Follow-up: converte minutos <-> unidade amigável para o input.
  const { valor: delayValor, unidade: delayUnidade } = deMinutos(edit.followup_delay_min);

  const midiasVisiveis = verTodas ? midias : midias.slice(0, 4);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      {/* Construtor */}
      <div className="space-y-5">
        {/* Cabeçalho: nome + status + ações */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" onClick={onCancelar}><ChevronLeft className="h-4 w-4" /></Button>
            <Input value={edit.nome} onChange={(e) => set({ nome: e.target.value })} className="font-semibold w-[280px]" />
            <Badge variant={edit.status === "live" ? "default" : "secondary"} className={edit.status === "live" ? "bg-green-600" : ""}>
              {edit.status === "live" ? "LIVE" : "Pausada"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-2">
              <Label className="text-xs">Ativar</Label>
              <Switch checked={edit.status === "live"} onCheckedChange={(v) => set({ status: v ? "live" : "pausada" })} />
            </div>
            <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
            <Button onClick={onSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
          </div>
        </div>

        {/* Bloco 1: Quando alguém faz um comentário */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Quando alguém faz um comentário</CardTitle></CardHeader>
          <CardContent>
            <RadioGroup value={edit.escopo} onValueChange={(v) => set({ escopo: v as IgAutomacao["escopo"] })} className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <RadioGroupItem value="post_especifico" className="mt-1" />
                <div className="flex-1">
                  <span className="text-sm font-medium">uma publicação ou Reel específico</span>
                  {edit.escopo === "post_especifico" && (
                    <div className="mt-3">
                      {midias.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Conecte a conta e selecione um post. (sem mídias carregadas)</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-4 gap-2">
                            {midiasVisiveis.map((m) => {
                              const sel = edit.media_ids.includes(m.id);
                              return (
                                <button type="button" key={m.id} onClick={() => toggleMidia(m.id)}
                                  className={`relative aspect-square rounded-md overflow-hidden border-2 ${sel ? "border-primary" : "border-transparent"}`}>
                                  {m.thumbnail
                                    ? <img src={m.thumbnail} alt="" className="h-full w-full object-cover" />
                                    : <div className="h-full w-full bg-muted flex items-center justify-center text-[10px]">{m.media_type}</div>}
                                  {sel && <span className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5"><CheckCircle2 className="h-3 w-3" /></span>}
                                </button>
                              );
                            })}
                          </div>
                          {midias.length > 4 && (
                            <Button variant="link" size="sm" className="px-0" onClick={() => setVerTodas((v) => !v)}>
                              {verTodas ? "Mostrar menos" : "Mostrar Todos"}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <RadioGroupItem value="qualquer" />
                <span className="text-sm">qualquer publicação ou Reel</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <RadioGroupItem value="proximo" />
                <span className="text-sm">próxima publicação ou Reel</span>
              </label>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Bloco 2: E esse comentário possui */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">E esse comentário possui</CardTitle></CardHeader>
          <CardContent>
            <RadioGroup value={edit.gatilho_tipo} onValueChange={(v) => set({ gatilho_tipo: v as IgAutomacao["gatilho_tipo"] })} className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <RadioGroupItem value="palavra" className="mt-1" />
                <div className="flex-1">
                  <span className="text-sm font-medium">uma palavra ou expressão específica</span>
                  {edit.gatilho_tipo === "palavra" && (
                    <div className="mt-3 space-y-2">
                      <Input
                        value={palavrasStr}
                        onChange={(e) => set({ palavras: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                        placeholder="Franquia, franquia"
                      />
                      <p className="text-xs text-muted-foreground">Use vírgulas para separar as palavras</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Por exemplo:</span>
                        {["Preço", "Link", "Comprar"].map((ex) => (
                          <Button key={ex} type="button" variant="outline" size="sm" className="h-6 text-xs"
                            onClick={() => set({ palavras: Array.from(new Set([...edit.palavras, ex])) })}>{ex}</Button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Label className="text-xs">Correspondência:</Label>
                        <Select value={edit.match_tipo} onValueChange={(v) => set({ match_tipo: v as IgAutomacao["match_tipo"] })}>
                          <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contem">Contém a palavra</SelectItem>
                            <SelectItem value="exato">Igual exato</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <RadioGroupItem value="qualquer_comentario" />
                <span className="text-sm">qualquer comentário</span>
              </label>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Bloco 3: Responder ao comentário */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Responder ao comentário (publicamente)</CardTitle>
            <Switch checked={edit.responder_comentario} onCheckedChange={(v) => set({ responder_comentario: v })} />
          </CardHeader>
          {edit.responder_comentario && (
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">Variações de resposta (uma é escolhida aleatoriamente a cada comentário).</p>
              {respostas.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={r} onChange={(e) => {
                    const arr = [...respostas]; arr[i] = e.target.value; set({ resposta_comentario_templates: arr });
                  }} placeholder="Te enviei no direct! 📩" />
                  <Button variant="ghost" size="icon" onClick={() => set({ resposta_comentario_templates: respostas.filter((_, x) => x !== i) })}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set({ resposta_comentario_templates: [...respostas, ""] })}>
                <Plus className="h-4 w-4 mr-2" /> Adicionar variação
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Bloco 4: Enviar DM */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Enviar mensagem no Direct (DM)</CardTitle>
            <Switch checked={edit.enviar_dm} onCheckedChange={(v) => set({ enviar_dm: v })} />
          </CardHeader>
          {edit.enviar_dm && (
            <CardContent className="space-y-4">
              {/* Modo da DM */}
              <div className="space-y-2">
                <Label className="text-xs">Como enviar</Label>
                <Select value={dm.modo} onValueChange={(v) => setDm({ modo: v as DmPayload["modo"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="optin">2 etapas (opt-in) — recomendado</SelectItem>
                    <SelectItem value="direto">DM direta com o link</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {dm.modo === "optin"
                    ? "1ª DM com um botão sem link (a pessoa toca = interação). Só depois enviamos a 2ª DM com o link — o Instagram não trata como spam."
                    : "Uma única DM já com o link no botão."}
                </p>
              </div>

              {dm.modo === "optin" ? (
                <>
                  {/* Etapa 1 — abertura/opt-in */}
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">1ª DM — abertura (sem link)</p>
                    <Textarea value={dm.optin_texto} onChange={(e) => setDm({ optin_texto: e.target.value })}
                      placeholder="TOP! Clique no botão que eu te envio o link 👇" rows={3} />
                    <div className="space-y-1">
                      <Label className="text-xs">Texto do botão (sem link)</Label>
                      <Input value={dm.optin_botao_titulo} onChange={(e) => setDm({ optin_botao_titulo: e.target.value })} placeholder="Me envie o link" />
                    </div>
                  </div>
                  {/* Etapa 2 — link */}
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">2ª DM — enviada quando a pessoa toca o botão</p>
                    <Textarea value={dm.link_texto} onChange={(e) => setDm({ link_texto: e.target.value })}
                      placeholder="Aqui está o link para você se cadastrar! 🚀" rows={3} />
                    <BotoesEditor botoes={dm.link_botoes || []} onChange={(b) => setDm({ link_botoes: b })} />
                  </div>
                </>
              ) : (
                <>
                  <Textarea value={dm.texto} onChange={(e) => setDm({ texto: e.target.value })}
                    placeholder="Aqui está o link que você pediu 👇" rows={3} />
                  <BotoesEditor botoes={dm.botoes || []} onChange={(b) => setDm({ botoes: b })} />
                </>
              )}
            </CardContent>
          )}
        </Card>

        {/* Bloco 5: Follow-up agendado */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Follow-up automático</CardTitle>
            <Switch checked={edit.followup_ativo} onCheckedChange={(v) => set({ followup_ativo: v })} />
          </CardHeader>
          {edit.followup_ativo && (
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Enviar após</Label>
                <Input type="number" min={1} className="w-24"
                  value={delayValor}
                  onChange={(e) => set({ followup_delay_min: toMinutos(Number(e.target.value) || 0, delayUnidade) })} />
                <Select value={delayUnidade} onValueChange={(u) => set({ followup_delay_min: toMinutos(delayValor, u as Unidade) })}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="min">minutos</SelectItem>
                    <SelectItem value="horas">horas</SelectItem>
                    <SelectItem value="dias">dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea value={edit.followup_payload.texto}
                onChange={(e) => set({ followup_payload: { ...edit.followup_payload, texto: e.target.value } })}
                placeholder="E aí, conseguiu se cadastrar? Qualquer dúvida me chama! 😉" rows={3} />
              <BotoesEditor botoes={edit.followup_payload.botoes || []}
                onChange={(b) => set({ followup_payload: { ...edit.followup_payload, botoes: b } })} />
              <p className="text-xs text-muted-foreground">
                Enviado para todos que receberam a DM. Obs.: fora da janela de 24h, o envio usa a tag
                "agente humano" (até 7 dias) — pode exigir aprovação da Meta em produção.
              </p>
            </CardContent>
          )}
        </Card>

        {/* Aviso permissões */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Para funcionar fora de contas de teste, o app Meta precisa ter as permissões
            <code> instagram_manage_comments</code> e <code> instagram_manage_messages</code> aprovadas (App Review).
            O DM (Private Reply) só pode ser enviado dentro da janela permitida após o comentário.
          </span>
        </div>
      </div>

      {/* Preview tipo celular */}
      <PhonePreview edit={edit} conta={contaSel} midias={midias} />
    </div>
  );
}

// Editor reutilizável de botões com link (até `max`).
function BotoesEditor({ botoes, onChange, max = 3 }: { botoes: DmBotao[]; onChange: (b: DmBotao[]) => void; max?: number }) {
  const setB = (i: number, patch: Partial<DmBotao>) => { const arr = [...botoes]; arr[i] = { ...arr[i], ...patch }; onChange(arr); };
  return (
    <div className="space-y-2">
      <Label className="text-xs">Botões com link (até {max})</Label>
      {botoes.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={b.titulo} onChange={(e) => setB(i, { titulo: e.target.value })} placeholder="Título do botão" className="w-[40%]" />
          <Input value={b.url} onChange={(e) => setB(i, { url: e.target.value })} placeholder="https://..." />
          <Button variant="ghost" size="icon" onClick={() => onChange(botoes.filter((_, x) => x !== i))}><X className="h-4 w-4" /></Button>
        </div>
      ))}
      {botoes.length < max && (
        <Button variant="outline" size="sm" onClick={() => onChange([...botoes, { titulo: "Abrir link", url: "" }])}>
          <Link2 className="h-4 w-4 mr-2" /> Adicionar botão
        </Button>
      )}
    </div>
  );
}

// ============================================================
// Preview tipo celular (publicação + comentário + DM)
// ============================================================
function PhonePreview({ edit, conta, midias }: { edit: IgAutomacao; conta: IgConta | null; midias: IgMidia[] }) {
  const username = conta?.ig_username || "suaconta";
  const capa = (edit.media_ids.length ? midias.find((m) => m.id === edit.media_ids[0]) : midias[0])?.thumbnail || null;
  const palavraExemplo = edit.palavras[0] || "Franquia";
  const resposta = edit.resposta_comentario_templates.find(Boolean) || "Te enviei no direct! 📩";
  const dmModo = edit.dm_payload?.modo === "direto" ? "direto" : (edit.dm_payload?.modo === "optin" || edit.dm_payload?.optin_texto ? "optin" : "direto");
  const dl = deMinutos(edit.followup_delay_min || 60);
  const rotuloDelay = `${dl.valor} ${dl.unidade === "min" ? "min" : dl.unidade}`;

  return (
    <div className="lg:sticky lg:top-4 h-fit">
      <div className="mx-auto w-[300px] rounded-[2rem] border-8 border-black bg-black shadow-xl overflow-hidden">
        <div className="bg-black text-white">
          <div className="flex items-center gap-2 px-3 py-2 text-xs">
            <ChevronLeft className="h-4 w-4" />
            <span className="font-semibold mx-auto">Publicação</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-600" />
            <span className="text-sm font-medium">{username}</span>
          </div>
          <div className="aspect-square bg-neutral-800 flex items-center justify-center">
            {capa ? <img src={capa} alt="" className="h-full w-full object-cover" /> : <Instagram className="h-10 w-10 text-neutral-500" />}
          </div>
          <div className="flex items-center gap-4 px-3 py-2 text-white">
            <Heart className="h-5 w-5" /> <MessageCircle className="h-5 w-5" /> <SendIcon className="h-5 w-5" />
            <Bookmark className="h-5 w-5 ml-auto" />
          </div>

          {/* Comentário do usuário + resposta automática */}
          <div className="px-3 pb-3 space-y-2 text-white text-xs">
            <div>
              <span className="font-semibold">usuario_exemplo </span>
              <span>{palavraExemplo}</span>
            </div>
            {edit.responder_comentario && (
              <div className="pl-4 text-neutral-300">
                <span className="font-semibold text-white">{username} </span>
                <span>{resposta}</span>
              </div>
            )}
          </div>

          {/* Balões de DM (fluxo) */}
          {edit.enviar_dm && (
            <div className="bg-neutral-900 px-3 py-3 border-t border-neutral-700 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">Direct</p>
              {dmModo === "optin" ? (
                <>
                  <Balao texto={edit.dm_payload.optin_texto || "Clique no botão que eu te envio o link 👇"}
                    botoes={[{ titulo: edit.dm_payload.optin_botao_titulo || "Me envie o link", url: "" }]} azul />
                  <p className="text-[9px] text-center text-neutral-500">↓ quando a pessoa toca o botão ↓</p>
                  <Balao texto={edit.dm_payload.link_texto || "Aqui está o link! 🚀"}
                    botoes={(edit.dm_payload.link_botoes || []).filter((b) => b.url)} azul />
                </>
              ) : (
                <Balao texto={edit.dm_payload.texto || "Aqui está o link 👇"}
                  botoes={(edit.dm_payload.botoes || []).filter((b) => b.url)} azul />
              )}
              {edit.followup_ativo && (
                <>
                  <p className="text-[9px] text-center text-neutral-500">↓ após {rotuloDelay} ↓</p>
                  <Balao texto={edit.followup_payload.texto || "Conseguiu se cadastrar? 😉"}
                    botoes={(edit.followup_payload.botoes || []).filter((b) => b.url)} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground mt-2">Pré-visualização</p>
    </div>
  );
}

// Um balão de mensagem no preview.
function Balao({ texto, botoes, azul }: { texto: string; botoes: DmBotao[]; azul?: boolean }) {
  return (
    <div className="bg-neutral-800 text-white text-xs rounded-2xl rounded-bl-sm px-3 py-2 max-w-[90%] whitespace-pre-wrap">
      {texto}
      {botoes.map((b, i) => (
        <div key={i} className={`mt-2 rounded-lg py-1.5 text-center text-[11px] font-medium ${azul ? "bg-blue-600" : "bg-neutral-600"}`}>
          {b.titulo || "Abrir link"}
        </div>
      ))}
    </div>
  );
}
