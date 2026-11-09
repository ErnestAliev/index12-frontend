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
import { recipientName } from "@/utils/recipientName";
import { useInputModality } from "@/composables/useInputModality";
import TeamChatAccess from "./TeamChatAccess.vue";
const props = defineProps({
  people: { type: Array, default: () => [] },
  actorId: String,
  disabled: Boolean,
  canCreate: Boolean,
  excludedIds: { type: Array, default: () => [] },
  adding: Boolean,
});
const emit = defineEmits(["select", "cancel"]);
const toolsOpen = ref(false);
function toggleTools() { toolsOpen.value = !toolsOpen.value; if (!toolsOpen.value) cancel(); }
const searching = ref(false),
  query = ref(""),
  field = ref(null),
  root = ref(null),
  active = ref(0),
  bounds = ref({});
const listId = useId();
const keyboard = useInputModality();
const creator = ref(null);
function addPerson() { field.value?.blur(); creator.value?.openForm(query.value.trim()); }
function personCreated(person) { searching.value = false; query.value = ''; choose(person); }
const available = computed(() => props.people.filter(person => !props.excludedIds.includes(person._id)));
const initial = computed(() => available.value);
const results = computed(() =>
  query.value.trim()
    ? available.value
        .filter((p) =>
          (p.name + ' ' + (p.position || ''))
            .toLocaleLowerCase()
            .includes(query.value.trim().toLocaleLowerCase()),
        )
        .slice(0, 12)
    : [],
);
function search() {
  if (!props.canCreate) return;
  searching.value = true;
  field.value?.focus({ preventScroll: true });
}
function cancel() {
  searching.value = false;
  query.value = "";
  field.value?.blur();
}
function choose(person) {
  if (!person || props.disabled || props.excludedIds.includes(person._id)) return;
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
watch(() => props.canCreate, value => { if (!value) { toolsOpen.value = false; cancel(); } });
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
  <div ref="root" class="recipient-line" :data-keyboard="keyboard">
    <div class="recipient-heading">
      <h3 class="task-step-title"><button v-if="canCreate" type="button" class="recipient-heading-toggle" :aria-expanded="toolsOpen" :disabled="disabled" @click="toggleTools">{{ adding ? 'Кому ещё добавить?' : 'Кому?' }}</button><template v-else>{{ adding ? 'Кому ещё добавить?' : 'Кому?' }}</template></h3>
      <div v-if="canCreate" class="recipient-tools-reveal" :class="{ 'is-open': toolsOpen }" :inert="!toolsOpen" :aria-hidden="!toolsOpen"><div class="recipient-tools-clip"><div class="recipient-actions">
        <button class="recipient-toggle" type="button" :aria-label="searching ? 'Закрыть поиск' : 'Найти сотрудника'" :disabled="disabled" @pointerdown="$event.pointerType === 'mouse' && $event.preventDefault()" @click="searching ? cancel() : search()"><UiIcon :name="searching ? 'close' : 'search'" /></button>
        <button v-if="canCreate" type="button" class="recipient-create" :disabled="disabled" aria-label="Добавить сотрудника" title="Добавить сотрудника" @click="addPerson"><UiIcon name="plus" /></button>
      </div></div></div>
    </div>
    <div class="recipient-choice" :class="{ 'is-searching': searching }">
      <input
        v-if="canCreate"
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
          <span class="task-chip-label">{{ p._id === actorId ? "Себе" : recipientName(p.name) }}</span>
        </button>
      </div>
    </div>
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
        {{ p._id === actorId ? "Себе" : recipientName(p.name) }}
      </button>
    </div>
  </div>
</template>
<style scoped>
.recipient-line {
  position: relative;
  display: grid;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  flex: none;
  color: var(--codex-pane-text);
}
.recipient-heading { min-width: 0; }
.recipient-line .recipient-heading-toggle { position: relative; display: block; min-height: 28px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.recipient-heading-toggle::after { content: ""; position: absolute; inset: -8px 0; }
.recipient-tools-reveal { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 320ms cubic-bezier(.22,1,.36,1), opacity 320ms ease; }
.recipient-tools-reveal.is-open { grid-template-rows: 1fr; opacity: 1; }
.recipient-tools-clip { min-height: 0; overflow: hidden; }
.recipient-actions { display: flex; align-items: center; gap: 4px; }
.recipient-line .recipient-create { display: grid; place-items: center; flex: none; width: 44px; height: 44px; min-height: 44px; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; }
.recipient-line .recipient-create { position: relative; color: var(--codex-pane-accent); }
.recipient-create::before { content: ""; position: absolute; inset: 9px; border: 1px solid currentColor; border-radius: 50%; background: color-mix(in srgb, var(--codex-pane-accent) 14%, var(--codex-pane-surface)); }
.recipient-create .ui-icon { position: relative; width: 16px; height: 16px; }
.recipient-choice {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 44px;
  flex: 1;
  min-width: 0;
  align-items: center;
}
.recipient-line .recipient-input {
  grid-area: 1/1;
  position: absolute;
  width: 100%;
  min-width: 0;
  max-width: none;
  box-sizing: border-box;
  height: 44px;
  min-height: 0;
  margin: 0;
  padding: 0 10px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 6px;
  background: var(--codex-pane-surface);
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
.recipient-line .recipient-input:focus { outline: none; box-shadow: none; }
.recipient-line[data-keyboard=true] .recipient-input:focus-visible { outline: 2px solid var(--codex-pane-focus); outline-offset: 2px; }
.recipient-options {
  grid-area: 1/1;
  z-index: 1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  max-height: min(280px, 40dvh);
  overflow-y: auto;
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
.recipient-line .recipient-options button { max-width: 100%; }
.recipient-line .recipient-toggle {
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
.is-searching > .recipient-options { display: none; }
.is-searching > .recipient-input {
  position: relative;
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
  .recipient-tools-reveal,
  .recipient-line .recipient-input {
    transition: none;
  }
}
</style>
<style scoped src="./teamTaskChips.css"></style>
