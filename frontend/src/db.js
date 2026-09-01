/**
 * db.js — Capa de datos IndexedDB para Zola.
 * Reemplaza al servidor Express como storage. Todas las colecciones
 * se guardan en IndexedDB del navegador.
 *
 * Cada colección es un objectStore con keyPath = "ID_*".
 * Las operaciones CRUD son idénticas a las del backend, para que
 * el refactor de api.js sea mecánico.
 */

const DB_NAME = 'zola-crm'
const DB_VERSION = 6

const STORES = [
  'clientes',    // keyPath: ID_Cliente
  'visitas',     // keyPath: ID_Visita
  'notas',       // keyPath: ID_Nota
  'citas',       // keyPath: ID_Cita
  'cobros',      // keyPath: ID_Cobro (o auto-increment)
  'catalogo',    // keyPath: id (singleton o array)
  'entrantes',   // keyPath: id
  'usuario',     // keyPath: id (singleton)
  'plantillas',  // keyPath: id (report templates, blobs)
  'menus',       // keyPath: archivo (menús extraídos)
  'reportes',    // keyPath: archivo (reportes .md)
  'reportsDocx', // keyPath: archivo (reportes .docx, blobs)
]

// keyPath mapping for each store
const STORE_KEYPATHS = {
  clientes: 'ID_Cliente',
  visitas: 'ID_Visita',
  notas: 'ID_Nota',
  citas: 'ID_Cita',
  cobros: 'ID_Cobro',
  catalogo: 'id',
  entrantes: 'id',
  usuario: 'id',
  plantillas: 'id',
  menus: 'archivo',
  reportes: 'archivo',
  reportsDocx: 'archivo',
}

// Stores that need migration from autoIncrement → keyPath
const MIGRATION_STORES = ['clientes', 'visitas', 'notas', 'citas', 'cobros']

let dbInstance = null

function open() {
  if (dbInstance) return Promise.resolve(dbInstance)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = req.result
      const oldVersion = event.oldVersion
      const upgradeTx = event.target.transaction

      // v1→v2: migrate autoIncrement stores to keyPath stores
      if (oldVersion < 2) {
        for (const storeName of MIGRATION_STORES) {
          if (!db.objectStoreNames.contains(storeName)) continue
          const keyPath = STORE_KEYPATHS[storeName]
          const oldStore = upgradeTx.objectStore(storeName)

          // Read all records synchronously within the upgrade transaction
          const getAllReq = oldStore.getAll()
          getAllReq.onsuccess = () => {
            const records = getAllReq.result
            db.deleteObjectStore(storeName)
            const newStore = db.createObjectStore(storeName, { keyPath })
            for (const record of records) {
              // Use ID_* field as key if present, otherwise skip (orphan data)
              const idVal = record[keyPath]
              if (idVal != null && idVal !== '') {
                newStore.put(record, idVal)
              }
            }
          }
        }
      }

      // Ensure all stores exist with correct keyPath (also handles fresh install)
      for (const name of STORES) {
        if (db.objectStoreNames.contains(name)) continue
        db.createObjectStore(name, { keyPath: STORE_KEYPATHS[name] })
      }

      // v3→v5: deduplicar visitas legacy acumuladas por reconversión de notas
      // (misma fecha + mismo establecimiento, con hora o con mismo contenido core).
      if (oldVersion < 5) {
        const visitasStore = upgradeTx.objectStore('visitas')
        const getAllReq = visitasStore.getAll()
        getAllReq.onsuccess = () => {
          const records = getAllReq.result
          const keep = dedupeVisitas(records)
          if (keep.length < records.length) {
            const keepIds = new Set(keep.map((r) => r.ID_Visita))
            for (const r of records) {
              if (!keepIds.has(r.ID_Visita)) visitasStore.delete(r.ID_Visita)
            }
          }
        }
      }
    }
    req.onsuccess = () => {
      dbInstance = req.result
      resolve(dbInstance)
    }
    req.onerror = () => reject(req.error)
  })
}

// ─── Generic helpers ─────────────────────────────────────────────

function tx(storeName, mode = 'readonly') {
  return open().then((db) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    store._tx = transaction
    return store
  })
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getAll(storeName) {
  return tx(storeName).then((store) => promisify(store.getAll()))
}

function getById(storeName, id) {
  return tx(storeName).then((store) => promisify(store.get(id)))
}

function put(storeName, record) {
  return tx(storeName, 'readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.put(record)
        // IndexedDB resuelve put() con la key, no con el objeto. Resolver con
        // el record mantiene el contrato esperado por update()/save() callers
        // (ej. actualizarCliente devuelve el cliente completo actualizado).
        req.onsuccess = () => resolve(record)
        req.onerror = () => reject(req.error)
      })
  )
}

function putAll(storeName, records) {
  return tx(storeName, 'readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        let count = 0
        const total = records.length
        if (total === 0) return resolve(0)
        store._tx.oncomplete = () => resolve(count)
        store._tx.onerror = () => reject(store._tx.error)
        for (const r of records) {
          const req = store.put(r)
          req.onsuccess = () => count++
        }
      })
  )
}

// Reemplaza TODO el contenido del store en una sola transacción:
// clear() + put() de la lista completa. Necesario porque put() solo
// escribe/sobreescribe claves y NUNCA elimina registros que ya no están
// en la lista — sin clear(), un "replace" de visita por fecha acumulaba
// las filas viejas en cada reconversión.
function replaceAll(storeName, records) {
  return tx(storeName, 'readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        store._tx.oncomplete = () => resolve(records.length)
        store._tx.onerror = () => reject(store._tx.error)
        const clearReq = store.clear()
        clearReq.onsuccess = () => {
          for (const r of records) {
            store.put(r)
          }
        }
      })
  )
}

function deleteById(storeName, id) {
  return tx(storeName, 'readwrite').then((store) => promisify(store.delete(id)))
}

function clear(storeName) {
  return tx(storeName, 'readwrite').then((store) => promisify(store.clear()))
}

function count(storeName) {
  return tx(storeName).then((store) => promisify(store.count()))
}

// ─── Deduplicación de visitas ────────────────────────────────────

const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

// Firma de identidad de una visita.
// - Con hora: fecha + establecimiento + hora (una visita concreta).
// - Sin hora: fecha + establecimiento + núcleo (persona, productos) — el detalle
//   y comentarios se excluyen porque la reconversión de una misma nota re-resume
//   el detalle con otras palabras; conservar el más completo lo decide el score.
function firmaVisita(v) {
  const fecha = norm(String(v?.Fecha || '').slice(0, 10))
  const estab = norm(v?.Establecimiento)
  if (!fecha || !estab) return null
  const hora = norm(v?.Hora_Visita)
  if (hora) return `h|${fecha}|${estab}|${hora}`
  const persona = norm(v?.Persona_Contactada)
  const productos = norm(v?.Productos_Presentados)
  return `c|${fecha}|${estab}|${persona}|${productos}`
}

// Puntaje de completitud: cuánta información tiene el registro (para conservar
// el más completo entre duplicados).
function scoreVisita(v) {
  const campos = [
    v?.Establecimiento,
    v?.Hora_Visita,
    v?.Persona_Contactada,
    v?.Productos_Presentados,
    v?.Detalle_Pedido,
    v?.Proximo_Paso,
    v?.Comentarios,
  ]
  return campos.filter(Boolean).map((s) => String(s).trim().length).reduce((a, b) => a + b, 0)
}

// Devuelve la lista sin duplicados (conserva el registro más completo de cada firma).
export function dedupeVisitas(records) {
  const seen = new Map()
  const keep = []
  for (const r of records) {
    const sig = firmaVisita(r)
    if (!sig) {
      keep.push(r)
      continue
    }
    const prev = seen.get(sig)
    if (!prev) {
      seen.set(sig, r)
      keep.push(r)
    } else if (scoreVisita(r) > scoreVisita(prev)) {
      seen.set(sig, r)
      const idx = keep.indexOf(prev)
      if (idx !== -1) keep.splice(idx, 1, r)
    }
    // else: es un duplicado menos completo, se descarta
  }
  return keep
}

// ─── ID generation (matches server's nextSeq + pad3) ─────────────

function pad3(n) {
  return String(n).padStart(3, '0')
}

function nextId(storeName, prefix) {
  return getAll(storeName).then((items) => {
    let max = 0
    for (const item of items) {
      const idKey = Object.keys(item).find((k) => k.startsWith('ID_'))
      if (idKey) {
        const num = parseInt(String(item[idKey]).replace(prefix, ''), 10)
        if (num > max) max = num
      }
    }
    return `${prefix}${pad3(max + 1)}`
  })
}

// ─── Collection-specific CRUD ────────────────────────────────────

export const db = {
  // --- Clientes ---
  clientes: {
    getAll: () => getAll('clientes'),
    getById: (id) => getById('clientes', id),
    save: (cliente) => put('clientes', cliente),
    saveAll: (clientes) => putAll('clientes', clientes),
    update: (id, cambios) =>
      getById('clientes', id).then((c) => {
        if (!c) throw new Error('Cliente no encontrado')
        return put('clientes', { ...c, ...cambios })
      }),
    delete: (id) => deleteById('clientes', id),
    clear: () => clear('clientes'),
  },

  // --- Visitas ---
  visitas: {
    getAll: () => getAll('visitas'),
    getById: (id) => getById('visitas', id),
    save: (visita) => put('visitas', visita),
    saveAll: (visitas) => putAll('visitas', visitas),
    update: (id, cambios) =>
      getById('visitas', id).then((v) => {
        if (!v) throw new Error('Visita no encontrada')
        return put('visitas', { ...v, ...cambios })
      }),
    delete: (id) => deleteById('visitas', id),
    clear: () => clear('visitas'),
    // Replace by date (matches server behavior)
    replaceByDate: async (fecha, nuevas) => {
      const all = await getAll('visitas')
      // Normalize date comparison — stored dates may have time component or different format
      const normFecha = String(fecha || '').slice(0, 10)
      const keep = all.filter((v) => String(v.Fecha || '').slice(0, 10) !== normFecha)

      // Dedup dentro de la misma tanda (vacuna contra dobles de una misma conversión)
      nuevas = dedupeVisitas(nuevas)

      // Auto-generate IDs for records missing them (AI-converted visitas have no ID_Visita)
      // Without this, multiple records with ID_Visita:'' would collide and overwrite each other
      let seq = 0
      for (const v of nuevas) {
        if (!v.ID_Visita || v.ID_Visita === '') {
          seq++
          v.ID_Visita = `V${String(Date.now()).slice(-6)}${pad3(seq)}`
        }
        // Ensure fecha is normalized on new records too
        v.Fecha = normFecha
      }

      const replaced = keep.concat(nuevas)
      // replaceAll borra primero el store: las filas viejas de la fecha se
      // eliminan de verdad (putAll solo sobreescribe, no eliminaba)
      return replaceAll('visitas', replaced).then(() => ({
        reemplazadas: all.length - keep.length,
      }))
    },
    countByDate: async (fecha) => {
      const all = await getAll('visitas')
      const normFecha = String(fecha || '').slice(0, 10)
      return all.filter((v) => String(v.Fecha || '').slice(0, 10) === normFecha).length
    },
  },

  // --- Notas ---
  notas: {
    getAll: () => getAll('notas'),
    getById: (id) => getById('notas', id),
    save: (nota) => put('notas', nota),
    saveAll: (notas) => putAll('notas', notas),
    update: (id, cambios) =>
      getById('notas', id).then((n) => {
        if (!n) throw new Error('Nota no encontrada')
        return put('notas', { ...n, ...cambios })
      }),
    delete: (id) => deleteById('notas', id),
    clear: () => clear('notas'),
  },

  // --- Citas ---
  citas: {
    getAll: () => getAll('citas'),
    getById: (id) => getById('citas', id),
    save: (cita) => put('citas', cita),
    saveAll: (citas) => putAll('citas', citas),
    update: (id, cambios) =>
      getById('citas', id).then((c) => {
        if (!c) throw new Error('Cita no encontrada')
        return put('citas', { ...c, ...cambios })
      }),
    delete: (id) => deleteById('citas', id),
    clear: () => clear('citas'),
  },

  // --- Cobros ---
  cobros: {
    getAll: () => getAll('cobros'),
    save: (cobro) => put('cobros', cobro),
    saveAll: (cobros) => putAll('cobros', cobros),
    clear: () => clear('cobros'),
  },

  // --- Catálogo (singleton) ---
  catalogo: {
    get: () => getById('catalogo', 'main'),
    save: (data) => put('catalogo', { id: 'main', ...data }),
    clear: () => clear('catalogo'),
  },

  // --- Usuario (singleton) ---
  usuario: {
    get: () =>
      getById('usuario', 'main').then((u) => u || { id: 'main', nombre: '', foto: null }),
    save: (data) => put('usuario', { id: 'main', ...data }),
    clear: () => clear('usuario'),
  },

  // --- Plantillas de reporte ---
  plantillas: {
    get: (name) => getById('plantillas', name),
    save: (name, data) => put('plantillas', { id: name, ...data }),
    delete: (name) => deleteById('plantillas', name),
    clear: () => clear('plantillas'),
  },

  // --- Entrantes ---
  entrantes: {
    getAll: () => getAll('entrantes'),
    save: (entry) => put('entrantes', entry),
    deleteByTypeAndFile: async (tipo, archivo) => {
      const all = await getAll('entrantes')
      const entry = all.find((e) => e.tipo === tipo && e.archivo === archivo)
      if (!entry) throw new Error('Entrante no encontrado')
      return deleteById('entrantes', entry.id)
    },
    clear: () => clear('entrantes'),
  },

  // --- Menús extraídos (ClienteListo) ---
  menus: {
    getAll: () => getAll('menus'),
    getById: (archivo) => getById('menus', archivo),
    save: (menu) => put('menus', menu),
    clear: () => clear('menus'),
  },

  // --- Reportes .md ---
  reportes: {
    getAll: () => getAll('reportes'),
    getById: (archivo) => getById('reportes', archivo),
    save: (reporte) => put('reportes', reporte),
    clear: () => clear('reportes'),
  },

  // --- Reportes .docx (blobs) ---
  reportsDocx: {
    getAll: () => getAll('reportsDocx'),
    getById: (archivo) => getById('reportsDocx', archivo),
    save: (reporte) => put('reportsDocx', reporte),
    clear: () => clear('reportsDocx'),
  },

  // --- ID generation helpers ---
  nextId,

  // --- Bulk import (for migration from server) ---
  importAll: async (data) => {
    const results = {}
    for (const [storeName, records] of Object.entries(data)) {
      if (STORES.includes(storeName) && Array.isArray(records)) {
        // Las visitas importadas pasan por dedupe para no re-infectar con
        // duplicados legacy acumulados en la fuente del servidor
        const limpios = storeName === 'visitas' ? dedupeVisitas(records) : records
        await clear(storeName)
        await putAll(storeName, limpios)
        results[storeName] = limpios.length
      } else if (storeName === 'usuario' && records && typeof records === 'object') {
        await put('usuario', { id: 'main', ...records })
        results.usuario = 1
      } else if (storeName === 'catalogo' && records && typeof records === 'object') {
        await put('catalogo', { id: 'main', ...records })
        results.catalogo = 1
      }
    }
    return results
  },

  // --- Export all (for backup/migration) ---
  exportAll: async () => {
    const data = {}
    for (const storeName of STORES) {
      if (storeName === 'usuario' || storeName === 'catalogo') {
        data[storeName] = await getById(storeName, 'main')
      } else {
        data[storeName] = await getAll(storeName)
      }
    }
    return data
  },

  // --- Stats ---
  stats: async () => {
    const s = {}
    for (const storeName of STORES) {
      s[storeName] = await count(storeName)
    }
    return s
  },

  // --- Backup portable (JSON con base64 de Blobs/ArrayBuffers) ---
  exportarDatos: async () => {
    const data = await db.exportAll()
    return { __format__: 'zola-backup-v1', fecha: new Date().toISOString(), data: await serializeBackup(data) }
  },

  importarDatos: async (archivo, onProgress) => {
    if (!archivo) throw new Error('No se seleccionó archivo de backup')
    const raw = await archivo.text()
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('El archivo no es un JSON válido')
    }

    const payload = parsed?.__format__ === 'zola-backup-v1' ? parsed.data : parsed
    if (!payload || typeof payload !== 'object') {
      throw new Error('Backup inválido: no contiene datos')
    }

    const restored = deserializeBackup(payload)

    // REEMPLAZO total (snapshot/restore) — nunca merge.
    const results = {}
    const keys = Object.keys(restored)
    for (let i = 0; i < keys.length; i++) {
      const storeName = keys[i]
      const records = restored[storeName]
      if (!STORES.includes(storeName)) continue

      if (storeName === 'usuario' && records && typeof records === 'object') {
        await put('usuario', { id: 'main', ...records })
        results[storeName] = 1
      } else if (storeName === 'catalogo' && records && typeof records === 'object') {
        await put('catalogo', { id: 'main', ...records })
        results[storeName] = 1
      } else if (storeName === 'plantillas' && records && typeof records === 'object' && records.id) {
        // la plantilla es un singleton con keyPath id
        await put('plantillas', records)
        results[storeName] = 1
      } else if (Array.isArray(records)) {
        const limpios = storeName === 'visitas' ? dedupeVisitas(records) : records
        await clear(storeName)
        await putAll(storeName, limpios)
        results[storeName] = limpios.length
      }
      if (onProgress) onProgress({ fase: 'restaurando', pct: Math.round(((i + 1) / keys.length) * 100) })
    }
    return { ok: true, results }
  },
}

// ─── Serialización de backup portable (base64 de Binarios) ──────
// Convierte Blobs/ArrayBuffers de los records a placeholders con base64 para
// que el JSON de backup sobreviva JSON.stringify y el viaje por disco/import.

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToArrayBuffer(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// Recorre un valor devolviendo una copia en la que los binarios (Blob,
// ArrayBuffer, TypedArray) quedan como { __zbin, kind, mime, b64 }.
async function serializeValue(v) {
  // Blob → placeholder con base64 (lectura async del contenido).
  if (v instanceof Blob) {
    const b64 = arrayBufferToBase64(await v.arrayBuffer())
    return { __zbin: true, kind: 'blob', mime: v.type || '', b64 }
  }
  if (v instanceof ArrayBuffer) {
    return { __zbin: true, kind: 'ab', mime: '', b64: arrayBufferToBase64(v) }
  }
  if (ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer) {
    return { __zbin: true, kind: 'ab', mime: '', b64: arrayBufferToBase64(v.buffer) }
  }
  if (Array.isArray(v)) {
    return Promise.all(v.map((x) => serializeValue(x)))
  }
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, val] of Object.entries(v)) out[k] = await serializeValue(val)
    return out
  }
  return v
}

function deserializeValue(v) {
  if (v && v.__zbin) {
    const buf = base64ToArrayBuffer(v.b64)
    if (v.kind === 'blob') {
      return new Blob([buf], { type: v.mime || 'application/octet-stream' })
    }
    return buf
  }
  if (Array.isArray(v)) return v.map(deserializeValue)
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, val] of Object.entries(v)) out[k] = deserializeValue(val)
    return out
  }
  return v
}

async function serializeBackup(data) {
  const out = {}
  for (const [storeName, records] of Object.entries(data)) {
    out[storeName] = records == null ? null : await serializeValue(records)
  }
  return out
}

function deserializeBackup(data) {
  const out = {}
  for (const [storeName, records] of Object.entries(data)) {
    out[storeName] = records == null ? null : deserializeValue(records)
  }
  return out
}

// --- Reset all data (nuclear option) ---
export const resetAllData = async () => {
  // Limpiar localStorage: API key del agente, encabezado de visitas y ruta
  // guardada. Sin esto, "Limpiar todos los datos" dejaba la configuración
  // (y la API key) intactas — un usuario nuevo no debería tenerlas.
  try {
    const { clearAgenteConfig } = await import('./agente.js')
    clearAgenteConfig()
  } catch (e) {
    console.warn('[Reset] No se pudo limpiar config del agente:', e.message)
  }
  for (const key of ['zola-visitas-encabezado', 'zola-ruta']) {
    try { localStorage.removeItem(key) } catch { /* sin localStorage */ }
  }

  // Close current connection
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
  // Delete entire database
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  // Reload page to reinitialize everything
  window.location.reload()
}

export default db
