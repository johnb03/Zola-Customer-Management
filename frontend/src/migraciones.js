// Migraciones de datos: cuando el código cambia la *forma* de los registros
// (campos nuevos, vínculos, reglas), los datos ya guardados en IndexedDB quedan
// con la forma vieja. Este módulo aplica "backfills" versionados al arrancar:
// idempotentes, no destructivos, y solo corren una vez por versión.

import { db } from './db.js'

// Versión del *formato de datos*. Se sube cuando una migración cambia la forma
// de los registros existentes. Es independiente de DB_VERSION (db.js), que solo
// maneja estructura de stores de IndexedDB.
const DATA_VERSION = 1

// Marcador en localStorage: qué versión de formato tienen los datos actuales.
// Separado de la config del agente (agente.js) a propósito.
const STORAGE_DATA_VERSION = 'zola-data-version'

// Normaliza un string para comparación de nombres (mismo criterio que
// CitasView.vue al crear citas): sin acentos, minúsculas, sin espacios.
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

// v1: Citas al formato nuevo. Las citas creadas antes de existir el vínculo
// cliente-quedan sin ID_Cliente ni Estado. Para cada una:
//   - vincular ID_Cliente por coincidencia de nombre (Establecimiento ↔ Nombre),
//     el mismo criterio de CitasView.vue al crear citas nuevas;
//   - garantizar Estado: 'pendiente' (coherente con crearCita en api.js);
//   - Motivo por defecto si está vacío.
// Nunca borra ni modifica Fecha/Establecimiento que el usuario escribió.
const censoV1 = async () => {
  const [citas, clientes] = await Promise.all([db.citas.getAll(), db.clientes.getAll()])
  let actualizadas = 0

  for (const cita of citas) {
    const cambios = {}

    if (!cita.ID_Cliente) {
      const estab = norm(cita.Establecimiento)
      const match = clientes.find(
        (cl) => norm(cl.Nombre) && (norm(cl.Nombre).includes(estab) || estab.includes(norm(cl.Nombre))),
      )
      if (match) cambios.ID_Cliente = match.ID_Cliente
    }

    if (!cita.Estado) cambios.Estado = 'pendiente'
    if (!cita.Motivo) cambios.Motivo = 'Cita registrada'

    if (Object.keys(cambios).length > 0) {
      await db.citas.update(cita.ID_Cita, cambios)
      actualizadas++
    }
  }

  return { actualizadas }
}

// Registro de migraciones por versión. Cada entrada corre una sola vez.
const MIGRACIONES = {
  1: censoV1,
}

// Lee el marcador actual. Sin marcador = datos viejos = 0.
const versionActual = () => {
  try {
    return parseInt(localStorage.getItem(STORAGE_DATA_VERSION) || '0', 10) || 0
  } catch {
    return 0
  }
}

// Corre las migraciones pendientes en orden. Nunca falla la app entera: si una
// migración falla, la reporta y deja el marcador sin avanzar (se reintenta en
// el próximo arranque, sin re-correr las que ya pasaron).
export const runMigrations = async () => {
  const desde = versionActual()
  if (desde >= DATA_VERSION) return { aplicadas: [], desde }

  const aplicadas = []
  for (let v = desde + 1; v <= DATA_VERSION; v++) {
    const migracion = MIGRACIONES[v]
    if (!migracion) continue
    const resumen = await migracion()
    aplicadas.push({ version: v, ...resumen })
    try {
      localStorage.setItem(STORAGE_DATA_VERSION, String(v))
    } catch {
      /* sin localStorage: la migración ya corrió, solo no queda registrada */
    }
  }
  return { aplicadas, desde }
}