import { useState, useMemo } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Instagram, Search, Heart, MessageCircle, Eye, Play, FileText, Sparkles, Loader2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

// Instrução enviada ao Agente de Copy: aplica a skill "Estrutura Invisível".
const SKILL_ESTRUTURA = `Use a skill /estrutura-invisivel para analisar os roteiros abaixo.

Para cada vídeo, identifique cada elemento estrutural da copy na ordem em que aparece, usando o nome técnico de direct response (hook de identificação, amplificação da dor, queima de crença, mecanismo da solução, prova, qualificação, CTA etc.). Para cada elemento entregue: (1) o NOME do elemento, (2) o TRECHO exato, (3) a PSICOLOGIA por trás (por que funciona, qual objeção destrói ou qual desejo ativa), e (4) 3 variações — OPÇÃO 1 Conservadora, OPÇÃO 2 Ângulo alternativo, OPÇÃO 3 Agressiva. Aponte pontos fracos com ⚠️. Ao final, traga uma análise comparativa e próximos passos.`;

type Conteudo = {
  id: string;
  shortCode: string | null;
  tipo: string;
  isVideo: boolean;
  caption: string;
  likes: number;
  comments: number;
  views: number;
  engajamento: number;
  thumbnail: string | null;
  videoUrl: string | null;
  url: string | null;
  timestamp: string | null;
};

type Agente = { id: string; nome: string; slug: string | null };

const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { notation: n >= 10000 ? "compact" : "standard" }).format(n || 0);

// As URLs de thumbnail do Instagram (fbcdn) bloqueiam hotlink/referrer externo.
// Passamos por um proxy de imagens para conseguir exibir no app.
const proxyImg = (url: string | null) =>
  url ? `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=600&h=600&fit=cover` : "";

export default function ScrapingConteudos() {
  const [handle, setHandle] = useState("");
  const [dias, setDias] = useState("30");
  const [scraping, setScraping] = useState(false);
  const [conta, setConta] = useState<string | null>(null);
  const [conteudos, setConteudos] = useState<Conteudo[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const [transcrevendo, setTranscrevendo] = useState(false);
  const [transcricoes, setTranscricoes] = useState<Record<string, string>>({});

  const [agenteId, setAgenteId] = useState<string>("");
  const [analisando, setAnalisando] = useState(false);
  const [analise, setAnalise] = useState<string>("");

  // Agentes para escolher quem recebe os roteiros (default: que contenha "copy").
  const { data: agentes = [] } = useQuery({
    queryKey: ["agentes-copy"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agentes").select("id,nome,slug").eq("ativo", true).order("nome");
      if (error) throw error;
      const lista = (data || []) as Agente[];
      const copy = lista.find((a) => /copy/i.test(a.nome) || /copy/i.test(a.slug || ""));
      setAgenteId((prev) => prev || copy?.id || lista[0]?.id || "");
      return lista;
    },
  });

  const selObjs = useMemo(() => conteudos.filter((c) => selecionados.includes(c.id)), [conteudos, selecionados]);
  const selComVideo = selObjs.filter((c) => c.isVideo && c.videoUrl);

  const buscar = async () => {
    if (!handle.trim()) { toast.error("Informe o @ do perfil"); return; }
    setScraping(true);
    setConteudos([]); setSelecionados([]); setTranscricoes({}); setAnalise("");
    try {
      const { data, error } = await supabase.functions.invoke("scraping-instagram", {
        body: { action: "scrape", handle: handle.trim(), limit: 50, dias: Number(dias) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setConta(data.conta);
      setConteudos(data.itens || []);
      if (!data.itens?.length) toast.message("Nenhum conteúdo encontrado para esse perfil.");
    } catch (e: any) {
      toast.error(e?.message || "Falha no scraping");
    } finally {
      setScraping(false);
    }
  };

  const toggle = (id: string) => {
    setSelecionados((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) { toast.error("Selecione no máximo 3 conteúdos"); return prev; }
      return [...prev, id];
    });
  };

  const transcrever = async () => {
    if (selComVideo.length === 0) { toast.error("Selecione conteúdos em vídeo"); return; }
    setTranscrevendo(true);
    try {
      const { data, error } = await supabase.functions.invoke("scraping-instagram", {
        body: { action: "transcrever", items: selComVideo.map((c) => ({ id: c.id, videoUrl: c.videoUrl })) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const novo: Record<string, string> = {};
      for (const r of data.resultados || []) {
        if (r.erro) toast.error(`Vídeo ${r.id}: ${r.erro}`);
        else novo[r.id] = r.transcricao;
      }
      setTranscricoes((p) => ({ ...p, ...novo }));
      if (Object.keys(novo).length) toast.success("Transcrição concluída");
    } catch (e: any) {
      toast.error(e?.message || "Falha na transcrição");
    } finally {
      setTranscrevendo(false);
    }
  };

  const transcritosSelecionados = selComVideo.filter((c) => transcricoes[c.id]);

  const analisar = async () => {
    if (!agenteId) { toast.error("Selecione o agente de copy"); return; }
    if (transcritosSelecionados.length === 0) { toast.error("Transcreva ao menos um vídeo primeiro"); return; }
    setAnalisando(true);
    setAnalise("");
    try {
      const roteiros = transcritosSelecionados
        .map((c, i) => `Vídeo ${i + 1} — ${c.url || c.id}\n${transcricoes[c.id]}`)
        .join("\n\n---\n\n");
      const mensagem = `${SKILL_ESTRUTURA}\n\n=== ROTEIROS TRANSCRITOS ===\n\n${roteiros}`;

      const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const SB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const resp = await fetch(`${SB_URL}/functions/v1/agente-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        body: JSON.stringify({ agente_id: agenteId, messages: [{ role: "user", content: mensagem }] }),
      });
      if (!resp.ok || !resp.body) {
        let msg = `Erro ${resp.status}`;
        try { const b = await resp.json(); if (b?.error) msg = b.error; } catch { /* */ }
        throw new Error(msg);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const processar = (obj: any) => {
        if (obj.type === "done") setAnalise(obj.reply || "(sem resposta)");
        else if (obj.type === "error") throw new Error(obj.error || "Erro");
      };
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const linhas = buffer.split("\n");
        buffer = linhas.pop() || "";
        for (const linha of linhas) if (linha.trim()) processar(JSON.parse(linha));
      }
      if (buffer.trim()) processar(JSON.parse(buffer));
    } catch (e: any) {
      toast.error(e?.message || "Falha na análise");
    } finally {
      setAnalisando(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="shrink-0 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Instagram className="h-5 w-5 text-primary" /> Scraping de Conteúdos
              </h1>
              <p className="text-sm text-muted-foreground">Rankeie os conteúdos de um perfil por engajamento, transcreva os melhores e analise a estrutura invisível</p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Busca */}
            <Card>
              <CardContent className="py-4 flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Perfil do Instagram</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                    <Input className="pl-7" placeholder="premiapao" value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && buscar()} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Período</label>
                  <Select value={dias} onValueChange={setDias}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Últimos 7 dias</SelectItem>
                      <SelectItem value="15">Últimos 15 dias</SelectItem>
                      <SelectItem value="30">Últimos 30 dias</SelectItem>
                      <SelectItem value="90">Últimos 90 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={buscar} disabled={scraping}>
                  {scraping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  {scraping ? "Buscando..." : "Buscar conteúdos"}
                </Button>
              </CardContent>
            </Card>

            {/* Barra de ações */}
            {conteudos.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur py-2">
                <Badge variant="secondary">{conta ? `@${conta}` : ""} · {conteudos.length} conteúdos</Badge>
                <Badge variant={selecionados.length ? "default" : "outline"}>{selecionados.length}/3 selecionados</Badge>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={transcrever} disabled={transcrevendo || selComVideo.length === 0}>
                  {transcrevendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  Transcrever vídeos ({selComVideo.length})
                </Button>
                <Select value={agenteId} onValueChange={setAgenteId}>
                  <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Agente de copy" /></SelectTrigger>
                  <SelectContent>{agentes.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" onClick={analisar} disabled={analisando || transcritosSelecionados.length === 0}>
                  {analisando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Analisar estrutura invisível
                </Button>
              </div>
            )}

            {/* Ranking */}
            {conteudos.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {conteudos.map((c, i) => {
                  const sel = selecionados.includes(c.id);
                  return (
                    <Card key={c.id} className={`overflow-hidden transition ${sel ? "ring-2 ring-primary" : ""}`}>
                      <div className="relative aspect-square bg-muted">
                        {c.thumbnail
                          ? <img src={proxyImg(c.thumbnail)} alt="" loading="lazy" referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                const img = e.currentTarget as HTMLImageElement;
                                // 1ª falha: tenta a URL direta do Instagram; 2ª falha: esconde.
                                if (img.dataset.fb !== "1" && c.thumbnail) { img.dataset.fb = "1"; img.src = c.thumbnail; }
                                else img.style.display = "none";
                              }} />
                          : <div className="h-full w-full flex items-center justify-center text-muted-foreground"><Instagram className="h-8 w-8" /></div>}
                        <div className="absolute top-2 left-2 flex items-center gap-1">
                          {i < 3 && <Badge className="bg-amber-500 text-black"><Trophy className="h-3 w-3 mr-1" />#{i + 1}</Badge>}
                          {c.isVideo && <Badge variant="secondary"><Play className="h-3 w-3 mr-1" />Vídeo</Badge>}
                        </div>
                        <div className="absolute top-2 right-2">
                          <Checkbox checked={sel} onCheckedChange={() => toggle(c.id)} className="bg-background/90 border-2" />
                        </div>
                      </div>
                      <CardContent className="py-3 space-y-2">
                        <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{c.caption || "— sem legenda —"}</p>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5 text-rose-500" />{fmt(c.likes)}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5 text-sky-500" />{fmt(c.comments)}</span>
                          {c.views > 0 && <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5 text-violet-500" />{fmt(c.views)}</span>}
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px]">eng. {fmt(c.engajamento)}</Badge>
                          {transcricoes[c.id] && <Badge variant="secondary" className="text-[10px]"><FileText className="h-3 w-3 mr-1" />transcrito</Badge>}
                        </div>
                        {transcricoes[c.id] && (
                          <p className="text-[11px] text-muted-foreground line-clamp-3 border-t pt-2">{transcricoes[c.id]}</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Análise */}
            {(analisando || analise) && (
              <Card>
                <CardContent className="py-5">
                  <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
                    <Sparkles className="h-5 w-5 text-primary" /> Estrutura Invisível
                  </h2>
                  {analisando && !analise
                    ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> O agente de copy está analisando os roteiros...</div>
                    : <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{analise}</div>}
                </CardContent>
              </Card>
            )}

            {conteudos.length === 0 && !scraping && (
              <div className="text-center py-16 text-muted-foreground">
                <Instagram className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Digite o @ de um perfil do Instagram para começar.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
