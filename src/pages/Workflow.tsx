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
import { KanbanSquare, List, Plus, Trash2, Bot, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Coluna = { id: string; nome: string; ordem: number; agente_id: string | null };
type Tarefa = { id: string; titulo: string; descricao: string | null; coluna_id: string | null; agente_id: string | null; prioridade: string; ordem: number; origem: string };
type Agente = { id: string; nome: string };
type Resposta = { id: string; autor: string | null; conteudo: string; created_at: string };

const PRIORIDADES: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };
const prioCor: Record<string, string> = { baixa: "secondary", media: "outline", alta: "destructive" };

export default function Workflow() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [dragId, setDragId] = useState<string | null>(null);

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
                    <div key={col.id} className="w-72 shrink-0 flex flex-col bg-muted/40 rounded-xl border border-border"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { if (dragId) { moverPara(dragId, col.id); setDragId(null); } }}>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                        <span className="font-medium text-sm">{col.nome} <span className="text-muted-foreground">({cards.length})</span></span>
                        <button onClick={() => novaTarefa(col.id)} className="text-muted-foreground hover:text-foreground"><Plus className="h-4 w-4" /></button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {cards.map((t) => (
                          <Card key={t.id} draggable onDragStart={() => setDragId(t.id)} onClick={() => abrirTarefa(t)}
                            className="cursor-pointer hover:border-primary/50 transition-colors">
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
    </SidebarProvider>
  );
}
