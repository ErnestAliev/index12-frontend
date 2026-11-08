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
const tasks = [
  { _id: '11111111-1111-4111-8111-111111111111', description: 'Моя задача', assigneeIds: ['owner:actor'], dueDate: day, dueTime: null },
  { _id: '22222222-2222-4222-8222-222222222222', description: 'Задача Валентины', assigneeIds: ['employee'], dueDate: day, dueTime: '18:05' },
  { _id: '33333333-3333-4333-8333-333333333333', description: 'Без срока', assigneeIds: ['employee'], dueDate: null, dueTime: null },
].map(task => ({ ...task, workspaceId: 'workspace', timing: task.dueDate ? 'deadline' : 'none', status: 'open', creatorId: 'owner:actor', creatorName: 'Эрнест', version: 0, attachments: [], assignees: task.assigneeIds.map(id => ({ actorId: id, name: people.find(p => p._id === id).name })), createdAt: new Date().toISOString() }));
const projected = () => tasks.map(task => ({ ...task, _id: 'chat:' + task._id, source: 'team-chat', sourceTaskId: task._id, title: task.description, startsAt: null, endsAt: null }));
const snapshot = () => ({ tasks, people, messages: [], members: [], hasMore: false });
teamApi.defaults.adapter = async config => {
  if (config.url === '/state') return { status: 200, data: snapshot() };
  if (config.url === '/messages') return { status: 200, data: { messages: [], hasMore: false } };
  if (config.url.startsWith('/tasks/') && config.method === 'get') return { status: 200, data: { task: tasks.find(t => t._id === config.url.split('/').at(-1)) } };
  if (config.url.startsWith('/tasks/') && config.method === 'patch') {
    const task = tasks.find(t => t._id === config.url.split('/').at(-1));
    Object.assign(task, JSON.parse(config.data)); task.version++;
    return { status: 200, data: { task } };
  }
  return { status: 200, data: {} };
};
businessApi.defaults.adapter = async config => {
  if (config.url === '/status') return { status: 200, data: { actorId: 'actor' } };
  if (config.url === '/tasks') return { status: 200, data: { tasks: projected(), people } };
  if (config.url.startsWith('/tasks/')) return { status: 200, data: { task: projected().find(t => t._id === config.url.slice(7)) } };
  return { status: 200, data: {} };
};
const pinia = createPinia(), chat = useTeamChatStore(pinia), business = useBusinessStore(pinia);
chat.me = { actorId: 'owner:actor', workspaceId: 'workspace', displayName: 'Эрнест', name: 'INDEX12', role: 'manager', status: 'active', owner: true, roles: {} };
chat.state = snapshot(); chat.creatingTask = true;
const app = createApp({ render: () => view.value === 'calendar'
  ? h(Calendar, { onClose: () => { view.value = 'chat'; } })
  : h(Frame, { open: true, mobile: true, hideHeading: chat.creatingTask || !!chat.requestedTaskId, headingOwnsClose: true }, { heading: () => h(Header), default: () => h(Pane, { mobile: true }) }) });
app.use(pinia); app.mount('#app');
window.taskCalendar = { chat, business, tasks, people, showCalendar: () => { view.value = 'calendar'; }, showTasks: () => { view.value = 'chat'; chat.creatingTask = false; chat.requestedTaskId = null; chat.tab = 'tasks'; } };
