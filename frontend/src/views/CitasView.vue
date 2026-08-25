<script setup>
import { ref, reactive, computed } from 'vue'
import { getCitas, crearCita, actualizarCita, eliminarCita, getClientes, actualizarCliente } from '../api.js'
import CitaPopup from '../components/CitaPopup.vue'
import { alerta } from '../composables/useAlert.js'

const citas = ref([])
const clientes = ref([])
const cargando = ref(true)
const hoy = new Date()
const anioActual = ref(hoy.getFullYear())
const mesActual = ref(hoy.getMonth())
const diaSeleccionado = ref(null)
const mostrandoForm = ref(false)
const citaSeleccionada = ref(null)

const form = reactive({
  fecha: '',
  establecimiento: '',
  motivo: '',
})

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const cargar = async () => {
  cargando.value = true
  try {
    const [c, cl] = await Promise.all([getCitas(), getClientes()])
    citas.value = c
    clientes.value = cl
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  } finally {
    cargando.value = false
  }
}

cargar()

// --- Calendario ---

const diasDelMes = computed(() => {
  const anio = anioActual.value
  const mes = mesActual.value
  const primerDia = new Date(anio, mes, 1)
  const ultimoDia = new Date(anio, mes + 1, 0)
  const diasEnMes = ultimoDia.getDate()

  let inicioSemana = primerDia.getDay() - 1
  if (inicioSemana < 0) inicioSemana = 6

  const celdas = []
  for (let i = 0; i < inicioSemana; i++) {
    celdas.push({ dia: null, fecha: null })
  }
  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    celdas.push({ dia: d, fecha })
  }
  while (celdas.length % 7 !== 0) {
    celdas.push({ dia: null, fecha: null })
  }
  return celdas
})

const citasPorDia = computed(() => {
  const map = {}
  for (const c of citas.value) {
    const f = c.Fecha
    if (!f) continue
    if (!map[f]) map[f] = []
    map[f].push({ ...c, _tipo: 'cita' })
  }
  return map
})

const cobrosPorDia = computed(() => {
  const map = {}
  const hoyStr = new Date().toISOString().slice(0, 10)
  for (const cl of clientes.value) {
    const f = cl.Fecha_Cobro
    if (!f) continue
    if (!map[f]) map[f] = []
    const diff = Math.floor((new Date(f) - new Date(hoyStr)) / (1000 * 60 * 60 * 24))
    let tono = 'al-dia'
    if (diff < 0) tono = 'atrasado'
    else if (diff <= 7) tono = 'esta-semana'
    map[f].push({
      ID_Cliente: cl.ID_Cliente,
      Nombre: cl.Nombre,
      Monto: cl.Monto || '',
      Direccion: cl.Direccion || '',
      Fecha_Cobro: f,
      _tipo: 'cobro',
      _tono: tono,
    })
  }
  return map
})

const eventosPorDia = computed(() => {
  const map = {}
  for (const [f, items] of Object.entries(citasPorDia.value)) {
    map[f] = [...items]
  }
  for (const [f, items] of Object.entries(cobrosPorDia.value)) {
    if (!map[f]) map[f] = []
    map[f].push(...items)
  }
  return map
})

const estadoDias = computed(() => {
  const map = {}
  for (const [f, items] of Object.entries(eventosPorDia.value)) {
    if (!items.length) continue
    const todosCompletados = items.every((e) =>
      ['completada', 'realizada', 'confirmada', 'pagado'].includes(String(e.Estado || '').toLowerCase())
    )
    map[f] = todosCompletados ? 'todo-completado' : 'hay-pendientes'
  }
  return map
})

const citasDelDia = computed(() => {
  if (!diaSeleccionado.value) return []
  return (citasPorDia.value[diaSeleccionado.value] || []).sort((a, b) =>
    (a.ID_Cita || '').localeCompare(b.ID_Cita || '')
  )
})

const cobrosDelDia = computed(() => {
  if (!diaSeleccionado.value) return []
  return cobrosPorDia.value[diaSeleccionado.value] || []
})

const esHoy = (fecha) => {
  if (!fecha) return false
  const h = hoy.toISOString().slice(0, 10)
  return fecha === h
}

const tituloMes = computed(() => `${MESES[mesActual.value]} ${anioActual.value}`)

const mesAnterior = () => {
  if (mesActual.value === 0) {
    mesActual.value = 11
    anioActual.value--
  } else {
    mesActual.value--
  }
}

const mesSiguiente = () => {
  if (mesActual.value === 11) {
    mesActual.value = 0
    anioActual.value++
  } else {
    mesActual.value++
  }
}

const irHoy = () => {
  anioActual.value = hoy.getFullYear()
  mesActual.value = hoy.getMonth()
  diaSeleccionado.value = hoy.toISOString().slice(0, 10)
}

const seleccionarDia = (dia) => {
  diaSeleccionado.value = dia
}

// --- CRUD ---

const estadoTone = (estado) => {
  const s = String(estado || '').toLowerCase()
  if (s === 'pendiente') return 'warning'
  if (['completada', 'realizada', 'confirmada'].includes(s)) return 'success'
  if (['cancelada', 'no asistió'].includes(s)) return 'danger'
  return 'warning'
}

const toggleForm = () => {
  mostrandoForm.value = !mostrandoForm.value
  if (mostrandoForm.value) {
    form.fecha = diaSeleccionado.value || hoy.toISOString().slice(0, 10)
    form.establecimiento = ''
    form.motivo = ''
  }
}

const nuevaCita = async () => {
  if (!form.fecha || !form.establecimiento.trim()) {
    alerta({ titulo: 'Error', mensaje: 'Fecha y establecimiento son obligatorios', tipo: 'error' })
    return
  }
  try {
    await crearCita({ Fecha: form.fecha, Establecimiento: form.establecimiento, Motivo: form.motivo })
    alerta({ mensaje: 'Cita creada', tipo: 'success' })
    mostrandoForm.value = false
    await cargar()
    diaSeleccionado.value = form.fecha
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}

const completarCita = async (cita) => {
  try {
    await actualizarCita(cita.ID_Cita, { Estado: 'completada' })
    alerta({ mensaje: `${cita.ID_Cita} completada`, tipo: 'success' })
    await cargar()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}

const cancelarCita = async (cita) => {
  try {
    await actualizarCita(cita.ID_Cita, { Estado: 'cancelada' })
    alerta({ mensaje: `${cita.ID_Cita} cancelada`, tipo: 'info' })
    await cargar()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}

/* ── Popup de cita ── */
const abrirPopup = (cita) => {
  citaSeleccionada.value = cita
}

const cerrarPopup = () => {
  citaSeleccionada.value = null
}

const completarDesdePopup = async () => {
  if (!citaSeleccionada.value) return
  await completarCita(citaSeleccionada.value)
  cerrarPopup()
}

const eliminarDesdePopup = async () => {
  if (!citaSeleccionada.value) return
  try {
    await eliminarCita(citaSeleccionada.value.ID_Cita)
    alerta({ mensaje: `${citaSeleccionada.value.ID_Cita} eliminada`, tipo: 'success' })
    cerrarPopup()
    await cargar()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}

const eliminarCitaInline = async (cita) => {
  try {
    await eliminarCita(cita.ID_Cita)
    alerta({ mensaje: `${cita.ID_Cita} eliminada`, tipo: 'success' })
    await cargar()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}

const guardarCobroDesdePopup = async (cambios) => {
  if (!citaSeleccionada.value) return
  const cl = citaSeleccionada.value
  try {
    const payload = {}
    if (cambios.Fecha_Cobro) payload.Fecha_Cobro = cambios.Fecha_Cobro
    if (cambios.Monto !== undefined) payload.Monto = cambios.Monto
    await actualizarCliente(cl.ID_Cliente, payload)
    alerta({ mensaje: `${cl.Nombre}: día de cobro actualizado`, tipo: 'success' })
    cerrarPopup()
    await cargar()
    // Re-seleccionar el día (por si cambió de fecha y el cobro se movió)
    diaSeleccionado.value = cambios.Fecha_Cobro || diaSeleccionado.value
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}

const guardarDesdePopup = async (cambios) => {
  if (!citaSeleccionada.value) return
  try {
    await actualizarCita(citaSeleccionada.value.ID_Cita, cambios)
    alerta({ mensaje: `${citaSeleccionada.value.ID_Cita} actualizada`, tipo: 'success' })
    await cargar()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}
</script>

<template>
  <section>
    <header class="section-header">
      <h1 class="section-title">Agenda</h1>
      <p class="section-subtitle">Calendario de citas con clientes. Creá, completá o cancelá citas desde acá.</p>
      <hr class="firma" />
    </header>

    <p v-if="cargando" class="loading">Cargando citas…</p>

    <template v-else>
      <!-- Calendario -->
      <article class="card panel">
        <div class="cal-header">
          <button type="button" class="btn-icon" @click="mesAnterior" title="Mes anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h2 class="cal-title">{{ tituloMes }}</h2>
          <button type="button" class="btn-icon" @click="mesSiguiente" title="Mes siguiente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button type="button" class="btn btn-ghost btn-sm" @click="irHoy">Hoy</button>
        </div>

        <div class="cal-grid">
          <div v-for="d in DIAS_CORTOS" :key="d" class="cal-head">{{ d }}</div>
          <button
            v-for="(celda, i) in diasDelMes"
            :key="i"
            type="button"
            class="cal-dia"
            :class="{
              vacio: !celda.dia,
              hoy: celda.fecha && esHoy(celda.fecha),
              seleccionado: celda.fecha && celda.fecha === diaSeleccionado,
              'con-eventos': celda.fecha && (eventosPorDia[celda.fecha]?.length || 0) > 0,
              [estadoDias[celda.fecha]]: celda.fecha && estadoDias[celda.fecha],
            }"
            @click="celda.dia && seleccionarDia(celda.fecha)"
            :disabled="!celda.dia"
          >
            <span v-if="celda.dia">{{ celda.dia }}</span>
            <span
              v-if="celda.fecha && (eventosPorDia[celda.fecha]?.length || 0) > 0"
              class="badge"
            >
              {{ (eventosPorDia[celda.fecha] || []).length }}
            </span>
          </button>
        </div>
      </article>

      <!-- Panel del día seleccionado -->
      <article v-if="diaSeleccionado" class="card panel dia-panel">
        <div class="dia-header">
          <h2 class="dia-title">{{ diaSeleccionado }}</h2>
          <button type="button" class="btn btn-sm" @click="toggleForm">
            {{ mostrandoForm ? 'Cancelar' : '+ Nueva cita' }}
          </button>
        </div>

        <!-- Formulario nueva cita -->
        <div v-if="mostrandoForm" class="cita-form">
          <label class="field">
            <span class="field-label">Fecha</span>
            <input v-model="form.fecha" type="date" class="input" />
          </label>
          <label class="field">
            <span class="field-label">Establecimiento *</span>
            <input v-model="form.establecimiento" type="text" class="input" placeholder="Nombre del local" />
          </label>
          <label class="field">
            <span class="field-label">Motivo</span>
            <input v-model="form.motivo" type="text" class="input" placeholder="Ej: Seguimiento de venta" />
          </label>
          <div class="form-actions">
            <button type="button" class="btn btn-sm" @click="nuevaCita">Guardar cita</button>
          </div>
        </div>

        <!-- Lista de citas del día -->
        <div v-if="citasDelDia.length" class="dia-list">
          <div
            v-for="c in citasDelDia"
            :key="c.ID_Cita"
            class="cita-item cita-item-clickable"
            @click="abrirPopup(c)"
          >
            <div class="cita-info">
              <span class="cita-id">{{ c.ID_Cita }}</span>
              <span class="cita-estab">{{ c.Establecimiento }}</span>
              <span v-if="c.Motivo" class="cita-motivo">{{ c.Motivo }}</span>
            </div>
            <div class="cita-actions">
              <span class="status" :class="`tone-${estadoTone(c.Estado)}`">
                <span class="dot" aria-hidden="true"></span>
                {{ c.Estado }}
              </span>
              <button
                v-if="c.Estado === 'pendiente'"
                type="button"
                class="btn-action btn-success"
                @click.stop="completarCita(c)"
                title="Marcar completada"
              >✓</button>
              <button
                v-if="c.Estado === 'pendiente'"
                type="button"
                class="btn-action btn-danger"
                @click.stop="cancelarCita(c)"
                title="Cancelar"
              >✕</button>
              <button
                type="button"
                class="btn-action btn-danger"
                @click.stop="eliminarCitaInline(c)"
                title="Eliminar"
              >🗑</button>
            </div>
          </div>
        </div>
        <p v-if="!citasDelDia.length && !cobrosDelDia.length" class="empty-text">Sin citas ni cobros para este día.</p>

        <!-- Cobros del día -->
        <div v-if="cobrosDelDia.length" class="dia-cobros">
          <h3 class="dia-cobros-title">Cobros del día <span class="dia-cobros-count">{{ cobrosDelDia.length }}</span></h3>
          <div
            v-for="c in cobrosDelDia"
            :key="c.ID_Cliente"
            class="cita-item cobro-item cita-item-clickable"
            :class="'cobro-' + c._tono"
            @click="abrirPopup(c)"
          >
            <div class="cita-info">
              <span class="cita-estab">{{ c.Nombre }}</span>
              <span v-if="c.Direccion" class="cita-motivo">{{ c.Direccion }}</span>
              <span v-if="c.Monto" class="cobro-monto">${{ c.Monto }}</span>
            </div>
            <div class="cita-actions">
              <span class="status" :class="`tone-${c._tono === 'atrasado' ? 'danger' : c._tono === 'esta-semana' ? 'warning' : 'success'}`">
                <span class="dot" aria-hidden="true"></span>
                {{ c._tono === 'atrasado' ? 'Vencido' : c._tono === 'esta-semana' ? 'Esta semana' : 'Pendiente' }}
              </span>
            </div>
          </div>
        </div>
      </article>
    </template>

    <!-- Popup de cita (Google Calendar style) -->
    <CitaPopup
      :cita="citaSeleccionada"
      @cerrar="cerrarPopup"
      @completar="completarDesdePopup"
      @eliminar="eliminarDesdePopup"
      @guardar="guardarDesdePopup"
      @guardar-cobro="guardarCobroDesdePopup"
    />
  </section>
</template>

<style scoped>
.loading {
  color: var(--text-secondary);
  font-size: 14px;
}

.panel {
  padding: 20px 24px;
}

/* --- Calendario --- */

.cal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.cal-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  flex: 1;
}

.btn-icon {
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  padding: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 120ms, border-color 120ms;
}

.btn-icon:hover {
  color: var(--accent-gold);
  border-color: var(--accent-gold);
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.cal-head {
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 8px 0;
}

.cal-dia {
  position: relative;
  background: none;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  padding: 10px 4px;
  min-height: 44px;
  cursor: pointer;
  transition: background 120ms, border-color 120ms;
}

.cal-dia:hover:not(.vacio) {
  background: var(--bg-elevated);
  border-color: var(--border);
}

.cal-dia.vacio {
  cursor: default;
}

.cal-dia.hoy {
  background: var(--accent-gold);
  color: var(--bg-base);
  font-weight: 700;
}

.cal-dia.hoy:hover {
  background: var(--accent-gold);
}

.cal-dia.seleccionado {
  border-color: var(--accent-gold);
  border-width: 2px;
}

.cal-dia.con-eventos {
  font-weight: 700;
}
.cal-dia.hay-pendientes .badge { background: var(--accent-wine); }
.cal-dia.todo-completado .badge { background: var(--status-success); }

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--accent-wine);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 0 4px;
  position: absolute;
  bottom: 4px;
  right: 4px;
}

/* --- Panel día --- */

.dia-panel {
  margin-top: 16px;
}

.dia-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.dia-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

/* --- Formulario --- */

.cita-form {
  display: grid;
  gap: 12px;
  padding: 16px;
  background: var(--bg-elevated);
  border-radius: 10px;
  margin-bottom: 16px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
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
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  width: 100%;
}

.input:focus {
  outline: none;
  border-color: var(--accent-gold);
}

/* --- Lista citas del día --- */

.dia-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cita-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-elevated);
  border-radius: 10px;
  border: 1px solid var(--border);
}

.cita-item-clickable {
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}

.cita-item-clickable:hover {
  border-color: var(--border-strong);
  background: var(--bg-surface);
}

.cita-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.cita-id {
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.cita-estab {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cita-motivo {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cita-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.tone-warning .dot {
  background: var(--status-warning);
}

.tone-success .dot {
  background: var(--status-success);
}

.tone-danger .dot {
  background: var(--status-danger);
}

.btn-action {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  padding: 4px 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: color 120ms, border-color 120ms;
}

.btn-action.btn-success:hover {
  color: var(--status-success);
  border-color: var(--status-success);
}

.btn-action.btn-danger:hover {
  color: var(--status-danger);
  border-color: var(--status-danger);
}

.empty-text {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}

/* --- Cobros del día --- */

.dia-cobros {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.dia-cobros-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 10px;
  color: var(--accent-gold);
}

.dia-cobros-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border-radius: 8px;
  padding: 1px 7px;
  margin-left: 4px;
}

.cobro-item {
  border-left: 3px solid var(--accent-gold);
}

.cobro-atrasado {
  border-left-color: var(--status-danger);
  background: rgba(168, 67, 58, 0.06);
}

.cobro-esta-semana {
  border-left-color: var(--status-warning);
  background: rgba(201, 138, 59, 0.06);
}

.cobro-al-dia {
  border-left-color: var(--status-success);
}

.cobro-monto {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-gold);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 768px) {
  .cal-title {
    font-size: 16px;
    text-align: center;
  }
  .badge {
    width: 25px;
    height: 14px;
    border-radius: 0 0 10px 10px;
    font-size: 8px;
    bottom: 0;
    right: 1px;
  }
}
</style>
