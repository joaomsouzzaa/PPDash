import React from "react";
import { AbsoluteFill, OffthreadVideo, Video, Img, staticFile } from "remotion";
import type { Layout } from "./schema";

// Resolve a URL de uma mídia (vídeo/asset).
function url(mediaBase: string, p: string): string {
  if (/^(https?:|file:|data:|blob:)/.test(p)) return p;
  if (mediaBase) return `${mediaBase.replace(/\/$/, "")}/${p.replace(/^\//, "")}`;
  return staticFile(p);
}

type Crop = { x: number; y: number; w: number; h: number };

type Ctx = {
  videoSrc: string;
  videoStartFrame: number;
  assetSrc: string | null;
  asset2Src: string | null;
  isVideoAsset: (s: string | null) => boolean;
  preview?: boolean;  // preview (Player) usa <Video> (fluido); render usa OffthreadVideo
  videoVolume?: number; // volume do áudio original (0–1)
  cropY?: number;       // posição vertical do asset (0=topo, 100=base)
  crop?: Crop;          // recorte livre do asset
  splitRatio?: number;  // fração do VÍDEO PRINCIPAL no split (default 0.6 = 60%)
};

const cover: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
const assetCover = (cropY?: number): React.CSSProperties => ({ ...cover, objectPosition: `50% ${cropY ?? 50}%` });

// Vídeo do talking-head: <Video> no preview (toca liso no navegador), OffthreadVideo no render.
const Head: React.FC<{ src: string; from: number; preview?: boolean; volume?: number; style?: React.CSSProperties }> = ({ src, from, preview, volume = 1, style }) => (
  preview
    ? <Video src={src} trimBefore={from} volume={volume} style={style ?? cover} />
    : <OffthreadVideo src={src} trimBefore={from} volume={volume} style={style ?? cover} />
);

// Asset (imagem ou vídeo) com recorte: livre (crop {x,y,w,h}) OU posição vertical (cropY).
const Asset: React.FC<{ src: string | null; isVideo: boolean; preview?: boolean; cropY?: number; crop?: Crop }> = ({ src, isVideo, preview, cropY, crop }) => {
  if (!src) return null;
  const livre = crop && (crop.w < 0.999 || crop.h < 0.999 || crop.x > 0.001 || crop.y > 0.001);
  if (livre && crop) {
    const inner: React.CSSProperties = {
      position: "absolute",
      width: `${100 / crop.w}%`, height: `${100 / crop.h}%`,
      left: `${(-crop.x * 100) / crop.w}%`, top: `${(-crop.y * 100) / crop.h}%`,
      objectFit: "cover",
    };
    const media = isVideo
      ? (preview ? <Video src={src} muted style={inner} /> : <OffthreadVideo src={src} muted style={inner} />)
      : <Img src={src} style={inner} />;
    return <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>{media}</div>;
  }
  const st = assetCover(cropY);
  return isVideo
    ? (preview ? <Video src={src} muted style={st} /> : <OffthreadVideo src={src} muted style={st} />)
    : <Img src={src} style={st} />;
};

const TalkingFull: React.FC<Ctx> = ({ videoSrc, videoStartFrame, preview, videoVolume }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />
  </AbsoluteFill>
);

// Split: vídeo principal ocupa `ratio` (default 60%); b-roll a outra parte. Direção via assetTop.
const Split: React.FC<Ctx & { assetTop: boolean }> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset, preview, videoVolume, cropY, crop, splitRatio, assetTop }) => {
  const vid = Math.min(0.9, Math.max(0.1, splitRatio ?? 0.6));   // vídeo principal
  const ass = 1 - vid;                                            // b-roll
  const headPct = `${vid * 100}%`, assPct = `${ass * 100}%`;
  const headDiv = (
    <div style={{ position: "absolute", left: 0, width: "100%", height: headPct, overflow: "hidden", [assetTop ? "bottom" : "top"]: 0 }}>
      <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />
    </div>
  );
  const assDiv = (
    <div style={{ position: "absolute", left: 0, width: "100%", height: assPct, overflow: "hidden", [assetTop ? "top" : "bottom"]: 0 }}>
      <Asset src={assetSrc} isVideo={isVideoAsset(assetSrc)} preview={preview} cropY={cropY} crop={crop} />
    </div>
  );
  return <AbsoluteFill style={{ backgroundColor: "#000" }}>{headDiv}{assDiv}</AbsoluteFill>;
};

const SplitHorizontal: React.FC<Ctx> = (p) => <Split {...p} assetTop={true} />;   // b-roll em cima
const SplitBottom: React.FC<Ctx> = (p) => <Split {...p} assetTop={false} />;      // b-roll embaixo

const SplitVertical: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset, preview, videoVolume, cropY, crop, splitRatio }) => {
  const vid = Math.min(0.9, Math.max(0.1, splitRatio ?? 0.6));
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", flexDirection: "row" }}>
      <div style={{ width: `${vid * 100}%`, height: "100%", overflow: "hidden" }}>
        <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />
      </div>
      <div style={{ position: "relative", width: `${(1 - vid) * 100}%`, height: "100%", overflow: "hidden" }}>
        <Asset src={assetSrc} isVideo={isVideoAsset(assetSrc)} preview={preview} cropY={cropY} crop={crop} />
      </div>
    </AbsoluteFill>
  );
};

const OverlayCard: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, preview, videoVolume }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} style={{ ...cover, filter: "blur(24px) brightness(0.5)" }} />
    {assetSrc && (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80 }}>
        <Img src={assetSrc} style={{ maxWidth: "100%", maxHeight: "70%", objectFit: "contain", borderRadius: 24, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }} />
      </AbsoluteFill>
    )}
  </AbsoluteFill>
);

const ImageFullscreen: React.FC<Ctx> = ({ assetSrc, videoSrc, videoStartFrame, isVideoAsset, preview, videoVolume, cropY, crop }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    {assetSrc
      ? <Asset src={assetSrc} isVideo={isVideoAsset(assetSrc)} preview={preview} cropY={cropY} crop={crop} />
      : <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />}
  </AbsoluteFill>
);

const BrollFullscreen: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset, preview, videoVolume, cropY, crop }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} style={{ display: "none" }} />
    {assetSrc
      ? <Asset src={assetSrc} isVideo={isVideoAsset(assetSrc)} preview={preview} cropY={cropY} crop={crop} />
      : <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />}
  </AbsoluteFill>
);

export const LAYOUT_COMPONENTS: Record<Layout, React.FC<Ctx>> = {
  talking_full: TalkingFull,
  split_horizontal: SplitHorizontal,
  split_bottom: SplitBottom,
  split_vertical: SplitVertical,
  overlay_card: OverlayCard,
  image_fullscreen: ImageFullscreen,
  broll_fullscreen: BrollFullscreen,
  sticker: TalkingFull,
};

export { url };
export type { Ctx };
