import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createPinia, setActivePinia, disposePinia } from 'pinia';
let server, useBusinessStore, businessApi, pinia;
const tick = () => new Promise(resolve => setImmediate(resolve));
before(async () => {
  const storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), { location: { hostname: 'localhost', origin: 'http://localhost:5173' }, focus() {} });
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) };
  server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  ({ useBusinessStore } = await server.ssrLoadModule('/src/stores/businessStore.js'));
  ({ businessApi } = await server.ssrLoadModule('/src/services/businessApi.js'));
});
after(async () => { if (pinia) disposePinia(pinia); await server?.close(); for (const key of ['window', 'document', 'localStorage', 'Notification', 'navigator']) delete globalThis[key]; });
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
test('push requires explicit opt-in and keeps subscription preferences separate by workspace', async () => {
  const sent = [], subscription = { endpoint: 'https://fcm.googleapis.com/test', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/test', keys: {} }) };
  globalThis.Notification = class { static requestPermission = async () => 'granted'; };
  window.PushManager = class {};
  const registration = { pushManager: { getSubscription: async () => subscription } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { addEventListener() {}, register: async () => registration, ready: Promise.resolve(registration) } } });
  const { store } = fixture();
  businessApi.defaults.adapter = async config => { sent.push(config); return { status: 200, data: config.url === '/reminders/key' ? { configured: true, publicKey: 'YQ' } : config.url === '/status' ? { connections: [] } : { tasks: [] } }; };
  store.start('actor:workspace-one'); await store.refresh(); assert.equal(sent.some(row => row.url === '/reminders/subscriptions'), false);
  await store.toggleNotifications(); assert.equal(store.notificationsEnabled, true); assert.equal(sent.filter(row => row.method === 'post' && row.url === '/reminders/subscriptions').length, 1);
  store.start('actor:workspace-two'); assert.equal(store.notificationsEnabled, false);
  store.start('actor:workspace-one'); assert.equal(store.notificationsEnabled, true);
  await store.toggleNotifications(); assert.equal(store.notificationsEnabled, false); assert.equal(sent.filter(row => row.method === 'delete').length, 1); store.stop();
});
test('calendar updates send the displayed version and never retry a conflict with a newer version', async () => {
  const { store } = fixture(), sent = [];
  businessApi.defaults.adapter = async config => { sent.push(config); throw Object.assign(new Error('conflict'), { response: { status: 409 } }); };
  await assert.rejects(store.saveTask({ title: 'Правка' }, 'task', 4));
  assert.equal(sent.length, 1); assert.equal(JSON.parse(sent[0].data).expectedVersion, 4); store.stop();
});

const settleSignals = () => new Promise(resolve => setTimeout(resolve, 130));
function signal(workspaceId) { const event = new Event('index12:calendar-changed'); event.detail = { workspaceId }; window.dispatchEvent(event); }
test('remote signals coalesce, fetch only tasks and recover an event received during a fetch', async () => {
  const { store, requests } = fixture(); store.start('actor:workspace');
  signal('elsewhere'); await settleSignals(); assert.equal(requests.length, 0);
  signal('workspace'); signal('workspace'); await settleSignals(); assert.equal(requests.length, 1); assert.equal(requests[0].config.url, '/tasks');
  signal('workspace'); requests[0].resolve({ tasks: [{ _id: 'task', version: 1 }], truncated: false });
  await settleSignals(); assert.equal(requests.length, 2);
  requests[1].resolve({ tasks: [{ _id: 'task', version: 2, description: 'Remote' }], truncated: false }); await tick();
  assert.equal(store.tasks[0].version, 2); assert.equal(store.tasks[0].description, 'Remote'); store.stop();
});
test('mobile wake, online and focus recover silently missed changes and stop removes listeners', async () => {
  const { store, requests } = fixture(); store.start('actor:workspace');
  document.visibilityState = 'hidden'; signal('workspace'); await settleSignals(); assert.equal(requests.length, 0);
  document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus'));
  await settleSignals(); assert.equal(requests.length, 1);
  requests[0].resolve({ tasks: [], truncated: false }); await tick(); store.stop();
  window.dispatchEvent(new Event('focus')); signal('workspace'); await settleSignals(); assert.equal(requests.length, 1);
});
test('a late old-workspace live fetch cannot replace the new calendar', async () => {
  const { store, requests } = fixture(); store.start('actor:old'); signal('old'); await settleSignals();
  store.start('actor:new'); signal('new'); await settleSignals();
  requests[1].resolve({ tasks: [{ _id: 'new-task' }], truncated: false }); await tick();
  requests[0].resolve({ tasks: [{ _id: 'private-old-task' }], truncated: false }); await tick();
  assert.equal(store.tasks[0]._id, 'new-task'); store.stop();
});
test('a delayed local acknowledgement never replaces a newer remote task', async () => {
  const { store, requests } = fixture(); store.start('actor:workspace');
  const save = store.saveTask({ description: 'Local' }, 'task', 0); await tick();
  signal('workspace'); await settleSignals(); requests[1].resolve({ tasks: [{ _id: 'task', version: 2, description: 'Remote' }], truncated: false }); await tick();
  requests[0].resolve({ task: { _id: 'task', version: 1, description: 'Local' } }); await save;
  assert.equal(store.tasks[0].description, 'Remote'); store.stop();
});
