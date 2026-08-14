#!/usr/bin/env bash
# Smoke test del pipeline de ClienteListo.
#
# Verifica, en orden y dentro de un sandbox temporal que se elimina al salir:
#   1. Sintaxis de todos los scripts en scripts/ (bash -n).
#   2. Extracción de texto de un PDF con capa de texto (método pdftotext).
#   3. Extracción de texto de una imagen PNG (método tesseract).
#   4. Conversión del fixture de reporte a .docx con convert-report.sh.
#   5. Validez del .docx generado (zip + XML bien formado + inyección de
#      espaciado w:after="160", exactamente 3).
#
# No toca menus/, data-json/, reports/, reportsDocx/ ni catalogo-data-base/:
# todo el IO ocurre dentro del sandbox .smoke-test.* del repo, que se elimina
# al salir, incluso si algo falla.
set -e
# errtrace: el trap ERR debe dispararse también dentro de funciones, para que
# el error se reporte con el nombre del paso que falló.
set -E

REPO_ROOT="$(cd "$(dirname "$0")" && cd .. && pwd)"
SANDBOX=""
STEP_NAME=""

cleanup() {
  if [ -n "$SANDBOX" ]; then
    rm -rf "$SANDBOX"
  fi
}

err_report() {
  echo "[ERROR] Fallo en el paso: $STEP_NAME" >&2
}

trap cleanup EXIT
trap 'exit 1' INT TERM
trap err_report ERR

step() {
  STEP_NAME="$1"
  shift
  echo "==> $STEP_NAME"
  "$@"
}

prepare_sandbox() {
  # Gate de sintaxis primero: cualquier error debe nombrar el script. Se
  # recorren también los scripts ocultos (.[!.]*.sh) para que un error ahí
  # no pase de largo.
  for script in "$REPO_ROOT"/scripts/*.sh "$REPO_ROOT"/scripts/.[!.]*.sh; do
    [ -f "$script" ] || continue
    bash -n "$script"
  done

  SANDBOX="$(mktemp -d "$REPO_ROOT/.smoke-test.XXXXXX")"
  mkdir -p "$SANDBOX/scripts" "$SANDBOX/inputs" "$SANDBOX/reports"
  cp "$REPO_ROOT"/scripts/*.sh "$SANDBOX/scripts/"
  chmod +x "$SANDBOX"/scripts/*.sh
  ln -s "$REPO_ROOT/tessdata" "$SANDBOX/tessdata"
  ln -s "$REPO_ROOT/templates" "$SANDBOX/templates"
  cp "$REPO_ROOT/test/fixtures/fixture-report.md" "$SANDBOX/reports/fixture-report.md"
  cd "$SANDBOX"
}

step2_pdf() {
  # PDF con capa de texto real, generado solo con stdlib (sin pdflatex).
  python3 - inputs/menu-texto.pdf <<'PYEOF'
import sys

out = sys.argv[1]

bodies = {
    1: b"<< /Type /Catalog /Pages 2 0 R >>",
    2: b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
}
text = b"(Menu de prueba con capa de texto real para el smoke test de extraccion.)"
stream = b"BT /F1 14 Tf 72 720 Td " + text + b" Tj ET"
bodies[4] = b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
bodies[5] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

pdf = bytearray(b"%PDF-1.4\n")
offsets = {}
for num in (1, 2, 3, 4, 5):
    offsets[num] = len(pdf)
    pdf += str(num).encode() + b" 0 obj\n" + bodies[num] + b"\nendobj\n"

xref_pos = len(pdf)
pdf += b"xref\n0 6\n"
pdf += b"0000000000 65535 f \n"
for num in (1, 2, 3, 4, 5):
    pdf += ("%010d 00000 n \n" % offsets[num]).encode()
pdf += b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + str(xref_pos).encode() + b"\n%%EOF"

with open(out, "wb") as f:
    f.write(bytes(pdf))
print("PDF generado:", out, len(pdf), "bytes")
PYEOF

  "$SANDBOX/scripts/extract-text.sh" inputs/menu-texto.pdf

  python3 - data-json/menu-texto.json <<'PYEOF'
import sys, json

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
for key in ("source_file", "extraction_method", "text"):
    if key not in data:
        print("falta clave: %s" % key)
        sys.exit(1)
if data["extraction_method"] != "pdftotext":
    print("método incorrecto: %s" % data["extraction_method"])
    sys.exit(1)
if not data["text"].strip():
    print("texto vacío")
    sys.exit(1)
print("envelope pdftotext OK")
PYEOF
}

step3_png() {
  # PNG generado solo con stdlib (zlib/struct), sin dependencias.
  python3 - inputs/menu-imagen.png <<'PYEOF'
import sys, struct, zlib

out = sys.argv[1]
width, height = 320, 64

raw = bytearray()
for y in range(height):
    raw.append(0)  # filtro 0 (None)
    for x in range(width):
        if (x // 32) % 2 == 0 or y < 10 or y > height - 11:
            raw += b"\x00\x00\x00"
        else:
            raw += b"\xff\xff\xff"

def chunk(typ, data):
    c = struct.pack(">I", len(data)) + typ + data
    c += struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
    return c

png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(bytes(raw)))
png += chunk(b"IEND", b"")
with open(out, "wb") as f:
    f.write(png)
print("PNG generado:", out, len(png), "bytes")
PYEOF

  "$SANDBOX/scripts/extract-text.sh" inputs/menu-imagen.png

  python3 - data-json/menu-imagen.json <<'PYEOF'
import sys, json

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
for key in ("source_file", "extraction_method", "text"):
    if key not in data:
        print("falta clave: %s" % key)
        sys.exit(1)
if data["extraction_method"] != "tesseract":
    print("método incorrecto: %s" % data["extraction_method"])
    sys.exit(1)
print("envelope tesseract OK")
PYEOF
}

step4_docx() {
  "$SANDBOX/scripts/convert-report.sh" reports/fixture-report.md
}

step5_validate() {
  python3 - reportsDocx/fixture-report.docx <<'PYEOF'
import sys, zipfile, xml.etree.ElementTree as ET

out = sys.argv[1]
z = zipfile.ZipFile(out)
if z.testzip() is not None:
    print("zip corrupto")
    sys.exit(1)
doc = z.read("word/document.xml")
ET.fromstring(doc)  # XML mal formado lanza excepción
count = doc.count(b'w:after="160"')
if count != 3:
    print('w:after="160" x%d, se esperaba 3' % count)
    sys.exit(1)
print('docx válido; w:after="160" x3')
PYEOF
}

step "1: sintaxis de scripts y preparación del sandbox" prepare_sandbox
step "2: extracción de texto de un PDF con capa de texto (pdftotext)" step2_pdf
step "3: extracción de texto de una imagen PNG (tesseract)" step3_png
step "4: conversión del fixture de reporte a docx" step4_docx
step "5: validación del docx generado" step5_validate

echo ""
echo "[OK] Smoke test del pipeline completado"
