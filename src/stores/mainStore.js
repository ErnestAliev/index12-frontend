/**
 * * --- МЕТКА ВЕРСИИ: v6.9-DATE-FIX ---
 * * ВЕРСИЯ: 6.9 - Исправление даты при перемещении
 * ДАТА: 2025-11-16
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (FIX) В функции `moveOperation` добавлено явное обновление поля `.date`
 * при создании объекта `moved`. Теперь при перемещении чипа его внутренняя
 * дата синхронизируется с новым dateKey, и в попапах (Operation/Transfer)
 * отображается корректная дата, а не старая.
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import axios from 'axios';

// Глобальная настройка Axios
axios.defaults.withCredentials = true; 

// Адрес "Кухни"
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const VIEW_MODE_DAYS = {
  '12d': { total: 12 },
  '1m':  { total: 30 },
  '3m':  { total: 90 },
  '6m':  { total: 180 },
  '1y':  { total: 360 }
};

function getViewModeInfo(mode) {
  return VIEW_MODE_DAYS[mode] || VIEW_MODE_DAYS['12d'];
}

export const useMainStore = defineStore('mainStore', () => {
  console.log('--- mainStore.js v6.9-DATE-FIX ЗАГРУЖЕН ---'); 
  
  // ---------- STATE ----------
  
  const user = ref(null); 
  const isAuthLoading = ref(true); 
  
  const displayCache = ref({});
  const calculationCache = ref({});
  const accounts    = ref([]);
  const companies   = ref([]);
  const contractors = ref([]);
  const projects    = ref([]);
  const categories  = ref([]);
  const todayDayOfYear = ref(0);
  const currentYear = ref(new Date().getFullYear());

  const staticWidgets = ref([
    { key: 'currentTotal', name: 'Всего (на тек. момент)' },
    { key: 'accounts',     name: 'Мои счета' },
    { key: 'companies',    name: 'Мои компании' },
    { key: 'contractors',  name: 'Мои контрагенты' },
    { key: 'projects',     name: 'Мои проекты' },
    { key: 'futureTotal',  name: 'Всего (с уч. будущих)' },
  ]);

  const allWidgets = computed(() => {
    const cats = categories.value.map(c => ({ key: `cat_${c._id}`, name: c.name }));
    return [...staticWidgets.value, ...cats];
  });
  const savedLayout = localStorage.getItem('dashboardLayout');
  const dashboardLayout = ref(savedLayout ? JSON.parse(savedLayout) : ['currentTotal','accounts','companies','contractors','projects','futureTotal']);
  watch(dashboardLayout, (newLayout) => {
    localStorage.setItem('dashboardLayout', JSON.stringify(newLayout));
  }, { deep: true });
  const savedForecastState = localStorage.getItem('dashboardForecastState');
  const dashboardForecastState = ref(savedForecastState ? JSON.parse(savedForecastState) : {});
  watch(dashboardForecastState, (newState) => {
    localStorage.setItem('dashboardForecastState', JSON.stringify(newState));
  }, { deep: true });

  const savedProjection = localStorage.getItem('projection');
  const initialProjection = savedProjection ? JSON.parse(savedProjection) : {
    mode: '12d', totalDays: 12, rangeStartDate: null, rangeEndDate: null,
    futureIncomeSum: 0, futureExpenseSum: 0
  };
  const projection = ref(initialProjection);
  watch(projection, (newProjection) => {
    localStorage.setItem('projection', JSON.stringify(newProjection));
  }, { deep: true });
  
  function replaceWidget(i, key){ 
    if (!dashboardLayout.value.includes(key)) dashboardLayout.value[i]=key; 
  }
  function setForecastState(widgetKey, value) {
    dashboardForecastState.value[widgetKey] = !!value;
  }
  function setToday(d){ 
    todayDayOfYear.value = d; 
    localStorage.setItem('todayDayOfYear', d.toString());
  }
  const savedToday = localStorage.getItem('todayDayOfYear');
  if (savedToday) {
    todayDayOfYear.value = parseInt(savedToday);
  }
  
  // ---------- HELPERS ----------
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
        console.error(`!!! mainStore._parseDateKey ОШИБКА: Получен неверный dateKey:`, dateKey);
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
  const _formatDate = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };
  const _addDays = (base, n) => { 
    const d = new Date(base); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; 
  };

  // --- Computed ---
  const allOperationsFlat = computed(() => {
    const allOps = [];
    Object.values(calculationCache.value).forEach(dayOps => {
      if (Array.isArray(dayOps)) {
        dayOps.forEach(op => { if (op && typeof op === 'object') { allOps.push(op); } });
      }
    });
    return allOps;
  });
  const displayOperationsFlat = computed(() => {
    const displayOps = [];
    Object.values(displayCache.value).forEach(dayOps => {
      if (Array.isArray(dayOps)) {
        displayOps.push(...dayOps.filter(op => op && typeof op === 'object'));
      }
    });
    return displayOps;
  });
  const isTransfer = (op) => !!op && (op.type === 'transfer' || op.isTransfer === true);
  const currentOps = computed(() =>
    allOperationsFlat.value.filter(op => {
      if (!op?.dateKey) return false;
      const opDate = _parseDateKey(op.dateKey);
      const opYear = opDate.getFullYear();
      const opDoy = _getDayOfYear(opDate);
      const currentDoy = todayDayOfYear.value || 0;
      const currentYearVal = currentYear.value;
      return opYear < currentYearVal || (opYear === currentYearVal && opDoy <= currentDoy);
    })
  );

  const currentTransfers = computed(() => {
    const transfers = currentOps.value.filter(op => isTransfer(op));
    return transfers.sort((a, b) => {
      const dateA = _parseDateKey(a.dateKey); 
      const dateB = _parseDateKey(b.dateKey);
      return dateB.getTime() - dateA.getTime();
    });
  });

  const getCategoryById = (id) => {
    return categories.value.find(c => c._id === id);
  };

  const currentCategoryBreakdowns = computed(() => {
    const map = {};
    for (const c of categories.value) map[`cat_${c._id}`] = { income:0, expense:0, total:0 };
    for (const op of currentOps.value) {
      if (isTransfer(op)) continue;
      if (!op?.categoryId?._id) continue;
      const key = `cat_${op.categoryId._id}`;
      if (!map[key]) map[key] = { income:0, expense:0, total:0 };
      if (op.type === 'income') map[key].income += op.amount || 0;
      else if (op.type === 'expense') map[key].expense += Math.abs(op.amount || 0);
      map[key].total += (op.type === 'income' ? op.amount : -Math.abs(op.amount)) || 0;
    }
    return map;
  });

  const totalInitialBalance = computed(() =>
    (accounts.value || []).reduce((s,a)=>s + (a.initialBalance||0), 0)
  );
  const _applyTransferToBalances = (bal, op) => {
    const amt = Math.abs(Number(op?.amount) || 0);
    const fromId = op?.fromAccountId?._id || op?.fromAccountId || null;
    const toId   = op?.toAccountId?._id   || op?.toAccountId   || null;
    if (fromId) { if (bal[fromId] === undefined) bal[fromId] = 0; bal[fromId] -= amt; }
    if (toId)   { if (bal[toId]   === undefined) bal[toId]   = 0; bal[toId]   += amt; }
  };
  const currentAccountBalances = computed(() => {
    const bal = {};
    for (const a of accounts.value) bal[a._id] = a.initialBalance || 0;
    for (const op of currentOps.value) {
      if (isTransfer(op)) { _applyTransferToBalances(bal, op); continue; }
      if (!op?.accountId?._id) continue;
      const id = op.accountId._id;
      if (bal[id] === undefined) bal[id] = 0;
      bal[id] += (op.amount || 0);
    }
    return accounts.value.map(a => ({ ...a, balance: bal[a._id] || 0 }));
  });
  const futureAccountBalances = computed(() => {
    const bal = {};
    const currentBalances = currentAccountBalances.value;
    for (const account of currentBalances) { bal[account._id] = account.balance || 0; }
    const baseToday = todayDayOfYear.value || 0;
    const currentYearVal = currentYear.value;
    let endDate;
    if (projection.value?.rangeEndDate) { endDate = new Date(projection.value.rangeEndDate); } 
    else { endDate = new Date(currentYearVal, 0, baseToday); }
    const todayDate = new Date(currentYearVal, 0, baseToday);
    const futureOpsInRange = allOperationsFlat.value.filter(op => {
      if (!op?.dateKey) return false;
      const opDate = _parseDateKey(op.dateKey);
      return opDate > todayDate && opDate <= endDate;
    });
    futureOpsInRange.sort((a, b) => {
      const dateA = _parseDateKey(a.dateKey); const dateB = _parseDateKey(b.dateKey);
      if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
      return a.cellIndex - b.cellIndex;
    });
    for (const op of futureOpsInRange) {
      if (isTransfer(op)) { _applyTransferToBalances(bal, op); continue; }
      if (!op?.accountId?._id) continue;
      const id = op.accountId._id;
      if (bal[id] === undefined) bal[id] = 0;
      bal[id] += (op?.amount || 0);
    }
    return accounts.value.map(a => ({ ...a, balance: bal[a._id] || 0 }));
  });
  
  const currentCompanyBalances = computed(() => {
    const bal = {};
    for (const op of currentOps.value) {
      if (isTransfer(op)) continue;
      if (!op?.companyId?._id) continue;
      const id = op.companyId._id;
      if (!bal[id]) bal[id] = 0;
      bal[id] += (op?.amount || 0);
    }
    return (companies.value||[]).map(c => ({ ...c, balance: bal[c._id] || 0 }));
  });
  const futureCompanyBalances = computed(() => {
    const bal = {};
    const currentBalances = currentCompanyBalances.value;
    for (const company of currentBalances) { bal[company._id] = company.balance || 0; }
    const baseToday = todayDayOfYear.value || 0;
    const currentYearVal = currentYear.value;
    let endDate;
    if (projection.value?.rangeEndDate) { endDate = new Date(projection.value.rangeEndDate); }
    else { endDate = new Date(currentYearVal, 0, baseToday); }
    const todayDate = new Date(currentYearVal, 0, baseToday);
    const futureOpsInRange = allOperationsFlat.value.filter(op => {
      if (!op?.dateKey) return false;
      const opDate = _parseDateKey(op.dateKey);
      return opDate > todayDate && opDate <= endDate && !isTransfer(op) && op?.companyId?._id;
    });
    futureOpsInRange.sort((a, b) => {
      const dateA = _parseDateKey(a.dateKey); const dateB = _parseDateKey(b.dateKey);
      if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
      return a.cellIndex - b.cellIndex;
    });
    for (const op of futureOpsInRange) {
      const id = op.companyId._id;
      bal[id] += (op?.amount || 0);
    }
    return (companies.value||[]).map(c => ({ ...c, balance: bal[c._id] || 0 }));
  });

  const currentContractorBalances = computed(() => {
    const bal = {};
    for (const op of currentOps.value) {
      if (isTransfer(op)) continue;
      if (!op?.contractorId?._id) continue;
      const id = op.contractorId._id;
      if (!bal[id]) bal[id] = 0;
      bal[id] += (op?.amount || 0);
    }
    return (contractors.value||[]).map(c => ({ ...c, balance: bal[c._id] || 0 }));
  });
  const futureContractorBalances = computed(() => {
    const bal = {};
    const currentBalances = currentContractorBalances.value;
    for (const contractor of currentBalances) { bal[contractor._id] = contractor.balance || 0; }
    const baseToday = todayDayOfYear.value || 0;
    const currentYearVal = currentYear.value;
    let endDate;
    if (projection.value?.rangeEndDate) { endDate = new Date(projection.value.rangeEndDate); }
    else { endDate = new Date(currentYearVal, 0, baseToday); }
    const todayDate = new Date(currentYearVal, 0, baseToday);
    const futureOpsInRange = allOperationsFlat.value.filter(op => {
      if (!op?.dateKey) return false;
      const opDate = _parseDateKey(op.dateKey);
      return opDate > todayDate && opDate <= endDate && !isTransfer(op) && op?.contractorId?._id;
    });
    futureOpsInRange.sort((a, b) => {
      const dateA = _parseDateKey(a.dateKey); const dateB = _parseDateKey(b.dateKey);
      if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
      return a.cellIndex - b.cellIndex;
    });
    for (const op of futureOpsInRange) {
      const id = op.contractorId._id;
      bal[id] += (op?.amount || 0);
    }
    return (contractors.value||[]).map(c => ({ ...c, balance: bal[c._id] || 0 }));
  });

  const currentProjectBalances = computed(() => {
    const bal = {};
    for (const op of currentOps.value) {
      if (isTransfer(op)) continue;
      if (!op?.projectId?._id) continue;
      const id = op.projectId._id;
      if (!bal[id]) bal[id] = 0;
      bal[id] += (op?.amount || 0);
    }
    return (projects.value||[]).map(p => ({ ...p, balance: bal[p._id] || 0 }));
  });
  const futureProjectBalances = computed(() => {
    const bal = {};
    const currentBalances = currentProjectBalances.value;
    for (const project of currentBalances) { bal[project._id] = project.balance || 0; }
    const baseToday = todayDayOfYear.value || 0;
    const currentYearVal = currentYear.value;
    let endDate;
    if (projection.value?.rangeEndDate) { endDate = new Date(projection.value.rangeEndDate); }
    else { endDate = new Date(currentYearVal, 0, baseToday); }
    const todayDate = new Date(currentYearVal, 0, baseToday);
    const futureOpsInRange = allOperationsFlat.value.filter(op => {
      if (!op?.dateKey) return false;
      const opDate = _parseDateKey(op.dateKey);
      return opDate > todayDate && opDate <= endDate && !isTransfer(op) && op?.projectId?._id;
    });
    futureOpsInRange.sort((a, b) => {
      const dateA = _parseDateKey(a.dateKey); const dateB = _parseDateKey(b.dateKey);
      if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
      return a.cellIndex - b.cellIndex;
    });
    for (const op of futureOpsInRange) {
      const id = op.projectId._id;
      bal[id] += (op?.amount || 0);
    }
    return (projects.value||[]).map(p => ({ ...p, balance: bal[p._id] || 0 }));
  });

  const currentTotalBalance = computed(() => {
    const opsTotal = currentOps.value.reduce((s,op)=> {
      if (isTransfer(op)) return s;
      return s + (op?.amount || 0);
    }, 0);
    return (totalInitialBalance.value || 0) + opsTotal;
  });
  const futureTotalBalance = computed(() => {
    const baseToday = todayDayOfYear.value || 0;
    const currentYearVal = currentYear.value;
    let endDate;
    if (projection.value?.rangeEndDate) { endDate = new Date(projection.value.rangeEndDate); } 
    else { endDate = new Date(currentYearVal, 0, baseToday); }
    const todayDate = new Date(currentYearVal, 0, baseToday);
    if (endDate <= todayDate) { return currentTotalBalance.value || 0; }
    let total = totalInitialBalance.value || 0;
    const allOpsInRange = allOperationsFlat.value.filter(op => {
      if (!op?.dateKey) return false;
      const opDate = _parseDateKey(op.dateKey);
      return opDate <= endDate && !isTransfer(op);
    });
    allOpsInRange.sort((a, b) => {
      const dateA = _parseDateKey(a.dateKey); const dateB = _parseDateKey(b.dateKey);
      if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
      return a.cellIndex - b.cellIndex;
    });
    for (const op of allOpsInRange) { total += (op?.amount || 0); }
    return total;
  });

  const dailyChartData = computed(() => {
    const byDateKey = {};
    for (const op of allOperationsFlat.value) {
      if (!op?.dateKey) continue;
      if (!byDateKey[op.dateKey]) byDateKey[op.dateKey] = { income:0, expense:0, dayTotal:0 };
      if (!isTransfer(op)) {
        if (op.type === 'income') byDateKey[op.dateKey].income += (op?.amount || 0);
        else if (op.type === 'expense') byDateKey[op.dateKey].expense += Math.abs(op.amount || 0);
        byDateKey[op.dateKey].dayTotal += (op?.amount || 0);
      }
    }
    const chart = new Map();
    const sortedDateKeys = Object.keys(byDateKey).sort((a, b) => {
      const dateA = _parseDateKey(a); const dateB = _parseDateKey(b);
      return dateA.getTime() - dateB.getTime();
    });
    let running = totalInitialBalance.value || 0;
    for (const dateKey of sortedDateKeys) {
      const rec = byDateKey[dateKey];
      running += rec.dayTotal;
      chart.set(dateKey, { 
        income: rec.income, expense: rec.expense, closingBalance: running,
        date: _parseDateKey(dateKey)
      });
    }
    return chart;
  });

  function computeTotalDaysForMode(mode, todayDate = new Date()) {
    const info = getViewModeInfo(mode);
    return info.total;
  }

  // ---------- ACTIONS ----------
  
  async function loadCalculationData(mode, baseDate = new Date()) {
    console.log(`[ЖУРНАЛ] loadCalculationData: 🚀 Загрузка данных для расчетов (${mode})`);
    
    const { startDate: viewStartDate, endDate: viewEndDate } = _calculateDateRangeWithYear(mode, baseDate);

    const todayDate = new Date(currentYear.value, 0, todayDayOfYear.value || _getDayOfYear(new Date()));
    const yearStartDate = new Date(currentYear.value, 0, 1);
    
    console.log(`[ЖУРНАЛ] loadCalculationData:  memastikan (insuring) прошлое загружено...`);
    await fetchCalculationRange(yearStartDate, todayDate);
    
    console.log(`[ЖУРНАЛ] loadCalculationData: загружаю диапазон вида...`);
    await fetchCalculationRange(viewStartDate, viewEndDate);

    await updateProjectionFromCalculationData(mode, baseDate);
  }

  async function fetchCalculationRange(startDate, endDate) {
    console.log(`[ЖУРНАЛ] fetchCalculationRange: 📊 Загрузка диапазона расчетов ${_formatDate(startDate)} - ${_formatDate(endDate)}`);
    try {
      const promises = [];
      const dateKeysToFetch = [];
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = _getDateKey(d);
        if (!calculationCache.value[dateKey]) {
          dateKeysToFetch.push(dateKey);
          promises.push(axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`));
        }
      }
      
      if (promises.length > 0) {
        console.log(`[ЖУРНАЛ] fetchCalculationRange: 🚚 Запрашиваю ${promises.length} новых дней...`);
        const responses = await Promise.all(promises);
        const tempCache = {};
        for (let i = 0; i < responses.length; i++) {
          const dateKey = dateKeysToFetch[i];
          const raw = Array.isArray(responses[i].data) ? responses[i].data.slice() : [];
          const processedOps = _mergeTransfers(raw).map(op => ({
            ...op,
            dateKey: dateKey,
            date: op.date || _parseDateKey(dateKey) 
          }));
          tempCache[dateKey] = processedOps;
        }
        
        calculationCache.value = { ...calculationCache.value, ...tempCache };
        displayCache.value = { ...displayCache.value, ...tempCache }; 
        
      } else {
        console.log(`[ЖУРНАЛ] fetchCalculationRange: ✅ Диапазон уже в кеше.`);
      }
    } catch (error) {
      console.error('Ошибка загрузки данных для расчетов:', error);
      if (error.response && error.response.status === 401) {
        user.value = null;
      }
    }
  }

  async function updateProjectionFromCalculationData(mode, today = new Date()) {
    console.log(`[ЖУРНАЛ] updateProjectionFromCalculationData: 🎯 Расчет проекции из calculationCache (${mode})`);
    const base = new Date(today);
    base.setHours(0, 0, 0, 0);
    const { startDate, endDate } = _calculateDateRangeWithYear(mode, base);
    let futureIncomeSum = 0;
    let futureExpenseSum = 0;
    const baseToday = new Date(currentYear.value, 0, todayDayOfYear.value || 0);
    for (const op of allOperationsFlat.value) {
      if (!op?.dateKey) continue;
      const opDate = _parseDateKey(op.dateKey);
      if (opDate > baseToday && opDate <= endDate && !isTransfer(op)) {
        if (op.type === 'income') futureIncomeSum += op.amount || 0;
        else if (op.type === 'expense') futureExpenseSum += Math.abs(op.amount || 0);
      }
    }
    projection.value = { 
      mode, totalDays: computeTotalDaysForMode(mode, base),
      rangeStartDate: startDate, rangeEndDate: endDate,
      futureIncomeSum, futureExpenseSum 
    };
    updateFutureTotals();
  }

  async function fetchOperationsRange(startDate, endDate) {
    console.log(`[ЖУРНАЛ] fetchOperationsRange: 🚀 Загрузка диапазона ${_formatDate(startDate)} - ${_formatDate(endDate)}`);
    try {
      const promises = [];
      const dateKeysToFetch = [];
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = _getDateKey(d);
        if (!displayCache.value[dateKey]) {
          dateKeysToFetch.push(dateKey);
          promises.push(axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`));
        }
      }
      if (promises.length === 0) {
        console.log(`[ЖУРНАЛ] fetchOperationsRange: ✅ Данные уже в кеше.`);
        displayCache.value = { ...displayCache.value };
        return;
      }
      console.log(`[ЖУРНАЛ] fetchOperationsRange: 🚚 Запрашиваю ${promises.length} новых дней...`);
      const responses = await Promise.all(promises);
      const tempCache = {};
      for (let i = 0; i < responses.length; i++) {
        const dateKey = dateKeysToFetch[i];
        const raw = Array.isArray(responses[i].data) ? responses[i].data.slice() : [];
        const processedOps = _mergeTransfers(raw).map(op => ({
          ...op,
          dateKey: dateKey,
          date: op.date || _parseDateKey(dateKey) 
        }));
        tempCache[dateKey] = processedOps;
      }
      displayCache.value = { ...displayCache.value, ...tempCache };
      console.log(`[ЖУРНАЛ] fetchOperationsRange: ✅ Загрузка завершена.`);
    } catch (error) {
      console.error('Ошибка загрузки диапазона операций:', error);
      if (error.response && error.response.status === 401) {
        user.value = null;
      }
    }
  }

  async function updateFutureProjectionWithData(mode, today = new Date()) {
    console.log(`[ЖУРНАЛ] updateFutureProjection: 🚀 Расчет проекции для режима ${mode}`);
    const base = new Date(today); base.setHours(0, 0, 0, 0);
    const { startDate, endDate } = _calculateDateRangeWithYear(mode, base);
    await fetchOperationsRange(startDate, endDate); 
    let futureIncomeSum = 0;
    let futureExpenseSum = 0;
    const baseToday = new Date(currentYear.value, 0, todayDayOfYear.value || 0);
    for (const op of allOperationsFlat.value) {
      if (!op?.dateKey) continue;
      const opDate = _parseDateKey(op.dateKey);
      if (opDate > baseToday && opDate <= endDate && !isTransfer(op)) {
        if (op.type === 'income') futureIncomeSum += op.amount || 0;
        else if (op.type === 'expense') futureExpenseSum += Math.abs(op.amount || 0);
      }
    }
    projection.value = { 
      mode, totalDays: computeTotalDaysForMode(mode, base),
      rangeStartDate: startDate, rangeEndDate: endDate,
      futureIncomeSum, futureExpenseSum 
    };
    console.log(`[ЖУРНАЛ] updateFutureProjection: ✅ Расчет завершен. RangeEndDate: ${_formatDate(endDate)}`);
    updateFutureTotals();
  }
  function updateFutureProjection({ mode, totalDays, today = new Date() }) {
    const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
    let globalTodayIndex;
    if (mode === '12d') { globalTodayIndex = 5; } 
    else { globalTodayIndex = Math.floor(totalDays / 2); }
    const rangeStartDate = _addDays(t0, 0 - globalTodayIndex);
    const rangeEndDate = _addDays(t0, (totalDays - 1) - globalTodayIndex);
    let futureIncomeSum = 0;
    let futureExpenseSum = 0;
    const baseToday = new Date(currentYear.value, 0, todayDayOfYear.value || 0);
    for (const op of allOperationsFlat.value) {
      if (!op?.dateKey) continue;
      const opDate = _parseDateKey(op.dateKey);
      if (opDate > baseToday && opDate <= rangeEndDate && !isTransfer(op)) {
        if (op.type === 'income') futureIncomeSum += op.amount || 0;
        else if (op.type === 'expense') futureExpenseSum += Math.abs(op.amount || 0);
      }
    }
    projection.value = { 
      mode, totalDays, rangeStartDate, rangeEndDate, 
      futureIncomeSum, futureExpenseSum 
    };
    updateFutureTotals();
  }
  function updateFutureTotals() {
    const _ = futureTotalBalance.value;
    const __ = futureAccountBalances.value;
    const ___ = futureCompanyBalances.value;
    const ____ = futureContractorBalances.value;
    const _____ = futureProjectBalances.value;
  }
  function updateFutureProjectionByMode(mode, today = new Date()){
    const base = new Date(today); base.setHours(0,0,0,0);
    const info = getViewModeInfo(mode);
    updateFutureProjection({ mode: mode, totalDays: info.total, today: base });
  }
  function setProjectionRange(startDate, endDate){
    const t0 = new Date(); t0.setHours(0,0,0,0);
    const start = new Date(startDate); start.setHours(0,0,0,0);
    const end   = new Date(endDate); end.setHours(0,0,0,0);
    let sum=0;
    for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
      if (d<=t0) continue;
      const dateKey = _getDateKey(d);
      const data = dailyChartData.value.get(dateKey);
      if (data && data.income) sum += data.income;
    }
    projection.value = {
      mode:'custom', totalDays: Math.max(1, Math.floor((end-start)/86400000)+1),
      rangeStartDate:start, rangeEndDate:end, futureIncomeSum:sum
    };
  }

  function getOperationsForDay(dateKey) {
    if (typeof dateKey !== 'string') {
        console.warn(`[mainStore.getOperationsForDay] Получен неверный key: ${dateKey}`);
        return [];
    }
    return displayCache.value[dateKey] || [];
  }

  function _mergeTransfers(list) {
    const normalOps = list.filter(o => !o?.isTransfer && !o?.transferGroupId);
    const transferGroups = new Map();
    list.forEach(o => {
      if (o?.isTransfer || o?.transferGroupId) {
        const groupId = o.transferGroupId || `transfer_${o._id}`;
        if (!transferGroups.has(groupId)) { transferGroups.set(groupId, []); }
        transferGroups.get(groupId).push(o);
      }
    });
    const mergedTransfers = [];
    for (const [groupId, transferOps] of transferGroups) {
      if (transferOps.length === 2) {
        const expenseOp = transferOps.find(o => o.amount < 0);
        const incomeOp = transferOps.find(o => o.amount > 0);
        if (expenseOp && incomeOp) {
          mergedTransfers.push({
            _id: incomeOp._id, _id2: expenseOp._id, type: 'transfer', isTransfer: true,
            transferGroupId: groupId, amount: Math.abs(incomeOp.amount),
            fromAccountId: expenseOp.accountId, toAccountId: incomeOp.accountId,
            fromCompanyId: expenseOp.companyId, toCompanyId: incomeOp.companyId,
            dayOfYear: incomeOp.dayOfYear || expenseOp.dayOfYear,
            cellIndex: incomeOp.cellIndex || expenseOp.cellIndex || 0,
            categoryId: { _id: 'transfer', name: 'Перевод' },
            date: incomeOp.date || expenseOp.date
          });
          continue;
        }
      }
      const firstOp = transferOps[0];
      mergedTransfers.push({
        ...firstOp, type: 'transfer', isTransfer: true,
        transferGroupId: groupId, amount: Math.abs(firstOp.amount),
        categoryId: { _id: 'transfer', name: 'Перевод' }
      });
    }
    return [...normalOps, ...mergedTransfers];
  }
  async function _getOrCreateTransferCategory() {
    let transferCategory = categories.value.find(c => c.name.toLowerCase() === 'перевод');
    if (!transferCategory) {
      transferCategory = await addCategory('Перевод');
    }
    return transferCategory._id;
  }

  async function fetchOperations(dateKey, force = false) {
    if (typeof dateKey !== 'string' || !dateKey.includes('-')) {
        console.error(`!!! fetchOperations ОШИБКА: Попытка загрузить неверный dateKey:`, dateKey);
        return;
    }
    if (displayCache.value[dateKey] && !force) return;
    
    try {
      const res = await axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`);
      
      const raw = Array.isArray(res.data) ? res.data.slice() : [];
      const processedOps = _mergeTransfers(raw).map(op => ({
        ...op,
        dateKey: dateKey,
        date: op.date || _parseDateKey(dateKey) 
      }));
      
      displayCache.value[dateKey] = processedOps;
    } catch (e) {
      console.error('Ошибка загрузки операций для отображения:', e);
      if (e.response && e.response.status === 401) {
        user.value = null;
      }
    }
  }

  async function refreshDay(dateKey) {
    if (typeof dateKey !== 'string' || !dateKey.includes('-')) {
        console.error(`!!! refreshDay ОШИБКА: Попытка обновить неверный dateKey:`, dateKey);
        return;
    }
    console.log(`[ЖУРНАЛ] refreshDay: 🔄 Обновляю данные для ${dateKey} в displayCache и calculationCache...`);
    
    try {
      const res = await axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`);
      
      const raw = Array.isArray(res.data) ? res.data.slice() : [];
      const processedOps = _mergeTransfers(raw).map(op => ({
        ...op,
        dateKey: dateKey,
        date: op.date || _parseDateKey(dateKey) 
      }));
      
      displayCache.value[dateKey] = processedOps;
      calculationCache.value[dateKey] = processedOps;
      
      displayCache.value = { ...displayCache.value };
      calculationCache.value = { ...calculationCache.value };
      
    } catch (e) {
      console.error('Ошибка загрузки операций для дня:', e);
      if (e.response && e.response.status === 401) {
        user.value = null;
      }
    }
  
    updateFutureTotals();
  }

  async function deleteOperation(operation){
    const dateKey = operation.dateKey;
    if (!dateKey) {
        console.error('!!! deleteOperation ОШИБКА: У операции нет dateKey!', operation);
        return;
    }
    console.log(`[ЖУРНАЛ] deleteOperation: ❌ ОПТИМИСТИЧНОЕ удаление, dateKey: ${dateKey}`, operation);
    
    const opId = operation._id;
    const opGroupId = operation.transferGroupId;
    const isOpTransfer = isTransfer(operation);

    try {
      if (isOpTransfer) {
        const cachesToUpdate = [displayCache.value, calculationCache.value];
        for (const cache of cachesToUpdate) {
          for (const key of Object.keys(cache)) {
            const before = cache[key] || [];
            const parts = before.filter(o => o.isTransfer && o.transferGroupId === opGroupId);
            const partIds = new Set(parts.map(p => p._id).concat(parts.map(p => p._id2)).filter(Boolean));
            const after = before.filter(o => {
              if (o.isTransfer && o.transferGroupId === opGroupId) return false;
              if (partIds.has(o._id)) return false;
              return true;
            });
            if (after.length !== before.length) {
              cache[key] = _compactIndices(after);
            }
          }
        }
      } else {
        if (displayCache.value[dateKey]) {
          const oldArr = displayCache.value[dateKey] || [];
          const newArr = oldArr.filter(o => o._id !== opId);
          displayCache.value[dateKey] = _compactIndices(newArr);
        }
        if (calculationCache.value[dateKey]) {
          const oldArr = calculationCache.value[dateKey] || [];
          const newArr = oldArr.filter(o => o._id !== opId);
          calculationCache.value[dateKey] = _compactIndices(newArr);
        }
      }
      displayCache.value = { ...displayCache.value };
      calculationCache.value = { ...calculationCache.value };

      await fetchAllEntities();

      if (projection.value.mode) {
          await updateProjectionFromCalculationData(
            projection.value.mode, 
            new Date(currentYear.value, 0, todayDayOfYear.value)
          );
      }
    } catch(e) {
      console.error('Ошибка локального удаления, UI может быть неактуален.', e);
      await refreshDay(dateKey);
    }
    
    try{
      if (isOpTransfer) {
        const promises = [];
        if (operation._id)  promises.push(axios.delete(`${API_BASE_URL}/events/${operation._id}`));
        if (operation._id2) promises.push(axios.delete(`${API_BASE_URL}/events/${operation._id2}`));
        await Promise.all(promises);
      } else {
        await axios.delete(`${API_BASE_URL}/events/${opId}`);
      }
    } catch(e) { 
      console.error('Ошибка API удаления! Восстанавливаю состояние с сервера...', e); 
      await refreshDay(dateKey);
      await fetchAllEntities();
      if (projection.value.mode) {
        await updateProjectionFromCalculationData(
          projection.value.mode,
          new Date(currentYear.value, 0, todayDayOfYear.value)
        );
      }
    }
  }

  async function addOperation(op){
    if (!op.dateKey) {
        console.error('!!! addOperation ОШИБКА: У операции нет dateKey!', op);
        return;
    }
    console.log(`[ЖУРНАЛ] addOperation: ➕ Добавлена операция, dateKey: ${op.dateKey}, сумма: ${op.amount}`, op);
        
    await refreshDay(op.dateKey); 
    await fetchAllEntities();
    
    if (projection.value.mode) {
      await updateProjectionFromCalculationData(
        projection.value.mode,
        new Date(currentYear.value, 0, todayDayOfYear.value)
      );
    }
  }

  async function getFirstFreeCellIndex(dateKey, startIndex=0){
    if (typeof dateKey !== 'string' || !dateKey.includes('-')) {
        console.error(`!!! getFirstFreeCellIndex ОШИБКА:`, dateKey);
        return 0;
    }
    
    if (!displayCache.value[dateKey]) {
      await fetchOperations(dateKey); 
    }
    const arr = displayCache.value[dateKey] || [];
    const used = new Set(arr.map(o => Number.isInteger(o?.cellIndex)? o.cellIndex : -1));
    let idx = Math.max(0, startIndex|0);
    while (used.has(idx)) idx++;
    return idx;
  }

  function _compactIndices(arr, excludeId=null){
    const others = excludeId ? arr.filter(o => o._id !== excludeId) : arr.slice();
    others.sort((a,b)=>a.cellIndex - b.cellIndex).forEach((o,i)=>{ o.cellIndex = i; });
    return others;
  }

  function _reorderWithinDayLocal(dateKey, opId, fromIndex, toIndex){
    const list = (displayCache.value[dateKey] || []).slice();
    
    const self = list.find(o => o._id === opId);
    if (!self) return { affected: [], self: null };

    const others = list.filter(o => o._id !== opId);
    _compactIndices(others);
    if (toIndex < 0) toIndex = 0;
    if (toIndex > others.length) toIndex = others.length;
    const affected = [];
    if (toIndex < fromIndex){
      for (const o of others){
        if (o.cellIndex >= toIndex && o.cellIndex <= fromIndex-1){
          o.cellIndex += 1; affected.push(o);
        }
      }
      self.cellIndex = toIndex;
    } else if (toIndex > fromIndex){
      for (const o of others){
        if (o.cellIndex >= fromIndex+1 && o.cellIndex <= toIndex){
          o.cellIndex -= 1; affected.push(o);
        }
      }
      self.cellIndex = toIndex;
    } else {
       self.cellIndex = fromIndex;
    }

    const merged = [...others, self].sort((a,b)=>a.cellIndex - b.cellIndex);
    
    displayCache.value[dateKey] = merged;
    displayCache.value = { ...displayCache.value };

    if (calculationCache.value[dateKey]) {
      const mergedClone = merged.map(op => ({ ...op })); 
      calculationCache.value[dateKey] = mergedClone;
      calculationCache.value = { ...calculationCache.value };
    }
    
    return { affected, self };
  }

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: moveOperation (Дата) ---
  // =================================================================
  async function moveOperation(operation, oldDateKey, newDateKey, desiredCellIndex){
    if (!oldDateKey || !newDateKey) {
        console.error(`!!! moveOperation ОШИБКА:`, operation);
        return;
    }
    console.log(`[ЖУРНАЛ] moveOperation: ➡️ Перемещение ID: ${operation._id}. Из ${oldDateKey} -> В ${newDateKey}`);
    
    const desired = Number.isInteger(desiredCellIndex) ? desiredCellIndex : 0;

    if (!displayCache.value[oldDateKey]) await fetchOperations(oldDateKey);
    if (!displayCache.value[newDateKey])   await fetchOperations(newDateKey);
    if (!calculationCache.value[oldDateKey]) await refreshDay(oldDateKey);
    if (!calculationCache.value[newDateKey])   await refreshDay(newDateKey);


    if (oldDateKey === newDateKey) {
      console.log(`[ЖУРНАЛ] moveOperation: ➡️ (Перемещение внутри ${newDateKey})`);
      const fromIndex = Number(operation.cellIndex || 0);
      const toIndex   = Math.max(0, desired);
      const { affected, self } = _reorderWithinDayLocal(newDateKey, operation._id, fromIndex, toIndex);
      
      try{
        if (self) {
          for (const a of affected) {
            await axios.put(`${API_BASE_URL}/events/${a._id}`, { dateKey: newDateKey, cellIndex: a.cellIndex });
          }
          if (isTransfer(operation) && operation._id2) {
            await Promise.all([
              axios.put(`${API_BASE_URL}/events/${operation._id}`,  { dateKey: newDateKey, cellIndex: self.cellIndex }),
              axios.put(`${API_BASE_URL}/events/${operation._id2}`, { dateKey: newDateKey, cellIndex: self.cellIndex }),
            ]);
          } else {
            await axios.put(`${API_BASE_URL}/events/${operation._id}`, { dateKey: newDateKey, cellIndex: self.cellIndex });
          }
        }
      }catch(e){
        console.error('Ошибка перестановки внутри дня — обновляю день из сервера', e);
        await refreshDay(newDateKey);
      }
      
      if (projection.value.mode) {
        await updateProjectionFromCalculationData(
          projection.value.mode, 
          new Date(currentYear.value, 0, todayDayOfYear.value)
        );
      }
      return;
    }
    
    const oldArr_display = (displayCache.value[oldDateKey] || []).filter(o => o._id !== operation._id);
    _compactIndices(oldArr_display);
    displayCache.value[oldDateKey] = oldArr_display;

    const oldArr_calc = (calculationCache.value[oldDateKey] || []).filter(o => o._id !== operation._id);
    _compactIndices(oldArr_calc);
    calculationCache.value[oldDateKey] = oldArr_calc;

    let newArr_display = (displayCache.value[newDateKey] || []).filter(o => o._id !== operation._id);
    _compactIndices(newArr_display);

    let newArr_calc = (calculationCache.value[newDateKey] || []).filter(o => o._id !== operation._id);
    _compactIndices(newArr_calc);

    const targetIndex = await getFirstFreeCellIndex(newDateKey, desired);
    
    const shifted_display = [];
    for (const o of newArr_display) {
      if (o.cellIndex >= targetIndex) { o.cellIndex += 1; shifted_display.push(o); }
    }
    const shifted_calc = [];
    for (const o of newArr_calc) {
      if (o.cellIndex >= targetIndex) { o.cellIndex += 1; shifted_calc.push(o); }
    }

    // --- 🔴 ИСПРАВЛЕНИЕ ТУТ ---
    const moved = { 
      ...operation, 
      cellIndex: targetIndex, 
      dateKey: newDateKey,
      // Явно обновляем дату объекта, чтобы попапы видели актуальное значение
      date: _parseDateKey(newDateKey) 
    };
    
    const merged_display = [...newArr_display, moved].sort((a,b)=>a.cellIndex - b.cellIndex);
    displayCache.value[newDateKey] = merged_display;
    
    const merged_calc = [...newArr_calc, { ...moved }].sort((a,b)=>a.cellIndex - b.cellIndex);
    calculationCache.value[newDateKey] = merged_calc;

    displayCache.value = { ...displayCache.value };
    calculationCache.value = { ...calculationCache.value };
    
    try{
      for (const s of shifted_display) {
        await axios.put(`${API_BASE_URL}/events/${s._id}`, { dateKey: newDateKey, cellIndex: s.cellIndex });
      }
      if (isTransfer(operation) && operation._id2) {
        await Promise.all([
          axios.put(`${API_BASE_URL}/events/${moved._id}`,  { dateKey: newDateKey, cellIndex: moved.cellIndex }),
          axios.put(`${API_BASE_URL}/events/${operation._id2}`, { dateKey: newDateKey, cellIndex: moved.cellIndex }),
        ]);
      } else {
        await axios.put(`${API_BASE_URL}/events/${moved._id}`, { dateKey: newDateKey, cellIndex: moved.cellIndex });
      }
      for (const o of oldArr_display){
        await axios.put(`${API_BASE_URL}/events/${o._id}`, { dateKey: oldDateKey, cellIndex: o.cellIndex });
      }
    } catch(e) {
      console.error('Ошибка переноса между днями — откатываю к серверному состоянию', e);
      await refreshDay(oldDateKey);
      await refreshDay(newDateKey);
    }

    if (projection.value.mode) {
      await updateProjectionFromCalculationData(
        projection.value.mode, 
        new Date(currentYear.value, 0, todayDayOfYear.value)
      );
    }
  }

  function _generateTransferGroupId(){ return `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

  async function createTransfer(transferData) {
    try {
      const finalDate = new Date(transferData.date);
      const dateKey = _getDateKey(finalDate);

      const cellIndex = await getFirstFreeCellIndex(dateKey);
      
      const transferCategory = await _getOrCreateTransferCategory();
      
      console.log(`[ЖУРНАЛ] createTransfer: ➡️ Отправляю POST /api/transfers (в ячейку ${cellIndex})...`, transferData);
      
      const response = await axios.post(`${API_BASE_URL}/transfers`, {
        ...transferData,
        dateKey: dateKey, 
        cellIndex: cellIndex,
        categoryId: transferData.categoryId || transferCategory
      });
      
      return response.data;
    } catch (error) {
      console.error('Ошибка создания перевода:', error);
      throw error;
    }
  }

  async function updateTransfer(transferId, transferData) {
    try {
      const finalDate = new Date(transferData.date);
      const dateKey = _getDateKey(finalDate);
      
      const response = await axios.put(`${API_BASE_URL}/events/${transferId}`, {
        ...transferData,
        dateKey: dateKey, 
        type: 'transfer',
        isTransfer: true
      });
      
      return response.data;
    } catch (error) {
      console.error('Ошибка обновления перевода:', error);
      throw error;
    }
  }

  async function addAccount(data) {
    let payload;
    if (typeof data === 'string') { payload = { name: data, initialBalance: 0 }; } 
    else { payload = { name: data.name, initialBalance: data.initialBalance || 0, companyId: data.companyId || null }; }
    const res = await axios.post(`${API_BASE_URL}/accounts`, payload);
    accounts.value.push(res.data); return res.data;
  }
  async function addCompany(name){
    const res = await axios.post(`${API_BASE_URL}/companies`, { name });
    companies.value.push(res.data); return res.data;
  }
  async function addContractor(name){
    const res = await axios.post(`${API_BASE_URL}/contractors`, { name });
    contractors.value.push(res.data); return res.data;
  }
  async function addProject(name){
    const res = await axios.post(`${API_BASE_URL}/projects`, { name });
    projects.value.push(res.data); return res.data;
  }

  async function addCategory(name){
    const res = await axios.post(`${API_BASE_URL}/categories`, { name });
    categories.value.push(res.data); 
    
    const newWidgetKey = `cat_${res.data._id}`;
    if (!dashboardLayout.value.includes(newWidgetKey)) {
        console.log(`[mainStore] addCategory: 🆕 Автоматически добавляю виджет категории на дашборд: ${newWidgetKey}`);
        dashboardLayout.value.push(newWidgetKey);
    }
    
    return res.data;
  }

  async function batchUpdateEntities(path, items){
    try{
      const res = await axios.put(`${API_BASE_URL}/${path}/batch-update`, items);
      if (path==='accounts')         accounts.value = res.data;
      else if (path==='companies')   companies.value = res.data;
      else if (path==='contractors') contractors.value = res.data;
      else if (path==='projects')    projects.value = res.data;
    }catch(e){
      console.error(`Ошибка пакетного обновления для ${path}:`, e);
      await fetchAllEntities();
    }
  }

  async function checkAuth() {
  console.log('[ЖУРНАЛ] checkAuth: 🔍 Проверяю сессию (GET /api/auth/me)...');
  try {
    isAuthLoading.value = true;
    const res = await axios.get(`${API_BASE_URL}/auth/me`);
      user.value = res.data; 
      console.log('[ЖУРНАЛ] checkAuth: ✅ Пользователь найден:', user.value.name);
      
    } catch (error) {
      console.log('[ЖУРНАЛ] checkAuth: ❌ Пользователь не авторизован.');
      user.value = null;
    } finally {
      isAuthLoading.value = false;
    }
  }

async function logout() {
    axios.post(`${API_BASE_URL}/auth/logout`)
      .then(() => {
        console.log('[ЖУРНАЛ] logout: ✅ Серверная сессия успешно завершена (в фоне).');
      })
      .catch(error => {
        console.error('Ошибка при выходе с сервера (но локальный выход уже произошел):', error);
      });

    user.value = null; 
    displayCache.value = {};
    calculationCache.value = {};
    console.log('[ЖУРНАЛ] logout: ✅ ЛОКАЛЬНЫЙ выход выполнен (мгновенно), кэши очищены.');
  }
  
  return {
    accounts, companies, contractors, projects, categories,
    operationsCache: displayCache,
    displayCache, calculationCache,
    allWidgets, dashboardLayout,
    projection,
    dashboardForecastState,
    user,
    isAuthLoading,

    currentAccountBalances, currentCompanyBalances, currentContractorBalances, currentProjectBalances,
    currentTotalBalance, futureTotalBalance, currentCategoryBreakdowns, dailyChartData,
    futureAccountBalances, futureCompanyBalances, futureContractorBalances, futureProjectBalances,
    currentOps, 
    
    currentTransfers,
    getCategoryById,

    getOperationsForDay, 

    setToday, replaceWidget,
    setForecastState,
    fetchAllEntities, fetchOperations, refreshDay, 
    
    addOperation, deleteOperation, moveOperation,
    addAccount, addCompany, addContractor, addProject, addCategory,
    batchUpdateEntities,

    computeTotalDaysForMode,
    updateFutureProjection, updateFutureProjectionByMode, setProjectionRange,
    
    loadCalculationData,
    fetchCalculationRange, 
    updateProjectionFromCalculationData,

    createTransfer, updateTransfer, 

    fetchOperationsRange, 
    updateFutureProjectionWithData,

    startAutoRefresh, stopAutoRefresh, forceRefreshAll,

    getFirstFreeCellIndex, 
    _parseDateKey, 
    _getDateKey, 

    allOperationsFlat,
    displayOperationsFlat,
    
    importOperations,
    
    checkAuth,
    logout,
  };
});
