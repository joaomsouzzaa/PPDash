"""
Serviço de cortes de vídeo por IA para o PPDash (página Growth → Vídeo Editor).

O vídeo é enviado DIRETO para este serviço (multipart) — não passa pelo Supabase Storage,
que no plano free trava em 50MB. O resultado também é servido por aqui (/files/<job>.mp4).

Reaproveita o pipeline do repo browser-use/video-use (Python + FFmpeg):
  transcribe.py  → transcrição
  pack_transcripts.py → takes_packed.md
  [Claude claude-opus-4-8 lê o takes_packed.md + brief → edl.json]   ← decisão de corte
  render.py edl.json → final.mp4

Fluxo:
  POST /cortar  (multipart: video, job_id, brief, org_id ; Authorization: Bearer <supabase token>)
    1. valida o usuário via Supabase Auth
    2. salva o vídeo em disco, marca video_jobs.status = processando
    3. processa em background (transcribe → pack → edl → render)
    4. grava resultado_url (URL na VPS) + status=pronto (ou erro), atualizando `etapa` a cada passo

Variáveis de ambiente (ver .env.example):
  ANTHROPIC_API_KEY, ELEVENLABS_API_KEY,
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  VIDEO_USE_DIR (default ./video-use), OUTPUT_DIR (default ./outputs),
  PUBLIC_BASE (ex.: https://srv1779748.hstgr.cloud)
"""

import json
import os
import pathlib
import subprocess
import tempfile
import uuid

import anthropic
from fastapi import BackgroundTasks, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from supabase import Client, create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
VIDEO_USE_DIR = pathlib.Path(os.environ.get("VIDEO_USE_DIR", "./video-use")).resolve()
OUTPUT_DIR = pathlib.Path(os.environ.get("OUTPUT_DIR", "./outputs")).resolve()
PUBLIC_BASE = os.environ.get("PUBLIC_BASE", "").rstrip("/")
MODEL = "claude-opus-4-8"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="PPDash Vídeo Editor Service")

# CORS: o front (Vercel + subdomínios dos clientes) chama este serviço pelo navegador.
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)
# Serve os vídeos cortados em /files/<job>.mp4
app.mount("/files", StaticFiles(directory=str(OUTPUT_DIR)), name="files")


def svc() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def set_etapa(db: Client, job_id: str, etapa: str):
    db.table("video_jobs").update({"etapa": etapa}).eq("id", job_id).execute()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/cortar")
async def cortar(
    background: BackgroundTasks,
    job_id: str = Form(...),
    brief: str = Form(""),
    org_id: str = Form(""),
    video: UploadFile = File(...),
    authorization: str = Header(default=""),
):
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(401, "Sem token de autorização")
    try:
        user = svc().auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(401, "Usuário inválido")
    except Exception:
        raise HTTPException(401, "Token inválido")

    # Salva o upload em disco (não cabe mantê-lo em memória para a background task).
    workdir = pathlib.Path(tempfile.mkdtemp(prefix=f"vedit-{job_id}-"))
    src = workdir / "input.mp4"
    with open(src, "wb") as f:
        while chunk := await video.read(1024 * 1024):
            f.write(chunk)

    db = svc()
    db.table("video_jobs").update({"status": "processando", "etapa": "na fila", "erro": None}).eq("id", job_id).execute()
    background.add_task(processar_job, job_id, str(workdir), str(src), brief, org_id)
    return {"ok": True, "job_id": job_id, "status": "processando"}


# ============================================================
# Pipeline
# ============================================================
def processar_job(job_id: str, workdir_s: str, src_s: str, brief: str, org_id: str):
    db = svc()
    workdir = pathlib.Path(workdir_s)
    src = pathlib.Path(src_s)
    try:
        # video-use organiza tudo dentro de um "edit dir"; transcribe e pack compartilham ele.
        editdir = workdir / "edit"
        editdir.mkdir(parents=True, exist_ok=True)

        set_etapa(db, job_id, "transcrevendo áudio")
        run_helper("transcribe.py", [str(src), "--edit-dir", str(editdir)], cwd=workdir)

        set_etapa(db, job_id, "organizando transcrição")
        run_helper("pack_transcripts.py", ["--edit-dir", str(editdir)], cwd=workdir)
        packed = editdir / "takes_packed.md"
        if not packed.exists():
            raise RuntimeError("Falha ao empacotar a transcrição (takes_packed.md não gerado)")

        set_etapa(db, job_id, "decidindo cortes (IA)")
        ranges = gerar_ranges(packed.read_text(encoding="utf-8"), brief)
        stem = src.stem  # nome da fonte (= nome do transcript gerado pelo video-use)
        edl = {
            "sources": {stem: str(src)},
            "ranges": [{"source": stem, "start": r["start"], "end": r["end"]} for r in ranges],
        }
        edl_path = editdir / "edl.json"
        edl_path.write_text(json.dumps(edl), encoding="utf-8")

        set_etapa(db, job_id, "renderizando vídeo")
        out = OUTPUT_DIR / f"{job_id}.mp4"
        run_helper("render.py", [str(edl_path), "-o", str(out), "--no-subtitles"], cwd=workdir)
        if not out.exists():
            raise RuntimeError("render.py não gerou o final.mp4")

        resultado_url = f"{PUBLIC_BASE}/files/{job_id}.mp4"
        db.table("video_jobs").update(
            {"status": "pronto", "etapa": "concluído", "resultado_url": resultado_url, "edl": edl, "erro": None}
        ).eq("id", job_id).execute()
    except Exception as e:
        db.table("video_jobs").update(
            {"status": "erro", "etapa": None, "erro": str(e)[:500]}
        ).eq("id", job_id).execute()
    finally:
        import shutil
        shutil.rmtree(workdir, ignore_errors=True)


def run_helper(script: str, args: list[str], cwd: pathlib.Path):
    helper = VIDEO_USE_DIR / "helpers" / script
    proc = subprocess.run(
        ["python", str(helper), *args], cwd=str(cwd), capture_output=True, text=True
    )
    if proc.returncode != 0:
        raise RuntimeError(f"{script} falhou: {proc.stderr[-500:] or proc.stdout[-500:]}")


def gerar_ranges(takes_packed: str, brief: str) -> list[dict]:
    """
    Pede ao Claude os trechos a MANTER (start/end em segundos) a partir da transcrição empacotada.
    Retorna a lista de ranges; o EDL final (sources + ranges) é montado em processar_job.
    """
    client = anthropic.Anthropic()  # usa ANTHROPIC_API_KEY do ambiente
    instrucao = brief.strip() or (
        "Remova pausas longas, silêncios e vícios de linguagem (\"é...\", \"tipo...\", "
        "repetições e falsos começos), mantendo a fala natural e o ritmo dinâmico."
    )
    system = (
        "Você é um editor de vídeo. Recebe a transcrição de UM vídeo empacotada em frases, cada "
        "uma com prefixo [início-fim] em SEGUNDOS. Decida quais trechos MANTER no corte final. "
        "Regras: use os limites de tempo das frases (nunca corte no meio de uma palavra); "
        "adicione ~0.1s de folga nas bordas quando fizer sentido; preserve a ordem cronológica; "
        "remova apenas pausas/silêncios/vícios/repetições/falsos começos. "
        "Responda APENAS com JSON, sem texto extra.\n"
        'Formato EXATO: {"ranges": [{"start": <seg>, "end": <seg>}, ...]}  (start < end, em ordem)'
    )
    user = (
        f"Instrução de corte do usuário:\n{instrucao}\n\n"
        f"Transcrição empacotada (takes_packed.md):\n{takes_packed}"
    )
    resp = client.messages.create(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    texto = "".join(b.text for b in resp.content if b.type == "text").strip()
    if texto.startswith("```"):
        texto = texto.split("```", 2)[1].lstrip("json").strip()
    data = json.loads(texto)
    ranges = data.get("ranges") if isinstance(data, dict) else None
    if not ranges or not isinstance(ranges, list):
        raise RuntimeError("O modelo não retornou ranges de corte válidos")
    # Sanitiza: só pares start<end numéricos, em ordem
    limpos = []
    for r in ranges:
        try:
            s, e = float(r["start"]), float(r["end"])
            if e > s:
                limpos.append({"start": round(s, 3), "end": round(e, 3)})
        except (KeyError, TypeError, ValueError):
            continue
    if not limpos:
        raise RuntimeError("Nenhum range de corte aproveitável")
    return limpos
