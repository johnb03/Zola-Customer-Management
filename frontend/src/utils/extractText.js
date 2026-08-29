/**
 * extractText.js — Extracción de texto client-side (port de scripts/extract-text.sh).
 *
 * Pipeline:
 *  - PDF:  intenta la capa de texto real con pdfjs-dist. Si el texto total es
 *          < 20 caracteres, asume PDF escaneado y hace OCR por página sobre un
 *          canvas (scale ~2) con tesseract.js.
 *  - Imágenes: OCR directo con tesseract.js.
 *
 * tesseract.js se sirve local (standalone/PWA): el worker, el core wasm y los
 * modelos traineddata.gz viven en /public y se resuelven base-aware con
 * import.meta.env.BASE_URL (funciona bajo subpath en GitHub Pages).
 *
 * @returns {Promise<{ text: string, method: 'pdftotext'|'tesseract', lineas: number }>}
 */

import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker } from 'tesseract.js'
import tesseractWorkerSrc from 'tesseract.js/dist/worker.min.js?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

// Umbral en el que un PDF con capa de texto se considera "escaneado" (mismo
// criterio que extract-text.sh: < 20 chars → OCR).
const MIN_TEXT = 20

// Umbral de texto "útil": si el OCR devuelve casi nada, se reporta igual (no
// se puede hacer mucho más client-side), pero evitamos lanzar excepciones.
const OCR_LANGS = ['spa', 'eng']

const base = () => import.meta.env.BASE_URL || '/'

let _workerPromise = null

/**
 * Crea (y cachea) un worker tesseract.js único para toda la sesión, servido
 * desde los assets locales de la app (base-aware para subpath).
 */
function getTesseractWorker() {
  if (!_workerPromise) {
    _workerPromise = createWorker(OCR_LANGS, 1, {
      workerPath: tesseractWorkerSrc,
      corePath: base() + 'tesseract-core',
      langPath: base() + 'tessdata',
      logger: () => {
        // progreso interno de carga del modelo — lo reportamos fuera
      },
    })
  }
  return _workerPromise
}

/**
 * Convierte un File a un dataURL para tesseract.js (que no consume File
 * directamente en algunos navegadores).
 */
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * OCR de una imagen (File o dataURL) o de un canvas.
 * @param {string|HTMLCanvasElement} source
 */
async function ocr(source) {
  const worker = await getTesseractWorker()
  const res = await worker.recognize(source)
  return String(res?.data?.text || '').trim()
}

/**
 * Extrae texto de un archivo (PDF o imagen).
 * @param {File} file
 * @param {(p: {fase: string, pct: number}) => void} [onProgress]
 * @returns {Promise<{ text: string, method: 'pdftotext'|'tesseract', lineas: number }>}
 */
export async function extractText(file, onProgress) {
  const name = String(file?.name || '').toLowerCase()

  if (name.endsWith('.pdf')) {
    return extractPdf(file, onProgress)
  }

  // Imagen → OCR directo
  if (onProgress) onProgress({ fase: 'procesando', pct: 50 })
  const dataUrl = await fileToDataURL(file)
  const text = await ocr(dataUrl)
  if (onProgress) onProgress({ fase: 'procesando', pct: 100 })
  return { text, method: 'tesseract', lineas: text.split('\n').filter((l) => l.trim()).length }
}

/**
 * Extrae texto de un PDF. Primero intenta la capa de texto; si sale < 20 chars,
 * hace OCR página por página sobre canvas.
 */
async function extractPdf(file, onProgress) {
  const data = await file.arrayBuffer()

  let doc
  try {
    doc = await pdfjsLib.getDocument({ data }).promise
  } catch (e) {
    throw new Error(`No se pudo abrir el PDF: ${e.message}`)
  }

  // ── Intento 1: capa de texto real ──────────────────────────────
  let totalText = ''
  let pageTexts = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items = Array.isArray(content?.items) ? content.items : []
    const pageText = items
      .map((it) => (it.str !== undefined ? it.str : ''))
      .join(' ')
      // orden natural por posición (x,y) del contenido extraído
      .replace(/\s{2,}/g, ' ')
    pageTexts.push(pageText)
    totalText += pageText + '\n'
  }

  if (totalText.trim().length >= MIN_TEXT) {
    const text = pageTexts.join('\n\n').trim()
    return {
      text,
      method: 'pdftotext',
      lineas: text.split('\n').filter((l) => l.trim()).length,
    }
  }

  // ── Intento 2: PDF escaneado → OCR por página ──────────────────
  if (onProgress) onProgress({ fase: 'procesando', pct: 10 })
  const worker = await getTesseractWorker()
  const results = []
  const total = doc.numPages
  for (let p = 1; p <= total; p++) {
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: 2 })

    // Render a canvas en memoria
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise

    const text = await ocr(canvas)
    results.push(text)

    if (onProgress) {
      onProgress({ fase: 'procesando', pct: Math.round(10 + (p / total) * 90) })
    }
  }

  const text = results.join('\n\n').trim()
  return {
    text,
    method: 'tesseract',
    lineas: text.split('\n').filter((l) => l.trim()).length,
  }
}

export default extractText
