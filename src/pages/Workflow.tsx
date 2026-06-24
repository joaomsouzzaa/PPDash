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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { KanbanSquare, List, Plus, Trash2, Bot, Send, Settings, ArrowUp, ArrowDown, Image as ImageIcon, Video, Loader2, Paperclip, Maximize2, Download, Trash, RotateCcw, Calendar as CalendarIcon, Clock, Flag, Tag, User, ListChecks, GitBranch, X } from "lucide-react";
import { IgPostMockup } from "@/components/IgPostMockup";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Coluna = { id: string; nome: string; ordem: number; agente_id: string | null };
type Tarefa = { id: string; titulo: string; descricao: string | null; coluna_id: string | null; agente_id: string | null; prioridade: string; ordem: number; origem: string; data_inicio: string | null; data_vencimento: string | null; tempo_estimado: number | null; etiquetas: string[] | null; legenda: string | null };
type Agente = { id: string; nome: string };
type Resposta = { id: string; autor: string | null; conteudo: string; created_at: string };
type Anexo = { id: string; tipo: string; url: string | null; status: string; created_at: string };
type Subtarefa = { id: string; titulo: string; concluida: boolean; ordem: number };
type ChecklistItem = { id: string; item: string; concluido: boolean; ordem: number };
type IgConta = { id: string; ig_user_id: string; ig_username: string | null };
type IgPost = { id: string; tipo: string; status: string; permalink: string | null; erro: string | null; publish_at: string | null; created_at: string };

const PRIORIDADES: Record<string, string> = { urgente: "Urgente", alta: "Alta", normal: "Normal", baixa: "Baixa" };
// classes Tailwind no estilo ClickUp (vermelho / amarelo / azul / cinza)
const prioClasse: Record<string, string> = {
  urgente: "bg-red-500/15 text-red-500 border-red-500/30",
  alta: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  normal: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  baixa: "bg-muted text-muted-foreground border-border",
};

export default function Workflow() {
  // v4 build check

  const queryClient = useQueryClient();
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const { data: colunas = [] } = useQuery({
    queryKey: ["kanban_colunas"],
    queryFn: async () => {
      const { data } = await supabase.from("kanban_colunas").select("*").order("ordem");
      return (data || []) as Coluna[];
    },
  });
  const { data: tarefas = [] } = useQuery({
    queryKey: ["tarefas"],
    queryFn: async () => {
      const { data } = await supabase.from("tarefas").select("*").is("deleted_at", null).order("ordem");
      return (data || []) as Tarefa[];
    },
    refetchInterval: 15000, // pega tarefas criadas pelos agentes
  });
  const { data: agentes = [] } = useQuery({
    queryKey: ["agentes-min"],
    queryFn: async () => {
      const { data } = await supabase.from("agentes").select("id,nome").order("created_at");
      return (data || []) as Agente[];
    },
  });

  const agenteNome = (id: string | null) => agentes.find((a) => a.id === id)?.nome;
  const colunaNome = (id: string | null) => colunas.find((c) => c.id === id)?.nome;

  // ---- Dialog da tarefa ----
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tarefa | null>(null);
  const emptyForm = { titulo: "", descricao: "", coluna_id: "", agente_id: "", prioridade: "normal", data_inicio: "", data_vencimento: "", tempo_estimado: "" as string, etiquetas: [] as string[], legenda: "" };
  const [form, setForm] = useState({ ...emptyForm });
  const [comentario, setComentario] = useState("");

  const { data: respostas = [] } = useQuery({
    queryKey: ["respostas", editing?.id],
    enabled: !!editing,
    queryFn: async () => {
      const { data } = await supabase.from("tarefa_respostas").select("*").eq("tarefa_id", editing!.id).order("created_at");
      return (data || []) as Resposta[];
    },
  });

  const { data: anexos = [] } = useQuery({
    queryKey: ["anexos", editing?.id],
    enabled: !!editing,
    refetchInterval: (q) => ((q.state.data as Anexo[] | undefined)?.some((a) => a.status === "gerando") ? 4000 : false),
    queryFn: async () => {
      const { data } = await supabase.from("tarefa_anexos").select("*").eq("tarefa_id", editing!.id).order("created_at", { ascending: false });
      return (data || []) as Anexo[];
    },
  });

  const { data: subtarefas = [] } = useQuery({
    queryKey: ["subtarefas", editing?.id],
    enabled: !!editing,
    queryFn: async () => {
      const { data } = await supabase.from("tarefa_subtarefas").select("*").eq("tarefa_id", editing!.id).order("ordem");
      return (data || []) as Subtarefa[];
    },
  });
  const { data: checklist = [] } = useQuery({
    queryKey: ["checklist", editing?.id],
    enabled: !!editing,
    queryFn: async () => {
      const { data } = await supabase.from("tarefa_checklist").select("*").eq("tarefa_id", editing!.id).order("ordem");
      return (data || []) as ChecklistItem[];
    },
  });
  const [novaSub, setNovaSub] = useState("");
  const [novoCheck, setNovoCheck] = useState("");
  const [novaTag, setNovaTag] = useState("");

  const addSubtarefa = async () => {
    if (!editing || !novaSub.trim()) return;
    await supabase.from("tarefa_subtarefas").insert({ tarefa_id: editing.id, titulo: novaSub.trim(), ordem: subtarefas.length });
    setNovaSub("");
    queryClient.invalidateQueries({ queryKey: ["subtarefas", editing.id] });
  };
  const toggleSubtarefa = async (s: Subtarefa) => {
    await supabase.from("tarefa_subtarefas").update({ concluida: !s.concluida }).eq("id", s.id);
    queryClient.invalidateQueries({ queryKey: ["subtarefas", editing!.id] });
  };
  const delSubtarefa = async (s: Subtarefa) => {
    await supabase.from("tarefa_subtarefas").delete().eq("id", s.id);
    queryClient.invalidateQueries({ queryKey: ["subtarefas", editing!.id] });
  };
  const addCheck = async () => {
    if (!editing || !novoCheck.trim()) return;
    await supabase.from("tarefa_checklist").insert({ tarefa_id: editing.id, item: novoCheck.trim(), ordem: checklist.length });
    setNovoCheck("");
    queryClient.invalidateQueries({ queryKey: ["checklist", editing.id] });
  };
  const toggleCheck = async (c: ChecklistItem) => {
    await supabase.from("tarefa_checklist").update({ concluido: !c.concluido }).eq("id", c.id);
    queryClient.invalidateQueries({ queryKey: ["checklist", editing!.id] });
  };
  const delCheck = async (c: ChecklistItem) => {
    await supabase.from("tarefa_checklist").delete().eq("id", c.id);
    queryClient.invalidateQueries({ queryKey: ["checklist", editing!.id] });
  };
  const addTag = () => {
    const v = novaTag.trim();
    if (!v || form.etiquetas.includes(v)) { setNovaTag(""); return; }
    setForm({ ...form, etiquetas: [...form.etiquetas, v] });
    setNovaTag("");
  };
  const removeTag = (t: string) => setForm({ ...form, etiquetas: form.etiquetas.filter((x) => x !== t) });
  const fmtData = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const estaAtrasada = (d: string | null) => !!d && d < new Date().toISOString().slice(0, 10);

  // ---- Publicar no Instagram ----
  const { data: igContas = [] } = useQuery({
    queryKey: ["ig_contas_min"],
    queryFn: async () => {
      const { data } = await supabase.from("ig_contas").select("id,ig_user_id,ig_username").eq("ativo", true).order("created_at");
      return (data || []) as IgConta[];
    },
  });
  const { data: igPosts = [] } = useQuery({
    queryKey: ["ig_posts", editing?.id],
    enabled: !!editing,
    refetchInterval: (q) => ((q.state.data as IgPost[] | undefined)?.some((p) => p.status === "pendente" || p.status === "processando") ? 5000 : false),
    queryFn: async () => {
      const { data } = await supabase.from("ig_posts").select("id,tipo,status,permalink,erro,publish_at,created_at").eq("tarefa_id", editing!.id).order("created_at", { ascending: false });
      return (data || []) as IgPost[];
    },
  });
  const [igContaId, setIgContaId] = useState<string>("");
  const [igSelecao, setIgSelecao] = useState<string[]>([]);  // urls escolhidas, em ordem
  const [igPublishAt, setIgPublishAt] = useState<string>(""); // datetime-local
  const [igEnviando, setIgEnviando] = useState(false);

  const toggleMidia = (url: string) =>
    setIgSelecao((s) => (s.includes(url) ? s.filter((x) => x !== url) : [...s, url]));

  const publicarIg = async (action: "publicar_agora" | "agendar") => {
    if (!editing) return;
    if (!igContaId) { toast.error("Selecione a conta do Instagram"); return; }
    const midias = igSelecao.length ? igSelecao : anexos.filter((a) => a.status === "pronto" && a.url).map((a) => a.url!) ;
    if (midias.length === 0) { toast.error("Selecione ao menos uma arte pronta"); return; }
    if (action === "agendar" && !igPublishAt) { toast.error("Escolha a data/hora do agendamento"); return; }
    const temVideo = anexos.some((a) => midias.includes(a.url!) && a.tipo === "video");
    const tipo = temVideo ? "reels" : midias.length > 1 ? "carrossel" : "imagem";
    setIgEnviando(true);
    const { data, error } = await supabase.functions.invoke("instagram-publish", {
      body: {
        action, tarefa_id: editing.id, ig_conta_id: igContaId, tipo,
        legenda: form.legenda || null, midias,
        publish_at: action === "agendar" ? new Date(igPublishAt).toISOString() : null,
      },
    });
    setIgEnviando(false);
    if (error || data?.error) {
      let msg = data?.error || error?.message || "falhou";
      try { const b = await (error as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
      toast.error(`Erro ao publicar: ${msg}`, { duration: 10000 });
    } else {
      toast.success(action === "agendar" ? "Post agendado!" : data?.processando ? "Publicando (vídeo processando)…" : "Post publicado!");
      setIgSelecao([]); setIgPublishAt("");
    }
    queryClient.invalidateQueries({ queryKey: ["ig_posts", editing.id] });
  };
  const cancelarIgPost = async (id: string) => {
    await supabase.functions.invoke("instagram-publish", { body: { action: "cancelar", id } });
    queryClient.invalidateQueries({ queryKey: ["ig_posts", editing!.id] });
  };

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
      const { data } = await supabase.from("projetos_design").select("id,nome").order("created_at", { ascending: false });
      return (data || []) as { id: string; nome: string }[];
    },
  });

  const gerarArte = async (tipo: "imagem" | "video") => {
    if (!editing) { toast.error("Salve a tarefa antes de gerar a arte"); return; }
    setGerando(tipo);
    const { data, error } = await supabase.functions.invoke("gerar-arte-higgsfield", {
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
    setForm({ titulo: t.titulo, descricao: t.descricao || "", coluna_id: t.coluna_id || "", agente_id: t.agente_id || "", prioridade: t.prioridade || "normal", data_inicio: t.data_inicio || "", data_vencimento: t.data_vencimento || "", tempo_estimado: t.tempo_estimado != null ? String(t.tempo_estimado) : "", etiquetas: t.etiquetas || [], legenda: t.legenda || "" });
    setComentario("");
    setOpen(true);
  };

  const salvar = async () => {
    if (!form.titulo.trim()) { toast.error("Informe o título"); return; }
    const payload = {
      titulo: form.titulo.trim(), descricao: form.descricao || null,
      coluna_id: form.coluna_id || null, agente_id: form.agente_id || null, prioridade: form.prioridade,
      data_inicio: form.data_inicio || null, data_vencimento: form.data_vencimento || null,
      tempo_estimado: form.tempo_estimado.trim() ? parseInt(form.tempo_estimado, 10) : null,
      etiquetas: form.etiquetas, legenda: form.legenda || null,
      updated_at: new Date().toISOString(),
    };
    const res = editing
      ? await supabase.from("tarefas").update(payload).eq("id", editing.id)
      : await supabase.from("tarefas").insert({ ...payload, origem: "manual" });
    if (res.error) { toast.error("Erro ao salvar tarefa"); return; }
    toast.success("Tarefa salva");
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["tarefas"] });
  };

  // Exclusão = soft delete (vai pra lixeira, recuperável). Mantém as respostas.
  const excluir = async () => {
    if (!editing) return;
    await supabase.from("tarefas").update({ deleted_at: new Date().toISOString() }).eq("id", editing.id);
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["tarefas"] });
    queryClient.invalidateQueries({ queryKey: ["tarefas-lixeira"] });
    toast.success("Tarefa movida para a lixeira");
  };

  // ---- Lixeira ----
  const [lixeiraOpen, setLixeiraOpen] = useState(false);
  const { data: lixeira = [] } = useQuery({
    queryKey: ["tarefas-lixeira"],
    enabled: lixeiraOpen,
    queryFn: async () => {
      const { data } = await supabase.from("tarefas").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
      return (data || []) as Tarefa[];
    },
  });
  const invLixeira = () => {
    queryClient.invalidateQueries({ queryKey: ["tarefas"] });
    queryClient.invalidateQueries({ queryKey: ["tarefas-lixeira"] });
  };
  const restaurar = async (t: Tarefa) => {
    await supabase.from("tarefas").update({ deleted_at: null }).eq("id", t.id);
    invLixeira();
    toast.success("Tarefa restaurada");
  };
  const excluirDefinitivo = async (t: Tarefa) => {
    if (!confirm(`Excluir definitivamente "${t.titulo}"? Não dá para recuperar.`)) return;
    await supabase.from("tarefa_respostas").delete().eq("tarefa_id", t.id);
    await supabase.from("tarefa_anexos").delete().eq("tarefa_id", t.id);
    await supabase.from("tarefas").delete().eq("id", t.id);
    invLixeira();
    toast.success("Tarefa excluída definitivamente");
  };

  const addComentario = async () => {
    if (!editing || !comentario.trim()) return;
    await supabase.from("tarefa_respostas").insert({ tarefa_id: editing.id, autor: "Você", conteudo: comentario.trim() });
    setComentario("");
    queryClient.invalidateQueries({ queryKey: ["respostas", editing.id] });
  };

  const moverPara = async (tarefaId: string, colunaId: string) => {
    await supabase.from("tarefas").update({ coluna_id: colunaId, updated_at: new Date().toISOString() }).eq("id", tarefaId);
    queryClient.invalidateQueries({ queryKey: ["tarefas"] });
  };

  // ---- Gestão de colunas ----
  const [colsOpen, setColsOpen] = useState(false);
  const invCols = () => queryClient.invalidateQueries({ queryKey: ["kanban_colunas"] });
  const addColuna = async () => {
    const maxOrdem = colunas.reduce((m, c) => Math.max(m, c.ordem), -1);
    await supabase.from("kanban_colunas").insert({ nome: "Nova coluna", ordem: maxOrdem + 1 });
    invCols();
  };
  const updateColuna = async (id: string, patch: Partial<Coluna>) => {
    await supabase.from("kanban_colunas").update(patch).eq("id", id);
    invCols();
  };
  const moveColuna = async (id: string, dir: "up" | "down") => {
    const sorted = [...colunas].sort((a, b) => a.ordem - b.ordem);
    const idx = sorted.findIndex((c) => c.id === id);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= sorted.length) return;
    const a = sorted[idx], b = sorted[swap];
    await supabase.from("kanban_colunas").update({ ordem: b.ordem }).eq("id", a.id);
    await supabase.from("kanban_colunas").update({ ordem: a.ordem }).eq("id", b.id);
    invCols();
  };
  const deleteColuna = async (id: string) => {
    const rest = colunas.filter((c) => c.id !== id).sort((a, b) => a.ordem - b.ordem);
    if (rest.length) await supabase.from("tarefas").update({ coluna_id: rest[0].id }).eq("coluna_id", id);
    await supabase.from("kanban_colunas").delete().eq("id", id);
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
            <Button variant="outline" onClick={() => setLixeiraOpen(true)}><Trash className="mr-2 h-4 w-4" /> Lixeira</Button>
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
                                {t.data_vencimento && <Badge variant="outline" className={`text-[10px] flex items-center gap-1 ${estaAtrasada(t.data_vencimento) ? "text-red-500 border-red-500/40" : ""}`}><CalendarIcon className="h-3 w-3" />{fmtData(t.data_vencimento)}</Badge>}
                                <Badge variant="outline" className={`text-[10px] border ${prioClasse[t.prioridade] || ""}`}>{PRIORIDADES[t.prioridade] || t.prioridade}</Badge>
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
                    <TableRow><TableHead>Tarefa</TableHead><TableHead>Etapa</TableHead><TableHead>Responsável</TableHead><TableHead>Vencimento</TableHead><TableHead>Prioridade</TableHead><TableHead>Origem</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {tarefas.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma tarefa ainda.</TableCell></TableRow>
                    ) : tarefas.map((t) => (
                      <TableRow key={t.id} className="cursor-pointer" onClick={() => abrirTarefa(t)}>
                        <TableCell className="font-medium">{t.titulo}</TableCell>
                        <TableCell>{colunaNome(t.coluna_id) || "—"}</TableCell>
                        <TableCell>{agenteNome(t.agente_id) || "—"}</TableCell>
                        <TableCell className={estaAtrasada(t.data_vencimento) ? "text-red-500" : ""}>{t.data_vencimento ? fmtData(t.data_vencimento) : "—"}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] border ${prioClasse[t.prioridade] || ""}`}>{PRIORIDADES[t.prioridade] || t.prioridade}</Badge></TableCell>
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
          <DialogHeader className="sr-only"><DialogTitle>{editing ? "Tarefa" : "Nova tarefa"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Título grande sem borda (estilo ClickUp) */}
            <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Nome da Tarefa"
              className="border-0 px-0 text-lg font-medium shadow-none focus-visible:ring-0 h-auto" />
            {/* Descrição sem borda */}
            <Textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Adicione uma descrição..."
              className="border-0 px-0 shadow-none resize-none focus-visible:ring-0" />

            {/* Linha de chips de atributos */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Etapa / Status */}
              <Select value={form.coluna_id} onValueChange={(v) => setForm({ ...form, coluna_id: v })}>
                <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full px-3 text-xs"><ListChecks className="h-3.5 w-3.5" /><SelectValue placeholder="Etapa" /></SelectTrigger>
                <SelectContent>{colunas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>

              {/* Responsável */}
              <Select value={form.agente_id || "_none"} onValueChange={(v) => setForm({ ...form, agente_id: v === "_none" ? "" : v })}>
                <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full px-3 text-xs"><User className="h-3.5 w-3.5" /><SelectValue placeholder="Responsável" /></SelectTrigger>
                <SelectContent><SelectItem value="_none">— Sem responsável</SelectItem>{agentes.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
              </Select>

              {/* Data de vencimento */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={`h-8 gap-1.5 rounded-full px-3 text-xs ${estaAtrasada(form.data_vencimento) ? "text-red-500 border-red-500/40" : ""}`}>
                    <CalendarIcon className="h-3.5 w-3.5" />{form.data_vencimento ? `Vence ${fmtData(form.data_vencimento)}` : "Vencimento"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={form.data_vencimento ? new Date(form.data_vencimento + "T00:00:00") : undefined}
                    onSelect={(d) => setForm({ ...form, data_vencimento: d ? d.toISOString().slice(0, 10) : "" })} />
                  {form.data_vencimento && <div className="border-t p-2"><Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setForm({ ...form, data_vencimento: "" })}>Limpar</Button></div>}
                </PopoverContent>
              </Popover>

              {/* Data inicial */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-xs">
                    <CalendarIcon className="h-3.5 w-3.5" />{form.data_inicio ? `Início ${fmtData(form.data_inicio)}` : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={form.data_inicio ? new Date(form.data_inicio + "T00:00:00") : undefined}
                    onSelect={(d) => setForm({ ...form, data_inicio: d ? d.toISOString().slice(0, 10) : "" })} />
                  {form.data_inicio && <div className="border-t p-2"><Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setForm({ ...form, data_inicio: "" })}>Limpar</Button></div>}
                </PopoverContent>
              </Popover>

              {/* Prioridade */}
              <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                <SelectTrigger className={`h-8 w-auto gap-1.5 rounded-full border px-3 text-xs ${prioClasse[form.prioridade] || ""}`}><Flag className="h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PRIORIDADES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>

              {/* Tempo estimado (minutos) */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-xs">
                    <Clock className="h-3.5 w-3.5" />{form.tempo_estimado ? `${form.tempo_estimado} min` : "Tempo est."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <Label className="text-xs">Tempo estimado (min)</Label>
                  <Input type="number" min={0} value={form.tempo_estimado} onChange={(e) => setForm({ ...form, tempo_estimado: e.target.value })} placeholder="Ex: 60" className="mt-1 h-8" />
                </PopoverContent>
              </Popover>
            </div>

            {/* Etiquetas */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {form.etiquetas.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 text-[11px]">{t}<button type="button" onClick={() => removeTag(t)}><X className="h-3 w-3" /></button></Badge>
              ))}
              <Input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="Etiqueta..."
                className="h-7 w-28 border-0 px-1 text-xs shadow-none focus-visible:ring-0" />
            </div>

            {/* Subtarefas e Checklist (só ao editar — precisam de tarefa salva) */}
            {editing && (
              <div className="space-y-3 border-t border-border pt-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-sm"><GitBranch className="h-4 w-4 text-primary" /> Subtarefas</Label>
                  {subtarefas.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 group">
                      <Checkbox checked={s.concluida} onCheckedChange={() => toggleSubtarefa(s)} />
                      <span className={`flex-1 text-sm ${s.concluida ? "line-through text-muted-foreground" : ""}`}>{s.titulo}</span>
                      <button type="button" onClick={() => delSubtarefa(s)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input value={novaSub} onChange={(e) => setNovaSub(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSubtarefa(); }} placeholder="Adicionar subtarefa..." className="h-8 text-sm" />
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={addSubtarefa}><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-sm"><ListChecks className="h-4 w-4 text-primary" /> Checklist</Label>
                  {checklist.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 group">
                      <Checkbox checked={c.concluido} onCheckedChange={() => toggleCheck(c)} />
                      <span className={`flex-1 text-sm ${c.concluido ? "line-through text-muted-foreground" : ""}`}>{c.item}</span>
                      <button type="button" onClick={() => delCheck(c)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input value={novoCheck} onChange={(e) => setNovoCheck(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCheck(); }} placeholder="Adicionar item..." className="h-8 text-sm" />
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={addCheck}><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            )}

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

            {/* Legenda + publicação no Instagram */}
            <div className="space-y-2 border-t border-border pt-3">
              <Label className="flex items-center gap-2 text-sm"><Send className="h-4 w-4 text-primary" /> Legenda do Instagram</Label>
              <Textarea rows={3} value={form.legenda} onChange={(e) => setForm({ ...form, legenda: e.target.value })} placeholder="Texto que vai sair na publicação (com emojis, hashtags, etc.)" className="text-sm" />
            </div>

            {editing && (
              <div className="space-y-3 border-t border-border pt-3">
                <Label className="flex items-center gap-2 text-sm"><ImageIcon className="h-4 w-4 text-primary" /> Publicar no Instagram</Label>
                {(() => {
                  const prontos = anexos.filter((a) => a.status === "pronto" && a.url);
                  const midiasMockup = igSelecao.length ? igSelecao : prontos.map((a) => a.url!);
                  const conta = igContas.find((c) => c.id === igContaId);
                  return (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Preview / mockup */}
                      <div className="flex justify-center">
                        <IgPostMockup imagens={midiasMockup} legenda={form.legenda} username={conta?.ig_username || undefined} />
                      </div>
                      {/* Controles */}
                      <div className="space-y-2">
                        {igContas.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nenhuma conta do Instagram conectada. Conecte na página Growth → Auto-DM / Integrações.</p>
                        ) : (
                          <>
                            <Select value={igContaId} onValueChange={setIgContaId}>
                              <SelectTrigger className="h-9"><SelectValue placeholder="Conta do Instagram" /></SelectTrigger>
                              <SelectContent>{igContas.map((c) => <SelectItem key={c.id} value={c.id}>@{c.ig_username || c.ig_user_id}</SelectItem>)}</SelectContent>
                            </Select>

                            {prontos.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Selecione as mídias (vazio = todas; ordem = ordem de clique p/ carrossel):</p>
                                <div className="flex flex-wrap gap-2">
                                  {prontos.map((a) => {
                                    const idx = igSelecao.indexOf(a.url!);
                                    return (
                                      <button type="button" key={a.id} onClick={() => toggleMidia(a.url!)}
                                        className={`relative h-14 w-14 rounded-md overflow-hidden border-2 ${idx >= 0 ? "border-primary" : "border-transparent"}`}>
                                        {a.tipo === "video" ? <video src={a.url!} className="h-full w-full object-cover" /> : <img src={a.url!} className="h-full w-full object-cover" alt="" />}
                                        {idx >= 0 && <span className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] px-1 rounded-bl">{idx + 1}</span>}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <Button size="sm" disabled={igEnviando} onClick={() => publicarIg("publicar_agora")}>
                                {igEnviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Publicar agora
                              </Button>
                              <Input type="datetime-local" value={igPublishAt} onChange={(e) => setIgPublishAt(e.target.value)} className="h-9 w-auto text-xs" />
                              <Button size="sm" variant="outline" disabled={igEnviando} onClick={() => publicarIg("agendar")}>
                                <CalendarIcon className="mr-2 h-4 w-4" /> Agendar
                              </Button>
                            </div>

                            {igPosts.length > 0 && (
                              <div className="space-y-1 pt-2">
                                {igPosts.map((p) => (
                                  <div key={p.id} className="flex items-center gap-2 text-xs rounded-md border border-border p-1.5">
                                    <Badge variant="outline" className="text-[10px]">{p.tipo}</Badge>
                                    <span className={
                                      p.status === "publicado" ? "text-green-500" : p.status === "falhou" ? "text-destructive" : "text-amber-500"
                                    }>{p.status}{p.publish_at && p.status === "pendente" ? ` · ${new Date(p.publish_at).toLocaleString("pt-BR")}` : ""}</span>
                                    {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="text-primary underline ml-auto">ver post</a>}
                                    {p.status === "pendente" && <button type="button" onClick={() => cancelarIgPost(p.id)} className="text-muted-foreground hover:text-destructive ml-auto"><X className="h-3.5 w-3.5" /></button>}
                                    {p.erro && <span className="text-destructive truncate" title={p.erro}>· {p.erro}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
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
              <Button onClick={salvar}>{editing ? "Salvar" : "Criar Tarefa"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lixeira */}
      <Dialog open={lixeiraOpen} onOpenChange={setLixeiraOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Trash className="h-5 w-5 text-primary" /> Lixeira</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Tarefas excluídas. Restaure ou exclua definitivamente.</p>
          <div className="space-y-2">
            {lixeira.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">A lixeira está vazia.</p>
            ) : lixeira.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.titulo}</p>
                  <p className="text-xs text-muted-foreground truncate">{colunaNome(t.coluna_id) || "—"}{t.agente_id ? ` · ${agenteNome(t.agente_id)}` : ""}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => restaurar(t)}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Restaurar</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir definitivamente" onClick={() => excluirDefinitivo(t)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLixeiraOpen(false)}>Fechar</Button></DialogFooter>
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
