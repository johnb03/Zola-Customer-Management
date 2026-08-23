// Sincronía de datos: las mutaciones (upload/export) bump esta versión y las
// vistas que observan dataVersion vuelven a pedir datos reales al backend.
import { ref } from 'vue'
import { getUsuario } from './api.js'

export const dataVersion = ref(0)

export const notifyDataChanged = () => {
  dataVersion.value += 1
}

// --- Usuario (config del vendedor) ------------------------------------------------
export const usuario = ref({ nombre: '', foto: null })

export const cargarUsuario = async () => {
  try {
    const data = await getUsuario()
    usuario.value = data
  } catch {
    /* keep defaults */
  }
}

export const showConfig = ref(false)
