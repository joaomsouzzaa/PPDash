"""
Transcrição word-level com faster-whisper (local, grátis), usada para:
  - a legenda animada palavra-a-palavra (Remotion);
  - o planner decidir os cortes de layout no ritmo da fala.

Roda no vídeo JÁ CORTADO, para os timestamps baterem com a timeline final.

Uso:
    from transcribe_words import transcrever_words
    transcript = transcrever_words("/caminho/cortado.mp4")  # -> dict {segments:[{start,end,text,words:[{word,start,end}]}]}

Modelo controlado por env WHISPER_MODEL (default 'small'); CPU com compute_type int8.
"""

import os

_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        name = os.environ.get("WHISPER_MODEL", "small")
        _model = WhisperModel(name, device="cpu", compute_type="int8")
    return _model


def transcrever_words(video_path: str, language: str | None = "pt", on_progress=None, initial_prompt: str | None = None) -> dict:
    """on_progress(pct:int) é chamado conforme a transcrição avança (segment.end / duração).
    language="pt" por padrão (evita autodetecção errada em clipes curtos). beam_size + VAD
    ajustados para timestamps de palavra mais precisos (melhor sincronia de legenda/corte)."""
    model = _get_model()
    segments, info = model.transcribe(
        video_path,
        language=language,            # "pt" por padrão; passe None para autodetectar
        word_timestamps=True,
        beam_size=5,                  # mais preciso que o greedy default
        vad_filter=True,              # ignora silêncios longos
        vad_parameters={"min_silence_duration_ms": 400},
        initial_prompt=initial_prompt,
        condition_on_previous_text=False,  # evita "arrastar" erro de uma frase pra outra
    )
    dur = float(getattr(info, "duration", 0) or 0)
    out_segments = []
    ultimo = -1
    for seg in segments:  # gerador: itera conforme transcreve
        words = [
            {"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
            for w in (seg.words or []) if w.word and w.word.strip()
        ]
        out_segments.append({
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text.strip(),
            "words": words,
        })
        if on_progress and dur > 0:
            pct = min(99, int(seg.end / dur * 100))
            if pct != ultimo:
                ultimo = pct
                try: on_progress(pct)
                except Exception: pass
    return {"segments": out_segments}


if __name__ == "__main__":
    import json, sys
    print(json.dumps(transcrever_words(sys.argv[1]), ensure_ascii=False, indent=2))
