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
  Heart, MessageCircle, Send as SendIcon, Bookmark, ChevronLeft, X, Link2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listarContas, assinarWebhook, listarMidias, type IgConta, type IgMidia, type IgAutomacao, type DmBotao } from "@/lib/instagram";
import { toast } from "sonner";

// Tabelas novas ainda não regeneradas em supabase/types.ts — cast pontual.
const db = supabase as any;

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
  resposta_comentario_templates: ["Te enviei no direct! 📩"],
  enviar_dm: true,
  dm_payload: { texto: "Aqui está o link que você pediu 👇", botoes: [] },
};

export default function AutoDmInstagram() {
  const [contas, setContas] = useState<IgConta[]>([]);
  const [contaSel, setContaSel] = useState<IgConta | null>(null);
  const [conectando, setConectando] = useState(false);
  const [midias, setMidias] = useState<IgMidia[]>([]);

  const [automacoes, setAutomacoes] = useState<IgAutomacao[]>([]);
  const [edit, setEdit] = useState<IgAutomacao | null>(null);
  const [salvando, setSalvando] = useState(false);

  // ---- Carregamento inicial: contas conectadas (ig_contas) + automações ----
  const carregar = useCallback(async () => {
    const { data: cts } = await db.from("ig_contas").select("*").eq("ativo", true);
    const mapped: IgConta[] = (cts || []).map((c: any) => ({
      ig_user_id: c.ig_user_id, ig_username: c.ig_username, page_id: c.page_id,
      page_name: c.page_name, profile_picture_url: null,
    }));
    setContas(mapped);
    if (mapped.length && !contaSel) setContaSel(mapped[0]);
    const { data: autos } = await db.from("ig_automacoes").select("*").order("created_at", { ascending: false });
    setAutomacoes((autos || []) as IgAutomacao[]);
  }, [contaSel]);

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
      await carregar();
      setContas(cts.length ? cts : contas);
      if (cts.length) setContaSel(cts[0]);
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
              contas={contas} contaSel={contaSel} setContaSel={setContaSel}
              conectando={conectando} onConectar={conectar} onAtivarWebhook={ativarWebhook}
            />

            {edit ? (
              <Editor
                edit={edit} setEdit={setEdit} midias={midias} contaSel={contaSel}
                salvando={salvando} onSalvar={salvar} onCancelar={() => setEdit(null)}
              />
            ) : (
              <ListaAutomacoes
                automacoes={automacoes} onNova={novaAutomacao}
                onEditar={setEdit} onExcluir={excluir} onToggle={toggleStatus}
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
function ListaAutomacoes({ automacoes, onNova, onEditar, onExcluir, onToggle }: {
  automacoes: IgAutomacao[]; onNova: () => void;
  onEditar: (a: IgAutomacao) => void; onExcluir: (id: string) => void; onToggle: (a: IgAutomacao) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Automações</CardTitle>
        <Button onClick={onNova} size="sm"><Plus className="h-4 w-4 mr-2" /> Nova automação</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {automacoes.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma automação ainda. Crie a primeira.</p>
        )}
        {automacoes.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3 min-w-0">
              <Badge variant={a.status === "live" ? "default" : "secondary"}
                className={a.status === "live" ? "bg-green-600" : ""}>
                {a.status === "live" ? "LIVE" : "Pausada"}
              </Badge>
              <div className="min-w-0">
                <p className="font-medium truncate">{a.nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {a.gatilho_tipo === "palavra" ? `Palavras: ${a.palavras.join(", ") || "—"}` : "Qualquer comentário"}
                  {" · "}
                  {a.escopo === "post_especifico" ? `${a.media_ids.length} post(s)` : a.escopo === "qualquer" ? "Qualquer post" : "Próximo post"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch checked={a.status === "live"} onCheckedChange={() => onToggle(a)} />
              <Button variant="ghost" size="sm" onClick={() => onEditar(a)}>Editar</Button>
              <Button variant="ghost" size="icon" onClick={() => onExcluir(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
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

  const setBotao = (i: number, patch: Partial<DmBotao>) => {
    const botoes = [...edit.dm_payload.botoes];
    botoes[i] = { ...botoes[i], ...patch };
    set({ dm_payload: { ...edit.dm_payload, botoes } });
  };

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
            <CardContent className="space-y-3">
              <Textarea
                value={edit.dm_payload.texto}
                onChange={(e) => set({ dm_payload: { ...edit.dm_payload, texto: e.target.value } })}
                placeholder="Aqui está o link que você pediu 👇" rows={3}
              />
              <div className="space-y-2">
                <Label className="text-xs">Botões com link (até 3)</Label>
                {edit.dm_payload.botoes.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={b.titulo} onChange={(e) => setBotao(i, { titulo: e.target.value })} placeholder="Título do botão" className="w-[40%]" />
                    <Input value={b.url} onChange={(e) => setBotao(i, { url: e.target.value })} placeholder="https://..." />
                    <Button variant="ghost" size="icon" onClick={() => set({ dm_payload: { ...edit.dm_payload, botoes: edit.dm_payload.botoes.filter((_, x) => x !== i) } })}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {edit.dm_payload.botoes.length < 3 && (
                  <Button variant="outline" size="sm"
                    onClick={() => set({ dm_payload: { ...edit.dm_payload, botoes: [...edit.dm_payload.botoes, { titulo: "Abrir link", url: "" }] } })}>
                    <Link2 className="h-4 w-4 mr-2" /> Adicionar botão
                  </Button>
                )}
              </div>
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

// ============================================================
// Preview tipo celular (publicação + comentário + DM)
// ============================================================
function PhonePreview({ edit, conta, midias }: { edit: IgAutomacao; conta: IgConta | null; midias: IgMidia[] }) {
  const username = conta?.ig_username || "suaconta";
  const capa = (edit.media_ids.length ? midias.find((m) => m.id === edit.media_ids[0]) : midias[0])?.thumbnail || null;
  const palavraExemplo = edit.palavras[0] || "Franquia";
  const resposta = edit.resposta_comentario_templates.find(Boolean) || "Te enviei no direct! 📩";

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

          {/* Balão de DM */}
          {edit.enviar_dm && (
            <div className="bg-neutral-900 px-3 py-3 border-t border-neutral-700">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Direct</p>
              <div className="bg-neutral-800 text-white text-xs rounded-2xl rounded-bl-sm px-3 py-2 max-w-[85%]">
                {edit.dm_payload.texto || "Aqui está o link 👇"}
                {edit.dm_payload.botoes.filter((b) => b.url).map((b, i) => (
                  <div key={i} className="mt-2 bg-blue-600 rounded-lg py-1.5 text-center text-[11px] font-medium">{b.titulo || "Abrir link"}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground mt-2">Pré-visualização</p>
    </div>
  );
}
