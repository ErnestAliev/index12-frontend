/**
 * * --- МЕТКА ВЕРСИИ: v21.1 - GRAPH LOAD FIX ---
 * * ВЕРСИЯ: 21.1 - Исправление загрузки графиков при старте
 * * ДАТА: 2025-11-20
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (BUG) В fetchOperationsRange добавлено обновление calculationCache.
 * Ранее графики были пустыми до первого действия пользователя.
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
  console.log('--- mainStore.js v21.1 (Graph Load Fix) ЗАГРУЖЕН ---'); 
  
  const user = ref(null); 
  const isAuthLoading = ref(true); 
  
  const displayCache = ref({});
  const calculationCache = ref({});
  const accounts    = ref([]);
  const companies   = ref([]);
  const contractors = ref([]);
  const projects    = ref([]);
  const individuals = ref([]); 
  const categories  = ref([]);
  const todayDayOfYear = ref(0);
  const currentYear = ref(new Date().getFullYear());

  // Полный список доступных виджетов
  const staticWidgets = ref([
    { key: 'currentTotal', name: 'Всего (на тек. момент)' },
    { key: 'accounts',     name: 'Мои счета' },
    { key: 'companies',    name: 'Мои компании' },
    { key: 'contractors',  name: 'Мои контрагенты' },
    { key: 'projects',     name: 'Мои проекты' },
    { key: 'futureTotal',  name: 'Всего (с уч. будущих)' },
    { key: 'liabilities',  name: 'Мои обязательства' },
    { key: 'incomeList',   name: 'Мои доходы' },
    { key: 'expenseList',  name: 'Мои расходы' },
    { key: 'individuals',  name: 'Мои Физлица' },
    { key: 'categories',   name: 'Категории' }, 
  ]);

  // --- ХЕЛПЕРЫ КАТЕГОРИЙ ---
  const _isTransferCategory = (cat) => {
    if (!cat) return false;
    const name = cat.name.toLowerCase().trim();
    return name === 'перевод' || name === 'transfer';
  };

  // Поиск системных категорий для расчетов
  const getPrepaymentCategoryIds = computed(() => {
    return categories.value
      .filter(c => {
        const n = c.name.toLowerCase().trim();
        return n.includes('предоплата') || n.includes('prepayment') || n.includes('аванс');
      })
      .map(c => c._id);
  });

  const getActCategoryIds = computed(() => {
    return categories.value
      .filter(c => {
        const n = c.name.toLowerCase().trim();
        return n.includes('акт') || n.includes('act') || n.includes('выполненных работ');
      })
      .map(c => c._id);
  });

  const visibleCategories = computed(() => {
    return categories.value.filter(c => {
      if (_isTransferCategory(c)) return false;
      if (c.isPrepayment) return false; 
      const n = c.name.toLowerCase().trim();
      if (n === 'предоплата' || n === 'prepayment') return false;
      return true;
    });
  });

  const visibleContractors = computed(() => {
      return contractors.value.filter(c => {
          const n = c.name.toLowerCase().trim();
          return n !== 'физлица' && n !== 'individuals';
      });
  });

  const allWidgets = computed(() => {
    const transferCategory = categories.value.find(_isTransferCategory);
    const cats = [];
    if (transferCategory) {
       cats.push({ key: `cat_${transferCategory._id}`, name: transferCategory.name });
    }
     return [...staticWidgets.value, ...cats];
  });

  // Настройки дашборда
  const savedLayout = localStorage.getItem('dashboardLayout');
  const dashboardLayout = ref(savedLayout ? JSON.parse(savedLayout) : [
    'currentTotal', 'accounts', 'companies', 'contractors', 'projects', 'futureTotal'
  ]);
  
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

  const allOperationsFlat = computed(() => {
    const allOps = [];
    Object.values(calculationCache.value).forEach(dayOps => {
      if (Array.isArray(dayOps)) {
        dayOps.forEach(op => { if (op && typeof op === 'object') { allOps.push(op); } });
      }
    });
    return allOps;
  });

  // --- DAILY CHART DATA (SPLIT INCOME / PREPAYMENT) ---
  const dailyChartData = computed(() => {
    const byDateKey = {};
    const prepayIds = getPrepaymentCategoryIds.value;
    
    for (const op of allOperationsFlat.value) {
      if (!op?.dateKey) continue;
      if (!byDateKey[op.dateKey]) byDateKey[op.dateKey] = { income:0, prepayment:0, expense:0, dayTotal:0 };
      
      if (!isTransfer(op)) {
        if (op.type === 'income') {
            // Проверяем, является ли доходом предоплаты
            const catId = op.categoryId?._id || op.categoryId;
            const prepId = op.prepaymentId?._id || op.prepaymentId;
            const isPrepay = (catId && prepayIds.includes(catId)) || 
                             (prepId && prepayIds.includes(prepId)) ||
                             (op.categoryId && op.categoryId.isPrepayment);
            
            if (isPrepay) {
                byDateKey[op.dateKey].prepayment += (op?.amount || 0);
            } else {
                byDateKey[op.dateKey].income += (op?.amount || 0);
            }
            byDateKey[op.dateKey].dayTotal += (op?.amount || 0);
        }
        else if (op.type === 'expense') {
            byDateKey[op.dateKey].expense += Math.abs(op.amount || 0);
            byDateKey[op.dateKey].dayTotal -= Math.abs(op.amount || 0);
        }
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
        income: rec.income,
        prepayment: rec.prepayment, 
        expense: rec.expense, 
        closingBalance: running,
        date: _parseDateKey(dateKey)
      });
    }
    return chart;
  });

  // ... Rest of the store getters/actions ...
  
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

  const opsUpToForecast = computed(() => {
    const baseToday = todayDayOfYear.value || 0;
    const currentYearVal = currentYear.value;
    let endDate;
    if (projection.value?.rangeEndDate) { endDate = new Date(projection.value.rangeEndDate); } 
    else { endDate = new Date(currentYearVal, 0, baseToday); }
    
    return allOperationsFlat.value.filter(op => {
       if (!op?.dateKey) return false;
       const opDate = _parseDateKey(op.dateKey);
       return opDate <= endDate;
    });
  });

  // --- РАСЧЕТ ОБЯЗАТЕЛЬСТВ ---
  const liabilitiesWeOwe = computed(() => {
    const prepayIds = getPrepaymentCategoryIds.value;
    const actIds = getActCategoryIds.value;
    if (prepayIds.length === 0 && actIds.length === 0) return 0;
    let totalPrepaymentReceived = 0;
    let totalActsSum = 0;
    for (const op of currentOps.value) {
      if (isTransfer(op)) continue;
      const catId = op.categoryId?._id || op.categoryId;
      const prepId = op.prepaymentId?._id || op.prepaymentId;
      const isPrepay = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId));
      const isAct = (catId && actIds.includes(catId));
      if (isPrepay && op.type === 'income') totalPrepaymentReceived += (op.amount || 0);
      if (isAct) totalActsSum += Math.abs(op.amount || 0);
    }
    return totalPrepaymentReceived - totalActsSum;
  });

  const liabilitiesTheyOwe = computed(() => {
    const prepayIds = getPrepaymentCategoryIds.value;
    if (prepayIds.length === 0) return 0;
    let totalDealSum = 0;
    let receivedSum = 0;
    for (const op of currentOps.value) {
      if (isTransfer(op)) continue;
      const catId = op.categoryId?._id || op.categoryId;
      const prepId = op.prepaymentId?._id || op.prepaymentId;
      const isPrepay = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId));
      if (isPrepay && op.type === 'income') {
          const dealTotal = op.totalDealAmount || 0;
          if (dealTotal > 0) {
              totalDealSum += dealTotal;
              receivedSum += (op.amount || 0);
          }
      }
    }
    return totalDealSum - receivedSum;
  });

  const liabilitiesWeOweFuture = computed(() => {
    const prepayIds = getPrepaymentCategoryIds.value;
    const actIds = getActCategoryIds.value;
    if (prepayIds.length === 0 && actIds.length === 0) return 0;
    let totalPrepaymentReceived = 0;
    let totalActsSum = 0;
    for (const op of opsUpToForecast.value) {
      if (isTransfer(op)) continue;
      const catId = op.categoryId?._id || op.categoryId;
      const prepId = op.prepaymentId?._id || op.prepaymentId;
      const isPrepay = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId));
      const isAct = (catId && actIds.includes(catId));
      if (isPrepay && op.type === 'income') totalPrepaymentReceived += (op.amount || 0);
      if (isAct) totalActsSum += Math.abs(op.amount || 0);
    }
    return totalPrepaymentReceived - totalActsSum;
  });

  const liabilitiesTheyOweFuture = computed(() => {
    const prepayIds = getPrepaymentCategoryIds.value;
    if (prepayIds.length === 0) return 0;
    let totalDealSum = 0;
    let receivedSum = 0;
    for (const op of opsUpToForecast.value) {
      if (isTransfer(op)) continue;
      const catId = op.categoryId?._id || op.categoryId;
      const prepId = op.prepaymentId?._id || op.prepaymentId;
      const isPrepay = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId));
      if (isPrepay && op.type === 'income') {
          const dealTotal = op.totalDealAmount || 0;
          if (dealTotal > 0) {
              totalDealSum += dealTotal;
              receivedSum += (op.amount || 0);
          }
      }
    }
    return totalDealSum - receivedSum;
  });

  // --- СПИСКИ ОПЕРАЦИЙ ---
  const currentTransfers = computed(() => {
    const transfers = currentOps.value.filter(op => isTransfer(op));
    return transfers.sort((a, b) => _parseDateKey(b.dateKey).getTime() - _parseDateKey(a.dateKey).getTime());
  });
  const currentIncomes = computed(() => {
    const incomes = currentOps.value.filter(op => !isTransfer(op) && op.type === 'income');
    return incomes.sort((a, b) => _parseDateKey(b.dateKey).getTime() - _parseDateKey(a.dateKey).getTime());
  });
  const currentExpenses = computed(() => {
    const expenses = currentOps.value.filter(op => !isTransfer(op) && op.type === 'expense');
    return expenses.sort((a, b) => _parseDateKey(b.dateKey).getTime() - _parseDateKey(a.dateKey).getTime());
  });

  const futureOps = computed(() => {
    const baseToday = todayDayOfYear.value || 0;
    const currentYearVal = currentYear.value;
    let endDate;
    if (projection.value?.rangeEndDate) { endDate = new Date(projection.value.rangeEndDate); } 
    else { endDate = new Date(currentYearVal, 0, baseToday); }
    const todayDate = new Date(currentYearVal, 0, baseToday);
    return allOperationsFlat.value.filter(op => {
      if (!op?.dateKey) return false;
      const opDate = _parseDateKey(op.dateKey);
      return opDate > todayDate && opDate <= endDate;
    });
  });

  const futureTransfers = computed(() => {
    const transfers = futureOps.value.filter(op => isTransfer(op));
    return transfers.sort((a, b) => _parseDateKey(a.dateKey).getTime() - _parseDateKey(b.dateKey).getTime());
  });
  const futureIncomes = computed(() => {
    const incomes = futureOps.value.filter(op => !isTransfer(op) && op.type === 'income');
    return incomes.sort((a, b) => _parseDateKey(a.dateKey).getTime() - _parseDateKey(b.dateKey).getTime());
  });
  const futureExpenses = computed(() => {
    const expenses = futureOps.value.filter(op => !isTransfer(op) && op.type === 'expense');
    return expenses.sort((a, b) => _parseDateKey(a.dateKey).getTime() - _parseDateKey(b.dateKey).getTime());
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

  const futureCategoryBreakdowns = computed(() => {
    const map = {};
    for (const c of categories.value) map[`cat_${c._id}`] = { income:0, expense:0, total:0 };
    for (const op of futureOps.value) {
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
    for (const op of futureOps.value) {
      if (isTransfer(op)) { _applyTransferToBalances(bal, op); continue; }
      if (!op?.accountId?._id) continue;
      const id = op.accountId._id;
      if (bal[id] === undefined) bal[id] = 0;
      bal[id] += (op?.amount || 0);
    }
    return accounts.value.map(a => ({ ...a, balance: bal[a._id] || 0 }));
  });
  
  const _applyTransferToCompanyBalances = (bal, op) => {
    const amt = Math.abs(Number(op?.amount) || 0);
    const fromId = op?.fromCompanyId?._id || op?.fromCompanyId || null;
    const toId   = op?.toCompanyId?._id   || op?.toCompanyId   || null;
    if (fromId) { if (bal[fromId] === undefined) bal[fromId] = 0; bal[fromId] -= amt; }
    if (toId) { if (bal[toId] === undefined) bal[toId] = 0; bal[toId] += amt; }
  };

  const currentCompanyBalances = computed(() => {
    const bal = {};
    for (const op of currentOps.value) {
      if (isTransfer(op)) { _applyTransferToCompanyBalances(bal, op); continue; }
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
    for (const op of futureOps.value) {
      if (isTransfer(op)) { _applyTransferToCompanyBalances(bal, op); continue; }
      if (!op?.companyId?._id) continue;
      const id = op.companyId._id;
      if (!bal[id]) bal[id] = 0;
      bal[id] += (op?.amount || 0);
    }
    return (companies.value||[]).map(c => ({ ...c, balance: bal[c._id] || 0 }));
  });

  const _applyTransferToIndividualBalances = (bal, op) => {
    const amt = Math.abs(Number(op?.amount) || 0);
    const fromId = op?.fromIndividualId?._id || op?.fromIndividualId || null;
    const toId   = op?.toIndividualId?._id   || op?.toIndividualId   || null;
    if (fromId) { if (bal[fromId] === undefined) bal[fromId] = 0; bal[fromId] -= amt; }
    if (toId) { if (bal[toId] === undefined) bal[toId] = 0; bal[toId] += amt; }
  };

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
    for (const op of futureOps.value) {
      if (isTransfer(op)) continue;
      if (!op?.contractorId?._id) continue;
      const id = op.contractorId._id;
      if (!bal[id]) bal[id] = 0;
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
    for (const op of futureOps.value) {
      if (isTransfer(op)) continue;
      if (!op?.projectId?._id) continue;
      const id = op.projectId._id;
      if (!bal[id]) bal[id] = 0;
      bal[id] += (op?.amount || 0);
    }
    return (projects.value||[]).map(p => ({ ...p, balance: bal[p._id] || 0 }));
  });

  const currentIndividualBalances = computed(() => {
    const bal = {};
    for (const op of currentOps.value) {
      if (isTransfer(op)) { _applyTransferToIndividualBalances(bal, op); continue; }
      if (!op?.individualId?._id) continue;
      const id = op.individualId._id;
      if (!bal[id]) bal[id] = 0;
      bal[id] += (op?.amount || 0);
    }
    return (individuals.value||[]).map(i => ({ ...i, balance: bal[i._id] || 0 }));
  });
  const futureIndividualBalances = computed(() => {
    const bal = {};
    const currentBalances = currentIndividualBalances.value;
    for (const individual of currentBalances) { bal[individual._id] = individual.balance || 0; }
    for (const op of futureOps.value) {
      if (isTransfer(op)) { _applyTransferToIndividualBalances(bal, op); continue; }
      if (!op?.individualId?._id) continue;
      const id = op.individualId._id;
      if (!bal[id]) bal[id] = 0;
      bal[id] += (op?.amount || 0);
    }
    return (individuals.value||[]).map(i => ({ ...i, balance: bal[i._id] || 0 }));
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
    let total = currentTotalBalance.value || 0;
    for (const op of futureOps.value) { 
       if (!isTransfer(op)) total += (op?.amount || 0); 
    }
    return total;
  });


  async function updateProjectionFromCalculationData(mode, today = new Date()) {
    const base = new Date(today);
    base.setHours(0, 0, 0, 0);
    const { startDate, endDate } = _calculateDateRangeWithYear(mode, base);
    let futureIncomeSum = 0;
    let futureExpenseSum = 0;
    const opsInRange = allOperationsFlat.value.filter(op => {
        if (!op?.dateKey) return false;
        const opDate = _parseDateKey(op.dateKey);
        return opDate > base && opDate <= endDate;
    });
    for (const op of opsInRange) { 
        if (!isTransfer(op)) {
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
    try {
      const promises = [];
      const dateKeysToFetch = [];
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = _getDateKey(d);
        // Если нет данных ни в кэше отображения, ни в кэше расчетов - грузим
        if (!displayCache.value[dateKey]) {
          dateKeysToFetch.push(dateKey);
          promises.push(axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`));
        }
      }
      if (promises.length === 0) {
        // Данные уже есть, но нужно убедиться, что они в обоих кэшах актуальны?
        // Нет, если они есть в displayCache, считаем что они есть.
        // Просто обновим реактивность.
        displayCache.value = { ...displayCache.value };
        calculationCache.value = { ...calculationCache.value }; // <--- Убеждаемся
        return;
      }
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
      
      // 🟢 ВАЖНОЕ ИСПРАВЛЕНИЕ: Обновляем ОБА кэша
      displayCache.value = { ...displayCache.value, ...tempCache };
      calculationCache.value = { ...calculationCache.value, ...tempCache }; 

    } catch (error) {
      if (error.response && error.response.status === 401) user.value = null;
    }
  }

  const _syncCaches = (key, ops) => {
      displayCache.value[key] = [...ops];
      calculationCache.value[key] = [...ops];
      displayCache.value = { ...displayCache.value };
      calculationCache.value = { ...calculationCache.value };
  };

  async function updateFutureProjectionWithData(mode, today = new Date()) {
    const base = new Date(today); base.setHours(0, 0, 0, 0);
    const { startDate, endDate } = _calculateDateRangeWithYear(mode, base);
    await fetchOperationsRange(startDate, endDate); 
    await updateProjectionFromCalculationData(mode, today); 
  }
  function updateFutureProjection({ mode, totalDays, today = new Date() }) { updateFutureTotals(); }
  function updateFutureTotals() {
    const _ = futureTotalBalance.value;
    const __ = futureAccountBalances.value;
    const ___ = futureCompanyBalances.value;
    const ____ = futureContractorBalances.value;
    const _____ = futureProjectBalances.value;
    const ______ = futureIndividualBalances.value;
    const _______ = futureCategoryBalances.value;
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
    projection.value = {
      mode:'custom', 
      totalDays: Math.max(1, Math.floor((end-start)/86400000)+1),
      rangeStartDate:start, 
      rangeEndDate:end, 
      futureIncomeSum: 0 
    };
  }

  async function fetchAllEntities(){
    try{
      const [accRes, compRes, contrRes, projRes, indRes, catRes, prepRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/accounts`),
        axios.get(`${API_BASE_URL}/companies`),
        axios.get(`${API_BASE_URL}/contractors`),
        axios.get(`${API_BASE_URL}/projects`),
        axios.get(`${API_BASE_URL}/individuals`), 
        axios.get(`${API_BASE_URL}/categories`),
        axios.get(`${API_BASE_URL}/prepayments`),
      ]);
      
      accounts.value    = accRes.data; 
      companies.value   = compRes.data;
      contractors.value = contrRes.data; 
      projects.value    = projRes.data;
      individuals.value = indRes.data; 
      
      const normalCategories = catRes.data.map(c => ({ ...c, isPrepayment: false }));
      const prepaymentCategories = prepRes.data.map(p => ({ ...p, isPrepayment: true }));
      
      categories.value  = [...normalCategories, ...prepaymentCategories];

    }catch(e){ 
        if (e.response && e.response.status === 401) user.value = null;
    }
  }
  function getOperationsForDay(dateKey) { return displayCache.value[dateKey] || []; }

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
            fromIndividualId: expenseOp.individualId, toIndividualId: incomeOp.individualId, 
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
    if (!dateKey) return;
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
      if (e.response && e.response.status === 401) user.value = null;
    }
  }

  async function refreshDay(dateKey) {
    if (!dateKey) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`);
      const raw = Array.isArray(res.data) ? res.data.slice() : [];
      const processedOps = _mergeTransfers(raw).map(op => ({
        ...op,
        dateKey: dateKey,
        date: op.date || _parseDateKey(dateKey) 
      }));
      _syncCaches(dateKey, processedOps);
    } catch (e) {
      if (e.response && e.response.status === 401) user.value = null;
    }
    updateFutureTotals();
  }

  async function moveOperation(operation, oldDateKey, newDateKey, desiredCellIndex){
    if (!oldDateKey || !newDateKey) return;
    if (!displayCache.value[oldDateKey]) await fetchOperations(oldDateKey);
    if (!displayCache.value[newDateKey]) await fetchOperations(newDateKey);
    const targetIndex = Number.isInteger(desiredCellIndex) ? desiredCellIndex : 0;
    if (oldDateKey === newDateKey) {
       const ops = [...(displayCache.value[oldDateKey] || [])];
       const sourceOp = ops.find(o => o._id === operation._id);
       const targetOp = ops.find(o => o.cellIndex === targetIndex && o._id !== operation._id);
       if (sourceOp) {
           if (targetOp) {
               const originalSourceIndex = sourceOp.cellIndex;
               sourceOp.cellIndex = targetIndex;
               targetOp.cellIndex = originalSourceIndex;
               _syncCaches(oldDateKey, ops);
               Promise.all([
                  axios.put(`${API_BASE_URL}/events/${sourceOp._id}`, { cellIndex: targetIndex }),
                  axios.put(`${API_BASE_URL}/events/${targetOp._id}`, { cellIndex: originalSourceIndex })
               ]).catch(e => refreshDay(oldDateKey));
           } else {
               sourceOp.cellIndex = targetIndex;
               _syncCaches(oldDateKey, ops);
               axios.put(`${API_BASE_URL}/events/${sourceOp._id}`, { cellIndex: targetIndex })
                 .catch(e => refreshDay(oldDateKey));
           }
       }
    } else {
       let oldOps = [...(displayCache.value[oldDateKey] || [])];
       const sourceOpData = oldOps.find(o => o._id === operation._id);
       oldOps = oldOps.filter(o => o._id !== operation._id);
       _syncCaches(oldDateKey, oldOps);
       let newOps = [...(displayCache.value[newDateKey] || [])];
       const occupant = newOps.find(o => o.cellIndex === targetIndex);
       let finalIndex = targetIndex;
       if (occupant) {
           const usedIndices = new Set(newOps.map(o => o.cellIndex));
           while(usedIndices.has(finalIndex)) finalIndex++;
       }
       const moved = { 
          ...sourceOpData, 
          dateKey: newDateKey, 
          date: _parseDateKey(newDateKey),
          cellIndex: finalIndex 
       };
       newOps.push(moved);
       _syncCaches(newDateKey, newOps);
       axios.put(`${API_BASE_URL}/events/${moved._id}`, { 
          dateKey: newDateKey, 
          cellIndex: finalIndex,
          date: moved.date 
       }).catch(e => { refreshDay(oldDateKey); refreshDay(newDateKey); });
    }
    if (projection.value.mode) {
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
    }
  }

  function _generateTransferGroupId(){ return `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

  async function createTransfer(transferData) {
    try {
      const finalDate = new Date(transferData.date);
      const dateKey = _getDateKey(finalDate);
      const cellIndex = await getFirstFreeCellIndex(dateKey);
      const transferCategory = await _getOrCreateTransferCategory();
      const response = await axios.post(`${API_BASE_URL}/transfers`, {
        ...transferData,
        dateKey: dateKey, 
        cellIndex: cellIndex,
        categoryId: transferData.categoryId || transferCategory
      });
      await refreshDay(dateKey);
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async function updateTransfer(transferId, transferData) {
    try {
      const finalDate = new Date(transferData.date);
      const newDateKey = _getDateKey(finalDate);
      const oldOp = allOperationsFlat.value.find(o => o._id === transferId);
      let newCellIndex;
      if (oldOp && oldOp.dateKey === newDateKey) {
        newCellIndex = oldOp.cellIndex || 0;
      } else {
        newCellIndex = await getFirstFreeCellIndex(newDateKey);
      }
      const response = await axios.put(`${API_BASE_URL}/events/${transferId}`, {
        ...transferData,
        dateKey: newDateKey, 
        cellIndex: newCellIndex,
        type: 'transfer',
        isTransfer: true
      });
      if (oldOp && oldOp.dateKey !== newDateKey) await refreshDay(oldOp.dateKey);
      await refreshDay(newDateKey);
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async function updateOperation(opId, opData) {
    try {
      const finalDate = new Date(opData.date);
      const newDateKey = _getDateKey(finalDate);
      const oldOp = allOperationsFlat.value.find(o => o._id === opId);
      let newCellIndex;
      if (oldOp && oldOp.dateKey === newDateKey) {
        newCellIndex = oldOp.cellIndex || 0;
      } else {
        newCellIndex = await getFirstFreeCellIndex(newDateKey);
      }
      const response = await axios.put(`${API_BASE_URL}/events/${opId}`, {
        ...opData,
        dateKey: newDateKey,
        cellIndex: newCellIndex
      });
      if (oldOp && oldOp.dateKey !== newDateKey) await refreshDay(oldOp.dateKey);
      await refreshDay(newDateKey);
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async function deleteOperation(operation){
    const dateKey = operation.dateKey;
    if (!dateKey) return;
    const ops = (displayCache.value[dateKey] || []).filter(o => o._id !== operation._id);
    _syncCaches(dateKey, ops);
    updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
    try {
      if (isTransfer(operation) && operation._id2) {
          await Promise.all([
             axios.delete(`${API_BASE_URL}/events/${operation._id}`),
             axios.delete(`${API_BASE_URL}/events/${operation._id2}`)
          ]);
      } else {
          await axios.delete(`${API_BASE_URL}/events/${operation._id}`);
      }
    } catch(e) {
        refreshDay(dateKey);
    }
  }

  async function addOperation(op){
    if (!op.dateKey) return;
    await refreshDay(op.dateKey); 
    await fetchAllEntities();
    updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
  }

  async function deleteEntity(path, id, deleteOperations = false) {
      try {
          await axios.delete(`${API_BASE_URL}/${path}/${id}`, {
              params: { deleteOperations }
          });
          if (path === 'accounts') accounts.value = accounts.value.filter(i => i._id !== id);
          if (path === 'companies') companies.value = companies.value.filter(i => i._id !== id);
          if (path === 'contractors') contractors.value = contractors.value.filter(i => i._id !== id);
          if (path === 'projects') projects.value = projects.value.filter(i => i._id !== id);
          if (path === 'individuals') individuals.value = individuals.value.filter(i => i._id !== id); 
          if (path === 'categories') categories.value = categories.value.filter(i => i._id !== id);
          if (deleteOperations) { await forceRefreshAll(); } else { await forceRefreshAll(); }
      } catch (error) {
          console.error('Ошибка удаления сущности:', error);
          throw error; 
      }
  }

  async function addCategory(name){
    const res = await axios.post(`${API_BASE_URL}/categories`, { name });
    categories.value.push(res.data); 
    return res.data;
  }
  async function addAccount(data) {
    let payload;
    if (typeof data === 'string') { payload = { name: data, initialBalance: 0 }; } 
    else { 
      payload = { 
        name: data.name, 
        initialBalance: data.initialBalance || 0, 
        companyId: data.companyId || null,
        individualId: data.individualId || null 
      }; 
    }
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
  async function addIndividual(name){
    const res = await axios.post(`${API_BASE_URL}/individuals`, { name });
    individuals.value.push(res.data); return res.data;
  }

  async function batchUpdateEntities(path, items){
    try{
      const res = await axios.put(`${API_BASE_URL}/${path}/batch-update`, items);
      if (path==='accounts')         accounts.value = res.data;
      else if (path==='companies')   companies.value = res.data;
      else if (path==='contractors') contractors.value = res.data;
      else if (path==='projects')    projects.value = res.data;
      else if (path==='individuals') individuals.value = res.data; 
      else if (path==='categories')  categories.value = res.data; 
    }catch(e){
      await fetchAllEntities();
    }
  }

  async function getFirstFreeCellIndex(dateKey, startIndex=0){
    if (!displayCache.value[dateKey]) await fetchOperations(dateKey); 
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

  let autoRefreshInterval = null;
  function startAutoRefresh(intervalMs = 30000) {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(async () => {
      try {
        await fetchAllEntities();
        if (projection.value.mode) {
          await loadCalculationData( 
            projection.value.mode,
            new Date(currentYear.value, 0, todayDayOfYear.value)
          );
        }
      } catch (error) {}
    }, intervalMs);
  }
  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }
  async function forceRefreshAll() {
    try {
      displayCache.value = {};
      calculationCache.value = {};
      await fetchAllEntities();
      if (projection.value.mode) {
        await loadCalculationData( 
          projection.value.mode,
          new Date(currentYear.value, 0, todayDayOfYear.value)
        );
      }
    } catch (error) {}
  }

  async function importOperations(operations, selectedIndices, progressCallback = () => {}) {
    try {
      const response = await axios.post(`${API_BASE_URL}/import/operations`, { 
        operations, 
        selectedRows: selectedIndices 
      });
      const createdOps = response.data;
      progressCallback(createdOps.length);
      await forceRefreshAll();
      return createdOps;
    } catch (error) {
      if (error.response && error.response.status === 401) user.value = null;
      throw error; 
    }
  }

  async function exportAllOperations() {
    try {
      const res = await axios.get(`${API_BASE_URL}/events/all-for-export`);
      return {
        operations: res.data, 
        initialBalance: totalInitialBalance.value || 0
      };
    } catch (e) {
      if (e.response && e.response.status === 401) user.value = null;
      throw e; 
    }
  }

  async function checkAuth() {
  try {
    isAuthLoading.value = true;
    const res = await axios.get(`${API_BASE_URL}/auth/me`);
      user.value = res.data; 
    } catch (error) {
      user.value = null;
    } finally {
      isAuthLoading.value = false;
    }
  }

  async function logout() {
    axios.post(`${API_BASE_URL}/auth/logout`).then(() => {}).catch(error => {});
    user.value = null; 
    displayCache.value = {};
    calculationCache.value = {};
  }
  
  // --- Функции для расчета Projection ---
  function computeTotalDaysForMode(mode, baseDate) {
      return getViewModeInfo(mode).total;
  }
  
  async function loadCalculationData(mode, date) {
      await updateFutureProjectionWithData(mode, date);
  }

  return {
    accounts, companies, contractors, projects, categories,
    visibleCategories, 
    visibleContractors,
    individuals, 
    operationsCache: displayCache,
    displayCache, calculationCache,
    allWidgets, dashboardLayout,
    projection,
    dashboardForecastState,
    user,
    isAuthLoading,

    currentAccountBalances, currentCompanyBalances, currentContractorBalances, currentProjectBalances,
    currentIndividualBalances, 
    currentTotalBalance, futureTotalBalance, currentCategoryBreakdowns, dailyChartData,
    futureAccountBalances, futureCompanyBalances, futureContractorBalances, futureProjectBalances,
    futureIndividualBalances, 
    
    liabilitiesWeOwe,
    liabilitiesTheyOwe,
    liabilitiesWeOweFuture,
    liabilitiesTheyOweFuture,
    
    getPrepaymentCategoryIds,
    getActCategoryIds,
    
    currentOps, 
    
    currentTransfers, futureTransfers,
    
    currentIncomes, futureIncomes,
    currentExpenses, futureExpenses,

    getCategoryById,
    futureCategoryBreakdowns,

    getOperationsForDay, 

    setToday, replaceWidget,
    setForecastState,
    fetchAllEntities, fetchOperations, refreshDay, 
    
    addOperation, deleteOperation, moveOperation,
    addAccount, addCompany, addContractor, addProject, addCategory,
    addIndividual, 
    deleteEntity,
    batchUpdateEntities,

    computeTotalDaysForMode,
    updateFutureProjection, updateFutureProjectionByMode, setProjectionRange,
    
    loadCalculationData,
    updateProjectionFromCalculationData,

    createTransfer, updateTransfer, updateOperation,

    fetchOperationsRange, 
    updateFutureProjectionWithData,

    startAutoRefresh, stopAutoRefresh, forceRefreshAll,

    getFirstFreeCellIndex, 
    _parseDateKey, 
    _getDateKey, 

    allOperationsFlat,
    displayOperationsFlat,
    
    importOperations,
    exportAllOperations, 
    
    checkAuth,
    logout,
  };
});
