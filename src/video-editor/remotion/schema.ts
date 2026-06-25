import { z } from "zod";

// Composição Remotion CANÔNICA do Vídeo Editor.
// Usada no preview (@remotion/player, no frontend) E no render (VPS, via sync-remotion.sh).

export const LAYOUTS = [
  "talking_full",
  "split_horizontal",   // asset/b-roll EM CIMA, pessoa embaixo
  "split_bottom",       // asset/b-roll EMBAIXO, pessoa em cima
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

// Estilo editável da legenda (CapCut).
export const captionStyleSchema = z.object({
  fontSize: z.number().default(86),
  color: z.string().default("#FFFFFF"),          // palavra inativa
  activeColor: z.string().default("#FFE600"),    // palavra ativa
  bgColor: z.string().default("transparent"),    // fundo atrás do texto
  borderColor: z.string().default("#000000"),    // contorno
  borderWidth: z.number().default(5),            // espessura do contorno (px)
  posicaoY: z.number().default(380),             // distância do rodapé (px)
  palavrasPorPagina: z.number().default(3),
  animar: z.boolean().default(true),             // "pop" da palavra ativa
});
export type CaptionStyle = z.infer<typeof captionStyleSchema>;
export const CAPTION_STYLE_DEFAULT: CaptionStyle = captionStyleSchema.parse({});

// Faixa de música (upload) com volume e ponto de início.
export const musicSchema = z.object({
  asset: z.string(),                 // caminho relativo (assets/xxx)
  volume: z.number().default(0.5),
  start: z.number().default(0),      // segundos
});
export type Music = z.infer<typeof musicSchema>;

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
  captionStyle: captionStyleSchema.optional(),
  videoVolume: z.number().optional().default(1),  // volume do áudio original (0–1)
  music: musicSchema.nullable().optional().default(null),
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
  "split_bottom",
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

// Corte editável (Fase 3): trecho mantido do vídeo ORIGINAL.
export type VideoSegment = {
  id: string;
  sourceStart: number;  // s no vídeo original
  sourceEnd: number;
};

// editor_doc salvo em video_jobs.timeline (autosave).
export type EditorDoc = {
  clips: Clip[];
  words: Word[];
  assets: Record<string, string>;  // id -> caminho relativo (assets/xxx)
  video: string;                   // v2: vídeo cortado; v3: vídeo ORIGINAL (usado no render)
  videoPreview?: string;           // proxy leve para o preview no navegador (opcional)
  fps: number;
  durationInSeconds: number;
  captionStyle?: CaptionStyle;     // estilo editável da legenda
  videoVolume?: number;            // volume do áudio original (0–1)
  music?: Music | null;            // faixa de música
  // Fase 3 (cortes como clipes). Quando presente, a timeline é montada a partir destes.
  videoSegments?: VideoSegment[];  // trechos mantidos do ORIGINAL, em ordem
  originalDuration?: number;       // duração do vídeo original (s) — limite do "aparar pra mais"
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

// Fase 3: monta a timeline de SAÍDA a partir do vídeo ORIGINAL + videoSegments (cortes) + overlays,
// e remapeia as palavras (do tempo original → tempo de saída). Fallback p/ v2 quando não há videoSegments.
export function montarTimeline(doc: EditorDoc): { timeline: Timeline; words: Word[] } {
  if (!doc.videoSegments || doc.videoSegments.length === 0) {
    return { timeline: clipsParaTimeline(doc), words: doc.words || [] };
  }
  const fps = doc.fps || 30;
  const overlays = [...(doc.clips || [])].filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
  const overlayEm = (t: number) => overlays.find((o) => o.start <= t && t < o.end) || null;

  // 1) mapeia cada videoSegment para uma janela de SAÍDA (outStart..outEnd) e tempo-fonte.
  const vsegs = doc.videoSegments.filter((v) => v.sourceEnd > v.sourceStart);
  let out = 0;
  const mapped = vsegs.map((v) => {
    const len = v.sourceEnd - v.sourceStart;
    const m = { outStart: out, outEnd: out + len, sourceStart: v.sourceStart };
    out += len;
    return m;
  });
  const durationInSeconds = out;

  // 2) render segments: subdivide cada janela nos limites dos overlays.
  const segments: Segment[] = [];
  for (const m of mapped) {
    const pts = new Set<number>([m.outStart, m.outEnd]);
    for (const o of overlays) {
      if (o.start > m.outStart && o.start < m.outEnd) pts.add(o.start);
      if (o.end > m.outStart && o.end < m.outEnd) pts.add(o.end);
    }
    const ord = [...pts].sort((a, b) => a - b);
    for (let i = 0; i < ord.length - 1; i++) {
      const a = ord[i], b = ord[i + 1];
      if (b - a < 0.02) continue;
      const ov = overlayEm((a + b) / 2);
      const srcStart = m.sourceStart + (a - m.outStart);
      segments.push({ start: srcStart, end: srcStart + (b - a), layout: ov ? ov.layout : "talking_full", asset: ov ? ov.asset : null });
    }
  }
  if (!segments.length) segments.push({ start: 0, end: Math.max(0.1, durationInSeconds), layout: "talking_full", asset: null });

  // 3) remapeia palavras (tempo original → saída).
  const words: Word[] = [];
  for (const w of doc.words || []) {
    for (const m of mapped) {
      const vEnd = m.sourceStart + (m.outEnd - m.outStart);
      if (w.start >= m.sourceStart && w.start < vEnd) {
        const os = m.outStart + (w.start - m.sourceStart);
        const oe = m.outStart + (Math.min(w.end, vEnd) - m.sourceStart);
        words.push({ word: w.word, start: round3(os), end: round3(Math.max(os + 0.05, oe)) });
        break;
      }
    }
  }
  return { timeline: { video: doc.video, fps, durationInSeconds, segments, stickers: [] }, words };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
