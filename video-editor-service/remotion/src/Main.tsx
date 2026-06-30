import React from "react";
import { AbsoluteFill, Sequence, Series, Img, Audio } from "remotion";
import { LAYOUT_COMPONENTS, url, Asset, type Ctx } from "./layouts";
import { Captions } from "./Captions";
import { TextLayers } from "./TextLayers";
import type { MainProps, Sticker } from "./schema";

const FPS_FALLBACK = 30;
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i;

const CORNER_STYLE: Record<string, React.CSSProperties> = {
  top: { top: 48, left: "50%", transform: "translateX(-50%)" },
  "top-left": { top: 48, left: 48 },
  "top-right": { top: 48, right: 48 },
  "bottom-left": { bottom: 420, left: 48 },
  "bottom-right": { bottom: 420, right: 48 },
};

export const Main: React.FC<MainProps> = ({ timeline, words, assets, mediaBase, preview, captionStyle, videoVolume, music, musicClips, texts }) => {
  const fps = timeline.fps || FPS_FALLBACK;
  const videoSrc = url(mediaBase, timeline.video);
  // Música: lista de pedaços (musicClips) tem prioridade; senão a música única (legado).
  const trilhas = (musicClips && musicClips.length)
    ? musicClips
    : (music?.asset ? [{ id: "m0", asset: music.asset, start: music.start || 0, end: (timeline.durationInSeconds || 0), sourceStart: 0, volume: music.volume ?? 0.5, speed: (music as any).speed ?? 1 }] : []);
  const assetUrl = (id: string | null | undefined): string | null =>
    id && assets[id] ? url(mediaBase, assets[id]) : null;
  const isVideoAsset = (s: string | null) => !!s && VIDEO_EXT.test(s);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Corte seco entre os trechos (sem transição) */}
      <Series>
        {timeline.segments.map((seg, i) => {
          const durFrames = Math.max(1, Math.round((seg.end - seg.start) * fps));
          const Comp = LAYOUT_COMPONENTS[seg.layout];
          const ctx: Ctx = {
            videoSrc,
            videoStartFrame: Math.round(seg.start * fps),
            assetSrc: assetUrl(seg.asset),
            asset2Src: assetUrl(seg.asset2 ?? null),
            isVideoAsset,
            preview,
            videoVolume: videoVolume ?? 1,
            cropY: seg.cropY,
            crop: seg.crop as any,
            splitRatio: seg.splitRatio,
            assetStartFrame: seg.assetStart ? Math.round(seg.assetStart * fps) : undefined,
            speed: seg.speed ?? 1,
            assetSpeed: seg.assetSpeed ?? 1,
            headBox: timeline.head?.box,
            headMedia: timeline.head?.media,
            headCrop: timeline.head?.crop,
            headCropY: timeline.head?.cropY,
            headRotation: timeline.head?.rotation,
          };
          return (
            <Series.Sequence key={i} durationInFrames={durFrames}>
              <Comp {...ctx} />
            </Series.Sequence>
          );
        })}
      </Series>

      {/* Camadas livres de mídia (flutuantes, empilháveis por zIndex) */}
      {[...(timeline.freeLayers || [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map((fl) => {
        const src = assetUrl(fl.asset);
        if (!src) return null;
        const from = Math.round(fl.start * fps);
        const dur = Math.max(1, Math.round((fl.end - fl.start) * fps));
        const b = fl.box; const m = fl.media ?? fl.box;  // box = janela visível; media = mídia por baixo (recorte seco)
        return (
          <Sequence key={`fl-${fl.id}`} from={from} durationInFrames={dur}>
            <AbsoluteFill style={{ pointerEvents: "none" }}>
              <div style={{
                position: "absolute",
                left: `${b.x * 100}%`, top: `${b.y * 100}%`,
                width: `${b.w * 100}%`, height: `${b.h * 100}%`,
                transform: fl.rotation ? `rotate(${fl.rotation}deg)` : undefined,
                overflow: "hidden", zIndex: fl.zIndex ?? 0,
              }}>
                <div style={{
                  position: "absolute",
                  left: `${((m.x - b.x) / b.w) * 100}%`, top: `${((m.y - b.y) / b.h) * 100}%`,
                  width: `${(m.w / b.w) * 100}%`, height: `${(m.h / b.h) * 100}%`,
                }}>
                  <Asset src={src} isVideo={fl.kind === "video"} preview={preview}
                    fromFrame={fl.assetStart ? Math.round(fl.assetStart * fps) : undefined} playbackRate={(fl as any).speed ?? 1} />
                </div>
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Stickers sobre qualquer layout */}
      {timeline.stickers.map((s: Sticker, i) => {
        const src = assetUrl(s.asset);
        if (!src) return null;
        const from = Math.round(s.start * fps);
        const dur = Math.max(1, Math.round((s.end - s.start) * fps));
        return (
          <Sequence key={`stk-${i}`} from={from} durationInFrames={dur}>
            <AbsoluteFill style={{ pointerEvents: "none" }}>
              <Img src={src} style={{ position: "absolute", width: 220, height: "auto", ...CORNER_STYLE[s.corner] }} />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Música em pedaços (cada um com início/fim/volume próprios) */}
      {trilhas.map((m) => {
        const from = Math.round((m.start || 0) * fps);
        const dur = Math.max(1, Math.round(((m.end || 0) - (m.start || 0)) * fps));
        return (
          <Sequence key={m.id} from={from} durationInFrames={dur}>
            <Audio src={url(mediaBase, m.asset)} volume={m.volume ?? 0.5} trimBefore={Math.round((m.sourceStart || 0) * fps)} playbackRate={(m as any).speed ?? 1} />
          </Sequence>
        );
      })}

      {/* Legenda animada palavra-a-palavra sobre tudo */}
      <Captions words={words} style={captionStyle} />

      {/* Camadas de texto livre (arrastáveis no editor) */}
      <TextLayers texts={texts} />
    </AbsoluteFill>
  );
};
