import { reactive } from 'vue'

// Estado compartido singleton — App.vue monta el modal, cualquier vista llama confirmar().
const state = reactive({
  abierto: false,
  titulo: '',
  mensaje: '',
  tone: 'danger', // 'danger' | 'gold'
  _resolve: null,
})

let currentResolve = null

export function confirmar({ titulo = '¿Estás seguro?', mensaje = '', tone = 'danger' } = {}) {
  return new Promise((resolve) => {
    state.titulo = titulo
    state.mensaje = mensaje
    state.tone = tone
    currentResolve = resolve
    state.abierto = true
  })
}

export function resolver(valor) {
  state.abierto = false
  if (currentResolve) currentResolve(valor)
  currentResolve = null
}

export function useConfirmState() {
  return state
}
