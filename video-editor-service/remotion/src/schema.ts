import { z } from "zod";

// Os 7 layouts suportados pelo renderizador.
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
  // asset secundário (ex.: split_vertical com 2 mídias). Opcional.
  asset2: z.string().nullable().optional().default(null),
});

export const stickerSchema = z.object({
  asset: z.string(),
  start: z.number(),
  end: z.number(),
  corner: z.enum(["top", "top-left", "top-right", "bottom-left", "bottom-right"]).default("top"),
});

// Uma palavra com timestamps (do transcript.json) — alimenta a legenda animada.
export const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

// Catálogo de assets: id -> caminho do arquivo (relativo à pasta de assets).
export const assetsMapSchema = z.record(z.string(), z.string());

export const timelineSchema = z.object({
  video: z.string(), // caminho do talking-head (cortado)
  fps: z.number().default(30),
  durationInSeconds: z.number().optional(),
  segments: z.array(segmentSchema),
  stickers: z.array(stickerSchema).default([]),
});

// Props da Composition principal (timeline + dados de runtime injetados pelo serviço).
export const mainPropsSchema = z.object({
  timeline: timelineSchema,
  words: z.array(wordSchema).default([]),
  assets: assetsMapSchema.default({}),
  // base file:// ou http(s):// onde estão o vídeo e os assets (resolvido pelo serviço via staticFile/URL)
  mediaBase: z.string().default(""),
});

export type Layout = z.infer<typeof layoutSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type Sticker = z.infer<typeof stickerSchema>;
export type Word = z.infer<typeof wordSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export type MainProps = z.infer<typeof mainPropsSchema>;
