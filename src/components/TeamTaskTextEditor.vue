<script setup>
import { ref, onMounted, nextTick } from 'vue';
import TeamChatDialog from './TeamChatDialog.vue';
import { useInputModality } from '@/composables/useInputModality';
defineProps({ modelValue: String, busy: Boolean, error: String });
const emit = defineEmits(['update:modelValue','save']);
const field = ref(null), keyboardNavigation = useInputModality();
onMounted(async () => { await nextTick(); field.value?.focus({ preventScroll: true }); });
</script>
<template>
  <TeamChatDialog title="Текст задачи" bare dismiss-outside :busy="busy" class="task-text-editor" :class="{ 'editor-keyboard': keyboardNavigation }" @close="emit('save')">
    <textarea ref="field" :value="modelValue" :readonly="busy" aria-label="Описание задачи" maxlength="10000" rows="6" @input="emit('update:modelValue', $event.target.value)" @keydown.ctrl.enter.prevent="emit('save')" @keydown.meta.enter.prevent="emit('save')" />
    <p v-if="error" role="alert">{{ error }}</p>
  </TeamChatDialog>
</template>
<style scoped>
.task-text-editor { border-color: var(--codex-pane-accent,var(--color-primary)); }
.task-text-editor textarea[aria-label] { display: block; box-sizing: border-box; width: 100%; flex: 1; min-width: 0; min-height: 0; max-height: 360px; margin: 0; padding: 14px; resize: none; border: 0 !important; border-radius: 0; outline: none !important; box-shadow: none !important; background: var(--codex-pane-surface,var(--color-background)); color: var(--codex-pane-text,var(--color-text)); font: inherit; font-size: 16px; line-height: 24px; caret-color: var(--codex-pane-accent,var(--color-primary)); }
.task-text-editor.editor-keyboard textarea[aria-label] { box-shadow: inset 0 0 0 1px var(--codex-pane-accent,var(--color-primary)) !important; }
.task-text-editor:not(.editor-keyboard) textarea[aria-label]:focus { outline: none !important; box-shadow: none !important; }
.task-text-editor p { margin: 0; padding: 8px 14px; color: var(--color-danger,#b24f45); font-size: 12px; }
</style>
