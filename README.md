# ClienteListo — Asistente de Estrategia de Ventas para Restaurantes

Herramienta para vendedores que elimina la fricción de venta de tu catálogo para cualquier restaurante. Tomas una imagen o un PDF del menú de un restaurante, subes tu base de datos de productos, y el agente se encarga del resto: identifica los platos, obtiene los ingredientes de cada uno, los compara contra los productos de tu catálogo y genera un documento Word fácil de leer y organizado, listo para venderle productos específicos de tu catálogo al cliente.

Todo corre local y con herramientas gratuitas. Cada quien conecta su propia API y su propio catálogo — nada de eso viene incluido en este repo.

## ¿Cómo funciona?

1. Colocas una imagen o un PDF del menú del restaurante en `menus/`.
2. El script extrae el texto (PDF con capa de texto → `pdftotext`; imagen o PDF escaneado → OCR con Tesseract) y lo guarda en `data-json/`.
3. El agente analiza el menú: configura cada plato y obtiene los ingredientes que usa (marca como "explícito" lo que dice el menú y como "inferido" lo que deduce con criterio culinario).
4. Compara esos ingredientes contra los productos de tu base de datos y clasifica cada uno:
   - **Match directo** → producto a ofrecer, con el plato del que viene la necesidad.
   - **Match posible** → sustituto o match parcial, explicando la diferencia.
   - **Sin match** → gap, oportunidad de negocio a evaluar (no venta inmediata).
5. Genera un reporte de estrategia en `reports/` con los productos recomendados, organizado por producto, empaque y justificación de venta.
6. Convierte el reporte a Word (`.docx`) en `reportsDocx/`: el documento final, limpio y listo para la conversación comercial con el restaurante.

## Requisitos

- [opencode](https://opencode.ai) — agente de terminal que ejecuta el análisis.
- Una API key gratuita de un proveedor soportado por opencode (ej.
  [Google Gemini](https://aistudio.google.com/apikey), sin tarjeta de crédito).
- [Engram](https://github.com/Gentleman-Programming/engram) — servidor MCP de
  memoria persistente, para que el agente aprenda patrones entre reportes.
- [Pandoc](https://pandoc.org/installing.html) — para convertir el reporte a
  Word (.docx).

## Instalación

```bash
git clone <tu-repo> clientelisto
cd clientelisto
./scripts/install.sh
```

El script verifica que tengas las dependencias, y crea `.env` y
`catalogo-data-base/catalog.json` a partir de los archivos de ejemplo.

Luego:

1. Edita `.env` con tu API key.
2. Reemplaza `catalogo-data-base/catalog.json` con tu catálogo real de
   productos (mismo formato que `catalogo-data-base/catalog.example.json`).
3. Configura opencode con tu proveedor de IA (`opencode auth login` o variables
   de entorno según el proveedor que elijas).
4. Configura Engram como servidor MCP en opencode (ver su documentación).

## Uso

```bash
# 1. Coloca el menú (imagen o PDF) en menus/
cp ~/Descargas/menu-restaurante.jpg menus/imagen-menu.jpg

# 2. Corre el análisis: extrae el texto, matchea contra tu catálogo
#    y genera el reporte .md en reports/
./scripts/run-analysis.sh menus/imagen-menu.jpg

# 3. Convierte el reporte a Word (se guarda en reportsDocx/)
./scripts/convert-report.sh reports/AAAA-MM-DD_imagen-menu.md
```

## Estructura del proyecto

```
.
├── AGENTS.md              # instrucciones y proceso del agente
├── corrections.md         # reglas fijas que el agente siempre respeta
├── catalogo-data-base/
│   ├── catalog.example.json  # estructura del catálogo (sin datos reales)
│   └── catalog.json          # tu catálogo real (creado por install.sh, ignorado por git)
├── .env.example           # variables de entorno de ejemplo
├── menus/                 # menús a analizar (ignorado por git)
├── reports/                # reportes .md generados (ignorado por git)
├── reportsDocx/            # reportes convertidos a .docx (ignorado por git)
├── templates/
│   └── reference.docx     # (opcional) estilo/logo para los Word generados
└── scripts/
    ├── install.sh
    ├── run-analysis.sh
    └── convert-report.sh
```

## Cómo mejora con el uso

Cada vez que corriges algo del reporte (un match mal hecho, una estrategia que
no aplicaba), el agente guarda ese aprendizaje en Engram para las próximas
corridas. Las correcciones que deben aplicarse SIEMPRE (no solo cuando el
agente las "recuerda" relevantes) van directo en `corrections.md`.
