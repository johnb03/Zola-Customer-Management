<script setup>
import { ref, reactive, watch, computed } from 'vue'
import UploadMenu from '../components/UploadMenu.vue'
import AnalisisFlow from '../components/AnalisisFlow.vue'
import { getEstado, getReports, getReport, getMenus, subirDatos, convertirEntrante, eliminarEntrante, getPlantillaReporte, subirPlantillaReporte } from '../api.js'
import { dataVersion, notifyDataChanged } from '../store.js'
import { confirmar } from '../composables/useConfirm.js'
import { alerta } from '../composables/useAlert.js'

const estado = ref(null)
const menus = ref([])
const reportes = ref([])
const reporteAbierto = ref(null)
const reporteContenido = ref('')
const cargando = ref(true)

// Análisis ClienteListo en la app — modal compartido (AnalisisFlow)
const analisisFlowAbierto = ref(false)
const analisisFlowMenus = ref([])

// Plantilla de reporte diario (subida centralizada aquí)
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
    notifyDataChanged()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: `Error al subir la plantilla: ${e.message}`, tipo: 'error' })
  } finally {
    subiendoPlantilla.value = false
  }
}

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
    await cargarPlantilla()
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

const trunca = (s) => s.length > 40 ? s.slice(0, 37) + '...' : s

// Abre el modal de análisis para un menú extraído.
const abrirAnalisis = (archivo) => {
  analisisFlowMenus.value = [String(archivo).replace(/\.json$/, '')]
  analisisFlowAbierto.value = true
}

// Subida desde UploadMenu → abre el análisis automáticamente.
const onMenuSubido = (name) => {
  if (name) {
    analisisFlowMenus.value = [String(name).replace(/\.json$/, '')]
    analisisFlowAbierto.value = true
  }
}

// Termina el batch de análisis → refresca reportes y muestra feedback.
// El modal queda abierto mostrando la pantalla "Tu análisis está listo"
// (con los botones Guardar .docx); el usuario lo cierra manualmente.
const onAnalisisDone = () => {
  alerta({ mensaje: 'Análisis completado.', tipo: 'success' })
  load()
}
</script>

<template>
  <section>
    <header class="section-header">
      <h1 class="section-title">Datos</h1>
      <hr class="firma" />
    </header>

    <p v-if="cargando" class="loading">Cargando datos…</p>

    <template v-else>
      <!-- ── Stats ──────────────────────────────────── -->
      <div class="stats">
        <div class="stat">
          <span class="stat-value">{{ catalogo?.totalProductos ?? 0 }}</span>
          <span class="stat-label">Productos</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ catalogo?.totalCategorias ?? 0 }}</span>
          <span class="stat-label">Categorías</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ menus.length }}</span>
          <span class="stat-label">Menús</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ reportes.length }}</span>
          <span class="stat-label">Reportes</span>
        </div>
      </div>

      <!-- ── Subir datos ───────────────────────────── -->
      <div class="section-block">
        <h2 class="block-title">Subir datos</h2>
        <div class="upload-grid">
          <article class="upload-card">
            <div class="upload-info">
              <p class="upload-name">Plantilla de reporte diario</p>
              <p class="upload-desc">Excel .xlsx del reporte de visitas; el agente la analiza y la usa al exportar desde Visitas</p>
            </div>
            <label class="upload-btn">
              {{ subiendoPlantilla ? 'Subiendo…' : (plantilla ? 'Cambiar plantilla' : 'Subir plantilla') }}
              <input type="file" accept=".xlsx,.xls" class="sr-only" @change="subirPlantilla" />
            </label>
          </article>

          <article class="upload-card">
            <div class="upload-info">
              <p class="upload-name">Menú del negocio</p>
              <p class="upload-desc">Imagen o PDF del menú, carta o listado</p>
            </div>
            <UploadMenu @subido="onMenuSubido" />
          </article>

          <article class="upload-card">
            <div class="upload-info">
              <p class="upload-name">Clientes</p>
              <p class="upload-desc">Excel con la base de clientes</p>
            </div>
            <label class="upload-btn">
              {{ subiendo === 'clientes' ? 'Subiendo…' : 'Subir' }}
              <input type="file" accept=".xlsx,.xls,.csv,.json" class="sr-only" @change="subirArchivo('clientes', $event)" />
            </label>
          </article>

          <article class="upload-card">
            <div class="upload-info">
              <p class="upload-name">Productos</p>
              <p class="upload-desc">Catálogo de productos (.json carga directo)</p>
            </div>
            <label class="upload-btn">
              {{ subiendo === 'productos' ? 'Subiendo…' : 'Subir' }}
              <input type="file" accept=".xlsx,.xls,.csv,.json" class="sr-only" @change="subirArchivo('productos', $event)" />
            </label>
          </article>
        </div>

        <!-- Estado de análisis de la plantilla -->
        <div v-if="plantilla" class="plantilla-estado">
          <span class="pe-archivo">✓ {{ plantilla.archivo }} · {{ plantilla.columnas?.length || 0 }} columnas · tabla: {{ plantilla.visitasTable?.type || plantilla.agentPlan?.visitsTableType || '—' }}</span>
          <span v-if="plantilla.det" class="pe-det">Detect: header fila {{ plantilla.det.headerRowNumber }} · datos desde {{ plantilla.det.headerRowNumber + 1 }} · {{ plantilla.det.columnMap?.length || 0 }} columnas mapeadas</span>
          <span v-if="plantilla.agentError" class="pe-err">Agente falló: {{ plantilla.agentError }}</span>
          <span v-else class="pe-ok">Agente: plan OK ({{ plantilla.agentPlan?.visitsTableType || 'estático' }})</span>
        </div>
      </div>

      <!-- ── Pendientes + Menús ────────────────────── -->
      <div class="section-block">
        <div class="grid-2">
          <!-- Entrantes -->
          <article class="panel">
            <h2 class="panel-title">Pendientes de conversión</h2>
            <ul class="file-list">
              <li v-for="f in estado.entrantes?.clientes || []" :key="'c:' + f" class="file-item">
                <div class="file-text">
                  <span class="file-name">{{ trunca(f) }}</span>
                  <span class="file-tag">clientes</span>
                </div>
                <div class="file-actions">
                  <button type="button" class="btn-action" :disabled="estaConvirtiendo('clientes', f)" @click="convertir('clientes', f)">
                    {{ estaConvirtiendo('clientes', f) ? '...' : convertLabel(f) }}
                  </button>
                  <button type="button" class="btn-icon" title="Eliminar" :disabled="estaEliminando('clientes', f)" @click="eliminar('clientes', f)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </div>
              </li>
              <li v-for="f in estado.entrantes?.productos || []" :key="'p:' + f" class="file-item">
                <div class="file-text">
                  <span class="file-name">{{ trunca(f) }}</span>
                  <span class="file-tag">productos</span>
                </div>
                <div class="file-actions">
                  <button type="button" class="btn-action" :disabled="estaConvirtiendo('productos', f)" @click="convertir('productos', f)">
                    {{ estaConvirtiendo('productos', f) ? '...' : convertLabel(f) }}
                  </button>
                  <button type="button" class="btn-icon" title="Eliminar" :disabled="estaEliminando('productos', f)" @click="eliminar('productos', f)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </div>
              </li>
              <li v-if="!(estado.entrantes?.clientes?.length || estado.entrantes?.productos?.length)" class="file-empty">
                Sin archivos pendientes
              </li>
            </ul>
          </article>

          <!-- Menús -->
          <article class="panel">
            <h2 class="panel-title">Menús extraídos</h2>
            <ul class="file-list">
              <li v-for="m in menus" :key="m.archivo" class="file-item">
                <div class="file-text">
                  <span class="file-name">{{ trunca(m.archivo) }}</span>
                  <span class="file-tag">{{ m.extraction_method }} · {{ m.lineas }}l</span>
                </div>
                <div class="file-actions">
                  <button type="button" class="btn-action" @click="abrirAnalisis(m.archivo)">
                    Analizar
                  </button>
                </div>
              </li>
              <li v-if="!menus.length" class="file-empty">
                Sin menús procesados
              </li>
            </ul>
          </article>
        </div>
      </div>

      <!-- ── Reportes ──────────────────────────────── -->
      <div class="section-block">
        <article class="panel">
          <h2 class="panel-title">Reportes generados</h2>
          <ul class="file-list">
            <li v-for="r in reportes" :key="r" class="file-item file-item--click" @click="abrirReporte(r)">
              <div class="file-text">
                <span class="file-name">{{ trunca(r) }}</span>
                <span class="file-tag">{{ reporteAbierto === r ? 'ocultar' : 'ver' }}</span>
              </div>
            </li>
            <li v-if="!reportes.length" class="file-empty">
              Sin reportes
            </li>
          </ul>
          <pre v-if="reporteAbierto" class="report-content">{{ reporteContenido }}</pre>
        </article>
      </div>
    </template>

    <!-- Análisis ClienteListo (modal compartido) -->
    <AnalisisFlow v-model:open="analisisFlowAbierto" :menus="analisisFlowMenus"
      @done="onAnalisisDone" @close="analisisFlowAbierto = false" />
  </section>
</template>

<style scoped>
/* ── Header ──────────────────────────────── */
.section-header {
  margin-bottom: 20px;
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 10px;
}

.firma {
  border: none;
  height: 2px;
  width: 40px;
  background: var(--accent-gold);
  border-radius: 1px;
  margin: 0;
}

.loading {
  color: var(--text-secondary);
  font-size: 14px;
  padding: 40px 0;
  text-align: center;
}

/* ── Stats ───────────────────────────────── */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.stat {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 800;
  color: var(--accent-gold);
  line-height: 1;
}

.stat-label {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Sections ────────────────────────────── */
.section-block {
  margin-bottom: 24px;
}

.block-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 12px;
}

/* ── Upload grid ─────────────────────────── */
.upload-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.upload-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
}

.upload-info {
  min-width: 0;
}

.upload-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.upload-desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: border-color 120ms, color 120ms;
}

.upload-btn:hover {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* ── Plantilla estado ─────────────────────── */
.plantilla-estado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-top: 10px;
  padding: 10px 14px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
}

.pe-archivo {
  color: var(--text-primary);
  font-weight: 600;
}

.pe-det {
  color: var(--text-secondary);
  font-size: 12px;
}

.pe-ok {
  color: var(--status-success);
}

.pe-err {
  color: var(--status-danger);
}

/* ── Grid 2 cols ─────────────────────────── */
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* ── Panel ───────────────────────────────── */
.panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 10px;
}

/* ── File list ───────────────────────────── */
.file-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.file-item:last-child {
  border-bottom: 0;
}

.file-item--click {
  cursor: pointer;
}

.file-item--click:hover .file-name {
  color: var(--accent-gold);
}

.file-text {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.file-name {
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-tag {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.file-empty {
  padding: 12px 0;
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
  border-bottom: 0;
}

/* ── File actions ────────────────────────── */
.file-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.btn-action {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 120ms, color 120ms;
}

.btn-action:hover:not(:disabled) {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

.btn-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 120ms ease;
}

.btn-icon:hover:not(:disabled) {
  color: var(--status-danger);
  border-color: var(--status-danger);
}

.btn-icon:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── Report content ──────────────────────── */
.report-content {
  margin: 10px 0 0;
  max-height: 360px;
  overflow: auto;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* ── Modal de guardado del reporte ──────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal {
  width: min(560px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px 24px;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.modal-close {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.modal-text {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-primary);
}

.inline-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--accent-gold);
}

.modal-actions {
  display: flex;
  gap: 10px;
}

.modal-actions .btn-action {
  padding: 8px 18px;
  font-size: 14px;
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

.modal-actions .btn-action:hover {
  background: rgba(196, 168, 105, 0.12);
}

.btn-ghost {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 120ms, color 120ms;
}

.btn-ghost:hover {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

/* ── Mobile ──────────────────────────────── */
@media (max-width: 640px) {
  .stats {
    grid-template-columns: 1fr 1fr;
  }

  .stat {
    padding: 14px 12px;
  }

  .stat-value {
    font-size: 20px;
  }

  .grid-2 {
    grid-template-columns: 1fr;
  }

  .upload-card {
    padding: 12px 14px;
  }

  .upload-desc {
    display: none;
  }

  .firma { margin-bottom: 20px; }

  .panel {
    padding: 14px;
  }
}
</style>
