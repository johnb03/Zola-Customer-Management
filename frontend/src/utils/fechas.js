// Fechas locales: formatear "hoy" como YYYY-MM-DD en zona horaria local.
// NO usar new Date().toISOString().slice(0, 10): toISOString() convierte a UTC
// y en zonas negativas (ej. Argentina, UTC−3) después de las 21:00 local devuelve
// el día siguiente — el calendario y las fechas de registro se corrían un día.

export const hoyLocal = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}