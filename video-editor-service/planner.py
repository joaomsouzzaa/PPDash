"""
Planner do Vídeo Editor: a partir do transcript (word-level) + assets, pede ao Claude opus
um timeline.json (layout/asset por trecho + stickers) e valida o resultado.

Uso programático:
    from planner import gerar_timeline
    timeline = gerar_timeline(transcript, assets, video_name, brief)

Uso CLI (teste isolado):
    python planner.py transcript.json assets.json talking_head.mp4 > timeline.json
"""

import json
import pathlib
import sys

import anthropic

MODEL = "claude-opus-4-8"
LAYOUTS = {
    "talking_full", "split_horizontal", "split_vertical",
    "overlay_card", "image_fullscreen", "broll_fullscreen",
}
CORNERS = {"top", "top-left", "top-right", "bottom-left", "bottom-right"}

PROMPT_PATH = pathlib.Path(__file__).parent / "planner" / "prompt.md"


def _system() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def _resumo_words(transcript: dict) -> list[dict]:
    """Extrai a lista plana de words {word,start,end} do transcript (formato faster-whisper)."""
    words = []
    for seg in transcript.get("segments", []):
        for w in seg.get("words", []) or []:
            words.append({
                "word": (w.get("word") or w.get("text") or "").strip(),
                "start": round(float(w.get("start", 0)), 3),
                "end": round(float(w.get("end", 0)), 3),
            })
    return [w for w in words if w["word"]]


def gerar_timeline(transcript: dict, assets: list[dict], video_name: str, brief: str = "") -> dict:
    """assets: lista de {id, tipo, descricao}. Retorna o timeline.json validado."""
    words = _resumo_words(transcript)
    fim = round(max((w["end"] for w in words), default=0.0), 3)

    # Texto legível por frase com timestamps, para o modelo raciocinar os cortes.
    linhas = []
    for seg in transcript.get("segments", []):
        s = round(float(seg.get("start", 0)), 2)
        e = round(float(seg.get("end", 0)), 2)
        linhas.append(f"[{s:.2f}-{e:.2f}] {seg.get('text','').strip()}")
    transcricao_txt = "\n".join(linhas) or " ".join(w["word"] for w in words)

    assets_txt = json.dumps(assets, ensure_ascii=False, indent=2) if assets else "[] (nenhum asset)"
    instrucao = brief.strip() or "Edição dinâmica e fiel ao conteúdo."

    user = (
        f"Vídeo: {video_name}\n"
        f"Duração da fala: {fim:.2f}s (o último segmento deve terminar em ~{fim:.2f}).\n\n"
        f"Instrução do usuário: {instrucao}\n\n"
        f"ASSETS DISPONÍVEIS (use os ids):\n{assets_txt}\n\n"
        f"TRANSCRIÇÃO (frases com [início-fim] em segundos):\n{transcricao_txt}"
    )

    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        system=_system(),
        messages=[{"role": "user", "content": user}],
    )
    texto = "".join(b.text for b in resp.content if b.type == "text").strip()
    if texto.startswith("```"):
        texto = texto.split("```", 2)[1].lstrip("json").strip()
    tl = json.loads(texto)
    return _validar(tl, assets, video_name, fim)


def _validar(tl: dict, assets: list[dict], video_name: str, fim: float) -> dict:
    """Sanitiza e valida a timeline; corrige pequenos problemas (gaps, ids inválidos)."""
    ids = {a["id"] for a in assets if "id" in a}
    fps = int(tl.get("fps", 30)) or 30
    segs_in = tl.get("segments") or []
    if not isinstance(segs_in, list) or not segs_in:
        raise RuntimeError("Planner não retornou segments")

    segs = []
    cursor = 0.0
    for s in segs_in:
        try:
            start, end = float(s["start"]), float(s["end"])
        except (KeyError, TypeError, ValueError):
            continue
        layout = s.get("layout")
        if layout not in LAYOUTS:
            layout = "talking_full"
        asset = s.get("asset")
        if asset not in ids:
            asset = None
            if layout != "talking_full":
                layout = "talking_full"  # sem asset válido não dá pra fazer layout com mídia
        if end <= start:
            continue
        # garante contiguidade (sem gaps/sobreposição)
        start = round(cursor, 3)
        end = round(max(start + 0.3, end), 3)
        segs.append({"start": start, "end": end, "layout": layout, "asset": asset})
        cursor = end

    if not segs:
        raise RuntimeError("Nenhum segmento válido após validação")
    # estica o último até o fim da fala
    if fim and segs[-1]["end"] < fim:
        segs[-1]["end"] = round(fim, 3)

    stickers = []
    for st in tl.get("stickers") or []:
        if st.get("asset") in ids:
            stickers.append({
                "asset": st["asset"],
                "start": round(float(st.get("start", 0)), 3),
                "end": round(float(st.get("end", 0)), 3),
                "corner": st.get("corner") if st.get("corner") in CORNERS else "top-right",
            })

    return {"video": video_name, "fps": fps, "durationInSeconds": cursor, "segments": segs, "stickers": stickers}


if __name__ == "__main__":
    transcript = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    assets = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")) if len(sys.argv) > 2 else []
    video_name = sys.argv[3] if len(sys.argv) > 3 else "talking_head.mp4"
    print(json.dumps(gerar_timeline(transcript, assets, video_name), ensure_ascii=False, indent=2))
