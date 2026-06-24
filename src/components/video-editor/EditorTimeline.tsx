import { useRef } from "react";
import type { Clip } from "@/video-editor/remotion/schema";

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
  clips, duration, currentTime, selectedId, pxs = 90,
  onSeek, onSelect, onUpdateClip,
}: {
  clips: Clip[];
  duration: number;
  currentTime: number;
  selectedId: string | null;
  pxs?: number;
  onSeek: (t: number) => void;
  onSelect: (id: string | null) => void;
  onUpdateClip: (id: string, patch: Partial<Clip>) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const width = Math.max(1, duration) * pxs;

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
