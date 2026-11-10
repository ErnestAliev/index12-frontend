<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { fileDay, fileTypeLabels } from "@/utils/fileLibrary";
import { useInputModality } from "@/composables/useInputModality";
import UiIcon from "./UiIcon.vue";
const props = defineProps({
  query: Object,
  facets: Object,
  view: String,
  size: Number,
  groupDates: Boolean,
});
const emit = defineEmits([
  "filter",
  "update:view",
  "update:size",
  "update:groupDates",
  "reset",
]);
const root = ref(null),
  popup = ref(null),
  open = ref(""),
  bounds = ref({}),
  keyboard = useInputModality();
const controls = [
  {
    id: "projectId",
    label: "Проект файлов",
    title: "Проекты",
    icon: "folder-open",
    tone: "project",
  },
  {
    id: "uploader",
    label: "Кто загрузил",
    title: "Сотрудники",
    icon: "people",
    tone: "person",
  },
  {
    id: "type",
    label: "Тип файла",
    title: "Типы файлов",
    icon: "file-types",
    tone: "type",
  },
  {
    id: "more",
    label: "Фильтры файлов",
    title: "Фильтры и вид",
    icon: "filter",
    tone: "neutral",
  },
];
const current = computed(() =>
  controls.find((control) => control.id === open.value),
);
const choices = computed(() =>
  open.value === "projectId"
    ? [
        { value: "", label: "Все проекты" },
        { value: "__none__", label: "Без проекта" },
        ...props.facets.projects.map((project) => ({
          value: project._id,
          label: project.name,
        })),
      ]
    : open.value === "uploader"
      ? [
          { value: "", label: "Все сотрудники" },
          ...props.facets.people.map((person) => ({
            value: person.actorId,
            label: person.name,
          })),
        ]
      : open.value === "type"
        ? [
            { value: "", label: "Все типы" },
            ...Object.entries(fileTypeLabels).map(([value, label]) => ({
              value,
              label,
            })),
          ]
        : [],
);
const extraActive = computed(
  () =>
    !!(
      props.query.tag ||
      props.query.viewer ||
      props.query.from ||
      props.query.to ||
      props.query.sort !== "newest"
    ),
);
const sorts = [
  { value: "newest", label: "Сначала новые" },
  { value: "oldest", label: "Сначала старые" },
  { value: "name", label: "По имени" },
  { value: "size", label: "По размеру" },
];
function active(control) {
  return control.id === "more" ? extraActive.value : !!props.query[control.id];
}
function label(control) {
  const key = control.id;
  const value =
    key === "projectId"
      ? props.query.projectId === "__none__"
        ? "Без проекта"
        : props.facets.projects.find(
            (project) => project._id === props.query.projectId,
          )?.name
      : key === "uploader"
        ? props.facets.people.find(
            (person) => person.actorId === props.query.uploader,
          )?.name
        : key === "type"
          ? fileTypeLabels[props.query.type]
          : null;
  return value ? control.title + ": " + value : control.title;
}
function measure() {
  const frame = root.value
    ?.closest(".team-file-library")
    ?.getBoundingClientRect();
  if (!frame || !open.value) return;
  const strip = root.value.getBoundingClientRect(),
    vv = window.visualViewport;
  const left = Math.max(frame.left, vv?.offsetLeft || 0),
    right = Math.min(
      frame.right,
      (vv?.offsetLeft || 0) + (vv?.width || innerWidth),
    );
  const bottom = Math.min(
    frame.bottom,
    (vv?.offsetTop || 0) + (vv?.height || innerHeight),
  );
  const safe =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--safe-area-bottom",
      ),
    ) || 0;
  const width = Math.min(480, right - left - 24),
    top = Math.min(strip.bottom + 6, bottom - 150 - safe);
  bounds.value = {
    left: left + (right - left - width) / 2 + "px",
    top: Math.max(frame.top + 8, top) + "px",
    width: width + "px",
    maxHeight: Math.max(100, bottom - top - safe - 12) + "px",
  };
}
function close(focus = true) {
  const id = open.value;
  open.value = "";
  if (focus)
    root.value
      ?.querySelector('[data-file-filter="' + id + '"]')
      ?.focus({ preventScroll: true });
}
async function toggle(id) {
  if (open.value === id) {
    close();
    return;
  }
  open.value = id;
  await nextTick();
  measure();
  popup.value?.focus({ preventScroll: true });
}
function choose(key, value) {
  emit("filter", { [key]: value });
  close();
}
function selectView(value) {
  close(false);
  emit("update:view", value);
}
function outside(event) {
  if (
    !root.value?.contains(event.target) &&
    !popup.value?.contains(event.target)
  )
    close(false);
}
function keys(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const items = [
      ...popup.value.querySelectorAll("button:not(:disabled),input"),
    ],
    first = items[0],
    last = items.at(-1);
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === popup.value)
  ) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
function period(kind) {
  const today = fileDay(new Date()),
    from =
      kind === "week"
        ? fileDay(
            new Date(new Date(today + "T12:00:00Z").getTime() - 6 * 86400000),
          )
        : today;
  emit("filter", kind === "all" ? { from: "", to: "" } : { from, to: today });
}
let observer;
onMounted(() => {
  document.addEventListener("pointerdown", outside);
  window.addEventListener("resize", measure);
  window.visualViewport?.addEventListener("resize", measure);
  window.visualViewport?.addEventListener("scroll", measure);
  observer = new ResizeObserver(measure);
  if (root.value) {
    observer.observe(root.value);
    const frame = root.value.closest(".team-file-library");
    if (frame) observer.observe(frame);
  }
});
onBeforeUnmount(() => {
  observer?.disconnect();
  document.removeEventListener("pointerdown", outside);
  window.removeEventListener("resize", measure);
  window.visualViewport?.removeEventListener("resize", measure);
  window.visualViewport?.removeEventListener("scroll", measure);
});
watch(
  () => props.view,
  () => close(false),
);
</script>
<template>
  <div
    ref="root"
    class="file-control-strip"
    role="toolbar"
    aria-label="Фильтры и отображение файлов"
  >
    <button
      v-for="control in controls"
      :key="control.id"
      type="button"
      class="file-icon-control"
      :data-file-filter="control.id"
      :data-tone="control.tone"
      :aria-label="control.label"
      :title="label(control)"
      :aria-expanded="open === control.id"
      :aria-pressed="active(control)"
      @click="toggle(control.id)"
    >
      <span class="file-icon-surface"
        ><UiIcon :name="control.icon" /><span
          v-if="active(control)"
          class="file-filter-dot"
      /></span>
    </button>
    <span class="file-control-separator" />
    <button
      type="button"
      class="file-icon-control"
      aria-label="Галерея"
      title="Галерея"
      :aria-pressed="view === 'grid'"
      @click="selectView('grid')"
    >
      <span class="file-icon-surface"><UiIcon name="grid" /></span>
    </button>
    <button
      type="button"
      class="file-icon-control"
      aria-label="Список"
      title="Список"
      :aria-pressed="view === 'list'"
      @click="selectView('list')"
    >
      <span class="file-icon-surface"><UiIcon name="menu" /></span>
    </button>
  </div>
  <Teleport to="body">
    <section
      v-if="current"
      ref="popup"
      class="file-filter-popover"
      :style="bounds"
      :data-tone="current.tone"
      :data-keyboard="keyboard"
      role="dialog"
      :aria-label="current.title"
      tabindex="-1"
      @keydown="keys"
    >
      <header>
        <h3>{{ current.title }}</h3>
        <button type="button" aria-label="Закрыть фильтр" @click="close">
          <UiIcon name="close" />
        </button>
      </header>
      <div
        v-if="open !== 'more'"
        class="file-filter-chips"
        :aria-label="current.title"
        role="group"
      >
        <button
          v-for="choice in choices"
          :key="choice.value"
          type="button"
          class="file-filter-chip"
          :aria-pressed="query[open] === choice.value"
          @click="choose(open, choice.value)"
        >
          <span
            ><UiIcon v-if="query[open] === choice.value" name="check" />{{
              choice.label
            }}</span
          >
        </button>
      </div>
      <template v-else>
        <section class="file-filter-section" data-tone="neutral">
          <h4>Сортировка</h4>
          <div
            class="file-filter-chips"
            role="group"
            aria-label="Сортировка файлов"
          >
            <button
              v-for="sort in sorts"
              :key="sort.value"
              type="button"
              class="file-filter-chip"
              :aria-pressed="query.sort === sort.value"
              @click="emit('filter', { sort: sort.value })"
            >
              <span>{{ sort.label }}</span>
            </button>
          </div>
        </section>
        <section class="file-filter-section" data-tone="project">
          <h4>Дата</h4>
          <div class="file-filter-chips">
            <button
              type="button"
              class="file-filter-chip"
              :aria-pressed="!query.from && !query.to"
              @click="period('all')"
            >
              <span>За всё время</span></button
            ><button
              type="button"
              class="file-filter-chip"
              :aria-pressed="
                query.from === fileDay(new Date()) &&
                query.to === fileDay(new Date())
              "
              @click="period('today')"
            >
              <span>Сегодня</span></button
            ><button
              type="button"
              class="file-filter-chip"
              @click="period('week')"
              :aria-pressed="
                query.to === fileDay(new Date()) &&
                query.from === fileDay(new Date(Date.now() - 6 * 86400000))
              "
            >
              <span>Последние 7 дней</span>
            </button>
          </div>
          <div class="file-date-fields">
            <label
              >С<input
                type="date"
                :value="query.from"
                aria-label="Файлы с даты"
                @change="
                  emit('filter', { from: $event.target.value })
                " /></label
            ><label
              >По<input
                type="date"
                :value="query.to"
                aria-label="Файлы по дату"
                @change="emit('filter', { to: $event.target.value })"
            /></label>
          </div>
        </section>
        <section class="file-filter-section" data-tone="type">
          <h4>Метки</h4>
          <div class="file-filter-chips" role="group" aria-label="Метка файла">
            <button
              type="button"
              class="file-filter-chip"
              :aria-pressed="!query.tag"
              @click="emit('filter', { tag: '' })"
            >
              <span>Все метки</span></button
            ><button
              v-for="tag in facets.tags"
              :key="tag.id"
              type="button"
              class="file-filter-chip"
              :aria-pressed="query.tag === tag.id"
              @click="emit('filter', { tag: tag.id })"
            >
              <span>{{ tag.name }}</span>
            </button>
          </div>
        </section>
        <section class="file-filter-section" data-tone="person">
          <h4>Просмотрели</h4>
          <div
            class="file-filter-chips"
            role="group"
            aria-label="Кто просмотрел"
          >
            <button
              type="button"
              class="file-filter-chip"
              :aria-pressed="!query.viewer"
              @click="emit('filter', { viewer: '' })"
            >
              <span>Все просмотры</span></button
            ><button
              v-for="person in facets.viewers"
              :key="person.actorId"
              type="button"
              class="file-filter-chip"
              :aria-pressed="query.viewer === person.actorId"
              @click="emit('filter', { viewer: person.actorId })"
            >
              <span>{{ person.name }}</span>
            </button>
          </div>
        </section>
        <section class="file-filter-section file-display-options">
          <h4>Отображение</h4>
          <button
            type="button"
            class="file-filter-chip"
            :aria-pressed="groupDates"
            @click="emit('update:groupDates', !groupDates)"
          >
            <span
              ><UiIcon v-if="groupDates" name="check" />По дням</span
            ></button
          ><label
            >Размер миниатюр<input
              type="range"
              min="110"
              max="320"
              step="10"
              :value="size"
              aria-label="Размер миниатюр"
              @input="emit('update:size', Number($event.target.value))"
          /></label>
        </section>
        <footer>
          <button type="button" @click="emit('reset')">Сбросить фильтры</button>
        </footer>
      </template>
    </section>
  </Teleport>
</template>
<style scoped>
.file-control-strip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex: none;
  min-width: 0;
  color: var(--color-text);
}
.file-icon-control {
  display: grid;
  place-items: center;
  width: 36px;
  min-width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.file-icon-surface {
  position: relative;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: color-mix(
    in srgb,
    var(--file-control-color, var(--color-text)) 5%,
    transparent
  );
  color: var(--file-control-color, var(--color-text));
}
.file-icon-control[aria-pressed="true"] .file-icon-surface,
.file-icon-control[aria-expanded="true"] .file-icon-surface {
  background: color-mix(
    in srgb,
    var(--file-control-color, var(--color-primary)) 15%,
    transparent
  );
}
.file-icon-control:hover .file-icon-surface {
  background: color-mix(
    in srgb,
    var(--file-control-color, var(--color-text)) 12%,
    transparent
  );
}
.file-filter-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 4px;
  height: 4px;
  background: currentColor;
  border-radius: 50%;
}
.file-control-separator {
  height: 16px;
  width: 1px;
  background: var(--color-border);
  margin-inline: 3px;
  flex: none;
}
.file-control-strip,
.file-filter-popover {
  --file-project-accent: #805917;
  --file-person-accent: #285f73;
  --file-type-accent: #684a88;
}
[data-tone="project"] {
  --file-control-color: var(--file-project-accent);
}
[data-tone="person"] {
  --file-control-color: var(--file-person-accent);
}
[data-tone="type"] {
  --file-control-color: var(--file-type-accent);
}
[data-tone="neutral"] {
  --file-control-color: var(--color-text);
}
:global([data-theme="dark"] .file-control-strip),
:global([data-theme="dark"] .file-filter-popover) {
  --file-project-accent: #d8b77d;
  --file-person-accent: #8dbccc;
  --file-type-accent: #b9a4d0;
}
.file-filter-popover {
  position: fixed;
  z-index: 8100;
  box-sizing: border-box;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0 10px 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-background);
  color: var(--color-text);
  box-shadow: 0 8px 28px #0003;
  font-size: 13px;
  outline: none;
}
.file-filter-popover header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  background: var(--color-background);
}
h3,
h4 {
  margin: 0;
  font-weight: 500;
}
h3 {
  font-size: 13px;
}
h4 {
  font-size: 12px;
  margin: 8px 3px 2px;
  opacity: 0.75;
}
.file-filter-popover header button {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.file-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0 4px;
  align-items: center;
}
.file-filter-chip {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  max-width: 100%;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--file-control-color, var(--color-text));
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.file-filter-chip > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  box-sizing: border-box;
  padding: 5px 9px;
  border: 1px solid
    color-mix(
      in srgb,
      var(--file-control-color, var(--color-text)) 25%,
      transparent
    );
  border-radius: 7px;
  background: color-mix(
    in srgb,
    var(--file-control-color, var(--color-text)) 6%,
    transparent
  );
  overflow-wrap: anywhere;
}
.file-filter-chip[aria-pressed="true"] > span {
  border-color: color-mix(
    in srgb,
    var(--file-control-color, var(--color-text)) 55%,
    transparent
  );
  background: color-mix(
    in srgb,
    var(--file-control-color, var(--color-text)) 16%,
    transparent
  );
  font-weight: 500;
}
.file-filter-chip .ui-icon {
  width: 13px;
  height: 13px;
}
.file-filter-chip:hover > span {
  background: color-mix(
    in srgb,
    var(--file-control-color, var(--color-text)) 12%,
    transparent
  );
}
.file-filter-section + .file-filter-section {
  border-top: 1px solid var(--color-border);
  margin-top: 5px;
  padding-top: 3px;
}
.file-date-fields {
  display: flex;
  gap: 8px;
}
.file-date-fields label {
  display: grid;
  gap: 4px;
  min-width: 0;
  flex: 1;
  font-size: 12px;
}
.file-date-fields input {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  height: 40px;
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background-soft);
  color: inherit;
  font: inherit;
}
.file-display-options label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  min-height: 44px;
}
.file-display-options input {
  min-width: 80px;
  flex: 1;
  accent-color: var(--color-primary);
}
.file-filter-popover footer {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--color-border);
  margin-top: 6px;
  padding-top: 5px;
}
.file-filter-popover footer button {
  min-height: 40px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
:is(
  .file-icon-control,
  .file-filter-popover button,
  .file-filter-popover input
):focus {
  outline: none !important;
  box-shadow: none !important;
}
.file-filter-popover[data-keyboard="true"] :is(button, input):focus-visible {
  outline: 2px solid var(--color-primary) !important;
  outline-offset: -2px;
}
@media (pointer: coarse) {
  .file-icon-control {
    width: 44px;
    min-width: 44px;
    height: 44px;
  }
  .file-filter-popover header button {
    width: 44px;
    height: 44px;
  }
  .file-date-fields input {
    height: 44px;
    font-size: 16px;
  }
}
</style>
