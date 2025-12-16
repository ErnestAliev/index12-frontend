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
  console.log('--- projectionStore.js v5.1 (FIX: Graph Colors & Reactivity) LOADED ---');

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
    const cache = mainStore.calculationCache || {};

    for (const [dateKey, ops] of Object.entries(cache)) {
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

  // 🟢 CORE: Расчет данных для графика и итогов дня
  const dailyChartData = computed(() => {
    const mainStore = useMainStore();
    
    // 🟢 1. FORCE REACTIVITY: Зависимость от cacheVersion гарантирует пересчет при Drag&Drop
    const _version = mainStore.cacheVersion;
    
    const cache = mainStore.calculationCache || {};
    
    const prepayIdsSet = new Set(mainStore.getPrepaymentCategoryIds || []); 
    const retailId = mainStore.retailIndividualId;
    
    const totalInitialBalance = (mainStore.accounts || []).reduce((s,a)=>s + Number(a.initialBalance||0), 0);

    const byDateKey = {};
    
    for (const [dateKey, ops] of Object.entries(cache)) {
       if (!byDateKey[dateKey]) byDateKey[dateKey] = { income:0, prepayment:0, expense:0, withdrawal:0, dayTotal:0 };
       const dayRec = byDateKey[dateKey];
       
       if (Array.isArray(ops)) {
           for (const op of ops) {
               // Фильтр исключенных счетов
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
                   // 🟢 LOGIC SYNC: Strict match with HourCell.vue
                   
                   // 1. IS CLOSED? -> GREEN (Closed Deal)
                   const isClosed = op.isClosed === true;
                   
                   let isPrepay = false;

                   if (!isClosed) {
                       // 2. IS OPEN? Check Prepayment Criteria:
                       
                       // a) Explicit Deal Tranche
                       const isTranche = op.isDealTranche === true || (op.totalDealAmount || 0) > 0;
                       
                       // b) Retail Client (Debt)
                       const isRetail = retailId && op.counterpartyIndividualId && mainStore._idsMatch(op.counterpartyIndividualId, retailId);
                       
                       // c) Prepayment Category
                       const catId = op.categoryId?._id || op.categoryId;
                       const prepId = op.prepaymentId?._id || op.prepaymentId;
                       const isPrepayCat = (catId && prepayIdsSet.has(catId)) || (prepId && prepayIdsSet.has(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
                       
                       // d) Explicit Prepayment Flag
                       const explicitPrepay = op.isPrepayment === true;

                       if (isTranche || isRetail || isPrepayCat || explicitPrepay) {
                           isPrepay = true;
                       }
                   }

                   // Logic: If Prepay criteria met AND Not Closed -> Orange. Otherwise -> Green.
                   if (isPrepay) {
                       dayRec.prepayment += amt; // Orange
                   } else {
                       dayRec.income += amt; // Green
                   }
                   
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