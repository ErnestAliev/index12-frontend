import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { createRenderer, nextTick, ssrContextKey } from 'vue';
import { amountInput } from './helpers/amount-input.mjs';

let server, useMainStore, components, pinia, app;
const renderer = createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
  parentNode: () => null, nextSibling: () => null,
});
before(async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ useMainStore } = await server.ssrLoadModule('/src/stores/mainStore.js'));
  components = Object.fromEntries(await Promise.all(['IncomePopup', 'ExpensePopup', 'TransferPopup'].map(async name => [name, (await server.ssrLoadModule(`/src/components/${name}.vue`)).default])));
});
after(async () => {
  app?.unmount();
  if (pinia) disposePinia(pinia);
  await server?.close();
  delete globalThis.localStorage;
});
async function form(name) {
  app?.unmount();
  if (pinia) disposePinia(pinia);
  pinia = createPinia(); setActivePinia(pinia);
  const store = useMainStore(pinia);
  store.user = { workspaceRole: 'admin', role: 'admin' };
  store.categories = [{ _id: 'transfer', name: 'Перевод' }];
  app = renderer.createApp({ ...components[name], render: () => null }, { date: new Date(), cellIndex: 0 }).use(pinia);
  app.provide(ssrContextKey, {});
  const instance = app.mount({}).$;
  for (let i = 0; i < 4; i++) await nextTick();
  return instance.setupState;
}
for (const name of ['IncomePopup', 'ExpensePopup', 'TransferPopup']) {
  test(`${name}: editing a middle digit updates the amount and preserves the cursor`, async () => {
    const state = await form(name);
    const input = amountInput('1 500 000');
    state.amount = input.value;
    state.onAmountInput(input.edit(2, 3, '', 'deleteContentBackward'));
    await nextTick();
    assert.equal(state.amount, '100 000');
    assert.equal(input.selectionStart, 1);
    state.onAmountInput(input.edit(input.selectionStart, input.selectionEnd, '9'));
    await nextTick();
    assert.equal(state.amount, '1 900 000');
    assert.equal(input.value, state.amount);
    assert.equal(input.selectionStart, 3);
  });
  test(`${name}: clearing, pasting and its existing precision remain unchanged`, async () => {
    const state = await form(name);
    const input = amountInput('1 500 000');
    state.onAmountInput(input.edit(0, input.value.length, '', 'deleteContentBackward'));
    assert.equal(state.amount, '');
    state.onAmountInput(input.edit(0, 0, '1234,56', 'insertFromPaste'));
    assert.equal(state.amount, name === 'TransferPopup' ? '123 456' : '1 234.56');
    assert.equal(input.selectionStart, input.value.length);
  });
}
