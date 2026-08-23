# Zola Customer Management — Guía de Diseño

Dirección: vitrina de mercancía fina — despensa/bodega premium, no dashboard
corporativo genérico. La paleta se inspira en lo que Zola vende (vinos,
aceites, productos gourmet): dorado envejecido de etiqueta de vino, burdeos
profundo, fondo cálido oscuro tipo espresso.

## Color

| Token | Hex | Uso |
|---|---|---|
| `--bg-base` | `#15100D` | Fondo general de la app |
| `--bg-surface` | `#1F1811` | Tarjetas, paneles |
| `--bg-elevated` | `#2A2118` | Hover, elementos elevados, sidebar activo |
| `--accent-gold` | `#C9A227` | Acento primario — CTA, líneas de sección, marca |
| `--accent-wine` | `#7A1F2B` | Acento secundario — énfasis, elementos de marca |
| `--text-primary` | `#EDE6D8` | Texto principal |
| `--text-secondary` | `#A89A85` | Texto secundario, metadatos |
| `--border` | `#3A2E22` | Bordes, divisores |
| `--status-success` | `#6B8F47` | Al día / pedido confirmado (oliva, no verde genérico) |
| `--status-warning` | `#C98A3B` | Cobro esta semana / pendiente |
| `--status-danger` | `#A8433A` | Cobro atrasado / sin pedido (óxido, no rojo genérico) |

No usar negro puro (`#000`) ni blanco puro (`#FFF`) en ningún elemento —
siempre los tonos cálidos definidos arriba, para mantener la sensación de
"madera oscura + dorado" en vez de "pantalla apagada".

## Tipografía

Una sola familia — **Satoshi** — variando peso y tracking para crear
jerarquía, en vez de mezclar fuentes:

| Rol | Peso | Uso |
|---|---|---|
| Display | Satoshi Black / Bold | Títulos de sección, nombre de cliente en ficha |
| Subtítulo | Satoshi Medium | Encabezados de tarjeta, botones |
| Cuerpo | Satoshi Regular | Texto general, notas |
| Datos | Satoshi Medium + `font-variant-numeric: tabular-nums` | Tablas: IDs, fechas, montos — para que las columnas numéricas alineen limpio |

Escala tipográfica sugerida: 32px (display) / 20px (subtítulo) / 15px
(cuerpo) / 13px (metadatos y datos de tabla).

## Layout

- **Panel de control fijo a la izquierda** (`--bg-elevated`), íconos +
  etiqueta de cada módulo: **ClienteListo** (subir menú/carta/listado y ver
  el reporte generado), **Dashboard**, **Reporte de Visitas**, **Clientes**,
  **Agenda**. El módulo activo se marca con una línea dorada
  vertical a la izquierda del ítem, no con un fondo genérico resaltado.
- **Mobile:** el panel colapsa a una barra inferior de íconos (tab bar),
  no a un menú hamburguesa oculto — dado que se usa en campo (visitas,
  rutas), el acceso a los módulos debe ser de un toque, siempre visible.
- **Tarjetas** con esquinas suaves (12px), fondo `--bg-surface`, borde
  `--border` de 0.5px — sin sombras pesadas, la separación se logra con
  color y espacio, no con drop-shadow.

## Elemento de firma

Una línea dorada delgada (1px, `--accent-gold`, con leve degradado hacia
transparente en los extremos) bajo cada encabezado de sección — evoca el
subrayado de un libro de contabilidad o una etiqueta de vino, y le da
identidad sin necesitar decoración adicional. Los puntos de estado
(al día / esta semana / atrasado) usan los tres colores de status definidos
arriba, consistentes en todos los módulos.

## Fuente de la tipografía

Los archivos de Satoshi ya están disponibles localmente — al implementar,
referenciar `@font-face` a esos archivos en vez de cargar desde un CDN, para
mantener el proyecto funcionando sin conexión.
