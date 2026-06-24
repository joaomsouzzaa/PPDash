import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from "remotion";
import type { Word } from "./schema";

// Legenda estilo TikTok/Reels: poucas palavras por vez (karaokê), a palavra atual
// destacada (cor + escala), trocando no ritmo da fala. Faixa inferior-central.

const MAX_WORDS = 3;       // palavras por "página" (mantém 1 linha)
const MAX_DUR_MS = 1100;   // duração máxima de uma página

type Page = { startMs: number; words: { text: string; fromMs: number; toMs: number }[] };

function paginar(words: Word[]): Page[] {
  const pages: Page[] = [];
  let cur: Page | null = null;
  for (const w of words) {
    const fromMs = w.start * 1000;
    const toMs = w.end * 1000;
    const estouraDur = cur && toMs - cur.startMs > MAX_DUR_MS;
    if (!cur || cur.words.length >= MAX_WORDS || estouraDur) {
      cur = { startMs: fromMs, words: [] };
      pages.push(cur);
    }
    cur.words.push({ text: w.word, fromMs, toMs });
  }
  return pages;
}

export const Captions: React.FC<{ words: Word[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const pages = useMemo(() => paginar(words), [words]);
  if (!pages.length) return null;

  // Página ativa = última que já começou (some até a próxima começar; sem blanks/flicker).
  let idx = -1;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].startMs <= ms) idx = i;
    else break;
  }
  if (idx < 0) return null;
  const page = pages[idx];

  // Pequeno "pop" ao entrar a página.
  const enter = spring({ frame: frame - (page.startMs / 1000) * fps, fps, config: { damping: 200 }, durationInFrames: 6 });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 380 }}>
      <div
        style={{
          maxWidth: "90%", textAlign: "center", lineHeight: 1.1,
          display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 16px",
          transform: `scale(${0.9 + enter * 0.1})`,
        }}
      >
        {page.words.map((t, i) => {
          const active = ms >= t.fromMs && ms < t.toMs;
          const past = ms >= t.toMs;
          return (
            <span
              key={i}
              style={{
                fontFamily: "Inter, Arial, sans-serif",
                fontWeight: 900,
                fontSize: 86,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                color: active ? "#FFE600" : "#FFFFFF",
                opacity: past && !active ? 0.85 : 1,
                transform: active ? "scale(1.12)" : "scale(1)",
                display: "inline-block",
                transition: "transform 90ms ease, color 60ms linear",
                textShadow:
                  "0 0 10px rgba(0,0,0,0.95), 5px 5px 0 #000, -5px -5px 0 #000, 5px -5px 0 #000, -5px 5px 0 #000, 0 6px 12px rgba(0,0,0,0.7)",
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
