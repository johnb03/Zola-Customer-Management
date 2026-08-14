# Reporte de Actualizaciones — ClienteListo

**Fecha del reporte:** 2026-08-08 (actualizado: 2026-08-11)
**Proyecto:** `~/Projects/ClienteListo`
**Fuente:** revisión del repositorio (historial Git, archivos del proyecto, datos locales de ejecución)

> **Alcance:** este reporte documenta SOLO cambios importantes del proyecto (herramientas, reglas, decisiones de estructura). NO incluye análisis de clientes específicos — esos viven en `reports/` y `reportsDocx/`.

---

## 1. Resumen

ClienteListo es un **asistente local de estrategia de ventas para restaurantes**. Toma el menú de un restaurante (imagen o PDF), extrae su texto, lo compara contra el catálogo de productos del vendedor y genera un reporte con qué productos ofrecerle al cliente y por qué, en formato Markdown y Word (`.docx`). Todo corre local, con herramientas gratuitas y conectar la propia API y el propio catálogo de cada usuario.

**Flujo actual implementado:**

1. `scripts/extract-text.sh` — extrae el texto del menú (PDF con capa de texto → `pdftotext`; PDF escaneado o imagen → OCR Tesseract) y lo guarda como JSON en `data-json/`.
2. `scripts/run-analysis.sh` — lanza el agente (opencode) con el texto extraído, `AGENTS.md`, `corrections.md` y el catálogo; el agente identifica platos e ingredientes, consulta memoria (Engram), matchea contra el catálogo y genera la estrategia de venta en `reports/`.
3. `scripts/convert-report.sh` — convierte el reporte a Word (`reportsDocx/`) con Pandoc, aplicando el estilo de `templates/reference.docx` y las reglas de formato de `corrections.md`.

---

## 2. Historial de cambios (Git)

| Commit | Fecha | Autor | Descripción |
|---|---|---|---|
| `59d9e96` | 2026-08-04 | John Berroa | **Initial commit** — solo `LICENSE` (21 líneas). |
| `35a302e` | 2026-08-04 | john berroa | **chore: initial commit for ClienteListo sales strategy assistant** — andamiaje completo del proyecto: 16 archivos, +577 líneas (AGENTS.md, README.md, corrections.md, 4 scripts, catálogo de ejemplo, env.example, .gitignore, template Word, datos OCR español). |

**Estado del repo:** rama `main` sincronizada con `origin/main`, working tree limpio.

> **Importante:** el historial de Git contiene solo el andamiaje del proyecto. Los datos reales de operación (catálogo real, menús y reportes de clientes) **no están versionados a propósito** — `.gitignore` excluye la información comercial privada (ver sección 4.1).

---

## 3. Estructura del proyecto

| Ruta | Función |
|---|---|
| `AGENTS.md` | Instrucciones del agente: rol, proceso en 7 pasos, formato de reporte, uso de memoria. |
| `corrections.md` | Reglas fijas que el agente respeta SIEMPRE en cada análisis. |
| `README.md` | Documentación de instalación y uso. |
| `catalogo-data-base/` | Catálogo de productos en JSON (`catalog.example.json` versionado; catálogo real ignorado). |
| `data-json/` | Texto de menús extraído (JSON), listo para el modelo. |
| `menus/` | Menús de clientes a analizar (imagen/PDF). |
| `reports/` | Reportes de estrategia generados (`.md`). |
| `reportsDocx/` | Reportes convertidos a Word (`.docx`). |
| `scripts/` | `install.sh`, `extract-text.sh`, `run-analysis.sh`, `convert-report.sh`. |
| `templates/reference.docx` | Plantilla opcional de estilo para los Word generados. |
| `tessdata/spa.traineddata` | Modelo OCR español de Tesseract (funciona sin instalarlo como root). |
| `.env` / `env.example` | Config local: `OPENCODE_MODEL` (vacío → usa el default de opencode) y `CATALOG_PATH`. |
| `.gitignore` | Excluye `.env`, catálogo real, menús, `data-json`, `reports`, `reportsDocx` y memoria Engram. |

---

## 4. Cambios por componente

### 4.1 Configuración y arranque

- **`scripts/install.sh`**: verifica que `opencode` y `pandoc` estén instalados; crea `.env` y `catalogo-data-base/catalog.json` a partir de los ejemplos, sin sobrescribir si ya existen.
- **`env.example` / `.env`**: la autenticación del modelo se configura en opencode, no en `.env`; `OPENCODE_MODEL` permite forzar un modelo específico; `CATALOG_PATH` apunta al catálogo real.
- **`.gitignore`**: protege información comercial (catálogo real, menús, reportes de clientes, `.env`) y la memoria de Engram; conserva los `.gitkeep` y el catálogo de ejemplo.

### 4.2 Extracción de texto (`scripts/extract-text.sh`)

- Detecta si un PDF tiene capa de texto real (`pdftotext -layout`); si sale muy poco texto, asume PDF escaneado y usa OCR con `pdftoppm` + Tesseract.
- OCR en **español + inglés** usando el modelo local `tessdata/spa.traineddata` (sin permisos de root); si no está, cae al idioma del sistema o a inglés.
- Guarda el resultado en `data-json/<nombre>.json` con `source_file`, `extraction_method` y `text` — el modelo nunca lee el PDF/imagen original, para no gastar tokens de imagen.

### 4.3 Análisis (`scripts/run-analysis.sh`)

- Ejecuta la extracción, carga `.env`, y lanza `opencode run` adjuntando el JSON extraído, `AGENTS.md`, `corrections.md` y el catálogo (`--dangerously-skip-permissions`).
- El agente: extrae platos e ingredientes (marca **explícito** lo que dice el menú e **inferido** lo que deduce), consulta memoria Engram, matchea contra el catálogo (**match directo / match posible / gap**) y genera la estrategia con pitch de venta.

### 4.4 Generación de Word (`scripts/convert-report.sh`)

- Pandoc con `--reference-doc=templates/reference.docx` si la plantilla existe.
- **Post-procesado en Python** sobre el XML del `.docx`: inyecta `w:spacing w:after="160"` en los párrafos de lista, porque Pandoc descarta el espaciado del reference-doc — así se cumple la regla de formato de `corrections.md` (línea en blanco entre entradas).

### 4.5 Reglas del agente (`AGENTS.md` + `corrections.md`)

- **Matching:** `"salsa de tomate"` NUNCA matchea con `"puré de tomate concentrado"` — son productos distintos en preparación y uso.
- **Estrategia:** el catálogo no tiene precios → el reporte NUNCA menciona precio de mayoreo, descuentos ni ahorro; la justificación se basa en necesidad del ingrediente y conveniencia operativa.
- **Formato:** nombre del producto + códigos + empaque en **negrita**; línea en blanco entre entradas de lista; pitch sugerido de máximo 5 líneas.
- **Memoria (Engram):** buscar patrones antes de generar; guardar correcciones con tags (`matching`, `estrategia`, `formato`); no guardar datos específicos de un solo menú; las reglas "siempre" van a `corrections.md`, no a memoria.

---

## 5. Estado actual

- Working tree limpio; `main` sincronizada con `origin/main`.
- Activos locales presentes: catálogo real, modelo OCR español, template Word, `.env` configurado (sin modelo forzado → usa el default de opencode).
- **No versionado por diseño (información comercial):** catálogo real, menús de clientes, textos extraídos, reportes `.md` y `.docx`, `.env`, memoria Engram.

---

## 6. Pendientes / próximos pasos

- **Agregar precios al catálogo** — diferido: por ahora el catálogo sigue sin precios y la justificación de venta continúa basándose solo en necesidad del ingrediente y conveniencia operativa (ya previsto en `AGENTS.md` y `corrections.md`).
- **Consolidar correcciones del vendedor** (matching/estrategia/formato) en `corrections.md` o memoria Engram si se reportan.
- **Próximos clientes:** repetir el flujo `./scripts/run-analysis.sh <menú>` + `./scripts/convert-report.sh <reporte.md>`.

---

*Reporte generado por revisión directa del repositorio y los artefactos locales el 2026-08-08.*
