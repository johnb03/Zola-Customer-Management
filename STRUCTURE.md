# Zola Customer Management — Estructura del proyecto (fork)

Basado en la estructura de ClienteListo, extendido con los módulos del CRM.
Regla de arquitectura general: **todo lo que entra se compila a JSON interno
antes de que el sistema lo use; todo lo que sale (reportes, listas, rutas)
se genera en Excel.**

```
zola-crm/
├── AGENTS.md                  # instrucciones del agente (todos los módulos)
├── DESIGN.md                  # paleta, tipografía, layout
├── corrections.md             # reglas fijas del agente (heredado de ClienteListo)
│
├── catalogo-data-base/
│   ├── catalog.example.xlsx   # plantilla de catálogo
│   └── catalog.json           # generado internamente, no se edita a mano
│
├── clientes/
│   ├── clientes.example.xlsx  # plantilla: ID_Cliente, Nombre, Telefono,
│   │                          # Email, Etapa_Embudo, Fecha_Registro, Notas
│   └── clientes.json          # generado internamente
│
├── visitas/
│   ├── visitas.example.xlsx   # plantilla con las 15 columnas del reporte
│   └── visitas.json           # generado internamente
│
├── citas/
│   └── citas.json             # citas de la Agenda (CRUD interno + automáticas desde visitas)
│
├── data-json/                 # texto de menús extraído (heredado de ClienteListo)
├── menus/                     # menús de clientes a analizar
├── reports/                   # reportes de estrategia (.md)
├── reportsDocx/                # reportes convertidos a Word (.docx)
├── exports/                   # TODAS las salidas Excel: reportes filtrados
│                              # del dashboard, listas de clientes, rutas
├── templates/
│   └── reference.docx         # estilo Word (heredado de ClienteListo)
├── assets/
│   └── fonts/satoshi/          # archivos de la tipografía Satoshi
│
└── scripts/
    ├── install.sh
    ├── extract-text.sh         # heredado de ClienteListo
    ├── run-analysis.sh         # heredado de ClienteListo
    ├── convert-report.sh       # heredado de ClienteListo
    ├── excel-to-json.sh        # NUEVO — compila cualquier Excel de entrada a JSON
    └── json-to-excel.sh        # NUEVO — genera Excel de salida desde JSON
```

## Notas sobre las carpetas nuevas

- **`clientes/`, `visitas/`, `citas/`** siguen el mismo patrón que
  `catalogo-data-base/`: un Excel de ejemplo versionado en git, el archivo
  real ignorado por `.gitignore` (información comercial privada), y un
  `.json` generado que es la única fuente que lee el resto del sistema
  (Dashboard, agente, exportaciones).
- **`exports/`** es nueva — centraliza toda salida en Excel para envío
  externo, separada de `reports/`/`reportsDocx/` (que son específicos del
  reporte de estrategia de ClienteListo, no del CRM en general).
- **`scripts/excel-to-json.sh`** y **`scripts/json-to-excel.sh`** son los
  dos scripts que implementan la regla de arquitectura: cualquier módulo
  nuevo (Dashboard, Clientes, Visitas, Citas) los reutiliza en vez de tener
  su propia lógica de conversión.

Este es un fork del proyecto ClienteListo actual — se prueba aparte y no
reemplaza el proyecto funcionando hasta que el CRM esté validado.
