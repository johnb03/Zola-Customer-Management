<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  abierto: Boolean,
})

const emit = defineEmits(['close', 'crear'])

const form = ref(emptyForm())

function emptyForm() {
  return {
    Nombre: '',
    Telefono: '',
    Email: '',
    Zona: '',
    Tipo_Negocio: '',
    Direccion: '',
    Codigo: '',
    Notas: '',
  }
}

watch(() => props.abierto, (val) => {
  if (val) form.value = emptyForm()
})

const onBackdrop = (e) => {
  if (e.target === e.currentTarget) emit('close')
}

const onKey = (e) => {
  if (e.key === 'Escape' && props.abierto) emit('close')
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKey)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="abierto" class="modal-backdrop" @mousedown="onBackdrop">
        <div class="modal-card" role="dialog" aria-modal="true">
          <h3 class="modal-title">Crear nuevo cliente</h3>
          <hr class="firma-sm" />
          <form class="modal-form" @submit.prevent="emit('crear', { ...form })">
            <label class="field">
              <span class="field-label">Nombre <span class="req">*</span></span>
              <input v-model="form.Nombre" class="input" type="text" placeholder="Nombre del cliente" required />
            </label>
            <div class="field-row">
              <label class="field">
                <span class="field-label">Telefono</span>
                <input v-model="form.Telefono" class="input" type="tel" placeholder="809-000-0000" />
              </label>
              <label class="field">
                <span class="field-label">Email</span>
                <input v-model="form.Email" class="input" type="email" placeholder="correo@ejemplo.com" />
              </label>
            </div>
            <div class="field-row">
              <label class="field">
                <span class="field-label">Zona</span>
                <input v-model="form.Zona" class="input" type="text" placeholder="Zona" />
              </label>
              <label class="field">
                <span class="field-label">Tipo de negocio</span>
                <select v-model="form.Tipo_Negocio" class="input">
                  <option value="">Seleccionar…</option>
                  <option>Restaurant</option>
                  <option>Bar</option>
                  <option>Colmado</option>
                  <option>Cafeteria</option>
                  <option>Hotel</option>
                  <option>Panaderia</option>
                  <option>Otro</option>
                </select>
              </label>
            </div>
            <label class="field">
              <span class="field-label">Direccion</span>
              <input v-model="form.Direccion" class="input" type="text" placeholder="Direccion completa" />
            </label>
            <label class="field">
              <span class="field-label">Codigo</span>
              <input v-model="form.Codigo" class="input" type="text" placeholder="Codigo del cliente" />
            </label>
            <label class="field">
              <span class="field-label">Notas</span>
              <textarea v-model="form.Notas" class="input textarea" rows="2" placeholder="Notas sobre el cliente…"></textarea>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="emit('close')">Cancelar</button>
              <button type="submit" class="btn btn-gold" :disabled="!form.Nombre.trim()">Crear cliente</button>
            </div>
          </form>
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
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
}

.firma-sm {
  height: 1px;
  border: 0;
  background: linear-gradient(90deg, var(--accent-gold), rgba(201, 162, 39, 0) 100%);
  opacity: 0.5;
  margin: 0 0 16px;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.req {
  color: var(--status-danger);
}

.input {
  background: var(--bg-base);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: var(--accent-gold);
}

.textarea {
  resize: vertical;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}

.btn {
  font-family: inherit;
  cursor: pointer;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-weight: 500;
}

.btn-ghost:hover {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

.btn-gold {
  background: var(--accent-gold);
  color: #15100D;
  border: 1.5px solid var(--accent-gold);
  font-weight: 700;
  transition: filter 120ms ease;
}

.btn-gold:hover {
  filter: brightness(1.08);
}

.btn-gold:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Transition */
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

/* Bottom sheet on small screens */
@media (max-width: 480px) {
  .modal-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .modal-card {
    width: 100%;
    max-width: 100%;
    max-height: 92dvh;
    overflow-y: auto;
    border-radius: 20px 20px 0 0;
    margin: 0;
    animation: sheetUp 240ms ease;
  }

  .modal-form .input {
    min-height: 48px;
    font-size: 16px;
  }

  .field-label {
    font-size: 14px;
  }

  .modal-actions .btn {
    min-height: 48px;
    font-size: 16px;
  }

  @keyframes sheetUp {
    from { transform: translateY(40px); opacity: 0.4; }
    to { transform: translateY(0); opacity: 1; }
  }
}
</style>
