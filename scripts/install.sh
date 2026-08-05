#!/usr/bin/env bash
# Verifica dependencias necesarias e inicializa el proyecto.
set -e

echo "== Verificando dependencias =="

check() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "[OK] $1 encontrado"
  else
    echo "[FALTA] $1 — instálalo antes de continuar: $2"
    MISSING=1
  fi
}

check "opencode" "https://opencode.ai (o el repo de instalación que uses)"
check "pandoc" "https://pandoc.org/installing.html"

if [ -n "$MISSING" ]; then
  echo ""
  echo "Instala lo que falta y vuelve a correr este script."
  exit 1
fi

echo ""
echo "== Configurando proyecto =="

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[OK] .env creado desde .env.example — edítalo con tu API key."
else
  echo "[OK] .env ya existe, no se sobrescribe."
fi

if [ ! -f catalogo-data-base/catalog.json ]; then
  cp catalogo-data-base/catalog.example.json catalogo-data-base/catalog.json
  echo "[OK] catalogo-data-base/catalog.json creado desde el ejemplo — reemplaza con tu catálogo real."
else
  echo "[OK] catalogo-data-base/catalog.json ya existe, no se sobrescribe."
fi

echo ""
echo "Listo. Coloca un menú en menus/ y corre: ./scripts/run-analysis.sh menus/tu-menu.pdf"
