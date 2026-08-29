# Reporte de Actualizaciones — Zola Customer Management

**Fecha del reporte:** 2026-08-23 (última actualización)
**Proyecto:** `~/Projects/Zola-Customer-Management`
**Fuente:** revisión directa del repositorio (historial Git, archivos del proyecto, datos locales, frontend funcional)

> **Alcance:** este reporte documenta SOLO cambios importantes del proyecto (herramientas, reglas, decisiones de estructura, frontend). NO incluye análisis de clientes específicos — esos viven en `reports/` y `reportsDocx/`.

---

## 1. Resumen

Zola Customer Management es un **CRM multi-módulo para vendedores de productos gourmet/alimentarios**, evolucionado desde el asistente original "ClienteListo". El sistema cubre 6 módulos:

1. **ClienteListo** — análisis de documento del negocio (menú, carta, listado) contra el catálogo de productos para generar estrategia de venta.
2. **Dashboard** — vista de monitoreo: clientes, visitas, ventas, cobros.
3. **Reporte de Visitas** — registro diario de visitas a clientes, compilado a Excel.
4. **Clientes** — directorio de clientes con embudo de ventas.
5. **Agenda** — calendario de citas con CRUD + sincronización futura con Google Calendar.
6. **Notas** — notas diarias con conversión automática a visitas vía agente IA.

**Principios de arquitectura:**
- Todo lo que entra al sistema se compila a **JSON interno** antes de que cualquier módulo lo use.
- Todo lo que sale como descarga externa se genera en **Excel (.xlsx)** en `exports/`.
- El diseño visual sigue `DESIGN.md` (paleta oscura cálida, tipografía Satoshi).
- **Todo dato se guarda en la base JSON del proyecto (DATA_HOME)**, nunca solo en frontend.

**Frontend:** proyecto Vue 3 + Vite + PWA completo y funcional con backend Express conectado a datos reales. **64 módulos** en build de producción.

---

## 2. Historial de commits (Git)

| Commit | Fecha | Autor | Descripción |
|---|---|---|---|
| `59d9e96` | 2026-08-04 | John Berroa | **Initial commit** — solo `LICENSE` (21 líneas). |
| `35a302e` | 2026-08-04 | john berroa | **chore: initial commit for ClienteListo sales strategy assistant** — andamiaje completo: 16 archivos, +577 líneas. |
| `152cdf0` | 2026-08-14 | john berroa | **docs: remove rclone/Drive references, add skill registry and updates report** — limpieza de docs, eliminación de referencias a rclone/Google Drive, creación de `actualizaciones/` y `.atl/skill-registry.md`. |
| `0777ead` | 2026-08-14 | john berroa | **chore: init openspec SDD configuration** — `openspec/config.yaml` con contexto del proyecto, reglas SDD y configuración de testing. |
| `6d8e284` | 2026-08-14 | john berroa | **chore: refresh skill registry from sdd-init** — actualización del índice de skills del agente. |
| `893a03b` | 2026-08-14 | john berroa | **chore(openspec): add pipeline-smoke-test planning artifacts** — proposal, design, tasks y spec para el smoke test. |
| `5f1107a` | 2026-08-14 | john berroa | **feat(smoke): add sandboxed pipeline regression smoke test** — `scripts/smoke-test.sh` (6 pasos, sandbox temporal), `test/fixtures/fixture-report.md`, actualización de `.gitignore` y README. |
| `1f94f84` | 2026-08-14 | john berroa | **chore(openspec): record pipeline-smoke-test apply progress** — progreso de implementación del smoke test. |
| `dfaafcc` | 2026-08-14 | john berroa | **chore(openspec): archive pipeline-smoke-test change** — cierre del cambio: verify report PASS (9/9 req, 12/12 escenarios), archive report. |
| `61b0620` | 2026-08-14 | john berroa | **chore(openspec): add corrections-rules planning artifacts** — proposal, design, tasks y spec para las reglas de correcciones. |
| `2f38fef` | 2026-08-14 | john berroa | **feat(corrections): add static report validator** — `scripts/validate-report.sh` (validador estático, 132 líneas), step 6 en el smoke test. |
| `8d09caa` | 2026-08-14 | john berroa | **chore(openspec): record corrections-rules apply progress** — progreso de implementación del validador. |
| `b507627` | 2026-08-14 | john berroa | **chore(openspec): archive corrections-rules change** — cierre del cambio: verify report PASS (10/10 req, 16/16 escenarios), spec sync (dominio `corrections` creado). |
| `4c23910` | 2026-08-14 | john berroa | **feat(zola): import CRM vision docs and Satoshi fonts** — `DESIGN.md`, `FRONTEND.md`, `STRUCTURE.md`, tipografía Satoshi completa (`assets/fonts/satoshi/`), rebranding a "Zola Customer Management". |
| `f1b52fd` | 2026-08-14 | john berroa | **chore(atl): refresh skill registry and ignore local runtime state** — actualización de skill registry, `.atl/` agregado a `.gitignore`. |
| `d03d7a1` | 2026-08-14 | john berroa | **chore(gitignore): protect module 2/3 data directories** — `.gitignore` extiende protección a `visitas/`, `exports/`. |
| `3f36973` | 2026-08-14 | john berroa | **docs(frontend): add frontend phase 1 spec** — `FRONTEND.md` con instrucciones detalladas para la Fase 1 del frontend Vue 3. |

**Estado del repo:** rama `main` sincronizada con `origin/main`. Working tree con **4 archivos modificados sin commitear** (`AGENTS.md`, `DESIGN.md`, `FRONTEND.md`, `STRUCTURE.md`) y **3 elementos sin trackear** (`frontend/`, `AGENTE_REPORTE.md`, `Reporte-diario- 14-8-26.xlsx`).

> **Importante:** el historial de Git contiene solo el andamiaje, las herramientas de verificación y los docs de arquitectura. Los datos reales de operación (catálogo real, menús, reportes de clientes, frontend completo) **no están versionados a propósito** — `.gitignore` excluye la información comercial privada.

---

## 3. Estructura del proyecto

| Ruta | Función |
|---|---|
| `AGENTS.md` | Instrucciones del agente: arquitectura general, 6 módulos, reglas de memoria (Engram). |
| `DESIGN.md` | Guía de diseño: paleta oscura cálida, tipografía Satoshi, layout sidebar/tab bar. |
| `FRONTEND.md` | Especificación de la Fase 1 del frontend (Vue 3 + Vite + PWA, vanilla CSS, 5 pantallas). |
| `STRUCTURE.md` | Estructura del proyecto fork: carpetas nuevas para CRM (`clientes/`, `visitas/`, `citas/`, `exports/`). |
| `corrections.md` | Reglas fijas que el agente respeta SIEMPRE en cada análisis. |
| `README.md` | Documentación de instalación, uso y verificación. |
| `catalogo-data-base/` | Catálogo de productos en JSON (`catalog.example.json` versionado; catálogo real ignorado). |
| `data-json/` | Texto de menús extraído (JSON), listo para el modelo. |
| `menus/` | Menús de clientes a analizar (imagen/PDF). |
| `reports/` | Reportes de estrategia generados (`.md`). |
| `reportsDocx/` | Reportes convertidos a Word (`.docx`). |
| `exports/` | Salidas Excel del CRM (dashboard, clientes, rutas). |
| `visitas/` | Datos de visitas a clientes (JSON interno). |
| `citas/` | Datos de citas (JSON interno). |
| `notas/` | Datos de notas diarias (JSON interno). |
| `clientes/` | Directorio de clientes (JSON interno). |
| `cobros/` | Registro de cobros (JSON interno). |
| `scripts/` | `install.sh`, `extract-text.sh`, `run-analysis.sh`, `convert-report.sh`, `validate-report.sh`, `smoke-test.sh`. |
| `test/fixtures/` | `fixture-report.md` — reporte sintético para el smoke test. |
| `templates/reference.docx` | Plantilla de estilo para los Word generados. |
| `tessdata/spa.traineddata` | Modelo OCR español de Tesseract. |
| `assets/fonts/satoshi/` | Tipografía Satoshi completa (OTF, TTF, WEB). |
| `openspec/` | Configuración SDD + specs + cambios archivados. |
| `.atl/skill-registry.md` | Índice de skills del agente. |
| `.env` / `env.example` | Config local: `GEMINI_API_KEY`, `CATALOG_PATH`. |
| `.gitignore` | Excluye datos privados, sandboxes temporales, `.atl/`, `.engram/`. |

### Frontend (`frontend/`)

| Ruta | Función |
|---|---|
| `frontend/package.json` | Dependencias: Vue 3, Vite 8, vue-router, vite-plugin-pwa. |
| `frontend/vite.config.js` | Build config + PWA manifest. |
| `frontend/server/index.mjs` | Backend Express: 30+ endpoints REST, agente IA integration, Excel export. |
| `frontend/src/App.vue` | Shell principal: Sidebar + ConfigPanel + ConfirmModal + AlertModal. |
| `frontend/src/main.js` | Entry point Vue. |
| `frontend/src/router/index.js` | Rutas: `/dashboard`, `/visitas`, `/clientes`, `/citas`, `/datos`, `/notas`. |
| `frontend/src/store.js` | Estado global: dataVersion, usuario ref, cargarUsuario(), showConfig. |
| `frontend/src/api.js` | Capa de datos: 25+ functions (CRUD clientes/visitas/citas/notas, upload, export, usuario). |
| `frontend/src/styles/tokens.css` | Design tokens CSS (colores, tipografía, componentes base). |
| **Componentes:** | |
| `Sidebar.vue` | Navegación lateral: brand (logo Z dorado + Zola + signature), 5 nav items, footer (avatar + nombre + settings). Mobile: tab bar con 6 íconos (sin labels). |
| `ConfigPanel.vue` | Slide-over 420px: tabs "Datos de usuario" (foto + nombre) y "Datos" (DatosView embebido). |
| `AlertModal.vue` | Modal de alertas: 4 tipos (success, error, warning, info), progress bar, ESC/backdrop dismiss. z-index: 1100. |
| `ConfirmModal.vue` | Modal de confirmación reutilizable: titulo, mensaje, botones Aceptar/Cancelar. |
| `ClienteFormModal.vue` | Modal para crear/editar clientes. |
| **Vistas:** | |
| `DashboardView.vue` | Stat cards, gráfica de ventas, cobros pendientes, filtro por período, export a Excel. |
| `VisitasView.vue` | Tabla de visitas, filtros, upload de plantilla, export con plantilla personalizada. |
| `ClientesView.vue` | Directorio de clientes, crear/editar, ficha con productos, cobro. |
| `CitasView.vue` | Calendario mensual con badges, CRUD de citas, citas auto-creadas desde visitas. |
| `NotasView.vue` | Notas diarias, conversión automática a visitas vía agente IA, grid responsive. |
| `DatosView.vue` | Gestión de datos: catálogo, menús, reportes, upload de clientes/productos. |
| **Composables:** | |
| `useAlert.js` | `alerta()` — triggered AlertModal (success, error, warning, info). |
| `useConfirm.js` | `confirmar()` — Promise-based ConfirmModal. |

---

## 4. Cambios por componente

### 4.1 Rebranding y arquitectura multi-módulo

El proyecto pasó de ser un asistente single-purpose ("ClienteListo") a un sistema CRM completo ("Zola Customer Management"). Cambios clave:

- **`AGENTS.md`** reescrito desde cero: define 6 módulos con reglas independientes, arquitectura general (JSON in → Excel out), y diseño visual que debe seguir `DESIGN.md`.
- **`STRUCTURE.md`** documenta la estructura fork: carpetas nuevas (`clientes/`, `visitas/`, `citas/`, `exports/`), scripts nuevos (`excel-to-json.sh`, `json-to-excel.sh` planificados), y la regla de que todo entrada se compila a JSON antes de usar.
- El Módulo 1 (ClienteListo) mantiene su pipeline intacto pero ahora acepta **cualquier tipo de documento de negocio** (menú de restaurante, carta de bar, listado de almacén), no solo menús.

### 4.2 Sistema de diseño (`DESIGN.md`)

Archivo de dirección visual — "vitrina de mercancía fina, no dashboard corporativo":

- **Paleta:** fondo `#15100D` (espresso), superficies `#1F1811`/`#2A2118`, acentos dorado `#C9A227` y burdeos `#7A1F2B`, status oliva/ámbar/óxido. Sin negro ni blanco puro.
- **Tipografía:** una sola familia Satoshi (Black/Bold/Medium/Regular) con escala 32/20/15/13px. `tabular-nums` para datos de tabla.
- **Layout:** sidebar fijo a la izquierda (desktop), tab bar inferior con 6 íconos (mobile, sin labels). Tarjetas 12px radius, sin sombras pesadas. Línea dorada como elemento de firma bajo encabezados.
- **Fuentes locales:** archivos Satoshi en `assets/fonts/satoshi/` (OTF, TTF, WEB) — sin CDN, funciona offline.

### 4.3 Frontend — Stack y arquitectura

- **Stack:** Vue 3 + Vite 8, Vue Router, vanilla CSS (sin Tailwind), `vite-plugin-pwa`.
- **Build:** 64 módulos, build limpio sin warnings.
- **Backend:** Express en `server/index.mjs`, 30+ endpoints REST, proxy Vite (`/api` → `:8787`).
- **Datos:** todo en DATA_HOME (`/home/job/Projects/ClienteListo`), JSON interno, sin mock data.
- **IA:** Agente multi-proveedor, temperature 0.2. Para conversión de notas a visitas y análisis de plantillas.

### 4.4 Sidebar (rediseño completo)

Rewrite del Sidebar según `design/sidebar-config-zola.op`:

- **Brand:** Logo Row — cuadrado dorado 28×28 con "Z" dark + "Zola" texto Satoshi 22px/900. Línea signature dorada 40×2px.
- **Nav items (5):** Dashboard, Clientes, Notas, Reporte de Visitas, Agendar Citas. Barra vertical 3px para active state (dorado), iconos 18×18, texto 13px.
- **Footer:** Separador 1px, avatar (32px circle, initials o foto), nombre (13px/500, max-width 120px clip), settings gear (32×32, icon 18×18).
- **Mobile:** Tab bar con 6 íconos (5 nav + Config), labels ocultos (`display: none`), solo íconos visibles. Settings abre ConfigPanel.

### 4.5 ConfigPanel (nuevo componente)

Slide-over 420px (desktop), full-screen (mobile), z-index 1050:

- **Header:** "Configuración" (18px/700) + X button (32×32, radius 8, bg surface).
- **Tabs:** "Datos de usuario" | "Datos" — active: 600 weight + underline 2px gold.
- **Tab "Datos de usuario":** Photo zone (96×96 circle, #5C4F3F bg), camera badge (28×28, gold border), "Cambiar foto" button (gold border), name input (bg base, border default, radius 8), save button (gold bg, 14px/600).
- **Tab "Datos":** DatosView embebido directamente.
- **Mobile:** Full-screen, header con back arrow, tabs gap 24px, save button full-width.

### 4.6 Backend — API de usuario

4 endpoints nuevos en `server/index.mjs`:

- `GET /api/usuario` — lee `DATA_HOME/usuario.json`, retorna `{ nombre, foto }`.
- `PUT /api/usuario` — escribe nombre + foto a `DATA_HOME/usuario.json`.
- `POST /api/usuario/foto` — upload multipart (max 5MB, JPG/PNG/WEBP/GIF), guarda en `DATA_HOME/usuario-fotos/`, retorna URL.
- `GET /api/usuario/foto-file` — sirve la foto como imagen con Cache-Control.

### 4.7 Sistema de alertas (AlertModal + useAlert)

Reemplaza los inline `msg`/`error` refs de todas las vistas:

- **`useAlert.js`** — composable `alerta({ titulo, mensaje, tipo, duracion })`.
- **`AlertModal.vue`** — modal centrado, z-index 1100, 4 tipos (success/error/warning/info), progress bar, ESC y backdrop para dismiss.
- **6 vistas migradas:** ClientesView, VisitasView, CitasView, NotasView, DatosView, DashboardView.
- **NotasView:** confirm modal duplicado reemplazado con `confirmar()` composable.

### 4.8 Módulo Notas

- CRUD completo de notas diarias.
- Conversión automática a visitas vía agente IA (`POST /api/notas/:id/convertir`).
- Guardado de visitas convertidas + mark nota como convertida.
- Grid responsive (3 cols → 2 → 1).
- Botón crear: solo ícono `+` circular (border-radius 100%, 40×40px mobile).

### 4.9 Módulo Citas

- Calendario mensual con badges de eventos por día.
- CRUD de citas (crear, completar, cancelar, eliminar).
- Citas auto-creadas desde Reporte de Visitas cuando "Próximo paso" incluye fecha.
- Badge mobile rediseñado: 25×14px, border-radius bottom-only, font 8px.

### 4.10 Módulo Dashboard

- Stat cards: clientes, visitas, cobros, pedidos.
- Gráfica de ventas por período.
- Cobros pendientes con estado de color.
- Filtro por día/mes/año.
- Export a Excel con encabezado.
- `.btn-export`: margin-bottom 20px.
- `.chart-header`: flex-wrap wrap en mobile.

### 4.11 Módulo Visitas

- Tabla de visitas con 15 columnas.
- Upload de menú/doc para análisis ClienteListo.
- Filtros por fecha.
- Export con plantilla personalizada (openpyxl).
- Auto-estatus: Pedido=Sí → "Cliente activo", Próximo_Paso=Cobro → "Cobro".
- `.header-actions`: flex-wrap wrap en mobile.

### 4.12 Módulo Clientes

- Directorio de clientes con embudo de ventas (Etapa_Embudo).
- Crear/editar clientes desde el CRM.
- Ficha con productos específicos del catálogo.
- Cobro directo desde la ficha.
- Auto-estatus desde visitas.

### 4.13 Validador estático de reportes (`scripts/validate-report.sh`)

Herramienta (132 líneas, bash + python3 heredoc) que verifica las reglas mecánicas de `corrections.md`:

- **BOLD:** nombre del producto + códigos + empaque en negrita.
- **SPACING:** línea en blanco entre entradas.
- **PITCH:** máximo 5 líneas.
- **BAN:** prohibición de términos de costo.
- **MARKS:** exactamente una marca `(explícito)` o `(inferido)` por entrada.

### 4.14 Smoke test del pipeline (`scripts/smoke-test.sh`)

Test de regresión determinístico (208 líneas) en sandbox temporal:

1. Sintaxis bash.
2. Extracción PDF (pdftotext).
3. Extracción PNG (Tesseract).
4. Conversión docx.
5. Validación docx.
6. Reglas de correcciones.

### 4.15 OpenSpec (Spec-Driven Development)

- **`openspec/config.yaml`**: contexto del proyecto, testing, reglas SDD.
- **Specs:** `pipeline-smoke-test` (9 req, 14 escenarios), `corrections` (10 req, 16 escenarios).
- **Cambios archivados:** pipeline-smoke-test (PASS), corrections-rules (PASS).

### 4.16 Ajustes CSS mobile (acumulado)

| Componente | Cambio |
|---|---|
| `.header-actions` (VisitasView, NotasView) | `flex-wrap: wrap` |
| `.chart-header` (DashboardView) | `flex-wrap: wrap` |
| `.btn-create` (NotasView) | `border-radius: 100%`, texto eliminado |
| Tab bar mobile (Sidebar) | Labels ocultos, solo íconos + Config |
| `.cal-title` (CitasView) | `font-size: 16px; text-align: center` |
| `.badge` (CitasView) | 25×14px, bottom-rounded, font 8px |
| `.btn-export` (DashboardView) | `margin-bottom: 20px` |
| `.btn-convert` (NotasView) | `font-size: 10px` |

### 4.17 Configuración y arranque

- **`.gitignore`** extendido: protege `visitas/`, `exports/`, `.smoke-test.*`, `.atl/`.
- **`.env`**: `GEMINI_API_KEY` para integración con agente IA.
- **Arranque:** `node server/index.mjs` con `--env-file=.env`, port 8787. Vite dev en 5173.
- **Playwright:** chromium en `/usr/bin/chromium` para testing visual.

---

## 5. Estado actual

- **Git:** rama `main` sincronizada con `origin/main`.
- **Working tree:** 4 archivos modificados sin commitear, 3 elementos sin trackear.
- **Frontend:** Vue 3 funcional, 64 módulos, build limpio. Conectado a backend Express con datos reales.
- **Backend:** 30+ endpoints REST, agente IA integration, Excel export, usuario CRUD.
- **Activos locales:** catálogo real, modelo OCR español, template Word, tipografía Satoshi, `.env` configurado.
- **OpenSpec:** 2 cambios archivados (pipeline-smoke-test, corrections-rules), specs sincronizados.
- **No versionado por diseño:** catálogo real, menús de clientes, reportes, `.env`, memoria Engram, frontend completo.

---

## 6. Pendientes / próximos pasos

- **Reiniciar server** para que los endpoints `/api/usuario` funcionen (nuevos, server viejo corriendo).
- **Probar flujo completo** de guardar nombre + foto en ConfigPanel (necesita server restart).
- **Versionar el frontend** — decidir si se sube tal cual o se limpia primero.
- **Scripts de conversión Excel ↔ JSON** — documentados en `STRUCTURE.md` pero aún no implementados.
- **Agregar precios al catálogo** — diferido: justificación basada solo en necesidad y conveniencia.
- **Sincronización con Google Calendar** — pendiente de definir dirección.
- **Próximos clientes:** repetir el flujo `./scripts/run-analysis.sh <menú>` + `./scripts/convert-report.sh <reporte.md>`.

---

*Reporte actualizado — 2026-08-23.*
