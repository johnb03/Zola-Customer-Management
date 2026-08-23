import { reactive } from 'vue'

// Estado compartido singleton — App.vue monta el modal, cualquier vista llama alerta().
const state = reactive({
  abierto: false,
  titulo: '',
  mensaje: '',
  tipo: 'info', // 'success' | 'error' | 'warning' | 'info'
  duracion: null,
  _resolve: null,
})

let currentResolve = null

export function alerta({ titulo = '', mensaje = '', tipo = 'info', duracion = null } = {}) {
  return new Promise((resolve) => {
    state.titulo = titulo
    state.mensaje = mensaje
    state.tipo = tipo
    state.duracion = duracion
    currentResolve = resolve
    state.abierto = true
  })
}

export function resolverAlerta(valor = true) {
  state.abierto = false
  if (currentResolve) currentResolve(valor)
  currentResolve = null
}

export function useAlertState() {
  return state
}
