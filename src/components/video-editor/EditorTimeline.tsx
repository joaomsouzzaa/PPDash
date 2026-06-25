import { useRef, useMemo, useState } from "react";
import type { Clip, Word } from "@/video-editor/remotion/schema";

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
  clips, duration, currentTime, selectedId, words = [], palavrasPorPagina = 3, pxs = 90,
  onSeek, onSelect, onUpdateClip, onEditCaption,
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
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const width = Math.max(1, duration) * pxs;
  const [editPage, setEditPage] = useState<number | null>(null);  // índice da página em edição
  const [editText, setEditText] = useState("");

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
      <div className="overflow-x-auto rounded-lg border bg-muted/30">
        <div style={{ width }} className="relative">
          {/* Régua */}
          <div
            className="relative h-6 border-b cursor-pointer text-[10px] text-muted-foreground"
            onPointerDown={(e) => seekFromEvent(e.clientX)}
          >
            {ticks.map((s) => (
              <div key={s} className="absolute top-0 h-full border-l border-border/60 pl-1" style={{ left: s * pxs }}>
                {fmt(s)}
              </div>
            ))}
          </div>

          {/* Faixa de vídeo (somente leitura) */}
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Vídeo</div>
          <div className="mx-0 mb-2 h-10 rounded bg-neutral-700/60 flex items-center px-2 text-xs text-white/80" style={{ width }}>
            🎬 talking-head
          </div>

          {/* Faixa de overlays (clips arrastáveis) + área clicável para scrub */}
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Imagens / B-rolls</div>
          <div
            ref={trackRef}
            className="relative h-14 bg-background/40"
            style={{ width }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelect(null); seekFromEvent(e.clientX); } }}
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
