#!/usr/bin/env bash
# Validates the mechanical corrections.md rules on a report .md file.
# Emits only rule ids + line numbers (stdout); never report content.
# Exit codes: 0 clean, 1 violations, 2 usage/IO error.
set -e

if [ -z "$1" ]; then
  echo "Uso: $0 <ruta-al-reporte-md>" >&2
  exit 2
fi

MD_FILE="$1"

if [ ! -f "$MD_FILE" ] || [ ! -r "$MD_FILE" ]; then
  echo "Error: no existe o no es legible: $MD_FILE" >&2
  exit 2
fi

python3 - "$MD_FILE" <<'PYEOF'
import re
import sys

MD_FILE = sys.argv[1]

try:
    with open(MD_FILE, encoding="utf-8") as f:
        lines = f.read().splitlines()
except OSError as err:
    print(f"Error de lectura: {err}", file=sys.stderr)
    sys.exit(2)

# BAN contract (design.md:33-39): strip the work-saving exception first, then
# scan the banned tokens. Word boundaries keep "precios"/"apreciamos"/"peso" safe.
ALLOWED_RE = re.compile(r"\bahorr\w*\b\s+(?:de\s+)?trabajo\s+en\s+cocina\b", re.IGNORECASE)
BAN_RE = re.compile(r"\$|\b(?:precio|mayoreo|descuento|costo|pesos|barato|ahorr\w*)\b", re.IGNORECASE)
MARKS_RE = re.compile(r"\((?:explícito|inferido)\)")

HEADER_PRODUCTOS = "## Productos a ofrecer"
HEADER_SUSTITUTOS = "## Posibles sustitutos / matches parciales"
HEADER_PITCH = "## Pitch sugerido"

bold_violations = []
spacing_pairs = []
ban_violations = []
marks_violations = []
pitch_first = None

# Pass 1: locate the two list sections. Exact stripped heading match; each
# section ends at the next "## " heading. Pitch body is handled in pass 2.
section = None
pitch_header = None
productos = []
sustitutos = []
for idx, line in enumerate(lines, start=1):
    stripped = line.strip()
    if stripped.startswith("## "):
        if stripped == HEADER_PRODUCTOS:
            section = "productos"
        elif stripped == HEADER_SUSTITUTOS:
            section = "sustitutos"
        elif stripped == HEADER_PITCH:
            section = "pitch"
            pitch_header = idx
        else:
            section = None
        continue
    if section == "productos":
        productos.append(idx)
    elif section == "sustitutos":
        sustitutos.append(idx)


def list_entries(section_lines):
    return [n for n in section_lines if lines[n - 1].startswith("- ")]


def check_bold(line_no):
    """Bold only '**Producto (código, empaque)**': the entry starts with '**',
    the closing '**' is followed by ' —', and no bold remains after it."""
    inner = lines[line_no - 1][2:]
    if not inner.startswith("**"):
        bold_violations.append(line_no)
        return
    close = inner.find("**", 2)
    if close == -1:
        bold_violations.append(line_no)
        return
    rest = inner[close + 2:]
    if not rest.startswith(" —") or "**" in rest:
        bold_violations.append(line_no)


for section_lines, with_marks in ((productos, True), (sustitutos, False)):
    entries = list_entries(section_lines)
    prev = None
    for n in entries:
        check_bold(n)
        # Marks: each Productos entry with bold shows exactly one mark.
        if with_marks and lines[n - 1].startswith("- **"):
            if len(MARKS_RE.findall(lines[n - 1])) != 1:
                marks_violations.append(n)
        # Spacing: at least one blank line between consecutive entries.
        if prev is not None and n == prev + 1:
            spacing_pairs.append((prev, n))
        prev = n

# Pass 2: pitch runs from its header to EOF; >5 non-empty lines flags the first.
if pitch_header is not None:
    non_empty = [n for n in range(pitch_header + 1, len(lines) + 1) if lines[n - 1].strip()]
    if len(non_empty) > 5:
        pitch_first = non_empty[0]

# Pass 3: whole-file word ban, per line after stripping the allowed phrase.
for idx, line in enumerate(lines, start=1):
    probe = ALLOWED_RE.sub("", line)
    if BAN_RE.search(probe):
        ban_violations.append(idx)

# Output: deduped rule ids + line numbers only (privacy).
out = []
out.extend(f"BOLD {n}" for n in bold_violations)
out.extend(f"SPACING {a},{b}" for a, b in spacing_pairs)
if pitch_first is not None:
    out.append(f"PITCH {pitch_first}")
out.extend(f"BAN {n}" for n in ban_violations)
out.extend(f"MARKS {n}" for n in marks_violations)

for violation in out:
    print(violation)

sys.exit(1 if out else 0)
PYEOF
