<script setup>
import { ref, watch, onBeforeUnmount, onMounted, useId } from "vue";
import { teamApi, teamError } from "@/stores/teamChatStore";
import { useTeamSuggestionPopup } from "@/composables/useTeamSuggestionPopup";
const props = defineProps({ modelValue: String });
const emit = defineEmits(["update:modelValue", "category"]);
const root = ref(null),
  open = ref(false),
  rows = ref([]),
  error = ref(""),
  active = ref(-1);
const listId = useId();
const { popupStyle, updatePosition } = useTeamSuggestionPopup(root, open);
let timer,
  ticket = 0;
async function search() {
  const t = ++ticket;
  try {
    const { data } = await teamApi.get("/categories", {
      params: { search: props.modelValue || "" },
    });
    if (t !== ticket) return;
    rows.value = data.categories;
    active.value = -1;
    error.value = "";
    updatePosition();
  } catch (e) {
    if (t === ticket) error.value = teamError(e);
  }
}
function input(event) {
  emit("update:modelValue", event.target.value);
  emit("category", null);
  open.value = true;
  clearTimeout(timer);
  timer = setTimeout(search, 120);
}
function choose(row) {
  emit("update:modelValue", row.name);
  emit("category", row);
  open.value = false;
}
function key(event) {
  if (event.key === "Escape" && open.value) {
    event.stopPropagation();
    open.value = false;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    open.value = true;
    active.value = Math.max(
      0,
      Math.min(
        rows.value.length - 1,
        active.value + (event.key === "ArrowDown" ? 1 : -1),
      ),
    );
    updatePosition();
  }
  if (event.key === "Enter" && open.value) {
    event.preventDefault();
    const row =
      rows.value[active.value] ||
      (rows.value.length === 1 ? rows.value[0] : null);
    if (row) choose(row);
    else open.value = false;
  }
}
function outside(event) {
  if (!root.value?.contains(event.target)) open.value = false;
}
watch(open, updatePosition);
onMounted(() => document.addEventListener("pointerdown", outside));
onBeforeUnmount(() => {
  clearTimeout(timer);
  ++ticket;
  document.removeEventListener("pointerdown", outside);
});
</script>
<template>
  <div
    ref="root"
    class="team-title-field"
    @focusout="!root.contains($event.relatedTarget) && (open = false)"
  >
    <input
      :value="modelValue"
      role="combobox"
      aria-label="Что оплатить / купить"
      placeholder="Что оплатить / купить"
      maxlength="300"
      required
      autocomplete="off"
      :aria-expanded="open && !!rows.length"
      :aria-controls="listId"
      :aria-activedescendant="active >= 0 ? `${listId}-${active}` : undefined"
      @input="input"
      @keydown="key"
      @focus="
        open = true;
        search();
      "
    />
    <div
      v-if="open && rows.length"
      :id="listId"
      class="team-title-list"
      role="listbox"
      :style="popupStyle"
    >
      <button
        v-for="(row, index) in rows"
        :id="`${listId}-${index}`"
        :key="row._id"
        type="button"
        tabindex="-1"
        role="option"
        :aria-selected="active === index"
        @pointerdown.prevent
        @click="choose(row)"
      >
        {{ row.name }}
      </button>
    </div>
    <span v-if="error" role="alert">{{ error }}</span>
  </div>
</template>
<style scoped>
.team-title-field > input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 44px;
  min-width: 0;
  padding: 10px 12px;
  font: inherit;
  font-size: 16px;
  color: var(--codex-pane-text);
  border: 1px solid var(--codex-pane-border);
  border-radius: 8px;
  background: var(--codex-pane-surface);
}
.team-title-field {
  position: relative;
  min-width: 0;
}
.team-title-list {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 30;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 4px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 8px;
  background: var(--codex-pane-surface);
  box-shadow: 0 4px 16px #0002;
}
.team-title-list button {
  display: block;
  width: 100%;
  padding: 10px 8px;
  border: 0 !important;
  background: transparent !important;
  text-align: left;
  color: var(--codex-pane-text);
  font: inherit;
  min-height: 40px;
  cursor: pointer;
}
.team-title-list button:hover,
.team-title-list button[aria-selected="true"] {
  background: var(--codex-pane-hover) !important;
}
.team-title-field > span {
  font-size: 12px;
  color: var(--codex-pane-danger);
}
</style>
