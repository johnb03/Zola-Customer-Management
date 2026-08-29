/**
 * generarDocx.js — Conversión de markdown (reporte ClienteListo) a .docx client-side.
 *
 * Port de scripts/convert-report.sh + reglas de formato de corrections.md usando
 * la librería `docx`. Reemplaza el pipeline servidor (pandoc + post-proceso de
 * espaciado) por generación local, para que la app sea standalone.
 *
 * Reglas de formato aplicadas (corrections.md):
 *  - La línea de producto de las listas "Productos a ofrecer" y "Posibles
 *    sustitutos / matches parciales" lleva el nombre+código+empaque en negrita
 *    (`**Producto (código, empaque)**`, ya presente en el markdown) y el resto
 *    de la entrada en normal.
 *  - Línea en blanco entre cada entrada de lista → replicamos el
 *    `<w:spacing w:after="160"/>` del post-proceso con `spacing: { after: 160 }`
 *    (= 160 twips ≈ 8pt).
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Negrita inline `**texto**` → TextRun con bold. El texto fuera de `**` va normal.
function runsFromInline(text) {
  const runs = []
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }))
    } else if (part.trim()) {
      runs.push(new TextRun({ text: part }))
    } else if (part) {
      runs.push(new TextRun({ text: part }))
    }
  }
  return runs
}

/**
 * Convierte un párrafo de lista en paragraph(s) docx.
 * Las entradas llevan spacing after = 160 twips (línea en blanco entre entradas).
 */
function paragraphListItem(rawLine) {
  const content = rawLine.replace(/^[-*]\s+/, '').trim() // quitar viñeta
  return new Paragraph({
    children: runsFromInline(content),
    bullet: { level: 0 },
    spacing: { after: 160 },
  })
}

function paragraphNumberedItem(rawLine, index) {
  const content = rawLine.replace(/^\d+[.)]\s*/, '').trim()
  return new Paragraph({
    children: runsFromInline(content),
    numbering: { reference: 'numero-lista', level: 0 },
    spacing: { after: 160 },
  })
}

/**
 * Parsea markdown línea por línea en párrafos docx.
 * Soporta: # h1, ## h2, ### h3, listas con viñetas (- / *), listas numeradas
 * (1. / 1) ), párrafos y líneas en blanco (ignoradas salvo como separador).
 */
function parseMarkdown(markdown) {
  const lines = String(markdown || '').split(/\r?\n/)
  const children = []

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (!line.trim()) continue // líneas en blanco: el espaciado lo da spacing:after

    // Encabezados
    const h1 = line.match(/^#{1}\s+(.*)/)
    const h2 = line.match(/^#{2}\s+(.*)/)
    const h3 = line.match(/^#{3}\s+(.*)/)
    if (h1) {
      children.push(new Paragraph({ children: runsFromInline(h1[1]), heading: HeadingLevel.HEADING_1 }))
      continue
    }
    if (h2) {
      children.push(new Paragraph({ children: runsFromInline(h2[1]), heading: HeadingLevel.HEADING_2 }))
      continue
    }
    if (h3) {
      children.push(new Paragraph({ children: runsFromInline(h3[1]), heading: HeadingLevel.HEADING_3 }))
      continue
    }

    // Listas con viñetas
    if (/^\s*[-*]\s+/.test(line)) {
      children.push(paragraphListItem(line))
      continue
    }

    // Listas numeradas (1. ó 1) )
    const num = line.match(/^\s*(\d+)[.)]\s+/)
    if (num) {
      children.push(paragraphNumberedItem(line, Number(num[1])))
      continue
    }

    // Párrafo normal
    children.push(new Paragraph({ children: runsFromInline(line) }))
  }

  return children
}

/**
 * Genera un Blob .docx a partir del markdown del reporte.
 * @param {string} markdown
 * @returns {Promise<Blob>}
 */
export async function generarDocxBlob(markdown) {
  const children = parseMarkdown(markdown)

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'numero-lista',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 1, style: { paragraph: { indent: { left: 480 } } } }],
        },
      ],
    },
    sections: [{ children }],
  })

  return Packer.toBlob(doc)
}

export default generarDocxBlob
