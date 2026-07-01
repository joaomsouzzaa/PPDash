import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserSearch, Search, Sparkles, Loader2, Copy, ExternalLink, Check, X, Building2, User as UserIcon, Package, Plus, Trash2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Produto = { produto: string; motivo: string };
type Analise = {
  id: string;
  job_id: string | null;
  handle: string;
  nome: string | null;
  bio: string | null;
  foto_url: string | null;
  is_business: boolean | null;
  empresa_handle: string | null;
  niche_match: boolean;
  segmento: string | null;
  followers: number | null;
  analise: { score?: number; resumo?: string; produtos_sugeridos?: Produto[]; sinais?: string[] };
  mensagem_parte1: string | null;
  mensagem_parte2: string | null;
  status: "novo" | "aprovado" | "descartado";
  origem: string;
};

type ProdutoKB = {
  id: string;
  nome: string;
  descricao: string | null;
  publico_alvo: string | null;
  gatilhos: string[] | null;
  ativo: boolean;
};

const proxyImg = (url: string | null) =>
  url ? `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=200&h=200&fit=cover` : "";

const fmt = (n: number | null) =>
  n == null ? "-" : new Intl.NumberFormat("pt-BR", { notation: n >= 10000 ? "compact" : "standard" }).format(n);

async function invoke<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("scraping-prospect", { body });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

// ---------------------------------------------------------------------------
// Card de perfil analisado (reutilizado nas abas Analisar e Scraping)
// ---------------------------------------------------------------------------
function ProfileCard({ a, onChange }: { a: Analise; onChange: () => void }) {
  const [p1, setP1] = useState(a.mensagem_parte1 || "");
  const [p2, setP2] = useState(a.mensagem_parte2 || "");
  const [salvando, setSalvando] = useState(false);
  const score = a.analise?.score;

  const copiar = async (txt: string) => {
    try { await navigator.clipboard.writeText(txt); toast.success("Copiado"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  const setStatus = async (status: "aprovado" | "descartado") => {
    setSalvando(true);
    try {
      const { error } = await supabase.from("prospect_analises")
        .update({ status, mensagem_parte1: p1, mensagem_parte2: p2, updated_at: new Date().toISOString() })
        .eq("id", a.id);
      if (error) throw error;
      toast.success(status === "aprovado" ? "Aprovado" : "Descartado");
      onChange();
    } catch (e: any) { toast.error(e?.message || "Falha ao salvar"); }
    finally { setSalvando(false); }
  };

  return (
    <Card className={a.status === "aprovado" ? "ring-2 ring-emerald-500" : a.status === "descartado" ? "opacity-60" : ""}>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-full bg-muted overflow-hidden shrink-0">
            {a.foto_url
              ? <img src={proxyImg(a.foto_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              : <div className="h-full w-full flex items-center justify-center"><UserIcon className="h-5 w-5 text-muted-foreground" /></div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <a href={`https://www.instagram.com/${a.handle}/`} target="_blank" rel="noreferrer"
                className="font-semibold hover:underline flex items-center gap-1">
                @{a.handle} <ExternalLink className="h-3 w-3" />
              </a>
              {typeof score === "number" && <Badge variant={score >= 70 ? "default" : "secondary"}>score {score}</Badge>}
            </div>
            {a.nome && <p className="text-sm text-muted-foreground truncate">{a.nome}</p>}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {a.segmento && <Badge variant="outline" className="text-[10px]">{a.segmento}</Badge>}
              <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                {a.is_business ? <><Building2 className="h-3 w-3" /> Empresa</> : <><UserIcon className="h-3 w-3" /> Pessoal</>}
              </Badge>
              {a.empresa_handle && (
                <a href={`https://www.instagram.com/${a.empresa_handle}/`} target="_blank" rel="noreferrer"
                  className="text-[10px] text-primary hover:underline">@{a.empresa_handle}</a>
              )}
              {a.followers != null && <span className="text-[10px] text-muted-foreground">{fmt(a.followers)} seguidores</span>}
            </div>
          </div>
        </div>

        {a.analise?.resumo && <p className="text-sm">{a.analise.resumo}</p>}

        {!!a.analise?.produtos_sugeridos?.length && (
          <div className="space-y-1">
            {a.analise.produtos_sugeridos.map((p, i) => (
              <div key={i} className="text-xs bg-muted/50 rounded px-2 py-1">
                <span className="font-medium">{p.produto}</span>
                {p.motivo && <span className="text-muted-foreground"> — {p.motivo}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Mensagem em 2 partes (editável) */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Mensagem (2 tempos)</span>
            <a href={`https://ig.me/m/${a.handle}`} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="h-7"><MessageCircle className="h-3.5 w-3.5 mr-1" /> Abrir DM</Button>
            </a>
          </div>
          <div className="flex gap-2 items-start">
            <Textarea value={p1} onChange={(e) => setP1(e.target.value)} rows={1} className="text-sm" placeholder="Parte 1" />
            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => copiar(p1)}><Copy className="h-4 w-4" /></Button>
          </div>
          <div className="flex gap-2 items-start">
            <Textarea value={p2} onChange={(e) => setP2(e.target.value)} rows={3} className="text-sm" placeholder="Parte 2" />
            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => copiar(p2)}><Copy className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="default" disabled={salvando} onClick={() => setStatus("aprovado")}>
            <Check className="h-4 w-4 mr-1" /> Aprovar
          </Button>
          <Button size="sm" variant="outline" disabled={salvando} onClick={() => setStatus("descartado")}>
            <X className="h-4 w-4 mr-1" /> Descartar
          </Button>
          {a.status !== "novo" && <Badge variant="secondary" className="ml-auto">{a.status}</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Aba: Analisar 1 perfil
// ---------------------------------------------------------------------------
function AbaAnalisar() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Analise | null>(null);
  const [tick, setTick] = useState(0);

  const analisar = async () => {
    if (!handle.trim()) { toast.error("Informe o @ do perfil"); return; }
    setLoading(true); setResultado(null);
    try {
      const d = await invoke<{ analise: Analise }>({ action: "analisar_perfil", handle: handle.trim() });
      setResultado(d.analise);
    } catch (e: any) { toast.error(e?.message || "Falha na análise"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Perfil do Instagram</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
              <Input className="pl-7" placeholder="raphaeldmattos" value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && analisar()} />
            </div>
          </div>
          <Button onClick={analisar} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {loading ? "Analisando..." : "Analisar perfil"}
          </Button>
        </CardContent>
      </Card>

      {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A IA de social selling está analisando o perfil...</div>}
      {resultado && <div key={tick} className="max-w-2xl"><ProfileCard a={resultado} onChange={() => setTick((t) => t + 1)} /></div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba: Scraping por nicho
// ---------------------------------------------------------------------------
function AbaScraping() {
  const [isca, setIsca] = useState("");
  const [nicho, setNicho] = useState("estetica");
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: analises = [] } = useQuery({
    queryKey: ["prospect_analises", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data } = await supabase.from("prospect_analises").select("*")
        .eq("job_id", jobId).order("created_at", { ascending: false });
      return (data || []) as Analise[];
    },
  });

  const buscar = async () => {
    if (!isca.trim()) { toast.error("Informe o perfil isca"); return; }
    setLoading(true); setJobId(null);
    try {
      const d = await invoke<{ job_id: string; total: number }>({
        action: "scrape_seguidores", perfil_isca: isca.trim(), nicho, limite: 50,
      });
      setJobId(d.job_id);
      toast.success(`${d.total} perfis do nicho encontrados`);
    } catch (e: any) { toast.error(e?.message || "Falha no scraping"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Perfil isca (conta grande)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
              <Input className="pl-7" placeholder="raphaeldmattos" value={isca}
                onChange={(e) => setIsca(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Nicho</label>
            <Select value={nicho} onValueChange={setNicho}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="medicos">Médicos</SelectItem>
                <SelectItem value="estetica">Estética</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={buscar} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            {loading ? "Buscando..." : "Buscar seguidores"}
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        O scraping de seguidores é pesado: o Instagram limita listas e cada perfil exige uma 2ª busca pela bio.
        Achar 50 do nicho pode levar alguns minutos e consumir várias chamadas Apify.
      </p>

      {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Coletando seguidores e analisando (pode demorar)...</div>}

      {analises.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {analises.map((a) => (
            <ProfileCard key={a.id} a={a} onChange={() => qc.invalidateQueries({ queryKey: ["prospect_analises", jobId] })} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba: Produtos (base de conhecimento)
// ---------------------------------------------------------------------------
const EXEMPLOS = [
  {
    nome: "Consultoria de Franquias / Formatar em Franquia",
    descricao: "Ajudamos negócios já estruturados a transformar sua operação em uma franquia escalável.",
    publico_alvo: "Empresas com marca e posicionamento fortes, operação validada e vontade de expandir.",
    gatilhos: ["tem CNPJ/marca própria", "várias unidades ou loja física", "posicionamento forte", "fala em expansão"],
  },
  {
    nome: "Trilha Mentor",
    descricao: "Programa para especialistas transformarem seu conhecimento em um produto digital/mentoria.",
    publico_alvo: "Especialista/médico com autoridade mas sem empresa própria, que ainda não monetiza o conhecimento.",
    gatilhos: ["perfil pessoal/profissional", "médico ou especialista", "sem empresa estruturada", "produz conteúdo mas não vende produto"],
  },
];

function AbaProdutos() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<ProdutoKB> | null>(null);

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["prospect_produtos"],
    queryFn: async () => {
      const { data } = await supabase.from("prospect_produtos").select("*").order("created_at");
      return (data || []) as ProdutoKB[];
    },
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ["prospect_produtos"] });

  const seedExemplos = async () => {
    const { error } = await supabase.from("prospect_produtos").insert(EXEMPLOS);
    if (error) toast.error(error.message); else { toast.success("Exemplos adicionados"); refetch(); }
  };

  const salvar = async () => {
    if (!edit?.nome?.trim()) { toast.error("Informe o nome"); return; }
    const payload = {
      nome: edit.nome, descricao: edit.descricao || null, publico_alvo: edit.publico_alvo || null,
      gatilhos: typeof (edit as any).gatilhosStr === "string"
        ? (edit as any).gatilhosStr.split(",").map((s: string) => s.trim()).filter(Boolean)
        : (edit.gatilhos || []),
      ativo: edit.ativo ?? true,
    };
    const q = edit.id
      ? supabase.from("prospect_produtos").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", edit.id)
      : supabase.from("prospect_produtos").insert(payload);
    const { error } = await q;
    if (error) toast.error(error.message); else { toast.success("Salvo"); setEdit(null); refetch(); }
  };

  const excluir = async (id: string) => {
    const { error } = await supabase.from("prospect_produtos").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); refetch(); }
  };

  const toggleAtivo = async (p: ProdutoKB) => {
    const { error } = await supabase.from("prospect_produtos").update({ ativo: !p.ativo }).eq("id", p.id);
    if (error) toast.error(error.message); else refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground flex-1">A IA cruza cada perfil com estes produtos para sugerir o encaixe e a mensagem.</p>
        {produtos.length === 0 && !isLoading && (
          <Button variant="outline" size="sm" onClick={seedExemplos}><Sparkles className="h-4 w-4 mr-1" /> Adicionar exemplos</Button>
        )}
        <Button size="sm" onClick={() => setEdit({ ativo: true })}><Plus className="h-4 w-4 mr-1" /> Novo produto</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {produtos.map((p) => (
          <Card key={p.id} className={p.ativo ? "" : "opacity-60"}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> {p.nome}</CardTitle>
                <Switch checked={p.ativo} onCheckedChange={() => toggleAtivo(p)} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.descricao && <p>{p.descricao}</p>}
              {p.publico_alvo && <p className="text-muted-foreground"><span className="font-medium">Público:</span> {p.publico_alvo}</p>}
              {!!p.gatilhos?.length && (
                <div className="flex flex-wrap gap-1">{p.gatilhos.map((g, i) => <Badge key={i} variant="outline" className="text-[10px]">{g}</Badge>)}</div>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setEdit({ ...p, ...({ gatilhosStr: (p.gatilhos || []).join(", ") } as any) })}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => excluir(p.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {produtos.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground col-span-full text-center py-8">Nenhum produto cadastrado.</p>
        )}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Nome</label>
              <Input value={edit?.nome || ""} onChange={(e) => setEdit((s) => ({ ...s, nome: e.target.value }))} /></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Descrição / o que resolve</label>
              <Textarea value={edit?.descricao || ""} onChange={(e) => setEdit((s) => ({ ...s, descricao: e.target.value }))} /></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Público-alvo ideal</label>
              <Textarea value={edit?.publico_alvo || ""} onChange={(e) => setEdit((s) => ({ ...s, publico_alvo: e.target.value }))} /></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Gatilhos (separados por vírgula)</label>
              <Input value={(edit as any)?.gatilhosStr ?? (edit?.gatilhos || []).join(", ")}
                onChange={(e) => setEdit((s) => ({ ...s, ...({ gatilhosStr: e.target.value } as any) }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ScrapingProspect() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="shrink-0 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <UserSearch className="h-5 w-5 text-primary" /> Scraping Prospect
              </h1>
              <p className="text-sm text-muted-foreground">Prospecção no Instagram com IA de social selling: analise perfis e gere mensagens prontas.</p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <Tabs defaultValue="analisar">
              <TabsList>
                <TabsTrigger value="analisar">Analisar perfil</TabsTrigger>
                <TabsTrigger value="scraping">Scraping por nicho</TabsTrigger>
                <TabsTrigger value="produtos">Produtos</TabsTrigger>
              </TabsList>
              <TabsContent value="analisar" className="mt-4"><AbaAnalisar /></TabsContent>
              <TabsContent value="scraping" className="mt-4"><AbaScraping /></TabsContent>
              <TabsContent value="produtos" className="mt-4"><AbaProdutos /></TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
