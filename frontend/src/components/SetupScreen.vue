<script setup>
import { ref, onMounted } from 'vue'
import { hasGeminiKey, setGeminiKey, testGeminiKey } from '../gemini.js'
import { db } from '../db.js'

const emit = defineEmits(['configured'])

const apiKey = ref('')
const testing = ref(false)
const error = ref('')
const showSetup = ref(false)

onMounted(async () => {
  // Show setup if no API key configured
  showSetup.value = !hasGeminiKey()
})

const saveKey = async () => {
  if (!apiKey.value.trim()) {
    error.value = 'Ingresa tu API key de Gemini'
    return
  }
  testing.value = true
  error.value = ''
  setGeminiKey(apiKey.value.trim())
  const valid = await testGeminiKey()
  testing.value = false
  if (valid) {
    showSetup.value = false
    emit('configured')
  } else {
    error.value = 'API key inválida. Verifica que sea correcta.'
    setGeminiKey('')
  }
}

// --- Data migration from server ---
const importando = ref(false)
const importError = ref('')
const importSuccess = ref('')

const importarDatos = async () => {
  importando.value = true
  importError.value = ''
  importSuccess.value = ''
  try {
    const res = await fetch('/api/estado')
    if (!res.ok) throw new Error('No se pudo conectar al servidor')
    const estado = await res.json()

    // Fetch all data from server
    const [clientes, visitas, notas, citas, cobros, usuario, catalogo] = await Promise.all([
      fetch('/api/clientes').then((r) => r.json()).catch(() => []),
      fetch('/api/visitas').then((r) => r.json()).catch(() => []),
      fetch('/api/notas').then((r) => r.json()).catch(() => []),
      fetch('/api/citas').then((r) => r.json()).catch(() => []),
      fetch('/api/cobros').then((r) => r.json()).catch(() => []),
      fetch('/api/usuario').then((r) => r.json()).catch(() => null),
      fetch('/api/catalogo').then((r) => r.json()).catch(() => null),
    ])

    // Import into IndexedDB
    const result = await db.importAll({
      clientes,
      visitas,
      notas,
      citas,
      cobros,
      usuario,
      catalogo,
    })

    importSuccess.value = `Importados: ${Object.entries(result).map(([k, v]) => `${k}: ${v}`).join(', ')}`
  } catch (e) {
    importError.value = e.message
  } finally {
    importando.value = false
  }
}
</script>

<template>
  <!-- Setup Screen (first launch) -->
  <div v-if="showSetup" class="setup-overlay">
    <div class="setup-card">
      <div class="setup-logo">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12h8" /><path d="M12 8v8" />
        </svg>
      </div>
      <h1 class="setup-title">Bienvenido a Zola</h1>
      <p class="setup-desc">Configurá tu API key de Gemini para empezar.</p>

      <div class="setup-field">
        <label class="setup-label">API Key de Google Gemini</label>
        <input
          v-model="apiKey"
          type="password"
          class="setup-input"
          placeholder="AIza..."
          @keyup.enter="saveKey"
        />
        <p v-if="error" class="setup-error">{{ error }}</p>
      </div>

      <button class="setup-btn" @click="saveKey" :disabled="testing">
        {{ testing ? 'Verificando...' : 'Continuar' }}
      </button>

      <p class="setup-hint">
        Conseguí tu key en
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>
      </p>
    </div>
  </div>

  <!-- Data migration dialog -->
  <div v-if="!showSetup" class="migrate-section">
    <button
      v-if="!importSuccess"
      class="migrate-btn"
      @click="importarDatos"
      :disabled="importando"
    >
      {{ importando ? 'Importando...' : 'Importar datos del servidor' }}
    </button>
    <p v-if="importSuccess" class="migrate-success">{{ importSuccess }}</p>
    <p v-if="importError" class="migrate-error">{{ importError }}</p>
  </div>
</template>

<style scoped>
.setup-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-base);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.setup-card {
  width: 400px;
  max-width: calc(100vw - 32px);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 40px 32px;
  text-align: center;
}

.setup-logo {
  color: var(--accent-gold);
  margin-bottom: 16px;
}

.setup-title {
  font-family: 'Satoshi', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.setup-desc {
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 24px;
}

.setup-field {
  text-align: left;
  margin-bottom: 20px;
}

.setup-label {
  font-family: 'Satoshi', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  display: block;
  margin-bottom: 6px;
}

.setup-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}
.setup-input:focus { border-color: var(--accent-gold); }

.setup-error {
  font-family: 'Satoshi', sans-serif;
  font-size: 12px;
  color: var(--status-danger);
  margin: 6px 0 0;
}

.setup-btn {
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  background: var(--accent-gold);
  border: none;
  color: var(--bg-base);
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 120ms;
}
.setup-btn:hover { opacity: 0.9; }
.setup-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.setup-hint {
  font-family: 'Satoshi', sans-serif;
  font-size: 12px;
  color: var(--text-secondary);
  margin: 16px 0 0;
}
.setup-hint a { color: var(--accent-gold); text-decoration: none; }

/* Migration section */
.migrate-section {
  padding: 16px 24px;
}

.migrate-btn {
  padding: 8px 16px;
  border-radius: 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: 'Satoshi', sans-serif;
  font-size: 13px;
  cursor: pointer;
  transition: color 120ms;
}
.migrate-btn:hover { color: var(--text-primary); border-color: var(--accent-gold); }
.migrate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.migrate-success {
  font-family: 'Satoshi', sans-serif;
  font-size: 13px;
  color: var(--status-success);
  margin: 8px 0 0;
}

.migrate-error {
  font-family: 'Satoshi', sans-serif;
  font-size: 13px;
  color: var(--status-danger);
  margin: 8px 0 0;
}
</style>
