<script setup>
import { ref } from "vue";
import { useTeamChatSearchStore } from "@/stores/teamChatSearchStore";
import UiIcon from "./UiIcon.vue";
const search = useTeamChatSearchStore();
const bar = ref(null),
  field = ref(null);
function focus() {
  // Keep focus in the user gesture so the iOS keyboard opens on the first tap.
  if (bar.value) bar.value.style.display = "flex";
  field.value?.focus({ preventScroll: true });
}
defineExpose({ focus });
</script>
<template>
  <form
    ref="bar"
    v-show="search.open"
    class="team-search-bar"
    role="search"
    aria-label="Поиск в чатах"
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
      placeholder="Поиск в чатах"
      aria-label="Поиск в чатах"
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
      @pointerdown.prevent
      @click="search.move(-1)"
    >
      <UiIcon name="chevron-up" />
    </button>
    <button
      type="button"
      aria-label="Следующее совпадение"
      :disabled="
        search.busy || search.index < 0 || search.index >= search.total - 1
      "
      @pointerdown.prevent
      @click="search.move(1)"
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
  grid-column: 1/-1;
}
.team-search-bar > input {
  flex: 1;
  min-width: 0;
  width: 0;
  height: 44px;
  padding: 0 6px;
  border: 0;
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
.team-search-bar > input:focus-visible {
  outline: 0;
  box-shadow: inset 0 -1px var(--codex-pane-focus);
}
.team-search-bar > button:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: -3px;
}
</style>
