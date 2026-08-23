#!/usr/bin/env bash
# Verifica dependencias necesarias e inicializa el proyecto.
set -e

echo "== Verificando dependencias =="

MISSING=""

check() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "[OK] $1 encontrado"
  else
    echo "[FALTA] $1 — instálalo antes de continuar: $2"
    MISSING="1"
  fi
}

# --- Dependencias del pipeline ---
check "python3" "https://www.python.org/downloads/"
check "pandoc" "https://pandoc.org/installing.html"
check "tesseract" "https://github.com/tesseract-ocr/tesseract#installing"
check "pdftotext" "sudo apt install poppler-utils  (paquete poppler-utils)"

# --- Dependencias del frontend ---
check "node" "https://nodejs.org/ (v26+)"
check "pnpm" "npm install -g pnpm"

if [ -n "$MISSING" ]; then
  echo ""
  echo "Instala lo que falta y vuelve a correr este script."
  exit 1
fi

echo ""
echo "== Configurando proyecto =="

# --- .env ---
if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || true
  if [ ! -f .env ]; then
    echo "GEMINI_API_KEY=" > .env
  fi
  echo "[OK] .env creado — edítalo con tu GEMINI_API_KEY."
else
  echo "[OK] .env ya existe, no se sobrescribe."
fi

# --- Catálogo ---
if [ ! -f catalogo-data-base/catalog.json ]; then
  cp catalogo-data-base/catalog.example.json catalogo-data-base/catalog.json 2>/dev/null || true
  if [ ! -f catalogo-data-base/catalog.json ]; then
    echo "[INFO] No se encontró catalog.example.json — creá catalogo-data-base/catalog.json con tu catálogo real."
  else
    echo "[OK] catalogo-data-base/catalog.json creado desde el ejemplo — reemplaza con tu catálogo real."
  fi
else
  echo "[OK] catalogo-data-base/catalog.json ya existe, no se sobrescribe."
fi

# --- Frontend: install npm deps ---
echo ""
echo "== Instalando dependencias del frontend =="
if [ -d frontend ] && [ -f frontend/package.json ]; then
  cd frontend
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  cd ..
  echo "[OK] Dependencias del frontend instaladas."
else
  echo "[AVISO] frontend/ no encontrado — saltando npm install."
fi

# --- Verificar GEMINI_API_KEY ---
echo ""
if grep -q "GEMINI_API_KEY=" .env 2>/dev/null; then
  KEY_VAL=$(grep "GEMINI_API_KEY=" .env | cut -d'=' -f2 | tr -d ' "')
  if [ -n "$KEY_VAL" ]; then
    echo "[OK] GEMINI_API_KEY configurada."
  else
    echo "[AVISO] GEMINI_API_KEY está vacía en .env — agregala para features IA."
  fi
else
  echo "[AVISO] GEMINI_API_KEY no encontrada en .env — agregala para features IA."
fi

echo ""
echo "============================================"
echo "  Instalación completa."
echo ""
echo "  Arrancar el servidor:"
echo "    cd frontend && pnpm server"
echo ""
echo "  Abrir en el navegador:"
echo "    http://localhost:5173"
echo ""
echo "  Desde el teléfono (mismo WiFi):"
echo "    http://<IP-de-tu-PC>:5173"
echo "    Luego 'Agregar a pantalla de inicio' para instalar como app."
echo "============================================"
