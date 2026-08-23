<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { getVisitas, getClientes, exportarVisitas, eliminarVisita, actualizarVisita, subirPlantillaReporte, getPlantillaReporte } from '../api.js'
import { guardarEnCarpetaPc } from '../utils/exportToFolder.js'
import { confirmar } from '../composables/useConfirm.js'
import { alerta } from '../composables/useAlert.js'

const hoy = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Encabezado con persistencia en localStorage
const STORAGE_KEY_ENC = 'zola-visitas-encabezado'
const loadEncabezado = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENC)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}
const saved = loadEncabezado()
const encabezado = reactive({
  vendedor: saved.vendedor || '',
  zona_ruta: saved.zona_ruta || '',
  supervisor: saved.supervisor || '',
  fecha: saved.fecha || hoy(),
})

// Guardar encabezado en localStorage cuando cambia
watch(encabezado, (val) => {
  localStorage.setItem(STORAGE_KEY_ENC, JSON.stringify({
    vendedor: val.vendedor,
    zona_ruta: val.zona_ruta,
    supervisor: val.supervisor,
    fecha: val.fecha,
  }))
}, { deep: true })

// Filtro de exportación
const filtroPeriodo = ref('dia')
const filtroFecha = ref(encabezado.fecha)

// Visitas filtradas — misma lógica que el server export
const guardadas = ref([])
const visitasVisibles = computed(() => {
  const fecha = String(filtroFecha.value || '')
  if (!fecha) return guardadas.value
  return guardadas.value.filter((v) => {
    const f = String(v.Fecha || '').slice(0, 10)
    if (filtroPeriodo.value === 'anio') return f.startsWith(fecha.slice(0, 4))
    if (filtroPeriodo.value === 'mes') return f.startsWith(fecha.slice(0, 7))
    return f === fecha
  })
})
const clientes = ref([])
const cargando = ref(true)
const descargando = ref(false)

// Plantilla de reporte diario
const plantilla = ref(null)
const subiendoPlantilla = ref(false)

const cargarPlantilla = async () => {
  try {
    const res = await getPlantillaReporte()
    plantilla.value = res.existe ? res : null
  } catch {
    plantilla.value = null
  }
}

const subirPlantilla = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  subiendoPlantilla.value = true
  try {
    const res = await subirPlantillaReporte(file)
    plantilla.value = res
    alerta({ mensaje: res.nota, tipo: 'success' })
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: `Error al subir la plantilla: ${e.message}`, tipo: 'error' })
  } finally {
    subiendoPlantilla.value = false
  }
}

cargarPlantilla()

const cargarGuardadas = async () => {
  cargando.value = true
  try {
    const [v, c] = await Promise.all([getVisitas(), getClientes()])
    guardadas.value = v
    clientes.value = c
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  } finally {
    cargando.value = false
  }
}

cargarGuardadas()

const descargar = async () => {
  descargando.value = true
  try {
    // 1. Pedir permiso de carpeta PRIMERO (síncrono con el click)
    let dirHandle = null
    if (window.showDirectoryPicker) {
      try {
        dirHandle = await window.showDirectoryPicker()
      } catch (err) {
        if (err && err.name === 'AbortError') {
          alerta({ mensaje: 'Descarga cancelada.', tipo: 'info' })
          return
        }
        throw err
      }
    }
    // 2. Exportar a Excel (enviar encabezado para que aparezca en la hoja)
    const { blob, nombre } = await exportarVisitas({
      fecha: filtroFecha.value,
      periodo: filtroPeriodo.value,
      encabezado: { vendedor: encabezado.vendedor, zona_ruta: encabezado.zona_ruta, supervisor: encabezado.supervisor },
    })
    // 3. Guardar en la carpeta elegida
    const guardado = await guardarEnCarpetaPc(blob, nombre, dirHandle)
    if (guardado.ok) alerta({ mensaje: `Copia Excel en ${guardado.carpeta}/${nombre}`, tipo: 'success' })
    else alerta({ mensaje: 'Se inició la descarga del Excel.', tipo: 'info' })
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  } finally {
    descargando.value = false
  }
}

const eliminar = async (g) => {
  const msgConfirmacion = `¿Eliminar la visita de "${g.Establecimiento}" (${g.Fecha})?${g.Origen === 'visita' ? '\nTambién se eliminará la cita de seguimiento vinculada.' : ''}`
  const ok = await confirmar({ titulo: 'Eliminar visita', mensaje: msgConfirmacion })
  if (!ok) return
  try {
    await eliminarVisita(g.ID_Visita)
    alerta({ mensaje: `Visita de "${g.Establecimiento}" eliminada.`, tipo: 'success' })
    await cargarGuardadas()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: `Error al eliminar: ${e.message}`, tipo: 'error' })
  }
}

/* ── Editar visita ── */
const editandoVisita = ref(null)
const edicion = reactive({
  Establecimiento: '',
  Fecha: '',
  Hora_Visita: '',
  Persona_Contactada: '',
  Pedido: '',
  Proximo_Paso: '',
  Detalle_Pedido: '',
  Monto: '',
  Comentarios: '',
})

const abrirEditar = (g) => {
  editandoVisita.value = g.ID_Visita
  edicion.Establecimiento = g.Establecimiento || ''
  edicion.Fecha = g.Fecha || ''
  edicion.Hora_Visita = g.Hora_Visita || ''
  edicion.Persona_Contactada = g.Persona_Contactada || ''
  edicion.Pedido = g.Pedido || ''
  edicion.Proximo_Paso = g.Proximo_Paso || ''
  edicion.Detalle_Pedido = g.Detalle_Pedido || ''
  edicion.Monto = g.Monto ?? ''
  edicion.Comentarios = g.Comentarios || ''
}

const cancelarEdicion = () => {
  editandoVisita.value = null
}

const guardarEdicion = async () => {
  if (!editandoVisita.value) return
  try {
    await actualizarVisita(editandoVisita.value, { ...edicion })
    alerta({ mensaje: `Visita de "${edicion.Establecimiento}" actualizada.`, tipo: 'success' })
    editandoVisita.value = null
    await cargarGuardadas()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: `Error al actualizar: ${e.message}`, tipo: 'error' })
  }
}
</script>

<template>
  <section>
    <header class="section-header header-split">
      <div class="header-text">
        <h1 class="section-title">Reporte de Visitas</h1>
        <p class="section-subtitle">
          Registro diario de visitas a clientes. El estatus en "Próximo Paso" actualiza el embudo del cliente.
        </p>
      </div>
      <div class="header-actions">
        <div class="export-filter">
          <select v-model="filtroPeriodo" class="filter-select">
            <option value="dia">Día</option>
            <option value="mes">Mes</option>
            <option value="anio">Año</option>
          </select>
          <input v-model="filtroFecha" class="input input-sm" type="date" />
        </div>
        <button type="button" class="btn" :disabled="descargando || !visitasVisibles.length" @click="descargar">
          {{ descargando ? 'Exportando…' : `Descargar Excel (${visitasVisibles.length})` }}
        </button>
      </div>
    </header>
    <hr class="firma" />

    <article class="card form-card">
      <div class="datos-header">
        <h2 class="panel-title">Datos del reporte</h2>
        <p class="chat-subtitle">Subí la plantilla Excel de tu reporte diario para que el agente la conozca. El encabezado se usa al guardar y exportar.</p>
      </div>

      <div class="plantilla-row">
        <span class="field-label">Plantilla de reporte diario (.xlsx)</span>
        <div class="plantilla-controls">
          <label class="btn btn-ghost btn-sm">
            {{ subiendoPlantilla ? 'Subiendo…' : (plantilla ? 'Cambiar plantilla' : 'Subir plantilla') }}
            <input type="file" accept=".xlsx,.xls" class="file-input" @change="subirPlantilla" />
          </label>
          <span v-if="plantilla" class="plantilla-ok">
            ✓ {{ plantilla.archivo }} · {{ plantilla.columnas?.length || 0 }} columnas
          </span>
          <span v-else class="plantilla-warn">Sin plantilla — el agente usa la estructura estándar de visitas.</span>
        </div>
      </div>

      <div class="encabezado-grid">
        <label class="field">
          <span class="field-label">Vendedor</span>
          <input v-model="encabezado.vendedor" class="input" type="text" placeholder="Nombre del vendedor" />
        </label>
        <label class="field">
          <span class="field-label">Zona / Ruta</span>
          <input v-model="encabezado.zona_ruta" class="input" type="text" placeholder="Zona o ruta" />
        </label>
        <label class="field">
          <span class="field-label">Supervisor</span>
          <input v-model="encabezado.supervisor" class="input" type="text" placeholder="Supervisor" />
        </label>
        <label class="field">
          <span class="field-label">Fecha</span>
          <input v-model="encabezado.fecha" class="input" type="date" />
        </label>
      </div>
    </article>

    <article class="card panel guardadas">
      <h2 class="panel-title">Visitas guardadas <span v-if="!cargando" class="visitas-count">({{ visitasVisibles.length }}<template v-if="visitasVisibles.length !== guardadas.length"> de {{ guardadas.length }}</template>)</span></h2>
      <p v-if="cargando" class="loading">Cargando datos reales…</p>
      <div v-else class="table-wrap">
        <table class="table table-guardadas">
          <thead>
            <tr>
              <th>Establecimiento</th>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Pedido</th>
              <th>Próximo paso</th>
              <th class="th-remove"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!guardadas.length">
              <td colspan="6" class="empty-cell">Todavía no hay visitas guardadas.</td>
            </tr>
            <tr v-else-if="!visitasVisibles.length">
              <td colspan="6" class="empty-cell">Sin visitas para el filtro seleccionado. Cambiá la fecha o el período arriba.</td>
            </tr>
            <tr v-for="g in visitasVisibles" :key="g.ID_Visita">
              <td class="cell-main">{{ g.Establecimiento }}</td>
              <td class="num">{{ g.Fecha }}</td>
              <td>{{ g.Hora_Visita }}</td>
              <td>{{ g.Pedido }}</td>
              <td class="cell-sub">{{ g.Proximo_Paso }}</td>
              <td class="cell-remove">
                <button type="button" class="remove-btn edit-btn" title="Editar visita" @click="abrirEditar(g)">✏️</button>
                <button type="button" class="remove-btn" title="Eliminar visita" @click="eliminar(g)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <!-- Modal editar visita -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="editandoVisita" class="edit-backdrop" @click.self="cancelarEdicion">
          <div class="edit-card" role="dialog" aria-modal="true" aria-label="Editar visita">
            <div class="edit-header">
              <h3 class="edit-title">Editar visita</h3>
              <button type="button" class="btn-icon" title="Cerrar" @click="cancelarEdicion">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="edit-body">
              <label class="field">
                <span class="field-label">Establecimiento</span>
                <input v-model="edicion.Establecimiento" type="text" class="input" />
              </label>
              <div class="edit-grid">
                <label class="field">
                  <span class="field-label">Fecha</span>
                  <input v-model="edicion.Fecha" type="date" class="input" />
                </label>
                <label class="field">
                  <span class="field-label">Hora</span>
                  <input v-model="edicion.Hora_Visita" type="time" class="input" />
                </label>
              </div>
              <label class="field">
                <span class="field-label">Persona contactada</span>
                <input v-model="edicion.Persona_Contactada" type="text" class="input" placeholder="Nombre de la persona" />
              </label>
              <div class="edit-grid">
                <label class="field">
                  <span class="field-label">Pedido</span>
                  <select v-model="edicion.Pedido" class="input">
                    <option value="">—</option>
                    <option value="Sí">Sí</option>
                    <option value="No">No</option>
                  </select>
                </label>
                <label class="field">
                  <span class="field-label">Próximo paso</span>
                  <select v-model="edicion.Proximo_Paso" class="input">
                    <option value="">—</option>
                    <option value="Seguimiento">Seguimiento</option>
                    <option value="Cobro">Cobro</option>
                    <option value="Visita">Visita</option>
                    <option value="Descartado">Descartado</option>
                  </select>
                </label>
              </div>
              <label class="field">
                <span class="field-label">Detalle del pedido</span>
                <textarea v-model="edicion.Detalle_Pedido" class="input" rows="2" placeholder="Productos solicitados"></textarea>
              </label>
              <label class="field">
                <span class="field-label">Monto ($)</span>
                <input v-model="edicion.Monto" type="number" min="0" step="0.01" class="input" placeholder="Monto de la venta / cobro" />
              </label>
              <label class="field">
                <span class="field-label">Comentarios</span>
                <textarea v-model="edicion.Comentarios" class="input" rows="2" placeholder="Notas de la visita"></textarea>
              </label>
            </div>
            <div class="edit-footer">
              <button type="button" class="btn btn-ghost btn-sm" @click="cancelarEdicion">Cancelar</button>
              <button type="button" class="btn btn-gold-outline btn-sm" @click="guardarEdicion">Guardar cambios</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.loading {
  color: var(--text-secondary);
  font-size: 14px;
}

/* Header con título a la izquierda y acciones a la derecha */
.header-split {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.header-text {
  flex: 1;
  min-width: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.export-filter {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-select {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: var(--accent-gold);
}

.input-sm {
  padding: 8px 10px;
  font-size: 13px;
}

.form-card {
  padding: 20px 24px;
  margin-bottom: 16px;
}

.encabezado-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.input {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
}

.input:focus {
  outline: none;
  border-color: var(--accent-gold);
}

.card-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
}

.visitas-count {
  font-weight: 400;
  font-size: 13px;
  opacity: 0.6;
}

.toolbar-actions {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 8px;
}

.btn-gold-outline {
  background: transparent;
  border: 1.5px solid var(--accent-gold);
  color: var(--accent-gold);
}

.btn-gold-outline:hover {
  background: rgba(201, 162, 39, 0.1);
  filter: none;
}

.table-wrap {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.table th {
  text-align: left;
  padding: 10px 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.table td {
  padding: 12px 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.table tbody tr:last-child td {
  border-bottom: 0;
}

.th-remove {
  width: 36px;
}

.cell-input {
  width: 100%;
  min-width: 130px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
  font-family: inherit;
}

.cell-input:focus {
  outline: none;
  border-color: var(--accent-gold);
}

.cell-select {
  min-width: 90px;
}

.cell-remove {
  text-align: center;
  white-space: nowrap;
}

.remove-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--status-danger);
  font-size: 12px;
  line-height: 1;
  padding: 6px 8px;
  transition: border-color 120ms ease, color 120ms ease;
}

.remove-btn:hover {
  border-color: var(--status-danger);
}

.warnings {
  margin: 0 0 16px;
  padding: 12px 16px;
  list-style: none;
  border-radius: 10px;
  background: rgba(201, 138, 59, 0.12);
  color: var(--status-warning);
  font-size: 13px;
}

.warnings li {
  margin: 2px 0;
}

.guardadas {
  padding: 20px 24px;
}

.table-guardadas td,
.table-guardadas th {
  padding: 10px 8px;
}

.cell-main {
  font-weight: 500;
  min-width: 160px;
}

.cell-sub {
  color: var(--text-secondary);
  font-size: 13px;
  min-width: 160px;
}

.empty-cell {
  padding: 20px 8px;
  color: var(--text-secondary);
  text-align: center;
}

.edit-btn {
  color: var(--accent-gold);
  margin-right: 6px;
}

.edit-btn:hover {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

/* ── Modal editar visita ── */
.edit-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.edit-card {
  width: 100%;
  max-width: 480px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.edit-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.btn-icon {
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  padding: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 120ms ease, border-color 120ms ease;
}

.btn-icon:hover {
  color: var(--accent-gold);
  border-color: var(--accent-gold);
}

.edit-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 60vh;
  overflow-y: auto;
}

.edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.edit-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-base);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 180ms ease;
}

.modal-enter-active .edit-card,
.modal-leave-active .edit-card {
  transition: transform 180ms ease, opacity 180ms ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .edit-card {
  transform: scale(0.95) translateY(8px);
  opacity: 0;
}

.modal-leave-to .edit-card {
  transform: scale(0.97);
  opacity: 0;
}

/* ── Datos del reporte / plantilla ── */
.datos-header {
  margin-bottom: 16px;
}

.datos-header .panel-title {
  margin: 0 0 4px;
}

.chat-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45;
}

.plantilla-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.plantilla-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.file-input {
  display: none;
}

.plantilla-ok {
  color: var(--status-success);
  font-size: 13px;
}

.plantilla-warn {
  color: var(--text-secondary);
  font-size: 13px;
}

@media (max-width: 768px) {
  .header-split {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .plantilla-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
