<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
import { useChatDictation } from "@/composables/useChatDictation";
import {
  taskDate,
  localDay,
  taskStatuses,
  filterTasks,
} from "@/utils/teamTasks";
import UiIcon from "./UiIcon.vue";
import CodexMessageText from "./CodexMessageText.vue";
const props = defineProps({
  creating: Boolean,
  taskId: String,
  notifications: Boolean,
});
const emit = defineEmits(["close", "created", "new"]);
const chat = useTeamChatStore();
const blank = () => ({
  id: crypto.randomUUID(),
  description: "",
  assigneeIds: [],
  timing: "",
  dueDate: null,
  dueTime: null,
  attachments: [],
  status: "open",
});
const draft = ref(blank()),
  step = ref("who"),
  editing = ref(""),
  query = ref(""),
  text = ref(""),
  attachments = ref([]),
  mentions = ref([]),
  error = ref(""),
  busy = ref(false),
  uploading = ref(false),
  feed = ref(null),
  field = ref(null),
  fileInput = ref(null),
  messages = ref([]),
  hasMore = ref(false),
  loading = ref(false),
  filterOpen = ref(false);
const filters = ref({
  status: "all",
  mine: false,
  person: "",
  period: "",
  from: "",
  to: "",
});
const task = computed(() =>
  chat.state.tasks?.find((t) => t._id === props.taskId),
);
const active = computed(() => (props.creating ? draft.value : task.value));
const canEdit = computed(
  () =>
    props.creating ||
    (task.value &&
      (chat.me.owner ||
        task.value.creatorId === chat.me.actorId ||
        task.value.assigneeIds.includes(chat.me.actorId))),
);
const directory = computed(() =>
  [...(chat.state.people || [])].sort(
    (a, b) => (b._id === chat.me.actorId) - (a._id === chat.me.actorId),
  ),
);
const people = computed(() =>
  directory.value
    .filter((p) =>
      p.name
        .toLocaleLowerCase()
        .includes(query.value.trim().toLocaleLowerCase()),
    )
    .slice(0, 12),
);
const selectedNames = computed(() =>
  active.value?.assigneeIds
    .map(
      (id) =>
        directory.value.find((p) => p._id === id)?.name ||
        active.value.assignees?.find((p) => p.actorId === id)?.name,
    )
    .filter(Boolean)
    .join(", "),
);
const shownTasks = computed(() =>
  filterTasks(chat.state.tasks || [], filters.value, chat.me.actorId),
);
const picker = ref(""),
  month = ref(localDay().slice(0, 7)),
  hour = ref(12),
  minute = ref(0),
  clockPart = ref("hour");
const calendarDays = computed(() => {
  const [y, m] = month.value.split("-").map(Number),
    first = new Date(Date.UTC(y, m - 1, 1)),
    count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [
    ...Array((first.getUTCDay() + 6) % 7).fill(null),
    ...Array.from(
      { length: count },
      (_, i) => `${month.value}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];
});
const monthTitle = computed(() =>
  new Date(month.value + "-01T12:00:00Z").toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  }),
);
const voice = useChatDictation({
  getText: () =>
    (props.creating && step.value === "who") || editing.value === "who"
      ? query.value
      : props.creating
        ? draft.value.description
        : text.value,
  setText: (value) => {
    if ((props.creating && step.value === "who") || editing.value === "who")
      query.value = value;
    else if (props.creating) draft.value.description = value;
    else text.value = value;
  },
  onError: (value) => (error.value = value),
});
const mentionSearch = computed(
  () => text.value.match(/@([^@\n]*)$/)?.[1] ?? null,
);
const mentionPeople = computed(() =>
  mentionSearch.value === null
    ? []
    : directory.value
        .filter((p) =>
          p.name
            .toLocaleLowerCase()
            .includes(mentionSearch.value.toLocaleLowerCase()),
        )
        .slice(0, 8),
);
function mention(p) {
  text.value = text.value.replace(/@[^@\n]*$/, "@" + p.name + " ");
  mentions.value.push(p._id);
  field.value?.focus();
}
function go(value) {
  voice.stop();
  step.value = value;
  query.value = "";
  picker.value = "";
  if (value === "what")
    nextTick(() => field.value?.focus({ preventScroll: true }));
}
async function choosePerson(p) {
  if (props.creating) {
    if (!draft.value.assigneeIds.includes(p._id))
      draft.value.assigneeIds.push(p._id);
    go("when");
  } else {
    const ids =
      editing.value === "add"
        ? [...new Set([...task.value.assigneeIds, p._id])]
        : [p._id];
    if (await update({ assigneeIds: ids })) editing.value = "";
  }
}
function chooseTiming(value) {
  if (props.creating) draft.value.timing = value;
  else draft.value = { ...task.value, timing: value };
  if (value === "none") {
    if (props.creating) {
      draft.value.dueDate = null;
      draft.value.dueTime = null;
      go("what");
    } else
      update({ timing: value, dueDate: null, dueTime: null }).then((ok) => {
        if (ok) editing.value = "";
      });
  } else if (value === "deadline") openCalendar();
  else if (props.creating) go("urgent");
  else editing.value = "urgent";
}
function openCalendar() {
  voice.stop();
  month.value = (active.value?.dueDate || localDay()).slice(0, 7);
  picker.value = "date";
}
function shiftMonth(n) {
  const [y, m] = month.value.split("-").map(Number);
  month.value = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
async function chooseDate(date) {
  if (props.creating) {
    draft.value.dueDate = date;
    if (!draft.value.timing) draft.value.timing = "deadline";
    go("what");
  } else if (
    await update({
      dueDate: date,
      timing:
        editing.value === "when" || editing.value === "urgent"
          ? draft.value.timing
          : task.value.timing === "none"
            ? "deadline"
            : task.value.timing,
    })
  ) {
    picker.value = "";
    editing.value = "";
  }
}
function openClock() {
  if (!active.value?.dueDate) {
    openCalendar();
    return;
  }
  const [h, m] = (active.value.dueTime || "12:00").split(":").map(Number);
  hour.value = h;
  minute.value = m;
  clockPart.value = "hour";
  picker.value = "time";
}
async function chooseClock(value) {
  if (clockPart.value === "hour") {
    hour.value = value;
    clockPart.value = "minute";
    return;
  }
  minute.value = value;
  const dueTime = `${String(hour.value).padStart(2, "0")}:${String(value).padStart(2, "0")}`;
  if (props.creating) {
    draft.value.dueTime = dueTime;
    picker.value = "";
  } else if (await update({ dueTime })) {
    picker.value = "";
    editing.value = "";
  }
}
async function update(changes) {
  if (busy.value || !task.value) return false;
  busy.value = true;
  error.value = "";
  try {
    await chat.action(
      `/tasks/${props.taskId}`,
      { expectedVersion: task.value.version, ...changes },
      "patch",
    );
    return true;
  } catch (e) {
    error.value = teamError(e);
    return false;
  } finally {
    busy.value = false;
  }
}
async function create() {
  if (busy.value || uploading.value) return;
  busy.value = true;
  error.value = "";
  voice.stop();
  try {
    await chat.action("/tasks", {
      ...draft.value,
      fileIds: draft.value.attachments.map((f) => f.fileId),
    });
    await chat.refresh();
    emit("created");
  } catch (e) {
    error.value = teamError(e);
  } finally {
    busy.value = false;
  }
}
let generation = 0,
  refreshTimer;
async function loadMessages(older = false) {
  if (!props.taskId || loading.value) return;
  const id = props.taskId,
    g = generation;
  loading.value = true;
  const atBottom =
    !feed.value ||
    feed.value.scrollHeight - feed.value.scrollTop - feed.value.clientHeight <
      70;
  const height = feed.value?.scrollHeight || 0,
    top = feed.value?.scrollTop || 0;
  try {
    const { data } = await teamApi.get("/messages", {
      params: {
        taskId: id,
        ...(older && messages.value.length
          ? { before: messages.value[0]._id }
          : {}),
      },
    });
    if (g !== generation || id !== props.taskId) return;
    const fetched = new Map(data.messages.map((m) => [m._id, m]));
    if (older)
      messages.value = [
        ...data.messages,
        ...messages.value.filter((m) => !fetched.has(m._id)),
      ];
    else {
      const earliest = data.messages[0]?.createdAt;
      messages.value = [
        ...messages.value.filter((m) => earliest && m.createdAt < earliest),
        ...data.messages,
      ];
    }
    if (older || messages.value.length <= 50) hasMore.value = data.hasMore;
    await nextTick();
    if (feed.value)
      feed.value.scrollTop = older
        ? top + feed.value.scrollHeight - height
        : atBottom
          ? feed.value.scrollHeight
          : top;
    scheduleReads();
  } catch (e) {
    if (g === generation) error.value = teamError(e);
  } finally {
    if (g === generation) loading.value = false;
  }
}
const acknowledged = new Set();
let readTimer;
function scheduleReads() {
  clearTimeout(readTimer);
  readTimer = setTimeout(readVisible, 250);
}
async function readVisible() {
  if (!feed.value || document.visibilityState === "hidden") return;
  const bounds = feed.value.getBoundingClientRect();
  const ids = [...feed.value.querySelectorAll("[data-comment-id]")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > bounds.top && r.top < bounds.bottom;
    })
    .map((el) => el.dataset.commentId)
    .filter((id) => {
      const m = messages.value.find((m) => m._id === id);
      return (
        m &&
        m.authorId !== chat.me.actorId &&
        !acknowledged.has(id + ":" + (m.contentVersion || 0))
      );
    });
  if (!ids.length) return;
  try {
    await teamApi.post("/messages/read", { ids });
    for (const id of ids) {
      const m = messages.value.find((m) => m._id === id);
      if (m) acknowledged.add(id + ":" + (m.contentVersion || 0));
    }
    chat.schedule();
  } catch (e) {
    error.value = teamError(e);
  }
}
async function toggleList(t) {
  if (
    !chat.me.owner &&
    t.creatorId !== chat.me.actorId &&
    !t.assigneeIds.includes(chat.me.actorId)
  ) {
    chat.requestedTaskId = t._id;
    return;
  }
  try {
    await chat.action(
      `/tasks/${t._id}`,
      {
        expectedVersion: t.version,
        status: t.status === "done" ? "open" : "done",
      },
      "patch",
    );
  } catch (e) {
    error.value = teamError(e);
  }
}
const preview = ref(null);
function closePreview() {
  if (preview.value) URL.revokeObjectURL(preview.value.url);
  preview.value = null;
}
const sendingId = ref(null);
async function send() {
  if (
    busy.value ||
    uploading.value ||
    (!text.value.trim() && !attachments.value.length)
  )
    return;
  busy.value = true;
  error.value = "";
  voice.stop();
  const body = {
    id: sendingId.value || crypto.randomUUID(),
    taskId: props.taskId,
    text: text.value.trim(),
    fileIds: attachments.value.map((f) => f.fileId),
    mentionIds: [...new Set(mentions.value)].filter((id) =>
      text.value.includes(
        "@" + directory.value.find((p) => p._id === id)?.name,
      ),
    ),
  };
  sendingId.value = body.id;
  try {
    await teamApi.post("/messages", body);
    text.value = "";
    attachments.value = [];
    mentions.value = [];
    sendingId.value = null;
    await loadMessages();
    await chat.refresh();
    await nextTick();
    if (feed.value) feed.value.scrollTop = feed.value.scrollHeight;
  } catch (e) {
    error.value = teamError(e);
  } finally {
    busy.value = false;
  }
}
watch(
  [text, attachments],
  () => {
    if (!busy.value) sendingId.value = null;
  },
  { deep: true },
);
async function upload(event) {
  const files = [...event.target.files];
  event.target.value = "";
  if (!files.length) return;
  const target = props.creating ? draft.value.attachments : attachments.value;
  if (
    target.length + files.length > 5 ||
    [...files].reduce(
      (n, f) => n + f.size,
      target.reduce((n, f) => n + f.size, 0),
    ) >
      25 * 1024 * 1024 ||
    files.some((f) => f.size > 10 * 1024 * 1024)
  ) {
    error.value = "До 5 файлов, до 10 МБ каждый и до 25 МБ вместе";
    return;
  }
  const g = generation;
  uploading.value = true;
  error.value = "";
  try {
    for (const file of files) {
      const { data } = await teamApi.post("/files", file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
      });
      if (g !== generation) return;
      target.push(data.file);
    }
  } catch (e) {
    if (g === generation) error.value = teamError(e);
  } finally {
    if (g === generation) uploading.value = false;
  }
}
async function download(file) {
  try {
    const { data } = await teamApi.get(`/files/${file.fileId}`, {
      responseType: "blob",
    });
    if (
      /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(
        file.mimeType || "",
      )
    ) {
      closePreview();
      preview.value = {
        url: URL.createObjectURL(new Blob([data], { type: file.mimeType })),
        name: file.name,
        mimeType: file.mimeType,
      };
      return;
    }
    const url = URL.createObjectURL(data),
      a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e) {
    error.value = teamError(e);
  }
}
async function editDescription() {
  if (!canEdit.value) return;
  text.value = task.value.description;
  editing.value = "description";
  await nextTick();
  field.value?.focus();
}
function close() {
  if (busy.value || uploading.value) return;
  if (picker.value) {
    picker.value = "";
    return;
  }
  if (editing.value) {
    editing.value = "";
    text.value = "";
    return;
  }
  emit("close");
}
watch(
  () => [props.taskId, props.creating],
  async () => {
    generation++;
    acknowledged.clear();
    loading.value = false;
    messages.value = [];
    error.value = "";
    editing.value = "";
    picker.value = "";
    text.value = "";
    attachments.value = [];
    voice.stop();
    if (props.creating) {
      draft.value = blank();
      go("who");
    }
    if (props.taskId) {
      if (!task.value) {
        try {
          const { data } = await teamApi.get("/tasks/" + props.taskId);
          chat.state.tasks.push(data.task);
        } catch (e) {
          error.value = teamError(e);
          return;
        }
      }
      await loadMessages();
      const target =
        chat.requestedTaskMessageId || task.value?.mentionMessageId;
      if (target) {
        while (hasMore.value && !messages.value.some((m) => m._id === target)) {
          await loadMessages(true);
          if (error.value) break;
        }
        await nextTick();
        feed.value
          ?.querySelector(`[data-comment-id="${target}"]`)
          ?.scrollIntoView({ block: "center" });
        scheduleReads();
      }
    }
  },
  { immediate: true },
);
watch(
  () => chat.state.checkedAt,
  () => {
    clearTimeout(refreshTimer);
    if (props.taskId) refreshTimer = setTimeout(() => loadMessages(), 80);
  },
);
onBeforeUnmount(() => {
  generation++;
  closePreview();
  clearTimeout(refreshTimer);
  clearTimeout(readTimer);
});
</script>
<template>
  <section
    class="task-panel"
    :class="{ wizard: creating }"
    @keydown.esc.stop.prevent="close"
  >
    <div
      v-if="preview"
      class="task-preview-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="preview.name"
      @keydown.esc.stop.prevent="closePreview"
    >
      <header>
        <span>{{ preview.name }}</span
        ><button aria-label="Закрыть просмотр" @click="closePreview">
          <UiIcon name="close" />
        </button>
      </header>
      <img
        v-if="preview.mimeType.startsWith('image/')"
        :src="preview.url"
        :alt="preview.name"
      /><iframe v-else :src="preview.url" :title="preview.name" />
    </div>
    <input ref="fileInput" type="file" multiple hidden @change="upload" />
    <header v-if="creating || taskId" class="task-header">
      <button aria-label="Назад" :disabled="busy || uploading" @click="close">
        <UiIcon name="back" /></button
      ><span :class="{ 'creation-title': creating }">{{
        creating ? "Новая задача" : "Задача"
      }}</span
      ><button
        aria-label="Закрыть"
        :disabled="busy || uploading"
        @click="emit('close')"
      >
        <UiIcon name="close" />
      </button>
    </header>
    <p v-if="error" class="task-error" role="alert">{{ error }}</p>
    <div v-if="picker" class="picker-backdrop" @click.self="picker = ''">
      <section
        class="task-picker"
        role="dialog"
        aria-modal="true"
        :aria-label="picker === 'date' ? 'Выберите дату' : 'Выберите время'"
        @keydown.esc.stop.prevent="picker = ''"
      >
        <header>
          <button aria-label="Закрыть выбор" @click="picker = ''">
            <UiIcon name="close" /></button
          ><template v-if="picker === 'date'"
            ><button aria-label="Предыдущий месяц" @click="shiftMonth(-1)">
              ‹</button
            ><span>{{ monthTitle }}</span
            ><button aria-label="Следующий месяц" @click="shiftMonth(1)">
              ›
            </button></template
          ><template v-else
            ><button @click="clockPart = 'hour'">
              {{ String(hour).padStart(2, "0") }}</button
            ><span>:</span
            ><button @click="clockPart = 'minute'">
              {{ String(minute).padStart(2, "0") }}
            </button></template
          >
        </header>
        <div v-if="picker === 'date'" class="calendar">
          <span
            v-for="day in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']"
            :key="day"
            >{{ day }}</span
          ><template v-for="(day, i) in calendarDays" :key="i"
            ><button
              v-if="day"
              :aria-pressed="day === active?.dueDate"
              :aria-current="day === localDay() ? 'date' : undefined"
              @click="chooseDate(day)"
            >
              {{ Number(day.slice(-2)) }}</button
            ><span v-else
          /></template>
        </div>
        <div v-else class="clock-face">
          <template v-if="clockPart === 'hour'"
            ><button
              v-for="(_, i) in 24"
              :key="i"
              :style="{
                left:
                  50 +
                  (i < 12 ? 42 : 28) * Math.sin(((i % 12) * Math.PI) / 6) +
                  '%',
                top:
                  50 -
                  (i < 12 ? 42 : 28) * Math.cos(((i % 12) * Math.PI) / 6) +
                  '%',
              }"
              :aria-label="`${i} часов`"
              @click="chooseClock(i)"
            >
              {{ String(i).padStart(2, "0") }}
            </button></template
          ><template v-else
            ><button
              v-for="(_, i) in 12"
              :key="'m' + i"
              :style="{
                left: 50 + 42 * Math.sin((i * Math.PI) / 6) + '%',
                top: 50 - 42 * Math.cos((i * Math.PI) / 6) + '%',
              }"
              @click="chooseClock(i * 5)"
            >
              {{ String(i * 5).padStart(2, "0") }}
            </button></template
          >
        </div>
        <div
          v-if="picker === 'time' && clockPart === 'minute'"
          class="exact-time"
        >
          <input
            v-model.number="minute"
            type="number"
            min="0"
            max="59"
            aria-label="Минуты"
          /><button
            @click="
              Number.isInteger(minute) &&
              minute >= 0 &&
              minute < 60 &&
              chooseClock(minute)
            "
          >
            ✓
          </button>
        </div>
      </section>
    </div>
    <div v-if="creating" class="task-stage">
      <div class="task-focus">
        <div v-if="step === 'who'" class="task-input-line">
          <span>Кому:</span>
          <div class="task-choice-content">
            <input
              v-model="query"
              placeholder="Имя"
              aria-label="Найти сотрудника"
            />
            <div class="inline-choices">
              <button v-for="p in people" :key="p._id" @click="choosePerson(p)">
                {{ p._id === chat.me.actorId ? "Себе" : p.name }}</button
              ><button
                aria-label="Найти сотрудника"
                @click="
                  $event.currentTarget
                    .closest('.task-choice-content')
                    .querySelector('input')
                    .focus()
                "
              >
                <UiIcon name="search" />
              </button>
            </div>
          </div>
        </div>
        <div v-else-if="step === 'when'" class="task-input-line">
          <span>Когда:</span>
          <div class="inline-choices">
            <button @click="chooseTiming('urgent')">Срочно</button
            ><button @click="chooseTiming('deadline')">К сроку</button
            ><button @click="chooseTiming('none')">Без срока</button>
          </div>
        </div>
        <div v-else-if="step === 'urgent'" class="task-input-line">
          <span>Когда:</span>
          <div class="inline-choices">
            <button @click="chooseDate(localDay())">Сегодня</button
            ><button @click="chooseDate(localDay(1))">Завтра</button
            ><button aria-label="Выбрать дату" @click="openCalendar">
              <UiIcon name="calendar" />
            </button>
          </div>
        </div>
        <div v-else class="task-description-box">
          <textarea
            ref="field"
            v-model="draft.description"
            placeholder="Вкратце опишите задачу"
            aria-label="Описание задачи"
            maxlength="10000"
          />
          <div class="description-tools">
            <button
              aria-label="Прикрепить файл"
              :disabled="uploading"
              @click="fileInput.click()"
            >
              <UiIcon name="attach" /></button
            ><button
              v-if="voice.supported"
              :aria-pressed="voice.recording.value"
              aria-label="Диктовка"
              @click="voice.toggle"
            >
              <UiIcon name="mic" />
            </button>
          </div>
        </div>
        <div class="draft-summary">
          <div v-if="draft.assigneeIds.length">
            <button @click="go('who')">Кому: {{ selectedNames }}</button
            ><button aria-label="Добавить ответственного" @click="go('who')">
              +
            </button>
          </div>
          <div v-if="draft.timing">
            <button @click="go('when')">Когда:</button
            ><button @click="draft.dueDate ? openCalendar() : go('when')">
              {{
                draft.dueDate
                  ? taskDate(draft)
                  : draft.timing === "urgent"
                    ? "Срочно"
                    : "Без срока"
              }}</button
            ><button
              v-if="draft.dueDate"
              aria-label="Указать время"
              @click="openClock"
            >
              <UiIcon name="clock" />
            </button>
          </div>
        </div>
        <div class="task-files">
          <span v-for="(f, i) in draft.attachments" :key="f.fileId"
            ><button @click="download(f)">{{ f.name }}</button
            ><button
              :aria-label="`Убрать ${f.name}`"
              @click="draft.attachments.splice(i, 1)"
            >
              ×
            </button></span
          >
        </div>
        <button
          v-if="step === 'what'"
          class="task-publish"
          :disabled="busy || uploading || !draft.description.trim()"
          @click="create"
        >
          Поставить задачу
        </button>
      </div>
    </div>
    <template v-else-if="taskId">
      <div v-if="!task" class="task-empty">Задача недоступна</div>
      <template v-else>
        <div class="task-overview">
          <div v-if="editing === 'description'" class="edit-description">
            <textarea
              ref="field"
              v-model="text"
              aria-label="Описание задачи"
              maxlength="10000"
            /><button
              :disabled="busy"
              aria-label="Сохранить"
              @click="
                update({ description: text }).then((ok) => {
                  if (ok) {
                    editing = '';
                    text = '';
                  }
                })
              "
            >
              ✓</button
            ><button
              aria-label="Отменить"
              @click="
                editing = '';
                text = '';
              "
            >
              ×
            </button>
          </div>
          <button
            v-else
            class="task-description"
            :disabled="!canEdit"
            @click="editDescription"
          >
            {{ task.description }}
          </button>
          <div class="task-details">
            <button
              :disabled="!canEdit"
              @click="
                editing = 'who';
                query = '';
              "
            >
              Кому: {{ selectedNames }}</button
            ><button
              :disabled="!canEdit"
              @click="
                editing = 'add';
                query = '';
              "
              aria-label="Добавить ответственного"
            >
              +
            </button>
          </div>
          <div class="task-details">
            <button :disabled="!canEdit" @click="editing = 'when'">
              Когда:</button
            ><button
              :disabled="!canEdit"
              @click="task.dueDate ? openCalendar() : (editing = 'when')"
            >
              {{ taskDate(task) }}</button
            ><button
              v-if="task.dueDate"
              :disabled="!canEdit"
              aria-label="Указать время"
              @click="openClock"
            >
              <UiIcon name="clock" />
            </button>
          </div>
          <div v-if="['who', 'add'].includes(editing)" class="task-input-line">
            <input
              v-model="query"
              placeholder="Имя"
              aria-label="Найти сотрудника"
            />
            <div class="inline-choices">
              <button v-for="p in people" :key="p._id" @click="choosePerson(p)">
                {{ p._id === chat.me.actorId ? "Себе" : p.name }}
              </button>
            </div>
            <button aria-label="Закрыть выбор" @click="editing = ''">×</button>
          </div>
          <div v-if="editing === 'when'" class="inline-choices">
            <button @click="chooseTiming('urgent')">Срочно</button
            ><button @click="chooseTiming('deadline')">К сроку</button
            ><button @click="chooseTiming('none')">Без срока</button>
          </div>
          <div v-if="editing === 'urgent'" class="inline-choices">
            <button @click="chooseDate(localDay())">Сегодня</button
            ><button @click="chooseDate(localDay(1))">Завтра</button>
          </div>
          <div class="task-files">
            <button
              v-for="f in task.attachments"
              :key="f.fileId"
              @click="download(f)"
            >
              <UiIcon name="attach" />{{ f.name }}
            </button>
          </div>
          <div class="task-creator">От: {{ task.creatorName }}</div>
          <div class="task-statuses">
            <button
              v-for="s in taskStatuses.slice(1)"
              :key="s.id"
              :aria-pressed="task.status === s.id"
              :disabled="busy || !canEdit"
              @click="update({ status: task.status === s.id ? 'open' : s.id })"
            >
              {{ s.label }}
            </button>
          </div>
        </div>
        <div ref="feed" class="task-conversation" @scroll="scheduleReads">
          <button
            v-if="hasMore"
            :disabled="loading"
            @click="loadMessages(true)"
          >
            Загрузить ещё
          </button>
          <article
            v-for="m in messages"
            :key="m._id"
            :data-comment-id="m._id"
            :class="{ own: m.authorId === chat.me.actorId }"
          >
            <header>
              <span>{{ m.authorName }}</span
              ><time>{{
                new Date(m.createdAt).toLocaleString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }}</time>
            </header>
            <CodexMessageText :text="m.text" /><button
              v-for="f in m.attachments"
              :key="f.fileId"
              @click="download(f)"
            >
              <UiIcon name="attach" />{{ f.name }}
            </button>
          </article>
        </div>
        <form
          v-if="editing !== 'description'"
          class="task-composer"
          @submit.prevent="send"
        >
          <div v-if="mentionPeople.length" class="mention-options">
            <button
              v-for="p in mentionPeople"
              :key="p._id"
              type="button"
              @click="mention(p)"
            >
              {{ p.name }}
            </button>
          </div>
          <div v-if="attachments.length" class="task-files">
            <span v-for="(f, i) in attachments" :key="f.fileId"
              ><button type="button" @click="download(f)">{{ f.name }}</button
              ><button
                type="button"
                :aria-label="`Убрать ${f.name}`"
                @click="attachments.splice(i, 1)"
              >
                ×
              </button></span
            >
          </div>
          <div class="task-compose-row">
            <button
              type="button"
              aria-label="Прикрепить файл"
              :disabled="uploading"
              @click="fileInput.click()"
            >
              <UiIcon name="attach" /></button
            ><textarea
              ref="field"
              v-model="text"
              placeholder="Сообщение"
              aria-label="Сообщение"
              maxlength="10000"
              @keydown.enter.exact.prevent="send"
            /><button
              v-if="voice.supported"
              type="button"
              aria-label="Диктовка"
              :aria-pressed="voice.recording.value"
              @click="voice.toggle"
            >
              <UiIcon name="mic" /></button
            ><button
              type="submit"
              aria-label="Отправить"
              :disabled="
                busy || uploading || (!text.trim() && !attachments.length)
              "
            >
              <UiIcon name="send" />
            </button>
          </div>
        </form>
      </template>
    </template>
    <template v-else-if="notifications">
      <header class="task-header">
        <span></span><span>Уведомления</span
        ><button aria-label="Закрыть" @click="emit('close')">
          <UiIcon name="close" />
        </button>
      </header>
      <div class="task-list">
        <button
          v-for="t in (chat.state.tasks || []).filter(
            (t) => t.mentioned || t.unreadCount,
          )"
          :key="t._id"
          class="task-notification"
          @click="
            chat.requestedTaskMessageId = t.mentionMessageId || t.latest?._id;
            chat.requestedTaskId = t._id;
          "
        >
          <span>{{ t.description }}</span
          ><span><b v-if="t.mentioned">@</b> {{ t.unreadCount || "" }}</span>
        </button>
        <p v-if="!chat.actionable" class="task-empty">Нет уведомлений</p>
      </div>
    </template>
    <template v-else>
      <div class="task-list-toolbar">
        <button
          v-for="s in taskStatuses"
          :key="s.id"
          :aria-pressed="filters.status === s.id"
          @click="filters.status = s.id"
        >
          {{ s.label }}</button
        ><button
          aria-label="Фильтры"
          :aria-expanded="filterOpen"
          @click="filterOpen = !filterOpen"
        >
          <UiIcon name="filter" /></button
        ><button aria-label="Новая задача" @click="emit('new')">
          <UiIcon name="plus" />
        </button>
      </div>
      <div v-if="filterOpen" class="task-filters">
        <label
          ><input v-model="filters.mine" type="checkbox" />Поставлены
          мной</label
        ><label
          >Ответственный<select
            v-model="filters.person"
            aria-label="Ответственный"
          >
            <option value="">Все</option>
            <option v-for="p in directory" :key="p._id" :value="p._id">
              {{ p.name }}
            </option>
          </select></label
        ><label
          >Срок<select
            aria-label="Срок"
            v-model="filters.period"
            @change="
              filters.from = '';
              filters.to = '';
            "
          >
            <option value="">Любой срок</option>
            <option value="today">Сегодня</option>
            <option value="none">Без срока</option>
            <option value="range">Период</option>
          </select></label
        >
        <div v-if="filters.period === 'range'">
          <label>С<input v-model="filters.from" type="date" /></label
          ><label>По<input v-model="filters.to" type="date" /></label>
        </div>
        <button
          @click="
            filters = {
              status: 'all',
              mine: false,
              person: '',
              period: '',
              from: '',
              to: '',
            }
          "
        >
          Сбросить
        </button>
      </div>
      <div class="task-list">
        <div
          v-for="t in shownTasks"
          :key="t._id"
          class="task-list-row"
          :class="{ done: t.status === 'done' }"
        >
          <button
            class="list-check"
            role="checkbox"
            :aria-checked="t.status === 'done'"
            :aria-label="t.status === 'done' ? 'Вернуть задачу' : 'Готово'"
            @click="toggleList(t)"
          >
            {{ t.status === "done" ? "✓" : "○" }}</button
          ><button class="list-content" @click="chat.requestedTaskId = t._id">
            <span :title="t.description">{{ t.description }}</span
            ><span>{{ t.assignees.map((p) => p.name).join(", ") }}</span
            ><span
              >{{ taskDate(t) }}<b v-if="t.unreadCount"> {{ t.unreadCount }}</b
              ><b v-if="t.mentioned"> @</b></span
            >
          </button>
        </div>
        <p v-if="!shownTasks.length" class="task-empty">Нет задач</p>
      </div>
    </template>
    <span v-if="uploading" class="upload-state" role="status">Загрузка…</span>
  </section>
</template>
<style scoped src="./teamTasks.css"></style>
