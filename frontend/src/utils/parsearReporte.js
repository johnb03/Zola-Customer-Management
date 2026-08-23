// parsearReporte.js
// Parser puro del texto libre que pega el usuario (diario de campo) → filas de visita.
// No depende del server: recibe texto, devuelve un array de objetos con los campos
// que acepta POST /api/visitas (encabezado aparte).
//
// El texto típico mezcla establecimientos, horas, personas y notas sin formato fijo:
//   "Colmado La esperilla 3:25 Pase a cobrar, pagará el lunes
//    ----
//    Cheung heng 3:43 Pase a cobrar, Paga el lunes"
//
// Reglas:
//   - Los bloques se separan por 3+ guiones (-{3,}).
//   - Hora: /(\d{1,2})\s*:\s*(\d{2})/ → se normaliza a HH:MM.
//   - Establecimiento: primera línea no vacía que no sea hora (siempre, sea 1 o N palabras).
//   - Un bloque que solo contiene un nombre (sin hora ni notas) se usa como
//     "establecimiento pendiente" para el siguiente y NO genera fila. Cuando hay pendiente,
//     la primera línea del bloque siguiente es la persona contactada (o dirección).
//   - Persona contactada: primera línea después del establecimiento (o la primera del bloque
//     cuando hay pendiente), si tiene ≤ 3 palabras, arranca con mayúscula y no es verbo/frase.
//   - Comentarios: todo lo que sobra (nunca se pierde información).
//   - Keywords → Pedido / Próximo Paso / Detalle_Pedido / Monto (solo con $ o "pesos").

const HORA_RE = /(\d{1,2})\s*:\s*(\d{2})\b/g

// Palabras/frases que abren una línea que NO es un nombre de persona.
const PREFIJOS_NO_PERSONA = new Set([
  'pase', 'pasa', 'paga', 'pagará', 'pagara', 'pago', 'pagó', 'sin', 'todavía', 'todavia',
  'dice', 'dijo', 'cerrado', 'cobrado', 'cobrar', 'formulario', 'quiere', 'nota', 'llamar',
  'llamarla', 'llamarlo', 'consultará', 'consultara', 'pedidos', 'mañana', 'manana', 'no',
  'hasta', 'pedido', 'entregado', 'descartar', 'descartado', 'pendiente', 'llamada', 'volver',
  'de', 'la', 'el', 'los', 'las', 'en', 'con', 'por', 'a', 'y', 'que', 'se', 'le', 'me',
  'te', 'nos', 'lo', 'su', 'sus', 'una', 'un', 'al', 'del', 'para', 'sobre', 'fue', 'esta',
  'está', 'hay', 'habla', 'hablar', 'abierto', 'tienda', 'negocio', 'local',
])

// Keywords → Próximo Paso (orden importa: descartar primero, luego cobro, seguimiento, visita)
const PASO_DESCARTAR = /descartar|descartado|cerrado|no les interesa|no quieren|fuera de ruta/i
const PASO_COBRO = /\bcobr|\bpag|\bdeuda|\bsald|\bcobrado/i
const PASO_SEGUIMIENTO = /sin respuesta|sin respuestas|llamar|llamarla|llamarlo|llamada|volver a llamar|pendiente de respuesta|sin novedad|prospecto|nuevo cliente/i
const PASO_VISITA = /\bvisita\b|\bvolver\b|revisitar|pasar de nuevo/i

// Keywords → Pedido
const PEDIDO_SI = /quiere|pidió|pidio|solicitó|solicito|orden de|pedido de|compró|compro|encargó|encargo|va a tomar|tomar\b|se llevó|se llevo|vendí|vendi|aceptó|acepto|\b\d+\s*(?:caja|cajas|unidad|unidades|paquete|paquetes|galón|galones|botella|botellas|kilo|kilos|libra|libras)\b/i
const PEDIDO_NO = /sin respuesta|sin pedido|no pidió|no pidio|no quiere|rechazó|rechazo|no compró|no compro/i

// Monto: SOLO con símbolo de moneda o palabra "pesos" (para no confundir "5 cajas")
const MONTO_RE = /\$\s*([\d.,]+)|\bRD\$\s*([\d.,]+)|\b(?:pesos?|peso)\s+([\d.,]+)/i

const pad2 = (n) => String(n).padStart(2, '0')

const normalizarHora = (h, m) => `${pad2(Number(h))}:${pad2(Number(m))}`

const extraerHora = (texto) => {
  HORA_RE.lastIndex = 0
  const m = HORA_RE.exec(texto)
  return m ? normalizarHora(m[1], m[2]) : ''
}

const lineaEsPersona = (linea) => {
  const t = linea.trim()
  if (!t) return false
  const palabras = t.split(/\s+/)
  if (palabras.length < 1 || palabras.length > 3) return false
  const primera = palabras[0]
  if (!primera || primera[0] !== primera[0].toUpperCase()) return false
  if (PREFIJOS_NO_PERSONA.has(primera.toLowerCase())) return false
  if (/[.,;:!?]/.test(t.replace(/\.$/, ''))) return false
  return true
}

const capturarMonto = (texto) => {
  const m = MONTO_RE.exec(texto)
  if (!m) return ''
  const raw = (m[1] || m[2] || m[3] || '').replace(/[^\d.,]/g, '').replace(/,/g, '')
  return raw || ''
}

const detectarProximoPaso = (comentarios) => {
  const s = String(comentarios || '')
  if (PASO_DESCARTAR.test(s)) return 'Descartado'
  if (PASO_COBRO.test(s)) return 'Cobro'
  if (PASO_SEGUIMIENTO.test(s)) return 'Seguimiento'
  if (PASO_VISITA.test(s)) return 'Visita'
  return ''
}

const detectarPedido = (comentarios) => {
  const s = String(comentarios || '')
  if (PEDIDO_SI.test(s)) return 'Sí'
  if (PEDIDO_NO.test(s)) return 'No'
  return ''
}

// Divide el texto crudo en bloques por separadores de guiones.
const dividirBloques = (texto) => {
  return String(texto || '')
    .split(/\n?-{3,}\n?/)
    .map((b) => b.trim())
    .filter(Boolean)
}

// Divide un bloque en líneas útiles (sin vacías, sin la hora).
const lineasUtiles = (bloque) => {
  const sinHora = String(bloque || '').replace(HORA_RE, ' ').trim()
  return sinHora
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

// Texto de relleno que el usuario escribe explicando el formato (no es una visita).
const ES_EXPLICACION = /^(asi|así|mas o menos|más o menos|ejemplo|es decir|por ejemplo|seria asi|sería así|algo asi|algo así|asi seria|así sería|masomenos)\b/i

export function parsearTextoVisitas(texto) {
  const bloques = dividirBloques(texto)
  const filas = []
  let pendienteEstablecimiento = ''

  for (const bloque of bloques) {
    const hora = extraerHora(bloque)

    // Detectar texto explicativo del usuario (no es una visita)
    if (!hora && ES_EXPLICACION.test(String(bloque).trim().slice(0, 60))) continue

    const lineas = lineasUtiles(bloque)
    let establecimiento = ''
    let persona = ''
    let idx = 0

    if (lineas.length > 0) {
      const primera = lineas[0]
      if (pendienteEstablecimiento && lineaEsPersona(primera) && lineas.length >= 2) {
        // Hay pendiente → la primera línea es la persona (o dirección)
        persona = primera
        idx = 1
      } else {
        establecimiento = primera
        idx = 1
      }
    }

    // Segunda línea → posible persona
    if (!persona && idx < lineas.length && lineaEsPersona(lineas[idx])) {
      persona = lineas[idx]
      idx++
    }

    const comentarios = lineas.slice(idx).join('\n').trim()

    // Si el bloque no trae establecimiento, heredar el pendiente
    if (!establecimiento) establecimiento = pendienteEstablecimiento

    // Bloque que solo trae un nombre (sin hora ni notas) → establecimiento pendiente
    if (establecimiento && !hora && !persona && !comentarios) {
      pendienteEstablecimiento = establecimiento
      continue
    }

    if (!establecimiento && !hora && !persona && !comentarios) continue

    const fila = {
      establecimiento: establecimiento || '',
      hora_visita: hora,
      persona_contactada: persona,
      productos_presentados: '',
      pedido: detectarPedido(comentarios),
      detalle_pedido: detectarPedido(comentarios) === 'Sí' ? comentarios : '',
      monto: capturarMonto(comentarios),
      comentarios: comentarios,
      proximo_paso: detectarProximoPaso(comentarios),
    }

    filas.push(fila)

    // Después de una fila completa, el establecimiento pendiente se consume
    if (establecimiento) pendienteEstablecimiento = ''
  }

  return filas
}