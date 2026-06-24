# Renderizador Remotion — Vídeo Editor (PPDash)

Renderiza o vídeo editorial (talking-head + camadas dinâmicas + legenda animada) a partir de um
`timeline.json` (gerado pelo planner) e das mídias do job. Saída **vertical 1080x1920, 30fps**.

## Estrutura
- `src/schema.ts` — schema **zod** do `timeline.json` e das props da Composition.
- `src/Main.tsx` — Composition que monta os segmentos (TransitionSeries + cross-dissolve ~150ms),
  stickers e a legenda.
- `src/layouts/` — os 7 layouts (talking_full, split_horizontal, split_vertical, overlay_card,
  image_fullscreen, broll_fullscreen, sticker).
- `src/Captions.tsx` — legenda palavra-a-palavra (`@remotion/captions`), palavra atual destacada.
- `src/Root.tsx` — registra a Composition `Main` e calcula a duração pela timeline.

## Contrato de mídia
As props (`MainProps`) trazem:
- `timeline` — o `timeline.json`.
- `words` — palavras com timestamps (do `transcript.json`) para a legenda.
- `assets` — mapa `id -> nome_do_arquivo`.
- `mediaBase` — base das mídias:
  - **produção**: URL http onde a VPS serve o dir do job (ex.: `https://srv1779748.hstgr.cloud/work/<job>`);
  - **exemplo offline**: deixe `""` e coloque as mídias em `public/` (resolvido via `staticFile`).

## Testar offline (sem arquivos reais)
```bash
npm install
bash example/make_placeholders.sh          # gera public/*.mp4 e *.png (precisa ffmpeg)
npx remotion render Main out/output.mp4 --props=example/props.json
# ou abrir o preview interativo:
npx remotion studio
```

## Render em produção (chamado pelo serviço)
```bash
npx remotion render Main /caminho/output.mp4 --props=/caminho/props.json
```
onde `props.json` é `MainProps` com `mediaBase` apontando para o dir do job servido pela VPS.
