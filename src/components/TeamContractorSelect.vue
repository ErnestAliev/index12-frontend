<script setup>
import { ref, watch, onBeforeUnmount, onMounted } from "vue";
import { useTeamSuggestionPopup } from "@/composables/useTeamSuggestionPopup";
import { teamApi, teamError } from "@/stores/teamChatStore";
const props = defineProps({ modelValue: String, fallbackName: String });
const emit = defineEmits(["update:modelValue", "selected"]);
const query = ref(props.fallbackName || ""),
  open = ref(false),
  rows = ref([]),
  more = ref(false),
  skip = ref(0),
  busy = ref(false),
  error = ref("");
const root = ref(null);
const { popupStyle, updatePosition } = useTeamSuggestionPopup(root, open);
watch(open, updatePosition);
function outside(event) {
  if (!root.value?.contains(event.target)) open.value = false;
}
onMounted(() => document.addEventListener("pointerdown", outside));
let timer,
  ticket = 0;
watch(
  () => props.fallbackName,
  (value) => {
    if (!open.value) query.value = value || "";
  },
);
async function search(append = false) {
  const t = ++ticket;
  busy.value = true;
  try {
    const { data } = await teamApi.get("/contractors", {
      params: { search: query.value, skip: append ? skip.value : 0 },
    });
    if (t !== ticket) return;
    rows.value = append
      ? [...rows.value, ...data.contractors]
      : data.contractors;
    more.value = data.hasMore;
    skip.value = data.nextSkip;
    error.value = "";
    updatePosition();
  } catch (e) {
    error.value = teamError(e);
  } finally {
    if (t === ticket) busy.value = false;
  }
}
function input() {
  open.value = true;
  emit("update:modelValue", null);
  clearTimeout(timer);
  timer = setTimeout(() => search(), 150);
}
function choose(row) {
  query.value = row.name;
  emit("update:modelValue", row._id);
  emit("selected", row);
  open.value = false;
}
async function create() {
  busy.value = true;
  try {
    const { data } = await teamApi.post("/contractors", { name: query.value });
    choose(data.contractor);
  } catch (e) {
    error.value = teamError(e);
  } finally {
    busy.value = false;
  }
}
onBeforeUnmount(() => {
  clearTimeout(timer);
  document.removeEventListener("pointerdown", outside);
  ++ticket;
});
</script>
<template>
  <div ref="root" class="team-party">
    <input
      v-model="query"
      role="combobox"
      aria-label="Контрагент"
      placeholder="Контрагент"
      autocomplete="off"
      :aria-expanded="open"
      @input="input"
      @focus="
        open = true;
        search();
      "
      @keydown.esc.stop="open = false"
      @keydown.enter.prevent="rows.length === 1 ? choose(rows[0]) : null"
    />
    <div v-if="open" class="team-party-list" :style="popupStyle">
      <button
        v-for="row in rows"
        :key="row._id"
        type="button"
        @click="choose(row)"
      >
        {{ row.name }}<small>{{ row.identificationNumber }}</small></button
      ><button v-if="more" type="button" :disabled="busy" @click="search(true)">
        Показать ещё</button
      ><button
        v-if="
          query.trim() &&
          !rows.some(
            (r) =>
              r.name.toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
          )
        "
        type="button"
        :disabled="busy"
        @click="create"
      >
        Создать «{{ query.trim() }}»
      </button>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>
<style scoped>
.team-party > input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-width: 0;
  height: 44px;
  padding: 10px 12px;
  font-size: 16px;
  font: inherit;
  color: var(--codex-pane-text);
  border: 1px solid var(--codex-pane-border);
  border-radius: 8px;
  background: var(--codex-pane-surface);
}
.team-party > input:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 2px;
}

.team-party {
  position: relative;
  min-width: 0;
}
.team-party-list {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  z-index: 30;
  max-height: 240px;
  overflow: auto;
  background: var(--codex-pane-surface);
  border: 1px solid var(--codex-pane-border);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 16px #0002;
}
.team-party-list button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px;
  border: 0 !important;
  background: transparent !important;
  color: var(--codex-pane-text);
}
.team-party-list button:hover {
  background: var(--codex-pane-hover) !important;
}
.team-party-list small {
  display: block;
  opacity: 0.6;
  font-size: 11px;
}
.team-party-list p {
  font-size: 12px;
  color: var(--codex-pane-danger);
}
</style>
