<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { convertirNota } from '../api'

const props = defineProps({
  nota: { type: Object, required: true },
})

const emit = defineEmits(['done', 'cancel'])

const pasos = [
  { id: 'extraer', label: 'Extrayendo visitas con agente IA', icon: 'sparkle' },
  { id: 'validar', label: 'Validando datos', icon: 'check' },
  { id: 'listo', label: 'Listo para revisar', icon: 'done' },
]

const pasoActivo = ref(0)
const pasosCompletados = ref([])
const abortado = ref(false)
let timerIds = []

const esperar = (ms) => new Promise((resolve) => {
  const id = setTimeout(resolve, ms)
  timerIds.push(id)
})

onMounted(async () => {
  try {
    // Paso 1: Extraer visitas con Gemini (real)
    pasoActivo.value = 0
    await esperar(800) // brief pause so user sees the step
    if (abortado.value) return

    const resultado = await convertirNota(props.nota.ID_Nota)
    pasosCompletados.value.push('extraer')
    await esperar(600)
    if (abortado.value) return

    if (!resultado.visitas || resultado.visitas.length === 0) {
      emit('done', { visitas: [], error: 'El agente no pudo identificar visitas en esta nota.' })
      return
    }

    // Paso 2: Validar datos (local)
    pasoActivo.value = 1
    await esperar(1000)
    if (abortado.value) return

    const visitasValidas = resultado.visitas.filter(
      (v) => String(v.establecimiento || '').trim() !== ''
    )
    pasosCompletados.value.push('validar')
    await esperar(500)
    if (abortado.value) return

    // Paso 3: Listo
    pasoActivo.value = 2
    await esperar(800)
    pasosCompletados.value.push('listo')
    await esperar(400)

    emit('done', { visitas: visitasValidas })
  } catch (e) {
    emit('done', { visitas: [], error: e.message })
  }
})

onBeforeUnmount(() => {
  abortado.value = true
  timerIds.forEach(clearTimeout)
  timerIds = []
})

const cancelar = () => {
  abortado.value = true
  timerIds.forEach(clearTimeout)
  timerIds = []
  emit('cancel')
}
</script>

<template>
  <div class="flow-overlay">
    <div class="flow-container">
      <!-- X close -->
      <button class="flow-close" @click="cancelar" title="Cancelar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </svg>
      </button>

      <!-- Title -->
      <h2 class="flow-title">Convirtiendo nota a reporte</h2>
      <p class="flow-subtitle">{{ nota.Fecha }}</p>

      <!-- Timeline -->
      <div class="timeline">
        <div
          v-for="(paso, idx) in pasos"
          :key="paso.id"
          class="timeline-step"
          :class="{
            completed: pasosCompletados.includes(paso.id),
            active: pasoActivo === idx && !pasosCompletados.includes(paso.id),
          }"
        >
          <!-- Circle -->
          <div class="step-circle">
            <!-- Done check -->
            <svg v-if="pasosCompletados.includes(paso.id)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <!-- Active spinner -->
            <div v-else-if="pasoActivo === idx && !pasosCompletados.includes(paso.id)" class="spinner"></div>
            <!-- Pending dot -->
            <div v-else class="pending-dot"></div>
          </div>

          <!-- Line (not on last) -->
          <div v-if="idx < pasos.length - 1" class="step-line">
            <div
              class="step-line-fill"
              :class="{ filled: pasosCompletados.includes(paso.id) }"
            ></div>
          </div>

          <!-- Label -->
          <span class="step-label">{{ paso.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flow-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.flow-container {
  width: 420px;
  max-width: calc(100vw - 32px);
  position: relative;
  text-align: center;
}

.flow-close {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 120ms;
  z-index: 1;
}
.flow-close:hover { color: var(--text-primary); }

.flow-title {
  font-family: 'Satoshi', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
}

.flow-subtitle {
  font-family: 'Satoshi', sans-serif;
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary);
  margin: 0 0 36px;
}

/* Timeline */
.timeline {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-left: 20px;
}

.timeline-step {
  display: flex;
  align-items: center;
  position: relative;
  min-height: 56px;
}

.step-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  background: rgba(201, 162, 39, 0.1);
  border: 2px solid rgba(201, 162, 39, 0.2);
  transition: all 400ms ease;
}

.timeline-step.active .step-circle {
  background: linear-gradient(135deg, #C9A227, #A89A85);
  border-color: transparent;
  box-shadow: 0 0 20px rgba(201, 162, 39, 0.3);
}

.timeline-step.completed .step-circle {
  background: var(--status-success);
  border-color: transparent;
}

.pending-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(168, 154, 133, 0.3);
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Line between circles */
.step-line {
  position: absolute;
  left: 39px;
  top: 40px;
  width: 2px;
  height: 16px;
  background: rgba(201, 162, 39, 0.15);
  border-radius: 1px;
  overflow: hidden;
}

.step-line-fill {
  width: 100%;
  height: 0%;
  background: linear-gradient(180deg, #C9A227, #A89A85);
  border-radius: 1px;
  transition: height 500ms ease;
}

.step-line-fill.filled {
  height: 100%;
}

/* Label */
.step-label {
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: var(--text-secondary);
  margin-left: 16px;
  transition: color 300ms ease;
}

.timeline-step.active .step-label {
  color: var(--accent-gold);
  font-weight: 500;
}

.timeline-step.completed .step-label {
  color: var(--status-success);
}
</style>
