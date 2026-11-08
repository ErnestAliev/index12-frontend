<script setup>
import UiIcon from './UiIcon.vue';
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
const props = defineProps({ modelValue: String, busy: Boolean, error: String });
const emit = defineEmits(['update:modelValue','save']);
const root = ref(null), field = ref(null);
let layoutFrame;
function fitEditor() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    if (!root.value) return;
    const viewport = window.visualViewport;
    const bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight);
    const panelBottom = root.value.closest('.task-panel')?.getBoundingClientRect().bottom || bottom;
    root.value.style.maxHeight = Math.max(80, Math.min(bottom, panelBottom) - root.value.getBoundingClientRect().top - 12) + 'px';
  });
}
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
function grow() {
  if (field.value) { field.value.style.height = 'auto'; field.value.style.height = field.value.scrollHeight + 'px'; }
  fitEditor();
}
onMounted(async () => {
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('click', outside, true);
  window.addEventListener('resize', fitEditor);
  window.visualViewport?.addEventListener('resize', fitEditor);
  window.visualViewport?.addEventListener('scroll', fitEditor);
  await nextTick(); grow(); field.value?.focus({ preventScroll: true });
});
onBeforeUnmount(() => {
  cancelAnimationFrame(layoutFrame);
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('click', outside, true);
  window.removeEventListener('resize', fitEditor);
  window.visualViewport?.removeEventListener('resize', fitEditor);
  window.visualViewport?.removeEventListener('scroll', fitEditor);
  field.value?.blur();
});
</script>
<template>
  <div ref="root" class="task-text-editor">
    <textarea ref="field" :value="modelValue" :readonly="busy" aria-label="Описание задачи" maxlength="10000" rows="5" @input="emit('update:modelValue', $event.target.value); grow()" @keydown.enter="enter" />
    <button type="button" class="editor-save" :disabled="busy" @pointerdown.prevent @click="emit('save')"><UiIcon name="check" />Готово</button>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.task-text-editor { position: relative; z-index: 22; isolation: isolate; display: flex; flex-direction: column; box-sizing: border-box; width: 100%; min-width: 0; min-height: 0; flex-shrink: 1; overflow: hidden; border: 1px solid var(--codex-pane-accent,var(--color-primary)); border-radius: 8px; background: var(--codex-pane-surface,var(--color-background)); }
.task-text-editor textarea[aria-label] { display: block; box-sizing: border-box; width: 100%; min-width: 0; min-height: 32px; max-height: min(360px,45dvh); flex: 0 1 auto; margin: 0; padding: 10px; resize: none; overflow-y: auto; border: 0 !important; border-radius: 0; outline: none !important; box-shadow: none !important; background: transparent; color: var(--codex-pane-text,var(--color-text)); font: inherit; font-size: 16px; line-height: 24px; }
.task-text-editor textarea[aria-label]:focus { outline: none !important; box-shadow: none !important; }
.task-text-editor .editor-save { position: relative; z-index: 1; display: flex; flex: none; margin: 0 8px 0 auto; min-height: 32px; align-items: center; gap: 4px; padding: 4px 0 4px 8px; border: 0 !important; background: transparent !important; box-shadow: none !important; font: inherit; font-size: 12px; color: var(--codex-pane-accent,var(--color-primary)) !important; cursor: pointer; }
.editor-save .ui-icon { width: 14px; height: 14px; }
@media (max-width:767px), (pointer:coarse) { .task-text-editor .editor-save { min-width: 44px; min-height: 44px; margin: 0 auto 0 10px; padding: 4px 8px 4px 0; } }
:global(html[data-theme="light"] .task-text-editor .editor-save) { color: var(--light-accent,#168447) !important; }
.task-text-editor p { flex: 0 1 auto; min-height: 0; overflow-y: auto; margin: 0; padding: 4px 10px; color: var(--color-danger,#b24f45); font-size: 12px; }
</style>
