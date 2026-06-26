import { useRef, useMemo, useState } from "react";
import type { Clip, Word, Music, VideoSegment, TextLayer } from "@/video-editor/remotion/schema";

const MIN_DUR = 0.3; // duração mínima de um clip (s)
const LAYOUT_LABEL: Record<string, string> = {
  overlay_card: "Card",
  split_horizontal: "Split",
  image_fullscreen: "Tela cheia",
  broll_fullscreen: "B-roll",
};
const LAYOUT_COR: Record<string, string> = {
  overlay_card: "bg-violet-600",
  split_horizontal: "bg-blue-600",
  image_fullscreen: "bg-emerald-600",
  broll_fullscreen: "bg-amber-600",
};

export function EditorTimeline({
  clips, duration, currentTime, selectedId, words = [], palavrasPorPagina = 3, pxs: pxsInit = 90,
  onSeek, onSelect, onUpdateClip, onEditCaption, music = null, onMusicStart,
  videoSegments = null, originalDuration = 0, onTrimSeg, onDeleteSeg, onSplit,
  texts = [], selectedTextId = null, onSelectText, onUpdateText, onEditTextContent,
}: {
  clips: Clip[];
  duration: number;
  currentTime: number;
  selectedId: string | null;
  words?: Word[];
  palavrasPorPagina?: number;
  pxs?: number;
  onSeek: (t: number) => void;
  onSelect: (id: string | null) => void;
  onUpdateClip: (id: string, patch: Partial<Clip>) => void;
  onEditCaption?: (indices: number[], texto: string) => void;
  music?: Music | null;
  onMusicStart?: (s: number) => void;
  videoSegments?: VideoSegment[] | null;
  originalDuration?: number;
  onTrimSeg?: (id: string, patch: Partial<VideoSegment>) => void;
  onDeleteSeg?: (id: string) => void;
  onSplit?: () => void;
  texts?: TextLayer[];
  selectedTextId?: string | null;
  onSelectText?: (id: string | null) => void;
  onUpdateText?: (id: string, patch: Partial<TextLayer>) => void;
  onEditTextContent?: (id: string, texto: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pxs, setPxs] = useState(pxsInit);  // zoom da timeline (px por segundo)
  const width = Math.max(1, duration) * pxs;

  // Ajusta o zoom para a timeline inteira caber na largura visível.
  const ajustarZoom = () => {
    const w = scrollRef.current?.clientWidth || 800;
    setPxs(Math.max(4, Math.min(200, (w - 16) / Math.max(1, duration))));
  };

  // Scrub: arrasta na régua/trilha e o playhead (e o preview) acompanha.
  const startScrub = (clientX: number) => {
    seekFromEvent(clientX);
    const mv = (ev: PointerEvent) => seekFromEvent(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const [editPage, setEditPage] = useState<number | null>(null);  // índice da página em edição
  const [editText, setEditText] = useState("");
  const [editTxtId, setEditTxtId] = useState<string | null>(null); // camada de texto em edição
  const [editTxtVal, setEditTxtVal] = useState("");

  // Arrasta um bloco de texto na timeline (mover início, ou esticar bordas).
  const startDragText = (e: React.PointerEvent, t: TextLayer, mode: "move" | "l" | "r") => {
    e.preventDefault(); e.stopPropagation();
    if (!onUpdateText) return;
    onSelectText?.(t.id);
    const startX = e.clientX, s0 = t.start, e0 = t.end;
    const mv = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / pxs;
      if (mode === "move") { const len = e0 - s0; const ns = Math.min(duration - len, Math.max(0, s0 + dt)); onUpdateText(t.id, { start: round(ns), end: round(ns + len) }); }
      else if (mode === "l") onUpdateText(t.id, { start: round(Math.min(e0 - MIN_DUR, Math.max(0, s0 + dt))) });
      else onUpdateText(t.id, { end: round(Math.max(s0 + MIN_DUR, Math.min(duration, e0 + dt))) });
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  // Páginas de legenda (mesma lógica do Captions) — com os índices globais das palavras.
  const legendas = useMemo(() => {
    const pages: { start: number; end: number; texto: string; indices: number[] }[] = [];
    let cur: typeof pages[number] | null = null;
    words.forEach((w, gi) => {
      const estoura = cur && (w.end - cur.start > 1.1);
      if (!cur || cur.indices.length >= Math.max(1, palavrasPorPagina) || estoura) {
        cur = { start: w.start, end: w.end, texto: w.word, indices: [gi] };
        pages.push(cur);
      } else {
        cur.texto += " " + w.word; cur.end = w.end; cur.indices.push(gi);
      }
    });
    return pages;
  }, [words, palavrasPorPagina]);

  const commitEdit = () => {
    if (editPage !== null && onEditCaption) onEditCaption(legendas[editPage].indices, editText);
    setEditPage(null);
  };

  // Posições de SAÍDA dos cortes (cumulativo) para a faixa de vídeo editável.
  const vsegPos = useMemo(() => {
    let cur = 0;
    return (videoSegments || []).map((s) => {
      const len = Math.max(0, s.sourceEnd - s.sourceStart);
      const p = { seg: s, outStart: cur, len };
      cur += len;
      return p;
    });
  }, [videoSegments]);

  // Aparar um corte (handles): 'l' muda sourceStart, 'r' muda sourceEnd (1s saída = 1s fonte).
  const startTrim = (e: React.PointerEvent, seg: VideoSegment, mode: "l" | "r") => {
    e.preventDefault(); e.stopPropagation();
    if (!onTrimSeg) return;
    const startX = e.clientX, s0 = seg.sourceStart, e0 = seg.sourceEnd;
    const mv = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / pxs;
      if (mode === "l") onTrimSeg(seg.id, { sourceStart: round(Math.min(e0 - 0.3, Math.max(0, s0 + dt))) });
      else onTrimSeg(seg.id, { sourceEnd: round(Math.max(s0 + 0.3, Math.min(originalDuration || e0 + dt, e0 + dt))) });
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  // Clica na régua/trilha para mover o playhead.
  const seekFromEvent = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const t = Math.min(duration, Math.max(0, (clientX - rect.left + el.scrollLeft) / pxs));
    onSeek(t);
  };

  // Drag de um clip (mover ou esticar bordas).
  const startDrag = (e: React.PointerEvent, clip: Clip, mode: "move" | "l" | "r") => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(clip.id);
    const startX = e.clientX;
    const s0 = clip.start;
    const e0 = clip.end;
    const onMove = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / pxs;
      if (mode === "move") {
        const len = e0 - s0;
        let ns = Math.min(duration - len, Math.max(0, s0 + dt));
        onUpdateClip(clip.id, { start: round(ns), end: round(ns + len) });
      } else if (mode === "l") {
        const ns = Math.min(e0 - MIN_DUR, Math.max(0, s0 + dt));
        onUpdateClip(clip.id, { start: round(ns) });
      } else {
        const ne = Math.max(s0 + MIN_DUR, Math.min(duration, e0 + dt));
        onUpdateClip(clip.id, { end: round(ne) });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const ticks = [];
  for (let s = 0; s <= Math.ceil(duration); s++) ticks.push(s);

  return (
    <div className="select-none">
      {/* Controles de zoom da timeline */}
      <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-wide">Timeline</span>
        <button onClick={() => setPxs((p) => Math.max(4, Math.round(p / 1.4)))} className="rounded border px-1.5 py-0.5 hover:bg-muted">−</button>
        <input type="range" min={4} max={200} value={pxs} onChange={(e) => setPxs(Number(e.target.value))} className="w-28" />
        <button onClick={() => setPxs((p) => Math.min(200, Math.round(p * 1.4)))} className="rounded border px-1.5 py-0.5 hover:bg-muted">+</button>
        <button onClick={ajustarZoom} className="rounded border px-2 py-0.5 hover:bg-muted">Ajustar à tela</button>
      </div>
      <div ref={scrollRef} className="overflow-x-auto rounded-lg border bg-muted/30">
        <div style={{ width }} className="relative">
          {/* Régua */}
          <div
            className="relative h-6 border-b cursor-pointer text-[10px] text-muted-foreground"
            onPointerDown={(e) => startScrub(e.clientX)}
          >
            {ticks.map((s) => (
              <div key={s} className="absolute top-0 h-full border-l border-border/60 pl-1" style={{ left: s * pxs }}>
                {fmt(s)}
              </div>
            ))}
          </div>

          {/* Faixa de vídeo */}
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            Vídeo (cortes)
            {videoSegments && onSplit && (
              <button onClick={onSplit} className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-white hover:bg-neutral-600">✂ dividir no playhead</button>
            )}
          </div>
          {videoSegments && videoSegments.length > 0 ? (
            <div className="relative mb-2 h-10" style={{ width }}>
              {vsegPos.map(({ seg, outStart, len }) => (
                <div key={seg.id}
                  className="group absolute top-0 h-10 rounded bg-neutral-700/80 ring-1 ring-neutral-600 overflow-hidden"
                  style={{ left: outStart * pxs, width: Math.max(24, len * pxs) }}
                  title={`corte ${seg.sourceStart.toFixed(1)}s–${seg.sourceEnd.toFixed(1)}s do original`}>
                  <div className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-blue-500/60" onPointerDown={(e) => startTrim(e, seg, "l")} />
                  <div className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-blue-500/60" onPointerDown={(e) => startTrim(e, seg, "r")} />
                  <span className="px-3 text-[10px] leading-10 text-white/80">🎬 {len.toFixed(1)}s</span>
                  {onDeleteSeg && (
                    <button onClick={() => onDeleteSeg(seg.id)} title="Apagar corte"
                      className="absolute right-2.5 top-1 hidden rounded bg-black/50 px-1 text-[10px] text-white group-hover:block">✕</button>
                  )}
                </div>
              ))}
              <div className="absolute top-0 h-full w-0.5 bg-red-500 pointer-events-none" style={{ left: currentTime * pxs }} />
            </div>
          ) : (
            <div className="mx-0 mb-2 h-10 rounded bg-neutral-700/60 flex items-center px-2 text-xs text-white/80" style={{ width }}>
              🎬 talking-head
            </div>
          )}

          {/* Faixa de overlays (clips arrastáveis) + área clicável para scrub */}
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Imagens / B-rolls</div>
          <div
            ref={trackRef}
            className="relative h-14 bg-background/40"
            style={{ width }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelect(null); startScrub(e.clientX); } }}
          >
            {clips.map((c) => {
              const left = c.start * pxs;
              const w = Math.max(8, (c.end - c.start) * pxs);
              const sel = c.id === selectedId;
              return (
                <div
                  key={c.id}
                  className={`absolute top-1 h-12 rounded ${LAYOUT_COR[c.layout] || "bg-violet-600"} ${sel ? "ring-2 ring-white" : ""} cursor-grab active:cursor-grabbing overflow-hidden`}
                  style={{ left, width: w }}
                  onPointerDown={(e) => startDrag(e, c, "move")}
                >
                  {/* handle esquerda */}
                  <div className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-black/30" onPointerDown={(e) => startDrag(e, c, "l")} />
                  {/* handle direita */}
                  <div className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-black/30" onPointerDown={(e) => startDrag(e, c, "r")} />
                  <div className="px-3 py-1 text-[11px] font-medium text-white truncate">
                    {LAYOUT_LABEL[c.layout] || c.layout} · {c.asset}
                  </div>
                  <div className="px-3 text-[10px] text-white/80">{fmt(c.start)}–{fmt(c.end)}</div>
                </div>
              );
            })}
            {/* Playhead */}
            <div className="absolute top-0 h-full w-0.5 bg-red-500 pointer-events-none" style={{ left: currentTime * pxs }} />
          </div>

          {/* Faixa de legendas (blocos por página) */}
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Legendas</div>
          <div className="relative h-8" style={{ width }}>
            {legendas.map((p, i) => {
              const left = p.start * pxs;
              const w = Math.max(40, (p.end - p.start) * pxs);
              const ativa = currentTime >= p.start && currentTime < p.end;
              const editando = editPage === i;
              return (
                <div key={i}
                  className={`absolute top-1 h-6 rounded bg-fuchsia-700/70 ${ativa ? "ring-1 ring-white" : ""} ${editando ? "ring-2 ring-yellow-400" : ""} overflow-hidden`}
                  style={{ left, width: editando ? Math.max(w, 180) : w, zIndex: editando ? 20 : 1 }}
                  title={editando ? "" : `${p.texto}  (duplo-clique para editar)`}
                  onClick={() => !editando && onSeek(p.start)}
                  onDoubleClick={(e) => { e.stopPropagation(); setEditPage(i); setEditText(p.texto); onSeek(p.start); }}
                >
                  {editando ? (
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitEdit(); } if (e.key === "Escape") setEditPage(null); }}
                      className="h-full w-full bg-fuchsia-950 px-1.5 text-[11px] text-white outline-none"
                    />
                  ) : (
                    <span className="px-1.5 text-[10px] text-white truncate inline-block max-w-full leading-6">{p.texto}</span>
                  )}
                </div>
              );
            })}
            <div className="absolute top-0 h-full w-0.5 bg-red-500 pointer-events-none" style={{ left: currentTime * pxs }} />
          </div>

          {/* Faixa de texto (camadas arrastáveis) */}
          {texts && texts.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Texto</div>
              <div className="relative h-8" style={{ width }}>
                {texts.map((t) => {
                  const left = t.start * pxs;
                  const w = Math.max(40, (t.end - t.start) * pxs);
                  const sel = t.id === selectedTextId;
                  const editando = editTxtId === t.id;
                  return (
                    <div key={t.id}
                      className={`absolute top-1 h-6 rounded bg-sky-700/80 cursor-grab active:cursor-grabbing ${sel ? "ring-2 ring-white" : ""} ${editando ? "ring-2 ring-yellow-400" : ""} overflow-hidden`}
                      style={{ left, width: editando ? Math.max(w, 180) : w, zIndex: editando ? 20 : 1 }}
                      title={editando ? "" : `${t.text}  (duplo-clique para editar)`}
                      onPointerDown={(e) => !editando && startDragText(e, t, "move")}
                      onDoubleClick={(e) => { e.stopPropagation(); setEditTxtId(t.id); setEditTxtVal(t.text); onSelectText?.(t.id); }}
                    >
                      <div className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-black/30" onPointerDown={(e) => startDragText(e, t, "l")} />
                      <div className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-black/30" onPointerDown={(e) => startDragText(e, t, "r")} />
                      {editando ? (
                        <input autoFocus value={editTxtVal}
                          onChange={(e) => setEditTxtVal(e.target.value)}
                          onBlur={() => { onEditTextContent?.(t.id, editTxtVal); setEditTxtId(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEditTextContent?.(t.id, editTxtVal); setEditTxtId(null); } if (e.key === "Escape") setEditTxtId(null); }}
                          className="h-full w-full bg-sky-950 px-1.5 text-[11px] text-white outline-none" />
                      ) : (
                        <span className="px-2 text-[10px] text-white truncate inline-block max-w-full leading-6">T · {t.text}</span>
                      )}
                    </div>
                  );
                })}
                <div className="absolute top-0 h-full w-0.5 bg-red-500 pointer-events-none" style={{ left: currentTime * pxs }} />
              </div>
            </>
          )}

          {/* Faixa de música (arraste o bloco para mudar o início) */}
          {music && (
            <>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Música</div>
              <div className="relative h-8" style={{ width }}>
                <div
                  className="absolute top-1 h-6 rounded bg-emerald-700/70 cursor-grab active:cursor-grabbing overflow-hidden"
                  style={{ left: (music.start || 0) * pxs, width: Math.max(60, (duration - (music.start || 0)) * pxs) }}
                  title="Arraste para mudar o início da música"
                  onPointerDown={(e) => {
                    if (!onMusicStart) return;
                    e.preventDefault();
                    const startX = e.clientX; const s0 = music.start || 0;
                    const mv = (ev: PointerEvent) => onMusicStart(Math.max(0, Math.min(duration - 0.5, s0 + (ev.clientX - startX) / pxs)));
                    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
                    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
                  }}
                >
                  <span className="px-1.5 text-[10px] text-white leading-6">🎵 {music.asset.split("/").pop()}</span>
                </div>
                <div className="absolute top-0 h-full w-0.5 bg-red-500 pointer-events-none" style={{ left: currentTime * pxs }} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}
