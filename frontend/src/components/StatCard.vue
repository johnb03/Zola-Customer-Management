<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  tone: { type: String, default: 'default' },
  hint: { type: String, default: '' },
})
</script>

<template>
  <article class="card stat-card" :class="`tone-${tone}`">
    <p class="stat-label">{{ label }}</p>
    <p class="stat-value num">{{ value }}</p>
    <p v-if="hint" class="stat-hint">{{ hint }}</p>
  </article>
</template>

<style scoped>
.stat-card {
  padding: 18px 20px;
}

.stat-label {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.stat-value {
  margin: 0;
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.stat-hint {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.tone-success .stat-value {
  color: var(--status-success);
}

.tone-warning .stat-value {
  color: var(--status-warning);
}

.tone-danger .stat-value {
  color: var(--status-danger);
}
</style>
