/**
 * gemini.js — Cliente Gemini browser-side.
 * Llama directamente a la API de Gemini desde el navegador,
 * sin pasar por el servidor Express.
 *
 * La API key se guarda en localStorage del usuario.
 */

const STORAGE_KEY = 'zola_gemini_key'
const MODEL = 'gemini-3.5-flash'

export const getGeminiKey = () => localStorage.getItem(STORAGE_KEY) || ''

export const setGeminiKey = (key) => {
  localStorage.setItem(STORAGE_KEY, key)
}

export const hasGeminiKey = () => getGeminiKey().length > 0

export const clearGeminiKey = () => localStorage.removeItem(STORAGE_KEY)

/**
 * Llama a la API de Gemini con un prompt de texto.
 * Replica exactamente el comportamiento del callGemini del servidor.
 *
 * @param {string} prompt - El texto del prompt
 * @returns {string} - La respuesta de texto de Gemini
 * @throws {Error} - Si no hay key, si la API falla, o si la respuesta es vacía
 */
export const callGemini = async (prompt) => {
  const apiKey = getGeminiKey()
  if (!apiKey) throw new Error('API key de Gemini no configurada')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  )

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${errBody}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!text) throw new Error('El agente devolvió respuesta vacía')
  return text
}

/**
 * Verifica que la API key funcione haciendo una llamada de prueba.
 * @returns {Promise<boolean>} true si la key es válida
 */
export const testGeminiKey = async () => {
  try {
    const response = await callGemini('Responde solo "ok"')
    return response.toLowerCase().includes('ok')
  } catch {
    return false
  }
}
