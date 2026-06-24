#!/usr/bin/env bash
# Gera mídias placeholder em ../public para testar o render do Remotion offline.
# Uso: bash example/make_placeholders.sh   (precisa de ffmpeg)
set -e
PUB="$(dirname "$0")/../public"
mkdir -p "$PUB"

# Talking-head fake: 14s, barras coloridas + tom de áudio (para a legenda ter base).
ffmpeg -y -f lavfi -i testsrc=size=1080x1920:rate=30:duration=14 \
  -f lavfi -i sine=frequency=220:duration=14 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$PUB/talking_head.mp4"

# B-roll fake: 6s gradiente animado.
ffmpeg -y -f lavfi -i "rgbtestsrc=size=1080x1920:rate=30:duration=6" \
  -c:v libx264 -pix_fmt yuv420p "$PUB/broll.mp4"

# Imagens/prints fake.
ffmpeg -y -f lavfi -i "color=c=0x1e88e5:size=1080x1350:duration=1" -frames:v 1 "$PUB/print1.png"
ffmpeg -y -f lavfi -i "color=c=0xe53935:size=1080x1350:duration=1" -frames:v 1 "$PUB/print2.png"
ffmpeg -y -f lavfi -i "color=c=0x00000000:size=300x300:duration=1" -frames:v 1 "$PUB/logo.png"

echo "Placeholders gerados em $PUB"
