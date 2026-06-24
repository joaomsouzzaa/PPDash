import { useState, useRef, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Scissors, Upload, Download, RefreshCw, Film, AlertTriangle, Loader2, Clock, CheckCircle2,
  Trash2, RotateCcw, HardDrive, Wand2, ImagePlus, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getOrgId } from "@/lib/org";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

// Tabela nova ainda não regenerada em supabase/types.ts — cast pontual.
const db = supabase as any;

// URL do serviço Python (video-use) que recebe o vídeo e processa os cortes.
// O vídeo vai DIRETO pra cá (não pelo Supabase Storage, que trava em 50MB no plano free).
const SERVICE_URL = (import.meta.env.VITE_VIDEO_EDITOR_URL as string | undefined)?.replace(/\/$/, "");

// Envia o vídeo (+ assets opcionais) em multipart pro serviço, com progresso real via XHR.
function enviarParaServico(
  path: string, fields: Record<string, string>, video: File,
  assetFiles: { file: File; name: string }[], token: string, onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append("video", video, video.name);
    for (const a of assetFiles) form.append("assets", a.file, a.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SERVICE_URL}${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Serviço respondeu ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
    xhr.onerror = () => reject(new Error("Falha de rede ao enviar o vídeo"));
    xhr.send(form);
  });
}

type VideoJob = {
  id: string;
  nome: string | null;
  video_url: string;
  brief: string | null;
  status: "pendente" | "processando" | "pronto" | "erro" | "editar";
  etapa: string | null;
  modo: "corte" | "completo" | null;
  resultado_url: string | null;
  erro: string | null;
  created_at: string;
};

type AssetItem = { file: File; descricao: string };

const STATUS_META: Record<VideoJob["status"], { label: string; cls: string; icon: JSX.Element }> = {
  pendente:    { label: "Na fila",    cls: "bg-amber-500",  icon: <Clock className="h-3 w-3" /> },
  processando: { label: "Processando", cls: "bg-blue-600",  icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  editar:      { label: "Pronto p/ editar", cls: "bg-violet-600", icon: <Wand2 className="h-3 w-3" /> },
  pronto:      { label: "Pronto",     cls: "bg-green-600",  icon: <CheckCircle2 className="h-3 w-3" /> },
  erro:        { label: "Erro",       cls: "bg-destructive", icon: <AlertTriangle className="h-3 w-3" /> },
};

export default function VideoEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [brief, setBrief] = useState("");
  const [modo, setModo] = useState<"corte" | "completo">("corte");
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<number | null>(null); // % de upload (null = sem upload em curso)
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Lista de jobs da org. Faz polling enquanto houver algum em andamento.
  const { data: jobs = [] } = useQuery<VideoJob[]>({
    queryKey: ["video_jobs"],
    queryFn: async () => {
      const { data } = await db.from("video_jobs").select("*").order("created_at", { ascending: false });
      return (data || []) as VideoJob[];
    },
    refetchInterval: (q) => {
      const list = (q.state.data as VideoJob[] | undefined) || [];
      return list.some((j) => j.status === "pendente" || j.status === "processando") ? 4000 : false;
    },
  });

  // Uso de disco da VPS (atualiza a cada 30s).
  const { data: disco } = useQuery<{ used_gb: number; total_gb: number; free_gb: number; pct_used: number } | null>({
    queryKey: ["video_disk"],
    enabled: !!SERVICE_URL,
    refetchInterval: 30000,
    queryFn: async () => {
      try {
        const res = await fetch(`${SERVICE_URL}/disk`);
        return res.ok ? await res.json() : null;
      } catch { return null; }
    },
  });

  // Relógio que tica de 1s em 1s enquanto há job em andamento (para o tempo decorrido).
  const [agora, setAgora] = useState(() => Date.now());
  const temAtivo = jobs.some((j) => j.status === "pendente" || j.status === "processando");
  useEffect(() => {
    if (!temAtivo) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [temAtivo]);
  const decorrido = (iso: string) => {
    const s = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  // % aproximado do pipeline por etapa (depende do modo: corte simples vs edição completa).
  const frac = (e: string) => { const m = e.match(/\((\d+)\/(\d+)\)/); return m ? Number(m[1]) / Number(m[2]) : null; };
  const pct = (e: string) => { const m = e.match(/\((\d+)%\)/); return m ? Number(m[1]) : null; };
  const pctEtapa = (etapa: string | null, modo: VideoJob["modo"]): number => {
    const e = (etapa || "").toLowerCase();
    if (e.includes("conclu")) return 100;
    if (modo === "completo") {
      if (e.includes("transcrevendo áudio") || e.includes("transcrevendo audio")) return 8;
      if (e.includes("organiz")) return 12;
      if (e.includes("decid")) return 16;
      if (e.includes("cortando")) return Math.round(18 + (frac(e) ?? 0) * 17);
      if (e.includes("montando corte")) return 36;
      if (e.includes("transcrevendo legendas")) return 42;
      if (e.includes("planej")) return 50;
      if (e.includes("renderiz")) return Math.min(96, Math.round(55 + (pct(e) ?? 0) * 0.4));
      if (e.includes("montando")) return 97;
      return 4;
    }
    // modo corte
    if (e.includes("transcre")) return 10;
    if (e.includes("organiz")) return 18;
    if (e.includes("decid")) return 28;
    if (e.includes("cortando")) return Math.round(30 + (frac(e) ?? 0) * 60);
    if (e.includes("montando")) return 96;
    return 6;
  };

  const enviar = async () => {
    if (!file) { toast.error("Selecione um vídeo primeiro."); return; }
    if (!SERVICE_URL) { toast.error("Serviço de vídeo não configurado (VITE_VIDEO_EDITOR_URL)."); return; }
    const completo = modo === "completo";
    setEnviando(true);
    setProgresso(0);
    try {
      const orgId = await getOrgId();
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token ?? "";

      // Metadados dos assets (modo completo): id estável + nome de arquivo único.
      const meta = assets.map((a, i) => {
        const ext = (a.file.name.split(".").pop() || "bin").toLowerCase();
        const id = `a${i}`;
        return { id, tipo: "", descricao: a.descricao.trim(), filename: `${id}.${ext}` };
      });
      const assetFiles = completo ? assets.map((a, i) => ({ file: a.file, name: meta[i].filename })) : [];

      // 1) Cria o job (org_id via trigger set_org_id). video_url vazio: vídeo vai direto pro serviço.
      const ins = await db.from("video_jobs")
        .insert({ nome: file.name, video_url: "", brief: brief.trim() || null, status: "pendente", modo })
        .select("id").single();
      if (ins.error) throw ins.error;
      const jobId: string = ins.data.id;

      // 2) Envia tudo pro serviço (corte simples ou edição completa).
      const fields: Record<string, string> = { job_id: jobId, brief: brief.trim(), org_id: orgId ?? "" };
      if (completo) fields.assets_json = JSON.stringify(meta);
      await enviarParaServico(completo ? "/editar" : "/cortar", fields, file, assetFiles, token, setProgresso);

      toast.success(completo ? "Vídeo enviado para edição completa." : "Vídeo enviado para corte.");
      setFile(null);
      setBrief("");
      setAssets([]);
      if (inputRef.current) inputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["video_jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar o vídeo.");
    } finally {
      setEnviando(false);
      setProgresso(null);
    }
  };

  const authToken = async () => (await supabase.auth.getSession()).data.session?.access_token ?? "";

  const deletarJob = async (j: VideoJob) => {
    if (!confirm(`Excluir "${j.nome || "este vídeo"}"? Isso remove o arquivo da VPS e libera espaço.`)) return;
    try {
      const res = await fetch(`${SERVICE_URL}/jobs/${j.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${await authToken()}` },
      });
      if (!res.ok) throw new Error(`Falha ao excluir (${res.status})`);
      toast.success("Vídeo excluído e espaço liberado.");
      queryClient.invalidateQueries({ queryKey: ["video_jobs"] });
      queryClient.invalidateQueries({ queryKey: ["video_disk"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir.");
    }
  };

  const reprocessar = async (j: VideoJob) => {
    try {
      const res = await fetch(`${SERVICE_URL}/reprocessar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await authToken()}` },
        body: JSON.stringify({ job_id: j.id }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${txt.slice(0, 200)}`);
      }
      toast.success("Reprocessando o corte…");
      queryClient.invalidateQueries({ queryKey: ["video_jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reprocessar.");
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <SidebarTrigger />
            <Scissors className="h-5 w-5 text-violet-600" />
            <h1 className="text-lg font-semibold">Vídeo Editor</h1>
            <span className="text-sm text-muted-foreground hidden md:inline">Cortes automáticos de vídeo com IA</span>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {/* Envio de vídeo */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Novo vídeo</CardTitle>
                <CardDescription>
                  {modo === "corte"
                    ? "Corte por IA: transcreve e remove pausas, silêncios e vícios de linguagem, gerando uma versão cortada."
                    : "Edição completa: corta, adiciona legendas animadas e camadas dinâmicas (prints/b-rolls) automaticamente, no estilo editorial."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Toggle de modo */}
                <div className="inline-flex rounded-lg border p-1 gap-1">
                  <Button type="button" size="sm" variant={modo === "corte" ? "default" : "ghost"} onClick={() => setModo("corte")}>
                    <Scissors className="h-4 w-4 mr-2" /> Só cortar
                  </Button>
                  <Button type="button" size="sm" variant={modo === "completo" ? "default" : "ghost"} onClick={() => setModo("completo")}>
                    <Wand2 className="h-4 w-4 mr-2" /> Edição completa
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Vídeo (talking-head)</Label>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="video/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
                  />
                  {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
                </div>

                {/* Assets (só na edição completa) */}
                {modo === "completo" && (
                  <div className="space-y-2">
                    <Label>Imagens / prints / b-rolls (opcional)</Label>
                    <p className="text-xs text-muted-foreground">A IA encaixa cada mídia no momento certo da fala. Descreva cada uma para ajudar (ex.: "print da notícia da Cazé TV").</p>
                    <div className="space-y-2">
                      {assets.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-md border p-2">
                          <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="text-xs truncate w-32 shrink-0" title={a.file.name}>{a.file.name}</span>
                          <input
                            value={a.descricao}
                            onChange={(e) => setAssets((prev) => prev.map((x, k) => k === i ? { ...x, descricao: e.target.value } : x))}
                            placeholder="Descrição da mídia"
                            className="flex-1 bg-transparent text-sm outline-none border-b border-transparent focus:border-border"
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAssets((prev) => prev.filter((_, k) => k !== i))}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50">
                      <ImagePlus className="h-4 w-4" /> Adicionar mídias
                      <input type="file" accept="image/*,video/*" multiple className="hidden"
                        onChange={(e) => {
                          const fs = Array.from(e.target.files ?? []).map((file) => ({ file, descricao: "" }));
                          setAssets((prev) => [...prev, ...fs]);
                          e.currentTarget.value = "";
                        }} />
                    </label>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>{modo === "corte" ? "Instrução de corte (opcional)" : "Instrução de edição (opcional)"}</Label>
                  <Textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder={modo === "corte"
                      ? "Ex.: remova pausas e vícios de linguagem, mantenha o ritmo dinâmico."
                      : "Ex.: ritmo dinâmico, use os prints nos momentos certos, mantenha legendas grandes."}
                    rows={3}
                  />
                </div>
                <Button onClick={enviar} disabled={enviando || !file}>
                  {enviando ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : modo === "corte" ? <Scissors className="h-4 w-4 mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                  {enviando
                    ? progresso !== null ? `Enviando ${progresso}%` : "Iniciando..."
                    : modo === "corte" ? "Cortar vídeo" : "Editar vídeo"}
                </Button>
                {progresso !== null && file && (
                  <div className="space-y-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-violet-600 transition-all duration-200" style={{ width: `${progresso}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enviando vídeo… {progresso}% · {(file.size * progresso / 100 / 1024 / 1024).toFixed(1)} / {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                )}
                {!SERVICE_URL && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Defina <code>VITE_VIDEO_EDITOR_URL</code> no ambiente apontando para o serviço de vídeo.</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Histórico de cortes */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2"><Film className="h-4 w-4" /> Meus cortes</CardTitle>
                  {disco && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground" title="Espaço em disco da VPS">
                      <HardDrive className="h-3.5 w-3.5" />
                      <span className="tabular-nums">{disco.used_gb} / {disco.total_gb} GB ({disco.pct_used}%)</span>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${disco.pct_used > 90 ? "bg-destructive" : disco.pct_used > 75 ? "bg-amber-500" : "bg-green-600"}`}
                             style={{ width: `${disco.pct_used}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {jobs.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">Nenhum corte ainda. Envie um vídeo acima.</p>
                )}
                {jobs.map((j) => {
                  const meta = STATUS_META[j.status];
                  return (
                    <div key={j.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <Badge className={`${meta.cls} gap-1`}>{meta.icon} {meta.label}</Badge>
                        <Badge variant="outline" className="gap-1 hidden sm:inline-flex">
                          {j.modo === "completo" ? <><Wand2 className="h-3 w-3" /> Editado</> : <><Scissors className="h-3 w-3" /> Cortado</>}
                        </Badge>
                        <span className="flex-1 min-w-0 truncate text-sm font-medium">{j.nome || "vídeo"}</span>
                        <span className="text-xs text-muted-foreground hidden sm:inline">{new Date(j.created_at).toLocaleString("pt-BR")}</span>
                        {(j.status === "editar" || (j.status === "pronto" && j.modo === "completo")) && (
                          <Button variant="secondary" size="sm" className="h-8" onClick={() => navigate(`/video-editor/editar/${j.id}`)}>
                            <Wand2 className="h-4 w-4 mr-1" /> Editar
                          </Button>
                        )}
                        {(j.status === "erro" || j.status === "pronto") && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Reprocessar (refazer com os ajustes atuais)" onClick={() => reprocessar(j)}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        {j.status !== "processando" && j.status !== "pendente" && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Excluir e liberar espaço" onClick={() => deletarJob(j)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      {j.brief && <p className="text-xs text-muted-foreground line-clamp-2">Instrução: {j.brief}</p>}
                      {(j.status === "processando" || j.status === "pendente") && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground capitalize">{j.etapa || "na fila"}…</span>
                            <span className="tabular-nums text-muted-foreground">{pctEtapa(j.etapa, j.modo)}% · {decorrido(j.created_at)}</span>
                          </div>
                          {/* % aproximado por etapa do pipeline */}
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-blue-600 transition-all duration-500"
                                 style={{ width: `${pctEtapa(j.etapa, j.modo)}%` }} />
                          </div>
                        </div>
                      )}
                      {j.status === "erro" && j.erro && (
                        <p className="text-xs text-destructive break-words">{j.erro}</p>
                      )}
                      {j.status === "pronto" && j.resultado_url && (
                        <div className="space-y-2">
                          <video src={j.resultado_url} controls className="w-full max-w-md rounded-md border bg-black" />
                          <Button asChild variant="outline" size="sm">
                            <a href={j.resultado_url} download target="_blank" rel="noreferrer">
                              <Download className="h-4 w-4 mr-2" /> Baixar vídeo cortado
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
