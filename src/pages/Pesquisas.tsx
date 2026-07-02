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
  ClipboardList, Plus, Trash2, ArrowLeft, Link2, BarChart3, GitBranch, Loader2, GripVertical, Download, Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getTenantSlug } from "@/lib/tenant";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DiagnosticoFranqueabilidade, type AnaliseDiagnostico, type Score } from "@/components/DiagnosticoFranqueabilidade";

// As tabelas de pesquisas ainda não estão no types.ts gerado — usamos `db` (cast).
const db = supabase as any;

type TipoPergunta =
  | "texto_curto" | "texto_longo" | "multipla_escolha" | "sim_nao"
  | "email" | "telefone" | "numero" | "data" | "dropdown"
  | "escala_opiniao" | "nps" | "avaliacao";
type Opcao = { id: string; label: string; pontos?: number | null };
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
  pilar: string | null;   // pilar do diagnóstico (agrupa perguntas pontuadas)
  campo: string | null;   // papel na captura: nome | negocio | instagram | segmento | faturamento
};

// Pilares do Diagnóstico de Franqueabilidade (usados no score por pilar).
const PILARES = [
  "Maturidade & validação",
  "Rentabilidade",
  "Padronização & replicabilidade",
  "Independência do fundador",
  "Marca & jurídico",
  "Transmissibilidade do know-how",
  "Mercado & escalabilidade",
  "Capacidade de investimento",
];
// Campos de captura que alimentam o schema de entrada da IA.
const CAMPOS: { value: string; label: string }[] = [
  { value: "nome", label: "Nome (contato)" },
  { value: "negocio", label: "Nome do negócio" },
  { value: "instagram", label: "Instagram da marca" },
  { value: "segmento", label: "Segmento" },
  { value: "faturamento", label: "Faixa de faturamento" },
];
type Pesquisa = { id: string; titulo: string; slug: string; descricao: string | null; status: string; created_at: string };

// Configuração da tela final (mostrada ao respondente após enviar).
type ConfigPesquisa = {
  diagnostico_ia: boolean;           // gerar relatório consultivo por IA (Claude Sonnet)
  mostrar_resultado: boolean;        // exibir % de pontuação ao respondente
  resultado_texto: string;           // template; {pct} é substituído pela porcentagem
  whatsapp_numero: string;           // só dígitos com DDI, ex: 5511999999999
  whatsapp_botao: string;            // texto do botão
  whatsapp_mensagem: string;         // mensagem pré-preenchida no WhatsApp
};
const CONFIG_PADRAO: ConfigPesquisa = {
  diagnostico_ia: false,
  mostrar_resultado: false,
  resultado_texto: "Você está {pct}% pronto pra virar franquia.",
  whatsapp_numero: "",
  whatsapp_botao: "Antecipar meu atendimento no WhatsApp",
  whatsapp_mensagem: "Oi, vim do diagnóstico de franqueabilidade e quero antecipar meu atendimento!",
};

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
  const [meta, setMeta] = useState<{ titulo: string; descricao: string; slug: string; status: string; config: ConfigPesquisa }>({ titulo: "", descricao: "", slug: "", status: "rascunho", config: CONFIG_PADRAO });
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [resultadosOpen, setResultadosOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: p } = await db.from("pesquisas").select("*").eq("id", pesquisaId).maybeSingle();
      if (p) setMeta({ titulo: p.titulo, descricao: p.descricao || "", slug: p.slug, status: p.status, config: { ...CONFIG_PADRAO, ...(p.config || {}) } });
      const { data: qs } = await db.from("pesquisa_perguntas").select("*").eq("pesquisa_id", pesquisaId).order("ordem", { ascending: true });
      setPerguntas((qs || []).map((q: any) => ({ ...q, opcoes: q.opcoes || [], logica: q.logica || [], pilar: q.pilar ?? null, campo: q.campo ?? null })));
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
      obrigatoria: true, opcoes: [], logica: [], pilar: null, campo: null,
    };
    setPerguntas((prev) => [...prev, nova]);
    setSelId(nova.id);
  };

  const removerPergunta = (id: string) => {
    setPerguntas((prev) => prev.filter((p) => p.id !== id).map((p, i) => ({ ...p, ordem: i })));
    if (selId === id) setSelId(null);
  };

  // Reordena perguntas (arrastar) — move o item de `from` para a posição `to`.
  const moverPergunta = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setPerguntas((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr.map((p, i) => ({ ...p, ordem: i }));
    });
  };

  const addOpcao = (p: Pergunta) => upd(p.id, { opcoes: [...p.opcoes, { id: rid(), label: `Opção ${p.opcoes.length + 1}`, pontos: null }] });
  const updOpcao = (p: Pergunta, oid: string, label: string) => upd(p.id, { opcoes: p.opcoes.map((o) => (o.id === oid ? { ...o, label } : o)) });
  // Pontuação da opção: vazio → null (não pontua); senão número. Uma pergunta só conta no
  // score (tela de Resultados) quando alguma de suas opções tem pontos numérico.
  const updOpcaoPontos = (p: Pergunta, oid: string, valor: string) =>
    upd(p.id, { opcoes: p.opcoes.map((o) => (o.id === oid ? { ...o, pontos: valor.trim() === "" ? null : Number(valor) } : o)) });
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
      await db.from("pesquisas").update({ titulo: meta.titulo.trim(), descricao: meta.descricao || null, status, config: meta.config }).eq("id", pesquisaId);
      // Substitui as perguntas (delete + insert) — simples e consistente com a ordem/ids locais.
      await db.from("pesquisa_perguntas").delete().eq("pesquisa_id", pesquisaId);
      if (perguntas.length) {
        const rows = perguntas.map((p, i) => ({
          id: p.id, pesquisa_id: pesquisaId, ordem: i, titulo: p.titulo, descricao: p.descricao || null,
          tipo: p.tipo, obrigatoria: p.obrigatoria, opcoes: p.opcoes, logica: p.logica,
          pilar: p.pilar || null, campo: p.campo || null,
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
            <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}><Settings className="mr-2 h-4 w-4" /> Configurações</Button>
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
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIdx !== null) moverPergunta(dragIdx, i); setDragIdx(null); }}
                  onDragEnd={() => setDragIdx(null)}
                  onClick={() => setSelId(p.id)}
                  className={`w-full cursor-pointer text-left rounded-md border px-2 py-2 text-sm flex items-start gap-1.5 ${selId === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"} ${dragIdx === i ? "opacity-50" : ""}`}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground/60 mt-0.5 cursor-grab shrink-0" />
                  <span className="text-xs font-bold text-muted-foreground mt-0.5">{i + 1}</span>
                  <span className="flex-1 truncate">{p.titulo || "(sem título)"}</span>
                  {TIPOS_BIFURCAVEIS.includes(p.tipo) && p.logica.length > 0 && (
                    <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </div>
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

                {/* Diagnóstico: pilar (perguntas pontuadas) e campo de captura. */}
                <div className="space-y-2 border-t border-border pt-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Diagnóstico de franqueabilidade</Label>
                  {TIPOS_OPCOES.includes(sel.tipo) && (
                    <div className="space-y-1">
                      <Label>Pilar</Label>
                      <Select value={sel.pilar ?? "__none__"} onValueChange={(v) => upd(sel.id, { pilar: v === "__none__" ? null : v })}>
                        <SelectTrigger><SelectValue placeholder="Sem pilar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem pilar</SelectItem>
                          {PILARES.map((pl) => <SelectItem key={pl} value={pl}>{pl}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label>Campo de captura</Label>
                    <Select value={sel.campo ?? "__none__"} onValueChange={(v) => upd(sel.id, { campo: v === "__none__" ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhum</SelectItem>
                        {CAMPOS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {TIPOS_OPCOES.includes(sel.tipo) && (
                  <div className="space-y-2">
                    <Label>Opções</Label>
                    <p className="text-[11px] text-muted-foreground">No campo "pts" defina a pontuação da opção (deixe vazio para não pontuar).</p>
                    {sel.opcoes.map((o) => (
                      <div key={o.id} className="flex gap-1">
                        <Input value={o.label} onChange={(e) => updOpcao(sel, o.id, e.target.value)} />
                        <Input
                          type="number"
                          className="w-16 shrink-0"
                          placeholder="pts"
                          value={o.pontos ?? ""}
                          onChange={(e) => updOpcaoPontos(sel, o.id, e.target.value)}
                        />
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

      <ResultadosDialog open={resultadosOpen} onOpenChange={setResultadosOpen} pesquisaId={pesquisaId} slug={meta.slug} perguntas={perguntas} />
      <ConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        descricao={meta.descricao}
        config={meta.config}
        onChange={(patch) => setMeta((m) => ({ ...m, ...patch }))}
      />
    </SidebarProvider>
  );
}

// ============================================================
// Configurações da pesquisa: descrição + tela final (resultado + botão WhatsApp)
// ============================================================
function ConfigDialog({ open, onOpenChange, descricao, config, onChange }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  descricao: string;
  config: ConfigPesquisa;
  onChange: (patch: { descricao?: string; config?: ConfigPesquisa }) => void;
}) {
  const setCfg = (patch: Partial<ConfigPesquisa>) => onChange({ config: { ...config, ...patch } });
  const numero = config.whatsapp_numero.replace(/\D/g, "");
  const preview = numero
    ? `https://wa.me/${numero}?text=${encodeURIComponent(config.whatsapp_mensagem)}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações da pesquisa</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1">
            <Label>Descrição (aparece no início do formulário)</Label>
            <Textarea rows={3} value={descricao} onChange={(e) => onChange({ descricao: e.target.value })} />
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-sm font-medium">Tela final (após enviar)</p>

            <div className="flex items-center justify-between">
              <div>
                <Label>Gerar diagnóstico com IA</Label>
                <p className="text-[11px] text-muted-foreground">Relatório consultivo (Claude Sonnet) a partir dos pilares e do Instagram da marca.</p>
              </div>
              <Switch checked={config.diagnostico_ia} onCheckedChange={(v) => setCfg({ diagnostico_ia: v })} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Mostrar resultado (%) ao respondente</Label>
                <p className="text-[11px] text-muted-foreground">Usa a pontuação das perguntas. Ignorado quando o diagnóstico de IA está ligado (o relatório já mostra o %).</p>
              </div>
              <Switch checked={config.mostrar_resultado} onCheckedChange={(v) => setCfg({ mostrar_resultado: v })} />
            </div>
            {config.mostrar_resultado && (
              <div className="space-y-1">
                <Label>Texto do resultado</Label>
                <Input value={config.resultado_texto} onChange={(e) => setCfg({ resultado_texto: e.target.value })} />
                <p className="text-[11px] text-muted-foreground">Use <code>{"{pct}"}</code> onde a porcentagem deve aparecer.</p>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-sm font-medium">Botão de WhatsApp na tela final</p>
            <div className="space-y-1">
              <Label>Número do WhatsApp (com DDI)</Label>
              <Input placeholder="Ex: 5511999999999" value={config.whatsapp_numero} onChange={(e) => setCfg({ whatsapp_numero: e.target.value })} />
              <p className="text-[11px] text-muted-foreground">Deixe vazio para não exibir o botão.</p>
            </div>
            <div className="space-y-1">
              <Label>Texto do botão</Label>
              <Input value={config.whatsapp_botao} onChange={(e) => setCfg({ whatsapp_botao: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Mensagem pré-preenchida</Label>
              <Textarea rows={2} value={config.whatsapp_mensagem} onChange={(e) => setCfg({ whatsapp_mensagem: e.target.value })} />
            </div>
            {preview && (
              <a href={preview} target="_blank" rel="noreferrer" className="text-xs text-primary underline break-all">
                Pré-visualizar link do WhatsApp
              </a>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">Clique em "Salvar" no topo da pesquisa para aplicar as alterações.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type RespostaRow = {
  id: string; respostas: Record<string, any>; created_at: string;
  score?: Score | null; analise?: AnaliseDiagnostico | null; analise_status?: string | null;
};

function ResultadosDialog({ open, onOpenChange, pesquisaId, slug, perguntas }: {
  open: boolean; onOpenChange: (v: boolean) => void; pesquisaId: string; slug: string; perguntas: Pergunta[];
}) {
  const queryClient = useQueryClient();
  const [verId, setVerId] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const { data: respostas = [] } = useQuery({
    queryKey: ["pesquisa_respostas", pesquisaId],
    enabled: open,
    queryFn: async () => {
      const { data } = await db.from("pesquisa_respostas").select("*").eq("pesquisa_id", pesquisaId).order("created_at", { ascending: false });
      return (data || []) as RespostaRow[];
    },
  });

  const verResp = respostas.find((r) => r.id === verId) || null;

  // Chama a edge function para gerar (ou regenerar) o relatório de IA da resposta.
  const gerarDiagnostico = async (respostaId: string, forcar = false) => {
    setGerando(true);
    try {
      const { data, error } = await supabase.functions.invoke("pesquisa-publica", {
        body: { acao: "diagnostico", slug, org: getTenantSlug(), resposta_id: respostaId, forcar },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      if ((data as any)?.erro_ia) toast.error("IA indisponível — mostrando apenas o percentual.");
      await queryClient.invalidateQueries({ queryKey: ["pesquisa_respostas", pesquisaId] });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar diagnóstico");
    } finally {
      setGerando(false);
    }
  };

  const labelOpcao = (p: Pergunta, valor: any) => {
    const ops = opcoesDaPergunta(p);
    const found = ops.find((o) => o.id === valor);
    return found ? found.label : String(valor ?? "");
  };

  const valorCelula = (p: Pergunta, r: { respostas: Record<string, any> }) =>
    TIPOS_BIFURCAVEIS.includes(p.tipo) ? labelOpcao(p, r.respostas?.[p.id]) : (r.respostas?.[p.id] ?? "");

  // ----- Pontuação (só aparece se houver perguntas com pontos definidos) -----
  // Uma pergunta conta quando alguma de suas opções tem `pontos` numérico.
  const temPonto = (o: Opcao) => typeof o.pontos === "number";
  const perguntasPontuadas = perguntas.filter((p) => opcoesDaPergunta(p).some(temPonto));
  const temPontuacao = perguntasPontuadas.length > 0;
  const maxTotal = perguntasPontuadas.reduce(
    (acc, p) => acc + Math.max(0, ...opcoesDaPergunta(p).map((o) => (temPonto(o) ? (o.pontos as number) : 0))),
    0,
  );
  const calcularScore = (r: { respostas: Record<string, any> }) => {
    const total = perguntasPontuadas.reduce((acc, p) => {
      const escolhida = opcoesDaPergunta(p).find((o) => o.id === r.respostas?.[p.id]);
      return acc + (escolhida && temPonto(escolhida) ? (escolhida.pontos as number) : 0);
    }, 0);
    const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
    return { total, pct };
  };

  // Exporta as respostas em CSV (separador ; e BOM para abrir corretamente no Excel pt-BR).
  const exportarCSV = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cabecalho = [
      "Data",
      ...perguntas.map((p, i) => `${i + 1}. ${p.titulo}`),
      ...(temPontuacao ? ["Pontuação", "%"] : []),
    ];
    const linhas = respostas.map((r) => {
      const s = temPontuacao ? calcularScore(r) : null;
      return [
        new Date(r.created_at).toLocaleString("pt-BR"),
        ...perguntas.map((p) => valorCelula(p, r)),
        ...(s ? [`${s.total}/${maxTotal}`, `${s.pct}%`] : []),
      ];
    });
    const csv = [cabecalho, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `respostas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>Respostas ({respostas.length})</span>
            <Button size="sm" variant="outline" onClick={exportarCSV} disabled={respostas.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Exportar CSV
            </Button>
          </DialogTitle>
        </DialogHeader>
        {respostas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma resposta ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Data</TableHead>
                {perguntas.map((p, i) => <TableHead key={p.id}>{i + 1}. {p.titulo}</TableHead>)}
                {temPontuacao && <TableHead className="text-center">Pontuação</TableHead>}
                {temPontuacao && <TableHead className="text-center">%</TableHead>}
                <TableHead>Diagnóstico</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {respostas.map((r) => {
                const s = temPontuacao ? calcularScore(r) : null;
                return (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                  {perguntas.map((p) => (
                    <TableCell key={p.id} className="text-sm">{valorCelula(p, r)}</TableCell>
                  ))}
                  {s && <TableCell className="text-center font-medium">{s.total}/{maxTotal}</TableCell>}
                  {s && <TableCell className="text-center font-medium">{s.pct}%</TableCell>}
                  <TableCell>
                    {r.analise_status === "gerada" ? (
                      <Button size="sm" variant="outline" onClick={() => setVerId(r.id)}>Ver relatório</Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={gerando} onClick={() => gerarDiagnostico(r.id)}>
                        {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>

      {/* Visualização do relatório de IA de uma resposta. */}
      <Dialog open={!!verId} onOpenChange={(v) => !v && setVerId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-8">
              <span>Diagnóstico de franqueabilidade</span>
              <Button size="sm" variant="outline" disabled={gerando} onClick={() => verId && gerarDiagnostico(verId, true)}>
                {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Regenerar
              </Button>
            </DialogTitle>
          </DialogHeader>
          {verResp && <DiagnosticoFranqueabilidade analise={verResp.analise ?? null} score={verResp.score ?? null} />}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
