<script setup>
import { onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ConfigPanel from './components/ConfigPanel.vue'
import ConfirmModal from './components/ConfirmModal.vue'
import AlertModal from './components/AlertModal.vue'
import { cargarUsuario } from './store.js'

onMounted(() => {
  cargarUsuario()
})
</script>

<template>
  <div class="app-shell">
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
