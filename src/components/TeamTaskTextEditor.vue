<script setup>
import UiIcon from './UiIcon.vue';
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
const props = defineProps({ modelValue: String, busy: Boolean, error: String });
const emit = defineEmits(['update:modelValue','save']);
const root = ref(null), field = ref(null);
function outside(event) {
  if (root.value?.contains(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.type === 'click' && !props.busy) emit('save');
}
function enter(event) {
  if (event.isComposing || event.shiftKey) return;
  event.preventDefault();
  if (!props.busy) emit('save');
}
function grow() { if (field.value) { field.value.style.height = 'auto'; field.value.style.height = field.value.scrollHeight + 'px'; } }
onMounted(async () => {
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('click', outside, true);
  await nextTick(); grow(); field.value?.focus({ preventScroll: true });
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('click', outside, true);
  field.value?.blur();
});
</script>
<template>
  <div ref="root" class="task-text-editor">
    <textarea ref="field" :value="modelValue" :readonly="busy" aria-label="Описание задачи" maxlength="10000" rows="5" @input="emit('update:modelValue', $event.target.value); grow()" @keydown.enter="enter" />
    <button type="button" class="editor-save" :disabled="busy" @click="emit('save')"><UiIcon name="check" />Готово</button>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.task-text-editor { width: 100%; min-width: 0; }
.task-text-editor textarea[aria-label] { display: block; box-sizing: border-box; width: 100%; min-width: 0; min-height: 120px; max-height: min(360px,45dvh); margin: 0; padding: 10px; resize: none; border: 1px solid var(--codex-pane-accent,var(--color-primary)) !important; border-radius: 8px; outline: none !important; box-shadow: none !important; background: var(--codex-pane-surface,var(--color-background)); color: var(--codex-pane-text,var(--color-text)); font: inherit; font-size: 16px; line-height: 24px; }
.task-text-editor textarea[aria-label]:focus { outline: none !important; box-shadow: none !important; }
.task-text-editor .editor-save { display: none; margin: 4px 0 0 auto; min-height: 32px; align-items: center; gap: 4px; padding: 4px 0 4px 8px; border: 0; background: transparent; font: inherit; font-size: 12px; color: var(--codex-pane-accent,var(--color-primary)); cursor: pointer; }
.editor-save .ui-icon { width: 14px; height: 14px; }
@media (hover:hover) and (pointer:fine) { .task-text-editor .editor-save { display: flex; } }
@media (max-width:767px), (pointer:coarse) { .task-text-editor .editor-save { display: flex; width: fit-content; min-width: 44px; min-height: 44px; margin: 4px auto 0 0; padding: 4px 8px 4px 0; } }
.task-text-editor p { margin: 0; padding: 8px 0; color: var(--color-danger,#b24f45); font-size: 12px; }
</style>
