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
  Trash2, RotateCcw, HardDrive,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getOrgId } from "@/lib/org";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Tabela nova ainda não regenerada em supabase/types.ts — cast pontual.
const db = supabase as any;

// URL do serviço Python (video-use) que recebe o vídeo e processa os cortes.
// O vídeo vai DIRETO pra cá (não pelo Supabase Storage, que trava em 50MB no plano free).
const SERVICE_URL = (import.meta.env.VITE_VIDEO_EDITOR_URL as string | undefined)?.replace(/\/$/, "");

// Envia o vídeo (multipart) pro serviço com progresso real via XHR.
function enviarParaServico(
  fields: Record<string, string>, file: File, token: string, onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append("video", file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SERVICE_URL}/cortar`);
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
  status: "pendente" | "processando" | "pronto" | "erro";
  etapa: string | null;
  resultado_url: string | null;
  erro: string | null;
  created_at: string;
};

const STATUS_META: Record<VideoJob["status"], { label: string; cls: string; icon: JSX.Element }> = {
  pendente:    { label: "Na fila",    cls: "bg-amber-500",  icon: <Clock className="h-3 w-3" /> },
  processando: { label: "Cortando",   cls: "bg-blue-600",   icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  pronto:      { label: "Pronto",     cls: "bg-green-600",  icon: <CheckCircle2 className="h-3 w-3" /> },
  erro:        { label: "Erro",       cls: "bg-destructive", icon: <AlertTriangle className="h-3 w-3" /> },
};

export default function VideoEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [brief, setBrief] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<number | null>(null); // % de upload (null = sem upload em curso)
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

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
  // % do pipeline por etapa. O render (etapa mais longa) tem progresso REAL por trecho
  // ("renderizando vídeo (x/y)") e ocupa uma faixa larga (55→95%) para a barra avançar de verdade.
  const pctEtapa = (etapa: string | null): number => {
    const e = (etapa || "").toLowerCase();
    if (e.includes("transcre")) return 15;
    if (e.includes("organiz")) return 28;
    if (e.includes("decid")) return 42;
    if (e.includes("renderiz")) {
      const m = e.match(/\((\d+)\/(\d+)\)/);
      if (m) return Math.min(95, Math.round(55 + (Number(m[1]) / Number(m[2])) * 40));
      return 55;
    }
    if (e.includes("montando") || e.includes("finaliz")) return 97;
    if (e.includes("conclu")) return 100;
    return 6; // na fila / iniciando
  };

  const cortar = async () => {
    if (!file) { toast.error("Selecione um vídeo primeiro."); return; }
    if (!SERVICE_URL) { toast.error("Serviço de vídeo não configurado (VITE_VIDEO_EDITOR_URL)."); return; }
    setEnviando(true);
    setProgresso(0);
    try {
      const orgId = await getOrgId();
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token ?? "";

      // 1) Cria o job (org_id é preenchido pelo trigger set_org_id). video_url fica vazio
      //    porque o vídeo vai direto pro serviço (não pro Storage).
      const ins = await db.from("video_jobs")
        .insert({ nome: file.name, video_url: "", brief: brief.trim() || null, status: "pendente" })
        .select("id").single();
      if (ins.error) throw ins.error;
      const jobId: string = ins.data.id;

      // 2) Envia o vídeo (multipart) pro serviço com progresso real; ele processa em background.
      await enviarParaServico(
        { job_id: jobId, brief: brief.trim(), org_id: orgId ?? "" },
        file, token, setProgresso,
      );

      toast.success("Vídeo enviado para corte. Acompanhe o status abaixo.");
      setFile(null);
      setBrief("");
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
                <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Novo corte</CardTitle>
                <CardDescription>
                  Envie um vídeo e a IA transcreve e remove automaticamente pausas, silêncios e vícios de
                  linguagem ("é...", "tipo..."), gerando uma versão cortada para download.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Vídeo</Label>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="video/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
                  />
                  {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
                </div>
                <div className="space-y-2">
                  <Label>Instrução de corte (opcional)</Label>
                  <Textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="Ex.: remova pausas e vícios de linguagem, mantenha o ritmo dinâmico."
                    rows={3}
                  />
                </div>
                <Button onClick={cortar} disabled={enviando || !file}>
                  {enviando ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Scissors className="h-4 w-4 mr-2" />}
                  {enviando
                    ? progresso !== null ? `Enviando ${progresso}%` : "Iniciando corte..."
                    : "Cortar vídeo"}
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
                        <span className="flex-1 min-w-0 truncate text-sm font-medium">{j.nome || "vídeo"}</span>
                        <span className="text-xs text-muted-foreground hidden sm:inline">{new Date(j.created_at).toLocaleString("pt-BR")}</span>
                        {j.status === "erro" && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Reprocessar corte" onClick={() => reprocessar(j)}>
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
                            <span className="tabular-nums text-muted-foreground">{pctEtapa(j.etapa)}% · {decorrido(j.created_at)}</span>
                          </div>
                          {/* % aproximado por etapa do pipeline (transcrição → pack → IA → render) */}
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-blue-600 transition-all duration-500"
                                 style={{ width: `${pctEtapa(j.etapa)}%` }} />
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
