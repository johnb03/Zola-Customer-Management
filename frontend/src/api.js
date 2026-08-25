/**
 * api.js — Capa de acceso a datos client-side.
 * Reescribirá todas las llamadas fetch(/api/*) para usar db.js (IndexedDB).
 * Las vistas NO cambian — siguen importando las mismas funciones.
 *
 * Fases pendientes (stub por ahora):
 * - exportarExcel / exportarVisitas → exceljs client-side (Fase 5)
 * - subirMenu / subirDatos → IndexedDB blob storage
 * - convertirNota → gemini.js directo (Fase 4)
 * - getReports / downloadReportDocx → reports en IndexedDB
 */

import { db } from './db.js'
import { callGemini } from './gemini.js'
import { exportarExcel as exportExcel, exportarVisitas as exportVisitasXlsx } from './utils/excel.js'

// ─── Estado ──────────────────────────────────────────────────────

export const getEstado = async () => {
  const stats = await db.stats()
  return {
    db: 'indexeddb',
    stats,
    reportesDocx: [], // TODO: store reports in IndexedDB
  }
}

// ─── Catálogo ────────────────────────────────────────────────────

export const getCatalogo = async () => {
  const data = await db.catalogo.get()
  return data || { categorias: {} }
}

// ─── Menús ───────────────────────────────────────────────────────

export const getMenus = async () => {
  // TODO: store menus in IndexedDB
  return []
}

export const getMenu = async (name) => {
  // TODO: store menus in IndexedDB
  return null
}

export const subirMenu = async (archivo) => {
  // TODO: store menu blob in IndexedDB
  throw new Error('subirMenu no implementado aún — pendiente de Fase 5')
}

export const subirDatos = async (tipo, archivo) => {
  // TODO: store data blob in IndexedDB
  throw new Error('subirDatos no implementado aún')
}

// ─── Reportes ────────────────────────────────────────────────────

export const getReports = async () => []

export const getReport = async (name) => {
  // TODO: read report from IndexedDB
  throw new Error('getReport no implementado aún')
}

export const getReportsDocx = async () => []

export const downloadReportDocx = async (name) => {
  // TODO: download report from IndexedDB
  throw new Error('downloadReportDocx no implementado aún')
}

// ─── Exportar Excel (client-side con exceljs) ────────────────────

export const exportarExcel = (opts) => exportExcel(opts)

// ─── Visitas ─────────────────────────────────────────────────────

export const getVisitas = () => db.visitas.getAll()

export const contarVisitasPorFecha = async (fecha) => {
  const count = await db.visitas.countByDate(fecha)
  return { fecha, count }
}

export const guardarVisitas = async (payload) => {
  const { fecha, visitas: nuevas, vendedor, zona_ruta, supervisor } = payload
  const records = nuevas.map((v) => ({
    ID_Visita: v.ID_Visita || '',
    Fecha: fecha,
    Hora_Visita: v.hora_visita || '',
    Vendedor: vendedor || '',
    Zona_Ruta: zona_ruta || '',
    Supervisor: supervisor || '',
    Establecimiento: v.establecimiento || '',
    Tipo_Negocio: v.tipo_negocio || '',
    Direccion: v.direccion || '',
    Persona_Contactada: v.persona_contactada || '',
    Productos_Presentados: v.productos_presentados || '',
    Pedido: v.pedido || '',
    Detalle_Pedido: v.detalle_pedido || '',
    Comentarios: v.comentarios || '',
    Proximo_Paso: v.proximo_paso || '',
  }))
  const result = await db.visitas.replaceByDate(fecha, records)

  // Auto-estatus: update client stage based on visitas
  await autoEstatusDesdeVisitas(records)

  return { guardadas: records.length, reemplazadas: result.reemplazadas }
}

export const exportarVisitas = async (filtro = {}) => {
  const visitas = await db.visitas.getAll()
  const user = await db.usuario.get()
  const encabezado = {
    vendedor: user.nombre || '',
    zona_ruta: user.zona_ruta || '',
    supervisor: user.supervisor || '',
    fecha: user.fecha || '',
  }
  return exportVisitasXlsx({ visitas, encabezado, ...filtro })
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
  const record = { ID_Cliente: id, ...cliente }
  await db.clientes.save(record)
  return record
}

export const actualizarCliente = (id, cambios) => db.clientes.update(id, cambios)

export const cobrarCliente = async (id) => {
  const cliente = await db.clientes.getById(id)
  if (!cliente) throw new Error('Cliente no encontrado')
  cliente.Etapa_Embudo = 'Cobrado'
  cliente.Fecha_Cobro = ''
  await db.clientes.save(cliente)
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

export const convertirEntrante = async (tipo, archivo) => {
  throw new Error('convertirEntrante no implementado aún')
}

export const eliminarEntrante = async (tipo, archivo) => {
  throw new Error('eliminarEntrante no implementado aún')
}

// ─── Plantilla de reporte ────────────────────────────────────────

export const subirPlantillaReporte = async (archivo) => {
  // TODO: store template blob in IndexedDB
  throw new Error('subirPlantillaReporte no implementado aún')
}

export const getPlantillaReporte = async () => {
  // TODO: read template from IndexedDB
  return null
}

export const analyzeTemplate = async () => {
  throw new Error('analyzeTemplate no implementado aún')
}

// ─── Usuario ─────────────────────────────────────────────────────

export const getUsuario = () => db.usuario.get()

export const updateUsuario = async (data) => {
  await db.usuario.save(data)
  return data
}

export const subirFotoUsuario = async (file) => {
  // Convert file to base64 and store in IndexedDB
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result
      const user = await db.usuario.get()
      user.foto = base64
      await db.usuario.save(user)
      resolve(user)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
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
 * Convierte una nota a visitas usando Gemini directamente desde el browser.
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

  const text = await callGemini(prompt)

  // Parse Gemini response
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
  const records = nuevas.map((v) => ({
    ID_Visita: v.ID_Visita || '',
    Fecha: fecha,
    Hora_Visita: v.hora_visita || '',
    Vendedor: vendedor || '',
    Zona_Ruta: zona_ruta || '',
    Supervisor: supervisor || '',
    Establecimiento: v.establecimiento || '',
    Tipo_Negocio: v.tipo_negocio || '',
    Direccion: v.direccion || '',
    Persona_Contactada: v.persona_contactada || '',
    Productos_Presentados: v.productos_presentados || '',
    Pedido: v.pedido || '',
    Detalle_Pedido: v.detalle_pedido || '',
    Comentarios: v.comentarios || '',
    Proximo_Paso: v.proximo_paso || '',
  }))

  const result = await db.visitas.replaceByDate(fecha, records)

  // Mark nota as converted
  await db.notas.update(id, { Convertida: true })

  // Auto-estatus
  await autoEstatusDesdeVisitas(records)

  return { guardadas: records.length, reemplazadas: result.reemplazadas }
}
