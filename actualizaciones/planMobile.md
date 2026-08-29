# Plan: Zola como app independiente (backend offline, solo IA online)

**Fecha:** 2026-08-23
**Objetivo:** Convertir Zola en una app que funcione desde el teléfono sin servidor aparte, con datos locales y solo conexión a internet para el agente de IA.

---

## 1. Arquitectura actual vs. target

| | Actual | Target |
|---|---|---|
| **Backend** | Express en PC (`server/index.mjs`) | N/A — lógica en el frontend |
| **Almacenamiento** | JSON files en disco (`DATA_HOME`) | IndexedDB en el navegador |
| **IA** | Backend llama a proveedor IA | Frontend llama directamente (key del usuario) |
| **Excel** | `exceljs` server-side | `exceljs` browser-side (funciona igual) |
| **Fotos** | Archivos en disco + endpoint | IndexedDB (base64/blob) |
| **Instalación** | Clone + install.sh + pnpm server | Abrir URL → "Agregar a pantalla de inicio" |
| **Acceso** | `localhost:5173` | Cualquier lugar (hosting estático) |

---

## 2. Limitación clave

El frontend necesita **un servidor HTTP** para servir los archivos (HTML/JS/CSS). Pero NO necesita un backend Node.js corriendo — la lógica se ejecuta en el navegador del teléfono.

### Opciones para servir la app

| Opción | Costo | Accesible desde | Requiere PC encendida |
|---|---|---|---|
| **Hosting estático** (GitHub Pages, Netlify, Vercel, Cloudflare Pages) | Gratis | Cualquier lugar | No |
| **VPS mínimo** (DigitalOcean, Hetzner) | $5/mes | Cualquier lugar | No |
| **PC encendida + `vite preview`** | Gratis | Solo WiFi local | Sí |

**Recomendación:** Hosting estático — gratis, sin PC encendida, accesible desde cualquier lugar.

---

## 3. Fase 1: Capa de datos client-side

Crear `frontend/src/db.js` — módulo que reemplaza `api.js`:

```
api.js (actual)          →    db.js (nuevo)
─────────────────────────     ──────────────────
fetch('/api/clientes')   →    db.clientes.getAll()
fetch('/api/visitas')    →    db.visitas.getAll()
fetch('/api/notas')      →    db.notas.getAll()
fetch('/api/citas')      →    db.citas.getAll()
fetch('/api/usuario')    →    db.usuario.get()
fetch('/api/catalogo')   →    db.catalogo.get()
POST /api/clientes       →    db.clientes.save(data)
PATCH /api/visitas/:id   →    db.visitas.update(id, data)
DELETE /api/citas/:id    →    db.citas.delete(id)
```

**Almacenamiento:** IndexedDB con wrapper simple (vanilla JS, sin librería externa).

**Archivos a crear:**
- `frontend/src/db.js` — capa de datos (IndexedDB CRUD)

**Archivos a modificar:**
- `frontend/src/api.js` — reescribir para que llame a `db.js` en vez de `/api/*`
- `frontend/src/store.js` — usar `db.usuario` en vez de `getUsuario()`

---

## 4. Fase 2: Agente de IA browser-side

Mover `callAgente()` de `server/index.mjs` a `frontend/src/agente.js`:

```js
// agente.js — multi-proveedor (Gemini, Claude, ChatGPT, DeepSeek, custom)
const STORAGE_PROVIDER = 'zola_agente_provider'
const STORAGE_KEY = 'zola_agente_key'
const STORAGE_MODEL = 'zola_agente_model'
const STORAGE_BASE_URL = 'zola_agente_base_url'

export const setAgenteConfig = ({ provider, apiKey, model, baseUrl }) => { ... }

export const callAgente = async (prompt) => {
  const { provider, apiKey, model, baseUrl } = getAgenteConfig()
  // Routing por provider: Gemini format / Claude format / OpenAI format
}
```

**Archivos a crear:**
- `frontend/src/agente.js`

**Archivos a modificar:**
- `frontend/src/views/NotasView.vue` — usar `callAgente` directamente en vez de `POST /api/notas/:id/convertir`
- `frontend/src/views/DatosView.vue` — usar `callAgente` para análisis de plantillas

---

## 5. Fase 3: Excel client-side

`exceljs` funciona en el navegador. Cambiar los endpoints de export:

**Archivos a modificar:**
- `frontend/src/views/VisitasView.vue` — generar Excel en el browser con `exceljs`
- `frontend/src/views/DashboardView.vue` — generar Excel en el browser

---

## 6. Fase 4: Fotos y archivos

- **Foto de usuario:** base64 en IndexedDB (max 5MB)
- **Menús subidos:** Blob en IndexedDB
- **Plantilla de reporte:** ArrayBuffer en IndexedDB

---

## 7. Fase 5: Migración de datos

Crear herramienta de importación para mover datos existentes del servidor al navegador:

- `frontend/src/views/DatosView.vue` — agregar botón "Importar datos del servidor"
- Exporta los JSON del servidor como descarga, el usuario los importa en el teléfono

---

## 8. Fase 6: Configuración de API key

Crear pantalla de setup首次:

- `frontend/src/components/SetupScreen.vue` — configura proveedor de IA, modelo y API key, la guarda en localStorage
- Se muestra solo si no hay key configurada

---

## 9. Fase 7: PWA y hosting

- Configurar service worker para cache completo de la app
- Build: `pnpm build` → carpeta `dist/`
- Subir `dist/` a hosting estático (GitHub Pages, Netlify, etc.)

---

## 10. Resumen de archivos

### Crear (5)

| Archivo | Función |
|---|---|
| `frontend/src/db.js` | Capa de datos IndexedDB |
| `frontend/src/agente.js` | Cliente agente IA browser-side (multi-proveedor) |
| `frontend/src/components/SetupScreen.vue` | Setup de API key |
| `frontend/src/utils/excel.js` | Generación Excel client-side |
| `frontend/src/utils/import.js` | Importación de datos del servidor |

### Modificar (8)

| Archivo | Cambio |
|---|---|
| `frontend/src/api.js` | Reescribir → llama a `db.js` |
| `frontend/src/store.js` | Usar `db.usuario` |
| `frontend/src/views/NotasView.vue` | Agente IA directo desde browser |
| `frontend/src/views/VisitasView.vue` | Excel client-side |
| `frontend/src/views/DashboardView.vue` | Excel client-side |
| `frontend/src/views/DatosView.vue` | Import + agente IA directo |
| `frontend/src/App.vue` | Setup screen首次 |
| `frontend/vite.config.js` | PWA config mejorado |

### Eliminar (1)

| Archivo | Razón |
|---|---|
| `frontend/server/index.mjs` | Ya no se necesita backend |

---

## 11. Orden de implementación

1. `db.js` + refactor `api.js` (base de todo)
2. `agente.js` + refactor NotasView/DatosView
3. Excel client-side (VisitasView, DashboardView)
4. Fotos + archivos en IndexedDB
5. Setup screen首次
6. Migración de datos
7. PWA + hosting

---

*Plan creado — 2026-08-23.*
