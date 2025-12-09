import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import axios from 'axios';
import { io } from 'socket.io-client';

axios.defaults.withCredentials = true; 
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
// 🟢 Получаем URL для сокета (обычно корень, без /api)
const SOCKET_URL = API_BASE_URL.replace('/api', '');

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

const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

export const useMainStore = defineStore('mainStore', () => {
  console.log('--- mainStore.js v104.0 (SOCKET.IO ENABLED) ЗАГРУЖЕН ---'); 
  
  const user = ref(null); 
  const isAuthLoading = ref(true); 
  
  // 🟢 Socket instance
  const socket = ref(null);

  const widgetSortMode = ref('default'); 
  const widgetFilterMode = ref('all');   

  // 🟢 НОВОЕ СОСТОЯНИЕ: Учитывать ли исключенные счета в общем балансе
  const savedIncludeExcluded = localStorage.getItem('includeExcludedInTotal');
  const includeExcludedInTotal = ref(savedIncludeExcluded === 'true');

  function setWidgetSortMode(mode) { widgetSortMode.value = mode; }
  function setWidgetFilterMode(mode) { widgetFilterMode.value = mode; }
  
  // 🟢 НОВОЕ ДЕЙСТВИЕ: Переключение учета исключенных счетов
  function toggleExcludedInclusion() {
      includeExcludedInTotal.value = !includeExcludedInTotal.value;
      localStorage.setItem('includeExcludedInTotal', String(includeExcludedInTotal.value));
  }

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
  const credits     = ref([]); 
  const taxes       = ref([]); 
  
  const dealOperations = ref([]);
  
  const todayDayOfYear = ref(0);
  const currentViewDate = ref(new Date());
  const currentYear = ref(new Date().getFullYear());

  const isHeaderExpanded = ref(false);
  function toggleHeaderExpansion() { isHeaderExpanded.value = !isHeaderExpanded.value; }

  const staticWidgets = ref([
    { key: 'currentTotal', name: 'Всего на счетах\nна текущий момент' }, 
    { key: 'accounts',     name: 'Счета/Кассы' }, 
    { key: 'companies',    name: 'Мои компании' },
    { key: 'taxes',        name: 'Мои налоги' }, 
    { key: 'credits',      name: 'Мои кредиты' }, 
    { key: 'contractors',  name: 'Мои контрагенты' },
    { key: 'projects',     name: 'Мои проекты' },
    { key: 'futureTotal',  name: 'Всего на счетах\nс учетом будущих' }, 
    { key: 'liabilities',  name: 'Мои предоплаты' },
    { key: 'incomeList',   name: 'Мои доходы' },
    { key: 'expenseList',  name: 'Мои расходы' },
    { key: 'withdrawalList', name: 'Мои выводы' },
    { key: 'transfers',    name: 'Мои переводы' }, 
    { key: 'individuals',  name: 'Физлица' },
    { key: 'categories',   name: 'Категории' },
  ]);

  // --- Helpers ---
  const _toStr = (val) => {
      if (!val) return '';
      if (typeof val === 'object') {
          return val._id ? String(val._id) : ''; 
      }
      return String(val);
  };

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

  const _isPrepaymentOp = (op) => {
      if (!op) return false;
      const prepayIds = prepaymentCategoryIdsSet.value; 
      const catId = op.categoryId?._id || op.categoryId;
      const prepId = op.prepaymentId?._id || op.prepaymentId;
      if ((catId && prepayIds.has(catId)) || (prepId && prepayIds.has(prepId))) return true;
      if (op.categoryId && op.categoryId.isPrepayment) return true;
      return false;
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
  
  const creditCategoryId = computed(() => {
      const cat = categories.value.find(c => {
          const n = c.name.trim().toLowerCase();
          return n === 'кредиты' || n === 'credit' || n === 'credits';
      });
      return cat ? cat._id : null;
  });

  const loanRepaymentCategoryId = computed(() => {
      const cat = categories.value.find(c => {
          const n = c.name.trim().toLowerCase();
          return n === 'погашение займов' || n === 'loan repayment' || n === 'выплата кредита' || n === 'погашение кредита';
      });
      return cat ? cat._id : null;
  });

  const _isCreditIncome = (op) => {
      if (!op) return false;
      if (op.type !== 'income') return false;
      const catId = op.categoryId?._id || op.categoryId;
      return catId && creditCategoryId.value && String(catId) === String(creditCategoryId.value);
  };
  
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

  const _isTaxPayment = (op) => {
      if (!op) return false;
      if (op.type !== 'expense') return false;
      return taxes.value.some(t => {
          const relId = typeof t.relatedEventId === 'object' ? t.relatedEventId._id : t.relatedEventId;
          return String(relId) === String(op._id);
      });
  };

  function _updateDealCache(op, mode = 'add') {
      const isDealRelated = (op.totalDealAmount || 0) > 0 || op.isDealTranche === true || op.isWorkAct === true;
      if (!isDealRelated) return;

      if (mode === 'add') {
          const idx = dealOperations.value.findIndex(d => d._id === op._id);
          if (idx === -1) dealOperations.value.push(op);
      } else if (mode === 'update') {
          const idx = dealOperations.value.findIndex(d => d._id === op._id);
          if (idx !== -1) dealOperations.value[idx] = op;
          else dealOperations.value.push(op);
      } else if (mode === 'delete') {
          dealOperations.value = dealOperations.value.filter(d => d._id !== op._id);
      }
  }

  const getMergedDealOps = computed(() => {
      const map = new Map();
      if (dealOperations.value) {
          dealOperations.value.forEach(op => { if (op && op._id) map.set(op._id, op); });
      }
      if (allOperationsFlat.value) {
          allOperationsFlat.value.forEach(op => {
              if (!op || !op._id) return;
              const isDealRelated = (op.totalDealAmount || 0) > 0 || op.isDealTranche === true || op.isWorkAct === true;
              if (isDealRelated) map.set(op._id, op);
          });
      }
      return Array.from(map.values());
  });

  // 🟢 РЕФАКТОРИНГ: Добавлена логика сброса при закрытой сделке
  function getProjectDealStatus(projectId, categoryId = null, contractorId = null, counterpartyIndividualId = null) {
      if (!projectId) return { debt: 0, activeTranche: null, totalDeal: 0, paidTotal: 0, tranchesCount: 0 };

      let maxTotalDeal = 0;
      let paidTotal = 0;
      let activeTranche = null;
      let tranchesCount = 0;

      const targetPId = _toStr(projectId);
      const targetCId = categoryId ? _toStr(categoryId) : null;
      const targetContrId = contractorId ? _toStr(contractorId) : null;
      const targetIndId = counterpartyIndividualId ? _toStr(counterpartyIndividualId) : null;

      const sourceOps = getMergedDealOps.value;
      const projectOps = sourceOps.filter(op => {
          if (op.type !== 'income') return false;
          if (_toStr(op.projectId) !== targetPId) return false;
          if (targetCId && _toStr(op.categoryId) !== targetCId) return false;
          if (targetContrId && _toStr(op.contractorId) !== targetContrId) return false;
          if (targetIndId && _toStr(op.counterpartyIndividualId) !== targetIndId) return false;
          return true;
      });
      
      // 🟢 FIX: Усиленная сортировка.
      projectOps.sort((a, b) => {
          const timeA = new Date(a.date).getTime();
          const timeB = new Date(b.date).getTime();
          if (timeA !== timeB) return timeA - timeB;
          
          const cellA = a.cellIndex !== undefined ? a.cellIndex : -1;
          const cellB = b.cellIndex !== undefined ? b.cellIndex : -1;
          if (cellA !== cellB) return cellA - cellB;
          
          return (a._id || '').toString().localeCompare((b._id || '').toString());
      });

      projectOps.forEach(op => {
          tranchesCount++;
          if ((op.totalDealAmount || 0) > maxTotalDeal) maxTotalDeal = op.totalDealAmount;
          paidTotal += (op.amount || 0);
          
          if (!op.isClosed) {
              activeTranche = op;
          }

          if (op.isClosed) {
              maxTotalDeal = 0;
              paidTotal = 0;
              tranchesCount = 0;
              activeTranche = null;
          }
      });

      let debt = Math.max(0, maxTotalDeal - paidTotal);
      return { debt, activeTranche, totalDeal: maxTotalDeal, paidTotal, tranchesCount };
  }

  async function closePreviousTranches(projectId, categoryId = null, contractorId = null, counterpartyIndividualId = null) {
      if (!projectId) return;
      const targetPId = _toStr(projectId);
      const targetCId = categoryId ? _toStr(categoryId) : null;
      const targetContrId = contractorId ? _toStr(contractorId) : null;
      const targetIndId = counterpartyIndividualId ? _toStr(counterpartyIndividualId) : null;
      const sourceOps = getMergedDealOps.value;

      const openOps = sourceOps.filter(op => {
          if (op.type !== 'income' || op.isClosed) return false;
          if (_toStr(op.projectId) !== targetPId) return false;
          if (targetCId && _toStr(op.categoryId) !== targetCId) return false;
          if (targetContrId && _toStr(op.contractorId) !== targetContrId) return false;
          if (targetIndId && _toStr(op.counterpartyIndividualId) !== targetIndId) return false;
          return true;
      });

      for (const op of openOps) {
           await createWorkAct(
               op.projectId?._id || op.projectId,
               op.categoryId?._id || op.categoryId,
               op.contractorId?._id || op.contractorId,
               op.counterpartyIndividualId?._id || op.counterpartyIndividualId,
               op.amount, 
               new Date(), 
               op._id, 
               true, 
               op.companyId?._id || op.companyId,
               op.individualId?._id || op.individualId
           );
      }
  }

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
    'currentTotal', 'accounts', 'companies', 'taxes', 'credits', 'contractors', 'projects', 'futureTotal', 
    'transfers'
  ]);
  
  const saveLayoutToServer = debounce(async (newLayout) => {
      if (!user.value) return;
      try {
          await axios.put(`${API_BASE_URL}/user/layout`, { layout: newLayout });
          console.log('[mainStore] Layout saved to server');
      } catch (e) {
          console.error('[mainStore] Failed to save layout:', e);
      }
  }, 1000);

  watch(dashboardLayout, (n) => {
      localStorage.setItem('dashboardLayout', JSON.stringify(n));
      saveLayoutToServer(n);
  }, { deep: true });

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
               
               if (op.isWorkAct) continue;

               if (!op.accountId) continue; 
               
               const amt = op.amount || 0;
               const absAmt = Math.abs(amt);
               
               if (op.isWithdrawal) {
                   dayRec.withdrawal += absAmt;
                   dayRec.dayTotal -= absAmt;
               } else if (op.type === 'expense') {
                   if (_isRetailWriteOff(op)) continue;
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
      console.error('Failed to fetch snapshot:', e);
    }
  }

  const _applyOptimisticSnapshotUpdate = (op, sign) => {
      const s = snapshot.value;
      if (op.isWorkAct) return; 

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
    const liabilitiesMap = new Map();

    const getContextKey = (op) => {
        const pIdRaw = op.projectId?._id || op.projectId;
        const pId = _toStr(pIdRaw) || 'no_proj';

        const cIdRaw = op.contractorId ? (op.contractorId._id || op.contractorId) : (op.counterpartyIndividualId?._id || op.counterpartyIndividualId);
        const cId = _toStr(cIdRaw) || 'no_contr';

        const myIdRaw = op.companyId ? (op.companyId._id || op.companyId) : (op.individualId?._id || op.individualId);
        const myId = _toStr(myIdRaw) || 'no_my';
        
        return `${pId}_${cId}_${myId}`;
    };

    const allSources = getMergedDealOps.value;
    const actCatIds = new Set(getActCategoryIds.value);

    // 1. СБОР АКТИВНЫХ B2B СДЕЛОК
    const activeDealGroups = new Set();
    for (const op of allSources) {
        if (!op || isTransfer(op)) continue;
        if (op.type === 'income' && Number(op.totalDealAmount || 0) > 0) {
            activeDealGroups.add(getContextKey(op));
        }
    }

    // 2. РАСЧЕТ ДОЛГА ПО B2B
    for (const op of allSources) {
        if (!op || isTransfer(op)) continue;
        const key = getContextKey(op);
        
        if (!activeDealGroups.has(key)) continue;

        if (!liabilitiesMap.has(key)) liabilitiesMap.set(key, { received: 0, acts: 0 });
        const entry = liabilitiesMap.get(key);
        const amt = Math.abs(op.amount || 0);

        if (op.type === 'income') {
            entry.received += amt;
        }
        else if (op.type === 'expense') {
            const isExplicitAct = op.isWorkAct === true;
            const isTechnicalProjectExpense = !op.accountId && op.projectId; 
            let isActCategory = false;
            const catId = op.categoryId?._id || op.categoryId;
            if (catId && actCatIds.has(catId)) isActCategory = true;

            if (isExplicitAct || isTechnicalProjectExpense || isActCategory) {
                entry.acts += amt;
            }
        }
    }
    
    let totalWeOwe = 0;
    for (const entry of liabilitiesMap.values()) {
        const diff = entry.received - entry.acts;
        if (diff > 0) {
            totalWeOwe += diff;
        }
    }

    // 3. ДОБАВЛЕНИЕ ДОЛГА ПО РОЗНИЦЕ (МЫ ДОЛЖНЫ)
    const retailIndId = retailIndividualId.value;
    if (retailIndId) {
        const retailGroups = new Map();
        
        allOperationsFlat.value.forEach(op => {
            const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
            if (String(indId) !== String(retailIndId)) return;
            
            const pId = _toStr(op.projectId?._id || op.projectId) || 'no_project';
            if (!retailGroups.has(pId)) retailGroups.set(pId, { income: 0, expense: 0 });
            const g = retailGroups.get(pId);
            
            if (op.type === 'income') {
                if (op.isClosed !== true) {
                    g.income += (op.amount || 0);
                }
            } else if (op.type === 'expense' && !op.accountId) {
                g.expense += Math.abs(op.amount || 0);
            }
        });
        
        retailGroups.forEach(g => {
            const retailDebt = Math.max(0, g.income - g.expense);
            totalWeOwe += retailDebt;
        });
    }

    return totalWeOwe;
  });

  const liabilitiesTheyOwe = computed(() => {
    const dealsMap = new Map(); 
    const ops = getMergedDealOps.value;
    
    // 1. РАСЧЕТ ДОЛГА B2B
    for (const op of ops) {
      if (isTransfer(op)) continue;
      if (op.type === 'income') {
          const pId = op.projectId?._id || op.projectId;
          const cId = op.categoryId?._id || op.categoryId;
          const contrId = op.contractorId ? (op.contractorId._id || op.contractorId) : (op.counterpartyIndividualId?._id || op.counterpartyIndividualId);
          if (pId) {
              const key = `${pId}_${cId}_${contrId}`;
              if (!dealsMap.has(key)) dealsMap.set(key, { maxTotalDeal: 0, receivedSum: 0 });
              const deal = dealsMap.get(key);
              if ((op.totalDealAmount || 0) > deal.maxTotalDeal) deal.maxTotalDeal = op.totalDealAmount;
              deal.receivedSum += (op.amount || 0);
          }
      }
    }
    let totalDebt = 0;
    dealsMap.forEach(deal => {
        const debt = Math.max(0, deal.maxTotalDeal - deal.receivedSum);
        totalDebt += debt;
    });

    // 2. ДОБАВЛЕНИЕ ДОЛГА ПО РОЗНИЦЕ (НАМ ДОЛЖНЫ)
    const retailIndId = retailIndividualId.value;
    if (retailIndId) {
        const retailGroups = new Map();
        
        allOperationsFlat.value.forEach(op => {
            const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
            if (String(indId) !== String(retailIndId)) return;
            
            const pId = _toStr(op.projectId?._id || op.projectId) || 'no_project';
            if (!retailGroups.has(pId)) retailGroups.set(pId, { allIncome: 0, expense: 0 });
            const g = retailGroups.get(pId);
            
            if (op.type === 'income') {
                g.allIncome += (op.amount || 0);
            } else if (op.type === 'expense' && !op.accountId) {
                g.expense += Math.abs(op.amount || 0);
            }
        });
        
        retailGroups.forEach(g => {
            const retailReceivable = Math.max(0, g.expense - g.allIncome);
            totalDebt += retailReceivable;
        });
    }

    return totalDebt;
  });

  const liabilitiesWeOweFuture = computed(() => liabilitiesWeOwe.value);
  const liabilitiesTheyOweFuture = computed(() => liabilitiesTheyOwe.value);

  const currentTransfers = computed(() => currentOps.value.filter(op => isTransfer(op)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  
  const currentIncomes = computed(() => currentOps.value.filter(op => 
      !isTransfer(op) && 
      op.type === 'income' && 
      !op.isWithdrawal && 
      !_isInterCompanyOp(op) &&
      !_isPrepaymentOp(op) &&
      !_isCreditIncome(op) 
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

  const currentExpenses = computed(() => currentOps.value.filter(op => !isTransfer(op) && op.type === 'expense' && !op.isWithdrawal && !_isInterCompanyOp(op) && !_isRetailWriteOff(op) && !op.isWorkAct).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  const currentWithdrawals = computed(() => currentOps.value.filter(op => op.isWithdrawal).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

  const futureTransfers = computed(() => futureOps.value.filter(op => isTransfer(op)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
  
  const futureIncomes = computed(() => futureOps.value.filter(op => 
      !isTransfer(op) && 
      op.type === 'income' && 
      !op.isWithdrawal && 
      !_isInterCompanyOp(op) &&
      !_isPrepaymentOp(op) &&
      !_isCreditIncome(op)
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));

  const futureExpenses = computed(() => futureOps.value.filter(op => !isTransfer(op) && op.type === 'expense' && !op.isWithdrawal && !_isInterCompanyOp(op) && !_isRetailWriteOff(op) && !op.isWorkAct).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
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
      else if (op.type === 'expense' && !op.isWorkAct) { map[cId].expense += amt; map[cId].total -= amt; }
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
          if (_isRetailWriteOff(op) || op.isWorkAct) continue;
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
  
  const totalInitialBalance = computed(() => (accounts.value || []).reduce((s,a)=>s + Number(a.initialBalance||0), 0));
  
  const _calculateFutureEntityBalance = (snapshotMap, entityIdField) => {
      const futureMap = { ...snapshotMap }; 
      for (const op of futureOps.value) {
          if (_isRetailWriteOff(op) || op.isWorkAct) continue;
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

  const currentAccountBalances = computed(() => accounts.value.map(a => ({ 
      ...a, 
      balance: Number(snapshot.value.accountBalances[a._id] || 0) + Number(a.initialBalance || 0) 
  })));

  const futureAccountBalances = computed(() => {
    const futureMap = _calculateFutureEntityBalance(snapshot.value.accountBalances, 'accountId');
    return accounts.value.map(a => ({ 
        ...a, 
        balance: Number(futureMap[a._id] || 0) + Number(a.initialBalance || 0) 
    }));
  });
  
  const currentCompanyBalances = computed(() => {
      return companies.value.map(comp => {
          const targetId = _toStr(comp._id);
          const linked = currentAccountBalances.value.filter(a => {
              return _toStr(a.companyId) === targetId;
          });
          const total = linked.reduce((sum, acc) => sum + acc.balance, 0);
          return { ...comp, balance: total };
      });
  });

  const futureCompanyBalances = computed(() => {
      return companies.value.map(comp => {
          const targetId = _toStr(comp._id);
          const linked = futureAccountBalances.value.filter(a => {
              return _toStr(a.companyId) === targetId;
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

  const currentCreditBalances = computed(() => {
      const repaymentCatId = loanRepaymentCategoryId.value;
      if (!repaymentCatId) {
          return credits.value.map(c => ({ ...c, balance: c.totalDebt, futureBalance: c.totalDebt }));
      }
      return credits.value.map(credit => {
          const initialDebt = credit.totalDebt || 0;
          let repaidTotal = 0;
          const now = snapshot.value.timestamp ? new Date(snapshot.value.timestamp) : new Date();
          allOperationsFlat.value.forEach(op => {
              if (op.type !== 'expense') return;
              if (!op.date || new Date(op.date) > now) return; 
              const opCatId = op.categoryId?._id || op.categoryId;
              if (String(opCatId) !== String(repaymentCatId)) return;
              const opContractorId = op.contractorId?._id || op.contractorId;
              const opIndId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
              const isContractorMatch = credit.contractorId && opContractorId && String(opContractorId) === String(credit.contractorId._id || credit.contractorId);
              const isIndividualMatch = credit.individualId && opIndId && String(opIndId) === String(credit.individualId._id || credit.individualId);
              if (isContractorMatch || isIndividualMatch) {
                  repaidTotal += Math.abs(op.amount || 0);
              }
          });
          const currentDebt = Math.max(0, initialDebt - repaidTotal);
          return {
              ...credit,
              balance: currentDebt,
              futureBalance: currentDebt 
          };
      });
  });
  
  const futureCreditBalances = computed(() => {
      const repaymentCatId = loanRepaymentCategoryId.value;
      const futureOpsList = futureOps.value; 
      return currentCreditBalances.value.map(credit => {
          let projectedRepayment = 0;
          futureOpsList.forEach(op => {
              if (op.type !== 'expense') return;
              const opCatId = op.categoryId?._id || op.categoryId;
              if (String(opCatId) !== String(repaymentCatId)) return;
              const opContractorId = op.contractorId?._id || op.contractorId;
              const opIndId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
              const isContractorMatch = credit.contractorId && opContractorId && String(opContractorId) === String(credit.contractorId._id || credit.contractorId);
              const isIndividualMatch = credit.individualId && opIndId && String(opIndId) === String(credit.individualId._id || credit.individualId);
              if (isContractorMatch || isIndividualMatch) {
                  projectedRepayment += Math.abs(op.amount || 0);
              }
          });
          const futureDebt = Math.max(0, credit.balance - projectedRepayment);
          return { ...credit, futureBalance: futureDebt };
      });
  });

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

  const currentTotalBalance = computed(() => {
      return currentAccountBalances.value.reduce((acc, a) => {
          if (!includeExcludedInTotal.value && a.isExcluded) return acc;
          return acc + (a.balance || 0);
      }, 0);
  });

  const futureTotalBalance = computed(() => {
    let total = currentTotalBalance.value;
    
    const excludedIds = new Set();
    accounts.value.forEach(a => {
        if (a.isExcluded) excludedIds.add(String(a._id));
    });

    for (const op of futureOps.value) {
        if (isTransfer(op)) continue; 
        if (!op.accountId) continue;
        if (op.isWorkAct) continue;
        
        const accId = typeof op.accountId === 'object' ? op.accountId._id : op.accountId;
        
        if (!includeExcludedInTotal.value && excludedIds.has(String(accId))) continue;
        
        const amt = Math.abs(op.amount || 0);
        if (op.type === 'income') total += (op.amount || 0); else total -= amt;
    }
    return total;
  });

  function _populateOp(op) {
      const populated = { ...op };
      
      if (!populated.accountId || typeof populated.accountId === 'string') {
          populated.accountId = accounts.value.find(a => a._id === (populated.accountId || op.accountId)) || null;
      }
      if (!populated.projectId || typeof populated.projectId === 'string') {
          populated.projectId = projects.value.find(p => p._id === (populated.projectId || op.projectId)) || null;
      }
      if (!populated.categoryId || typeof populated.categoryId === 'string') {
          populated.categoryId = categories.value.find(c => c._id === (populated.categoryId || op.categoryId)) || null;
      }
      if (!populated.companyId || typeof populated.companyId === 'string') {
          populated.companyId = companies.value.find(c => c._id === (populated.companyId || op.companyId)) || null;
      }
      if (!populated.contractorId || typeof populated.contractorId === 'string') {
          populated.contractorId = contractors.value.find(c => c._id === (populated.contractorId || op.contractorId)) || null;
      }
      if (!populated.individualId || typeof populated.individualId === 'string') {
          populated.individualId = individuals.value.find(i => i._id === (populated.individualId || op.individualId)) || null;
      }
      if (!populated.counterpartyIndividualId || typeof populated.counterpartyIndividualId === 'string') {
          populated.counterpartyIndividualId = individuals.value.find(i => i._id === (populated.counterpartyIndividualId || op.counterpartyIndividualId)) || null;
      }
      
      if (populated.isTransfer) {
          if (!populated.fromAccountId || typeof populated.fromAccountId === 'string')
              populated.fromAccountId = accounts.value.find(a => a._id === (populated.fromAccountId || op.fromAccountId)) || null;
          if (!populated.toAccountId || typeof populated.toAccountId === 'string')
              populated.toAccountId = accounts.value.find(a => a._id === (populated.toAccountId || op.toAccountId)) || null;
      }
      
      return populated;
  }

  // 🟢 SOCKET EVENT HANDLERS
  
  // Обработка добавления (приходит от других устройств)
  const handleSocketOperationAdded = (op) => {
      const existingOp = allOperationsFlat.value.find(o => o._id === op._id);
      if (existingOp) return; // Уже есть (например, создано текущим клиентом)

      const richOp = _populateOp(op);
      const dk = richOp.dateKey;
      
      if (!displayCache.value[dk]) displayCache.value[dk] = [];
      displayCache.value[dk].push(richOp);
      calculationCache.value[dk] = [...displayCache.value[dk]];

      const now = new Date();
      if (new Date(richOp.date) <= now) {
          _applyOptimisticSnapshotUpdate(richOp, 1);
      }
      _updateDealCache(richOp, 'add');
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
  };

  // Обработка обновления (перемещение, изменение суммы)
  const handleSocketOperationUpdated = (op) => {
      // 1. Ищем старую версию
      let oldOp = null;
      let oldDateKey = null;
      
      for (const dk in displayCache.value) {
          const found = displayCache.value[dk].find(o => o._id === op._id);
          if (found) { oldOp = found; oldDateKey = dk; break; }
      }
      if (!oldOp) oldOp = allOperationsFlat.value.find(o => o._id === op._id);

      // 2. Если нашли, откатываем её влияние
      const now = new Date();
      if (oldOp && new Date(oldOp.date) <= now) {
          _applyOptimisticSnapshotUpdate(oldOp, -1);
      }

      // 3. Обновляем кэш (удаляем старую, добавляем новую)
      const newDateKey = op.dateKey || (op.date ? _getDateKey(new Date(op.date)) : oldDateKey);
      const richOp = _populateOp({ ...op, date: new Date(op.date) });
      
      // Удаляем старую
      if (oldDateKey && displayCache.value[oldDateKey]) {
           displayCache.value[oldDateKey] = displayCache.value[oldDateKey].filter(o => o._id !== op._id);
           calculationCache.value[oldDateKey] = [...displayCache.value[oldDateKey]];
      }

      // Добавляем новую
      if (!displayCache.value[newDateKey]) displayCache.value[newDateKey] = [];
      
      // Проверяем, нет ли уже такой (на всякий случай)
      const existsIndex = displayCache.value[newDateKey].findIndex(o => o._id === op._id);
      if (existsIndex !== -1) {
          displayCache.value[newDateKey][existsIndex] = richOp;
      } else {
          displayCache.value[newDateKey].push(richOp);
      }
      calculationCache.value[newDateKey] = [...displayCache.value[newDateKey]];

      // 4. Применяем влияние новой версии
      if (new Date(richOp.date) <= now) {
          _applyOptimisticSnapshotUpdate(richOp, 1);
      }
      
      _updateDealCache(richOp, 'update');
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
  };

  // Обработка удаления
  const handleSocketOperationDeleted = (opId) => {
      let oldOp = null;
      let oldDateKey = null;
      
      for (const dk in displayCache.value) {
          const found = displayCache.value[dk].find(o => o._id === opId);
          if (found) { oldOp = found; oldDateKey = dk; break; }
      }
      if (!oldOp) return; // Уже удалено

      // Откат баланса
      const now = new Date();
      if (new Date(oldOp.date) <= now) {
          _applyOptimisticSnapshotUpdate(oldOp, -1);
      }

      // Удаление из кэша
      if (oldDateKey && displayCache.value[oldDateKey]) {
          displayCache.value[oldDateKey] = displayCache.value[oldDateKey].filter(o => o._id !== opId);
          calculationCache.value[oldDateKey] = [...displayCache.value[oldDateKey]];
      }
      
      _updateDealCache(oldOp, 'delete');
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
  };

  // 🟢 INIT SOCKET
  async function initSocket() {
      if (socket.value) return; // Уже инициализирован
      if (!user.value) return;

      console.log(`[mainStore] Connecting to socket at ${SOCKET_URL}...`);
      socket.value = io(SOCKET_URL, {
          withCredentials: true,
          transports: ['websocket', 'polling']
      });

      socket.value.on('connect', () => {
          console.log('[mainStore] Socket connected:', socket.value.id);
          socket.value.emit('join', user.value._id);
      });

      // --- OPERATIONS LISTENERS ---
      socket.value.on('operation_added', (op) => {
          // console.log('[Socket] operation_added', op);
          handleSocketOperationAdded(op);
      });
      socket.value.on('operation_updated', (op) => {
          // console.log('[Socket] operation_updated', op);
          handleSocketOperationUpdated(op);
      });
      socket.value.on('operation_deleted', (id) => {
          // console.log('[Socket] operation_deleted', id);
          handleSocketOperationDeleted(id);
      });
      socket.value.on('operations_imported', (count) => {
           console.log(`[Socket] Imported ${count} operations. Refreshing...`);
           forceRefreshAll();
      });

      // --- ENTITY LISTENERS ---
      const entityTypes = ['account', 'company', 'contractor', 'project', 'individual', 'category', 'prepayment'];
      
      entityTypes.forEach(type => {
          socket.value.on(`${type}_added`, (item) => {
             // Generic add to list
             let listRef = null;
             if (type === 'account') listRef = accounts;
             if (type === 'company') listRef = companies;
             if (type === 'contractor') listRef = contractors;
             if (type === 'project') listRef = projects;
             if (type === 'individual') listRef = individuals;
             if (type === 'category') listRef = categories;
             
             if (listRef) {
                 const exists = listRef.value.find(i => i._id === item._id);
                 if (!exists) listRef.value.push(item);
                 listRef.value = _sortByOrder(listRef.value);
             }
          });
          
          socket.value.on(`${type}_deleted`, (id) => {
             // Generic remove from list
             let listRef = null;
             if (type === 'account') listRef = accounts;
             if (type === 'company') listRef = companies;
             if (type === 'contractor') listRef = contractors;
             if (type === 'project') listRef = projects;
             if (type === 'individual') listRef = individuals;
             if (type === 'category') listRef = categories;

             if (listRef) {
                 listRef.value = listRef.value.filter(i => i._id !== id);
             }
          });
          
          socket.value.on(`${type}_list_updated`, (newList) => {
             let listRef = null;
             if (type === 'account') listRef = accounts;
             if (type === 'company') listRef = companies;
             if (type === 'contractor') listRef = contractors;
             if (type === 'project') listRef = projects;
             if (type === 'individual') listRef = individuals;
             if (type === 'category') listRef = categories;
             
             if (listRef && Array.isArray(newList)) {
                 listRef.value = _sortByOrder(newList);
             }
          });
      });
      
      // Credits & Taxes specific
      socket.value.on('credit_added', (c) => { credits.value.push(c); });
      socket.value.on('credit_updated', (c) => { 
          const idx = credits.value.findIndex(x => x._id === c._id);
          if (idx !== -1) credits.value[idx] = c; else credits.value.push(c);
      });
      socket.value.on('credit_deleted', (id) => { credits.value = credits.value.filter(c => c._id !== id); });

      socket.value.on('tax_payment_added', (t) => { taxes.value.push(t); });
      socket.value.on('tax_payment_deleted', (id) => { taxes.value = taxes.value.filter(t => t._id !== id); });
  }

  async function createEvent(eventData) {
    try {
      if (!eventData.dateKey && eventData.date) eventData.dateKey = _getDateKey(new Date(eventData.date));
      if (eventData.cellIndex === undefined) {
          eventData.cellIndex = await getFirstFreeCellIndex(eventData.dateKey);
      }
      
      const tempId = `temp_${Date.now()}`;
      const tempOp = { 
          ...eventData, 
          _id: tempId, 
          date: new Date(eventData.date),
          isOptimistic: true 
      };
      
      const richOp = _populateOp(tempOp);

      const dk = richOp.dateKey;
      if (!displayCache.value[dk]) displayCache.value[dk] = [];
      displayCache.value[dk].push(richOp);
      calculationCache.value[dk] = [...displayCache.value[dk]];
      
      const now = new Date();
      if (new Date(richOp.date) <= now) {
          _applyOptimisticSnapshotUpdate(richOp, 1);
      }
      
      _updateDealCache(richOp, 'add');
      
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));

      const response = await axios.post(`${API_BASE_URL}/events`, eventData);
      const serverOp = response.data;
      
      const idx = displayCache.value[dk].findIndex(o => o._id === tempId);
      if (idx !== -1) {
          displayCache.value[dk][idx] = serverOp; 
          calculationCache.value[dk] = [...displayCache.value[dk]];
      }
      const dealIdx = dealOperations.value.findIndex(d => d._id === tempId);
      if (dealIdx !== -1) dealOperations.value[dealIdx] = serverOp;

      return serverOp;
    } catch (error) { 
        console.error("Create Event Error (Optimistic):", error);
        if (eventData.dateKey) refreshDay(eventData.dateKey);
        fetchSnapshot();
        throw error; 
    }
  }
  
  async function updateOperation(opId, opData) {
    let oldOp = null;
    let oldDateKey = null;
    
    for (const dk in displayCache.value) {
        const found = displayCache.value[dk].find(o => o._id === opId);
        if (found) { oldOp = found; oldDateKey = dk; break; }
    }
    
    if (!oldOp) oldOp = allOperationsFlat.value.find(o => o._id === opId);
    
    if (!oldOp) {
        const res = await axios.put(`${API_BASE_URL}/events/${opId}`, opData);
        await refreshDay(res.data.dateKey);
        return res.data;
    }

    try {
        const newDateKey = opData.date ? _getDateKey(new Date(opData.date)) : (opData.dateKey || oldOp.dateKey);
        const isDateChanged = oldDateKey !== newDateKey;
        
        const now = new Date();
        if (new Date(oldOp.date) <= now) {
            _applyOptimisticSnapshotUpdate(oldOp, -1);
        }
        
        const mergedOp = { ...oldOp, ...opData };
        if (opData.date) mergedOp.date = new Date(opData.date);
        
        const richOp = _populateOp(mergedOp);
        
        if (isDateChanged) {
            if (displayCache.value[oldDateKey]) {
                displayCache.value[oldDateKey] = displayCache.value[oldDateKey].filter(o => o._id !== opId);
                calculationCache.value[oldDateKey] = [...displayCache.value[oldDateKey]];
            }
            if (!displayCache.value[newDateKey]) displayCache.value[newDateKey] = [];
            displayCache.value[newDateKey].push(richOp);
            calculationCache.value[newDateKey] = [...displayCache.value[newDateKey]];
        } else {
            const list = displayCache.value[oldDateKey];
            const idx = list.findIndex(o => o._id === opId);
            if (idx !== -1) list[idx] = richOp;
            calculationCache.value[oldDateKey] = [...list];
        }

        if (new Date(richOp.date) <= now) {
            _applyOptimisticSnapshotUpdate(richOp, 1);
        }
        
        _updateDealCache(richOp, 'update');
        
        updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));

        const updatePayload = { ...opData, dateKey: newDateKey };
        
        const response = await axios.put(`${API_BASE_URL}/events/${opId}`, updatePayload);
        
        const serverOp = response.data;
        const targetList = displayCache.value[newDateKey];
        if (targetList) {
            const i = targetList.findIndex(o => o._id === opId);
            if (i !== -1) targetList[i] = serverOp;
        }

        return serverOp;
    } catch (e) {
        console.error("Optimistic Update Failed:", e);
        refreshDay(oldDateKey);
        fetchSnapshot();
        throw e;
    }
  }

  async function deleteOperation(operation){
    const dateKey = operation.dateKey;
    if (!dateKey) return;
    
    try {
      if (_isTaxPayment(operation)) {
          taxes.value = taxes.value.filter(t => {
              const relId = typeof t.relatedEventId === 'object' ? t.relatedEventId._id : t.relatedEventId;
              return String(relId) !== String(operation._id);
          });
      }

      if (displayCache.value[dateKey]) {
          displayCache.value[dateKey] = displayCache.value[dateKey].filter(o => o._id !== operation._id);
          calculationCache.value[dateKey] = [...displayCache.value[dateKey]];
      }
      
      const now = new Date();
      if (new Date(operation.date) <= now) {
          _applyOptimisticSnapshotUpdate(operation, -1);
      }
      
      _updateDealCache(operation, 'delete');
      
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));

      if (operation.isDealTranche && operation.type === 'income') {
          const related = dealOperations.value.filter(op => 
              op._id !== operation._id && 
              op.type === 'income' &&
              (op.projectId?._id || op.projectId) === (operation.projectId?._id || operation.projectId) &&
              (op.categoryId?._id || op.categoryId) === (operation.categoryId?._id || operation.categoryId) &&
              (
                  (op.contractorId && (op.contractorId._id || op.contractorId) === (operation.contractorId?._id || operation.contractorId)) ||
                  (op.counterpartyIndividualId && (op.counterpartyIndividualId._id || op.counterpartyIndividualId) === (operation.counterpartyIndividualId?._id || operation.counterpartyIndividualId))
              )
          );
          
          related.sort((a, b) => new Date(b.date) - new Date(a.date));
          
          const prevOp = related[0]; 
          if (prevOp && prevOp.isClosed) {
              const prevDateKey = prevOp.dateKey;
              prevOp.isClosed = false;
              
              if (displayCache.value[prevDateKey]) {
                  const idx = displayCache.value[prevDateKey].findIndex(o => o._id === prevOp._id);
                  if (idx !== -1) {
                      displayCache.value[prevDateKey][idx] = { ...prevOp }; 
                      calculationCache.value[prevDateKey] = [...displayCache.value[prevDateKey]];
                  }
              }
              _updateDealCache(prevOp, 'update');
          }
      }
      
      if (operation.isWorkAct && operation.relatedEventId) {
          const tranche = dealOperations.value.find(d => d._id === operation.relatedEventId);
          if (tranche) {
              tranche.isClosed = false;
              const tDateKey = tranche.dateKey;
              if (displayCache.value[tDateKey]) {
                  const idx = displayCache.value[tDateKey].findIndex(o => o._id === tranche._id);
                  if (idx !== -1) {
                      displayCache.value[tDateKey][idx] = { ...tranche };
                      calculationCache.value[tDateKey] = [...displayCache.value[tDateKey]];
                  }
              }
              _updateDealCache(tranche, 'update');
          }
      }

      if (isTransfer(operation) && operation._id2) {
          await Promise.all([axios.delete(`${API_BASE_URL}/events/${operation._id}`), axios.delete(`${API_BASE_URL}/events/${operation._id2}`)]);
      } else {
          await axios.delete(`${API_BASE_URL}/events/${operation._id}`);
      }
      
    } catch(e) { 
        if (e.response && (e.response.status === 404 || e.response.status === 200)) {
            return;
        }
        console.error("Optimistic Delete Failed:", e);
        refreshDay(dateKey); 
        fetchSnapshot();
        const taxesRes = await axios.get(`${API_BASE_URL}/taxes`);
        taxes.value = taxesRes.data;
    }
  }

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
              const processedOps = _mergeTransfers(raw).map(op => ({ ...op, dateKey: dateKey, date: op.date || _parseDateKey(dateKey) }));
              displayCache.value[dateKey] = processedOps;
              calculationCache.value[dateKey] = processedOps;
          }
          await new Promise(r => setTimeout(r, 10));
      }
    } catch (error) { if (error.response && error.response.status === 401) user.value = null; }
  }

  const _syncCaches = (key, ops) => { displayCache.value[key] = [...ops]; calculationCache.value[key] = [...ops]; };
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
    projection.value = { mode: mode, totalDays: info.total, rangeStartDate: startDate, rangeEndDate: endDate, futureIncomeSum: 0, futureExpenseSum: 0 };
  }
  function setProjectionRange(startDate, endDate){
    const t0 = new Date(); t0.setHours(0,0,0,0);
    const start = new Date(startDate); start.setHours(0,0,0,0);
    const end   = new Date(endDate); end.setHours(0,0,0,0);
    projection.value = { mode:'custom', totalDays: Math.max(1, Math.floor((end-start)/86400000)+1), rangeStartDate:start, rangeEndDate:end, futureIncomeSum: 0 };
  }

  async function fetchAllEntities(){
    console.log('[mainStore] fetchAllEntities called');
    
    if (!user.value) return; 
    try{
      const [accRes, compRes, contrRes, projRes, indRes, catRes, prepRes, credRes, dealsRes, taxesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/accounts`), axios.get(`${API_BASE_URL}/companies`),
        axios.get(`${API_BASE_URL}/contractors`), axios.get(`${API_BASE_URL}/projects`),
        axios.get(`${API_BASE_URL}/individuals`), axios.get(`${API_BASE_URL}/categories`),
        axios.get(`${API_BASE_URL}/prepayments`),
        axios.get(`${API_BASE_URL}/credits`),
        axios.get(`${API_BASE_URL}/deals/all`),
        axios.get(`${API_BASE_URL}/taxes`)
      ]);
      
      accounts.value    = _sortByOrder(accRes.data); 
      companies.value   = _sortByOrder(compRes.data);
      contractors.value = _sortByOrder(contrRes.data); 
      projects.value    = _sortByOrder(projRes.data);
      individuals.value = _sortByOrder(indRes.data); 
      credits.value     = _sortByOrder(credRes.data);
      dealOperations.value = dealsRes.data; 
      taxes.value       = taxesRes.data; 
      
      const normalCategories = catRes.data.map(c => ({ ...c, isPrepayment: false }));
      const prepaymentCategories = prepRes.data.map(p => ({ ...p, isPrepayment: true }));
      categories.value  = _sortByOrder([...normalCategories, ...prepaymentCategories]);
      
      await ensureSystemEntities();
      await fetchSnapshot();
      
      // 🟢 Init Socket after fetch
      initSocket();

      const availableKeys = new Set(staticWidgets.value.map(w => w.key));
      categories.value.forEach(c => availableKeys.add(`cat_${c._id}`));
      const cleanLayout = dashboardLayout.value.filter(key => {
          return key.startsWith('placeholder_') || availableKeys.has(key);
      });
      if (cleanLayout.length !== dashboardLayout.value.length) dashboardLayout.value = cleanLayout;
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

  function getOperationsForDay(dateKey) { 
      const ops = displayCache.value[dateKey] || [];
      return ops.filter(op => !op.isWorkAct);
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
                refreshDay(oldDateKey); refreshDay(newDateKey); fetchSnapshot();
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
      
      const now = new Date();
      const isPastOrToday = finalDate <= now;
      const tempId = `temp_tr_${Date.now()}`;
      
      let optimisticOps = [];
      
      if (transferData.transferPurpose === 'personal' && transferData.transferReason === 'personal_use') {
          optimisticOps.push({
              _id: tempId,
              type: 'expense',
              isWithdrawal: true,
              amount: -Math.abs(transferData.amount),
              accountId: transferData.fromAccountId,
              companyId: transferData.fromCompanyId, 
              individualId: transferData.fromIndividualId,
              dateKey: dateKey,
              date: finalDate,
              isOptimistic: true
          });
      } 
      else {
          optimisticOps.push({
              _id: tempId,
              type: 'transfer',
              isTransfer: true,
              amount: Math.abs(transferData.amount),
              fromAccountId: transferData.fromAccountId, 
              toAccountId: transferData.toAccountId,
              fromCompanyId: transferData.fromCompanyId, 
              toCompanyId: transferData.toCompanyId,
              fromIndividualId: transferData.fromIndividualId, 
              toIndividualId: transferData.toIndividualId,
              dateKey: dateKey,
              date: finalDate,
              isOptimistic: true
          });
      }

      if (isPastOrToday) {
          optimisticOps.forEach(op => _applyOptimisticSnapshotUpdate(op, 1));
      }

      if (!displayCache.value[dateKey]) displayCache.value[dateKey] = [];
      optimisticOps.forEach(op => displayCache.value[dateKey].push(_populateOp(op)));
      calculationCache.value[dateKey] = [...displayCache.value[dateKey]];
      
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
      
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
      
      return data;
    } catch (error) { 
        console.error("Create Transfer Error (Optimistic):", error);
        throw error; 
    }
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
      updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
      return response.data;
    } catch (error) { throw error; }
  }

  async function addOperation(op){
    if (!op.dateKey) return;
    await refreshDay(op.dateKey); 
    updateProjectionFromCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
  }

  async function deleteEntity(path, id, deleteOperations = false) {
      try {
          await axios.delete(`${API_BASE_URL}/${path}/${id}`, { params: { deleteOperations } });
          // Note: Socket event will handle the local removal usually, 
          // but for instant feedback on initiator we can keep optimistic removal here if desired.
          // For now relying on Socket is fine or we can keep this for safety.
          if (path === 'accounts') accounts.value = accounts.value.filter(i => i._id !== id);
          if (path === 'companies') companies.value = companies.value.filter(i => i._id !== id);
          if (path === 'contractors') contractors.value = contractors.value.filter(i => i._id !== id);
          if (path === 'projects') projects.value = projects.value.filter(i => i._id !== id);
          if (path === 'individuals') individuals.value = individuals.value.filter(i => i._id !== id); 
          if (path === 'categories') categories.value = categories.value.filter(i => i._id !== id);
          if (path === 'credits') credits.value = credits.value.filter(i => i._id !== id); 
          if (path === 'taxes') taxes.value = taxes.value.filter(i => i._id !== id); 
          if (deleteOperations) await forceRefreshAll(); else await forceRefreshAll();
      } catch (error) { throw error; }
  }

  async function addCategory(name){ const res = await axios.post(`${API_BASE_URL}/categories`, { name }); categories.value.push(res.data); return res.data; }
  
  // 🟢 ОБНОВЛЕННАЯ ФУНКЦИЯ addAccount
  async function addAccount(data) { 
      let payload;
      if (typeof data === 'string') {
          payload = { name: data, initialBalance: 0 };
      } else {
          payload = { 
              name: data.name, 
              initialBalance: data.initialBalance || 0, 
              companyId: data.companyId || null, 
              individualId: data.individualId || null,
              // 🟢 Добавляем isExcluded в payload
              isExcluded: !!data.isExcluded
          };
      }
      const res = await axios.post(`${API_BASE_URL}/accounts`, payload); 
      // Socket will add it, but adding here avoids delay
      if (!accounts.value.find(a => a._id === res.data._id)) accounts.value.push(res.data); 
      return res.data; 
  }
  
  async function addCompany(name){ const res = await axios.post(`${API_BASE_URL}/companies`, { name }); if(!companies.value.find(i=>i._id===res.data._id)) companies.value.push(res.data); return res.data; }
  async function addContractor(name){ const res = await axios.post(`${API_BASE_URL}/contractors`, { name }); if(!contractors.value.find(i=>i._id===res.data._id)) contractors.value.push(res.data); return res.data; }
  async function addProject(name){ const res = await axios.post(`${API_BASE_URL}/projects`, { name }); if(!projects.value.find(i=>i._id===res.data._id)) projects.value.push(res.data); return res.data; }
  async function addIndividual(name){ const res = await axios.post(`${API_BASE_URL}/individuals`, { name }); if(!individuals.value.find(i=>i._id===res.data._id)) individuals.value.push(res.data); return res.data; }
  async function addCredit(data) { const res = await axios.post(`${API_BASE_URL}/credits`, data); if(!credits.value.find(i=>i._id===res.data._id)) credits.value.push(res.data); return res.data; }

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
      // Socket handles list update broadcast
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

  // 🟢 DEPRECATED: startAutoRefresh replaced by Socket
  function startAutoRefresh(intervalMs = 30000) {
      console.log('startAutoRefresh is deprecated. Sockets are active.');
  }
  function stopAutoRefresh() {}
  
  async function forceRefreshAll() {
    try {
      // Clear cache to ensure fresh state
      displayCache.value = {}; calculationCache.value = {};
      await fetchAllEntities();
      if (projection.value.mode) await loadCalculationData(projection.value.mode, new Date(currentYear.value, 0, todayDayOfYear.value));
    } catch (error) {}
  }

  async function importOperations(operations, selectedIndices, progressCallback = () => {}) { try { const response = await axios.post(`${API_BASE_URL}/import/operations`, { operations, selectedRows: selectedIndices }); const createdOps = response.data; progressCallback(createdOps.length); await forceRefreshAll(); return createdOps; } catch (error) { if (error.response && error.response.status === 401) user.value = null; throw error; } }
  async function exportAllOperations() { try { const res = await axios.get(`${API_BASE_URL}/events/all-for-export`); return { operations: res.data, initialBalance: totalInitialBalance.value || 0 }; } catch (e) { if (e.response && e.response.status === 401) user.value = null; throw e; } }
  
  async function checkAuth() { 
      try { 
          isAuthLoading.value = true; 
          const res = await axios.get(`${API_BASE_URL}/auth/me`); 
          user.value = res.data;
          
          if (user.value.dashboardLayout && Array.isArray(user.value.dashboardLayout) && user.value.dashboardLayout.length > 0) {
              dashboardLayout.value = user.value.dashboardLayout;
          }
      } catch (error) { 
          user.value = null; 
      } finally { 
          isAuthLoading.value = false; 
      } 
  }
  
  async function logout() { 
      axios.post(`${API_BASE_URL}/auth/logout`).then(() => {}).catch(error => {}); 
      user.value = null; 
      if (socket.value) {
          socket.value.disconnect();
          socket.value = null;
      }
      displayCache.value = {}; 
      calculationCache.value = {}; 
  }
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
                  try { await deleteEntity('individuals', retailDuplicates[i]._id, false); } 
                  catch (e) {}
              }
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
      let creditProject = projects.value.find(p => p.name.trim().toLowerCase() === 'мои кредиты');
      if (!creditProject) creditProject = await addProject('Мои кредиты');
      let repaymentCat = categories.value.find(c => c.name.trim().toLowerCase() === 'погашение займов');
      if (!repaymentCat) repaymentCat = await addCategory('Погашение займов');
      let creditIncomeCat = categories.value.find(c => c.name.trim().toLowerCase() === 'кредиты');
      if (!creditIncomeCat) creditIncomeCat = await addCategory('Кредиты');
      
      let taxCat = categories.value.find(c => c.name.trim().toLowerCase() === 'налоги');
      if (!taxCat) taxCat = await addCategory('Налоги');

      return { retailInd, realizationCat, debtCat, refundCat, creditProject, repaymentCat, creditIncomeCat, taxCat };
  }

  async function closeRetailDaily(amount, date, projectId = null) {
      try {
          const { retailInd, realizationCat } = await ensureSystemEntities();
          
          let inferredCompanyId = null;
          if (projectId) {
             const pIdStr = _toStr(projectId);
             const relatedOp = allOperationsFlat.value.find(op => 
                op.type === 'income' && 
                _toStr(op.projectId) === pIdStr &&
                _toStr(op.counterpartyIndividualId) === retailInd._id &&
                op.companyId
             );
             if (relatedOp) {
                 inferredCompanyId = _toStr(relatedOp.companyId);
             }
          }
          
          if (!inferredCompanyId && companies.value.length > 0) {
              inferredCompanyId = companies.value[0]._id;
          }

          const opData = {
              type: 'expense', 
              amount: -Math.abs(amount),
              accountId: null, 
              counterpartyIndividualId: retailInd._id, 
              categoryId: realizationCat._id, 
              projectId: projectId, 
              companyId: inferredCompanyId, 
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
  
  async function createWorkAct(projectId, categoryId, contractorId, counterpartyIndividualId, amount, date, opIdToClose, skipFetch = false, companyId = null, individualId = null) {
      try {
          const opData = {
              type: 'expense',
              amount: -Math.abs(amount),
              accountId: null,
              projectId: projectId,
              categoryId: categoryId,
              contractorId: contractorId,
              counterpartyIndividualId: counterpartyIndividualId,
              companyId: companyId,
              individualId: individualId,
              date: date,
              description: 'Акт выполненных работ / Отработали',
              isWorkAct: true,
              relatedEventId: opIdToClose 
          };
          
          const newOp = await createEvent(opData);
          
          if (opIdToClose) {
              const op = dealOperations.value.find(o => o._id === opIdToClose) || allOperationsFlat.value.find(o => o._id === opIdToClose);
              if (op) {
                  await updateOperation(opIdToClose, { ...op, isClosed: true });
              }
          }
          
          return newOp;
      } catch (e) {
          throw e;
      }
  }

  const projectsWithRetailDebts = computed(() => {
      const retailId = retailIndividualId.value;
      if (!retailId) return [];
      
      const balances = new Map();
      
      allOperationsFlat.value.forEach(op => {
          const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
          if (String(indId) !== String(retailId)) return;
          
          const pId = _toStr(op.projectId?._id || op.projectId);
          if (!pId) return;
          
          if (!balances.has(pId)) balances.set(pId, 0);
          
          if (op.type === 'income') {
              if (op.isClosed !== true) {
                  balances.set(pId, balances.get(pId) + (op.amount || 0));
              }
          } else if (op.type === 'expense' && !op.accountId) {
              balances.set(pId, balances.get(pId) - Math.abs(op.amount || 0));
          }
      });
      
      const ids = [];
      balances.forEach((bal, key) => {
          if (bal > 0) ids.push(key);
      });
      return ids;
  });

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

  const calculateTaxForPeriod = (companyId, startDate = null, endDate = null) => {
      const company = companies.value.find(c => c._id === companyId);
      if (!company) return { base: 0, tax: 0, income: 0, expense: 0 };

      const regime = company.taxRegime || 'simplified';
      const percent = company.taxPercent || (regime === 'simplified' ? 3 : 10);

      let totalIncome = 0;
      let totalExpense = 0;

      allOperationsFlat.value.forEach(op => {
          if (startDate && new Date(op.date) < startDate) return;
          if (endDate && new Date(op.date) > endDate) return;

          if (op.type === 'transfer' || op.isTransfer) {
              const toId = op.toCompanyId ? _toStr(op.toCompanyId) : null;
              const fromId = op.fromCompanyId ? _toStr(op.fromCompanyId) : null;
              const targetId = String(companyId);

              if (toId === targetId) {
                  if (fromId !== targetId) {
                      totalIncome += (op.amount || 0);
                  }
              }
              if (fromId === targetId) {
                   if (toId !== targetId) {
                       totalExpense += Math.abs(op.amount || 0);
                   }
              }
              return;
          }

          const opCompId = op.companyId ? (op.companyId._id || op.companyId) : null;
          if (String(opCompId) !== String(companyId)) return;
          
          if (!op.accountId) return; 

          if (op.type === 'income') {
              const catId = op.categoryId?._id || op.categoryId;
              if (creditCategoryId.value && String(catId) === String(creditCategoryId.value)) {
                  return;
              }
              totalIncome += (op.amount || 0);
          } else if (op.type === 'expense') {
              totalExpense += Math.abs(op.amount || 0);
          }
      });

      let taxBase = 0;
      if (regime === 'simplified') {
          taxBase = totalIncome;
      } else {
          taxBase = Math.max(0, totalIncome - totalExpense);
      }

      const taxAmount = taxBase * (percent / 100);
      
      return {
          base: taxBase,
          tax: taxAmount,
          income: totalIncome,
          expense: totalExpense,
          percent,
          regime
      };
  };

  async function createTaxPayment(payload) {
      try {
          const { taxCat } = await ensureSystemEntities();
          
          const expenseData = {
              type: 'expense',
              amount: -Math.abs(payload.amount),
              date: payload.date,
              accountId: payload.accountId,
              companyId: payload.companyId,
              categoryId: taxCat._id,
              description: `Налог за период ${new Date(payload.periodFrom).toLocaleDateString()} - ${new Date(payload.periodTo).toLocaleDateString()}`
          };
          
          const expenseOp = await createEvent(expenseData);
          
          const taxRecord = {
              companyId: payload.companyId,
              periodFrom: payload.periodFrom,
              periodTo: payload.periodTo,
              amount: payload.amount,
              status: 'paid',
              date: payload.date,
              relatedEventId: expenseOp._id
          };
          
          const res = await axios.post(`${API_BASE_URL}/taxes`, taxRecord);
          // Socket will add to taxes list
          if (!taxes.value.find(t=>t._id===res.data._id)) taxes.value.push(res.data);
          
          return res.data;
      } catch (e) {
          throw e;
      }
  }

  // 🟢 ВОЗВРАЩАЕМ ВСЕ МЕТОДЫ И СОСТОЯНИЯ (включая fetchAllEntities)
  return {
    accounts, companies, contractors, projects, categories, individuals, 
    credits, taxes, 
    visibleCategories, visibleContractors, 
    operationsCache: displayCache, displayCache, calculationCache,
    allWidgets, dashboardLayout, projection, dashboardForecastState,
    user, isAuthLoading,

    widgetSortMode, widgetFilterMode, setWidgetSortMode, setWidgetFilterMode,

    isHeaderExpanded, toggleHeaderExpansion,

    currentAccountBalances, currentCompanyBalances, currentContractorBalances, currentProjectBalances,
    currentIndividualBalances, currentTotalBalance, futureTotalBalance, currentCategoryBreakdowns, dailyChartData,
    futureAccountBalances, futureCompanyBalances, futureContractorBalances, futureProjectBalances,
    futureIndividualBalances, 
    
    currentCreditBalances, futureCreditBalances, creditCategoryId,

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
    addCredit, 

    computeTotalDaysForMode, updateFutureProjection, updateFutureProjectionByMode, setProjectionRange,
    loadCalculationData, updateProjectionFromCalculationData,

    createTransfer, updateTransfer, updateOperation, createEvent,
    createWorkAct,
    closePreviousTranches,

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
    _isRetailWriteOff, _isRetailRefund, _isCreditIncome, loanRepaymentCategoryId,
    getProjectDealStatus,
    
    dealOperations,
    projectsWithRetailDebts,
    
    calculateTaxForPeriod,
    createTaxPayment,
    _isTaxPayment,
    
    // 🟢 НОВЫЕ ПОЛЯ ДЛЯ TOGGLE
    includeExcludedInTotal,
    toggleExcludedInclusion,
    
    // 🟢 SOCKET INIT
    initSocket
  };
});