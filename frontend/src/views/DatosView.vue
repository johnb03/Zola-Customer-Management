<script setup>
import { ref, reactive, watch, computed } from 'vue'
import UploadMenu from '../components/UploadMenu.vue'
import { getEstado, getReports, getReport, getMenus, subirDatos, convertirEntrante, eliminarEntrante } from '../api.js'
import { dataVersion, notifyDataChanged } from '../store.js'
import { confirmar } from '../composables/useConfirm.js'
import { alerta } from '../composables/useAlert.js'

const estado = ref(null)
const menus = ref([])
const reportes = ref([])
const reporteAbierto = ref(null)
const reporteContenido = ref('')
const cargando = ref(true)

const subiendo = ref('')
const convirtiendo = reactive(new Set())
const eliminando = reactive(new Set())

const load = async () => {
  cargando.value = true
  try {
    const [e, m, r] = await Promise.all([getEstado(), getMenus(), getReports()])
    estado.value = e
    menus.value = m
    reportes.value = r
  } catch (err) {
    alerta({ titulo: 'Error', mensaje: err.message, tipo: 'error' })
  } finally {
    cargando.value = false
  }
}

load()
watch(dataVersion, load)

const catalogo = computed(() => estado.value?.catalogo)

const subirArchivo = async (tipo, event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  subiendo.value = tipo
  try {
    const res = await subirDatos(tipo, file)
    alerta({ mensaje: `Guardado: ${res.ruta} — ${res.nota}`, tipo: 'success' })
    notifyDataChanged()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  } finally {
    subiendo.value = ''
  }
}

const convertir = async (tipo, archivo) => {
  const key = `${tipo}:${archivo}`
  convirtiendo.add(key)
  try {
    const res = await convertirEntrante(tipo, archivo)
    alerta({ mensaje: res.nota, tipo: 'success' })
    notifyDataChanged()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  } finally {
    convirtiendo.delete(key)
  }
}

const estaConvirtiendo = (tipo, archivo) => convirtiendo.has(`${tipo}:${archivo}`)

const estaEliminando = (tipo, archivo) => eliminando.has(`${tipo}:${archivo}`)

const convertLabel = (f) => /\.json$/i.test(f) ? 'Cargar a la base' : 'Convertir a JSON'

const eliminar = async (tipo, archivo) => {
  const ok = await confirmar({ titulo: 'Eliminar archivo', mensaje: `¿Eliminar "${archivo}" de ${tipo}?` })
  if (!ok) return
  const key = `${tipo}:${archivo}`
  eliminando.add(key)
  try {
    await eliminarEntrante(tipo, archivo)
    alerta({ mensaje: `Archivo "${archivo}" eliminado.`, tipo: 'success' })
    notifyDataChanged()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: `Error al eliminar: ${e.message}`, tipo: 'error' })
  } finally {
    eliminando.delete(key)
  }
}

const abrirReporte = async (name) => {
  if (reporteAbierto.value === name) {
    reporteAbierto.value = null
    reporteContenido.value = ''
    return
  }
  reporteAbierto.value = name
  try {
    reporteContenido.value = await getReport(name)
  } catch {
    reporteContenido.value = 'No se pudo leer el reporte.'
  }
}
</script>

<template>
  <section>
    <header class="section-header">
      <h1 class="section-title">Datos</h1>
      <p class="section-subtitle">
        ClienteListo es el motor que impulsa Zola: los datos entran acá y él los convierte a JSON.
      </p>
      <hr class="firma" />
    </header>

    <p v-if="cargando" class="loading">Cargando datos reales…</p>

    <template v-else>
      <div class="stats">
        <div class="stat card">
          <span class="stat-value num">{{ catalogo?.totalProductos ?? 0 }}</span>
          <span class="stat-label">Productos en catálogo</span>
        </div>
        <div class="stat card">
          <span class="stat-value num">{{ catalogo?.totalCategorias ?? 0 }}</span>
          <span class="stat-label">Categorías</span>
        </div>
        <div class="stat card">
          <span class="stat-value num">{{ menus.length }}</span>
          <span class="stat-label">Menús extraídos</span>
        </div>
        <div class="stat card">
          <span class="stat-value num">{{ reportes.length }}</span>
          <span class="stat-label">Reportes generados</span>
        </div>
      </div>

      <h2 class="block-title">Subir datos</h2>
      <div class="upload-grid">
        <article class="card upload-card">
          <div class="upload-copy">
            <p class="upload-title">Menú del negocio</p>
            <p class="upload-sub">Imagen o PDF del menú, carta o listado. ClienteListo extrae el texto.</p>
          </div>
          <UploadMenu />
        </article>

        <article class="card upload-card">
          <div class="upload-copy">
            <p class="upload-title">Clientes</p>
            <p class="upload-sub">Excel con la base de clientes. Reemplaza la base actual.</p>
          </div>
          <label class="btn">
            {{ subiendo === 'clientes' ? 'Subiendo…' : 'Subir clientes' }}
            <input type="file" accept=".xlsx,.xls,.csv,.json" class="file-input" @change="subirArchivo('clientes', $event)" />
          </label>
        </article>

        <article class="card upload-card">
          <div class="upload-copy">
            <p class="upload-title">Productos a vender</p>
            <p class="upload-sub">Base de datos de productos para reemplazar el catálogo. .json carga directo; .xlsx/.csv se convierten.</p>
          </div>
          <label class="btn">
            {{ subiendo === 'productos' ? 'Subiendo…' : 'Subir productos' }}
            <input type="file" accept=".xlsx,.xls,.csv,.json" class="file-input" @change="subirArchivo('productos', $event)" />
          </label>
        </article>
      </div>

      <div class="grid-2">
        <article class="card panel">
          <h2 class="panel-title">Pendientes de conversión (entrantes)</h2>
          <ul class="file-list">
            <li v-for="f in estado.entrantes?.clientes || []" :key="'c:'+f" class="file-item">
              <span class="file-main">{{ f }}</span>
              <span class="file-sub">clientes</span>
              <div class="file-actions">
                <button
                  type="button"
                  class="btn-convert"
                  :disabled="estaConvirtiendo('clientes', f)"
                  @click="convertir('clientes', f)"
                >
                  {{ estaConvirtiendo('clientes', f) ? 'Convirtiendo…' : convertLabel(f) }}
                </button>
                <button
                  type="button"
                  class="btn-delete"
                  title="Eliminar archivo"
                  :disabled="estaEliminando('clientes', f)"
                  @click="eliminar('clientes', f)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
            </li>
            <li v-for="f in estado.entrantes?.productos || []" :key="'p:'+f" class="file-item">
              <span class="file-main">{{ f }}</span>
              <span class="file-sub">productos</span>
              <div class="file-actions">
                <button
                  type="button"
                  class="btn-convert"
                  :disabled="estaConvirtiendo('productos', f)"
                  @click="convertir('productos', f)"
                >
                  {{ estaConvirtiendo('productos', f) ? 'Convirtiendo…' : convertLabel(f) }}
                </button>
                <button
                  type="button"
                  class="btn-delete"
                  title="Eliminar archivo"
                  :disabled="estaEliminando('productos', f)"
                  @click="eliminar('productos', f)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
            </li>
            <li v-if="!(estado.entrantes?.clientes?.length || estado.entrantes?.productos?.length)" class="file-item">
              <span class="file-sub">Sin archivos pendientes.</span>
            </li>
          </ul>
        </article>

        <article class="card panel">
          <h2 class="panel-title">Menús extraídos (data-json)</h2>
          <ul class="file-list">
            <li v-for="m in menus" :key="m.archivo" class="file-item">
              <span class="file-main">{{ m.archivo }}</span>
              <span class="file-sub">{{ m.extraction_method }} · {{ m.lineas }} líneas</span>
            </li>
          </ul>
        </article>
      </div>

      <article class="card panel report-panel">
        <h2 class="panel-title">Reportes generados (reports/)</h2>
        <ul class="file-list">
          <li v-for="r in reportes" :key="r" class="file-item clickable" @click="abrirReporte(r)">
            <span class="file-main">{{ r }}</span>
            <span class="file-sub">{{ reporteAbierto === r ? 'ocultar contenido' : 'ver contenido' }}</span>
          </li>
        </ul>
        <pre v-if="reporteAbierto" class="report-content">{{ reporteContenido }}</pre>
      </article>
    </template>
  </section>
</template>

<style scoped>
.loading {
  color: var(--text-secondary);
  font-size: 14px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.stat {
  padding: 18px 20px;
}

.stat-value {
  display: block;
  font-size: 30px;
  font-weight: 900;
  color: var(--accent-gold);
}

.stat-label {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.block-title {
  margin: 28px 0 14px;
  font-size: 18px;
  font-weight: 700;
}

.upload-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.upload-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  padding: 20px 22px;
}

.upload-title {
  margin: 0 0 3px;
  font-size: 15px;
  font-weight: 700;
}

.upload-sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  padding: 9px 16px;
  border-radius: 10px;
  background: var(--accent-wine);
  color: var(--accent-gold);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: filter 120ms ease;
}

.btn:hover {
  filter: brightness(1.1);
}

.file-input {
  display: none;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 16px;
}

.panel {
  padding: 20px 24px;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 10px;
}

.file-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.file-item:last-child {
  border-bottom: 0;
}

.file-item.clickable {
  cursor: pointer;
}

.file-item.clickable:hover .file-main {
  color: var(--accent-gold);
}

.file-main {
  font-weight: 500;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-sub {
  color: var(--text-secondary);
  font-size: 12px;
  flex-shrink: 0;
}

.btn-convert {
  flex-shrink: 0;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--accent-gold);
  background: transparent;
  color: var(--accent-gold);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 120ms, color 120ms;
}

.btn-convert:hover:not(:disabled) {
  background: var(--accent-gold);
  color: var(--bg-base);
}

.btn-convert:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.btn-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 120ms ease;
}

.btn-delete:hover:not(:disabled) {
  color: var(--status-danger);
  border-color: var(--status-danger);
  background: rgba(168, 67, 58, 0.1);
}

.btn-delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.report-panel {
  margin-top: 16px;
}

.report-content {
  margin: 14px 0 0;
  max-height: 420px;
  overflow: auto;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

@media (max-width: 768px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
