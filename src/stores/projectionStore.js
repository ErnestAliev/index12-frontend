import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useMainStore } from './mainStore';

const VIEW_MODE_DAYS = {
  '12d': { total: 12 },
  '1m':  { total: 30 },
  '3m':  { total: 90 },
  '6m':  { total: 180 },
  '1y':  { total: 365 }
};

export const useProjectionStore = defineStore('projection', () => {
  console.log('--- projectionStore.js v5.4 (FULL RESTORE + FULL-HISTORY dailyChartData) LOADED ---');

  // --- 1. Date Helpers ---
  const _getDayOfYear = (date) => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000);
    return Math.floor(diff / 86400000);
  };

  const _getDateKey = (date) => {
    const year = date.getFullYear();
    const doy = _getDayOfYear(date);
    return `${year}-${doy}`;
  };

  const _parseDateKey = (dateKey) => {
    if (typeof dateKey !== 'string' || !dateKey.includes('-')) {
      return new Date();
    }
    const [year, doy] = dateKey.split('-').map(Number);
    const date = new Date(year, 0, 1);
    date.setDate(doy);
    return date;
  };

  const _calculateDateRangeWithYear = (view, baseDate) => {
    const startDate = new Date(baseDate);
    const endDate = new Date(baseDate);

    const modeInfo = VIEW_MODE_DAYS[view] || VIEW_MODE_DAYS['12d'];
    const totalDays = modeInfo.total;

    let todayIndex;
    if (view === '12d') {
      todayIndex = 5;
    } else {
      todayIndex = Math.floor(totalDays / 2);
    }

    const daysForward = (totalDays - 1) - todayIndex;
    const daysBack = todayIndex;

    startDate.setDate(startDate.getDate() - daysBack);
    endDate.setDate(endDate.getDate() + daysForward);

    return { startDate, endDate };
  };

  function getViewModeInfo(mode) {
    return VIEW_MODE_DAYS[mode] || VIEW_MODE_DAYS['12d'];
  }

  // --- 2. State ---
  const todayDayOfYear = ref(0);
  const currentViewDate = ref(new Date());
  const currentYear = ref(new Date().getFullYear());

  const calculationStatus = ref('idle');
  const calculatedUntil = ref(null);
  const globalProjectedBalance = ref(0);

  const savedToday = localStorage.getItem('todayDayOfYear');
  if (savedToday) {
    todayDayOfYear.value = parseInt(savedToday);
  }

  function setToday(d) {
    todayDayOfYear.value = d;
    localStorage.setItem('todayDayOfYear', d.toString());
  }

  function setCurrentViewDate(date) {
    if (!date) return;
    const d = new Date(date);
    if (isNaN(d.getTime())) return;
    currentViewDate.value = d;
  }

  // --- 3. Projection Settings ---
  const savedProjection = localStorage.getItem('projection');
  const initialProjection = savedProjection ? JSON.parse(savedProjection) : {
    mode: '12d', totalDays: 12, rangeStartDate: null, rangeEndDate: null,
    futureIncomeSum: 0, futureExpenseSum: 0
  };
  const projection = ref(initialProjection);

  watch(projection, (n) => localStorage.setItem('projection', JSON.stringify(n)), { deep: true });

  // --- 4. Actions ---
  function computeTotalDaysForMode(mode) {
    return getViewModeInfo(mode).total;
  }

  function setCalculationStatus(status) {
    calculationStatus.value = status;
  }

  function setGlobalProjectedBalance(amount, untilDate) {
    globalProjectedBalance.value = amount;
    calculatedUntil.value = untilDate ? new Date(untilDate) : null;
  }

  function updateProjectionState(mode, today = new Date()) {
    const base = new Date(today);
    base.setHours(0, 0, 0, 0);
    const { startDate, endDate } = _calculateDateRangeWithYear(mode, base);

    calculationStatus.value = 'idle';

    projection.value = {
      mode,
      totalDays: computeTotalDaysForMode(mode),
      rangeStartDate: startDate,
      rangeEndDate: endDate,
      futureIncomeSum: 0,
      futureExpenseSum: 0
    };
  }

  async function updateProjectionFromCalculationData(mode, today = new Date()) {
    updateProjectionState(mode, today);
  }

  async function updateFutureProjectionByMode(mode, today = new Date()) {
    updateProjectionState(mode, today);
  }

  function setProjectionRange(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    projection.value = {
      mode: 'custom',
      totalDays: Math.max(1, Math.floor((end - start) / 86400000) + 1),
      rangeStartDate: start,
      rangeEndDate: end,
      futureIncomeSum: 0
    };
  }

  // --- 5. Computed: Logic ---

  const futureOps = computed(() => {
    const mainStore = useMainStore();
    // 🟢 REACTIVITY FIX: Trigger re-calc when operations change
    const _version = mainStore.cacheVersion;

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const cutOffTime = todayEnd.getTime();

    let endDate;
    if (projection.value?.rangeEndDate) {
      endDate = new Date(projection.value.rangeEndDate).getTime();
      const d = new Date(endDate);
      d.setHours(23, 59, 59, 999);
      endDate = d.getTime();
    } else {
      endDate = Date.now() + 365 * 24 * 60 * 60 * 1000;
    }

    const result = [];
    const cache = mainStore.calculationCache || {};

    for (const [, ops] of Object.entries(cache)) {
      if (Array.isArray(ops)) {
        for (const op of ops) {
          if (!op.date) continue;
          const opTime = new Date(op.date).getTime();
          if (opTime > cutOffTime && opTime <= endDate) {
            result.push(op);
          }
        }
      }
    }

    return result;
  });

  // 🟢 CORE: Расчет данных для графика (НЕ ЗАВИСИТ ОТ ОКНА 12д/1м/3м)
  // Идея: дневные итоги считаем из full-history операций (allKnownOperations),
  // а окно (projection.rangeStartDate/rangeEndDate) используем только для отображения.
  // Якорим абсолютные значения по реальному текущему балансу (snapshot) через offset.
  const dailyChartData = computed(() => {
    const mainStore = useMainStore();

    // 🟢 1. FORCE REACTIVITY
    const _version = mainStore.cacheVersion;
    const _balancesVersion = mainStore.currentAccountBalances ? mainStore.currentAccountBalances.map(a => a.balance).join('|') : '';

    const prepayIdsSet = new Set(mainStore.getPrepaymentCategoryIds || []);
    const retailId = mainStore.retailIndividualId;

    const _keyToNum = (key) => {
      if (!key || typeof key !== 'string' || !key.includes('-')) return NaN;
      const [y, doy] = key.split('-').map(Number);
      if (!Number.isFinite(y) || !Number.isFinite(doy)) return NaN;
      return (y * 1000) + doy;
    };

    // 1) Диапазон отображения (только UI)
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const modeForRange = projection.value?.mode || '12d';
    const fb = _calculateDateRangeWithYear((modeForRange && modeForRange !== 'custom') ? modeForRange : '12d', base);

    const rangeStart = projection.value?.rangeStartDate ? new Date(projection.value.rangeStartDate) : new Date(fb.startDate);
    const rangeEnd = projection.value?.rangeEndDate ? new Date(projection.value.rangeEndDate) : new Date(fb.endDate);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd.setHours(0, 0, 0, 0);

    // 2) Источник операций: full-history
    const opsSource = (() => {
      const ak = mainStore.allKnownOperations;
      if (Array.isArray(ak) && ak.length) return ak;

      // Fallback: flatten calculationCache (если full-history пока не готов)
      const flat = [];
      const cacheObj = mainStore.calculationCache || {};
      Object.values(cacheObj).forEach(v => {
        if (Array.isArray(v)) flat.push(...v);
      });
      return flat;
    })();

    // 3) Подготовка дневных данных для ОТОБРАЖАЕМОГО диапазона
    const byDateKey = {};
    const rangeKeys = [];
    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
      const dk = _getDateKey(d);
      byDateKey[dk] = { income: 0, prepayment: 0, expense: 0, withdrawal: 0, dayTotal: 0 };
      rangeKeys.push(dk);
    }

    if (rangeKeys.length === 0) return new Map();

    // 4) Дневной net по ВСЕЙ истории (для стабильного anchor), и детализация в диапазоне
    const netByKey = new Map();
    const seen = new Set();

    for (const op of (opsSource || [])) {
      if (!op || !op.date) continue;

      // дедуп по _id (allKnownOperations может пересекаться с currentOps)
      if (op._id) {
        const idStr = String(op._id);
        if (seen.has(idStr)) continue;
        seen.add(idStr);
      }

      const dk = op.dateKey || _getDateKey(new Date(op.date));
      if (!dk) continue;

      // Фильтр исключенных счетов (как было)
      if (op.accountId && !mainStore.includeExcludedInTotal) {
        const acc = (mainStore.accounts || []).find(a => mainStore._idsMatch && mainStore._idsMatch(a._id, op.accountId));
        if (acc && acc.isExcluded) continue;
      }

      const isTransfer = !!op && (op.type === 'transfer' || op.isTransfer === true);
      if (isTransfer) continue;
      if (op.isWorkAct) continue;
      if (!op.accountId) continue;

      const amt = op.amount || 0;
      const absAmt = Math.abs(amt);

      let net = 0;

      if (op.isWithdrawal) {
        net = -absAmt;
      } else if (op.type === 'expense') {
        if (mainStore._isRetailWriteOff && mainStore._isRetailWriteOff(op)) continue;
        net = -absAmt;
      } else if (op.type === 'income') {
        net = amt;
      } else {
        net = 0;
      }

      if (net !== 0) {
        netByKey.set(dk, (netByKey.get(dk) || 0) + net);
      } else {
        if (!netByKey.has(dk)) netByKey.set(dk, 0);
      }

      // Детализация только в текущем UI-диапазоне
      const dayRec = byDateKey[dk];
      if (dayRec) {
        if (op.isWithdrawal) {
          dayRec.withdrawal += absAmt;
          dayRec.dayTotal -= absAmt;
        } else if (op.type === 'expense') {
          if (mainStore._isRetailWriteOff && mainStore._isRetailWriteOff(op)) {
            // already skipped above
          } else {
            dayRec.expense += absAmt;
            dayRec.dayTotal -= absAmt;
          }
        } else if (op.type === 'income') {
          // 🔥 split: 🟠 prepayment + 🟢 income
          const isClosed = op.isClosed === true;
          let isPrepay = false;

          if (!isClosed) {
            const isTranche = op.isDealTranche === true || (op.totalDealAmount || 0) > 0;
            const isRetail = retailId && op.counterpartyIndividualId && mainStore._idsMatch && mainStore._idsMatch(op.counterpartyIndividualId, retailId);
            const catId = op.categoryId?._id || op.categoryId;
            const prepId = op.prepaymentId?._id || op.prepaymentId;
            const isPrepayCat = (catId && prepayIdsSet.has(catId)) || (prepId && prepayIdsSet.has(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
            const explicitPrepay = op.isPrepayment === true;

            if (isTranche || isRetail || isPrepayCat || explicitPrepay) {
              isPrepay = true;
            }
          }

          if (isPrepay) dayRec.prepayment += amt;
          else dayRec.income += amt;

          dayRec.dayTotal += amt;
        }
      }
    }

    // 5) Гарантируем наличие todayKey для стабильного anchor
    const todayKey = _getDateKey(new Date());
    if (!netByKey.has(todayKey)) netByKey.set(todayKey, 0);

    // 6) Сортируем все ключи истории и строим префикс-суммы
    const allKeys = Array.from(netByKey.keys()).sort((a, b) => (_keyToNum(a) - _keyToNum(b)));

    let running = 0;
    const cumByKey = new Map();

    for (const k of allKeys) {
      const n = _keyToNum(k);
      if (!Number.isFinite(n)) continue;
      running += (netByKey.get(k) || 0);
      cumByKey.set(k, running);
    }

    const _getRelativeAtOrBeforeNum = (targetNum) => {
      if (!Number.isFinite(targetNum) || allKeys.length === 0) return 0;

      let lo = 0;
      let hi = allKeys.length - 1;
      let ans = -1;

      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const mk = allKeys[mid];
        const mn = _keyToNum(mk);
        if (mn <= targetNum) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      if (ans < 0) return 0;
      const kk = allKeys[ans];
      return cumByKey.get(kk) || 0;
    };

    // 7) Реальный баланс на сегодня (snapshot)
    const realCurrentBalance = (mainStore.currentAccountBalances || []).reduce((sum, acc) => {
      if (!mainStore.includeExcludedInTotal && acc.isExcluded) return sum;
      return sum + (acc.balance || 0);
    }, 0);

    // 8) Anchor offset считаем ВСЕГДА по full-history relative на today
    const todayNum = _keyToNum(todayKey);
    const relativeTodayVal = _getRelativeAtOrBeforeNum(todayNum);
    const anchorOffset = realCurrentBalance - relativeTodayVal;

    // 9) Финальный chart (только для UI-диапазона)
    const chart = new Map();

    for (const dk of rangeKeys) {
      const rec = byDateKey[dk] || { income: 0, prepayment: 0, expense: 0, withdrawal: 0, dayTotal: 0 };
      const dn = _keyToNum(dk);
      const rel = _getRelativeAtOrBeforeNum(dn);

      chart.set(dk, {
        income: rec.income,
        prepayment: rec.prepayment,
        expense: rec.expense,
        withdrawal: rec.withdrawal,
        closingBalance: rel + anchorOffset,
        date: _parseDateKey(dk)
      });
    }

    return chart;
  });

  return {
    todayDayOfYear, currentViewDate, currentYear, projection,
    calculationStatus, calculatedUntil, globalProjectedBalance,
    _getDateKey, _parseDateKey, _getDayOfYear, _calculateDateRangeWithYear, getViewModeInfo, computeTotalDaysForMode,
    setToday, setCurrentViewDate,
    setCalculationStatus, setGlobalProjectedBalance,
    updateProjectionState,
    updateProjectionFromCalculationData,
    updateFutureProjectionByMode,
    setProjectionRange,
    futureOps, dailyChartData
  };
});