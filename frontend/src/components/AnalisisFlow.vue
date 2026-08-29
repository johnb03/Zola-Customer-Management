<script setup>
import { ref, watch } from 'vue'
import { ejecutarAnalisisMenu } from '../analisis.js'
import { guardarDocxComo } from '../api.js'

const props = defineProps({
  menus: { type: Array, default: () => [] }, // nombres de data-json sin extensión
  open: { type: Boolean, default: false },   // v-model:open
})
const emit = defineEmits(['close', 'done'])

// Estados: 'espera' | 'analizando' | 'listo'
const fase = ref('')
const faseTexto = ref('')
const resultados = ref([]) // { nombre, texto, md, docx } | { nombre, error }
const guardandoDocx = ref('')
const docxFeedback = ref({}) // nombre -> 'saved' | 'fallback' | 'cancel'
const cerrado = ref(false)
let runToken = 0 // descarta una corrida si arrancó otra más nueva

const resetear = () => {
  fase.value = ''
  faseTexto.value = ''
  resultados.value = []
  guardandoDocx.value = ''
  docxFeedback.value = {}
}

const arrancar = async () => {
  resetear()
  if (!props.menus || props.menus.length === 0) return
  cerrado.value = false
  const token = ++runToken

  // Pantalla de espera ~0.8s
  fase.value = 'espera'
  faseTexto.value = 'En un momento tu análisis estará listo…'
  await new Promise((r) => setTimeout(r, 800))
  if (token !== runToken || cerrado.value || props.open !== true) return

  // Analizar cada menú en orden
  fase.value = 'analizando'
  const total = props.menus.length
  let ok = 0
  let errors = 0
  for (let i = 0; i < total; i++) {
    if (token !== runToken || cerrado.value) return
    const name = props.menus[i]
    faseTexto.value = `Generando estrategia de ${name} (${i + 1} de ${total})…`
    try {
      const res = await ejecutarAnalisisMenu(name)
      resultados.value.push({ nombre: name, texto: res.texto, md: res.md, docx: res.docx })
      ok++
    } catch (e) {
      resultados.value.push({ nombre: name, error: e.message })
      errors++
    }
  }

  if (token !== runToken || cerrado.value) return
  fase.value = 'listo'
  faseTexto.value = 'Tu análisis está listo'
  emit('done', { ok, errors })
}

watch(
  () => props.menus,
  () => {
    if (props.open) arrancar()
  },
)
watch(
  () => props.open,
  (v) => {
    if (v) arrancar()
  },
)

const cerrar = () => {
  if (fase.value === 'analizando') return
  cerrado.value = true
  emit('close')
}

const guardarDocx = async (res) => {
  if (!res.docx) return
  guardandoDocx.value = res.docx
  try {
    const resultado = await guardarDocxComo(res.docx)
    docxFeedback.value = { ...docxFeedback.value, [res.nombre]: resultado }
  } finally {
    guardandoDocx.value = ''
  }
}

const preview = (texto) => String(texto || '').slice(0, 200)
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="fase !== 'analizando' && cerrar()">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Análisis del menú">
      <header class="modal-head">
        <h2 class="modal-title">Análisis del menú</h2>
        <button class="modal-close" type="button" aria-label="Cerrar" :disabled="fase === 'analizando'" @click="cerrar">×</button>
      </header>

      <!-- Espera -->
      <template v-if="fase === 'espera'">
        <p class="modal-text">{{ faseTexto }}</p>
      </template>

      <!-- Analizando -->
      <template v-else-if="fase === 'analizando'">
        <p class="modal-text">{{ faseTexto }}</p>
        <p class="progress-hint">Analizando… puede tomar unos segundos</p>
      </template>

      <!-- Listo -->
      <template v-else-if="fase === 'listo'">
        <div class="ready-badge">Tu análisis está listo</div>
        <div v-for="res in resultados" :key="res.nombre" class="result-card">
          <template v-if="res.texto">
            <div class="result-head">
              <span class="ok-badge">Estrategia generada</span>
              <code class="inline-code">{{ res.nombre }}</code>
            </div>
            <pre class="preview">{{ preview(res.texto) }}</pre>
            <div class="docx-row">
              <button type="button" class="btn-action" :disabled="guardandoDocx === res.docx || !res.docx" @click="guardarDocx(res)">
                {{ guardandoDocx === res.docx ? 'Guardando…' : 'Guardar .docx' }}
              </button>
              <span v-if="docxFeedback[res.nombre] === 'saved'" class="docx-feedback saved">Guardado ✓</span>
              <span v-else-if="docxFeedback[res.nombre] === 'fallback'" class="docx-feedback">Descarga iniciada</span>
            </div>
          </template>
          <template v-else>
            <div class="result-head">
              <span class="err-badge">Error del análisis: {{ res.error }}</span>
            </div>
          </template>
        </div>
      </template>

      <!-- Sin menús -->
      <template v-else-if="!fase">
        <p class="modal-text">No hay menús para analizar.</p>
      </template>

      <div class="modal-actions">
        <button type="button" class="btn-ghost" :disabled="fase === 'analizando'" @click="cerrar">Cerrar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Modal compartido (mismos estilos que DatosView) ── */
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
  margin-top: 14px;
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

.btn-ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ready-badge {
  display: inline-block;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(107, 143, 71, 0.16);
  color: var(--status-success);
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 14px;
}

.ok-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(107, 143, 71, 0.16);
  color: var(--status-success);
  font-size: 12px;
  font-weight: 700;
}

.err-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(168, 67, 58, 0.16);
  color: var(--status-danger);
  font-size: 12px;
  font-weight: 700;
}

.result-card {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.result-card:last-child {
  border-bottom: 0;
  margin-bottom: 0;
  padding-bottom: 0;
}

.result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
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

.docx-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.docx-feedback {
  font-size: 13px;
  color: var(--text-secondary);
}

.docx-feedback.saved {
  color: var(--status-success);
}

.progress-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
