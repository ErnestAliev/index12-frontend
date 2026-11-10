// Only same-page, same-session drags can resolve these opaque tokens. Never fetch
// a URL supplied by DataTransfer: files are read by the source's scoped transport.
export const CHAT_TRANSFER_TYPE = 'application/x-index12-chat-transfer';
const entries = new Map();
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export function chatTransferScope(user) {
  const actor = user?._id || user?.id, workspace = user?.currentWorkspaceId;
  return actor && workspace ? JSON.stringify([String(actor), String(workspace)]) : '';
}
export function taskReference(task, workspaceId, origin = window.location.origin) {
  if (!uuid.test(task?._id || '') || !/^[a-f\d]{24}$/i.test(workspaceId || ''))
    throw Error('Не удалось определить исходную задачу');
  const url = new URL('/', origin);
  url.searchParams.set('teamChat', workspaceId);
  url.searchParams.set('task', task._id);
  return { id: task._id, workspaceId, url: url.href, title: task.description.slice(0, 120) };
}
export function taskReferenceText(refs) {
  if (!refs.length) return '';
  return '\n\nЗадачи рабочего чата (ссылки на оригиналы):\n' + refs.map(ref => ref.url).join('\n');
}
export function beginChatDrag(event, { source, scope, getScope, kind, read, task }) {
  if (!event.dataTransfer || !scope) { event.preventDefault(); return; }
  entries.clear();
  const token = crypto.randomUUID();
  entries.set(token, { source, scope, getScope, kind, read, task, expires: Date.now() + 120000 });
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(CHAT_TRANSFER_TYPE, token);
  if (kind === 'task') {
    event.dataTransfer.setData('text/uri-list', task.url);
    event.dataTransfer.setData('text/plain', task.url);
  }
}
export function takeChatDrag(token, { source, scope }) {
  const item = entries.get(token);
  entries.delete(token);
  if (!item || item.expires < Date.now() || !scope || item.scope !== scope || item.getScope() !== scope)
    throw Error('Сеанс изменился. Перетащите файл или задачу заново.');
  if (item.source === source) return null;
  return item;
}
