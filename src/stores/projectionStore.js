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
  console.log('--- projectionStore.js v4.1 (SYNC FIX: EXACT DATES) LOADED ---');

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
    
    // 🟢 FIX: Используем точное количество дней из конфигурации режима.
    // Больше никаких "запасов" (+35 вместо 30), чтобы дата расчета 
    // строго совпадала с правым краем таймлайна.
    const modeInfo = VIEW_MODE_DAYS[view] || VIEW_MODE_DAYS['12d'];
    const daysToAdd = modeInfo.total;

    // Сдвигаем старт немного назад, чтобы видеть контекст (например, вчерашний день)
    startDate.setDate(startDate.getDate() - 5); 
    
    // Конец периода - ровно базовая дата + длительность режима
    endDate.setDate(endDate.getDate() + daysToAdd); 
    
    return { startDate, endDate };
  };

  function getViewModeInfo(mode) {
    return VIEW_MODE_DAYS[mode] || VIEW_MODE_DAYS['12d'];
  }

  // --- 2. State ---
  const todayDayOfYear = ref(0);
  const currentViewDate = ref(new Date());
  const currentYear = ref(new Date().getFullYear());

  // 🟢 NEW STATE: Eager Calculation Status
  const calculationStatus = ref('idle'); // 'idle' | 'calculating' | 'done'
  const calculatedUntil = ref(null);     // Date object (до какого числа посчитан прогноз)
  const globalProjectedBalance = ref(0); // Total balance at the end of the calculated period

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

  // 🟢 ACTIONS for Eager Loading
  function setCalculationStatus(status) {
      calculationStatus.value = status;
  }

  function setGlobalProjectedBalance(amount, untilDate) {
      globalProjectedBalance.value = amount;
      calculatedUntil.value = untilDate ? new Date(untilDate) : null;
  }

  // Обновляет стейт проекции (даты) без побочных эффектов загрузки
  function updateProjectionState(mode, today = new Date()) {
    const base = new Date(today); base.setHours(0, 0, 0, 0);
    const { startDate, endDate } = _calculateDateRangeWithYear(mode, base);
    
    // Сброс статуса при переключении режима
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

  // Deprecated wrapper
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
    
    // Граница будущего — это КОНЕЦ СЕГОДНЯШНЕГО ДНЯ.
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const cutOffTime = todayEnd.getTime();

    let endDate;
    if (projection.value?.rangeEndDate) { 
        endDate = new Date(projection.value.rangeEndDate).getTime(); 
        // ВАЖНО: Конец диапазона тоже включаем полностью
        const d = new Date(endDate); d.setHours(23, 59, 59, 999); endDate = d.getTime();
    } else { 
        endDate = Date.now() + 365*24*60*60*1000; 
    }

    const result = [];
    const cache = mainStore.calculationCache || {};

    for (const [dateKey, ops] of Object.entries(cache)) {
        if (Array.isArray(ops)) {
            for (const op of ops) {
                if (!op.date) continue;
                const opTime = new Date(op.date).getTime();
                
                // Только если время СТРОГО больше конца сегодняшнего дня И меньше конца диапазона
                if (opTime > cutOffTime && opTime <= endDate) {
                    result.push(op);
                }
            }
        }
    }
    return result;
  });

  const dailyChartData = computed(() => {
    const mainStore = useMainStore();
    const cache = mainStore.calculationCache || {};
    const prepayIdsSet = new Set(mainStore.getPrepaymentCategoryIds || []); 
    const totalInitialBalance = (mainStore.accounts || []).reduce((s,a)=>s + Number(a.initialBalance||0), 0);

    const byDateKey = {};
    
    for (const [dateKey, ops] of Object.entries(cache)) {
       if (!byDateKey[dateKey]) byDateKey[dateKey] = { income:0, prepayment:0, expense:0, withdrawal:0, dayTotal:0 };
       const dayRec = byDateKey[dateKey];
       if (Array.isArray(ops)) {
           for (const op of ops) {
               if (op.accountId && !mainStore.includeExcludedInTotal) {
                   const acc = mainStore.accounts.find(a => mainStore._idsMatch(a._id, op.accountId));
                   if (acc && acc.isExcluded) continue;
               }

               const isTransfer = !!op && (op.type === 'transfer' || op.isTransfer === true);
               if (isTransfer) continue;
               if (op.isWorkAct) continue;
               if (!op.accountId) continue; 
               
               const amt = op.amount || 0;
               const absAmt = Math.abs(amt);
               
               if (op.isWithdrawal) {
                   dayRec.withdrawal += absAmt;
                   dayRec.dayTotal -= absAmt;
               } else if (op.type === 'expense') {
                   if (mainStore._isRetailWriteOff && mainStore._isRetailWriteOff(op)) continue;
                   dayRec.expense += absAmt;
                   dayRec.dayTotal -= absAmt;
               } else if (op.type === 'income') {
                   const catId = op.categoryId?._id || op.categoryId;
                   const prepId = op.prepaymentId?._id || op.prepaymentId;
                   const isPrepay = (catId && prepayIdsSet.has(catId)) || (prepId && prepayIdsSet.has(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
                   if (isPrepay) dayRec.prepayment += amt;
                   else dayRec.income += amt;
                   dayRec.dayTotal += amt;
               }
           }
       }
    }
    
    const chart = new Map();
    const sortedDateKeys = Object.keys(byDateKey).sort((a, b) => {
      const [y1, d1] = a.split('-').map(Number);
      const [y2, d2] = b.split('-').map(Number);
      return (y1 - y2) || (d1 - d2);
    });
    
    let running = totalInitialBalance || 0;
    for (const dateKey of sortedDateKeys) {
      const rec = byDateKey[dateKey];
      running += rec.dayTotal;
      chart.set(dateKey, { 
        income: rec.income, prepayment: rec.prepayment, expense: rec.expense, withdrawal: rec.withdrawal,
        closingBalance: running, date: _parseDateKey(dateKey)
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