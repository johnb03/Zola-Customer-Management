import { createApp } from 'vue'
import './styles/tokens.css'
import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')

// Recargar automáticamente cuando el service worker nuevo toma control
// (evita que la app siga usando un bundle viejo en memoria tras un build).
let refreshing = false
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (!refreshing) {
    refreshing = true
    location.reload()
  }
})
