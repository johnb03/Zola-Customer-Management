// dinero.js — normalización y formateo de montos.
// Entrada aceptada: number, o string en formato AR ("40.183,18"), EN ("40,183.18"),
// o numérico simple ("40183.18", "1.500", "40183"), con/sin símbolos.
// Salida SIEMPRE formateada en es-AR: 40.183,18

export const normalizarMonto = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').replace(/[^\d.,-]/g, '').trim()
  if (!s) return 0
  const neg = s.startsWith('-')
  const t = s.replace(/-/g, '')
  if (!t) return 0
  const hasComma = t.includes(',')
  const hasDot = t.includes('.')
  let n
  if (hasComma) {
    // La ÚLTIMA coma (o el último punto si viene después) es el separador decimal.
    const idx = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'))
    n = t.slice(0, idx).replace(/[.,]/g, '') + '.' + t.slice(idx + 1)
  } else if (hasDot) {
    const dots = t.split('.')
    if (dots.length === 2 && dots[1].length <= 2) {
      n = t // decimal: "40183.18" → 40183.18; "1.5" → 1.5
    } else if (dots.length === 2) {
      n = t.replace('.', '') // miles: "40.183" → 40183; "1.500" → 1500
    } else {
      n = t.replace(/\./g, '') // 2+ puntos → miles: "1.234.567" → 1234567
    }
  } else {
    n = t
  }
  const num = Number(n)
  return Number.isFinite(num) ? num : 0
}

// Devuelve el número formateado SIN signo $, en es-AR con 2 decimales.
// Para v vacío/null/undefined devuelve '' (para no mostrar 0 donde no hay monto).
export const formatearMonto = (v) => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string' && String(v).trim() === '') return ''
  const num = normalizarMonto(v)
  return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
