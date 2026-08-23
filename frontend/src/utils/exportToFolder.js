// Guarda un blob en una carpeta de la PC elegida con el diálogo nativo (Chromium).
// Si se pasa dirHandle, lo usa directamente (requesteado antes del async).
// Fallback: descarga normal del navegador.
export async function guardarEnCarpetaPc(blob, nombre, dirHandle) {
  if (dirHandle) {
    const file = await dirHandle.getFileHandle(nombre, { create: true })
    const writable = await file.createWritable()
    await writable.write(blob)
    await writable.close()
    return { ok: true, carpeta: dirHandle.name }
  }
  if (window.showDirectoryPicker) {
    try {
      const dir = await window.showDirectoryPicker()
      const file = await dir.getFileHandle(nombre, { create: true })
      const writable = await file.createWritable()
      await writable.write(blob)
      await writable.close()
      return { ok: true, carpeta: dir.name }
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false, cancelado: true }
      throw err
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return { ok: false, cancelado: false }
}
