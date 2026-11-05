<script setup>
import UiIcon from '@/components/UiIcon.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import CalendarPartySelect from './CalendarPartySelect.vue';
import { useBusinessStore } from '@/stores/businessStore';
import { businessApi, businessError } from '@/services/businessApi';
import { addDays, dayAt, timeAt, localInstant, statusLabels, taskState, defaultSlot, oneHourEnd } from '@/utils/calendarTime';
const props = defineProps({ task: { type: Object, default: null }, date: { type: String, required: true } });
const emit = defineEmits(['close', 'saved', 'reload']);
const business = useBusinessStore();
const panel = ref(null), fileInput = ref(null), busy = ref(false), uploading = ref(false), error = ref(''), saved = ref(false), conflict = ref(false), viewport = ref({});
const original = reactive(props.task ? { ...props.task } : { ...defaultSlot(props.date), title: '', description: '', status: 'open', reminderOffsets: [10, 30, 60], reminderDates: [], overdueReminders: 1, overdueRepeatMinutes: 60, links: [], attachments: [], party: null });
function taskDraft(original, existing = true) { return {
  title: original.title, description: original.description || '', date: existing ? original.dueDate || (original.startsAt ? dayAt(original.startsAt) : '') : original.dueDate || props.date,
  start: timeAt(original.startsAt) || '11:00', endDate: original.endsAt ? dayAt(original.endsAt) : original.dueDate || props.date, end: timeAt(original.endsAt) || '12:00',
  allDay: original.allDay ?? !original.startsAt, status: original.status, party: original.party || (original.companyId ? { kind: 'companies', id: original.companyId } : null),
  reminderOffsets: [...(original.reminderOffsets || [])], reminderDates: [...(original.reminderDates || [])], overdueReminders: original.overdueReminders ?? 1, overdueRepeatMinutes: original.overdueRepeatMinutes || 60,
  links: (original.links || []).map(link => ({ ...link })), attachments: [...(original.attachments || [])],
}; }
const draft = reactive(taskDraft(original, Boolean(props.task)));
const presets = [{ minutes: 10, label: '10 мин' }, { minutes: 30, label: '30 мин' }, { minutes: 60, label: '1 ч' }, { minutes: 1440, label: '1 день' }, { minutes: 4320, label: '3 дня' }, { minutes: 10080, label: '1 неделя' }];
const legacyOffsets = computed(() => draft.reminderOffsets.filter(minutes => !presets.some(p => p.minutes === minutes)));
const customOpen = ref(false), customDateTime = ref('');
const customLabel = value => new Date(value).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const currentStatus = computed(() => taskState({ status: draft.status, dueDate: draft.date, ...(!draft.allDay && draft.date && draft.endDate && draft.start && draft.end ? { startsAt: localInstant(draft.date, draft.start), endsAt: localInstant(draft.endDate, draft.end) } : {}) }));
let id = props.task?._id, version = props.task?.version || 0, timer, pending = false, active = true, savingPromise, previousDate = draft.date, returnFocus, remoteTicket = 0, queuedRemote = null;
const creationKey = crypto.randomUUID();
function payload() {
  if (!draft.title.trim()) throw new Error('Укажите название задачи');
  if (!draft.allDay && (!draft.date || !draft.start || !draft.end || !draft.endDate)) throw new Error('Укажите дату и время задачи');
  const data = { title: draft.title.trim(), description: draft.description, dueDate: draft.date || null, allDay: draft.allDay, status: draft.status, party: draft.party,
    reminderOffsets: draft.reminderOffsets.map(Number), reminderDates: [...draft.reminderDates], overdueReminders: Number(draft.overdueReminders), overdueRepeatMinutes: Number(draft.overdueRepeatMinutes),
    links: draft.links.filter(link => link.url.trim()).map(link => ({ ...(link.title ? { title: link.title } : {}), url: link.url.trim() })), attachmentIds: draft.attachments.map(file => file.fileId),
    startsAt: draft.allDay ? null : localInstant(draft.date, draft.start), endsAt: draft.allDay ? null : localInstant(draft.endDate, draft.end),
  };
  if (!draft.allDay && data.endsAt <= data.startsAt) throw new Error('Окончание должно быть позже начала');
  return data;
}
let lastSaved = id ? JSON.stringify(payload()) : '';
function dirty() { try { return JSON.stringify(payload()) !== lastSaved; } catch { return true; } }
function applyRemote(task) {
  if (!active || !id || (task && (task.version || 0) <= version)) return;
  if (busy.value || uploading.value) { queuedRemote = { task }; return; }
  if (dirty()) {
    clearTimeout(timer); conflict.value = true;
    error.value = task ? 'Задача изменена на другом устройстве. Ваши правки сохранены в карточке; загрузите актуальную версию перед сохранением.' : 'Задача удалена на другом устройстве. Ваши правки остались в карточке.';
    return;
  }
  if (!task) { emit('close'); return; }
  clearTimeout(timer); Object.assign(original, task); Object.assign(draft, taskDraft(task));
  version = task.version || 0; previousDate = draft.date; lastSaved = JSON.stringify(payload());
  error.value = ''; conflict.value = false; saved.value = true;
}
function drainRemote() { if (queuedRemote) { const { task } = queuedRemote; queuedRemote = null; applyRemote(task); } }
watch(() => business.tasks, async tasks => {
  if (!id || !active) return;
  const ticket = ++remoteTicket, task = tasks.find(row => row._id === id);
  if (task) { applyRemote(task); return; }
  // A task moved outside the displayed month is absent from the range, but still exists.
  try { const { data } = await businessApi.get(`/tasks/${id}`); if (active && ticket === remoteTicket) applyRemote(data.task); }
  catch (e) { if (active && ticket === remoteTicket && e.response?.status === 404) applyRemote(null); }
});

function changed() { if (!active) return; saved.value = false; if (conflict.value) return; error.value = ''; if (!id) return; clearTimeout(timer); timer = setTimeout(() => { void save(); }, 650); }
async function save() {
  clearTimeout(timer);
  if (conflict.value) return;
  if (busy.value) { pending = true; return; }
  let data; try { data = payload(); } catch (e) { error.value = e.message; return; }
  const snapshot = JSON.stringify(data); if (id && snapshot === lastSaved) return;
  busy.value = true; error.value = ''; pending = false;
  try {
    savingPromise = business.saveTask(id ? data : { ...data, idempotencyKey: creationKey }, id, version);
    const task = await savingPromise; id = task._id; version = task.version; lastSaved = snapshot; saved.value = true; emit('saved', task);
  } catch (e) { conflict.value = e.response?.status === 409; error.value = e.response ? businessError(e) : e.message; }
  finally { busy.value = false; drainRemote(); if (active && pending && !error.value) { pending = false; void save(); } }
}
async function close() {
  if (busy.value && savingPromise) await savingPromise.catch(() => {});
  if (id && !error.value) { await save(); if (busy.value || error.value) return; }
  emit('close');
}
async function reload() { try { const { data } = await businessApi.get(`/tasks/${id}`); emit('reload', data.task); } catch (e) { error.value = businessError(e); } }
function datesChanged() {
  if (draft.date && previousDate && draft.endDate) draft.endDate = addDays(draft.endDate, Math.round((Date.parse(draft.date) - Date.parse(previousDate)) / 86400000));
  else if (draft.date) draft.endDate = draft.date;
  previousDate = draft.date; changed();
}
function startChanged() { if (draft.date && draft.start) { const end = oneHourEnd(draft.date, draft.start); draft.endDate = end.date; draft.end = end.time; } changed(); }
function toggleReminder(minutes) { const index = draft.reminderOffsets.indexOf(minutes); if (index >= 0) draft.reminderOffsets.splice(index, 1); else if (draft.reminderOffsets.length < 10) draft.reminderOffsets.push(minutes); changed(); }
function addCustomReminder() {
  if (!customDateTime.value) return;
  if (draft.reminderDates.length >= 10) { error.value = 'Можно добавить до 10 точных напоминаний'; return; }
  const date = customDateTime.value.slice(0, 10), time = customDateTime.value.slice(11, 16), at = localInstant(date, time);
  if (!draft.reminderDates.includes(at)) draft.reminderDates.push(at);
  draft.reminderDates.sort(); customOpen.value = false; customDateTime.value = ''; changed();
}
async function upload(event) {
  uploading.value = true; error.value = '';
  try {
    for (const file of event.target.files) {
      if (draft.attachments.length >= 5) throw new Error('Можно прикрепить до пяти файлов');
      if (file.size > 10 * 1024 * 1024) throw new Error('Размер одного файла — до 10 МБ');
      if (draft.attachments.reduce((sum, row) => sum + row.size, 0) + file.size > 25 * 1024 * 1024) throw new Error('Общий размер файлов — до 25 МБ');
      const response = await businessApi.post('/task-files', file, { headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name), 'x-file-type': file.type }, timeout: 60000 }); draft.attachments.push(response.data.file);
    }
    changed();
  } catch (e) { error.value = e.response ? businessError(e) : e.message; } finally { uploading.value = false; event.target.value = ''; drainRemote(); }
}
async function download(file) {
  if (!id) return;
  try { const response = await businessApi.get(`/tasks/${id}/files/${file.fileId}`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data), link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  catch (e) { error.value = businessError(e); }
}
async function remove() { if (busy.value) return; clearTimeout(timer); busy.value = true; try { await business.deleteTask(id, version); emit('close'); } catch (e) { error.value = businessError(e); } finally { busy.value = false; } }
function updateViewport() { const v = window.visualViewport; viewport.value = v ? { inset: 'auto', left: `${v.offsetLeft}px`, top: `${v.offsetTop}px`, width: `${v.width}px`, height: `${v.height}px` } : {}; }
function keyboard(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void close(); }
  if (event.key === 'Tab') {
    const items = [...panel.value.querySelectorAll('button:not(:disabled), input:not(:disabled):not([type=hidden]), textarea, select:not(:disabled), a[href]')].filter(el => el.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
}
onMounted(async () => { returnFocus = document.activeElement; updateViewport(); window.addEventListener('resize', updateViewport); window.visualViewport?.addEventListener('resize', updateViewport); window.visualViewport?.addEventListener('scroll', updateViewport); await nextTick(); if (!id) panel.value.querySelector('input')?.focus({ preventScroll: true }); else panel.value.focus({ preventScroll: true }); });
onBeforeUnmount(() => { active = false; clearTimeout(timer); window.removeEventListener('resize', updateViewport); window.visualViewport?.removeEventListener('resize', updateViewport); window.visualViewport?.removeEventListener('scroll', updateViewport); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
defineExpose({ close });
</script>
<template>
  <div class="task-dialog-backdrop" :style="viewport" @click.self="close">
    <section ref="panel" class="task-popover" role="dialog" aria-modal="true" aria-label="Карточка задачи" tabindex="-1" @keydown="keyboard">
      <header><span class="task-state" :data-status="currentStatus"><i></i>{{ statusLabels[currentStatus] }}</span><div class="popover-tools"><span v-if="busy" class="save-state" role="status">Сохранение…</span><span v-else-if="saved" class="save-state" role="status">Сохранено</span><button v-if="id" type="button" class="ui-icon-button" aria-label="Удалить задачу" title="Удалить задачу" :disabled="busy" @click="remove"><UiIcon name="trash" /></button><button type="button" class="ui-icon-button" aria-label="Закрыть карточку задачи" @click="close"><UiIcon name="close" /></button></div></header>
      <div v-if="error" class="task-error" role="alert">{{ error }}<button v-if="conflict" type="button" title="Отменить локальные правки и загрузить актуальную задачу" @click="reload">Загрузить актуальную версию</button><button v-else-if="id" type="button" @click="error = ''; save()">Повторить</button></div>
      <form id="calendar-task-form" class="task-form-body" novalidate @submit.prevent="save" @input="changed" @change="changed">
        <input v-model="draft.title" class="task-title-input" aria-label="Название задачи" aria-required="true" placeholder="Название задачи" maxlength="300" />
        <div class="task-date-row"><label>Дата<input v-model="draft.date" type="date" aria-label="Дата задачи" @change="datesChanged" /></label><label class="all-day"><input v-model="draft.allDay" type="checkbox" />Весь день</label></div>
        <div v-if="!draft.allDay" class="task-time-row"><label>Начало<input v-model="draft.start" type="time" aria-label="Время начала" @change="startChanged" /></label><span>—</span><label>Окончание<input v-model="draft.end" type="time" aria-label="Время окончания" /></label><label>Дата окончания<input v-model="draft.endDate" type="date" aria-label="Дата окончания" /></label></div>
        <div class="timezone">Алматы · UTC+5</div>
        <label class="field-label">Контрагент</label><CalendarPartySelect v-model="draft.party" :fallback-name="original.partyName" @update:model-value="changed" />
        <label class="field-label" for="calendar-description">Описание</label><textarea id="calendar-description" v-model="draft.description" aria-label="Описание задачи" placeholder="Описание" maxlength="10000" rows="2"></textarea>
        <div class="reminder-heading"><label class="field-label" :title="draft.allDay ? 'Для задач на весь день — до 09:00 по Алматы' : 'До начала задачи'">Напоминания</label><button type="button" class="custom-reminder-toggle" :aria-expanded="customOpen" @click="customOpen = !customOpen">Дата и время</button></div>
        <div class="reminder-presets" role="group" aria-label="Напоминания до начала задачи"><button v-for="preset in presets" :key="preset.minutes" type="button" :aria-pressed="draft.reminderOffsets.includes(preset.minutes)" @click="toggleReminder(preset.minutes)">{{ preset.label }}</button><button v-for="minutes in legacyOffsets" :key="minutes" type="button" aria-pressed="true" @click="toggleReminder(minutes)">{{ minutes }} мин <UiIcon name="close" /></button></div>
        <div v-if="customOpen" class="custom-reminder-row"><input v-model="customDateTime" type="datetime-local" aria-label="Дата и время напоминания" @input.stop @change.stop @keydown.enter.prevent="addCustomReminder" /><button type="button" :disabled="!customDateTime || draft.reminderDates.length >= 10" @click="addCustomReminder">Добавить</button></div>
        <div v-for="(at, index) in draft.reminderDates" :key="at" class="custom-reminder-chip"><time :datetime="at">{{ customLabel(at) }}</time><button type="button" class="ui-icon-button" :aria-label="`Убрать точное напоминание ${index + 1}`" @click="draft.reminderDates.splice(index, 1); changed()"><UiIcon name="close" /></button></div>
        <div class="overdue-row"><span>При просрочке</span><input v-model.number="draft.overdueReminders" type="number" min="0" max="10" aria-label="Количество напоминаний о просрочке" /><span>раз, каждые</span><input v-model.number="draft.overdueRepeatMinutes" type="number" min="5" max="10080" aria-label="Интервал просрочки, минут" /><span>мин</span></div>
        <div class="attachment-heading"><label class="field-label">Файлы и ссылки</label><div><button type="button" class="ui-icon-button" title="Прикрепить файл" aria-label="Прикрепить файл" :disabled="uploading" @click="fileInput.click()"><UiIcon name="attach" /></button><button type="button" class="ui-icon-button" aria-label="Добавить ссылку" title="Добавить ссылку" :disabled="draft.links.length >= 20" @click="draft.links.push({ url: '' }); changed()"><UiIcon name="plus" /></button></div></div>
        <input ref="fileInput" class="hidden-file" type="file" multiple aria-label="Файлы задачи" @change.stop="upload" />
        <span v-if="uploading" role="status" class="save-state">Загрузка файла…</span>
        <div v-for="file in draft.attachments" :key="file.fileId" class="file-row"><button type="button" :disabled="!id" @click="download(file)">{{ file.name }}</button><small>{{ Math.ceil(file.size / 1024) }} КБ</small><button type="button" class="ui-icon-button" :aria-label="`Убрать файл ${file.name}`" @click="draft.attachments.splice(draft.attachments.indexOf(file), 1); changed()"><UiIcon name="close" /></button></div>
        <div v-for="(link, index) in draft.links" :key="index" class="link-row"><input v-model="link.url" type="url" :aria-label="`Ссылка ${index + 1}`" placeholder="https://" /><a v-if="/^https:\/\//i.test(link.url)" :href="link.url" target="_blank" rel="noopener noreferrer" :aria-label="`Открыть ссылку ${index + 1}`"><UiIcon name="external" /></a><button type="button" class="ui-icon-button" :aria-label="`Убрать ссылку ${index + 1}`" @click="draft.links.splice(index, 1); changed()"><UiIcon name="close" /></button></div>
        <a v-if="original.sourceUrl" :href="original.sourceUrl" target="_blank" rel="noopener noreferrer" class="source-link">Источник: КГД ↗</a>
      </form>
      <footer><label class="completion"><input v-model="draft.status" type="checkbox" true-value="done" false-value="open" aria-label="Задача исполнена" @change="changed" />Исполнено</label><button v-if="!id" type="submit" form="calendar-task-form" class="save-button" :disabled="busy || uploading || !draft.title.trim()">Сохранить задачу</button></footer>
    </section>
  </div>
</template>
<style scoped>
.task-dialog-backdrop { position:fixed; inset:0; z-index:3650; display:grid; place-items:center; padding:16px; box-sizing:border-box; background:#0004; }
.task-popover { display:flex; flex-direction:column; width:min(520px,100%); max-height:100%; overflow:hidden; box-sizing:border-box; background:var(--color-background); color:var(--color-text); border:1px solid var(--color-border); border-radius:12px; box-shadow:0 12px 48px #0005; font-size:13px; outline:0; }
.task-popover header { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-shrink:0; min-height:48px; padding:8px 16px; box-sizing:border-box; }
.popover-tools { display:flex; align-items:center; gap:4px; }
.task-popover button,.task-popover input,.task-popover textarea { font:inherit; color:inherit; background:var(--color-background-soft); border:1px solid var(--color-border); border-radius:6px; padding:8px; box-sizing:border-box; min-width:0; margin:0; }
.task-popover button { cursor:pointer; }
.task-popover button:disabled { opacity:.45; cursor:default; }
.task-popover input[type=checkbox] { accent-color:var(--color-primary,#10b981); }
.task-popover input:is([type=date],[type=time],[type=datetime-local]) { color-scheme:dark; }
.task-popover input:focus,.task-popover input:focus-visible,.task-popover textarea:focus,.task-popover textarea:focus-visible { outline:none; box-shadow:none; border-color:var(--color-primary,#10b981); }
.task-popover .ui-icon-button { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; width:32px; height:32px; padding:0; border:0; background:transparent; line-height:1; }
.task-popover .ui-icon-button:hover { background:var(--color-background-soft); }
.task-popover .ui-icon-button :deep(svg),.link-row :deep(svg) { display:block; width:16px; height:16px; flex:none; }
.task-form-body { min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:0 20px 20px; scrollbar-width:thin; }
.task-popover .task-title-input { display:block; width:100%; margin:4px 0 20px; padding:10px 12px; border:0; border-radius:8px; background:var(--color-background-soft); font-size:22px; line-height:1.4; }
.task-popover .task-title-input:focus,.task-popover .task-title-input:focus-visible { outline:none; box-shadow:none; border:0; }
.task-state { display:flex; align-items:center; gap:6px; font-size:11px; white-space:nowrap; }
.task-state i { width:6px; height:6px; border-radius:50%; background:#89929e; }
.task-state[data-status=today] i { background:#81aef3; }.task-state[data-status=overdue] i { background:#ee8c83; }.task-state[data-status=done] i { background:#60bc95; }
.save-state { font-size:11px; opacity:.6; }
.task-date-row { display:flex; gap:16px; align-items:end; }.task-date-row>label:first-child { flex:1; }
.task-date-row label,.task-time-row label { display:flex; flex-direction:column; gap:4px; font-size:11px; min-width:0; }
.task-date-row input,.task-time-row input { width:100%; font-size:13px; }
.task-date-row .all-day { display:flex; flex-direction:row; align-items:center; gap:6px; font-size:12px; padding:8px 0; }.all-day input { width:auto; }
.task-time-row { display:grid; grid-template-columns:1fr 12px 1fr 1.4fr; gap:8px; align-items:end; margin-top:12px; }.task-time-row>span { padding-bottom:10px; text-align:center; opacity:.4; }
.timezone { font-size:10px; opacity:.45; margin:6px 0 16px; }.field-label { display:block; font-size:11px; opacity:.65; margin:16px 0 6px; }.timezone+.field-label { margin-top:0; }
.task-popover textarea { width:100%; resize:vertical; min-height:60px; max-height:160px; line-height:1.5; }
.reminder-heading,.attachment-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:16px; }.reminder-heading .field-label,.attachment-heading .field-label { margin:0; }
.task-popover .custom-reminder-toggle { padding:4px 0; background:transparent; border:0; font-size:11px; }
.reminder-presets { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }.reminder-presets button { display:inline-flex; align-items:center; gap:4px; padding:6px 10px; min-height:32px; font-size:12px; background:transparent; }.reminder-presets button[aria-pressed=true] { background:color-mix(in srgb,var(--color-primary,#10b981) 12%,var(--color-background-soft)); border-color:var(--color-primary,#10b981); }.reminder-presets :deep(svg) { width:12px; height:12px; }
.custom-reminder-row { display:flex; align-items:center; gap:8px; margin-top:12px; }.custom-reminder-row input { flex:1; min-width:0; }.custom-reminder-row button { padding:8px 12px; font-size:12px; }
.custom-reminder-chip { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 8px; border-radius:6px; background:var(--color-background-soft); margin-top:8px; font-size:12px; }
.overdue-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:12px; font-size:11px; opacity:.8; }.overdue-row input { width:56px; padding:6px; }
.attachment-heading>div { display:flex; align-items:center; gap:4px; }.task-popover .hidden-file { display:none; }
.file-row { display:flex; align-items:center; gap:8px; font-size:12px; }.file-row>button:first-child { flex:1; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border:0; background:transparent; padding:8px 0; }.file-row small { opacity:.5; white-space:nowrap; }
.link-row { display:flex; align-items:center; gap:4px; margin-top:8px; }.link-row input { flex:1; width:0; font-size:12px; }.link-row a { display:grid; place-items:center; width:28px; height:32px; flex-shrink:0; padding:0; }
.task-popover a { color:var(--color-primary,#10b981); }.source-link { display:inline-block; margin-top:8px; font-size:12px; }
.task-popover footer { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-shrink:0; min-height:60px; margin:0; padding:12px 20px; box-sizing:border-box; border-top:1px solid var(--color-border); }
.completion { display:flex; align-items:center; gap:8px; font-size:12px; }.task-popover .save-button { background:var(--color-primary,#10b981); border:0; color:#fff; padding:9px 12px; }
.task-error { color:var(--color-danger,#e48b86); font-size:12px; padding:8px 20px; flex-shrink:0; }.task-error button { font-size:11px; margin-left:8px; }
:global(:root[data-theme=light]) .task-popover input:is([type=date],[type=time],[type=datetime-local]) { color-scheme:light; }
@media(max-width:540px) { .task-dialog-backdrop { padding:12px; }.task-form-body { padding:0 16px 16px; }.task-popover footer { padding:12px 16px; }.task-time-row { grid-template-columns:1fr 12px 1fr; }.task-time-row label:last-child { grid-column:1/-1; }.reminder-presets { gap:6px; }.reminder-presets button { flex:1 0 27%; justify-content:center; } }
</style>
