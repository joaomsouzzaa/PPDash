import { z } from "zod";

// Composição Remotion CANÔNICA do Vídeo Editor.
// Usada no preview (@remotion/player, no frontend) E no render (VPS, via sync-remotion.sh).

export const LAYOUTS = [
  "talking_full",
  "split_horizontal",
  "split_vertical",
  "overlay_card",
  "image_fullscreen",
  "broll_fullscreen",
  "sticker",
] as const;

export const layoutSchema = z.enum(LAYOUTS);

export const segmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  layout: layoutSchema,
  asset: z.string().nullable().default(null),
  asset2: z.string().nullable().optional().default(null),
});

export const stickerSchema = z.object({
  asset: z.string(),
  start: z.number(),
  end: z.number(),
  corner: z.enum(["top", "top-left", "top-right", "bottom-left", "bottom-right"]).default("top"),
});

export const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

export const assetsMapSchema = z.record(z.string(), z.string());

export const timelineSchema = z.object({
  video: z.string(),
  fps: z.number().default(30),
  durationInSeconds: z.number().optional(),
  segments: z.array(segmentSchema),
  stickers: z.array(stickerSchema).default([]),
});

export const mainPropsSchema = z.object({
  timeline: timelineSchema,
  words: z.array(wordSchema).default([]),
  assets: assetsMapSchema.default({}),
  mediaBase: z.string().default(""),
  preview: z.boolean().optional().default(false), // true no Player (usa <Video>); false no render
});

export type Layout = z.infer<typeof layoutSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type Sticker = z.infer<typeof stickerSchema>;
export type Word = z.infer<typeof wordSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export type MainProps = z.infer<typeof mainPropsSchema>;

// Layouts que o usuário pode escolher por clip de overlay (sem talking_full/sticker/split_vertical).
export const OVERLAY_LAYOUTS = [
  "overlay_card",
  "split_horizontal",
  "image_fullscreen",
  "broll_fullscreen",
] as const;
export type OverlayLayout = (typeof OVERLAY_LAYOUTS)[number];

// Clip de overlay editável na timeline (o que o usuário arrasta/estica).
export type Clip = {
  id: string;
  asset: string;     // id do asset
  layout: OverlayLayout;
  start: number;     // segundos
  end: number;       // segundos
};

// editor_doc salvo em video_jobs.timeline (autosave).
export type EditorDoc = {
  clips: Clip[];
  words: Word[];
  assets: Record<string, string>;  // id -> caminho relativo (assets/xxx)
  video: string;                   // nome do vídeo cortado (talking_head.mp4) — usado no render final
  videoPreview?: string;           // proxy leve para o preview no navegador (opcional)
  fps: number;
  durationInSeconds: number;
};

// Deriva a timeline (segmentos contíguos) a partir dos clips de overlay.
// Onde um clip está ativo usa seu layout/asset; nos vãos usa talking_full.
export function clipsParaTimeline(doc: EditorDoc): Timeline {
  const dur = doc.durationInSeconds;
  const ordenados = [...doc.clips].filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const c of ordenados) {
    const start = Math.max(cursor, c.start);
    const end = Math.min(dur, c.end);
    if (end <= start) continue;
    if (start > cursor) segments.push({ start: cursor, end: start, layout: "talking_full", asset: null });
    segments.push({ start, end, layout: c.layout, asset: c.asset });
    cursor = end;
  }
  if (cursor < dur) segments.push({ start: cursor, end: dur, layout: "talking_full", asset: null });
  if (!segments.length) segments.push({ start: 0, end: dur, layout: "talking_full", asset: null });
  return { video: doc.video, fps: doc.fps, durationInSeconds: dur, segments, stickers: [] };
}
