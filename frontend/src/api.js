// Capa de acceso a datos reales — consume el backend mínimo (server/index.mjs).
// El frontend NUNCA importa datos de ejemplo; todo sale de /api/*.

const base = '/api'

async function request(url, options = {}) {
  const res = await fetch(`${base}${url}`, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`)
  }
  return data
}

export const getEstado = () => request('/estado')

export const getCatalogo = () => request('/catalogo')

export const getMenus = () => request('/menus')

export const getMenu = (name) => request(`/menus/${encodeURIComponent(name)}`)

export const getReports = () => request('/reports')

export const getReport = (name) =>
  fetch(`${base}/reports/${encodeURIComponent(name)}`).then(async (res) => {
    if (!res.ok) throw new Error('No se pudo leer el reporte')
    return res.text()
  })

export const subirMenu = (archivo) => {
  const form = new FormData()
  form.append('archivo', archivo)
  return request('/upload', { method: 'POST', body: form })
}

export const subirDatos = (tipo, archivo) => {
  const form = new FormData()
  form.append('archivo', archivo)
  return request(`/upload/${encodeURIComponent(tipo)}`, { method: 'POST', body: form })
}

async function requestBlob(url, body) {
  const res = await fetch(`${base}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Error ${res.status}`)
  }
  const disposition = res.headers.get('Content-Disposition') || ''
  const m = /filename="?([^";]+)"?/.exec(disposition)
  const nombre = m ? m[1] : `export_${Date.now()}.xlsx`
  return { blob: await res.blob(), nombre }
}

export const exportarExcel = ({ tipo, hoja, columnas, filas }) =>
  requestBlob('/export', { tipo, hoja, columnas, filas })

export const getVisitas = () => request('/visitas')

export const guardarVisitas = (payload) =>
  request('/visitas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const exportarVisitas = (filtro = {}) => requestBlob('/visitas/export', filtro)

export const eliminarVisita = (id) =>
  request(`/visitas/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const actualizarVisita = (id, cambios) =>
  request(`/visitas/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambios),
  })

export const getClientes = () => request('/clientes')

export const crearCliente = (cliente) =>
  request('/clientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente }),
  })

export const actualizarCliente = (id, cambios) =>
  request(`/clientes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambios),
  })

export const getCitas = () => request('/citas')

export const crearCita = (cita) =>
  request('/citas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cita),
  })

export const actualizarCita = (id, cambios) =>
  request(`/citas/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambios),
  })

export const eliminarCita = (id) =>
  request(`/citas/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const convertirEntrante = (tipo, archivo) =>
  request('/entrantes/convertir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, archivo }),
  })

export const eliminarEntrante = (tipo, archivo) =>
  request(`/entrantes/${encodeURIComponent(tipo)}/${encodeURIComponent(archivo)}`, {
    method: 'DELETE',
  })

export const getReportsDocx = () => request('/estado').then((e) => e.reportesDocx || [])

export const downloadReportDocx = (name) =>
  fetch(`${base}/reportsDocx/${encodeURIComponent(name)}`).then(async (res) => {
    if (!res.ok) throw new Error('No se pudo descargar el reporte')
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const m = /filename="?([^";]+)"?/.exec(disposition)
    const filename = m ? m[1] : name
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  })

export const cobrarCliente = (id) =>
  request(`/clientes/${encodeURIComponent(id)}/cobrar`, { method: 'POST' })

export const getCobros = () => request('/cobros')

export const subirPlantillaReporte = (archivo) => {
  const form = new FormData()
  form.append('archivo', archivo)
  return request('/reportes/template', { method: 'POST', body: form })
}

export const getPlantillaReporte = () => request('/reportes/template')

export const analyzeTemplate = () => request('/reportes/analyze-template', { method: 'POST' })

// --- Usuario (config del vendedor) ------------------------------------------------

export const getUsuario = () => request('/usuario')

export const updateUsuario = (data) =>
  request('/usuario', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const subirFotoUsuario = (file) => {
  const form = new FormData()
  form.append('foto', file)
  return request('/usuario/foto', { method: 'POST', body: form })
}

// --- Notas -----------------------------------------------------------------------

export const getNotas = () => request('/notas')

export const crearNota = (nota) =>
  request('/notas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nota),
  })

export const actualizarNota = (id, cambios) =>
  request(`/notas/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambios),
  })

export const eliminarNota = (id) =>
  request(`/notas/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const convertirNota = (id) =>
  request(`/notas/${encodeURIComponent(id)}/convertir`, { method: 'POST' })

export const guardarVisitasDesdeNota = (id, payload) =>
  request(`/notas/${encodeURIComponent(id)}/guardar-visitas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
