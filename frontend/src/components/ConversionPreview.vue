<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  visitas: { type: Array, default: () => [] },
  notaId: { type: String, default: '' },
  notaFecha: { type: String, default: '' },
  reemplazadas: { type: Number, default: 0 },
})

const emit = defineEmits(['close', 'confirm'])

const filas = ref(
  props.visitas.map((v) => ({ ...v, _deleted: false })),
)

const filasVisibles = computed(() => filas.value.length)
const filasActivas = computed(() => filas.value.filter((f) => !f._deleted))

const toggleDelete = (idx) => {
  filas.value[idx]._deleted = !filas.value[idx]._deleted
}

const confirmar = () => {
  emit('confirm', filasActivas.value)
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="preview-modal">
      <!-- Header -->
      <div class="preview-header">
        <h2 class="preview-title">Vista previa de visitas</h2>
        <button class="close-btn" @click="emit('close')" title="Cerrar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <!-- Subtitle -->
      <p class="preview-subtitle">
        El agente detectó {{ filasVisibles }} visita{{ filasVisibles !== 1 ? 's' : '' }} en tu nota.
        Revisa, elimina las que no apliquen, y confirma para guardar.
      </p>

      <!-- Warning: reemplazo -->
      <div v-if="reemplazadas > 0" class="preview-warning">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <path d="M12 9v4"/><path d="M12 17h.01"/>
        </svg>
        <span>Se reemplazarán {{ reemplazadas }} visita{{ reemplazadas !== 1 ? 's' : '' }} existente{{ reemplazadas !== 1 ? 's' : '' }} de esta fecha.</span>
      </div>

      <!-- Table header -->
      <div class="table-header">
        <span class="col-establecimiento">Establecimiento</span>
        <span class="col-pedido">Pedido</span>
        <span class="col-detalle">Detalle</span>
        <span class="col-proximo">Próximo paso</span>
        <span class="col-actions"></span>
      </div>

      <!-- Table rows -->
      <div class="table-body">
        <div
          v-for="(fila, idx) in filas"
          :key="idx"
          class="table-row"
          :class="{ deleted: fila._deleted }"
        >
          <span class="col-establecimiento">{{ fila.establecimiento }}</span>
          <span class="col-pedido">
            <span class="pedido-badge" :class="fila.pedido === 'Sí' ? 'si' : 'no'">
              {{ fila.pedido === 'Sí' ? 'Si' : 'No' }}
            </span>
          </span>
          <span class="col-detalle">{{ fila.detalle_pedido || fila.productos_presentados }}</span>
          <span class="col-proximo">{{ fila.proximo_paso }}</span>
          <span class="col-actions">
            <span class="row-actions">
              <button
                v-if="!fila._deleted"
                class="action-btn edit-btn"
                title="Editar"
                @click="emit('edit', idx)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  <path d="m15 5 4 4" />
                </svg>
              </button>
              <button
                class="action-btn"
                :class="fila._deleted ? 'restore-btn' : 'delete-btn'"
                :title="fila._deleted ? 'Restaurar' : 'Eliminar'"
                @click="toggleDelete(idx)"
              >
                <!-- restore icon -->
                <svg v-if="fila._deleted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                <!-- delete icon -->
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </span>
          </span>
        </div>
      </div>

      <!-- Footer -->
      <div class="preview-footer">
        <button class="btn-cancel" @click="emit('close')">Cancelar</button>
        <button class="btn-confirm" @click="confirmar" :disabled="filasActivas.length === 0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Confirmar y guardar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.preview-modal {
  width: 720px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
}

.preview-title {
  font-family: 'Satoshi', sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--bg-surface);
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 120ms;
}
.close-btn:hover { color: var(--text-primary); }

.preview-subtitle {
  font-family: 'Satoshi', sans-serif;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--text-secondary);
  padding: 0 24px 12px;
  margin: 0;
}

.preview-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  margin: 0 24px 12px;
  background: rgba(201, 138, 59, 0.12);
  border: 1px solid rgba(201, 138, 59, 0.3);
  border-radius: 8px;
  color: var(--status-warning);
  font-family: 'Satoshi', sans-serif;
  font-size: 13px;
  font-weight: 500;
}

.table-header {
  display: flex;
  align-items: center;
  padding: 10px 24px;
  background: var(--bg-surface);
}

.table-header span {
  font-family: 'Satoshi', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.table-body {
  flex: 1;
  overflow-y: auto;
}

.table-row {
  display: flex;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 0.5px solid var(--border);
  transition: opacity 150ms;
}
.table-row.deleted {
  opacity: 0.35;
}

.col-establecimiento {
  flex: 1;
  font-family: 'Satoshi', sans-serif;
  font-size: 13px;
  font-weight: 400;
  color: var(--text-primary);
  min-width: 0;
}

.col-pedido {
  width: 80px;
  display: flex;
  justify-content: center;
}

.pedido-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  border-radius: 4px;
  font-family: 'Satoshi', sans-serif;
  font-size: 12px;
  font-weight: 600;
}
.pedido-badge.si {
  background: rgba(107, 143, 71, 0.2);
  color: var(--status-success);
}
.pedido-badge.no {
  background: rgba(201, 138, 59, 0.2);
  color: var(--status-warning);
}

.col-detalle {
  flex: 1;
  font-family: 'Satoshi', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
  min-width: 0;
}

.col-proximo {
  flex: 1;
  font-family: 'Satoshi', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
  min-width: 0;
}

.col-actions {
  width: 72px;
  display: flex;
  justify-content: flex-end;
}

.row-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 120ms;
}
.action-btn:hover { background: rgba(255, 255, 255, 0.05); }
.edit-btn { color: var(--text-secondary); }
.delete-btn { color: var(--status-danger); }
.restore-btn { color: var(--accent-gold); }

.preview-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

.btn-cancel {
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 10px 20px;
}
.btn-cancel:hover { color: var(--text-primary); }

.btn-confirm {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: 'Satoshi', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--bg-base);
  background: var(--accent-gold);
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  cursor: pointer;
  transition: opacity 120ms;
}
.btn-confirm:hover { opacity: 0.9; }
.btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }

@media (max-width: 768px) {
  .preview-modal {
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }
  .col-detalle, .col-proximo { display: none; }
  .table-header .col-detalle,
  .table-header .col-proximo { display: none; }
}
</style>
