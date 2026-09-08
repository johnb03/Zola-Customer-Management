<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { usuario, showConfig, cargarUsuario } from '../store.js'
import { updateUsuario, subirFotoUsuario, exportarDatos, importarDatos } from '../api.js'
import { alerta } from '../composables/useAlert.js'
import { confirmar } from '../composables/useConfirm.js'
import DatosView from '../views/DatosView.vue'
import { PROVIDERS, getAgenteConfig, setAgenteConfig, testAgenteKey } from '../agente.js'
import { resetAllData } from '../db.js'
import { hoyLocal } from '../utils/fechas.js'

const activeTab = ref('datos-usuario')
const panelRef = ref(null)

// ── User data ──────────────────────────────
const nombre = ref('')
const fotoPreview = ref(null)
const fotoFile = ref(null)
const guardando = ref(false)

// ── Agente data ────────────────────────────
const agProvider = ref('gemini')
const agModel = ref('')
const agApiKey = ref('')
const agBaseUrl = ref('')
const agTesting = ref(false)
const agResult = ref('') // 'ok' | 'error' | ''

const isCustom = computed(() => agProvider.value === 'custom')
const providerModels = computed(() => PROVIDERS[agProvider.value]?.models || [])

const providerLinks = {
  gemini: { text: 'Google AI Studio', url: 'https://aistudio.google.com/apikey' },
  claude: { text: 'console.anthropic.com', url: 'https://console.anthropic.com/settings/keys' },
  openai: { text: 'platform.openai.com', url: 'https://platform.openai.com/api-keys' },
  deepseek: { text: 'platform.deepseek.com', url: 'https://platform.deepseek.com/api_keys' },
}
const currentLink = computed(() => providerLinks[agProvider.value] || null)

// ── Watch panel open ───────────────────────
watch(showConfig, async (open) => {
  if (open) {
    await cargarUsuario()
    nombre.value = usuario.value.nombre || ''
    fotoPreview.value = usuario.value.foto || null
    fotoFile.value = null
    activeTab.value = 'datos-usuario'
    agResult.value = ''
    loadAgenteConfig()
    await nextTick()
    panelRef.value?.focus()
  }
})

const loadAgenteConfig = () => {
  const cfg = getAgenteConfig()
  agProvider.value = cfg.provider || 'gemini'
  agModel.value = cfg.model || PROVIDERS[cfg.provider]?.models?.[0] || ''
  agApiKey.value = cfg.apiKey || ''
  agBaseUrl.value = cfg.baseUrl || ''
}

const onProviderChange = () => {
  agModel.value = PROVIDERS[agProvider.value]?.models?.[0] || ''
  agBaseUrl.value = ''
  agResult.value = ''
}

// ── User actions ───────────────────────────
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
    if (fotoFile.value) {
      const res = await subirFotoUsuario(fotoFile.value)
      fotoPreview.value = res.foto
    }
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

// ── Agente actions ─────────────────────────
const guardarAgente = async () => {
  if (!agApiKey.value.trim()) {
    agResult.value = 'error'
    return
  }
  if (!agModel.value.trim()) {
    agResult.value = 'error'
    return
  }
  if (isCustom.value && !agBaseUrl.value.trim()) {
    agResult.value = 'error'
    return
  }

  agTesting.value = true
  agResult.value = ''

  setAgenteConfig({
    provider: agProvider.value,
    apiKey: agApiKey.value.trim(),
    model: agModel.value.trim(),
    baseUrl: agBaseUrl.value.trim(),
  })

  const valid = await testAgenteKey()
  agTesting.value = false
  agResult.value = valid ? 'ok' : 'error'

  if (!valid) {
    alerta({ titulo: 'Error', mensaje: 'API key inválida. Verificá que sea correcta.', tipo: 'error' })
  } else {
    alerta({ mensaje: 'Agente configurado correctamente', tipo: 'success' })
  }
}

// ── Reset data ───────────────────────────
const limpiarDatos = async () => {
  const ok = await confirmar({
    titulo: 'Limpiar todos los datos',
    mensaje: 'Esto eliminará TODOS los datos de la app: clientes, visitas, notas, citas, catálogo, plantillas y configuración. Esta acción no se puede deshacer.',
    tone: 'danger',
  })
  if (!ok) return
  await resetAllData()
}

// ── Export/Import de datos (backup portátil JSON) ────────────────
const exportando = ref(false)

const exportarDatosClick = async () => {
  exportando.value = true
  try {
    const backup = await exportarDatos()
    const json = JSON.stringify(backup, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const fecha = hoyLocal()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zola-backup-${fecha}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    alerta({ mensaje: 'Backup exportado.', tipo: 'success' })
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: `No se pudo exportar: ${e.message}`, tipo: 'error' })
  } finally {
    exportando.value = false
  }
}

const importFileInput = ref(null)
const importandoDatosClick = () => {
  importFileInput.value?.click()
}

const onImportFile = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const ok = await confirmar({
    titulo: 'Importar datos',
    mensaje: 'Esto REEMPLAZARÁ todos los datos locales (clientes, visitas, notas, citas, catálogo, menús, reportes, plantillas y configuración) con el contenido del backup. Esta acción no se puede deshacer.',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await importarDatos(file)
    await cargarUsuario()
    alerta({ mensaje: 'Datos restaurados desde el backup.', tipo: 'success' })
  } catch (e) {
    alerta({ titulo: 'Error', mensaje: `No se pudo importar: ${e.message}`, tipo: 'error' })
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
              Usuario
            </button>
            <button
              class="config-tab"
              :class="{ active: activeTab === 'datos' }"
              @click="activeTab = 'datos'"
            >
              Datos
            </button>
            <button
              class="config-tab"
              :class="{ active: activeTab === 'agente' }"
              @click="activeTab = 'agente'"
            >
              Agente
            </button>
          </div>
          <div class="config-tabs-sep"></div>

          <!-- Tab: Usuario -->
          <div v-if="activeTab === 'datos-usuario'" class="config-body">
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
              <button class="photo-btn" @click="pickFoto">Cambiar foto</button>
            </div>

            <div class="field-group">
              <label class="field-label">Nombre</label>
              <input v-model="nombre" type="text" class="field-input" placeholder="Tu nombre" />
            </div>

            <div class="config-spacer"></div>

            <button class="save-btn" @click="guardar" :disabled="guardando">
              {{ guardando ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>

          <!-- Tab: Datos -->
          <div v-if="activeTab === 'datos'" class="config-body config-body-datos">
            <DatosView />
            <div class="backup-section">
              <div class="backup-actions">
                <button class="backup-btn" :disabled="exportando" @click="exportarDatosClick">
                  {{ exportando ? 'Exportando…' : 'Exportar datos' }}
                </button>
                <button class="backup-btn" @click="importandoDatosClick">Importar datos</button>
                <input ref="importFileInput" type="file" accept=".json,application/json" class="hidden-input" @change="onImportFile" />
              </div>
              <p class="backup-hint">Descarga una copia de todos tus datos, o restaura desde un backup (reemplaza todo lo local).</p>
            </div>
            <div class="reset-section">
              <div class="reset-divider"></div>
              <button class="reset-btn" @click="limpiarDatos">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
                Limpiar todos los datos
              </button>
              <p class="reset-hint">Elimina clientes, visitas, notas, citas, catálogo, plantillas y configuración.</p>
            </div>
          </div>

          <!-- Tab: Agente -->
          <div v-if="activeTab === 'agente'" class="config-body">
            <!-- Estado actual -->
            <div class="agente-status">
              <div class="agente-status-dot" :class="agApiKey ? 'active' : 'inactive'"></div>
              <span class="agente-status-text">
                {{ agApiKey ? `${PROVIDERS[agProvider]?.name || agProvider} — ${agModel}` : 'Sin configurar' }}
              </span>
            </div>

            <!-- Proveedor -->
            <div class="field-group">
              <label class="field-label">Proveedor</label>
              <select v-model="agProvider" class="field-input field-select" @change="onProviderChange">
                <option v-for="(p, key) in PROVIDERS" :key="key" :value="key">{{ p.name }}</option>
              </select>
            </div>

            <!-- Modelo -->
            <div class="field-group">
              <label class="field-label">Modelo</label>
              <select v-if="providerModels.length" v-model="agModel" class="field-input field-select">
                <option v-for="m in providerModels" :key="m" :value="m">{{ m }}</option>
              </select>
              <input v-else v-model="agModel" class="field-input" placeholder="Nombre del modelo" />
            </div>

            <!-- API Key -->
            <div class="field-group">
              <label class="field-label">API Key</label>
              <input
                v-model="agApiKey"
                type="password"
                class="field-input"
                placeholder="Tu key del proveedor..."
              />
            </div>

            <!-- Base URL (custom only) -->
            <div v-if="isCustom" class="field-group">
              <label class="field-label">Base URL</label>
              <input v-model="agBaseUrl" class="field-input" placeholder="https://api.ejemplo.com" />
            </div>

            <!-- Link obtener key -->
            <p v-if="currentLink" class="agente-link">
              <a :href="currentLink.url" target="_blank" rel="noopener">Obtener key en {{ currentLink.text }}</a>
            </p>

            <div class="config-spacer"></div>

            <!-- Guardar + verificar -->
            <button class="save-btn" @click="guardarAgente" :disabled="agTesting">
              {{ agTesting ? 'Verificando...' : 'Guardar y verificar' }}
            </button>
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
  gap: 0;
  padding: 0 24px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.config-tab {
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 10px 12px;
  position: relative;
  white-space: nowrap;
  transition: color 120ms ease;
}

.config-tab:first-child {
  padding-left: 0;
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

.config-tabs-sep {
  height: 1px;
  background: var(--border);
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

/* Reset section */
.reset-section {
  padding: 24px;
}

/* Backup section (export/import) */
.backup-section {
  padding: 0 24px;
}

.backup-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.backup-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-family: 'Satoshi', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 120ms, color 120ms;
  flex: 1;
  min-width: 120px;
}

.backup-btn:hover:not(:disabled) {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

.backup-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.backup-hint {
  font-family: 'Satoshi', sans-serif;
  font-size: 12px;
  color: var(--text-secondary);
  margin: 8px 0 0;
  line-height: 1.4;
}

.hidden-input {
  display: none;
}

.reset-divider {
  height: 1px;
  background: var(--border);
  margin-bottom: 24px;
}

.reset-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  border: 1px solid var(--status-danger);
  border-radius: 8px;
  background: rgba(168, 67, 58, 0.08);
  color: var(--status-danger);
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms;
}

.reset-btn:hover {
  background: rgba(168, 67, 58, 0.16);
}

.reset-hint {
  font-family: 'Satoshi', sans-serif;
  font-size: 12px;
  color: var(--text-secondary);
  margin: 8px 0 0;
  line-height: 1.4;
}

/* Photo */
.photo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.photo-zone {
  width: 88px;
  height: 88px;
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
  width: 36px;
  height: 36px;
}

.photo-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 2px solid var(--accent-gold);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-gold);
}

.photo-badge svg {
  width: 13px;
  height: 13px;
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
  padding: 7px 14px;
  transition: background 120ms ease;
}

.photo-btn:hover {
  background: rgba(201, 162, 39, 0.1);
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
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 400;
  color: var(--text-primary);
  outline: none;
  transition: border-color 120ms ease;
  width: 100%;
  box-sizing: border-box;
}

.field-input:focus {
  border-color: var(--accent-gold);
}

.field-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.6;
}

.field-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23A89A85' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
  cursor: pointer;
}

/* Agente status */
.agente-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  margin-bottom: 20px;
}

.agente-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.agente-status-dot.active {
  background: var(--status-success);
}

.agente-status-dot.inactive {
  background: var(--text-secondary);
  opacity: 0.4;
}

.agente-status-text {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Agente link */
.agente-link {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

.agente-link a {
  color: var(--accent-gold);
  text-decoration: none;
}

.agente-link a:hover {
  text-decoration: underline;
}

/* Spacer */
.config-spacer {
  flex: 1;
}

/* Save button */
.save-btn {
  width: auto;
  align-self: flex-end;
  padding: 10px 24px;
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
    padding: 0 16px;
    gap: 0;
  }

  .config-tab {
    padding: 10px 10px;
    font-size: 13px;
  }

  .config-body {
    padding: 20px 16px;
  }

  .save-btn {
    width: 100%;
    padding: 12px;
    text-align: center;
  }
}

/* Bottom sheet on small screens */
@media (max-width: 480px) {
  .config-overlay {
    justify-content: flex-end;
    align-items: flex-end;
  }

  .config-panel {
    width: 100%;
    height: 100%;
    max-height: 92dvh;
    border-left: none;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    animation: configSheetUp 240ms ease;
  }

  .config-tab {
    min-height: 48px;
  }

  .config-close {
    width: 40px;
    height: 40px;
  }

  .field-input,
  .photo-btn,
  .backup-btn,
  .reset-btn,
  .save-btn {
    min-height: 48px;
    font-size: 15px;
  }

  @keyframes configSheetUp {
    from { transform: translateY(40px); opacity: 0.4; }
    to { transform: translateY(0); opacity: 1; }
  }
}
</style>
