# Zola Customer Management — Frontend (Fase 1)

Instrucciones para construir la interfaz. Esta fase es **solo frontend**,
sin backend real todavía — usa datos de ejemplo, no los archivos reales del
proyecto. El objetivo es validar la experiencia completa (navegación entre
módulos, look & feel) antes de conectar nada.

## Stack

- **Vue 3 + Vite** — proyecto nuevo (`npm create vite@latest . -- --template vue`).
- **Vue Router** — una ruta por módulo del sidebar.
- **Vanilla CSS** — NO usar Tailwind ni ningún framework de utilidades.
  Los estilos van en CSS normal, organizados por componente
  (`<style scoped>` en cada `.vue`, o archivos `.css` junto al componente).
  Las variables de `DESIGN.md` se definen UNA vez como CSS custom
  properties globales (ver abajo) y se consumen con `var(--token)` en
  cualquier estilo — así se mantiene consistencia sin un framework.
- **`vite-plugin-pwa`** — configurar desde el inicio (manifest con nombre
  "Zola", ícono, colores del tema tomados de `DESIGN.md`), aunque en esta
  fase no haya datos reales que cachear.
- Sin backend, sin llamadas a API, sin conexión a `data-json/` ni a
  ningún archivo del proyecto ClienteListo todavía.

## Variables globales de diseño

Crear un archivo `src/styles/tokens.css`, importado una sola vez en
`main.js`, con las variables de `DESIGN.md` (no inventar valores nuevos,
usar exactamente estos):

```css
:root {
  --bg-base: #15100D;
  --bg-surface: #1F1811;
  --bg-elevated: #2A2118;
  --accent-gold: #C9A227;
  --accent-wine: #7A1F2B;
  --text-primary: #EDE6D8;
  --text-secondary: #A89A85;
  --border: #3A2E22;
  --status-success: #6B8F47;
  --status-warning: #C98A3B;
  --status-danger: #A8433A;

  --font-display: 'Satoshi', -apple-system, sans-serif;
  --radius: 12px;
}
```

Los archivos de la fuente Satoshi (ya disponibles localmente) se referencian
con `@font-face` en este mismo archivo — no cargar desde Google Fonts ni
ningún CDN externo, el proyecto debe funcionar sin conexión.

## Estructura de carpetas del frontend

```
frontend/
├── index.html
├── vite.config.js          # incluye vite-plugin-pwa
├── src/
│   ├── main.js
│   ├── App.vue             # layout: sidebar + <router-view>
│   ├── router/
│   │   └── index.js
│   ├── styles/
│   │   └── tokens.css
│   ├── components/
│   │   ├── Sidebar.vue
│   │   ├── StatCard.vue
│   │   └── StatusDot.vue   # los 3 colores de estado, reutilizable
│   ├── views/
│   │   ├── ClienteListoView.vue
│   │   ├── DashboardView.vue
│   │   ├── VisitasView.vue
│   │   ├── ClientesView.vue
│   │   └── CitasView.vue
│   └── data/
│       └── ejemplo.js      # datos de ejemplo (clientes, visitas ficticias)
```

## Las 5 pantallas

1. **ClienteListo** — zona de subir el documento (menú/carta/listado) y ver
   el reporte más reciente generado. En esta fase: solo el diseño de la
   pantalla y un botón de "subir" que no hace nada real todavía.
2. **Dashboard** — tarjetas de estadísticas, gráfica simple de barras
   (visitas por zona), lista de próximos cobros, botón "Exportar vista a
   Excel" (sin funcionalidad real aún). Ya validado visualmente en el
   mockup previo — replicar esa estructura en Vue real.
3. **Reporte de Visitas** — tabla/lista de visitas de ejemplo con las
   columnas: Fecha, Vendedor, Establecimiento, Pedido (Sí/No),
   Próximo paso. No hace falta mostrar las 15 columnas completas en la
   vista principal — priorizar legibilidad, el resto puede ir en un detalle
   expandible.
4. **Clientes** — lista de clientes con punto de estado (verde/ámbar/rojo)
   + ficha de detalle al seleccionar uno (como el mockup ya mostrado:
   resumen, productos vendidos del catálogo, notas, botón "agregar a ruta
   de hoy").
5. **Agendar Citas** — vista simple de calendario o lista de próximas
   citas de ejemplo. Sin integración real a Google Calendar en esta fase.

## Qué NO hacer en esta fase

- No conectar a ningún archivo real del proyecto (`data-json/`,
  `clientes/`, `visitas/`, `catalogo-data-base/`).
- No implementar lógica de negocio real (comparación con catálogo, cálculo
  de rutas, exportación real a Excel).
- No usar Tailwind, Bootstrap, ni ningún framework CSS.
- No cargar tipografías ni íconos desde un CDN externo.

## Objetivo de esta fase

Una app Vue navegable, instalable como PWA, con las 5 pantallas construidas
con el lenguaje visual de `DESIGN.md` y datos de ejemplo — lista para que el
usuario la revise y apruebe la experiencia antes de conectar el backend real
y los datos verdaderos del proyecto.
