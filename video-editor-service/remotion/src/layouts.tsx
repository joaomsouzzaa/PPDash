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
  assetStartFrame?: number; // offset (frames) dentro do asset de vídeo (dividir b-roll)
  headBox?: Crop;       // janela visível do vídeo principal (talking-head) — fundo preto atrás
  headMedia?: Crop;     // retângulo da mídia por baixo (recorte seco)
  headCrop?: Crop;      // (legado) recorte do vídeo principal
  headCropY?: number;   // posição vertical do vídeo principal
  headRotation?: number;// rotação do vídeo principal
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
export const Asset: React.FC<{ src: string | null; isVideo: boolean; preview?: boolean; cropY?: number; crop?: Crop; fromFrame?: number }> = ({ src, isVideo, preview, cropY, crop, fromFrame }) => {
  if (!src) return null;
  const from = fromFrame && fromFrame > 0 ? fromFrame : undefined;
  // loop: se o b-roll for mais curto que o trecho na timeline, repete em vez de congelar/ficar preto.
  // Vale no preview E no render (assim o que você vê é o que sai no vídeo final).
  const vid = (style: React.CSSProperties) =>
    preview ? <Video src={src} muted loop trimBefore={from} style={style} /> : <OffthreadVideo src={src} muted loop trimBefore={from} style={style} />;
  const livre = crop && (crop.w < 0.999 || crop.h < 0.999 || crop.x > 0.001 || crop.y > 0.001);
  if (livre && crop) {
    const inner: React.CSSProperties = {
      position: "absolute",
      width: `${100 / crop.w}%`, height: `${100 / crop.h}%`,
      left: `${(-crop.x * 100) / crop.w}%`, top: `${(-crop.y * 100) / crop.h}%`,
      objectFit: "cover",
    };
    const media = isVideo ? vid(inner) : <Img src={src} style={inner} />;
    return <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>{media}</div>;
  }
  const st = assetCover(cropY);
  return isVideo ? vid(st) : <Img src={src} style={st} />;
};

const TalkingFull: React.FC<Ctx> = ({ videoSrc, videoStartFrame, preview, videoVolume, headBox, headMedia, headCropY, headRotation }) => {
  const cheio = !headBox || (headBox.x === 0 && headBox.y === 0 && headBox.w === 1 && headBox.h === 1);
  if (cheio && !headMedia && !headCropY && !headRotation) {
    return <AbsoluteFill style={{ backgroundColor: "#000" }}><Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} /></AbsoluteFill>;
  }
  const b = headBox ?? { x: 0, y: 0, w: 1, h: 1 };
  const m = headMedia ?? b;  // recorte seco: box encolhe, mídia fica parada
  const inner: React.CSSProperties = {
    position: "absolute",
    left: `${((m.x - b.x) / b.w) * 100}%`, top: `${((m.y - b.y) / b.h) * 100}%`,
    width: `${(m.w / b.w) * 100}%`, height: `${(m.h / b.h) * 100}%`,
    objectFit: "cover", objectPosition: `50% ${headCropY ?? 50}%`,
  };
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <div style={{ position: "absolute", left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, transform: headRotation ? `rotate(${headRotation}deg)` : undefined, overflow: "hidden" }}>
        <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} style={inner} />
      </div>
    </AbsoluteFill>
  );
};

// Split: vídeo principal ocupa `ratio` (default 60%); b-roll a outra parte. Direção via assetTop.
const Split: React.FC<Ctx & { assetTop: boolean }> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset, preview, videoVolume, cropY, crop, splitRatio, assetStartFrame, assetTop }) => {
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
      <Asset src={assetSrc} isVideo={isVideoAsset(assetSrc)} preview={preview} cropY={cropY} crop={crop} fromFrame={assetStartFrame} />
    </div>
  );
  return <AbsoluteFill style={{ backgroundColor: "#000" }}>{headDiv}{assDiv}</AbsoluteFill>;
};

const SplitHorizontal: React.FC<Ctx> = (p) => <Split {...p} assetTop={true} />;   // b-roll em cima
const SplitBottom: React.FC<Ctx> = (p) => <Split {...p} assetTop={false} />;      // b-roll embaixo

const SplitVertical: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset, preview, videoVolume, cropY, crop, splitRatio, assetStartFrame }) => {
  const vid = Math.min(0.9, Math.max(0.1, splitRatio ?? 0.6));
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", flexDirection: "row" }}>
      <div style={{ width: `${vid * 100}%`, height: "100%", overflow: "hidden" }}>
        <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />
      </div>
      <div style={{ position: "relative", width: `${(1 - vid) * 100}%`, height: "100%", overflow: "hidden" }}>
        <Asset src={assetSrc} isVideo={isVideoAsset(assetSrc)} preview={preview} cropY={cropY} crop={crop} fromFrame={assetStartFrame} />
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

const ImageFullscreen: React.FC<Ctx> = ({ assetSrc, videoSrc, videoStartFrame, isVideoAsset, preview, videoVolume, cropY, crop, assetStartFrame }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    {assetSrc
      ? <Asset src={assetSrc} isVideo={isVideoAsset(assetSrc)} preview={preview} cropY={cropY} crop={crop} fromFrame={assetStartFrame} />
      : <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} />}
  </AbsoluteFill>
);

const BrollFullscreen: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset, preview, videoVolume, cropY, crop, assetStartFrame }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Head src={videoSrc} from={videoStartFrame} preview={preview} volume={videoVolume} style={{ display: "none" }} />
    {assetSrc
      ? <Asset src={assetSrc} isVideo={isVideoAsset(assetSrc)} preview={preview} cropY={cropY} crop={crop} fromFrame={assetStartFrame} />
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
