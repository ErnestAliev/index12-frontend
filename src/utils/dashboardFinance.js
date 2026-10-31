import { isSystemWithdrawal } from './transferLabels.js';
export const dashboardId = value => value && typeof value === 'object' ? String(value._id || value.id || '') : String(value || '');
export const isDashboardTransfer = op => op?.type === 'transfer' || op?.isTransfer === true;
export function cashChange(op, visibleAccountIds) {
  if (!op || op.isDeleted || op.isPhantom || op.excludeFromTotals || op.isWorkAct) return null;
  const amount = Number(op.amount);
  if (!Number.isFinite(amount) || !amount) return null;
  if (isDashboardTransfer(op)) {
    const from = visibleAccountIds.has(dashboardId(op.fromAccountId));
    const to = !isSystemWithdrawal(op) && visibleAccountIds.has(dashboardId(op.toAccountId));
    if (!from && !to) return null;
    return (to ? Math.abs(amount) : 0) - (from ? Math.abs(amount) : 0);
  }
  if (!visibleAccountIds.has(dashboardId(op.accountId))) return null;
  if (op.type === 'income') return amount;
  if (op.type === 'expense' || op.isWithdrawal) return -Math.abs(amount);
  return null;
}
export function cashEntries(operations, visibleAccountIds) {
  const seen = new Set();
  return (operations || []).flatMap(op => {
    const id = dashboardId(op);
    if (id && seen.has(id)) return [];
    if (id) seen.add(id);
    const change = cashChange(op, visibleAccountIds);
    return change === null ? [] : [{ operation: op, change }];
  });
}
export function summarizeCash(entries) {
  const result = { income: 0, expense: 0, incomeCount: 0, expenseCount: 0, net: 0 };
  for (const { change } of entries) {
    result.net += change;
    if (change > 0) { result.income += change; result.incomeCount++; }
    if (change < 0) { result.expense -= change; result.expenseCount++; }
  }
  return result;
}
// Only end-of-day balances are comparable; operation ordering within a day is not a payment schedule.
export function minimumClosingBalance(currentBalance, entries, today, endDate) {
  const start = new Date(today); start.setHours(23, 59, 59, 999);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  if (!Number.isFinite(end.getTime()) || end <= start) return null;
  const days = new Map();
  for (const { operation, change } of entries) {
    const date = new Date(operation.date);
    if (!Number.isFinite(date.getTime()) || date <= start || date > end) continue;
    date.setHours(23, 59, 59, 999);
    const key = date.getTime();
    days.set(key, (days.get(key) || 0) + change);
  }
  let balance = Number(currentBalance) || 0;
  let minimum = { balance, date: new Date(today) };
  for (const [date, change] of [...days].sort((a, b) => a[0] - b[0])) {
    balance += change;
    if (balance < minimum.balance) minimum = { balance, date: new Date(date) };
  }
  return minimum;
}
export function factPeriodLabel(period = {}) {
  const date = value => new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
  if (period.mode === 'currentMonth') return 'За текущий месяц';
  if (period.mode === 'previousMonth') return 'За прошлый месяц';
  if (period.mode === 'custom' && period.customStart && period.customEnd) return `${date(period.customStart)}–${date(period.customEnd)}`;
  return 'За всё время';
}
