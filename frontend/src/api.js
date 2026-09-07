/**
 * api.js — Capa de acceso a datos client-side.
 * Reescribirá todas las llamadas fetch(/api/*) para usar db.js (IndexedDB).
 * Las vistas NO cambian — siguen importando las mismas funciones.
 *
 * Fases pendientes (stub por ahora):
 * - exportarExcel / exportarVisitas → exceljs client-side (Fase 5)
 * - subirMenus / subirDatos → IndexedDB blob storage
 * - convertirNota → agente.js directo (Fase 4)
 * - getReports / downloadReportDocx → reports en IndexedDB
 */

import { toRaw } from 'vue'
import { db } from './db.js'
import { callAgente, analizarPlantillaConAgente } from './agente.js'
import { exportarExcel as exportExcel, buildVisitasBlob, detectarPlantillaDeterminista, exportarDashboard as exportarDashboardExcel } from './utils/excel.js'
import { extractText } from './utils/extractText.js'
import { generarDocxBlob } from './utils/generarDocx.js'
import { normalizarMonto } from './utils/dinero.js'

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Coacciona un valor a un primitivo clonable para IndexedDB.
 * Desenvuelve proxies reactivos de Vue (structured clone NO clona Proxies:
 * "could not be cloned") y normaliza tipos.
 */
export const fmt = (v) => {
  if (v === null || v === undefined) return ''
  let raw = v
  try {
    raw = toRaw(v)
  } catch {
    raw = v
  }
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'boolean') return raw ? 'Sí' : 'No'
  if (typeof raw === 'function') return ''
  if (Array.isArray(raw)) return raw.map(fmt).filter(Boolean).join(', ')
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw)
    } catch {
      return ''
    }
  }
  return String(raw)
}

// ─── Estado ──────────────────────────────────────────────────────

export const getEstado = async () => {
  const [stats, entrantes, reportsDocx, catalogoRaw] = await Promise.all([
    db.stats(),
    db.entrantes.getAll(),
    db.reportsDocx.getAll(),
    db.catalogo.get(),
  ])
  const clientesPendientes = entrantes
    .filter((e) => e.tipo === 'clientes')
    .map((e) => e.archivo)
  const productosPendientes = entrantes
    .filter((e) => e.tipo === 'productos')
    .map((e) => e.archivo)

  // Totales del catálogo (mismo criterio que la conversión de productos).
  const categorias = catalogoRaw?.categorias && typeof catalogoRaw.categorias === 'object' ? catalogoRaw.categorias : {}
  const totalProductos = Object.values(categorias).reduce((a, c) => a + (Array.isArray(c) ? c.length : 0), 0)
  const totalCategorias = Object.keys(categorias).length

  return {
    db: 'indexeddb',
    stats,
    entrantes: { clientes: clientesPendientes, productos: productosPendientes },
    reportesDocx: reportsDocx.map((r) => r.archivo),
    catalogo: { totalProductos, totalCategorias },
  }
}

// ─── Backup portátil (export/import de todos los datos locales) ──
export const exportarDatos = () => db.exportarDatos()

export const importarDatos = (archivo, onProgress) => db.importarDatos(archivo, onProgress)

// ─── Catálogo ────────────────────────────────────────────────────

export const getCatalogo = async () => {
  const data = await db.catalogo.get()
  return data || { categorias: {} }
}

// ─── Menús ───────────────────────────────────────────────────────

export const getMenus = async () => {
  // Lista de menús ya extraídos desde IndexedDB.
  try {
    const records = await db.menus.getAll()
    return records.map((m) => ({
      archivo: m.archivo,
      source_file: m.source_file || '',
      source_files: m.source_files || [],
      extraction_method: m.extraction_method || '',
      lineas: m.lineas != null ? m.lineas : String(m.text || '').split('\n').filter((l) => l.trim()).length,
      text: m.text || '',
    }))
  } catch (err) {
    console.warn('[Menús] No se pudo listar de IndexedDB:', err.message)
    return []
  }
}

export const getMenu = async (name) => {
  try {
    const safe = String(name || '').endsWith('.json') ? name : `${name}.json`
    return await db.menus.getById(safe)
  } catch (err) {
    console.warn('[Menús] No se pudo leer de IndexedDB:', err.message)
    return null
  }
}

/**
 * Sanitiza el nombre del menú exactamente como el server (/api/upload):
 * quita extensión, no-alfanuméricos → '_', slice 80, trim '_'.
 */
const sanitizarNombre = (raw, fallbackBase) => {
  let nombre = String(raw || '')
    .replace(/\.[^.]+$/, '') // sin extensión
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80)
    .replace(/^_+|_+$/g, '')
    .trim()
  if (!nombre) {
    nombre = String(fallbackBase || '')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
  }
  return nombre
}

export const subirMenus = async (files, nombre, onProgress, signal) => {
  const lista = Array.from(files || [])
  if (!lista.length) throw new Error('No se recibieron archivos')

  const base = sanitizarNombre(nombre, lista[0]?.name || 'menú')
  if (!base) throw new Error('Nombre de menú inválido')

  // Si nos cancelan, abortamos antes de empezar.
  if (signal?.aborted) {
    const ab = new Error('Cancelado')
    ab.name = 'AbortError'
    throw ab
  }

  // Extraer texto de cada hoja (PDF → capa de texto u OCR, imagen → OCR).
  const textos = []
  const methods = []
  const sourceFiles = []
  const blobs = []
  for (let i = 0; i < lista.length; i++) {
    if (signal?.aborted) {
      const ab = new Error('Cancelado')
      ab.name = 'AbortError'
      throw ab
    }
    const file = lista[i]
    if (onProgress) onProgress({ fase: 'procesando', pct: Math.round((i / lista.length) * 100) })
    const { text, method } = await extractText(file, (p) => {
      if (onProgress) {
        onProgress({ fase: 'procesando', pct: Math.round(((i + (p?.pct ?? 0) / 100) / lista.length) * 100) })
      }
    })
    const saveName = String(file.name || '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const separador = textos.length > 0 ? `\n\n--- Hoja ${i + 1}: ${saveName} ---\n\n` : ''
    textos.push(`${separador}${text}`)
    if (method) methods.push(method)
    sourceFiles.push(file.name)
    blobs.push(file)
  }

  const textoConcatenado = textos.join('')
  const extractionMethod = methods.find(Boolean) || 'desconocido'
  const archivo = `${base}.json`

  await db.menus.save({
    archivo,
    source_file: sourceFiles[0],
    source_files: sourceFiles,
    extraction_method: extractionMethod,
    lineas: textoConcatenado.split('\n').filter((l) => l.trim()).length,
    text: textoConcatenado,
    blobs,
  })

  if (onProgress) onProgress({ fase: 'procesando', pct: 100 })

  return {
    ok: true,
    data: {
      archivo,
      source_file: sourceFiles[0],
      source_files: sourceFiles,
      extraction_method: extractionMethod,
      lineas: textoConcatenado.split('\n').filter((l) => l.trim()).length,
    },
  }
}

export const subirDatos = async (tipo, file) => {
  const nombre = file.name
  const isJson = /\.json$/i.test(nombre)
  const isXlsx = /\.(xlsx|xls)$/i.test(nombre)
  const isCsv = /\.csv$/i.test(nombre)

  if (!isJson && !isXlsx && !isCsv) {
    throw new Error('Formato no soportado: usa XLSX, CSV o JSON')
  }

  // Snapshot (leído en el handler para no perder el File en móvil) o File vivo.
  const buffer = file.buffer instanceof ArrayBuffer ? file.buffer : await file.arrayBuffer()

  // JSON → direct load (bypass entrantes queue)
  if (isJson) {
    const text = new TextDecoder().decode(buffer)
    let parsed
    try { parsed = JSON.parse(text) } catch { throw new Error('JSON inválido: no se pudo parsear') }

    if (tipo === 'productos') {
      if (!parsed || typeof parsed !== 'object' || !parsed.categorias || typeof parsed.categorias !== 'object') {
        throw new Error('JSON de productos debe tener { catalogo, categorias }')
      }
      await db.catalogo.save(parsed)
      const total = Object.values(parsed.categorias).reduce((a, c) => a + (Array.isArray(c) ? c.length : 0), 0)
      return { ruta: 'catalogo', nota: `Catálogo cargado directo: ${total} productos, ${Object.keys(parsed.categorias).length} categorías.` }
    }

    if (tipo === 'clientes') {
      if (!Array.isArray(parsed)) throw new Error('JSON de clientes debe ser un array')
      // Map to IndexedDB clients
      let seq = 0
      const clientes = parsed.map((r) => {
        seq++
        return {
          ID_Cliente: `CL-${String(seq).padStart(3, '0')}`,
          Nombre: r.Nombre || r.razon_social || r.razonsocial || r.nombre || '',
          Telefono: r.Telefono || r.telefono1 || r.telefono || '',
          Email: r.Email || r.email || '',
          Etapa_Embudo: r.Etapa_Embudo || (r.Fecha_Ultima_Venta ? 'Cliente activo' : 'Cliente potencial'),
          Fecha_Registro: r.Fecha_Registro || new Date().toISOString().slice(0, 10),
          Notas: r.Notas || r.notas || '',
          Tipo_Negocio: r.Tipo_Negocio || r.tipone || r.tipo_negocio || '',
          Direccion: r.Direccion || r.direccioncompleta || r.direccion || '',
          Zona: r.Zona || r.zona || '',
          Codigo: r.Codigo || r['#'] || r.codigo || '',
          Fecha_Ultima_Venta: r.Fecha_Ultima_Venta || r.fechaultventa || '',
          Monto: (r.Monto ?? r.monto) ? normalizarMonto(r.Monto ?? r.monto) : '',
        }
      })
      await db.clientes.saveAll(clientes)
      return { ruta: 'clientes', nota: `Base de clientes cargada: ${clientes.length} registros.` }
    }

    throw new Error(`JSON no soportado para tipo "${tipo}"`)
  }

  // xlsx/csv → store in entrantes for conversion
  await db.entrantes.save({
    id: `${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tipo,
    archivo: nombre,
    buffer,
    bytes: file.size,
    fecha: new Date().toISOString(),
  })

  return { ruta: `entrantes/${tipo}/${nombre}`, nota: 'Archivo guardado, pendiente de conversión.' }
}

// ─── Reportes ────────────────────────────────────────────────────

export const getReports = async () => {
  // Lista de reportes .md guardados en IndexedDB.
  try {
    const records = await db.reportes.getAll()
    return records.map((r) => r.archivo)
  } catch (err) {
    console.warn('[Reportes] No se pudo listar de IndexedDB:', err.message)
    return []
  }
}

export const getReport = async (name) => {
  try {
    const record = await db.reportes.getById(name)
    if (!record) throw new Error('No encontrado')
    return String(record.texto || '')
  } catch (err) {
    console.warn('[Reportes] No se pudo leer de IndexedDB:', err.message)
    throw new Error(`No se pudo leer el reporte: ${err.message}`)
  }
}

/**
 * Guarda el reporte de estrategia generado en la app y lo convierte a .docx
 * client-side con generarDocxBlob (reemplaza el pipeline servidor pandoc).
 * @returns {Promise<{md: string, docx: string|null}>}
 */
export const guardarReporte = async (nombre, contenido) => {
  const texto = String(contenido || '').trim()
  if (!texto) throw new Error('Reporte vacío')

  const base = String(nombre)
    .replace(/\.[^.]+$/, '')            // sin extensión
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80)
    .replace(/^_+|_+$/g, '')
    .trim()
  if (!base) throw new Error('Nombre de reporte inválido')

  const fecha = new Date().toISOString().slice(0, 10)
  const mdName = `${fecha}_${base}.md`
  const docxName = `${fecha}_${base}.docx`

  await db.reportes.save({ archivo: mdName, texto })

  let docx = null
  try {
    const blob = await generarDocxBlob(texto)
    await db.reportsDocx.save({ archivo: docxName, blob })
    docx = docxName
  } catch (err) {
    console.warn('[Reportes] No se pudo generar .docx client-side:', err.message)
  }

  return { md: mdName, docx }
}

/**
 * Descarga un .docx (leído de IndexedDB) dejando que el usuario elija dónde
 * guardarlo con el diálogo nativo (File System Access API). Si el navegador
 * no lo soporta o el usuario cancela, cae al modo descarga (array-buffer →
 * objectURL → <a download>), que sirve también en móvil.
 * @param {string} name Nombre del archivo .docx en reportsDocx/
 * @returns {Promise<'saved'|'cancel'|'fallback'>}
 */
export const guardarDocxComo = async (name) => {
  const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '_')

  const record = await db.reportsDocx.getById(safe)
  if (!record?.blob) throw new Error(`No se encontró el documento ${safe}`)
  const blob = record.blob instanceof Blob ? record.blob : new Blob([record.blob])

  const saveNativo = async () => {
    // Necesita gesto del usuario y contexto seguro (localhost / https).
    let handle
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: safe,
        types: [
          {
            description: 'Documento Word',
            accept: {
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            },
          },
        ],
      })
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancel' // usuario canceló el picker
      return 'fallback'
    }
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return 'saved'
  }

  if (window.showSaveFilePicker) {
    try {
      return await saveNativo()
    } catch (err) {
      console.warn('[Docx] Guardado nativo falló:', err.message)
      return 'fallback'
    }
  }

  // Fallback: descarga directa a la carpeta de descargas del navegador.
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safe
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'fallback'
}

export const getReportsDocx = async () => {
  const records = await db.reportsDocx.getAll()
  return records.map((r) => r.archivo)
}

export const downloadReportDocx = async (name) => {
  // TODO: download report from IndexedDB
  throw new Error('downloadReportDocx no implementado aún')
}

// ─── Exportar Excel (client-side con exceljs) ────────────────────

export const exportarExcel = (opts) => exportExcel(opts)

export const exportarDashboard = (data) => exportarDashboardExcel(data)

// ─── Visitas ─────────────────────────────────────────────────────

export const getVisitas = () => db.visitas.getAll()

export const contarVisitasPorFecha = async (fecha) => {
  const count = await db.visitas.countByDate(fecha)
  return { fecha, count }
}

export const guardarVisitas = async (payload) => {
  const { fecha, visitas: nuevas, vendedor, zona_ruta, supervisor } = payload
  const normFecha = String(fecha || '').slice(0, 10)
  const records = nuevas.map((v) => ({
    ID_Visita: fmt(v.ID_Visita),
    Fecha: normFecha,
    Hora_Visita: fmt(v.hora_visita),
    Vendedor: fmt(vendedor),
    Zona_Ruta: fmt(zona_ruta),
    Supervisor: fmt(supervisor),
    Establecimiento: fmt(v.establecimiento),
    Tipo_Negocio: fmt(v.tipo_negocio),
    Direccion: fmt(v.direccion),
    Persona_Contactada: fmt(v.persona_contactada),
    Productos_Presentados: fmt(v.productos_presentados),
    Pedido: fmt(v.pedido),
    Detalle_Pedido: fmt(v.detalle_pedido),
    Monto: fmt(v.monto),
    Comentarios: fmt(v.comentarios),
    Proximo_Paso: fmt(v.proximo_paso),
  }))
  const result = await db.visitas.replaceByDate(normFecha, records)

  // Auto-estatus: update client stage based on visitas
  await autoEstatusDesdeVisitas(records)

  return { guardadas: records.length, reemplazadas: result.reemplazadas }
}

export const exportarVisitas = async (filtro = {}) => {
  const allVisitas = await db.visitas.getAll()
  const user = await db.usuario.get()
  const encabezado = {
    vendedor: user.nombre || '',
    zona_ruta: user.zona_ruta || '',
    supervisor: user.supervisor || '',
    fecha: user.fecha || '',
  }

  // Apply date/period filter (same logic as VisitasView visitasVisibles)
  const fecha = String(filtro.fecha || '')
  const periodo = filtro.periodo || 'dia'
  let visitas = allVisitas
  if (fecha) {
    visitas = allVisitas.filter((v) => {
      const f = String(v.Fecha || '').slice(0, 10)
      if (periodo === 'anio') return f.startsWith(fecha.slice(0, 4))
      if (periodo === 'mes') return f.startsWith(fecha.slice(0, 7))
      return f === fecha
    })
  }

  // Load plantilla (full buffer + metadata) if uploaded
  const plantilla = await getPlantillaReporte()

  return buildVisitasBlob({ visitas, encabezado, periodo, fecha, plantilla })
}

export const eliminarVisita = (id) => db.visitas.delete(id)

export const actualizarVisita = (id, cambios) => db.visitas.update(id, cambios)

// ─── Auto-estatus desde visitas ──────────────────────────────────

const autoEstatusDesdeVisitas = async (records) => {
  const clientes = await db.clientes.getAll()
  const citas = await db.citas.getAll()
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
    const idx = clientes.findIndex((c) => {
      const nombre = norm(c.Nombre)
      return nombre.includes(estab) || estab.includes(nombre)
    })
    if (idx === -1) continue

    const cliente = clientes[idx]
    const pedido = norm(r.Pedido)
    const proximoPaso = norm(r.Proximo_Paso)
    const fecha = r.Fecha || ''

    const addDays = (dateStr, days) => {
      const parts = String(dateStr || '').split('-')
      if (parts.length !== 3) return ''
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      d.setDate(d.getDate() + days)
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    }

    if (pedido === 'si') {
      cliente.Etapa_Embudo = 'Cliente activo'
      cliente.Fecha_Cobro = addDays(fecha, 15)
      if (String(r.Monto ?? '').trim()) cliente.Monto = normalizarMonto(r.Monto)
      updated++
    } else if (proximoPaso === 'cobro') {
      cliente.Etapa_Embudo = 'Cobro'
      cliente.Fecha_Cobro = addDays(fecha, 15)
      if (String(r.Monto ?? '').trim()) cliente.Monto = normalizarMonto(r.Monto)
      updated++
    } else if (proximoPaso.includes('seguimiento') || proximoPaso.includes('visita')) {
      cliente.Etapa_Embudo = 'Seguimiento'
      const nota = `[${fecha}] Próximo paso: ${r.Proximo_Paso}`
      cliente.Notas = cliente.Notas ? `${cliente.Notas}\n${nota}` : nota
      const fechaRecordatorio = addDays(fecha, 15)
      if (fechaRecordatorio) {
        const id = await db.nextId('citas', 'cita-')
        citas.push({
          ID_Cita: id,
          Fecha: fechaRecordatorio,
          Establecimiento: r.Establecimiento || cliente.Nombre || '',
          Motivo: `Seguimiento automático desde visita ${fecha}`,
          Estado: 'pendiente',
          Origen: 'auto-estatus',
          ID_Cliente: cliente.ID_Cliente,
        })
      }
      updated++
    }
  }

  if (updated > 0) {
    await db.clientes.saveAll(clientes)
    await db.citas.saveAll(citas)
  }
  return updated
}

// ─── Clientes ────────────────────────────────────────────────────

export const getClientes = () => db.clientes.getAll()

export const crearCliente = async (cliente) => {
  const id = await db.nextId('clientes', 'cli-')
  const record = {
    ID_Cliente: id,
    Etapa_Embudo: cliente.Etapa_Embudo || 'Cliente potencial',
    Fecha_Registro: new Date().toISOString().slice(0, 10),
    ...cliente,
  }
  await db.clientes.save(record)
  // Standalone: ya no hay sync best-effort al server; el ID canónico local
  // (cli-xxx) es el único. La app lee todo de IndexedDB.
  return record
}

export const actualizarCliente = (id, cambios) => db.clientes.update(id, cambios)

export const cobrarCliente = async (id, etapaFinal = 'Cobrado') => {
  const cliente = await db.clientes.getById(id)
  if (!cliente) throw new Error('Cliente no encontrado')
  const monto = normalizarMonto(cliente.Monto)
  cliente.Etapa_Embudo = etapaFinal
  cliente.Fecha_Cobro = ''
  cliente.Monto = ''
  await db.clientes.save(cliente)

  // Registrar el cobro en el store de cobros (para Dashboard "Dinero cobrado")
  const idCobro = await db.nextId('cobros', 'cobro-')
  const hoy = new Date().toISOString().slice(0, 10)
  await db.cobros.save({
    ID_Cobro: idCobro,
    Fecha_Cobrado: hoy,
    Monto: monto,
    Establecimiento: cliente.Nombre || '',
    Cliente_ID: cliente.ID_Cliente,
  })

  return cliente
}

// ─── Citas ───────────────────────────────────────────────────────

export const getCitas = () => db.citas.getAll()

export const crearCita = async (cita) => {
  const id = await db.nextId('citas', 'cita-')
  const record = { ID_Cita: id, Estado: 'pendiente', Origen: 'manual', ...cita }
  await db.citas.save(record)
  return record
}

export const actualizarCita = (id, cambios) => db.citas.update(id, cambios)

export const eliminarCita = (id) => db.citas.delete(id)

// ─── Cobros ──────────────────────────────────────────────────────

export const getCobros = () => db.cobros.getAll()

// ─── Entrantes ───────────────────────────────────────────────────

// Column mapping (server-compatible)
const COLUMN_MAP = {
  clientes: {
    zona: 'Zona', '#': 'Codigo', codigo: 'Codigo',
    razon_social: 'Nombre', razonsocial: 'Nombre', nombre: 'Nombre',
    telefono1: 'Telefono', telefono: 'Telefono',
    tipone: 'Tipo_Negocio', tipo_negocio: 'Tipo_Negocio',
    fechaultventa: 'Fecha_Ultima_Venta', fecha_ultima_venta: 'Fecha_Ultima_Venta',
    direccioncompleta: 'Direccion', direccion: 'Direccion',
    email: 'Email', notas: 'Notas',
  },
  productos: {
    nombre: 'Nombre', categoria: 'Categoria', unidad: 'Unidad',
    codigo: 'Codigo', empaque: 'Empaque', precio: 'Precio',
  },
}

function mapRow(raw, tipo) {
  const mapping = COLUMN_MAP[tipo]
  if (!mapping) return raw
  const out = {}
  for (const [header, value] of Object.entries(raw)) {
    const key = mapping[header.toLowerCase().replace(/\s+/g, '_')]
    if (key) out[key] = String(value || '').trim()
  }
  return out
}

function parseCsv(text) {
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

function pad3(n) {
  return String(n).padStart(3, '0')
}

export const convertirEntrante = async (tipo, archivo) => {
  const all = await db.entrantes.getAll()
  const entry = all.find((e) => e.tipo === tipo && e.archivo === archivo)
  if (!entry) throw new Error(`Archivo "${archivo}" no encontrado en pendientes`)

  const isJson = /\.json$/i.test(archivo)
  const isXlsx = /\.(xlsx|xls)$/i.test(archivo)
  const isCsv = /\.csv$/i.test(archivo)

  // JSON → direct load
  if (isJson) {
    const text = new TextDecoder().decode(entry.buffer)
    const parsed = JSON.parse(text)

    if (tipo === 'productos') {
      if (!parsed || typeof parsed !== 'object' || !parsed.categorias || typeof parsed.categorias !== 'object') {
        throw new Error('JSON de productos debe tener { catalogo, categorias }')
      }
      await db.catalogo.save(parsed)
      const total = Object.values(parsed.categorias).reduce((a, c) => a + (Array.isArray(c) ? c.length : 0), 0)
      await db.entrantes.deleteByTypeAndFile(tipo, archivo)
      return { nota: `Catálogo cargado: ${total} productos de ${Object.keys(parsed.categorias).length} categorías.` }
    }

    if (tipo === 'clientes') {
      if (!Array.isArray(parsed)) throw new Error('JSON de clientes debe ser un array')
      let seq = 0
      const clientes = parsed.map((r) => {
        seq++
        return {
          ID_Cliente: `CL-${pad3(seq)}`,
          Nombre: r.Nombre || r.razon_social || r.razonsocial || r.nombre || '',
          Telefono: r.Telefono || r.telefono1 || r.telefono || '',
          Email: r.Email || r.email || '',
          Etapa_Embudo: r.Etapa_Embudo || (r.Fecha_Ultima_Venta ? 'Cliente activo' : 'Cliente potencial'),
          Fecha_Registro: r.Fecha_Registro || new Date().toISOString().slice(0, 10),
          Notas: r.Notas || r.notas || '',
          Tipo_Negocio: r.Tipo_Negocio || r.tipone || r.tipo_negocio || '',
          Direccion: r.Direccion || r.direccioncompleta || r.direccion || '',
          Zona: r.Zona || r.zona || '',
          Codigo: r.Codigo || r['#'] || r.codigo || '',
          Fecha_Ultima_Venta: r.Fecha_Ultima_Venta || r.fechaultventa || '',
        }
      })
      await db.clientes.saveAll(clientes)
      await db.entrantes.deleteByTypeAndFile(tipo, archivo)
      return { nota: `Base de clientes cargada: ${clientes.length} registros.` }
    }
  }

  // Excel → parse with ExcelJS
  if (isXlsx) {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(entry.buffer)
    const ws = wb.worksheets[0]
    if (!ws || ws.rowCount < 2) throw new Error('El archivo Excel está vacío o no tiene datos')

    // Find header row (first row with non-empty cells)
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

    const rows = []
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return
      const raw = {}
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const h = headers[colNumber]
        if (h) raw[h] = String(cell.value ?? '').trim()
      })
      if (Object.values(raw).some((v) => v !== '')) rows.push(mapRow(raw, tipo))
    })

    if (rows.length === 0) throw new Error('El archivo no contiene datos válidos')

    if (tipo === 'productos') {
      const categorias = {}
      for (const row of rows) {
        const cat = (row.Categoria || 'SIN CATEGORÍA').trim().toUpperCase()
        if (!categorias[cat]) categorias[cat] = []
        categorias[cat].push({
          nombre: row.Nombre || '',
          codigo_referencia: row.Codigo || '',
          empaque: row.Empaque || '',
          ...(row.Unidad ? { unidad: row.Unidad } : {}),
          ...(row.Precio ? { precio: row.Precio } : {}),
        })
      }
      const catalogObj = {
        catalogo: archivo.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim(),
        categorias,
      }
      await db.catalogo.save(catalogObj)
      const total = Object.values(categorias).reduce((a, c) => a + c.length, 0)
      await db.entrantes.deleteByTypeAndFile(tipo, archivo)
      return { nota: `Catálogo reemplazado: ${total} productos de ${Object.keys(categorias).length} categorías.` }
    }

    if (tipo === 'clientes') {
      let seq = 0
      const clientes = rows.map((r) => {
        seq++
        return {
          ID_Cliente: `CL-${pad3(seq)}`,
          Nombre: r.Nombre || '',
          Telefono: r.Telefono || '',
          Email: r.Email || '',
          Etapa_Embudo: r.Etapa_Embudo || (r.Fecha_Ultima_Venta ? 'Cliente activo' : 'Cliente potencial'),
          Fecha_Registro: r.Fecha_Registro || new Date().toISOString().slice(0, 10),
          Notas: r.Notas || '',
          Tipo_Negocio: r.Tipo_Negocio || '',
          Direccion: r.Direccion || '',
          Zona: r.Zona || '',
          Codigo: r.Codigo || '',
          Fecha_Ultima_Venta: r.Fecha_Ultima_Venta || '',
        }
      })
      await db.clientes.saveAll(clientes)
      await db.entrantes.deleteByTypeAndFile(tipo, archivo)
      return { nota: `Base de clientes cargada: ${clientes.length} registros.` }
    }
  }

  // CSV → parse manually
  if (isCsv) {
    const text = new TextDecoder().decode(entry.buffer)
    const { rows: csvRows } = parseCsv(text)
    const rows = csvRows.map((r) => mapRow(r, tipo))

    if (rows.length === 0) throw new Error('El archivo CSV no contiene datos válidos')

    if (tipo === 'productos') {
      const categorias = {}
      for (const row of rows) {
        const cat = (row.Categoria || 'SIN CATEGORÍA').trim().toUpperCase()
        if (!categorias[cat]) categorias[cat] = []
        categorias[cat].push({
          nombre: row.Nombre || '',
          codigo_referencia: row.Codigo || '',
          empaque: row.Empaque || '',
          ...(row.Unidad ? { unidad: row.Unidad } : {}),
          ...(row.Precio ? { precio: row.Precio } : {}),
        })
      }
      const catalogObj = {
        catalogo: archivo.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim(),
        categorias,
      }
      await db.catalogo.save(catalogObj)
      const total = Object.values(categorias).reduce((a, c) => a + c.length, 0)
      await db.entrantes.deleteByTypeAndFile(tipo, archivo)
      return { nota: `Catálogo reemplazado: ${total} productos de ${Object.keys(categorias).length} categorías.` }
    }

    if (tipo === 'clientes') {
      let seq = 0
      const clientes = rows.map((r) => {
        seq++
        return {
          ID_Cliente: `CL-${pad3(seq)}`,
          Nombre: r.Nombre || '',
          Telefono: r.Telefono || '',
          Email: r.Email || '',
          Etapa_Embudo: r.Etapa_Embudo || (r.Fecha_Ultima_Venta ? 'Cliente activo' : 'Cliente potencial'),
          Fecha_Registro: r.Fecha_Registro || new Date().toISOString().slice(0, 10),
          Notas: r.Notas || '',
          Tipo_Negocio: r.Tipo_Negocio || '',
          Direccion: r.Direccion || '',
          Zona: r.Zona || '',
          Codigo: r.Codigo || '',
          Fecha_Ultima_Venta: r.Fecha_Ultima_Venta || '',
        }
      })
      await db.clientes.saveAll(clientes)
      await db.entrantes.deleteByTypeAndFile(tipo, archivo)
      return { nota: `Base de clientes cargada: ${clientes.length} registros.` }
    }
  }

  throw new Error('Formato no soportado')
}

export const eliminarEntrante = async (tipo, archivo) => {
  await db.entrantes.deleteByTypeAndFile(tipo, archivo)
}

// ─── Plantilla de reporte ────────────────────────────────────────

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

// Detect visits table: prefers named range "Visitas" or "VisitasTable", else auto-detect by header row
function detectVisitasTable(ws, headerRowIndex, columnas) {
  const wb = ws.workbook
  const definedNames = wb.definedNames || {}

  // 1) Try named range for visits table
  for (const name of ['Visitas', 'VisitasTable', 'TablaVisitas', 'DatosVisitas']) {
    if (definedNames[name]) {
      try {
        const dests = [...definedNames[name].destinations]
        if (dests.length > 0) {
          const [sheetName, range] = dests[0]
          // range format: "A5:J10" or "$A$5:$J$10"
          const cleanRange = range.replace(/\$/g, '')
          const [start, end] = cleanRange.split(':')
          if (start && end) {
            const startCol = start.match(/^[A-Z]+/)[0]
            const startRow = parseInt(start.replace(/^[A-Z]+/, ''), 10)
            const endCol = end.match(/^[A-Z]+/)[0]
            const endRow = parseInt(end.replace(/^[A-Z]+/, ''), 10)
            return {
              type: 'namedRange',
              name,
              startRow,
              endRow,
              startCol,
              endCol,
              headerRow: startRow,
              dataStartRow: startRow + 1,
              columnCount: endRow >= startRow ? endRow - startRow + 1 : 1,
            }
          }
        }
      } catch (e) {
        // Ignore, fall through to auto-detect
      }
    }
  }

  // 2) Auto-detect: use headerRowIndex from analysis, data starts next row
  // Find how many data rows exist (template may have example rows)
  let dataStartRow = headerRowIndex + 1
  let exampleRows = 0
  for (let r = headerRowIndex + 1; r <= Math.min(headerRowIndex + 20, ws.rowCount); r++) {
    const row = ws.getRow(r)
    const hasData = row.values.some((v, i) => i > 0 && v != null && String(v).trim() !== '')
    if (hasData) {
      exampleRows++
    } else {
      break
    }
  }
  // Data start is after any example rows
  dataStartRow = headerRowIndex + 1 + exampleRows

  return {
    type: 'autoDetected',
    headerRow: headerRowIndex,
    dataStartRow,
    columnas: columnas.map((c, idx) => ({ col: c.columna, header: c.nombre, fieldHint: matchHeaderToField(c.nombre) })),
  }
}

function extractNamedRanges(wb) {
  const ranges = {}
  const definedNames = wb.definedNames || {}
  for (const [name, defn] of Object.entries(definedNames)) {
    try {
      const dests = [...defn.destinations]
      if (dests.length > 0) {
        const [sheetName, range] = dests[0]
        ranges[name] = { sheet: sheetName, range: range.replace(/\$/g, '') }
      }
    } catch (e) {
      // Skip invalid
    }
  }
  return ranges
}

export const subirPlantillaReporte = async (file) => {
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    throw new Error('Solo se aceptan archivos .xlsx o .xls')
  }

  const buffer = file.buffer instanceof ArrayBuffer ? file.buffer : await file.arrayBuffer()
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws || ws.rowCount < 1) throw new Error('El archivo Excel está vacío')

  // Detección determinista (port del servidor original): header row con más
  // celdas y ≥2 valores distintos; los datos empiezan en headerRow + 1.
  const det = detectarPlantillaDeterminista(ws)

  // Find header row (first row with non-empty cells)
  let headerRowIndex = 1
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r)
    const hasData = row.values.some((v, i) => i > 0 && v != null && String(v).trim() !== '')
    if (hasData) { headerRowIndex = r; break }
  }

  const headerRow = ws.getRow(headerRowIndex)
  const columnas = []
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const val = String(cell.value || '').trim()
    if (val) columnas.push({ columna: colNumber, nombre: val })
  })

  if (columnas.length === 0) throw new Error('No se encontraron columnas en la plantilla')

  // Extract named ranges (for fixed fields like Vendedor, Fecha, etc.)
  const namedRanges = extractNamedRanges(wb)

  // Detect visits table structure (static analysis)
  const visitasTable = detectVisitasTable(ws, headerRowIndex, columnas)

  // AGENT ANALYSIS: Generate intelligent mapping plan
  let agentPlan = null
  let agentError = null
  try {
    agentPlan = await analizarPlantillaConAgente({
      fileName: file.name,
      headerRowIndex,
      columnas,
      namedRanges,
      visitasTable,
      visitFields: VISIT_FIELDS,
    })
  } catch (e) {
    agentError = e.message
    console.warn('[Plantilla] Agent analysis failed, using static matching:', agentError)
  }

  // Store the FULL buffer + complete metadata + agent plan
  const record = {
    id: 'plantilla-reporte',
    archivo: file.name,
    buffer,              // ArrayBuffer — the complete .xlsx file
    columnas,            // Header columns from header row
    headerRowIndex,
    namedRanges,         // { "Vendedor": {sheet, range}, "Fecha": {...}, ... }
    visitasTable,        // { type, headerRow, dataStartRow, columnas: [{col, header, fieldHint}] }
    agentPlan,           // Agent-generated mapping plan (or null if failed)
    agentError,          // Error message if agent failed
    det,                 // Detección determinista: { headerRowNumber, columnas, columnMap, encabezadoCells }
    bytes: file.size,
    fecha: new Date().toISOString(),
  }
  await db.plantillas.save('plantilla-reporte', record)

  return {
    existe: true,
    archivo: record.archivo,
    columnas: record.columnas,
    namedRanges: Object.keys(record.namedRanges),
    visitasTable: { type: record.visitasTable.type, headerRow: record.visitasTable.headerRow, dataStartRow: record.visitasTable.dataStartRow },
    agentPlan: record.agentPlan ? { fixedFields: Object.keys(record.agentPlan.fixedFields || {}), visitsTableType: record.agentPlan.visitsTable?.type } : null,
    agentError: record.agentError,
    det: record.det || null,
    nota: `Plantilla guardada: ${columnas.length} columnas. ${Object.keys(namedRanges).length} rangos nombrados. Tabla visitas: ${record.visitasTable.type}.${agentPlan ? ' Agente: OK.' : agentError ? ' Agente falló: ' + agentError : ''}`,
  }
}

export const getPlantillaReporte = async () => {
  const record = await db.plantillas.get('plantilla-reporte')
  if (!record) return { existe: false }
  return {
    existe: true,
    archivo: record.archivo,
    columnas: record.columnas,
    buffer: record.buffer,
    headerRowIndex: record.headerRowIndex,
    namedRanges: record.namedRanges || {},
    visitasTable: record.visitasTable || null,
    agentPlan: record.agentPlan || null,
    agentError: record.agentError || null,
    det: record.det || null,
  }
}

// ─── Usuario ─────────────────────────────────────────────────────

export const getUsuario = () => db.usuario.get()

export const updateUsuario = async (data) => {
  // Merge con el registro actual (el save de db.usuario reemplaza TODO el
  // registro; sin merge se pierden foto y otros campos guardados antes).
  const current = await db.usuario.get()
  const merged = { ...current, ...data }
  await db.usuario.save(merged)
  return merged
}

export const subirFotoUsuario = async (file) => {
  const user = await db.usuario.get()

  // Standalone: base64 en IndexedDB (funciona sin server).
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  user.foto = base64
  await db.usuario.save(user)
  return user
}

// ─── Notas ───────────────────────────────────────────────────────

export const getNotas = () => db.notas.getAll()

export const crearNota = async (nota) => {
  const id = await db.nextId('notas', 'nota-')
  const record = { ID_Nota: id, Convertida: false, ...nota }
  await db.notas.save(record)
  return record
}

export const actualizarNota = (id, cambios) => db.notas.update(id, cambios)

export const eliminarNota = (id) => db.notas.delete(id)

/**
 * Convierte una nota a visitas usando agente IA directamente desde el browser.
 */
export const convertirNota = async (id) => {
  const nota = await db.notas.getById(id)
  if (!nota) throw new Error(`Nota ${id} no encontrada`)

  const prompt = `Eres un asistente de un vendedor de productos gourmet. Analiza el siguiente texto de una nota de ruta y extrae TODAS las visitas a clientes que se mencionen.

Cada visita debe tener estos campos:
- establecimiento: nombre del negocio/establecimiento visitado
- tipo_negocio: tipo de negocio (restaurante, bar, panadería, almacén, etc.) o ""
- hora_visita: hora de la visita si se menciona (ej: "10:30", "11:35", "4:25 PM"), o ""
- direccion: dirección si se menciona, o ""
- persona_contactada: nombre de la persona si se menciona, o ""
- productos_presentados: productos que se mencionan que se mostraron o que el cliente necesita
- pedido: "Sí" o "No" según se infiera del contexto
- detalle_pedido: detalles del pedido si se menciona, o ""
- comentarios: observaciones adicionales, o ""
- proximo_paso: qué sigue (ej: "Seguimiento", "Visita", "Cobro", ""), o ""

Responde SOLO con un JSON válido (array de objetos), sin texto adicional, sin markdown, sin backticks.

Nota:
${nota.Contenido}`

  const text = await callAgente(prompt)

  // Parse agente response
  let visitas
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
    visitas = JSON.parse(cleaned)
  } catch {
    throw new Error('El agente devolvió un formato inválido. Intenta de nuevo.')
  }

  if (!Array.isArray(visitas)) throw new Error('El agente no devolvió un array de visitas')

  return { visitas, nota_id: id, nota_fecha: nota.Fecha }
}

/**
 * Guarda visitas convertidas desde una nota (reemplaza por fecha).
 */
export const guardarVisitasDesdeNota = async (id, payload) => {
  const { fecha, visitas: nuevas, vendedor, zona_ruta, supervisor } = payload
  const normFecha = String(fecha || '').slice(0, 10)
  const records = nuevas.map((v) => ({
    ID_Visita: fmt(v.ID_Visita),
    Fecha: normFecha,
    Hora_Visita: fmt(v.hora_visita),
    Vendedor: fmt(vendedor),
    Zona_Ruta: fmt(zona_ruta),
    Supervisor: fmt(supervisor),
    Establecimiento: fmt(v.establecimiento),
    Tipo_Negocio: fmt(v.tipo_negocio),
    Direccion: fmt(v.direccion),
    Persona_Contactada: fmt(v.persona_contactada),
    Productos_Presentados: fmt(v.productos_presentados),
    Pedido: fmt(v.pedido),
    Detalle_Pedido: fmt(v.detalle_pedido),
    Monto: fmt(v.monto ?? v.Monto),
    Comentarios: fmt(v.comentarios),
    Proximo_Paso: fmt(v.proximo_paso),
  }))

  const result = await db.visitas.replaceByDate(normFecha, records)

  // Mark nota as converted
  await db.notas.update(id, { Convertida: true })

  // Auto-estatus
  await autoEstatusDesdeVisitas(records)

  return { guardadas: records.length, reemplazadas: result.reemplazadas }
}
