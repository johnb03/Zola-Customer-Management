/**
 * errors.js — Normalización de errores para la UI.
 *
 * tesseract.js y otras APIs de navegador rechazan a veces con strings planos,
 * objetos o DOMException sin `.message` fiable; este helper garantiza un texto
 * legible para alertas/errores sin perder la causa real.
 */

export function toErrorMessage(e) {
  if (e === null || e === undefined) return 'Error desconocido'
  if (typeof e === 'string' && e.trim()) return e
  if (e instanceof Error) return e.message || String(e)
  if (e && typeof e === 'object') {
    if (typeof e.message === 'string' && e.message.trim()) return e.message
    try {
      return JSON.stringify(e)
    } catch {
      return String(e)
    }
  }
  return String(e)
}