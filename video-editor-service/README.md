# Vídeo Editor Service (PPDash)

Serviço Python (FastAPI) que faz **cortes de vídeo por IA** para a página Growth → **Vídeo Editor**.
Reaproveita o pipeline do repo [browser-use/video-use](https://github.com/browser-use/video-use)
(Python + FFmpeg) e usa o Claude (`claude-opus-4-8`) para decidir os cortes.

## Como funciona

```
POST /cortar { job_id, video_url, brief, org_id }   (Authorization: Bearer <supabase access_token>)
  → valida o usuário no Supabase Auth
  → video_jobs.status = processando
  → background:
       download do vídeo
       helpers/transcribe.py        → transcrição (ElevenLabs Scribe)
       helpers/pack_transcripts.py  → takes_packed.md
       Claude (claude-opus-4-8)     → edl.json (decisão de corte)
       helpers/render.py edl.json   → final.mp4 (FFmpeg)
       upload no bucket video-editor + video_jobs.status = pronto (ou erro)
```

A página faz polling em `video_jobs` (Supabase) até `status = pronto` e mostra o vídeo cortado.

## Setup

1. Pré-requisitos: **Python 3.11+**, **FFmpeg** no PATH, e disco temporário.
2. Instalar o video-use:
   ```bash
   git clone https://github.com/browser-use/video-use
   cd video-use && uv sync   # ou: pip install -e .
   cd ..
   ```
   Aponte `VIDEO_USE_DIR` para essa pasta.
3. Dependências do serviço:
   ```bash
   pip install -r requirements.txt
   ```
4. Copie `.env.example` para `.env` e preencha as chaves (`ANTHROPIC_API_KEY`,
   `ELEVENLABS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
5. Rodar:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8080
   ```

## Frontend

Defina no build do PPDash:
```
VITE_VIDEO_EDITOR_URL=https://<url-do-servico>
```

## Deploy

Container (Railway / Render / Fly.io / VM) com FFmpeg instalado. Processamento é assíncrono
(background task), então a página responde rápido e acompanha o status pelo banco.

## Notas

- O `render.py` do video-use espera o EDL com cortes em **limites de palavra**, **padding de
  30–200ms** nas bordas e aplica **fades de 30ms** — o prompt do EDL já instrui o modelo a respeitar
  isso. Se a versão do video-use usar um schema de EDL diferente, ajuste `gerar_edl()` em `main.py`.
- 1ª versão: apenas cortes. Subtítulos, color grading e overlays ficam para versões futuras.
