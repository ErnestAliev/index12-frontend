<script setup>
import UiIcon from "./UiIcon.vue";
</script>
<template>
  <div class="chat-file-drop" role="status">
    <UiIcon name="attach" /><span>Прикрепить файлы</span>
  </div>
</template>
<style scoped>
.chat-file-drop {
  position: absolute;
  inset: 8px;
  z-index: 8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-sizing: border-box;
  border: 2px dashed var(--codex-pane-accent, var(--color-primary));
  border-radius: 12px;
  background: var(--codex-pane-bg, var(--color-background));
  color: var(--codex-pane-text, var(--color-text));
  font-size: 14px;
  pointer-events: none;
}
.chat-file-drop .ui-icon {
  width: 32px;
  height: 32px;
}
</style>
