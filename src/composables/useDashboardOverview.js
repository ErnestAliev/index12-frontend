import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useProjectionStore } from '@/stores/projectionStore';
import { cashEntries, summarizeCash, minimumClosingBalance, dashboardId, isDashboardTransfer, factPeriodLabel } from '@/utils/dashboardFinance.js';

export function useDashboardOverview() {
  const store = useMainStore();
  const projection = useProjectionStore();
  const visibleIds = computed(() => new Set(store.currentAccountBalances.map(account => dashboardId(account))));
  const currentOperations = computed(() => {
    const normal = store.currentOps || [];
    const period = store.periodFilter || {};
    const end = new Date(); end.setHours(23, 59, 59, 999);
    let start = null, until = end;
    if (period.mode === 'currentMonth') start = new Date(end.getFullYear(), end.getMonth(), 1);
    if (period.mode === 'previousMonth') { start = new Date(end.getFullYear(), end.getMonth() - 1, 1); until = new Date(end.getFullYear(), end.getMonth(), 0, 23, 59, 59, 999); }
    if (period.mode === 'custom') { start = period.customStart ? new Date(period.customStart) : null; until = period.customEnd ? new Date(period.customEnd) : end; until.setHours(23, 59, 59, 999); }
    // Include the visible leg of a transfer even when its other account is hidden.
    const transfers = (store.allKnownOperations || []).filter(op => {
      const date = new Date(op.date);
      return isDashboardTransfer(op) && date <= end && date <= until && (!start || date >= start);
    });
    return [...normal.filter(op => { const date = new Date(op.date); return date <= until && (!start || date >= start); }), ...transfers];
  });
  const currentEntries = computed(() => cashEntries(currentOperations.value, visibleIds.value));
  const futureEntries = computed(() => cashEntries(projection.rawFutureOps || [], visibleIds.value));
  const movement = computed(() => summarizeCash(currentEntries.value));
  const futureMovement = computed(() => summarizeCash(futureEntries.value));
  const futurePayments = computed(() => futureEntries.value.filter(entry => entry.change !== 0).sort((a, b) => new Date(a.operation.date) - new Date(b.operation.date) || dashboardId(a.operation).localeCompare(dashboardId(b.operation))));
  const forecastEnd = computed(() => {
    const end = new Date(store.projection.rangeEndDate);
    end.setHours(23, 59, 59, 999);
    if (store.periodFilter?.mode === 'custom' && store.periodFilter.customEnd) {
      const filteredEnd = new Date(store.periodFilter.customEnd); filteredEnd.setHours(23, 59, 59, 999);
      if (filteredEnd < end) return filteredEnd;
    }
    return end;
  });
  const minimum = computed(() => minimumClosingBalance(store.currentTotalBalance, futureEntries.value, new Date(), forecastEnd.value));
  const periodLabel = computed(() => factPeriodLabel(store.periodFilter));
  const endDateLabel = computed(() => Number.isFinite(forecastEnd.value.getTime()) ? forecastEnd.value.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—');
  const operationLabel = op => {
    if (isDashboardTransfer(op)) {
      const from = store.accounts.find(a => dashboardId(a) === dashboardId(op.fromAccountId));
      const to = store.accounts.find(a => dashboardId(a) === dashboardId(op.toAccountId));
      return `${from?.name || '—'} → ${to?.name || op.destination || '—'}`;
    }
    const contractor = store.contractors.find(item => dashboardId(item) === dashboardId(op.contractorId));
    const individual = store.individuals.find(item => dashboardId(item) === dashboardId(op.counterpartyIndividualId));
    return contractor?.name || individual?.name || store.getOperationCategoryLabel(op, op.isWithdrawal ? 'Вывод средств' : 'Без статьи');
  };
  return { store, projection, currentEntries, futureEntries, movement, futureMovement, futurePayments, minimum, periodLabel, endDateLabel, operationLabel };
}
