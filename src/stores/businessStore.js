import { defineStore } from 'pinia';
import { ref } from 'vue';
import { businessApi, businessError } from '@/services/businessApi';
export const useBusinessStore = defineStore('business', () => {
  const tasks = ref([]), people = ref([]), status = ref(null), error = ref(''), truncated = ref(false), notificationsEnabled = ref(false), requestedTask = ref(null);
  let notificationScope = '', interval, initial, recovery, generation = 0, request = 0, range = null, live = null;
  const calendarVisible = ref(false);
  const visible = () => typeof document !== 'undefined' && document.visibilityState !== 'hidden';
  function invalidate(event) {
    const workspaceId = event?.detail?.workspaceId;
    if (workspaceId && workspaceId !== notificationScope.split(':')[1]) return;
    const state = live; if (!state) return;
    state.dirty = true;
    if (!visible() || state.timer || state.running) return;
    state.timer = setTimeout(async () => {
      state.timer = null; if (state !== live || !visible()) return;
      state.dirty = false; state.running = true;
      try { await refresh({ tasksOnly: true }); } finally {
        state.running = false;
        if (state === live && state.dirty) invalidate();
      }
    }, 80);
    state.timer?.unref?.();
  }
  const resume = () => { if (visible()) invalidate(); };
  function setCalendarVisible(value) { calendarVisible.value = value; if (value) invalidate(); }
  async function refresh({ tasksOnly = false } = {}) {
    const current = generation, ticket = ++request;
    try {
      const [state, list] = await Promise.all([tasksOnly ? null : businessApi.get('/status'), businessApi.get('/tasks', { params: range || {} })]);
      if (current !== generation || ticket !== request) return;
      if (state) status.value = state.data; tasks.value = list.data.tasks; people.value = list.data.people || []; truncated.value = list.data.truncated; error.value = '';
    } catch (e) { if (current === generation && ticket === request) error.value = businessError(e); }
  }
  function stop() {
    clearInterval(interval); clearInterval(recovery); clearTimeout(initial); clearTimeout(live?.timer); live = null; ++generation; ++request;
    window.removeEventListener?.('index12:calendar-changed', invalidate);
    for (const name of ['focus', 'pageshow', 'online']) window.removeEventListener?.(name, resume);
    document.removeEventListener?.('visibilitychange', resume);
    tasks.value = []; people.value = []; status.value = null; error.value = ''; truncated.value = false; range = null;
    notificationScope = ''; delete businessApi.defaults.headers.common['x-index12-workspace-id']; notificationsEnabled.value = false; requestedTask.value = null;
  }
  function start(scope) {
    stop(); notificationScope = scope; live = { timer: null, running: false, dirty: false };
    window.addEventListener?.('index12:calendar-changed', invalidate);
    for (const name of ['focus', 'pageshow', 'online']) window.addEventListener?.(name, resume);
    document.addEventListener?.('visibilitychange', resume);
    // A missed socket packet or a suspended mobile connection must heal without a reload.
    recovery = setInterval(() => { if (calendarVisible.value && visible()) invalidate(); }, 15000); recovery?.unref?.();
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
  async function prepareChat(workspaceId) {
    const current = generation, selectedWorkspace = notificationScope.split(':')[1];
    const { useTeamChatStore } = await import('./teamChatStore');
    const chat = useTeamChatStore();
    const workspace = workspaceId || selectedWorkspace || chat.me?.workspaceId;
    if (!workspace || (selectedWorkspace && workspace !== selectedWorkspace)) throw new Error('Рабочая область изменилась');
    if (chat.me?.workspaceId !== workspace) await chat.start(workspace);
    if (current !== generation || chat.me?.workspaceId !== workspace || chat.me?.status !== 'active') throw new Error('Чат недоступен в этой рабочей области');
    return chat;
  }
  function acceptTask(task) {
    ++request;
    const existing = tasks.value.find(t => t._id === task._id);
    if (!existing || (existing.version || 0) <= (task.version || 0)) tasks.value = [...tasks.value.filter(t => t._id !== task._id), task];
    invalidate(); return task;
  }
  async function saveTask(data, id, expectedVersion) {
    const current = generation;
    if (id?.startsWith('chat:')) {
      const chat = await prepareChat(tasks.value.find(t => t._id === id)?.workspaceId);
      const response = await chat.action(`/tasks/${id.slice(5)}`, { ...data, expectedVersion }, 'patch');
      if (current !== generation) throw new Error('Рабочая область изменилась');
      return acceptTask(response.calendarTask);
    }
    const response = id ? await businessApi.patch(`/tasks/${id}`, { changes: data, expectedVersion }) : await businessApi.post('/tasks', data);
    if (current !== generation) throw new Error('Рабочая область изменилась');
    return acceptTask(response.data.task);
  }
  async function deleteTask(id, expectedVersion) {
    const current = generation;
    if (id.startsWith('chat:')) {
      const chat = await prepareChat(tasks.value.find(t => t._id === id)?.workspaceId);
      await chat.action(`/tasks/${id.slice(5)}`, { expectedVersion }, 'delete');
    } else await businessApi.delete(`/tasks/${id}`, { data: { expectedVersion } });
    if (current === generation) { ++request; tasks.value = tasks.value.filter(t => t._id !== id); invalidate(); }
  }
  async function deletedTasks() {
    const current = generation, { data } = await businessApi.get('/tasks/deleted');
    if (current !== generation) throw new Error('Рабочая область изменилась');
    return data;
  }
  async function restoreTask(task) {
    const current = generation;
    let response;
    if (task.source === 'team-chat') {
      const chat = await prepareChat(task.workspaceId);
      const data = await chat.action(`/tasks/${task.sourceTaskId}/restore`, { expectedVersion: task.version });
      response = { ...data, task: data.calendarTask };
    } else response = (await businessApi.post(`/tasks/${task._id}/restore`, { expectedVersion: task.version })).data;
    if (current !== generation) throw new Error('Рабочая область изменилась');
    acceptTask(response.task); return response;
  }
  function openNotification(data) {
    const workspaceId = notificationScope.split(':')[1];
    if (data.workspaceId && workspaceId && data.workspaceId !== workspaceId) { error.value = 'Задача находится в другой рабочей области'; window.dispatchEvent(new Event('index12:open-calendar')); return; }
    requestedTask.value = data.taskId; window.dispatchEvent(new Event('index12:open-calendar'));
  }
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', event => { if (event.data?.type === 'index12:open-calendar') openNotification(event.data); });
  return { tasks, people, prepareChat, deletedTasks, restoreTask, calendarVisible, setCalendarVisible, status, error, truncated, notificationsEnabled, requestedTask, toggleNotifications, refresh, setRange, start, stop, sync, saveTask, deleteTask, openNotification };
});
