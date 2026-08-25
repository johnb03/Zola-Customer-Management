// Zola backend mínimo — lee y ejecuta sobre los directorios de datos de ClienteListo (DATA_HOME).
// Uso: DATA_HOME=/home/job/Projects/ClienteListo node server/index.mjs
import express from 'express'
import multer from 'multer'
import ExcelJS from 'exceljs'
import { execFile } from 'node:child_process'
import { promises as fs, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const app = express()
const PORT = process.env.PORT || 8787
const DATA_HOME = process.env.DATA_HOME || '/home/job/Projects/ClienteListo'

// --- Utilidades de rutas seguras -------------------------------------------------

const resolveSafe = (base, rel) => {
  const resolved = path.resolve(base, rel)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw Object.assign(new Error('Ruta fuera de DATA_HOME'), { status: 400 })
  }
  return resolved
}

const safeJoin = (dir, name) => resolveSafe(DATA_HOME, path.join(dir, String(name).replace(/[\\/]/g, '')))

const readJson = async (rel) => {
  const file = resolveSafe(DATA_HOME, rel)
  const raw = await fs.readFile(file, 'utf-8')
  return JSON.parse(raw)
}

const readJsonIfExists = async (rel) => {
  try {
    return await readJson(rel)
  } catch {
    return null
  }
}

const listDir = async (dir, extension) => {
  const full = path.join(DATA_HOME, dir)
  try {
    const entries = await fs.readdir(full, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(extension))
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

const readJsonArray = async (rel) => {
  const data = await readJsonIfExists(rel)
  return Array.isArray(data) ? data : []
}

const writeJson = async (rel, data) => {
  const target = resolveSafe(DATA_HOME, rel)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify(data, null, 2), 'utf-8')
}

const pad3 = (n) => String(n).padStart(3, '0')

const pad2 = (n) => String(n).padStart(2, '0')

// Next zero-padded sequence number given existing records (count, or max numeric ID suffix).
const nextSeq = (existing, idKey, prefix) => {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`)
  let max = existing.length
  for (const rec of existing) {
    const id = rec && typeof rec === 'object' ? rec[idKey] : null
    const m = typeof id === 'string' ? re.exec(id) : null
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

const parseDateFromText = (text) => {
  const s = String(text || '')
  let m
  if ((m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`
  if ((m = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s))) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`
  if ((m = /(\d{1,2})[/-](\d{1,2})/.exec(s))) return `${new Date().getFullYear()}-${pad2(m[2])}-${pad2(m[1])}`
  return null
}

const catalogProductNames = async () => {
  const file = catalogPath()
  if (!file) return []
  const catalog = await readJsonIfExists(path.relative(DATA_HOME, file))
  if (!catalog) return []
  const categorias = catalog.categorias || {}
  const names = []
  for (const list of Object.values(categorias)) {
    if (Array.isArray(list)) {
      for (const p of list) {
        if (p && p.nombre) names.push(String(p.nombre).toLowerCase())
      }
    }
  }
  return names
}

const buildVisitaRecord = (fila, encabezado, id) => ({
  ID_Visita: id,
  Fecha: String(encabezado.fecha || ''),
  Hora_Visita: String(fila.hora_visita || ''),
  Vendedor: String(encabezado.vendedor || ''),
  Zona_Ruta: String(encabezado.zona_ruta || ''),
  Supervisor: String(encabezado.supervisor || ''),
  Establecimiento: String(fila.establecimiento || ''),
  Tipo_Negocio: String(fila.tipo_negocio || ''),
  Direccion: String(fila.direccion || ''),
  Persona_Contactada: String(fila.persona_contactada || ''),
  Productos_Presentados: String(fila.productos_presentados || ''),
  Pedido: String(fila.pedido || ''),
  Detalle_Pedido: String(fila.detalle_pedido || ''),
  Monto: String(fila.monto ?? ''),
  Comentarios: String(fila.comentarios || ''),
  Proximo_Paso: String(fila.proximo_paso || ''),
})

// --- Auto-estatus desde visitas ------------------------------------------------
// Cuando se guardan visitas, actualiza el Etapa_Embudo del cliente matcheado.
// Pedido=Sí → "Cliente activo" + Fecha_Cobro +15d.
// Próximo_Paso=Cobro → "Cobro" + Fecha_Cobro +15d.
// Próximo_Paso=Seguimiento/Visita → estatus + nota auto.

const addDays = (dateStr, days) => {
  const d = parseDate(dateStr)
  if (!d) return ''
  d.setDate(d.getDate() + days)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const parseDate = (s) => {
  const parts = String(s || '').split('-')
  if (parts.length !== 3) return null
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return isNaN(d.getTime()) ? null : d
}

const autoEstatusDesdeVisitas = async (records) => {
  const clientes = await readJsonArray('clientes/clientes.json')
  const citas = await readJsonArray('citas/citas.json')
  let updated = 0

  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()

  for (const r of records) {
    const estab = norm(r.Establecimiento)
    if (!estab) continue
    // Match parcial: nombre del cliente contiene el establecimiento o viceversa
    const idx = clientes.findIndex((c) => {
      const nombre = norm(c.Nombre)
      return nombre.includes(estab) || estab.includes(nombre)
    })
    if (idx === -1) continue

    const cliente = clientes[idx]
    const pedido = norm(r.Pedido)
    const proximoPaso = norm(r.Proximo_Paso)
    const fecha = r.Fecha || ''

    if (pedido === 'si') {
      cliente.Etapa_Embudo = 'Cliente activo'
      cliente.Fecha_Cobro = addDays(fecha, 15)
      if (String(r.Monto ?? '').trim()) cliente.Monto = String(r.Monto).trim()
      updated++
    } else if (proximoPaso === 'cobro') {
      cliente.Etapa_Embudo = 'Cobro'
      cliente.Fecha_Cobro = addDays(fecha, 15)
      if (String(r.Monto ?? '').trim()) cliente.Monto = String(r.Monto).trim()
      updated++
    } else if (proximoPaso.includes('seguimiento') || proximoPaso.includes('visita')) {
      cliente.Etapa_Embudo = 'Seguimiento'
      const nota = `[${fecha}] Próximo paso: ${r.Proximo_Paso}`
      cliente.Notas = cliente.Notas ? `${cliente.Notas}\n${nota}` : nota
      // Crear cita recordatorio a 15 días
      const fechaRecordatorio = addDays(fecha, 15)
      if (fechaRecordatorio) {
        const id = `cita-${String(citas.length + 1).padStart(3, '0')}`
        citas.push({
          ID_Cita: id,
          Fecha: fechaRecordatorio,
          Establecimiento: r.Establecimiento || cliente.Nombre || '',
          Motivo: `Seguimiento automático desde visita ${fecha}`,
          Estado: 'pendiente',
          Origen: 'auto-estatus',
        })
      }
      updated++
    }
  }
  if (updated > 0) {
    await writeJson('clientes/clientes.json', clientes)
    await writeJson('citas/citas.json', citas)
  }
  return updated
}

// --- Estado / lecturas ------------------------------------------------------------

const catalogPath = () => {
  const fromEnv = process.env.CATALOG_PATH
  if (fromEnv && fromEnv.trim()) {
    return resolveSafe(DATA_HOME, fromEnv.replace(/^\.\//, ''))
  }
  for (const candidate of ['catalogo-data-base/catalog.json', 'catalogo-data-base/mercatodo_catalogo_2025.json', 'catalogo-data-base/catalog.example.json']) {
    try {
      if (existsSync(resolveSafe(DATA_HOME, candidate))) return resolveSafe(DATA_HOME, candidate)
    } catch {
      /* siguiente */
    }
  }
  return null
}

const summarizeCatalog = (catalog) => {
  if (!catalog) return null
  const categorias = catalog.categorias || {}
  const keys = Object.keys(categorias)
  const totalProductos = keys.reduce((acc, k) => acc + (Array.isArray(categorias[k]) ? categorias[k].length : 0), 0)
  return { catalogo: catalog.catalogo || 'Catálogo', totalCategorias: keys.length, totalProductos }
}

app.get('/api/estado', async (_req, res) => {
  try {
    const catalogFile = catalogPath()
    const catalog = catalogFile ? await readJsonIfExists(path.relative(DATA_HOME, catalogFile)) : null
    const dataJsonFiles = await listDir('data-json', '.json')
    const reportFiles = await listDir('reports', '.md')
    const docxFiles = await listDir('reportsDocx', '.docx')
    const menuImages = await listDir('menus', '.png')
    const clientes = await readJsonIfExists('clientes/clientes.json')
    const visitas = await readJsonIfExists('visitas/visitas.json')
    const citas = await readJsonIfExists('citas/citas.json')
    const listEntrantes = (tipo) =>
      listDir(`entrantes/${tipo}`, '.xlsx').then((x) =>
        listDir(`entrantes/${tipo}`, '.csv').then((c) =>
          listDir(`entrantes/${tipo}`, '.json').then((j) => [...x, ...c, ...j].sort()),
        ),
      )
    const entrantesClientes = await listEntrantes('clientes')
    const entrantesProductos = await listEntrantes('productos')

    res.json({
      dataHome: DATA_HOME,
      catalogo: summarizeCatalog(catalog),
      menus: {
        dataJson: dataJsonFiles,
        imagenes: menuImages,
      },
      reportes: reportFiles,
      reportesDocx: docxFiles,
      conteos: {
        clientes: Array.isArray(clientes) ? clientes.length : 0,
        visitas: Array.isArray(visitas) ? visitas.length : 0,
        citas: Array.isArray(citas) ? citas.length : 0,
      },
      entrantes: {
        clientes: entrantesClientes,
        productos: entrantesProductos,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/catalogo', async (_req, res) => {
  try {
    const file = catalogPath()
    if (!file) return res.status(404).json({ error: 'Catálogo no encontrado en DATA_HOME' })
    const catalog = await readJson(path.relative(DATA_HOME, file))
    res.json(catalog)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/menus', async (_req, res) => {
  try {
    const files = await listDir('data-json', '.json')
    const menus = []
    for (const name of files) {
      try {
        const data = await readJson(path.join('data-json', name))
        menus.push({
          archivo: name,
          source_file: data.source_file || '',
          extraction_method: data.extraction_method || '',
          lineas: (data.text || '').split('\n').filter((l) => l.trim()).length,
        })
      } catch {
        /* saltear corruptos */
      }
    }
    res.json(menus)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/menus/:name', async (req, res) => {
  try {
    const file = safeJoin('data-json', req.params.name)
    if (!file.endsWith('.json')) return res.status(400).json({ error: 'Solo .json' })
    const data = await readJson(path.relative(DATA_HOME, file))
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.get('/api/reports', async (_req, res) => {
  try {
    const files = await listDir('reports', '.md')
    res.json(files)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/reports/:name', async (req, res) => {
  try {
    const file = safeJoin('reports', req.params.name)
    if (!file.endsWith('.md')) return res.status(400).json({ error: 'Solo .md' })
    const content = await fs.readFile(file, 'utf-8')
    res.type('text/plain').send(content)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.get('/api/reportsDocx/:name', async (req, res) => {
  try {
    const file = safeJoin('reportsDocx', req.params.name)
    if (!file.endsWith('.docx')) return res.status(400).json({ error: 'Solo .docx' })
    if (!existsSync(file)) return res.status(404).json({ error: 'No encontrado' })
    res.download(file)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// --- Upload de menú ---------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(png|jpe?g|webp|pdf)$/i.test(file.originalname)
    cb(ok ? null : new Error('Formato no soportado: usa PNG, JPG, WEBP o PDF'), ok)
  },
})

app.post('/api/upload', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo no recibido' })
    const original = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')
    const target = safeJoin('menus', original)
    await fs.mkdir(path.join(DATA_HOME, 'menus'), { recursive: true })
    await fs.writeFile(target, req.file.buffer)

    // Pipeline de extracción real de ClienteListo: scripts/extract-text.sh
    const script = path.join(DATA_HOME, 'scripts', 'extract-text.sh')
    const result = await new Promise((resolve, reject) => {
      execFile('bash', [script, path.relative(DATA_HOME, target)], { cwd: DATA_HOME }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`extract-text.sh falló: ${stderr || stdout || err.message}`))
        } else {
          resolve({ stdout, stderr })
        }
      })
    })

    const baseName = original.replace(/\.[^.]+$/, '')
    const dataJsonFile = path.join('data-json', `${baseName}.json`)
    const data = await readJson(dataJsonFile)

    res.json({
      archivo: original,
      dataJson: dataJsonFile,
      extraction_method: data.extraction_method || 'desconocido',
      lineas: (data.text || '').split('\n').filter((l) => l.trim()).length,
      texto: data.text || '',
      stdout: result.stdout.trim(),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Upload de datos entrantes (clientes / productos / datos) --------------------

const uploadFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv|json)$/i.test(file.originalname)
    cb(ok ? null : new Error('Formato no soportado: usa XLSX, CSV o JSON'), ok)
  },
})

// --- Plantilla de reporte diario -------------------------------------------------
// El usuario sube el .xlsx de su reporte diario; el server lo guarda y extrae sus
// columnas (primera fila con más celdas no vacías) para que el agente la conozca.

const TEMPLATE_REL = 'reportes/templates/plantilla-reporte-diario.xlsx'
const MAPPING_REL = 'reportes/templates/plantilla-mapping.json'

// Script Python que copia la plantilla y rellena SOLO valores de texto,
// preservando imágenes, colores y estructura (fill-excel-template.py, openpyxl).
const FILL_TEMPLATE_SCRIPT = path.resolve(process.cwd(), '..', 'scripts', 'fill-excel-template.py')
const PYTHON3 = process.env.PYTHON3 || 'python3'

const runPython = (args) =>
  new Promise((resolve, reject) => {
    execFile(PYTHON3, args, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || stdout || err.message))
      } else {
        resolve({ stdout, stderr })
      }
    })
  })

// Convierte número de columna (1-based) a letra: 1→A, 27→AA
const colToLetter = (n) => {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// Genera un mapping IA de la plantilla → campos del sistema.
// Lee la estructura Excel, la envía a Gemini, y devuelve el mapping.
const generateTemplateMapping = async (templateAbs) => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(templateAbs)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('La plantilla no tiene hojas')

  // Descripción textual de la estructura (primeras 30 filas)
  const lines = []
  for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
    const row = ws.getRow(r)
    const cells = []
    row.eachCell({ includeEmpty: false }, (cell) => {
      const addr = cell.address
      const val = String(cell.value ?? '').substring(0, 50)
      cells.push(`[${addr}] "${val}"`)
    })
    if (cells.length) lines.push(`Fila ${r}: ${cells.join(', ')}`)
  }

  const structure = lines.join('\n')

  const prompt = `Eres un asistente que analiza plantillas Excel de reportes de visitas diarias para un vendedor de productos gourmet.

Esta es la estructura de la plantilla del usuario:
${structure}

Campos disponibles del sistema (datos de cada visita):
- Establecimiento: nombre del negocio
- Fecha: fecha de la visita (YYYY-MM-DD)
- Hora_Visita: hora de la visita
- Persona_Contactada: nombre de la persona atendida
- Pedido: "Sí" o "No"
- Detalle_Pedido: qué pidió el cliente
- Productos_Presentados: productos mostrados
- Proximo_Paso: acción de seguimiento
- Comentarios: notas adicionales
- Monto: monto de la venta/cobro

Campos de encabezado del reporte (van en la sección superior):
- vendedor: nombre del vendedor
- zona_ruta: zona o ruta
- supervisor: nombre del supervisor
- fecha: fecha del reporte

Devuelve SOLO un JSON válido con este formato exacto:
{
  "encabezado": { "campo_sistema": "referencia_celda_como_B1" },
  "datos": { "campo_sistema": "LETRA_DE_COLUMNA_como_A" },
  "headerRow": número_de_fila_donde_están_los_headers,
  "firstDataRow": número_de_primera_fila_de_datos
}

Reglas:
- "encabezado" mapea campos del encabezado a celdas específicas (ej: "vendedor": "B1")
- "datos" mapea campos del sistema a LETRAS de columna (ej: "Establecimiento": "A")
- Solo incluye campos que encontraste en la plantilla
- headerRow es la fila donde están los nombres de las columnas
- firstDataRow es la primera fila donde van los datos (generalmente headerRow + 1)
- NO inventes campos que no existan en la plantilla
- Responde SOLO con el JSON, sin texto adicional`

  const text = await callGemini(prompt)

  let mapping
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      mapping = JSON.parse(jsonMatch[0])
    }
  } catch {
    throw new Error('No se pudo parsear la respuesta del agente como mapping JSON')
  }

  if (!mapping || !mapping.datos || !mapping.headerRow) {
    throw new Error('El agente devolvió un mapping incompleto')
  }

  return mapping
}

const leerColumnasPlantilla = async (absPath) => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(absPath)
  const ws = wb.worksheets[0]
  if (!ws) return []
  let mejor = { count: 0, distinct: 0, celdas: [] }
  for (let r = 1; r <= Math.min(ws.rowCount, 60); r++) {
    const row = ws.getRow(r)
    const vals = []
    const seen = new Set()
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        vals.push(String(v).trim())
        seen.add(String(v).trim().toLowerCase())
      }
    })
    // Must have at least 2 distinct values to be a header row (skip merged titles)
    if (vals.length > mejor.count && seen.size >= 2) mejor = { count: vals.length, distinct: seen.size, celdas: vals }
  }
  return mejor.celdas
}

// ── Plantilla de reporte diario: estructura completa para rellenar ─────────────
// Lee la plantilla y devuelve dónde están los headers, el mapeo header→campo de
// visita, y las celdas de encabezado (Vendedor / Zona / Fecha) para rellenar al
// exportar. Conserva el workbook para poder escribir sobre él sin perder formato.

const NORM = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// Header de la plantilla → campo de visita. Orden importa: patrones más
// específicos primero (ej: "detalle pedido" antes de "pedido").
const MAPEO_HEADER_A_CAMPO = [
  ['nombre del establecimiento', 'Establecimiento'],
  ['establecimiento', 'Establecimiento'],
  ['tipo de negocio', 'Tipo_Negocio'],
  ['direccion', 'Direccion'],
  ['dirección', 'Direccion'],
  ['hora de visita', 'Hora_Visita'],
  ['hora visita', 'Hora_Visita'],
  ['hora', 'Hora_Visita'],
  ['persona contactada', 'Persona_Contactada'],
  ['persona', 'Persona_Contactada'],
  ['productos presentados', 'Productos_Presentados'],
  ['productos', 'Productos_Presentados'],
  ['detalle del pedido', 'Detalle_Pedido'],
  ['detalle pedido', 'Detalle_Pedido'],
  ['pedido', 'Pedido'],
  ['comentarios importantes', 'Comentarios'],
  ['comentarios', 'Comentarios'],
  ['proximo paso seguimiento', 'Proximo_Paso'],
  ['proximo paso', 'Proximo_Paso'],
  ['monto', 'Monto'],
]

// Labels de encabezado (sección arriba de los headers) → campo del request.
const LABELS_ENCABEZADO = [
  { kw: ['vendedor'], campo: 'vendedor' },
  { kw: ['zona', 'ruta'], campo: 'zona_ruta' },
  { kw: ['supervisor'], campo: 'supervisor' },
  { kw: ['fecha'], campo: 'fecha' },
]

const leerPlantillaCompleta = async (absPath) => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(absPath)
  const ws = wb.worksheets[0]
  if (!ws) return null

  // Header row = fila con más celdas no vacías y valores DISTINTOS
  // (evita filas merged/título donde todas las celdas dicen lo mismo)
  let mejor = { count: 0, distinct: 0, rowNumber: 0 }
  for (let r = 1; r <= Math.min(ws.rowCount, 60); r++) {
    const row = ws.getRow(r)
    let count = 0
    const vals = new Set()
    row.eachCell({ includeEmpty: false }, (cell) => {
      count++
      vals.add(String(cell.value ?? '').trim().toLowerCase())
    })
    // Must have at least 2 distinct values to be a header row
    if (count > mejor.count && vals.size >= 2) mejor = { count, distinct: vals.size, rowNumber: r }
  }
  if (mejor.count < 2 || mejor.rowNumber === 0) return null

  const headerRow = ws.getRow(mejor.rowNumber)
  const columnas = []
  const columnMap = new Map() // campo de visita → índice de columna
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    const header = NORM(cell.value)
    if (!header) return
    columnas.push(String(cell.value).trim())
    for (const [patron, campo] of MAPEO_HEADER_A_CAMPO) {
      if (header.includes(patron)) {
        if (!columnMap.has(campo)) columnMap.set(campo, cell.col)
        break
      }
    }
  })

  // Celdas de encabezado (labels Vendedor/Zona/Fecha en filas previas a los headers).
  const encabezadoCells = []
  for (let r = 1; r < mejor.rowNumber; r++) {
    const row = ws.getRow(r)
    row.eachCell({ includeEmpty: false }, (cell) => {
      const texto = String(cell.value ?? '').trim()
      if (!texto || texto.length > 40) return
      const n = NORM(texto)
      for (const l of LABELS_ENCABEZADO) {
        const hit = l.kw.some((k) => n === k || n.startsWith(k + ' ') || n.startsWith(k + ':'))
        if (!hit) continue
        const dosPuntos = texto.indexOf(':')
        if (dosPuntos !== -1) {
          const valor = texto.slice(dosPuntos + 1).trim()
          if (valor) {
            // "Vendedor: Juan" → reescribir con prefijo al exportar
            encabezadoCells.push({ ref: cell.address, campo: l.campo, prefijo: texto.slice(0, dosPuntos + 1) })
          } else {
            // "Vendedor:" → el valor va en la celda de la derecha
            encabezadoCells.push({ ref: ws.getCell(cell.row, cell.col + 1).address, campo: l.campo, prefijo: null })
          }
        } else {
          encabezadoCells.push({ ref: ws.getCell(cell.row, cell.col + 1).address, campo: l.campo, prefijo: null })
        }
        break
      }
    })
  }

  return { workbook: wb, headerRowNumber: mejor.rowNumber, columnas, columnMap, encabezadoCells }
}

app.post('/api/reportes/template', uploadFile.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo no recibido' })
    const destino = resolveSafe(DATA_HOME, TEMPLATE_REL)
    await fs.mkdir(path.dirname(destino), { recursive: true })
    await fs.writeFile(destino, req.file.buffer)
    // Invalidar mapping anterior (la plantilla cambió)
    const mappingPath = resolveSafe(DATA_HOME, MAPPING_REL)
    await fs.unlink(mappingPath).catch(() => {})
    const columnas = await leerColumnasPlantilla(destino)
    res.json({
      archivo: path.basename(destino),
      ruta: TEMPLATE_REL,
      columnas,
      nota: `Plantilla guardada (${columnas.length} columnas detectadas).`,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/reportes/template', async (_req, res) => {
  try {
    const destino = resolveSafe(DATA_HOME, TEMPLATE_REL)
    if (!existsSync(destino)) return res.json({ existe: false })
    const columnas = await leerColumnasPlantilla(destino)
    res.json({ existe: true, archivo: path.basename(destino), columnas })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Analiza la plantilla con el agente IA y genera un mapping persistente.
// POST /api/reportes/analyze-template → { mapping: {...} }
app.post('/api/reportes/analyze-template', async (_req, res) => {
  try {
    const templateAbs = resolveSafe(DATA_HOME, TEMPLATE_REL)
    if (!existsSync(templateAbs)) {
      return res.status(404).json({ error: 'No hay plantilla subida. Subila primero desde "Cambiar plantilla".' })
    }

    // ¿Ya existe mapping? Devolverlo directamente
    const mappingAbs = resolveSafe(DATA_HOME, MAPPING_REL)
    if (existsSync(mappingAbs)) {
      try {
        const cached = JSON.parse(await fs.readFile(mappingAbs, 'utf-8'))
        return res.json({ mapping: cached, source: 'cache' })
      } catch { /* regenerate */ }
    }

    const mapping = await generateTemplateMapping(templateAbs)

    // Guardar mapping en disco
    await fs.mkdir(path.dirname(mappingAbs), { recursive: true })
    await fs.writeFile(mappingAbs, JSON.stringify(mapping, null, 2), 'utf-8')

    res.json({ mapping, source: 'generated' })
  } catch (err) {
    console.error('[analyze-template] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/upload/:tipo', uploadFile.single('archivo'), async (req, res) => {
  try {
    const tipo = String(req.params.tipo || '').replace(/[^a-z0-9_-]/gi, '')
    const permitidos = ['clientes', 'productos']
    if (!permitidos.includes(tipo)) {
      return res.status(400).json({ error: `Tipo no soportado: ${tipo}. Usa ${permitidos.join(', ')}` })
    }
    if (!req.file) return res.status(400).json({ error: 'Archivo no recibido' })

    const original = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')
    const isJson = /\.json$/i.test(original)

    // .json → carga directa a la base (reemplaza)
    if (isJson) {
      let parsed
      try { parsed = JSON.parse(req.file.buffer.toString('utf-8')) }
      catch { return res.status(400).json({ error: 'JSON inválido: no se pudo parsear' }) }

      if (tipo === 'productos') {
        if (!parsed || typeof parsed !== 'object' || !parsed.categorias || typeof parsed.categorias !== 'object') {
          return res.status(400).json({ error: 'JSON de productos debe tener {catalogo, categorias}' })
        }
        await fs.mkdir(path.join(DATA_HOME, 'catalogo-data-base'), { recursive: true })
        await fs.writeFile(path.join(DATA_HOME, 'catalogo-data-base/catalog.json'), JSON.stringify(parsed, null, 2), 'utf-8')
        const total = Object.values(parsed.categorias).reduce((a, c) => a + (Array.isArray(c) ? c.length : 0), 0)
        return res.json({
          tipo,
          archivo: original,
          base: 'catalogo-data-base/catalog.json',
          bytes: req.file.size,
          nota: `Catálogo reemplazado directo: ${total} productos, ${Object.keys(parsed.categorias).length} categorías.`,
        })
      }

      if (tipo === 'clientes') {
        if (!Array.isArray(parsed)) {
          return res.status(400).json({ error: 'JSON de clientes debe ser un array' })
        }
        await fs.mkdir(path.join(DATA_HOME, 'clientes'), { recursive: true })
        await fs.writeFile(path.join(DATA_HOME, 'clientes/clientes.json'), JSON.stringify(parsed, null, 2), 'utf-8')
        return res.json({
          tipo,
          archivo: original,
          base: 'clientes/clientes.json',
          bytes: req.file.size,
          nota: `Base de clientes reemplazada: ${parsed.length} clientes.`,
        })
      }

      // Otro tipo JSON inesperado → pendiente de conversión
      const destino = resolveSafe(DATA_HOME, path.join('entrantes', tipo, original))
      await fs.mkdir(path.join(DATA_HOME, 'entrantes', tipo), { recursive: true })
      await fs.writeFile(destino, req.file.buffer)
      return res.json({
        tipo,
        archivo: original,
        ruta: path.relative(DATA_HOME, destino),
        bytes: req.file.size,
        nota: 'JSON guardado en entrantes/ pendiente de conversión.',
      })
    }

    // xlsx/csv → entra en pendientes de conversión
    const destino = resolveSafe(DATA_HOME, path.join('entrantes', tipo, original))
    await fs.mkdir(path.join(DATA_HOME, 'entrantes', tipo), { recursive: true })
    await fs.writeFile(destino, req.file.buffer)

    res.json({
      tipo,
      archivo: original,
      ruta: path.relative(DATA_HOME, destino),
      bytes: req.file.size,
      nota: 'Archivo guardado en entrantes/ pendiente de conversión a JSON.',
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Eliminar archivo entrante ------------------------------------------------

app.delete('/api/entrantes/:tipo/:archivo', async (req, res) => {
  try {
    const tipo = String(req.params.tipo || '').replace(/[^a-z0-9_-]/gi, '')
    const permitidos = ['clientes', 'productos']
    if (!permitidos.includes(tipo)) {
      return res.status(400).json({ error: `Tipo no soportado: ${tipo}` })
    }
    const archivo = path.basename(req.params.archivo || '').replace(/[^a-zA-Z0-9._-]/g, '_')
    if (!archivo) return res.status(400).json({ error: 'Nombre de archivo no válido' })

    const filePath = resolveSafe(DATA_HOME, path.join('entrantes', tipo, archivo))
    try {
      await fs.access(filePath)
    } catch {
      return res.status(404).json({ error: 'Archivo no encontrado' })
    }

    await fs.unlink(filePath)
    res.json({ ok: true, archivo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Conversión entrantes → JSON ------------------------------------------------

// Mapeo de columnas por tipo: header Excel → campo interno.
// El mapeo es case-insensitive contra los headers reales del archivo.
const COLUMN_MAP = {
  clientes: {
    zona: 'Zona',
    '#': 'Codigo',
    codigo: 'Codigo',
    razon_social: 'Nombre',
    razonsocial: 'Nombre',
    nombre: 'Nombre',
    telefono1: 'Telefono',
    telefono: 'Telefono',
    tipone: 'Tipo_Negocio',
    tipo_negocio: 'Tipo_Negocio',
    fechaultventa: 'Fecha_Ultima_Venta',
    fecha_ultima_venta: 'Fecha_Ultima_Venta',
    direccioncompleta: 'Direccion',
    direccion: 'Direccion',
    email: 'Email',
    notas: 'Notas',
  },
  productos: {
    nombre: 'Nombre',
    categoria: 'Categoria',
    unidad: 'Unidad',
    codigo: 'Codigo',
    empaque: 'Empaque',
    precio: 'Precio',
  },
}

const DESTINO_JSON = {
  clientes: 'clientes/clientes.json',
  productos: 'productos/productos.json',
}

// Parser CSV básico (soporta comillas).
const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  const splitLine = (line) => {
    const cells = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else {
        if (ch === '"') inQ = true
        else if (ch === ',') { cells.push(cur); cur = '' }
        else cur += ch
      }
    }
    cells.push(cur)
    return cells
  }
  const headers = splitLine(lines[0]).map((h) => h.trim())
  const rows = lines.slice(1).map((l) => {
    const cells = splitLine(l)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (cells[i] || '').trim() })
    return obj
  })
  return { headers, rows }
}

// Mapea una fila cruda usando COLUMN_MAP[tipo].
const mapRow = (raw, tipo) => {
  const mapping = COLUMN_MAP[tipo]
  if (!mapping) return raw // passthrough
  const out = {}
  for (const [header, value] of Object.entries(raw)) {
    const key = mapping[header.toLowerCase().replace(/\s+/g, '_')]
    if (key) out[key] = String(value || '').trim()
  }
  return out
}

// POST /api/entrantes/convertir — lee XLSX/CSV de entrantes/<tipo>/, mapea, escribe JSON, mueve a convertidos/.
app.post('/api/entrantes/convertir', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const { tipo, archivo } = req.body || {}
    const tiposPermitidos = ['clientes', 'productos', 'datos']
    if (!tipo || !tiposPermitidos.includes(tipo)) {
      return res.status(400).json({ error: `Tipo no soportado: ${tipo}. Usa ${tiposPermitidos.join(', ')}` })
    }
    if (!archivo || typeof archivo !== 'string') {
      return res.status(400).json({ error: 'Falta el nombre del archivo' })
    }

    const srcDir = path.join('entrantes', tipo)
    const srcFile = resolveSafe(DATA_HOME, path.join(srcDir, path.basename(archivo)))
    if (!existsSync(srcFile)) {
      return res.status(404).json({ error: `Archivo no encontrado: ${archivo}` })
    }

    const isXlsx = /\.xlsx$/i.test(archivo)
    const isCsv = /\.csv$/i.test(archivo)
    const isJson = /\.json$/i.test(archivo)

    // ── .json → validate + load direct to base ──
    if (isJson) {
      let parsed
      try { parsed = JSON.parse(await fs.readFile(srcFile, 'utf-8')) }
      catch { return res.status(400).json({ error: 'JSON inválido: no se pudo parsear el archivo' }) }

      if (tipo === 'productos') {
        if (!parsed || typeof parsed !== 'object' || !parsed.categorias || typeof parsed.categorias !== 'object') {
          return res.status(400).json({ error: 'JSON de productos debe tener {catalogo, categorias}' })
        }
        await fs.mkdir(path.join(DATA_HOME, 'catalogo-data-base'), { recursive: true })
        await fs.writeFile(path.join(DATA_HOME, 'catalogo-data-base/catalog.json'), JSON.stringify(parsed, null, 2), 'utf-8')
        const total = Object.values(parsed.categorias).reduce((a, c) => a + (Array.isArray(c) ? c.length : 0), 0)

        const convDir = path.join(DATA_HOME, srcDir, 'convertidos')
        await fs.mkdir(convDir, { recursive: true })
        await fs.rename(srcFile, path.join(convDir, path.basename(archivo)))

        return res.json({
          tipo, archivo,
          destino: 'catalogo-data-base/catalog.json',
          registros: total,
          total,
          nota: `Catálogo cargado: ${total} productos de ${Object.keys(parsed.categorias).length} categorías. Archivo movido a convertidos/.`,
        })
      }

      if (tipo === 'clientes') {
        if (!Array.isArray(parsed)) {
          return res.status(400).json({ error: 'JSON de clientes debe ser un array' })
        }
        await fs.mkdir(path.join(DATA_HOME, 'clientes'), { recursive: true })
        await fs.writeFile(path.join(DATA_HOME, 'clientes/clientes.json'), JSON.stringify(parsed, null, 2), 'utf-8')

        const convDir = path.join(DATA_HOME, srcDir, 'convertidos')
        await fs.mkdir(convDir, { recursive: true })
        await fs.rename(srcFile, path.join(convDir, path.basename(archivo)))

        return res.json({
          tipo, archivo,
          destino: 'clientes/clientes.json',
          registros: parsed.length,
          total: parsed.length,
          nota: `Base de clientes cargada: ${parsed.length} registros. Archivo movido a convertidos/.`,
        })
      }

      return res.status(400).json({ error: `JSON no soportado para tipo "${tipo}"` })
    }

    if (!isXlsx && !isCsv) {
      return res.status(400).json({ error: 'Solo se aceptan archivos .xlsx, .csv o .json para conversión' })
    }

    let rows = []

    if (isXlsx) {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.readFile(srcFile)
      const ws = wb.worksheets[0]
      if (!ws || ws.rowCount < 2) {
        return res.status(400).json({ error: 'El archivo Excel está vacío o no tiene datos' })
      }

      // Buscar la primera fila con datos no nulos (los headers pueden no estar en fila 1)
      let headerRowIndex = 1
      for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
        const row = ws.getRow(r)
        const hasData = row.values.some((v, i) => i > 0 && v != null && String(v).trim() !== '')
        if (hasData) { headerRowIndex = r; break }
      }

      const headerRow = ws.getRow(headerRowIndex)
      const headers = []
      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        headers[colNumber] = String(cell.value || '').trim()
      })
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber <= headerRowIndex) return
        const raw = {}
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const h = headers[colNumber]
          if (h) raw[h] = String(cell.value ?? '').trim()
        })
        if (Object.values(raw).some((v) => v !== '')) {
          rows.push(mapRow(raw, tipo))
        }
      })
    } else {
      const text = await fs.readFile(srcFile, 'utf-8')
      const { rows: parsed } = parseCsv(text)
      rows = parsed.map((r) => mapRow(r, tipo))
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'El archivo no contiene datos válidos' })
    }

    // ── Productos → reemplaza catálogo completo (base única, sin merge) ──
    if (tipo === 'productos') {
      const categorias = {}
      for (const row of rows) {
        const cat = (row.Categoria || 'SIN CATEGORÍA').trim().toUpperCase()
        if (!categorias[cat]) categorias[cat] = []
        categorias[cat].push({
          nombre: row.Nombre || '',
          codigo_referencia: row.Codigo || '',
          codigo_barras: row.Codigo_Barras || '',
          empaque: row.Empaque || '',
          ...(row.Unidad ? { unidad: row.Unidad } : {}),
          ...(row.Precio ? { precio: row.Precio } : {}),
        })
      }
      const catalogObj = {
        catalogo: path.basename(archivo, path.extname(archivo)).replace(/[_-]/g, ' ').trim(),
        categorias,
      }
      await writeJson('catalogo-data-base/catalog.json', catalogObj)

      const convDir = path.join(DATA_HOME, srcDir, 'convertidos')
      await fs.mkdir(convDir, { recursive: true })
      await fs.rename(srcFile, path.join(convDir, path.basename(archivo)))

      return res.json({
        tipo,
        archivo,
        registros: rows.length,
        destino: 'catalogo-data-base/catalog.json',
        total: Object.values(categorias).reduce((a, c) => a + c.length, 0),
        nota: `Catálogo reemplazado: ${rows.length} productos de ${archivo}. Archivo movido a convertidos/.`,
      })
    }

    // ── Clientes → reemplaza base completa (sin merge, IDs frescos) ──
    const destRel = DESTINO_JSON[tipo]

    if (tipo === 'clientes') {
      let seq = 0
      rows = rows.map((r) => {
        seq++
        r.ID_Cliente = `CL-${pad3(seq)}`
        if (!r.Etapa_Embudo) {
          r.Etapa_Embudo = r.Fecha_Ultima_Venta ? 'Cliente activo' : 'Cliente potencial'
        }
        if (!r.Fecha_Registro) r.Fecha_Registro = new Date().toISOString().slice(0, 10)
        return r
      })
    }

    await writeJson(destRel, rows)

    // Mover archivo fuente a convertidos/
    const convDir = path.join(DATA_HOME, srcDir, 'convertidos')
    await fs.mkdir(convDir, { recursive: true })
    await fs.rename(srcFile, path.join(convDir, path.basename(archivo)))

    res.json({
      tipo,
      archivo,
      registros: rows.length,
      destino: destRel,
      total: rows.length,
      nota: `Convertidos ${rows.length} registros de ${archivo} a JSON. Archivo movido a convertidos/.`,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Export a Excel ---------------------------------------------------------------

// Devuelve el xlsx como binario para que el frontend lo guarde con el diálogo nativo.
app.post('/api/export', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const { tipo, hoja = 'Datos', columnas = [], filas = [] } = req.body || {}
    if (!Array.isArray(columnas) || !Array.isArray(filas)) {
      return res.status(400).json({ error: 'Se esperan columnas y filas como arrays' })
    }
    if (columnas.length === 0) return res.status(400).json({ error: 'Sin columnas para exportar' })

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(hoja)
    ws.columns = columnas.map((c) => ({ header: c, key: c, width: Math.max(12, c.length + 6) }))
    ws.addRows(filas)
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15100D' } }
    ws.getRow(1).font = { bold: true, color: { argb: 'FFF1C27D' } }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(2, filas.length + 1), column: columnas.length } }

    const fecha = new Date().toISOString().slice(0, 10)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const name = `${fecha}_${String(tipo || 'export').replace(/[^a-zA-Z0-9_-]/g, '_')}_${stamp}.xlsx`
    const buffer = await wb.xlsx.writeBuffer()

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
    })
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Visitas ----------------------------------------------------------------------

app.get('/api/visitas', async (_req, res) => {
  try {
    res.json(await readJsonArray('visitas/visitas.json'))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Cuenta visitas existentes para una fecha específica (para advertencia de reemplazo)
app.get('/api/visitas/fecha/:fecha', async (req, res) => {
  try {
    const fecha = String(req.params.fecha || '').slice(0, 10)
    const visitas = await readJsonArray('visitas/visitas.json')
    const count = visitas.filter((v) => String(v.Fecha || '').slice(0, 10) === fecha).length
    res.json({ fecha, count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/visitas', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const { encabezado = {}, filas = [] } = req.body || {}
    if (!Array.isArray(filas)) {
      return res.status(400).json({ error: 'Se espera filas como array' })
    }
    const validas = filas.filter((f) => String((f && f.establecimiento) || '').trim() !== '')

    const visitas = await readJsonArray('visitas/visitas.json')
    const citas = await readJsonArray('citas/citas.json')
    const seqVisita = nextSeq(visitas, 'ID_Visita', 'visita-')
    const seqCita = nextSeq(citas, 'ID_Cita', 'cita-')

    const records = validas.map((fila, i) => buildVisitaRecord(fila, encabezado, `visita-${pad3(seqVisita + i + 1)}`))

    const nuevasCitas = []
    records.forEach((record, i) => {
      const fechaCita = parseDateFromText(record.Proximo_Paso)
      if (fechaCita) {
        nuevasCitas.push({
          ID_Cita: `cita-${pad3(seqCita + nuevasCitas.length + 1)}`,
          Fecha: fechaCita,
          Establecimiento: record.Establecimiento,
          Motivo: 'Seguimiento de visita',
          Estado: 'pendiente',
          Origen: 'visita',
          ID_Visita: record.ID_Visita,
        })
      }
    })

    const advertencias = []
    if (validas.length > 0) {
      const names = await catalogProductNames()
      for (const fila of validas) {
        const campos = [String(fila.productos_presentados || ''), String(fila.detalle_pedido || '')]
        for (const campo of campos) {
          for (const token of campo.split(/[,;\n]+/)) {
            const t = token.trim().toLowerCase()
            if (!t || t.length < 3) continue
            const found = names.some((name) => name.includes(t))
            if (!found && advertencias.length < 10) {
              advertencias.push(`Producto no encontrado en catálogo: "${token.trim()}" (${String(fila.establecimiento || '').trim()})`)
            }
          }
        }
      }
    }

    // Reemplazar por fecha: eliminar visitas existentes de la misma fecha antes de guardar
    const fechaReporte = String(encabezado.fecha || '').slice(0, 10)
    const visitasAntes = visitas.length
    const visitasFiltradas = fechaReporte
      ? visitas.filter((v) => String(v.Fecha || '').slice(0, 10) !== fechaReporte)
      : visitas
    const reemplazadas = visitasAntes - visitasFiltradas.length

    await writeJson('visitas/visitas.json', [...visitasFiltradas, ...records])
    if (nuevasCitas.length > 0) await writeJson('citas/citas.json', [...citas, ...nuevasCitas])

    // Auto-estatus: actualizar clientes según visitas guardadas
    const clientesActualizados = await autoEstatusDesdeVisitas(records)

    res.json({ guardados: records.length, reemplazadas, citas_creadas: nuevasCitas.length, advertencias, clientes_actualizados: clientesActualizados })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Exporta visitas filtradas como xlsx binario.
// Body: { fecha?: string, periodo?: 'dia'|'mes'|'anio' } — default: todas.
app.post('/api/visitas/export', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const allVisitas = await readJsonArray('visitas/visitas.json')

    // Filtrar por periodo (día / mes / año)
    const fecha = String((req.body && req.body.fecha) || '')
    const periodo = String((req.body && req.body.periodo) || 'dia')
    const visitas = fecha
      ? allVisitas.filter((v) => {
          const f = String(v.Fecha || '').slice(0, 10)
          if (periodo === 'anio') return f.startsWith(fecha.slice(0, 4))
          if (periodo === 'mes') return f.startsWith(fecha.slice(0, 7))
          return f === fecha
        })
      : allVisitas

    if (visitas.length === 0) {
      return res.status(404).json({ error: `Sin visitas para el filtro seleccionado (${periodo}: ${fecha || 'todas'})` })
    }

    const primera = visitas[0] || {}
    // Usar encabezado del request body si viene, si no, el de la primera visita
    const reqEnc = (req.body && req.body.encabezado) || {}
    const encabezado = {
      vendedor: String(reqEnc.vendedor || primera.Vendedor || ''),
      zona_ruta: String(reqEnc.zona_ruta || primera.Zona_Ruta || ''),
      supervisor: String(reqEnc.supervisor || primera.Supervisor || ''),
      fecha: String(primera.Fecha || ''),
    }

    // ── Si hay plantilla subida: copiarla y rellenarla (formato del usuario) ──
    const templateAbs = resolveSafe(DATA_HOME, TEMPLATE_REL)
    if (existsSync(templateAbs)) {
      const plantilla = await leerPlantillaCompleta(templateAbs)
      if (plantilla && plantilla.columnMap.size > 0) {
        const encVal = {
          vendedor: encabezado.vendedor,
          zona_ruta: encabezado.zona_ruta,
          supervisor: encabezado.supervisor,
          fecha: fecha || encabezado.fecha,
        }

        const tmpPayload = path.join(os.tmpdir(), `zola-payload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`)
        const tmpOut = path.join(os.tmpdir(), `zola-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xlsx`)

        // valores.json: una key por celda (referencia tipo "B3", "B9")
        const valores = {}

        // Encabezado: celdas detectadas por leerPlantillaCompleta
        for (const item of plantilla.encabezadoCells) {
          const valor = encVal[item.campo]
          if (item.prefijo) {
            valores[item.ref] = `${item.prefijo} ${valor || ''}`.trim()
          } else if (valor) {
            valores[item.ref] = valor
          }
        }

        // Datos: columnMap (campo → col#), primera fila = headerRowNumber + 1
        let dataRow = plantilla.headerRowNumber + 1
        for (const v of visitas) {
          for (const [campo, col] of plantilla.columnMap.entries()) {
            const colLetter = colToLetter(col)
            const ref = `${colLetter}${dataRow}`
            const valor = String(v[campo] ?? '')
            if (valor !== '') {
              valores[ref] = valor
            }
          }
          dataRow++
        }

        console.log('[export] Usando plantilla determinista, columnMap:', [...plantilla.columnMap.entries()])
        console.log('[export] EncabezadoCells:', plantilla.encabezadoCells.length, 'Valores:', Object.keys(valores).length)

        try {
          await fs.writeFile(tmpPayload, JSON.stringify(valores), 'utf-8')
          await runPython([FILL_TEMPLATE_SCRIPT, templateAbs, tmpOut, tmpPayload])
          const buffer = await fs.readFile(tmpOut)

          const now = new Date().toISOString().slice(0, 10)
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const name = `${now}_visitas_${periodo}_${fecha || 'todas'}_${stamp}.xlsx`

          console.log('[export] Export OK via plantilla + fill script, size:', buffer.length)
          res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${name}"`,
          })
          return res.send(buffer)
        } catch (err) {
          console.error('[fill-template] falló, cae al genérico:', err.message)
        } finally {
          await fs.unlink(tmpPayload).catch(() => {})
          await fs.unlink(tmpOut).catch(() => {})
        }
      }
    }

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Visitas')

    const widths = [30, 20, 28, 14, 20, 26, 10, 26, 28, 26]
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

    ws.getCell('A1').value = 'Nombre del Vendedor:'
    ws.getCell('B1').value = encabezado.vendedor
    ws.getCell('A2').value = 'Zona / Ruta:'
    ws.getCell('B2').value = encabezado.zona_ruta
    ws.getCell('C2').value = 'Supervisor:'
    ws.getCell('D2').value = encabezado.supervisor
    ws.getCell('A3').value = 'Fecha:'
    ws.getCell('B3').value = fecha || encabezado.fecha
    ws.getCell('C3').value = 'Filtro:'
    ws.getCell('D3').value = `${periodo} (${visitas.length} visitas)`
    for (const ref of ['A1', 'A2', 'C2', 'A3', 'C3']) {
      ws.getCell(ref).font = { bold: true }
    }

    const headers = [
      'Nombre del Establecimiento',
      'Tipo de Negocio',
      'Dirección / Ubicación',
      'Hora de Visita',
      'Persona Contactada',
      'Productos Presentados',
      'Pedido',
      'Detalle del Pedido',
      'Comentarios Importantes',
      'Próximo Paso / Seguimiento',
    ]
    const headerRow = ws.getRow(5)
    headerRow.values = headers
    headerRow.font = { bold: true, color: { argb: 'FFF1C27D' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15100D' } }
    headerRow.alignment = { vertical: 'middle' }

    let rowIndex = 6
    for (const v of visitas) {
      ws.getRow(rowIndex).values = [
        String(v.Establecimiento || ''),
        String(v.Tipo_Negocio || ''),
        String(v.Direccion || ''),
        String(v.Hora_Visita || ''),
        String(v.Persona_Contactada || ''),
        String(v.Productos_Presentados || ''),
        String(v.Pedido || ''),
        String(v.Detalle_Pedido || ''),
        String(v.Comentarios || ''),
        String(v.Proximo_Paso || ''),
      ]
      rowIndex += 1
    }

    const now = new Date().toISOString().slice(0, 10)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const name = `${now}_visitas_${periodo}_${fecha || 'todas'}_${stamp}.xlsx`
    const buffer = await wb.xlsx.writeBuffer()

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
    })
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Edita una visita por ID (actualización parcial).
app.patch('/api/visitas/:id', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ error: 'ID requerido' })

    const visitas = await readJsonArray('visitas/visitas.json')
    const idx = visitas.findIndex((v) => v.ID_Visita === id)
    if (idx === -1) return res.status(404).json({ error: `Visita ${id} no encontrada` })

    const allowed = [
      'Fecha', 'Hora_Visita', 'Vendedor', 'Zona_Ruta', 'Supervisor',
      'Establecimiento', 'Tipo_Negocio', 'Direccion', 'Persona_Contactada',
      'Productos_Presentados', 'Pedido', 'Detalle_Pedido', 'Monto', 'Comentarios', 'Proximo_Paso',
    ]
    const updates = req.body || {}
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        visitas[idx][key] = updates[key]
      }
    }

    await writeJson('visitas/visitas.json', visitas)

    // Propagar Monto de la visita al cliente matcheado (monto del cobro)
    if (updates.Monto !== undefined) {
      const clientes = await readJsonArray('clientes/clientes.json')
      const estab = String(visitas[idx].Establecimiento || '').trim().toLowerCase()
      const cIdx = clientes.findIndex((c) => String(c.Nombre || '').trim().toLowerCase() === estab)
      if (cIdx !== -1 && String(visitas[idx].Monto || '').trim()) {
        clientes[cIdx].Monto = String(visitas[idx].Monto).trim()
        await writeJson('clientes/clientes.json', clientes)
      }
    }

    res.json(visitas[idx])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Elimina una visita por ID y las citas auto-creadas vinculadas (Origen: visita).
app.delete('/api/visitas/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '')
    if (!id) return res.status(400).json({ error: 'ID requerido' })

    const visitas = await readJsonArray('visitas/visitas.json')
    const idx = visitas.findIndex((v) => v.ID_Visita === id)
    if (idx === -1) return res.status(404).json({ error: `Visita ${id} no encontrada` })

    const [eliminada] = visitas.splice(idx, 1)
    await writeJson('visitas/visitas.json', visitas)

    // Eliminar citas vinculadas (auto-creadas desde "Próximo paso")
    const citas = await readJsonArray('citas/citas.json')
    const citasFiltradas = citas.filter((c) => !(c.Origen === 'visita' && c.ID_Visita === id))
    const citasEliminadas = citas.length - citasFiltradas.length
    if (citasEliminadas > 0) await writeJson('citas/citas.json', citasFiltradas)

    res.json({ eliminado: id, establecimiento: eliminada?.Establecimiento || '', citas_eliminadas: citasEliminadas })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Clientes ---------------------------------------------------------------------

app.get('/api/clientes', async (_req, res) => {
  try {
    res.json(await readJsonArray('clientes/clientes.json'))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/clientes', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const { cliente = {} } = req.body || {}
    const nombre = String(cliente.nombre || '').trim()
    if (!nombre) return res.status(400).json({ error: 'El nombre del cliente es obligatorio' })

    const clientes = await readJsonArray('clientes/clientes.json')
    const id = `CL-${pad3(nextSeq(clientes, 'ID_Cliente', 'CL-') + 1)}`
    const record = {
      ID_Cliente: id,
      Nombre: nombre,
      Telefono: String(cliente.telefono || ''),
      Email: String(cliente.email || ''),
      Etapa_Embudo: String(cliente.etapa_embudo || 'Cliente potencial'),
      Fecha_Registro: new Date().toISOString().slice(0, 10),
      Notas: String(cliente.notas || ''),
      Zona: String(cliente.zona || ''),
      Tipo_Negocio: String(cliente.tipo_negocio || ''),
      Direccion: String(cliente.direccion || ''),
      Codigo: String(cliente.codigo || ''),
      Fecha_Ultima_Venta: String(cliente.fecha_ultima_venta || ''),
      Monto: String(cliente.monto || ''),
      Fecha_Cobro: String(cliente.fecha_cobro || ''),
    }
    await writeJson('clientes/clientes.json', [...clientes, record])

    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/clientes/:id', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim()
    if (!targetId) return res.status(400).json({ error: 'ID_Cliente requerido' })

    const clientes = await readJsonArray('clientes/clientes.json')
    const idx = clientes.findIndex((c) => c.ID_Cliente === targetId)
    if (idx === -1) return res.status(404).json({ error: `Cliente ${targetId} no encontrado` })

    const allowed = ['Nombre', 'Telefono', 'Email', 'Etapa_Embudo', 'Notas', 'Direccion', 'Zona', 'Tipo_Negocio', 'Codigo', 'Fecha_Ultima_Venta', 'Monto', 'Fecha_Cobro']
    const updates = req.body || {}
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        clientes[idx][key] = updates[key]
      }
    }

    // Auto-estatus: si se asigna Fecha_Cobro, forzar Etapa_Embudo = 'Cobro'
    if (updates.Fecha_Cobro && String(updates.Fecha_Cobro).trim()) {
      clientes[idx].Etapa_Embudo = 'Cobro'
    }

    await writeJson('clientes/clientes.json', clientes)
    res.json(clientes[idx])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Citas ------------------------------------------------------------------------

app.get('/api/citas', async (_req, res) => {
  try {
    res.json(await readJsonArray('citas/citas.json'))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/citas', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const { Fecha, Establecimiento, Motivo, Estado } = req.body || {}
    if (!Fecha || !Establecimiento) {
      return res.status(400).json({ error: 'Fecha y Establecimiento son obligatorios' })
    }
    const citas = await readJsonArray('citas/citas.json')
    const id = `cita-${pad3(nextSeq(citas, 'ID_Cita', 'cita-') + 1)}`
    const record = {
      ID_Cita: id,
      Fecha: String(Fecha),
      Establecimiento: String(Establecimiento),
      Motivo: String(Motivo || ''),
      Estado: String(Estado || 'pendiente'),
      Origen: 'manual',
    }
    await writeJson('citas/citas.json', [...citas, record])
    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/citas/:id', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim()
    const citas = await readJsonArray('citas/citas.json')
    const idx = citas.findIndex((c) => c.ID_Cita === targetId)
    if (idx === -1) return res.status(404).json({ error: `Cita ${targetId} no encontrada` })

    const { Estado, Fecha, Motivo } = req.body || {}
    if (Estado !== undefined) citas[idx].Estado = String(Estado)
    if (Fecha !== undefined) citas[idx].Fecha = String(Fecha)
    if (Motivo !== undefined) citas[idx].Motivo = String(Motivo)

    await writeJson('citas/citas.json', citas)
    res.json(citas[idx])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Elimina una cita por ID.
app.delete('/api/citas/:id', async (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim()
    const citas = await readJsonArray('citas/citas.json')
    const idx = citas.findIndex((c) => c.ID_Cita === targetId)
    if (idx === -1) return res.status(404).json({ error: `Cita ${targetId} no encontrada` })

    const [eliminada] = citas.splice(idx, 1)
    await writeJson('citas/citas.json', citas)
    res.json({ eliminado: targetId, establecimiento: eliminada?.Establecimiento || '' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Cobros -----------------------------------------------------------------------

app.get('/api/cobros', async (_req, res) => {
  try {
    res.json(await readJsonArray('cobros/cobros.json'))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/clientes/:id/cobrar', async (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim()
    const clientes = await readJsonArray('clientes/clientes.json')
    const cliente = clientes.find((c) => c.ID_Cliente === targetId)
    if (!cliente) return res.status(404).json({ error: `Cliente ${targetId} no encontrado` })

    const fechaCobro = String(cliente.Fecha_Cobro || '').trim()
    if (!fechaCobro) {
      return res.status(400).json({ error: 'Este cliente no tiene cobro pendiente (sin Fecha_Cobro)' })
    }

    const monto = String(cliente.Monto || '0').trim()

    // Guardar registro de cobro
    const cobros = await readJsonArray('cobros/cobros.json')
    const id = `cobro-${pad3(nextSeq(cobros, 'ID_Cobro', 'cobro-') + 1)}`
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = pad2(today.getMonth() + 1)
    const dd = pad2(today.getDate())

    const record = {
      ID_Cobro: id,
      ID_Cliente: cliente.ID_Cliente,
      Nombre: cliente.Nombre,
      Monto: monto,
      Fecha_Cobro: fechaCobro,
      Fecha_Cobrado: `${yyyy}-${mm}-${dd}`,
    }
    await writeJson('cobros/cobros.json', [...cobros, record])

    // Resetear cliente: volver a "Cliente activo", limpiar Fecha_Cobro (Monto queda como histórico)
    cliente.Etapa_Embudo = 'Cliente activo'
    cliente.Fecha_Cobro = ''
    await writeJson('clientes/clientes.json', clientes)

    res.json({ cliente, cobro: record })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Notas -----------------------------------------------------------------------
// CRUD de notas diarias + conversión a visitas vía Gemini.

const NOTAS_REL = 'notas/notas.json'

app.get('/api/notas', async (_req, res) => {
  try {
    res.json(await readJsonArray(NOTAS_REL))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/notas', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const { Fecha, Contenido } = req.body || {}
    if (!Contenido || !String(Contenido).trim()) {
      return res.status(400).json({ error: 'El contenido de la nota es obligatorio' })
    }
    const notas = await readJsonArray(NOTAS_REL)
    const id = `nota-${pad3(nextSeq(notas, 'ID_Nota', 'nota-') + 1)}`
    const record = {
      ID_Nota: id,
      Fecha: String(Fecha || new Date().toISOString().slice(0, 10)),
      Contenido: String(Contenido).trim(),
      Convertida: false,
    }
    await writeJson(NOTAS_REL, [...notas, record])
    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/notas/:id', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim()
    const notas = await readJsonArray(NOTAS_REL)
    const idx = notas.findIndex((n) => n.ID_Nota === targetId)
    if (idx === -1) return res.status(404).json({ error: `Nota ${targetId} no encontrada` })

    const { Fecha, Contenido } = req.body || {}
    if (Fecha !== undefined) notas[idx].Fecha = String(Fecha)
    if (Contenido !== undefined) notas[idx].Contenido = String(Contenido).trim()

    await writeJson(NOTAS_REL, notas)
    res.json(notas[idx])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/notas/:id', async (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim()
    const notas = await readJsonArray(NOTAS_REL)
    const idx = notas.findIndex((n) => n.ID_Nota === targetId)
    if (idx === -1) return res.status(404).json({ error: `Nota ${targetId} no encontrada` })

    const [eliminada] = notas.splice(idx, 1)
    await writeJson(NOTAS_REL, notas)
    res.json({ eliminado: targetId })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Usuario (config del vendedor) ------------------------------------------------
// GET/PUT nombre + foto, POST upload foto. Datos en DATA_HOME/usuario.json.

const USUARIO_REL = 'usuario.json'
const USUARIO_FOTO_DIR = 'usuario-fotos'

app.get('/api/usuario', async (_req, res) => {
  try {
    const data = await readJsonIfExists(USUARIO_REL)
    res.json(data || { nombre: '', foto: null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/usuario', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const { nombre, foto } = req.body || {}
    const current = (await readJsonIfExists(USUARIO_REL)) || { nombre: '', foto: null }
    const updated = {
      nombre: nombre !== undefined ? String(nombre).trim() : current.nombre,
      foto: foto !== undefined ? foto : current.foto,
    }
    await writeJson(USUARIO_REL, updated)
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(jpe?g|png|webp|gif)$/i.test(file.originalname)
    cb(ok ? null : new Error('Formato no soportado: usa JPG, PNG, WEBP o GIF'), ok)
  },
})

app.post('/api/usuario/foto', uploadFoto.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Foto no recibida' })

    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg'
    const safeExt = ext === '.jpeg' ? '.jpg' : ext
    const filename = `usuario-foto${safeExt}`
    const dir = path.join(DATA_HOME, USUARIO_FOTO_DIR)
    await fs.mkdir(dir, { recursive: true })

    // Remove old photo if exists
    try {
      const oldFiles = await fs.readdir(dir)
      for (const f of oldFiles) {
        if (f.startsWith('usuario-foto.')) await fs.unlink(path.join(dir, f)).catch(() => {})
      }
    } catch { /* first time */ }

    const target = path.join(dir, filename)
    await fs.writeFile(target, req.file.buffer)

    const fotoUrl = '/api/usuario/foto-file'
    // Persist URL in usuario.json
    const current = (await readJsonIfExists(USUARIO_REL)) || { nombre: '', foto: null }
    current.foto = fotoUrl
    await writeJson(USUARIO_REL, current)

    res.json({ foto: fotoUrl })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Serve the actual photo file
app.get('/api/usuario/foto-file', async (_req, res) => {
  try {
    const dir = path.join(DATA_HOME, USUARIO_FOTO_DIR)
    const files = await fs.readdir(dir).catch(() => [])
    const photo = files.find((f) => f.startsWith('usuario-foto.'))
    if (!photo) return res.status(404).json({ error: 'Sin foto' })
    const ext = path.extname(photo).toLowerCase()
    const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }
    res.set('Content-Type', types[ext] || 'application/octet-stream')
    res.set('Cache-Control', 'public, max-age=86400')
    res.sendFile(path.join(dir, photo))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Gemini helper ----------------------------------------------------------------
// Llama a la API de Gemini con un prompt y devuelve el texto de respuesta.
const callGemini = async (prompt) => {
  const apiKey = process.env.GEMINI_API_KEY || ''
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada en el servidor')

  const model = 'gemini-3.5-flash'
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  )

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${errBody}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!text) throw new Error('El agente devolvió respuesta vacía')
  return text
}

// Convierte una nota a visitas usando Gemini.
// POST /api/notas/:id/convertir → { visitas: [...] }
app.post('/api/notas/:id/convertir', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim()
    const notas = await readJsonArray(NOTAS_REL)
    const nota = notas.find((n) => n.ID_Nota === targetId)
    if (!nota) return res.status(404).json({ error: `Nota ${targetId} no encontrada` })

    const prompt = `Eres un asistente de un vendedor de productos gourmet. Analiza el siguiente texto de una nota de ruta y extrae TODAS las visitas a clientes que se mencionen.

Cada visita debe tener estos campos:
- establecimiento: nombre del negocio/establecimiento visitado
- tipo_negocio: tipo de negocio (restaurante, bar, panadería, almacén, etc.) o ""
- hora_visita: hora de la visita si se menciona (ej: "10:30", "11:35", "4:25 PM"), o ""
- direccion: dirección si se menciona, o ""
- persona_contactada: nombre de la persona si se menciona, o ""
- productos_presentados: productos que se mencionan que se mostraron o que el cliente necesita
- pedido: "Sí" si hay interés concreto o pedido, "No" si solo fue reunión/informativo
- detalle_pedido: detalle del pedido o interés expressado
- proximo_paso: qué sigue (cotizar, enviar muestras, llamar, etc.)

Si el texto menciona UN solo establecimiento, devuelve un array con una sola visita.
Si menciona múltiples establecimientos, devuelve una visita por cada uno.
Si NO se puede identificar ningún establecimiento claro, devuelve un array vacío.

Responde SOLO con JSON válido, sin texto adicional.

Texto de la nota:
${nota.Contenido}

Fecha de la nota: ${nota.Fecha}`

    const text = await callGemini(prompt)

    // Extract JSON from response (may be wrapped in ```json ... ```)
    let visitas = []
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        visitas = JSON.parse(jsonMatch[0])
      }
    } catch {
      throw new Error('No se pudo parsear la respuesta de Gemini como JSON de visitas')
    }

    // Normalize fields
    visitas = visitas.map((v) => ({
      establecimiento: String(v.establecimiento || '').trim(),
      tipo_negocio: String(v.tipo_negocio || '').trim(),
      hora_visita: String(v.hora_visita || '').trim(),
      direccion: String(v.direccion || '').trim(),
      persona_contactada: String(v.persona_contactada || '').trim(),
      productos_presentados: String(v.productos_presentados || '').trim(),
      pedido: String(v.pedido || 'No').trim(),
      detalle_pedido: String(v.detalle_pedido || '').trim(),
      proximo_paso: String(v.proximo_paso || '').trim(),
    }))

    res.json({ visitas, nota_id: targetId, nota_fecha: nota.Fecha })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Guarda visitas convertidas desde una nota + marca la nota como convertida.
// POST /api/notas/:id/guardar-visitas { encabezado, filas: [...] }
app.post('/api/notas/:id/guardar-visitas', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim()
    const notas = await readJsonArray(NOTAS_REL)
    const notaIdx = notas.findIndex((n) => n.ID_Nota === targetId)
    if (notaIdx === -1) return res.status(404).json({ error: `Nota ${targetId} no encontrada` })

    const { encabezado = {}, filas = [] } = req.body || {}
    if (!Array.isArray(filas) || filas.length === 0) {
      return res.status(400).json({ error: 'Se espera filas como array no vacío' })
    }

    // Reuse the existing visitas pipeline
    const validas = filas.filter((f) => String((f && f.establecimiento) || '').trim() !== '')
    const visitas = await readJsonArray('visitas/visitas.json')
    const citas = await readJsonArray('citas/citas.json')
    const seqVisita = nextSeq(visitas, 'ID_Visita', 'visita-')
    const seqCita = nextSeq(citas, 'ID_Cita', 'cita-')

    const records = validas.map((fila, i) => buildVisitaRecord(fila, encabezado, `visita-${pad3(seqVisita + i + 1)}`))

    const nuevasCitas = []
    records.forEach((record) => {
      const fechaCita = parseDateFromText(record.Proximo_Paso)
      if (fechaCita) {
        nuevasCitas.push({
          ID_Cita: `cita-${pad3(seqCita + nuevasCitas.length + 1)}`,
          Fecha: fechaCita,
          Establecimiento: record.Establecimiento,
          Motivo: 'Seguimiento de visita',
          Estado: 'pendiente',
          Origen: 'visita',
          ID_Visita: record.ID_Visita,
        })
      }
    })

    // Reemplazar por fecha: eliminar visitas existentes de la misma fecha antes de guardar
    const fechaReporte = String(encabezado.fecha || '').slice(0, 10)
    const visitasAntes = visitas.length
    const visitasFiltradas = fechaReporte
      ? visitas.filter((v) => String(v.Fecha || '').slice(0, 10) !== fechaReporte)
      : visitas
    const reemplazadas = visitasAntes - visitasFiltradas.length

    await writeJson('visitas/visitas.json', [...visitasFiltradas, ...records])
    if (nuevasCitas.length > 0) await writeJson('citas/citas.json', [...citas, ...nuevasCitas])

    // Mark nota as converted
    notas[notaIdx].Convertida = true
    await writeJson(NOTAS_REL, notas)

    const clientesActualizados = await autoEstatusDesdeVisitas(records)

    res.json({
      guardados: records.length,
      reemplazadas,
      citas_creadas: nuevasCitas.length,
      clientes_actualizados: clientesActualizados,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message })
})

app.listen(PORT, () => {
  console.log(`[zola-server] escuchando en http://localhost:${PORT}`)
  console.log(`[zola-server] DATA_HOME = ${DATA_HOME}`)
})
