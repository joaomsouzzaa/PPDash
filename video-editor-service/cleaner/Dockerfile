# Worker GPU para remover legenda queimada dos b-rolls (inpainting via VSR).
# Requer host com GPU NVIDIA + nvidia-container-toolkit. NÃO usar na VPS CPU.
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
        git python3 python3-pip ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

# video-subtitle-remover: detecção automática da legenda + inpainting (STTN/LAMA/ProPainter).
RUN git clone --depth 1 https://github.com/YaoFANGUK/video-subtitle-remover.git vsr
WORKDIR /opt/vsr
RUN pip3 install --no-cache-dir -r requirements.txt

# App FastAPI fino que envolve o VSR.
COPY requirements.txt /opt/cleaner-requirements.txt
RUN pip3 install --no-cache-dir -r /opt/cleaner-requirements.txt
COPY app.py /opt/vsr/app.py

EXPOSE 9000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9000"]
