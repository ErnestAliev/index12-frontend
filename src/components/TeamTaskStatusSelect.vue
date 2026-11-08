<script setup>
import { useInputModality } from '@/composables/useInputModality';
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import UiIcon from './UiIcon.vue';
import { taskStatuses } from '@/utils/teamTasks';
import './teamTaskStatus.css';
const props = defineProps({ modelValue: String, disabled: Boolean, compact: Boolean });
const emit = defineEmits(['update:modelValue']);
const choices = [{ id: 'open', label: 'Новая' }, ...taskStatuses.slice(1)];
const statusLabel = computed(() => choices.find(s => s.id === props.modelValue)?.label || 'Новая');
const keyboardNavigation = useInputModality();
const opened = ref(false), trigger = ref(null), menu = ref(null), active = ref(0), bounds = ref({});
const menuId = useId();
function position() {
  if (!trigger.value) return;
  const box = trigger.value.getBoundingClientRect(), v = window.visualViewport;
  const left = v?.offsetLeft || 0, top = v?.offsetTop || 0;
  const width = Math.min(190, (v?.width || innerWidth) - 16), height = 184;
  const bottom = top + (v?.height || innerHeight);
  bounds.value = {
    left: Math.max(left + 8, Math.min(box.left, left + (v?.width || innerWidth) - width - 8)) + 'px',
    top: Math.max(top + 8, Math.min(box.bottom + 4, bottom - height - 8)) + 'px',
    width: width + 'px',
    maxHeight: Math.max(44, (v?.height || innerHeight) - 16) + 'px',
  };
}
async function show() {
  if (props.disabled) return;
  active.value = Math.max(0, choices.findIndex(s => s.id === props.modelValue));
  position(); opened.value = true;
  await nextTick(); menu.value?.focus({ preventScroll: true });
}
function close(restore = true) {
  opened.value = false;
  if (restore) trigger.value?.focus({ preventScroll: true });
}
function choose(id) { emit('update:modelValue', id); close(); }
function outside(event) {
  if (!menu.value?.contains(event.target) && !trigger.value?.contains(event.target)) close(false);
}
function keys(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    active.value = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (active.value + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length;
  } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(choices[active.value].id); }
  else if (event.key === 'Tab') close();
}
watch(opened, value => {
  const method = value ? 'addEventListener' : 'removeEventListener';
  document[method]('pointerdown', outside, true);
  window[method]('resize', position);
  window[method]('scroll', position, true);
  window.visualViewport?.[method]('resize', position);
  window.visualViewport?.[method]('scroll', position);
});
watch(() => props.disabled, value => { if (value) close(false); });
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('resize', position);
  window.removeEventListener('scroll', position, true);
  window.visualViewport?.removeEventListener('resize', position);
  window.visualViewport?.removeEventListener('scroll', position);
});
</script>
<template>
  <span class="task-status-select" :class="{ 'is-compact': compact, 'status-keyboard': keyboardNavigation }" :data-task-status="modelValue">
    <button ref="trigger" type="button" class="status-trigger" role="combobox" aria-label="Статус задачи" aria-haspopup="listbox" :aria-expanded="opened" :aria-controls="opened ? menuId : undefined" :disabled="disabled" @click="opened ? close() : show()" @keydown.down.prevent="show" @keydown.up.prevent="show">
      <UiIcon v-if="compact" name="check" /><span>{{ statusLabel }}</span><UiIcon v-if="!compact" name="chevron-down" />
    </button>
    <Teleport to="body">
      <div v-if="opened" :id="menuId" ref="menu" class="task-status-menu" :class="{ 'status-keyboard': keyboardNavigation }" role="listbox" aria-label="Статус задачи" tabindex="-1" :aria-activedescendant="menuId + '-' + active" :style="bounds" @keydown="keys">
        <button v-for="(state, index) in choices" :id="menuId + '-' + index" :key="state.id" type="button" role="option" tabindex="-1" :aria-selected="state.id === modelValue" :data-task-status="state.id" :class="{ 'is-active': active === index }" @pointerenter="active = index" @click="choose(state.id)">
          <span class="status-dot" aria-hidden="true" /><span>{{ state.label }}</span><UiIcon v-if="state.id === modelValue" name="check" />
        </button>
      </div>
    </Teleport>
  </span>
</template>
<style scoped>
.task-status-select { display: inline-flex; flex: none; max-width: 100%; color: var(--task-status-color); }
.task-status-select .status-trigger { display: inline-flex; align-items: center; gap: 4px; min-height: 32px; margin: 0; padding: 5px 10px; border: 1px solid var(--codex-pane-border,var(--color-border)); border-radius: 8px; background: var(--codex-pane-surface,var(--color-background-soft)); color: var(--task-status-color); font: inherit; font-size: 12px; line-height: 20px; white-space: nowrap; cursor: pointer; }
.status-trigger .ui-icon { width: 13px; height: 13px; flex: none; }
.status-trigger:disabled { opacity: .5; cursor: default; }
.task-status-select.is-compact { justify-self: start; align-self: start; }
.task-status-select.is-compact .status-trigger { min-height: 26px; padding: 3px 0; border: 0; background: transparent; }
.task-status-select:not(.status-keyboard) .status-trigger:focus { outline: none; box-shadow: none; }
.task-status-select.status-keyboard .status-trigger:focus-visible { outline: 1px solid currentColor; outline-offset: 2px; }
.task-status-menu { position: fixed; z-index: 10000; box-sizing: border-box; overflow: auto; padding: 4px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-background); color: var(--color-text); box-shadow: 0 8px 28px #0003; outline: none; }
.task-status-menu button { display: flex; align-items: center; gap: 8px; box-sizing: border-box; width: 100%; min-height: 44px; margin: 0; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--task-status-color); font: inherit; font-size: 13px; line-height: 20px; text-align: left; cursor: pointer; }
.task-status-menu button.is-active { background: var(--color-background-soft); }
.task-status-menu .status-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; }
.task-status-menu .ui-icon { width: 14px; height: 14px; margin-left: auto; }
.task-status-menu.status-keyboard button.is-active { outline: 1px solid currentColor; outline-offset: -2px; }
</style>
