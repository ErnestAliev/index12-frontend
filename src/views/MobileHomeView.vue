<script setup>
import { onMounted, ref, nextTick, computed, watch, onUnmounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

// UI Components
import MobileHeaderTotals from '@/components/mobile/MobileHeaderTotals.vue';
import MobileWidgetGrid from '@/components/mobile/MobileWidgetGrid.vue';
import MobileTimeline from '@/components/mobile/MobileTimeline.vue';
import MobileChartSection from '@/components/mobile/MobileChartSection.vue';
import MobileActionPanel from '@/components/mobile/MobileActionPanel.vue';

// Modals
import EntityPopup from '@/components/EntityPopup.vue';
import EntityListEditor from '@/components/EntityListEditor.vue';
import OperationListEditor from '@/components/OperationListEditor.vue';
import IncomePopup from '@/components/IncomePopup.vue';
import ExpensePopup from '@/components/ExpensePopup.vue';
import TransferPopup from '@/components/TransferPopup.vue';
import WithdrawalPopup from '@/components/WithdrawalPopup.vue';
import RetailClosurePopup from '@/components/RetailClosurePopup.vue';
import RefundPopup from '@/components/RefundPopup.vue';
import MobileGraphModal from '@/components/mobile/MobileGraphModal.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v43.2 - MOBILE CREDITS WIDGET ---
 * * ВЕРСИЯ: 43.2 - Добавлена поддержка виджета "Мои кредиты"
 * * ДАТА: 2025-12-03
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const mainStore = useMainStore();
const timelineRef = ref(null);
const chartRef = ref(null);

const showGraphModal = ref(false);
const isDataLoaded = ref(false); 

// --- ГЛОБАЛЬНЫЕ ФУНКЦИИ И ХЕЛПЕРЫ ---

const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _parseDateKey = (dateKey) => {
    if (typeof dateKey !== 'string' || !dateKey.includes('-')) return new Date(); 
    const [year, doy] = dateKey.split('-').map(Number);
    if (isNaN(year) || isNaN(doy)) return new Date();
    const date = new Date(year, 0, 1); date.setDate(doy); return date;
};

let isSyncing = false;

const onTimelineScroll = (event) => { 
    if (isSyncing) return; 
    isSyncing = true; 
    if (chartRef.value) chartRef.value.setScroll(event.target.scrollLeft); 
    requestAnimationFrame(() => isSyncing = false); 
};

const onChartScroll = (left) => { 
    if (isSyncing) return; 
    isSyncing = true; 
    const el = timelineRef.value?.$el.querySelector('.timeline-scroll-area'); 
    if (el) el.scrollLeft = left; 
    requestAnimationFrame(() => isSyncing = false); 
};

// Форматтеры
const formatVal = (val) => `${formatNumber(Math.abs(Number(val) || 0))} ₸`;
const formatDelta = (val) => {
  const num = Number(val) || 0;
  if (num === 0) return '0 ₸';
  const formatted = formatNumber(Math.abs(num));
  return num > 0 ? `+ ${formatted} ₸` : `- ${formatted} ₸`;
};
const formatDateShort = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

// Ссылки авторизации
const googleAuthUrl = computed(() => {
  const baseUrl = API_BASE_URL.replace(/\/api$/, '');
  return `${baseUrl}/auth/google`;
});
const devAuthUrl = computed(() => {
  const baseUrl = API_BASE_URL.replace(/\/api$/, '');
  return `${baseUrl}/auth/dev-login`;
});
const isLocalhost = computed(() => {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
});

// --- Widget Fullscreen Logic ---
const activeWidgetKey = ref(null);
const isWidgetFullscreen = computed(() => !!activeWidgetKey.value);

watch(isWidgetFullscreen, (isOpen) => {
    if (isOpen) {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden'; 
    } else {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        nextTick(() => { setTimeout(() => { initScrollSync(); }, 150); });
    }
});

const activeWidgetTitle = computed(() => {
  if (!activeWidgetKey.value) return '';
  const w = mainStore.allWidgets.find(x => x.key === activeWidgetKey.value);
  return w ? w.name : 'Виджет';
});

// --- Filter Logic ---
const isFilterOpen = ref(false);
const filterBtnRef = ref(null); 
const filterPos = ref({ top: '0px', right: '16px' }); 

const sortMode = computed(() => mainStore.widgetSortMode); 
const filterMode = computed(() => mainStore.widgetFilterMode); 

const toggleFilter = (event) => {
    if (isFilterOpen.value) {
        isFilterOpen.value = false;
    } else {
        if (event && event.currentTarget) {
             const rect = event.currentTarget.getBoundingClientRect();
             filterPos.value = { 
                 top: `${rect.bottom + 5}px`, 
                 left: `${Math.min(rect.left, window.innerWidth - 170)}px` 
             };
        }
        isFilterOpen.value = true;
    }
};

const setSortMode = (mode) => { mainStore.setWidgetSortMode(mode); isFilterOpen.value = false; };
const setFilterMode = (mode) => { mainStore.setWidgetFilterMode(mode); isFilterOpen.value = false; };

const showFutureBalance = computed({
  get: () => activeWidgetKey.value ? (mainStore.dashboardForecastState[activeWidgetKey.value] ?? false) : false,
  set: (val) => { if (activeWidgetKey.value) mainStore.setForecastState(activeWidgetKey.value, val); }
});

const mergeBalances = (currentBalances, futureData, isDelta = false) => {
  let result = currentBalances || [];
  if (futureData) {
      const futureMap = new Map(futureData.map(item => [item._id, item.balance]));
      result = currentBalances.map(item => {
          const fallback = isDelta ? 0 : item.balance;
          const futureVal = futureMap.get(item._id) ?? fallback;
          return { 
              ...item, 
              // Для сущностей: futureBalance - это конечное значение или дельта
              futureBalance: futureVal,
              // Вычисляем реальное изменение для отображения дельты
              futureChange: isDelta ? futureVal : (futureVal - item.balance) 
          };
      });
  } else {
      result = currentBalances.map(item => ({ ...item, futureBalance: isDelta ? 0 : item.balance, futureChange: 0 }));
  }
  return result;
};

const isListWidget = computed(() => {
    const k = activeWidgetKey.value;
    return ['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(k);
});

const isWidgetDeltaMode = computed(() => {
    const k = activeWidgetKey.value;
    return ['contractors', 'projects', 'individuals', 'categories'].includes(k);
});

// 🟢 ГЛАВНАЯ ЛОГИКА ФОРМИРОВАНИЯ СПИСКА
const activeWidgetItems = computed(() => {
  const k = activeWidgetKey.value;
  if (!k) return [];
  
  let items = [];
  
  // 1. СУЩНОСТИ (Счета, Компании и т.д.)
  if (k === 'accounts') items = mergeBalances(mainStore.currentAccountBalances, mainStore.futureAccountBalances, false);
  else if (k === 'companies') items = mergeBalances(mainStore.currentCompanyBalances, mainStore.futureCompanyBalances, false);
  // 🟢 ДОБАВЛЕНО: КРЕДИТЫ
  else if (k === 'credits') {
      // Credits already contain merged data in futureCreditBalances (current balance + futureBalance)
      items = mainStore.futureCreditBalances.map(c => ({
          ...c,
          // Вычисляем дельту
          futureChange: (c.futureBalance || 0) - (c.balance || 0)
      }));
  }
  else if (k === 'contractors') {
      items = mergeBalances(mainStore.currentContractorBalances, mainStore.futureContractorChanges, true);
      const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
      items = items.filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));
  }
  else if (k === 'projects') items = mergeBalances(mainStore.currentProjectBalances, mainStore.futureProjectChanges, true);
  else if (k === 'individuals') items = mergeBalances(mainStore.currentIndividualBalances, mainStore.futureIndividualChanges, true);
  else if (k === 'categories') {
      items = mergeBalances(mainStore.currentCategoryBalances, mainStore.futureCategoryChanges, true);
      const visibleIds = new Set(mainStore.visibleCategories.map(c => c._id));
      items = items.filter(c => visibleIds.has(c._id));
  }
  else if (k === 'liabilities') {
      // Для обязательств логика чуть другая, ручная сборка
      const weOweDelta = mainStore.liabilitiesWeOweFuture - mainStore.liabilitiesWeOwe;
      const theyOweDelta = mainStore.liabilitiesTheyOweFuture - mainStore.liabilitiesTheyOwe;
      items = [
          { _id: 'we', name: 'Мы должны', balance: mainStore.liabilitiesWeOwe, futureBalance: mainStore.liabilitiesWeOweFuture, futureChange: weOweDelta },
          { _id: 'they', name: 'Нам должны', balance: mainStore.liabilitiesTheyOwe, futureBalance: mainStore.liabilitiesTheyOweFuture, futureChange: theyOweDelta, isIncome: true }
      ];
  }
  // 2. СПИСКИ ОПЕРАЦИЙ (Доходы, Расходы и т.д.)
  else if (isListWidget.value) {
      let list = [];
      // Берем либо будущие, либо текущие списки в зависимости от режима прогноза
      // В мобильной версии Fullscreen показывает список операций
      if (k === 'incomeList') list = showFutureBalance.value ? mainStore.futureIncomes : mainStore.currentIncomes;
      else if (k === 'expenseList') list = showFutureBalance.value ? mainStore.futureExpenses : mainStore.currentExpenses;
      else if (k === 'withdrawalList') list = showFutureBalance.value ? mainStore.futureWithdrawals : mainStore.currentWithdrawals;
      else if (k === 'transfers') list = showFutureBalance.value ? mainStore.futureTransfers : mainStore.currentTransfers;
      
      return list.map(op => {
          let name = op.categoryId?.name || 'Без категории';
          let subName = '';

          // Логика формирования заголовка и подзаголовка
          if (op.type === 'transfer' || op.isTransfer) {
              const fromAcc = mainStore.accounts.find(a => a._id === (op.fromAccountId?._id || op.fromAccountId));
              const toAcc = mainStore.accounts.find(a => a._id === (op.toAccountId?._id || op.toAccountId));
              name = 'Перевод';
              subName = `${fromAcc?.name || '?'} -> ${toAcc?.name || '?'}`;
          } else if (op.isWithdrawal) {
              name = 'Вывод средств';
              subName = op.destination || op.description || '';
          } else {
              // Для доходов/расходов:
              // Name = Категория
              // Sub = Контрагент / Проект / Описание
              const contractor = op.contractorId?.name || op.counterpartyIndividualId?.name;
              const project = op.projectId?.name;
              const desc = op.description;
              
              if (contractor) subName = contractor;
              else if (project) subName = project;
              else if (desc) subName = desc;
          }
          
          return { 
              _id: op._id, 
              name: name,
              subName: subName,
              balance: op.amount,
              date: op.date,
              isList: true,
              isIncome: op.type === 'income',
              originalOp: op // Сохраняем ссылку на операцию для редактирования
          };
      });
  }

  // Фильтрация и сортировка для СУЩНОСТЕЙ
  let filtered = [...items];
  
  if (!isListWidget.value) {
      const isDeltaWidget = isWidgetDeltaMode.value;
      const targetBalanceKey = showFutureBalance.value ? 'futureBalance' : 'balance'; 

      const getFilterVal = (i) => {
          // Если дельта-режим (как проекты), то при прогнозе смотрим на ИТОГОВЫЙ баланс (баланс + дельта) или просто дельту?
          // В HeaderBalanceCard логика: balance + futureBalance (где futureBalance - это дельта).
          // В activeWidgetItems выше мы уже нормализовали это в поле futureBalance (полное значение) или оставили как есть.
          return i[targetBalanceKey] || 0;
      };

      if (filterMode.value === 'positive') filtered = filtered.filter(i => getFilterVal(i) > 0);
      else if (filterMode.value === 'negative') filtered = filtered.filter(i => getFilterVal(i) < 0);
      else if (filterMode.value === 'nonZero') filtered = filtered.filter(i => getFilterVal(i) !== 0);

      const getSortVal = (i) => getFilterVal(i);
      
      if (sortMode.value === 'desc') filtered.sort((a, b) => getSortVal(b) - getSortVal(a));
      else if (sortMode.value === 'asc') filtered.sort((a, b) => getSortVal(a) - getSortVal(b));
  } else {
      // Для списков сортировка по дате
      filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  return filtered;
});

const handleWidgetBack = () => { activeWidgetKey.value = null; isFilterOpen.value = false; };
const onWidgetClick = (key) => { activeWidgetKey.value = key; };

const handleGlobalClick = (e) => {
    if (isFilterOpen.value && filterBtnRef.value && !filterBtnRef.value.contains(e.target)) {
        const menu = document.querySelector('.filter-dropdown-fixed');
        if (menu && !menu.contains(e.target)) {
            isFilterOpen.value = false;
        }
    }
};

const initScrollSync = () => {
    if (!timelineRef.value) return;
    const el = timelineRef.value.$el.querySelector('.timeline-scroll-area');
    if (el) { 
        el.removeEventListener('scroll', onTimelineScroll);
        el.addEventListener('scroll', onTimelineScroll); 
        const w = window.innerWidth * 0.25; 
        el.scrollLeft = w * 4; 
        if (chartRef.value) chartRef.value.setScroll(w * 4); 
    }
};

onMounted(() => document.addEventListener('click', handleGlobalClick));
onUnmounted(() => document.removeEventListener('click', handleGlobalClick));

onMounted(async () => {
  try {
      await mainStore.checkAuth();
      if (!mainStore.user) return;
      await mainStore.fetchAllEntities();
      
      const today = new Date();
      const todayDay = getDayOfYear(today);
      mainStore.setToday(todayDay);

      await mainStore.loadCalculationData('12d', today);
      isDataLoaded.value = true; 

      const savedProj = localStorage.getItem('projection');
      if (savedProj) {
          try {
              const parsed = JSON.parse(savedProj);
              if (parsed.mode && parsed.mode !== '12d') {
                  setTimeout(async () => {
                      await mainStore.updateFutureProjectionByMode(parsed.mode, today);
                      await mainStore.loadCalculationData(parsed.mode, today);
                  }, 300);
              }
          } catch (e) { console.error("Error parsing saved projection", e); }
      }

      nextTick(() => {
          initScrollSync();
      });
  } catch (error) {
      console.error("Critical error in MobileHomeView mount:", error);
  }
});

// --- POPUP STATES & LOGIC (UPDATED) ---
const isIncomePopupVisible = ref(false); 
const isExpensePopupVisible = ref(false); 

const isTransferPopupVisible = ref(false);
const isListEditorVisible = ref(false);
const isEntityPopupVisible = ref(false);
const isOperationListEditorVisible = ref(false);
const isWithdrawalPopupVisible = ref(false);
const isRetailPopupVisible = ref(false);
const isRefundPopupVisible = ref(false);

const operationToEdit = ref(null);
const selectedDate = ref(new Date());
const selectedCellIndex = ref(0);

const popupTitle = ref('');
const editorTitle = ref('');
const editorItems = ref([]);
const operationListEditorTitle = ref('');
const operationListEditorType = ref('income');

// --- CONTEXT MENU & ACTIONS ---
const handleShowMenu = (payload) => {
    if (payload.operation) {
        handleEditOperation(payload.operation);
    } else {
        selectedDate.value = payload.date || new Date();
        selectedCellIndex.value = payload.cellIndex || 0;
        isIncomePopupVisible.value = true;
    }
};

const handleAction = (actionType) => {};

const handleEditOperation = (operation) => {
    operationToEdit.value = operation;
    const opDate = _parseDateKey(operation.dateKey);
    selectedDate.value = opDate;
    selectedCellIndex.value = operation.cellIndex;

    if (mainStore._isRetailWriteOff(operation)) { isRetailPopupVisible.value = true; return; }
    
    const catId = operation.categoryId?._id || operation.categoryId;
    if (mainStore.refundCategoryId && catId === mainStore.refundCategoryId) { isRefundPopupVisible.value = true; return; }

    if (operation.type === 'transfer' || operation.isTransfer) {
        isTransferPopupVisible.value = true;
    } else if (operation.isWithdrawal) {
        isWithdrawalPopupVisible.value = true;
    } else if (operation.type === 'income') {
        isIncomePopupVisible.value = true; 
    } else if (operation.type === 'expense') {
        isExpensePopupVisible.value = true; 
    }
};

const handleOperationSave = async ({ mode, id, data }) => {
    try {
        if (mode === 'create') {
            if (data.cellIndex === undefined) {
                 const dateKey = data.dateKey || mainStore._getDateKey(new Date(data.date));
                 data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey);
            }
            await mainStore.createEvent(data);
        } else {
            await mainStore.updateOperation(id, data);
        }
        await mainStore.loadCalculationData(mainStore.projection.mode, new Date());
        isIncomePopupVisible.value = false;
        isExpensePopupVisible.value = false;
        operationToEdit.value = null;
    } catch (e) {
        console.error("Mobile Save Error", e);
        alert("Ошибка сохранения");
    }
};

const handleTransferSave = async ({ mode, id, data }) => {
    isTransferPopupVisible.value = false;
};

const popupSaveAction = (val) => {};
</script>

<template>
  <div class="mobile-layout">
    
    <div v-if="mainStore.isAuthLoading" class="loading-screen">
      <div class="spinner"></div>
      <p>Загрузка...</p>
    </div>

    <div v-else-if="!mainStore.user" class="login-screen">
      <div class="login-box">
        <h1>INDEX12</h1>
        <p>Управляйте финансами легко</p>
        <a :href="googleAuthUrl" class="google-login-button">Войти через Google</a>
        <a v-if="isLocalhost" :href="devAuthUrl" class="dev-login-button">Тест вход</a>
      </div>
    </div>

    <template v-else>
        <!-- 🟢 ПОЛНОЭКРАННЫЙ РЕЖИМ ВИДЖЕТА -->
        <div v-if="isWidgetFullscreen" class="fullscreen-widget-overlay">
             <div class="fs-header">
                <div class="fs-title">{{ activeWidgetTitle }}</div>
                <div class="fs-controls">
                    <button v-if="!isListWidget" ref="filterBtnRef" class="action-square-btn" :class="{ active: isFilterOpen || filterMode !== 'all' }" @click.stop="toggleFilter" title="Фильтр">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                    </button>
                    <button class="action-square-btn" :class="{ active: showFutureBalance }" @click="showFutureBalance = !showFutureBalance" title="Прогноз">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                    </button>
                </div>
            </div>
            
            <div class="fs-body">
                <div v-if="!activeWidgetItems.length" class="fs-empty">Пусто</div>
                <div class="fs-list">
                    <div v-for="item in activeWidgetItems" :key="item._id" class="fs-item" @click="item.originalOp ? handleEditOperation(item.originalOp) : null">
                       
                       <!-- 🟢 СПИСКИ ОПЕРАЦИЙ (Доходы, Расходы и т.д.) -->
                       <template v-if="item.isList">
                           <div class="fs-item-left">
                               <!-- Дата -->
                               <div class="fs-date">{{ formatDateShort(item.date) }}</div>
                               <!-- Описание/Категория -->
                               <div class="fs-info-col">
                                   <div class="fs-name-text">{{ item.name }}</div>
                                   <div class="fs-sub-text" v-if="item.subName">{{ item.subName }}</div>
                               </div>
                           </div>
                           <div class="fs-val" :class="item.isIncome ? 'green-text' : 'red-text'">
                               {{ item.isIncome ? '+' : '-' }} {{ formatNumber(Math.abs(item.balance)) }} ₸
                           </div>
                       </template>

                       <!-- 🟢 СУЩНОСТИ (Счета, Проекты) -->
                       <template v-else>
                           <div class="fs-name">{{ item.name }}</div>
                           <div class="fs-val-block">
                               <!-- Если прогноз выключен, показываем просто баланс -->
                               <div v-if="!showFutureBalance" class="fs-val" :class="Number(item.balance) < 0 ? 'red-text' : ''">
                                   {{ formatVal(item.balance) }}
                               </div>
                               <!-- Если прогноз включен -->
                               <div v-else class="fs-val-forecast">
                                   <span class="fs-curr" :class="Number(item.balance) < 0 ? 'red-text' : ''">{{ formatVal(item.balance) }}</span>
                                   <span class="fs-arrow">></span>
                                   <!-- Для дельта-виджетов (проекты) показываем +change, для остальных total -->
                                   <span v-if="isWidgetDeltaMode" class="fs-fut" :class="item.futureChange > 0 ? 'green-text' : 'red-text'">
                                       {{ formatDelta(item.futureChange) }}
                                   </span>
                                   <span v-else class="fs-fut" :class="item.futureBalance < 0 ? 'red-text' : ''">
                                       {{ formatVal(item.futureBalance) }}
                                   </span>
                               </div>
                           </div>
                       </template>

                    </div>
                </div>
            </div>

            <div class="fs-footer">
                <button class="btn-back" @click="handleWidgetBack">Назад</button>
            </div>
            
            <Teleport to="body">
              <div v-if="isFilterOpen" class="filter-dropdown-fixed" :style="filterPos" ref="filterDropdownRef" @click.stop>
                <div class="filter-group">
                  <div class="filter-group-title">Сортировка</div>
                  <ul>
                    <li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')"><span>По убыванию</span></li>
                    <li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')"><span>По возрастанию</span></li>
                  </ul>
                </div>
                <div class="filter-group">
                  <div class="filter-group-title">Фильтр</div>
                  <ul>
                    <li :class="{ active: filterMode === 'all' }" @click="setFilterMode('all')">Все</li>
                    <li :class="{ active: filterMode === 'nonZero' }" @click="setFilterMode('nonZero')">Скрыть 0</li>
                    <li :class="{ active: filterMode === 'positive' }" @click="setFilterMode('positive')">Только (+)</li>
                    <li :class="{ active: filterMode === 'negative' }" @click="setFilterMode('negative')">Только (-)</li>
                  </ul>
                </div>
              </div>
            </Teleport>
        </div>

        <template v-else>
            <MobileHeaderTotals class="fixed-header" />
            <div class="layout-body">
              <MobileWidgetGrid 
                 v-show="mainStore.isHeaderExpanded" 
                 class="section-widgets" 
                 @widget-click="onWidgetClick" 
              />
              <div class="section-timeline">
                <MobileTimeline v-if="isDataLoaded" ref="timelineRef" @show-menu="handleShowMenu" />
              </div>
              <div class="section-chart">
                <MobileChartSection v-if="isDataLoaded" ref="chartRef" @scroll="onChartScroll" />
              </div>
            </div>
            <div class="fixed-footer">
              <MobileActionPanel 
                 @action="handleAction" 
                 @open-graph="showGraphModal = true" 
              />
            </div>
        </template>

        <MobileGraphModal v-if="showGraphModal" @close="showGraphModal = false" />
        
        <EntityPopup v-if="isEntityPopupVisible" :title="popupTitle" @close="isEntityPopupVisible = false" @save="(val) => popupSaveAction(val)" />
        <EntityListEditor v-if="isListEditorVisible" :title="editorTitle" :items="editorItems" @close="isListEditorVisible = false" />
        <OperationListEditor v-if="isOperationListEditorVisible" :title="operationListEditorTitle" :type="operationListEditorType" @close="isOperationListEditorVisible = false" />
        
        <!-- 🟢 NEW POPUPS -->
        <IncomePopup 
           v-if="isIncomePopupVisible" 
           :date="selectedDate" 
           :cellIndex="selectedCellIndex" 
           :operation-to-edit="operationToEdit"
           @close="isIncomePopupVisible = false" 
           @save="handleOperationSave" 
        />

        <ExpensePopup 
           v-if="isExpensePopupVisible" 
           :date="selectedDate" 
           :cellIndex="selectedCellIndex" 
           :operation-to-edit="operationToEdit"
           @close="isExpensePopupVisible = false" 
           @save="handleOperationSave" 
        />

        <TransferPopup v-if="isTransferPopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" @close="isTransferPopupVisible = false" />
        <WithdrawalPopup v-if="isWithdrawalPopupVisible" :initial-data="{ amount: 0 }" @close="isWithdrawalPopupVisible = false" />
        <RetailClosurePopup v-if="isRetailPopupVisible" :operation-to-edit="operationToEdit" @close="isRetailPopupVisible = false" />
        <RefundPopup v-if="isRefundPopupVisible" :operation-to-edit="operationToEdit" @close="isRefundPopupVisible = false" />
    </template>
  </div>
</template>

<style scoped>
.mobile-layout { height: 100vh; height: 100dvh; width: 100vw; background-color: var(--color-background, #1a1a1a); display: flex; flex-direction: column; overflow: hidden; }
.loading-screen { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; }
.spinner { width: 40px; height: 40px; border: 3px solid #333; border-top-color: var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px; }
@keyframes spin { to { transform: rotate(360deg); } }
.login-screen { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #1a1a1a; padding: 20px; box-sizing: border-box; }
.login-box { width: 100%; max-width: 320px; text-align: center; }
.login-box h1 { color: #fff; font-size: 24px; margin-bottom: 10px; font-weight: 700; }
.login-box p { color: #888; font-size: 14px; margin-bottom: 30px; }
.google-login-button { display: block; width: 100%; padding: 12px; background: #fff; color: #333; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin-bottom: 10px; }
.dev-login-button { display: block; width: 100%; padding: 12px; background: #333; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; border: 1px solid #444; }

/* Fullscreen Widget */
.fullscreen-widget-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: var(--color-background, #1a1a1a); z-index: 2000; display: flex; flex-direction: column; }
.fs-header { height: 60px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--color-border, #444); background-color: var(--color-background-soft, #282828); }
.fs-title { font-size: 18px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
.fs-controls { display: flex; gap: 8px; }
.action-square-btn { width: 32px; height: 32px; border: 1px solid transparent; border-radius: 6px; background-color: #3D3B3B; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; color: #888; transition: all 0.2s ease; }
.action-square-btn:hover { background-color: #555; color: #ccc; }
.action-square-btn.active { background-color: #34c759; color: #fff; border-color: transparent; }

.fs-body { flex-grow: 1; overflow-y: auto; padding: 16px; scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch; }
.fs-body::-webkit-scrollbar { display: none; }
.fs-list { display: flex; flex-direction: column; gap: 8px; }
.fs-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: var(--color-background-soft, #282828); border: 1px solid var(--color-border, #444); border-radius: 8px; min-height: 44px;}

/* Entity Item Styles */
.fs-name { font-size: 14px; color: #fff; font-weight: 600; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-val-block { display: flex; flex-direction: column; align-items: flex-end; }
.fs-val { font-size: 14px; color: #fff; font-weight: 700; white-space: nowrap; }
.fs-val-forecast { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.fs-curr { color: #ccc; font-weight: 500; }
.fs-arrow { color: #666; font-size: 12px; }
.fs-fut { font-weight: 700; color: #fff; }

/* List Item Styles */
.fs-item-left { display: flex; align-items: center; gap: 12px; overflow: hidden; flex: 1; }
.fs-date { color: #666; font-size: 11px; min-width: 32px; flex-shrink: 0; text-align: center; line-height: 1.2; }
.fs-info-col { display: flex; flex-direction: column; overflow: hidden; }
.fs-name-text { font-size: 14px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fs-sub-text { font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }

.red-text { color: #ff3b30 !important; }
.green-text { color: #34c759 !important; }
.fs-empty { text-align: center; color: #666; margin-top: 50px; }
.fs-footer { padding: 15px 20px; background-color: var(--color-background, #1a1a1a); border-top: 1px solid var(--color-border, #444); }
.btn-back { width: 100%; height: 48px; background: #333; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }

/* Main Layout Sections */
.fixed-header, .fixed-footer { flex-shrink: 0; }
.layout-body { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.section-widgets { flex-shrink: 0; max-height: 60vh; overflow-y: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
.section-widgets::-webkit-scrollbar { display: none; }
.section-timeline { flex-shrink: 0; height: 180px; border-top: 1px solid var(--color-border, #444); }
.section-chart { flex-grow: 1; min-height: 50px; border-top: 1px solid var(--color-border, #444); }
.fixed-footer { flex-shrink: 0; z-index: 200; background-color: var(--color-background, #1a1a1a); border-top: 1px solid var(--color-border, #444); }
</style>