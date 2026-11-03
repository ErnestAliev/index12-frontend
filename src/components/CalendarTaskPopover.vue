<script setup>
import UiIcon from '@/components/UiIcon.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import CalendarPartySelect from './CalendarPartySelect.vue';
import { useBusinessStore } from '@/stores/businessStore';
import { businessApi, businessError } from '@/services/businessApi';
import { dayAt, timeAt, localInstant, statusLabels, taskState, defaultSlot } from '@/utils/calendarTime';
const props = defineProps({ task: { type: Object, default: null }, date: { type: String, required: true }, anchor: { type: Object, default: () => ({ left: 300, top: 150, right: 300 }) }, pinned: Boolean });
const emit = defineEmits(['close', 'pin', 'enter', 'leave', 'saved', 'reload']);
const business = useBusinessStore(), panel = ref(null), fileInput = ref(null), busy = ref(false), uploading = ref(false), error = ref(''), saved = ref(false), conflict = ref(false);
const original = props.task || { ...defaultSlot(props.date), title: '', description: '', status: 'open', reminderOffsets: [30], overdueReminders: 1, overdueRepeatMinutes: 60, links: [], attachments: [], party: null };
const draft = reactive({ title: original.title, description: original.description || '', date: props.task ? original.dueDate || (original.startsAt ? dayAt(original.startsAt) : '') : original.dueDate || props.date, start: timeAt(original.startsAt) || '11:00', endDate: original.endsAt ? dayAt(original.endsAt) : original.dueDate || props.date, end: timeAt(original.endsAt) || '12:00', allDay: original.allDay ?? !original.startsAt, status: original.status, party: original.party || (original.companyId ? { kind: 'companies', id: original.companyId } : null), reminderOffsets: [...(original.reminderOffsets || [])], overdueReminders: original.overdueReminders ?? 1, overdueRepeatMinutes: original.overdueRepeatMinutes || 60, links: (original.links || []).map(link => ({ ...link })), attachments: [...(original.attachments || [])] });
const position = ref({ left: '0px', top: '0px' });
const currentStatus = computed(() => taskState({ status: draft.status, dueDate: draft.date, ...(!draft.allDay && draft.date && draft.endDate && draft.start && draft.end ? { startsAt: localInstant(draft.date, draft.start), endsAt: localInstant(draft.endDate, draft.end) } : {}) }));
let id = props.task?._id, version = props.task?.version || 0, timer, pending = false, active = true, savingPromise;
const creationKey = crypto.randomUUID();
function payload() {
  if (!draft.title.trim()) throw new Error('Укажите название задачи');
  if (!draft.allDay && (!draft.date || !draft.start || !draft.end || !draft.endDate)) throw new Error('Укажите дату и время задачи');
  const data = { title: draft.title.trim(), description: draft.description, dueDate: draft.date || null, allDay: draft.allDay, status: draft.status, party: draft.party, reminderOffsets: draft.reminderOffsets.map(Number), overdueReminders: Number(draft.overdueReminders), overdueRepeatMinutes: Number(draft.overdueRepeatMinutes), links: draft.links.filter(link => link.url.trim()).map(link => ({ title: link.title.trim(), url: link.url.trim() })), attachmentIds: draft.attachments.map(file => file.fileId), startsAt: draft.allDay ? null : localInstant(draft.date, draft.start), endsAt: draft.allDay ? null : localInstant(draft.endDate, draft.end) };
  if (!draft.allDay && data.endsAt <= data.startsAt) throw new Error('Окончание должно быть позже начала');
  return data;
}
let lastSaved = id ? JSON.stringify(payload()) : '';
function changed() { if (!active) return; emit('pin'); saved.value = false; if (conflict.value) return; error.value = ''; if (!id) return; clearTimeout(timer); timer = setTimeout(() => { void save(); }, 650); }
async function save() {
  clearTimeout(timer);
  if (busy.value) { pending = true; return; }
  let data; try { data = payload(); } catch (e) { error.value = e.message; return; }
  const snapshot = JSON.stringify(data); if (id && snapshot === lastSaved) return;
  busy.value = true; error.value = ''; pending = false;
  try {
    savingPromise = business.saveTask(id ? data : { ...data, idempotencyKey: creationKey }, id, version);
    const task = await savingPromise;
    id = task._id; version = task.version; lastSaved = snapshot; saved.value = true; emit('saved', task);
  } catch (e) { conflict.value = e.response?.status === 409; error.value = e.response ? businessError(e) : e.message; }
  finally { busy.value = false; if (active && pending && !error.value) { pending = false; void save(); } }
}
async function close() {
  if (busy.value && savingPromise) await savingPromise.catch(() => {});
  if (id && !error.value) { await save(); if (busy.value || error.value) return; }
  emit('close');
}
async function reload() { try { const { data } = await businessApi.get(`/tasks/${id}`); emit('reload', data.task); } catch (e) { error.value = businessError(e); } }
function datesChanged() { if (draft.endDate < draft.date) draft.endDate = draft.date; changed(); }
async function upload(event) {
  emit('pin'); uploading.value = true; error.value = '';
  try {
    for (const file of event.target.files) {
      if (draft.attachments.length >= 5) throw new Error('Можно прикрепить до пяти файлов');
      if (file.size > 10 * 1024 * 1024) throw new Error('Размер одного файла — до 10 МБ');
      if (draft.attachments.reduce((sum, row) => sum + row.size, 0) + file.size > 25 * 1024 * 1024) throw new Error('Общий размер файлов — до 25 МБ');
      const response = await businessApi.post('/task-files', file, { headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name), 'x-file-type': file.type }, timeout: 60000 }); draft.attachments.push(response.data.file);
    }
    changed();
  } catch (e) { error.value = e.response ? businessError(e) : e.message; } finally { uploading.value = false; event.target.value = ''; }
}
async function download(file) {
  if (!id) return;
  try { const response = await businessApi.get(`/tasks/${id}/files/${file.fileId}`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data), link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  catch (e) { error.value = businessError(e); }
}
async function remove() { if (busy.value) return; clearTimeout(timer); busy.value = true; try { await business.deleteTask(id, version); emit('close'); } catch (e) { error.value = businessError(e); } finally { busy.value = false; } }
function positionPanel() {
  const width = Math.min(448, window.innerWidth - 24), height = Math.min(panel.value?.offsetHeight || 700, window.innerHeight - 24);
  let left = props.anchor.right + 12; if (left + width > window.innerWidth - 12) left = props.anchor.left - width - 12;
  position.value = { left: `${Math.max(12, Math.min(left, window.innerWidth - width - 12))}px`, top: `${Math.max(12, Math.min(props.anchor.top, window.innerHeight - height - 12))}px` };
}
function escape(event) { if (event.key === 'Escape') { event.stopPropagation(); void close(); } }
onMounted(async () => { await nextTick(); positionPanel(); window.addEventListener('resize', positionPanel); window.addEventListener('keydown', escape); if (!id) panel.value.querySelector('input')?.focus(); });
onBeforeUnmount(() => { active = false; clearTimeout(timer); window.removeEventListener('resize', positionPanel); window.removeEventListener('keydown', escape); });
defineExpose({ close });
</script>
<template>
  <section ref="panel" class="task-popover" :class="{ pinned }" :style="position" role="dialog" aria-label="Карточка задачи" @mouseenter="emit('enter')" @mouseleave="emit('leave')" @focusin="emit('pin')" @pointerdown="emit('pin')">
    <header><span class="task-state" :data-status="currentStatus"><i></i>{{ statusLabels[currentStatus] }}</span><div class="popover-tools"><span v-if="busy" class="save-state" role="status">Сохранение…</span><span v-else-if="saved" class="save-state" role="status">Сохранено</span><button v-if="id" type="button" aria-label="Удалить задачу" title="Удалить задачу" :disabled="busy" @click="remove"><svg viewBox="0 0 24 24"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg></button><button type="button" aria-label="Закрыть карточку задачи" @click="close" class="ui-icon-button"><UiIcon name="close" /></button></div></header>
    <form @submit.prevent="save" @input="changed" @change="changed">
      <input v-model="draft.title" class="task-title-input" aria-label="Название задачи" placeholder="Название задачи" maxlength="300" required />
      <div class="task-date-row"><label>Дата<input v-model="draft.date" type="date" aria-label="Дата задачи" :required="!draft.allDay" @change="datesChanged" /></label><label class="all-day"><input v-model="draft.allDay" type="checkbox" />Весь день</label></div>
      <div v-if="!draft.allDay" class="task-time-row"><label>Начало<input v-model="draft.start" type="time" aria-label="Время начала" required /></label><span>—</span><label>Окончание<input v-model="draft.end" type="time" aria-label="Время окончания" required /></label><label class="end-date">Дата окончания<input v-model="draft.endDate" type="date" aria-label="Дата окончания" required /></label></div>
      <div class="timezone">Алматы · UTC+5</div>
      <label class="field-label">Контрагент</label><CalendarPartySelect v-model="draft.party" :fallback-name="original.partyName" @update:model-value="changed" />
      <label class="field-label" for="calendar-description">Описание</label><textarea id="calendar-description" v-model="draft.description" aria-label="Описание задачи" placeholder="Описание" maxlength="10000" rows="2"></textarea>
      <div class="reminder-heading"><label class="field-label" :title="draft.allDay ? 'Для задач на весь день — до 09:00 по Алматы' : 'До начала задачи'">Напоминания</label><button type="button" aria-label="Добавить напоминание" title="Добавить напоминание" :disabled="draft.reminderOffsets.length >= 10" @click="draft.reminderOffsets.push(30); changed()">+</button></div>
      <div v-for="(_offset, index) in draft.reminderOffsets" :key="index" class="reminder-row"><span>За</span><input v-model.number="draft.reminderOffsets[index]" type="number" min="0" max="43200" :aria-label="`Напоминание ${index + 1}, минут`" /><span>минут</span><button type="button" :aria-label="`Убрать напоминание ${index + 1}`" @click="draft.reminderOffsets.splice(index, 1); changed()" class="ui-icon-button"><UiIcon name="close" /></button></div>
      <div class="overdue-row"><span>При просрочке</span><input v-model.number="draft.overdueReminders" type="number" min="0" max="10" aria-label="Количество напоминаний о просрочке" /><span>раз, каждые</span><input v-model.number="draft.overdueRepeatMinutes" type="number" min="5" max="10080" aria-label="Интервал просрочки, минут" /><span>мин</span></div>
      <div class="attachment-heading"><label class="field-label">Файлы и ссылки</label><div><button type="button" title="Прикрепить файл" aria-label="Прикрепить файл" :disabled="uploading" @click="fileInput.click()"><svg viewBox="0 0 24 24"><path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L12 3a7 7 0 0 1 10 10l-9 9M5 16l10-10"/></svg></button><button type="button" aria-label="Добавить ссылку" title="Добавить ссылку" @click="draft.links.push({ title: '', url: '' }); changed()">+</button></div></div>
      <input ref="fileInput" class="hidden-file" type="file" multiple aria-label="Файлы задачи" @change.stop="upload" />
      <span v-if="uploading" role="status" class="save-state">Загрузка файла…</span>
      <div v-for="file in draft.attachments" :key="file.fileId" class="file-row"><button type="button" :disabled="!id" @click="download(file)">{{ file.name }}</button><small>{{ Math.ceil(file.size / 1024) }} КБ</small><button type="button" :aria-label="`Убрать файл ${file.name}`" @click="draft.attachments.splice(draft.attachments.indexOf(file), 1); changed()" class="ui-icon-button"><UiIcon name="close" /></button></div>
      <div v-for="(link, index) in draft.links" :key="index" class="link-row"><input v-model="link.title" :aria-label="`Название ссылки ${index + 1}`" placeholder="Название" maxlength="300" /><input v-model="link.url" type="url" :aria-label="`Ссылка ${index + 1}`" placeholder="https://" /><a v-if="/^https:\/\//i.test(link.url)" :href="link.url" target="_blank" rel="noopener noreferrer" :aria-label="`Открыть ссылку ${index + 1}`">↗</a><button type="button" :aria-label="`Убрать ссылку ${index + 1}`" @click="draft.links.splice(index, 1); changed()" class="ui-icon-button"><UiIcon name="close" /></button></div>
      <a v-if="original.sourceUrl" :href="original.sourceUrl" target="_blank" rel="noopener noreferrer" class="source-link">Источник: КГД ↗</a>
      <div v-if="error" class="task-error" role="alert">{{ error }}<button v-if="conflict" type="button" title="Отменить локальные правки и загрузить актуальную задачу" @click="reload">Загрузить актуальную версию</button><button v-else-if="id" type="button" @click="error = ''; save()">Повторить</button></div>
      <footer><label class="completion"><input v-model="draft.status" type="checkbox" true-value="done" false-value="open" aria-label="Задача исполнена" @change="changed" />Исполнено</label><button v-if="!id" type="submit" class="save-button" :disabled="busy || uploading || !draft.title.trim()">Сохранить задачу</button></footer>
    </form>
  </section>
</template>
<style scoped>
.task-popover{position:fixed;z-index:3650;width:min(448px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow-y:auto;background:var(--color-background);color:var(--color-text);border:1px solid var(--color-border);border-radius:12px;box-shadow:0 12px 48px #0007;font-size:13px;box-sizing:border-box}.task-popover header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 4px}.popover-tools{display:flex;align-items:center;gap:4px}.task-popover button{cursor:pointer}.task-popover button,.task-popover input,.task-popover textarea{font:inherit;color:inherit;background:var(--color-background-soft);border:1px solid var(--color-border);border-radius:6px;padding:7px 8px;box-sizing:border-box;min-width:0}.task-popover input[type=checkbox]{accent-color:var(--color-primary,#10b981)}.task-popover input:focus,.task-popover textarea:focus{outline:1px solid var(--color-primary,#10b981);outline-offset:1px}.task-popover input:is([type=date],[type=time]){color-scheme:dark}.popover-tools button{border:0;background:transparent;width:28px;height:28px;padding:4px;font-size:22px}.task-popover svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.task-popover form{padding:8px 20px 16px}.task-popover .task-title-input{font-size:22px;line-height:1.4;background:transparent;border:0;border-bottom:1px solid var(--color-border);border-radius:0;padding:4px 0 10px;width:100%;margin-bottom:16px}.task-state{display:flex;align-items:center;gap:6px;font-size:11px;white-space:nowrap}.task-state i{width:6px;height:6px;border-radius:50%;background:#89929e}.task-state[data-status=today] i{background:#81aef3}.task-state[data-status=overdue] i{background:#ee8c83}.task-state[data-status=done] i{background:#60bc95}.save-state{font-size:11px;opacity:.6}.task-date-row{display:flex;gap:16px;align-items:end}.task-date-row>label:first-child{flex:1}.task-date-row label,.task-time-row label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--color-text);min-width:0}.task-date-row input,.task-time-row input{width:100%;font-size:13px}.task-date-row .all-day{display:flex;flex-direction:row;align-items:center;gap:6px;font-size:12px;padding:8px 0}.all-day input{width:auto}.task-time-row{display:grid;grid-template-columns:1fr 12px 1fr 1.4fr;gap:8px;align-items:end;margin-top:12px}.task-time-row>span{padding-bottom:8px;text-align:center;opacity:.4}.timezone{font-size:10px;opacity:.45;margin:6px 0 16px}.field-label{display:block;font-size:11px;opacity:.65;margin:16px 0 6px}.timezone+.field-label{margin-top:0}.task-popover textarea{width:100%;resize:vertical;min-height:60px;max-height:160px;line-height:1.5}.reminder-heading,.attachment-heading{display:flex;align-items:center;justify-content:space-between;margin-top:12px}.reminder-heading .field-label,.attachment-heading .field-label{margin:0}.reminder-heading button,.attachment-heading button{border:0;background:transparent;padding:4px 8px;font-size:18px;line-height:20px}.attachment-heading>div{display:flex;align-items:center}.reminder-row{display:flex;align-items:center;gap:8px;margin-top:4px;font-size:12px}.reminder-row input{width:64px}.reminder-row button{margin-left:auto;border:0;background:transparent}.overdue-row{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:10px;font-size:11px;opacity:.8}.overdue-row input{width:54px;padding:5px}.task-popover .hidden-file{display:none}.file-row{display:flex;align-items:center;gap:8px;font-size:12px}.file-row>button:first-child{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file-row button{border:0;background:transparent;padding:6px 0}.file-row small{opacity:.5;white-space:nowrap}.link-row{display:grid;grid-template-columns:1fr 1.6fr auto auto;gap:4px;margin-top:8px;align-items:center}.link-row input{width:100%;padding:6px;font-size:12px}.link-row button{border:0;background:transparent}.task-popover a{color:var(--color-primary,#10b981)}.source-link{display:inline-block;margin-top:8px;font-size:12px}.task-popover footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:20px;padding-top:12px;border-top:1px solid var(--color-border)}.completion{display:flex;align-items:center;gap:8px;font-size:12px}.task-popover .save-button{background:var(--color-primary,#10b981);border:0;color:#fff;padding:9px 12px}.task-error{color:#e48b86;font-size:12px;margin-top:12px}.task-error button{font-size:11px;margin-left:8px}button:disabled{opacity:.45;cursor:default}[data-theme=light] .task-popover input:is([type=date],[type=time]){color-scheme:light}
</style>
