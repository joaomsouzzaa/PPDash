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
import re
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
# Entrada persistente: mantida só enquanto o job não concluiu (permite reprocessar em caso de erro).
INPUT_DIR = pathlib.Path(os.environ.get("INPUT_DIR", str(OUTPUT_DIR.parent / "inputs"))).resolve()
PUBLIC_BASE = os.environ.get("PUBLIC_BASE", "").rstrip("/")
# Dir de trabalho por job (vídeo cortado + assets) servido em /work para o Remotion ler via http.
WORK_DIR = pathlib.Path(os.environ.get("WORK_DIR", str(OUTPUT_DIR.parent / "work"))).resolve()
REMOTION_DIR = pathlib.Path(os.environ.get("REMOTION_DIR", "./remotion")).resolve()
# Base http que o render do Remotion (mesmo host) usa para carregar as mídias do job.
INTERNAL_BASE = os.environ.get("INTERNAL_BASE", "http://127.0.0.1:8080")
MODEL = "claude-opus-4-8"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
INPUT_DIR.mkdir(parents=True, exist_ok=True)
WORK_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="PPDash Vídeo Editor Service")

# CORS: o front (Vercel + subdomínios dos clientes) chama este serviço pelo navegador.
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)
# Serve os vídeos cortados em /files/<job>.mp4 e as mídias de trabalho em /work/<job>/...
app.mount("/files", StaticFiles(directory=str(OUTPUT_DIR)), name="files")
app.mount("/work", StaticFiles(directory=str(WORK_DIR)), name="work")


def svc() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def set_etapa(db: Client, job_id: str, etapa: str):
    db.table("video_jobs").update({"etapa": etapa}).eq("id", job_id).execute()


def exigir_usuario(authorization: str):
    """Valida o token do Supabase; levanta 401 se inválido."""
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(401, "Sem token de autorização")
    try:
        user = svc().auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(401, "Usuário inválido")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Token inválido")


def input_path(job_id: str) -> pathlib.Path:
    return INPUT_DIR / f"{job_id}.mp4"


def output_path(job_id: str) -> pathlib.Path:
    return OUTPUT_DIR / f"{job_id}.mp4"


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/disk")
def disk():
    """Uso de disco da partição onde ficam os vídeos (para acompanhar na página)."""
    import shutil as _sh
    total, used, free = _sh.disk_usage(str(OUTPUT_DIR))
    gb = 1024 ** 3
    return {
        "total_gb": round(total / gb, 1),
        "used_gb": round(used / gb, 1),
        "free_gb": round(free / gb, 1),
        "pct_used": round(used / total * 100),
    }


@app.post("/cortar")
async def cortar(
    background: BackgroundTasks,
    job_id: str = Form(...),
    brief: str = Form(""),
    org_id: str = Form(""),
    video: UploadFile = File(...),
    authorization: str = Header(default=""),
):
    exigir_usuario(authorization)

    # Salva o upload de forma persistente (mantido até concluir; permite reprocessar em erro).
    src = input_path(job_id)
    with open(src, "wb") as f:
        while chunk := await video.read(1024 * 1024):
            f.write(chunk)

    db = svc()
    db.table("video_jobs").update({"status": "processando", "etapa": "na fila", "modo": "corte", "erro": None}).eq("id", job_id).execute()
    background.add_task(processar_job, job_id, brief, org_id)
    return {"ok": True, "job_id": job_id, "status": "processando"}


@app.post("/editar")
async def editar(
    background: BackgroundTasks,
    job_id: str = Form(...),
    brief: str = Form(""),
    org_id: str = Form(""),
    assets_json: str = Form("[]"),  # [{id,tipo,descricao,filename}, ...]
    video: UploadFile = File(...),
    assets: list[UploadFile] = File(default=[]),
    authorization: str = Header(default=""),
):
    """Edição completa: corte → transcrição → planner → render Remotion."""
    exigir_usuario(authorization)

    # vídeo de entrada (persistente até concluir)
    src = input_path(job_id)
    with open(src, "wb") as f:
        while chunk := await video.read(1024 * 1024):
            f.write(chunk)

    # assets vão pro dir de trabalho do job (servido em /work/<job>/assets/...)
    workjob = WORK_DIR / job_id
    assets_dir = workjob / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    for up in assets:
        nome = pathlib.Path(up.filename or "").name
        if not nome:
            continue
        with open(assets_dir / nome, "wb") as f:
            while chunk := await up.read(1024 * 1024):
                f.write(chunk)
    (workjob / "assets_meta.json").write_text(assets_json or "[]", encoding="utf-8")

    db = svc()
    db.table("video_jobs").update({"status": "processando", "etapa": "na fila", "modo": "completo", "erro": None}).eq("id", job_id).execute()
    background.add_task(processar_edicao, job_id, brief, org_id)
    return {"ok": True, "job_id": job_id, "status": "processando"}


@app.post("/reprocessar")
def reprocessar(background: BackgroundTasks, body: dict, authorization: str = Header(default="")):
    exigir_usuario(authorization)
    job_id = (body or {}).get("job_id")
    if not job_id:
        raise HTTPException(400, "job_id obrigatório")
    if not input_path(job_id).exists():
        raise HTTPException(409, "O vídeo original não está mais salvo na VPS. Reenvie o vídeo.")
    db = svc()
    row = db.table("video_jobs").select("brief,org_id,modo").eq("id", job_id).maybe_single().execute()
    brief = (row.data or {}).get("brief") or ""
    org_id = (row.data or {}).get("org_id") or ""
    modo = (row.data or {}).get("modo") or "corte"
    if modo == "completo" and not (WORK_DIR / job_id / "assets").exists():
        raise HTTPException(409, "Os assets deste job não estão mais salvos. Reenvie.")
    db.table("video_jobs").update({"status": "processando", "etapa": "na fila", "erro": None}).eq("id", job_id).execute()
    background.add_task(processar_edicao if modo == "completo" else processar_job, job_id, brief, org_id)
    return {"ok": True, "job_id": job_id, "status": "processando"}


@app.delete("/jobs/{job_id}")
def deletar(job_id: str, authorization: str = Header(default="")):
    exigir_usuario(authorization)
    for p in (input_path(job_id), output_path(job_id)):
        try:
            p.unlink(missing_ok=True)
        except Exception:
            pass
    import shutil
    shutil.rmtree(WORK_DIR / job_id, ignore_errors=True)  # assets/vídeo de trabalho (edição)
    svc().table("video_jobs").delete().eq("id", job_id).execute()
    return {"ok": True}


# ============================================================
# Pipeline
# ============================================================
def _gerar_corte(db: Client, job_id: str, src: pathlib.Path, workdir: pathlib.Path,
                 out: pathlib.Path, prefixo: str = "") -> dict:
    """Roda o corte por IA (video-use) e renderiza em `out`. Retorna o EDL. `prefixo` rotula a etapa."""
    editdir = workdir / "edit"
    editdir.mkdir(parents=True, exist_ok=True)

    set_etapa(db, job_id, f"{prefixo}transcrevendo áudio")
    run_helper("transcribe.py", [str(src), "--edit-dir", str(editdir)], cwd=workdir)

    set_etapa(db, job_id, f"{prefixo}organizando transcrição")
    run_helper("pack_transcripts.py", ["--edit-dir", str(editdir)], cwd=workdir)
    packed = editdir / "takes_packed.md"
    if not packed.exists():
        raise RuntimeError("Falha ao empacotar a transcrição (takes_packed.md não gerado)")

    set_etapa(db, job_id, f"{prefixo}decidindo cortes (IA)")
    ranges = gerar_ranges(packed.read_text(encoding="utf-8"), "")
    stem = src.stem
    edl = {
        "sources": {stem: str(src)},
        "ranges": [{"source": stem, "start": r["start"], "end": r["end"]} for r in ranges],
    }
    edl_path = editdir / "edl.json"
    edl_path.write_text(json.dumps(edl), encoding="utf-8")

    total = len(edl["ranges"])
    seg_re = re.compile(r"^\s*\[(\d+)\]")

    def on_render_line(line: str):
        m = seg_re.match(line)
        if m:
            i = int(m.group(1)) + 1
            set_etapa(db, job_id, f"{prefixo}cortando vídeo ({i}/{total})" if i < total else f"{prefixo}montando corte")

    run_helper("render.py", [str(edl_path), "-o", str(out), "--no-subtitles", "--preview"], cwd=workdir, on_line=on_render_line)
    if not out.exists():
        raise RuntimeError("render.py não gerou o vídeo cortado")
    return edl


def processar_job(job_id: str, brief: str, org_id: str):
    """Modo 'corte': só remove pausas/vícios e entrega o vídeo cortado."""
    db = svc()
    src = input_path(job_id)
    workdir = pathlib.Path(tempfile.mkdtemp(prefix=f"vedit-{job_id}-"))
    try:
        out = OUTPUT_DIR / f"{job_id}.mp4"
        edl = _gerar_corte(db, job_id, src, workdir, out)
        db.table("video_jobs").update({
            "status": "pronto", "etapa": "concluído",
            "resultado_url": f"{PUBLIC_BASE}/files/{job_id}.mp4", "edl": edl, "erro": None,
        }).eq("id", job_id).execute()
        src.unlink(missing_ok=True)  # libera espaço (sucesso)
    except Exception as e:
        db.table("video_jobs").update({"status": "erro", "etapa": None, "erro": str(e)[:500]}).eq("id", job_id).execute()
    finally:
        import shutil
        shutil.rmtree(workdir, ignore_errors=True)


def processar_edicao(job_id: str, brief: str, org_id: str):
    """Modo 'completo': corte → transcrição word-level → planner → render Remotion."""
    import shutil
    from transcribe_words import transcrever_words
    from planner import gerar_timeline

    db = svc()
    src = input_path(job_id)
    workdir = pathlib.Path(tempfile.mkdtemp(prefix=f"vedit-{job_id}-"))
    workjob = WORK_DIR / job_id
    assets_dir = workjob / "assets"
    try:
        # 1) Corte → talking_head cortado dentro do dir servido (/work/<job>/talking_head.mp4)
        workjob.mkdir(parents=True, exist_ok=True)
        cut = workjob / "talking_head.mp4"
        _gerar_corte(db, job_id, src, workdir, cut, prefixo="")

        # 2) Transcrição word-level NO vídeo cortado (para legenda + planner)
        set_etapa(db, job_id, "transcrevendo legendas")
        transcript = transcrever_words(str(cut))
        words = [w for s in transcript.get("segments", []) for w in s.get("words", [])]

        # 3) Planner → timeline.json
        set_etapa(db, job_id, "planejando layouts")
        meta = []
        meta_path = workjob / "assets_meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8") or "[]")
        assets_list = [{"id": m.get("id"), "tipo": m.get("tipo"), "descricao": m.get("descricao")} for m in meta if m.get("id")]
        assets_map = {m["id"]: f"assets/{pathlib.Path(m.get('filename','')).name}" for m in meta if m.get("id") and m.get("filename")}
        timeline = gerar_timeline(transcript, assets_list, "talking_head.mp4", brief)

        # 4) Render Remotion (lê mídias via http em /work/<job>)
        props = {"timeline": timeline, "words": words, "assets": assets_map, "mediaBase": f"{INTERNAL_BASE}/work/{job_id}"}
        props_path = workjob / "props.json"
        props_path.write_text(json.dumps(props), encoding="utf-8")

        set_etapa(db, job_id, "renderizando vídeo")
        out = OUTPUT_DIR / f"{job_id}.mp4"
        _render_remotion(db, job_id, props_path, out)
        if not out.exists():
            raise RuntimeError("Remotion não gerou o vídeo final")

        db.table("video_jobs").update({
            "status": "pronto", "etapa": "concluído",
            "resultado_url": f"{PUBLIC_BASE}/files/{job_id}.mp4", "timeline": timeline, "erro": None,
        }).eq("id", job_id).execute()
        # sucesso: libera espaço (entrada + dir de trabalho com o vídeo cortado + assets)
        src.unlink(missing_ok=True)
        shutil.rmtree(workjob, ignore_errors=True)
    except Exception as e:
        # erro: mantém entrada + assets para permitir reprocessar
        db.table("video_jobs").update({"status": "erro", "etapa": None, "erro": str(e)[:500]}).eq("id", job_id).execute()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _render_remotion(db: Client, job_id: str, props_path: pathlib.Path, out: pathlib.Path):
    """Roda `npx remotion render` reportando o progresso (frames) em tempo real."""
    pat = re.compile(r"(\d+)\s*/\s*(\d+)")

    def on_line(line: str):
        # Remotion imprime progresso de frames "Rendered 120/360" (ou similar).
        if "render" in line.lower() or "/" in line:
            m = pat.search(line)
            if m and int(m.group(2)) > 0:
                pct = round(int(m.group(1)) / int(m.group(2)) * 100)
                set_etapa(db, job_id, f"renderizando vídeo ({pct}%)")

    run_cmd(
        ["npx", "remotion", "render", "Main", str(out), f"--props={props_path}"],
        cwd=REMOTION_DIR, on_line=on_line,
    )


def run_cmd(cmd: list[str], cwd: pathlib.Path, on_line=None):
    """Roda um comando; se on_line for dado, transmite a saída linha a linha (progresso)."""
    nome = pathlib.Path(cmd[1] if cmd[0] == "python" else cmd[0]).name
    if on_line is None:
        proc = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"{nome} falhou: {proc.stderr[-500:] or proc.stdout[-500:]}")
        return
    proc = subprocess.Popen(
        cmd, cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
    )
    tail: list[str] = []
    assert proc.stdout is not None
    for line in proc.stdout:
        tail.append(line)
        if len(tail) > 40:
            tail.pop(0)
        try:
            on_line(line)
        except Exception:
            pass
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"{nome} falhou: {''.join(tail)[-500:]}")


def run_helper(script: str, args: list[str], cwd: pathlib.Path, on_line=None):
    run_cmd(["python", str(VIDEO_USE_DIR / "helpers" / script), *args], cwd=cwd, on_line=on_line)


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
