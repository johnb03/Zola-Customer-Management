<script setup>
import { ref, computed } from 'vue'
import { subirMenus } from '../api.js'
import { notifyDataChanged } from '../store.js'
import { alerta } from '../composables/useAlert.js'
import { toErrorMessage } from '../utils/errors.js'

const emit = defineEmits(['subido'])

const fileInput = ref(null)
const open = ref(false)
const busy = ref(false)
const error = ref('')

// Archivos seleccionados (hojas del mismo menú) + nombre del menú editable.
const files = ref([])
const nombre = ref('')

// Estados del pipeline: 'subiendo' | 'procesando'
const fase = ref('')
const nombreActual = ref('')
const pct = ref(0)      // % de subida del total recibido

const textoProgreso = computed(() => {
  if (!busy.value || !fase.value) return ''
  if (fase.value === 'procesando') return 'Procesando texto…'
  return `Subiendo ${nombreActual.value}… ${pct.value}%`
})

const trigger = () => {
  if (busy.value) return
  error.value = ''
  fileInput.value?.click()
}

const onFile = (event) => {
  const seleccion = Array.from(event.target.files || [])
  event.target.value = ''
  if (!seleccion.length) return
  files.value = seleccion
  // Auto-completar el nombre del menú si el campo está vacío.
  if (!nombre.value.trim()) {
    nombre.value = seleccion[0].name.replace(/\.[^.]+$/, '')
  }
  error.value = ''
  open.value = true
}

const closeModal = () => {
  if (busy.value) return
  open.value = false
  files.value = []
  error.value = ''
}

const upload = async () => {
  if (!files.value.length || busy.value) return
  busy.value = true
  error.value = ''
  fase.value = 'subiendo'
  pct.value = 0
  try {
    const res = await subirMenus(
      files.value,
      nombre.value.trim(),
      (p) => {
        fase.value = p.fase === 'procesando' ? 'procesando' : 'subiendo'
        pct.value = p.pct
      },
    )
    notifyDataChanged()
    open.value = false
    files.value = []
    emit('subido', String(res.data?.archivo || '').replace(/\.json$/, ''))
  } catch (e) {
    const msg = toErrorMessage(e)
    console.error('subirMenus falló:', e)
    error.value = msg
    alerta({ titulo: 'Error', mensaje: `No se pudo subir el menú: ${msg}`, tipo: 'error' })
  } finally {
    busy.value = false
    fase.value = ''
    pct.value = 0
  }
}

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = Number(bytes)
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
</script>

<template>
  <button class="upload-btn" type="button" @click="trigger" :disabled="busy">
    <svg class="up-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M5 13.5v5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-5" />
    </svg>
    <span>{{ busy ? 'Subiendo…' : 'Subir menú(s)' }}</span>
  </button>

  <input ref="fileInput" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" multiple class="hidden-input"
    @change="onFile" />

  <div v-if="open" class="modal-overlay" @click.self="closeModal">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Subida de menú">
      <header class="modal-head">
        <h2 class="modal-title">Subir menú</h2>
        <button class="modal-close" type="button" aria-label="Cerrar" :disabled="busy" @click="closeModal">×</button>
      </header>

      <!-- Progreso de subida -->
      <template v-if="busy">
        <p class="modal-status">{{ textoProgreso }}</p>
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"
          :aria-valuenow="pct">
          <div class="progress-fill" :style="{ width: pct + '%' }"></div>
        </div>
      </template>

      <!-- Formulario: nombre + archivos -->
      <template v-else>
        <p v-if="error" class="modal-status error">{{ error }}</p>

        <label class="field-label" for="menu-nombre">Nombre del menú</label>
        <input id="menu-nombre" v-model="nombre" type="text" class="text-input"
          placeholder="Ej: La Parrilla 2" :disabled="busy" />

        <p v-if="files.length" class="file-note">
          {{ files.length }} hoja{{ files.length === 1 ? '' : 's' }} del mismo menú:
        </p>
        <ul v-if="files.length" class="file-list-upload">
          <li v-for="f in files" :key="f.name" class="file-row">
            <span class="file-row-name">{{ f.name }}</span>
            <span class="file-row-size">{{ formatBytes(f.size) }}</span>
          </li>
        </ul>
        <p v-else class="modal-status">Seleccioná una o varias hojas del menú del negocio.</p>

        <div class="modal-actions">
          <button type="button" class="btn-action" :disabled="!files.length" @click="upload">
            {{ files.length ? 'Subir y analizar' : 'Subir' }}
          </button>
          <button type="button" class="btn-ghost" :disabled="busy" @click="closeModal">Cancelar</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  border-radius: 10px;
  background: var(--accent-wine);
  color: var(--accent-gold);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: filter 120ms ease;
}

.upload-btn:hover {
  filter: brightness(1.1);
}

.upload-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  filter: none;
}

.up-icon {
  width: 18px;
  height: 18px;
}

.hidden-input {
  display: none;
}

.progress-track {
  height: 8px;
  border-radius: 999px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent-gold);
  transition: width 150ms ease;
}

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
  width: min(640px, 100%);
  max-height: 86vh;
  overflow: auto;
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

.modal-close:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.modal-status {
  margin: 8px 0;
  font-size: 15px;
  color: var(--text-secondary);
}

.modal-status.error {
  color: var(--status-danger);
}

.field-label {
  display: block;
  margin: 4px 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-gold);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.text-input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
  margin-bottom: 14px;
}

.text-input:focus {
  outline: none;
  border-color: var(--accent-gold);
}

.file-note {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.file-list-upload {
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.file-row:last-child {
  border-bottom: 0;
}

.file-row-name {
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.file-row-size {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.modal-actions {
  display: flex;
  gap: 10px;
}

.btn-action {
  padding: 8px 18px;
  border-radius: 8px;
  border: 1px solid var(--accent-gold);
  background: transparent;
  color: var(--accent-gold);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 120ms ease;
}

.btn-action:hover:not(:disabled) {
  background: rgba(196, 168, 105, 0.12);
}

.btn-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

.btn-ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
