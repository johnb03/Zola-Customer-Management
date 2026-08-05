#!/usr/bin/env bash
# Uso: ./scripts/convert-report.sh reports/AAAA-MM-DD_nombre.md
# Convierte el reporte .md a Word (.docx) en reportsDocx/, aplicando el estilo
# de templates/reference.docx si existe y el espaciado entre entradas de lista
# (regla de formato de corrections.md: línea en blanco entre entradas).
set -e

if [ -z "$1" ]; then
  echo "Uso: $0 <ruta-al-reporte-md>"
  exit 1
fi

MD_FILE="$1"
BASE="$(basename "${MD_FILE%.*}")"
OUT="reportsDocx/${BASE}.docx"
RAW="/tmp/${BASE}_raw.docx"
WORK="/tmp/${BASE}_docx_work"

mkdir -p reportsDocx

if [ -f templates/reference.docx ]; then
  pandoc "$MD_FILE" --reference-doc=templates/reference.docx -o "$RAW"
else
  pandoc "$MD_FILE" -o "$RAW"
fi

# Post-procesado: inyecta <w:spacing w:after="160"/> en los párrafos de lista
# (los que tienen numPr). Pandoc descarta el espaciado del reference-doc, así
# que se aplica directo sobre el XML generado.
python3 - "$OUT" "$RAW" <<'PYEOF'
import sys, zipfile, re, os, shutil
out, raw = sys.argv[1], sys.argv[2]
work = os.path.splitext(out)[0] + '_work'
if os.path.exists(work):
    shutil.rmtree(work)
os.makedirs(work)
with zipfile.ZipFile(raw) as z:
    z.extractall(work)
path = os.path.join(work, 'word', 'document.xml')
with open(path, encoding='utf-8') as f:
    doc = f.read()
changed = 0
out_chunks = []
pos = 0
for m in re.finditer(r'<w:p[ >].*?</w:p>', doc, re.S):
    out_chunks.append(doc[pos:m.start()])
    para = m.group(0)
    if '<w:numPr>' in para and '<w:spacing' not in para:
        para = para.replace('<w:pPr>', '<w:pPr><w:spacing w:after="160"/>', 1)
        changed += 1
    out_chunks.append(para)
    pos = m.end()
out_chunks.append(doc[pos:])
with open(path, 'w', encoding='utf-8') as f:
    f.write(''.join(out_chunks))
if os.path.exists(out):
    os.remove(out)
zf = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
for root, dirs, files in os.walk(work):
    for fn in files:
        full = os.path.join(root, fn)
        zf.write(full, os.path.relpath(full, work))
zf.close()
shutil.rmtree(work)
os.remove(raw)
print(f'[OK] Espaciado aplicado a {changed} párrafos de lista')
PYEOF

echo "[OK] Convertido: $OUT"
