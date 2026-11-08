<script setup>
import {
  ref,
  computed,
  watch,
  nextTick,
  onBeforeUnmount,
  onMounted,
} from "vue";
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
import { useChatDictation } from "@/composables/useChatDictation";
import {
  taskDate,
  localDay,
  taskStatuses,
  filterTasks,
} from "@/utils/teamTasks";
import UiIcon from "./UiIcon.vue";
import TeamChatConversation from "./TeamChatConversation.vue";
import TeamTaskMenu from "./TeamTaskMenu.vue";
import TeamMediaPreview from "./TeamMediaPreview.vue";
import { useTeamMedia } from "@/composables/useTeamMedia";
import TeamTaskStatusSelect from "./TeamTaskStatusSelect.vue";
import TeamTaskRecipientPicker from "./TeamTaskRecipientPicker.vue";
import { useTaskHold } from "@/composables/useTaskHold";
const props = defineProps({
  creating: Boolean,
  taskId: String,
  notifications: Boolean,
  mobile: Boolean,
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
  error = ref(""),
  busy = ref(false),
  uploading = ref(false),
  field = ref(null),
  fileInput = ref(null),
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
let generation = 0;
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
const { preview, closePreview, download, retryPreview, cacheUpload, prefetch } =
  useTeamMedia({
    onError: (e) => {
      error.value = teamError(e);
    },
  });
async function upload(event) {
  const files = [...event.target.files];
  event.target.value = "";
  if (!files.length) return;
  const target = draft.value.attachments;
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
      cacheUpload(data.file, file);
      target.push(data.file);
    }
  } catch (e) {
    if (g === generation) error.value = teamError(e);
  } finally {
    if (g === generation) uploading.value = false;
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
  if (filterOpen.value) { filterOpen.value = false; return; }
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
const menuTask = ref(null),
  confirmDelete = ref(false),
  touchMenu = ref(false);
const canDelete = computed(
  () =>
    task.value && (chat.me?.owner || task.value.creatorId === chat.me?.actorId),
);
function showTaskMenu(task, touch = false) {
  menuTask.value = task;
  confirmDelete.value = false;
  touchMenu.value = touch;
}
const hold = useTaskHold(showTaskMenu);
const keyboardOpen = ref(false),
  detailsOpen = ref(true);
const detailsCollapsed = computed(() => !detailsOpen.value && !editing.value);
function viewport() {
  const open =
    innerHeight - (window.visualViewport?.height || innerHeight) > 120;
  if (open !== keyboardOpen.value) {
    keyboardOpen.value = open;
    detailsOpen.value = !open;
  }
}
function composerFocus() {
  if (props.mobile || matchMedia("(max-width:1024px),(pointer:coarse)").matches)
    detailsOpen.value = false;
}
watch(
  () => [props.taskId, props.creating],
  async () => {
    const g = ++generation;
    error.value = "";
    editing.value = "";
    picker.value = "";
    text.value = "";
    voice.stop();
    detailsOpen.value = !keyboardOpen.value;
    if (props.creating) {
      draft.value = blank();
      go("who");
    }
    if (props.taskId && !task.value) {
      try {
        const { data } = await teamApi.get("/tasks/" + props.taskId);
        if (g === generation) chat.state.tasks.push(data.task);
      } catch (e) {
        if (g === generation) error.value = teamError(e);
      }
    }
  },
  { immediate: true },
);
watch(
  () => task.value?.attachments,
  (files) => prefetch(files || []),
  { immediate: true },
);
watch(task, (value, previous) => {
  if (previous && !value && props.taskId) emit("close");
});
onMounted(() => {
  viewport();
  window.visualViewport?.addEventListener("resize", viewport);
  window.addEventListener("resize", viewport);
});
onBeforeUnmount(() => {
  generation++;
  closePreview();
  window.visualViewport?.removeEventListener("resize", viewport);
  window.removeEventListener("resize", viewport);
});
</script>
<template>
  <section
    class="task-panel"
    :class="{
      wizard: creating,
      'task-details-collapsed': detailsCollapsed,
      'task-is-editing': !!editing,
    }"
    @keydown.esc.stop.prevent="close"
  >
    <TeamMediaPreview
      v-if="preview"
      :media="preview"
      @close="closePreview"
      @retry="retryPreview"
    />
    <input ref="fileInput" type="file" multiple hidden @change="upload" />
    <TeamTaskMenu
      v-if="menuTask"
      :task="menuTask"
      :confirm-only="confirmDelete"
      :suppress-opening-touch="touchMenu"
      @close="menuTask = null"
      @open="chat.requestedTaskId = menuTask._id"
    />
    <header v-if="creating || taskId" class="task-header">
      <button aria-label="Назад" :disabled="busy || uploading" @click="close">
        <UiIcon name="back" />
      </button>
      <span v-if="creating" class="creation-title">Новая задача</span>
      <button
        v-else
        class="task-heading-title"
        :aria-expanded="!detailsCollapsed"
        aria-label="Параметры задачи"
        @pointerdown.prevent
        @click="detailsOpen = !detailsOpen"
      >
        <span>{{
          detailsCollapsed ? task?.description || "Задача" : "Задача"
        }}</span
        ><UiIcon :name="detailsCollapsed ? 'chevron-down' : 'chevron-up'" />
      </button>
      <button
        v-if="creating"
        aria-label="Закрыть"
        :disabled="busy || uploading"
        @click="emit('close')"
      >
        <UiIcon name="close" />
      </button>
      <button
        v-else-if="canDelete"
        aria-label="Удалить задачу"
        @click="
          menuTask = task;
          confirmDelete = true;
        "
      >
        <UiIcon name="trash" /></button
      ><span v-else />
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
            ><div class="clock-display">
              <button
                aria-label="Часы"
                :aria-pressed="clockPart === 'hour'"
                @click="clockPart = 'hour'"
              >
                {{ String(hour).padStart(2, "0") }}</button
              ><span>:</span
              ><button
                aria-label="Минуты"
                :aria-pressed="clockPart === 'minute'"
                @click="clockPart = 'minute'"
              >
                {{ String(minute).padStart(2, "0") }}
              </button>
            </div>
            <span class="clock-header-spacer" aria-hidden="true"
          /></template>
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
          <span
            class="clock-hand"
            aria-hidden="true"
            :style="{
              height: (clockPart === 'hour' ? (hour < 12 ? 42 : 28) : 42) + '%',
              transform: `rotate(${clockPart === 'hour' ? (hour % 12) * 30 : minute * 6}deg)`,
            }"
          />
          <span class="clock-center" aria-hidden="true" />

          <template v-if="clockPart === 'hour'"
            ><button
              v-for="(_, i) in 24"
              :key="i"
              :aria-pressed="hour === i"
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
              :aria-pressed="minute === i * 5"
              :aria-label="`${i * 5} минут`"
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
        <TeamTaskRecipientPicker
          v-if="step === 'who'"
          :people="directory"
          :actor-id="chat.me.actorId"
          :disabled="busy"
          @select="choosePerson"
        />
        <div v-else-if="step === 'when'" class="task-input-line">
          <span>Когда:</span>
          <div class="inline-choices">
            <button class="task-choice-chip" data-tone="urgent" @click="chooseTiming('urgent')"><span class="task-chip-label">Срочно</span></button
            ><button class="task-choice-chip" data-tone="deadline" @click="chooseTiming('deadline')"><span class="task-chip-label">К сроку</span></button
            ><button class="task-choice-chip" data-tone="none" @click="chooseTiming('none')"><span class="task-chip-label">Без срока</span></button>
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
            <span v-if="uploading" class="upload-state" role="status"
              >Загрузка…</span
            >
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
        <div v-show="!detailsCollapsed" class="task-overview">
          <div class="task-summary" :class="{ 'is-editing': editing === 'description' }">
            <div class="task-summary-title">
              <TeamTaskStatusSelect compact :model-value="task.status" :disabled="busy || !canEdit" @update:model-value="update({ status: $event })" />
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
            </div>
            <span class="task-field-label task-who-label">Кому:</span>
            <div class="task-field-value task-who-value">
              <button class="task-assignee" :aria-label="`Кому: ${selectedNames}`" :title="selectedNames" :disabled="!canEdit" @click="editing = 'who'; query = ''">{{ selectedNames }}</button>
              <button :disabled="!canEdit" aria-label="Добавить ответственного" @click="editing = 'add'; query = ''">+</button>
            </div>
            <button class="task-field-label task-when-label" :disabled="!canEdit" @click="editing = 'when'">Когда:</button>
            <div class="task-field-value task-when-value">
              <button class="task-due" :title="taskDate(task)" :disabled="!canEdit" @click="task.dueDate ? openCalendar() : (editing = 'when')">{{ taskDate(task) }}</button>
              <button v-if="task.dueDate" :disabled="!canEdit" aria-label="Указать время" @click="openClock"><UiIcon name="clock" /></button>
            </div>
            <span class="task-field-label task-from-label">От:</span>
            <span class="task-field-value task-from-value" :title="task.creatorName">{{ task.creatorName }}</span>
          </div>
          <TeamTaskRecipientPicker
            v-if="['who', 'add'].includes(editing)"
            :key="editing"
            :people="directory"
            :actor-id="chat.me.actorId"
            :disabled="busy"
            @select="choosePerson"
          />
          <div v-if="editing === 'when'" class="inline-choices">
            <button class="task-choice-chip" data-tone="urgent" @click="chooseTiming('urgent')"><span class="task-chip-label">Срочно</span></button
            ><button class="task-choice-chip" data-tone="deadline" @click="chooseTiming('deadline')"><span class="task-chip-label">К сроку</span></button
            ><button class="task-choice-chip" data-tone="none" @click="chooseTiming('none')"><span class="task-chip-label">Без срока</span></button>
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
        </div>
        <TeamChatConversation
          v-show="editing !== 'description'"
          :active="editing !== 'description'"
          :key="taskId"
          :task-id="taskId"
          :target-message-id="
            chat.requestedTaskMessageId || task.mentionMessageId
          "
          :mobile="mobile"
          class="task-discussion"
          @composer-focus="composerFocus"
          @new="emit('new')"
        />
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
          class="task-filter-toggle"
          aria-label="Фильтры"
          :aria-expanded="filterOpen"
          @click="filterOpen = !filterOpen"
        >
          <UiIcon name="filter" /></button
        ><button aria-label="Новая задача" @click="emit('new')">
          <UiIcon name="plus" />
        </button>
      </div>
      <div v-if="filterOpen" class="task-filter-backdrop" @click.stop="filterOpen = false" />
      <div v-if="filterOpen" class="task-filters" role="region" aria-label="Фильтры задач">
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
            };
            filterOpen = false
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
          @pointerdown="hold.down($event, t)"
          @pointermove="hold.move"
          @pointerup="hold.cancel"
          @pointercancel="hold.cancel"
          @click.capture="hold.click"
          @contextmenu="hold.context($event, t)"
          @keydown="hold.keys($event, t)"
          :class="{ done: t.status === 'done' }"
        >
          <button
            class="list-check"
            role="checkbox"
            :aria-checked="t.status === 'done'"
            :aria-label="t.status === 'done' ? 'Вернуть задачу' : 'Готово'"
            @click="toggleList(t)"
          >
            <span class="list-checkmark" aria-hidden="true">{{
              t.status === "done" ? "✓" : ""
            }}</span></button
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
  </section>
</template>
<style scoped src="./teamTasks.css"></style>

<style scoped src="./teamTaskChips.css"></style>
