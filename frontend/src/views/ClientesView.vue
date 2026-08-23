<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { getClientes, actualizarCliente, getEstado, downloadReportDocx, crearCliente, cobrarCliente } from '../api.js'
import { dataVersion } from '../store.js'
import { confirmar } from '../composables/useConfirm.js'
import { alerta } from '../composables/useAlert.js'
import ClienteFormModal from '../components/ClienteFormModal.vue'

/* ── State ── */
const clientes = ref([])
const docxFiles = ref([])
const cargando = ref(true)
const selectedId = ref(null)
const search = ref('')
const editandoCobro = ref(false)
const cobroForm = reactive({ Fecha_Cobro: '', Monto: '' })
const verTodos = ref(false)
const showCrearModal = ref(false)
const visibleCount = ref(12)

/* ── Ruta multi-punto ── */
const enRuta = ref(new Set())
const showRutaPanel = ref(false)

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('zola-ruta') || '[]')
    enRuta.value = new Set(saved)
  } catch { enRuta.value = new Set() }
})

const persistirRuta = () => {
  localStorage.setItem('zola-ruta', JSON.stringify([...enRuta.value]))
}

const toggleEnRuta = (id) => {
  const copy = new Set(enRuta.value)
  if (copy.has(id)) copy.delete(id)
  else copy.add(id)
  enRuta.value = copy
  persistirRuta()
}

const clientesEnRuta = computed(() => {
  const list = []
  for (const id of enRuta.value) {
    const c = clientes.value.find((x) => x.ID_Cliente === id)
    if (c) list.push(c)
  }
  return list
})

const rutaUrl = computed(() => {
  const addrs = clientesEnRuta.value.map((c) => c.Direccion).filter(Boolean)
  if (addrs.length === 0) return ''
  const first = encodeURIComponent(addrs[0])
  const last = encodeURIComponent(addrs[addrs.length - 1])
  const waypoints = addrs.slice(1, -1).map(encodeURIComponent).join('|')
  const base = `https://www.google.com/maps/dir/?api=1&origin=${first}&destination=${last}`
  return waypoints ? `${base}&waypoints=${waypoints}` : base
})

const moverRuta = (idx, dir) => {
  const ids = [...enRuta.value]
  const target = idx + dir
  if (target < 0 || target >= ids.length) return
  const tmp = ids[idx]
  ids[idx] = ids[target]
  ids[target] = tmp
  enRuta.value = new Set(ids)
  persistirRuta()
}

const vaciarRuta = () => {
  enRuta.value = new Set()
  persistirRuta()
}

const removeFromRuta = (id) => {
  toggleEnRuta(id)
}

/* ── Visible list limit ── */
const displayedClientes = computed(() => filtered.value.slice(0, visibleCount.value))
const hasMore = computed(() => filtered.value.length > visibleCount.value)
const verMas = () => { visibleCount.value += 12 }
watch(search, () => { visibleCount.value = 12 })
watch(verTodos, () => { visibleCount.value = 12 })

/* ── Carga ── */
const cargar = async () => {
  cargando.value = true
  try {
    const [lista, estado] = await Promise.all([getClientes(), getEstado()])
    clientes.value = lista
    docxFiles.value = estado.reportesDocx || []
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  } finally {
    cargando.value = false
  }
}

cargar()
watch(dataVersion, cargar)

/* ── Selección ── */
const activeStages = new Set(['cliente activo', 'seguimiento', 'cobro', 'visita'])

const filtered = computed(() => {
  let list = clientes.value
  if (!verTodos.value) {
    list = list.filter((c) => activeStages.has(String(c.Etapa_Embudo || '').toLowerCase()))
  }
  const q = search.value.toLowerCase().trim()
  if (q) {
    list = list.filter((c) =>
      (c.Nombre || '').toLowerCase().includes(q) ||
      (c.Direccion || '').toLowerCase().includes(q)
    )
  }
  return [...list].sort((a, b) => {
    const p = statusPriority(a) - statusPriority(b)
    if (p !== 0) return p
    return String(a.Nombre || '').localeCompare(String(b.Nombre || ''))
  })
})

const selected = computed(() => clientes.value.find((c) => c.ID_Cliente === selectedId.value) || null)

/* ── Status derivado de Fecha_Cobro ── */
const cobroStatus = (cliente) => {
  const f = cliente?.Fecha_Cobro
  if (!f) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const parts = String(f).split('-')
  if (parts.length !== 3) return null
  const fechaCobro = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  if (isNaN(fechaCobro.getTime())) return null
  const diff = Math.floor((fechaCobro - hoy) / (1000 * 60 * 60 * 24))
  if (diff < 0) return { status: 'atrasado', label: 'Cobro atrasado' }
  if (diff === 0) return { status: 'esta-semana', label: 'Cobro hoy' }
  if (diff <= 7) return { status: 'esta-semana', label: 'Cobro esta semana' }
  return { status: 'al-dia', label: 'Cobro programado' }
}

const clienteStatusDisplay = (cliente) => {
  const cobro = cobroStatus(cliente)
  if (cobro) return cobro
  const s = String(cliente?.Etapa_Embudo || '').toLowerCase()
  if (['cliente activo', 'cliente'].includes(s)) return { status: 'al-dia', label: 'Al día' }
  if (['propuesta enviada', 'contactado', 'cliente potencial'].includes(s)) return { status: 'esta-semana', label: 'Pendiente' }
  if (['no interesado', 'inactivo'].includes(s)) return { status: 'atrasado', label: 'Inactivo' }
  return { status: 'esta-semana', label: cliente?.Etapa_Embudo || '' }
}

/* ── Prioridad de status para la lista (atrasado → al día) ── */
const statusPriority = (cliente) => {
  const s = clienteStatusDisplay(cliente)?.status
  if (s === 'atrasado') return 0
  if (s === 'esta-semana') return 1
  return 2
}

/* ── Reportes del cliente ── */
const clienteReportes = computed(() => {
  if (!selected.value) return []
  const nombre = (selected.value.Nombre || '').toLowerCase().replace(/\s+/g, '-')
  return docxFiles.value.filter((f) => {
    const lower = f.toLowerCase()
    return lower.includes(nombre) || nombre.includes(lower.split('_').slice(1).join('-').split('.')[0])
  })
})

const ultimoReporteFecha = computed(() => {
  if (!clienteReportes.value.length) return '—'
  const match = clienteReportes.value[0].match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return clienteReportes.value[0]
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`
})

/* ── Editar cobro ── */
const abrirEditarCobro = () => {
  cobroForm.Fecha_Cobro = selected.value?.Fecha_Cobro || ''
  cobroForm.Monto = selected.value?.Monto ?? ''
  editandoCobro.value = true
}

const guardarCobro = async () => {
  if (!selected.value) return
  try {
    const updates = { Fecha_Cobro: cobroForm.Fecha_Cobro, Monto: cobroForm.Monto }
    const updated = await actualizarCliente(selected.value.ID_Cliente, updates)
    const idx = clientes.value.findIndex((c) => c.ID_Cliente === updated.ID_Cliente)
    if (idx !== -1) clientes.value[idx] = updated
    editandoCobro.value = false
    alerta({ mensaje: 'Cobro guardado.', tipo: 'success' })
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}

const cancelarCobro = () => {
  editandoCobro.value = false
}

/* ── Marcar cobrado ── */
const marcandoCobro = ref(false)
const marcarCobrado = async () => {
  if (!selected.value) return
  const ok = await confirmar({
    titulo: 'Marcar cobrado',
    mensaje: `¿Registrar el cobro de ${selected.value.Nombre} por $${selected.value.Monto || '0'} y volverlo a "Al día"?`,
  })
  if (!ok) return
  try {
    marcandoCobro.value = true
    await cobrarCliente(selected.value.ID_Cliente)
    await cargar()
    alerta({ mensaje: 'Cobro registrado. Cliente al día.', tipo: 'success' })
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  } finally {
    marcandoCobro.value = false
  }
}

const marcarAlDia = async () => {
  if (!selected.value) return
  const ok = await confirmar({
    titulo: 'Marcar al día',
    mensaje: `¿Cambiar ${selected.value.Nombre} de "Seguimiento" a "Cliente activo"?`,
  })
  if (!ok) return
  try {
    await actualizarCliente(selected.value.ID_Cliente, { Etapa_Embudo: 'Cliente activo' })
    await cargar()
    alerta({ mensaje: `${selected.value.Nombre} ahora está al día.`, tipo: 'success' })
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}

/* ── Editar notas ── */
const editandoNotas = ref(false)
const notasDraft = ref('')

const abrirEditarNotas = () => {
  notasDraft.value = selected.value?.Notas || ''
  editandoNotas.value = true
}

const guardarNotas = async () => {
  if (!selected.value) return
  try {
    const updated = await actualizarCliente(selected.value.ID_Cliente, { Notas: notasDraft.value })
    const idx = clientes.value.findIndex((c) => c.ID_Cliente === updated.ID_Cliente)
    if (idx !== -1) clientes.value[idx] = updated
    editandoNotas.value = false
    alerta({ mensaje: 'Notas guardadas.', tipo: 'success' })
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}

const cancelarNotas = () => {
  editandoNotas.value = false
}

/* ── Crear cliente ── */
const crearClienteSubmit = async (form) => {
  try {
    const nuevo = await crearCliente(form)
    await cargar()
    selectedId.value = nuevo.ID_Cliente
    showCrearModal.value = false
    alerta({ mensaje: 'Cliente creado.', tipo: 'success' })
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}

/* ── Helpers ── */
const badgeClass = (status) => {
  if (status === 'danger') return 'badge badge-danger'
  if (status === 'warning') return 'badge badge-warning'
  return 'badge badge-success'
}
</script>

<template>
  <section>
    <!-- ── Empty state: sin clientes ── -->
    <template v-if="!cargando && clientes.length === 0">
      <header class="section-header">
        <h1 class="section-title">Clientes</h1>
        <p class="section-subtitle">Directorio de clientes con ficha, reportes y cobros.</p>
        <hr class="firma" />
      </header>
      <div class="empty-full">
        <p class="empty-icon">📋</p>
        <p class="empty-title">Todavía no hay clientes cargados</p>
        <p class="empty-text">Convertí el Excel desde la pestaña <strong>Datos</strong> para importar la lista de clientes.</p>
      </div>
    </template>

    <!-- ── Two-pane layout ── -->
    <template v-else>
      <div class="clientes-layout">
        <!-- Columna Lista -->
        <aside class="lista-panel">
          <header class="lista-header">
            <div class="lista-header-top">
              <h2 class="lista-title">Clientes</h2>
              <span class="lista-count">{{ filtered.length }}</span>
              <button class="btn-toggle" type="button" @click="verTodos = !verTodos">{{ verTodos ? 'Todos' : 'Activos' }}</button>
            </div>
            <div class="lista-actions">
              <button class="btn-action-gold" type="button" @click="showCrearModal = true">+ Agregar cliente</button>
              <button class="btn-action-ruta" type="button" @click="showRutaPanel = true">
                Rutas <span v-if="clientesEnRuta.length" class="ruta-count">{{ clientesEnRuta.length }}</span>
              </button>
            </div>
          </header>
          <input
            v-model="search"
            class="lista-search"
            type="text"
            placeholder="Buscar cliente…"
          />
          <ul v-if="displayedClientes.length" class="lista-items">
            <li
              v-for="c in displayedClientes"
              :key="c.ID_Cliente"
              class="lista-row"
              :class="{ selected: selectedId === c.ID_Cliente }"
              @click="selectedId = c.ID_Cliente"
            >
              <span class="status-dot" :class="'dot-' + clienteStatusDisplay(c).status" aria-hidden="true"></span>
              <span class="row-text">
                <span class="row-name">{{ c.Nombre }}</span>
                <span class="row-sub">{{ clienteStatusDisplay(c).label }}</span>
              </span>
            </li>
          </ul>
          <p v-else class="empty-text-sm">{{ search ? 'Sin resultados' : 'Sin clientes' }}</p>
          <button v-if="hasMore" class="btn-ver-mas" type="button" @click="verMas">
            Ver más ({{ filtered.length - visibleCount }})
          </button>
        </aside>

        <!-- Divisor -->
        <div class="divider" aria-hidden="true"></div>

        <!-- Ficha -->
        <main v-if="selected" class="ficha-panel">
          <!-- Header -->
          <div class="ficha-header">
            <div class="ficha-name-row">
              <h2 class="ficha-name">{{ selected.Nombre }}</h2>
              <span :class="badgeClass(clienteStatusDisplay(selected).status)">{{ clienteStatusDisplay(selected).label }}</span>
            </div>
            <div v-if="selected.Direccion" class="ficha-address">
              <svg class="pin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>{{ selected.Direccion }}</span>
            </div>
          </div>

          <!-- Tarjetas resumen -->
          <div class="summary-cards">
            <div class="card summary-card">
              <p class="summary-label">Último reporte</p>
              <p class="summary-value">{{ ultimoReporteFecha }}</p>
            </div>
            <div class="card summary-card">
              <p class="summary-label">Fecha de cobro</p>
              <template v-if="!editandoCobro">
                <p class="summary-value" :class="{ 'text-danger': clienteStatusDisplay(selected).status === 'atrasado' }">
                  {{ selected.Fecha_Cobro || 'Sin fecha' }}
                </p>
                <p v-if="selected.Monto" class="summary-monto num">{{ selected.Monto }}</p>
                <div class="field-actions" style="flex-wrap: wrap;">
                  <button v-if="selected.Fecha_Cobro" class="btn btn-success btn-sm" @click="marcarCobrado">Marcar cobrado</button>
                  <button v-if="selected.Etapa_Embudo === 'Seguimiento'" class="btn btn-gold btn-sm" @click="marcarAlDia">Marcar al día</button>
                  <button class="btn-link" @click="abrirEditarCobro">Editar cobro</button>
                </div>
              </template>
              <template v-else>
                <label class="field">
                  <span class="field-label">Fecha</span>
                  <input v-model="cobroForm.Fecha_Cobro" class="input" type="date" />
                </label>
                <label class="field">
                  <span class="field-label">Monto</span>
                  <input v-model="cobroForm.Monto" class="input" type="number" placeholder="0" />
                </label>
                <div class="field-actions">
                  <button class="btn btn-gold-outline btn-sm" @click="guardarCobro">Guardar</button>
                  <button class="btn btn-ghost btn-sm" @click="cancelarCobro">Cancelar</button>
                </div>
              </template>
            </div>
          </div>

          <!-- Reportes generados -->
          <div class="ficha-section">
            <h3 class="section-title-sm">Reportes generados</h3>
            <hr class="firma-sm" />
            <div v-if="clienteReportes.length" class="file-list">
              <div v-for="r in clienteReportes" :key="r" class="file-row">
                <svg class="file-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span class="file-name">{{ r }}</span>
                <button class="link-btn" type="button" title="Descargar Word" @click="downloadReportDocx(r)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
              </div>
            </div>
            <p v-else class="section-empty">Sin reportes aún.</p>
          </div>

          <!-- Notas -->
          <div class="ficha-section">
            <h3 class="section-title-sm">Notas</h3>
            <hr class="firma-sm" />
            <template v-if="!editandoNotas">
              <p v-if="selected.Notas" class="nota-texto">{{ selected.Notas }}</p>
              <p v-else class="section-empty">Sin notas.</p>
              <button class="btn btn-gold-outline btn-sm" @click="abrirEditarNotas">
                {{ selected.Notas ? 'Editar nota' : 'Agregar nota' }}
              </button>
            </template>
            <template v-else>
              <textarea v-model="notasDraft" class="input textarea" rows="3" placeholder="Escribí una nota…"></textarea>
              <div class="field-actions">
                <button class="btn btn-gold-outline btn-sm" @click="guardarNotas">Guardar</button>
                <button class="btn btn-ghost btn-sm" @click="cancelarNotas">Cancelar</button>
              </div>
            </template>
          </div>

          <!-- CTA Ruta -->
          <div class="ficha-action">
            <button
              type="button"
              class="btn-ruta"
              :class="enRuta.has(selected.ID_Cliente) ? 'btn-ruta-active' : ''"
              @click="toggleEnRuta(selected.ID_Cliente)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>
              {{ enRuta.has(selected.ID_Cliente) ? 'Quitar de ruta' : 'Agregar a ruta' }}
            </button>
          </div>
        </main>

        <!-- Sin selección -->
        <main v-else class="ficha-panel ficha-empty">
          <p class="section-empty">Seleccioná un cliente de la lista para ver su ficha.</p>
        </main>
      </div>
    </template>

    <!-- ── Route panel ── -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showRutaPanel" class="modal-backdrop" @mousedown="(e) => { if (e.target === e.currentTarget) showRutaPanel = false }">
          <div class="modal-card ruta-modal">
            <h3 class="modal-title">Rutas <span class="ruta-count">{{ clientesEnRuta.length }}</span></h3>
            <hr class="firma-sm" />
            <p v-if="clientesEnRuta.length === 0" class="empty-text-sm">Agrega clientes a la ruta desde su ficha.</p>
            <ul v-else class="ruta-list">
              <li v-for="(c, idx) in clientesEnRuta" :key="c.ID_Cliente" class="ruta-item">
                <span class="ruta-num">{{ idx + 1 }}</span>
                <div class="ruta-info">
                  <span class="ruta-name">{{ c.Nombre }}</span>
                  <span class="ruta-addr">{{ c.Direccion || 'Sin direccion' }}</span>
                </div>
                <div class="ruta-actions">
                  <button class="ruta-reorder" type="button" title="Subir" :disabled="idx === 0" @click="moverRuta(idx, -1)">&#9650;</button>
                  <button class="ruta-reorder" type="button" title="Bajar" :disabled="idx === clientesEnRuta.length - 1" @click="moverRuta(idx, 1)">&#9660;</button>
                  <button class="ruta-remove" type="button" title="Quitar" @click="removeFromRuta(c.ID_Cliente)">&#10005;</button>
                </div>
              </li>
            </ul>
            <div class="ruta-footer">
              <a v-if="rutaUrl" :href="rutaUrl" target="_blank" rel="noopener" class="btn btn-gold-outline btn-sm">Abrir en Google Maps</a>
              <button v-if="clientesEnRuta.length" class="btn btn-ghost btn-sm" @click="vaciarRuta">Vaciar ruta</button>
              <button class="btn btn-ghost btn-sm" @click="showRutaPanel = false">Cerrar</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Crear cliente modal ── -->
    <ClienteFormModal :abierto="showCrearModal" @close="showCrearModal = false" @crear="crearClienteSubmit" />
  </section>
</template>

<style scoped>
/* ── Empty full state ── */
.empty-full {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin: 0 0 12px;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
}

.empty-text {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

/* ── Layout horizontal ── */
.clientes-layout {
  display: flex;
  gap: 0;
  min-height: calc(100vh - 120px);
}

/* ── Lista ── */
.lista-panel {
  width: 260px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  padding: 0 16px;
}

.lista-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.lista-header-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lista-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.btn-action-gold,
.btn-action-ruta {
  background: transparent;
  border: 1.5px solid var(--accent-gold);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-gold);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  text-align: center;
  transition: all 120ms ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.btn-action-gold:hover,
.btn-action-ruta:hover {
  background: rgba(201, 162, 39, 0.1);
}

.lista-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.lista-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border-radius: 8px;
  padding: 2px 8px;
}

.lista-search {
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  font-family: inherit;
  margin-bottom: 4px;
}

.lista-search:focus {
  outline: none;
  border-color: var(--accent-gold);
}

.lista-items {
  margin: 0;
  padding: 0;
  list-style: none;
  flex: 1;
  overflow-y: auto;
}

.empty-text-sm {
  margin: 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.lista-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 120ms ease;
  border-left: 2px solid transparent;
}

.lista-row:hover {
  background: var(--bg-elevated);
}

.lista-row.selected {
  background: var(--bg-surface);
  border-left-color: var(--border-strong);
}

/* ── Status dot ── */
.status-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot-atrasado { background: var(--status-danger); }
.dot-esta-semana { background: var(--status-warning); }
.dot-al-dia { background: var(--status-success); }

.row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.row-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
}

.row-sub {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.3;
}

/* ── Divisor ── */
.divider {
  width: 1px;
  background: var(--border);
  align-self: stretch;
}

/* ── Ficha ── */
.ficha-panel {
  flex: 1;
  padding: 0 32px;
  overflow-y: auto;
}

.ficha-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Header ── */
.ficha-header {
  margin-bottom: 24px;
}

.ficha-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.ficha-name {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.badge {
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.badge-success {
  background: rgba(107, 143, 71, 0.16);
  color: var(--status-success);
}

.badge-warning {
  background: rgba(201, 138, 59, 0.16);
  color: var(--status-warning);
}

.badge-danger {
  background: rgba(168, 67, 58, 0.16);
  color: var(--status-danger);
}

.ficha-address {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.pin-icon {
  flex-shrink: 0;
}

/* ── Summary cards ── */
.summary-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 28px;
}

.summary-card {
  padding: 16px 20px;
}

.summary-label {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.summary-value {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.summary-monto {
  margin: 4px 0 0;
  font-size: 20px;
  font-weight: 900;
  color: var(--accent-gold);
}

.text-danger { color: var(--status-danger); }

/* ── Button link ── */
.btn-link {
  background: none;
  border: none;
  color: var(--accent-gold);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 0;
  cursor: pointer;
  margin-top: 6px;
}

.btn-link:hover {
  text-decoration: underline;
}

/* ── Fields ── */
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.input {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  width: 100%;
}

.input:focus {
  outline: none;
  border-color: var(--accent-gold);
}

.textarea {
  resize: vertical;
}

.field-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

/* ── Sections ── */
.ficha-section {
  margin-bottom: 28px;
}

.section-title-sm {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 4px;
}

.firma-sm {
  height: 1px;
  border: 0;
  background: linear-gradient(90deg, var(--accent-gold), rgba(201, 162, 39, 0) 100%);
  opacity: 0.5;
  margin: 0 0 14px;
}

.section-empty {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* ── Reportes ── */
.file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

.file-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.file-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: color 120ms ease;
}

.link-btn:hover {
  color: var(--accent-gold);
}

/* ── Notas ── */
.nota-texto {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text-secondary);
  font-style: italic;
  line-height: 1.5;
}

/* ── Buttons ── */
.btn {
  font-family: inherit;
  cursor: pointer;
}

.btn-sm {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-gold-outline {
  background: transparent;
  border: 1.5px solid var(--accent-gold);
  color: var(--accent-gold);
  transition: all 150ms ease;
}

.btn-gold-outline:hover {
  background: rgba(201, 162, 39, 0.1);
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-weight: 500;
}

.btn-ghost:hover {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

/* ── CTA Ruta ── */
.ficha-action {
  margin-top: 8px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.btn-ruta {
  width: 100%;
  padding: 12px 20px;
  border-radius: 12px;
  border: 1.5px solid var(--border-strong);
  background: transparent;
  color: var(--accent-gold);
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-decoration: none;
  transition: all 150ms ease;
}

.btn-ruta:hover {
  background: rgba(201, 162, 39, 0.08);
  border-color: var(--accent-gold);
}

.btn-ruta-danger {
  border-color: var(--status-danger);
  color: var(--status-danger);
}

.btn-ruta-danger:hover {
  background: rgba(168, 67, 58, 0.08);
  border-color: var(--status-danger);
}

/* ── Toggle & Add button ── */
.btn-toggle {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  transition: all 120ms ease;
}

.btn-toggle:hover {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

.btn-ver-mas {
  display: block;
  width: 100%;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  text-align: center;
  margin-top: 4px;
  transition: all 120ms ease;
}

.btn-ver-mas:hover {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

/* ── Ruta active toggle ── */
.btn-ruta-active {
  border-color: var(--accent-gold);
  background: rgba(201, 162, 39, 0.08);
}

/* ── Route panel modal ── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
}

.modal-card {
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.ruta-modal {
  max-width: 440px;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
}

.firma-sm {
  height: 1px;
  border: 0;
  background: linear-gradient(90deg, var(--accent-gold), rgba(201, 162, 39, 0) 100%);
  opacity: 0.5;
  margin: 0 0 16px;
}

.ruta-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border-radius: 8px;
  padding: 2px 8px;
  margin-left: 6px;
}

.ruta-list {
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ruta-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
}

.ruta-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-gold);
  flex-shrink: 0;
}

.ruta-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ruta-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.ruta-addr {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ruta-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.ruta-reorder,
.ruta-remove {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  line-height: 1;
  border-radius: 4px;
  transition: color 120ms ease;
}

.ruta-reorder:hover {
  color: var(--accent-gold);
}

.ruta-reorder:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.ruta-remove:hover {
  color: var(--status-danger);
}

.ruta-footer {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* Transiciones */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 180ms ease;
}

.modal-enter-active .modal-card,
.modal-leave-active .modal-card {
  transition: transform 180ms ease, opacity 180ms ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-card {
  transform: scale(0.95) translateY(8px);
  opacity: 0;
}

.modal-leave-to .modal-card {
  transform: scale(0.97);
  opacity: 0;
}

/* ── Responsive: mobile ── */
@media (max-width: 768px) {
  .clientes-layout {
    flex-direction: column;
  }

  .lista-panel {
    width: 100%;
    min-width: 100%;
    max-height: 500px;
  }

  .lista-actions {
    grid-template-columns: 1fr;
  }

  .btn-ver-mas {
    margin-bottom: 10px;
  }

  .divider {
    width: 100%;
    height: 1px;
  }

  .ficha-panel {
    padding: 0 16px;
  }

  .summary-cards {
    grid-template-columns: 1fr;
  }
}
</style>
