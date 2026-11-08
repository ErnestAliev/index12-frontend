<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";
import UiIcon from "./UiIcon.vue";
import TeamChatAccess from "./TeamChatAccess.vue";
const props = defineProps({
  people: { type: Array, default: () => [] },
  actorId: String,
  disabled: Boolean,
  canCreate: Boolean,
});
const emit = defineEmits(["select", "cancel"]);
const searching = ref(false),
  query = ref(""),
  field = ref(null),
  root = ref(null),
  active = ref(0),
  bounds = ref({});
const listId = useId();
const creator = ref(null);
function addPerson() { field.value?.blur(); creator.value?.openForm(query.value.trim()); }
function personCreated(person) { searching.value = false; query.value = ''; choose(person); }
const initial = computed(() => props.people.slice(0, 12));
const results = computed(() =>
  query.value.trim()
    ? props.people
        .filter((p) =>
          (p.name + ' ' + (p.position || ''))
            .toLocaleLowerCase()
            .includes(query.value.trim().toLocaleLowerCase()),
        )
        .slice(0, 12)
    : [],
);
function search() {
  searching.value = true;
  field.value?.focus({ preventScroll: true });
}
function cancel() {
  searching.value = false;
  query.value = "";
  field.value?.blur();
}
function choose(person) {
  field.value?.blur();
  emit("select", person);
}
function keys(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    cancel();
    return;
  }
  if (!results.value.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    active.value =
      (active.value +
        (event.key === "ArrowDown" ? 1 : results.value.length - 1)) %
      results.value.length;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    choose(results.value[active.value]);
  }
}
function measure() {
  if (!root.value) return;
  const box = root.value.getBoundingClientRect(),
    frame = root.value.closest(".task-panel")?.getBoundingClientRect(),
    v = window.visualViewport;
  const top = Math.max(v?.offsetTop || 0, frame?.top || 0) + 48,
    bottom =
      Math.min(
        (v?.offsetTop || 0) + (v?.height || innerHeight),
        frame?.bottom || innerHeight,
      ) - 12;
  const above = Math.max(0, box.top - top - 6),
    below = Math.max(0, bottom - box.bottom - 6),
    up = below < 140 && above > below;
  bounds.value = {
    top: up ? "auto" : "calc(100% + 6px)",
    bottom: up ? "calc(100% + 6px)" : "auto",
    maxHeight: Math.max(44, Math.min(180, up ? above : below)) + "px",
  };
}
watch(query, () => {
  active.value = 0;
  nextTick(measure);
});
watch(searching, () => nextTick(measure));
onMounted(() => {
  window.visualViewport?.addEventListener("resize", measure);
  window.addEventListener("resize", measure);
  document.addEventListener("scroll", measure, true);
});
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener("resize", measure);
  window.removeEventListener("resize", measure);
  document.removeEventListener("scroll", measure, true);
});
</script>
<template>
  <div ref="root" class="recipient-line">
    <span class="recipient-label">Кому:</span>
    <div class="recipient-choice" :class="{ 'is-searching': searching }">
      <input
        ref="field"
        v-model="query"
        class="recipient-input"
        type="text"
        placeholder="Имя"
        aria-label="Найти сотрудника"
        role="combobox"
        autocomplete="off"
        :disabled="disabled"
        :tabindex="searching ? 0 : -1"
        :aria-expanded="searching && !!results.length"
        :aria-controls="listId"
        :aria-activedescendant="
          searching && results.length ? listId + '-' + active : undefined
        "
        @focus="searching = true"
        @keydown="keys"
      />
      <div
        class="recipient-options"
        :inert="searching"
        :aria-hidden="searching"
      >
        <button
          v-for="p in initial"
          :key="p._id"
          class="task-choice-chip"
          :data-tone="p.role || 'employee'"
          :title="[p.name, p.position].filter(Boolean).join(' · ')"
          type="button"
          :disabled="disabled"
          @click="choose(p)"
        >
          <span class="task-chip-label">{{ p._id === actorId ? "Себе" : p.name }}</span>
        </button>
      </div>
      <button
        class="recipient-toggle"
        type="button"
        :aria-label="searching ? 'Закрыть поиск' : 'Найти сотрудника'"
        :disabled="disabled"
        @pointerdown="$event.pointerType === 'mouse' && $event.preventDefault()"
        @click="searching ? cancel() : search()"
      >
        <UiIcon :name="searching ? 'close' : 'search'" />
      </button>
    </div>
    <button v-if="canCreate" type="button" class="recipient-create" :disabled="disabled" aria-label="Добавить сотрудника" title="Добавить сотрудника" @click="addPerson"><UiIcon name="plus" /></button>
    <TeamChatAccess v-if="canCreate" ref="creator" form-only @created="personCreated" />
    <div
      v-if="searching && results.length"
      :id="listId"
      class="recipient-results"
      role="listbox"
      aria-label="Сотрудники"
      :style="bounds"
    >
      <button
        v-for="(p, i) in results"
        :id="listId + '-' + i"
        :key="p._id"
        :title="[p.name, p.position].filter(Boolean).join(' · ')"
        type="button"
        role="option"
        :aria-selected="active === i"
        :disabled="disabled"
        @pointerdown="$event.pointerType === 'mouse' && $event.preventDefault()"
        @click="choose(p)"
      >
        {{ p._id === actorId ? "Себе" : p.name }}
      </button>
    </div>
  </div>
</template>
<style scoped>
.recipient-line {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 50px;
  flex: none;
  padding: 2px 10px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 10px;
  background: var(--codex-pane-surface);
  color: var(--codex-pane-text);
}
.recipient-label {
  flex: none;
  white-space: nowrap;
  font-size: 14px;
}
.recipient-line .recipient-create { display: grid; place-items: center; flex: none; width: 44px; height: 44px; min-height: 44px; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; }
.recipient-create .ui-icon { width: 16px; height: 16px; }
.recipient-choice {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  grid-template-rows: 44px;
  flex: 1;
  min-width: 0;
  align-items: center;
}
.recipient-line .recipient-input {
  grid-area: 1/1;
  position: relative;
  width: 100%;
  min-width: 0;
  max-width: none;
  box-sizing: border-box;
  height: 44px;
  min-height: 0;
  margin: 0;
  padding: 0;
  border: 0 !important;
  border-radius: 0;
  background: transparent !important;
  color: inherit;
  font: inherit;
  font-size: 16px;
  line-height: 22px;
  opacity: 0;
  pointer-events: none;
  transform: translateX(8px);
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}
.recipient-line .recipient-input:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}
.recipient-line:focus-within {
  border-color: var(--codex-pane-focus, var(--codex-pane-accent, #3b6763));
}
.recipient-options {
  grid-area: 1/1;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 44px;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}
.recipient-options::-webkit-scrollbar {
  display: none;
}
.recipient-line .recipient-options button {
  flex: none;
  min-height: 44px;
  max-width: 100%;
  padding: 0 2px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}
.recipient-line .recipient-toggle {
  grid-area: 1/2;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.recipient-toggle .ui-icon {
  width: 18px;
  height: 18px;
}
.is-searching > .recipient-options {
  opacity: 0;
  transform: translateX(-8px);
  pointer-events: none;
}
.is-searching > .recipient-input {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}
.recipient-results {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 10;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 4px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 10px;
  background: var(--codex-pane-surface);
  box-shadow: 0 8px 24px #0002;
}
.recipient-line .recipient-results button {
  display: block;
  width: 100%;
  min-height: 44px;
  margin: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.recipient-line .recipient-results button[aria-selected="true"] {
  background: var(--codex-pane-surface-soft);
}
.recipient-line button:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: -2px;
}
@media (prefers-reduced-motion: reduce) {
  .recipient-options,
  .recipient-line .recipient-input {
    transition: none;
  }
}
</style>
<style scoped src="./teamTaskChips.css"></style>
