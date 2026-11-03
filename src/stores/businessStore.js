import { defineStore } from 'pinia';
import { ref } from 'vue';
import { businessApi, businessError } from '@/services/businessApi';
export const useBusinessStore = defineStore('business', () => {
  const tasks = ref([]), status = ref(null), error = ref(''), truncated = ref(false), notificationsEnabled = ref(false), requestedTask = ref(null);
  let notificationScope = '', interval, initial, generation = 0, request = 0, range = null;
  async function refresh() {
    const current = generation, ticket = ++request;
    try {
      const [state, list] = await Promise.all([businessApi.get('/status'), businessApi.get('/tasks', { params: range || {} })]);
      if (current !== generation || ticket !== request) return;
      status.value = state.data; tasks.value = list.data.tasks; truncated.value = list.data.truncated; error.value = '';
    } catch (e) { if (current === generation && ticket === request) error.value = businessError(e); }
  }
  function stop() {
    clearInterval(interval); clearTimeout(initial); ++generation; ++request;
    tasks.value = []; status.value = null; error.value = ''; truncated.value = false; range = null;
    notificationScope = ''; delete businessApi.defaults.headers.common['x-index12-workspace-id']; notificationsEnabled.value = false; requestedTask.value = null;
  }
  function start(scope) {
    stop(); notificationScope = scope;
    if (scope.split(':')[1]) businessApi.defaults.headers.common['x-index12-workspace-id'] = scope.split(':')[1];
    try { notificationsEnabled.value = localStorage.getItem(`index12-calendar-push:${scope}`) === 'enabled'; } catch { /* Storage unavailable. */ }
    initial = setTimeout(() => { void sync(); interval = setInterval(() => { if (document.visibilityState === 'visible') void sync(); }, 60000); interval?.unref?.(); }, 1500); initial?.unref?.();
  }
  async function setRange(from, to) { range = { from, to }; await refresh(); }
  async function toggleNotifications() {
    const current = generation;
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') throw new Error('Браузер не поддерживает push-уведомления');
      if (!notificationsEnabled.value && await Notification.requestPermission() !== 'granted') throw new Error('Разрешите уведомления в настройках браузера');
      if (current !== generation) return;
      const registration = await navigator.serviceWorker.register('/calendar-sw.js');
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (notificationsEnabled.value) {
        if (subscription) await businessApi.delete('/reminders/subscriptions', { data: { endpoint: subscription.endpoint } });
        // A browser subscription can also serve another workspace; keep it until that workspace opts out.
        if (current !== generation) return;
        notificationsEnabled.value = false;
      } else {
        const { data } = await businessApi.get('/reminders/key');
        if (!data.configured) throw new Error('На сервере не настроены уведомления календаря');
        if (current !== generation) return;
        const key = data.publicKey.replace(/-/g, '+').replace(/_/g, '/');
        subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(key + '='.repeat((4 - key.length % 4) % 4)), c => c.charCodeAt(0)) });
        await businessApi.post('/reminders/subscriptions', subscription.toJSON());
        if (current !== generation) return;
        notificationsEnabled.value = true;
      }
      localStorage.setItem(`index12-calendar-push:${notificationScope}`, notificationsEnabled.value ? 'enabled' : 'disabled'); error.value = '';
    } catch (e) { if (current === generation) error.value = e.response ? businessError(e) : e.message; }
  }
  async function sync() { const current = generation; try { await businessApi.post('/sync'); } catch (e) { if (current === generation) error.value = businessError(e); } if (current === generation) await refresh(); }
  async function saveTask(data, id, expectedVersion) {
    const current = generation;
    const response = id ? await businessApi.patch(`/tasks/${id}`, { changes: data, expectedVersion }) : await businessApi.post('/tasks', data);
    if (current !== generation) throw new Error('Рабочая область изменилась');
    ++request; const task = response.data.task; tasks.value = [...tasks.value.filter(t => t._id !== task._id), task]; return task;
  }
  async function deleteTask(id, expectedVersion) {
    const current = generation; await businessApi.delete(`/tasks/${id}`, { data: { expectedVersion } });
    if (current === generation) { ++request; tasks.value = tasks.value.filter(t => t._id !== id); }
  }
  function openNotification(data) {
    const workspaceId = notificationScope.split(':')[1];
    if (data.workspaceId && workspaceId && data.workspaceId !== workspaceId) { error.value = 'Задача находится в другой рабочей области'; window.dispatchEvent(new Event('index12:open-calendar')); return; }
    requestedTask.value = data.taskId; window.dispatchEvent(new Event('index12:open-calendar'));
  }
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', event => { if (event.data?.type === 'index12:open-calendar') openNotification(event.data); });
  return { tasks, status, error, truncated, notificationsEnabled, requestedTask, toggleNotifications, refresh, setRange, start, stop, sync, saveTask, deleteTask, openNotification };
});
