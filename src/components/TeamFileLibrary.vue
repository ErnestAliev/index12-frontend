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
import { dayLabel, fileDay, fileSize, fileDate } from "@/utils/fileLibrary";
import TeamFileThumbnail from "./TeamFileThumbnail.vue";
import TeamFileInspector from "./TeamFileInspector.vue";
import TeamFileControls from "./TeamFileControls.vue";
import UiIcon from "./UiIcon.vue";
const emit = defineEmits(["source-open"]);
const chat = useTeamChatStore(),
  search = useTeamChatSearchStore();
const root = ref(null),
  body = ref(null),
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
  listShare = ref(null),
  size = ref(180),
  groupDates = ref(true),
  keyboard = ref(false);
const headerSide = ref(0),
  headerTitle = ref(null),
  headerTrailing = ref(null),
  headerActions = ref(null);
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
const effectiveListShare = computed(
  () => listShare.value ?? (view.value === "list" ? 30 : 42),
);
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
  "--file-list-share": effectiveListShare.value + "%",
  "--file-header-side": headerSide.value + "px",
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
  if (
    Number.isFinite(stored.listShare) &&
    stored.listShare >= 18 &&
    stored.listShare <= 65
  )
    listShare.value = stored.listShare;
} catch {
  /* Optional preferences. */
}
watch([view, size, groupDates, listShare], () => {
  try {
    localStorage.setItem(
      preferenceKey,
      JSON.stringify({
        view: view.value,
        size: size.value,
        groupDates: groupDates.value,
        listShare: listShare.value,
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
const resizing = ref(false);
const windowEdges = [
  { edge: "w", label: "Ширина окна файлов слева", orientation: "vertical" },
  { edge: "e", label: "Ширина окна файлов справа", orientation: "vertical" },
  { edge: "n", label: "Высота окна файлов сверху", orientation: "horizontal" },
  { edge: "s", label: "Высота окна файлов снизу", orientation: "horizontal" },
];
function startWindow(event, edge = "") {
  if (
    mobile.value ||
    !floating.value ||
    event.button !== 0 ||
    (!edge && event.target.closest("button,input,select,.file-search-field"))
  )
    return;
  event.preventDefault();
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    ...geometry,
    edge,
  };
  resizing.value = !!edge;
  event.currentTarget.setPointerCapture(event.pointerId);
}
function resizeWindow(initial, dx, dy, edge) {
  let left = initial.left,
    right = initial.left + initial.width,
    top = initial.top,
    bottom = initial.top + initial.height;
  const minWidth = Math.min(360, viewport.width),
    minHeight = Math.min(300, viewport.height);
  if (edge.includes("w"))
    left = Math.max(0, Math.min(initial.left + dx, right - minWidth));
  if (edge.includes("e"))
    right = Math.min(viewport.width, Math.max(right + dx, left + minWidth));
  if (edge.includes("n"))
    top = Math.max(0, Math.min(initial.top + dy, bottom - minHeight));
  if (edge.includes("s"))
    bottom = Math.min(viewport.height, Math.max(bottom + dy, top + minHeight));
  Object.assign(geometry, {
    left,
    top,
    width: right - left,
    height: bottom - top,
  });
}
function moveWindow(event) {
  if (!gesture || event.pointerId !== gesture.id) return;
  const dx = event.clientX - gesture.x,
    dy = event.clientY - gesture.y;
  if (gesture.edge) {
    resizeWindow(gesture, dx, dy, gesture.edge);
  } else {
    geometry.left = gesture.left + dx;
    geometry.top = gesture.top + dy;
  }
  clamp();
}
function endWindow() {
  gesture = null;
  resizing.value = false;
}
function resizeKeys(event, edge = "se") {
  if (!event.key.startsWith("Arrow")) return;
  event.preventDefault();
  resizeWindow(
    geometry,
    event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0,
    event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0,
    edge,
  );
}
let splitGesture;
function setListShare(value, width = body.value?.clientWidth || 0) {
  if (!width) return;
  // Leave both the file names and the preview usable in a narrow floating window.
  const minimum = Math.max(18, Math.min(40, (130 / width) * 100));
  const maximum = Math.min(
    65,
    Math.max(minimum, ((width - 200) / width) * 100),
  );
  listShare.value = Math.min(maximum, Math.max(minimum, value));
}
function startSplit(event) {
  if (event.button !== 0 || mobile.value) return;
  event.preventDefault();
  splitGesture = {
    id: event.pointerId,
    x: event.clientX,
    width: body.value.clientWidth,
    share: (scroller.value.clientWidth / body.value.clientWidth) * 100,
  };
  resizing.value = true;
  event.currentTarget.setPointerCapture(event.pointerId);
}
function moveSplit(event) {
  if (!splitGesture || splitGesture.id !== event.pointerId) return;
  setListShare(
    splitGesture.share +
      ((event.clientX - splitGesture.x) / splitGesture.width) * 100,
    splitGesture.width,
  );
}
function endSplit() {
  splitGesture = null;
  resizing.value = false;
}
function splitKeys(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = (scroller.value.clientWidth / body.value.clientWidth) * 100;
  setListShare(
    event.key === "Home"
      ? 18
      : event.key === "End"
        ? 65
        : current + (event.key === "ArrowLeft" ? -3 : 3),
  );
}
let hold,
  press,
  suppressUntil = 0;
function menu(file, x, y) {
  const frame = root.value.getBoundingClientRect();
  context.value = {
    file,
    x: Math.max(8, Math.min(x - frame.left, frame.width - 228)),
    y: Math.max(8, Math.min(y - frame.top, frame.height - 360)),
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
let headerObserver;
function measureHeader() {
  if (!headerTitle.value || !headerTrailing.value || !headerActions.value)
    return;
  const right =
    getComputedStyle(headerTrailing.value).display === "contents"
      ? headerActions.value
      : headerTrailing.value;
  headerSide.value = Math.ceil(
    Math.max(
      headerTitle.value.getBoundingClientRect().width,
      right.getBoundingClientRect().width,
    ),
  );
}
onMounted(async () => {
  previousFocus = document.activeElement;
  measure();
  headerObserver = new ResizeObserver(measureHeader);
  for (const element of [
    root.value,
    headerTitle.value,
    headerTrailing.value,
    headerActions.value,
  ])
    if (element) headerObserver.observe(element);
  measureHeader();
  window.addEventListener("resize", measure);
  window.visualViewport?.addEventListener("resize", measure);
  window.visualViewport?.addEventListener("scroll", measure);
  document.addEventListener("pointerdown", outside);
  root.value?.focus({ preventScroll: true });
  await load();
  await revealRequested();
});
onBeforeUnmount(() => {
  headerObserver?.disconnect();
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
      :class="{ floating: floating && !mobile, 'file-resizing': resizing }"
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
        @pointerup="endWindow"
        @pointercancel="endWindow"
        @lostpointercapture="endWindow"
        @dblclick.self="toggleSize"
      >
        <div ref="headerTitle" class="file-library-title">
          <UiIcon name="folder" />
          <h2>Файлы</h2>
          <span class="file-count"
            >{{ total
            }}<template v-if="total !== allTotal">
              / {{ allTotal }}</template
            ></span
          >
        </div>
        <div class="file-search-field">
          <input
            v-model="query.q"
            type="search"
            placeholder="Поиск файлов"
            aria-label="Поиск файлов"
            maxlength="300"
          />
        </div>
        <div ref="headerTrailing" class="file-header-trailing">
          <div class="file-header-controls">
            <TeamFileControls
              :query="query"
              :facets="facets"
              v-model:view="view"
              v-model:size="size"
              v-model:group-dates="groupDates"
              @filter="Object.assign(query, $event)"
              @reset="clearFilters"
            />
          </div>
          <div ref="headerActions" class="file-window-actions">
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
          </div>
        </div>
      </header>
      <div v-if="error" class="file-library-error" role="alert">
        {{ error }}<button type="button" @click="load()">Обновить</button>
      </div>
      <div
        ref="body"
        class="file-library-body"
        :class="{ 'with-preview': selected && !mobile }"
        :aria-busy="loading || saving"
      >
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
        <div
          v-if="selected && !mobile"
          class="file-splitter"
          role="separator"
          tabindex="0"
          aria-label="Ширина списка и предпросмотра"
          aria-orientation="vertical"
          aria-valuemin="18"
          aria-valuemax="65"
          :aria-valuenow="Math.round(effectiveListShare)"
          @pointerdown="startSplit"
          @pointermove="moveSplit"
          @pointerup="endSplit"
          @pointercancel="endSplit"
          @lostpointercapture="endSplit"
          @keydown="splitKeys"
          @dblclick="listShare = null"
        />
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
      <template v-if="floating && !mobile">
        <div
          v-for="handle in windowEdges"
          :key="handle.edge"
          :class="['file-window-edge', 'edge-' + handle.edge]"
          role="separator"
          :aria-orientation="handle.orientation"
          :aria-label="handle.label"
          :aria-valuenow="
            Math.round(
              handle.orientation === 'vertical'
                ? geometry.width
                : geometry.height,
            )
          "
          tabindex="0"
          @pointerdown="startWindow($event, handle.edge)"
          @pointermove="moveWindow"
          @pointerup="endWindow"
          @pointercancel="endWindow"
          @lostpointercapture="endWindow"
          @keydown="resizeKeys($event, handle.edge)"
        />
        <button
          type="button"
          class="file-resize"
          aria-label="Изменить размер окна файлов"
          @pointerdown="startWindow($event, 'se')"
          @pointermove="moveWindow"
          @pointerup="endWindow"
          @pointercancel="endWindow"
          @lostpointercapture="endWindow"
          @keydown="resizeKeys($event)"
        />
        <div
          v-for="edge in ['nw', 'ne', 'sw']"
          :key="edge"
          :class="['file-window-corner', 'corner-' + edge]"
          role="button"
          :aria-label="
            'Размер окна файлов: ' +
            { nw: 'слева сверху', ne: 'справа сверху', sw: 'слева снизу' }[edge]
          "
          tabindex="0"
          @pointerdown="startWindow($event, edge)"
          @pointermove="moveWindow"
          @pointerup="endWindow"
          @pointercancel="endWindow"
          @lostpointercapture="endWindow"
          @keydown="resizeKeys($event, edge)"
        />
      </template>
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
  .team-file-library
    :is(button, select, input:not([type="checkbox"], [type="range"])) {
    min-height: 44px;
  }
  .file-library-header button,
  .file-row-actions button {
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

<style scoped>
.file-library-body {
  container-type: size;
  --file-splitter-size: 12px;
}
.file-library-body.with-preview {
  display: grid;
  grid-template-columns:
    minmax(130px, min(var(--file-list-share), calc(100% - 212px)))
    var(--file-splitter-size) minmax(0, 1fr);
}
.file-library-body.with-preview > .file-library-scroll {
  padding-right: 6px;
}
.file-splitter {
  position: relative;
  min-width: 0;
  cursor: col-resize;
  touch-action: none;
  outline: none;
  background: var(--color-background);
}
.file-splitter::after {
  content: "";
  position: absolute;
  width: 1px;
  top: 0;
  bottom: 0;
  left: 50%;
  background: var(--color-border);
}
.file-splitter:hover::after,
.file-splitter:active::after {
  background: var(--color-primary);
}
.file-window-edge,
.file-window-corner {
  position: absolute;
  z-index: 8;
  touch-action: none;
  outline: none;
}
.file-window-edge.edge-w,
.file-window-edge.edge-e {
  top: 12px;
  bottom: 12px;
  width: 10px;
  cursor: ew-resize;
}
.edge-w {
  left: 0;
}
.edge-e {
  right: 0;
}
.edge-n {
  top: 0;
}
.edge-s {
  bottom: 0;
}
.file-window-edge.edge-n,
.file-window-edge.edge-s {
  left: 12px;
  right: 12px;
  height: 10px;
  cursor: ns-resize;
}
.file-window-edge::after {
  content: "";
  position: absolute;
  background: var(--color-border);
  opacity: 0;
}
.file-window-edge:hover::after,
.file-window-edge:focus-visible::after {
  opacity: 1;
}
.edge-w::after,
.edge-e::after {
  top: 20%;
  bottom: 20%;
  left: 4px;
  width: 1px;
}
.edge-n::after,
.edge-s::after {
  left: 20%;
  right: 20%;
  top: 4px;
  height: 1px;
}
.file-window-corner {
  width: 22px;
  height: 22px;
  z-index: 9;
}
.corner-nw {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}
.corner-ne {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}
.corner-sw {
  bottom: 0;
  left: 0;
  cursor: nesw-resize;
}
.file-resize {
  z-index: 9;
}
.file-resizing {
  user-select: none;
  -webkit-user-select: none;
}
.file-resizing :deep(iframe),
.file-resizing :deep(video) {
  pointer-events: none;
}
.team-file-library[data-keyboard="true"]
  :is(.file-splitter, .file-window-edge, .file-window-corner):focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
@media (pointer: coarse) {
  .file-library-body {
    --file-splitter-size: 24px;
  }
  .file-library-body.with-preview {
    grid-template-columns:
      minmax(130px, min(var(--file-list-share), calc(100% - 224px)))
      var(--file-splitter-size) minmax(0, 1fr);
  }
  .file-window-edge.edge-w,
  .file-window-edge.edge-e {
    width: 16px;
  }
  .file-window-edge.edge-n,
  .file-window-edge.edge-s {
    height: 16px;
  }
  .file-window-corner {
    width: 28px;
    height: 28px;
  }
}
</style>

<style scoped>
.with-preview > .file-library-scroll {
  container-type: inline-size;
}
@container (max-width:400px) {
  .with-preview .file-list .file-thumbnail {
    max-width: 60px;
    max-height: 60px;
  }
}
@container (max-width:260px) {
  .with-preview .file-list .file-thumbnail {
    display: none;
  }
  .with-preview .file-list .file-open {
    padding-right: 40px;
  }
  .with-preview .file-list .file-source-button {
    display: none;
  }
}
</style>

<style scoped>
.team-file-library {
  container-type: size;
}
.file-library-header {
  display: grid;
  grid-template-columns: minmax(max-content, 1fr) minmax(80px, 440px) minmax(
      max-content,
      1fr
    );
  gap: 8px;
  position: relative;
}
.file-library-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}
.file-library-title .file-count {
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-library-header > input {
  width: 100%;
  margin-left: 0;
}
.file-header-controls {
  min-width: 0;
}
.file-window-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
@container (max-width:1000px) {
  .file-library-header {
    grid-template-columns: minmax(max-content, 1fr) minmax(60px, 440px) minmax(
        max-content,
        1fr
      );
    gap: 2px 8px;
  }
  .file-library-title > .ui-icon {
    display: none;
  }
  .file-library-title .file-count {
    max-width: 50px;
  }
  .file-header-controls {
    grid-row: 2;
    grid-column: 1/-1;
    justify-self: center;
  }
  .file-window-actions {
    grid-row: 1;
    grid-column: 3;
  }
}
@media (pointer: coarse) {
  .file-window-actions button {
    width: 44px;
    min-height: 44px;
  }
}
</style>

<style scoped>
.file-context {
  position: absolute;
}
</style>

<style scoped>
.file-header-trailing {
  display: flex;
  align-items: center;
  justify-self: end;
  gap: 8px;
}
.file-search-field {
  grid-column: 2;
  justify-self: center;
  position: relative;
  width: 100%;
  min-width: 0;
  height: 36px;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-background-soft);
}
.file-library-header .file-search-field > input {
  position: absolute;
  left: 0;
  top: 50%;
  width: calc(100% / 0.8125);
  height: calc(100% / 0.8125);
  min-height: 0;
  margin: 0;
  padding: 6px 12px;
  box-sizing: border-box;
  border: 0 !important;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 16px !important;
  appearance: none;
  -webkit-appearance: none;
  transform: translateY(-50%) scale(0.8125);
  transform-origin: left center;
}
.team-file-library[data-keyboard="true"] .file-search-field:focus-within {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
.team-file-library[data-keyboard="true"]
  .file-search-field
  > input:focus-visible {
  outline: none !important;
}
@container (max-width:1000px) {
  .file-header-trailing {
    display: contents;
  }
  .file-library-title {
    grid-column: 1;
    grid-row: 1;
    justify-self: start;
  }
  .file-search-field {
    grid-row: 1;
  }
  .file-library-header {
    column-gap: 4px;
  }
}
@media (pointer: coarse) {
  .file-search-field {
    height: 44px;
  }
}
</style>

<style scoped>
.file-library-header {
  grid-template-columns:
    minmax(var(--file-header-side), 1fr) minmax(60px, 440px)
    minmax(var(--file-header-side), 1fr);
  padding-left: max(
    12px,
    var(--safe-area-left, 0px),
    var(--safe-area-right, 0px)
  );
  padding-right: max(
    12px,
    var(--safe-area-left, 0px),
    var(--safe-area-right, 0px)
  );
}
.file-library-title {
  justify-self: start;
}
.file-header-trailing {
  width: max-content;
}
</style>

<style scoped>
.file-window-actions {
  width: max-content;
  justify-self: end;
}
</style>
