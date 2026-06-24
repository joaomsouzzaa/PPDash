import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";
import { mainPropsSchema, type MainProps } from "./schema";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

// Duração = soma dos trechos (corte seco, sem sobreposição de transição).
function durationInFrames(props: MainProps): number {
  const fps = props.timeline.fps || FPS;
  const segs = props.timeline.segments;
  if (!segs.length) return fps; // 1s placeholder
  const total = segs.reduce((acc, s) => acc + Math.max(1, Math.round((s.end - s.start) * fps)), 0);
  return Math.max(fps, total);
}

const DEFAULTS: MainProps = {
  timeline: { video: "talking_head.mp4", fps: FPS, segments: [], stickers: [] },
  words: [],
  assets: {},
  mediaBase: "",
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Main"
    component={Main}
    durationInFrames={FPS}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    schema={mainPropsSchema}
    defaultProps={DEFAULTS}
    calculateMetadata={({ props }) => ({
      durationInFrames: durationInFrames(props),
      fps: props.timeline.fps || FPS,
    })}
  />
);
