import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createPinia, setActivePinia, disposePinia } from 'pinia';
import axios from 'axios';
import { setImmediate } from 'node:timers';

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

test('rapid edits display the newest intent and serialize HTTP writes', async () => {
  const { store, op, dateKey, requests } = fixture();
  const first = store.updateOperation(op._id, { amount: -200 });
  const second = store.updateOperation(op._id, { amount: -300 });
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, -300);
  await tick();
  assert.equal(requests.length, 1);
  requests[0].response.resolve({ ...op, amount: -200, syncVersion: 1 });
  await first;
  await tick();
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, -300);
  assert.equal(JSON.parse(requests[1].data).amount, -300);
  requests[1].response.resolve({ ...op, amount: -300, syncVersion: 2 });
  await second;
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, -300);
});

test('failed older writes do not roll back a newer edit', async () => {
  const { store, op, dateKey, requests } = fixture();
  const first = store.updateOperation(op._id, { amount: -200 });
  const rejected = assert.rejects(first, /Denied/);
  const second = store.updateOperation(op._id, { amount: -300 });
  await tick();
  requests[0].response.reject(new Error('Denied'));
  await rejected;
  await tick();
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, -300);
  requests[1].response.resolve({ ...op, amount: -300, syncVersion: 1 });
  await second;
});

test('a rejected delete restores the chip immediately and surfaces the error', async () => {
  const { store, op, dateKey, requests } = fixture();
  const saving = store.deleteOperation(op);
  const rejected = assert.rejects(saving, /Denied/);
  assert.equal(store.getOperationsForDay(dateKey).length, 0);
  await tick();
  requests[0].response.reject(new Error('Denied'));
  await rejected;
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, -100);
  assert.equal(requests.length, 1);
});

test('duplicate delete attempts send one request', async () => {
  const { store, op, requests } = fixture();
  const first = store.deleteOperation(op);
  const second = store.deleteOperation(op);
  await tick();
  assert.equal(requests.length, 1);
  requests[0].response.resolve(op);
  await Promise.all([first, second]);
});

test('moving into an unloaded day previews immediately and resolves an occupied cell', async () => {
  const { store, op, dateKey, requests } = fixture();
  const tomorrow = new Date(op.date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetKey = store._getDateKey(tomorrow);
  const saving = store.moveOperation(op, dateKey, targetKey, 3, tomorrow);
  assert.equal(store.getOperationsForDay(dateKey).length, 0);
  assert.equal(store.getOperationsForDay(targetKey)[0].cellIndex, 3);
  await tick();
  assert.equal(requests[0].method, 'get');
  requests[0].response.resolve([{ ...op, _id: 'occupant', date: tomorrow, dateKey: targetKey, cellIndex: 3 }]);
  await tick();
  const payload = JSON.parse(requests[1].data);
  assert.equal(payload.cellIndex, 4);
  requests[1].response.resolve({ ...op, ...payload, syncVersion: 1 });
  await saving;
  assert.equal(store.getOperationsForDay(targetKey).find(op => op._id === 'operation').cellIndex, 4);
});

test('a new edit stays ahead of a move waiting for its target day', async () => {
  const { store, op, dateKey, requests } = fixture();
  const tomorrow = new Date(op.date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetKey = store._getDateKey(tomorrow);
  const moving = store.moveOperation(op, dateKey, targetKey, 3, tomorrow);
  const editing = store.updateOperation(op._id, { amount: -300 });
  await tick();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'get');
  requests[0].response.resolve([]);
  await tick();
  requests[1].response.resolve({ ...op, date: tomorrow, dateKey: targetKey, cellIndex: 3, syncVersion: 1 });
  await moving;
  await tick();
  assert.equal(store.getOperationsForDay(targetKey)[0].amount, -300);
  requests[2].response.resolve({ ...op, date: tomorrow, dateKey: targetKey, cellIndex: 3, amount: -300, syncVersion: 2 });
  await editing;
});

test('swapping chips updates both positions without waiting for HTTP', async () => {
  const { store, op, dateKey, requests } = fixture();
  const other = { ...op, _id: 'other', cellIndex: 4 };
  store.displayCache[dateKey].push(other);
  store.calculationCache[dateKey].push(other);
  const saving = store.moveOperation(op, dateKey, dateKey, 4);
  const chips = store.getOperationsForDay(dateKey);
  assert.equal(chips.find(op => op._id === 'operation').cellIndex, 4);
  assert.equal(chips.find(op => op._id === 'other').cellIndex, 0);
  await tick();
  for (const request of requests) request.response.resolve({ ...op, _id: request.url.split('/').at(-1), ...JSON.parse(request.data), syncVersion: 1 });
  await saving;
});

test('a split deletion removes children and ignores their delayed socket messages', async () => {
  const { store, op, dateKey, requests } = fixture();
  op.isSplitParent = true;
  const child = { ...op, _id: 'child', isSplitParent: false, isSplitChild: true, parentOpId: op._id };
  store.displayCache[dateKey] = [op, child];
  store.calculationCache[dateKey] = [op, child];
  const saving = store.deleteOperation(op);
  assert.equal(store.getOperationsForDay(dateKey).length, 0);
  assert.equal(store.currentOps.length, 0);
  await tick();
  await store.onSocketOperationAdded({ ...child, syncVersion: 5 });
  assert.equal(store.currentOps.length, 0);
  requests[0].response.resolve(op);
  await saving;
  store.onSocketOperationUpdated({ ...child, syncVersion: 6 });
  assert.equal(store.currentOps.length, 0);
});

test('newer remote updates win over an earlier HTTP acknowledgement', async () => {
  const { store, op, dateKey, requests } = fixture();
  const saving = store.updateOperation(op._id, { amount: -200 });
  store.onSocketOperationUpdated({ ...op, amount: -400, syncVersion: 3 });
  await tick();
  requests[0].response.resolve({ ...op, amount: -200, syncVersion: 2 });
  await saving;
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, -400);
  store.onSocketOperationUpdated({ ...op, amount: -500, syncVersion: 4 });
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, -500);
});

test('transfer edits update the chip immediately without reloading days', async () => {
  const { store, op, dateKey, requests } = fixture();
  const transfer = { ...op, type: 'transfer', isTransfer: true, amount: 100 };
  store.displayCache[dateKey] = [transfer];
  store.calculationCache[dateKey] = [transfer];
  const saving = store.updateTransfer(op._id, { date: op.date, amount: 250, fromAccountId: 'from', toAccountId: 'to' });
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, 250);
  await tick();
  assert.equal(requests.length, 1);
  requests[0].response.resolve({ ...transfer, amount: 250, syncVersion: 1 });
  await saving;
  assert.deepEqual(requests.map(request => request.method), ['put']);
});

test('legacy transfer deletion uses one request and rollback restores one merged chip', async () => {
  const { store, op, dateKey, requests } = fixture();
  const transfer = { ...op, _id2: 'second-half', transferGroupId: 'group', type: 'transfer', isTransfer: true, amount: 100 };
  store.displayCache[dateKey] = [transfer];
  store.calculationCache[dateKey] = [transfer];
  const saving = store.deleteOperation(transfer);
  const rejection = assert.rejects(saving, /Denied/);
  assert.equal(store.getOperationsForDay(dateKey).length, 0);
  await tick();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].params.cascadeTransfer, true);
  requests[0].response.reject(new Error('Denied'));
  await rejection;
  assert.equal(store.getOperationsForDay(dateKey).length, 1);
  assert.equal(store.getOperationsForDay(dateKey)[0]._id2, 'second-half');
});

test('split children follow the resolved cell when a parent moves into an unloaded day', async () => {
  const { store, op, dateKey, requests } = fixture();
  const parent = { ...op, isSplitParent: true, excludeFromTotals: true };
  const child = { ...op, _id: 'child', isSplitChild: true, parentOpId: op._id };
  store.displayCache[dateKey] = [parent, child];
  store.calculationCache[dateKey] = [parent, child];
  const tomorrow = new Date(op.date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetKey = store._getDateKey(tomorrow);
  const saving = store.moveOperation(parent, dateKey, targetKey, 3, tomorrow);
  assert.equal(store.getOperationsForDay(targetKey)[0].cellIndex, 3);
  await tick();
  requests[0].response.resolve([{ ...op, _id: 'occupant', date: tomorrow, dateKey: targetKey, cellIndex: 3 }]);
  await tick();
  const parentPayload = JSON.parse(requests[1].data);
  assert.equal(parentPayload.cellIndex, 4);
  requests[1].response.resolve({ ...parent, ...parentPayload, syncVersion: 1 });
  await tick();
  const childPayload = JSON.parse(requests[2].data);
  assert.equal(childPayload.cellIndex, 4);
  requests[2].response.resolve({ ...child, ...childPayload, syncVersion: 1 });
  await saving;
  assert.equal(store.currentOps.find(op => op._id === 'child')?.cellIndex, undefined);
  assert.equal(store.allKnownOperations.find(op => op._id === 'child').cellIndex, 4);
});

test('a reload after acknowledgement releases the preview but still rejects older revisions', async () => {
  const { store, op, dateKey, requests } = fixture();
  const saving = store.updateOperation(op._id, { amount: -250 });
  await tick();
  const updated = { ...op, amount: -250, syncVersion: 2 };
  requests[0].response.resolve(updated);
  await saving;
  const fetching = store.refreshDay(dateKey);
  await tick();
  requests[1].response.resolve([updated]);
  await fetching;
  store.onSocketOperationUpdated({ ...op, syncVersion: 1 });
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, -250);
  store.onSocketOperationUpdated({ ...updated, amount: -300, syncVersion: 3 });
  assert.equal(store.getOperationsForDay(dateKey)[0].amount, -300);
});

test('a stale range load cannot restore a chip deleted before the range arrives', async () => {
  const { store, op, dateKey, requests } = fixture();
  const fetching = store.fetchOperationsRange(op.date, op.date);
  const saving = store.deleteOperation(op);
  await tick();
  requests.find(request => request.method === 'get').response.resolve([op]);
  await fetching;
  assert.equal(store.getOperationsForDay(dateKey).length, 0);
  requests.find(request => request.method === 'delete').response.resolve(op);
  await saving;
});
