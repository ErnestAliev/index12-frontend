import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { createRenderer, createSSRApp, h, nextTick, ssrContextKey } from 'vue';
import { renderToString } from '@vue/server-renderer';
import axios from 'axios';

let server, useMainStore, components, pinia, app;
const adapter = axios.defaults.adapter;
const clone = value => JSON.parse(JSON.stringify(value));
const renderer = createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
  parentNode: () => null, nextSibling: () => null,
});
before(async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ useMainStore } = await server.ssrLoadModule('/src/stores/mainStore.js'));
  components = Object.fromEntries(await Promise.all(['IncomePopup', 'ExpensePopup', 'TransferPopup', 'AccountOwnerRepairModal'].map(async name => [name, (await server.ssrLoadModule(`/src/components/${name}.vue`)).default])));
});
after(async () => {
  app?.unmount();
  if (pinia) disposePinia(pinia);
  axios.defaults.adapter = adapter;
  await server?.close();
  delete globalThis.localStorage;
});
async function settle() { for (let i = 0; i < 5; i++) await nextTick(); }

function fixture() {
  app?.unmount(); app = null;
  if (pinia) disposePinia(pinia);
  pinia = createPinia();
  setActivePinia(pinia);
  const store = useMainStore(pinia);
  store.user = { workspaceRole: 'admin', role: 'admin' };
  store.companies = [{ _id: 'company', name: 'Компания' }];
  store.individuals = [{ _id: 'person', name: 'Физлицо' }];
  store.contractors = [{ _id: 'contractor', name: 'Плательщик' }];
  store.categories = [{ _id: 'transfer', name: 'Перевод' }];
  store.accounts = [
    { _id: 'account', name: 'Счёт', companyId: 'company', initialBalance: 100000 },
    { _id: 'personal', name: 'Личный', individualId: 'person', initialBalance: 100000 },
  ];
  let database = clone(store.accounts);
  const requests = [];
  axios.defaults.adapter = async config => {
    requests.push(config);
    if (config.url.includes('/accounts/batch-update')) {
      const updates = JSON.parse(config.data);
      database = database.map(a => ({ ...a, ...updates.find(u => u._id === a._id) }));
      return { data: clone(database), status: 200 };
    }
    return { data: { timestamp: new Date().toISOString(), accountBalances: {}, companyBalances: {}, individualBalances: {}, contractorBalances: {} }, status: 200 };
  };
  return { store, requests, database: () => database, syncDatabase: () => { database = clone(store.accounts); } };
}
async function mount(name, props) {
  app?.unmount();
  // Run the real component setup, lifecycle, watchers and handlers without a browser.
  // createApp props are supplied separately, just as in the actual form.
  app = renderer.createApp({ ...components[name], render: () => null }, props).use(pinia);
  app.provide(ssrContextKey, {});
  const instance = app.mount({}).$;
  await settle();
  return instance.setupState;
}
const operation = (type, extra) => ({ _id: 'op', type, amount: type === 'expense' ? -100 : 100,
  accountId: 'account', fromAccountId: 'account', toAccountId: 'personal', toIndividualId: 'person',
  date: new Date().toISOString(), contractorId: 'contractor', ...extra });
const props = (type, extra) => ({ date: new Date(), cellIndex: 0,
  [type === 'transfer' ? 'transferToEdit' : 'operationToEdit']: operation(type, extra) });

for (const [name, type] of [['IncomePopup', 'income'], ['ExpensePopup', 'expense'], ['TransferPopup', 'transfer']]) {
  test(`${type}: account owner hydrates when the saved operation has lost its owner`, async () => {
    const f = fixture();
    const saved = [];
    if (type === 'income') f.store.updateOperation = async (_id, payload) => { saved.push(payload); };
    const state = await mount(name, { ...props(type), onSave: payload => saved.push(payload.data) });
    assert.equal(type === 'transfer' ? state.selectedFromOwner : state.selectedOwner, 'company-company');
    assert.equal(state.showOwnerRepair, false);
    assert.equal(type === 'transfer' ? state.isFromOwnerSelectVisible : state.isOwnerSelectVisible, false);
    assert.equal(state.ensureAccountOwnership(), true);
    await state.handleSave();
    assert.equal(saved.length, 1);
    assert.equal(type === 'transfer' ? saved[0].fromCompanyId : saved[0].companyId, 'company');
  });

  test(`${type}: broken link opens the repair alert, saves immediately and stays fixed on reopen`, async () => {
    const f = fixture();
    f.store.accounts[0].companyId = null;
    f.syncDatabase();
    const state = await mount(name, props(type));
    assert.equal(state.showOwnerRepair, true);
    assert.equal(type === 'transfer' ? state.isFromOwnerSelectVisible : state.isOwnerSelectVisible, false, 'no extra owner field in the operation form');
    const items = clone(state.ownerRepairItems);
    const saved = [];
    const modal = await mount('AccountOwnerRepairModal', { items, onSaved: links => saved.push(links) });
    modal.rows[0].ownerKey = 'company-company';
    await modal.save();
    assert.equal(modal.error, '');
    assert.equal(saved.length, 1);
    assert.equal(f.database()[0].companyId, 'company', 'the API has saved the link before the modal reports success');
    assert.equal(f.requests.filter(r => r.url.includes('/accounts/batch-update')).length, 1);
    const reopened = await mount(name, props(type));
    assert.equal(reopened.showOwnerRepair, false);
    assert.equal(type === 'transfer' ? reopened.selectedFromOwner : reopened.selectedOwner, 'company-company');
  });

  test(`${type}: alert accepts a replacement account and applies its owner to the form`, async () => {
    const f = fixture();
    f.store.accounts[0].companyId = 'deleted';
    const state = await mount(name, props(type));
    const apply = state.onOwnerRepairSaved;
    // Transfer uses the other account as the source, with a distinct destination.
    await apply([{ key: type === 'transfer' ? 'from' : 'account', accountId: 'personal', ownerKey: 'individual-person' }]);
    assert.equal(type === 'transfer' ? state.fromAccountId : state.selectedAccountId, 'personal');
    assert.equal(type === 'transfer' ? state.selectedFromOwner : state.selectedOwner, 'individual-person');
    assert.equal(state.showOwnerRepair, false);
  });
}

test('transfer: both broken legs are repaired in one alert', async () => {
  const f = fixture();
  f.store.accounts.forEach(a => { a.companyId = null; a.individualId = null; });
  f.syncDatabase();
  const state = await mount('TransferPopup', props('transfer', { toIndividualId: null }));
  assert.deepEqual(state.ownerRepairItems.map(i => i.key), ['from', 'to']);
  const items = clone(state.ownerRepairItems);
  const modal = await mount('AccountOwnerRepairModal', { items });
  modal.rows[0].ownerKey = 'company-company';
  modal.rows[1].ownerKey = 'individual-person';
  await modal.save();
  assert.equal(modal.error, '');
  assert.equal(f.database()[0].companyId, 'company');
  assert.equal(f.database()[1].individualId, 'person');
});

test('repair alert contains account/owner selects and creation actions inside the alert dialog', async () => {
  fixture();
  const html = await renderToString(createSSRApp({ render: () => h(components.AccountOwnerRepairModal, { items: [{ key: 'account', accountId: 'account' }] }) }).use(pinia));
  assert.ok(html.includes('role="alertdialog"'));
  assert.ok(html.includes('Владелец счёта'));
  assert.equal((html.match(/class="base-select/g) || []).length, 2);
  assert.ok(html.includes('Сохранить привязку'));
});

test('repair stays open when API rejects or does not confirm the account owner', async () => {
  const f = fixture();
  f.store.accounts[0].companyId = null;
  const saved = [];
  const modal = await mount('AccountOwnerRepairModal', { items: [{ key: 'account', accountId: 'account' }], onSaved: links => saved.push(links) });
  modal.rows[0].ownerKey = 'company-company';
  axios.defaults.adapter = async () => { throw new Error('Нет соединения'); };
  await modal.save();
  assert.match(modal.error, /Нет соединения/);
  assert.equal(saved.length, 0);
  axios.defaults.adapter = async () => ({ status: 200, data: clone(f.store.accounts) });
  await modal.save();
  assert.match(modal.error, /не подтвердил/);
  assert.equal(saved.length, 0);
  assert.equal(f.store.accounts[0].companyId, null);
});

test('repair alert creates an account and an owner, then persists their link', async () => {
  const f = fixture();
  const modal = await mount('AccountOwnerRepairModal', { items: [{ key: 'account', accountId: 'missing' }] });
  const row = modal.rows[0];
  f.store.addAccount = async data => { const item = { _id: 'new-account', ...data }; f.store.accounts.push(item); return item; };
  f.store.addCompany = async name => { const item = { _id: 'new-owner', name }; f.store.companies.push(item); return item; };
  modal.startCreate(row, 'account'); row.name = 'Новый счёт'; await modal.createItem(row);
  modal.startCreate(row, 'company'); row.name = 'Новая компания'; await modal.createItem(row);
  assert.equal(row.accountId, 'new-account');
  assert.equal(row.ownerKey, 'company-new-owner');
  let updates;
  axios.defaults.adapter = async config => {
    if (config.url.includes('/accounts/batch-update')) {
      updates = JSON.parse(config.data);
      return { status: 200, data: f.store.accounts.map(a => ({ ...a, ...updates.find(u => u._id === a._id) })) };
    }
    return { status: 200, data: {} };
  };
  await modal.save();
  assert.equal(modal.error, '');
  assert.deepEqual(updates, [{ _id: 'new-account', companyId: 'new-owner', individualId: null }]);
});
