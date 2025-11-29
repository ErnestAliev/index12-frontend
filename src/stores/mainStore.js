/**
 * * --- МЕТКА ВЕРСИИ: v29.11.05 - GLOBAL SORT STATE ---
 * * ВЕРСИЯ: 29.11.05 - Добавлено глобальное состояние сортировки/фильтрации виджетов
 * * ДАТА: 2025-11-29
 * * ЧТО ИЗМЕНЕНО:
 * 1. (NEW) widgetSortMode, widgetFilterMode добавлены в state.
 * 2. (NEW) Actions: setWidgetSortMode, setWidgetFilterMode.
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import axios from 'axios';

axios.defaults.withCredentials = true; 
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
  console.log('--- mainStore.js v29.11.05 (Global Sort) ЗАГРУЖЕН ---'); 
  
  const user = ref(null); 
  const isAuthLoading = ref(true); 
  
  // --- СОСТОЯНИЕ ВИДЖЕТОВ (СОРТИРОВКА / ФИЛЬТР) ---
  const widgetSortMode = ref('default'); // 'default' | 'asc' | 'desc'
  const widgetFilterMode = ref('all');   // 'all' | 'positive' | 'negative' | 'nonZero'

  function setWidgetSortMode(mode) { widgetSortMode.value = mode; }
  function setWidgetFilterMode(mode) { widgetFilterMode.value = mode; }

  const snapshot = ref({
    totalBalance: 0,
    accountBalances: {},
    companyBalances: {},
    individualBalances: {},
    contractorBalances: {},
    projectBalances: {},
    categoryTotals: {},
    timestamp: null 
  });

  const displayCache = ref({});
  const calculationCache = ref({});
  
  const accounts    = ref([]);
  const companies   = ref([]);
  const contractors = ref([]);
  const projects    = ref([]);
  const individuals = ref([]); 
  const categories  = ref([]);
  
  const todayDayOfYear = ref(0);
  const currentViewDate = ref(new Date());
  const currentYear = ref(new Date().getFullYear());

  const isHeaderExpanded = ref(false);
  function toggleHeaderExpansion() { isHeaderExpanded.value = !isHeaderExpanded.value; }

  const staticWidgets = ref([
    { key: 'currentTotal', name: 'Всего на счетах\nна текущий момент' }, 
    { key: 'accounts',     name: 'Мои счета' },
    { key: 'companies',    name: 'Мои компании' },
    { key: 'contractors',  name: 'Мои контрагенты' },
    { key: 'projects',     name: 'Мои проекты' },
    { key: 'futureTotal',  name: 'Всего на счетах\nс учетом будущих' }, 
    { key: 'liabilities',  name: 'Мои предоплаты' },
    { key: 'incomeList',   name: 'Мои доходы' },
    { key: 'expenseList',  name: 'Мои расходы' },
    { key: 'withdrawalList', name: 'Мои выводы' },
    { key: 'transfers',    name: 'Мои переводы' }, 
    { key: 'individuals',  name: 'Мои Физлица' },
    { key: 'categories',   name: 'Категории' },
  ]);

  // --- ХЕЛПЕРЫ ---
  const _getDayOfYear = (date) => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000);
    return Math.floor(diff / 86400000);
  };

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

  const savedToday = localStorage.getItem('todayDayOfYear');
  if (savedToday) {
    todayDayOfYear.value = parseInt(savedToday);
  }
  
  const _isTransferCategory = (cat) => {
    if (!cat) return false;
    const name = cat.name.toLowerCase().trim();
    return name === 'перевод' || name === 'transfer';
  };

  const _isInterCompanyCategory = (cat) => {
      if (!cat) return false;
      const name = cat.name.toLowerCase().trim();
      return ['меж.комп', 'межкомпаний', 'inter-comp', 'inter_company'].includes(name);
  };

  const _isInterCompanyOp = (op) => {
      if (!op || !op.categoryId) return false;
      const name = (op.categoryId.name || '').toLowerCase().trim();
      if (!name && typeof op.categoryId === 'string') {
          const cat = categories.value.find(c => c._id === op.categoryId);
          if (cat) {
              const n = cat.name.toLowerCase().trim();
              return ['меж.комп', 'межкомпаний', 'inter-comp'].includes(n);
          }
      }
      return ['меж.комп', 'межкомпаний', 'inter-comp'].includes(name);
  };

  const _sortByOrder = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.sort((a, b) => {
        const orderDiff = (a.order || 0) - (b.order || 0);
        if (orderDiff !== 0) return orderDiff;
        return (a._id || '').toString().localeCompare((b._id || '').toString());
    });
  };

  const retailIndividualId = computed(() => {
      const retail = individuals.value.find(i => {
          const n = i.name.trim().toLowerCase();
          return n === 'розничные клиенты' || n === 'розница';
      });
      return retail ? retail._id : null;
  });

  const realizationCategoryId = computed(() => {
      const cat = categories.value.find(c => c.name.trim().toLowerCase() === 'реализация');
      return cat ? cat._id : null;
  });
  
  const remainingDebtCategoryId = computed(() => {
      const cat = categories.value.find(c => c.name.trim().toLowerCase() === 'остаток долга');
      return cat ? cat._id : null;
  });

  const refundCategoryId = computed(() => {
      const cat = categories.value.find(c => c.name.trim().toLowerCase() === 'возврат');
      return cat ? cat._id : null;
  });

  const _isRetailWriteOff = (op) => {
      if (!op) return false;
      if (op.type !== 'expense') return false;
      if (op.accountId) return false; 
      
      const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
      if (indId && indId === retailIndividualId.value) return true;
      
      return false;
  };

  const _isRetailRefund = (op) => {
      if (!op) return false;
      if (op.type !== 'expense') return false;
      
      const catId = op.categoryId?._id || op.categoryId;
      if (catId && catId === refundCategoryId.value) {
          const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
          return indId && indId === retailIndividualId.value;
      }
      return false;
  };

  const prepaymentCategoryIdsSet = computed(() => {
    const ids = new Set();
    categories.value.forEach(c => {
        const n = c.name.toLowerCase().trim();
        if (n.includes('предоплата') || n.includes('prepayment') || n.includes('аванс')) {
            ids.add(c._id);
        }
    });
    return ids;
  });

  const getPrepaymentCategoryIds = computed(() => Array.from(prepaymentCategoryIdsSet.value));

  const getActCategoryIds = computed(() => {
    return categories.value
      .filter(c => {
        const n = c.name.toLowerCase().trim();
        return n.includes('акт') || n.includes('act') || n.includes('выполненных работ') || n.includes('реализация');
      })
      .map(c => c._id);
  });

  const visibleCategories = computed(() => {
    return categories.value.filter(c => {
      if (_isTransferCategory(c)) return false;
      if (_isInterCompanyCategory(c)) return false;
      if (c.isPrepayment) return false; 
      const n = c.name.toLowerCase().trim();
      if (n === 'предоплата' || n === 'prepayment') return false;
      return true;
    });
  });

  const visibleContractors = computed(() => {
      const myEntityNames = new Set([
          ...companies.value.map(c => c.name.toLowerCase().trim()),
          ...individuals.value.map(i => i.name.toLowerCase().trim())
      ]);

      return contractors.value.filter(c => {
          const n = c.name.toLowerCase().trim();
          if (n === 'физлица' || n === 'individuals') return false;
          if (myEntityNames.has(n)) return false;
          return true;
      });
  });

  const allWidgets = computed(() => staticWidgets.value);

  const savedLayout = localStorage.getItem('dashboardLayout');
  const dashboardLayout = ref(savedLayout ? JSON.parse(savedLayout) : [
    'currentTotal', 'accounts', 'companies', 'contractors', 'projects', 'futureTotal', 
    'transfers'
  ]);
  watch(dashboardLayout, (n) => localStorage.setItem('dashboardLayout', JSON.stringify(n)), { deep: true });

  const savedForecastState = localStorage.getItem('dashboardForecastState');
  const dashboardForecastState = ref(savedForecastState ? JSON.parse(savedForecastState) : {});
  watch(dashboardForecastState, (n) => localStorage.setItem('dashboardForecastState', JSON.stringify(n)), { deep: true });

  const savedProjection = localStorage.getItem('projection');
  const initialProjection = savedProjection ? JSON.parse(savedProjection) : {
    mode: '12d', totalDays: 12, rangeStartDate: null, rangeEndDate: null,
    futureIncomeSum: 0, futureExpenseSum: 0
  };
  const projection = ref(initialProjection);
  watch(projection, (n) => localStorage.setItem('projection', JSON.stringify(n)), { deep: true });
  
  function replaceWidget(i, key){ 
    if (i >= 0 && i < dashboardLayout.value.length) {
        if (!dashboardLayout.value.includes(key)) {
            dashboardLayout.value[i] = key; 
        }
    }
  }
  function setForecastState(widgetKey, value) {
    dashboardForecastState.value[widgetKey] = !!value;
  }
  
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

  const futureOps = computed(() => {
    const snapshotTime = snapshot.value.timestamp ? new Date(snapshot.value.timestamp).getTime() : Date.now();
    const cutOffTime = Math.max(snapshotTime, Date.now());

    let endDate;
    if (projection.value?.rangeEndDate) { endDate = new Date(projection.value.rangeEndDate).getTime(); } 
    else { endDate = Date.now() + 365*24*60*60*1000; }

    const result = [];
    for (const [dateKey, ops] of Object.entries(calculationCache.value)) {
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
    const byDateKey = {};
    const prepayIdsSet = prepaymentCategoryIdsSet.value;
    
    for (const [dateKey, ops] of Object.entries(calculationCache.value)) {
       if (!byDateKey[dateKey]) byDateKey[dateKey] = { income:0, prepayment:0, expense:0, withdrawal:0, dayTotal:0 };
       const dayRec = byDateKey[dateKey];

       if (Array.isArray(ops)) {
           for (const op of ops) {
               if (isTransfer(op)) continue;
               
               if (!op.accountId) continue; 

               const amt = op.amount || 0;
               const absAmt = Math.abs(amt);

               if (op.isWithdrawal) {
                   dayRec.withdrawal += absAmt;
                   dayRec.dayTotal -= absAmt;
               } else if (op.type === 'income') {
                   const catId = op.categoryId?._id || op.categoryId;
                   const prepId = op.prepaymentId?._id || op.prepaymentId;
                   const isPrepay = (catId && prepayIdsSet.has(catId)) || (prepId && prepayIdsSet.has(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
                   
                   if (isPrepay) dayRec.prepayment += amt;
                   else dayRec.income += amt;
                   dayRec.dayTotal += amt;
               } else if (op.type === 'expense') {
                   if (_isRetailWriteOff(op)) continue;

                   dayRec.expense += absAmt;
                   dayRec.dayTotal -= absAmt;
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

    let running = totalInitialBalance.value || 0;
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
  
  const currentOps = computed(() => {
    const now = snapshot.value.timestamp ? new Date(snapshot.value.timestamp) : new Date();
    return allOperationsFlat.value.filter(op => {
        if (!op?.date) return false;
        return new Date(op.date) <= now;
    });
  });

  async function fetchSnapshot() {
    try {
      const res = await axios.get(`${API_BASE_URL}/snapshot`);
      snapshot.value = res.data;
    } catch (e) {
      console.error('Failed to fetch snapshot', e);
    }
  }

  const _applyOptimisticSnapshotUpdate = (op, sign) => {
      const s = snapshot.value;
      const absAmt = Math.abs(op.amount || 0);

      const updateMap = (map, id, delta) => {
          if (!id) return;
          const key = (typeof id === 'object' ? id._id : id).toString();
          if (map[key] === undefined) map[key] = 0;
          map[key] += delta;
      };

      if (isTransfer(op)) {
          updateMap(s.accountBalances, op.fromAccountId, -absAmt * sign);
          updateMap(s.accountBalances, op.toAccountId, absAmt * sign);
          updateMap(s.companyBalances, op.fromCompanyId, -absAmt * sign);
          updateMap(s.companyBalances, op.toCompanyId, absAmt * sign);
          updateMap(s.individualBalances, op.fromIndividualId, -absAmt * sign);
          updateMap(s.individualBalances, op.toIndividualId, absAmt * sign);
      } else {
          if (_isRetailWriteOff(op)) return; 

          const isIncome = op.type === 'income';
          const signedAmt = (isIncome ? absAmt : -absAmt);
          const netChange = signedAmt * sign;

          if (op.accountId) {
              s.totalBalance += netChange;
              updateMap(s.accountBalances, op.accountId, netChange);
          }

          updateMap(s.companyBalances, op.companyId, netChange);
          updateMap(s.individualBalances, op.individualId, netChange);
          updateMap(s.individualBalances, op.counterpartyIndividualId, netChange);
          updateMap(s.contractorBalances, op.contractorId, netChange);
          updateMap(s.projectBalances, op.projectId, netChange);

          const catId = op.categoryId ? (typeof op.categoryId === 'object' ? op.categoryId._id : op.categoryId).toString() : null;
          if (catId) {
              if (!s.categoryTotals[catId]) s.categoryTotals[catId] = { income: 0, expense: 0, total: 0 };
              const catEntry = s.categoryTotals[catId];
              if (isIncome) {
                  catEntry.income += (absAmt * sign);
                  catEntry.total += (absAmt * sign);
              } else {
                  catEntry.expense += (absAmt * sign);
                  catEntry.total -= (absAmt * sign);
              }
          }
      }
  };

  const liabilitiesWeOwe = computed(() => {
    const prepayIds = getPrepaymentCategoryIds.value;
    const actIds = getActCategoryIds.value;
    const refundCatId = refundCategoryId.value; 
    
    let totalPrepaymentReceived = 0;
    let totalActsSum = 0;
    
    for (const op of currentOps.value) {
      if (isTransfer(op)) continue;
      if (op.isClosed) continue; 

      const catId = op.categoryId?._id || op.categoryId;
      const prepId = op.prepaymentId?._id || op.prepaymentId;
      
      const isPrepay = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId));
      const isAct = (catId && actIds.includes(catId));
      const isRefund = refundCatId && catId === refundCatId; 
      
      if (isPrepay && op.type === 'income') {
          totalPrepaymentReceived += (op.amount || 0);
      }
      
      if (isRefund && op.type === 'expense') {
          totalPrepaymentReceived -= Math.abs(op.amount || 0);
      }
      
      if (isAct && op.type === 'expense') {
          totalActsSum += Math.abs(op.amount || 0);
      }
    }
    const result = totalPrepaymentReceived - totalActsSum;
    return result > 0 ? result : 0;
  });

  const liabilitiesTheyOwe = computed(() => {
    let totalDealSum = 0;
    let receivedSum = 0;
    
    const prepayIds = getPrepaymentCategoryIds.value;
    const debtCatId = remainingDebtCategoryId.value;

    for (const op of currentOps.value) {
      if (isTransfer(op)) continue;
      if (op.isClosed) continue;

      const catId = op.categoryId?._id || op.categoryId;
      const prepId = op.prepaymentId?._id || op.prepaymentId;
      const isPrepay = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId));
      
      const isDebtPayment = debtCatId && catId === debtCatId;

      if ((isPrepay || isDebtPayment) && op.type === 'income') {
          const dealTotal = op.totalDealAmount || 0;
          if (dealTotal > 0) {
              totalDealSum += dealTotal;
          }
          receivedSum += (op.amount || 0);
      }
    }
    const result = totalDealSum - receivedSum;
    return result > 0 ? result : 0;
  });

  const liabilitiesWeOweFuture = computed(() => liabilitiesWeOwe.value);
  const liabilitiesTheyOweFuture = computed(() => liabilitiesTheyOwe.value);

  const currentTransfers = computed(() => currentOps.value.filter(op => isTransfer(op)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  const currentIncomes = computed(() => currentOps.value.filter(op => !isTransfer(op) && op.type === 'income' && !op.isWithdrawal && !_isInterCompanyOp(op)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  
  const currentExpenses = computed(() => currentOps.value.filter(op => !isTransfer(op) && op.type === 'expense' && !op.isWithdrawal && !_isInterCompanyOp(op) && !_isRetailWriteOff(op)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  
  const currentWithdrawals = computed(() => currentOps.value.filter(op => op.isWithdrawal).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

  const futureTransfers = computed(() => futureOps.value.filter(op => isTransfer(op)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
  const futureIncomes = computed(() => futureOps.value.filter(op => !isTransfer(op) && op.type === 'income' && !op.isWithdrawal && !_isInterCompanyOp(op)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
  const futureExpenses = computed(() => futureOps.value.filter(op => !isTransfer(op) && op.type === 'expense' && !op.isWithdrawal && !_isInterCompanyOp(op) && !_isRetailWriteOff(op)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
  const futureWithdrawals = computed(() => futureOps.value.filter(op => op.isWithdrawal).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));

  const getCategoryById = (id) => categories.value.find(c => c._id === id);

  const currentCategoryBreakdowns = computed(() => {
    const raw = snapshot.value.categoryTotals || {};
    const mapped = {};
    Object.keys(raw).forEach(id => { mapped[`cat_${id}`] = raw[id]; });
    return mapped;
  });

  const futureCategoryBreakdowns = computed(() => {
    const map = {}; 
    for (const op of futureOps.value) {
      if (isTransfer(op)) continue;
      if (!op?.categoryId) continue;
      const cId = op.categoryId._id || op.categoryId;
      if (!map[cId]) map[cId] = { income: 0, expense: 0, total: 0 };
      const amt = Math.abs(op.amount || 0);
      if (op.type === 'income') { map[cId].income += (op.amount || 0); map[cId].total += (op.amount || 0); } 
      else if (op.type === 'expense') { map[cId].expense += amt; map[cId].total -= amt; }
    }
    const widgetMap = {};
    Object.keys(map).forEach(id => { widgetMap[`cat_${id}`] = map[id]; });
    return widgetMap;
  });

  const currentCategoryBalances = computed(() => categories.value.map(c => ({ ...c, balance: (snapshot.value.categoryTotals[c._id]?.total || 0) })));
  const futureCategoryBalances = computed(() => {
    const breakdown = futureCategoryBreakdowns.value;
    return categories.value.map(c => ({ ...c, balance: (breakdown[`cat_${c._id}`]?.total || 0) }));
  });
  
  const _calculateFutureEntityChange = (entityIdField) => {
      const futureMap = {}; 
      for (const op of futureOps.value) {
          if (_isRetailWriteOff(op)) continue;

          const amt = Math.abs(op.amount || 0);
          if (entityIdField === 'accountId' && !op.accountId && !op.fromAccountId && !op.toAccountId) continue;

          if (isTransfer(op)) {
              let fromId, toId;
              if (entityIdField === 'accountId') { fromId = op.fromAccountId; toId = op.toAccountId; }
              else if (entityIdField === 'companyId') { fromId = op.fromCompanyId; toId = op.toCompanyId; }
              else if (entityIdField === 'individualId') { fromId = op.fromIndividualId; toId = op.toIndividualId; }
              else continue; 
              fromId = fromId?._id || fromId; toId = toId?._id || toId;
              if (fromId) { if (futureMap[fromId] === undefined) futureMap[fromId] = 0; futureMap[fromId] -= amt; }
              if (toId) { if (futureMap[toId] === undefined) futureMap[toId] = 0; futureMap[toId] += amt; }
          } else {
              if (entityIdField === 'individualId') {
                  const ownerId = op.individualId?._id || op.individualId;
                  const contrId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
                  if (ownerId) { if (futureMap[ownerId] === undefined) futureMap[ownerId] = 0; if (op.type === 'income') futureMap[ownerId] += (op.amount || 0); else futureMap[ownerId] -= amt; }
                  if (contrId) { if (futureMap[contrId] === undefined) futureMap[contrId] = 0; if (op.type === 'income') futureMap[contrId] += (op.amount || 0); else futureMap[contrId] -= amt; }
              } else {
                  let id = op[entityIdField]; id = id?._id || id; if (!id) continue;
                  if (futureMap[id] === undefined) futureMap[id] = 0;
                  if (op.type === 'income') futureMap[id] += (op.amount || 0); else futureMap[id] -= amt;
              }
          }
      }
      return futureMap;
  };

  const futureContractorChanges = computed(() => {
    const futureMap = _calculateFutureEntityChange('contractorId');
    return contractors.value.map(c => ({ ...c, balance: futureMap[c._id] || 0 }));
  });

  const futureProjectChanges = computed(() => {
    const futureMap = _calculateFutureEntityChange('projectId');
    return projects.value.map(p => ({ ...p, balance: futureMap[p._id] || 0 }));
  });

  const futureIndividualChanges = computed(() => {
    const futureMap = _calculateFutureEntityChange('individualId');
    return individuals.value.map(i => ({ ...i, balance: futureMap[i._id] || 0 }));
  });
  
  const futureCategoryChanges = computed(() => futureCategoryBalances.value);

  const totalInitialBalance = computed(() => (accounts.value || []).reduce((s,a)=>s + (a.initialBalance||0), 0));
  
  const _calculateFutureEntityBalance = (snapshotMap, entityIdField) => {
      const futureMap = { ...snapshotMap }; 
      for (const op of futureOps.value) {
          if (_isRetailWriteOff(op)) continue;

          const amt = Math.abs(op.amount || 0);
          if (entityIdField === 'accountId' && !op.accountId && !op.fromAccountId && !op.toAccountId) continue;

          if (isTransfer(op)) {
              let fromId, toId;
              if (entityIdField === 'accountId') { fromId = op.fromAccountId; toId = op.toAccountId; }
              else if (entityIdField === 'companyId') { fromId = op.fromCompanyId; toId = op.toCompanyId; }
              else if (entityIdField === 'individualId') { fromId = op.fromIndividualId; toId = op.toIndividualId; }
              else continue; 
              fromId = fromId?._id || fromId; toId = toId?._id || toId;
              if (fromId) { if (futureMap[fromId] === undefined) futureMap[fromId] = 0; futureMap[fromId] -= amt; }
              if (toId) { if (futureMap[toId] === undefined) futureMap[toId] = 0; futureMap[toId] += amt; }
          } else {
              if (entityIdField === 'individualId') {
                  const ownerId = op.individualId?._id || op.individualId;
                  const contrId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
                  if (ownerId) { if (futureMap[ownerId] === undefined) futureMap[ownerId] = 0; if (op.type === 'income') futureMap[ownerId] += (op.amount || 0); else futureMap[ownerId] -= amt; }
                  if (contrId) { if (futureMap[contrId] === undefined) futureMap[contrId] = 0; if (op.type === 'income') futureMap[contrId] += (op.amount || 0); else futureMap[contrId] -= amt; }
              } else {
                  let id = op[entityIdField]; id = id?._id || id; if (!id) continue;
                  if (futureMap[id] === undefined) futureMap[id] = 0;
                  if (op.type === 'income') futureMap[id] += (op.amount || 0); else futureMap[id] -= amt;
              }
          }
      }
      return futureMap;
  };

  // 🟢 FIX: Добавлен initialBalance к snapshot
  const currentAccountBalances = computed(() => accounts.value.map(a => ({ 
      ...a, 
      balance: (snapshot.value.accountBalances[a._id] || 0) + (a.initialBalance || 0) 
  })));

  // 🟢 FIX: Добавлен initialBalance к future
  const futureAccountBalances = computed(() => {
    const futureMap = _calculateFutureEntityBalance(snapshot.value.accountBalances, 'accountId');
    return accounts.value.map(a => ({ 
        ...a, 
        balance: (futureMap[a._id] || 0) + (a.initialBalance || 0) 
    }));
  });
  
  const currentCompanyBalances = computed(() => {
      return companies.value.map(comp => {
          const linked = currentAccountBalances.value.filter(a => {
              const cId = (a.companyId && typeof a.companyId === 'object') ? a.companyId._id : a.companyId;
              return cId === comp._id;
          });
          const total = linked.reduce((sum, acc) => sum + acc.balance, 0);
          return { ...comp, balance: total };
      });
  });

  const futureCompanyBalances = computed(() => {
      return companies.value.map(comp => {
          const linked = futureAccountBalances.value.filter(a => {
              const cId = (a.companyId && typeof a.companyId === 'object') ? a.companyId._id : a.companyId;
              return cId === comp._id;
          });
          const total = linked.reduce((sum, acc) => sum + acc.balance, 0);
          return { ...comp, balance: total };
      });
  });

  const currentContractorBalances = computed(() => contractors.value.map(c => ({ ...c, balance: snapshot.value.contractorBalances[c._id] || 0 })));
  const futureContractorBalances = computed(() => {
    const futureMap = _calculateFutureEntityBalance(snapshot.value.contractorBalances, 'contractorId');
    return contractors.value.map(c => ({ ...c, balance: futureMap[c._id] || 0 }));
  });

  const currentProjectBalances = computed(() => projects.value.map(p => ({ ...p, balance: snapshot.value.projectBalances[p._id] || 0 })));
  const futureProjectBalances = computed(() => {
    const futureMap = _calculateFutureEntityBalance(snapshot.value.projectBalances, 'projectId');
    return projects.value.map(p => ({ ...p, balance: futureMap[p._id] || 0 }));
  });

  // 🟢 FIX: Учет начальных балансов связанных счетов для физлиц
  const currentIndividualBalances = computed(() => {
      return individuals.value.map(i => {
          const opsBalance = snapshot.value.individualBalances[i._id] || 0;
          
          const linkedAccounts = currentAccountBalances.value.filter(a => {
              const indId = (a.individualId && typeof a.individualId === 'object') ? a.individualId._id : a.individualId;
              return indId === i._id;
          });
          
          const accountsBalance = linkedAccounts.reduce((sum, acc) => sum + acc.balance, 0);
          return { ...i, balance: accountsBalance + opsBalance };
      });
  });

  const futureIndividualBalances = computed(() => {
      const futureOpsMap = _calculateFutureEntityBalance(snapshot.value.individualBalances, 'individualId');
      
      return individuals.value.map(i => {
          const opsBalance = futureOpsMap[i._id] || 0;
          
          const linkedAccounts = futureAccountBalances.value.filter(a => {
              const indId = (a.individualId && typeof a.individualId === 'object') ? a.individualId._id : a.individualId;
              return indId === i._id;
          });
          
          const accountsBalance = linkedAccounts.reduce((sum, acc) => sum + acc.balance, 0);
          return { ...i, balance: accountsBalance + opsBalance };
      });
  });

  const currentTotalBalance = computed(() => snapshot.value.totalBalance || 0);

  const futureTotalBalance = computed(() => {
    let total = currentTotalBalance.value;
    for (const op of futureOps.value) {
        if (isTransfer(op)) continue; 
        if (!op.accountId) continue;

        const amt = Math.abs(op.amount || 0);
        if (op.type === 'income') total += (op.amount || 0); else total -= amt;
    }
    return total;
  });

  async function updateProjectionFromCalculationData(mode, today = new Date()) {
    const base = new Date(today); base.setHours(0, 0, 0, 0);
    const { startDate, endDate } = _calculateDateRangeWithYear(mode, base);
    let futureIncomeSum = 0; let futureExpenseSum = 0;
    projection.value = { mode, totalDays: computeTotalDaysForMode(mode, base), rangeStartDate: startDate, rangeEndDate: endDate, futureIncomeSum, futureExpenseSum };
  }

  async function fetchOperationsRange(startDate, endDate) {
    try {
      const dateKeysToFetch = [];
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = _getDateKey(d);
        if (!displayCache.value[dateKey]) {
          dateKeysToFetch.push(dateKey);
        }
      }
      
      if (dateKeysToFetch.length === 0) return;

      const CHUNK_SIZE = 10;
      for (let i = 0; i < dateKeysToFetch.length; i += CHUNK_SIZE) {
          const chunk = dateKeysToFetch.slice(i, i + CHUNK_SIZE);
          
          const promises = chunk.map(dateKey => 
              axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`)
                   .then(res => ({ dateKey, data: res.data }))
                   .catch(() => ({ dateKey, data: [] }))
          );

          const results = await Promise.all(promises);
          
          for (const { dateKey, data } of results) {
              const raw = Array.isArray(data) ? data.slice() : [];
              const processedOps = _mergeTransfers(raw).map(op => ({ ...op, dateKey, date: op.date || _parseDateKey(dateKey) }));
              
              displayCache.value[dateKey] = processedOps;
              calculationCache.value[dateKey] = processedOps;
          }
          
          await new Promise(r => setTimeout(r, 10));
      }

    } catch (error) { 
        if (error.response && error.response.status === 401) user.value = null; 
    }
  }

  const _syncCaches = (key, ops) => {
      displayCache.value[key] = [...ops]; 
      calculationCache.value[key] = [...ops];
  };

  async function updateFutureProjectionWithData(mode, today = new Date()) {
    const base = new Date(today); base.setHours(0, 0, 0, 0);
    const { startDate, endDate } = _calculateDateRangeWithYear(mode, base);
    await fetchOperationsRange(startDate, endDate); 
    await updateProjectionFromCalculationData(mode, today); 
  }
  function updateFutureProjection({ mode, totalDays, today = new Date() }) {}
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
    const t0 = new Date(); t0.setHours(0,0,0,0);
    const start = new Date(startDate); start.setHours(0,0,0,0);
    const end   = new Date(endDate); end.setHours(0,0,0,0);
    projection.value = {
      mode:'custom', totalDays: Math.max(1, Math.floor((end-start)/86400000)+1),
      rangeStartDate:start, rangeEndDate:end, futureIncomeSum: 0 
    };
  }

  async function fetchAllEntities(){
    // 🟢 GUARD: Не загружать данные, если пользователь не авторизован
    if (!user.value) {
        return; 
    }

    try{
      const [accRes, compRes, contrRes, projRes, indRes, catRes, prepRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/accounts`), axios.get(`${API_BASE_URL}/companies`),
        axios.get(`${API_BASE_URL}/contractors`), axios.get(`${API_BASE_URL}/projects`),
        axios.get(`${API_BASE_URL}/individuals`), axios.get(`${API_BASE_URL}/categories`),
        axios.get(`${API_BASE_URL}/prepayments`),
      ]);
      
      accounts.value    = _sortByOrder(accRes.data); 
      companies.value   = _sortByOrder(compRes.data);
      contractors.value = _sortByOrder(contrRes.data); 
      projects.value    = _sortByOrder(projRes.data);
      individuals.value = _sortByOrder(indRes.data); 
      
      const normalCategories = catRes.data.map(c => ({ ...c, isPrepayment: false }));
      const prepaymentCategories = prepRes.data.map(p => ({ ...p, isPrepayment: true }));
      categories.value  = _sortByOrder([...normalCategories, ...prepaymentCategories]);
      
      await ensureSystemEntities();

      await fetchSnapshot();

      const availableKeys = new Set(allWidgets.value.map(w => w.key));
      categories.value.forEach(c => availableKeys.add(`cat_${c._id}`));

      const cleanLayout = dashboardLayout.value.filter(key => {
          return key.startsWith('placeholder_') || availableKeys.has(key);
      });
      
      if (cleanLayout.length !== dashboardLayout.value.length) {
          dashboardLayout.value = cleanLayout;
      }

    }catch(e){ if (e.response && e.response.status === 401) user.value = null; }
  }
  
  async function fetchOperations(dateKey, force = false) {
    if (!dateKey) return;
    if (displayCache.value[dateKey] && !force) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`);
      const raw = Array.isArray(res.data) ? res.data.slice() : [];
      const processedOps = _mergeTransfers(raw).map(op => ({ ...op, dateKey: dateKey, date: op.date || _parseDateKey(dateKey) }));
      displayCache.value[dateKey] = processedOps;
      calculationCache.value[dateKey] = processedOps;
    } catch (e) { if (e.response && e.response.status === 401) user.value = null; }
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
    if (!transferCategory) transferCategory = await addCategory('Перевод');
    return transferCategory._id;
  }

  async function refreshDay(dateKey) {
    if (!dateKey) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`);
      const raw = Array.isArray(res.data) ? res.data.slice() : [];
      const processedOps = _mergeTransfers(raw).map(op => ({ ...op, dateKey: dateKey, date: op.date || _parseDateKey(dateKey) }));
      _syncCaches(dateKey, processedOps);
    } catch (e) { if (e.response && e.response.status === 401) user.value = null; }
  }

  async function moveOperation(operation, oldDateKey, newDateKey, desiredCellIndex){
    if (!oldDateKey || !newDateKey) return;
    if (!displayCache.value[oldDateKey]) await fetchOperations(oldDateKey);
    if (!displayCache.value[newDateKey]) await fetchOperations(newDateKey);
    const targetIndex = Number.isInteger(desiredCellIndex) ? desiredCellIndex : 0;
    const isMerged = operation.isTransfer && operation._id2;

    if (oldDateKey === newDateKey) {
       const ops = [...(displayCache.value[oldDateKey] || [])];
       const sourceOp = ops.find(o => o._id === operation._id);
       const targetOp = ops.find(o => o.cellIndex === targetIndex && o._id !== operation._id);
       
       if (sourceOp) {
           if (targetOp) {
               const originalSourceIndex = sourceOp.cellIndex;
               sourceOp.cellIndex = targetIndex; targetOp.cellIndex = originalSourceIndex;
               _syncCaches(oldDateKey, ops);
               
               const promises = [
                  axios.put(`${API_BASE_URL}/events/${sourceOp._id}`, { cellIndex: targetIndex }),
                  axios.put(`${API_BASE_URL}/events/${targetOp._id}`, { cellIndex: originalSourceIndex })
               ];
               if (isMerged) promises.push(axios.put(`${API_BASE_URL}/events/${operation._id2}`, { cellIndex: targetIndex }));
               Promise.all(promises).catch(() => refreshDay(oldDateKey));
           } else {
               sourceOp.cellIndex = targetIndex;
               _syncCaches(oldDateKey, ops);
               const promises = [
                   axios.put(`${API_BASE_URL}/events/${sourceOp._id}`, { cellIndex: targetIndex })
               ];
               if (isMerged) promises.push(axios.put(`${API_BASE_URL}/events/${operation._id2}`, { cellIndex: targetIndex }));
               Promise.all(promises).catch(() => refreshDay(oldDateKey));
           }
       }
    } 
    else {
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
       const moved = { ...sourceOpData, dateKey: newDateKey, date: _parseDateKey(newDateKey), cellIndex: finalIndex };
       newOps.push(moved);
       _syncCaches(newDateKey, newOps);
       
       const now = new Date();
       const oldDate = _parseDateKey(oldDateKey);
       const newDate = _parseDateKey(newDateKey);
       const wasInSnapshot = oldDate <= now;
       const isInSnapshot = newDate <= now;
       
       const needsSnapshotUpdate = wasInSnapshot !== isInSnapshot;

       if (needsSnapshotUpdate) {
           const sign = isInSnapshot ? 1 : -1;
           const opToUpdate = moved || sourceOpData; 
           if (opToUpdate) {
                _applyOptimisticSnapshotUpdate(opToUpdate, sign);
           }
       }
       
       updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));

       const payload = { dateKey: newDateKey, cellIndex: finalIndex, date: moved.date };
       const promises = [
           axios.put(`${API_BASE_URL}/events/${moved._id}`, payload)
       ];
       if (isMerged) {
           promises.push(axios.put(`${API_BASE_URL}/events/${operation._id2}`, payload));
       }
       
       await Promise.all(promises)
            .then(() => {
                if (needsSnapshotUpdate) {
                    fetchSnapshot().catch(e => console.error("Background snapshot sync failed", e));
                }
            })
            .catch(() => { 
                refreshDay(oldDateKey); 
                refreshDay(newDateKey); 
                fetchSnapshot();
            });
    }
  }

  function _generateTransferGroupId(){ return `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

  async function createTransfer(transferData) {
    try {
      const finalDate = new Date(transferData.date);
      const dateKey = _getDateKey(finalDate);
      const transferCategory = await _getOrCreateTransferCategory();
      
      let expenseContractorId = null;
      let incomeContractorId = null;

      if (transferData.transferPurpose === 'inter_company') {
          const fromCompObj = companies.value.find(c => c._id === transferData.fromCompanyId);
          const toCompObj = companies.value.find(c => c._id === transferData.toCompanyId);

          if (toCompObj) {
              let c = contractors.value.find(cnt => cnt.name.toLowerCase() === toCompObj.name.toLowerCase());
              if (!c) c = await addContractor(toCompObj.name);
              expenseContractorId = c._id;
          }
          if (fromCompObj) {
              let c = contractors.value.find(cnt => cnt.name.toLowerCase() === fromCompObj.name.toLowerCase());
              if (!c) c = await addContractor(fromCompObj.name);
              incomeContractorId = c._id;
          }
      }

      const payload = {
          ...transferData,
          dateKey,
          categoryId: transferData.categoryId || transferCategory,
          expenseContractorId, 
          incomeContractorId
      };

      const response = await axios.post(`${API_BASE_URL}/transfers`, payload);
      const data = response.data;
      
      await refreshDay(dateKey);
      await fetchSnapshot();
      await fetchAllEntities(); 
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
      return data;

    } catch (error) { throw error; }
  }

  async function createEvent(eventData) {
    try {
      if (!eventData.dateKey && eventData.date) eventData.dateKey = _getDateKey(new Date(eventData.date));
      if (eventData.cellIndex === undefined) {
          eventData.cellIndex = await getFirstFreeCellIndex(eventData.dateKey);
      }
      const response = await axios.post(`${API_BASE_URL}/events`, eventData);
      const newOp = response.data;
      
      await refreshDay(newOp.dateKey);
      
      const now = new Date();
      if (new Date(newOp.date) <= now) {
          await fetchSnapshot();
      }
      
      if (projection.value.mode) await updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
      return newOp;
    } catch (error) { throw error; }
  }
  
  async function updateTransfer(transferId, transferData) {
    try {
      const finalDate = new Date(transferData.date);
      const newDateKey = _getDateKey(finalDate);
      const oldOp = allOperationsFlat.value.find(o => o._id === transferId);
      let newCellIndex;
      if (oldOp && oldOp.dateKey === newDateKey) newCellIndex = oldOp.cellIndex || 0;
      else newCellIndex = await getFirstFreeCellIndex(newDateKey);
      const response = await axios.put(`${API_BASE_URL}/events/${transferId}`, { ...transferData, dateKey: newDateKey, cellIndex: newCellIndex, type: 'transfer', isTransfer: true });
      
      if (oldOp && oldOp.dateKey !== newDateKey) await refreshDay(oldOp.dateKey);
      await refreshDay(newDateKey);
      
      await fetchSnapshot();
      
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
      return response.data;
    } catch (error) { throw error; }
  }

  async function updateOperation(opId, opData) {
    try {
      const finalDate = new Date(opData.date);
      const newDateKey = _getDateKey(finalDate);
      const oldOp = allOperationsFlat.value.find(o => o._id === opId);
      let newCellIndex;
      if (oldOp && oldOp.dateKey === newDateKey) newCellIndex = oldOp.cellIndex || 0;
      else newCellIndex = await getFirstFreeCellIndex(newDateKey);
      
      const updatePayload = { ...opData, dateKey: newDateKey, cellIndex: newCellIndex };
      
      const response = await axios.put(`${API_BASE_URL}/events/${opId}`, updatePayload);
      
      if (oldOp && oldOp.dateKey !== newDateKey) await refreshDay(oldOp.dateKey);
      await refreshDay(newDateKey);
      
      await fetchSnapshot();

      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
      return response.data;
    } catch (error) { throw error; }
  }

  async function deleteOperation(operation){
    const dateKey = operation.dateKey;
    if (!dateKey) return;
    
    try {
      if (isTransfer(operation) && operation._id2) await Promise.all([axios.delete(`${API_BASE_URL}/events/${operation._id}`), axios.delete(`${API_BASE_URL}/events/${operation._id2}`)]);
      else await axios.delete(`${API_BASE_URL}/events/${operation._id}`);
      
      await refreshDay(dateKey);
      await fetchSnapshot();
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
    } catch(e) { refreshDay(dateKey); }
  }

  async function addOperation(op){
    if (!op.dateKey) return;
    await refreshDay(op.dateKey); 
    await fetchSnapshot(); 
    updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
  }

  async function deleteEntity(path, id, deleteOperations = false) {
      try {
          await axios.delete(`${API_BASE_URL}/${path}/${id}`, { params: { deleteOperations } });
          if (path === 'accounts') accounts.value = accounts.value.filter(i => i._id !== id);
          if (path === 'companies') companies.value = companies.value.filter(i => i._id !== id);
          if (path === 'contractors') contractors.value = contractors.value.filter(i => i._id !== id);
          if (path === 'projects') projects.value = projects.value.filter(i => i._id !== id);
          if (path === 'individuals') individuals.value = individuals.value.filter(i => i._id !== id); 
          if (path === 'categories') categories.value = categories.value.filter(i => i._id !== id);
          if (deleteOperations) await forceRefreshAll(); else await forceRefreshAll();
      } catch (error) { throw error; }
  }

  async function addCategory(name){ const res = await axios.post(`${API_BASE_URL}/categories`, { name }); categories.value.push(res.data); return res.data; }
  async function addAccount(data) { let payload = (typeof data === 'string') ? { name: data, initialBalance: 0 } : { name: data.name, initialBalance: data.initialBalance || 0, companyId: data.companyId || null, individualId: data.individualId || null }; const res = await axios.post(`${API_BASE_URL}/accounts`, payload); accounts.value.push(res.data); return res.data; }
  async function addCompany(name){ const res = await axios.post(`${API_BASE_URL}/companies`, { name }); companies.value.push(res.data); return res.data; }
  async function addContractor(name){ const res = await axios.post(`${API_BASE_URL}/contractors`, { name }); contractors.value.push(res.data); return res.data; }
  async function addProject(name){ const res = await axios.post(`${API_BASE_URL}/projects`, { name }); projects.value.push(res.data); return res.data; }
  async function addIndividual(name){ const res = await axios.post(`${API_BASE_URL}/individuals`, { name }); individuals.value.push(res.data); return res.data; }

  async function batchUpdateEntities(path, items){ 
    try { 
      if (path === 'categories') {
          const normalCategories = items.filter(i => !i.isPrepayment);
          const prepaymentCategories = items.filter(i => i.isPrepayment);
          
          await Promise.all([
              axios.put(`${API_BASE_URL}/categories/batch-update`, normalCategories),
              axios.put(`${API_BASE_URL}/prepayments/batch-update`, prepaymentCategories)
          ]);
          
          await fetchAllEntities(); 
          return;
      }

      const res = await axios.put(`${API_BASE_URL}/${path}/batch-update`, items); 
      const sortedData = _sortByOrder(res.data);
      
      if (path==='accounts') accounts.value = sortedData; 
      else if (path==='companies') companies.value = sortedData; 
      else if (path==='contractors') contractors.value = sortedData; 
      else if (path==='projects') projects.value = sortedData; 
      else if (path==='individuals') individuals.value = sortedData; 
    } catch(e) { await fetchAllEntities(); } 
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
        if (projection.value.mode) await loadCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
      } catch (error) {}
    }, intervalMs);
  }
  function stopAutoRefresh() { if (autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; } }
  async function forceRefreshAll() {
    try {
      displayCache.value = {}; calculationCache.value = {};
      await fetchAllEntities();
      if (projection.value.mode) await loadCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
    } catch (error) {}
  }

  async function importOperations(operations, selectedIndices, progressCallback = () => {}) { try { const response = await axios.post(`${API_BASE_URL}/import/operations`, { operations, selectedRows: selectedIndices }); const createdOps = response.data; progressCallback(createdOps.length); await forceRefreshAll(); return createdOps; } catch (error) { if (error.response && error.response.status === 401) user.value = null; throw error; } }
  async function exportAllOperations() { try { const res = await axios.get(`${API_BASE_URL}/events/all-for-export`); return { operations: res.data, initialBalance: totalInitialBalance.value || 0 }; } catch (e) { if (e.response && e.response.status === 401) user.value = null; throw e; } }
  async function checkAuth() { try { isAuthLoading.value = true; const res = await axios.get(`${API_BASE_URL}/auth/me`); user.value = res.data; } catch (error) { user.value = null; } finally { isAuthLoading.value = false; } }
  async function logout() { axios.post(`${API_BASE_URL}/auth/logout`).then(() => {}).catch(error => {}); user.value = null; displayCache.value = {}; calculationCache.value = {}; }
  function computeTotalDaysForMode(mode, baseDate) { return getViewModeInfo(mode).total; }
  async function loadCalculationData(mode, date) { await updateFutureProjectionWithData(mode, date); }

  async function ensureSystemEntities() {
      let retailDuplicates = individuals.value.filter(i => {
          const n = i.name.trim().toLowerCase();
          return n === 'розничные клиенты' || n === 'розница';
      });

      let retailInd = null;

      if (retailDuplicates.length === 0) {
          retailInd = await addIndividual('Розничные клиенты');
      } else {
          retailInd = retailDuplicates[0];
          
          if (retailDuplicates.length > 1) {
              for (let i = 1; i < retailDuplicates.length; i++) {
                  const dup = retailDuplicates[i];
                  try {
                      await deleteEntity('individuals', dup._id, false); 
                  } catch (e) { console.error('Ошибка удаления дубликата:', e); }
              }
          }

          if (retailInd.name.trim().toLowerCase() === 'розница') {
              try {
                  await axios.put(`${API_BASE_URL}/individuals/batch-update`, [{ _id: retailInd._id, name: 'Розничные клиенты' }]);
                  retailInd.name = 'Розничные клиенты'; 
              } catch (e) { console.error(e); }
          }
      }
      
      let realizationDuplicates = categories.value.filter(c => c.name.trim().toLowerCase() === 'реализация');
      let realizationCat = null;

      if (realizationDuplicates.length === 0) {
          realizationCat = await addCategory('Реализация');
      } else {
          realizationCat = realizationDuplicates[0];
          if (realizationDuplicates.length > 1) {
               for (let i = 1; i < realizationDuplicates.length; i++) {
                  try { await deleteEntity('categories', realizationDuplicates[i]._id, false); } 
                  catch (e) {}
               }
          }
      }

      let debtDuplicates = categories.value.filter(c => c.name.trim().toLowerCase() === 'остаток долга');
      let debtCat = null;

      if (debtDuplicates.length === 0) {
          debtCat = await addCategory('Остаток долга');
      } else {
          debtCat = debtDuplicates[0];
          if (debtDuplicates.length > 1) {
               for (let i = 1; i < debtDuplicates.length; i++) {
                  try { await deleteEntity('categories', debtDuplicates[i]._id, false); } 
                  catch (e) {}
               }
          }
      }
      
      let refundDuplicates = categories.value.filter(c => c.name.trim().toLowerCase() === 'возврат');
      let refundCat = null;

      if (refundDuplicates.length === 0) {
          refundCat = await addCategory('Возврат');
      } else {
          refundCat = refundDuplicates[0];
          if (refundDuplicates.length > 1) {
               for (let i = 1; i < refundDuplicates.length; i++) {
                  try { await deleteEntity('categories', refundDuplicates[i]._id, false); } 
                  catch (e) {}
               }
          }
      }
      
      return { retailInd, realizationCat, debtCat, refundCat };
  }

  async function closeRetailDaily(amount, date, projectId = null) {
      try {
          const { retailInd, realizationCat } = await ensureSystemEntities();
          const opData = {
              type: 'expense', 
              amount: -Math.abs(amount),
              accountId: null, 
              counterpartyIndividualId: retailInd._id, 
              categoryId: realizationCat._id, 
              projectId: projectId, 
              date: date,
              description: 'Закрытие смены (Розница)'
          };
          await createEvent(opData);
      } catch (e) { throw e; }
  }

  async function closePrepaymentDeal(originalOp) {
      try {
          const amount = Math.abs(originalOp.amount);
          const opData = {
              type: 'expense', 
              amount: -amount,
              accountId: null, 
              companyId: originalOp.companyId,
              individualId: originalOp.individualId, 
              contractorId: originalOp.contractorId, 
              counterpartyIndividualId: originalOp.counterpartyIndividualId, 
              categoryId: originalOp.categoryId, 
              projectId: originalOp.projectId,
              date: new Date(),
              description: `Закрытие сделки по предоплате от ${new Date(originalOp.date).toLocaleDateString()}`
          };
          await createEvent(opData);
          await updateOperation(originalOp._id, { ...originalOp, isClosed: true });
      } catch (e) { throw e; }
  }

  const getRetailWriteOffs = computed(() => {
      const retail = individuals.value.find(i => {
          const n = i.name.trim().toLowerCase();
          return n === 'розничные клиенты' || n === 'розница';
      });
      
      if (!retail) return [];

      return allOperationsFlat.value.filter(op => {
         if (op.type !== 'expense') return false;
         if (op.accountId) return false; 
         
         const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
         return indId === retail._id;
      }).sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  return {
    accounts, companies, contractors, projects, categories, individuals, 
    visibleCategories, visibleContractors, 
    operationsCache: displayCache, displayCache, calculationCache,
    allWidgets, dashboardLayout, projection, dashboardForecastState,
    user, isAuthLoading,

    // 🟢 Экспортируем новое состояние сортировки
    widgetSortMode, widgetFilterMode, setWidgetSortMode, setWidgetFilterMode,

    isHeaderExpanded, toggleHeaderExpansion,

    currentAccountBalances, currentCompanyBalances, currentContractorBalances, currentProjectBalances,
    currentIndividualBalances, currentTotalBalance, futureTotalBalance, currentCategoryBreakdowns, dailyChartData,
    futureAccountBalances, futureCompanyBalances, futureContractorBalances, futureProjectBalances,
    futureIndividualBalances, 
    
    liabilitiesWeOwe, liabilitiesTheyOwe, liabilitiesWeOweFuture, liabilitiesTheyOweFuture,
    
    getPrepaymentCategoryIds, getActCategoryIds,
    
    currentCategoryBalances, futureCategoryBalances,
    
    futureContractorChanges, futureProjectChanges, futureIndividualChanges, futureCategoryChanges,
    
    currentOps, 
    
    currentTransfers, futureTransfers,
    currentIncomes, futureIncomes,
    currentExpenses, futureExpenses,
    currentWithdrawals, futureWithdrawals,

    getCategoryById, futureCategoryBreakdowns,

    getOperationsForDay, 

    setToday, replaceWidget, setForecastState,
    setCurrentViewDate, currentViewDate,
    
    fetchAllEntities, fetchOperations, refreshDay, 
    
    addOperation, deleteOperation, moveOperation,
    addAccount, addCompany, addContractor, addProject, addCategory,
    addIndividual, deleteEntity, batchUpdateEntities,

    computeTotalDaysForMode, updateFutureProjection, updateFutureProjectionByMode, setProjectionRange,
    loadCalculationData, updateProjectionFromCalculationData,

    createTransfer, updateTransfer, updateOperation, createEvent,

    fetchOperationsRange, updateFutureProjectionWithData,

    startAutoRefresh, stopAutoRefresh, forceRefreshAll,

    getFirstFreeCellIndex, _parseDateKey, _getDateKey, 

    allOperationsFlat, displayOperationsFlat,
    
    importOperations, exportAllOperations, 
    fetchSnapshot,
    checkAuth, logout,
    _sortByOrder,
    
    closeRetailDaily, closePrepaymentDeal, ensureSystemEntities,
    getRetailWriteOffs,
    
    retailIndividualId, realizationCategoryId, remainingDebtCategoryId, refundCategoryId, 
    _isRetailWriteOff, _isRetailRefund
  };
});