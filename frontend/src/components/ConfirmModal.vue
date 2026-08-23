<script setup>
import { watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useConfirmState, resolver } from '../composables/useConfirm.js'

const state = useConfirmState()
let noBtn = null

// Autofocus al botón "No" cuando se abre
watch(() => state.abierto, async (abierto) => {
  if (abierto) {
    await nextTick()
    noBtn?.focus()
  }
})

// Tecla ESC cierra
const onKey = (e) => {
  if (e.key === 'Escape' && state.abierto) resolver(false)
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

// Click en backdrop
const onBackdrop = (e) => {
  if (e.target === e.currentTarget) resolver(false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="state.abierto" class="modal-backdrop" @mousedown="onBackdrop">
        <div class="modal-card" role="alertdialog" aria-modal="true">
          <div class="modal-body">
            <span class="modal-icono" aria-hidden="true">⚠</span>
            <div>
              <h3 class="modal-titulo">{{ state.titulo }}</h3>
              <p v-if="state.mensaje" class="modal-mensaje">{{ state.mensaje }}</p>
            </div>
          </div>
          <div class="modal-acciones">
            <button ref="noBtn" type="button" class="btn btn-ghost" @click="resolver(false)">No</button>
            <button type="button" class="btn modal-btn-si" :class="`modal-btn-si--${state.tone}`" @click="resolver(true)">Sí</button>
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
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.modal-body {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 20px;
}

.modal-icono {
  font-size: 24px;
  line-height: 1;
  flex-shrink: 0;
  color: var(--accent-gold);
}

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
  gap: 10px;
  justify-content: flex-end;
}

.modal-btn-si {
  font-weight: 700;
}

.modal-btn-si--danger {
  background: var(--status-danger);
  color: #fff;
  border-color: var(--status-danger);
}

.modal-btn-si--danger:hover {
  filter: brightness(1.1);
}

.modal-btn-si--gold {
  background: var(--accent-gold);
  color: #15100D;
  border-color: var(--accent-gold);
}

.modal-btn-si--gold:hover {
  filter: brightness(1.08);
}

/* Transición */
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
