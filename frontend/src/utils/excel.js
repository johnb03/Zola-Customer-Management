/**
 * excel.js — Generación de Excel client-side con exceljs.
 * Reemplaza los endpoints /api/export y /api/visitas/export del servidor.
 */

import ExcelJS from 'exceljs'

/**
 * Descarga un buffer como archivo .xlsx en el navegador.
 */
function downloadBuffer(buffer, filename) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Exporta datos genéricos a Excel (reemplaza POST /api/export).
 * @param {Object} opts
 * @param {string} opts.tipo - Tipo de export (para el nombre del archivo)
 * @param {string} opts.hoja - Nombre de la hoja
 * @param {string[]} opts.columnas - Headers de columna
 * @param {Object[][]} opts.filas - Array de arrays o arrays de objetos
 */
export async function exportarExcel({ tipo, hoja = 'Datos', columnas = [], filas = [] }) {
  if (!columnas.length) throw new Error('Sin columnas para exportar')

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
  downloadBuffer(buffer, name)
  return { nombre: name, registros: filas.length }
}

/**
 * Exporta visitas a Excel con encabezado (reemplaza POST /api/visitas/export).
 */
export async function exportarVisitas({ visitas, encabezado = {}, periodo = 'dia', fecha = '' }) {
  const wb = new ExcelJS.Workbook()
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

  const now = new Date().toISOString().slice(0, 10)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const name = `${now}_visitas_${periodo}_${fecha || 'todas'}_${stamp}.xlsx`

  const buffer = await wb.xlsx.writeBuffer()
  downloadBuffer(buffer, name)
  return { nombre: name, registros: visitas.length }
}
