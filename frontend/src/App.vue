<script setup>
import { ref, onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ConfigPanel from './components/ConfigPanel.vue'
import ConfirmModal from './components/ConfirmModal.vue'
import AlertModal from './components/AlertModal.vue'
import SetupScreen from './components/SetupScreen.vue'
import { cargarUsuario } from './store.js'
import { hasGeminiKey } from './gemini.js'

const ready = ref(hasGeminiKey())

onMounted(() => {
  cargarUsuario()
})

const onConfigured = () => {
  ready.value = true
}
</script>

<template>
  <!-- Setup screen on first launch -->
  <SetupScreen v-if="!ready" @configured="onConfigured" />

  <!-- Main app -->
  <div v-else class="app-shell">
    <Sidebar />
    <main class="main">
      <router-view />
    </main>
    <ConfirmModal />
    <AlertModal />
    <ConfigPanel />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}

.main {
  flex: 1;
  min-width: 0;
  padding: 32px 40px 48px;
}

@media (max-width: 768px) {
  .app-shell {
    display: block;
  }

  .main {
    padding: 20px 16px 96px;
  }
}
</style>
