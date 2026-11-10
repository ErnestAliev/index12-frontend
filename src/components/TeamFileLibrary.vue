<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { teamApi, teamError, useTeamChatStore } from "@/stores/teamChatStore";
import { useTeamChatSearchStore } from "@/stores/teamChatSearchStore";
import { defaultTaskFilters } from "@/utils/teamTasks";
import {
  dayLabel,
  fileDay,
  fileSize,
  fileDate,
  fileTypeLabels,
} from "@/utils/fileLibrary";
import TeamFileThumbnail from "./TeamFileThumbnail.vue";
import TeamFileInspector from "./TeamFileInspector.vue";
import UiIcon from "./UiIcon.vue";
const emit = defineEmits(["source-open"]);
const chat = useTeamChatStore(),
  search = useTeamChatSearchStore();
const root = ref(null),
  scroller = ref(null),
  files = ref([]),
  facets = ref({ projects: [], people: [], viewers: [], tags: [] });
const total = ref(0),
  allTotal = ref(0),
  nextOffset = ref(null),
  loading = ref(false),
  error = ref(""),
  saving = ref(false);
const selectedId = ref(null),
  linkedFile = ref(null),
  selected = computed(
    () =>
      files.value.find((file) => file.fileId === selectedId.value) ||
      (linkedFile.value?.fileId === selectedId.value ? linkedFile.value : null),
  );
const query = reactive({
  q: "",
  projectId: "",
  uploader: "",
  viewer: "",
  type: "",
  tag: "",
  from: "",
  to: "",
  sort: "newest",
});
const outdated = ref(false);
watch(
  () => chat.state,
  () => {
    if (loading.value || saving.value) return;
    if (!selectedId.value && !context.value && files.value.length <= 80)
      void load();
    else outdated.value = true;
  },
);
const view = ref("grid"),
  size = ref(180),
  groupDates = ref(true),
  showFilters = ref(false),
  keyboard = ref(false);
const floating = ref(false),
  geometry = reactive({ left: 0, top: 0, width: 600, height: 600 }),
  viewport = reactive({
    width: window.innerWidth,
    height: window.innerHeight,
    top: 0,
    left: 0,
  });
const mobile = computed(() => viewport.width <= 700),
  context = ref(null);
const windowStyle = computed(() => ({
  left:
    (mobile.value ? viewport.left : floating.value ? geometry.left : 0) + "px",
  top: (mobile.value ? viewport.top : floating.value ? geometry.top : 0) + "px",
  width:
    (!mobile.value && floating.value ? geometry.width : viewport.width) + "px",
  height:
    (!mobile.value && floating.value ? geometry.height : viewport.height) +
    "px",
  "--file-size": size.value + "px",
}));
const groups = computed(() => {
  if (!groupDates.value || !["newest", "oldest"].includes(query.sort))
    return [{ day: "", files: files.value }];
  const grouped = new Map();
  for (const file of files.value) {
    const day = fileDay(file.createdAt);
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(file);
  }
  return [...grouped].map(([day, files]) => ({ day, files }));
});
const preferenceKey =
  "index12-files:" + chat.me.workspaceId + ":" + chat.me.actorId;
try {
  const stored = JSON.parse(localStorage.getItem(preferenceKey) || "{}");
  if (["grid", "list"].includes(stored.view)) view.value = stored.view;
  if (stored.size >= 110 && stored.size <= 320) size.value = stored.size;
  if (typeof stored.groupDates === "boolean")
    groupDates.value = stored.groupDates;
} catch {
  /* Optional preferences. */
}
watch([view, size, groupDates], () => {
  try {
    localStorage.setItem(
      preferenceKey,
      JSON.stringify({
        view: view.value,
        size: size.value,
        groupDates: groupDates.value,
      }),
    );
  } catch {
    /* Optional preferences. */
  }
});
let request = 0,
  controller,
  debounce,
  disposed = false,
  opening = false,
  previousFocus;
async function load(append = false) {
  const ticket = ++request;
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = "";
  try {
    const { data } = await teamApi.get("/files/library", {
      params: { ...query, offset: append ? nextOffset.value : 0, limit: 80 },
      signal: controller.signal,
    });
    if (disposed || ticket !== request) return;
    files.value = append
      ? [
          ...files.value,
          ...data.files.filter(
            (file) => !files.value.some((old) => old.fileId === file.fileId),
          ),
        ]
      : data.files;
    facets.value = data.facets;
    total.value = data.total;
    allTotal.value = data.allTotal;
    nextOffset.value = data.nextOffset;
    outdated.value = false;
  } catch (e) {
    if (!disposed && ticket === request && !controller.signal.aborted)
      error.value = teamError(e);
  } finally {
    if (!disposed && ticket === request) loading.value = false;
  }
}
watch(query, () => {
  clearTimeout(debounce);
  selectedId.value = null;
  context.value = null;
  ++request;
  controller?.abort();
  debounce = setTimeout(() => load(), 180);
});
function clearFilters() {
  Object.assign(query, {
    q: "",
    projectId: "",
    uploader: "",
    viewer: "",
    type: "",
    tag: "",
    from: "",
    to: "",
    sort: "newest",
  });
}
async function revealRequested() {
  const id = chat.requestedFileId;
  if (!id || opening) return;
  opening = true;
  try {
    // Direct links can open old attachments without loading every intervening page.
    if (!files.value.some((file) => file.fileId === id)) {
      const { data } = await teamApi.get("/files/library/" + id);
      if (disposed) return;
      linkedFile.value = data.file;
    }
    if (disposed) return;
    if (
      files.value.some((file) => file.fileId === id) ||
      linkedFile.value?.fileId === id
    ) {
      selectedId.value = id;
      await nextTick();
      root.value
        ?.querySelector('[data-file-id="' + CSS.escape(id) + '"]')
        ?.scrollIntoView({ block: "nearest" });
    } else error.value = "Файл больше не доступен в чате";
  } catch (e) {
    if (!disposed) error.value = teamError(e);
  } finally {
    opening = false;
  }
}
watch(
  () => chat.requestedFileId,
  async (id) => {
    if (!id) return;
    clearFilters();
    await nextTick();
    clearTimeout(debounce);
    await load();
    await revealRequested();
  },
);
async function updateFile(file, changes) {
  if (saving.value || !file.canEdit) return;
  saving.value = true;
  error.value = "";
  try {
    const { data } = await teamApi.patch("/files/library/" + file.fileId, {
      expectedVersion: file.version,
      ...changes,
    });
    if (disposed) return;
    Object.assign(file, data);
    await load();
  } catch (e) {
    if (!disposed) {
      error.value = teamError(e);
      if (e.response?.status === 409) await load();
    }
  } finally {
    saving.value = false;
  }
}
function toggleTag(file, id) {
  return updateFile(file, {
    tags: file.tags.includes(id)
      ? file.tags.filter((tag) => tag !== id)
      : [...file.tags, id],
  });
}
async function viewed(id) {
  const file =
    files.value.find((file) => file.fileId === id) || linkedFile.value;
  if (!file || file.fileId !== id) return;
  file.viewedBy = [
    ...file.viewedBy.filter((viewer) => viewer.actorId !== chat.me.actorId),
    {
      actorId: chat.me.actorId,
      name: chat.me.displayName || chat.me.name,
      lastViewedAt: new Date().toISOString(),
    },
  ];
}
function close() {
  chat.fileLibraryOpen = false;
}
function dock() {
  floating.value = true;
  geometry.width = Math.max(360, Math.min(760, viewport.width * 0.52));
  geometry.height = viewport.height - 32;
  geometry.left = viewport.width - geometry.width - 16;
  geometry.top = 16;
}
function sourceOpen(source) {
  const identity = JSON.stringify([chat.me.workspaceId, chat.me.actorId]);
  search.close(false);
  chat.taskFilters = defaultTaskFilters();
  chat.tab = "messages";
  chat.creatingTask = false;
  chat.creatingTaskParentId = null;
  chat.taskNotifications = false;
  chat.requestedTaskId = source.taskId || null;
  const taskMessageId =
    source.taskId && source.kind === "message" ? source.messageId : null;
  chat.requestedTaskMessageId = null;
  chat.requestedMessageId = !source.taskId ? source.messageId : null;
  // Re-opening the same source must still trigger the message reveal watcher.
  const id = chat.requestedMessageId;
  chat.requestedMessageId = null;
  void nextTick(() => {
    if (identity !== JSON.stringify([chat.me?.workspaceId, chat.me?.actorId]))
      return;
    chat.requestedMessageId = id;
    chat.requestedTaskMessageId = taskMessageId;
  });
  chat.show();
  emit("source-open");
  if (mobile.value) close();
  else if (!floating.value) dock();
}
function measure() {
  const vv = window.visualViewport;
  Object.assign(viewport, {
    width: vv?.width || window.innerWidth,
    height: vv?.height || window.innerHeight,
    top: vv?.offsetTop || 0,
    left: vv?.offsetLeft || 0,
  });
  clamp();
}
function clamp() {
  geometry.width = Math.min(viewport.width, Math.max(360, geometry.width));
  geometry.height = Math.min(viewport.height, Math.max(300, geometry.height));
  geometry.left = Math.max(
    0,
    Math.min(geometry.left, viewport.width - geometry.width),
  );
  geometry.top = Math.max(
    0,
    Math.min(geometry.top, viewport.height - geometry.height),
  );
}
function toggleSize() {
  if (floating.value) floating.value = false;
  else dock();
}
let gesture;
function startWindow(event, resize = false) {
  if (
    mobile.value ||
    !floating.value ||
    event.button !== 0 ||
    (!resize && event.target.closest("button,input,select"))
  )
    return;
  event.preventDefault();
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    ...geometry,
    resize,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
}
function moveWindow(event) {
  if (!gesture || event.pointerId !== gesture.id) return;
  const dx = event.clientX - gesture.x,
    dy = event.clientY - gesture.y;
  if (gesture.resize) {
    geometry.width = gesture.width + dx;
    geometry.height = gesture.height + dy;
  } else {
    geometry.left = gesture.left + dx;
    geometry.top = gesture.top + dy;
  }
  clamp();
}
function resizeKeys(event) {
  if (!event.key.startsWith("Arrow")) return;
  event.preventDefault();
  geometry.width +=
    event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0;
  geometry.height +=
    event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0;
  clamp();
}
let hold,
  press,
  suppressUntil = 0;
function menu(file, x, y) {
  context.value = {
    file,
    x: Math.max(8, Math.min(x, viewport.width - 228)),
    y: Math.max(8, Math.min(y, viewport.height - 360)),
  };
}
function holdStart(event, file) {
  clearTimeout(hold);
  suppressUntil = 0;
  if (
    event.pointerType === "mouse" ||
    event.target.closest(".file-source-button")
  )
    return;
  press = { x: event.clientX, y: event.clientY };
  hold = setTimeout(() => {
    suppressUntil = Date.now() + 800;
    menu(file, event.clientX, event.clientY);
    hold = null;
  }, 520);
}
function holdMove(event) {
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 9)
    holdEnd();
}
function holdEnd() {
  clearTimeout(hold);
  press = null;
}
function activate(file, event) {
  if (Date.now() < suppressUntil) {
    event.preventDefault();
    return;
  }
  selectedId.value = file.fileId;
  context.value = null;
}
function contextAction(fn) {
  if (Date.now() < suppressUntil) return;
  fn();
  context.value = null;
}
function keys(event) {
  if (event.key === "Tab") keyboard.value = true;
  if (event.key === "Escape") {
    event.stopPropagation();
    if (context.value) context.value = null;
    else if (selectedId.value) selectedId.value = null;
    else close();
  }
}
function outside(event) {
  if (!event.target.closest(".file-context")) context.value = null;
}
function menuKeys(event) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const items = [
    ...event.currentTarget.querySelectorAll("button:not(:disabled)"),
  ];
  const index = items.indexOf(document.activeElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
          items.length;
  items[next]?.focus();
}
onMounted(async () => {
  previousFocus = document.activeElement;
  measure();
  window.addEventListener("resize", measure);
  window.visualViewport?.addEventListener("resize", measure);
  window.visualViewport?.addEventListener("scroll", measure);
  document.addEventListener("pointerdown", outside);
  root.value?.focus({ preventScroll: true });
  await load();
  await revealRequested();
});
onBeforeUnmount(() => {
  disposed = true;
  ++request;
  controller?.abort();
  clearTimeout(debounce);
  holdEnd();
  window.removeEventListener("resize", measure);
  window.visualViewport?.removeEventListener("resize", measure);
  window.visualViewport?.removeEventListener("scroll", measure);
  document.removeEventListener("pointerdown", outside);
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
});
</script>
<template>
  <Teleport to="body">
    <section
      ref="root"
      class="team-file-library"
      :class="{ floating: floating && !mobile }"
      :style="windowStyle"
      :data-keyboard="keyboard"
      role="region"
      aria-label="Файлы рабочего чата"
      tabindex="-1"
      @keydown="keys"
      @pointerdown="keyboard = false"
    >
      <header
        class="file-library-header"
        @pointerdown="startWindow"
        @pointermove="moveWindow"
        @pointerup="gesture = null"
        @pointercancel="gesture = null"
        @dblclick.self="toggleSize"
      >
        <UiIcon name="folder" />
        <h2>Файлы</h2>
        <span class="file-count"
          >{{ total
          }}<template v-if="total !== allTotal">
            / {{ allTotal }}</template
          ></span
        >
        <input
          v-model="query.q"
          type="search"
          placeholder="Поиск файлов"
          aria-label="Поиск файлов"
          maxlength="300"
        />
        <button
          type="button"
          aria-label="Фильтры файлов"
          :aria-expanded="showFilters"
          @click="showFilters = !showFilters"
        >
          <UiIcon name="filter" />
        </button>
        <button
          type="button"
          class="file-refresh"
          aria-label="Обновить файлы"
          :disabled="loading"
          @click="load()"
        >
          <UiIcon name="refresh" /><span
            v-if="outdated"
            class="file-refresh-dot"
          />
        </button>
        <button
          v-if="!mobile"
          type="button"
          :aria-label="floating ? 'На весь экран' : 'Уменьшить окно файлов'"
          @click="toggleSize"
        >
          <UiIcon :name="floating ? 'maximize' : 'minimize'" />
        </button>
        <button type="button" aria-label="Закрыть файлы" @click="close">
          <UiIcon name="close" />
        </button>
      </header>
      <div class="file-toolbar">
        <select v-model="query.projectId" aria-label="Проект файлов">
          <option value="">Все проекты</option>
          <option value="__none__">Без проекта</option>
          <option
            v-for="project in facets.projects"
            :key="project._id"
            :value="project._id"
          >
            {{ project.name }}
          </option>
        </select>
        <select v-model="query.uploader" aria-label="Кто загрузил">
          <option value="">Все сотрудники</option>
          <option
            v-for="person in facets.people"
            :key="person.actorId"
            :value="person.actorId"
          >
            {{ person.name }}
          </option>
        </select>
        <select v-model="query.type" aria-label="Тип файла">
          <option value="">Все типы</option>
          <option v-for="(label, id) in fileTypeLabels" :key="id" :value="id">
            {{ label }}
          </option>
        </select>
        <select v-model="query.sort" aria-label="Сортировка файлов">
          <option value="newest">Сначала новые</option>
          <option value="oldest">Сначала старые</option>
          <option value="name">По имени</option>
          <option value="size">По размеру</option>
        </select>
        <span class="file-view-controls"
          ><button
            type="button"
            aria-label="Галерея"
            :aria-pressed="view === 'grid'"
            @click="view = 'grid'"
          >
            <UiIcon name="grid" /></button
          ><button
            type="button"
            aria-label="Список"
            :aria-pressed="view === 'list'"
            @click="view = 'list'"
          >
            <UiIcon name="menu" /></button
          ><input
            v-model.number="size"
            type="range"
            min="110"
            max="320"
            step="10"
            aria-label="Размер миниатюр"
        /></span>
      </div>
      <div v-if="showFilters" class="file-extra-filters">
        <select v-model="query.tag" aria-label="Метка файла">
          <option value="">Все метки</option>
          <option v-for="tag in facets.tags" :key="tag.id" :value="tag.id">
            {{ tag.name }}
          </option>
        </select>
        <select v-model="query.viewer" aria-label="Кто просмотрел">
          <option value="">Все просмотры</option>
          <option
            v-for="person in facets.viewers"
            :key="person.actorId"
            :value="person.actorId"
          >
            {{ person.name }}
          </option>
        </select>
        <label
          >С
          <input
            v-model="query.from"
            type="date"
            aria-label="Файлы с даты" /></label
        ><label
          >По <input v-model="query.to" type="date" aria-label="Файлы по дату"
        /></label>
        <label><input v-model="groupDates" type="checkbox" />По дням</label
        ><button type="button" @click="clearFilters">Сбросить</button>
      </div>
      <div v-if="error" class="file-library-error" role="alert">
        {{ error }}<button type="button" @click="load()">Обновить</button>
      </div>
      <div class="file-library-body" :aria-busy="loading || saving">
        <div ref="scroller" class="file-library-scroll">
          <p v-if="!files.length" class="file-empty" role="status">
            {{ loading ? "Загрузка файлов…" : "Файлы не найдены" }}
          </p>
          <section
            v-for="group in groups"
            :key="group.day"
            class="file-day-group"
          >
            <h3 v-if="group.day" class="file-day">{{ dayLabel(group.day) }}</h3>
            <div :class="['file-items', 'file-' + view]">
              <article
                v-for="file in group.files"
                :key="file.fileId"
                :data-file-id="file.fileId"
                :class="{ 'file-selected': file.fileId === selectedId }"
                @contextmenu.prevent="
                  menu(file, $event.clientX, $event.clientY)
                "
                @pointerdown="holdStart($event, file)"
                @pointermove="holdMove"
                @pointerup="holdEnd"
                @pointercancel="holdEnd"
              >
                <button
                  type="button"
                  class="file-open"
                  :aria-label="'Открыть файл ' + file.name"
                  @click="activate(file, $event)"
                >
                  <TeamFileThumbnail :file="file" /><span class="file-info"
                    ><strong :title="file.name">{{ file.name }}</strong
                    ><span v-if="file.description" class="file-description">{{
                      file.description
                    }}</span
                    ><small
                      >{{ fileSize(file.size) }} /
                      {{ file.uploadedBy.name }}</small
                    ><small class="file-projects">{{
                      file.projects.map((project) => project.name).join(", ") ||
                      "Без проекта"
                    }}</small
                    ><time :datetime="file.createdAt">{{
                      fileDate(file.createdAt)
                    }}</time
                    ><span v-if="file.tags.length" class="file-badges"
                      ><span v-for="tag in file.tags" :key="tag">{{
                        facets.tags.find((item) => item.id === tag)?.name
                      }}</span></span
                    ></span
                  >
                </button>
                <div class="file-row-actions">
                  <button
                    type="button"
                    class="file-source-button"
                    :aria-label="'В чат: ' + file.name"
                    title="Перейти к сообщению"
                    @click.stop="sourceOpen(file.sources[0])"
                  >
                    <UiIcon name="chat" /></button
                  ><button
                    type="button"
                    :aria-label="'Меню файла ' + file.name"
                    @click.stop="
                      menu(file, $event.clientX || 20, $event.clientY || 80)
                    "
                  >
                    <UiIcon name="more" />
                  </button>
                </div>
              </article>
            </div>
          </section>
          <button
            v-if="nextOffset !== null"
            type="button"
            class="file-load-more"
            :disabled="loading"
            @click="load(true)"
          >
            {{ loading ? "Загрузка…" : "Показать ещё" }}
          </button>
          <span
            v-else-if="loading && files.length"
            class="file-loading"
            role="status"
            >Обновление…</span
          >
        </div>
        <TeamFileInspector
          v-if="selected"
          :file="selected"
          :tags="facets.tags"
          @close="selectedId = null"
          @source="sourceOpen"
          @tag="toggleTag(selected, $event)"
          @description="updateFile(selected, { description: $event })"
          @viewed="viewed"
        />
      </div>
      <button
        v-if="floating && !mobile"
        type="button"
        class="file-resize"
        aria-label="Изменить размер окна файлов"
        @pointerdown="startWindow($event, true)"
        @pointermove="moveWindow"
        @pointerup="gesture = null"
        @pointercancel="gesture = null"
        @keydown="resizeKeys"
      />
      <div
        v-if="context"
        class="file-context"
        role="menu"
        aria-label="Действия с файлом"
        :style="{ left: context.x + 'px', top: context.y + 'px' }"
        @contextmenu.prevent
        @pointerdown.stop="suppressUntil = 0"
        @keydown="menuKeys"
      >
        <button
          type="button"
          role="menuitem"
          @click="contextAction(() => (selectedId = context.file.fileId))"
        >
          <UiIcon name="view" />Открыть
        </button>
        <button
          type="button"
          role="menuitem"
          @click="contextAction(() => sourceOpen(context.file.sources[0]))"
        >
          <UiIcon name="chat" />Перейти в чат
        </button>
        <hr />
        <button
          v-for="tag in facets.tags"
          :key="tag.id"
          type="button"
          role="menuitemcheckbox"
          :aria-checked="context.file.tags.includes(tag.id)"
          :disabled="!context.file.canEdit || saving"
          @click="contextAction(() => toggleTag(context.file, tag.id))"
        >
          <UiIcon
            name="check"
            :style="{ opacity: context.file.tags.includes(tag.id) ? 1 : 0 }"
          />{{ tag.name }}
        </button>
      </div>
    </section>
  </Teleport>
</template>
<style scoped>
.team-file-library {
  position: fixed;
  z-index: 8000;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 13px;
  isolation: isolate;
  overflow: hidden;
  outline: 0;
}
.team-file-library.floating {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 12px 48px #0004;
}
.team-file-library button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.file-library-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 8px max(12px, var(--safe-area-right, 0px)) 8px
    max(12px, var(--safe-area-left, 0px));
  border-bottom: 1px solid var(--color-border);
  padding-top: max(8px, var(--safe-area-top, 0px));
}
.floating .file-library-header {
  padding: 8px 12px;
  cursor: move;
  touch-action: none;
}
.file-library-header h2 {
  font-size: 16px;
  font-weight: 500;
  margin: 0;
}
.file-count {
  opacity: 0.55;
  font-size: 12px;
  white-space: nowrap;
}
.file-library-header input {
  flex: 1;
  min-width: 0;
  margin-left: 12px;
}
.team-file-library :is(input:not([type="range"], [type="checkbox"]), select) {
  box-sizing: border-box;
  min-height: 36px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background-soft);
  color: inherit;
  font: inherit;
  padding: 6px 10px;
}
.team-file-library select {
  max-width: 210px;
  min-width: 0;
  padding-right: 26px;
}
.team-file-library button {
  border: 0;
  background: transparent;
  min-height: 36px;
}
.file-library-header button,
.file-view-controls button,
.file-row-actions button {
  display: grid;
  place-items: center;
  width: 36px;
  flex: none;
}
.team-file-library button:hover {
  background: var(--color-background-soft);
}
.team-file-library button:disabled {
  opacity: 0.45;
  cursor: default;
}
.file-toolbar,
.file-extra-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px max(12px, var(--safe-area-right, 0px)) 8px
    max(12px, var(--safe-area-left, 0px));
  border-bottom: 1px solid var(--color-border);
  flex: none;
}
.file-extra-filters label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.file-extra-filters input[type="date"] {
  max-width: 145px;
}
.file-view-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}
.file-view-controls input {
  width: 100px;
  accent-color: var(--color-primary);
}
.file-view-controls [aria-pressed="true"] {
  background: var(--color-background-soft);
  color: var(--color-primary);
  border-radius: 5px;
}
.file-library-body {
  display: flex;
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.file-library-scroll {
  min-width: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0 12px max(12px, var(--safe-bottom-controls, 12px))
    max(12px, var(--safe-area-left, 0px));
  scrollbar-gutter: stable;
}
.file-day {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0;
  padding: 14px 0 10px;
  background: var(--color-background);
  font-size: 12px;
  font-weight: 500;
  opacity: 0.95;
}
.file-items {
  gap: 10px;
}
.file-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(var(--file-size), 100%), 1fr)
  );
  align-items: start;
}
.file-items article {
  position: relative;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  overflow: hidden;
}
.file-items article:hover {
  border-color: var(--color-border);
}
.file-items .file-selected {
  border-color: var(--color-primary);
  background: var(--color-background-soft);
}
.file-open {
  display: flex;
  width: 100%;
  min-width: 0;
  text-align: left;
  padding: 0;
  align-items: stretch;
  touch-action: pan-y;
}
.file-grid .file-open {
  flex-direction: column;
}
.file-grid .file-thumbnail {
  height: var(--file-size);
  flex: none;
  border-radius: 6px;
}
.file-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 8px 42px;
}
.file-info strong {
  font-weight: 500;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-info :is(small, time) {
  font-size: 11px;
  opacity: 0.6;
}
.file-info small,
.file-description {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}
.file-info time {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-description {
  font-size: 12px;
  line-height: 1.4;
}
.file-row-actions {
  position: absolute;
  bottom: 2px;
  right: 2px;
  display: flex;
}
.file-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.file-badges > span {
  font-size: 10px;
  border: 1px solid var(--color-border);
  padding: 2px 5px;
  border-radius: 4px;
  color: var(--color-primary);
}
.file-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.file-list article {
  border-bottom-color: var(--color-border);
  border-radius: 0;
}
.file-list .file-open {
  align-items: center;
  padding: 8px 80px 8px 0;
  gap: 12px;
}
.file-list .file-thumbnail {
  height: calc(var(--file-size) * 0.4);
  width: calc(var(--file-size) * 0.5);
  min-width: 55px;
  flex: none;
}
.file-list .file-info {
  padding: 0;
  flex: 1;
}
.file-list .file-row-actions {
  top: 50%;
  bottom: auto;
  transform: translateY(-50%);
}
.file-library-error {
  padding: 8px 12px;
  color: var(--color-danger, #c65048);
  display: flex;
  gap: 10px;
  align-items: center;
  flex: none;
}
.file-library-error button {
  margin-left: auto;
}
.file-empty {
  display: grid;
  place-items: center;
  min-height: 180px;
  opacity: 0.6;
  margin: 0;
}
.file-load-more {
  display: block;
  min-width: 160px;
  margin: 16px auto;
  border: 1px solid var(--color-border) !important;
  border-radius: 6px;
}
.file-loading {
  display: block;
  text-align: center;
  opacity: 0.6;
  padding: 12px;
}
.file-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 24px;
  min-height: 24px !important;
  cursor: nwse-resize !important;
  touch-action: none;
  z-index: 8;
  background: linear-gradient(
    135deg,
    transparent 60%,
    var(--color-border) 61%,
    transparent 65%,
    transparent 76%,
    var(--color-border) 77%,
    transparent 81%
  ) !important;
}
.file-context {
  position: fixed;
  z-index: 10;
  width: 220px;
  padding: 5px;
  box-sizing: border-box;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 6px 24px #0004;
}
.file-context button {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  width: 100%;
  min-height: 44px;
  padding: 8px;
}
.file-context hr {
  border: 0;
  border-top: 1px solid var(--color-border);
  margin: 4px;
}
.team-file-library :is(button, input, select, textarea):focus {
  outline: none !important;
  box-shadow: none !important;
}
.team-file-library[data-keyboard="true"]
  :is(button, input, select, textarea):focus-visible {
  outline: 2px solid var(--color-primary) !important;
  outline-offset: -2px;
}
@media (max-width: 700px) {
  .file-library-header {
    gap: 4px;
  }
  .file-library-header > .ui-icon {
    display: none;
  }
  .file-library-header input {
    margin-left: 4px;
    font-size: 16px !important;
    width: 100px;
  }
  .file-toolbar select {
    flex: 1;
    max-width: 100%;
    width: calc(50% - 6px);
  }
  .file-toolbar .file-view-controls {
    width: 100%;
    justify-content: flex-end;
  }
  .team-file-library
    :is(button, select, input:not([type="checkbox"], [type="range"])) {
    min-height: 44px;
  }
  .file-library-header button,
  .file-row-actions button,
  .file-view-controls button {
    width: 44px;
  }
  .file-info {
    padding-bottom: 46px;
  }
  .file-grid {
    gap: 6px;
  }
  .file-library-scroll {
    padding-right: max(8px, var(--safe-area-right, 0px));
  }
  .file-view-controls input {
    width: 130px;
  }
  .file-extra-filters {
    max-height: 30dvh;
    overflow: auto;
  }
  .file-list .file-open {
    padding-right: 90px;
  }
  .file-context {
    max-height: calc(100dvh - 32px);
    overflow: auto;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .file-open {
    transition: background-color 0.15s;
  }
}
</style>

<style scoped>
.file-refresh {
  position: relative;
}
.file-refresh-dot {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-primary);
}
.team-file-library :deep(:is(button, input, select, textarea):focus) {
  outline: none !important;
  box-shadow: none !important;
}
.team-file-library[data-keyboard="true"]
  :deep(:is(button, input, select, textarea):focus-visible) {
  outline: 2px solid var(--color-primary) !important;
  outline-offset: -2px;
}
</style>
