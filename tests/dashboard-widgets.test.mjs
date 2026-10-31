import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDashboardLayout, migrateForecastState, readStoredJson, DEFAULT_DASHBOARD_LAYOUT } from '../src/utils/dashboardWidgets.js';
import { cashEntries, summarizeCash, minimumClosingBalance } from '../src/utils/dashboardFinance.js';

test('default layout is concise; an intentionally empty or custom layout stays selected', () => {
  assert.deepEqual(normalizeDashboardLayout(null), DEFAULT_DASHBOARD_LAYOUT);
  assert.deepEqual(normalizeDashboardLayout([]), []);
  assert.deepEqual(normalizeDashboardLayout(['projects', 'incomeList', 'expenseList', 'categories', 'subcategories', 'broken', 'money', 'liabilities']), ['projects', 'cashflow', 'articles']);
  assert.deepEqual(normalizeDashboardLayout(['accounts', 'companies', 'contractors', 'projects', 'incomeList', 'expenseList', 'transfers', 'individuals', 'categories', 'subcategories'], true), DEFAULT_DASHBOARD_LAYOUT);
});
test('corrupt saved settings are recoverable; merged forecast preference remains explicit', () => {
  assert.equal(readStoredJson('{broken', null), null);
  assert.deepEqual(migrateForecastState({ incomeList: true, expenseList: false, categories: true, subcategories: false, unknown: true }), { cashflow: true, articles: true });
});
const accounts = new Set(['bank', 'cash']);
const op = (id, type, amount, extra = {}) => ({ _id: id, type, amount, accountId: 'bank', ...extra });
test('cash movement includes loans and withdrawals, excludes noncash acts and duplicated or excluded rows, preserves tiyn', () => {
  const operations = [op('sale', 'income', 100.25), op('loan', 'income', 500, { isCredit: true }), op('expense', 'expense', 20.15), op('withdrawal', 'expense', 50, { isWithdrawal: true }), op('internal', 'transfer', 100, { fromAccountId: 'bank', toAccountId: 'cash' }), op('act', 'expense', 900, { isWorkAct: true }), op('technical', 'expense', 900, { accountId: null }), op('parent', 'income', 900, { excludeFromTotals: true }), op('sale', 'income', 100.25), op('phantom', 'income', 900, { isPhantom: true })];
  const totals = summarizeCash(cashEntries(operations, accounts));
  assert.equal(totals.income, 600.25); assert.equal(totals.expense, 70.15);
  assert.ok(Math.abs(totals.net - 530.10) < .000001);
  assert.equal(totals.incomeCount, 2); assert.equal(totals.expenseCount, 2);
});
test('a transfer across visibility groups changes only the selected account set', () => {
  const transfer = op('transfer', 'transfer', 75, { fromAccountId: 'bank', toAccountId: 'hidden' });
  assert.equal(summarizeCash(cashEntries([transfer], accounts)).net, -75);
  assert.equal(summarizeCash(cashEntries([transfer], new Set(['hidden']))).net, 75);
  assert.equal(summarizeCash(cashEntries([transfer], new Set(['bank', 'hidden']))).net, 0);
  assert.deepEqual(cashEntries([transfer], new Set()), []);
});
test('the minimum forecast uses closing balances and dates, independently of ordering within a day', () => {
  const entries = cashEntries([op('out', 'expense', 200, { date: '2026-11-02T12:00:00+05:00' }), op('in', 'income', 180, { date: '2026-11-02T14:00:00+05:00' }), op('next', 'expense', 100, { date: '2026-11-03T12:00:00+05:00' })], accounts);
  const result = minimumClosingBalance(100, entries, new Date('2026-11-01T12:00:00+05:00'), '2026-11-05T23:59:59+05:00');
  const endDay = cashEntries([op('last', 'expense', 500, { date: '2026-11-05T12:00:00+05:00' })], accounts);
  assert.equal(minimumClosingBalance(100, endDay, new Date('2026-11-01T12:00:00+05:00'), '2026-11-05').balance, -400);
  assert.equal(result.balance, -20); assert.equal(result.date.getDate(), 3);
  assert.deepEqual(minimumClosingBalance(100, [...entries].reverse(), new Date('2026-11-01T12:00:00+05:00'), '2026-11-05T23:59:59+05:00'), result);
  assert.equal(minimumClosingBalance(100, entries, new Date('2026-11-06T12:00:00+05:00'), '2026-11-05'), null);
});
