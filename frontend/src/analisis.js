import { getMenu, getCatalogo, guardarReporte } from './api.js'
import { callAgente } from './agente.js'

/**
 * Corre el análisis ClienteListo de un menú extraído y guarda el reporte (.md + .docx)
 * con el pipeline del server (pandoc). Lo usan tanto DatosView (Analizar manual) como
 * UploadMenu (auto-análisis tras subir).
 *
 * @param {string} name Nombre del menú en la lista (m.archivo)
 * @returns {Promise<{nombre: string, texto: string, md: string|null, docx: string|null}>}
 */
export const ejecutarAnalisisMenu = async (name) => {
  const menu = await getMenu(name)
  if (!menu) throw new Error('No se pudo leer el menú extraído del server.')
  const catalogo = await getCatalogo()

  // Armar catálogo legible para el prompt (cap de tamaño razonable)
  let catalogoTexto = 'Sin catálogo cargado.'
  try {
    const cats = catalogo?.categorias || {}
    const parts = []
    for (const [cat, items] of Object.entries(cats)) {
      const names = (Array.isArray(items) ? items : []).map((p) =>
        [p?.nombre, p?.codigo, p?.empaque].filter(Boolean).join(' — ')
      )
      if (names.length) parts.push(`[${cat}]\n${names.join('\n')}`)
    }
    if (parts.length) catalogoTexto = parts.join('\n\n').slice(0, 12000)
  } catch { /* catálogo vacío */ }

  const prompt = `Eres el analista de ClienteListo de Zola, un sistema de venta de productos gourmet para negocios (restaurantes, bares, almacenes).

Analiza el documento de referencia del negocio que está abajo (ya extraído como texto). Es un menú si el negocio es un restaurante, una carta de cócteles si es un bar, o un listado de productos si es un almacén/colmado. Adaptá el vocabulario al tipo de negocio — NO fuerces la lógica de "plato + ingredientes" sobre un documento que no es un menú de restaurante.

Pasos:
1. Identificá el tipo de negocio y su perfil.
2. Extraé cada ítem (plato/cóctel/producto) con lo que necesita (ingredientes/insumos). Marcá "(explícito)" lo que el documento dice literalmente y "(inferido)" lo que deduzcas.
3. Compará contra el catálogo: match directo / match posible (explica la diferencia) / gap (oportunidad a evaluar).
4. Generá la estrategia: qué productos venderle y de qué ítems del documento viene esa necesidad, por qué le conviene a ESE negocio (volumen, tipo de cocina/perfil, empaque), y un pitch breve y directo. No inventes cifras de costo.

DOCUMENTO DEL NEGOCIO:
${String(menu.text || '').slice(0, 20000)}

CATÁLOGO DE PRODUCTOS:
${catalogoTexto}

Respondé con el reporte en este formato exacto:

# [Nombre del negocio] — Estrategia de venta

## Resumen
[2-3 líneas: tipo de negocio, perfil, oportunidad principal]

## Productos a ofrecer
- [Producto] (código, empaque) — usado en [ítem(s)] (explícito/inferido) — [por qué le conviene]

## Posibles sustitutos / matches parciales
- [Ítem] → [Producto similar] — [diferencia relevante]

## Gaps (no cubiertos por catálogo actual)
- [Ítem sin match]

## Pitch sugerido
[3-5 líneas listas para usar en la conversación de venta]`

  const texto = String(await callAgente(prompt)).trim()
  const res = await guardarReporte(name, texto)
  return { nombre: name, texto, md: res.md || null, docx: res.docx || null }
}