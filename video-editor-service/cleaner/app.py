"""Worker GPU: remove legenda queimada de vídeos via inpainting (video-subtitle-remover).

Endpoint único:
  POST /limpar-legenda  (multipart: file=<mp4>)  -> devolve o mp4 limpo (sem legenda).

O VSR detecta sozinho a área da legenda e reconstrói o fundo (STTN/LAMA/ProPainter).
Precisa de GPU CUDA — NÃO rode na VPS CPU. O serviço principal aponta para cá via
VIDEO_CLEANER_URL e usa a limpeza como best-effort (se falhar, mantém o clip original).
"""
import pathlib
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

app = FastAPI(title="PPDash B-roll Subtitle Cleaner")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/limpar-legenda")
async def limpar_legenda(file: UploadFile = File(...)):
    # VSR é importado aqui para falhar cedo só se o endpoint for chamado sem o modelo instalado.
    try:
        from backend.main import SubtitleRemover  # video-subtitle-remover
    except Exception as e:  # pragma: no cover
        raise HTTPException(500, f"VSR indisponível: {e}")

    workdir = pathlib.Path(tempfile.mkdtemp(prefix="cleaner-"))
    src = workdir / (file.filename or "in.mp4")
    src.write_bytes(await file.read())

    # sub_area=None -> detecção automática da faixa de legenda.
    remover = SubtitleRemover(str(src), sub_area=None, gui_mode=False)
    remover.run()
    out = pathlib.Path(remover.video_out_name)  # *_no_sub.mp4
    if not out.exists() or out.stat().st_size < 1000:
        raise HTTPException(500, "VSR não gerou saída válida")
    return FileResponse(str(out), media_type="video/mp4", filename=out.name)
