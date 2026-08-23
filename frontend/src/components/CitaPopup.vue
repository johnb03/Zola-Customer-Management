<script setup>
import { ref, watch, computed } from 'vue'
import { confirmar } from '../composables/useConfirm.js'

const props = defineProps({
  cita: { type: Object, default: null },
})
const emit = defineEmits(['cerrar', 'completar', 'eliminar', 'guardar', 'guardarCobro'])

const esCobro = computed(() => props.cita?._tipo === 'cobro')

const editando = ref(false)
const form = ref({ Fecha: '', Motivo: '', Monto: '' })

watch(
  () => props.cita,
  (cita) => {
    editando.value = false
    if (cita) {
      if (cita._tipo === 'cobro') {
        form.value.Fecha = cita.Fecha_Cobro || ''
        form.value.Monto = cita.Monto ?? ''
        form.value.Motivo = ''
      } else {
        form.value.Fecha = cita.Fecha || ''
        form.value.Motivo = cita.Motivo || ''
        form.value.Monto = ''
      }
    }
  },
)

const estadoTone = (s) => {
  const e = String(s || '').toLowerCase()
  if (['completada', 'realizada', 'confirmada'].includes(e)) return 'success'
  if (['cancelada', 'no asistió'].includes(e)) return 'danger'
  return 'warning'
}

const estadoLabel = computed(() => {
  const c = props.cita
  if (!c) return 'pendiente'
  if (c._tipo === 'cobro') {
    return c._tono === 'atrasado' ? 'Vencido' : c._tono === 'esta-semana' ? 'Esta semana' : 'Pendiente'
  }
  return String(c.Estado || 'pendiente')
})

const estadoTono = computed(() => {
  const c = props.cita
  if (!c) return 'warning'
  if (c._tipo === 'cobro') {
    return c._tono === 'atrasado' ? 'danger' : c._tono === 'esta-semana' ? 'warning' : 'success'
  }
  return estadoTone(c.Estado)
})

const abrirEdicion = () => {
  const c = props.cita
  if (!c) return
  if (c._tipo === 'cobro') {
    form.value.Fecha = c.Fecha_Cobro || ''
    form.value.Monto = c.Monto ?? ''
  } else {
    form.value.Fecha = c.Fecha || ''
    form.value.Motivo = c.Motivo || ''
  }
  editando.value = true
}

const cancelarEdicion = () => {
  editando.value = false
}

const guardarEdicion = () => {
  if (esCobro.value) {
    emit('guardarCobro', { Fecha_Cobro: form.value.Fecha, Monto: form.value.Monto })
  } else {
    emit('guardar', { Fecha: form.value.Fecha, Motivo: form.value.Motivo })
  }
  editando.value = false
}

const completar = () => {
  emit('completar')
}

const eliminar = async () => {
  if (!props.cita) return
  const ok = await confirmar({
    titulo: 'Eliminar cita',
    mensaje: `¿Eliminar la cita de "${props.cita.Establecimiento}"?`,
  })
  if (!ok) return
  emit('eliminar')
}

const cerrar = () => emit('cerrar')
</script>

<template>
  <Teleport to="body">
    <Transition name="cita-pop">
      <div v-if="cita" class="cp-backdrop" @click.self="cerrar">
        <div class="cp-card" role="dialog" aria-modal="true" aria-label="Detalles de la cita">
          <!-- Header: detalles + iconos de acción -->
          <div class="cp-header">
            <h3 class="cp-title">{{ esCobro ? 'Detalles de cobro' : 'Detalles' }}</h3>
            <div class="cp-actions">
              <button type="button" class="cp-icon" title="Editar tarea" @click="abrirEdicion">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button v-if="!esCobro" type="button" class="cp-icon" title="Eliminar" @click="eliminar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
              <button v-if="!esCobro && cita.Estado === 'pendiente'" type="button" class="cp-icon cp-icon-success" title="Completar" @click="completar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
              <button type="button" class="cp-icon" title="Cerrar" @click="cerrar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          <!-- Body: detalles o edición -->
          <div class="cp-body">
            <template v-if="!editando">
              <template v-if="esCobro">
                <div class="cp-row">
                  <span class="cp-label">Cliente</span>
                  <span class="cp-value cp-value-lg">{{ cita.Nombre }}</span>
                </div>
                <div class="cp-row">
                  <span class="cp-label">Dirección</span>
                  <span class="cp-value">{{ cita.Direccion || '—' }}</span>
                </div>
                <div class="cp-row">
                  <span class="cp-label">Monto</span>
                  <span class="cp-value">${{ cita.Monto || '0' }}</span>
                </div>
                <div class="cp-row">
                  <span class="cp-label">Día de cobro</span>
                  <span class="cp-value">{{ cita.Fecha_Cobro }}</span>
                </div>
              </template>
              <template v-else>
                <div class="cp-row">
                  <span class="cp-label">Establecimiento</span>
                  <span class="cp-value cp-value-lg">{{ cita.Establecimiento }}</span>
                </div>
                <div class="cp-row">
                  <span class="cp-label">Motivo</span>
                  <span class="cp-value">{{ cita.Motivo || '—' }}</span>
                </div>
                <div class="cp-row">
                  <span class="cp-label">Fecha</span>
                  <span class="cp-value">{{ cita.Fecha }}</span>
                </div>
              </template>
              <div class="cp-row">
                <span class="cp-label">Estado</span>
                <span class="cp-value">
                  <span class="status" :class="`tone-${estadoTono}`">
                    <span class="dot" aria-hidden="true"></span>
                    {{ estadoLabel }}
                  </span>
                </span>
              </div>
            </template>

            <template v-else>
              <label class="field">
                <span class="field-label">{{ esCobro ? 'Día de cobro' : 'Fecha' }}</span>
                <input v-model="form.Fecha" type="date" class="input" />
              </label>
              <label v-if="esCobro" class="field">
                <span class="field-label">Monto</span>
                <input v-model="form.Monto" type="number" min="0" step="0.01" class="input" />
              </label>
              <label v-else class="field">
                <span class="field-label">Motivo / Nota</span>
                <input v-model="form.Motivo" type="text" class="input" placeholder="Nota de la cita" />
              </label>
              <div class="cp-edit-actions">
                <button type="button" class="btn btn-ghost btn-sm" @click="cancelarEdicion">Cancelar</button>
                <button type="button" class="btn btn-gold-outline btn-sm" @click="guardarEdicion">
                  {{ esCobro ? 'Guardar fecha' : 'Guardar' }}
                </button>
              </div>
            </template>
          </div>

          <!-- Footer: botón completada (solo citas pendientes) -->
          <div v-if="!esCobro" class="cp-footer">
            <button v-if="cita.Estado === 'pendiente'" type="button" class="btn btn-sm" @click="completar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Completada
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.cp-card {
  width: 100%;
  max-width: 480px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

/* ── Header ── */
.cp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.cp-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.cp-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cp-icon {
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  padding: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}

.cp-icon:hover {
  color: var(--accent-gold);
  border-color: var(--accent-gold);
}

.cp-icon-success:hover {
  color: var(--status-success);
  border-color: var(--status-success);
}

/* ── Body ── */
.cp-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cp-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cp-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.cp-value {
  font-size: 15px;
  color: var(--text-primary);
}

.cp-value-lg {
  font-size: 17px;
  font-weight: 700;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.tone-warning .dot {
  background: var(--status-warning);
}

.tone-success .dot {
  background: var(--status-success);
}

.tone-danger .dot {
  background: var(--status-danger);
}

.cp-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* ── Footer ── */
.cp-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-base);
}

/* ── Form (clases locales consistentes con las vistas) ── */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.input {
  width: 100%;
  background: var(--bg-base);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
}

.input:focus {
  outline: none;
  border-color: var(--accent-gold);
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

/* ── Transición ── */
.cita-pop-enter-active,
.cita-pop-leave-active {
  transition: opacity 180ms ease;
}

.cita-pop-enter-active .cp-card,
.cita-pop-leave-active .cp-card {
  transition: transform 180ms ease, opacity 180ms ease;
}

.cita-pop-enter-from,
.cita-pop-leave-to {
  opacity: 0;
}

.cita-pop-enter-from .cp-card {
  transform: scale(0.95) translateY(8px);
  opacity: 0;
}

.cita-pop-leave-to .cp-card {
  transform: scale(0.97);
  opacity: 0;
}

@media (max-width: 480px) {
  .cp-actions {
    gap: 4px;
  }

  .cp-icon {
    padding: 5px;
  }
}
</style>