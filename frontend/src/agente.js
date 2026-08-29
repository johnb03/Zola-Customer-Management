/**
 * agente.js — Cliente de IA multi-proveedor (browser-side).
 * Soporta Gemini, Claude, ChatGPT, DeepSeek y proveedores custom.
 * La configuración (provider, key, modelo) se guarda en localStorage.
 */

// ─── Storage keys ─────────────────────────────────────────────────
const STORAGE_PREFIX = 'zola_agente_'
const STORAGE_PROVIDER = STORAGE_PREFIX + 'provider'
const STORAGE_KEY = STORAGE_PREFIX + 'key'
const STORAGE_MODEL = STORAGE_PREFIX + 'model'
const STORAGE_BASE_URL = STORAGE_PREFIX + 'base_url'

// ─── Providers ────────────────────────────────────────────────────
export const PROVIDERS = {
  gemini: { name: 'Gemini', models: ['gemini-2.5-flash', 'gemini-3-flash', 'gemini-3.1-flash-lite'] },
  claude: { name: 'Claude', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-opus-4-20250514'] },
  openai: { name: 'ChatGPT', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'] },
  deepseek: { name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
  custom: { name: 'Otro', models: [] },
}

const DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  claude: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  deepseek: 'deepseek-chat',
  custom: '',
}

// ─── Config ───────────────────────────────────────────────────────

export const getAgenteConfig = () => ({
  provider: localStorage.getItem(STORAGE_PROVIDER) || 'gemini',
  apiKey: localStorage.getItem(STORAGE_KEY) || '',
  model: localStorage.getItem(STORAGE_MODEL) || DEFAULT_MODELS[localStorage.getItem(STORAGE_PROVIDER) || 'gemini'] || '',
  baseUrl: localStorage.getItem(STORAGE_BASE_URL) || '',
})

export const setAgenteConfig = ({ provider, apiKey, model, baseUrl }) => {
  if (provider != null) localStorage.setItem(STORAGE_PROVIDER, provider)
  if (apiKey != null) localStorage.setItem(STORAGE_KEY, apiKey)
  if (model != null) localStorage.setItem(STORAGE_MODEL, model)
  if (baseUrl != null) localStorage.setItem(STORAGE_BASE_URL, baseUrl)
}

export const hasAgenteConfig = () => (localStorage.getItem(STORAGE_KEY) || '').length > 0

export const clearAgenteConfig = () => {
  localStorage.removeItem(STORAGE_PROVIDER)
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(STORAGE_MODEL)
  localStorage.removeItem(STORAGE_BASE_URL)
}

// Backward compat
export const getGeminiKey = () => getAgenteConfig().apiKey
export const setGeminiKey = (key) => setAgenteConfig({ apiKey: key })
export const hasGeminiKey = () => hasAgenteConfig()
export const clearGeminiKey = () => clearAgenteConfig()

// ─── Provider helpers ─────────────────────────────────────────────

function getBaseUrl(provider, customBaseUrl) {
  const urls = {
    gemini: 'https://generativelanguage.googleapis.com',
    claude: 'https://api.anthropic.com',
    openai: 'https://api.openai.com',
    deepseek: 'https://api.deepseek.com',
  }
  if (provider === 'custom') return customBaseUrl.replace(/\/+$/, '')
  return urls[provider] || ''
}

function getProviderDefaults(provider) {
  return { model: DEFAULT_MODELS[provider] || '', baseUrl: getBaseUrl(provider) }
}

// ─── API format implementations ───────────────────────────────────

async function callGeminiFormat(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const response = await fetch(url, {
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
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${errBody}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!text) throw new Error('El agente devolvió respuesta vacía')
  return text
}

async function callClaudeFormat(apiKey, model, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8192,
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errBody}`)
  }

  const data = await response.json()
  const text = data?.content?.[0]?.text || ''
  if (!text) throw new Error('El agente devolvió respuesta vacía')
  return text
}

async function callOpenAIFormat(apiKey, model, prompt, baseUrl) {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 8192,
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`API error ${response.status}: ${errBody}`)
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content || ''
  if (!text) throw new Error('El agente devolvió respuesta vacía')
  return text
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Llama al agente IA configurado, detectando el proveedor automáticamente.
 * @param {string} prompt - El texto del prompt
 * @returns {Promise<string>} - La respuesta de texto
 * @throws {Error} - Si no hay key o la API falla
 */
export const callAgente = async (prompt) => {
  const { provider, apiKey, model, baseUrl } = getAgenteConfig()
  if (!apiKey) throw new Error('API key del agente no configurada')

  switch (provider) {
    case 'gemini':
      return callGeminiFormat(apiKey, model, prompt)
    case 'claude':
      return callClaudeFormat(apiKey, model, prompt)
    default:
      return callOpenAIFormat(apiKey, model, prompt, getBaseUrl(provider, baseUrl))
  }
}

/**
 * Verifica que la API key funcione haciendo una llamada de prueba.
 * @returns {Promise<boolean>} true si la key es válida
 */
export const testAgenteKey = async () => {
  try {
    const response = await callAgente('Responde solo "ok"')
    return response.toLowerCase().includes('ok')
  } catch {
    return false
  }
}

// Backward compat
export const callGemini = callAgente
export const testGeminiKey = testAgenteKey

// ─── Plantilla analysis with Agent ──────────────────────────────────

/**
 * Analiza una plantilla Excel con el agente IA para generar un plan de mapeo.
 * @param {Object} templateInfo - Info extraída estáticamente de la plantilla
 * @param {string} templateInfo.fileName - Nombre del archivo
 * @param {number} templateInfo.headerRowIndex - Fila del header detectada
 * @param {Array} templateInfo.columnas - Columnas del header [{columna, nombre}]
 * @param {Object} templateInfo.namedRanges - Named ranges encontrados
 * @param {Object} templateInfo.visitasTable - Tabla de visitas detectada (auto)
 * @param {string[]} templateInfo.visitFields - Campos de visita disponibles en la DB
 * @returns {Promise<Object>} Plan de mapeo generado por el agente
 */
export const analizarPlantillaConAgente = async (templateInfo) => {
  const prompt = `Sos un experto en análisis de plantillas Excel para reportes de visitas comerciales.

TEMPLATE INFO:
- Archivo: ${templateInfo.fileName}
- Fila header: ${templateInfo.headerRowIndex}
- Columnas detectadas en header:
${templateInfo.columnas.map(c => `  Col ${c.columna}: "${c.nombre}"`).join('\n')}
- Named ranges encontrados:
${Object.entries(templateInfo.namedRanges || {}).map(([k, v]) => `  ${k}: ${v.range} (hoja: ${v.sheet})`).join('\n') || '  (ninguno)'}
- Tabla de visitas detectada (auto): ${templateInfo.visitasTable ? JSON.stringify(templateInfo.visitasTable, null, 2) : '(ninguna)'}

CAMPOS DE VISITA DISPONIBLES (nombres exactos de la base de datos):
${templateInfo.visitFields.join(', ')}

TAREA: Genera un PLAN DE MAPEO JSON para rellenar esta plantilla con datos de visitas.

DEBE INCLUIR:
1. fixedFields: mapeo de named ranges a campos fijos del encabezado
   - Usar SOLO named ranges que existan en la plantilla
   - Mapear a: Vendedor, Fecha, Zona, Supervisor, Periodo, Filtro, TotalVisitas
   - Si un named range no existe, OMITIRLO (no inventar)

2. visitsTable: cómo llenar la tabla de visitas
   - type: "namedRange" | "autoDetected"
   - Si hay named range "Visitas"/"VisitasTable"/"TablaVisitas"/"DatosVisitas" → type: "namedRange" + range info
   - Si no → type: "autoDetected" + headerRow, dataStartRow, columnas
   - columnas: array de {col, header, field} donde field es uno de los CAMPOS DE VISITA DISPONIBLES o null si no matchea
   - El agente debe inferir el mapeo semántico: ej. header "Razón Social" → field: "Establecimiento"

3. clearingStrategy: cómo limpiar filas excedentes
   - clearExtraRows: true/false
   - maxExtraRows: número (default 20)

FORMATO DE RESPUESTA (SOLO JSON VÁLIDO, SIN MARKDOWN, SIN TEXTO EXTRA):
{
  "fixedFields": {
    "Vendedor": "Vendedor",
    "Fecha": "FechaReporte",
    "Zona": "ZonaRuta",
    "Supervisor": "SupervisorNombre"
  },
  "visitsTable": {
    "type": "namedRange",
    "name": "Visitas",
    "headerRow": 5,
    "dataStartRow": 6,
    "columnas": [
      {"col": 1, "header": "Cliente", "field": "Establecimiento"},
      {"col": 2, "header": "Dirección", "field": "Direccion"},
      {"col": 3, "header": "Producto", "field": "Productos_Presentados"}
    ]
  },
  "clearingStrategy": {"clearExtraRows": true, "maxExtraRows": 20}
}

IMPORTANTE:
- El mapeo "field" DEBE ser EXACTAMENTE uno de los CAMPOS DE VISITA DISPONIBLES
- Si un header no matchea ninguno, poner "field": null
- No inventar named ranges ni columnas que no existan
- Si la tabla auto-detectada no tiene dataStartRow clara, inferir headerRow+1
- Responder SOLO el JSON`

  const response = await callAgente(prompt)
  
  // Parse JSON response
  let plan
  try {
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim()
    plan = JSON.parse(cleaned)
  } catch (e) {
    throw new Error('El agente devolvió un plan inválido: ' + e.message)
  }

  // Validate plan structure
  if (!plan.fixedFields || !plan.visitsTable) {
    throw new Error('Plan del agente incompleto: faltan fixedFields o visitsTable')
  }

  return plan
}
