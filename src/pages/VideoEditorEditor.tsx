import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Player, type PlayerRef } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Play, ImagePlus, Trash2, RefreshCw, Film, Plus, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EditorTimeline } from "@/components/video-editor/EditorTimeline";
import { Main } from "@/video-editor/remotion/Main";
import {
  montarTimeline, OVERLAY_LAYOUTS, CAPTION_STYLE_DEFAULT,
  type Clip, type EditorDoc, type OverlayLayout, type CaptionStyle, type VideoSegment, type TextLayer,
} from "@/video-editor/remotion/schema";

const PREVIEW_W = 280, PREVIEW_H = 498, COMP_W = 1080;

const db = supabase as any;
const SERVICE_URL = (import.meta.env.VITE_VIDEO_EDITOR_URL as string | undefined)?.replace(/\/$/, "");
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i;
const LAYOUT_NOME: Record<OverlayLayout, string> = {
  overlay_card: "Card sobreposto (print)",
  split_horizontal: "Split — imagem em cima",
  split_bottom: "Split — imagem embaixo",
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
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
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

  // Timeline + palavras de SAÍDA (Fase 3 monta a partir dos cortes; v2 cai no fallback).
  // Preview usa o proxy leve (fluido); o render final usa o vídeo full.
  const { timeline, words: outWords } = useMemo(() => {
    if (!doc) return { timeline: null as any, words: [] as any[] };
    const r = montarTimeline(doc);
    return { timeline: { ...r.timeline, video: doc.videoPreview || doc.video }, words: r.words };
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

  // Legendas: estilo + edição de texto.
  const capStyle: CaptionStyle = { ...CAPTION_STYLE_DEFAULT, ...(doc?.captionStyle || {}) };
  const setCapStyle = useCallback((patch: Partial<CaptionStyle>) => {
    setDoc((d) => (d ? { ...d, captionStyle: { ...CAPTION_STYLE_DEFAULT, ...(d.captionStyle || {}), ...patch } } : d));
  }, []);
  // Edita a legenda de uma página (duplo-clique no bloco da timeline): distribui o texto
  // editado entre as palavras daquela frase, mantendo os timestamps.
  const editCaption = useCallback((indices: number[], texto: string) => {
    const tokens = texto.trim().split(/\s+/).filter(Boolean);
    setDoc((d) => {
      if (!d) return d;
      const words = [...d.words];
      indices.forEach((gi, k) => {
        const novo = k < tokens.length
          ? (k === indices.length - 1 ? tokens.slice(k).join(" ") : tokens[k])  // último recebe o resto
          : "";
        words[gi] = { ...words[gi], word: novo };
      });
      return { ...d, words };
    });
  }, []);

  // Áudio: volume do vídeo original + música (upload/volume/início).
  const videoVolume = doc?.videoVolume ?? 1;
  const music = doc?.music ?? null;
  const setVideoVolume = useCallback((v: number) => setDoc((d) => (d ? { ...d, videoVolume: v } : d)), []);
  const setMusicVol = useCallback((v: number) => setDoc((d) => (d && d.music ? { ...d, music: { ...d.music, volume: v } } : d)), []);
  const setMusicStart = useCallback((s: number) => setDoc((d) => (d && d.music ? { ...d, music: { ...d.music, start: Math.max(0, s) } } : d)), []);
  const removerMusica = useCallback(() => setDoc((d) => (d ? { ...d, music: null } : d)), []);

  // Cortes (Fase 3): aparar/dividir/apagar segmentos do vídeo original.
  const videoSegments = doc?.videoSegments ?? null;
  const originalDuration = doc?.originalDuration ?? doc?.durationInSeconds ?? 0;
  const trimSeg = useCallback((id: string, patch: Partial<VideoSegment>) => {
    setDoc((d) => (d && d.videoSegments ? { ...d, videoSegments: d.videoSegments.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : d));
  }, []);
  const deleteSeg = useCallback((id: string) => {
    setDoc((d) => (d && d.videoSegments ? { ...d, videoSegments: d.videoSegments.filter((s) => s.id !== id) } : d));
  }, []);
  // Divide no tempo de SAÍDA (outTime): acha o segmento e quebra no tempo-fonte correspondente.
  const splitAt = useCallback((outTime: number) => {
    setDoc((d) => {
      if (!d || !d.videoSegments) return d;
      let cursor = 0; const novos: VideoSegment[] = [];
      for (const s of d.videoSegments) {
        const len = s.sourceEnd - s.sourceStart;
        if (outTime > cursor + 0.1 && outTime < cursor + len - 0.1) {
          const srcCut = s.sourceStart + (outTime - cursor);
          novos.push({ id: `${s.id}a`, sourceStart: s.sourceStart, sourceEnd: srcCut });
          novos.push({ id: `${s.id}b`, sourceStart: srcCut, sourceEnd: s.sourceEnd });
        } else {
          novos.push(s);
        }
        cursor += len;
      }
      return { ...d, videoSegments: novos };
    });
  }, []);
  // Camadas de texto livre (arrastáveis no preview).
  const texts = doc?.texts ?? [];
  const addText = useCallback(() => {
    setDoc((d) => {
      if (!d) return d;
      const start = Math.min(currentTime, Math.max(0, d.durationInSeconds - 3));
      const novo: TextLayer = {
        id: `t${Date.now().toString(36)}`, text: "Texto", start: round3(start),
        end: round3(Math.min(d.durationInSeconds, start + 3)),
        x: 0.5, y: 0.5, fontSize: 80, color: "#FFFFFF", bgColor: "transparent", bold: true, align: "center",
      };
      return { ...d, texts: [...(d.texts || []), novo] };
    });
  }, [currentTime]);
  const updateText = useCallback((id: string, patch: Partial<TextLayer>) => {
    setDoc((d) => (d ? { ...d, texts: (d.texts || []).map((t) => (t.id === id ? { ...t, ...patch } : t)) } : d));
  }, []);
  const removeText = useCallback((id: string) => {
    setDoc((d) => (d ? { ...d, texts: (d.texts || []).filter((t) => t.id !== id) } : d));
    setSelectedTextId(null);
  }, []);
  const selectedText = texts.find((t) => t.id === selectedTextId) || null;

  const [subindoMusica, setSubindoMusica] = useState(false);
  const uploadMusica = async (file: File) => {
    setSubindoMusica(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      const form = new FormData();
      form.append("job_id", jobId);
      form.append("file", file, file.name);
      const res = await fetch(`${SERVICE_URL}/upload-asset`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.path) throw new Error(`Falha ao subir música (${res.status})`);
      setDoc((d) => (d ? { ...d, music: { asset: data.path, volume: 0.5, start: 0 } } : d));
      toast.success("Música adicionada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao subir a música.");
    } finally {
      setSubindoMusica(false);
    }
  };

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

  // Divide o clipe de b-roll selecionado no playhead (vira dois).
  const splitClip = (id: string) => {
    setClips((cs) => {
      const i = cs.findIndex((c) => c.id === id);
      if (i < 0) return cs;
      const c = cs[i];
      if (currentTime <= c.start + 0.1 || currentTime >= c.end - 0.1) { toast.error("Posicione o playhead dentro do clipe."); return cs; }
      const a = { ...c, id: `${c.id}a`, end: round3(currentTime) };
      const b = { ...c, id: `${c.id}b`, start: round3(currentTime) };
      const novo = [...cs]; novo.splice(i, 1, a, b);
      return novo;
    });
  };
  const round3 = (n: number) => Math.round(n * 1000) / 1000;

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
          <div style={{ width: PREVIEW_W, height: PREVIEW_H, position: "relative" }} className="overflow-hidden rounded-lg border bg-black">
            <Player
              ref={playerRef}
              component={Main as any}
              inputProps={{ timeline, words: outWords, assets: doc.assets, mediaBase, preview: true, captionStyle: capStyle, videoVolume, music, texts }}
              durationInFrames={durationInFrames}
              fps={fps}
              compositionWidth={1080}
              compositionHeight={1920}
              style={{ width: PREVIEW_W, height: PREVIEW_H }}
              controls
              acknowledgeRemotionLicense
            />
            {/* Camada interativa: arraste os textos para posicionar */}
            <TextDragLayer
              texts={texts} currentTime={currentTime}
              selectedId={selectedTextId} onSelect={setSelectedTextId} onMove={updateText}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Preview ao vivo · {fmt(currentTime)} / {fmt(doc.durationInSeconds)}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={addText}>
            <Type className="h-4 w-4 mr-1" /> Adicionar texto
          </Button>
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
              {/* Proporção do split (só nos layouts split) */}
              {(["split_horizontal", "split_bottom", "split_vertical"] as string[]).includes(selected.layout) && (
                <div className="space-y-1 w-[170px]">
                  <label className="text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Divisão (vídeo principal)</span><span>{Math.round((selected.splitRatio ?? 0.6) * 100)}%</span>
                  </label>
                  <input type="range" min={20} max={80} value={Math.round((selected.splitRatio ?? 0.6) * 100)}
                    onChange={(e) => updateClip(selected.id, { splitRatio: Number(e.target.value) / 100 })} className="w-full" />
                </div>
              )}
              {/* Recorte (zoom + posição) do b-roll */}
              {(() => {
                const cr = selected.crop; const w = cr?.w ?? 1;
                const zoom = Math.round((1 / w) * 100);
                const maxX = Math.max(0, 1 - w), maxY = Math.max(0, 1 - (cr?.h ?? 1));
                const posX = maxX > 0 ? Math.round(((cr?.x ?? 0) / maxX) * 100) : 50;
                const posY = maxY > 0 ? Math.round(((cr?.y ?? 0) / maxY) * 100) : 50;
                const setCrop = (zz: number, px: number, py: number) => {
                  const ww = 1 / (zz / 100), hh = ww;
                  const mx = Math.max(0, 1 - ww), my = Math.max(0, 1 - hh);
                  if (zz <= 100) updateClip(selected.id, { crop: undefined });
                  else updateClip(selected.id, { crop: { x: round3(mx * px / 100), y: round3(my * py / 100), w: round3(ww), h: round3(hh) } });
                };
                return (
                  <div className="space-y-1 w-[200px]">
                    <label className="text-[11px] text-muted-foreground flex items-center justify-between"><span>Recorte (zoom)</span><span>{zoom}%</span></label>
                    <input type="range" min={100} max={300} value={zoom} onChange={(e) => setCrop(Number(e.target.value), posX, posY)} className="w-full" />
                    {zoom > 100 && (
                      <div className="flex gap-2">
                        <div className="flex-1"><span className="text-[10px] text-muted-foreground">Posição ↔</span>
                          <input type="range" min={0} max={100} value={posX} onChange={(e) => setCrop(zoom, Number(e.target.value), posY)} className="w-full" /></div>
                        <div className="flex-1"><span className="text-[10px] text-muted-foreground">Posição ↕</span>
                          <input type="range" min={0} max={100} value={posY} onChange={(e) => setCrop(zoom, posX, Number(e.target.value))} className="w-full" /></div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="text-xs text-muted-foreground">{fmt(selected.start)} – {fmt(selected.end)}</div>
              <Button variant="outline" size="sm" onClick={() => splitClip(selected.id)}>✂ Dividir</Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeClip(selected.id)}>
                <Trash2 className="h-4 w-4 mr-1" /> Remover
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Clique numa imagem na timeline para editar, ou adicione uma da galeria abaixo. Arraste para mover; puxe as bordas para esticar.</p>
          )}

          {/* Painel da camada de texto selecionada */}
          {selectedText && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-sky-500/40 bg-sky-500/5 p-3">
              <div className="space-y-1 min-w-[220px] flex-1">
                <label className="text-xs text-muted-foreground">Texto</label>
                <input value={selectedText.text} onChange={(e) => updateText(selectedText.id, { text: e.target.value })}
                  className="h-9 w-full rounded border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-sky-500" />
              </div>
              <Cor label="Cor" value={selectedText.color} onChange={(v) => updateText(selectedText.id, { color: v })} />
              <Cor label="Fundo" value={selectedText.bgColor === "transparent" ? "#000000" : selectedText.bgColor}
                onChange={(v) => updateText(selectedText.id, { bgColor: v })}
                extra={<button className="text-[10px] underline text-muted-foreground" onClick={() => updateText(selectedText.id, { bgColor: "transparent" })}>sem fundo</button>} />
              <Num label="Tamanho" value={selectedText.fontSize} min={24} max={220} step={2} onChange={(v) => updateText(selectedText.id, { fontSize: v })} />
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Alinhar</label>
                <Select value={selectedText.align} onValueChange={(v) => updateText(selectedText.id, { align: v as TextLayer["align"] })}>
                  <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Esquerda</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                    <SelectItem value="right">Direita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={selectedText.bold} onChange={(e) => updateText(selectedText.id, { bold: e.target.checked })} /> Negrito
              </label>
              <div className="text-xs text-muted-foreground">{fmt(selectedText.start)} – {fmt(selectedText.end)}</div>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeText(selectedText.id)}>
                <Trash2 className="h-4 w-4 mr-1" /> Remover
              </Button>
              <p className="w-full text-[11px] text-muted-foreground">Arraste o texto direto no preview para posicionar. Arraste o bloco na faixa "Texto" para mudar o tempo.</p>
            </div>
          )}

          {/* Timeline arrastável */}
          <EditorTimeline
            clips={doc.clips}
            duration={doc.durationInSeconds}
            currentTime={currentTime}
            selectedId={selectedId}
            words={doc.words}
            palavrasPorPagina={capStyle.palavrasPorPagina}
            onSeek={seek}
            onSelect={setSelectedId}
            onUpdateClip={updateClip}
            onEditCaption={editCaption}
            music={music}
            onMusicStart={setMusicStart}
            videoSegments={videoSegments}
            originalDuration={originalDuration}
            onTrimSeg={trimSeg}
            onDeleteSeg={deleteSeg}
            onSplit={() => splitAt(currentTime)}
            texts={texts}
            selectedTextId={selectedTextId}
            onSelectText={setSelectedTextId}
            onUpdateText={updateText}
            onEditTextContent={(id, t) => updateText(id, { text: t })}
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

          {/* Legendas: estilo + edição de texto */}
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Legenda</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Cor label="Palavra" value={capStyle.color} onChange={(v) => setCapStyle({ color: v })} />
              <Cor label="Palavra ativa" value={capStyle.activeColor} onChange={(v) => setCapStyle({ activeColor: v })} />
              <Cor label="Borda" value={capStyle.borderColor} onChange={(v) => setCapStyle({ borderColor: v })} />
              <Cor label="Fundo" value={capStyle.bgColor === "transparent" ? "#000000" : capStyle.bgColor}
                   onChange={(v) => setCapStyle({ bgColor: v })}
                   extra={<button className="text-[10px] underline text-muted-foreground" onClick={() => setCapStyle({ bgColor: "transparent" })}>sem fundo</button>} />
              <Num label="Tamanho" value={capStyle.fontSize} min={32} max={140} onChange={(v) => setCapStyle({ fontSize: v })} />
              <Num label="Borda (px)" value={capStyle.borderWidth} min={0} max={14} onChange={(v) => setCapStyle({ borderWidth: v })} />
              <Num label="Altura (px)" value={capStyle.posicaoY} min={80} max={900} step={10} onChange={(v) => setCapStyle({ posicaoY: v })} />
              <Num label="Palavras/linha" value={capStyle.palavrasPorPagina} min={1} max={6} onChange={(v) => setCapStyle({ palavrasPorPagina: v })} />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={capStyle.animar} onChange={(e) => setCapStyle({ animar: e.target.checked })} />
              Animar palavra ativa (pop)
            </label>

            <p className="text-xs text-muted-foreground pt-1">
              ✏️ Para corrigir o texto, dê <b>duplo-clique</b> no bloco da legenda na timeline (faixa "Legendas") e digite a correção.
            </p>
          </div>

          {/* Áudio: volume do vídeo + música */}
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Áudio</p>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground flex items-center justify-between">
                <span>Volume do vídeo (original)</span><span>{Math.round(videoVolume * 100)}%</span>
              </label>
              <input type="range" min={0} max={100} value={Math.round(videoVolume * 100)}
                onChange={(e) => setVideoVolume(Number(e.target.value) / 100)} className="w-full" />
            </div>

            {!music ? (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50">
                {subindoMusica ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar música
                <input type="file" accept="audio/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMusica(f); e.currentTarget.value = ""; }} />
              </label>
            ) : (
              <div className="space-y-2 rounded-md border p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate">🎵 {music.asset.split("/").pop()}</span>
                  <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={removerMusica}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Volume da música</span><span>{Math.round(music.volume * 100)}%</span>
                  </label>
                  <input type="range" min={0} max={100} value={Math.round(music.volume * 100)}
                    onChange={(e) => setMusicVol(Number(e.target.value) / 100)} className="w-full" />
                </div>
                <p className="text-[11px] text-muted-foreground">Início: {fmt(music.start)} (arraste o bloco na faixa "Música" da timeline).</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Camada transparente sobre o Player: mostra os textos ativos como caixas arrastáveis.
function TextDragLayer({ texts, currentTime, selectedId, onSelect, onMove }: {
  texts: TextLayer[];
  currentTime: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, patch: Partial<TextLayer>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ativos = texts.filter((t) => currentTime >= t.start - 0.001 && currentTime < t.end);
  const scale = PREVIEW_W / COMP_W; // px da composição → px do preview
  const startDrag = (e: React.PointerEvent, t: TextLayer) => {
    e.preventDefault(); e.stopPropagation();
    onSelect(t.id);
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const mv = (ev: PointerEvent) => {
      const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
      onMove(t.id, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {ativos.map((t) => (
        <div key={t.id}
          onPointerDown={(e) => startDrag(e, t)}
          style={{
            position: "absolute", left: `${(t.x ?? 0.5) * 100}%`, top: `${(t.y ?? 0.5) * 100}%`,
            transform: "translate(-50%, -50%)", maxWidth: "90%",
            fontSize: (t.fontSize ?? 80) * scale, color: t.color, fontWeight: t.bold ? 800 : 500,
            backgroundColor: t.bgColor && t.bgColor !== "transparent" ? t.bgColor : "transparent",
            padding: t.bgColor && t.bgColor !== "transparent" ? "0.15em 0.4em" : 0,
            textAlign: t.align, lineHeight: 1.1, whiteSpace: "pre-wrap",
            fontFamily: "Inter, system-ui, sans-serif", textShadow: "0 2px 12px rgba(0,0,0,0.55)",
            pointerEvents: "auto", cursor: "grab", userSelect: "none",
            outline: t.id === selectedId ? "2px dashed #38bdf8" : "1px dashed rgba(255,255,255,0.35)",
            outlineOffset: 2, borderRadius: 6,
          }}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Cor({ label, value, onChange, extra }: { label: string; value: string; onChange: (v: string) => void; extra?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground flex items-center justify-between">{label}{extra}</label>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full cursor-pointer rounded border bg-transparent" />
    </div>
  );
}

function Num({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
        className="h-8 w-full rounded border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-violet-500" />
    </div>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}
