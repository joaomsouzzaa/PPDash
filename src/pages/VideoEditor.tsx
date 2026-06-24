import { useState, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Scissors, Upload, Download, RefreshCw, Film, AlertTriangle, Loader2, Clock, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getOrgId } from "@/lib/org";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Tabela nova ainda não regenerada em supabase/types.ts — cast pontual.
const db = supabase as any;

// URL do serviço Python (video-use) que processa os cortes.
const SERVICE_URL = (import.meta.env.VITE_VIDEO_EDITOR_URL as string | undefined)?.replace(/\/$/, "");

type VideoJob = {
  id: string;
  nome: string | null;
  video_url: string;
  brief: string | null;
  status: "pendente" | "processando" | "pronto" | "erro";
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
      return list.some((j) => j.status === "pendente" || j.status === "processando") ? 5000 : false;
    },
  });

  const cortar = async () => {
    if (!file) { toast.error("Selecione um vídeo primeiro."); return; }
    if (!SERVICE_URL) { toast.error("Serviço de vídeo não configurado (VITE_VIDEO_EDITOR_URL)."); return; }
    setEnviando(true);
    try {
      // 1) Upload do vídeo de entrada no bucket video-editor (pasta da org).
      const orgId = await getOrgId();
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("video-editor").upload(path, file, { contentType: file.type || "video/mp4" });
      if (up.error) throw up.error;
      const videoUrl = supabase.storage.from("video-editor").getPublicUrl(path).data.publicUrl;

      // 2) Cria o job (org_id é preenchido pelo trigger set_org_id).
      const ins = await db.from("video_jobs")
        .insert({ nome: file.name, video_url: videoUrl, brief: brief.trim() || null, status: "pendente" })
        .select("id").single();
      if (ins.error) throw ins.error;
      const jobId: string = ins.data.id;

      // 3) Dispara o serviço Python (processa em background).
      const session = await supabase.auth.getSession();
      const res = await fetch(`${SERVICE_URL}/cortar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.data.session?.access_token ?? ""}` },
        body: JSON.stringify({ job_id: jobId, video_url: videoUrl, brief: brief.trim(), org_id: orgId }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Serviço respondeu ${res.status}: ${txt.slice(0, 200)}`);
      }

      toast.success("Vídeo enviado para corte. Acompanhe o status abaixo.");
      setFile(null);
      setBrief("");
      if (inputRef.current) inputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["video_jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar o vídeo.");
    } finally {
      setEnviando(false);
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
                  {enviando ? "Enviando..." : "Cortar vídeo"}
                </Button>
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
                <CardTitle className="text-base flex items-center gap-2"><Film className="h-4 w-4" /> Meus cortes</CardTitle>
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
                        <span className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      {j.brief && <p className="text-xs text-muted-foreground line-clamp-2">Instrução: {j.brief}</p>}
                      {j.status === "erro" && j.erro && (
                        <p className="text-xs text-destructive">{j.erro}</p>
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
