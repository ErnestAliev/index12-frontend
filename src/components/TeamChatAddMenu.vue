<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import UiIcon from "./UiIcon.vue";
defineProps({ disabled: Boolean });
const emit = defineEmits(["request", "file"]),
  open = ref(false),
  root = ref(null),
  button = ref(null);
function close(event) {
  if (!root.value?.contains(event.target)) open.value = false;
}
function choose(action) {
  open.value = false;
  emit(action);
}
function keys(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    open.value = false;
    button.value.focus();
  }
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    open.value = true;
    nextTick(() => {
      const items = [...root.value.querySelectorAll('[role="menuitem"]')];
      const index = items.indexOf(document.activeElement);
      items[
        (index +
          (event.key === "ArrowDown" ? 1 : items.length - 1) +
          items.length) %
          items.length
      ]?.focus();
    });
  }
}
onMounted(() => document.addEventListener("pointerdown", close));
onBeforeUnmount(() => document.removeEventListener("pointerdown", close));
</script>
<template>
  <div ref="root" class="team-add-menu" @keydown="keys">
    <button
      ref="button"
      class="team-add-trigger"
      type="button"
      aria-label="Добавить в чат"
      title="Добавить"
      aria-haspopup="menu"
      :aria-expanded="open"
      :disabled="disabled"
      @click="open = !open"
    >
      <UiIcon name="plus" />
    </button>
    <div
      v-if="open"
      class="team-add-options"
      role="menu"
      aria-label="Добавить в чат"
    >
      <button
        type="button"
        role="menuitem"
        class="team-add-expense"
        @click="choose('request')"
      >
        <UiIcon name="plus" />Создать заявку</button
      ><button type="button" role="menuitem" @click="choose('file')">
        <UiIcon name="attach" />Загрузить файл или фото
      </button>
    </div>
  </div>
</template>
<style scoped>
.team-add-menu {
  position: relative;
  flex: none;
  align-self: flex-end;
}
.team-add-trigger {
  display: grid !important;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 8px;
  background: transparent !important;
  color: var(--codex-pane-text);
  cursor: pointer;
}
.team-add-trigger > .ui-icon {
  width: 20px;
  height: 20px;
}
.team-add-options {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 40;
  min-width: 240px;
  padding: 4px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 10px;
  background: var(--codex-pane-surface);
  box-shadow: 0 8px 24px #0003;
}
.team-add-options button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px !important;
  border: 0 !important;
  border-radius: 6px;
  background: transparent !important;
  color: var(--codex-pane-text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.team-add-options button:hover,
.team-add-options button:focus-visible {
  background: var(--codex-pane-surface-soft) !important;
}
.team-add-options .team-add-expense {
  color: var(--color-danger, #c65048);
}
@media (max-width: 480px) {
  .team-add-trigger {
    width: 40px;
    height: 40px;
  }
}
</style>
