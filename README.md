# Zola Customer Management

![Zola App](frontend/public/Zola-app-img.png)

CRM multi-módulo para vendedores de productos gourmet/alimentarios. Diseñado para uso desde el celular con interfaz mobile-first, almacenamiento local y conexión a internet solo para features de IA.

## Instalación desde el móvil

Zola es una **PWA** (Progressive Web App): se instala desde el navegador como una app nativa, sin pasar por ninguna tienda de apps. Funciona **100% en el dispositivo** — los datos viven en el almacenamiento local del navegador (IndexedDB) y el OCR de menús se ejecuta en el mismo teléfono, sin necesidad de un servidor propio ni de la PC.

**Requisito:** la URL debe servirse por **HTTPS** (GitHub Pages lo hace). Sin HTTPS el navegador no permite instalar la PWA.

1. **Abrí la URL de la app** en el navegador del teléfono, por ejemplo `https://johnb03.github.io/Zola-Customer-Management/`.
2. **Android / Chrome:** tocá el banner "Instalar aplicación" cuando aparezca, o el menú (⋮) → "Instalar app" / "Agregar a pantalla de inicio". Confirmá y el ícono se crea en el home.
3. **iPhone / Safari:** tocá el botón **Compartir (⤴)** → **"Agregar a pantalla de inicio"** → **"Agregar"**. El ícono se crea en el home.

Una vez instalada, la app se abre a pantalla completa (sin la barra del navegador) y funciona **offline** para productos, clientes, análisis, reportes y OCR de menús. Consejos:

- **Primera carga con WiFi:** la primera visita a la URL descarga el precache (~41 MB) con los modelos de OCR para funcionar sin internet. Es una sola vez.
- **Datos por dispositivo:** cada dispositivo es una isla de datos (IndexedDB local, no hay servidor central). Para pasar datos entre dispositivos usá **ConfigPanel → Datos → Exportar datos** (genera un archivo `.json`) e **Importar datos** en el otro dispositivo (reemplaza los datos locales).
- **Actualizaciones:** el PWA se actualiza solo — al volver a abrir la app toma la última versión publicada.
- **IA:** los análisis por IA requieren internet y tu propia API key (se configura en ConfigPanel → Datos de usuario). Todo lo demás funciona sin conexión.

## Módulos

| Módulo | Descripción |
|---|---|
| **ClienteListo** | Análisis de documento del negocio (menú, carta, listado) contra el catálogo de productos para generar estrategia de venta |
| **Dashboard** | Vista de monitoreo: clientes, visitas, ventas, cobros con gráficas y filtros |
| **Reporte de Visitas** | Registro diario de visitas a clientes, compilado a Excel con plantilla personalizada |
| **Clientes** | Directorio de clientes con embudo de ventas (potencial → activo → cobro) |
| **Agendar Citas** | Calendario mensual con CRUD de citas, auto-creación desde visitas |
| **Notas** | Notas diarias con conversión automática a visitas vía agente IA |

## Stack

- **Frontend:** Vue 3 + Vite 8, Vue Router, vanilla CSS, PWA
- **Backend:** Express (server/index.mjs), 30+ endpoints REST
- **IA:** Agente multi-proveedor — Gemini, Claude, ChatGPT, DeepSeek o custom (cada usuario conecta su propia API key)
- **Diseño:** Paleta oscura cálida (espresso/dorado/burdeos), tipografía Satoshi
- **Datos:** JSON interno, Excel (.xlsx) para exportación

## Requisitos

- [Node.js](https://nodejs.org/) v26+
- [pnpm](https://pnpm.io/) — `npm install -g pnpm`
- [Python 3](https://www.python.org/downloads/) — scripts de extracción y plantillas
- [Pandoc](https://pandoc.org/installing.html) — conversión a Word
- [Tesseract](https://github.com/tesseract-ocr/tesseract#installing) — OCR para imágenes
- [Poppler Utils](https://poppler.freedesktop.org/) — `sudo apt install poppler-utils` (pdftotext)
- API key de un proveedor de IA compatible (Gemini, Claude, ChatGPT, DeepSeek u otro)

## Instalación

```bash
git clone <tu-repo> zola
cd zola
./scripts/install.sh
```

El script verifica dependencias, instala paquetes del frontend, crea `.env` y copia el catálogo de ejemplo.

Luego:

1. Edita `.env` con tu `GEMINI_API_KEY`.
2. Reemplaza `catalogo-data-base/catalog.json` con tu catálogo real.

## Uso

```bash
# Arrancar el servidor
cd frontend && pnpm server

# Abrir en el navegador
# Desktop: http://localhost:5173
# Teléfono (mismo WiFi): http://<IP-de-tu-PC>:5173
# Luego "Agregar a pantalla de inicio" para instalar como app
```

### Pipeline ClienteListo (scripts)

```bash
# 1. Coloca el menú (imagen o PDF) en menus/
cp ~/Descargas/menu-restaurante.jpg menus/

# 2. Extrae texto y genera reporte
./scripts/run-analysis.sh menus/menu-restaurante.jpg

# 3. Convierte a Word
./scripts/convert-report.sh reports/AAAA-MM-DD_menu-restaurante.md
```

### Verificación

```bash
# Smoke test del pipeline (sandbox temporal, no toca datos reales)
./scripts/smoke-test.sh

# Validar reglas de correcciones sobre un reporte
./scripts/validate-report.sh reports/AAAA-MM-DD_nombre.md
```

## Estructura del proyecto

```
.
├── AGENTS.md                 # Instrucciones del agente: 6 módulos, reglas
├── DESIGN.md                 # Paleta de colores, tipografía, layout
├── FRONTEND.md               # Especificación del frontend Vue 3
├── STRUCTURE.md              # Estructura del proyecto CRM
├── corrections.md            # Reglas fijas del agente (prioridad sobre AGENTS.md)
│
├── catalogo-data-base/       # Catálogo de productos
│   ├── catalog.example.json  # Ejemplo (versionado)
│   └── catalog.json          # Catálogo real (gitignored)
│
├── menus/                    # Menús de clientes a analizar (gitignored)
├── data-json/                # Texto extraído de menús (gitignored)
├── reports/                  # Reportes .md generados (gitignored)
├── reportsDocx/              # Reportes convertidos a .docx (gitignored)
├── visitas/                  # Datos de visitas (gitignored)
├── citas/                    # Datos de citas (gitignored)
├── notas/                    # Datos de notas (gitignored)
├── clientes/                 # Directorio de clientes (gitignored)
├── cobros/                   # Registro de cobros (gitignored)
├── exports/                  # Salidas Excel (gitignored)
│
├── scripts/
│   ├── install.sh            # Verifica dependencias e inicializa
│   ├── extract-text.sh       # Extracción de texto (pdftotext / Tesseract)
│   ├── run-analysis.sh       # Análisis completo del menú
│   ├── convert-report.sh     # Conversión a Word con Pandoc
│   ├── validate-report.sh    # Validador estático de reglas
│   ├── smoke-test.sh         # Test de regresión en sandbox
│   └── fill-excel-template.py # Rellena plantillas Excel preservando formato
│
├── templates/
│   └── reference.docx        # Plantilla de estilo para Word
├── test/fixtures/
│   └── fixture-report.md     # Reporte sintético para smoke test
├── tessdata/
│   └── spa.traineddata       # Modelo OCR español
├── assets/fonts/satoshi/     # Tipografía Satoshi (OTF, TTF, WEB)
├── design/                   # Archivos OpenPencil (sidebar, notas)
├── actualizaciones/          # Reportes de actualizaciones y planes
├── openspec/                 # Configuración SDD + specs archivados
│
└── frontend/                 # App Vue 3
    ├── server/index.mjs      # Backend Express (30+ endpoints)
    ├── src/
    │   ├── App.vue           # Shell: Sidebar + ConfigPanel + modals
    │   ├── api.js            # Capa de acceso a datos
    │   ├── store.js          # Estado global
    │   ├── router/           # Rutas Vue Router
    │   ├── views/            # 6 vistas (Dashboard, Clientes, Visitas, Citas, Notas, Datos)
    │   ├── components/       # Sidebar, ConfigPanel, AlertModal, ConfirmModal, etc.
    │   ├── composables/      # useAlert, useConfirm
    │   └── styles/tokens.css # Design tokens CSS
    ├── vite.config.js        # Build + PWA config
    └── package.json
```

## Diseño

Interfaz oscura con tonos cálidos — "vitrina de mercancía fina, no dashboard corporativo". Detalles en `DESIGN.md`:

- **Fondo:** espresso `#15100D`, superficies `#1F1811` / `#2A2118`
- **Acentos:** dorado `#C9A227` (primario), burdeos `#7A1F2B` (secundario)
- **Status:** oliva `#6B8F47` (activo), ámbar `#C98A3B` (pendiente), óxido `#A8433A` (atrasado)
- **Tipografía:** Satoshi (Black/Bold/Medium/Regular), escala 32/20/15/13px
- **Layout:** sidebar fijo (desktop), tab bar con 6 íconos (mobile)

## Próximos pasos

Ver `actualizaciones/planMobile.md` para el plan de convertir Zola en una app independiente con backend offline.

---

*Zola Customer Management — CRM para vendedores de productos gourmet.*
