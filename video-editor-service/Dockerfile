# Serviço de cortes de vídeo (PPDash → Growth → Vídeo Editor).
# Inclui FFmpeg e o repo browser-use/video-use já instalado.
FROM python:3.11-slim

# FFmpeg + git (para clonar o video-use)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clona e instala o video-use (pipeline transcribe/pack/render)
RUN git clone --depth 1 https://github.com/browser-use/video-use /app/video-use \
    && pip install --no-cache-dir -e /app/video-use
ENV VIDEO_USE_DIR=/app/video-use

# Dependências do serviço
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# As secrets (ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, SUPABASE_*) entram por env no deploy.
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
