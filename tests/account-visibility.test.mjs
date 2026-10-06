import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createPinia, setActivePinia, disposePinia } from 'pinia';

let server;
let useMainStore;
let useProjectionStore;
let useWidgetData;
let pinia;

before(async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  ({ useMainStore } = await server.ssrLoadModule('/src/stores/mainStore.js'));
  ({ useProjectionStore } = await server.ssrLoadModule('/src/stores/projectionStore.js'));
  ({ useWidgetData } = await server.ssrLoadModule('/src/composables/useWidgetData.js'));
});

after(async () => {
  if (pinia) disposePinia(pinia);
  await server?.close();
  delete globalThis.localStorage;
});

function fixture(mode = 'open') {
  if (pinia) disposePinia(pinia);
  pinia = createPinia();
  setActivePinia(pinia);
  const store = useMainStore();
  store.accountVisibilityMode = mode;
  store.accounts = [
    { _id: 'open', name: 'Рабочий', initialBalance: 1000, companyId: 'company', isExcluded: false },
    { _id: 'hidden', name: 'Личный', initialBalance: 9000, companyId: 'company', isExcluded: true },
  ];
  store.companies = [{ _id: 'company', name: 'Компания' }];
  store.contractors = [{ _id: 'contractor', name: 'Поставщик' }];
  store.projects = [{ _id: 'project', name: 'Проект' }];
  store.categories = [{ _id: 'category', name: 'Расходы' }];
  store.individuals = [{ _id: 'person', name: 'Контрагент' }];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  store.projection = { rangeEndDate: tomorrow };
  const op = (id, accountId, amount, date = tomorrow, extra = {}) => ({
    _id: id, type: 'expense', accountId, amount, date,
    projectId: 'project', contractorId: 'contractor', categoryId: 'category',
    counterpartyIndividualId: 'person', ...extra,
  });
  store.displayCache = { test: [
    op('current-open', 'open', -100, today),
    op('current-hidden', { _id: 'hidden', isExcluded: false }, -900, today),
    op('future-open', { _id: 'open' }, -200),
    op('future-hidden', 'hidden', -800),
  ] };
  return { store, op, today, tomorrow, widgets: useWidgetData() };
}

test('hidden accounts are excluded from all current and forecast widget calculations', () => {
  const { store, widgets } = fixture();
  assert.deepEqual(store.currentExpenses.map(op => op._id), ['current-open']);
  assert.deepEqual(store.futureExpenses.map(op => op._id), ['future-open']);
  assert.equal(store.currentTotalBalance, 900);
  assert.equal(store.futureTotalBalance, 700);
  assert.equal(store.currentCompanyBalances[0].balance, 900);
  assert.equal(store.futureCompanyBalances[0].balance, 700);
  for (const key of ['contractors', 'projects', 'categories', 'individuals']) {
    const row = widgets.getWidgetItems(key)[0];
    assert.equal(row.currentBalance, -100, key);
    assert.equal(row.futureChange, -200, key);
  }
  assert.equal(widgets.getWidgetItems('expenseList')[0].futureBalance, 200);
});

test('turning the eye on restores hidden operations and turning it off recalculates immediately', () => {
  const { store } = fixture();
  assert.equal(store.futureExpenses.length, 1);
  store.toggleHiddenVisibility();
  assert.equal(store.futureExpenses.length, 2);
  assert.equal(store.futureTotalBalance, 8000);
  store.toggleHiddenVisibility();
  assert.equal(store.futureExpenses.length, 1);
  store.accounts[0].isExcluded = true;
  assert.equal(store.futureExpenses.length, 0);
  assert.equal(store.currentTotalBalance, 0);
});

test('linked expenses inherit hidden routing from offset income and split parents', () => {
  const { store, op } = fixture();
  store.displayCache.test.push(
    op('offset', null, -300, undefined, { offsetIncomeId: 'future-hidden', excludeFromTotals: true }),
    op('split', null, -400, undefined, { parentOpId: 'future-hidden', isSplitChild: true }),
    op('related', null, -500, undefined, { relatedEventId: 'future-hidden' }),
  );
  assert.deepEqual(store.futureExpenses.map(op => op._id), ['future-open']);
  assert.equal(store.futureProjectChanges[0].balance, -200);
});

test('hidden-only and none modes apply to operations as well as account balances', () => {
  const { store } = fixture('hidden');
  assert.deepEqual(store.futureExpenses.map(op => op._id), ['future-hidden']);
  assert.deepEqual(store.currentExpenses.map(op => op._id), ['current-hidden']);
  assert.equal(store.futureTotalBalance, 7300);
  store.accountVisibilityMode = 'none';
  assert.equal(store.futureExpenses.length, 0);
  assert.equal(store.futureTotalBalance, 0);
});

test('future transfers affect the visible account leg and the total consistently with past transfers', () => {
  const { store, op, today } = fixture();
  store.displayCache.test = [
    op('past-transfer', null, 50, today, { type: 'transfer', fromAccountId: 'hidden', toAccountId: 'open' }),
    op('future-transfer', null, 70, undefined, { type: 'transfer', fromAccountId: 'open', toAccountId: 'hidden' }),
  ];
  assert.equal(store.currentAccountBalances[0].balance, 1050);
  assert.equal(store.futureAccountBalances[0].balance, 980);
  assert.equal(store.futureTotalBalance, 980);
  assert.equal(store.futureTransfers.length, 0);
});

test('an owner with open and hidden accounts keeps only the visible balances', () => {
  const { store } = fixture();
  store.accounts.forEach(account => { account.companyId = null; account.individualId = 'owner'; });
  store.individuals.push({ _id: 'owner', name: 'Владелец' });
  assert.equal(store.currentAccountOwnerIndividuals.length, 1);
  assert.equal(store.currentAccountOwnerIndividuals[0].balance, 900);
  assert.equal(store.futureAccountOwnerIndividuals[0].balance, 700);
});

test('mobile summaries use an empty filtered list without falling back to raw hidden operations', () => {
  const { store, widgets, op } = fixture();
  store.displayCache.test = [op('hidden-only', 'hidden', -800)];
  // Legacy/mobile operation source must not override the canonical, intentionally empty list.
  store.operations = store.displayCache.test;
  assert.equal(store.futureExpenses.length, 0);
  assert.equal(widgets.getWidgetItems('expenseList')[0].futureBalance, 0);
});

test('chart category totals respect the same visibility mode', () => {
  const { store, tomorrow } = fixture('hidden');
  const projection = useProjectionStore();
  const key = projection._getDateKey(tomorrow);
  assert.equal(projection.dailyChartData.get(key).expense, 800);
  assert.equal(store.futureCategoryBreakdowns.cat_category.total, -800);
  assert.equal(store.currentCategoryBreakdowns.cat_category.expense, 900);
  assert.equal(store.currentCategoryBreakdowns.cat_category.total, -900);
});

for (const [key, extra, currentName, futureName] of [
  ['incomeList', { type: 'income' }, 'currentIncomes', 'futureIncomes'],
  ['withdrawalList', { isWithdrawal: true }, 'currentWithdrawals', 'futureWithdrawals'],
  ['transfers', { type: 'transfer' }, 'currentTransfers', 'futureTransfers'],
]) {
  test(`${key} filters both current and future operations by account visibility`, () => {
    const { store, widgets } = fixture();
    for (const op of store.displayCache.test) {
      Object.assign(op, extra);
      if (key === 'transfers') {
        op.fromAccountId = op.accountId;
        op.toAccountId = op.accountId;
        op.accountId = null;
      }
    }
    assert.deepEqual(store[currentName].map(op => op._id), ['current-open']);
    assert.deepEqual(store[futureName].map(op => op._id), ['future-open']);
    assert.equal(widgets.getWidgetItems(key)[0].currentBalance, 100);
    assert.equal(widgets.getWidgetItems(key)[0].futureBalance, 200);
    store.toggleHiddenVisibility();
    assert.equal(widgets.getWidgetItems(key)[0].currentBalance, 1000);
    assert.equal(widgets.getWidgetItems(key)[0].futureBalance, 1000);
  });
}

test('credit repayment widgets exclude payments on hidden accounts', () => {
  const { store } = fixture();
  store.categories = [{ _id: 'category', name: 'Погашение займов' }];
  store.credits = [{ _id: 'credit', contractorId: 'contractor', totalDebt: 5000 }];
  assert.equal(store.currentCreditBalances[0].balance, 4900);
  assert.equal(store.futureCreditBalances[0].futureBalance, 4700);
  store.toggleHiddenVisibility();
  assert.equal(store.currentCreditBalances[0].balance, 4000);
  assert.equal(store.futureCreditBalances[0].futureBalance, 3000);
});

test('recurring forecasts also exclude hidden accounts', () => {
  const { store, op, tomorrow } = fixture();
  store.recurringOperations = [
    op('recurring-hidden', 'hidden', -300, tomorrow, { nextOccurrence: tomorrow }),
    op('recurring-open', 'open', -400, tomorrow, { nextOccurrence: tomorrow }),
  ];
  assert.deepEqual(store.futureExpenses.map(op => op._id), ['future-open', 'recurring-open']);
  assert.equal(store.futureTotalBalance, 300);
});

test('invited users cannot enable hidden accounts', () => {
  const { store } = fixture('all');
  store.user = { currentWorkspaceId: 'workspace', workspaceRole: 'analyst', isWorkspaceOwner: false };
  assert.equal(store.accountVisibilityMode, 'open');
  assert.deepEqual(store.futureExpenses.map(op => op._id), ['future-open']);
  store.toggleHiddenVisibility();
  assert.equal(store.accountVisibilityMode, 'open');
});

test('linked routing can cross dates and multiple links without looping on cyclic data', () => {
  const { store, op, today } = fixture();
  store.displayCache.test.push(
    op('middle', null, 0, today, { relatedEventId: 'future-hidden', excludeFromTotals: true }),
    op('linked', null, -300, undefined, { offsetIncomeId: { _id: 'middle' }, excludeFromTotals: true }),
    op('cycle-a', 'hidden', -100, undefined, { relatedEventId: 'cycle-b' }),
    op('cycle-b', null, -100, undefined, { relatedEventId: 'cycle-a' }),
  );
  assert.deepEqual(store.futureExpenses.map(op => op._id), ['future-open']);
});

test('owner tooltips list only accounts participating in the calculation', () => {
  const { widgets } = fixture();
  assert.equal(widgets.getWidgetItems('companies')[0].linkTooltip, 'Счета: Рабочий');
});
