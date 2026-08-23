<script setup>
import { ref, nextTick } from 'vue'
import { parsearTextoVisitas } from '../utils/parsearReporte.js'

const emit = defineEmits(['visitas', 'guardar'])

const mensajes = ref([])
const texto = ref('')
const area = ref(null)
const parseando = ref(false)

const scrollAbajo = () => {
  nextTick(() => {
    if (area.value) area.value.scrollTop = area.value.scrollHeight
  })
}

const enviar = () => {
  const t = texto.value.trim()
  if (!t || parseando.value) return
  parseando.value = true
  mensajes.value.push({ rol: 'user', texto: t })
  texto.value = ''
  try {
    const visitas = parsearTextoVisitas(t)
    if (visitas.length > 0) {
      mensajes.value.push({
        rol: 'agent',
        texto: `Encontré ${visitas.length} visita${visitas.length === 1 ? '' : 's'}. Revisá el resumen y guardá cuando estés conforme.`,
        visitas,
      })
      emit('visitas', visitas)
    } else {
      mensajes.value.push({
        rol: 'agent',
        texto: 'No pude identificar visitas en ese texto. Probá separando cada visita con guiones (----) y escribiendo el nombre del establecimiento y la hora.',
      })
    }
  } catch (e) {
    mensajes.value.push({ rol: 'agent', texto: `Error al procesar el texto: ${e.message}` })
  } finally {
    parseando.value = false
    scrollAbajo()
  }
}

const guardarVisitas = (visitas) => {
  emit('guardar', visitas)
}
</script>

<template>
  <article class="card chat-card">
    <div class="chat-header">
      <div>
        <h2 class="panel-title">Agente de Reporte Diario</h2>
        <p class="chat-subtitle">
          Pegá el texto de tu recorrido (establecimientos, horas, personas, notas) y el agente lo
          estructura en visitas. Podés editar cada visita después de guardarla.
        </p>
      </div>
      <span class="chat-badge">IA</span>
    </div>

    <div ref="area" class="chat-area">
      <div v-if="!mensajes.length" class="chat-empty">
        <p>Sin mensajes todavía.</p>
        <p class="chat-empty-sub">
          Ejemplo: <em>Colmado La esperilla 3:25 Pase a cobrar, pagará el lunes ---- Cheung heng 3:43 Pase a cobrar</em>
        </p>
      </div>

      <div v-for="(m, i) in mensajes" :key="i" class="chat-msg" :class="m.rol === 'user' ? 'msg-user' : 'msg-agent'">
        <p class="msg-text">{{ m.texto }}</p>
        <template v-if="m.visitas && m.visitas.length">
          <div class="msg-visitas">
            <div v-for="(v, vi) in m.visitas" :key="vi" class="msg-visita-row">
              <span class="mv-est">{{ v.establecimiento || '—' }}</span>
              <span class="mv-hora">{{ v.hora_visita || '—' }}</span>
              <span class="mv-paso">{{ v.proximo_paso || '—' }}</span>
            </div>
          </div>
          <button type="button" class="btn btn-gold-outline btn-sm msg-guardar" @click="guardarVisitas(m.visitas)">
            Guardar {{ m.visitas.length }} visita{{ m.visitas.length === 1 ? '' : 's' }}
          </button>
        </template>
      </div>
    </div>

    <div class="chat-input-row">
      <textarea
        v-model="texto"
        class="input chat-input"
        rows="3"
        placeholder="Pegá el texto del día… (cada visita separada por ----)"
        @keydown.ctrl.enter="enviar"
        @keydown.meta.enter="enviar"
      ></textarea>
      <button type="button" class="btn chat-send" :disabled="!texto.trim() || parseando" @click="enviar">
        {{ parseando ? 'Procesando…' : 'Enviar' }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.chat-card {
  padding: 20px 24px;
  margin-bottom: 16px;
}

.chat-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 4px;
}

.chat-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45;
}

.chat-badge {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(201, 162, 39, 0.14);
  border: 1px solid var(--accent-gold);
  color: var(--accent-gold);
  font-size: 12px;
  font-weight: 700;
}

.chat-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 340px;
  overflow-y: auto;
  padding: 4px 2px;
  margin-bottom: 12px;
}

.chat-empty {
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 24px 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
}

.chat-empty-sub {
  margin: 6px 0 0;
  font-size: 12px;
  opacity: 0.8;
}

.chat-msg {
  max-width: 88%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
}

.msg-user {
  align-self: flex-end;
  background: rgba(201, 162, 39, 0.12);
  border: 1px solid rgba(201, 162, 39, 0.35);
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.msg-agent {
  align-self: flex-start;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.msg-text {
  margin: 0;
  white-space: pre-wrap;
}

.msg-visitas {
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.msg-visita-row {
  display: grid;
  grid-template-columns: 1fr 60px 100px;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}

.msg-visita-row:last-child {
  border-bottom: 0;
}

.mv-est {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mv-hora {
  color: var(--text-secondary);
}

.mv-paso {
  color: var(--accent-gold);
  font-size: 11px;
  text-align: right;
}

.msg-guardar {
  margin-top: 10px;
}

.chat-input-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.chat-input {
  flex: 1;
  resize: vertical;
}

.chat-send {
  flex-shrink: 0;
  white-space: nowrap;
}

.chat-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 8px;
}

.btn-gold-outline {
  background: transparent;
  border: 1.5px solid var(--accent-gold);
  color: var(--accent-gold);
}

.btn-gold-outline:hover {
  background: rgba(201, 162, 39, 0.1);
  filter: none;
}
</style>