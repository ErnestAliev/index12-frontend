<script setup>
import UiIcon from '@/components/UiIcon.vue';
import { useInputModality } from '@/composables/useInputModality';
import { useTeamChatStore, teamApi } from '@/stores/teamChatStore';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useBusinessStore } from '@/stores/businessStore';
import { useMainStore } from '@/stores/mainStore';
import { businessApi, businessError } from '@/services/businessApi';
import { dayAt, monthDays, shiftTask, statusLabels, taskState, taskOnDay, timeAt, matchesEmployee } from '@/utils/calendarTime';
import CalendarTaskPopover from './CalendarTaskPopover.vue';
import CalendarDeletedTasks from './CalendarDeletedTasks.vue';
const emit = defineEmits(['close']);
const keyboardNavigation = useInputModality();
const business = useBusinessStore(), main = useMainStore(), chat = useTeamChatStore();
const employee = ref('all'), project = ref(''), filterOpen = ref(false), deletedOpen = ref(false), agendaUndated = ref(false);
const now = ref(Date.now()), month = ref(dayAt().slice(0, 7)), selected = ref(dayAt()), query = ref(''), party = ref(''), statuses = ref(Object.keys(statusLabels)), error = ref(''), dropDate = ref(null), popover = ref(null), editor = ref(null);
const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const days = computed(() => monthDays(month.value));
const today = computed(() => dayAt(now.value));
const monthLabel = computed(() => new Date(`${month.value}-15T12:00:00Z`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(' г.', ''));
const parties = computed(() => [{ key: 'companies', label: 'Мои компании' }, { key: 'contractors', label: 'Контрагенты' }, { key: 'individuals', label: 'Физические лица' }].map(group => ({ ...group, rows: main[group.key] || [] })));
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
const filtered = computed(() => business.tasks.filter(task => matchesEmployee(task, employee.value, business.status?.actorId) && (!project.value || (project.value === '__none__' ? !task.projectId : task.projectId === project.value)) && (!party.value || `${task.party?.kind || 'companies'}:${task.party?.id || task.companyId}` === party.value) && normalize(`${task.title} ${task.description || ''} ${task.partyName || ''} ${task.projectName || ''}`).includes(normalize(query.value))));
const visible = computed(() => filtered.value.filter(task => statuses.value.includes(taskState(task, now.value))));
const counts = computed(() => Object.fromEntries(Object.keys(statusLabels).map(key => [key, filtered.value.filter(task => taskState(task, now.value) === key).length])));
const eventTime = task => task.dueTime || (task.startsAt ? timeAt(task.startsAt) : '');
const byDay = computed(() => Object.fromEntries(days.value.map(date => [date, visible.value.filter(task => taskOnDay(task, date)).sort((a, b) => Number(!!eventTime(a)) - Number(!!eventTime(b)) || eventTime(a).localeCompare(eventTime(b)) || a.title.localeCompare(b.title))])));
const selectedTasks = computed(() => byDay.value[selected.value] || []);
const selectedLabel = computed(() => new Date(`${selected.value}T12:00:00Z`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }));
const unscheduled = computed(() => visible.value.filter(task => !task.dueDate && !task.startsAt));
const agendaTasks = computed(() => agendaUndated.value ? unscheduled.value : selectedTasks.value);
let clock;
async function prepareChat(workspaceId) {
  if (chat.me?.workspaceId !== workspaceId) await chat.start(workspaceId);
  if (chat.me?.workspaceId !== workspaceId || chat.me?.status !== 'active') throw new Error('Чат недоступен в этой рабочей области');
}
function clickDay(date) { agendaUndated.value = false; selected.value = date; if (!window.matchMedia('(max-width: 1000px)').matches) void show(null, date); }
function moveMonth(delta) { const [year, m] = month.value.split('-').map(Number); month.value = new Date(Date.UTC(year, m - 1 + delta, 1)).toISOString().slice(0, 7); }
function goToday() { month.value = today.value.slice(0, 7); selected.value = today.value; agendaUndated.value = false; }
async function show(task, date) {
  if (popover.value?.task?._id === task?._id && task) return;
  if (popover.value) { await editor.value?.close(); if (popover.value) return; }
  popover.value = { task, date, key: task?._id || crypto.randomUUID() };
}
async function openChat(task) {
  try {
    await prepareChat(task.workspaceId);
    const { data } = await teamApi.get(`/tasks/${task.sourceTaskId}`);
    chat.state.tasks = [...chat.state.tasks.filter(t => t._id !== data.task._id), data.task];
    chat.creatingTask = false; chat.taskNotifications = false; chat.tab = 'tasks';
    chat.requestedTaskId = task.sourceTaskId; chat.show(); emit('close');
  } catch (e) { error.value = e.response ? businessError(e) : e.message; }
}
function restored(task) {
  agendaUndated.value = !task.dueDate && !task.startsAt;
  const date = task.dueDate || (task.startsAt ? dayAt(task.startsAt) : today.value);
  month.value = date.slice(0, 7); selected.value = date;
}
async function closeCalendar() { if (popover.value) { await editor.value?.close(); if (popover.value) return; } emit('close'); }
function endDrag() { dropDate.value = null; }
function drag(event, task) { if (popover.value) { event.preventDefault(); return; } event.dataTransfer.setData('application/x-index12-task', task._id); event.dataTransfer.effectAllowed = 'move'; }
async function drop(event, date) {
  endDrag(); const id = event.dataTransfer.getData('application/x-index12-task'); if (!business.tasks.some(task => task._id === id)) return;
  try { const response = await businessApi.get(`/tasks/${id}`), task = response.data.task;
    if (task.source === 'team-chat') {
      await prepareChat(task.workspaceId);
      await chat.action(`/tasks/${task.sourceTaskId}`, { expectedVersion: task.version, dueDate: date, dueTime: task.dueTime, timing: task.timing === 'none' ? 'deadline' : task.timing }, 'patch');
      await business.refresh({ tasksOnly: true });
    } else await business.saveTask(shiftTask(task, date), id, task.version);
    error.value = ''; } catch (e) { error.value = businessError(e); }
}
async function openRequested(id) {
  if (!id) return;
  try { const { data } = await businessApi.get(`/tasks/${id}`); const date = data.task.dueDate || today.value; month.value = date.slice(0, 7); selected.value = date; await show(data.task, date); business.requestedTask = null; } catch (e) { error.value = businessError(e); }
}
function reloadTask(task) { if (popover.value) popover.value = { ...popover.value, task, key: crypto.randomUUID() }; }
function keyboard(event) { if (deletedOpen.value) return; if (event.key === 'Escape' && filterOpen.value) { event.stopPropagation(); filterOpen.value = false; return; } if (event.key === 'Escape' && !popover.value) { event.stopPropagation(); emit('close'); } }
watch(month, () => business.setRange(days.value[0], days.value.at(-1)));
watch(() => business.requestedTask, id => void openRequested(id));
onMounted(() => { business.setCalendarVisible(true); void business.setRange(days.value[0], days.value.at(-1)); void openRequested(business.requestedTask); clock = setInterval(() => { now.value = Date.now(); }, 15000); window.addEventListener('keydown', keyboard); });
onBeforeUnmount(() => { business.setCalendarVisible(false); clearInterval(clock); window.removeEventListener('keydown', keyboard); });
</script>
<template>
  <div class="calendar-overlay" @click.self="closeCalendar">
    <section class="calendar-window" :data-keyboard="keyboardNavigation" role="dialog" aria-modal="true" aria-label="Календарь задач">
      <header class="calendar-header"><h2>Календарь</h2><button type="button" class="today-button" @click="goToday">Сегодня</button><div class="calendar-navigation"><button type="button" aria-label="Предыдущий месяц" @click="moveMonth(-1)" class="ui-icon-button"><UiIcon name="chevron-left" /></button><button type="button" aria-label="Следующий месяц" @click="moveMonth(1)" class="ui-icon-button"><UiIcon name="chevron-right" /></button></div><strong class="calendar-month-label">{{ monthLabel }}</strong><div class="calendar-search"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input v-model="query" type="search" aria-label="Поиск задач" placeholder="Поиск задач" /></div><button type="button" class="calendar-filter-toggle ui-icon-button" aria-label="Фильтры календаря" :aria-expanded="filterOpen" @click="filterOpen = !filterOpen"><UiIcon name="filter" /></button><button type="button" class="calendar-deleted-button" aria-label="Удалённые задачи" title="Удалённые задачи" @click="deletedOpen = true; filterOpen = false"><UiIcon name="trash" /><span>Удалённые</span></button><button type="button" class="notification-button" :class="{ enabled: business.notificationsEnabled }" :aria-pressed="business.notificationsEnabled" :aria-label="business.notificationsEnabled ? 'Отключить уведомления' : 'Включить уведомления'" :title="business.notificationsEnabled ? 'Уведомления включены' : 'Включить уведомления'" @click="business.toggleNotifications"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button><button type="button" class="calendar-close ui-icon-button" aria-label="Закрыть календарь" @click="closeCalendar"><UiIcon name="close" /></button></header>
      <div v-if="error || business.error" class="calendar-error" role="alert">{{ error || business.error }}</div><div v-if="business.truncated" class="calendar-error" role="status">Показаны первые 2000 задач периода</div>
      <div v-if="filterOpen" class="calendar-filter-backdrop" @click.stop="filterOpen = false" />
      <div class="calendar-layout">
        <aside class="calendar-sidebar" :class="{ 'mobile-filters-open': filterOpen }">
          <button type="button" class="calendar-create" @click="show(null, selected)"><span aria-hidden="true">+</span>Создать задачу</button>
          <div class="mini-header"><strong>{{ monthLabel }}</strong><button type="button" aria-label="Предыдущий месяц в мини-календаре" @click="moveMonth(-1)" class="ui-icon-button"><UiIcon name="chevron-left" /></button><button type="button" aria-label="Следующий месяц в мини-календаре" @click="moveMonth(1)" class="ui-icon-button"><UiIcon name="chevron-right" /></button></div>
          <div class="mini-grid"><span v-for="day in weekdays" :key="day">{{ day }}</span><button v-for="date in days" :key="date" type="button" :class="{ 'is-today': date === today, 'is-selected': date === selected, adjacent: !date.startsWith(month) }" :aria-label="`Выбрать ${date}`" @click="selected = date; month = date.slice(0, 7)">{{ Number(date.slice(-2)) }}</button></div>
          <div class="calendar-filter-fields"><label v-for="(label, key) in statusLabels" :key="key" class="status-filter" :data-status="key"><input v-model="statuses" type="checkbox" :value="key" /><span>{{ label }}</span><small>{{ counts[key] }}</small></label>
          <select v-model="party" aria-label="Фильтр по контрагенту" class="ui-select"><option value="">Все контрагенты</option><optgroup v-for="group in parties" :key="group.key" :label="group.label"><option v-for="row in group.rows" :key="row._id" :value="`${group.key}:${row._id}`">{{ row.name }}</option></optgroup></select>
          <select v-model="employee" aria-label="Фильтр по сотруднику" class="ui-select"><option value="all">Все сотрудники</option><option value="mine">Мои</option><option v-for="person in business.people" :key="person._id" :value="person._id">{{ person.name }}</option></select>
          <select v-model="project" aria-label="Фильтр по проекту" class="ui-select"><option value="">Все проекты</option><option v-for="row in main.projects" :key="row._id" :value="row._id">{{ row.name }}</option><option value="__none__">Без проекта</option></select>
          </div>
          <div v-if="unscheduled.length" class="unscheduled"><h3>Без даты <small>{{ unscheduled.length }}</small></h3><button v-for="task in unscheduled" :key="task._id" type="button" @click="show(task, selected)">{{ task.title }}</button></div>
        </aside>
        <main class="calendar-main"><div class="calendar-weekdays"><span v-for="day in weekdays" :key="day">{{ day }}</span></div><div class="calendar-grid" :style="{ '--calendar-weeks': days.length / 7 }" role="grid" :aria-label="monthLabel">
          <div v-for="date in days" :key="date" class="calendar-cell" :class="{ adjacent: !date.startsWith(month), 'drop-target': dropDate === date, 'selected-day': date === selected }" role="gridcell" tabindex="0" :aria-label="`${date}, задач: ${byDay[date].length}`" :data-date="date" @click="clickDay(date)" @keydown.enter.self.prevent="clickDay(date)" @dragover.prevent="dropDate = date" @dragleave.self="dropDate = null" @drop.prevent="drop($event, date)">
            <div class="day-number"><span :class="{ 'is-today': date === today }">{{ Number(date.slice(-2)) }}<small v-if="date.slice(-2) === '01'"> {{ new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { month: 'short', timeZone: 'UTC' }) }}</small></span></div>
            <div class="calendar-day-markers" aria-hidden="true"><i v-for="task in byDay[date].slice(0,3)" :key="task._id" :data-status="taskState(task,now)"></i><small v-if="byDay[date].length > 3">+{{ byDay[date].length - 3 }}</small></div>
            <div class="day-tasks"><button v-for="task in byDay[date]" :key="task._id" type="button" class="calendar-event" :data-status="taskState(task, now)" :data-task-id="task._id" draggable="true" :aria-label="task.title" @dragstart="drag($event, task)" @dragend="endDrag" @click.stop="show(task, date)"><i aria-hidden="true"></i><time v-if="task.dueTime || (task.startsAt && dayAt(task.startsAt) === date)">{{ task.dueTime || timeAt(task.startsAt) }}</time><span>{{ task.title }}</span></button></div>
          </div>
        </div><div class="mobile-agenda"><header><strong>{{ agendaUndated ? 'Без даты' : selectedLabel }}</strong><span>{{ agendaTasks.length }}</span><button v-if="unscheduled.length || agendaUndated" type="button" class="agenda-switch" @click="agendaUndated = !agendaUndated">{{ agendaUndated ? 'К датам' : 'Без даты' }}</button><button type="button" class="mobile-add" aria-label="Создать задачу" @click="show(null, selected)"><UiIcon name="plus" /></button></header><div class="mobile-agenda-list"><button v-for="task in agendaTasks" :key="task._id" type="button" class="mobile-agenda-task" :aria-label="task.title" :data-status="taskState(task, now)" @click="show(task, selected)"><time>{{ task.dueTime || (task.startsAt ? timeAt(task.startsAt) : 'Весь день') }}</time><span>{{ task.title }}<small v-if="task.partyName"> · {{ task.partyName }}</small></span><i aria-hidden="true"></i></button><p v-if="!agendaTasks.length" class="agenda-empty">Нет задач</p></div></div></main>
      </div>
      <CalendarDeletedTasks v-if="deletedOpen" @close="deletedOpen = false" @restored="restored" />
      <CalendarTaskPopover v-if="popover" :key="popover.key" ref="editor" :task="popover.task" :date="popover.date" @close="popover = null" @open-chat="openChat" @reload="reloadTask" @saved="task => { if (popover) popover.task = task }" />
    </section>
  </div>
</template>
<style scoped>
.calendar-overlay{position:fixed;inset:0;z-index:3600;background:#0009;display:grid;place-items:center;padding:12px}.calendar-window{position:relative;width:100%;height:calc(100dvh - 24px);max-width:1920px;box-sizing:border-box;display:flex;flex-direction:column;background:var(--color-background);color:var(--color-text);border:1px solid var(--color-border);border-radius:14px;overflow:hidden;box-shadow:0 12px 64px #0005;font-size:13px}.calendar-window button,.calendar-window input,.calendar-window select{font:inherit;color:inherit;box-sizing:border-box;min-width:0}.calendar-window button{cursor:pointer}.calendar-header{display:flex;align-items:center;gap:16px;min-height:72px;padding:12px 20px;box-sizing:border-box}.calendar-header h2{font-size:20px;font-weight:600;margin:0;width:184px;flex-shrink:0;letter-spacing:-.4px}.calendar-header button{height:32px;border:0;background:transparent;border-radius:6px;padding:4px 8px}.calendar-header button:hover{background:var(--color-background-soft)}.calendar-header .today-button{border:1px solid var(--color-border);padding:4px 14px;font-size:12px}.calendar-navigation{display:flex;gap:4px}.calendar-navigation button{font-size:24px;line-height:20px}.calendar-month-label{text-transform:capitalize;font-size:20px;font-weight:500;white-space:nowrap}.calendar-search{margin-left:auto;display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid transparent;border-radius:6px;max-width:240px;min-width:100px}.calendar-search:focus-within{border-color:var(--color-border);background:var(--color-background-soft)}.calendar-search input{background:transparent;border:0;outline:0;width:100%;font-size:12px}.calendar-header svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;flex-shrink:0}.calendar-header .notification-button{display:grid;place-items:center;width:32px;flex-shrink:0}.notification-button.enabled{color:var(--color-primary,#10b981)}.calendar-header .calendar-close{font-size:24px;flex-shrink:0}.calendar-layout{display:flex;flex:1;min-height:0}.calendar-sidebar{width:228px;box-sizing:border-box;padding:0 20px 24px;flex-shrink:0;overflow-y:auto}.calendar-create{display:flex;align-items:center;gap:12px;border:1px solid var(--color-border);background:var(--color-background-soft);border-radius:12px;padding:12px 16px;font-weight:500;box-shadow:0 2px 3px #0002;margin-bottom:24px;white-space:nowrap}.calendar-create>span{font-size:28px;line-height:24px;font-weight:300}.mini-header{display:flex;align-items:center;gap:4px;margin-bottom:12px;font-size:11px}.mini-header strong{flex:1;text-transform:capitalize;font-weight:500}.mini-header button{background:transparent;border:0;font-size:20px;width:24px;height:24px;padding:0}.mini-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;align-items:center;text-align:center;font-size:10px}.mini-grid>span{opacity:.55;padding:4px 0}.mini-grid button{border:0;background:transparent;width:24px;height:24px;justify-self:center;border-radius:50%;font-size:10px;padding:0}.mini-grid button:hover,.mini-grid .is-selected{background:var(--color-background-soft)}.mini-grid .is-selected{outline:1px solid var(--color-border)}.mini-grid .is-today,.day-number .is-today{background:var(--color-primary,#10b981);color:#fff}.mini-grid .adjacent{opacity:.35}.calendar-sidebar h3{font-size:11px;font-weight:500;margin:28px 0 12px;opacity:.65}.status-filter{display:flex;align-items:center;gap:10px;margin:12px 0;font-size:12px;cursor:pointer}.status-filter input{appearance:none;margin:0;width:14px;height:14px;border:1px solid #8c98a5;border-radius:3px;background:transparent;display:grid;place-items:center;flex-shrink:0}.status-filter input:checked{background:#8c98a5;color:#17191b}.status-filter input:checked:after{content:'✓';font-size:11px;font-weight:700}.status-filter[data-status=today] input{border-color:#83aff1}.status-filter[data-status=today] input:checked{background:#83aff1}.status-filter[data-status=done] input{border-color:#67b99b}.status-filter[data-status=done] input:checked{background:#67b99b}.status-filter[data-status=overdue] input{border-color:#df938a}.status-filter[data-status=overdue] input:checked{background:#df938a}.status-filter small{margin-left:auto;font-size:10px;font-variant-numeric:tabular-nums;opacity:.45}.calendar-sidebar select{width:100%;background:var(--color-background-soft);border:1px solid var(--color-border);padding:8px;border-radius:6px;font-size:11px}.calendar-main{display:flex;flex-direction:column;flex:1;min-width:0;border-top:1px solid var(--color-border);border-left:1px solid var(--color-border);border-top-left-radius:12px;overflow:hidden;background:var(--calendar-grid-background,var(--color-background))}.calendar-weekdays{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));height:30px;flex-shrink:0}.calendar-weekdays>span{display:grid;place-items:center;border-right:1px solid var(--color-border);font-size:10px;text-transform:uppercase;opacity:.65}.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:repeat(var(--calendar-weeks),minmax(0,1fr));flex:1;min-height:0}.calendar-cell{position:relative;border-top:1px solid var(--color-border);border-right:1px solid var(--color-border);min-width:0;min-height:0;display:flex;flex-direction:column;cursor:pointer;padding:4px;box-sizing:border-box}.calendar-cell:focus-visible{outline:1px solid var(--color-primary,#10b981);outline-offset:-2px}.calendar-cell.adjacent .day-number{opacity:.4}.calendar-cell.drop-target{background:color-mix(in srgb,var(--color-primary,#10b981) 15%,transparent);box-shadow:inset 0 0 0 1px var(--color-primary,#10b981)}.day-number{height:28px;flex-shrink:0;text-align:center;font-size:11px;display:grid;place-items:center}.day-number>span{display:inline-grid;place-items:center;min-width:24px;height:24px;padding:0 3px;box-sizing:border-box;border-radius:50%;position:relative}.day-number small{font-size:9px;position:absolute;white-space:nowrap;left:26px;top:6px;opacity:.55}.day-tasks{overflow-y:auto;min-height:0;scrollbar-width:thin}.calendar-event{display:flex;align-items:center;gap:4px;width:100%;min-width:0;border:0;border-radius:4px;background:transparent;color:inherit;text-align:left;padding:3px 4px;font-size:12px;line-height:17px;margin:1px 0}.calendar-event:hover,.calendar-event:focus{background:var(--color-background-soft);outline:0}.calendar-event>i{width:6px;height:6px;background:#8996a5;border-radius:50%;flex-shrink:0}.calendar-event time{font-size:11px;opacity:.65;font-variant-numeric:tabular-nums;white-space:nowrap}.calendar-event>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.calendar-event[data-status=today]>i{background:#83aff1}.calendar-event[data-status=overdue]>i{background:#df938a}.calendar-event[data-status=done]>i{background:#67b99b}.calendar-event[data-status=done]>span{text-decoration:line-through;opacity:.5}.calendar-event[data-status=overdue]{color:#e6a198}.calendar-error{color:#df938a;font-size:12px;padding:0 20px 10px}.unscheduled button{display:block;width:100%;background:transparent;border:0;text-align:left;padding:6px 0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.unscheduled small{margin-left:8px}.mobile-create,.mobile-agenda{display:none}.calendar-window button:focus-visible,.calendar-window select:focus-visible,.calendar-window input:focus-visible{outline:1px solid var(--color-primary,#10b981);outline-offset:2px}
:global(:root[data-theme="light"]) .calendar-window{--calendar-grid-background:var(--color-background-soft)}
:global(:root[data-theme="light"]) .calendar-event[data-status=overdue]{color:var(--color-danger)}
.calendar-header h2,.calendar-month-label{line-height:32px}
.calendar-header button{display:inline-flex;align-items:center;justify-content:center;line-height:1}
.calendar-navigation{height:32px;align-items:center}
.calendar-navigation button{width:28px;padding:0}
.calendar-header .calendar-close{width:32px;padding:0}
.calendar-search{height:32px;padding-block:0;box-sizing:border-box}
.calendar-search input{height:100%;margin:0;line-height:normal}
.mini-header button{display:inline-flex;align-items:center;justify-content:center;line-height:1}
@media(max-width:1000px){.calendar-header{gap:8px;padding:12px}.calendar-header h2{width:164px}.calendar-sidebar{width:192px;padding:0 12px 20px}.calendar-month-label{font-size:17px}.calendar-search{max-width:160px}.calendar-create{padding:12px;gap:8px;font-size:12px}.calendar-event{font-size:11px;gap:3px;padding:2px}.calendar-event time{font-size:10px}}
@media(max-width:1000px){.calendar-overlay{padding:0}.calendar-window{height:100dvh;border:0;border-radius:0}.calendar-header{display:grid;grid-template-columns:minmax(0,1fr) auto 32px 28px;min-height:132px;gap:8px 4px;padding:12px}.calendar-header h2{grid-column:1;grid-row:1;width:auto;font-size:18px}.calendar-header .today-button{grid-column:2;grid-row:1}.notification-button{grid-column:3;grid-row:1}.calendar-close{grid-column:4;grid-row:1}.calendar-navigation{grid-column:1;grid-row:2;justify-self:start}.calendar-month-label{grid-column:1/-1;grid-row:2;font-size:16px;margin-left:72px}.calendar-search{grid-column:1/-1;grid-row:3;margin:0;max-width:none;background:var(--color-background-soft);padding:6px 8px}.calendar-sidebar{display:none}.calendar-main{border-left:0;border-radius:0}.calendar-cell{padding:2px}.calendar-cell.selected-day .day-number>span:not(.is-today){outline:1px solid var(--color-border);background:var(--color-background-soft)}.calendar-event{font-size:10px;line-height:12px;padding:2px 0;gap:2px}.calendar-event time{display:none}.calendar-event>span{white-space:nowrap;line-height:12px}.calendar-event>i{width:4px;height:4px}.calendar-weekdays{height:24px}.day-number{height:24px;font-size:10px}.day-number small{display:none}.mobile-create{position:absolute;right:16px;bottom:20px;display:block;width:48px;height:48px;border:0;border-radius:14px;background:var(--color-primary,#10b981);color:#fff;font-size:30px;box-shadow:0 4px 16px #0004}.mobile-agenda{display:block;flex-shrink:0;height:24dvh;min-height:116px;max-height:240px;overflow-y:auto;border-top:1px solid var(--color-border);padding:12px 16px 64px;box-sizing:border-box}.mobile-agenda header{display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px}.mobile-agenda header strong{font-weight:500;text-transform:capitalize}.mobile-agenda header>span{opacity:.5}.mobile-agenda-task{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;border:0;background:transparent;padding:8px 0;text-align:left}.mobile-agenda-task time{font-size:11px;width:44px;flex-shrink:0;opacity:.6}.mobile-agenda-task>span{flex:1;min-width:0;font-size:13px;overflow-wrap:anywhere}.mobile-agenda-task small{display:block;font-size:10px;opacity:.5;margin-top:4px}.mobile-agenda-task>i{width:6px;height:6px;border-radius:50%;background:#8996a5;flex-shrink:0}.mobile-agenda-task[data-status=today]>i{background:#83aff1}.mobile-agenda-task[data-status=overdue]>i{background:#df938a}.mobile-agenda-task[data-status=done]>i{background:#67b99b}.mobile-agenda-task[data-status=done]>span{text-decoration:line-through}}
</style>

<style scoped>
@media (max-width: 1000px) {
  .calendar-header { padding-top: calc(12px + var(--safe-area-top)); }
  .mobile-agenda { padding-bottom: var(--safe-bottom-controls); }
  .mobile-create { bottom: var(--safe-bottom-controls); }
}
</style>

<style scoped>
.calendar-filter-toggle { display: none !important; }
@media (max-width: 1000px) {
  .calendar-header { grid-template-columns: minmax(0,1fr) auto 44px 44px 44px; padding-inline: max(12px,var(--safe-area-left)) max(12px,var(--safe-area-right)); }
  .calendar-header .calendar-filter-toggle { display: grid !important; grid-column: 3; grid-row: 1; width: 44px; height: 44px; }
  .calendar-header .notification-button { grid-column: 4; width: 44px; height: 44px; }
  .calendar-header .calendar-close { grid-column: 5; width: 44px; height: 44px; }
  .calendar-filter-backdrop { position: absolute; inset: 0; z-index: 3; }
  .calendar-sidebar.mobile-filters-open {
    display: block; position: absolute; z-index: 4; right: max(12px,var(--safe-area-right));
    top: 8px; width: min(300px,calc(100% - max(12px,var(--safe-area-left)) - max(12px,var(--safe-area-right))));
    max-height: calc(100% - 16px - var(--safe-bottom-controls)); overflow: auto;
    background: var(--color-background); border: 1px solid var(--color-border); border-radius: 10px;
    padding: 0 16px 16px; box-sizing: border-box; box-shadow: 0 8px 24px #0003;
  }
  .mobile-filters-open .calendar-create, .mobile-filters-open .mini-header, .mobile-filters-open .mini-grid { display: none; }
  .mobile-agenda-task time { width: 56px; white-space: nowrap; }
  .calendar-sidebar select { min-height: 44px; font-size: 16px; }
  .status-filter { min-height: 36px; margin: 4px 0; }
}
</style>

<style scoped>
@media (max-width: 375px) {
  .calendar-header { grid-template-columns: minmax(0,1fr) 44px 44px 44px; }
  .calendar-header .calendar-filter-toggle { grid-column: 2; }
  .calendar-header .notification-button { grid-column: 3; }
  .calendar-header .calendar-close { grid-column: 4; }
  .calendar-header .today-button { grid-column: 3/5; grid-row: 2; justify-self: end; }
  .calendar-month-label { grid-column: 1/3; font-size: 14px; margin-left: 60px; white-space: nowrap; }
}
</style>

<style scoped>
.calendar-header .calendar-deleted-button { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.calendar-deleted-button :deep(svg) { width: 16px; height: 16px; }
.calendar-day-markers { display: none; }
.calendar-filter-fields { display: grid; gap: 8px; padding-top: 12px; }
.calendar-sidebar .calendar-filter-fields .status-filter { margin: 0; min-height: 32px; font-size: 13px; }
.calendar-sidebar .calendar-filter-fields select { min-height: 36px; margin: 0; font-size: 13px; }
@media (max-width:1000px) {
  .calendar-header { display: grid; grid-template-columns: minmax(0,1fr) repeat(4,44px); grid-template-rows: 44px 36px 36px; min-height: 0; gap: 4px; padding-block: calc(8px + var(--safe-area-top)) 8px; }
  .calendar-header h2 { grid-column: 1; grid-row: 1; font-size: 16px; white-space: nowrap; }
  .calendar-header .calendar-filter-toggle { grid-column: 2; grid-row: 1; }
  .calendar-header .calendar-deleted-button { grid-column: 3; grid-row: 1; width: 44px; height: 44px; padding: 0; justify-content: center; }
  .calendar-deleted-button>span { display: none; }
  .calendar-header .notification-button { grid-column: 4; grid-row: 1; }
  .calendar-header .calendar-close { grid-column: 5; grid-row: 1; }
  .calendar-header .today-button { grid-column: 4/6; grid-row: 2; height: 36px; justify-self: end; font-size: 12px; }
  .calendar-navigation { grid-column: 1; grid-row: 2; height: 36px; }
  .calendar-month-label { grid-column: 1/4; grid-row: 2; margin-left: 64px; font-size: 14px; white-space: nowrap; pointer-events: none; }
  .calendar-search { grid-column: 1/-1; grid-row: 3; height: 36px; }
  .calendar-main { min-height: 0; }
  .calendar-weekdays { height: 24px; }
  .calendar-grid { flex: none; height: min(calc(var(--calendar-weeks) * 40px),32dvh); }
  .calendar-cell { padding: 2px; }
  .day-number { height: 23px; font-size: 11px; }
  .day-number>span { min-width: 22px; height: 22px; }
  .calendar-cell .day-tasks { display: none; }
  .calendar-day-markers { display: flex; justify-content: center; align-items: center; gap: 3px; height: 10px; pointer-events: none; }
  .calendar-day-markers i { width: 4px; height: 4px; border-radius: 50%; background: #8996a5; }
  .calendar-day-markers i[data-status=today] { background: #83aff1; }
  .calendar-day-markers i[data-status=done] { background: #67b99b; }
  .calendar-day-markers i[data-status=overdue] { background: #df938a; }
  .calendar-day-markers small { font-size: 8px; line-height: 10px; color: var(--color-text); }
  .mobile-agenda { display: flex; flex-direction: column; flex: 1; height: auto; max-height: none; min-height: 0; padding: 0; overflow: hidden; }
  .mobile-agenda>header { display: flex; align-items: center; flex: none; gap: 8px; min-height: 44px; margin: 0; padding-inline: max(12px,var(--safe-area-left)) max(12px,var(--safe-area-right)); }
  .mobile-agenda>header strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mobile-agenda>header>span { font-size: 12px; }
  .mobile-agenda>header button { min-height: 44px; border: 0; background: transparent; padding: 0 4px; font-size: 12px; white-space: nowrap; }
  .mobile-agenda .agenda-switch { margin-left: auto; }
  .mobile-agenda .mobile-add { display: grid; place-items: center; width: 44px; min-width: 44px; margin-left: auto; }
  .mobile-agenda .agenda-switch+.mobile-add { margin-left: 0; }
  .mobile-add :deep(svg) { width: 20px; height: 20px; }
  .mobile-agenda-list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 max(12px,var(--safe-area-right)) var(--safe-bottom-controls) max(12px,var(--safe-area-left)); }
  .mobile-agenda-task { gap: 8px; min-height: 48px; padding-block: 8px; }
  .mobile-agenda-task>span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 14px; }
  .mobile-agenda-task small { display: inline; margin: 0; font-size: 12px; }
  .calendar-sidebar.mobile-filters-open { padding: 8px 12px 12px; }
  .calendar-filter-fields { padding: 0; }
  .calendar-sidebar.mobile-filters-open .unscheduled { display: none; }
  .agenda-empty { margin: 12px 0; color: var(--color-text-muted); font-size: 13px; }
}
</style>

<style scoped>
@media (max-width:1000px) and (max-height:700px) {
  .day-number { height: 18px; font-size: 10px; }
  .day-number>span { min-width: 18px; height: 18px; }
  .calendar-day-markers { height: 8px; }
}
@media (min-width:600px) and (max-width:1000px) and (max-height:500px) {
  .calendar-header { grid-template-rows: 36px 32px; }
  .calendar-header .calendar-search { grid-row: 2; grid-column: 1/4; justify-self: end; width: min(200px,30vw); height: 32px; }
  .calendar-main { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); grid-template-rows: 24px minmax(0,1fr); }
  .calendar-weekdays { grid-column: 1; grid-row: 1; }
  .calendar-grid { grid-column: 1; grid-row: 2; height: 100%; }
  .mobile-agenda { grid-column: 2; grid-row: 1/3; border-top: 0; border-left: 1px solid var(--color-border); }
}
</style>

<style scoped>
.calendar-window .calendar-search input { border: 0 !important; border-radius: 0; outline: none !important; box-shadow: none !important; padding: 0; background: transparent !important; font: inherit; font-size: 13px; }
.calendar-window .calendar-filter-fields select { height: 34px; min-height: 34px; padding: 6px 8px; font-size: 13px; color: var(--color-text); }
.calendar-window:not([data-keyboard="true"]) :is(button,input,select):focus { outline: none !important; box-shadow: none !important; }
.calendar-window:not([data-keyboard="true"]) .calendar-filter-fields select:focus { border-color: var(--color-border) !important; }
.calendar-window[data-keyboard="true"] :is(button,select):focus-visible { outline: 1px solid var(--color-primary) !important; outline-offset: 2px; }
.calendar-window[data-keyboard="true"] .calendar-search input:focus-visible { box-shadow: inset 0 -1px var(--color-primary) !important; }
@media (max-width:1000px) { .calendar-window .calendar-search input { font-size: 16px; } }
</style>
