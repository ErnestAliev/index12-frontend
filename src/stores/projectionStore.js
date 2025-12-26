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
  console.log('--- projectionStore.js v5.3 (FIX: FINAL Anchor Logic) LOADED ---');

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

  function setToday(d){ 
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

  async function updateFutureProjectionByMode(mode, today = new Date()){
     updateProjectionState(mode, today);
  }

  function setProjectionRange(startDate, endDate){
    const start = new Date(startDate); start.setHours(0,0,0,0);
    const end   = new Date(endDate); end.setHours(0,0,0,0);
    projection.value = { 
        mode:'custom', 
        totalDays: Math.max(1, Math.floor((end-start)/86400000)+1), 
        rangeStartDate:start, 
        rangeEndDate:end, 
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
        const d = new Date(endDate); d.setHours(23, 59, 59, 999); endDate = d.getTime();
    } else { 
        endDate = Date.now() + 365*24*60*60*1000; 
    }

    const result = [];
        const opsSourceRaw = Array.isArray(mainStore.getAllRelevantOps)
          ? mainStore.getAllRelevantOps
          : (Array.isArray(mainStore.allKnownOperations) ? mainStore.allKnownOperations : []);

        // Local safe helpers (projectionStore must not depend on private helpers from mainStore)
        const idsMatch = (a, b) => {
          if (!a || !b) return false;
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

        // Fallback visibility filter (used only when getAllRelevantOps is not available)
        // This mirrors mainStore._isOpVisible behavior for account exclusion.
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

        // If we have getAllRelevantOps, it already respects account exclusion.
        // If not, apply local visibility filter.
        const opsSource = Array.isArray(mainStore.getAllRelevantOps)
          ? opsSourceRaw
          : opsSourceRaw.filter(isOpVisibleHere);

        const prepayIdsSet = new Set(Array.isArray(mainStore.getPrepaymentCategoryIds) ? mainStore.getPrepaymentCategoryIds : []);
        const retailId = mainStore.retailIndividualId ? String(mainStore.retailIndividualId._id || mainStore.retailIndividualId) : null;

        const isRetailWriteOffHere = (op) => {
          if (!op || op.type !== 'expense') return false;
          // Retail write-off rule from mainStore: expense, no accountId, counterpartyIndividualId == retail individual
          if (op.accountId) return false;
          if (!retailId) return false;
          return idsMatch(op.counterpartyIndividualId, retailId);
        };

        const byDateKey = {};

        // Collect per-day totals from the canonical ops source
        for (const op of opsSource) {
          if (!op) continue;

          const isTransfer = (op.type === 'transfer' || op.isTransfer === true);
          if (isTransfer) continue;
          if (op.isWorkAct) continue;

          // For charting we only support ops that have an account routing.
          // (This preserves previous behavior and avoids mixing in account-less system ops.)
          if (!op.accountId) continue;

          const dateKey = op.dateKey || (op.date ? _getDateKey(new Date(op.date)) : null);
          if (!dateKey) continue;

          if (!byDateKey[dateKey]) byDateKey[dateKey] = { income:0, prepayment:0, expense:0, withdrawal:0, dayTotal:0 };
          const dayRec = byDateKey[dateKey];

          const amt = Number(op.amount) || 0;
          const absAmt = Math.abs(amt);

          if (op.isWithdrawal) {
            dayRec.withdrawal += absAmt;
            dayRec.dayTotal -= absAmt;
            continue;
          }

          if (op.type === 'expense') {
            if (isRetailWriteOffHere(op)) continue;
            dayRec.expense += absAmt;
            dayRec.dayTotal -= absAmt;
            continue;
          }

          if (op.type === 'income') {
            // 🟢 LOGIC SYNC: Strict match with HourCell.vue
            const isClosed = op.isClosed === true;
            let isPrepay = false;

            if (!isClosed) {
              const isTranche = op.isDealTranche === true || (Number(op.totalDealAmount) || 0) > 0;
              const isRetail = retailId && op.counterpartyIndividualId && idsMatch(op.counterpartyIndividualId, retailId);
              const catId = op.categoryId?._id || op.categoryId;
              const prepId = op.prepaymentId?._id || op.prepaymentId;
              const isPrepayCat = (catId && prepayIdsSet.has(String(catId))) || (prepId && prepayIdsSet.has(String(prepId))) || (op.categoryId && op.categoryId.isPrepayment);
              const explicitPrepay = op.isPrepayment === true;

              if (isTranche || isRetail || isPrepayCat || explicitPrepay) {
                isPrepay = true;
              }
            }

            if (isPrepay) {
              dayRec.prepayment += amt;
            } else {
              dayRec.income += amt;
            }
            dayRec.dayTotal += amt;
          }
        }
// Сортировка дат
    const sortedDateKeys = Object.keys(byDateKey).sort((a, b) => {
      const [y1, d1] = a.split('-').map(Number);
      const [y2, d2] = b.split('-').map(Number);
      return (y1 - y2) || (d1 - d2);
    });

    if (sortedDateKeys.length === 0) return new Map();

    // --- ЛОГИКА ЯКОРЯ (ANCHOR LOGIC) ---
    // 1. Строим относительный график (форму кривой)
    // Мы считаем изменения баланса день за днем.
    let runningRelative = 0;
    const relativeMap = new Map();
    
    for (const dateKey of sortedDateKeys) {
      const rec = byDateKey[dateKey];
      runningRelative += rec.dayTotal; 
      
      relativeMap.set(dateKey, {
        ...rec,
        relativeBalance: runningRelative 
      });
    }

    // 2. Получаем РЕАЛЬНЫЙ баланс на СЕГОДНЯ из виджетов (Snapshot)
    const todayKey = _getDateKey(new Date());
    
    const realCurrentBalance = (mainStore.currentAccountBalances || []).reduce((sum, acc) => {
        if (!mainStore.includeExcludedInTotal && acc.isExcluded) return sum;
        return sum + (acc.balance || 0);
    }, 0);

    // 3. Вычисляем смещение (Anchor Offset)
    let anchorOffset = 0;
    
    if (relativeMap.has(todayKey)) {
        // СЦЕНАРИЙ А: "Сегодня" есть на графике.
        // Мы берем "относительное" значение на сегодня и смотрим, насколько оно отличается от "реального".
        // Offset = (Реальность) - (То, что насчитали с нуля)
        const relativeTodayVal = relativeMap.get(todayKey).relativeBalance;
        anchorOffset = realCurrentBalance - relativeTodayVal;
    } else {
        // СЦЕНАРИЙ Б: "Сегодня" нет на графике.
        const firstKey = sortedDateKeys[0];
        const [y1, d1] = firstKey.split('-').map(Number);
        const [ty, td] = todayKey.split('-').map(Number);
        
        // Сравниваем год и день, чтобы понять, график в будущем или прошлом
        const isFuture = y1 > ty || (y1 === ty && d1 > td);

        if (isFuture) {
             // Если график начинается в БУДУЩЕМ, то стартовая точка должна быть равна Текущему Балансу
             // (плюс любые изменения, которые могли произойти между сегодня и началом графика, но мы их не знаем, 
             // поэтому считаем их равными нулю для безопасности).
             // То есть: Balance(Start) ~= RealBalance + Change(Start)
             anchorOffset = realCurrentBalance;
        } else {
             // Если график в прошлом, привязываем КОНЕЦ графика к текущему балансу.
             // Это приближение, но лучше, чем 0.
             const lastKey = sortedDateKeys[sortedDateKeys.length - 1];
             const lastVal = relativeMap.get(lastKey)?.relativeBalance || 0;
             anchorOffset = realCurrentBalance - lastVal;
        }
    }

    // 4. Формируем финальный Chart с правильными абсолютными числами
    const chart = new Map();
    
    for (const dateKey of sortedDateKeys) {
        const item = relativeMap.get(dateKey);
        
        chart.set(dateKey, {
            income: item.income,
            prepayment: item.prepayment,
            expense: item.expense,
            withdrawal: item.withdrawal,
            // Магия: Относительный баланс + Смещение = Точный баланс
            closingBalance: item.relativeBalance + anchorOffset, 
            date: _parseDateKey(dateKey)
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