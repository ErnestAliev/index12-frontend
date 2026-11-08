<script setup>
import { useInputModality } from '@/composables/useInputModality';
import { computed } from 'vue';
import UiIcon from './UiIcon.vue';
import { taskStatuses } from '@/utils/teamTasks';
const props = defineProps({ modelValue: String, disabled: Boolean, compact: Boolean });
const statusLabel = computed(() => taskStatuses.find(s => s.id === props.modelValue)?.label || "Новая");
const keyboardNavigation = useInputModality();
const emit = defineEmits(['update:modelValue']);
</script>
<template>
  <span class="task-status-select" :class="{ 'is-compact': compact, 'status-keyboard': keyboardNavigation }" :data-status="modelValue">
    <span v-if="compact" class="status-label" aria-hidden="true"><UiIcon name="check" />{{ statusLabel }}</span>
    <select aria-label="Статус задачи" :value="modelValue" :disabled="disabled" @change="emit('update:modelValue', $event.target.value)">
      <option value="open">Новая</option>
      <option v-for="state in taskStatuses.slice(1)" :key="state.id" :value="state.id">{{ state.label }}</option>
    </select>
    <UiIcon v-if="!compact" name="chevron-down" />
  </span>
</template>
<style scoped>
.task-status-select { display: inline-flex; position: relative; flex: none; align-items: center; max-width: 100%; color: var(--codex-pane-text,var(--color-text)); }
.task-status-select > select[aria-label] { appearance: none; -webkit-appearance: none; box-sizing: border-box; width: 116px; min-height: 32px; margin: 0; padding: 5px 26px 5px 10px; border: 1px solid var(--codex-pane-border,var(--color-border)); border-radius: 8px; background: var(--codex-pane-surface,var(--color-background-soft)); color: inherit; font: inherit; font-size: 12px; line-height: 20px; cursor: pointer; background-image: none !important; }
.task-status-select .ui-icon { pointer-events: none; position: absolute; right: 8px; width: 12px; height: 12px; }
.task-status-select[data-status=done] select { color: var(--codex-pane-accent,var(--color-primary)); }
.task-status-select select:disabled { opacity: .5; cursor: default; }
.task-status-select.is-compact { display: inline-flex; justify-self: start; align-self: start; min-height: 26px; font-size: 12px; line-height: 20px; color: var(--codex-pane-accent,var(--color-primary)); }
.status-label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; padding: 3px 0; }
.task-status-select.is-compact > select[aria-label] { position: absolute; inset: 0; width: 100%; min-height: 26px; height: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; opacity: 0; cursor: pointer; }
.task-status-select.is-compact .ui-icon { position: static; width: 13px; height: 13px; }
.task-status-select.status-keyboard.is-compact:focus-within { outline: 1px solid var(--codex-pane-accent,var(--color-primary)); outline-offset: 2px; }
.task-status-select[data-status=delayed] { color: var(--color-danger,#b24f45); }
</style>
