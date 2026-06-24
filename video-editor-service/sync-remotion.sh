#!/usr/bin/env bash
# Sincroniza a composição Remotion CANÔNICA (frontend) para o serviço de render.
# Garante que o que o usuário vê no preview (@remotion/player) é IGUAL ao render da VPS.
# Rodar antes do docker build do serviço.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../src/video-editor/remotion"
DST="$HERE/remotion/src"

mkdir -p "$DST"
# Remove versão antiga em pasta (layouts/) para não conflitar com o arquivo flat.
rm -rf "$DST/layouts"
cp "$SRC/schema.ts"    "$DST/schema.ts"
cp "$SRC/layouts.tsx"  "$DST/layouts.tsx"
cp "$SRC/Captions.tsx" "$DST/Captions.tsx"
cp "$SRC/Main.tsx"     "$DST/Main.tsx"
echo "Composição sincronizada: frontend -> serviço ($DST)"
