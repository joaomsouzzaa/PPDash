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
from fastapi.responses import StreamingResponse
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
# Cookies do Instagram (Netscape cookies.txt) para o yt-dlp baixar Reels que exigem login.
COOKIES_FILE = pathlib.Path(os.environ.get("YTDLP_COOKIES", str(OUTPUT_DIR.parent / "cookies.txt")))
# Worker GPU que remove a legenda queimada dos b-rolls (inpainting). Vazio = limpeza desligada.
VIDEO_CLEANER_URL = os.environ.get("VIDEO_CLEANER_URL", "").rstrip("/")
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


# Log de progresso ao vivo. Cada job roda no seu próprio processo (fork), então um
# estado global por processo é seguro (1 job por processo).
_JOBLOG = {"id": None, "linhas": [], "last": 0.0}


def _log_reset(job_id: str):
    _JOBLOG["id"] = job_id
    _JOBLOG["linhas"] = []
    _JOBLOG["last"] = 0.0


def _log(db: Client, job_id: str, msg: str, etapa: str | None = None):
    import time, datetime
    _JOBLOG["linhas"].append({"t": datetime.datetime.now().strftime("%H:%M:%S"), "msg": msg})
    upd = {"log": _JOBLOG["linhas"][-400:]}
    if etapa is not None:
        upd["etapa"] = etapa
    now = time.time()
    # grava sempre que muda a etapa; senão, no máximo a cada ~1.2s (não floodar o banco).
    if etapa is not None or now - _JOBLOG["last"] > 1.2:
        _JOBLOG["last"] = now
        try:
            db.table("video_jobs").update(upd).eq("id", job_id).execute()
        except Exception:
            pass


def set_etapa(db: Client, job_id: str, etapa: str):
    _log(db, job_id, etapa, etapa=etapa)


# ============================================================
# Fila (1 job por vez) + cancelamento (cada job roda em processo próprio, matável)
# ============================================================
import multiprocessing as _mp
import queue as _queue
import signal as _signal
import threading as _threading

_JOBQ: "_queue.Queue" = _queue.Queue()
_RUNNING: dict = {}            # job_id -> Process em execução
_CANCEL_QUEUED: set = set()    # jobs cancelados antes de iniciar
_LOCK = _threading.Lock()


def _worker(kind: str, job_id: str, args: tuple):
    try:
        os.setsid()  # grupo de processos próprio → dá pra matar a árvore (ffmpeg etc.)
    except Exception:
        pass
    if kind == "corte":
        processar_job(job_id, *args)
    elif kind == "completo":
        processar_edicao(job_id, *args)
    elif kind == "render":
        processar_render(job_id)
    elif kind == "montar":
        processar_montar(job_id, *args)


def _dispatcher():
    while True:
        kind, job_id, args = _JOBQ.get()
        with _LOCK:
            if job_id in _CANCEL_QUEUED:
                _CANCEL_QUEUED.discard(job_id)
                continue
        p = _mp.Process(target=_worker, args=(kind, job_id, args), daemon=True)
        with _LOCK:
            _RUNNING[job_id] = p
        p.start()
        p.join()
        with _LOCK:
            _RUNNING.pop(job_id, None)


_threading.Thread(target=_dispatcher, daemon=True).start()


def _recuperar_orfaos():
    """No boot, qualquer job 'processando'/'pendente' é órfão (o worker morreu com o reinício).
    Marca como erro para o usuário não ficar achando que está processando."""
    try:
        svc().table("video_jobs").update(
            {"status": "erro", "etapa": None, "erro": "Interrompido (serviço reiniciado). Reprocessar."}
        ).in_("status", ["processando", "pendente"]).execute()
    except Exception:
        pass


_recuperar_orfaos()


def enqueue(kind: str, job_id: str, *args):
    _JOBQ.put((kind, job_id, args))


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
    enqueue("corte", job_id, brief, org_id)
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
    enqueue("completo", job_id, brief, org_id)
    return {"ok": True, "job_id": job_id, "status": "processando"}


def _baixar_referencia(url: str, out_tmpl: str) -> str:
    """Baixa o vídeo com yt-dlp; usa cookies do Instagram (se houver) e tenta driblar o bloqueio.
    Retorna a mensagem de erro (string) em caso de falha; '' se ok."""
    import glob
    common = ["-f", "mp4/best", "-o", out_tmpl, "--no-warnings"]
    if COOKIES_FILE.exists():
        common += ["--cookies", str(COOKIES_FILE)]
    erro = ""
    for extra in (["--impersonate", "chrome"], []):  # 1ª tentativa com impersonate; fallback sem
        p = subprocess.run(["yt-dlp", *extra, *common, url], capture_output=True, text=True)
        if p.returncode == 0:
            return ""
        erro = (p.stderr or p.stdout or "").strip()
        if "impersonate" not in erro.lower():  # erro não é por causa do impersonate → não adianta repetir
            break
    return erro


@app.post("/analisar-referencia")
def analisar_referencia(body: dict, authorization: str = Header(default="")):
    """v3 Fase 3A (streaming NDJSON com progresso): baixa a referência, analisa e devolve
    roteiro + plano (ou resposta livre no modo watch)."""
    exigir_usuario(authorization)
    ref_url = (body or {}).get("ref_url")
    org_id = (body or {}).get("org_id")
    agente_slug = (body or {}).get("agente_slug")
    modo = (body or {}).get("modo") or "roteiro"
    pergunta = (body or {}).get("pergunta") or ""
    if not ref_url:
        raise HTTPException(400, "ref_url obrigatório")

    def gen():
        import base64, glob, threading, queue
        from transcribe_words import transcrever_words
        try:
            ref_id = str(uuid.uuid4())
            refdir = WORK_DIR / "ref" / ref_id
            framesdir = refdir / "frames"
            framesdir.mkdir(parents=True, exist_ok=True)

            yield json.dumps({"pct": 8, "etapa": "baixando vídeo", "log": "baixando o vídeo de referência"}) + "\n"
            erro = _baixar_referencia(ref_url, str(refdir / "ref.%(ext)s"))
            cand = glob.glob(str(refdir / "ref.*"))
            ref_file = next((c for c in cand if not c.endswith(".jpg")), None)
            if not ref_file:
                el = erro.lower()
                login = ("login" in el or "cookies" in el or "rate-limit" in el or "rate limit" in el
                         or "logged-in" in el or "logged in" in el or "empty media response" in el or "401" in el)
                ig = "instagram.com" in (ref_url or "").lower()
                if login and ig and COOKIES_FILE.exists():
                    msg = ("Os cookies do Instagram expiraram (ou foram invalidados). Reexporte o cookies.txt "
                           "logado no Instagram e me avise para reconfigurar na VPS — ou use um link público (YouTube/TikTok).")
                elif login:
                    msg = ("Esse Instagram exige login para baixar. Configure os cookies do Instagram na VPS (me avise) "
                           "ou tente um link público (YouTube/TikTok).")
                else:
                    msg = f"Falha ao baixar: {erro[-200:] or 'erro yt-dlp'}"
                yield json.dumps({"erro": msg}) + "\n"
                return

            yield json.dumps({"pct": 32, "etapa": "extraindo frames", "log": "extraindo frames do vídeo"}) + "\n"
            # Distribui ~32 frames pelo vídeo INTEIRO (antes pegava só os primeiros ~48s).
            N_FRAMES = 32
            dur_ref = _ffprobe_dur(pathlib.Path(ref_file))
            fps_expr = f"{N_FRAMES}/{dur_ref:.2f}" if dur_ref and dur_ref > 1 else "1/2"
            subprocess.run(
                ["ffmpeg", "-y", "-i", ref_file, "-vf", f"fps={fps_expr},scale=512:-2", "-frames:v", str(N_FRAMES), str(framesdir / "f%04d.jpg")],
                capture_output=True, text=True,
            )
            frames = sorted(glob.glob(str(framesdir / "*.jpg")))[:N_FRAMES]

            yield json.dumps({"pct": 45, "etapa": "transcrevendo áudio", "log": "transcrevendo o áudio (0%)"}) + "\n"
            # A transcrição (Whisper) é bloqueante e não pode dar yield de dentro do callback,
            # então roda numa thread e empurra o progresso por uma fila que o gerador drena.
            q: "queue.Queue" = queue.Queue()
            holder = {"transcript": {"segments": []}}

            def _transcrever():
                try:
                    holder["transcript"] = transcrever_words(
                        ref_file, on_progress=lambda pct: q.put(("prog", pct))
                    )
                except Exception:
                    holder["transcript"] = {"segments": []}
                finally:
                    q.put(("done", None))

            th = threading.Thread(target=_transcrever, daemon=True)
            th.start()
            while True:
                kind, payload = q.get()
                if kind == "done":
                    break
                # mapeia 0-100 da transcrição para a faixa visível 45→68 do pipeline geral
                pct_global = 45 + int(payload * 0.23)
                yield json.dumps({"pct": pct_global, "etapa": "transcrevendo áudio",
                                  "log": f"transcrevendo o áudio ({payload}%)"}) + "\n"
            th.join()
            transcript = holder["transcript"]
            transcript_txt = "\n".join(
                f"[{round(float(s.get('start',0)),1)}-{round(float(s.get('end',0)),1)}] {s.get('text','').strip()}"
                for s in transcript.get("segments", [])
            )

            yield json.dumps({"pct": 70, "etapa": "analisando com IA", "log": "a IA está assistindo e escrevendo o roteiro"}) + "\n"
            for linha in _analisar_claude(ref_id, ref_url, modo, pergunta, org_id, agente_slug, frames, transcript_txt):
                yield linha
        except Exception as e:
            yield json.dumps({"erro": str(e)[:300]}) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")


def _analisar_claude(ref_id, ref_url, modo, pergunta, org_id, agente_slug, frames, transcript_txt):
    import base64
    # 3) Persona do agente + base de conhecimento da org (mesmo padrão do agente-chat).
    db = svc()
    persona = ""
    if org_id:
        q = db.table("agentes").select("nome,system_prompt,slug").eq("org_id", org_id)
        ags = (q.execute().data) or []
        ag = next((a for a in ags if agente_slug and a.get("slug") == agente_slug), None) \
            or next((a for a in ags if "copy" in (a.get("slug") or a.get("nome") or "").lower()), None) \
            or (ags[0] if ags else None)
        if ag:
            persona = ag.get("system_prompt") or ""
    base_conh = ""
    if org_id:
        bc = (db.table("base_conhecimento").select("titulo,conteudo").eq("org_id", org_id).eq("ativo", True).execute().data) or []
        base_conh = "\n\n".join(f"## {b['titulo']}\n{b.get('conteudo','')}" for b in bc if (b.get("conteudo") or "").strip())

    base_vazia = not base_conh
    base_bloco = (
        "# Base de Conhecimento do cliente (a verdade sobre marca/produto/público — baseie-se nela)\n" + base_conh + "\n\n"
        if base_conh else
        "# Base de Conhecimento: VAZIA. Não invente dados do cliente; onde faltar, marque com [colchetes].\n\n"
    )

    # 4) Claude com visão.
    if modo == "watch":
        # Análise livre do vídeo (responde a pergunta), sem roteiro/card.
        sistema = (
            (persona + "\n\n" if persona else "") + base_bloco
            + "Você assiste a um vídeo (FRAMES + TRANSCRIÇÃO) e responde de forma clara e objetiva, em **markdown**, "
            "à pergunta do usuário sobre ele. Cite timestamps quando útil."
        )
        primeiro = f"Pergunta: {pergunta or 'Descreva o vídeo: estrutura, ganchos, ritmo e o que o torna bom.'}\n\nTRANSCRIÇÃO:\n{transcript_txt or '(sem fala)'}\n\nFrames a seguir:"
    else:
        sistema = (
            (persona + "\n\n" if persona else "") + base_bloco
            + "Você é um estrategista de Reels. Recebe FRAMES + TRANSCRIÇÃO de um vídeo de REFERÊNCIA e adapta para o cliente.\n"
            "Saída em DUAS partes, nesta ordem:\n"
            "1) O ROTEIRO em **markdown bem formatado** (NÃO use JSON aqui), no estilo:\n"
            "   - uma linha de contexto/premissa que você assumiu (e peça correção se necessário);\n"
            "   - título `## 🎬 ROTEIRO — ...`;\n"
            "   - blocos por tempo `**[mm:ss–mm:ss] — NOME DO BLOCO**` com `🎥 B-roll: ...`, `🗣️ \"fala...\"`, `📝 Texto na tela: **...**`;\n"
            "   - `### 📌 Legenda do post` e `### 📌 Notas de produção`.\n"
            "   REGRA CENTRAL DA ADAPTAÇÃO (siga à risca): NÃO invente uma história nova sobre o cliente e NÃO troque o caso da referência por outro caso. "
            "Você CONTA A MESMA HISTÓRIA/o MESMO CASO REAL da referência (mesmos fatos, mesma sequência: gancho → contexto → virada → lição), exatamente como no vídeo original. "
            "O CLIENTE só ENTRA na virada/lição e no CTA, como contraponto ou solução (\"agora pensa no contrário...\") — ele não vira o protagonista da história. "
            "Ex.: se a referência conta o caso de uma transmissão que pode ruir por depender de bets, você reconta ESSE caso e só no fim conecta com o cliente como o oposto estável. "
            "Mantenha a MESMA estrutura psicológica/ganchos E O MESMO ENREDO da referência; use a base de conhecimento do cliente apenas para a parte da virada/CTA (sem placeholders se houver base).\n"
            "2) Depois do roteiro, um ÚNICO bloco ```json com o plano de inserções (e NADA depois dele):\n"
            '```json\n{"insertion_plan":[{"ref_start":<s>,"ref_end":<s>,"tipo":"broll|print|image|overlay","descricao":"...","linha":"trecho da fala"}]}\n```'
        )
        primeiro = f"TRANSCRIÇÃO DA REFERÊNCIA:\n{transcript_txt or '(sem fala detectada)'}\n\nFrames a seguir (em ordem):"

    blocos = [{"type": "text", "text": primeiro}]
    for fp in frames:
        b64 = base64.b64encode(pathlib.Path(fp).read_bytes()).decode()
        blocos.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}})

    client = anthropic.Anthropic()
    resp = client.messages.create(model=MODEL, max_tokens=8000, system=sistema, messages=[{"role": "user", "content": blocos}])
    texto = "".join(b.text for b in resp.content if b.type == "text").strip()

    if modo == "watch":
        yield json.dumps({"pct": 100, "etapa": "concluído", "ok": True, "ref_id": ref_id,
                          "ref_url": ref_url, "resposta": texto, "base_vazia": base_vazia,
                          "log": "análise concluída"}) + "\n"
        return

    # Extrai o bloco ```json (insertion_plan); o resto é o roteiro em markdown.
    insertion_plan = []
    roteiro = texto
    m = re.search(r"```json\s*(\{.*?\})\s*```", texto, re.DOTALL)
    if m:
        try:
            insertion_plan = (json.loads(m.group(1)) or {}).get("insertion_plan", [])
        except Exception:
            insertion_plan = []
        roteiro = texto[:m.start()].strip()  # tudo antes do json = roteiro markdown
    yield json.dumps({
        "pct": 100, "etapa": "concluído", "ok": True, "ref_id": ref_id, "ref_url": ref_url,
        "roteiro": roteiro, "insertion_plan": insertion_plan,
        "transcript": transcript_txt, "base_vazia": base_vazia,
        "log": "roteiro e plano de inserções prontos",
    }) + "\n"


@app.post("/montar-edicao")
def montar_edicao(body: dict, authorization: str = Header(default="")):
    """v3 Fase 3B: a partir do bruto (Drive) + plano de inserções da referência, monta a edição
    (corte + clips alinhados) e cria um video_jobs em 'editar' para o humano validar no editor."""
    exigir_usuario(authorization)
    b = body or {}
    card_id = b.get("card_id")
    drive_url = b.get("drive_url")
    fonte = b.get("fonte_broll") or "literal"  # "literal" | "assets"
    org_id = b.get("org_id")
    if not card_id or not drive_url:
        raise HTTPException(400, "card_id e drive_url obrigatórios")

    db = svc()
    job_id = str(uuid.uuid4())
    db.table("video_jobs").insert({
        "id": job_id, "org_id": org_id, "nome": "Edição (referência)", "video_url": "",
        "status": "processando", "etapa": "na fila", "modo": "completo",
    }).execute()
    # guarda o job no card para abrir o editor depois
    row = db.table("tarefas").select("video_ref").eq("id", card_id).maybe_single().execute()
    vr = (row.data or {}).get("video_ref") or {}
    vr.update({"drive_url": drive_url, "job_id": job_id, "fonte_broll": fonte})
    db.table("tarefas").update({"video_ref": vr}).eq("id", card_id).execute()

    enqueue("montar", job_id, card_id, drive_url, fonte, org_id)
    return {"ok": True, "job_id": job_id}


@app.post("/upload-asset")
async def upload_asset(job_id: str = Form(...), file: UploadFile = File(...), authorization: str = Header(default="")):
    """Sobe uma mídia (ex.: música) para o dir de trabalho do job; devolve o caminho relativo."""
    exigir_usuario(authorization)
    assets_dir = WORK_DIR / job_id / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    ext = (pathlib.Path(file.filename or "").suffix or ".bin").lower()
    nome = f"{uuid.uuid4().hex}{ext}"
    with open(assets_dir / nome, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)
    return {"ok": True, "path": f"assets/{nome}"}


@app.get("/cookies-status")
def cookies_status(authorization: str = Header(default="")):
    """Diz se os cookies do Instagram estão configurados e quando foram atualizados (p/ a UI)."""
    exigir_usuario(authorization)
    import datetime
    if not COOKIES_FILE.exists():
        return {"configurado": False}
    mt = datetime.datetime.fromtimestamp(COOKIES_FILE.stat().st_mtime)
    return {"configurado": True, "atualizado_em": mt.isoformat(), "tem_sessao": "sessionid" in COOKIES_FILE.read_text(errors="replace")}


@app.post("/configurar-cookies")
async def configurar_cookies(file: UploadFile = File(...), authorization: str = Header(default="")):
    """Recebe o cookies.txt (Netscape) do Instagram pela UI e grava na VPS — sem precisar de SSH.
    Grava os BYTES exatos (preserva os tabs que o yt-dlp exige)."""
    exigir_usuario(authorization)
    data = await file.read()
    txt = data.decode("utf-8", errors="replace")
    if "sessionid" not in txt or "instagram" not in txt.lower():
        raise HTTPException(400, "Arquivo inválido: não parece um cookies.txt do Instagram logado (faltou 'sessionid').")
    COOKIES_FILE.parent.mkdir(parents=True, exist_ok=True)
    COOKIES_FILE.write_bytes(data)
    try:
        os.chmod(COOKIES_FILE, 0o600)
    except Exception:
        pass
    return {"ok": True}


@app.post("/cancelar")
def cancelar(body: dict, authorization: str = Header(default="")):
    """Interrompe um job (em execução ou na fila) e o marca como cancelado."""
    exigir_usuario(authorization)
    job_id = (body or {}).get("job_id")
    if not job_id:
        raise HTTPException(400, "job_id obrigatório")
    with _LOCK:
        p = _RUNNING.get(job_id)
        if p and p.is_alive():
            try:
                os.killpg(os.getpgid(p.pid), _signal.SIGKILL)  # mata o processo + filhos (ffmpeg)
            except Exception:
                try:
                    p.terminate()
                except Exception:
                    pass
            _RUNNING.pop(job_id, None)
        else:
            _CANCEL_QUEUED.add(job_id)  # ainda não começou: pula quando sair da fila
    svc().table("video_jobs").update(
        {"status": "erro", "etapa": None, "erro": "Cancelado pelo usuário"}
    ).eq("id", job_id).execute()
    return {"ok": True, "job_id": job_id}


@app.post("/renderizar")
def renderizar(background: BackgroundTasks, body: dict, authorization: str = Header(default="")):
    """Renderiza o vídeo final a partir da edição salva (editor_doc) de um job em 'editar'."""
    exigir_usuario(authorization)
    job_id = (body or {}).get("job_id")
    if not job_id:
        raise HTTPException(400, "job_id obrigatório")
    db = svc()
    db.table("video_jobs").update({"status": "processando", "etapa": "na fila", "erro": None}).eq("id", job_id).execute()
    enqueue("render", job_id)
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
    enqueue("completo" if modo == "completo" else "corte", job_id, brief, org_id)
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
def _packed_de_words(transcript: dict) -> str:
    """Texto 'frases [ini-fim]' a partir do transcript faster-whisper (entrada do gerar_ranges)."""
    linhas = []
    for s in transcript.get("segments", []):
        txt = (s.get("text") or "").strip()
        if not txt:
            continue
        linhas.append(f"[{round(float(s.get('start',0)),2)}-{round(float(s.get('end',0)),2)}] {txt}")
    return "\n".join(linhas)


def _snap_ranges(ranges: list, words: list, tol: float = 0.25, min_len: float = 0.4, merge_gap: float = 0.15) -> list:
    """Encaixa start/end dos cortes nos limites de palavra (sem meia-palavra), descarta cortes
    minúsculos e junta cortes quase colados (evita micro-cortes choppy)."""
    if not words:
        return ranges
    starts = sorted(float(w["start"]) for w in words if w.get("start") is not None)
    ends = sorted(float(w["end"]) for w in words if w.get("end") is not None)

    def nearest(v: float, arr: list) -> float:
        best, bd = v, tol
        for x in arr:
            d = abs(x - v)
            if d < bd:
                bd, best = d, x
        return best

    snapped = []
    for r in ranges:
        s = nearest(float(r["start"]), starts)
        e = nearest(float(r["end"]), ends)
        if e - s >= min_len:
            snapped.append({"start": round(s, 3), "end": round(e, 3)})
    snapped.sort(key=lambda r: r["start"])
    merged: list = []
    for r in snapped:
        if merged and r["start"] - merged[-1]["end"] < merge_gap:
            merged[-1]["end"] = max(merged[-1]["end"], r["end"])
        else:
            merged.append(dict(r))
    return merged or ranges


def _gerar_corte(db: Client, job_id: str, src: pathlib.Path, workdir: pathlib.Path,
                 out: pathlib.Path, prefixo: str = "", render_out: bool = True):
    """Decide os cortes por IA a partir da MESMA transcrição (faster-whisper) usada na legenda —
    fonte única, sem divergência de tempos. Se render_out, renderiza o cut em `out`.
    Retorna (edl, transcript). `prefixo` rotula a etapa."""
    from transcribe_words import transcrever_words
    editdir = workdir / "edit"
    editdir.mkdir(parents=True, exist_ok=True)

    set_etapa(db, job_id, f"{prefixo}transcrevendo áudio")
    transcript = transcrever_words(str(src), on_progress=lambda p: set_etapa(db, job_id, f"{prefixo}transcrevendo áudio ({p}%)"))
    words = [w for s in transcript.get("segments", []) for w in s.get("words", [])]

    set_etapa(db, job_id, f"{prefixo}decidindo cortes (IA)")
    ranges = gerar_ranges(_packed_de_words(transcript), "")
    ranges = _snap_ranges(ranges, words)
    stem = src.stem
    edl = {
        "sources": {stem: str(src)},
        "ranges": [{"source": stem, "start": r["start"], "end": r["end"]} for r in ranges],
    }
    edl_path = editdir / "edl.json"
    edl_path.write_text(json.dumps(edl), encoding="utf-8")

    if not render_out:
        return edl, transcript  # só as faixas (Fase 3 usa o original + ranges, não o cut renderizado)

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
    return edl, transcript


def processar_job(job_id: str, brief: str, org_id: str):
    """Modo 'corte': só remove pausas/vícios e entrega o vídeo cortado."""
    db = svc()
    _log_reset(job_id)
    src = input_path(job_id)
    workdir = pathlib.Path(tempfile.mkdtemp(prefix=f"vedit-{job_id}-"))
    try:
        out = OUTPUT_DIR / f"{job_id}.mp4"
        edl, _ = _gerar_corte(db, job_id, src, workdir, out)
        db.table("video_jobs").update({
            "status": "pronto", "etapa": "concluído",
            "resultado_url": f"{PUBLIC_BASE}/files/{job_id}.mp4", "edl": edl, "erro": None,
        }).eq("id", job_id).execute()
        # Mantém a entrada para permitir reprocessar; o usuário libera espaço pela lixeira.
    except Exception as e:
        _log(db, job_id, f"❌ erro: {str(e)[:300]}")
        db.table("video_jobs").update({"status": "erro", "etapa": None, "erro": str(e)[:500]}).eq("id", job_id).execute()
    finally:
        import shutil
        shutil.rmtree(workdir, ignore_errors=True)


OVERLAY_LAYOUTS = {"overlay_card", "split_horizontal", "image_fullscreen", "broll_fullscreen"}


def _timeline_para_clips(timeline: dict) -> list[dict]:
    """Deriva os clips de overlay (editáveis) a partir da timeline do planner."""
    clips = []
    n = 0
    for seg in timeline.get("segments", []):
        layout = seg.get("layout")
        asset = seg.get("asset")
        if asset and layout in OVERLAY_LAYOUTS:
            clips.append({"id": f"c{n}", "asset": asset, "layout": layout,
                          "start": float(seg["start"]), "end": float(seg["end"])})
            n += 1
    return clips


def _clips_para_timeline(doc: dict) -> dict:
    """Deriva a timeline (segmentos contíguos) a partir dos clips. Espelha clipsParaTimeline do front."""
    dur = float(doc.get("durationInSeconds") or 0)
    clips = sorted([c for c in doc.get("clips", []) if float(c["end"]) > float(c["start"])], key=lambda c: c["start"])
    segs = []
    cursor = 0.0
    for c in clips:
        start = max(cursor, float(c["start"]))
        end = min(dur, float(c["end"]))
        if end <= start:
            continue
        if start > cursor:
            segs.append({"start": cursor, "end": start, "layout": "talking_full", "asset": None})
        segs.append({"start": start, "end": end, "layout": c["layout"], "asset": c["asset"],
                     "cropY": c.get("cropY"), "crop": c.get("crop"), "splitRatio": c.get("splitRatio"),
                     "assetStart": c.get("assetStart"), "speed": 1, "assetSpeed": float(c.get("speed") or 1)})
        cursor = end
    if cursor < dur:
        segs.append({"start": cursor, "end": dur, "layout": "talking_full", "asset": None})
    if not segs:
        segs.append({"start": 0, "end": dur, "layout": "talking_full", "asset": None})
    return {"video": doc.get("video", "talking_head.mp4"), "fps": doc.get("fps", 30),
            "durationInSeconds": dur, "segments": segs, "stickers": []}


def _ffprobe_dur(path: pathlib.Path) -> float:
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
                           capture_output=True, text=True, check=True)
        return float(r.stdout.strip() or 0)
    except Exception:
        return 0.0


def _remap_transcript_saida(transcript: dict, ranges: list) -> dict:
    """Remapeia a transcrição do ORIGINAL para o tempo de SAÍDA (concatenação dos ranges).
    Usado pelo planner posicionar overlays no tempo de saída."""
    rs = [(float(r["start"]), float(r["end"])) for r in ranges if float(r["end"]) > float(r["start"])]
    out_segs = []
    cum = 0.0
    for (a, b) in rs:
        for s in transcript.get("segments", []):
            ss, se = float(s.get("start", 0)), float(s.get("end", 0))
            if se > a and ss < b:  # segmento cai dentro do range
                os_ = cum + (max(ss, a) - a)
                oe = cum + (min(se, b) - a)
                out_segs.append({"start": round(os_, 3), "end": round(oe, 3), "text": s.get("text", "")})
        cum += (b - a)
    return {"segments": out_segs}


def _montar_timeline(doc: dict):
    """Fase 3: monta a timeline de SAÍDA a partir de videoSegments + overlays e remapeia words.
    Fallback p/ v2 quando não há videoSegments. Retorna (timeline, words_saida)."""
    vsegs = [v for v in (doc.get("videoSegments") or []) if float(v["sourceEnd"]) > float(v["sourceStart"])]
    if not vsegs:
        return _clips_para_timeline(doc), doc.get("words", [])
    fps = doc.get("fps", 30)
    overlays = sorted([c for c in doc.get("clips", []) if float(c["end"]) > float(c["start"])], key=lambda c: c["start"])

    def ov_em(t):
        for o in overlays:
            if float(o["start"]) <= t < float(o["end"]):
                return o
        return None

    mapped = []
    out = 0.0
    for v in vsegs:
        spd = float(v.get("speed") or 1) or 1  # velocidade do vídeo principal neste trecho
        out_len = (float(v["sourceEnd"]) - float(v["sourceStart"])) / spd  # encurtamento CapCut: saída = fonte/velocidade
        mapped.append({"outStart": out, "outEnd": out + out_len, "sourceStart": float(v["sourceStart"]), "speed": spd})
        out += out_len
    dur = out
    segs = []
    for m in mapped:
        pts = {m["outStart"], m["outEnd"]}
        for o in overlays:
            if m["outStart"] < float(o["start"]) < m["outEnd"]: pts.add(float(o["start"]))
            if m["outStart"] < float(o["end"]) < m["outEnd"]: pts.add(float(o["end"]))
        ordp = sorted(pts)
        for i in range(len(ordp) - 1):
            a, b = ordp[i], ordp[i + 1]
            if b - a < 0.02: continue
            ov = ov_em((a + b) / 2)
            a_spd = float(ov.get("speed") or 1) or 1 if ov else 1
            ss = m["sourceStart"] + (a - m["outStart"]) * m["speed"]  # tempo-fonte avança na velocidade do trecho
            segs.append({"start": round(ss, 3), "end": round(ss + (b - a), 3),
                         "layout": ov["layout"] if ov else "talking_full", "asset": ov["asset"] if ov else None,
                         "cropY": ov.get("cropY") if ov else None,
                         "crop": ov.get("crop") if ov else None, "splitRatio": ov.get("splitRatio") if ov else None,
                         "assetStart": (float(ov.get("assetStart") or 0) + (a - float(ov["start"])) * a_spd) if ov else None,
                         "speed": m["speed"], "assetSpeed": a_spd})
    if not segs:
        segs = [{"start": 0, "end": max(0.1, dur), "layout": "talking_full", "asset": None}]
    words = []
    for w in doc.get("words", []):
        for m in mapped:
            v_end = m["sourceStart"] + (m["outEnd"] - m["outStart"]) * m["speed"]  # fim do trecho em tempo-fonte
            if m["sourceStart"] <= float(w["start"]) < v_end:
                os_ = m["outStart"] + (float(w["start"]) - m["sourceStart"]) / m["speed"]
                oe = m["outStart"] + (min(float(w["end"]), v_end) - m["sourceStart"]) / m["speed"]
                words.append({"word": w["word"], "start": round(os_, 3), "end": round(max(os_ + 0.05, oe), 3)})
                break
    return {"video": doc.get("video", "original.mp4"), "fps": fps, "durationInSeconds": dur,
            "segments": segs, "stickers": []}, words


def processar_edicao(job_id: str, brief: str, org_id: str):
    """Modo 'completo' — FASE PREPARAR: corte → transcrição → planner (rascunho). NÃO renderiza.
    Salva o editor_doc em video_jobs.timeline e deixa o job em status 'editar' para o usuário ajustar."""
    import shutil
    from transcribe_words import transcrever_words
    from planner import gerar_timeline

    db = svc()
    _log_reset(job_id)
    src = input_path(job_id)
    workdir = pathlib.Path(tempfile.mkdtemp(prefix=f"vedit-{job_id}-"))
    workjob = WORK_DIR / job_id
    try:
        workjob.mkdir(parents=True, exist_ok=True)

        # 1) Corte por IA → FAIXAS (tempo do ORIGINAL) + transcrição (fonte única p/ legenda). NÃO renderiza o cut.
        edl, transcript = _gerar_corte(db, job_id, src, workdir, workjob / "_x.mp4", prefixo="", render_out=False)
        ranges = edl.get("ranges", [])
        if not ranges:
            raise RuntimeError("Não consegui obter as faixas de corte")
        words = [w for s in transcript.get("segments", []) for w in s.get("words", [])]

        # 2) O ORIGINAL é a base do editor (servido em /work) + proxy leve + duração.
        set_etapa(db, job_id, "preparando preview")
        orig = workjob / "original.mp4"
        shutil.copyfile(str(src), str(orig))
        prev_ok = _proxy_preview(orig, workjob / "original_preview.mp4")
        original_dur = _ffprobe_dur(orig)

        # 4) Planner no transcript de SAÍDA (palavras dentro das faixas) → overlays no tempo de saída.
        set_etapa(db, job_id, "planejando layouts")
        meta = []
        meta_path = workjob / "assets_meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8") or "[]")
        assets_list = [{"id": m.get("id"), "tipo": m.get("tipo"), "descricao": m.get("descricao")} for m in meta if m.get("id")]
        assets_map = {m["id"]: f"assets/{pathlib.Path(m.get('filename','')).name}" for m in meta if m.get("id") and m.get("filename")}
        out_transcript = _remap_transcript_saida(transcript, ranges)
        timeline = gerar_timeline(out_transcript, assets_list, "original.mp4", brief)

        video_segments = [{"id": f"v{i}", "sourceStart": float(r["start"]), "sourceEnd": float(r["end"])} for i, r in enumerate(ranges)]
        dur_out = sum(float(r["end"]) - float(r["start"]) for r in ranges)
        editor_doc = {
            "clips": _timeline_para_clips(timeline),
            "words": words,
            "assets": assets_map,
            "video": "original.mp4",
            "videoPreview": "original_preview.mp4" if prev_ok else "original.mp4",
            "fps": int(timeline.get("fps", 30)) or 30,
            "durationInSeconds": dur_out,
            "videoSegments": video_segments,
            "originalDuration": original_dur,
        }
        db.table("video_jobs").update({
            "status": "editar", "etapa": None, "timeline": editor_doc, "erro": None,
        }).eq("id", job_id).execute()
        # Mantém entrada + /work (original + assets) para o editor e o render.
    except Exception as e:
        _log(db, job_id, f"❌ erro: {str(e)[:300]}")
        db.table("video_jobs").update({"status": "erro", "etapa": None, "erro": str(e)[:500]}).eq("id", job_id).execute()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _proxy_preview(cut: pathlib.Path, dest: pathlib.Path) -> bool:
    """Gera o proxy leve (preview fluido). Retorna True se ok."""
    try:
        # ALL-INTRA (keyframe em todo frame): cada corte/overlay faz um seek no proxy; com
        # keyframe a cada frame o seek é instantâneo → preview roda liso, sem repetir frames.
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(cut), "-vf", "scale=480:-2", "-r", "30", "-c:v", "libx264",
             "-preset", "veryfast", "-tune", "fastdecode", "-crf", "30",
             "-g", "1", "-keyint_min", "1", "-sc_threshold", "0",
             "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "96k", str(dest)],
            capture_output=True, text=True, check=True,
        )
        return True
    except Exception:
        return False


def _alinhar_insercoes(insertion_plan: list, transcript_ref: str, transcript_novo: str) -> list:
    """Alinha as inserções da referência ao vídeo NOVO comparando as DUAS transcrições
    (o roteiro novo segue a mesma sequência da referência) e classifica o layout de cada b-roll."""
    if not insertion_plan:
        return []
    client = anthropic.Anthropic()
    sistema = (
        "Você monta a edição de um vídeo NOVO espelhando um vídeo de REFERÊNCIA. O roteiro do novo segue a "
        "MESMA sequência/sentido da referência. Recebe: (a) PLANO DE INSERÇÕES da referência (cada item tem "
        "ref_start/ref_end, tipo, descrição e a 'linha' falada), (b) TRANSCRIÇÃO da REFERÊNCIA e (c) TRANSCRIÇÃO "
        "do vídeo NOVO (frases com [início-fim] em s). Para CADA inserção, ache no vídeo NOVO o trecho equivalente "
        "(casando o sentido da 'linha'/conteúdo entre as duas transcrições) e devolva start/end NO TEMPO DO NOVO. "
        "Inclua TODAS as inserções (não pule b-rolls). Classifique o 'layout' observando como aparece na referência:\n"
        "- 'broll_full' = b-roll ocupa a tela toda;\n- 'split_top' = b-roll na METADE DE CIMA (pessoa embaixo);\n"
        "- 'split_bottom' = b-roll na METADE DE BAIXO (pessoa em cima);\n- 'print' = print/card; - 'image' = imagem cheia.\n"
        "Responda APENAS JSON (copie a 'linha' falada correspondente do vídeo NOVO, p/ ancoragem precisa): "
        '{"clips":[{"start":<s>,"end":<s>,"layout":"broll_full|split_top|split_bottom|print|image","descricao":"...","linha":"trecho falado no NOVO","ref_start":<s>,"ref_end":<s>}]}'
    )
    user = (f"PLANO DE INSERÇÕES (referência):\n{json.dumps(insertion_plan, ensure_ascii=False)}\n\n"
            f"TRANSCRIÇÃO DA REFERÊNCIA:\n{transcript_ref or '(indisponível)'}\n\n"
            f"TRANSCRIÇÃO DO VÍDEO NOVO:\n{transcript_novo}")
    resp = client.messages.create(model=MODEL, max_tokens=8000, system=sistema,
                                  messages=[{"role": "user", "content": user}])
    txt = "".join(b.text for b in resp.content if b.type == "text").strip()
    if txt.startswith("```"):
        txt = txt.split("```", 2)[1].lstrip("json").strip()
    try:
        return (json.loads(txt) or {}).get("clips", [])
    except Exception:
        return []


def _norm_txt(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w\s]", " ", s.lower())


def _ancorar_no_texto(words_saida: list, linha: str):
    """Acha a sequência de palavras de `linha` nas words de SAÍDA e devolve (start,end) reais.
    Garante que o b-roll entre EXATAMENTE quando a fala correspondente acontece. None se não casar."""
    alvo = _norm_txt(linha).split()
    if len(alvo) < 2 or not words_saida:
        return None
    toks = [(_norm_txt(w.get("word", "")), float(w.get("start", 0)), float(w.get("end", 0))) for w in words_saida]
    toks = [t for t in toks if t[0]]
    palavras = [t[0] for t in toks]
    n = len(alvo)
    melhor_i, melhor_score = -1, 0.0
    for i in range(0, max(0, len(palavras) - n) + 1):
        janela = palavras[i:i + n]
        if not janela:
            continue
        acertos = sum(1 for a, b in zip(alvo, janela) if a == b or a in b or b in a)
        score = acertos / n
        if score > melhor_score:
            melhor_score, melhor_i = score, i
    if melhor_i < 0 or melhor_score < 0.5:  # match fraco → deixa o LLM decidir
        return None
    j = min(melhor_i + n - 1, len(toks) - 1)
    return round(toks[melhor_i][1], 3), round(toks[j][2], 3)


def _limpar_legenda(clip: pathlib.Path) -> bool:
    """Envia o clip ao worker GPU (VIDEO_CLEANER_URL) que remove a legenda queimada por inpainting
    e sobrescreve o arquivo com a versão limpa. Best-effort: se não houver worker ou falhar,
    mantém o clip original e retorna False (não quebra o job)."""
    if not VIDEO_CLEANER_URL or not clip.exists():
        return False
    import httpx
    try:
        with open(clip, "rb") as fh:
            resp = httpx.post(
                f"{VIDEO_CLEANER_URL}/limpar-legenda",
                files={"file": (clip.name, fh, "video/mp4")},
                timeout=600.0,
            )
        resp.raise_for_status()
        data = resp.content
        if not data or len(data) < 1000:
            return False
        clip.write_bytes(data)
        return True
    except Exception:
        return False


def _queries_youtube(alinhados: list, brief: str = "") -> dict:
    """IA transforma a descrição de cada inserção numa busca curta de YouTube (termos visuais
    concretos). Retorna {i: "query"}. Fallback: usa a própria descrição."""
    fallback = {i: (a.get("descricao") or a.get("linha") or "").strip() for i, a in enumerate(alinhados)}
    itens = [{"i": i, "descricao": a.get("descricao", ""), "linha": a.get("linha", "")} for i, a in enumerate(alinhados)]
    if not itens:
        return {}
    try:
        client = anthropic.Anthropic()
        system = (
            "Para CADA inserção de b-roll, gere uma BUSCA de YouTube que encontre um vídeo de IMAGEM "
            "ILUSTRATIVA (b-roll/stock footage) do que está sendo dito. Regras:\n"
            "- 3 a 6 palavras VISUAIS concretas (objetos, lugares, ações), de preferência em INGLÊS (acha mais stock).\n"
            "- SEMPRE termine com 'stock footage' ou 'b roll' (ex.: 'stock market crash red graph b roll').\n"
            "- Prefira imagens CINEMATOGRÁFICAS, sem pessoas falando à câmera e sem texto na tela.\n"
            "- Evite nomes próprios pouco conhecidos.\n"
            "Responda APENAS JSON: {\"queries\":[{\"i\":<int>,\"q\":\"...\"}]}"
        )
        user = json.dumps({"brief": brief, "insercoes": itens}, ensure_ascii=False)
        resp = client.messages.create(model=MODEL, max_tokens=2000, system=system,
                                      messages=[{"role": "user", "content": user}])
        txt = "".join(b.text for b in resp.content if b.type == "text").strip()
        if txt.startswith("```"):
            txt = txt.split("```", 2)[1].lstrip("json").strip()
        out = dict(fallback)
        for it in (json.loads(txt) or {}).get("queries", []):
            q = (it.get("q") or "").strip()
            if q:
                out[int(it["i"])] = q
        return out
    except Exception:
        return fallback


def _youtube_broll(query: str, out_path: pathlib.Path, dur_alvo: float, crop_vf: str = "") -> bool:
    """Busca no YouTube, baixa um trecho leve do 1º resultado que funcionar e recorta para dur_alvo.
    Sem cookies (é YouTube). Retorna True se gerou o arquivo."""
    if not query:
        return False
    try:
        # busca mais resultados com a duração, p/ priorizar clipes CURTOS (cara de b-roll/stock).
        p = subprocess.run(["yt-dlp", "--flat-playlist", "--print", "%(id)s|%(duration)s", f"ytsearch8:{query}"],
                           capture_output=True, text=True, timeout=60)
    except Exception:
        return False
    cands = []
    for l in (p.stdout or "").splitlines():
        l = l.strip()
        if "|" not in l:
            continue
        vid, dur = l.split("|", 1)
        try:
            d = float(dur)
        except ValueError:
            d = 9999.0  # duração desconhecida vai pro fim
        if vid and d >= dur_alvo and d <= 300:  # ignora longos demais (>5min) e curtos que não cobrem o trecho
            cands.append((d, vid.strip()))
    cands.sort(key=lambda x: x[0])  # mais curtos primeiro
    ids = [v for _, v in cands][:4]
    if not ids:  # fallback: aceita qualquer resultado se o filtro zerou
        ids = [l.split("|", 1)[0].strip() for l in (p.stdout or "").splitlines() if l.strip()][:4]
    sec_end = 8 + max(6, int(dur_alvo) + 6)
    for vid in ids:
        raw = out_path.parent / f"raw_{vid}.mp4"
        base = ["yt-dlp", f"https://www.youtube.com/watch?v={vid}", "--no-playlist",
                "-f", "mp4[height<=720]/best[height<=720]/best", "-o", str(raw)]
        for extra in ([f"--download-sections", f"*8-{sec_end}", "--force-keyframes-at-cuts"], []):
            try:
                subprocess.run(base + extra, capture_output=True, text=True, timeout=180)
            except Exception:
                continue
            if raw.exists() and raw.stat().st_size > 10000:
                break
        if not (raw.exists() and raw.stat().st_size > 10000):
            continue
        vf = (crop_vf + "," if crop_vf else "") + "scale='min(1080,iw)':-2"
        try:
            subprocess.run(["ffmpeg", "-y", "-ss", "0", "-t", str(max(1.0, dur_alvo)), "-i", str(raw), "-an",
                            "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
                            "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-movflags", "+faststart", str(out_path)],
                           capture_output=True, text=True, timeout=120)
        except Exception:
            pass
        raw.unlink(missing_ok=True)
        if out_path.exists() and out_path.stat().st_size > 10000:
            return True
    return False


def processar_montar(job_id: str, card_id: str, drive_url: str, fonte: str, org_id: str):
    """3B: baixa o bruto do Drive, corta, transcreve, alinha o plano da referência e monta os clips."""
    import shutil, glob
    from transcribe_words import transcrever_words

    db = svc()
    _log_reset(job_id)
    src = input_path(job_id)
    workdir = pathlib.Path(tempfile.mkdtemp(prefix=f"vedit-{job_id}-"))
    workjob = WORK_DIR / job_id
    assets_dir = workjob / "assets"
    try:
        assets_dir.mkdir(parents=True, exist_ok=True)

        # 1) Baixa o bruto do Drive. Extrai o ID do link e baixa por ID (compatível com qualquer gdown).
        set_etapa(db, job_id, "baixando gravação")
        import gdown
        mid = re.search(r"/d/([A-Za-z0-9_-]+)", drive_url) or re.search(r"[?&]id=([A-Za-z0-9_-]+)", drive_url)
        try:
            if mid:
                gdown.download(id=mid.group(1), output=str(src), quiet=True)
            else:
                gdown.download(url=drive_url, output=str(src), quiet=True)
        except Exception as e:
            raise RuntimeError(f"Falha ao baixar do Drive: {str(e)[:150]}. O link precisa ser 'qualquer pessoa com o link'.")
        if not src.exists() or src.stat().st_size < 1000:
            raise RuntimeError("Download do Drive vazio — confira se o link é público ('qualquer pessoa com o link').")

        # 2) Faixas de corte + transcrição (fonte única) + proxy. Fase 3: usa o ORIGINAL + faixas.
        edl, transcript = _gerar_corte(db, job_id, src, workdir, workjob / "_x.mp4", prefixo="", render_out=False)
        ranges = edl.get("ranges", [])
        if not ranges:
            raise RuntimeError("Não consegui obter as faixas de corte")
        set_etapa(db, job_id, "preparando preview")
        orig = workjob / "original.mp4"
        shutil.copyfile(str(src), str(orig))
        prev_ok = _proxy_preview(orig, workjob / "original_preview.mp4")
        original_dur = _ffprobe_dur(orig)
        words = [w for s in transcript.get("segments", []) for w in s.get("words", [])]
        # transcrição de SAÍDA (palavras dentro das faixas) para alinhar os b-rolls no tempo de saída
        out_transcript = _remap_transcript_saida(transcript, ranges)
        transcript_txt = "\n".join(
            f"[{round(float(s.get('start',0)),1)}-{round(float(s.get('end',0)),1)}] {s.get('text','').strip()}"
            for s in out_transcript.get("segments", [])
        )

        # 3) Carrega o plano da referência (do card) e alinha ao vídeo novo
        set_etapa(db, job_id, "alinhando inserções")
        row = db.table("tarefas").select("video_ref").eq("id", card_id).maybe_single().execute()
        vr = (row.data or {}).get("video_ref") or {}
        plano = vr.get("insertion_plan") or []
        ref_id = vr.get("ref_id")
        alinhados = _alinhar_insercoes(plano, vr.get("transcript") or "", transcript_txt)

        # words em tempo de SAÍDA (p/ ancorar cada inserção EXATAMENTE na fala correspondente)
        dur_out = sum(float(r["end"]) - float(r["start"]) for r in ranges)
        _mapped, _o = [], 0.0
        for r in ranges:
            _a, _b = float(r["start"]), float(r["end"]); _mapped.append((_a, _b, _o)); _o += (_b - _a)
        words_saida = []
        for w in words:
            ws, we = float(w.get("start", 0)), float(w.get("end", 0))
            for (a_, b_, o_) in _mapped:
                if a_ <= ws < b_:
                    os_ = o_ + (ws - a_); oe = o_ + (min(we, b_) - a_)
                    words_saida.append({"word": w.get("word", ""), "start": round(os_, 3), "end": round(max(os_ + 0.05, oe), 3)})
                    break

        # 4) Monta clips + assets. Layout pela classificação; b-roll split é recortado na metade certa.
        LAY = {"broll_full": "broll_fullscreen", "broll": "broll_fullscreen", "split_top": "split_horizontal",
               "split_bottom": "split_bottom", "overlay": "split_horizontal", "print": "overlay_card", "image": "image_fullscreen"}
        CROP = {"split_top": "crop=in_w:in_h/2:0:0", "split_bottom": "crop=in_w:in_h/2:0:in_h/2"}
        clips, assets_map = [], {}
        ref_glob = glob.glob(str(WORK_DIR / "ref" / str(ref_id) / "ref.*")) if ref_id else []
        ref_file = next((c for c in ref_glob if not c.endswith(".jpg")), None)
        # fonte "youtube": gera as buscas (IA) uma vez; cada inserção baixa um b-roll relevante.
        queries = _queries_youtube(alinhados, "") if fonte == "youtube" else {}
        for i, a in enumerate(alinhados):
            tipo = a.get("layout") or a.get("tipo") or "broll_full"
            layout = LAY.get(tipo, "broll_fullscreen")
            asset_id = None
            if fonte == "literal" and ref_file and a.get("ref_start") is not None:
                out = assets_dir / f"ins{i}.mp4"
                rs, re_ = float(a["ref_start"]), float(a.get("ref_end", a["ref_start"]) or a["ref_start"])
                if re_ > rs:
                    # recorta a metade do b-roll (split_top/bottom) ou pega cheio; encode leve p/ preview fluido.
                    vf = (CROP[tipo] + "," if tipo in CROP else "") + "scale='min(1080,iw)':-2"
                    subprocess.run(["ffmpeg", "-y", "-ss", str(rs), "-to", str(re_), "-i", ref_file, "-an",
                                    "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
                                    "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-movflags", "+faststart", str(out)],
                                   capture_output=True, text=True)
                    if out.exists():
                        # Remove a legenda queimada do vídeo de referência (best-effort, GPU).
                        if VIDEO_CLEANER_URL:
                            set_etapa(db, job_id, "limpando legenda dos b-rolls")
                            if not _limpar_legenda(out):
                                _log(db, job_id, f"⚠️ não consegui limpar a legenda do b-roll ins{i} (mantendo original)")
                        asset_id = f"ins{i}"
                        assets_map[asset_id] = f"assets/ins{i}.mp4"
            elif fonte == "youtube":
                set_etapa(db, job_id, f"buscando b-roll {i + 1}/{len(alinhados)}")
                out = assets_dir / f"ins{i}.mp4"
                dur_alvo = float(a.get("end", 0) or 0) - float(a.get("start", 0) or 0)
                dur_alvo = max(2.0, min(6.0, dur_alvo or 4.0))
                if _youtube_broll(queries.get(i, ""), out, dur_alvo, CROP.get(tipo, "")):
                    asset_id = f"ins{i}"
                    assets_map[asset_id] = f"assets/ins{i}.mp4"
            # ancoragem determinística pela fala; fallback no start/end do LLM. + clamp/dur mín/máx.
            start = float(a.get("start", 0) or 0); end = float(a.get("end", 0) or 0)
            anc = _ancorar_no_texto(words_saida, a.get("linha") or a.get("descricao") or "")
            if anc:
                start, end = anc
            start = max(0.0, min(start, dur_out))
            end = min(max(start + 1.5, end), dur_out)
            end = min(end, start + 6.0)
            clips.append({
                "id": f"c{i}", "asset": asset_id, "layout": layout,
                "start": round(start, 3), "end": round(end, 3),
                "descricao": a.get("descricao", ""),
            })
        # ordena e evita sobreposição (empurra o início pro fim do anterior)
        clips = [c for c in clips if c["end"] - c["start"] >= 0.3]
        clips.sort(key=lambda c: c["start"])
        for i in range(1, len(clips)):
            if clips[i]["start"] < clips[i - 1]["end"]:
                clips[i]["start"] = round(clips[i - 1]["end"], 3)
        clips = [c for c in clips if c["end"] - c["start"] >= 0.3]

        video_segments = [{"id": f"v{i}", "sourceStart": float(r["start"]), "sourceEnd": float(r["end"])} for i, r in enumerate(ranges)]
        editor_doc = {
            "clips": clips, "words": words, "assets": assets_map,
            "video": "original.mp4",
            "videoPreview": "original_preview.mp4" if prev_ok else "original.mp4",
            "fps": 30,
            "durationInSeconds": dur_out,
            "videoSegments": video_segments,
            "originalDuration": original_dur,
        }
        db.table("video_jobs").update({"status": "editar", "etapa": None, "timeline": editor_doc, "erro": None}).eq("id", job_id).execute()
    except Exception as e:
        _log(db, job_id, f"❌ erro: {str(e)[:300]}")
        db.table("video_jobs").update({"status": "erro", "etapa": None, "erro": str(e)[:500]}).eq("id", job_id).execute()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def processar_render(job_id: str):
    """FASE RENDER: lê o editor_doc (clips) do banco, deriva a timeline e renderiza o vídeo final."""
    db = svc()
    _log_reset(job_id)
    workjob = WORK_DIR / job_id
    try:
        row = db.table("video_jobs").select("timeline").eq("id", job_id).maybe_single().execute()
        doc = (row.data or {}).get("timeline")
        if not doc or "clips" not in doc:
            raise RuntimeError("Edição não encontrada para este job")
        timeline, out_words = _montar_timeline(doc)   # Fase 3: monta dos cortes + remapeia legendas (fallback v2)
        props = {"timeline": timeline, "words": out_words, "assets": doc.get("assets", {}),
                 "mediaBase": f"{INTERNAL_BASE}/work/{job_id}"}
        if doc.get("captionStyle"):
            props["captionStyle"] = doc["captionStyle"]
        if doc.get("videoVolume") is not None:
            props["videoVolume"] = doc["videoVolume"]
        if doc.get("music"):
            props["music"] = doc["music"]
        if doc.get("musicClips"):
            props["musicClips"] = doc["musicClips"]
        if doc.get("texts"):
            props["texts"] = doc["texts"]
        props_path = workjob / "props.json"
        props_path.write_text(json.dumps(props), encoding="utf-8")

        set_etapa(db, job_id, "renderizando vídeo")
        out = OUTPUT_DIR / f"{job_id}.mp4"
        _render_remotion(db, job_id, props_path, out)
        if not out.exists():
            raise RuntimeError("Remotion não gerou o vídeo final")

        db.table("video_jobs").update({
            "status": "pronto", "etapa": "concluído",
            "resultado_url": f"{PUBLIC_BASE}/files/{job_id}.mp4", "erro": None,
        }).eq("id", job_id).execute()
    except Exception as e:
        # volta para 'editar' para o usuário tentar de novo / ajustar
        _log(db, job_id, f"❌ erro no render: {str(e)[:300]}")
        db.table("video_jobs").update({"status": "editar", "etapa": None, "erro": str(e)[:500]}).eq("id", job_id).execute()


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
