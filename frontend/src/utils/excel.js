/**
 * excel.js — Generación de Excel client-side con exceljs.
 * Reemplaza los endpoints /api/export y /api/visitas/export del servidor.
 */

let _ExcelJSCache = null
const getExcelJS = async () => {
  if (!_ExcelJSCache) {
    const mod = await import('exceljs')
    _ExcelJSCache = mod.default || mod
  }
  return _ExcelJSCache
}

/**
 * Exporta datos genéricos a Excel (reemplaza POST /api/export).
 * Devuelve { blob, nombre, registros } — NO descarga: el llamador decide
 * (carpeta nativa o descarga del navegador).
 * @param {Object} opts
 * @param {string} opts.tipo - Tipo de export (para el nombre del archivo)
 * @param {string} opts.hoja - Nombre de la hoja
 * @param {string[]} opts.columnas - Headers de columna
 * @param {Object[][]} opts.filas - Array de arrays o arrays de objetos
 */
export async function exportarExcel({ tipo, hoja = 'Datos', columnas = [], filas = [] }) {
  if (!columnas.length) throw new Error('Sin columnas para exportar')

  const ExcelJS = await getExcelJS()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(hoja)
  ws.columns = columnas.map((c) => ({ header: c, key: c, width: Math.max(12, c.length + 6) }))
  ws.addRows(filas)
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15100D' } }
  ws.getRow(1).font = { bold: true, color: { argb: 'FFF1C27D' } }
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(2, filas.length + 1), column: columnas.length },
  }

  const fecha = new Date().toISOString().slice(0, 10)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const name = `${fecha}_${String(tipo || 'export').replace(/[^a-zA-Z0-9_-]/g, '_')}_${stamp}.xlsx`

  const buffer = await wb.xlsx.writeBuffer()
  const ab = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer
  const blob = new Blob([ab], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  return { blob, nombre: name, registros: filas.length }
}

// ─── Detección determinista de plantilla (port del servidor original) ───

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

// Labels de encabezado (sección arriba de los headers) → campo del reporte.
const LABELS_ENCABEZADO = [
  { kw: ['vendedor'], campo: 'vendedor' },
  { kw: ['zona', 'ruta'], campo: 'zona_ruta' },
  { kw: ['supervisor'], campo: 'supervisor' },
  { kw: ['fecha'], campo: 'fecha' },
]

/**
 * Detección determinista de la estructura de una plantilla Excel.
 * Header row = fila con más celdas no vacías y ≥2 valores DISTINTOS
 * (evita filas merged/título donde todas las celdas dicen lo mismo).
 * dataStartRow = headerRowNumber + 1 — igual que el servidor original.
 */
export function detectarPlantillaDeterminista(ws) {
  let mejor = { count: 0, distinct: 0, rowNumber: 0 }
  for (let r = 1; r <= Math.min(ws.rowCount, 60); r++) {
    const row = ws.getRow(r)
    let count = 0
    const vals = new Set()
    row.eachCell({ includeEmpty: false }, (cell) => {
      count++
      vals.add(NORM(cell.value))
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

  return { headerRowNumber: mejor.rowNumber, columnas, columnMap, encabezadoCells }
}

// Normalize string for matching: lowercase, no accents, no punctuation
const normalizeKey = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

// Known visit fields (DB column names)
const VISIT_FIELDS = ['Establecimiento', 'Tipo_Negocio', 'Direccion', 'Hora_Visita', 'Persona_Contactada', 'Productos_Presentados', 'Pedido', 'Detalle_Pedido', 'Comentarios', 'Proximo_Paso']

// Synonyms for matching template headers to visit fields
const FIELD_SYNONYMS = {
  Establecimiento: ['establecimiento', 'cliente', 'negocio', 'local', 'empresa', 'nombre del establecimiento', 'nombre del negocio', 'razon social', 'razonsocial'],
  Tipo_Negocio: ['tipo de negocio', 'tipo', 'categoria', 'categoría', 'rubr', 'giro', 'tipo negocio'],
  Direccion: ['direccion', 'dirección', 'ubicacion', 'ubicación', 'domicilio', 'dirección / ubicación', 'direccion / ubicacion'],
  Hora_Visita: ['hora', 'hora visita', 'horavisita', 'horario', 'hora de visita'],
  Persona_Contactada: ['persona', 'contacto', 'persona contactada', 'atendido por', 'nombre contacto'],
  Productos_Presentados: ['productos', 'productos presentados', 'items', 'articulos', 'artículos', 'productos mostrados'],
  Pedido: ['pedido', 'hubo pedido', 'venta', 'realizo pedido'],
  Detalle_Pedido: ['detalle', 'detalle pedido', 'descripcion', 'descripción', 'observaciones pedido', 'detalle del pedido'],
  Comentarios: ['comentarios', 'observaciones', 'notas', 'comentario', 'comentarios importantes'],
  Proximo_Paso: ['proximo', 'próximo', 'siguiente', 'seguimiento', 'proximo paso', 'próximo paso', 'proximopaso'],
}

function matchHeaderToField(header) {
  const norm = normalizeKey(header)
  // Exact match first
  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    if (synonyms.some(s => normalizeKey(s) === norm)) return field
  }
  // Partial match
  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    if (synonyms.some(s => norm.includes(normalizeKey(s)) || normalizeKey(s).includes(norm))) return field
  }
  return null
}

// Helper: convert column letter(s) to 1-based number (A=1, Z=26, AA=27)
function colLetterToNumber(letters) {
  let n = 0
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n
}

/**
 * Genera el blob Excel de visitas SIN descargarlo.
 * Si hay plantilla del usuario, la carga como base y rellena los datos con la
 * DETECCIÓN DETERMINISTA (port 1:1 del servidor original):
 *   - header row = fila con más celdas y ≥2 valores distintos
 *   - dataStartRow = headerRowNumber + 1
 *   - columnMap = MAPEO_HEADER_A_CAMPO (headers → campos de visita)
 *   - encabezadoCells = labels Vendedor/Zona/Fecha (celda derecha o prefijo)
 * El plan del agente NO participa del relleno (queda solo como capa de
 * detección/preview). Si no hay plantilla, o la plantilla no tiene columnas
 * mapeables, crea un workbook nuevo con columnas estándar (como el servidor).
 */
export async function buildVisitasBlob({ visitas, encabezado = {}, periodo = 'dia', fecha = '', plantilla = null }) {
  const ExcelJS = await getExcelJS()
  let wb
  let plantillaUsada = false

  if (plantilla && plantilla.existe && plantilla.buffer) {
    // ── CON PLANTILLA: cargar y rellenar determinísticamente ──
    wb = new ExcelJS.Workbook()
    await wb.xlsx.load(plantilla.buffer)
    const ws = wb.worksheets[0]
    if (!ws) throw new Error('La plantilla no tiene hojas')

    const det = detectarPlantillaDeterminista(ws)
    if (det && det.columnMap.size > 0) {
      const encVal = {
        vendedor: encabezado.vendedor || '',
        zona_ruta: encabezado.zona_ruta || '',
        supervisor: encabezado.supervisor || '',
        fecha: fecha || encabezado.fecha || '',
      }

      // Encabezado fijo (labels "Vendedor:", "Zona:", "Fecha:")
      for (const item of det.encabezadoCells) {
        const valor = encVal[item.campo]
        if (item.prefijo) {
          ws.getCell(item.ref).value = `${item.prefijo} ${valor || ''}`.trim()
        } else if (valor) {
          ws.getCell(item.ref).value = valor
        }
      }

      // Tabla de visitas: primera fila de datos = headerRowNumber + 1
      const colMapping = [...det.columnMap.entries()].map(([campo, col]) => ({ col, field: campo }))
      let dataRow = det.headerRowNumber + 1
      for (const v of visitas) {
        const row = ws.getRow(dataRow)
        for (const { col, field } of colMapping) {
          const valor = String(v[field] ?? '')
          if (valor !== '') row.getCell(col).value = valor
        }
        row.commit()
        dataRow++
      }

      plantillaUsada = true
    }
  }

  if (!wb || !plantillaUsada) {
    // ── SIN PLANTILLA (o plantilla sin columnas mapeables): workbook nuevo ──
    wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Visitas')

    const widths = [30, 20, 28, 14, 20, 26, 10, 26, 28, 26]
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

    ws.getCell('A1').value = 'Nombre del Vendedor:'
    ws.getCell('B1').value = encabezado.vendedor || ''
    ws.getCell('A2').value = 'Zona / Ruta:'
    ws.getCell('B2').value = encabezado.zona_ruta || ''
    ws.getCell('C2').value = 'Supervisor:'
    ws.getCell('D2').value = encabezado.supervisor || ''
    ws.getCell('A3').value = 'Fecha:'
    ws.getCell('B3').value = fecha || encabezado.fecha || ''
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
  }

  const now = new Date().toISOString().slice(0, 10)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const nombre = `${now}_visitas_${periodo}_${fecha || 'todas'}_${stamp}.xlsx`

  const buffer = await wb.xlsx.writeBuffer()
  // Ensure clean ArrayBuffer — writeBuffer() may return a Buffer polyfill
  // that FileSystemWritableStream.write() doesn't recognize
  const ab = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer
  const blob = new Blob([ab], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  return { blob, nombre, registros: visitas.length }
}

// ─── Export presentable del Dashboard (datos + gráficos) ─────────────
// exceljs no genera gráficos nativos de Excel: dibujamos los gráficos en
// canvas (browser) y los embebemos como PNG en el workbook.

const DARK = 'FF15100D'
const GOLD = 'FFF1C27D'
const GREEN = 'FF6B8F47'
const DANGER = 'FFA8433A'
const GRAY = 'FF8A8278'
const LINE = 'FFE7E2D9'

const fmtMoney = (n) => '$' + Number(n || 0).toLocaleString('es-AR')

/**
 * Dibuja un gráfico de barras y devuelve un dataURL PNG (o null si no hay
 * canvas, ej. en Node). Usado para incrustar la imagen en el Excel.
 */
function dibujarGraficoPNG({ title, labels, values, color, fmt, W = 620, H = 250 }) {
  if (typeof document === 'undefined') return null
  try {
    const dpr = 2
    const canvas = document.createElement('canvas')
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, W, H)

    const padL = 64
    const padR = 16
    const padT = 46
    const padB = 36
    const max = Math.max(1, ...values.map((v) => Number(v) || 0))
    const chartW = W - padL - padR
    const chartH = H - padT - padB
    const slot = chartW / labels.length
    const barW = Math.max(8, slot * 0.5)

    // Grid + etiquetas del eje Y
    ctx.font = '11px system-ui, sans-serif'
    for (const g of [0, 0.5, 1]) {
      const y = padT + chartH * (1 - g)
      ctx.strokeStyle = LINE
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padL, y)
      ctx.lineTo(W - padR, y)
      ctx.stroke()
      ctx.fillStyle = GRAY
      ctx.textAlign = 'right'
      ctx.fillText(fmt ? fmt(max * g) : String(Math.round(max * g)), padL - 8, y + 4)
    }

    // Barras
    ctx.textAlign = 'center'
    labels.forEach((lab, i) => {
      const x = padL + slot * i + slot / 2
      const val = Number(values[i]) || 0
      const h = Math.max(0, (val / max) * chartH)
      const y = padT + chartH - h
      if (h > 0) {
        ctx.fillStyle = color
        ctx.fillRect(x - barW / 2, y, barW, h)
      }
      ctx.fillStyle = DARK
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.fillText(fmt ? fmt(val) : String(val), x, y - 6)
      ctx.fillStyle = '#6E665C'
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText(lab, x, H - padB + 16)
    })

    // Título
    ctx.fillStyle = DARK
    ctx.font = '700 16px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(title, 16, 28)

    return canvas.toDataURL('image/png')
  } catch (e) {
    console.warn('[excel] no se pudo dibujar gráfico:', e)
    return null
  }
}

/** Escribe una tabla con header oscuro + filas; devuelve la última fila usada. */
function escribirTabla(ws, startRow, headers, rows, opts = {}) {
  const hr = ws.getRow(startRow)
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: GOLD, size: 11 } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF3A332C' } } }
  })
  hr.height = 22

  rows.forEach((r, i) => {
    const row = ws.getRow(startRow + 1 + i)
    r.forEach((v, j) => {
      const cell = row.getCell(j + 1)
      cell.value = v
      if (opts.moneyCols && opts.moneyCols.includes(j + 1)) cell.numFmt = '"$"#,##0'
    })
    row.height = 19
  })
  return startRow + 1 + rows.length
}

function tituloSeccion(ws, row, texto) {
  const cell = ws.getRow(row).getCell(1)
  cell.value = texto
  cell.font = { bold: true, size: 13, color: { argb: DARK } }
  return row
}

/** Incrusta un PNG de gráfico debajo de la tabla; devuelve la fila siguiente segura. */
function insertarGrafico(ws, imageId, topRow, H = 250, W = 620) {
  if (imageId != null) {
    ws.addImage(imageId, { tl: { col: 0, row: topRow - 1 }, ext: { width: W, height: H } })
  }
  const rowsOcupadas = Math.ceil(H / 15) // altura default de fila ≈ 15px
  return topRow + rowsOcupadas + 3
}

/**
 * Export presentable del Dashboard: KPIs + tablas + gráficos (PNG embebido)
 * en una hoja "Dashboard", listas de seguimiento en "Cobros y seguimiento"
 * y el detalle de visitas del período en "Visitas del período".
 * Devuelve { blob, nombre, registros }.
 */
export async function exportarDashboard({
  periodo = '',
  stats = [],
  visitasDia = [],
  cobrado = [],
  nuevos = [],
  proximosCobros = [],
  sinVisitar = [],
  visitasPeriodo = [],
}) {
  const ExcelJS = await getExcelJS()
  const wb = new ExcelJS.Workbook()

  // ── Hoja 1: Dashboard ──
  const ws = wb.addWorksheet('Dashboard')
  const fechaGen = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

  // Título
  const t1 = ws.getCell('A1')
  t1.value = 'Dashboard general'
  t1.font = { bold: true, size: 18, color: { argb: GOLD } }
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
  ws.getCell('B1').fill = t1.fill
  ws.getCell('C1').fill = t1.fill
  ws.getRow(1).height = 30
  ws.getCell('A2').value = `Período: ${periodo || '—'}   ·   Generado: ${fechaGen}   ·   ${visitasPeriodo.length} visitas en el período`
  ws.getCell('A2').font = { italic: true, color: { argb: GRAY }, size: 10 }
  ws.getRow(2).height = 20

  // KPIs (filas 4-5, columnas A, D, G, J, M)
  const kpiCols = [1, 4, 7, 10, 13]
  stats.slice(0, kpiCols.length).forEach((s, i) => {
    const c = kpiCols[i]
    const toneColor = s.tone === 'danger' ? DANGER : s.tone === 'success' ? GREEN : GOLD
    const lc = ws.getCell(4, c)
    lc.value = s.label.toUpperCase()
    lc.font = { bold: true, size: 9, color: { argb: GRAY } }
    const vc = ws.getCell(5, c)
    vc.value = s.value
    vc.font = { bold: true, size: 20, color: { argb: toneColor } }
    ws.mergeCells(5, c, 5, c + 1)
  })
  ws.getRow(4).height = 16
  ws.getRow(5).height = 28

  // Gráfico 1: Visitas por día
  let r = tituloSeccion(ws, 7, 'Visitas por día de semana')
  r = escribirTabla(
    ws,
    r + 1,
    ['Día', 'Visitas'],
    visitasDia.map((d) => [d.label, d.value]),
    {}
  )
  let img = dibujarGraficoPNG({
    title: 'Visitas por día de semana',
    labels: visitasDia.map((d) => d.label),
    values: visitasDia.map((d) => d.value),
    color: GOLD,
  })
  let imageId = img ? wb.addImage({ base64: img.split(',')[1], extension: 'png' }) : null
  r = insertarGrafico(ws, imageId, r + 1)

  // Gráfico 2: Dinero cobrado
  r = tituloSeccion(ws, r, 'Dinero cobrado')
  r = escribirTabla(
    ws,
    r + 1,
    ['Período', 'Monto'],
    cobrado.map((d) => [d.label, d.value]),
    { moneyCols: [2] }
  )
  img = dibujarGraficoPNG({
    title: 'Dinero cobrado',
    labels: cobrado.map((d) => d.label),
    values: cobrado.map((d) => d.value),
    color: GREEN,
    fmt: fmtMoney,
  })
  imageId = img ? wb.addImage({ base64: img.split(',')[1], extension: 'png' }) : null
  r = insertarGrafico(ws, imageId, r + 1)

  // Gráfico 3: Clientes nuevos
  r = tituloSeccion(ws, r, 'Clientes nuevos')
  r = escribirTabla(
    ws,
    r + 1,
    ['Período', 'Clientes'],
    nuevos.map((d) => [d.label, d.value]),
    {}
  )
  img = dibujarGraficoPNG({
    title: 'Clientes nuevos',
    labels: nuevos.map((d) => d.label),
    values: nuevos.map((d) => d.value),
    color: GOLD,
  })
  imageId = img ? wb.addImage({ base64: img.split(',')[1], extension: 'png' }) : null
  insertarGrafico(ws, imageId, r + 1)

  ws.getColumn(1).width = 22
  ws.getColumn(2).width = 16

  // ── Hoja 2: Cobros y seguimiento ──
  const ws2 = wb.addWorksheet('Cobros y seguimiento')
  const s2t = ws2.getCell('A1')
  s2t.value = 'Cobros y seguimiento'
  s2t.font = { bold: true, size: 15, color: { argb: GOLD } }
  s2t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
  ws2.getCell('B1').fill = s2t.fill
  ws2.getCell('C1').fill = s2t.fill
  ws2.getCell('D1').fill = s2t.fill
  ws2.getCell('E1').fill = s2t.fill
  ws2.getRow(1).height = 26

  let r2 = tituloSeccion(ws2, 3, 'Próximos cobros')
  r2 = escribirTabla(
    ws2,
    r2 + 1,
    ['Cliente', 'Zona / Tipo', 'Monto', 'Fecha', 'Estado'],
    proximosCobros.map((c) => [c.nombre, c.detalle, c.monto || 0, c.date, c.badge]),
    { moneyCols: [3] }
  )
  r2 = tituloSeccion(ws2, r2 + 2, 'Clientes sin visitar (+15 días)')
  escribirTabla(
    ws2,
    r2 + 1,
    ['Cliente', 'Zona', 'Tipo', 'Días sin visita'],
    sinVisitar.map((c) => [c.nombre, c.zona, c.tipo, c.dias === null ? 'Sin visitas' : c.dias]),
    {}
  )
  ws2.getColumn(1).width = 34
  ws2.getColumn(2).width = 26
  ws2.getColumn(3).width = 14
  ws2.getColumn(4).width = 14
  ws2.getColumn(5).width = 16

  // ── Hoja 3: Visitas del período ──
  const ws3 = wb.addWorksheet('Visitas del período')
  const s3t = ws3.getCell('A1')
  s3t.value = `Visitas del período (${visitasPeriodo.length})`
  s3t.font = { bold: true, size: 15, color: { argb: GOLD } }
  s3t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
  for (let i = 2; i <= 10; i++) ws3.getCell(1, i).fill = s3t.fill
  ws3.getRow(1).height = 26

  const headersV = [
    'Fecha',
    'Hora',
    'Establecimiento',
    'Tipo',
    'Dirección',
    'Persona',
    'Productos',
    'Pedido',
    'Comentarios',
    'Próximo paso',
  ]
  escribirTabla(ws3, 3, headersV, visitasPeriodo.map((v) => [
    v.Fecha || '',
    v.Hora_Visita || '',
    v.Establecimiento || '',
    v.Tipo_Negocio || '',
    v.Direccion || '',
    v.Persona_Contactada || '',
    v.Productos_Presentados || '',
    v.Pedido ? 'Sí' : 'No',
    v.Detalle_Pedido || '',
    v.Proximo_Paso || '',
  ]))
  ws3.getColumn(1).width = 12
  ws3.getColumn(2).width = 12
  ws3.getColumn(3).width = 32
  ws3.getColumn(4).width = 18
  ws3.getColumn(5).width = 30
  ws3.getColumn(6).width = 20
  ws3.getColumn(7).width = 26
  ws3.getColumn(8).width = 10
  ws3.getColumn(9).width = 30
  ws3.getColumn(10).width = 26

  const fecha = new Date().toISOString().slice(0, 10)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const nombre = `${fecha}_dashboard_${stamp}.xlsx`

  const buffer = await wb.xlsx.writeBuffer()
  const ab = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer
  const blob = new Blob([ab], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  return { blob, nombre, registros: visitasPeriodo.length }
}