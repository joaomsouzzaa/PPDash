import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KanbanSquare, List, Plus, Trash2, Bot, Send, Settings, ArrowUp, ArrowDown, Image as ImageIcon, Video, Loader2, Paperclip, Maximize2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Coluna = { id: string; nome: string; ordem: number; agente_id: string | null };
type Tarefa = { id: string; titulo: string; descricao: string | null; coluna_id: string | null; agente_id: string | null; prioridade: string; ordem: number; origem: string };
type Agente = { id: string; nome: string };
type Resposta = { id: string; autor: string | null; conteudo: string; created_at: string };
type Anexo = { id: string; tipo: string; url: string | null; status: string; created_at: string };

const PRIORIDADES: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };
const prioCor: Record<string, string> = { baixa: "secondary", media: "outline", alta: "destructive" };

export default function Workflow() {
  // v4 build check

  const queryClient = useQueryClient();
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const { data: colunas = [] } = useQuery({
    queryKey: ["kanban_colunas"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("kanban_colunas").select("*").order("ordem");
      return (data || []) as Coluna[];
    },
  });
  const { data: tarefas = [] } = useQuery({
    queryKey: ["tarefas"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tarefas").select("*").order("ordem");
      return (data || []) as Tarefa[];
    },
    refetchInterval: 15000, // pega tarefas criadas pelos agentes
  });
  const { data: agentes = [] } = useQuery({
    queryKey: ["agentes-min"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("agentes").select("id,nome").order("created_at");
      return (data || []) as Agente[];
    },
  });

  const agenteNome = (id: string | null) => agentes.find((a) => a.id === id)?.nome;
  const colunaNome = (id: string | null) => colunas.find((c) => c.id === id)?.nome;

  // ---- Dialog da tarefa ----
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tarefa | null>(null);
  const emptyForm = { titulo: "", descricao: "", coluna_id: "", agente_id: "", prioridade: "media" };
  const [form, setForm] = useState({ ...emptyForm });
  const [comentario, setComentario] = useState("");

  const { data: respostas = [] } = useQuery({
    queryKey: ["respostas", editing?.id],
    enabled: !!editing,
    queryFn: async () => {
      const { data } = await (supabase as any).from("tarefa_respostas").select("*").eq("tarefa_id", editing!.id).order("created_at");
      return (data || []) as Resposta[];
    },
  });

  const { data: anexos = [] } = useQuery({
    queryKey: ["anexos", editing?.id],
    enabled: !!editing,
    refetchInterval: (q) => ((q.state.data as Anexo[] | undefined)?.some((a) => a.status === "gerando") ? 4000 : false),
    queryFn: async () => {
      const { data } = await (supabase as any).from("tarefa_anexos").select("*").eq("tarefa_id", editing!.id).order("created_at", { ascending: false });
      return (data || []) as Anexo[];
    },
  });

  // Etapa de design? (compara pelo nome da coluna selecionada no form)
  const etapaNome = colunas.find((c) => c.id === form.coluna_id)?.nome || "";
  const isDesign = /design|arte/i.test(etapaNome);

  const [gerando, setGerando] = useState<"imagem" | "video" | null>(null);
  const [provider, setProvider] = useState<"higgsfield" | "openai">("higgsfield");
  const [projetoId, setProjetoId] = useState<string>("_auto");
  const [lightbox, setLightbox] = useState<Anexo | null>(null);

  const { data: projetos = [] } = useQuery({
    queryKey: ["projetos_design_min"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("projetos_design").select("id,nome").order("created_at", { ascending: false });
      return (data || []) as { id: string; nome: string }[];
    },
  });

  const gerarArte = async (tipo: "imagem" | "video") => {
    if (!editing) { toast.error("Salve a tarefa antes de gerar a arte"); return; }
    setGerando(tipo);
    const { data, error } = await (supabase as any).functions.invoke("gerar-arte-higgsfield", {
      body: {
        tarefa_id: editing.id, tipo,
        provider: tipo === "video" ? "higgsfield" : provider,
        projeto_id: (projetoId === "_none" || projetoId === "_auto") ? null : projetoId,
        auto_marca: projetoId === "_auto",
      },
    });
    setGerando(null);
    if (error || data?.ok === false) {
      // Supabase esconde o corpo em FunctionsHttpError; lê do context p/ ver a causa real.
      let msg = data?.error || error?.message || "falhou";
      try { const b = await (error as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
      toast.error(`Erro ao gerar arte: ${msg}`, { duration: 10000 });
    } else {
      toast.success(`Arte (${tipo}) gerada!`);
    }
    queryClient.invalidateQueries({ queryKey: ["anexos", editing.id] });
    queryClient.invalidateQueries({ queryKey: ["respostas", editing.id] });
  };

  const novaTarefa = (colunaId?: string) => {
    setEditing(null);
    setForm({ ...emptyForm, coluna_id: colunaId || colunas[0]?.id || "" });
    setComentario("");
    setOpen(true);
  };
  const abrirTarefa = (t: Tarefa) => {
    setEditing(t);
    setForm({ titulo: t.titulo, descricao: t.descricao || "", coluna_id: t.coluna_id || "", agente_id: t.agente_id || "", prioridade: t.prioridade || "media" });
    setComentario("");
    setOpen(true);
  };

  const salvar = async () => {
    if (!form.titulo.trim()) { toast.error("Informe o título"); return; }
    const payload = {
      titulo: form.titulo.trim(), descricao: form.descricao || null,
      coluna_id: form.coluna_id || null, agente_id: form.agente_id || null, prioridade: form.prioridade,
      updated_at: new Date().toISOString(),
    };
    const res = editing
      ? await (supabase as any).from("tarefas").update(payload).eq("id", editing.id)
      : await (supabase as any).from("tarefas").insert({ ...payload, origem: "manual" });
    if (res.error) { toast.error("Erro ao salvar tarefa"); return; }
    toast.success("Tarefa salva");
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["tarefas"] });
  };

  const excluir = async () => {
    if (!editing) return;
    await (supabase as any).from("tarefa_respostas").delete().eq("tarefa_id", editing.id);
    await (supabase as any).from("tarefas").delete().eq("id", editing.id);
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["tarefas"] });
    toast.success("Tarefa excluída");
  };

  const addComentario = async () => {
    if (!editing || !comentario.trim()) return;
    await (supabase as any).from("tarefa_respostas").insert({ tarefa_id: editing.id, autor: "Você", conteudo: comentario.trim() });
    setComentario("");
    queryClient.invalidateQueries({ queryKey: ["respostas", editing.id] });
  };

  const moverPara = async (tarefaId: string, colunaId: string) => {
    await (supabase as any).from("tarefas").update({ coluna_id: colunaId, updated_at: new Date().toISOString() }).eq("id", tarefaId);
    queryClient.invalidateQueries({ queryKey: ["tarefas"] });
  };

  // ---- Gestão de colunas ----
  const [colsOpen, setColsOpen] = useState(false);
  const invCols = () => queryClient.invalidateQueries({ queryKey: ["kanban_colunas"] });
  const addColuna = async () => {
    const maxOrdem = colunas.reduce((m, c) => Math.max(m, c.ordem), -1);
    await (supabase as any).from("kanban_colunas").insert({ nome: "Nova coluna", ordem: maxOrdem + 1 });
    invCols();
  };
  const updateColuna = async (id: string, patch: Partial<Coluna>) => {
    await (supabase as any).from("kanban_colunas").update(patch).eq("id", id);
    invCols();
  };
  const moveColuna = async (id: string, dir: "up" | "down") => {
    const sorted = [...colunas].sort((a, b) => a.ordem - b.ordem);
    const idx = sorted.findIndex((c) => c.id === id);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= sorted.length) return;
    const a = sorted[idx], b = sorted[swap];
    await (supabase as any).from("kanban_colunas").update({ ordem: b.ordem }).eq("id", a.id);
    await (supabase as any).from("kanban_colunas").update({ ordem: a.ordem }).eq("id", b.id);
    invCols();
  };
  const deleteColuna = async (id: string) => {
    const rest = colunas.filter((c) => c.id !== id).sort((a, b) => a.ordem - b.ordem);
    if (rest.length) await (supabase as any).from("tarefas").update({ coluna_id: rest[0].id }).eq("coluna_id", id);
    await (supabase as any).from("kanban_colunas").delete().eq("id", id);
    invCols();
    queryClient.invalidateQueries({ queryKey: ["tarefas"] });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="shrink-0 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><KanbanSquare className="h-5 w-5 text-primary" /> Workflow</h1>
              <p className="text-sm text-muted-foreground">Tarefas do time e dos agentes (Kanban / Lista)</p>
            </div>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button onClick={() => setView("kanban")} className={`px-3 py-1.5 text-sm flex items-center gap-1 ${view === "kanban" ? "bg-accent" : "hover:bg-accent/60"}`}><KanbanSquare className="h-4 w-4" /> Kanban</button>
              <button onClick={() => setView("lista")} className={`px-3 py-1.5 text-sm flex items-center gap-1 ${view === "lista" ? "bg-accent" : "hover:bg-accent/60"}`}><List className="h-4 w-4" /> Lista</button>
            </div>
            <Button variant="outline" onClick={() => setColsOpen(true)}><Settings className="mr-2 h-4 w-4" /> Colunas</Button>
            <Button onClick={() => novaTarefa()}><Plus className="mr-2 h-4 w-4" /> Nova tarefa</Button>
          </header>

          {colunas.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center text-muted-foreground p-8">
              <div>
                <p className="font-medium">Nenhuma coluna configurada</p>
                <p className="text-sm">Rode o SQL do Workflow para criar as colunas (Briefing → Copy → Design → Tráfego → Concluído).</p>
              </div>
            </div>
          ) : view === "kanban" ? (
            <div className="flex-1 overflow-x-auto p-6">
              <div className="flex gap-4 h-full min-w-min">
                {colunas.map((col) => {
                  const cards = tarefas.filter((t) => t.coluna_id === col.id);
                  return (
                    <div key={col.id} className={`w-72 shrink-0 flex flex-col rounded-xl border transition-colors ${dragOverCol === col.id ? "bg-primary/10 border-primary" : "bg-muted/40 border-border"}`}
                      onDragOver={(e) => { e.preventDefault(); if (dragOverCol !== col.id) setDragOverCol(col.id); }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol((c) => (c === col.id ? null : c)); }}
                      onDrop={() => { if (dragId) { moverPara(dragId, col.id); } setDragId(null); setDragOverCol(null); }}>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                        <span className="font-medium text-sm">{col.nome} <span className="text-muted-foreground">({cards.length})</span></span>
                        <button onClick={() => novaTarefa(col.id)} className="text-muted-foreground hover:text-foreground"><Plus className="h-4 w-4" /></button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {cards.map((t) => (
                          <Card key={t.id} draggable
                            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); setDragId(t.id); }}
                            onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                            onClick={() => abrirTarefa(t)}
                            className={`cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all ${dragId === t.id ? "opacity-40 ring-2 ring-primary" : ""}`}>
                            <CardContent className="p-3 space-y-2">
                              <p className="text-sm font-medium leading-tight">{t.titulo}</p>
                              {t.descricao && <p className="text-xs text-muted-foreground line-clamp-2">{t.descricao}</p>}
                              <div className="flex items-center gap-1 flex-wrap">
                                <Badge variant={prioCor[t.prioridade] as any} className="text-[10px]">{PRIORIDADES[t.prioridade] || t.prioridade}</Badge>
                                {t.agente_id && <Badge variant="secondary" className="text-[10px] flex items-center gap-1"><Bot className="h-3 w-3" />{agenteNome(t.agente_id)}</Badge>}
                                {t.origem === "delegacao" && <Badge variant="outline" className="text-[10px]">auto</Badge>}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        {cards.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Vazio</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-6">
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Tarefa</TableHead><TableHead>Etapa</TableHead><TableHead>Responsável</TableHead><TableHead>Prioridade</TableHead><TableHead>Origem</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {tarefas.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma tarefa ainda.</TableCell></TableRow>
                    ) : tarefas.map((t) => (
                      <TableRow key={t.id} className="cursor-pointer" onClick={() => abrirTarefa(t)}>
                        <TableCell className="font-medium">{t.titulo}</TableCell>
                        <TableCell>{colunaNome(t.coluna_id) || "—"}</TableCell>
                        <TableCell>{agenteNome(t.agente_id) || "—"}</TableCell>
                        <TableCell><Badge variant={prioCor[t.prioridade] as any} className="text-[10px]">{PRIORIDADES[t.prioridade] || t.prioridade}</Badge></TableCell>
                        <TableCell>{t.origem === "delegacao" ? "Agente" : "Manual"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Gestão de colunas */}
      <Dialog open={colsOpen} onOpenChange={setColsOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Colunas do quadro</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Defina as etapas e vincule o agente responsável por cada uma. Quando o CEO delegar a um agente,
            a tarefa nasce automaticamente na coluna vinculada a ele.
          </p>
          <div className="space-y-2">
            {[...colunas].sort((a, b) => a.ordem - b.ordem).map((c, i, arr) => (
              <div key={c.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                <div className="flex flex-col">
                  <button disabled={i === 0} onClick={() => moveColuna(c.id, "up")} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button disabled={i === arr.length - 1} onClick={() => moveColuna(c.id, "down")} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                </div>
                <Input key={c.nome} defaultValue={c.nome} className="flex-1"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.nome) updateColuna(c.id, { nome: v }); }} />
                <Select value={c.agente_id || "_none"} onValueChange={(v) => updateColuna(c.id, { agente_id: v === "_none" ? null : v } as any)}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Agente" /></SelectTrigger>
                  <SelectContent><SelectItem value="_none">— sem agente</SelectItem>{agentes.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteColuna(c.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <DialogFooter className="flex sm:justify-between">
            <Button variant="outline" onClick={addColuna}><Plus className="mr-2 h-4 w-4" /> Adicionar coluna</Button>
            <Button onClick={() => setColsOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Popup da tarefa */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Tarefa" : "Nova tarefa"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1"><Label>Título</Label><Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex: Copy do Workshop Brasília" /></div>
            <div className="space-y-1"><Label>Descrição / Briefing</Label><Textarea rows={4} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Briefing da tarefa..." /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Etapa</Label>
                <Select value={form.coluna_id} onValueChange={(v) => setForm({ ...form, coluna_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Coluna" /></SelectTrigger>
                  <SelectContent>{colunas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Responsável</Label>
                <Select value={form.agente_id || "_none"} onValueChange={(v) => setForm({ ...form, agente_id: v === "_none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Agente" /></SelectTrigger>
                  <SelectContent><SelectItem value="_none">—</SelectItem>{agentes.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Prioridade</Label>
                <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PRIORIDADES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {editing && isDesign && (
              <div className="space-y-2 border-t border-border pt-3">
                <Label className="flex items-center gap-2"><Paperclip className="h-4 w-4 text-primary" /> Design — gerar arte</Label>
                <p className="text-xs text-muted-foreground">Usa o briefing/copy desta tarefa como prompt e anexa a arte aqui.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={provider} onValueChange={(v) => setProvider(v as any)}>
                    <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="higgsfield">Higgsfield</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={projetoId} onValueChange={setProjetoId}>
                    <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Projeto/Marca" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_auto">Automático (briefing)</SelectItem>
                      <SelectItem value="_none">Sem marca</SelectItem>
                      {projetos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" disabled={!!gerando} onClick={() => gerarArte("imagem")}>
                    {gerando === "imagem" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />} Gerar imagem
                  </Button>
                  <Button variant="outline" size="sm" disabled={!!gerando} title={provider === "openai" ? "Vídeo só no Higgsfield" : undefined} onClick={() => gerarArte("video")}>
                    {gerando === "video" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />} Gerar vídeo
                  </Button>
                </div>
                {provider === "openai" && <p className="text-[11px] text-muted-foreground">OpenAI gera só imagem — o botão de vídeo usa o Higgsfield.</p>}
                {(gerando || anexos.length > 0) && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {gerando && !anexos.some((a) => a.status === "gerando") && (
                      <div className="rounded-md border border-border overflow-hidden bg-muted/40">
                        <div className="aspect-square flex flex-col items-center justify-center gap-1 text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span className="text-[10px]">gerando…</span>
                        </div>
                      </div>
                    )}
                    {anexos.map((a) => (
                      <div key={a.id} className="rounded-md border border-border overflow-hidden bg-muted/40">
                        {a.status === "gerando" ? (
                          <div className="aspect-square flex flex-col items-center justify-center gap-1 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-[10px]">gerando…</span>
                          </div>
                        ) : a.status === "erro" ? (
                          <div className="aspect-square flex items-center justify-center text-xs text-destructive p-2 text-center">Erro</div>
                        ) : (
                          <button type="button" onClick={() => setLightbox(a)} className="block w-full group relative">
                            {a.tipo === "video"
                              ? <video src={a.url!} className="w-full aspect-square object-cover" />
                              : <img src={a.url!} alt="arte" className="w-full aspect-square object-cover" />}
                            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <Maximize2 className="h-5 w-5 text-white" />
                            </span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {editing && (
              <div className="space-y-2 border-t border-border pt-3">
                <Label>Histórico / Respostas</Label>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {respostas.length === 0 ? <p className="text-xs text-muted-foreground">Sem respostas ainda.</p> :
                    respostas.map((r) => (
                      <div key={r.id} className="rounded-md border border-border p-2">
                        <p className="text-xs font-medium text-primary">{r.autor || "—"} <span className="text-muted-foreground font-normal">· {new Date(r.created_at).toLocaleString("pt-BR")}</span></p>
                        <p className="text-sm whitespace-pre-wrap mt-1">{r.conteudo}</p>
                      </div>
                    ))}
                </div>
                <div className="flex gap-2">
                  <Input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Adicionar comentário..." onKeyDown={(e) => { if (e.key === "Enter") addComentario(); }} />
                  <Button variant="outline" size="icon" onClick={addComentario}><Send className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex sm:justify-between">
            {editing ? <Button variant="ghost" className="text-destructive" onClick={excluir}><Trash2 className="mr-2 h-4 w-4" /> Excluir</Button> : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
              <Button onClick={salvar}>Salvar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox da arte gerada */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Arte gerada</DialogTitle></DialogHeader>
          {lightbox?.url && (
            <div className="space-y-3">
              <div className="flex items-center justify-center bg-muted/40 rounded-lg overflow-hidden max-h-[70vh]">
                {lightbox.tipo === "video"
                  ? <video src={lightbox.url} controls className="max-h-[70vh] w-auto" />
                  : <img src={lightbox.url} alt="arte" className="max-h-[70vh] w-auto object-contain" />}
              </div>
              <div className="flex justify-end">
                <Button asChild variant="outline" size="sm">
                  <a href={lightbox.url} target="_blank" rel="noreferrer" download><Download className="mr-2 h-4 w-4" /> Baixar / abrir</a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
