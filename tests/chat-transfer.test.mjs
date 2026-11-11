import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_TRANSFER_TYPE, beginChatDrag, takeChatDrag, taskReference, taskReferenceText, chatTransferScope } from '../src/utils/chatTransfer.js';
const user = { _id: 'actor', currentWorkspaceId: 'aaaaaaaaaaaaaaaaaaaaaaaa' };
const scope = chatTransferScope(user);
function drag(options = {}) {
  const values = new Map();
  const event = { dataTransfer: { setData: (key, value) => values.set(key, value) }, preventDefault() { this.cancelled = true; } };
  beginChatDrag(event, { source: 'team', scope, getScope: () => scope, kind: 'file', read: () => 'bytes', ...options });
  return { event, token: values.get(CHAT_TRANSFER_TYPE), values };
}
test('file transfer resolves a same-session source once, without fetching external drag data', () => {
  const { token, values } = drag();
  assert.equal(values.size, 1);
  const item = takeChatDrag(token, { source: 'codex', scope });
  assert.equal(item.read(), 'bytes');
  assert.throws(() => takeChatDrag(token, { source: 'codex', scope }), /заново/);
  assert.throws(() => takeChatDrag('https://other.example/file', { source: 'codex', scope }), /заново/);
});
test('scope changes, forged tokens, expiration and cancelled source sessions cannot supply files', () => {
  for (const targetScope of ['', chatTransferScope({ ...user, _id: 'other' }), chatTransferScope({ ...user, currentWorkspaceId: 'bbbbbbbbbbbbbbbbbbbbbbbb' })]) {
    const { token } = drag();
    assert.throws(() => takeChatDrag(token, { source: 'codex', scope: targetScope }), /Сеанс/);
  }
  const { token } = drag({ getScope: () => '' });
  assert.throws(() => takeChatDrag(token, { source: 'codex', scope }), /Сеанс/);
  const expired = drag(), now = Date.now;
  try { Date.now = () => now() + 120001; assert.throws(() => takeChatDrag(expired.token, { source: 'codex', scope }), /Сеанс/); }
  finally { Date.now = now; }
  assert.equal(takeChatDrag(drag().token, { source: 'team', scope }), null);
});
test('task references retain the original route and IDs rather than a stale description snapshot', () => {
  const task = { _id: '22222222-2222-4222-8222-222222222222', description: 'Подготовить договор' };
  const ref = taskReference(task, user.currentWorkspaceId, 'https://index12.com');
  const url = new URL(ref.url);
  assert.equal(url.searchParams.get('task'), task._id);
  assert.equal(url.searchParams.get('teamChat'), user.currentWorkspaceId);
  assert.equal(url.pathname, '/');
  const { values, token } = drag({ kind: 'task', task: ref });
  assert.equal(values.get('text/uri-list'), ref.url);
  assert.deepEqual(takeChatDrag(token, { source: 'codex', scope }).task, ref);
  const message = taskReferenceText([ref]);
  assert.ok(message.includes(ref.url));
  assert.equal(new URL(message.trim().split('\n').at(-1)).searchParams.get('task'), task._id);
  assert.ok(!message.includes(task.description));
  const processing = taskReferenceText([ref], { readTasks: true });
  assert.ok(processing.startsWith('Разберись с прикреплёнными задачами:'));
  assert.ok(processing.includes('«Выставить счёт:»'));
  assert.ok(processing.includes('Остальные задачи рассматривай как обычные'));
  assert.ok(processing.includes('Изображения и видео без моей явной команды или согласия на просмотр не открывай'));
  assert.ok(processing.includes('сначала спроси разрешение их прочитать'));
  assert.equal(processing.trim().split('\n').at(-1), ref.url);
  assert.ok(!processing.includes(task.description));
  assert.ok(!message.includes('Оформи счета'));
  assert.equal(taskReferenceText([], { readTasks: true }), '');
  assert.equal(taskReferenceText([]), '');
  assert.throws(() => taskReference({ ...task, _id: 'invalid' }, user.currentWorkspaceId, url.origin));
  assert.throws(() => taskReference(task, 'invalid', url.origin));
});
