"""
Serviço de cortes de vídeo por IA para o PPDash (página Growth → Vídeo Editor).

Reaproveita o pipeline do repo browser-use/video-use (Python + FFmpeg):
  transcribe.py  → transcripts/<name>.json
  pack_transcripts.py → takes_packed.md
  [Claude claude-opus-4-8 lê o takes_packed.md + brief → edl.json]   ← decisão de corte
  render.py edl.json → final.mp4

Fluxo:
  POST /cortar  { job_id, video_url, brief, org_id }  (Authorization: Bearer <supabase access_token>)
    1. valida o usuário via Supabase Auth
    2. marca video_jobs.status = processando
    3. processa em background (download → transcribe → pack → edl → render → upload)
    4. grava resultado_url + status=pronto (ou status=erro)

Variáveis de ambiente (ver .env.example):
  ANTHROPIC_API_KEY, ELEVENLABS_API_KEY,
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  VIDEO_USE_DIR (default ./video-use), STORAGE_BUCKET (default video-editor)
"""

import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import uuid

import anthropic
import httpx
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import Client, create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
VIDEO_USE_DIR = pathlib.Path(os.environ.get("VIDEO_USE_DIR", "./video-use")).resolve()
STORAGE_BUCKET = os.environ.get("STORAGE_BUCKET", "video-editor")
MODEL = "claude-opus-4-8"

app = FastAPI(title="PPDash Vídeo Editor Service")

# CORS: o front (Vercel + subdomínios dos clientes) chama este serviço pelo navegador.
# Não usamos cookies — só o header Authorization — então liberar todas as origens é seguro aqui.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def svc() -> Client:
    """Cliente Supabase com service role (ignora RLS — atualiza video_jobs e sobe o resultado)."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


class CortarBody(BaseModel):
    job_id: str
    video_url: str
    brief: str = ""
    org_id: str | None = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/cortar")
def cortar(body: CortarBody, background: BackgroundTasks, authorization: str = Header(default="")):
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(401, "Sem token de autorização")
    # Valida que o token pertence a um usuário logado (não confiamos só no corpo).
    try:
        user = svc().auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(401, "Usuário inválido")
    except Exception:
        raise HTTPException(401, "Token inválido")

    svc().table("video_jobs").update({"status": "processando"}).eq("id", body.job_id).execute()
    background.add_task(processar_job, body.job_id, body.video_url, body.brief, body.org_id)
    return {"ok": True, "job_id": body.job_id, "status": "processando"}


# ============================================================
# Pipeline
# ============================================================
def processar_job(job_id: str, video_url: str, brief: str, org_id: str | None):
    db = svc()
    workdir = pathlib.Path(tempfile.mkdtemp(prefix=f"vedit-{job_id}-"))
    try:
        # 1) Baixa o vídeo de entrada
        src = workdir / "input.mp4"
        with httpx.stream("GET", video_url, timeout=120) as r:
            r.raise_for_status()
            with open(src, "wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)

        # 2) Transcreve (ElevenLabs Scribe via helper do video-use)
        run_helper("transcribe.py", [str(src)], cwd=workdir)

        # 3) Empacota a transcrição em frases com timestamps
        run_helper("pack_transcripts.py", ["--edit-dir", str(workdir)], cwd=workdir)
        packed = (workdir / "takes_packed.md")
        if not packed.exists():
            raise RuntimeError("Falha ao empacotar a transcrição (takes_packed.md não gerado)")

        # 4) Claude lê a transcrição + brief e decide os cortes (edl.json)
        edl = gerar_edl(packed.read_text(encoding="utf-8"), brief, source_name=src.name)
        edl_path = workdir / "edl.json"
        edl_path.write_text(json.dumps(edl), encoding="utf-8")

        # 5) Renderiza o vídeo cortado
        out = workdir / "final.mp4"
        run_helper("render.py", [str(edl_path), "-o", str(out)], cwd=workdir)
        if not out.exists():
            raise RuntimeError("render.py não gerou o final.mp4")

        # 6) Sobe o resultado e marca o job como pronto
        dest = f"{org_id or 'global'}/{job_id}/{uuid.uuid4()}.mp4"
        with open(out, "rb") as f:
            db.storage.from_(STORAGE_BUCKET).upload(
                dest, f.read(), {"content-type": "video/mp4", "upsert": "true"}
            )
        public_url = db.storage.from_(STORAGE_BUCKET).get_public_url(dest)
        db.table("video_jobs").update(
            {"status": "pronto", "resultado_url": public_url, "edl": edl, "erro": None}
        ).eq("id", job_id).execute()
    except Exception as e:
        db.table("video_jobs").update(
            {"status": "erro", "erro": str(e)[:500]}
        ).eq("id", job_id).execute()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def run_helper(script: str, args: list[str], cwd: pathlib.Path):
    """Roda um helper do video-use (helpers/<script>) e levanta erro com o stderr em caso de falha."""
    helper = VIDEO_USE_DIR / "helpers" / script
    proc = subprocess.run(
        ["python", str(helper), *args],
        cwd=str(cwd),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"{script} falhou: {proc.stderr[-500:] or proc.stdout[-500:]}")


def gerar_edl(takes_packed: str, brief: str, source_name: str) -> dict:
    """
    Pede ao Claude um edl.json válido para o render.py do video-use a partir da transcrição
    empacotada. Segue as regras do SKILL.md: cortes em limites de palavra, padding de 30–200ms,
    nunca cortar no meio de uma palavra, fades de 30ms aplicados pelo render.
    """
    client = anthropic.Anthropic()  # usa ANTHROPIC_API_KEY do ambiente
    instrucao = brief.strip() or (
        "Remova pausas longas, silêncios e vícios de linguagem (\"é...\", \"tipo...\", "
        "repetições e falsos começos), mantendo a fala natural e o ritmo dinâmico."
    )
    system = (
        "Você é um editor de vídeo. Recebe a transcrição de UM vídeo, já empacotada em frases "
        "com timestamps (em segundos), e devolve um EDL (Edit Decision List) em JSON para o "
        "render.py do video-use. Regras NÃO-NEGOCIÁVEIS: nunca corte no meio de uma palavra "
        "(use os limites de palavra do transcript); adicione 30–200ms de padding em cada borda; "
        "preserve a ordem cronológica; remova apenas trechos ruins. Responda APENAS com o JSON.\n"
        'Formato: {"segments": [{"source": "<arquivo>", "start": <seg>, "end": <seg>}, ...]}'
    )
    user = (
        f"Arquivo de origem: {source_name}\n\n"
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
    # Remove cercas de código se vierem
    if texto.startswith("```"):
        texto = texto.split("```", 2)[1].lstrip("json").strip()
    edl = json.loads(texto)
    if not isinstance(edl, dict) or "segments" not in edl:
        raise RuntimeError("EDL inválido retornado pelo modelo")
    return edl
