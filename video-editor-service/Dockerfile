# Serviço de vídeo (PPDash → Growth → Vídeo Editor).
# Inclui FFmpeg + video-use (corte), faster-whisper (legendas) e Remotion+Node+Chromium (edição).
FROM python:3.11-slim

# FFmpeg, git e dependências do Chromium headless (Remotion)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git curl ca-certificates \
    libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Node 20 (para o Remotion)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# video-use (pipeline de corte)
RUN git clone --depth 1 https://github.com/browser-use/video-use /app/video-use \
    && pip install --no-cache-dir -e /app/video-use
ENV VIDEO_USE_DIR=/app/video-use

# Dependências Python do serviço (inclui faster-whisper)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pré-baixa o modelo do faster-whisper (evita download no 1º job). 'medium' = melhor sincronia PT.
ENV WHISPER_MODEL=medium
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8')"

# Projeto Remotion (renderizador da edição) + Chromium do Remotion.
# Instala deps a partir do package.json primeiro (cacheado), depois copia o código —
# assim mudanças em src/ não re-rodam o npm install.
COPY remotion/package.json /app/remotion/package.json
RUN cd /app/remotion && npm install --no-audit --no-fund && npx remotion browser ensure
COPY remotion/ /app/remotion/
ENV REMOTION_DIR=/app/remotion

COPY main.py transcribe_words.py planner.py ./
COPY planner/ /app/planner/

# Anti-bot do YouTube (IP de datacenter): Deno (runtime JS p/ resolver o desafio "n"/nsig) +
# plugin bgutil (provider de PO Token, fala com o container `bgutil-pot` na rede `vidnet`).
# Ver _yt_anti_bot() em main.py. Fica no fim p/ não invalidar as camadas caras acima (whisper/remotion).
RUN apt-get update && apt-get install -y --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y \
    && pip install --no-cache-dir -U bgutil-ytdlp-pot-provider

ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
