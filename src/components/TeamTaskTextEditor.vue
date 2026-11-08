<script setup>
import UiIcon from './UiIcon.vue';
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
const props = defineProps({ modelValue: String, busy: Boolean, error: String });
const emit = defineEmits(['update:modelValue','save']);
const root = ref(null), field = ref(null), saveButton = ref(null);
const mobileQuery = window.matchMedia('(max-width:767px), (pointer:coarse)');
const mobile = ref(mobileQuery.matches), savePosition = ref({});
function positionSave() {
  mobile.value = mobileQuery.matches;
  if (!mobile.value || !root.value) return;
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop || 0, left = viewport?.offsetLeft || 0;
  const height = viewport?.height || innerHeight, width = viewport?.width || innerWidth;
  const keyboard = innerHeight - height > 120;
  const rootStyle = getComputedStyle(root.value);
  savePosition.value = {
    left: `max(${Math.max(left + 12, Math.min(root.value.getBoundingClientRect().left, left + width - 100))}px, var(--safe-area-left, 0px))`,
    top: `calc(${top + height - 44}px - ${keyboard ? '12px' : 'var(--safe-bottom-controls, 12px)'})`,
    '--editor-save-color': rootStyle.getPropertyValue('--codex-pane-accent') || rootStyle.getPropertyValue('--color-primary') || '#34c759',
  };
}
function outside(event) {
  if (root.value?.contains(event.target) || saveButton.value?.contains(event.target)) return;
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
  window.addEventListener('resize', positionSave);
  window.addEventListener('scroll', positionSave, true);
  window.visualViewport?.addEventListener('resize', positionSave);
  window.visualViewport?.addEventListener('scroll', positionSave);
  await nextTick(); grow(); positionSave(); field.value?.focus({ preventScroll: true });
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('click', outside, true);
  window.removeEventListener('resize', positionSave);
  window.removeEventListener('scroll', positionSave, true);
  window.visualViewport?.removeEventListener('resize', positionSave);
  window.visualViewport?.removeEventListener('scroll', positionSave);
  field.value?.blur();
});
</script>
<template>
  <div ref="root" class="task-text-editor">
    <textarea ref="field" :value="modelValue" :readonly="busy" aria-label="Описание задачи" maxlength="10000" rows="5" @input="emit('update:modelValue', $event.target.value); grow()" @keydown.enter="enter" />
    <Teleport to="body" :disabled="!mobile">
      <button ref="saveButton" type="button" class="editor-save" :class="{ 'editor-save-floating': mobile }" :style="mobile ? savePosition : undefined" :disabled="busy" @pointerdown.prevent @click="emit('save')"><UiIcon name="check" />Готово</button>
    </Teleport>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.task-text-editor { position: relative; z-index: 22; isolation: isolate; width: 100%; min-width: 0; }
.task-text-editor textarea[aria-label] { display: block; box-sizing: border-box; width: 100%; min-width: 0; min-height: 120px; max-height: min(360px,45dvh); margin: 0; padding: 10px; resize: none; border: 1px solid var(--codex-pane-accent,var(--color-primary)) !important; border-radius: 8px; outline: none !important; box-shadow: none !important; background: var(--codex-pane-surface,var(--color-background)); color: var(--codex-pane-text,var(--color-text)); font: inherit; font-size: 16px; line-height: 24px; }
.task-text-editor textarea[aria-label]:focus { outline: none !important; box-shadow: none !important; }
.editor-save { display: flex; margin: 4px 0 0 auto; min-height: 32px; align-items: center; gap: 4px; padding: 4px 0 4px 8px; border: 0 !important; background: transparent !important; box-shadow: none !important; font: inherit; font-size: 12px; color: var(--editor-save-color,var(--codex-pane-accent,var(--color-primary))) !important; cursor: pointer; }
.editor-save .ui-icon { width: 14px; height: 14px; }
.editor-save-floating { position: fixed; z-index: 10050; box-sizing: border-box; width: fit-content; min-width: 44px; height: 44px; min-height: 44px; margin: 0; padding: 4px 8px 4px 0; }
:global(html[data-theme="light"] .task-text-editor .editor-save) { color: var(--light-accent,#168447) !important; }
.task-text-editor p { margin: 0; padding: 8px 0; color: var(--color-danger,#b24f45); font-size: 12px; }
</style>
