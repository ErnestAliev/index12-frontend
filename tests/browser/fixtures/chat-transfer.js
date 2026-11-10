import '/src/assets/main.css';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { useMainStore } from '/src/stores/mainStore.js';
import { useTeamChatStore } from '/src/stores/teamChatStore.js';
import Frame from '/src/components/ChatWindowFrame.vue';
import Pane from '/src/components/TeamChatPane.vue';
import Assistant from '/src/components/DesktopAssistant.vue';
const pinia = createPinia();
const main = useMainStore(pinia), chat = useTeamChatStore(pinia);
main.user = { _id: 'actor', currentWorkspaceId: 'aaaaaaaaaaaaaaaaaaaaaaaa' };
chat.me = { actorId: 'owner:actor', workspaceId: main.user.currentWorkspaceId, owner: true, status: 'active', displayName: 'Эрнест', roles: {} };
const file = { fileId: '11111111-1111-4111-8111-111111111111', name: 'Договор.txt', mimeType: 'text/plain', size: 12 };
const task = { _id: '22222222-2222-4222-8222-222222222222', description: 'Прочитать договор', version: 1, creatorId: 'owner:actor', assigneeIds: ['owner:actor'], creatorName: 'Эрнест', assignees: [{actorId: 'owner:actor', name: 'Эрнест'}], attachments: [file], timing: 'none', status: 'open', unreadCount: 0 };
const rows = [
  {_id: '33333333-3333-4333-8333-333333333333', kind: 'task', taskId: task._id, text: '', authorId: 'owner:actor', attachments: [], createdAt: new Date().toISOString()},
  {_id: '44444444-4444-4444-8444-444444444444', text: 'Рабочий файл', authorId: 'owner:actor', authorName: 'Эрнест', attachments: [file], createdAt: new Date().toISOString()},
];
chat.state = { messages: rows, tasks: [task], people: [{_id: 'owner:actor', name: 'Эрнест'}], members: [], hasMore: false };
chat.historyReady = true;
window.transferFixture = { main, chat, file, task, rows };
createApp({ render: () => [
  h(Frame, {open: true, side: 'left', title: 'Рабочий', windowId: 'work-transfer', storageKey: 'transfer-left'}, () => h(Pane)),
  h(Frame, {open: true, side: 'right', title: 'Codex', windowId: 'codex-transfer', storageKey: 'transfer-right'}, () => h(Assistant, {apiBaseUrl: '/api'})),
]}).use(pinia).mount('#app');
