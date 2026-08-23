<script setup>
import { ref, watch, nextTick } from 'vue'
import { usuario, showConfig, cargarUsuario, dataVersion } from '../store.js'
import { updateUsuario, subirFotoUsuario } from '../api.js'
import { alerta } from '../composables/useAlert.js'
import DatosView from '../views/DatosView.vue'

const activeTab = ref('datos-usuario')
const nombre = ref('')
const fotoPreview = ref(null)
const fotoFile = ref(null)
const guardando = ref(false)
const subiendoFoto = ref(false)
const panelRef = ref(null)

// Load user data when panel opens
watch(showConfig, async (open) => {
  if (open) {
    await cargarUsuario()
    nombre.value = usuario.value.nombre || ''
    fotoPreview.value = usuario.value.foto || null
    fotoFile.value = null
    activeTab.value = 'datos-usuario'
    await nextTick()
    panelRef.value?.focus()
  }
})

const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

const pickFoto = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/jpeg,image/png,image/webp,image/gif'
  input.onchange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    fotoFile.value = file
    fotoPreview.value = URL.createObjectURL(file)
  }
  input.click()
}

const guardar = async () => {
  guardando.value = true
  try {
    // Upload photo if changed
    if (fotoFile.value) {
      subiendoFoto.value = true
      const res = await subirFotoUsuario(fotoFile.value)
      fotoPreview.value = res.foto
      subiendoFoto.value = false
    }

    // Save name
    await updateUsuario({ nombre: nombre.value.trim() })
    await cargarUsuario()
    alerta({ mensaje: 'Datos guardados', tipo: 'success' })
    showConfig.value = false
  } catch (err) {
    alerta({ titulo: 'Error', mensaje: err.message, tipo: 'error' })
  } finally {
    guardando.value = false
  }
}

const close = () => {
  showConfig.value = false
}
</script>

<template>
  <Teleport to="body">
    <Transition name="config-panel">
      <div v-if="showConfig" class="config-overlay" @click.self="close">
        <div ref="panelRef" class="config-panel" tabindex="-1">
          <!-- Header -->
          <div class="config-header">
            <h2 class="config-title">Configuración</h2>
            <button class="config-close" @click="close" title="Cerrar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18"/>
                <path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>

          <!-- Tabs -->
          <div class="config-tabs">
            <button
              class="config-tab"
              :class="{ active: activeTab === 'datos-usuario' }"
              @click="activeTab = 'datos-usuario'"
            >
              Datos de usuario
            </button>
            <button
              class="config-tab"
              :class="{ active: activeTab === 'datos' }"
              @click="activeTab = 'datos'"
            >
              Datos
            </button>
          </div>
          <div class="config-tabs-separator"></div>

          <!-- Tab: Datos de usuario -->
          <div v-if="activeTab === 'datos-usuario'" class="config-body">
            <!-- Photo -->
            <div class="photo-section">
              <div class="photo-zone" @click="pickFoto">
                <img v-if="fotoPreview" :src="fotoPreview" alt="Foto" class="photo-preview" />
                <div v-else class="photo-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div class="photo-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
              </div>
              <button class="photo-btn" @click="pickFoto">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="photo-btn-icon">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                Cambiar foto
              </button>
            </div>

            <!-- Name field -->
            <div class="field-group">
              <label class="field-label">Nombre</label>
              <input
                v-model="nombre"
                type="text"
                class="field-input"
                placeholder="Tu nombre"
              />
            </div>

            <!-- Spacer -->
            <div class="config-spacer"></div>

            <!-- Save button -->
            <button class="save-btn" @click="guardar" :disabled="guardando">
              {{ guardando ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>

          <!-- Tab: Datos -->
          <div v-if="activeTab === 'datos'" class="config-body config-body-datos">
            <DatosView />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Overlay */
.config-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.4);
}

/* Panel */
.config-panel {
  width: 420px;
  height: 100%;
  background: var(--bg-elevated);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  outline: none;
  overflow: hidden;
}

/* Header */
.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
}

.config-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.config-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  transition: color 120ms ease, background 120ms ease;
  padding: 0;
}

.config-close svg {
  width: 18px;
  height: 18px;
}

.config-close:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

/* Tabs */
.config-tabs {
  display: flex;
  gap: 24px;
  padding: 0 24px;
}

.config-tab {
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 8px 0;
  position: relative;
  transition: color 120ms ease;
}

.config-tab.active {
  color: var(--text-primary);
  font-weight: 600;
}

.config-tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent-gold);
  border-radius: 1px;
}

.config-tabs-separator {
  height: 1px;
  background: var(--border);
  margin-top: 0;
}

/* Body */
.config-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.config-body-datos {
  padding: 0;
}

/* Photo section */
.photo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.photo-zone {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: #5C4F3F;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.photo-zone svg {
  color: #9C8B72;
}

.photo-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-placeholder svg {
  width: 40px;
  height: 40px;
}

.photo-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 2px solid var(--accent-gold);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-gold);
}

.photo-badge svg {
  width: 14px;
  height: 14px;
  color: var(--accent-gold);
}

.photo-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--accent-gold);
  border-radius: 8px;
  background: transparent;
  color: var(--accent-gold);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 8px 16px;
  transition: background 120ms ease;
}

.photo-btn:hover {
  background: rgba(201, 162, 39, 0.1);
}

.photo-btn-icon {
  width: 16px;
  height: 16px;
}

/* Field group */
.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.3px;
  color: var(--text-secondary);
}

.field-input {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 400;
  color: var(--text-primary);
  outline: none;
  transition: border-color 120ms ease;
}

.field-input:focus {
  border-color: var(--accent-gold);
}

.field-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.6;
}

/* Spacer */
.config-spacer {
  flex: 1;
}

/* Save button */
.save-btn {
  width: auto;
  align-self: flex-end;
  padding: 10px 28px;
  border-radius: 8px;
  border: none;
  background: var(--accent-gold);
  color: var(--bg-base);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 120ms ease;
}

.save-btn:hover {
  opacity: 0.9;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Transition */
.config-panel-enter-active,
.config-panel-leave-active {
  transition: opacity 200ms ease;
}

.config-panel-enter-active .config-panel,
.config-panel-leave-active .config-panel {
  transition: transform 250ms ease;
}

.config-panel-enter-from,
.config-panel-leave-to {
  opacity: 0;
}

.config-panel-enter-from .config-panel {
  transform: translateX(100%);
}

.config-panel-leave-to .config-panel {
  transform: translateX(100%);
}

/* Mobile */
@media (max-width: 768px) {
  .config-overlay {
    justify-content: center;
  }

  .config-panel {
    width: 100%;
    height: 100%;
  }

  .config-tabs {
    gap: 24px;
  }

  .config-tab {
    font-size: 13px;
  }

  .photo-btn {
    border-radius: 8px;
    padding: 10px 20px;
  }

  .save-btn {
    width: 100%;
    padding: 14px;
    text-align: center;
  }
}
</style>
