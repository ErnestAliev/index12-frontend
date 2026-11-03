import { defineStore } from 'pinia';
import { ref } from 'vue';
import { businessApi, businessError } from '@/services/businessApi';

export const useBusinessStore = defineStore('business', () => {
  const tasks = ref([]);
  const status = ref(null);
  const error = ref('');
  const truncated = ref(false);
  const notificationsEnabled = ref(false);
  let notificationScope = '', notified = new Set();
  let interval, initial, generation = 0, refreshing = false;
  function notifyTasks() {
    if (!notificationsEnabled.value || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date());
    let count = 0;
    for (const task of tasks.value) {
      if (count >= 10 || task.status !== 'open' || !((task.dueDate && task.dueDate <= today) || (task.source === 'kgd' && task.evidence?.hasDebt))) continue;
      const key = `${today}:${task._id}:${task.dueDate || task.evidence?.totalArrear || ''}`;
      if (notified.has(key)) continue;
      try {
        const notification = new Notification('INDEX12 · Задача', { body: task.title, tag: `index12-task-${task._id}` });
        notification.onclick = () => { window.focus(); window.dispatchEvent(new Event('index12:open-calendar')); notification.close(); };
        notified.add(key); count++;
        localStorage.setItem(`index12-task-notified:${notificationScope}`, JSON.stringify([...notified].slice(-500)));
      } catch { /* Some mobile browsers only support notifications through an installed PWA. */ }
    }
  }
  async function refresh() {
    if (refreshing) return;
    const current = generation; refreshing = true;
    try {
      const [state, list] = await Promise.all([businessApi.get('/status'), businessApi.get('/tasks')]);
      if (current !== generation) return;
      status.value = state.data; tasks.value = list.data.tasks; truncated.value = list.data.truncated; error.value = '';
      notifyTasks();
    } catch (e) { if (current === generation) error.value = businessError(e); }
    finally { if (current === generation) refreshing = false; }
  }
  function stop() {
    clearInterval(interval); clearTimeout(initial); ++generation; refreshing = false;
    tasks.value = []; status.value = null; error.value = ''; truncated.value = false;
    notificationScope = ''; notificationsEnabled.value = false; notified = new Set();
  }
  function start(scope) {
    stop();
    notificationScope = scope;
    try {
      notificationsEnabled.value = localStorage.getItem(`index12-task-notifications:${scope}`) === 'enabled';
      notified = new Set(JSON.parse(localStorage.getItem(`index12-task-notified:${scope}`) || '[]'));
    } catch { notified = new Set(); }
    initial = setTimeout(() => {
      void sync();
      interval = setInterval(() => { if (document.visibilityState === 'visible') void sync(); }, 60000);
    }, 1500);
  }
  async function toggleNotifications() {
    if (typeof Notification === 'undefined') { error.value = 'Этот браузер не поддерживает уведомления'; return; }
    const current = generation;
    let granted;
    try { granted = notificationsEnabled.value ? false : await Notification.requestPermission() === 'granted'; }
    catch { if (current === generation) error.value = 'Не удалось включить уведомления в этом браузере'; return; }
    if (current !== generation) return;
    notificationsEnabled.value = granted;
    try { localStorage.setItem(`index12-task-notifications:${notificationScope}`, granted ? 'enabled' : 'disabled'); } catch { /* Storage can be disabled. */ }
    if (granted) { error.value = ''; notifyTasks(); }
    else if (Notification.permission === 'denied') error.value = 'Уведомления запрещены в настройках браузера';
  }
  async function sync() {
    const current = generation;
    try { await businessApi.post('/sync'); }
    catch (e) { if (current === generation) error.value = businessError(e); }
    if (current === generation) await refresh();
  }
  async function saveTask(data, id) {
    const current = generation;
    if (id) await businessApi.patch(`/tasks/${id}`, data);
    else await businessApi.post('/tasks', data);
    if (current === generation) await refresh();
  }
  async function deleteTask(id) { const current = generation; await businessApi.delete(`/tasks/${id}`); if (current === generation) await refresh(); }
  return { tasks, status, error, truncated, notificationsEnabled, toggleNotifications, refresh, start, stop, sync, saveTask, deleteTask };
});
