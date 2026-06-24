import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ClipboardList, Plus, Trash2, ArrowLeft, Link2, BarChart3, GitBranch, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getTenantSlug } from "@/lib/tenant";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// As tabelas de pesquisas ainda não estão no types.ts gerado — usamos `db` (cast).
const db = supabase as any;

type TipoPergunta =
  | "texto_curto" | "texto_longo" | "multipla_escolha" | "sim_nao"
  | "email" | "telefone" | "numero" | "data" | "dropdown"
  | "escala_opiniao" | "nps" | "avaliacao";
type Opcao = { id: string; label: string };
type Regra = { quando_opcao_id: string; ir_para_pergunta_id: string | null }; // null = finalizar; "" = próxima
type Pergunta = {
  id: string;
  pesquisa_id: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  tipo: TipoPergunta;
  obrigatoria: boolean;
  opcoes: Opcao[];
  logica: Regra[];
};
type Pesquisa = { id: string; titulo: string; slug: string; descricao: string | null; status: string; created_at: string };

const TIPOS: { value: TipoPergunta; label: string }[] = [
  { value: "texto_curto", label: "Texto curto" },
  { value: "texto_longo", label: "Texto longo" },
  { value: "multipla_escolha", label: "Múltipla escolha" },
  { value: "dropdown", label: "Dropdown" },
  { value: "sim_nao", label: "Sim / Não" },
  { value: "email", label: "Email" },
  { value: "telefone", label: "Telefone" },
  { value: "numero", label: "Número" },
  { value: "data", label: "Data" },
  { value: "escala_opiniao", label: "Escala de opinião (1-10)" },
  { value: "nps", label: "NPS (0-10)" },
  { value: "avaliacao", label: "Avaliação (estrelas)" },
];

// Tipos baseados em opções (têm lista de opções editável e suportam bifurcação)
const TIPOS_OPCOES: TipoPergunta[] = ["multipla_escolha", "dropdown"];
const TIPOS_BIFURCAVEIS: TipoPergunta[] = ["multipla_escolha", "dropdown", "sim_nao"];

const rid = () => Math.random().toString(36).slice(2, 10);
const uuid = () => (crypto as any).randomUUID?.() ?? `${rid()}${rid()}-${rid().slice(0,4)}-4${rid().slice(0,3)}-a${rid().slice(0,3)}-${rid()}${rid()}`;
const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(DIACRITICOS, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "pesquisa";

function opcoesDaPergunta(p: Pergunta): Opcao[] {
  if (p.tipo === "sim_nao") return [{ id: "sim", label: "Sim" }, { id: "nao", label: "Não" }];
  return p.opcoes || [];
}

export default function Pesquisas() {
  const queryClient = useQueryClient();
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const { data: pesquisas = [] } = useQuery({
    queryKey: ["pesquisas"],
    queryFn: async () => {
      const { data } = await db.from("pesquisas").select("*").order("created_at", { ascending: false });
      return (data || []) as Pesquisa[];
    },
  });

  const { data: contagens = {} } = useQuery({
    queryKey: ["pesquisa_respostas_contagem"],
    queryFn: async () => {
      const { data } = await db.from("pesquisa_respostas").select("pesquisa_id");
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => { map[r.pesquisa_id] = (map[r.pesquisa_id] || 0) + 1; });
      return map;
    },
  });

  const criar = async () => {
    const titulo = "Nova pesquisa";
    const slug = `${slugify(titulo)}-${rid().slice(0, 4)}`;
    const { data, error } = await db.from("pesquisas").insert({ titulo, slug, status: "rascunho" }).select("id").single();
    if (error) { toast.error("Erro ao criar pesquisa"); return; }
    await queryClient.invalidateQueries({ queryKey: ["pesquisas"] });
    setEditandoId(data.id);
  };

  const excluir = async (p: Pesquisa) => {
    if (!confirm(`Excluir a pesquisa "${p.titulo}"? As respostas também serão removidas.`)) return;
    await db.from("pesquisas").delete().eq("id", p.id);
    queryClient.invalidateQueries({ queryKey: ["pesquisas"] });
    toast.success("Pesquisa excluída");
  };

  const linkPublico = (p: Pesquisa) => `${window.location.origin}/f/${p.slug}?org=${getTenantSlug()}`;
  const copiarLink = (p: Pesquisa) => {
    navigator.clipboard.writeText(linkPublico(p));
    toast.success("Link público copiado");
  };

  if (editandoId) {
    return <EditorPesquisa pesquisaId={editandoId} onVoltar={() => { setEditandoId(null); queryClient.invalidateQueries({ queryKey: ["pesquisas"] }); }} />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="shrink-0 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /> Pesquisas</h1>
              <p className="text-sm text-muted-foreground">Crie formulários estilo Typeform com perguntas e bifurcações</p>
            </div>
            <Button onClick={criar}><Plus className="mr-2 h-4 w-4" /> Criar pesquisa</Button>
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            {pesquisas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                Nenhuma pesquisa ainda. Clique em "Criar pesquisa" para começar.
              </p>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pesquisa</TableHead>
                        <TableHead className="w-28 text-center">Respostas</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead className="w-32">Criada</TableHead>
                        <TableHead className="w-44 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pesquisas.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium cursor-pointer" onClick={() => setEditandoId(p.id)}>{p.titulo}</TableCell>
                          <TableCell className="text-center">{contagens[p.id] || 0}</TableCell>
                          <TableCell>
                            <Badge variant={p.status === "publicada" ? "default" : "secondary"}>
                              {p.status === "publicada" ? "Publicada" : "Rascunho"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{new Date(p.created_at).toLocaleDateString("pt-BR")}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button size="sm" variant="ghost" title="Copiar link público" onClick={() => copiarLink(p)}><Link2 className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" title="Editar" onClick={() => setEditandoId(p.id)}>Editar</Button>
                            <Button size="sm" variant="ghost" title="Excluir" onClick={() => excluir(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

// ============================================================
// Editor de uma pesquisa (perguntas + tipos + bifurcação)
// ============================================================
function EditorPesquisa({ pesquisaId, onVoltar }: { pesquisaId: string; onVoltar: () => void }) {
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState<{ titulo: string; descricao: string; slug: string; status: string }>({ titulo: "", descricao: "", slug: "", status: "rascunho" });
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [resultadosOpen, setResultadosOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: p } = await db.from("pesquisas").select("*").eq("id", pesquisaId).maybeSingle();
      if (p) setMeta({ titulo: p.titulo, descricao: p.descricao || "", slug: p.slug, status: p.status });
      const { data: qs } = await db.from("pesquisa_perguntas").select("*").eq("pesquisa_id", pesquisaId).order("ordem", { ascending: true });
      setPerguntas((qs || []).map((q: any) => ({ ...q, opcoes: q.opcoes || [], logica: q.logica || [] })));
      setSelId((qs || [])[0]?.id || null);
    })();
  }, [pesquisaId]);

  const sel = useMemo(() => perguntas.find((p) => p.id === selId) || null, [perguntas, selId]);

  const upd = (id: string, patch: Partial<Pergunta>) =>
    setPerguntas((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addPergunta = () => {
    const nova: Pergunta = {
      id: uuid(), pesquisa_id: pesquisaId, ordem: perguntas.length,
      titulo: "Nova pergunta", descricao: "", tipo: "texto_curto",
      obrigatoria: true, opcoes: [], logica: [],
    };
    setPerguntas((prev) => [...prev, nova]);
    setSelId(nova.id);
  };

  const removerPergunta = (id: string) => {
    setPerguntas((prev) => prev.filter((p) => p.id !== id).map((p, i) => ({ ...p, ordem: i })));
    if (selId === id) setSelId(null);
  };

  const addOpcao = (p: Pergunta) => upd(p.id, { opcoes: [...p.opcoes, { id: rid(), label: `Opção ${p.opcoes.length + 1}` }] });
  const updOpcao = (p: Pergunta, oid: string, label: string) => upd(p.id, { opcoes: p.opcoes.map((o) => (o.id === oid ? { ...o, label } : o)) });
  const removerOpcao = (p: Pergunta, oid: string) =>
    upd(p.id, { opcoes: p.opcoes.filter((o) => o.id !== oid), logica: p.logica.filter((r) => r.quando_opcao_id !== oid) });

  const setRegra = (p: Pergunta, opcaoId: string, destino: string) => {
    const ir_para_pergunta_id = destino === "__proxima__" ? "" : destino === "__fim__" ? null : destino;
    const outras = p.logica.filter((r) => r.quando_opcao_id !== opcaoId);
    upd(p.id, { logica: [...outras, { quando_opcao_id: opcaoId, ir_para_pergunta_id }] });
  };
  const valorRegra = (p: Pergunta, opcaoId: string) => {
    const r = p.logica.find((x) => x.quando_opcao_id === opcaoId);
    if (!r) return "__proxima__";
    if (r.ir_para_pergunta_id === null) return "__fim__";
    if (r.ir_para_pergunta_id === "") return "__proxima__";
    return r.ir_para_pergunta_id;
  };

  const salvar = async (novoStatus?: string) => {
    if (!meta.titulo.trim()) { toast.error("Informe o título da pesquisa"); return; }
    // Ao publicar: validações de consistência.
    if (novoStatus === "publicada") {
      if (perguntas.length === 0) { toast.error("Adicione ao menos uma pergunta antes de publicar"); return; }
      const semTitulo = perguntas.find((p) => !p.titulo.trim());
      if (semTitulo) { toast.error("Há pergunta sem título"); return; }
      const semOpcoes = perguntas.find((p) => TIPOS_OPCOES.includes(p.tipo) && p.opcoes.filter((o) => o.label.trim()).length < 2);
      if (semOpcoes) { toast.error(`A pergunta "${semOpcoes.titulo}" precisa de ao menos 2 opções`); return; }
    }
    setSalvando(true);
    try {
      const status = novoStatus ?? meta.status;
      await db.from("pesquisas").update({ titulo: meta.titulo.trim(), descricao: meta.descricao || null, status }).eq("id", pesquisaId);
      // Substitui as perguntas (delete + insert) — simples e consistente com a ordem/ids locais.
      await db.from("pesquisa_perguntas").delete().eq("pesquisa_id", pesquisaId);
      if (perguntas.length) {
        const rows = perguntas.map((p, i) => ({
          id: p.id, pesquisa_id: pesquisaId, ordem: i, titulo: p.titulo, descricao: p.descricao || null,
          tipo: p.tipo, obrigatoria: p.obrigatoria, opcoes: p.opcoes, logica: p.logica,
        }));
        const { error } = await db.from("pesquisa_perguntas").insert(rows);
        if (error) throw error;
      }
      setMeta((m) => ({ ...m, status }));
      queryClient.invalidateQueries({ queryKey: ["pesquisas"] });
      toast.success(novoStatus === "publicada" ? "Pesquisa publicada" : "Pesquisa salva");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  const destinos = perguntas.filter((p) => p.id !== sel?.id);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="shrink-0 flex items-center gap-3 border-b border-border bg-background/80 backdrop-blur-sm px-4 py-3">
            <Button size="sm" variant="ghost" onClick={onVoltar}><ArrowLeft className="h-4 w-4" /></Button>
            <Input className="max-w-md font-semibold" value={meta.titulo} onChange={(e) => setMeta({ ...meta, titulo: e.target.value })} placeholder="Título da pesquisa" />
            <Badge variant={meta.status === "publicada" ? "default" : "secondary"}>{meta.status === "publicada" ? "Publicada" : "Rascunho"}</Badge>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => setResultadosOpen(true)}><BarChart3 className="mr-2 h-4 w-4" /> Resultados</Button>
            <Button size="sm" variant="outline" onClick={() => salvar()} disabled={salvando}>
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Salvar
            </Button>
            <Button size="sm" onClick={() => salvar("publicada")} disabled={salvando}>Publicar</Button>
          </header>

          <div className="flex-1 flex overflow-hidden">
            {/* Coluna esquerda: lista de perguntas */}
            <aside className="w-72 shrink-0 border-r border-border overflow-y-auto p-3 space-y-2">
              {perguntas.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setSelId(p.id)}
                  className={`w-full text-left rounded-md border px-3 py-2 text-sm flex items-start gap-2 ${selId === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                >
                  <span className="text-xs font-bold text-muted-foreground mt-0.5">{i + 1}</span>
                  <span className="flex-1 truncate">{p.titulo || "(sem título)"}</span>
                  {TIPOS_BIFURCAVEIS.includes(p.tipo) && p.logica.length > 0 && (
                    <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </button>
              ))}
              <Button variant="outline" className="w-full" onClick={addPergunta}><Plus className="mr-2 h-4 w-4" /> Adicionar pergunta</Button>
            </aside>

            {/* Centro: preview */}
            <section className="flex-1 overflow-y-auto p-8 bg-muted/30">
              {sel ? (
                <div className="max-w-xl mx-auto space-y-4">
                  <div className="text-xs text-muted-foreground">Pré-visualização</div>
                  <h2 className="text-2xl font-semibold">{sel.titulo}{sel.obrigatoria && <span className="text-destructive">*</span>}</h2>
                  {sel.descricao && <p className="text-muted-foreground">{sel.descricao}</p>}
                  <div className="pt-2">
                    {sel.tipo === "texto_curto" && <Input disabled placeholder="Responde aqui..." />}
                    {sel.tipo === "texto_longo" && <Textarea disabled placeholder="Responde aqui..." rows={4} />}
                    {sel.tipo === "email" && <Input disabled type="email" placeholder="nome@email.com" />}
                    {sel.tipo === "telefone" && <Input disabled type="tel" placeholder="(00) 00000-0000" />}
                    {sel.tipo === "numero" && <Input disabled type="number" placeholder="0" />}
                    {sel.tipo === "data" && <Input disabled type="date" />}
                    {sel.tipo === "dropdown" && (
                      <div className="rounded-md border border-border px-4 py-2.5 bg-background text-muted-foreground">Selecione uma opção ▾</div>
                    )}
                    {(sel.tipo === "multipla_escolha" || sel.tipo === "sim_nao") && (
                      <div className="space-y-2">
                        {opcoesDaPergunta(sel).map((o) => (
                          <div key={o.id} className="rounded-md border border-border px-4 py-2.5 bg-background">{o.label}</div>
                        ))}
                      </div>
                    )}
                    {(sel.tipo === "escala_opiniao" || sel.tipo === "nps") && (
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: sel.tipo === "nps" ? 11 : 10 }, (_, i) => (sel.tipo === "nps" ? i : i + 1)).map((n) => (
                          <div key={n} className="h-10 w-10 rounded-md border border-border flex items-center justify-center bg-background">{n}</div>
                        ))}
                      </div>
                    )}
                    {sel.tipo === "avaliacao" && (
                      <div className="flex gap-1 text-2xl text-muted-foreground">{"★★★★★".split("").map((s, i) => <span key={i}>{s}</span>)}</div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">Selecione ou adicione uma pergunta.</p>
              )}
            </section>

            {/* Direita: configuração */}
            {sel && (
              <aside className="w-80 shrink-0 border-l border-border overflow-y-auto p-4 space-y-4">
                <div className="space-y-1">
                  <Label>Pergunta</Label>
                  <Textarea rows={2} value={sel.titulo} onChange={(e) => upd(sel.id, { titulo: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Descrição (opcional)</Label>
                  <Input value={sel.descricao || ""} onChange={(e) => upd(sel.id, { descricao: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Tipo de resposta</Label>
                  <Select value={sel.tipo} onValueChange={(v) => upd(sel.id, { tipo: v as TipoPergunta })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Obrigatória</Label>
                  <Switch checked={sel.obrigatoria} onCheckedChange={(v) => upd(sel.id, { obrigatoria: v })} />
                </div>

                {TIPOS_OPCOES.includes(sel.tipo) && (
                  <div className="space-y-2">
                    <Label>Opções</Label>
                    {sel.opcoes.map((o) => (
                      <div key={o.id} className="flex gap-1">
                        <Input value={o.label} onChange={(e) => updOpcao(sel, o.id, e.target.value)} />
                        <Button size="icon" variant="ghost" onClick={() => removerOpcao(sel, o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" className="w-full" onClick={() => addOpcao(sel)}><Plus className="mr-2 h-4 w-4" /> Opção</Button>
                  </div>
                )}

                {TIPOS_BIFURCAVEIS.includes(sel.tipo) && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <Label className="flex items-center gap-2"><GitBranch className="h-4 w-4" /> Lógica (bifurcação)</Label>
                    <p className="text-[11px] text-muted-foreground">Para cada resposta, escolha a próxima pergunta.</p>
                    {opcoesDaPergunta(sel).map((o) => (
                      <div key={o.id} className="space-y-1">
                        <span className="text-xs text-muted-foreground">Se responder "{o.label}" →</span>
                        <Select value={valorRegra(sel, o.id)} onValueChange={(v) => setRegra(sel, o.id, v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__proxima__">Próxima pergunta</SelectItem>
                            <SelectItem value="__fim__">Finalizar pesquisa</SelectItem>
                            {destinos.map((d) => {
                              const idx = perguntas.findIndex((x) => x.id === d.id);
                              return <SelectItem key={d.id} value={d.id}>Ir para {idx + 1}. {d.titulo}</SelectItem>;
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}

                <Button variant="ghost" className="w-full text-destructive" onClick={() => removerPergunta(sel.id)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Excluir pergunta
                </Button>
              </aside>
            )}
          </div>
        </main>
      </div>

      <ResultadosDialog open={resultadosOpen} onOpenChange={setResultadosOpen} pesquisaId={pesquisaId} perguntas={perguntas} />
    </SidebarProvider>
  );
}

function ResultadosDialog({ open, onOpenChange, pesquisaId, perguntas }: {
  open: boolean; onOpenChange: (v: boolean) => void; pesquisaId: string; perguntas: Pergunta[];
}) {
  const { data: respostas = [] } = useQuery({
    queryKey: ["pesquisa_respostas", pesquisaId],
    enabled: open,
    queryFn: async () => {
      const { data } = await db.from("pesquisa_respostas").select("*").eq("pesquisa_id", pesquisaId).order("created_at", { ascending: false });
      return (data || []) as { id: string; respostas: Record<string, any>; created_at: string }[];
    },
  });

  const labelOpcao = (p: Pergunta, valor: any) => {
    const ops = opcoesDaPergunta(p);
    const found = ops.find((o) => o.id === valor);
    return found ? found.label : String(valor ?? "");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Respostas ({respostas.length})</DialogTitle></DialogHeader>
        {respostas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma resposta ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Data</TableHead>
                {perguntas.map((p, i) => <TableHead key={p.id}>{i + 1}. {p.titulo}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {respostas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                  {perguntas.map((p) => (
                    <TableCell key={p.id} className="text-sm">
                      {TIPOS_BIFURCAVEIS.includes(p.tipo) ? labelOpcao(p, r.respostas?.[p.id]) : (r.respostas?.[p.id] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
