<script setup>
import UiIcon from './UiIcon.vue';
import { taskStatuses } from '@/utils/teamTasks';
defineProps({ modelValue: String, disabled: Boolean });
const emit = defineEmits(['update:modelValue']);
</script>
<template>
  <span class="task-status-select" :data-status="modelValue">
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
</style>
