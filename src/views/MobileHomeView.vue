<script setup>
import { onMounted, onUnmounted, ref, nextTick, computed, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import { useWidgetData } from '@/composables/useWidgetData.js';

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
import PrepaymentModal from '@/components/PrepaymentModal.vue';
import SmartDealPopup from '@/components/SmartDealPopup.vue';
import InfoModal from '@/components/InfoModal.vue';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const mainStore = useMainStore();
const { getWidgetItems } = useWidgetData();

const timelineRef = ref(null);
const chartRef = ref(null);

const showGraphModal = ref(false);
const isDataLoaded = ref(false); 

// --- СОСТОЯНИЕ ДЛЯ ИНФО-МОДАЛКИ ---
const showInfoModal = ref(false);
const infoModalTitle = ref('');
const infoModalMessage = ref('');

// --- СИНХРОНИЗАЦИЯ СКРОЛЛА (Anti-Lag) ---
let isSyncingTimeline = false;
let isSyncingChart = false;

const onTimelineScroll = (event) => {
  if (isSyncingChart) return;
  isSyncingTimeline = true;
  
  const left = event.target.scrollLeft;
  if (chartRef.value) {
    chartRef.value.setScroll(left);
  }
  
  setTimeout(() => {
    isSyncingTimeline = false;
  }, 50);
};

const onChartScroll = (left) => {
  if (isSyncingTimeline) return;
  isSyncingChart = true;
  
  const el = timelineRef.value?.$el.querySelector('.timeline-scroll-area');
  if (el) {
    el.scrollLeft = left;
  }
  
  setTimeout(() => {
    isSyncingChart = false;
  }, 50);
};

const initScrollSync = () => {
    if (!timelineRef.value) return;
    const el = timelineRef.value.$el.querySelector('.timeline-scroll-area');
    if (el) { 
        el.removeEventListener('scroll', onTimelineScroll);
        el.addEventListener('scroll', onTimelineScroll, { passive: true }); 
    }
};

onMounted(async () => {
  const meta = document.createElement('meta');
  meta.name = "format-detection";
  meta.content = "telephone=no, date=no, email=no, address=no";
  document.getElementsByTagName('head')[0].appendChild(meta);

  try {
      await mainStore.checkAuth();
      if (!mainStore.user) return;
      await mainStore.fetchAllEntities();
      
      const today = new Date();
      mainStore.setToday(Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000));

      if (!mainStore.projection?.mode) {
          await mainStore.updateFutureProjectionByMode('12d', today);
      }

      const modeToLoad = mainStore.projection.mode || '12d';
      await mainStore.loadCalculationData(modeToLoad, today);
      
      isDataLoaded.value = true; 

      const savedProj = localStorage.getItem('projection');
      if (savedProj) {
          try {
              const parsed = JSON.parse(savedProj);
              if (parsed.mode && parsed.mode !== mainStore.projection?.mode) {
                  setTimeout(async () => {
                      await mainStore.updateFutureProjectionByMode(parsed.mode, today);
                      await mainStore.loadCalculationData(parsed.mode, today);
                  }, 200);
              }
          } catch (e) { console.error("Error parsing saved projection", e); }
      }
      
      nextTick(() => { initScrollSync(); });
  } catch (error) { console.error("Mobile View Mount Error:", error); }
});

onUnmounted(() => {
    const el = timelineRef.value?.$el.querySelector('.timeline-scroll-area');
    if (el) el.removeEventListener('scroll', onTimelineScroll);
    document.removeEventListener('mousedown', handleFilterClickOutside);
});

// --- Widget Fullscreen Logic ---
const activeWidgetKey = ref(null);
const isWidgetFullscreen = computed(() => !!activeWidgetKey.value);

watch(isWidgetFullscreen, (isOpen) => {
    if (isOpen) { 
        document.body.style.overflow = 'hidden'; 
    } 
    else { 
        document.body.style.overflow = ''; 
        nextTick(() => { setTimeout(() => { initScrollSync(); }, 150); }); 
    }
});

const activeWidgetTitle = computed(() => { if (!activeWidgetKey.value) return ''; const w = mainStore.allWidgets.find(x => x.key === activeWidgetKey.value); return w ? w.name : 'Виджет'; });
const isFilterOpen = ref(false); const filterBtnRef = ref(null); const filterDropdownRef = ref(null); const filterPos = ref({ top: '0px', right: '16px' }); 
const sortMode = computed(() => mainStore.widgetSortMode); const filterMode = computed(() => mainStore.widgetFilterMode); 

// 🟢 ОБНОВЛЕННАЯ ЛОГИКА ФИЛЬТРА
const updateFilterPosition = () => {
  if (filterBtnRef.value) {
    const rect = filterBtnRef.value.getBoundingClientRect();
    filterPos.value = { top: `${rect.bottom + 5}px`, left: `${Math.min(rect.left, window.innerWidth - 170)}px` };
  }
};

const toggleFilter = (event) => { 
    if (isFilterOpen.value) { 
        isFilterOpen.value = false; 
    } else { 
        // Сначала вычисляем позицию
        if (event && event.currentTarget) { 
             nextTick(() => updateFilterPosition());
        } 
        isFilterOpen.value = true; 
    } 
};

// 🟢 Обработчик клика вне фильтра (ФИКС: корректное закрытие)
const handleFilterClickOutside = (event) => {
  const insideTrigger = filterBtnRef.value && filterBtnRef.value.contains(event.target);
  const insideDropdown = filterDropdownRef.value && filterDropdownRef.value.contains(event.target);
  if (!insideTrigger && !insideDropdown) {
      isFilterOpen.value = false;
  }
};

// 🟢 Следим за открытием фильтра
watch(isFilterOpen, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
       updateFilterPosition();
       document.addEventListener('mousedown', handleFilterClickOutside);
       window.addEventListener('scroll', updateFilterPosition, true);
    });
  } else {
    document.removeEventListener('mousedown', handleFilterClickOutside);
    window.removeEventListener('scroll', updateFilterPosition, true);
  }
});

const setSortMode = (mode) => { mainStore.setWidgetSortMode(mode); isFilterOpen.value = false; }; 
const setFilterMode = (mode) => { mainStore.setWidgetFilterMode(mode); isFilterOpen.value = false; };

const showFutureBalance = computed({ get: () => activeWidgetKey.value ? (mainStore.dashboardForecastState[activeWidgetKey.value] ?? false) : false, set: (val) => { if (activeWidgetKey.value) mainStore.setForecastState(activeWidgetKey.value, val); } });
const isListWidget = computed(() => { const k = activeWidgetKey.value; return ['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(k); });
const isWidgetDeltaMode = computed(() => { const k = activeWidgetKey.value; return ['contractors', 'projects', 'individuals', 'categories'].includes(k); });

const activeWidgetItems = computed(() => {
  const k = activeWidgetKey.value; if (!k) return [];
  if (!isListWidget.value) {
      const items = getWidgetItems(k, showFutureBalance.value);
      let filtered = [...items];
      const getFilterVal = (i) => { if (showFutureBalance.value && i.totalForecast !== undefined) return i.totalForecast; return i.balance !== undefined ? i.balance : i.currentBalance; };
      
      if (filterMode.value === 'positive') filtered = filtered.filter(i => getFilterVal(i) > 0); 
      else if (filterMode.value === 'negative') filtered = filtered.filter(i => getFilterVal(i) < 0); 
      else if (filterMode.value === 'nonZero') filtered = filtered.filter(i => getFilterVal(i) !== 0);
      
      // 🟢 FIX: Добавляем субтитры для Компаний (связанные счета)
      if (k === 'companies') {
          filtered = filtered.map(i => ({
              ...i,
              // Убираем префикс "Счета: ", оставляем только имена
              subName: i.linkTooltip ? i.linkTooltip.replace('Счета: ', '') : ''
          }));
      }

      const getSortVal = (i) => getFilterVal(i);
      if (sortMode.value === 'desc') filtered.sort((a, b) => getSortVal(b) - getSortVal(a)); 
      else if (sortMode.value === 'asc') filtered.sort((a, b) => getSortVal(a) - getSortVal(b));
      
      return filtered;
  } else {
      let list = []; if (k === 'incomeList') list = showFutureBalance.value ? mainStore.futureIncomes : mainStore.currentIncomes; else if (k === 'expenseList') list = showFutureBalance.value ? mainStore.futureExpenses : mainStore.currentExpenses; else if (k === 'withdrawalList') list = showFutureBalance.value ? mainStore.futureWithdrawals : mainStore.currentWithdrawals; else if (k === 'transfers') list = showFutureBalance.value ? mainStore.futureTransfers : mainStore.currentTransfers;
      const mappedList = list.map(op => { let name = op.categoryId?.name || 'Без категории'; let subName = ''; if (op.type === 'transfer' || op.isTransfer) { const fromAcc = mainStore.accounts.find(a => a._id === (op.fromAccountId?._id || op.fromAccountId)); const toAcc = mainStore.accounts.find(a => a._id === (op.toAccountId?._id || op.toAccountId)); name = 'Перевод'; subName = `${fromAcc?.name || '?'} -> ${toAcc?.name || '?'}`; } else if (op.isWithdrawal) { name = 'Вывод средств'; subName = op.destination || op.description || ''; } else { const contractor = op.contractorId?.name || op.counterpartyIndividualId?.name; const project = op.projectId?.name; const desc = op.description; if (contractor) subName = contractor; else if (project) subName = project; else if (desc) subName = desc; } return { _id: op._id, name: name, subName: subName, balance: op.amount, date: op.date, isList: true, isIncome: op.type === 'income', originalOp: op }; });
      mappedList.sort((a, b) => new Date(b.date) - new Date(a.date)); return mappedList;
  }
});
const handleWidgetBack = () => { activeWidgetKey.value = null; isFilterOpen.value = false; }; const onWidgetClick = (key) => { activeWidgetKey.value = key; };
const googleAuthUrl = computed(() => { const baseUrl = API_BASE_URL.replace(/\/api$/, ''); return `${baseUrl}/auth/google`; }); const devAuthUrl = computed(() => { const baseUrl = API_BASE_URL.replace(/\/api$/, ''); return `${baseUrl}/auth/dev-login`; }); const isLocalhost = computed(() => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const formatVal = (val) => `${formatNumber(Math.abs(Number(val) || 0))} ₸`; const formatDelta = (val) => { const num = Number(val) || 0; if (num === 0) return '0 ₸'; const formatted = formatNumber(Math.abs(num)); return num > 0 ? `+ ${formatted} ₸` : `- ${formatted} ₸`; }; const formatDateShort = (date) => { if (!date) return ''; const d = new Date(date); return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }); };
const isIncomePopupVisible = ref(false); const isExpensePopupVisible = ref(false); const isTransferPopupVisible = ref(false); const isListEditorVisible = ref(false); const isEntityPopupVisible = ref(false); const isOperationListEditorVisible = ref(false); const isWithdrawalPopupVisible = ref(false); const isRetailPopupVisible = ref(false); const isRefundPopupVisible = ref(false); const isPrepaymentModalVisible = ref(false); const isSmartDealPopupVisible = ref(false); const operationToEdit = ref(null); const selectedDate = ref(new Date()); const selectedCellIndex = ref(0); const popupTitle = ref(''); const editorTitle = ref(''); const editorItems = ref([]); const operationListEditorTitle = ref(''); const operationListEditorType = ref('income'); const prepaymentData = ref({}); const prepaymentDateKey = ref(''); const smartDealPayload = ref(null); const smartDealStatus = ref({ debt: 0, totalDeal: 0 });
const _parseDateKey = (dateKey) => { if (typeof dateKey !== 'string' || !dateKey.includes('-')) return new Date(); const [year, doy] = dateKey.split('-').map(Number); if (isNaN(year) || isNaN(doy)) return new Date(); const date = new Date(year, 0, 1); date.setDate(doy); return date; };
const handleShowMenu = (payload) => { if (payload.operation) { handleEditOperation(payload.operation); } else { selectedDate.value = payload.date || new Date(); selectedCellIndex.value = payload.cellIndex || 0; isIncomePopupVisible.value = true; } };
const handleAction = (actionType) => {};
const handleEditOperation = (operation) => { operationToEdit.value = operation; const opDate = _parseDateKey(operation.dateKey); selectedDate.value = opDate; selectedCellIndex.value = operation.cellIndex; if (mainStore._isRetailWriteOff(operation)) { isRetailPopupVisible.value = true; return; } const catId = operation.categoryId?._id || operation.categoryId; if (mainStore.refundCategoryId && catId === mainStore.refundCategoryId) { isRefundPopupVisible.value = true; return; } if (operation.type === 'transfer' || operation.isTransfer) { isTransferPopupVisible.value = true; } else if (operation.isWithdrawal) { isWithdrawalPopupVisible.value = true; } else if (operation.type === 'income') { isIncomePopupVisible.value = true; } else if (operation.type === 'expense') { isExpensePopupVisible.value = true; } };
const handleOperationSave = async ({ mode, id, data }) => { try { if (mode === 'create') { if (data.cellIndex === undefined) { const dateKey = data.dateKey || mainStore._getDateKey(new Date(data.date)); data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); } await mainStore.createEvent(data); } else { await mainStore.updateOperation(id, data); } isIncomePopupVisible.value = false; isExpensePopupVisible.value = false; operationToEdit.value = null; } catch (e) { console.error("Mobile Save Error", e); alert("Ошибка сохранения"); } };
const handleTransferSave = async ({ mode, id, data }) => { try { if (mode === 'create') { if (data.cellIndex === undefined) { const dateKey = mainStore._getDateKey(new Date(data.date)); data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); } await mainStore.createTransfer(data); } else { await mainStore.updateTransfer(id, data); } isTransferPopupVisible.value = false; } catch (e) { console.error("Mobile Transfer Save Error", e); alert("Ошибка перевода"); } };
const handleSwitchToPrepayment = (data) => { const rawDate = data.date || new Date(); const d = new Date(rawDate); prepaymentDateKey.value = mainStore._getDateKey(d); prepaymentData.value = { ...data, amount: Math.abs(data.amount || 0), contractorId: data.contractorId, counterpartyIndividualId: data.counterpartyIndividualId, operationToEdit: null }; isIncomePopupVisible.value = false; isPrepaymentModalVisible.value = true; };
const handlePrepaymentSave = async (finalData) => { isPrepaymentModalVisible.value = false; try { if (!finalData.cellIndex && finalData.cellIndex !== 0) { finalData.cellIndex = await mainStore.getFirstFreeCellIndex(finalData.dateKey); } const prepayIds = mainStore.getPrepaymentCategoryIds; if (prepayIds.length > 0 && !finalData.prepaymentId) { finalData.prepaymentId = prepayIds[0]; } finalData.description = `Предоплата`; await mainStore.createEvent(finalData); } catch (e) { console.error('Prepayment Save Error:', e); alert('Не удалось сохранить предоплату: ' + e.message); } };
const handleSwitchToSmartDeal = async (payload) => { isIncomePopupVisible.value = false; smartDealPayload.value = payload; let status = payload.dealStatus; if (!status && payload.projectId) { try { status = mainStore.getProjectDealStatus(payload.projectId, payload.categoryId, payload.contractorId, payload.counterpartyIndividualId); } catch(e) { console.error('Error fetching status:', e); } } smartDealStatus.value = status || { debt: 0, totalDeal: 0 }; isSmartDealPopupVisible.value = true; };
const handleSmartDealConfirm = async ({ closePrevious, isFinal, nextTrancheNum }) => { isSmartDealPopupVisible.value = false; const data = smartDealPayload.value; if (!data) return; try { if (closePrevious === true && !isFinal) { await mainStore.closePreviousTranches(data.projectId, data.categoryId, data.contractorId, data.counterpartyIndividualId); } const trancheNum = nextTrancheNum || 2; const formattedAmount = formatNumber(data.amount); const description = `${formattedAmount} ${trancheNum}-й транш`; const incomeData = { type: 'income', amount: data.amount, date: new Date(data.date), accountId: data.accountId, projectId: data.projectId, contractorId: data.contractorId, counterpartyIndividualId: data.counterpartyIndividualId, categoryId: data.categoryId, companyId: data.companyId, individualId: data.individualId, totalDealAmount: 0, isDealTranche: true, isClosed: isFinal, description: description, cellIndex: data.cellIndex }; if (incomeData.cellIndex === undefined) { const dateKey = mainStore._getDateKey(new Date(data.date)); incomeData.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); } const newOp = await mainStore.createEvent(incomeData); if (isFinal) { await mainStore.closePreviousTranches(data.projectId, data.categoryId, data.contractorId, data.counterpartyIndividualId); await mainStore.createWorkAct(data.projectId, data.categoryId, data.contractorId, data.counterpartyIndividualId, data.amount, new Date(), newOp._id, true, data.companyId, data.individualId); } } catch (e) { console.error('Smart Deal Error:', e); alert('Ошибка при проведении транша: ' + e.message); } };
const popupSaveAction = (val) => {};

const handleItemClick = (item) => {
    if (item.isList && item.originalOp) {
        handleEditOperation(item.originalOp);
    } else if (!item.isList && item.isLinked && item.linkTooltip) {
        infoModalTitle.value = 'Связь';
        infoModalMessage.value = item.linkTooltip;
        showInfoModal.value = true;
    }
};
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
        <!-- Fullscreen Widget Mode -->
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
                    <div v-for="item in activeWidgetItems" :key="item._id" class="fs-item" @click="handleItemClick(item)">
                       <template v-if="item.isList">
                           <div class="fs-item-left">
                               <div class="fs-date">{{ formatDateShort(item.date) }}</div>
                               <div class="fs-info-col">
                                   <div class="fs-name-text">{{ item.name }}</div>
                                   <div class="fs-sub-text" v-if="item.subName">{{ item.subName }}</div>
                               </div>
                           </div>
                           <div class="fs-val" :class="item.isIncome ? 'green-text' : 'red-text'">
                               {{ item.isIncome ? '+' : '-' }} {{ formatNumber(Math.abs(item.balance)) }} ₸
                           </div>
                       </template>
                       <template v-else>
                           <!-- 🟢 FIX: Структура для отображения суб-текста (счетов) -->
                           <div class="fs-name-col">
                                <div class="fs-name-row">
                                    <span v-if="item.linkMarkerColor" class="color-dot" :style="{ backgroundColor: item.linkMarkerColor }"></span>
                                    <span class="fs-name">{{ item.name }}</span>
                                    <span v-if="item.isLinked" class="link-icon" style="margin-left: 6px;">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                                    </span>
                                </div>
                                <!-- 🟢 FIX: Отображение связанных счетов -->
                                <div v-if="item.subName" class="fs-sub-text-small">{{ item.subName }}</div>
                           </div>
                           <div class="fs-val-block">
                               <div v-if="!showFutureBalance" class="fs-val" :class="Number(item.balance) < 0 ? 'red-text' : ''">
                                   {{ formatVal(item.balance) }}
                               </div>
                               <div v-else class="fs-val-forecast">
                                   <span class="fs-curr" :class="Number(item.balance) < 0 ? 'red-text' : ''">{{ formatVal(item.balance) }}</span>
                                   <span class="fs-arrow">></span>
                                   <span v-if="isWidgetDeltaMode" class="fs-fut" :class="item.futureChange > 0 ? 'green-text' : 'red-text'">{{ formatDelta(item.futureChange) }}</span>
                                   <span v-else class="fs-fut" :class="item.futureBalance < 0 ? 'red-text' : ''">{{ formatVal(item.futureBalance) }}</span>
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
              <div v-if="isFilterOpen" class="filter-dropdown-fixed" :style="filterPos" ref="filterDropdownRef" @mousedown.stop @click.stop>
                <div class="filter-group"><div class="filter-group-title">Сортировка</div><ul><li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')"><span>По убыванию</span></li><li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')"><span>По возрастанию</span></li></ul></div>
                <div class="filter-group"><div class="filter-group-title">Фильтр</div><ul><li :class="{ active: filterMode === 'all' }" @click="setFilterMode('all')">Все</li><li :class="{ active: filterMode === 'nonZero' }" @click="setFilterMode('nonZero')">Скрыть 0</li><li :class="{ active: filterMode === 'positive' }" @click="setFilterMode('positive')">Только (+)</li><li :class="{ active: filterMode === 'negative' }" @click="setFilterMode('negative')">Только (-)</li></ul></div>
              </div>
            </Teleport>
        </div>

        <template v-else>
            <MobileHeaderTotals class="fixed-header" />
            
            <div class="layout-body">
              <MobileWidgetGrid 
                v-show="mainStore.isHeaderExpanded" 
                class="section-widgets" 
                :class="{ 'expanded-widgets': mainStore.isHeaderExpanded }" 
                @widget-click="onWidgetClick" 
              />
              
              <!-- Timeline Section -->
              <div class="section-timeline" v-show="!mainStore.isHeaderExpanded">
                <MobileTimeline 
                    v-if="isDataLoaded" 
                    ref="timelineRef" 
                    @show-menu="handleShowMenu" 
                />
              </div>
              
              <!-- Chart Section -->
              <div class="section-chart" v-show="!mainStore.isHeaderExpanded">
                <MobileChartSection 
                    v-if="isDataLoaded" 
                    ref="chartRef" 
                    @scroll="onChartScroll" 
                />
              </div>
            </div>
            
            <div class="fixed-footer">
              <MobileActionPanel @action="handleAction" @open-graph="showGraphModal = true" />
            </div>
        </template>

        <!-- Popups -->
        <InfoModal 
           v-if="showInfoModal"
           :title="infoModalTitle"
           :message="infoModalMessage"
           @close="showInfoModal = false"
        />

        <MobileGraphModal v-if="showGraphModal" @close="showGraphModal = false" />
        <IncomePopup v-if="isIncomePopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" :operation-to-edit="operationToEdit" @close="handleClosePopup" @save="handleOperationSave" @operation-deleted="handleOperationDelete(operationToEdit)" @trigger-prepayment="handleSwitchToPrepayment" @trigger-smart-deal="handleSwitchToSmartDeal" />
        <ExpensePopup v-if="isExpensePopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" :operation-to-edit="operationToEdit" @close="handleClosePopup" @save="handleOperationSave" @operation-deleted="handleOperationDelete(operationToEdit)" />
        <PrepaymentModal v-if="isPrepaymentModalVisible" :initialData="prepaymentData" :dateKey="prepaymentDateKey" @close="isPrepaymentModalVisible = false" @save="handlePrepaymentSave" />
        <SmartDealPopup v-if="isSmartDealPopupVisible" :deal-status="smartDealStatus" :current-amount="smartDealPayload?.amount || 0" :project-name="smartDealPayload?.projectName || 'Проект'" :contractor-name="smartDealPayload?.contractorName || 'Контрагент'" :category-name="smartDealPayload?.categoryName || 'Категория'" @close="handleSmartDealCancel" @confirm="handleSmartDealConfirm" />
        <TransferPopup v-if="isTransferPopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" @close="isTransferPopupVisible = false" @save="handleTransferSave" />
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

/* Fullscreen Styles */
.fullscreen-widget-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: var(--color-background, #1a1a1a); z-index: 2000; display: flex; flex-direction: column; }
.fs-header { height: 60px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--color-border, #444); background-color: var(--color-background-soft, #282828); }
.fs-title { font-size: 18px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
.fs-controls { display: flex; gap: 8px; }

/* 🟢 Стили для встроенных контролов */
.fs-chart-controls { 
    border-top: none; 
    border-bottom: 1px solid var(--color-border, #444); 
    background-color: #282828; 
    flex-shrink: 0;
    z-index: 10;
}

.action-square-btn { width: 32px; height: 32px; border: 1px solid transparent; border-radius: 6px; background-color: #3D3B3B; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; color: #888; transition: all 0.2s ease; }
.action-square-btn:hover { background-color: #555; color: #ccc; }
.action-square-btn.active { background-color: #34c759; color: #fff; border-color: transparent; }
.fs-body { flex-grow: 1; overflow-y: auto; padding: 16px; scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch; }
.fs-body::-webkit-scrollbar { display: none; }
.fs-list { display: flex; flex-direction: column; gap: 8px; }
.fs-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: var(--color-background-soft, #282828); border: 1px solid var(--color-border, #444); border-radius: 8px; min-height: 44px;}

/* 🟢 FIX: Изменен стиль для поддержки колонки */
.fs-name-row { display: flex; align-items: center; overflow: hidden; width: 100%; }
.fs-name-col { display: flex; flex-direction: column; overflow: hidden; flex: 1; justify-content: center; }

.fs-name { font-size: 14px; color: #fff; font-weight: 600; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-val-block { display: flex; flex-direction: column; align-items: flex-end; margin-left: 10px; }
.fs-val { font-size: 14px; color: #fff; font-weight: 700; white-space: nowrap; }
.fs-val-forecast { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.fs-curr { color: #ccc; font-weight: 500; }
.fs-arrow { color: #666; font-size: 12px; }
.fs-fut { font-weight: 700; color: #fff; }
.fs-item-left { display: flex; align-items: center; gap: 12px; overflow: hidden; flex: 1; }
.fs-date { color: #666; font-size: 11px; min-width: 32px; flex-shrink: 0; text-align: center; line-height: 1.2; }
.fs-info-col { display: flex; flex-direction: column; overflow: hidden; }
.fs-name-text { font-size: 14px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fs-sub-text { font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.fs-sub-text-small { font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.color-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; margin-right: 8px; }
.link-icon { display: inline-flex; align-items: center; opacity: 0.8; color: #34c759; }
.red-text { color: #ff3b30 !important; }
.green-text { color: #34c759 !important; }
.fs-empty { text-align: center; color: #666; margin-top: 50px; }
.fs-footer { padding: 15px 20px; background-color: var(--color-background, #1a1a1a); border-top: 1px solid var(--color-border, #444); }
.btn-back { width: 100%; height: 48px; background: #333; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }

/* Layout */
.fixed-header, .fixed-footer { flex-shrink: 0; }
.layout-body {
    flex-grow: 1; 
    display: flex; 
    flex-direction: column; 
    overflow: hidden; 
    min-height: 0;
    position: relative; 
}

.section-widgets { 
    width: 100%;
    flex-shrink: 0; 
    max-height: 60vh; 
    overflow-y: auto; 
    scrollbar-width: none; 
    -webkit-overflow-scrolling: touch; 
    overscroll-behavior: contain; 
}

.section-widgets.expanded-widgets {
    flex: 1;
    height: 0; 
    min-height: 0;
    max-height: none;
    padding-bottom: 80px; 
}

:deep(.widgets-grid) {
    align-content: start !important;
    min-height: min-content; 
}

.section-widgets::-webkit-scrollbar { display: none; }
.section-timeline { flex-shrink: 0; height: 180px; border-top: 1px solid var(--color-border, #444); }
.section-chart { flex-grow: 1; min-height: 50px; border-top: 1px solid var(--color-border, #444); }
.fixed-footer { flex-shrink: 0; z-index: 200; background-color: var(--color-background, #1a1a1a); border-top: 1px solid var(--color-border, #444); }
</style>