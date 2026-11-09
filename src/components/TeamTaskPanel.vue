<script setup>
import LinkedText from './LinkedText.vue';
import { recipientName } from '@/utils/recipientName';
import { useInputModality } from '@/composables/useInputModality';
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
import { useTeamTaskDeadline } from '@/composables/useTeamTaskDeadline';
import TeamChatConversation from "./TeamChatConversation.vue";
import TeamTaskMenu from "./TeamTaskMenu.vue";
import TeamMediaPreview from "./TeamMediaPreview.vue";
import { useTeamMedia } from "@/composables/useTeamMedia";
import TeamTaskTextEditor from "./TeamTaskTextEditor.vue";
import TeamTaskStatusSelect from "./TeamTaskStatusSelect.vue";
import TeamTaskRecipientPicker from "./TeamTaskRecipientPicker.vue";
import TeamTaskProjectPicker from './TeamTaskProjectPicker.vue';
import TeamTaskFilters from './TeamTaskFilters.vue';
import { useTaskHold } from "@/composables/useTaskHold";
const props = defineProps({
  creating: Boolean,
  taskId: String,
  parentTaskId: String,
  notifications: Boolean,
  mobile: Boolean,
});
const emit = defineEmits(["close", "created", "new"]);
const chat = useTeamChatStore();
const keyboard = useInputModality();
const blank = () => ({
  id: crypto.randomUUID(),
  description: "",
  assigneeIds: [],
  timing: "",
  dueDate: null,
  dueTime: null,
  attachments: [],
  status: "open",
  projectId: null,
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
  fileInput = ref(null);
const filters = computed(() => chat.taskFilters);
const partyName = computed(() => { const party = active.value?.party; return chat.taskOptions.parties.find(row => row.kind === party?.kind && row.id === party?.id)?.name || active.value?.partyName || 'Без контрагента'; });
const projectName = computed(() => chat.taskOptions.projects.find(project => project._id === active.value?.projectId)?.name || active.value?.projectName || 'Без проекта');
async function chooseProject(projectId) {
  if (props.creating) { draft.value.projectId = projectId; go('what'); }
  else if (await update({ projectId })) editing.value = '';
}
function chooseParty(value) { const [kind, id] = value.split(':'); void update({ party: value ? { kind, id } : null }); }
onMounted(() => chat.loadTaskOptions());
const task = computed(() =>
  chat.state.tasks?.find((t) => t._id === props.taskId),
);
const active = computed(() => (props.creating ? draft.value : task.value));
const { deadline, state: deadlineFor } = useTeamTaskDeadline(() => task.value);
const subtasks = computed(() => (chat.state.tasks || [])
  .filter(t => t.parentTaskId === props.taskId)
  .sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.createdAt.localeCompare(b.createdAt)));
const parentTask = computed(() => chat.state.tasks.find(t => t._id === (props.creating ? props.parentTaskId : task.value?.parentTaskId)));
function openTask(id) {
  chat.requestedTaskMessageId = null;
  chat.requestedTaskId = id;
}
const taskCreatedLabel = computed(() => {
  if (!task.value?.createdAt) return '';
  const date = new Date(task.value.createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: '2-digit' }) + ' / ' + date.toLocaleTimeString('ru-RU', { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit' });
});
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
    .map(recipientName)
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
      go("project");
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
    openClock();
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
    if (["when", "urgent"].includes(step.value)) go("project");
    else picker.value = "";
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
  const g = generation;
  busy.value = true;
  error.value = "";
  voice.stop();
  try {
    const result = await chat.action("/tasks", {
      ...draft.value,
      ...(props.parentTaskId ? { parentTaskId: props.parentTaskId } : {}),
      fileIds: draft.value.attachments.map((f) => f.fileId),
    });
    if (g !== generation || !result?.task) return;
    await chat.refresh();
    if (g !== generation) return;
    emit("created", result.task);
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
const { preview, closePreview, download, retryPreview, cacheUpload, prefetch } = useTeamMedia();
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

function editDescription() {
  if (!canEdit.value) return;
  error.value = "";
  text.value = task.value.description;
  editing.value = "description";
}
async function saveDescription() {
  if (busy.value || editing.value !== 'description') return;
  const description = text.value.trim(), previousError = error.value;
  if (!description) { error.value = 'Опишите задачу'; return; }
  if (description === task.value.description || await update({ description })) {
    if (previousError && chat.error === previousError) chat.error = '';
    editing.value = '';
    text.value = '';
    error.value = '';
  }
}
const canGoBack = computed(() => !props.creating || step.value !== 'who' || !!picker.value);
function back() {
  if (!props.creating) { close(); return; }
  if (busy.value || uploading.value) return;
  voice.stop();
  if (picker.value === 'time') {
    if (clockPart.value === 'minute') clockPart.value = 'hour';
    else if (draft.value.timing === 'deadline') openCalendar();
    else picker.value = '';
    return;
  }
  if (picker.value) { picker.value = ''; return; }
  const previous = { what: 'project', project: 'when', urgent: 'when', when: 'who' }[step.value];
  if (previous) go(previous);
}
function close() {
  if (props.creating) { back(); return; }
  if (editing.value === 'description') { saveDescription(); return; }
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
function collapseForReading() {
  if (!editing.value && !picker.value) detailsOpen.value = false;
}
watch(
  () => [props.taskId, props.creating, props.parentTaskId],
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
  if (previous && !value && props.taskId && chat.requestedTaskId === props.taskId) emit("close");
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
    :data-keyboard="keyboard"
    :class="{
      wizard: creating,
      'task-details-collapsed': detailsCollapsed,
      'task-is-editing': !!editing,
      'task-text-editing': editing === 'description',
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
      <button aria-label="Назад" :disabled="busy || uploading || !canGoBack" @click="back">
        <UiIcon name="back" />
      </button>
      <span v-if="creating" aria-hidden="true" />
      <button
        v-else
        class="task-heading-title"
        :aria-expanded="!detailsCollapsed"
        aria-label="Параметры задачи"
        @pointerdown.prevent
        @click="detailsOpen = !detailsOpen"
      >
        <span>{{
          detailsCollapsed ? task?.description || "Задача" : task?.parentTaskId ? "Подзадача" : "Задача"
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
        <button v-if="picker === 'time' && creating && ['when', 'urgent'].includes(step)" class="clock-skip" type="button" @click="draft.dueTime = null; go('project')">Без времени</button>
      </section>
    </div>
    <div v-if="creating" class="task-stage">
      <div class="task-focus">
        <p class="creation-title">{{ parentTaskId ? 'Новая подзадача' : 'Новая задача' }}</p>
        <TeamTaskRecipientPicker
          v-if="step === 'who'"
          :people="directory"
          :actor-id="chat.me.actorId"
          :can-create="chat.isOwner"
          :disabled="busy"
          @select="choosePerson"
        />
        <div v-else-if="step === 'when'" class="task-input-line">
          <h3 class="task-step-title">Когда?</h3>
          <div class="inline-choices">
            <button class="task-choice-chip" data-tone="urgent" @click="chooseTiming('urgent')"><span class="task-chip-label">Срочно</span></button
            ><button class="task-choice-chip" data-tone="deadline" @click="chooseTiming('deadline')"><span class="task-chip-label">К сроку</span></button
            ><button class="task-choice-chip" data-tone="none" @click="chooseTiming('none')"><span class="task-chip-label">Без срока</span></button>
          </div>
        </div>
        <div v-else-if="step === 'urgent'" class="task-input-line">
          <h3 class="task-step-title">Когда?</h3>
          <div class="inline-choices">
            <button class="task-choice-chip" @click="chooseDate(localDay())"><span class="task-chip-label">Сегодня</span></button
            ><button class="task-choice-chip" @click="chooseDate(localDay(1))"><span class="task-chip-label">Завтра</span></button
            ><button aria-label="Выбрать дату" @click="openCalendar">
              <UiIcon name="calendar" />
            </button>
          </div>
        </div>
        <TeamTaskProjectPicker v-else-if="step === 'project'" :selected="draft.projectId" :disabled="busy" @select="chooseProject" />
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
          <div v-if="step === 'what'"><button type="button" @click="go('project')">Проект: {{ projectName }}</button></div>
          <div v-if="draft.assigneeIds.length">
            <button @click="go('who')">Кому: {{ selectedNames }}</button
            ><button class="task-draft-add" type="button" aria-label="Добавить ответственного" @click="go('who')"><UiIcon name="plus" /></button>
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
          {{ parentTaskId ? 'Поставить подзадачу' : 'Поставить задачу' }}
        </button>
      </div>
    </div>
    <template v-else-if="taskId">
      <div v-if="!task" class="task-empty">Задача недоступна</div>
      <template v-else>
        <div v-show="!detailsCollapsed" class="task-overview" :data-task-status="task.status" :data-deadline="deadline.tone">
          <div v-if="task.parentTaskId" class="task-parent-link" role="button" tabindex="0" @click="openTask(task.parentTaskId)" @keydown.enter.self.prevent="openTask(task.parentTaskId)" @keydown.space.self.prevent="openTask(task.parentTaskId)"><UiIcon name="back" /><LinkedText :text="parentTask?.description || 'Родительская задача'" /></div>
          <div class="task-summary">
            <div class="task-summary-header">
              <TeamTaskStatusSelect compact :model-value="task.status" :disabled="busy || !canEdit" @update:model-value="update({ status: $event })" />
              <time v-if="taskCreatedLabel" class="task-created" :datetime="task.createdAt" aria-label="Дата и время постановки задачи">{{ taskCreatedLabel }}</time>
            </div>
            <div class="task-metadata">
              <div class="task-meta-row">
                <span class="task-meta-group task-meta-from"><span class="task-meta-label">От:</span><span class="task-creator" :title="task.creatorName">{{ task.creatorName }}</span></span>
                <span class="task-meta-divider" aria-hidden="true">/</span>
                <span class="task-meta-group task-meta-assignees"><span class="task-meta-label">Кому:</span><button class="task-assignee" :title="selectedNames" :aria-label="`Кому: ${selectedNames}`" :disabled="busy || !canEdit" @click="editing = 'who'; query = ''">{{ selectedNames }}</button><button class="task-meta-add" :disabled="busy || !canEdit" aria-label="Добавить ответственного" @click="editing = 'add'; query = ''"><UiIcon name="plus" /></button></span>
              </div>
              <span class="task-meta-group task-meta-when"><button :disabled="busy || !canEdit" @click="editing = 'when'">Когда:</button><button class="task-due" :disabled="busy || !canEdit" @click="task.dueDate ? openCalendar() : (editing = 'when')">{{ taskDate(task) }}</button><button v-if="task.dueDate" :disabled="busy || !canEdit" aria-label="Указать время" @click="openClock"><UiIcon name="clock" /></button><span v-if="deadline.label" class="task-deadline-label">{{ deadline.label }}</span></span>
              <div class="task-project-meta"><button type="button" :disabled="busy || !canEdit" :title="projectName" aria-label="Изменить проект задачи" @click="editing = 'project'">Проект: {{ projectName }}</button><span class="task-meta-divider" aria-hidden="true">/</span><span class="task-party-picker" :title="partyName" :class="{ 'is-disabled': busy || !canEdit }"><span>{{ partyName }}</span><select :value="task.party ? task.party.kind + ':' + task.party.id : ''" aria-label="Контрагент задачи" :disabled="busy || !canEdit" @change="chooseParty($event.target.value)"><option value="">Без контрагента</option><option v-if="task.party && !chat.taskOptions.parties.some(party => party.kind === task.party.kind && party.id === task.party.id)" :value="task.party.kind + ':' + task.party.id">{{ partyName }}</option><option v-for="party in chat.taskOptions.parties" :key="party.kind + ':' + party.id" :value="party.kind + ':' + party.id">{{ party.name }}</option></select></span></div>
            </div>
            <TeamTaskTextEditor v-if="editing === 'description'" v-model="text" :busy="busy" :error="error" @save="saveDescription" />
            <div v-else class="task-description" :role="canEdit ? 'button' : undefined" :tabindex="canEdit ? 0 : undefined" @click="editDescription" @keydown.enter.self.prevent="editDescription" @keydown.space.self.prevent="editDescription"><LinkedText :text="task.description" /></div>
          </div>
          <TeamTaskProjectPicker v-if="editing === 'project'" :selected="task.projectId" :disabled="busy" @select="chooseProject" />
          <TeamTaskRecipientPicker
            v-if="['who', 'add'].includes(editing)"
            :key="editing"
            :people="directory"
            :actor-id="chat.me.actorId"
            :can-create="chat.isOwner"
            :disabled="busy"
            @select="choosePerson"
          />
          <div v-if="editing === 'when'" class="inline-choices">
            <button class="task-choice-chip" data-tone="urgent" @click="chooseTiming('urgent')"><span class="task-chip-label">Срочно</span></button
            ><button class="task-choice-chip" data-tone="deadline" @click="chooseTiming('deadline')"><span class="task-chip-label">К сроку</span></button
            ><button class="task-choice-chip" data-tone="none" @click="chooseTiming('none')"><span class="task-chip-label">Без срока</span></button>
          </div>
          <div v-if="editing === 'urgent'" class="inline-choices">
            <button class="task-choice-chip" @click="chooseDate(localDay())"><span class="task-chip-label">Сегодня</span></button
            ><button class="task-choice-chip" @click="chooseDate(localDay(1))"><span class="task-chip-label">Завтра</span></button>
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
          <section v-if="editing !== 'description' && subtasks.length" class="task-subtasks" aria-label="Подзадачи">
            <header><span>Подзадачи: {{ subtasks.length }}</span></header>
            <div v-for="child in subtasks" :key="child._id" role="button" tabindex="0" class="task-subtask-row" :class="{ 'is-done': child.status === 'done' }" :data-task-status="child.status" :data-deadline="deadlineFor(child).tone" @click="openTask(child._id)" @keydown.enter.self.prevent="openTask(child._id)" @keydown.space.self.prevent="openTask(child._id)">
              <span class="subtask-status" aria-hidden="true" /><span class="subtask-content"><LinkedText :text="child.description" /><small>{{ child.assignees.map(p => recipientName(p.name)).join(', ') }} / {{ taskDate(child) }}<span v-if="deadlineFor(child).label" class="task-deadline-label"> / {{ deadlineFor(child).label }}</span></small></span><span v-if="child.unreadCount" class="subtask-unread">{{ child.unreadCount }}</span><UiIcon name="chevron-right" />
            </div>
          </section>
        </div>
        <TeamChatConversation
          :active="editing !== 'description'"
          :key="taskId"
          :task-id="taskId"
          :target-message-id="
            chat.requestedTaskMessageId || task.mentionMessageId
          "
          :mobile="mobile"
          class="task-discussion"
          @composer-focus="composerFocus"
          @reading-scroll="collapseForReading"
          @new="emit('new', $event)"
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
        <div
          v-for="t in (chat.state.tasks || []).filter(
            (t) => t.mentioned || t.unreadCount,
          )"
          :key="t._id"
          class="task-notification"
          role="button"
          tabindex="0"
          @keydown.enter.self.prevent="$event.currentTarget.click()"
          @keydown.space.self.prevent="$event.currentTarget.click()"
          @click="
            chat.requestedTaskMessageId = t.mentionMessageId || t.latest?._id;
            chat.requestedTaskId = t._id;
          "
        >
          <LinkedText :text="t.description" />
          ><span><b v-if="t.mentioned">@</b> {{ t.unreadCount || "" }}</span>
        </div>
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
        ><TeamTaskFilters /><button aria-label="Новая задача" @click="emit('new')">
          <UiIcon name="plus" />
        </button>
      </div>
      <div class="task-list">
        <div
          v-for="t in shownTasks"
          :key="t._id"
          class="task-list-row"
          :data-deadline="deadlineFor(t).tone"
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
          ><div class="list-content" role="button" tabindex="0" @click="chat.requestedTaskId = t._id" @keydown.enter.self.prevent="chat.requestedTaskId = t._id" @keydown.space.self.prevent="chat.requestedTaskId = t._id">
            <span :title="t.description">{{ t.parentTaskId ? '↳ ' : '' }}<LinkedText :text="t.description" /></span
            ><span>{{ t.assignees.map((p) => recipientName(p.name)).join(", ") }}</span
            ><span
              >{{ taskDate(t) }}<span v-if="deadlineFor(t).label" class="task-deadline-label"> / {{ deadlineFor(t).label }}</span><b v-if="t.unreadCount"> {{ t.unreadCount }}</b
              ><b v-if="t.mentioned"> @</b></span
            >
          </div>
        </div>
        <p v-if="!shownTasks.length" class="task-empty">Нет задач</p>
      </div>
    </template>
  </section>
</template>
<style scoped src="./teamTasks.css"></style>

<style scoped src="./teamTaskChips.css"></style>
