<script setup>
import { ref, onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ConfigPanel from './components/ConfigPanel.vue'
import ConfirmModal from './components/ConfirmModal.vue'
import AlertModal from './components/AlertModal.vue'
import SetupScreen from './components/SetupScreen.vue'
import { cargarUsuario } from './store.js'
import { hasAgenteConfig } from './agente.js'

const ready = ref(hasAgenteConfig())

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
  min-height: 100dvh;
}

.main {
  flex: 1;
  min-width: 0;
  padding: 32px 40px 48px;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .app-shell {
    display: block;
  }

  .main {
    padding: 20px 16px calc(84px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
