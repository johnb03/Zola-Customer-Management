#!/usr/bin/env bash
# Uso: ./scripts/extract-text.sh menus/mi-menu.pdf
# Detecta si el PDF tiene capa de texto real; si no (o si es imagen), usa OCR.
# Guarda el resultado en data-json/<nombre>.json
set -e

if [ -z "$1" ]; then
  echo "Uso: $0 <ruta-al-menu>"
  exit 1
fi

INPUT="$1"
BASENAME="$(basename "${INPUT%.*}")"
EXT="${INPUT##*.}"
mkdir -p data-json
OUTPUT="data-json/${BASENAME}.json"

TMP_TXT="$(mktemp)"
METHOD=""

# El OCR usa español+inglés si el idioma español está disponible. Primero busca
# el modelo local en tessdata/ (descargado sin root); si no, usa el idioma del
# sistema; si tampoco, inglés.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OCR_LANG="eng"
TESSDATA_FLAG=""
if [ -f "$SCRIPT_DIR/../tessdata/spa.traineddata" ]; then
  TESSDATA_FLAG="--tessdata-dir $SCRIPT_DIR/../tessdata"
  OCR_LANG="spa+eng"
elif tesseract --list-langs 2>/dev/null | grep -qx 'spa'; then
  OCR_LANG="spa+eng"
else
  echo "[INFO] Idioma 'spa' no instalado para tesseract — usando OCR en 'eng'"
fi

if [ "$EXT" = "pdf" ] || [ "$EXT" = "PDF" ]; then
  # Intento 1: texto real embebido en el PDF
  pdftotext -layout "$INPUT" "$TMP_TXT" 2>/dev/null || true

  # Si salió muy poco texto, asumimos que es un PDF escaneado (imagen) y usamos OCR
  CHARCOUNT=$(wc -c < "$TMP_TXT" | tr -d ' ')
  if [ "$CHARCOUNT" -lt 20 ]; then
    echo "[INFO] PDF sin capa de texto detectable, usando OCR..."
    PAGES_DIR="$(mktemp -d)"
    pdftoppm -png "$INPUT" "$PAGES_DIR/page"
    : > "$TMP_TXT"
    for page in "$PAGES_DIR"/*.png; do
      tesseract "$page" - -l "$OCR_LANG" $TESSDATA_FLAG >> "$TMP_TXT" 2>/dev/null
      echo "" >> "$TMP_TXT"
    done
    rm -rf "$PAGES_DIR"
    METHOD="tesseract"
  else
    METHOD="pdftotext"
  fi
else
  # Es una imagen directa (jpg, png, etc.)
  echo "[INFO] Imagen detectada, usando OCR..."
  tesseract "$INPUT" - -l "$OCR_LANG" $TESSDATA_FLAG > "$TMP_TXT" 2>/dev/null
  METHOD="tesseract"
fi

# Empaquetar el resultado como JSON (usando python3 para escapar bien el texto)
python3 -c "
import json, sys
with open('$TMP_TXT', encoding='utf-8') as f:
    text = f.read()
data = {
    'source_file': '$INPUT',
    'extraction_method': '$METHOD',
    'text': text
}
with open('$OUTPUT', 'w', encoding='utf-8') as out:
    json.dump(data, out, ensure_ascii=False, indent=2)
"

rm -f "$TMP_TXT"

echo "[OK] Extraído con: $METHOD"
echo "[OK] Guardado en: $OUTPUT"
