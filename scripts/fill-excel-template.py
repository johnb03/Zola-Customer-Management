#!/usr/bin/env python3
"""
fill-excel-template.py — copia una plantilla Excel y rellena SOLO los campos
indicados (por celda nombrada o referencia directa tipo "B4"), sin tocar
nada más del archivo: logo, colores, formato, fórmulas, todo se conserva
porque se trabaja sobre una copia física del original, nunca sobre un
libro nuevo.

Uso:
    python3 fill-excel-template.py <plantilla.xlsx> <salida.xlsx> <valores.json>

valores.json — un objeto plano:
    {
      "Fecha": "2026-08-20",
      "Cliente": "Zola",
      "Vendedor": "John Berroa",
      "Notas": "Pidió revisar precio de vinos tintos"
    }

Cada clave puede ser:
  - el nombre de un rango con nombre definido en la plantilla (recomendado
    — sobrevive si se insertan filas/columnas), o
  - una referencia directa de celda en la hoja activa, ej. "B4".

El script NUNCA crea un libro en blanco (Workbook()) ni modifica la
plantilla original — siempre copia primero y trabaja sobre la copia.

Internamente usa un enfoque HÍBRIDO:
  - openpyxl SOLO para resolver rangos con nombre → coordenadas de celda
    (lectura; nunca re-guarda el workbook, porque openpyxl pierde
    imágenes/dibujos al re-serializar).
  - La escritura de valores se hace DIRECTAMENTE sobre el XML del .xlsx
    (un zip): xl/sharedStrings.xml para los textos y la hoja destino para
    las referencias. Así imágenes (xl/media/), estilos (xl/styles.xml),
    drawings, fórmulas y estructura quedan intactos byte a byte.
"""

import sys
import os
import re
import json
import shutil
import zipfile
import xml.etree.ElementTree as ET

try:
    from openpyxl import load_workbook
except ImportError:
    print("[ERROR] Falta openpyxl. Instala con: pip install openpyxl --break-system-packages")
    sys.exit(2)

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?$")


def resolve_target(wb, field):
    """Resuelve un campo a (hoja, coordenada) usando rangos con nombre o
    referencia directa de celda en la hoja activa. Devuelve None si no existe."""
    defined_names = getattr(wb, "defined_names", {})
    try:
        if field in defined_names:
            dests = list(defined_names[field].destinations)
            if dests:
                sheet_title, coord = dests[0]
                return sheet_title, coord.replace("$", "")
    except (KeyError, TypeError):
        pass
    # Referencia directa de celda en la hoja activa
    try:
        wb.active[field]  # valida que sea una referencia de celda válida
        return wb.active.title, field
    except (KeyError, ValueError):
        return None


def cell_coord(coord):
    """'B4' -> (4, 'B'). Devuelve (None, None) si es inválida."""
    m = re.fullmatch(r"([A-Za-z]+)(\d+)", coord)
    if not m:
        return None, None
    return int(m.group(2)), m.group(1).upper()


def col_to_number(letters):
    """'B' -> 2 (1-based)."""
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def parse_sheets(zf):
    """Mapea nombre de hoja -> ruta del XML de la hoja (ej. xl/worksheets/sheet1.xml)."""
    wb_xml = zf.read("xl/workbook.xml").decode("utf-8")
    root = ET.fromstring(wb_xml)
    sheets = []
    for sheet in root.findall(f"{{{NS}}}sheets/{{{NS}}}sheet"):
        name = sheet.get("name")
        rid = sheet.get(f"{{{REL_NS}}}id")
        sheets.append((name, rid))

    rels_xml = zf.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    rels_root = ET.fromstring(rels_xml)
    rid_to_target = {}
    for rel in rels_root.findall(f"{{{PKG_NS}}}Relationship"):
        rid_to_target[rel.get("Id")] = rel.get("Target")

    result = {}
    for name, rid in sheets:
        target = rid_to_target.get(rid, "").lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        result[name] = target
    return result


def build_string_index(shared_xml):
    """Devuelve (lista de textos, string XML reconstruido más tarde en write)."""
    if not shared_xml:
        return []
    root = ET.fromstring(shared_xml)
    texts = []
    for si in root.findall(f"{{{NS}}}si"):
        t_el = si.find(f"{{{NS}}}t")
        texts.append(t_el.text or "" if t_el is not None else "")
    return texts


def render_shared_strings(texts):
    parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
             f'<sst xmlns="{NS}" count="{len(texts)}" uniqueCount="{len(texts)}">']
    for text in texts:
        if " " in text or text != text.strip():
            t = f'<t xml:space="preserve">{escape_xml(text)}</t>'
        else:
            t = f"<t>{escape_xml(text)}</t>"
        parts.append(f"<si>{t}</si>")
    parts.append("</sst>")
    return "".join(parts)


def escape_xml(text):
    return (text.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace('"', "&quot;"))


def render_cell(coord, style_attr, is_number, value):
    """Renderiza una celda <c r=... s=... t="s"><v>...</v></c>."""
    attrs = f'r="{coord}"'
    if style_attr:
        attrs += f' {style_attr}'
    if not is_number:
        attrs += ' t="s"'
    return f'<c {attrs}><v>{value}</v></c>'


def write_values_to_sheet(sheet_xml, targets, shared_texts):
    """Escribe los valores en el XML de la hoja trabajando con REGEX sobre el
    texto original (preserva namespaces/prefijos tal cual). Devuelve
    (nuevo_xml, textos_actualizados)."""
    written = []
    skipped = []

    # Ordenar por (fila, columna) para insertar celdas nuevas ordenadamente
    ordered = sorted(targets.items(), key=lambda kv: cell_coord(kv[0]))

    for coord, value in ordered:
        row_num, col_letters = cell_coord(coord)
        if row_num is None:
            skipped.append(coord)
            continue

        value_str = str(value)
        if value_str == "":
            written.append(coord)
            continue

        is_number = bool(NUMERIC_RE.match(value_str))
        if is_number:
            val_render = f"<v>{value_str}</v>"
            attrs_extra = ""
        else:
            idx = get_or_add_string(shared_texts, value_str)
            val_render = f"<v>{idx}</v>"
            attrs_extra = ' t="s"'

        # ── 1) Celda existente? <c r="B9" s="3"/>  o  <c r="B9" t="s"><v>2</v></c>
        cell_pat = re.compile(
            r'<c\s+r="' + re.escape(coord) + r'"[^>]*?(?:/>|>.*?</c>)',
            re.DOTALL,
        )
        m = cell_pat.search(sheet_xml)
        if m and "<f>" not in m.group(0):
            old = m.group(0)
            style = ""
            sm = re.search(r'\ss="(\d+)"', old)
            if sm:
                style = f' s="{sm.group(1)}"'
            if old.endswith("/>"):
                new = f'<c r="{coord}"{style}{attrs_extra}>{val_render}</c>'
            else:
                new = f'<c r="{coord}"{style}{attrs_extra}>{val_render}</c>'
            sheet_xml = sheet_xml[: m.start()] + new + sheet_xml[m.end() :]
            written.append(coord)
            continue

        # ── 2) Fila existente? Insertar la celda en la posición correcta
        row_pat = re.compile(
            r'(<row\s+r="' + str(row_num) + r'"[^>]*>)(.*?)(</row>)',
            re.DOTALL,
        )
        mrow = row_pat.search(sheet_xml)
        if mrow:
            open_tag, inner, close_tag = mrow.groups()
            style = ""
            sm = re.search(r'\ss="(\d+)"', open_tag)
            if sm:
                style = f' s="{sm.group(1)}"'
            new_cell = f'<c r="{coord}"{style}{attrs_extra}>{val_render}</c>'
            # Insertar antes de la primera celda con columna mayor
            col_num = col_to_number(col_letters)
            insert_pos = len(inner)
            for cm in re.finditer(r'<c\s+r="([A-Z]+)(\d+)"', inner):
                if col_to_number(cm.group(1)) > col_num:
                    insert_pos = cm.start()
                    break
            inner = inner[:insert_pos] + new_cell + inner[insert_pos:]
            sheet_xml = sheet_xml[: mrow.start()] + open_tag + inner + close_tag + sheet_xml[mrow.end() :]
            written.append(coord)
            continue

        # ── 3) Fila no existe — crearla antes de </sheetData>
        row_el = f'<row r="{row_num}"><c r="{coord}"{attrs_extra}>{val_render}</c></row>'
        sd = sheet_xml.rfind("</sheetData>")
        if sd == -1:
            skipped.append(coord)
            continue
        sheet_xml = sheet_xml[:sd] + row_el + sheet_xml[sd:]
        written.append(coord)

    return sheet_xml, shared_texts


def get_or_add_string(shared_texts, text):
    """Devuelve el índice del string, agregándolo si no existe."""
    try:
        return shared_texts.index(text)
    except ValueError:
        shared_texts.append(text)
        return len(shared_texts) - 1


def main():
    if len(sys.argv) != 4:
        print(f"Uso: {sys.argv[0]} <plantilla.xlsx> <salida.xlsx> <valores.json>")
        sys.exit(2)

    template_path, output_path, values_path = sys.argv[1:4]

    if not os.path.isfile(template_path):
        print(f"[ERROR] Plantilla no encontrada: {template_path}")
        sys.exit(2)

    if not os.path.isfile(values_path):
        print(f"[ERROR] Archivo de valores no encontrado: {values_path}")
        sys.exit(2)

    with open(values_path, encoding="utf-8") as f:
        try:
            values = json.load(f)
        except json.JSONDecodeError as e:
            print(f"[ERROR] JSON de valores inválido: {e}")
            sys.exit(2)

    if not isinstance(values, dict):
        print("[ERROR] El JSON de valores debe ser un objeto plano {campo: valor}.")
        sys.exit(2)

    # PASO 1 — copia física del archivo completo (logo, colores, formato: todo intacto)
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    shutil.copy(template_path, output_path)

    # PASO 2 — resolver rangos con nombre usando openpyxl (SOLO lectura, nunca save)
    wb = load_workbook(output_path, read_only=True, data_only=True)

    # Mapear campos -> (hoja, coordenada)
    targets = {}  # coord -> valor
    for field, value in values.items():
        resolved = resolve_target(wb, field)
        if resolved is None:
            continue
        sheet_title, coord = resolved
        targets.setdefault(sheet_title, {})[coord] = value

    # PASO 3 — escribir valores directamente sobre el XML del zip
    with zipfile.ZipFile(output_path, "r") as zf:
        entries = {name: zf.read(name) for name in zf.namelist()}
        sheets = parse_sheets(zf)

    shared_path = "xl/sharedStrings.xml"
    shared_texts = build_string_index(entries.get(shared_path, b"").decode("utf-8") if shared_path in entries else None)

    written = []
    skipped = []

    for sheet_title, coord_values in targets.items():
        sheet_path = sheets.get(sheet_title)
        if sheet_path is None:
            for coord in coord_values:
                skipped.append(coord)
            continue
        sheet_xml = entries[sheet_path].decode("utf-8")
        new_sheet_xml, shared_texts = write_values_to_sheet(sheet_xml, coord_values, shared_texts)
        entries[sheet_path] = new_sheet_xml.encode("utf-8")
        written.extend(coord_values.keys())

    # PASO 4 — re-escribir el zip con los archivos modificados
    if shared_texts:
        entries[shared_path] = render_shared_strings(shared_texts).encode("utf-8")

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)

    print(f"[OK] Copia creada y rellenada: {output_path}")
    print(f"[OK] Campos escritos ({len(written)}): {', '.join(written) if written else '(ninguno)'}")

    if skipped:
        print(f"[AVISO] Campos no encontrados en la plantilla ({len(skipped)}): {', '.join(skipped)}")
        print("        Revisa que el nombre coincida con un rango nombrado o una celda válida.")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()