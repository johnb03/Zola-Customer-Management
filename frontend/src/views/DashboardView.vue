<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getClientes, getVisitas, getCobros, exportarDashboard } from '../api.js'
import { guardarEnCarpetaPc } from '../utils/exportToFolder.js'
import { dataVersion } from '../store.js'

/* ── State ── */
const router = useRouter()
const clientes = ref([])
const visitas = ref([])
const cobros = ref([])
const cargando = ref(true)
const error = ref('')

const cargar = async () => {
  cargando.value = true
  try {
    const [c, v, cb] = await Promise.all([getClientes(), getVisitas(), getCobros()])
    clientes.value = c
    visitas.value = v
    cobros.value = cb
  } catch (e) {
    error.value = e.message
  } finally {
    cargando.value = false
  }
}

cargar()
watch(dataVersion, cargar)

/* ── Periodo ── */
const period = ref('semanal')
const periods = [
  { key: 'semanal', label: 'Semanal' },
  { key: 'mensual', label: 'Mensual' },
  { key: 'anual', label: 'Anual' },
]

const periodRange = computed(() => {
  const now = new Date()
  const start = new Date(now)
  if (period.value === 'semanal') start.setDate(now.getDate() - 7)
  else if (period.value === 'mensual') start.setMonth(now.getMonth() - 1)
  else start.setFullYear(now.getFullYear() - 1)
  return { start, end: now }
})

const parseFecha = (s) => {
  const parts = String(s || '').split('-')
  if (parts.length !== 3) return null
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return isNaN(d.getTime()) ? null : d
}

const isInRange = (fechaStr) => {
  const d = parseFecha(fechaStr)
  if (!d) return false
  return d >= periodRange.value.start && d <= periodRange.value.end
}

/* ── Métricas ── */
const visitasPeriodo = computed(() => visitas.value.filter((v) => isInRange(v.Fecha)))

const statVisitados = computed(() => {
  const unique = new Set(visitasPeriodo.value.map((v) => (v.Establecimiento || '').trim().toLowerCase()))
  return unique.size
})

const statVenta = computed(
  () => clientes.value.filter((c) => String(c.Fecha_Cobro || '').trim()).length
)

const statDineroCobrado = computed(() => {
  const total = cobros.value
    .filter((cb) => isInRange(cb.Fecha_Cobrado))
    .reduce((acc, cb) => acc + (Number(cb.Monto) || 0), 0)
  return total ? `$${total.toLocaleString('es-AR')}` : '$0'
})

const statNuevos = computed(() =>
  clientes.value.filter((c) => isInRange(c.Fecha_Registro)).length
)

const stats = computed(() => [
  { label: 'Clientes visitados', value: statVisitados.value, tone: 'success' },
  { label: 'Clientes con venta', value: statVenta.value, tone: 'success' },
  { label: 'Dinero cobrado', value: statDineroCobrado.value, tone: 'danger' },
  { label: 'Clientes nuevos', value: statNuevos.value, tone: 'gold' },
])

/* ── Gráfica: Visitas por día de semana ── */
const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const barData = computed(() => {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  visitasPeriodo.value.forEach((v) => {
    const d = parseFecha(v.Fecha)
    if (d) {
      const idx = (d.getDay() + 6) % 7
      counts[idx]++
    }
  })
  return counts
})

const yMax = computed(() => Math.max(1, ...barData.value))
const barHeight = (v) => Math.max(4, (v / yMax.value) * 100)

/* ── Gráficas de crecimiento (dinero cobrado / clientes nuevos) ── */
const chartModes = [
  { key: '7d', label: '7 días' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
]
const chartCobradoMode = ref('7d')
const chartNuevosMode = ref('7d')

const fmtMoney = (n) => '$' + Number(n).toLocaleString('es-AR')

const buildRanges = (mode) => {
  const ranges = []
  const now = new Date()
  if (mode === '7d') {
    for (let i = 6; i >= 0; i--) {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      start.setDate(now.getDate() - i)
      const end = new Date(start)
      end.setHours(23, 59, 59, 999)
      ranges.push({ label: start.toLocaleDateString('es-AR', { weekday: 'short' }), start, end })
    }
  } else if (mode === 'semana') {
    const monday = new Date(now)
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    for (let i = 3; i >= 0; i--) {
      const start = new Date(monday)
      start.setDate(monday.getDate() - i * 7)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      ranges.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, start, end })
    }
  } else {
    const cur = new Date(now.getFullYear(), now.getMonth(), 1)
    for (let i = 5; i >= 0; i--) {
      const start = new Date(cur.getFullYear(), cur.getMonth() - i, 1)
      const end = new Date(cur.getFullYear(), cur.getMonth() - i + 1, 0, 23, 59, 59, 999)
      ranges.push({ label: start.toLocaleDateString('es-AR', { month: 'short' }), start, end })
    }
  }
  return ranges
}

const cobradoData = computed(() =>
  buildRanges(chartCobradoMode.value).map((r) => ({
    label: r.label,
    value: cobros.value
      .filter((cb) => {
        const d = parseFecha(cb.Fecha_Cobrado)
        return d && d >= r.start && d <= r.end
      })
      .reduce((acc, cb) => acc + (Number(cb.Monto) || 0), 0),
  }))
)

const nuevosData = computed(() =>
  buildRanges(chartNuevosMode.value).map((r) => ({
    label: r.label,
    value: clientes.value.filter((c) => {
      const d = parseFecha(c.Fecha_Registro)
      return d && d >= r.start && d <= r.end
    }).length,
  }))
)

const cobradoMax = computed(() => Math.max(1, ...cobradoData.value.map((d) => d.value)))
const nuevosMax = computed(() => Math.max(1, ...nuevosData.value.map((d) => d.value)))
const barH = (v, max) => Math.max(4, (v / max) * 100)

/* ── Próximos cobros ── */
const proximosCobros = computed(() => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return clientes.value
    .filter((c) => {
      if (!c.Fecha_Cobro) return false
      const d = parseFecha(c.Fecha_Cobro)
      if (!d) return false
      return d >= now
    })
    .sort((a, b) => parseFecha(a.Fecha_Cobro) - parseFecha(b.Fecha_Cobro))
    .slice(0, 5)
    .map((c) => {
      const d = parseFecha(c.Fecha_Cobro)
      const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24))
      return {
        name: c.Nombre,
        sub: [c.Zona, c.Tipo_Negocio].filter(Boolean).join(' · ') || c.Direccion || '',
        amount: c.Monto ? `$${Number(c.Monto).toLocaleString()}` : '',
        monto: Number(c.Monto) || 0,
        date: formatFechaCorta(c.Fecha_Cobro),
        badge: diff <= 7 ? 'Vence pronto' : 'Pendiente',
        tone: diff <= 7 ? 'warning' : 'danger',
      }
    })
})

const formatFechaCorta = (s) => {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const d = parseFecha(s)
  if (!d) return s
  return `${d.getDate()} ${months[d.getMonth()]}`
}

/* ── Clientes sin visitar (+15 días) ── */
const clientesSinVisitar = computed(() => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const visitasList = visitas.value

  return clientes.value
    .map((c) => {
      const nombreLower = (c.Nombre || '').toLowerCase()
      let mostRecent = null
      for (const v of visitasList) {
        if ((v.Establecimiento || '').toLowerCase() === nombreLower) {
          const d = parseFecha(v.Fecha)
          if (d && (!mostRecent || d > mostRecent)) mostRecent = d
        }
      }
      const daysSince = mostRecent
        ? Math.floor((now - mostRecent) / (1000 * 60 * 60 * 24))
        : Infinity
      return { ...c, daysSince }
    })
    .filter((c) => c.daysSince > 15)
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 10)
})

const goToClientes = () => router.push('/clientes')

/* ── Exportar ── */
const exportando = ref(false)
const exportMsg = ref('')

const doExport = async () => {
  exportando.value = true
  exportMsg.value = ''
  try {
    const { blob, nombre } = await exportarDashboard({
      periodo: periods.find((p) => p.key === period.value)?.label || period.value,
      stats: stats.value,
      visitasDia: days.map((d, i) => ({ label: d, value: barData.value[i] })),
      cobrado: cobradoData.value,
      nuevos: nuevosData.value,
      proximosCobros: proximosCobros.value.map((c) => ({
        nombre: c.name,
        detalle: c.sub,
        monto: Number(c.monto) || 0,
        date: c.date,
        badge: c.badge,
      })),
      sinVisitar: clientesSinVisitar.value.map((c) => ({
        nombre: c.Nombre,
        zona: c.Zona || '',
        tipo: c.Tipo_Negocio || '',
        dias: c.daysSince === Infinity ? null : c.daysSince,
      })),
      visitasPeriodo: visitasPeriodo.value,
    })
    const guardado = await guardarEnCarpetaPc(blob, nombre)
    if (guardado.ok) exportMsg.value = `Guardado en ${guardado.carpeta}/${nombre}`
    else if (guardado.cancelado) exportMsg.value = 'Exportación cancelada.'
    else exportMsg.value = 'Se inició la descarga del Excel.'
  } catch (e) {
    exportMsg.value = `Error al exportar: ${e.message}`
  } finally {
    exportando.value = false
  }
}
</script>

<template>
  <section>
    <!-- ── Header ── -->
    <header class="dash-header">
      <h1 class="dash-title">Dashboard general</h1>
      <div class="header-right">
        <div class="filter-chips">
          <button
            v-for="p in periods"
            :key="p.key"
            class="chip"
            :class="{ active: period === p.key }"
            type="button"
            @click="period = p.key"
          >{{ p.label }}</button>
        </div>
        <button class="btn btn-export" type="button" :disabled="exportando || visitas.length === 0" @click="doExport">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ exportando ? 'Exportando…' : 'Exportar vista a Excel' }}
        </button>
      </div>
    </header>
    <hr class="firma" />

    <!-- ── Loading / Error ── -->
    <p v-if="error" class="error-banner">{{ error }}</p>
    <p v-else-if="cargando" class="loading">Cargando datos…</p>

    <template v-else>
      <!-- ── Tarjetas de resumen ── -->
      <div class="stats-row">
        <article v-for="s in stats" :key="s.label" class="card stat-card">
          <p class="stat-label">{{ s.label }}</p>
          <p class="stat-value num">{{ s.value }}</p>
        </article>
      </div>

      <!-- ── Gráfica: Visitas por día ── -->
      <article class="card chart-card">
        <header class="chart-header">
          <h2 class="chart-title">Visitas por días de semana</h2>
        </header>
        <template v-if="visitasPeriodo.length">
          <div class="chart-area">
            <div class="y-axis">
              <span class="y-tick num">{{ yMax }}</span>
              <span class="y-tick num">{{ Math.round(yMax / 2) }}</span>
              <span class="y-tick num">0</span>
            </div>
            <div class="bars-container">
              <div class="bars">
                <div v-for="(d, i) in days" :key="d" class="bar-col">
                  <span class="bar-val num">{{ barData[i] }}</span>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ height: barHeight(barData[i]) + '%' }"></div>
                  </div>
                  <span class="bar-label">{{ d }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        <p v-else class="empty-chart">Sin visitas en este período.</p>
      </article>

      <!-- ── Gráfica: Dinero cobrado ── -->
      <article class="card chart-card">
        <header class="chart-header">
          <h2 class="chart-title">Dinero cobrado</h2>
          <div class="filter-chips">
            <button v-for="m in chartModes" :key="m.key" type="button" class="chip" :class="{ active: chartCobradoMode === m.key }" @click="chartCobradoMode = m.key">{{ m.label }}</button>
          </div>
        </header>
        <template v-if="cobradoData.some((d) => d.value > 0)">
          <div class="chart-area">
            <div class="y-axis">
              <span class="y-tick num">{{ fmtMoney(cobradoMax) }}</span>
              <span class="y-tick num">{{ fmtMoney(Math.round(cobradoMax / 2)) }}</span>
              <span class="y-tick num">$0</span>
            </div>
            <div class="bars-container">
              <div class="bars">
                <div v-for="(d, i) in cobradoData" :key="i" class="bar-col">
                  <span class="bar-val num">{{ d.value ? fmtMoney(d.value) : '' }}</span>
                  <div class="bar-track">
                    <div class="bar-fill bar-fill-green" :style="{ height: barH(d.value, cobradoMax) + '%' }"></div>
                  </div>
                  <span class="bar-label">{{ d.label }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        <p v-else class="empty-chart">Sin cobros en este período.</p>
      </article>

      <!-- ── Gráfica: Clientes nuevos ── -->
      <article class="card chart-card">
        <header class="chart-header">
          <h2 class="chart-title">Clientes nuevos</h2>
          <div class="filter-chips">
            <button v-for="m in chartModes" :key="m.key" type="button" class="chip" :class="{ active: chartNuevosMode === m.key }" @click="chartNuevosMode = m.key">{{ m.label }}</button>
          </div>
        </header>
        <template v-if="nuevosData.some((d) => d.value > 0)">
          <div class="chart-area">
            <div class="y-axis">
              <span class="y-tick num">{{ nuevosMax }}</span>
              <span class="y-tick num">{{ Math.round(nuevosMax / 2) }}</span>
              <span class="y-tick num">0</span>
            </div>
            <div class="bars-container">
              <div class="bars">
                <div v-for="(d, i) in nuevosData" :key="i" class="bar-col">
                  <span class="bar-val num">{{ d.value }}</span>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ height: barH(d.value, nuevosMax) + '%' }"></div>
                  </div>
                  <span class="bar-label">{{ d.label }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        <p v-else class="empty-chart">Sin clientes nuevos en este período.</p>
      </article>

      <!-- ── Próximos cobros + Clientes sin visitar ── -->
      <div class="cobros-grid">
        <article class="card cobros-card">
          <h2 class="cobros-title">Próximos cobros</h2>
          <hr class="firma-sm" />
          <div v-if="proximosCobros.length" class="cobros-list">
            <div v-for="c in proximosCobros" :key="c.name" class="cobro-row">
              <div class="cobro-left">
                <span class="cobro-name">{{ c.name }}</span>
                <span class="cobro-sub">{{ c.sub }}</span>
              </div>
              <div class="cobro-right">
                <span v-if="c.amount" class="cobro-amount num">{{ c.amount }}</span>
                <span class="cobro-date">{{ c.date }}</span>
                <span class="badge" :class="'badge-' + c.tone">{{ c.badge }}</span>
              </div>
            </div>
          </div>
          <p v-else class="empty">No hay cobros programados proximamente.</p>
        </article>

        <article class="card cobros-card">
          <h2 class="cobros-title">Clientes sin visitar (+15 dias) <span class="sin-visitar-count">{{ clientesSinVisitar.length }}</span></h2>
          <hr class="firma-sm" />
          <div v-if="clientesSinVisitar.length" class="cobros-list">
            <div
              v-for="c in clientesSinVisitar"
              :key="c.ID_Cliente"
              class="cobro-row cobro-row-clickable"
              @click="goToClientes"
            >
              <div class="cobro-left">
                <span class="cobro-name">{{ c.Nombre }}</span>
                <span class="cobro-sub">{{ c.Zona || '' }}{{ c.Zona && c.Tipo_Negocio ? ' · ' : '' }}{{ c.Tipo_Negocio || '' }}</span>
              </div>
              <div class="cobro-right">
                <span class="days-label" :class="c.daysSince > 30 ? 'days-danger' : 'days-warning'">
                  {{ c.daysSince === Infinity ? 'Sin visitas' : c.daysSince + ' dias sin visita' }}
                </span>
              </div>
            </div>
          </div>
          <p v-else class="empty">Todos los clientes fueron visitados recientemente.</p>
        </article>
      </div>

      <p v-if="exportMsg" class="export-msg">{{ exportMsg }}</p>
    </template>
  </section>
</template>

<style scoped>
/* ── Header ── */
.dash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.dash-title {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.01em;
  line-height: 1.15;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ── Chips ── */
.filter-chips {
  display: flex;
  gap: 8px;
}

.chip {
  padding: 7px 16px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}

.chip:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.chip.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

/* ── Export button ── */
.btn-export {
  background: var(--accent-gold);
  color: #15100D;
  font-weight: 700;
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 10px;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: filter 120ms ease;
  margin-bottom: 20px;
}

.btn-export:hover {
  filter: brightness(1.08);
}

.btn-export:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Loading / Error ── */
.error-banner {
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(168, 67, 58, 0.14);
  color: var(--status-danger);
  font-size: 14px;
}

.loading {
  color: var(--text-secondary);
  font-size: 14px;
}

/* ── Stats row ── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin: 24px 0;
}

.stat-card {
  padding: 20px;
}

.stat-label {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.stat-value {
  margin: 0;
  font-size: 28px;
  font-weight: 900;
  color: #EDE6D8;
}

/* ── Chart card ── */
.chart-card {
  padding: 24px;
  margin-bottom: 16px;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}

.chart-title {
  font-size: 16px;
  font-weight: 700;
}

.empty-chart {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

/* ── Bars ── */
.chart-area {
  display: flex;
  gap: 12px;
  height: 220px;
}

.y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 4px;
  min-width: 36px;
}

.y-tick {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: right;
}

.bars-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.bars {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 20px;
  height: 100%;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 100%;
}

.bar-val {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  opacity: 0;
  transition: opacity 150ms ease;
}

.bar-col:hover .bar-val {
  opacity: 1;
}

.bar-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
}

.bar-fill {
  width: 100%;
  border-radius: 6px 6px 0 0;
  background: var(--accent-gold);
  min-height: 4px;
  transition: height 300ms ease;
}

.bar-fill-green {
  background: var(--status-success);
}

.bar-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

/* ── Próximos cobros ── */
.cobros-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.cobros-card {
  padding: 24px;
}

.cobros-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 4px;
}

.firma-sm {
  height: 1px;
  border: 0;
  background: linear-gradient(90deg, var(--accent-gold), rgba(201, 162, 39, 0) 100%);
  opacity: 0.5;
  margin: 0 0 16px;
}

.cobros-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cobro-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

.cobro-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cobro-name {
  font-size: 14px;
  font-weight: 700;
}

.cobro-sub {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.cobro-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cobro-amount {
  font-size: 15px;
  font-weight: 900;
}

.cobro-date {
  font-size: 12px;
  color: var(--text-secondary);
}

.badge {
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.badge-warning {
  background: rgba(201, 138, 59, 0.16);
  color: var(--status-warning);
}

.badge-danger {
  background: rgba(168, 67, 58, 0.16);
  color: var(--status-danger);
}

.empty {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

/* ── Clientes sin visitar ── */
.sin-visitar-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border-radius: 8px;
  padding: 2px 8px;
  margin-left: 6px;
}

.cobro-row-clickable {
  cursor: pointer;
  transition: background 120ms ease;
}

.cobro-row-clickable:hover {
  background: var(--bg-elevated);
}

.days-label {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.days-danger {
  color: var(--status-danger);
}

.days-warning {
  color: var(--status-warning);
}

/* ── Responsive ── */
@media (max-width: 900px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .cobros-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .dash-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-right {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-chips {
    justify-content: center;
  }

  .stats-row {
    grid-template-columns: 1fr;
  }

  .chart-header {
    flex-wrap: wrap;
  }

  .cobro-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .cobro-right {
    flex-wrap: wrap;
  }

  .stat-card {
    padding: 20px;
  }

  .stat-value {
    font-size: 32px;
  }

  .chip {
    font-size: 14px;
    padding: 10px 16px;
    min-height: var(--touch-min);
  }

  .btn-export {
    font-size: 15px;
    padding: 12px 20px;
  }

  .cobro-row {
    padding: 14px 16px;
  }

  .cobro-name {
    font-size: 15px;
  }

  .cobro-sub {
    font-size: 13px;
  }

  .cobro-amount {
    font-size: 17px;
  }

  .cobro-date {
    font-size: 13px;
  }

  .badge {
    font-size: 12px;
    padding: 6px 12px;
  }

  .chart-title {
    font-size: 17px;
  }
}
</style>
