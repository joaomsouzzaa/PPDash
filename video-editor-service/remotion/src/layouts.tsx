import React from "react";
import { AbsoluteFill, OffthreadVideo, Video, Img, staticFile } from "remotion";
import type { Layout } from "./schema";

// Resolve a URL de uma mídia (vídeo/asset).
function url(mediaBase: string, p: string): string {
  if (/^(https?:|file:|data:|blob:)/.test(p)) return p;
  if (mediaBase) return `${mediaBase.replace(/\/$/, "")}/${p.replace(/^\//, "")}`;
  return staticFile(p);
}

type Ctx = {
  videoSrc: string;
  videoStartFrame: number;
  assetSrc: string | null;
  asset2Src: string | null;
  isVideoAsset: (s: string | null) => boolean;
  preview?: boolean;  // preview (Player) usa <Video> (fluido); render usa OffthreadVideo
  videoVolume?: number; // volume do áudio original (0–1)
  cropY?: number;       // posição vertical do asset (0=topo, 100=base)
};

const cover: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
// cover do asset com a posição vertical escolhida (crop manual).
const assetCover = (cropY?: number): React.CSSProperties => ({ ...cover, objectPosition: `50% ${cropY ?? 50}%` });

// Vídeo do talking-head: <Video> no preview (toca liso no navegador), OffthreadVideo no render.
const Head: React.FC<{ src: string; from: number; preview?: boolean; volume?: number; style?: React.CSSProperties }> = ({ src, from, preview, volume = 1, style }) => (
  preview
    ? <Video src={src} trimBefore={from} volume={volume} style={style ?? cover} />
    : <OffthreadVideo src={src} trimBefore={from} volume={volume} style={style ?? cover} />
);

// Vídeo de asset (b-roll), mesmo critério; aplica a posição vertical (crop).
const AssetVid: React.FC<{ src: string; preview?: boolean; cropY?: number }> = ({ src, preview, cropY }) => (
  preview ? <Video src={src} style={assetCover(cropY)} muted /> : <OffthreadVideo src={src} style={assetCover(cropY)} muted />
);

const TalkingFull: React.FC<Ctx> = ({ videoSrc, videoStartFrame, preview, videoVolume, cropY }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />
  </AbsoluteFill>
);

const SplitHorizontal: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset, preview, videoVolume, cropY }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "50%", overflow: "hidden" }}>
      {assetSrc && (isVideoAsset(assetSrc)
        ? <AssetVid src={assetSrc} preview={preview} cropY={cropY} />
        : <Img src={assetSrc} style={assetCover(cropY)} />)}
    </div>
    <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "50%", overflow: "hidden" }}>
      <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />
    </div>
  </AbsoluteFill>
);

// B-roll/imagem EMBAIXO, pessoa em cima.
const SplitBottom: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset, preview, videoVolume, cropY }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "50%", overflow: "hidden" }}>
      <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />
    </div>
    <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "50%", overflow: "hidden" }}>
      {assetSrc && (isVideoAsset(assetSrc)
        ? <AssetVid src={assetSrc} preview={preview} cropY={cropY} />
        : <Img src={assetSrc} style={assetCover(cropY)} />)}
    </div>
  </AbsoluteFill>
);

const SplitVertical: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset, preview, videoVolume, cropY }) => (
  <AbsoluteFill style={{ backgroundColor: "#000", flexDirection: "row" }}>
    <div style={{ width: "50%", height: "100%", overflow: "hidden" }}>
      <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />
    </div>
    <div style={{ width: "50%", height: "100%", overflow: "hidden" }}>
      {assetSrc && (isVideoAsset(assetSrc)
        ? <AssetVid src={assetSrc} preview={preview} cropY={cropY} />
        : <Img src={assetSrc} style={assetCover(cropY)} />)}
    </div>
  </AbsoluteFill>
);

const OverlayCard: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, preview, videoVolume, cropY }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} style={{ ...cover, filter: "blur(24px) brightness(0.5)" }} />
    {assetSrc && (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80 }}>
        <Img
          src={assetSrc}
          style={{
            maxWidth: "100%", maxHeight: "70%", objectFit: "contain",
            borderRadius: 24, boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          }}
        />
      </AbsoluteFill>
    )}
  </AbsoluteFill>
);

const ImageFullscreen: React.FC<Ctx> = ({ assetSrc, videoSrc, videoStartFrame, preview, videoVolume, cropY }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    {assetSrc
      ? <Img src={assetSrc} style={assetCover(cropY)} />
      : <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />}
  </AbsoluteFill>
);

const BrollFullscreen: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset, preview, videoVolume, cropY }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} style={{ display: "none" }} />
    {assetSrc && isVideoAsset(assetSrc)
      ? <AssetVid src={assetSrc} preview={preview} />
      : assetSrc
        ? <Img src={assetSrc} style={assetCover(cropY)} />
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
