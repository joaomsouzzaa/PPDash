import React from "react";
import { Sequence, useVideoConfig } from "remotion";
import type { TextLayer } from "./schema";

// Camadas de texto livre, posicionadas pelo CENTRO (x,y em fração 0–1).
export const TextLayers: React.FC<{ texts?: TextLayer[] }> = ({ texts }) => {
  const { fps } = useVideoConfig();
  if (!texts || !texts.length) return null;
  return (
    <>
      {texts.map((t) => {
        const from = Math.round((t.start || 0) * fps);
        const dur = Math.max(1, Math.round(((t.end || 0) - (t.start || 0)) * fps));
        return (
          <Sequence key={t.id} from={from} durationInFrames={dur}>
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <div
                style={{
                  position: "absolute",
                  left: `${(t.x ?? 0.5) * 100}%`,
                  top: `${(t.y ?? 0.5) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  maxWidth: "90%",
                  fontSize: t.fontSize ?? 80,
                  color: t.color ?? "#FFFFFF",
                  backgroundColor: t.bgColor && t.bgColor !== "transparent" ? t.bgColor : "transparent",
                  padding: t.bgColor && t.bgColor !== "transparent" ? "0.15em 0.4em" : 0,
                  borderRadius: 12,
                  fontWeight: t.bold ? 800 : 500,
                  fontFamily: "Inter, system-ui, sans-serif",
                  textAlign: t.align ?? "center",
                  lineHeight: 1.1,
                  whiteSpace: "pre-wrap",
                  textShadow: "0 2px 12px rgba(0,0,0,0.55)",
                }}
              >
                {t.text}
              </div>
            </div>
          </Sequence>
        );
      })}
    </>
  );
};
