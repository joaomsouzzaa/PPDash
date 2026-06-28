import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { PlayerRef } from "@remotion/player";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  montarTimeline, CAPTION_STYLE_DEFAULT, isFree,
  type Clip, type EditorDoc, type CaptionStyle, type VideoSegment, type TextLayer,
} from "@/video-editor/remotion/schema";

const db = supabase as any;
const SERVICE_URL = (import.meta.env.VITE_VIDEO_EDITOR_URL as string | undefined)?.replace(/\/$/, "");
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Toda a lógica do editor de vídeo (carregar/salvar/handlers), compartilhada entre layouts.
export function useEditorDoc(jobId: string) {
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

  useEffect(() => {
    (async () => {
      const { data } = await db.from("video_jobs").select("nome,timeline,status").eq("id", jobId).maybeSingle();
      if (!data?.timeline?.clips) { toast.error("Edição não encontrada para este job."); setCarregando(false); return; }
      setNome(data.nome || "vídeo");
      setDoc(data.timeline as EditorDoc);
      setCarregando(false);
    })();
  }, [jobId]);

  useEffect(() => {
    if (!doc) return;
    if (primeiraGravacao.current) { primeiraGravacao.current = false; return; }
    const t = setTimeout(() => { db.from("video_jobs").update({ timeline: doc }).eq("id", jobId).then(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [doc, jobId]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || !doc) return;
    const fps = doc.fps || 30;
    const cb = (e: { detail: { frame: number } }) => setCurrentTime(e.detail.frame / fps);
    p.addEventListener("frameupdate", cb as any);
    return () => p.removeEventListener("frameupdate", cb as any);
  }, [doc]);

  const { timeline, words: outWords } = useMemo(() => {
    if (!doc) return { timeline: null as any, words: [] as any[] };
    const r = montarTimeline(doc);
    return { timeline: { ...r.timeline, video: doc.videoPreview || doc.video }, words: r.words };
  }, [doc]);

  const fps = doc?.fps || 30;
  const durationInFrames = Math.max(1, Math.round((doc?.durationInSeconds || 1) * fps));
  const selected = doc?.clips.find((c) => c.id === selectedId) || null;
  const assetIds = doc ? Object.keys(doc.assets) : [];

  const setClips = useCallback((updater: (cs: Clip[]) => Clip[]) => {
    setDoc((d) => (d ? { ...d, clips: updater(d.clips) } : d));
  }, []);
  const updateClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, [setClips]);

  // Z-order unificado entre camadas livres (clips com box) e textos.
  const allZ = (d: EditorDoc): number[] =>
    [...d.clips.filter(isFree).map((c) => c.zIndex ?? 0), ...(d.texts || []).map((t) => t.zIndex ?? 0)];
  const applyZ = useCallback((id: string, pick: (zs: number[]) => number) => {
    setDoc((d) => {
      if (!d) return d;
      const z = pick(allZ(d));
      if (d.clips.some((c) => c.id === id)) return { ...d, clips: d.clips.map((c) => (c.id === id ? { ...c, zIndex: z } : c)) };
      return { ...d, texts: (d.texts || []).map((t) => (t.id === id ? { ...t, zIndex: z } : t)) };
    });
  }, []);
  const bringToFront = useCallback((id: string) => applyZ(id, (zs) => Math.max(0, ...zs) + 1), [applyZ]);
  const sendToBack = useCallback((id: string) => applyZ(id, (zs) => Math.min(0, ...zs) - 1), [applyZ]);
  // Converte um clip em layout para camada livre: box a partir da região atual do layout.
  const makeFree = useCallback((id: string) => {
    setDoc((d) => {
      if (!d) return d;
      const c = d.clips.find((x) => x.id === id);
      if (!c || isFree(c)) return d;
      const r = Math.min(0.9, Math.max(0.1, c.splitRatio ?? 0.6));
      let box = { x: 0, y: 0, w: 1, h: 1 };
      if (c.layout === "split_horizontal") box = { x: 0, y: 0, w: 1, h: 1 - r };
      else if (c.layout === "split_bottom") box = { x: 0, y: r, w: 1, h: 1 - r };
      else if (c.layout === "overlay_card") box = { x: 0.12, y: 0.18, w: 0.76, h: 0.5 };
      const z = Math.max(0, ...allZ(d)) + 1;
      return { ...d, clips: d.clips.map((x) => (x.id === id ? { ...x, box, zIndex: z } : x)) };
    });
  }, [allZ]);

  // Transform do vídeo principal (talking-head) como camada.
  const head = doc?.head ?? {};
  const updateHead = useCallback((patch: Partial<NonNullable<EditorDoc["head"]>>) => {
    setDoc((d) => (d ? { ...d, head: { ...(d.head || {}), ...patch } } : d));
  }, []);

  // Memoizado: senão um objeto novo a cada render faz o Player re-renderizar/re-bufferizar
  // durante o play (trava/engasga/repete áudio).
  const capStyle: CaptionStyle = useMemo(() => ({ ...CAPTION_STYLE_DEFAULT, ...(doc?.captionStyle || {}) }), [doc?.captionStyle]);
  const setCapStyle = useCallback((patch: Partial<CaptionStyle>) => {
    setDoc((d) => (d ? { ...d, captionStyle: { ...CAPTION_STYLE_DEFAULT, ...(d.captionStyle || {}), ...patch } } : d));
  }, []);
  const editCaption = useCallback((indices: number[], texto: string) => {
    const tokens = texto.trim().split(/\s+/).filter(Boolean);
    setDoc((d) => {
      if (!d) return d;
      const words = [...d.words];
      indices.forEach((gi, k) => {
        const novo = k < tokens.length ? (k === indices.length - 1 ? tokens.slice(k).join(" ") : tokens[k]) : "";
        words[gi] = { ...words[gi], word: novo };
      });
      return { ...d, words };
    });
  }, []);

  const videoVolume = doc?.videoVolume ?? 1;
  const music = doc?.music ?? null;
  const setVideoVolume = useCallback((v: number) => setDoc((d) => (d ? { ...d, videoVolume: v } : d)), []);
  const setMusicVol = useCallback((v: number) => setDoc((d) => (d && d.music ? { ...d, music: { ...d.music, volume: v } } : d)), []);
  const setMusicStart = useCallback((s: number) => setDoc((d) => (d && d.music ? { ...d, music: { ...d.music, start: Math.max(0, s) } } : d)), []);
  const removerMusica = useCallback(() => setDoc((d) => (d ? { ...d, music: null } : d)), []);

  const videoSegments = doc?.videoSegments ?? null;
  const originalDuration = doc?.originalDuration ?? doc?.durationInSeconds ?? 0;
  const trimSeg = useCallback((id: string, patch: Partial<VideoSegment>) => {
    setDoc((d) => (d && d.videoSegments ? { ...d, videoSegments: d.videoSegments.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : d));
  }, []);
  const deleteSeg = useCallback((id: string) => {
    setDoc((d) => (d && d.videoSegments ? { ...d, videoSegments: d.videoSegments.filter((s) => s.id !== id) } : d));
  }, []);
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
        } else novos.push(s);
        cursor += len;
      }
      return { ...d, videoSegments: novos };
    });
  }, []);

  // Texto
  const texts = doc?.texts ?? [];
  const selectedText = texts.find((t) => t.id === selectedTextId) || null;
  const addText = useCallback(() => {
    setDoc((d) => {
      if (!d) return d;
      const start = Math.min(currentTime, Math.max(0, d.durationInSeconds - 3));
      const z = Math.max(0, ...allZ(d)) + 1;
      const novo: TextLayer = {
        id: `t${Date.now().toString(36)}`, text: "Texto", start: round3(start),
        end: round3(Math.min(d.durationInSeconds, start + 3)),
        x: 0.5, y: 0.5, fontSize: 80, color: "#FFFFFF", bgColor: "transparent", bold: true, align: "center", zIndex: z,
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

  const addClip = useCallback((assetId: string) => {
    setDoc((d) => {
      if (!d) return d;
      const start = Math.min(currentTime, Math.max(0, d.durationInSeconds - 3));
      const end = Math.min(d.durationInSeconds, start + 3);
      const isVid = VIDEO_EXT.test(d.assets[assetId] || "");
      const z = Math.max(0, ...allZ(d)) + 1;
      const novo: Clip = {
        id: `c${Date.now().toString(36)}`, asset: assetId, layout: isVid ? "broll_fullscreen" : "overlay_card",
        start: round3(start), end: round3(end),
        box: { x: 0, y: 0, w: 1, h: 1 }, zIndex: z,  // camada livre por padrão (mover/redimensionar/recortar)
      };
      setSelectedId(novo.id);
      return { ...d, clips: [...d.clips, novo] };
    });
  }, [currentTime]);
  const removeClip = useCallback((id: string) => { setClips((cs) => cs.filter((c) => c.id !== id)); setSelectedId(null); }, [setClips]);
  const duplicateClip = useCallback((id: string) => {
    setDoc((d) => {
      if (!d) return d;
      const c = d.clips.find((x) => x.id === id); if (!c) return d;
      const len = c.end - c.start;
      const start = Math.min(d.durationInSeconds - 0.3, c.end);
      const novo: Clip = { ...c, id: `c${Date.now().toString(36)}`, start: round3(start), end: round3(Math.min(d.durationInSeconds, start + len)) };
      setSelectedId(novo.id);
      return { ...d, clips: [...d.clips, novo] };
    });
  }, []);
  const splitClip = useCallback((id: string) => {
    setClips((cs) => {
      const i = cs.findIndex((c) => c.id === id);
      if (i < 0) return cs;
      const c = cs[i];
      if (currentTime <= c.start + 0.1 || currentTime >= c.end - 0.1) { toast.error("Posicione o playhead dentro do clipe."); return cs; }
      const a = { ...c, id: `${c.id}a`, end: round3(currentTime) };
      const b = { ...c, id: `${c.id}b`, start: round3(currentTime), assetStart: round3((c.assetStart ?? 0) + (currentTime - c.start)) };
      const novo = [...cs]; novo.splice(i, 1, a, b);
      return novo;
    });
  }, [setClips, currentTime]);

  const seek = useCallback((t: number) => {
    setCurrentTime(t);
    playerRef.current?.seekTo(Math.round(t * fps));
  }, [fps]);

  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => {
    const p = playerRef.current; if (!p) return;
    const on = () => setIsPlaying(true), off = () => setIsPlaying(false);
    p.addEventListener("play", on); p.addEventListener("pause", off); p.addEventListener("ended", off);
    return () => { p.removeEventListener("play", on); p.removeEventListener("pause", off); p.removeEventListener("ended", off); };
  }, [doc]);
  const togglePlay = useCallback(() => {
    const p = playerRef.current; if (!p) return;
    try {
      const playing = typeof p.isPlaying === "function" ? p.isPlaying() : isPlaying;
      if (playing) { p.pause(); return; }
      // Player do Remotion começa mutado; o play vem do nosso botão, então liga o áudio aqui.
      try { (p as any).unmute?.(); (p as any).setVolume?.(1); } catch { /* noop */ }
      p.play();
    } catch { /* noop */ }
  }, [isPlaying]);

  const [subindoMusica, setSubindoMusica] = useState(false);
  const uploadMusica = useCallback(async (file: File) => {
    setSubindoMusica(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      const form = new FormData();
      form.append("job_id", jobId); form.append("file", file, file.name);
      const res = await fetch(`${SERVICE_URL}/upload-asset`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.path) throw new Error(`Falha ao subir música (${res.status})`);
      setDoc((d) => (d ? { ...d, music: { asset: data.path, volume: 0.5, start: 0 } } : d));
      toast.success("Música adicionada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao subir a música.");
    } finally { setSubindoMusica(false); }
  }, [jobId]);

  // Histórico desfazer/refazer. Agrupa rajadas de mudança (ex.: arrastar) por debounce.
  const histPast = useRef<EditorDoc[]>([]);
  const histFuture = useRef<EditorDoc[]>([]);
  const committed = useRef<EditorDoc | null>(null);
  const applyingHist = useRef(false);
  useEffect(() => {
    if (!doc) return;
    if (committed.current === null) { committed.current = doc; return; }
    if (applyingHist.current) { applyingHist.current = false; committed.current = doc; return; }
    const t = setTimeout(() => {
      if (committed.current && committed.current !== doc) {
        histPast.current.push(committed.current);
        if (histPast.current.length > 60) histPast.current.shift();
        histFuture.current = [];
        committed.current = doc;
      }
    }, 350);
    return () => clearTimeout(t);
  }, [doc]);
  const undo = useCallback(() => {
    if (!histPast.current.length) return;
    const prev = histPast.current.pop()!;
    applyingHist.current = true;
    setDoc((cur) => { if (cur) histFuture.current.push(cur); return prev; });
  }, []);
  const redo = useCallback(() => {
    if (!histFuture.current.length) return;
    const next = histFuture.current.pop()!;
    applyingHist.current = true;
    setDoc((cur) => { if (cur) histPast.current.push(cur); return next; });
  }, []);

  // Área de transferência: copiar/recortar/colar a camada (clip livre ou texto) selecionada.
  const clipboard = useRef<{ kind: "clip"; data: Clip } | { kind: "text"; data: TextLayer } | null>(null);
  const copySelection = useCallback(() => {
    if (selectedId && selectedId !== "__head__") {
      const c = doc?.clips.find((x) => x.id === selectedId); if (c) { clipboard.current = { kind: "clip", data: c }; toast.success("Camada copiada"); }
    } else if (selectedTextId) {
      const t = (doc?.texts || []).find((x) => x.id === selectedTextId); if (t) { clipboard.current = { kind: "text", data: t }; toast.success("Texto copiado"); }
    }
  }, [selectedId, selectedTextId, doc]);
  const cutSelection = useCallback(() => {
    copySelection();
    if (selectedId && selectedId !== "__head__") removeClip(selectedId);
    else if (selectedTextId) removeText(selectedTextId);
  }, [copySelection, selectedId, selectedTextId, removeClip, removeText]);
  const pasteClipboard = useCallback(() => {
    const cb = clipboard.current; if (!cb) return;
    setDoc((d) => {
      if (!d) return d;
      const start = Math.min(currentTime, Math.max(0, d.durationInSeconds - 0.3));
      if (cb.kind === "clip") {
        const c = cb.data; const len = c.end - c.start;
        const z = Math.max(0, ...allZ(d)) + 1;
        const novo: Clip = { ...c, id: `c${Date.now().toString(36)}`, start: round3(start), end: round3(Math.min(d.durationInSeconds, start + len)), zIndex: z };
        setSelectedId(novo.id);
        return { ...d, clips: [...d.clips, novo] };
      }
      const t = cb.data; const len = t.end - t.start;
      const z = Math.max(0, ...allZ(d)) + 1;
      const novo: TextLayer = { ...t, id: `t${Date.now().toString(36)}`, start: round3(start), end: round3(Math.min(d.durationInSeconds, start + len)), zIndex: z };
      setSelectedTextId(novo.id);
      return { ...d, texts: [...(d.texts || []), novo] };
    });
  }, [currentTime]);

  const renderizar = useCallback(async (onDone: () => void) => {
    if (!SERVICE_URL) { toast.error("Serviço não configurado."); return; }
    setRenderizando(true);
    try {
      await db.from("video_jobs").update({ timeline: doc }).eq("id", jobId);
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      const res = await fetch(`${SERVICE_URL}/renderizar`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!res.ok) throw new Error(`Serviço respondeu ${res.status}`);
      toast.success("Renderizando o vídeo final…");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao renderizar.");
    } finally { setRenderizando(false); }
  }, [doc, jobId]);

  return {
    playerRef, doc, nome, carregando, mediaBase, fps, durationInFrames,
    timeline, outWords, currentTime, seek,
    selectedId, setSelectedId, selected, updateClip, addClip, removeClip, splitClip,
    bringToFront, sendToBack, makeFree, head, updateHead,
    undo, redo, copySelection, cutSelection, pasteClipboard,
    selectedTextId, setSelectedTextId, texts, selectedText, addText, updateText, removeText,
    capStyle, setCapStyle, editCaption,
    videoVolume, setVideoVolume, music, setMusicVol, setMusicStart, removerMusica, uploadMusica, subindoMusica,
    videoSegments, originalDuration, trimSeg, deleteSeg, splitAt,
    assetIds, renderizar, renderizando, VIDEO_EXT,
    isPlaying, togglePlay,
  };
}
