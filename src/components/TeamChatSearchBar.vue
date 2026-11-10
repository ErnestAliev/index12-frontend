<script setup>
import { ref } from "vue";
import { useTeamChatSearchStore } from "@/stores/teamChatSearchStore";
import UiIcon from "./UiIcon.vue";
import { useInputModality } from "@/composables/useInputModality";
const keyboard = useInputModality();
const search = useTeamChatSearchStore();
const bar = ref(null),
  field = ref(null);
function focus() {
  // Keep focus in the user gesture so the iOS keyboard opens on the first tap.
  if (bar.value) bar.value.style.display = "flex";
  field.value?.focus({ preventScroll: true });
}
function navigate(direction) {
  search.move(direction);
  field.value?.focus({ preventScroll: true });
}
defineExpose({ focus });
</script>
<template>
  <form
    ref="bar"
    v-show="search.open"
    class="team-search-bar"
    :data-keyboard="keyboard"
    role="search"
    :aria-label="search.scopeTaskId ? 'Поиск в задаче' : 'Поиск в общем чате'"
    @submit.prevent="search.find()"
    @keydown.esc.stop.prevent="search.close()"
  >
    <button type="button" aria-label="Закрыть поиск" @click="search.close()">
      <UiIcon name="back" />
    </button>
    <input
      ref="field"
      v-model="search.query"
      type="search"
      enterkeyhint="search"
      :placeholder="search.scopeTaskId ? 'Поиск в задаче' : 'Поиск в общем чате'"
      :aria-label="search.scopeTaskId ? 'Поиск в задаче' : 'Поиск в общем чате'"
      maxlength="160"
      autocomplete="off"
      @keydown.enter.prevent="
        search.busy || $event.isComposing || $event.repeat
          ? null
          : search.move($event.shiftKey ? -1 : 1)
      "
    />
    <span class="team-search-count" role="status" aria-live="polite">{{
      search.busy
        ? "…"
        : search.hasQuery && !search.error
          ? search.total
            ? `${search.index + 1}/${search.total}`
            : "0"
          : ""
    }}</span>
    <button
      type="button"
      aria-label="Предыдущее совпадение"
      :disabled="search.busy || search.index <= 0"
      @pointerdown="$event.pointerType === 'mouse' && $event.preventDefault()"
      @click="navigate(-1)"
    >
      <UiIcon name="chevron-up" />
    </button>
    <button
      type="button"
      aria-label="Следующее совпадение"
      :disabled="
        search.busy || search.index < 0 || search.index >= search.total - 1
      "
      @pointerdown="$event.pointerType === 'mouse' && $event.preventDefault()"
      @click="navigate(1)"
    >
      <UiIcon name="chevron-down" />
    </button>
  </form>
</template>
<style scoped>
.team-search-bar {
  display: flex;
  flex: 1;
  min-width: 0;
  width: 100%;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  flex: none;
  padding: 10px max(12px, var(--safe-area-right, 0px))
    var(--chat-composer-bottom-space, var(--safe-bottom-controls, 12px))
    max(12px, var(--safe-area-left, 0px));
  background: var(--codex-pane-bg);
  color: var(--codex-pane-text);
  border: 0;
  margin: 0;
}
.team-search-bar > input {
  flex: 1;
  min-width: 0;
  width: 0;
  height: 44px;
  padding: 0 6px;
  border: 0 !important;
  outline: none !important;
  box-shadow: none !important;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  color: var(--codex-pane-text);
  font: inherit;
  font-size: 16px;
  border-radius: 6px;
}
.team-search-bar > input::placeholder {
  color: var(--codex-pane-muted);
  opacity: 1;
}
.team-search-bar > button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--codex-pane-text);
  cursor: pointer;
}
.team-search-bar > button:disabled {
  opacity: 0.3;
  cursor: default;
}
.team-search-bar .ui-icon {
  width: 19px;
  height: 19px;
}
.team-search-count {
  color: var(--codex-pane-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.team-search-bar > button:focus {
  outline: none;
  box-shadow: none;
}
.team-search-bar[data-keyboard="true"] > input:focus-visible {
  box-shadow: inset 0 -1px var(--codex-pane-focus) !important;
}
.team-search-bar[data-keyboard="true"] > button:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: -3px;
}
</style>
