import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useMainStore } from './mainStore';

const VIEW_MODE_DAYS = {
  '12d': { total: 12 },
  '1m':  { total: 30 },
  '3m':  { total: 90 },
  '6m':  { total: 180 },
  '1y':  { total: 360 }
};

export const useProjectionStore = defineStore('projection', () => {
  console.log('--- projectionStore.js v1.0 (NEW) LOADED ---');

  // --- 1. Date Helpers (Pure Functions) ---
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
    switch (view) {
      case '12d': startDate.setDate(startDate.getDate() - 5); endDate.setDate(endDate.getDate() + 6); break;
      case '1m':  startDate.setDate(startDate.getDate() - 15); endDate.setDate(endDate.getDate() + 14); break;
      case '3m':  startDate.setDate(startDate.getDate() - 45); endDate.setDate(endDate.getDate() + 44); break;
      case '6m':  startDate.setDate(startDate.getDate() - 90); endDate.setDate(endDate.getDate() + 89); break;
      case '1y':  startDate.setDate(startDate.getDate() - 180); endDate.setDate(endDate.getDate() + 179); break;
      default:    startDate.setDate(startDate.getDate() - 5); endDate.setDate(endDate.getDate() + 6);
    }
    return { startDate, endDate };
  };

  function getViewModeInfo(mode) {
    return VIEW_MODE_DAYS[mode] || VIEW_MODE_DAYS['12d'];
  }

  // --- 2. State: Time Context ---
  const todayDayOfYear = ref(0);
  const currentViewDate = ref(new Date());
  const currentYear = ref(new Date().getFullYear());

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

  // --- 3. State: Projection Settings ---
  const savedProjection = localStorage.getItem('projection');
  const initialProjection = savedProjection ? JSON.parse(savedProjection) : {
    mode: '12d', totalDays: 12, rangeStartDate: null, rangeEndDate: null,
    futureIncomeSum: 0, futureExpenseSum: 0
  };
  const projection = ref(initialProjection);
  
  watch(projection, (n) => localStorage.setItem('projection', JSON.stringify(n)), { deep: true });

  // --- 4. Actions: Projection Logic ---
  
  function computeTotalDaysForMode(mode) { 
      return getViewModeInfo(mode).total; 
  }

  async function updateProjectionFromCalculationData(mode, today = new Date()) {
    const base = new Date(today); base.setHours(0, 0, 0, 0);
    const { startDate, endDate } = _calculateDateRangeWithYear(mode, base);
    
    // Здесь мы просто обновляем метаданные проекции
    // Сами данные (income/expense sum) можно пересчитать, если нужно, 
    // но в оригинале они часто оставались 0 или считались отдельно.
    let futureIncomeSum = 0; 
    let futureExpenseSum = 0;
    
    projection.value = { 
        mode, 
        totalDays: computeTotalDaysForMode(mode), 
        rangeStartDate: startDate, 
        rangeEndDate: endDate, 
        futureIncomeSum, 
        futureExpenseSum 
    };
  }

  function updateFutureProjectionByMode(mode, today = new Date()){
    const base = new Date(today); base.setHours(0,0,0,0);
    const info = getViewModeInfo(mode);
    const { startDate, endDate } = _calculateDateRangeWithYear(mode, base);
    projection.value = { 
        mode: mode, 
        totalDays: info.total, 
        rangeStartDate: startDate, 
        rangeEndDate: endDate, 
        futureIncomeSum: 0, 
        futureExpenseSum: 0 
    };
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

  // --- 5. Computed: Logic (Using MainStore Data) ---

  const futureOps = computed(() => {
    const mainStore = useMainStore();
    const snapshotTime = mainStore.snapshot?.timestamp ? new Date(mainStore.snapshot.timestamp).getTime() : Date.now();
    const cutOffTime = Math.max(snapshotTime, Date.now());

    let endDate;
    if (projection.value?.rangeEndDate) { endDate = new Date(projection.value.rangeEndDate).getTime(); } 
    else { endDate = Date.now() + 365*24*60*60*1000; }

    const result = [];
    const cache = mainStore.calculationCache || {};

    for (const [dateKey, ops] of Object.entries(cache)) {
        const date = _parseDateKey(dateKey);
        const time = date.getTime();
        
        if (time >= cutOffTime - 86400000 && time <= endDate) {
            if (Array.isArray(ops)) {
                for (const op of ops) {
                    if (!op.date) continue;
                    const opTime = new Date(op.date).getTime();
                    if (opTime > cutOffTime) {
                        result.push(op);
                    }
                }
            }
        }
    }
    return result;
  });

  const dailyChartData = computed(() => {
    const mainStore = useMainStore();
    
    // Получаем необходимые данные из MainStore
    const cache = mainStore.calculationCache || {};
    const prepayIdsSet = new Set(mainStore.getPrepaymentCategoryIds || []); // Используем геттер
    const totalInitialBalance = (mainStore.accounts || []).reduce((s,a)=>s + Number(a.initialBalance||0), 0);

    const byDateKey = {};
    
    // Вспомогательные проверки (копируем логику или используем методы mainStore, если они экспортированы)
    // Так как _isRetailWriteOff и isTransfer пока в mainStore и не всегда экспортируются как публичные helpers,
    // для надежности продублируем простую логику проверок здесь или обратимся к mainStore, если он их экспортирует.
    // В текущей версии mainStore они экспортируются.
    
    for (const [dateKey, ops] of Object.entries(cache)) {
       if (!byDateKey[dateKey]) byDateKey[dateKey] = { income:0, prepayment:0, expense:0, withdrawal:0, dayTotal:0 };
       const dayRec = byDateKey[dateKey];
       if (Array.isArray(ops)) {
           for (const op of ops) {
               // Проверки
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
    // State
    todayDayOfYear,
    currentViewDate,
    currentYear,
    projection,
    
    // Helpers
    _getDateKey,
    _parseDateKey,
    _getDayOfYear,
    _calculateDateRangeWithYear,
    getViewModeInfo,
    computeTotalDaysForMode,

    // Actions
    setToday,
    setCurrentViewDate,
    updateProjectionFromCalculationData,
    updateFutureProjectionByMode,
    setProjectionRange,

    // Computed
    futureOps,
    dailyChartData
  };
});