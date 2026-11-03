<script setup>
import { computed, onMounted, ref } from 'vue';
import { useBusinessStore } from '@/stores/businessStore';
import { useMainStore } from '@/stores/mainStore';
import { businessError } from '@/services/businessApi';
const emit = defineEmits(['close']);
const business = useBusinessStore();
const main = useMainStore();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date());
const month = ref(today.slice(0, 7));
const selectedDay = ref(today);
const company = ref('');
const showDone = ref(false);
const editing = ref(null);
const form = ref(null);
const busy = ref(false);
const error = ref('');
const monthLabel = computed(() => new Date(`${month.value}-15T12:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }));
const visible = computed(() => business.tasks.filter(task => (!company.value || task.companyId === company.value) && (showDone.value || task.status !== 'done')));
const agenda = computed(() => visible.value.filter(task => task.dueDate === selectedDay.value || !task.dueDate).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')));
const overdue = computed(() => visible.value.filter(task => task.status === 'open' && task.dueDate && task.dueDate < today).length);
const days = computed(() => {
  const [year, m] = month.value.split('-').map(Number);
  const offset = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  const length = new Date(year, m, 0).getDate();
  return Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, i) => {
    const day = i - offset + 1;
    if (day < 1 || day > length) return null;
    const date = `${month.value}-${String(day).padStart(2, '0')}`;
    return { day, date, count: visible.value.filter(task => task.dueDate === date).length };
  });
});
function moveMonth(delta) {
  const [year, m] = month.value.split('-').map(Number); const date = new Date(year, m - 1 + delta, 1);
  month.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  selectedDay.value = `${month.value}-01`;
}
function edit(task) { editing.value = task?._id || null; form.value = task ? { title: task.title, description: task.description || '', dueDate: task.dueDate || '', companyId: task.companyId || '' } : { title: '', description: '', dueDate: selectedDay.value, companyId: company.value }; error.value = ''; }
async function action(fn) { if (busy.value) return; busy.value = true; error.value = ''; try { await fn(); } catch (e) { error.value = businessError(e); } finally { busy.value = false; } }
const save = () => action(async () => { await business.saveTask({ ...form.value, companyId: form.value.companyId || null, dueDate: form.value.dueDate || null }, editing.value); form.value = null; });
const toggle = task => action(() => business.saveTask({ status: task.status === 'done' ? 'open' : 'done' }, task._id));
onMounted(() => business.refresh());
</script>

<template>
  <div class="calendar-overlay" @click.self="emit('close')">
    <section class="calendar-window" role="dialog" aria-modal="true" aria-label="Календарь задач">
      <header><h2>Календарь задач</h2><button type="button" @click="emit('close')" aria-label="Закрыть календарь">×</button></header>
      <div class="calendar-toolbar">
        <select v-model="company" aria-label="Фильтр по компании"><option value="">Все компании</option><option v-for="item in main.companies" :key="item._id" :value="item._id">{{ item.name }}</option></select>
        <label class="done-toggle"><input type="checkbox" v-model="showDone" /> Выполненные</label>
        <span v-if="overdue" class="overdue">Просрочено: {{ overdue }}</span>
        <button type="button" @click="business.toggleNotifications" :aria-pressed="business.notificationsEnabled" title="Уведомления в браузере, пока INDEX12 открыт">{{ business.notificationsEnabled ? 'Уведомления включены' : 'Уведомления' }}</button>
        <button type="button" @click="edit(null)">+ Задача</button>
      </div>
      <div v-if="error || business.error" role="alert" class="calendar-error">{{ error || business.error }}</div>
      <div v-if="business.truncated" role="status">Показаны последние 2000 задач</div>
      <div class="calendar-content">
        <div class="calendar-month">
          <div class="month-navigation"><button type="button" @click="moveMonth(-1)" aria-label="Предыдущий месяц">‹</button><strong>{{ monthLabel }}</strong><button type="button" @click="moveMonth(1)" aria-label="Следующий месяц">›</button><button type="button" @click="month = today.slice(0, 7); selectedDay = today">Сегодня</button></div>
          <div class="month-grid">
            <span v-for="day in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']" :key="day" class="weekday">{{ day }}</span>
            <template v-for="(day, i) in days" :key="day?.date || i">
              <button v-if="day" type="button" class="calendar-day" :class="{ selected: day.date === selectedDay, today: day.date === today }" :aria-pressed="day.date === selectedDay" :aria-label="`${day.date}, задач: ${day.count}`" @click="selectedDay = day.date"><span>{{ day.day }}</span><small v-if="day.count">{{ day.count }}</small></button>
              <span v-else class="calendar-blank"></span>
            </template>
          </div>
        </div>
        <div class="calendar-agenda">
          <h3>{{ new Date(`${selectedDay}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) }}</h3>
          <div v-if="!agenda.length" class="empty-agenda">Задач нет</div>
          <article v-for="task in agenda" :key="task._id" class="task-card" :class="{ completed: task.status === 'done' }">
            <div class="task-heading"><input type="checkbox" :checked="task.status === 'done'" :disabled="busy" @change="toggle(task)" :aria-label="`Выполнить: ${task.title}`" /><button type="button" class="task-title" @click="edit(task)">{{ task.title }}</button></div>
            <span class="task-company">{{ main.companies.find(item => item._id === task.companyId)?.name || 'Общая задача' }} · {{ task.dueDate || 'Без срока' }}</span>
            <p v-if="task.description">{{ task.description }}</p>
            <a v-if="task.sourceUrl" :href="task.sourceUrl" target="_blank" rel="noopener noreferrer">Источник: КГД</a>
            <button v-if="task.source === 'manual'" type="button" class="task-delete" :disabled="busy" @click="action(() => business.deleteTask(task._id))" :aria-label="`Удалить: ${task.title}`">Удалить</button>
          </article>
        </div>
      </div>
      <form v-if="form" class="task-form" @submit.prevent="save">
        <input v-model="form.title" placeholder="Название задачи" aria-label="Название задачи" maxlength="300" required />
        <select v-model="form.companyId" aria-label="Компания задачи"><option value="">Общая задача</option><option v-for="item in main.companies" :key="item._id" :value="item._id">{{ item.name }}</option></select>
        <input v-model="form.dueDate" type="date" aria-label="Дата задачи" />
        <textarea v-model="form.description" placeholder="Описание" aria-label="Описание задачи" maxlength="10000"></textarea>
        <div class="task-form-actions"><button type="button" @click="form = null" :disabled="busy">Отмена</button><button type="submit" :disabled="busy || !form.title.trim()">Сохранить задачу</button></div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.calendar-overlay { position: fixed; inset: 0; z-index: 3600; background: #0008; display: grid; place-items: center; padding: 16px; }
.calendar-window { width: min(1080px, 100%); max-height: 90dvh; box-sizing: border-box; display: flex; flex-direction: column; background: var(--color-background); color: var(--color-text); border: 1px solid var(--color-border); border-radius: 14px; box-shadow: 0 20px 60px #0005; overflow-y: auto; }
header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--color-border); }
h2 { font-size: 21px; margin: 0; } h3 { margin: 0 0 14px; font-size: 16px; }
button, select, input:not([type=checkbox]), textarea { font: inherit; color: var(--color-text); background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 6px; padding: 8px 12px; min-width: 0; box-sizing: border-box; }
button { cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
header button { border: 0; background: transparent; font-size: 24px; }
.calendar-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 16px 24px; }
.calendar-toolbar select { flex: 1; }
.done-toggle { display: flex; gap: 6px; font-size: 13px; align-items: center; }
.calendar-content { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 0 24px 24px; }
.calendar-month, .calendar-agenda { min-width: 0; }
.month-navigation { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 14px; }
.month-navigation strong { flex: 1; text-align: center; text-transform: capitalize; }
.month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
.weekday { text-align: center; font-size: 12px; padding: 5px; opacity: .65; }
.calendar-day, .calendar-blank { min-height: 58px; }
.calendar-day { text-align: left; padding: 7px; display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.calendar-day.today { font-weight: 800; }
.calendar-day.selected { border-color: var(--color-primary, #478ddc); box-shadow: inset 0 0 0 1px var(--color-primary, #478ddc); }
.calendar-day small { border-radius: 12px; background: var(--color-primary, #478ddc); color: white; min-width: 17px; text-align: center; font-size: 10px; }
.task-card { padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; margin-bottom: 10px; overflow-wrap: anywhere; }
.task-heading { display: flex; align-items: flex-start; gap: 8px; }
.task-title { border: 0; background: transparent; text-align: left; font-weight: 600; padding: 0; }
.task-company { display: block; margin-top: 7px; font-size: 12px; opacity: .65; }
.completed .task-title { text-decoration: line-through; opacity: .5; }
.task-card p { white-space: pre-wrap; font-size: 13px; margin: 8px 0; }
.task-delete { font-size: 11px; padding: 2px 6px; margin-top: 8px; }
.empty-agenda { opacity: .6; font-size: 14px; }
.task-form { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; padding: 20px 24px; border-top: 1px solid var(--color-border); }
.task-form textarea { grid-column: 1 / -1; min-height: 70px; resize: vertical; }
.task-form-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
.calendar-error, .overdue { color: #dc5d5d; } .calendar-error { padding: 0 24px 12px; }
a { color: var(--color-primary, #478ddc); font-size: 12px; }
@media (max-width: 700px) { .calendar-overlay { padding: 6px; } .calendar-content { grid-template-columns: 1fr; padding: 0 14px 14px; } .calendar-toolbar, header { padding: 14px; } .calendar-day { min-height: 44px; } .task-form { grid-template-columns: 1fr; padding: 14px; } }
</style>
