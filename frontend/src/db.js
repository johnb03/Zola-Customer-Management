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
const DB_VERSION = 1

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
]

let dbInstance = null

function open() {
  if (dbInstance) return Promise.resolve(dbInstance)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          if (name === 'usuario' || name === 'catalogo') {
            db.createObjectStore(name, { keyPath: 'id' })
          } else if (name === 'plantillas') {
            db.createObjectStore(name, { keyPath: 'id' })
          } else {
            db.createObjectStore(name, { autoIncrement: true })
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
    return transaction.objectStore(storeName)
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
  return tx(storeName, 'readwrite').then((store) => promisify(store.put(record)))
}

function putAll(storeName, records) {
  return tx(storeName, 'readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        let count = 0
        const total = records.length
        if (total === 0) return resolve(0)
        store.oncomplete = () => resolve(count)
        store.onerror = () => reject(store.error)
        for (const r of records) {
          const req = store.put(r)
          req.onsuccess = () => count++
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
      const keep = all.filter((v) => v.Fecha !== fecha)
      const replaced = keep.concat(nuevas)
      return putAll('visitas', replaced).then(() => ({
        reemplazadas: all.length - keep.length,
      }))
    },
    countByDate: async (fecha) => {
      const all = await getAll('visitas')
      return all.filter((v) => v.Fecha === fecha).length
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
    clear: () => clear('entrantes'),
  },

  // --- ID generation helpers ---
  nextId,

  // --- Bulk import (for migration from server) ---
  importAll: async (data) => {
    const results = {}
    for (const [storeName, records] of Object.entries(data)) {
      if (STORES.includes(storeName) && Array.isArray(records)) {
        await clear(storeName)
        await putAll(storeName, records)
        results[storeName] = records.length
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
}

export default db
