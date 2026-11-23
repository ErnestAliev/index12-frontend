import '/src/assets/main.css';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { useTeamChatStore, teamApi } from '/src/stores/teamChatStore.js';
import Frame from '/src/components/ChatWindowFrame.vue';
import Conversation from '/src/components/TeamChatConversation.vue';
import TaskPanel from '/src/components/TeamTaskPanel.vue';

const pinia = createPinia(), chat = useTeamChatStore(pinia);
const inTask = new URLSearchParams(location.search).has('task');
const original = { fileId: '11111111-1111-4111-8111-111111111111', name: 'Договор.pdf', mimeType: 'application/pdf', size: 200 };
const task = {
  _id: '22222222-2222-4222-8222-222222222222', description: 'Подписать договор',
  creatorId: 'owner:fixture', creatorName: 'Эрнест', assigneeIds: ['owner:fixture'],
  assignees: [{ actorId: 'owner:fixture', name: 'Эрнест' }], attachments: [original],
  status: 'open', timing: 'none', createdAt: '2026-11-23T10:00:00Z', version: 1,
};
const message = { _id: '33333333-3333-4333-8333-333333333333', text: 'На подпись', attachments: [original], authorId: 'owner:fixture', authorName: 'Эрнест', createdAt: task.createdAt };
chat.me = { actorId: 'owner:fixture', workspaceId: 'pdf-workspace', owner: true, status: 'active', displayName: 'Эрнест', roles: {} };
chat.state = { messages: [message], tasks: [task], people: [{ _id: 'owner:fixture', name: 'Эрнест' }], members: [], hasMore: false };
chat.historyReady = true;
chat.threads[task._id] = { messages: [], ready: true, hasMore: false };
const uploads = [], sent = [];
const uploaded = new Map();
const fixture = { chat, original, task, uploads, sent, failUpload: false, holdUpload: false };
teamApi.defaults.adapter = async config => {
  let data = {};
  if (config.method === 'get' && config.url === '/files/' + original.fileId) {
    data = new Blob(['%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'], { type: 'application/pdf' });
  }
  if (config.method === 'post' && config.url === '/files') {
    if (fixture.holdUpload) await new Promise(resolve => { fixture.releaseUpload = resolve; });
    if (fixture.failUpload) throw Error('Не удалось загрузить PDF. Попробуйте ещё раз.');
    const name = decodeURIComponent(config.headers['x-file-name']);
    const bytes = await config.data.text();
    const file = { fileId: crypto.randomUUID(), name, mimeType: 'application/pdf', size: config.data.size };
    uploads.push({ ...file, bytes }); uploaded.set(file.fileId, file);
    data = { file };
  }
  if (config.method === 'post' && config.url === '/messages') {
    const body = JSON.parse(config.data);
    sent.push(body);
    data = { message: { _id: body.id, text: body.text, taskId: body.taskId, attachments: body.fileIds.map(id => uploaded.get(id)), authorId: chat.me.actorId, createdAt: new Date().toISOString() } };
  }
  if (config.method === 'get' && config.url === '/messages') data = { messages: [], hasMore: false };
  if (config.url === '/task-options') data = { projects: [], parties: [] };
  return { status: 200, data };
};
window.pdfFixture = fixture;
createApp({ render: () => h(Frame, { open: true, mobile: innerWidth < 1024, title: 'Рабочий чат' }, () =>
  inTask ? h(TaskPanel, { taskId: task._id, mobile: innerWidth < 1024 }) : h(Conversation, { mobile: innerWidth < 1024 }),
) }).use(pinia).mount('#app');
