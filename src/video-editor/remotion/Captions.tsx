import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from "remotion";
import type { Word, CaptionStyle } from "./schema";
import { CAPTION_STYLE_DEFAULT } from "./schema";

// Legenda estilo TikTok/Reels: poucas palavras por vez (karaokê), palavra atual destacada.
// Estilo (cor/fundo/borda/tamanho/posição/animação) vem de captionStyle (editável no editor).

type Page = { startMs: number; words: { text: string; fromMs: number; toMs: number }[] };

// Quebra a legenda em páginas curtas. Além de nº de palavras/duração, também quebra ao FIM DE FRASE
// (. ! ? …) e em SALTOS de tempo (corte) — assim a legenda nunca atravessa um corte nem parte a frase.
function paginar(words: Word[], maxWords: number, maxDurMs = 1100, gapMs = 500): Page[] {
  const pages: Page[] = [];
  let cur: Page | null = null;
  let prevTo: number | null = null;
  let prevPunct = false;
  for (const w of words) {
    const fromMs = w.start * 1000;
    const toMs = w.end * 1000;
    const estouraDur = cur && toMs - cur.startMs > maxDurMs;
    const cheio = cur && cur.words.length >= maxWords;
    const corte = cur && prevTo != null && fromMs - prevTo > gapMs;   // salto grande = corte
    const novaFrase = cur && prevPunct;                               // frase anterior terminou
    if (!cur || cheio || estouraDur || corte || novaFrase) {
      cur = { startMs: fromMs, words: [] };
      pages.push(cur);
    }
    cur.words.push({ text: w.word, fromMs, toMs });
    prevTo = toMs;
    prevPunct = /[.!?…]$/.test((w.word || "").trim());
  }
  return pages;
}

export const Captions: React.FC<{ words: Word[]; style?: CaptionStyle }> = ({ words, style }) => {
  const s = { ...CAPTION_STYLE_DEFAULT, ...(style || {}) };
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const pages = useMemo(() => paginar(words, Math.max(1, s.palavrasPorPagina)), [words, s.palavrasPorPagina]);
  if (!pages.length) return null;

  let idx = -1;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].startMs <= ms) idx = i;
    else break;
  }
  if (idx < 0) return null;
  const page = pages[idx];

  const enter = s.animar
    ? spring({ frame: frame - (page.startMs / 1000) * fps, fps, config: { damping: 200 }, durationInFrames: 6 })
    : 1;

  // Contorno via múltiplas sombras (stroke). Espessura = borderWidth.
  const bw = s.borderWidth;
  const stroke = bw > 0
    ? `0 0 ${Math.max(4, bw + 3)}px rgba(0,0,0,0.9), ${bw}px ${bw}px 0 ${s.borderColor}, -${bw}px -${bw}px 0 ${s.borderColor}, ${bw}px -${bw}px 0 ${s.borderColor}, -${bw}px ${bw}px 0 ${s.borderColor}`
    : "none";
  const temFundo = s.bgColor && s.bgColor !== "transparent";

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: s.posicaoY }}>
      <div
        style={{
          maxWidth: "90%", textAlign: "center", lineHeight: 1.1,
          display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "6px 16px",
          transform: `scale(${0.9 + enter * 0.1})`,
        }}
      >
        {page.words.map((t, i) => {
          const active = ms >= t.fromMs && ms < t.toMs;
          return (
            <span
              key={i}
              style={{
                fontFamily: "Inter, Arial, sans-serif",
                fontWeight: 900,
                fontSize: s.fontSize,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                color: active ? s.activeColor : s.color,
                backgroundColor: temFundo ? s.bgColor : undefined,
                padding: temFundo ? "2px 12px" : undefined,
                borderRadius: temFundo ? 8 : undefined,
                transform: active && s.animar ? "scale(1.12)" : "scale(1)",
                display: "inline-block",
                transition: "transform 90ms ease, color 60ms linear",
                textShadow: stroke,
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
