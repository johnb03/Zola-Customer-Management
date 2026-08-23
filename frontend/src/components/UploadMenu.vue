<script setup>
import { ref } from 'vue'
import { subirMenu } from '../api.js'
import { notifyDataChanged } from '../store.js'

const fileInput = ref(null)
const open = ref(false)
const busy = ref(false)
const error = ref('')
const result = ref(null)

const trigger = () => {
  error.value = ''
  result.value = null
  fileInput.value?.click()
}

const onFile = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  open.value = true
  busy.value = true
  error.value = ''
  result.value = null
  try {
    result.value = await subirMenu(file)
    notifyDataChanged()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <button class="upload-btn" type="button" @click="trigger">
    <svg class="up-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M5 13.5v5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-5" />
    </svg>
    <span>Subir menú</span>
  </button>

  <input ref="fileInput" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" class="hidden-input"
    @change="onFile" />

  <div v-if="open" class="modal-overlay" @click.self="open = false">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Resultado de subida">
      <header class="modal-head">
        <h2 class="modal-title">Subir menú</h2>
        <button class="modal-close" type="button" aria-label="Cerrar" @click="open = false">×</button>
      </header>

      <p v-if="busy" class="modal-status">Extrayendo texto del documento…</p>

      <p v-else-if="error" class="modal-status error">{{ error }}</p>

      <template v-else-if="result">
        <div class="ok-badge">Documento procesado</div>
        <dl class="result-meta">
          <div><dt>Archivo</dt><dd class="num">{{ result.archivo }}</dd></div>
          <div><dt>Método</dt><dd>{{ result.extraction_method }}</dd></div>
          <div><dt>Líneas extraídas</dt><dd class="num">{{ result.lineas }}</dd></div>
          <div><dt>JSON</dt><dd class="num">{{ result.dataJson }}</dd></div>
        </dl>
        <pre class="preview">{{ result.texto }}</pre>
        <p class="hint">El análisis con opencode se corre por ahora en la terminal:
          <code>./scripts/run-analysis.sh menus/{{ result.archivo }}</code></p>
      </template>

      <template v-else>
        <p class="modal-status">Seleccioná el menú, carta o listado del negocio.</p>
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

.up-icon {
  width: 18px;
  height: 18px;
}

.hidden-input {
  display: none;
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

.modal-status {
  margin: 8px 0;
  font-size: 15px;
  color: var(--text-secondary);
}

.modal-status.error {
  color: var(--status-danger);
}

.ok-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(107, 143, 71, 0.16);
  color: var(--status-success);
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 12px;
}

.result-meta {
  margin: 0 0 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 20px;
}

.result-meta dt {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-gold);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.result-meta dd {
  margin: 1px 0 0;
  font-size: 14px;
}

.preview {
  margin: 0 0 12px;
  max-height: 260px;
  overflow: auto;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.hint code {
  color: var(--accent-gold);
}
</style>
