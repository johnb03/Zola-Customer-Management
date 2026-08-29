<script setup>
import { ref, computed, onMounted } from 'vue'
import { PROVIDERS, hasAgenteConfig, setAgenteConfig, getAgenteConfig, testAgenteKey } from '../agente.js'

const emit = defineEmits(['configured'])

const provider = ref('gemini')
const model = ref('')
const apiKey = ref('')
const baseUrl = ref('')
const testing = ref(false)
const error = ref('')
const showSetup = ref(false)

onMounted(() => {
  const config = getAgenteConfig()
  showSetup.value = !hasAgenteConfig()
  if (config.provider) provider.value = config.provider
  if (config.model) model.value = config.model
  else model.value = PROVIDERS[config.provider]?.models?.[0] || ''
})

const isCustom = computed(() => provider.value === 'custom')
const providerModels = computed(() => PROVIDERS[provider.value]?.models || [])

const providerLinks = {
  gemini: { text: 'Obtener key en Google AI Studio', url: 'https://aistudio.google.com/apikey' },
  claude: { text: 'Obtener key en console.anthropic.com', url: 'https://console.anthropic.com/settings/keys' },
  openai: { text: 'Obtener key en platform.openai.com', url: 'https://platform.openai.com/api-keys' },
  deepseek: { text: 'Obtener key en platform.deepseek.com', url: 'https://platform.deepseek.com/api_keys' },
}

const currentLink = computed(() => providerLinks[provider.value] || null)

const onProviderChange = () => {
  model.value = PROVIDERS[provider.value]?.models?.[0] || ''
  baseUrl.value = ''
  error.value = ''
}

const saveConfig = async () => {
  if (!apiKey.value.trim()) {
    error.value = 'Ingresa tu API key'
    return
  }
  if (!model.value.trim()) {
    error.value = 'Ingresa el nombre del modelo'
    return
  }
  if (isCustom.value && !baseUrl.value.trim()) {
    error.value = 'Ingresa la URL base del proveedor'
    return
  }

  testing.value = true
  error.value = ''

  setAgenteConfig({
    provider: provider.value,
    apiKey: apiKey.value.trim(),
    model: model.value.trim(),
    baseUrl: baseUrl.value.trim(),
  })

  const valid = await testAgenteKey()
  testing.value = false

  if (valid) {
    showSetup.value = false
    emit('configured')
  } else {
    error.value = 'API key inválida. Verifica que sea correcta.'
    setAgenteConfig({ apiKey: '' })
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
      <p class="setup-desc">Configurá tu agente de IA para empezar.</p>

      <!-- Provider -->
      <div class="setup-field">
        <label class="setup-label">Proveedor del agente</label>
        <select v-model="provider" class="setup-input" @change="onProviderChange">
          <option v-for="(p, key) in PROVIDERS" :key="key" :value="key">{{ p.name }}</option>
        </select>
      </div>

      <!-- Model -->
      <div class="setup-field">
        <label class="setup-label">Modelo</label>
        <select v-if="providerModels.length" v-model="model" class="setup-input">
          <option v-for="m in providerModels" :key="m" :value="m">{{ m }}</option>
        </select>
        <input v-else v-model="model" class="setup-input" placeholder="Nombre del modelo (ej: gpt-4o)" />
      </div>

      <!-- API Key -->
      <div class="setup-field">
        <label class="setup-label">API Key</label>
        <input
          v-model="apiKey"
          type="password"
          class="setup-input"
          placeholder="Tu key del proveedor..."
          @keyup.enter="saveConfig"
        />
      </div>

      <!-- Base URL (custom only) -->
      <div v-if="isCustom" class="setup-field">
        <label class="setup-label">Base URL</label>
        <input
          v-model="baseUrl"
          class="setup-input"
          placeholder="https://api.ejemplo.com"
        />
      </div>

      <p v-if="error" class="setup-error">{{ error }}</p>

      <button class="setup-btn" @click="saveConfig" :disabled="testing">
        {{ testing ? 'Verificando...' : 'Continuar' }}
      </button>

      <p v-if="currentLink" class="setup-hint">
        <a :href="currentLink.url" target="_blank" rel="noopener">{{ currentLink.text }}</a>
      </p>
    </div>
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
  margin-bottom: 16px;
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
</style>
