import '/src/assets/main.css';
import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import Frame from '/src/components/ChatWindowFrame.vue';
import Header from '/src/components/TeamChatHeader.vue';
import Pane from '/src/components/TeamChatPane.vue';
import Calendar from '/src/components/BusinessCalendar.vue';
import { useTeamChatStore, teamApi } from '/src/stores/teamChatStore.js';
import { useBusinessStore } from '/src/stores/businessStore.js';
import { businessApi } from '/src/services/businessApi.js';
import { dayAt } from '/src/utils/calendarTime.js';
const people = [
  { _id: 'owner:actor', name: 'Эрнест', role: 'manager' },
  { _id: 'director', name: 'Данияр', role: 'director' },
  { _id: 'employee', name: 'Валентина', role: 'employee' },
];
const day = dayAt(), view = ref('chat');
const manualTasks = [], messages = [];
const tasks = [
  { _id: '11111111-1111-4111-8111-111111111111', description: 'Моя задача', assigneeIds: ['owner:actor'], dueDate: day, dueTime: null },
  { _id: '22222222-2222-4222-8222-222222222222', description: 'Задача Валентины', assigneeIds: ['employee'], dueDate: day, dueTime: '18:05' },
  { _id: '33333333-3333-4333-8333-333333333333', description: 'Без срока', assigneeIds: ['employee'], dueDate: null, dueTime: null },
].map(task => ({ ...task, workspaceId: 'workspace', timing: task.dueDate ? 'deadline' : 'none', status: 'open', creatorId: 'owner:actor', creatorName: 'Эрнест', version: 0, attachments: task._id.startsWith('2222') ? [{ fileId: '99999999-9999-4999-8999-999999999999', name: 'Снимок.png', mimeType: 'image/png', size: 68 }] : [], assignees: task.assigneeIds.map(id => ({ actorId: id, name: people.find(p => p._id === id).name })), createdAt: new Date().toISOString() }));
const project = task => ({ ...task, _id: 'chat:' + task._id, source: 'team-chat', sourceTaskId: task._id, title: task.description, startsAt: null, endsAt: null, status: task.status === 'done' ? 'done' : 'open', chatStatus: task.status });
const projected = () => tasks.filter(task => !task.deletedAt).map(project);
const snapshot = () => ({ tasks: tasks.filter(task => !task.deletedAt), people, messages, members: [], hasMore: false });
teamApi.defaults.adapter = async config => {
  if (config.url.startsWith('/files/')) return { status: 200, data: new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII='), ch => ch.charCodeAt(0))], { type: 'image/png' }) };
  if (config.url === '/state') return { status: 200, data: snapshot() };
  if (config.url === '/tasks' && config.method === 'post') {
    const input = JSON.parse(config.data);
    const task = { ...input, _id: input.id, workspaceId: 'workspace', creatorId: 'owner:actor', creatorName: 'Эрнест', version: 0, createdAt: new Date().toISOString(), attachments: input.attachments || [], assignees: input.assigneeIds.map(id => ({ actorId: id, name: people.find(p => p._id === id).name })) };
    tasks.push(task);
    if (!task.parentTaskId) messages.push({ _id: task._id, taskId: task._id, kind: 'task', authorId: task.creatorId, authorName: task.creatorName, createdAt: task.createdAt, text: '', attachments: [] });
    return { status: 201, data: { task } };
  }
  if (config.url === '/messages') return { status: 200, data: { messages: [], hasMore: false } };
  if (config.url.endsWith('/restore')) {
    const task = tasks.find(t => t._id === config.url.split('/')[2]); delete task.deletedAt; task.version++;
    return { status: 200, data: { task, calendarTask: project(task), restored: true } };
  }
  if (config.url.startsWith('/tasks/') && config.method === 'delete') {
    const task = tasks.find(t => t._id === config.url.split('/').at(-1)); task.deletedAt = new Date().toISOString(); task.version++;
    return { status: 200, data: { deletedTaskId: task._id } };
  }
  if (config.url.startsWith('/tasks/') && config.method === 'get') return { status: 200, data: { task: tasks.find(t => t._id === config.url.split('/').at(-1)) } };
  if (config.url.startsWith('/tasks/') && config.method === 'patch') {
    const task = tasks.find(t => t._id === config.url.split('/').at(-1));
    Object.assign(task, JSON.parse(config.data)); task.version++;
    return { status: 200, data: { task, calendarTask: project(task) } };
  }
  return { status: 200, data: {} };
};
businessApi.defaults.adapter = async config => {
  if (config.url === '/status') return { status: 200, data: { actorId: 'actor' } };
  if (config.url === '/tasks/deleted') return { status: 200, data: { tasks: tasks.filter(t => t.deletedAt).map(project) } };
  if (config.url === '/tasks') return { status: 200, data: { tasks: [...projected(), ...manualTasks], people } };
  if (config.url.startsWith('/tasks/')) return { status: 200, data: { task: [...projected(), ...manualTasks].find(t => t._id === config.url.slice(7)) } };
  return { status: 200, data: {} };
};
const pinia = createPinia(), chat = useTeamChatStore(pinia), business = useBusinessStore(pinia);
chat.me = { actorId: 'owner:actor', workspaceId: 'workspace', displayName: 'Эрнест', name: 'INDEX12', role: 'manager', status: 'active', owner: true, roles: {} };
chat.state = snapshot(); chat.creatingTask = true;
const app = createApp({ render: () => view.value === 'calendar'
  ? h(Calendar, { onClose: () => { view.value = 'chat'; } })
  : h(Frame, { open: true, mobile: true, hideHeading: chat.creatingTask || !!chat.requestedTaskId, headingOwnsClose: true }, { heading: () => h(Header), default: () => h(Pane, { mobile: true }) }) });
app.use(pinia); app.mount('#app');
window.taskCalendar = { teamApi, chat, business, tasks, people, manualTasks, messages, showChat: () => { view.value = 'chat'; chat.creatingTask = false; chat.requestedTaskId = null; chat.tab = 'messages'; chat.state.messages = messages; chat.historyReady = true; }, showCalendar: () => { view.value = 'calendar'; }, showTasks: () => { view.value = 'chat'; chat.creatingTask = false; chat.requestedTaskId = null; chat.tab = 'tasks'; } };
