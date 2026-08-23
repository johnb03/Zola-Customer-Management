<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: 'al-dia' },
  label: { type: String, default: '' },
})

const labels = {
  'al-dia': 'Al día',
  'esta-semana': 'Esta semana',
  atrasado: 'Atrasado',
}

const text = computed(() => props.label || labels[props.status] || props.status)
</script>

<template>
  <span class="status-dot" :class="`status-${status}`">
    <span class="dot" aria-hidden="true"></span>
    <span v-if="text" class="label">{{ text }}</span>
  </span>
</template>

<style scoped>
.status-dot {
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
  flex-shrink: 0;
}

.status-al-dia .dot {
  background: var(--status-success);
}

.status-esta-semana .dot {
  background: var(--status-warning);
}

.status-atrasado .dot {
  background: var(--status-danger);
}

.label {
  color: var(--text-secondary);
}
</style>
