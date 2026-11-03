import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createPinia, setActivePinia, disposePinia } from 'pinia';
let server, useBusinessStore, businessApi, pinia;
const tick = () => new Promise(resolve => setImmediate(resolve));
before(async () => {
  const storage = new Map();
  globalThis.window = { location: { hostname: 'localhost', origin: 'http://localhost:5173' }, dispatchEvent() {}, focus() {} };
  globalThis.document = { visibilityState: 'visible' };
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) };
  server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  ({ useBusinessStore } = await server.ssrLoadModule('/src/stores/businessStore.js'));
  ({ businessApi } = await server.ssrLoadModule('/src/services/businessApi.js'));
});
after(async () => { if (pinia) disposePinia(pinia); await server?.close(); for (const key of ['window', 'document', 'localStorage', 'Notification']) delete globalThis[key]; });
function fixture() {
  if (pinia) disposePinia(pinia); pinia = createPinia(); setActivePinia(pinia);
  const store = useBusinessStore(), requests = [];
  businessApi.defaults.adapter = config => new Promise(resolve => requests.push({ config, resolve: data => resolve({ data, status: 200 }) }));
  return { store, requests };
}
test('a workspace switch discards late calendar and company responses', async () => {
  const { store, requests } = fixture();
  const old = store.refresh(); await tick(); store.start('other-workspace');
  requests.find(item => item.config.url === '/status').resolve({ connections: [{ companyId: 'private-company' }] });
  requests.find(item => item.config.url === '/tasks').resolve({ tasks: [{ _id: 'private-task' }], truncated: false });
  await old; assert.deepEqual(store.tasks, []); assert.equal(store.status, null); store.stop();
});
test('notifications require user opt-in, are deduplicated and keep different workspaces separate', async () => {
  const sent = [];
  globalThis.Notification = class {
    static permission = 'granted';
    static requestPermission = async () => 'granted';
    constructor(title, options) { sent.push({ title, ...options }); }
  };
  const { store } = fixture();
  businessApi.defaults.adapter = async config => ({ status: 200, data: config.url === '/status' ? { connections: [] } : { tasks: [{ _id: 'task', title: 'Задолженность', status: 'open', source: 'kgd', evidence: { hasDebt: true, totalArrear: '100' } }] } });
  store.start('workspace-one'); await store.refresh(); assert.equal(sent.length, 0);
  await store.toggleNotifications(); assert.equal(sent.length, 1);
  await store.refresh(); assert.equal(sent.length, 1);
  store.start('workspace-two'); await store.refresh(); assert.equal(store.notificationsEnabled, false); assert.equal(sent.length, 1);
  store.start('workspace-one'); await store.refresh(); assert.equal(store.notificationsEnabled, true); assert.equal(sent.length, 1);
  store.stop();
});
