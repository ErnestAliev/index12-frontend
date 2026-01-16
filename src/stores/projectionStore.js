import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useMainStore } from './mainStore';

const VIEW_MODE_DAYS = {
  '12d': { total: 12 },
  '1w': { total: 7 },    // 1 week - до пятницы
  '2w': { total: 14 },   // 2 weeks
  '3w': { total: 21 },   // 3 weeks
  '4w': { total: 28 },   // 4 weeks (1 month)
  '1m': { total: 30 },
  '6w': { total: 42 },   // 6 weeks
  '8w': { total: 56 },   // 8 weeks (2 months)
  '3m': { total: 90 },
  '12w': { total: 84 },  // 12 weeks (3 months)
  '16w': { total: 112 }, // 16 weeks (4 months)
  '6m': { total: 180 },
  '24w': { total: 168 }, // 24 weeks (~6 months, max for mobile)
  '1y': { total: 365 }
};

export const useProjectionStore = defineStore('projection', () => {


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

    // Special case: '1m' should show entire current month (start to end)
    if (view === '1m') {
      // Start of month
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      // End of month
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0); // Last day of current month
      endDate.setHours(23, 59, 59, 999);

      return { startDate, endDate };
    }

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
    const base = new Date(today); base.setHours(0, 0, 0, 0);

    // 🔥 CRITICAL FIX: Calculate date range based on mode
    // Previous logic set rangeEndDate to end of year for all modes, causing graph crashes
    const { startDate, endDate } = _calculateDateRangeWithYear(mode, base);

    calculationStatus.value = 'idle';

    projection.value = {
      mode,
      totalDays: computeTotalDaysForMode(mode),
      rangeStartDate: startDate,
      rangeEndDate: endDate, // ✅ Now syncs with mode
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
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(0, 0, 0, 0);
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
    // force reactivity
    const _v = mainStore.cacheVersion;

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const cutOffTime = todayEnd.getTime();

    let endDateMs;
    if (projection.value?.rangeEndDate) {
      const d = new Date(projection.value.rangeEndDate);
      d.setHours(23, 59, 59, 999);
      endDateMs = d.getTime();
    } else {
      endDateMs = Date.now() + 365 * 24 * 60 * 60 * 1000;
    }

    const result = [];

    // 🟢 Get period filter from mainStore
    const periodFilter = mainStore.periodFilter;
    let filterStartMs = null;
    let filterEndMs = null;

    if (periodFilter && periodFilter.mode === 'custom') {
      // 🔥 CRITICAL: Parse dates preserving local timezone (avoid UTC shift)
      const parseLocalDate = (isoString) => {
        const date = new Date(isoString);
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        return new Date(year, month, day);
      };

      if (periodFilter.customStart) {
        const start = parseLocalDate(periodFilter.customStart);
        start.setHours(0, 0, 0, 0);
        filterStartMs = start.getTime();
      }
      if (periodFilter.customEnd) {
        const end = parseLocalDate(periodFilter.customEnd);
        end.setHours(23, 59, 59, 999);
        filterEndMs = end.getTime();
      }
    }

    // Prefer canonical ops if available (so future ops are not limited by view range)
    const opsSource = Array.isArray(mainStore.getAllRelevantOps)
      ? mainStore.getAllRelevantOps
      : (Array.isArray(mainStore.allKnownOperations) ? mainStore.allKnownOperations : []);

    for (const op of opsSource) {
      if (!op?.date) continue;
      const t = new Date(op.date).getTime();
      if (t > cutOffTime && t <= endDateMs) {
        // 🟢 Filter by period
        if (filterStartMs !== null && t < filterStartMs) continue;
        if (filterEndMs !== null && t > filterEndMs) continue;
        result.push(op);
      }
    }

    // Prepayments
    for (const prep of mainStore.prepayments) {
      if (!prep?.date) continue;
      const t = new Date(prep.date).getTime();
      if (t > cutOffTime && t <= endDateMs) {
        // 🟢 Filter by period
        if (filterStartMs !== null && t < filterStartMs) continue;
        if (filterEndMs !== null && t > filterEndMs) continue;
        result.push(prep);
      }
    }

    // Recurring operations
    for (const recOp of mainStore.recurringOperations) {
      if (!recOp?.nextOccurrence) continue;
      const t = new Date(recOp.nextOccurrence).getTime();
      if (t > cutOffTime && t <= endDateMs) {
        // 🟢 Filter by period
        if (filterStartMs !== null && t < filterStartMs) continue;
        if (filterEndMs !== null && t > filterEndMs) continue;
        result.push(recOp);
      }
    }

    return result;
  });

  // 🟢 CORE: Data for chart (anchored to today's real balance, independent from view switcher)
  const dailyChartData = computed(() => {
    const mainStore = useMainStore();

    // Force reactivity on ops + snapshot balances
    const _v = mainStore.cacheVersion;
    const _balV = Array.isArray(mainStore.currentAccountBalances)
      ? mainStore.currentAccountBalances.map(a => `${a?._id || ''}:${a?.balance || 0}`).join('|')
      : '';

    // Canonical ops source
    const opsSourceRaw = Array.isArray(mainStore.getAllRelevantOps)
      ? mainStore.getAllRelevantOps
      : (Array.isArray(mainStore.allKnownOperations) ? mainStore.allKnownOperations : []);

    // Prefer mainStore visibility (it should include "выключенные" счета), fallback to excluded-accounts only.
    const idsMatch = (a, b) => {
      if (!a || !b) return false;
      if (typeof mainStore._idsMatch === 'function') return mainStore._idsMatch(a, b);
      const aId = (typeof a === 'object' && a !== null) ? (a._id || a.id || a) : a;
      const bId = (typeof b === 'object' && b !== null) ? (b._id || b.id || b) : b;
      return String(aId) === String(bId);
    };

    const includeExcluded = !!mainStore.includeExcludedInTotal;
    const excludedSet = (() => {
      const s = new Set();
      if (includeExcluded) return s;
      const accs = Array.isArray(mainStore.accounts) ? mainStore.accounts : [];
      for (const a of accs) {
        if (a && a.isExcluded) s.add(String(a._id));
      }
      return s;
    })();

    const isExcludedId = (id) => {
      if (!id || includeExcluded) return false;
      const v = (typeof id === 'object' && id !== null) ? (id._id || id) : id;
      return excludedSet.has(String(v));
    };

    const buildOpMap = (ops) => {
      const m = new Map();
      for (const o of ops) {
        if (o && o._id) m.set(String(o._id), o);
      }
      return m;
    };

    const opMap = buildOpMap(opsSourceRaw);

    const isOpVisibleHere = (op) => {
      if (!op) return false;
      if (typeof mainStore._isOpVisible === 'function') {
        // Main source of truth: respects toggled-on/off accounts, etc.
        return mainStore._isOpVisible(op);
      }
      if (includeExcluded) return true;

      if (op.accountId && isExcludedId(op.accountId)) return false;
      if (op.fromAccountId && isExcludedId(op.fromAccountId)) return false;
      if (op.toAccountId && isExcludedId(op.toAccountId)) return false;
      if (op.account && isExcludedId(op.account)) return false;

      // If this op is linked to a parent event, inherit exclusion from the parent
      if (op.relatedEventId && !op.accountId) {
        const parentId = (typeof op.relatedEventId === 'object' && op.relatedEventId !== null)
          ? String(op.relatedEventId._id || op.relatedEventId)
          : String(op.relatedEventId);
        const parent = opMap.get(parentId);
        if (parent) {
          if (parent.accountId && isExcludedId(parent.accountId)) return false;
          if (parent.fromAccountId && isExcludedId(parent.fromAccountId)) return false;
          if (parent.toAccountId && isExcludedId(parent.toAccountId)) return false;
          if (parent.account && isExcludedId(parent.account)) return false;
        }
      }

      return true;
    };

    const opsSource = opsSourceRaw.filter(isOpVisibleHere);

    const prepayIdsSet = new Set(Array.isArray(mainStore.getPrepaymentCategoryIds) ? mainStore.getPrepaymentCategoryIds.map(String) : []);
    const retailId = mainStore.retailIndividualId ? String(mainStore.retailIndividualId._id || mainStore.retailIndividualId) : null;

    const isRetailWriteOffHere = (op) => {
      if (typeof mainStore._isRetailWriteOff === 'function') return mainStore._isRetailWriteOff(op);
      if (!op || op.type !== 'expense') return false;
      if (op.accountId) return false;
      if (!retailId) return false;
      return idsMatch(op.counterpartyIndividualId, retailId);
    };

    // Determine computation range: from first op date to max(today, projection.rangeEndDate)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();

    let minMs = Infinity;
    let maxMs = -Infinity;

    for (const op of opsSource) {
      if (!op) continue;
      let t = NaN;
      if (op.date) {
        t = new Date(op.date).getTime();
      } else if (op.dateKey) {
        t = _parseDateKey(op.dateKey).getTime();
      }
      if (!Number.isFinite(t)) continue;
      if (t < minMs) minMs = t;
      if (t > maxMs) maxMs = t;
    }

    const startMs = Number.isFinite(minMs) ? new Date(minMs).setHours(0, 0, 0, 0) : todayStartMs;

    let endMs = todayStartMs;
    if (projection.value?.rangeEndDate) {
      const d = new Date(projection.value.rangeEndDate);
      d.setHours(0, 0, 0, 0);
      endMs = Math.max(endMs, d.getTime());
    } else if (Number.isFinite(maxMs)) {
      endMs = Math.max(endMs, new Date(maxMs).setHours(0, 0, 0, 0));
    }

    // Fill all days to avoid gaps
    const byDateKey = {};
    const dateKeys = [];

    for (let d = new Date(startMs); d.getTime() <= endMs; d.setDate(d.getDate() + 1)) {
      const key = _getDateKey(d);
      dateKeys.push(key);
      byDateKey[key] = { income: 0, prepayment: 0, expense: 0, withdrawal: 0, dayTotal: 0 };
    }

    // Aggregate per-day totals
    for (const op of opsSource) {
      if (!op) continue;

      const isTransfer = (op.type === 'transfer' || op.isTransfer === true);
      if (isTransfer) continue;
      if (op.isWorkAct) continue;

      // Charting assumes account-routed ops (keeps consistency with balances)
      if (!op.accountId) continue;

      const dateKey = op.dateKey || (op.date ? _getDateKey(new Date(op.date)) : null);
      if (!dateKey || !byDateKey[dateKey]) continue;

      const rec = byDateKey[dateKey];
      const amt = Number(op.amount) || 0;
      const absAmt = Math.abs(amt);

      if (op.isWithdrawal) {
        rec.withdrawal += absAmt;
        rec.dayTotal -= absAmt;
        continue;
      }

      if (op.type === 'expense') {
        if (isRetailWriteOffHere(op)) continue;
        rec.expense += absAmt;
        rec.dayTotal -= absAmt;
        continue;
      }

      if (op.type === 'income') {
        const isClosed = op.isClosed === true;
        let isPrepay = false;

        if (!isClosed) {
          const isTranche = op.isDealTranche === true || (Number(op.totalDealAmount) || 0) > 0;
          const isRetail = retailId && op.counterpartyIndividualId && idsMatch(op.counterpartyIndividualId, retailId);

          const catId = op.categoryId?._id || op.categoryId;
          const prepId = op.prepaymentId?._id || op.prepaymentId;

          const isPrepayCat = (catId && prepayIdsSet.has(String(catId)))
            || (prepId && prepayIdsSet.has(String(prepId)))
            || (op.categoryId && op.categoryId.isPrepayment);

          const explicitPrepay = op.isPrepayment === true;

          if (isTranche || isRetail || isPrepayCat || explicitPrepay) isPrepay = true;
        }

        if (isPrepay) {
          rec.prepayment += amt;
        } else {
          rec.income += amt;
        }
        rec.dayTotal += amt;
      }
    }

    if (dateKeys.length === 0) return new Map();

    // 1) Relative balances
    let runningRelative = 0;
    const relativeMap = new Map();

    for (const key of dateKeys) {
      const r = byDateKey[key] || { income: 0, prepayment: 0, expense: 0, withdrawal: 0, dayTotal: 0 };
      runningRelative += r.dayTotal;
      relativeMap.set(key, { ...r, relativeBalance: runningRelative });
    }

    // 2) Real balance (snapshot)
    const todayKey = _getDateKey(new Date());

    let realCurrentBalance = Number(
      (mainStore.currentTotalBalance ?? mainStore.totalBalance ?? mainStore.currentBalance) ?? NaN
    );

    if (!Number.isFinite(realCurrentBalance)) {
      realCurrentBalance = (Array.isArray(mainStore.currentAccountBalances) ? mainStore.currentAccountBalances : []).reduce((sum, acc) => {
        if (!acc) return sum;
        if (!includeExcluded && acc.isExcluded) return sum;
        // common optional flags for hidden accounts
        if (acc.isHidden === true) return sum;
        if (acc.isVisible === false) return sum;
        return sum + (Number(acc.balance) || 0);
      }, 0);
    }

    // 3) Anchor offset (today is always included in dateKeys)
    const relToday = relativeMap.get(todayKey)?.relativeBalance || 0;
    const anchorOffset = realCurrentBalance - relToday;

    // 4) Final chart
    const chart = new Map();

    for (const key of dateKeys) {
      const item = relativeMap.get(key);
      chart.set(key, {
        income: item?.income || 0,
        prepayment: item?.prepayment || 0,
        expense: item?.expense || 0,
        withdrawal: item?.withdrawal || 0,
        closingBalance: (item?.relativeBalance || 0) + anchorOffset,
        date: _parseDateKey(key)
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