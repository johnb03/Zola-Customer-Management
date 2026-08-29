<script setup>
import { ref, onMounted, computed } from 'vue'
import { getNotas, crearNota, actualizarNota, eliminarNota, convertirNota, guardarVisitasDesdeNota, contarVisitasPorFecha } from '../api'
import { confirmar } from '../composables/useConfirm.js'
import { alerta } from '../composables/useAlert.js'
import ConversionFlow from '../components/ConversionFlow.vue'
import ConversionPreview from '../components/ConversionPreview.vue'

const notas = ref([])
const cargando = ref(true)

// Editor modal
const showEditor = ref(false)
const editando = ref(null) // null = nueva, object = editando
const editorFecha = ref('')
const editorContenido = ref('')
const guardando = ref(false)

// Conversion flow (timeline)
const showFlow = ref(false)
const flowNota = ref(null)

// Conversion preview
const showPreview = ref(false)
const previewVisitas = ref([])
const previewNotaId = ref('')
const previewNotaFecha = ref('')
const previewReemplazadas = ref(0)

// Filter
const filtroFecha = ref('')
const notasFiltradas = computed(() => {
  if (!filtroFecha.value) return notas.value
  return notas.value.filter((n) => n.Fecha === filtroFecha.value)
})

const _d = new Date()
const hoy = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`

const cargarNotas = async () => {
  cargando.value = true
  try {
    notas.value = await getNotas()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  } finally {
    cargando.value = false
  }
}

onMounted(cargarNotas)

// --- Editor ---
const abrirNueva = () => {
  editando.value = null
  editorFecha.value = hoy
  editorContenido.value = ''
  showEditor.value = true
}

const abrirEditar = (nota) => {
  editando.value = nota
  editorFecha.value = nota.Fecha
  editorContenido.value = nota.Contenido
  showEditor.value = true
}

// Auto-save helper: silently save current editor content
const autoSave = async () => {
  const text = editorContenido.value.trim()
  if (!text) return false // no content, nothing to save
  // Skip save if nothing changed (existing nota with same content)
  if (editando.value && editando.value.Contenido === text && editando.value.Fecha === editorFecha.value) {
    return false
  }
  try {
    if (editando.value) {
      await actualizarNota(editando.value.ID_Nota, {
        Fecha: editorFecha.value,
        Contenido: text,
      })
    } else {
      const nueva = await crearNota({
        Fecha: editorFecha.value,
        Contenido: text,
      })
      editando.value = nueva // now it's an existing nota
    }
    await cargarNotas()
    return true
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
    return false
  }
}

const cerrarEditor = async () => {
  await autoSave()
  showEditor.value = false
  editando.value = null
}

const guardar = async () => {
  if (!editorContenido.value.trim()) return
  guardando.value = true
  try {
    if (editando.value) {
      await actualizarNota(editando.value.ID_Nota, {
        Fecha: editorFecha.value,
        Contenido: editorContenido.value.trim(),
      })
    } else {
      const nueva = await crearNota({
        Fecha: editorFecha.value,
        Contenido: editorContenido.value.trim(),
      })
      editando.value = nueva
    }
    await cargarNotas()
    cerrarEditor()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  } finally {
    guardando.value = false
  }
}

const pedirBorrar = async (nota) => {
  const ok = await confirmar({ titulo: 'Eliminar nota', mensaje: '¿Estás seguro de que querés eliminar esta nota? Esta acción no se puede deshacer.' })
  if (!ok) return
  try {
    await eliminarNota(nota.ID_Nota)
    await cargarNotas()
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  }
}

// --- Conversión ---
const iniciarConversion = (nota) => {
  // Save any pending changes first
  if (editando.value && editorContenido.value.trim()) {
    actualizarNota(editando.value.ID_Nota, {
      Fecha: editorFecha.value,
      Contenido: editorContenido.value.trim(),
    }).catch(() => {})
  }
  // Close editor, open flow
  showEditor.value = false
  editando.value = null
  flowNota.value = nota
  showFlow.value = true
}

const onFlowDone = async (resultado) => {
  const notaUsada = flowNota.value
  showFlow.value = false
  flowNota.value = null

  if (resultado.error) {
    alerta({ titulo: 'Error', mensaje: resultado.error, tipo: 'error' })
    return
  }
  if (!resultado.visitas || resultado.visitas.length === 0) {
    alerta({ titulo: 'Error', mensaje: 'El agente no pudo identificar visitas en esta nota.', tipo: 'error' })
    return
  }

  // Consultar visitas existentes de esa fecha para la advertencia de reemplazo
  let reemplazadas = 0
  try {
    const res = await contarVisitasPorFecha(notaUsada?.Fecha || '')
    reemplazadas = res.count || 0
  } catch {
    // Silencioso — si falla, no mostramos advertencia
  }

  // Open preview for review
  previewVisitas.value = resultado.visitas
  previewNotaId.value = notaUsada?.ID_Nota || ''
  previewNotaFecha.value = notaUsada?.Fecha || ''
  previewReemplazadas.value = reemplazadas
  showPreview.value = true
}

const onFlowCancel = () => {
  showFlow.value = false
  flowNota.value = null
}

const confirmarConversion = async (filasActivas) => {
  if (filasActivas.length === 0) {
    showPreview.value = false
    return
  }
  // Defensa "una vez por día": si OTRA nota de la misma fecha ya convirtió,
  // guardar reemplaza el reporte completo de ese día — exigir confirmación explícita.
  try {
    const notasActuales = await getNotas()
    const otras = notasActuales.filter(
      (n) =>
        n.Convertida &&
        n.ID_Nota !== previewNotaId.value &&
        String(n.Fecha || '').slice(0, 10) === String(previewNotaFecha.value || '').slice(0, 10),
    )
    if (otras.length > 0) {
      const existentes = previewReemplazadas.value > 0 ? previewReemplazadas.value : 'varias'
      const ok = await confirmar({
        titulo: 'Otra nota ya convirtió este día',
        mensaje: `La nota "${otras[0].ID_Nota}" (${String(otras[0].Fecha || '').slice(0, 10)}) ya convirtió visitas para este día. Al guardar se REEMPLAZARÁ todo el reporte de la fecha (${existentes} visita${previewReemplazadas.value === 1 ? '' : 's'} existente${previewReemplazadas.value === 1 ? '' : 's'}) por estas ${filasActivas.length} visita${filasActivas.length !== 1 ? 's' : ''}. ¿Continuar?`,
      })
      if (!ok) {
        showPreview.value = false
        return
      }
    }
  } catch {
    // Consulta no crítica: si falla, la preview ya avisa el reemplazo por fecha
  }
  guardando.value = true
  try {
    const res = await guardarVisitasDesdeNota(previewNotaId.value, {
      fecha: previewNotaFecha.value,
      visitas: filasActivas,
    })
    showPreview.value = false
    await cargarNotas()
    const msgBase = `${filasActivas.length} visita${filasActivas.length !== 1 ? 's' : ''} guardada${filasActivas.length !== 1 ? 's' : ''}`
    const msgReem = res.reemplazadas > 0 ? ` (se reemplazaron ${res.reemplazadas} existente${res.reemplazadas !== 1 ? 's' : ''})` : ''
    alerta({ mensaje: `${msgBase} correctamente${msgReem}`, tipo: 'success' })
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: e.message, tipo: 'error' })
  } finally {
    guardando.value = false
  }
}

const cerrarPreview = () => {
  showPreview.value = false
  previewVisitas.value = []
  previewReemplazadas.value = 0
}
</script>

<template>
  <div class="notas-view">
    <!-- Header -->
    <header class="notas-header">
      <div class="header-top">
        <div class="title-group">
          <h1 class="title">Notas</h1>
          <div class="gold-line"></div>
        </div>
        <div class="header-actions">
          <button class="filter-chip" @click="filtroFecha = filtroFecha ? '' : hoy">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14H4V6Z" />
              <path d="M4 10h16" /><path d="M8 4v3M16 4v3" />
            </svg>
            <span>Filtro: {{ filtroFecha ? 'hoy' : 'fecha' }}</span>
          </button>
          <button class="btn-create" @click="abrirNueva">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
          </button>
        </div>
      </div>
      <div class="gold-divider"></div>
    </header>

    <!-- Loading -->
    <div v-if="cargando" class="empty-state">
      <p class="empty-text">Cargando notas...</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="notasFiltradas.length === 0 && !cargando" class="empty-state">
      <svg class="empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
      </svg>
      <p class="empty-title">Aún no tienes notas</p>
      <p class="empty-desc">Crea tu primera nota para registrar ideas, visitas pendientes o información de clientes.</p>
      <button class="btn-create" @click="abrirNueva">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14" /><path d="M12 5v14" />
        </svg>
      </button>
    </div>

    <!-- Notes grid -->
    <div v-else class="notes-grid">
      <div
        v-for="nota in notasFiltradas"
        :key="nota.ID_Nota"
        class="nota-card"
        @click="abrirEditar(nota)"
      >
        <span v-if="nota.Convertida" class="badge-convertida">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
          </svg>
          Convertida
        </span>
        <p class="nota-text">{{ nota.Contenido }}</p>
        <div class="nota-footer">
          <div class="nota-actions">
            <button class="card-action-btn delete-card-btn" title="Eliminar" @click.stop="pedirBorrar(nota)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Editor modal -->
    <div v-if="showEditor" class="modal-overlay" @click.self="cerrarEditor">
      <div class="editor-modal">
        <div class="editor-header">
          <button class="close-btn" @click="cerrarEditor">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div class="editor-textarea-wrap">
          <textarea
            v-model="editorContenido"
            class="editor-textarea"
            placeholder="Escribe aquí los detalles de la visita..."
            autofocus
          ></textarea>
        </div>

        <p v-if="editando" class="editor-warning">
          Nota: Convertir de nuevo reemplazará las visitas ya generadas.
        </p>

        <div class="editor-footer">
          <button class="btn-cancel" @click="cerrarEditor">Cancelar</button>
          <button
            v-if="editando"
            class="btn-convert"
            @click="iniciarConversion(editando)"
            :disabled="!editorContenido.trim()"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
            </svg>
            Convertir a reporte
          </button>
          <button
            v-else
            class="btn-convert"
            @click="guardar"
            :disabled="guardando || !editorContenido.trim()"
          >
            {{ guardando ? 'Guardando...' : 'Guardar nota' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Conversion flow (timeline) -->
    <ConversionFlow
      v-if="showFlow"
      :nota="flowNota"
      @done="onFlowDone"
      @cancel="onFlowCancel"
    />

    <!-- Conversion preview -->
    <ConversionPreview
      v-if="showPreview"
      :visitas="previewVisitas"
      :nota-id="previewNotaId"
      :nota-fecha="previewNotaFecha"
      :reemplazadas="previewReemplazadas"
      @close="cerrarPreview"
      @confirm="confirmarConversion"
    />
  </div>
</template>

<style scoped>
.notas-view {
  padding: 0 0 40px;
}

/* --- Header --- */
.notas-header {
  padding: 40px 60px 0;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title {
  font-family: 'Satoshi', sans-serif;
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.5px;
  color: var(--text-primary);
  margin: 0;
}

.gold-line {
  width: 80px;
  height: 2px;
  border-radius: 1px;
  background: var(--accent-gold);
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 20px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: 'Satoshi', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color 120ms;
}
.filter-chip:hover { color: var(--text-primary); }

.btn-create {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  background: var(--accent-gold);
  color: var(--bg-base);
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity 120ms;
}
.btn-create:hover { opacity: 0.9; }

.gold-divider {
  width: 100%;
  height: 1px;
  background: var(--accent-gold);
  margin-top: 12px;
}

/* --- Empty state --- */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  gap: 24px;
}

.empty-icon {
  color: var(--border);
}

.empty-title {
  font-family: 'Satoshi', sans-serif;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.empty-desc {
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--text-secondary);
  text-align: center;
  max-width: 400px;
  margin: 0;
}

/* --- Notes grid --- */
.notes-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 24px 60px;
}

.nota-card {
  height: 180px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-surface);
  border: 0.5px solid var(--border);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 120ms;
}
.nota-card:hover { border-color: var(--accent-gold); }

.badge-convertida {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(201, 162, 39, 0.15);
  color: var(--accent-gold);
  font-family: 'Satoshi', sans-serif;
  font-size: 11px;
  font-weight: 600;
  width: fit-content;
}

.nota-text {
  flex: 1;
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--text-primary);
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
}

.nota-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.nota-actions {
  display: flex;
  gap: 4px;
}

.card-action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 120ms;
}
.card-action-btn:hover { background: rgba(255, 255, 255, 0.05); }
.delete-card-btn { color: var(--status-danger); }

/* --- Editor modal --- */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.editor-modal {
  width: 560px;
  height: 580px;
  max-width: calc(100vw - 32px);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 16px 24px 8px;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--bg-surface);
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 120ms;
}
.close-btn:hover { color: var(--text-primary); }

.editor-textarea-wrap {
  flex: 1;
  padding: 0 24px;
  min-height: 0;
}

.editor-textarea {
  width: 100%;
  height: 100%;
  padding: 16px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-primary);
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.6;
  resize: none;
  outline: none;
}
.editor-textarea::placeholder { color: rgba(168, 154, 133, 0.5); }
.editor-textarea:focus { border-color: transparent; }

/* Scrollbar transparente con hover gris */
.editor-textarea::-webkit-scrollbar,
.notes-grid::-webkit-scrollbar { width: 6px; }
.editor-textarea::-webkit-scrollbar-track,
.notes-grid::-webkit-scrollbar-track { background: transparent; }
.editor-textarea::-webkit-scrollbar-thumb,
.notes-grid::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
.editor-textarea:hover::-webkit-scrollbar-thumb,
.notes-grid:hover::-webkit-scrollbar-thumb { background: rgba(168, 154, 133, 0.3); }

.editor-warning {
  font-family: 'Satoshi', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
  padding: 8px 24px 0;
  margin: 0;
}

.editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px 20px;
}

.btn-cancel {
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 10px 20px;
}
.btn-cancel:hover { color: var(--text-primary); }

.btn-convert {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--bg-base);
  background: var(--accent-gold);
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  cursor: pointer;
  transition: opacity 120ms;
}
.btn-convert:hover { opacity: 0.9; }
.btn-convert:disabled { opacity: 0.4; cursor: not-allowed; }

/* --- Responsive --- */
@media (max-width: 1024px) {
  .notes-grid { grid-template-columns: repeat(2, 1fr); padding: 24px 32px; }
  .notas-header { padding: 40px 32px 0; }
}

@media (max-width: 768px) {
  .notes-grid {
    grid-template-columns: 1fr;
    padding: 16px;
    gap: 12px;
  }
  .notas-header { padding: 48px 16px 0; }
  .header-top { gap: 12px; }
  .title { font-size: 24px; }
  .gold-line { width: 60px; }
  .filter-chip { display: none; }
  .header-actions {
    flex-wrap: wrap;
  }
  .btn-create {
    width: 40px;
    height: 40px;
    padding: 0;
    border-radius: 100%;
    justify-content: center;
  }
  .nota-card { height: auto; min-height: 120px; }
  .nota-footer { gap: 8px; }

  .btn-convert {
    font-size: 10px;
  }

  .editor-modal {
    width: 100%;
    height: 100%;
    max-width: 100%;
    border-radius: 0;
  }
  .editor-header {
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
  }
}
</style>
