import React from "react";
import { AbsoluteFill, Sequence, Series, Img } from "remotion";
import { LAYOUT_COMPONENTS, url, type Ctx } from "./layouts";
import { Captions } from "./Captions";
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

export const Main: React.FC<MainProps> = ({ timeline, words, assets, mediaBase, preview }) => {
  const fps = timeline.fps || FPS_FALLBACK;
  const videoSrc = url(mediaBase, timeline.video);
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
          };
          return (
            <Series.Sequence key={i} durationInFrames={durFrames}>
              <Comp {...ctx} />
            </Series.Sequence>
          );
        })}
      </Series>

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

      {/* Legenda animada palavra-a-palavra sobre tudo */}
      <Captions words={words} />
    </AbsoluteFill>
  );
};
