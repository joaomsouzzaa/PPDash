import React from "react";
import { AbsoluteFill, OffthreadVideo, Img, staticFile } from "remotion";
import type { Layout } from "../schema";

// Resolve a URL de uma mídia (vídeo/asset).
// - URL absoluta (http/file/data) → usa direto.
// - com mediaBase (produção: VPS serve o dir do job) → junta base + caminho.
// - sem mediaBase (exemplo offline) → staticFile() da pasta public/.
function url(mediaBase: string, p: string): string {
  if (/^(https?:|file:|data:)/.test(p)) return p;
  if (mediaBase) return `${mediaBase.replace(/\/$/, "")}/${p.replace(/^\//, "")}`;
  return staticFile(p);
}

type Ctx = {
  videoSrc: string;            // URL do talking-head (já resolvida)
  videoStartFrame: number;     // offset (frames) do talking-head para este trecho (vídeo contínuo)
  assetSrc: string | null;     // URL do asset principal
  asset2Src: string | null;    // URL do asset secundário
  isVideoAsset: (s: string | null) => boolean;
};

const cover: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

// Talking-head com o offset correto do vídeo (vídeo é contínuo entre os trechos).
const Head: React.FC<{ src: string; from: number; style?: React.CSSProperties }> = ({ src, from, style }) => (
  <OffthreadVideo src={src} trimBefore={from} style={style ?? cover} />
);

// Pessoa em tela cheia.
const TalkingFull: React.FC<Ctx> = ({ videoSrc, videoStartFrame }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Head src={videoSrc} from={videoStartFrame} />
  </AbsoluteFill>
);

// B-roll/imagem em cima, pessoa embaixo.
const SplitHorizontal: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "50%", overflow: "hidden" }}>
      {assetSrc && (isVideoAsset(assetSrc)
        ? <OffthreadVideo src={assetSrc} style={cover} muted />
        : <Img src={assetSrc} style={cover} />)}
    </div>
    <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "50%", overflow: "hidden" }}>
      <Head src={videoSrc} from={videoStartFrame} />
    </div>
  </AbsoluteFill>
);

// Dois clipes/imagens lado a lado (pessoa à esquerda, asset à direita).
const SplitVertical: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset }) => (
  <AbsoluteFill style={{ backgroundColor: "#000", flexDirection: "row" }}>
    <div style={{ width: "50%", height: "100%", overflow: "hidden" }}>
      <Head src={videoSrc} from={videoStartFrame} />
    </div>
    <div style={{ width: "50%", height: "100%", overflow: "hidden" }}>
      {assetSrc && (isVideoAsset(assetSrc)
        ? <OffthreadVideo src={assetSrc} style={cover} muted />
        : <Img src={assetSrc} style={cover} />)}
    </div>
  </AbsoluteFill>
);

// Print/tweet como card flutuante centralizado, com o vídeo desfocado atrás.
const OverlayCard: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Head src={videoSrc} from={videoStartFrame} style={{ ...cover, filter: "blur(24px) brightness(0.5)" }} />
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

// Imagem/print ocupando a tela inteira.
const ImageFullscreen: React.FC<Ctx> = ({ assetSrc, videoSrc, videoStartFrame }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    {assetSrc
      ? <Img src={assetSrc} style={cover} />
      : <Head src={videoSrc} from={videoStartFrame} />}
  </AbsoluteFill>
);

// B-roll em vídeo tela cheia; o áudio do talking-head continua por baixo (b-roll mutado).
const BrollFullscreen: React.FC<Ctx> = ({ videoSrc, videoStartFrame, assetSrc, isVideoAsset }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    {/* áudio do talking-head segue por baixo, sem imagem */}
    <Head src={videoSrc} from={videoStartFrame} style={{ display: "none" }} />
    {assetSrc && isVideoAsset(assetSrc)
      ? <OffthreadVideo src={assetSrc} style={cover} muted />
      : assetSrc
        ? <Img src={assetSrc} style={cover} />
        : <Head src={videoSrc} from={videoStartFrame} />}
  </AbsoluteFill>
);

export const LAYOUT_COMPONENTS: Record<Layout, React.FC<Ctx>> = {
  talking_full: TalkingFull,
  split_horizontal: SplitHorizontal,
  split_vertical: SplitVertical,
  overlay_card: OverlayCard,
  image_fullscreen: ImageFullscreen,
  broll_fullscreen: BrollFullscreen,
  // "sticker" não é um layout de segmento (é overlay); cai pra talking_full se usado como segmento.
  sticker: TalkingFull,
};

export { url };
export type { Ctx };
