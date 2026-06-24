import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import type { Word } from "./schema";

// Legenda estilo TikTok: palavra-a-palavra, palavra atual destacada (cor/escala),
// fonte bold com contorno/sombra, na faixa inferior-central.
export const Captions: React.FC<{ words: Word[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const pages = useMemo(() => {
    if (!words.length) return [];
    const captions: Caption[] = words.map((w) => ({
      text: w.word,
      startMs: w.start * 1000,
      endMs: w.end * 1000,
      timestampMs: ((w.start + w.end) / 2) * 1000,
      confidence: 1,
    }));
    // Agrupa em "páginas" curtas (janelas de ~1.2s) — estilo TikTok.
    return createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: 1200 }).pages;
  }, [words]);

  const page = pages.find((p) => ms >= p.startMs && ms < p.startMs + 1200 + (p.tokens.at(-1)?.toMs ? 0 : 0))
    ?? pages.filter((p) => ms >= p.startMs).at(-1);
  if (!page) return null;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 360 }}>
      <div
        style={{
          maxWidth: "85%", textAlign: "center", lineHeight: 1.15,
          display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 14px",
        }}
      >
        {page.tokens.map((t, i) => {
          const active = ms >= t.fromMs && ms < t.toMs;
          return (
            <span
              key={i}
              style={{
                fontFamily: "Inter, Arial, sans-serif",
                fontWeight: 800,
                fontSize: 72,
                color: active ? "#FFE600" : "#FFFFFF",
                transform: active ? "scale(1.08)" : "scale(1)",
                display: "inline-block",
                textShadow:
                  "0 0 8px rgba(0,0,0,0.9), 4px 4px 0 #000, -4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000",
                transition: "color 80ms linear",
              }}
            >
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
