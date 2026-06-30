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

// Caixa de posição/tamanho de uma camada livre (frações 0–1 do frame 1080×1920).
export const boxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type Box = z.infer<typeof boxSchema>;

export const segmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  layout: layoutSchema,
  asset: z.string().nullable().default(null),
  asset2: z.string().nullable().optional().default(null),
  cropY: z.number().optional(),   // posição vertical do asset (0=topo, 100=base; default 50)
  crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(), // recorte livre (frações 0–1)
  splitRatio: z.number().optional(), // fração do vídeo principal no split (default 0.6)
  assetStart: z.number().optional(), // offset (s) dentro do asset de vídeo (p/ dividir b-roll sem reiniciar)
  box: boxSchema.optional(),      // janela VISÍVEL (clip) da camada livre — quando presente, ignora layout
  media: boxSchema.optional(),    // retângulo da MÍDIA por baixo (recorte seco: encolhe box, mídia fica parada)
  rotation: z.number().optional(),// rotação em graus
  zIndex: z.number().optional(),  // ordem de empilhamento entre camadas livres
  speed: z.number().optional().default(1),      // velocidade do VÍDEO PRINCIPAL (Head) neste trecho
  assetSpeed: z.number().optional().default(1), // velocidade do ASSET/b-roll deste segmento
});

// Camada livre (mídia flutuante) na timeline de saída — empilhável por zIndex.
export const freeLayerSchema = z.object({
  id: z.string(),
  asset: z.string(),
  kind: z.enum(["image", "video"]),
  start: z.number(),
  end: z.number(),
  box: boxSchema,
  media: boxSchema.optional(),
  rotation: z.number().optional(),
  zIndex: z.number().optional(),
  crop: boxSchema.optional(),
  cropY: z.number().optional(),
  assetStart: z.number().optional(),
  speed: z.number().optional().default(1), // velocidade de reprodução (playbackRate)
});
export type FreeLayer = z.infer<typeof freeLayerSchema>;

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
  speed: z.number().optional().default(1), // velocidade de reprodução (playbackRate)
});
export type Music = z.infer<typeof musicSchema>;

// Camada de texto livre (arrastável no preview).
export const textLayerSchema = z.object({
  id: z.string(),
  text: z.string(),
  start: z.number(),                 // s na timeline de saída
  end: z.number(),
  x: z.number().default(0.5),        // posição do CENTRO (fração 0–1 da largura)
  y: z.number().default(0.5),        // posição do CENTRO (fração 0–1 da altura)
  fontSize: z.number().default(80),  // px na composição (1080×1920)
  color: z.string().default("#FFFFFF"),
  bgColor: z.string().default("transparent"),
  bold: z.boolean().default(true),
  align: z.enum(["left", "center", "right"]).default("center"),
  w: z.number().optional(),          // largura opcional da caixa (fração 0–1); sem isto usa maxWidth 90%
  zIndex: z.number().optional(),     // ordem de empilhamento (unificada com camadas de mídia)
});
export type TextLayer = z.infer<typeof textLayerSchema>;

export const musicClipSchema = z.object({
  id: z.string(),
  asset: z.string(),
  start: z.number(),
  end: z.number(),
  sourceStart: z.number().optional().default(0),
  volume: z.number().optional().default(0.5),
  speed: z.number().optional().default(1), // velocidade de reprodução (playbackRate)
});

// Transform do vídeo principal (talking-head) como camada: caixa/recorte/rotação. Fundo preto atrás.
export const headTransformSchema = z.object({
  box: boxSchema.optional(),
  media: boxSchema.optional(),
  crop: boxSchema.optional(),
  cropY: z.number().optional(),
  rotation: z.number().optional(),
});
export type HeadTransform = z.infer<typeof headTransformSchema>;

export const timelineSchema = z.object({
  video: z.string(),
  fps: z.number().default(30),
  durationInSeconds: z.number().optional(),
  head: headTransformSchema.optional(),
  segments: z.array(segmentSchema),
  stickers: z.array(stickerSchema).default([]),
  freeLayers: z.array(freeLayerSchema).default([]),
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
  musicClips: z.array(musicClipSchema).optional(),
  texts: z.array(textLayerSchema).optional(),  // camadas de texto livre
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
  cropY?: number;    // posição vertical do asset (0=topo, 100=base; default 50)
  crop?: { x: number; y: number; w: number; h: number }; // recorte livre (frações 0–1 do asset)
  splitRatio?: number; // fração do vídeo principal no split (default 0.6)
  assetStart?: number; // offset (s) dentro do asset de vídeo (dividir b-roll sem reiniciar)
  box?: { x: number; y: number; w: number; h: number }; // janela VISÍVEL (clip); quando presente, vira camada flutuante (ignora layout)
  media?: { x: number; y: number; w: number; h: number }; // retângulo da MÍDIA por baixo (recorte seco)
  rotation?: number;   // rotação em graus
  zIndex?: number;     // ordem de empilhamento entre camadas livres
  speed?: number;      // velocidade de reprodução (playbackRate): 1=normal, >1=mais rápido
};

// Uma camada é "livre" (flutuante, sobreponível, com z-index) quando tem box.
export const isFree = (c: { box?: unknown }): boolean => !!c.box;

// Faixa de música como LISTA (permite cortar/dividir em pedaços).
export type MusicClip = {
  id: string;
  asset: string;       // caminho relativo
  start: number;       // início na timeline (s)
  end: number;         // fim na timeline (s)
  sourceStart?: number;// offset dentro do áudio (s)
  volume?: number;     // 0–1
  speed?: number;      // velocidade de reprodução (playbackRate)
};

// Corte editável (Fase 3): trecho mantido do vídeo ORIGINAL.
export type VideoSegment = {
  id: string;
  sourceStart: number;  // s no vídeo original
  sourceEnd: number;
  speed?: number;       // velocidade de reprodução do trecho (playbackRate); 1=normal
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
  head?: HeadTransform;            // transform do vídeo principal (talking-head) como camada
  captionStyle?: CaptionStyle;     // estilo editável da legenda
  videoVolume?: number;            // volume do áudio original (0–1)
  music?: Music | null;            // faixa de música (legado — 1 peça)
  musicClips?: MusicClip[];        // faixa de música em pedaços (cortável)
  texts?: TextLayer[];             // camadas de texto livre (arrastáveis)
  // Fase 3 (cortes como clipes). Quando presente, a timeline é montada a partir destes.
  videoSegments?: VideoSegment[];  // trechos mantidos do ORIGINAL, em ordem
  originalDuration?: number;       // duração do vídeo original (s) — limite do "aparar pra mais"
  avisos?: { tipo: string; texto: string }[];  // avisos da geração (ex.: b-rolls não baixados)
};

const FREE_VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i;

// Constrói as camadas livres (clips com box) — empilháveis por zIndex. start/end já são tempo de saída.
function buildFreeLayers(doc: EditorDoc): FreeLayer[] {
  return (doc.clips || [])
    .filter((c) => isFree(c) && c.end > c.start && doc.assets[c.asset])
    .map((c) => ({
      id: c.id, asset: c.asset,
      kind: FREE_VIDEO_EXT.test(doc.assets[c.asset] || "") ? "video" as const : "image" as const,
      start: c.start, end: c.end,
      box: c.box!, media: c.media, rotation: c.rotation, zIndex: c.zIndex,
      crop: c.crop, cropY: c.cropY, assetStart: c.assetStart, speed: c.speed ?? 1,
    }));
}

// Deriva a timeline (segmentos contíguos) a partir dos clips de overlay.
// Onde um clip está ativo usa seu layout/asset; nos vãos usa talking_full.
// Clips com box (camadas livres) saem do fluxo de Series e viram freeLayers.
export function clipsParaTimeline(doc: EditorDoc): Timeline {
  const dur = doc.durationInSeconds;
  const ordenados = [...doc.clips].filter((c) => c.end > c.start && !isFree(c)).sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const c of ordenados) {
    const start = Math.max(cursor, c.start);
    const end = Math.min(dur, c.end);
    if (end <= start) continue;
    if (start > cursor) segments.push({ start: cursor, end: start, layout: "talking_full", asset: null });
    segments.push({ start, end, layout: c.layout, asset: c.asset, cropY: c.cropY, crop: c.crop, splitRatio: c.splitRatio, assetStart: c.assetStart, speed: 1, assetSpeed: c.speed ?? 1 });
    cursor = end;
  }
  if (cursor < dur) segments.push({ start: cursor, end: dur, layout: "talking_full", asset: null });
  if (!segments.length) segments.push({ start: 0, end: dur, layout: "talking_full", asset: null });
  return { video: doc.video, fps: doc.fps, durationInSeconds: dur, head: doc.head, segments, stickers: [], freeLayers: buildFreeLayers(doc) };
}

// Fase 3: monta a timeline de SAÍDA a partir do vídeo ORIGINAL + videoSegments (cortes) + overlays,
// e remapeia as palavras (do tempo original → tempo de saída). Fallback p/ v2 quando não há videoSegments.
export function montarTimeline(doc: EditorDoc): { timeline: Timeline; words: Word[] } {
  if (!doc.videoSegments || doc.videoSegments.length === 0) {
    return { timeline: clipsParaTimeline(doc), words: doc.words || [] };
  }
  const fps = doc.fps || 30;
  const overlays = [...(doc.clips || [])].filter((c) => c.end > c.start && !isFree(c)).sort((a, b) => a.start - b.start);
  const overlayEm = (t: number) => overlays.find((o) => o.start <= t && t < o.end) || null;

  // 1) mapeia cada videoSegment para uma janela de SAÍDA (outStart..outEnd) e tempo-fonte.
  const vsegs = doc.videoSegments.filter((v) => v.sourceEnd > v.sourceStart);
  let out = 0;
  const mapped = vsegs.map((v) => {
    const s = v.speed && v.speed > 0 ? v.speed : 1; // velocidade do vídeo principal neste trecho
    const outLen = (v.sourceEnd - v.sourceStart) / s; // encurtamento CapCut: saída = fonte/velocidade
    const m = { outStart: out, outEnd: out + outLen, sourceStart: v.sourceStart, speed: s };
    out += outLen;
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
      const aSpd = ov?.speed && ov.speed > 0 ? ov.speed : 1;
      const srcStart = m.sourceStart + (a - m.outStart) * m.speed; // tempo-fonte avança na velocidade do trecho
      segments.push({ start: srcStart, end: srcStart + (b - a), layout: ov ? ov.layout : "talking_full", asset: ov ? ov.asset : null, cropY: ov?.cropY, crop: ov?.crop, splitRatio: ov?.splitRatio, assetStart: ov ? (ov.assetStart ?? 0) + (a - ov.start) * aSpd : undefined, speed: m.speed, assetSpeed: aSpd });
    }
  }
  if (!segments.length) segments.push({ start: 0, end: Math.max(0.1, durationInSeconds), layout: "talking_full", asset: null });

  // 3) remapeia palavras (tempo original → saída).
  const words: Word[] = [];
  for (const w of doc.words || []) {
    for (const m of mapped) {
      const vEnd = m.sourceStart + (m.outEnd - m.outStart) * m.speed; // fim do trecho em tempo-fonte
      if (w.start >= m.sourceStart && w.start < vEnd) {
        // tempo de saída = início do trecho + (delta-fonte / velocidade)
        const os = m.outStart + (w.start - m.sourceStart) / m.speed;
        const oe = m.outStart + (Math.min(w.end, vEnd) - m.sourceStart) / m.speed;
        words.push({ word: w.word, start: round3(os), end: round3(Math.max(os + 0.05, oe)) });
        break;
      }
    }
  }
  return { timeline: { video: doc.video, fps, durationInSeconds, head: doc.head, segments, stickers: [], freeLayers: buildFreeLayers(doc) }, words };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
