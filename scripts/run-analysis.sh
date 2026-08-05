#!/usr/bin/env bash
# Uso: ./scripts/run-analysis.sh menus/mi-menu.pdf
set -e

if [ -z "$1" ]; then
  echo "Uso: $0 <ruta-al-menu>"
  exit 1
fi

MENU_FILE="$1"
BASENAME="$(basename "${MENU_FILE%.*}")"
JSON_FILE="data-json/${BASENAME}.json"

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "== Extrayendo texto de: $MENU_FILE =="
./scripts/extract-text.sh "$MENU_FILE"

echo "== Analizando: $JSON_FILE =="

# Usa el modelo por defecto que ya tengas configurado/autenticado en opencode
# (opencode auth login). Si definiste OPENCODE_MODEL en tu .env, se usa ese
# en su lugar — así cada quien conecta el modelo (gratis o de pago) que tenga.
MODEL_FLAG=""
if [ -n "$OPENCODE_MODEL" ]; then
  MODEL_FLAG="--model $OPENCODE_MODEL"
fi

opencode run \
  $MODEL_FLAG \
  --file "$JSON_FILE" \
  --file "AGENTS.md" \
  --file "corrections.md" \
  --file "$CATALOG_PATH" \
  --dangerously-skip-permissions \
  "Analiza el menú (ya extraído como texto en el JSON adjunto) siguiendo exactamente el proceso de AGENTS.md y las reglas de corrections.md. Usa el catálogo adjunto como fuente de productos."

echo ""
echo "== Reporte generado en reports/ =="
