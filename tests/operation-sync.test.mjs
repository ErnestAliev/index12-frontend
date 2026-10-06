import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createPinia, setActivePinia, disposePinia } from 'pinia';
import axios from 'axios';

let server;
let useMainStore;
let pinia;
const originalAdapter = axios.defaults.adapter;

before(async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  ({ useMainStore } = await server.ssrLoadModule('/src/stores/mainStore.js'));
});

after(async () => {
  if (pinia) disposePinia(pinia);
  axios.defaults.adapter = originalAdapter;
  await server?.close();
  delete globalThis.localStorage;
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve: data => resolve({ data, status: 200 }), reject };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  if (pinia) disposePinia(pinia);
  pinia = createPinia();
  setActivePinia(pinia);
  const store = useMainStore();
  store.user = { role: 'admin' };
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const dateKey = store._getDateKey(date);
  const op = { _id: 'operation', date, dateKey, cellIndex: 0, type: 'expense', amount: -100, syncVersion: 0 };
  store.displayCache = { [dateKey]: [{ ...op }] };
  store.calculationCache = { [dateKey]: [{ ...op }] };
  const requests = [];
  axios.defaults.adapter = config => {
    const response = deferred();
    requests.push({ ...config, response });
    return response.promise;
  };
  return { store, op, dateKey, requests };
}

test('delete removes the chip immediately and sends only DELETE', async () => {
  const { store, op, dateKey, requests } = fixture();
  const saving = store.deleteOperation(op);
  const immediate = store.getOperationsForDay(dateKey);
  await tick();
  // Release any legacy preliminary GET so the failing baseline test can finish.
  if (requests[0]?.method === 'get') { requests[0].response.resolve(op); await tick(); }
  const deletion = requests.find(request => request.method === 'delete');
  deletion?.response.resolve(op);
  await tick();
  for (const request of requests.filter(request => request.method === 'get')) request.response.resolve({});
  await saving;
  assert.equal(immediate.length, 0);
  assert.deepEqual(requests.map(request => request.method), ['delete']);
});

test('a stale day response cannot resurrect a chip during DELETE', async () => {
  const { store, op, dateKey, requests } = fixture();
  const fetching = store.refreshDay(dateKey);
  const saving = store.deleteOperation(op);
  await tick();
  const preliminary = requests.find(request => request.url.endsWith(`/events/${op._id}`) && request.method === 'get');
  if (preliminary) { preliminary.response.resolve(op); await tick(); }
  requests[0].response.resolve([op]);
  await fetching;
  const chips = store.getOperationsForDay(dateKey);
  requests.find(request => request.method === 'delete').response.resolve(op);
  await tick();
  for (const request of requests.filter(request => request.url.endsWith('/snapshot'))) request.response.resolve({});
  await saving;
  assert.equal(chips.length, 0);
});

test('day reloads and socket echoes cannot overwrite a pending edit', async () => {
  const { store, op, dateKey, requests } = fixture();
  const saving = store.updateOperation(op._id, { amount: -250 });
  const immediate = store.getOperationsForDay(dateKey)[0].amount;
  const fetching = store.refreshDay(dateKey);
  await tick();
  requests.find(request => request.method === 'get').response.resolve([op]);
  await fetching;
  store.onSocketOperationUpdated({ ...op });
  const pending = store.getOperationsForDay(dateKey)[0].amount;
  requests.find(request => request.method === 'put').response.resolve({ ...op, amount: -250, syncVersion: 1 });
  await saving;
  assert.equal(immediate, -250);
  assert.equal(pending, -250);
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, -250);
});

test('a read started during a move cannot undo it after HTTP acknowledgement', async () => {
  const { store, op, dateKey, requests } = fixture();
  const saving = store.moveOperation(op, dateKey, dateKey, 4);
  const fetching = store.refreshDay(dateKey);
  await tick();
  requests.find(request => request.method === 'put').response.resolve({ ...op, cellIndex: 4, syncVersion: 1 });
  await saving;
  requests.find(request => request.method === 'get').response.resolve([op]);
  await fetching;
  assert.equal(store.getOperationsForDay(dateKey)[0].cellIndex, 4);
});

test('old socket messages cannot undo a confirmed edit or recreate a deleted chip', async () => {
  const { store, op, dateKey, requests } = fixture();
  const saving = store.updateOperation(op._id, { amount: -250 });
  await tick();
  requests[0].response.resolve({ ...op, amount: -250, syncVersion: 2 });
  await saving;
  store.onSocketOperationUpdated({ ...op, syncVersion: 1 });
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, -250);
  store.onSocketOperationDeleted(op._id);
  await store.onSocketOperationAdded({ ...op, syncVersion: 1 });
  assert.equal(store.getOperationsForDay(dateKey).length, 0);
});

test('an edit failure restores the confirmed chip and reports the error', async () => {
  const { store, op, dateKey, requests } = fixture();
  const saving = store.updateOperation(op._id, { amount: -250 });
  const rejection = assert.rejects(saving, /Denied/);
  await tick();
  requests[0].response.reject(new Error('Denied'));
  await rejection;
  const restored = store.getOperationsForDay(dateKey)[0]?.amount;
  for (const request of requests.filter(request => request.method === 'get')) request.response.resolve(request.url.endsWith('/snapshot') ? {} : [op]);
  await tick();
  assert.equal(restored, -100);
});
