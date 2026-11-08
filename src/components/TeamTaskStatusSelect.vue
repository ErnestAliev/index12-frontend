<script setup>
import { computed } from 'vue';
import UiIcon from './UiIcon.vue';
import { taskStatuses } from '@/utils/teamTasks';
const props = defineProps({ modelValue: String, disabled: Boolean, compact: Boolean });
const statusLabel = computed(() => taskStatuses.find(s => s.id === props.modelValue)?.label || "Новая");
const emit = defineEmits(['update:modelValue']);
</script>
<template>
  <span class="task-status-select" :class="{ 'is-compact': compact }" :data-status="modelValue">
    <span v-if="compact" class="status-measure" aria-hidden="true">{{ statusLabel }}</span>
    <select aria-label="Статус задачи" :value="modelValue" :disabled="disabled" @change="emit('update:modelValue', $event.target.value)">
      <option value="open">Новая</option>
      <option v-for="state in taskStatuses.slice(1)" :key="state.id" :value="state.id">{{ state.label }}</option>
    </select>
    <UiIcon name="chevron-down" />
  </span>
</template>
<style scoped>
.task-status-select { display: inline-flex; position: relative; flex: none; align-items: center; max-width: 100%; color: var(--codex-pane-text,var(--color-text)); }
.task-status-select > select[aria-label] { appearance: none; -webkit-appearance: none; box-sizing: border-box; width: 116px; min-height: 32px; margin: 0; padding: 5px 26px 5px 10px; border: 1px solid var(--codex-pane-border,var(--color-border)); border-radius: 8px; background: var(--codex-pane-surface,var(--color-background-soft)); color: inherit; font: inherit; font-size: 12px; line-height: 20px; cursor: pointer; background-image: none !important; }
.task-status-select .ui-icon { pointer-events: none; position: absolute; right: 8px; width: 12px; height: 12px; }
.task-status-select[data-status=done] select { color: var(--codex-pane-accent,var(--color-primary)); }
.task-status-select select:disabled { opacity: .5; cursor: default; }
.task-status-select.is-compact { display: inline-grid; justify-self: start; align-self: start; }
.status-measure { box-sizing: border-box; border: 1px solid transparent; visibility: hidden; font-size: 11px; line-height: 18px; padding: 3px 24px 3px 8px; white-space: nowrap; }
.task-status-select.is-compact > select[aria-label] { position: absolute; inset: 0; width: 100%; min-height: 26px; height: 26px; padding: 3px 24px 3px 8px; border-radius: 7px; font-size: 11px; line-height: 18px; }
.task-status-select.is-compact .ui-icon { right: 7px; width: 11px; height: 11px; }
</style>
