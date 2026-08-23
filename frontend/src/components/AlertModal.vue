<script setup>
import { watch, onMounted, onUnmounted, nextTick, ref } from 'vue'
import { useAlertState, resolverAlerta } from '../composables/useAlert.js'

const state = useAlertState()
const okBtn = ref(null)
let timer = null
let startTime = 0
let paused = false
let remaining = 0

const iconos = {
  success: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
  error: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
  warning: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  info: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
}

function iniciarTimer() {
  if (!state.duracion) return
  remaining = state.duracion
  paused = false
  startTime = Date.now()
  timer = setInterval(() => {
    if (paused) return
    const elapsed = Date.now() - startTime
    remaining = state.duracion - elapsed
    if (remaining <= 0) {
      clearInterval(timer)
      timer = null
      resolverAlerta()
    }
  }, 50)
}

function pausarTimer() {
  if (!timer) return
  paused = true
  remaining = state.duracion - (Date.now() - startTime)
}

function reanudarTimer() {
  if (!timer || !paused) return
  paused = false
  startTime = Date.now() - (state.duracion - remaining)
}

function limpiarTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

// Autofocus al botón "Entendido" cuando se abre
watch(() => state.abierto, async (abierto) => {
  if (abierto) {
    await nextTick()
    okBtn.value?.focus()
    iniciarTimer()
  } else {
    limpiarTimer()
  }
})

// Tecla ESC cierra
const onKey = (e) => {
  if (e.key === 'Escape' && state.abierto) resolverAlerta()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  limpiarTimer()
})

// Click en backdrop
const onBackdrop = (e) => {
  if (e.target === e.currentTarget) resolverAlerta()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="state.abierto" class="modal-backdrop" @mousedown="onBackdrop">
        <div
          class="modal-card"
          role="alertdialog"
          aria-modal="true"
          @mouseenter="pausarTimer"
          @mouseleave="reanudarTimer"
        >
          <div class="modal-body">
            <span class="alert-icono" :class="`alert-icono--${state.tipo}`" aria-hidden="true" v-html="iconos[state.tipo]" />
            <div>
              <h3 v-if="state.titulo" class="modal-titulo">{{ state.titulo }}</h3>
              <p v-if="state.mensaje" class="modal-mensaje">{{ state.mensaje }}</p>
            </div>
          </div>
          <div class="modal-acciones">
            <button ref="okBtn" type="button" class="btn alert-btn" :class="`alert-btn--${state.tipo}`" @click="resolverAlerta">Entendido</button>
          </div>
          <div v-if="state.duracion" class="alert-progress">
            <div class="alert-progress-bar" :class="`alert-progress-bar--${state.tipo}`" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
}

.modal-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.modal-body {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 20px;
}

.alert-icono {
  flex-shrink: 0;
  line-height: 1;
}

.alert-icono--success { color: var(--status-success); }
.alert-icono--error { color: var(--status-danger); }
.alert-icono--warning { color: var(--status-warning); }
.alert-icono--info { color: var(--accent-gold); }

.modal-titulo {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.modal-mensaje {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.45;
}

.modal-acciones {
  display: flex;
  justify-content: flex-end;
}

.alert-btn {
  font-weight: 700;
  border: none;
  color: #fff;
}

.alert-btn--success { background: var(--status-success); }
.alert-btn--success:hover { filter: brightness(1.1); }

.alert-btn--error { background: var(--status-danger); }
.alert-btn--error:hover { filter: brightness(1.1); }

.alert-btn--warning { background: var(--status-warning); color: #15100D; }
.alert-btn--warning:hover { filter: brightness(1.08); }

.alert-btn--info { background: var(--accent-gold); color: #15100D; }
.alert-btn--info:hover { filter: brightness(1.08); }

/* Barra de progreso */
.alert-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
}

.alert-progress-bar {
  height: 100%;
  width: 100%;
  transform-origin: left;
  animation: alert-shrink linear forwards;
}

.alert-progress-bar--success { background: var(--status-success); }
.alert-progress-bar--error { background: var(--status-danger); }
.alert-progress-bar--warning { background: var(--status-warning); }
.alert-progress-bar--info { background: var(--accent-gold); }

@keyframes alert-shrink {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

/* Transición — misma que ConfirmModal */
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
</style>
