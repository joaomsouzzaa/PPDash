import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Player, type PlayerRef } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Play, ImagePlus, Trash2, RefreshCw, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EditorTimeline } from "@/components/video-editor/EditorTimeline";
import { Main } from "@/video-editor/remotion/Main";
import {
  clipsParaTimeline, OVERLAY_LAYOUTS, type Clip, type EditorDoc, type OverlayLayout,
} from "@/video-editor/remotion/schema";

const db = supabase as any;
const SERVICE_URL = (import.meta.env.VITE_VIDEO_EDITOR_URL as string | undefined)?.replace(/\/$/, "");
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i;
const LAYOUT_NOME: Record<OverlayLayout, string> = {
  overlay_card: "Card sobreposto (print)",
  split_horizontal: "Split — imagem em cima",
  image_fullscreen: "Imagem em tela cheia",
  broll_fullscreen: "B-roll em tela cheia",
};

export default function VideoEditorEditor() {
  const { jobId = "" } = useParams();
  const navigate = useNavigate();
  const playerRef = useRef<PlayerRef>(null);

  const [doc, setDoc] = useState<EditorDoc | null>(null);
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [renderizando, setRenderizando] = useState(false);
  const primeiraGravacao = useRef(true);

  const mediaBase = `${SERVICE_URL}/work/${jobId}`;

  // Carrega o editor_doc do banco.
  useEffect(() => {
    (async () => {
      const { data } = await db.from("video_jobs").select("nome,timeline,status").eq("id", jobId).maybeSingle();
      if (!data?.timeline?.clips) { toast.error("Edição não encontrada para este job."); setCarregando(false); return; }
      setNome(data.nome || "vídeo");
      setDoc(data.timeline as EditorDoc);
      setCarregando(false);
    })();
  }, [jobId]);

  // Autosave (debounce) — grava no banco a cada ajuste; sobrevive a fechar/reabrir.
  useEffect(() => {
    if (!doc) return;
    if (primeiraGravacao.current) { primeiraGravacao.current = false; return; }
    const t = setTimeout(() => {
      db.from("video_jobs").update({ timeline: doc }).eq("id", jobId).then(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [doc, jobId]);

  // Sincroniza o playhead com o Player.
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !doc) return;
    const fps = doc.fps || 30;
    const cb = (e: { detail: { frame: number } }) => setCurrentTime(e.detail.frame / fps);
    p.addEventListener("frameupdate", cb as any);
    return () => p.removeEventListener("frameupdate", cb as any);
  }, [doc]);

  // Timeline para o PREVIEW usa o proxy leve (fluido); o render final usa o vídeo full.
  const timeline = useMemo(() => {
    if (!doc) return null;
    const tl = clipsParaTimeline(doc);
    return { ...tl, video: doc.videoPreview || doc.video };
  }, [doc]);
  const fps = doc?.fps || 30;
  const durationInFrames = Math.max(1, Math.round((doc?.durationInSeconds || 1) * fps));
  const selected = doc?.clips.find((c) => c.id === selectedId) || null;

  const setClips = useCallback((updater: (cs: Clip[]) => Clip[]) => {
    setDoc((d) => (d ? { ...d, clips: updater(d.clips) } : d));
  }, []);

  const updateClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, [setClips]);

  const addClip = (assetId: string) => {
    if (!doc) return;
    const start = Math.min(currentTime, Math.max(0, doc.durationInSeconds - 3));
    const end = Math.min(doc.durationInSeconds, start + 3);
    const isVid = VIDEO_EXT.test(doc.assets[assetId] || "");
    const novo: Clip = {
      id: `c${Date.now().toString(36)}`,
      asset: assetId, layout: isVid ? "broll_fullscreen" : "overlay_card",
      start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000,
    };
    setClips((cs) => [...cs, novo]);
    setSelectedId(novo.id);
  };

  const removeClip = (id: string) => {
    setClips((cs) => cs.filter((c) => c.id !== id));
    setSelectedId(null);
  };

  const seek = (t: number) => {
    setCurrentTime(t);
    playerRef.current?.seekTo(Math.round(t * fps));
  };

  const renderizar = async () => {
    if (!SERVICE_URL) { toast.error("Serviço não configurado."); return; }
    setRenderizando(true);
    try {
      // garante que o último estado foi salvo antes de renderizar
      await db.from("video_jobs").update({ timeline: doc }).eq("id", jobId);
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      const res = await fetch(`${SERVICE_URL}/renderizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!res.ok) throw new Error(`Serviço respondeu ${res.status}`);
      toast.success("Renderizando o vídeo final…");
      navigate("/video-editor");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao renderizar.");
    } finally {
      setRenderizando(false);
    }
  };

  if (carregando) return <div className="flex h-screen items-center justify-center text-muted-foreground">Carregando edição…</div>;
  if (!doc || !timeline) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>Edição não encontrada.</p>
        <Button variant="outline" onClick={() => navigate("/video-editor")}><ChevronLeft className="h-4 w-4 mr-2" /> Voltar</Button>
      </div>
    );
  }

  const assetIds = Object.keys(doc.assets);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/video-editor")}><ChevronLeft className="h-4 w-4" /></Button>
        <Film className="h-4 w-4 text-violet-600" />
        <h1 className="text-sm font-semibold truncate flex-1">Editar · {nome}</h1>
        <Button onClick={renderizar} disabled={renderizando}>
          {renderizando ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Renderizar vídeo final
        </Button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Preview */}
        <div className="flex w-[360px] shrink-0 flex-col items-center justify-center border-r bg-black/40 p-4">
          <div style={{ width: 280, height: 498 }} className="overflow-hidden rounded-lg border bg-black">
            <Player
              ref={playerRef}
              component={Main as any}
              inputProps={{ timeline, words: doc.words, assets: doc.assets, mediaBase, preview: true }}
              durationInFrames={durationInFrames}
              fps={fps}
              compositionWidth={1080}
              compositionHeight={1920}
              style={{ width: 280, height: 498 }}
              controls
              acknowledgeRemotionLicense
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Preview ao vivo · {fmt(currentTime)} / {fmt(doc.durationInSeconds)}</p>
        </div>

        {/* Edição */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* Painel do clip selecionado */}
          {selected ? (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Layout desta imagem</label>
                <Select value={selected.layout} onValueChange={(v) => updateClip(selected.id, { layout: v as OverlayLayout })}>
                  <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OVERLAY_LAYOUTS.map((l) => <SelectItem key={l} value={l}>{LAYOUT_NOME[l]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Imagem</label>
                <Select value={selected.asset} onValueChange={(v) => updateClip(selected.id, { asset: v })}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {assetIds.map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground">{fmt(selected.start)} – {fmt(selected.end)}</div>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeClip(selected.id)}>
                <Trash2 className="h-4 w-4 mr-1" /> Remover
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Clique numa imagem na timeline para editar, ou adicione uma da galeria abaixo. Arraste para mover; puxe as bordas para esticar.</p>
          )}

          {/* Timeline arrastável */}
          <EditorTimeline
            clips={doc.clips}
            duration={doc.durationInSeconds}
            currentTime={currentTime}
            selectedId={selectedId}
            onSeek={seek}
            onSelect={setSelectedId}
            onUpdateClip={updateClip}
          />

          {/* Galeria de assets */}
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Mídias enviadas — clique para inserir no tempo atual</p>
            <div className="flex flex-wrap gap-2">
              {assetIds.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma mídia enviada neste vídeo.</p>}
              {assetIds.map((id) => {
                const path = doc.assets[id];
                const isVid = VIDEO_EXT.test(path);
                return (
                  <button key={id} onClick={() => addClip(id)}
                    className="group relative h-20 w-20 overflow-hidden rounded-md border hover:ring-2 hover:ring-violet-500">
                    {isVid
                      ? <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-white text-xs">vídeo</div>
                      : <img src={`${mediaBase}/${path}`} alt={id} className="h-full w-full object-cover" />}
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 text-[10px] text-white text-center opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1">
                      <ImagePlus className="h-3 w-3" /> inserir
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}
