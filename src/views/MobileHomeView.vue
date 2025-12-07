<script setup>
import { onMounted, onUnmounted, ref, nextTick, computed, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import { useWidgetData } from '@/composables/useWidgetData.js';

// Компоненты UI (Мобильные)
import MobileHeaderTotals from '@/components/mobile/MobileHeaderTotals.vue';
import MobileWidgetGrid from '@/components/mobile/MobileWidgetGrid.vue';
import MobileTimeline from '@/components/mobile/MobileTimeline.vue';
import MobileChartSection from '@/components/mobile/MobileChartSection.vue';
import MobileActionPanel from '@/components/mobile/MobileActionPanel.vue';

// Попапы
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
import TaxPaymentDetailsPopup from '@/components/TaxPaymentDetailsPopup.vue';
// 🟢 ИМПОРТ ГЛОБАЛЬНОГО МЕНЮ
import CellContextMenu from '@/components/CellContextMenu.vue';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const mainStore = useMainStore();
const { getWidgetItems } = useWidgetData();

// --- Refs & State ---
const timelineRef = ref(null);
const chartRef = ref(null);

const showGraphModal = ref(false);

const isWidgetsLoading = ref(true); 
const isTimelineLoading = ref(true);

// Состояния попапов
const isIncomePopupVisible = ref(false);
const isExpensePopupVisible = ref(false);
const isTransferPopupVisible = ref(false);
const isWithdrawalPopupVisible = ref(false);
const isRetailPopupVisible = ref(false);
const isRefundPopupVisible = ref(false);
const isTaxDetailsPopupVisible = ref(false);

const isPrepaymentModalVisible = ref(false);
const prepaymentData = ref({});
const prepaymentDateKey = ref('');

const isSmartDealPopupVisible = ref(false);
const smartDealPayload = ref(null);
const smartDealStatus = ref({ debt: 0, totalDeal: 0 });

const operationToEdit = ref(null);
const selectedDate = ref(new Date());
const selectedCellIndex = ref(0);

// Info Modal
const showInfoModal = ref(false);
const infoModalTitle = ref('');
const infoModalMessage = ref('');

// 🟢 СОСТОЯНИЕ КОНТЕКСТНОГО МЕНЮ
const isContextMenuVisible = ref(false);
const contextMenuPosition = ref({ top: '0px', left: '0px' });

// --- Scroll Sync Logic ---
let isTimelineScrolling = false;
let isChartScrolling = false;
let syncTimeout = null;

const onTimelineScroll = (event) => {
  if (isChartScrolling) return;
  isTimelineScrolling = true;
  if (chartRef.value) { chartRef.value.setScroll(event.target.scrollLeft); }
  clearTimeout(syncTimeout); syncTimeout = setTimeout(() => { isTimelineScrolling = false; }, 150);
};

const onChartScroll = (left) => {
  if (isTimelineScrolling) return;
  isChartScrolling = true;
  const el = timelineRef.value?.$el.querySelector('.timeline-scroll-area');
  if (el) { el.scrollLeft = left; }
  clearTimeout(syncTimeout); syncTimeout = setTimeout(() => { isChartScrolling = false; }, 150);
};

const initScrollSync = () => {
    if (!timelineRef.value) return;
    const el = timelineRef.value.$el.querySelector('.timeline-scroll-area');
    if (el) { 
        el.removeEventListener('scroll', onTimelineScroll); 
        el.addEventListener('scroll', onTimelineScroll, { passive: true }); 
    }
};

const loadBackgroundData = async (today) => {
    isWidgetsLoading.value = true;
    try {
        await mainStore.fetchAllEntities();
    } catch (e) { console.error("Widgets Load Error:", e); } finally { isWidgetsLoading.value = false; }

    isTimelineLoading.value = true;
    try {
        if (!mainStore.projection?.mode) { await mainStore.updateFutureProjectionByMode('12d', today); }
        const modeToLoad = mainStore.projection.mode || '12d';
        await mainStore.loadCalculationData(modeToLoad, today);
    } catch (e) { console.error("Timeline Load Error:", e); } finally {
        isTimelineLoading.value = false;
        nextTick(() => { initScrollSync(); });
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
      const today = new Date();
      const startOfYear = new Date(today.getFullYear(), 0, 0);
      const diff = (today - startOfYear) + ((startOfYear.getTimezoneOffset() - today.getTimezoneOffset()) * 60 * 1000);
      const oneDay = 1000 * 60 * 60 * 24;
      mainStore.setToday(Math.floor(diff / oneDay));
      loadBackgroundData(today);
  } catch (error) { console.error("Mobile View Mount Error:", error); }
});

onUnmounted(() => {
    const el = timelineRef.value?.$el.querySelector('.timeline-scroll-area');
    if (el) el.removeEventListener('scroll', onTimelineScroll);
    document.removeEventListener('mousedown', handleFilterClickOutside);
});

const activeWidgetKey = ref(null);
const isWidgetFullscreen = computed(() => !!activeWidgetKey.value);

watch(isWidgetFullscreen, (isOpen) => {
    if (isOpen) { document.body.style.overflow = 'hidden'; } 
    else { document.body.style.overflow = ''; nextTick(() => { setTimeout(() => { initScrollSync(); }, 150); }); }
});

const activeWidgetTitle = computed(() => { if (!activeWidgetKey.value) return ''; const w = mainStore.allWidgets.find(x => x.key === activeWidgetKey.value); return w ? w.name : 'Виджет'; });
const isFilterOpen = ref(false); const filterBtnRef = ref(null); const filterDropdownRef = ref(null); const filterPos = ref({ top: '0px', right: '16px' }); 
const sortMode = computed(() => mainStore.widgetSortMode); const filterMode = computed(() => mainStore.widgetFilterMode); 

const updateFilterPosition = () => { if (filterBtnRef.value) { const rect = filterBtnRef.value.getBoundingClientRect(); filterPos.value = { top: `${rect.bottom + 5}px`, left: `${Math.min(rect.left, window.innerWidth - 170)}px` }; } };
const toggleFilter = (event) => { if (isFilterOpen.value) { isFilterOpen.value = false; } else { if (event && event.currentTarget) { nextTick(() => updateFilterPosition()); } isFilterOpen.value = true; } };
const handleFilterClickOutside = (event) => { const insideTrigger = filterBtnRef.value && filterBtnRef.value.contains(event.target); const insideDropdown = filterDropdownRef.value && filterDropdownRef.value.contains(event.target); if (!insideTrigger && !insideDropdown) { isFilterOpen.value = false; } };
watch(isFilterOpen, (isOpen) => { if (isOpen) { nextTick(() => { updateFilterPosition(); document.addEventListener('mousedown', handleFilterClickOutside); window.addEventListener('scroll', updateFilterPosition, true); }); } else { document.removeEventListener('mousedown', handleFilterClickOutside); window.removeEventListener('scroll', updateFilterPosition, true); } });
const setSortMode = (mode) => { mainStore.setWidgetSortMode(mode); isFilterOpen.value = false; }; 
const setFilterMode = (mode) => { mainStore.setWidgetFilterMode(mode); isFilterOpen.value = false; };
const showFutureBalance = computed({ get: () => activeWidgetKey.value ? (mainStore.dashboardForecastState[activeWidgetKey.value] ?? false) : false, set: (val) => { if (activeWidgetKey.value) mainStore.setForecastState(activeWidgetKey.value, val); } });
const isListWidget = computed(() => { const k = activeWidgetKey.value; return ['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(k); });
const isWidgetDeltaMode = computed(() => { const k = activeWidgetKey.value; return ['contractors', 'projects', 'individuals', 'categories', 'taxes'].includes(k); });
const getValueClass = (val, widgetKey) => { const num = Number(val) || 0; if (widgetKey === 'taxes') return num < 0 ? 'red-text' : 'white-text'; if (num < 0) return 'red-text'; return 'white-text'; };
const getDeltaClass = (val, widgetKey) => { const num = Number(val) || 0; if (num === 0) return 'white-text'; if (widgetKey === 'taxes') return num < 0 ? 'red-text' : 'green-text'; return num > 0 ? 'green-text' : 'red-text'; };

const activeWidgetItems = computed(() => {
  const k = activeWidgetKey.value; if (!k) return [];
  if (!isListWidget.value) {
      const items = getWidgetItems(k, showFutureBalance.value);
      let filtered = [...items];
      const getFilterVal = (i) => { if (showFutureBalance.value && i.totalForecast !== undefined) return i.totalForecast; return i.balance !== undefined ? i.balance : i.currentBalance; };
      if (filterMode.value === 'positive') filtered = filtered.filter(i => getFilterVal(i) > 0); 
      else if (filterMode.value === 'negative') filtered = filtered.filter(i => getFilterVal(i) < 0); 
      else if (filterMode.value === 'nonZero') filtered = filtered.filter(i => getFilterVal(i) !== 0);
      if (k === 'companies') { filtered = filtered.map(i => ({ ...i, subName: i.linkTooltip ? i.linkTooltip.replace('Счета: ', '') : '' })); }
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
const formatVal = (val) => { const num = Number(val) || 0; const formatted = formatNumber(Math.abs(num)); if (num === 0) return `${formatted} ₸`; if (num < 0) return `- ${formatted} ₸`; return `₸ ${formatted}`; };
const formatDelta = (val) => { const num = Number(val) || 0; if (num === 0) return '0 ₸'; const formatted = formatNumber(Math.abs(num)); if (num > 0) return `+ ${formatted} ₸`; return `- ${formatted} ₸`; };
const formatDateShort = (date) => { if (!date) return ''; const d = new Date(date); return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }); };
const _parseDateKey = (dateKey) => { if (typeof dateKey !== 'string' || !dateKey.includes('-')) return new Date(); const [year, doy] = dateKey.split('-').map(Number); if (isNaN(year) || isNaN(doy)) return new Date(); const date = new Date(year, 0, 1); date.setDate(doy); return date; };

// 🟢 ОБРАБОТЧИК КЛИКА ПО ЯЧЕЙКЕ (ОТКРЫТИЕ МЕНЮ)
const handleShowMenu = (payload) => { 
    if (payload.operation) { 
        handleEditOperation(payload.operation); 
    } else { 
        selectedDate.value = payload.date || new Date(); 
        selectedCellIndex.value = payload.cellIndex || 0; 
        
        // 🟢 РЕФАКТОРИНГ: Центрирование меню по горизонтали
        // И сохранение динамики по вертикали (рядом с пальцем)
        
        const e = payload.event;
        let topStyle = '30%'; // Значение по умолчанию
        
        if (e) {
            // Для touch событий берем первые координаты
            const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
            
            // Расчет позиции (чуть выше пальца, чтобы не перекрывать)
            let top = clientY - 150; 
            
            // Если слишком близко к верхнему краю, показываем под пальцем
            if (top < 50) top = clientY + 30;
            
            topStyle = `${top}px`;
        } 
        
        contextMenuPosition.value = { 
            top: topStyle, 
            left: '50%', 
            transform: 'translateX(-50%)', // Центрирование по ширине
            position: 'fixed', // Гарантия, что позиционируется от окна
            zIndex: '9999'
        };
        
        isContextMenuVisible.value = true;
    } 
};

// 🟢 ВЫБОР ДЕЙСТВИЯ В МЕНЮ
const handleContextMenuSelect = (type) => {
    isContextMenuVisible.value = false;
    operationToEdit.value = null; 

    if (type === 'income') isIncomePopupVisible.value = true;
    else if (type === 'expense') isExpensePopupVisible.value = true;
    else if (type === 'transfer') isTransferPopupVisible.value = true;
};

// 🟢 РЕДАКТИРОВАНИЕ ОПЕРАЦИИ (КЛИК ПО ЧИПУ - ПОКА ОТКЛЮЧЕН)
const handleEditOperation = (operation) => { 
    // console.log("Редактирование отключено для режима 'Только перемещение'");
    // Разблокировать этот блок, если нужно вернуть редактирование по клику
    return; 
};

const handleOperationDrop = async (dropData) => {
    const { operation, toDateKey, toCellIndex } = dropData;
    if (!operation || !toDateKey) return;
    const oldDateKey = operation.dateKey;
    // Если ничего не поменялось - выходим
    if (oldDateKey === toDateKey && operation.cellIndex === toCellIndex) return;
    
    try { 
        await mainStore.moveOperation(operation, oldDateKey, toDateKey, toCellIndex); 
    } catch(e) { console.error("Drop Error:", e); }
};

const handleOperationSave = async ({ mode, id, data }) => { try { if (mode === 'create') { if (data.cellIndex === undefined) { const dateKey = data.dateKey || mainStore._getDateKey(new Date(data.date)); data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); } await mainStore.createEvent(data); } else { await mainStore.updateOperation(id, data); } isIncomePopupVisible.value = false; isExpensePopupVisible.value = false; operationToEdit.value = null; } catch (e) { console.error("Mobile Save Error", e); alert("Ошибка сохранения"); } };
const handleTransferSave = async ({ mode, id, data }) => { try { if (mode === 'create') { if (data.cellIndex === undefined) { const dateKey = mainStore._getDateKey(new Date(data.date)); data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); } await mainStore.createTransfer(data); } else { await mainStore.updateTransfer(id, data); } isTransferPopupVisible.value = false; } catch (e) { console.error("Mobile Transfer Save Error", e); alert("Ошибка перевода"); } };
const handleSwitchToPrepayment = (data) => { const rawDate = data.date || new Date(); const d = new Date(rawDate); prepaymentDateKey.value = mainStore._getDateKey(d); prepaymentData.value = { ...data, amount: Math.abs(data.amount || 0), contractorId: data.contractorId, counterpartyIndividualId: data.counterpartyIndividualId, operationToEdit: null }; isIncomePopupVisible.value = false; isPrepaymentModalVisible.value = true; };
const handlePrepaymentSave = async (finalData) => { isPrepaymentModalVisible.value = false; try { if (!finalData.cellIndex && finalData.cellIndex !== 0) { finalData.cellIndex = await mainStore.getFirstFreeCellIndex(finalData.dateKey); } const prepayIds = mainStore.getPrepaymentCategoryIds; if (prepayIds.length > 0 && !finalData.prepaymentId) { finalData.prepaymentId = prepayIds[0]; } finalData.description = `Предоплата`; await mainStore.createEvent(finalData); } catch (e) { console.error('Prepayment Save Error:', e); alert('Не удалось сохранить предоплату: ' + e.message); } };
const handleSwitchToSmartDeal = async (payload) => { isIncomePopupVisible.value = false; smartDealPayload.value = payload; let status = payload.dealStatus; if (!status && payload.projectId) { try { status = mainStore.getProjectDealStatus(payload.projectId, payload.categoryId, payload.contractorId, payload.counterpartyIndividualId); } catch(e) { console.error('Error fetching status:', e); } } smartDealStatus.value = status || { debt: 0, totalDeal: 0 }; isSmartDealPopupVisible.value = true; };
const handleSmartDealConfirm = async ({ closePrevious, isFinal, nextTrancheNum }) => { isSmartDealPopupVisible.value = false; const data = smartDealPayload.value; if (!data) return; try { if (closePrevious === true && !isFinal) { await mainStore.closePreviousTranches(data.projectId, data.categoryId, data.contractorId, data.counterpartyIndividualId); } const trancheNum = nextTrancheNum || 2; const formattedAmount = formatNumber(data.amount); const description = `${formattedAmount} ${trancheNum}-й транш`; const incomeData = { type: 'income', amount: data.amount, date: new Date(data.date), accountId: data.accountId, projectId: data.projectId, contractorId: data.contractorId, counterpartyIndividualId: data.counterpartyIndividualId, categoryId: data.categoryId, companyId: data.companyId, individualId: data.individualId, totalDealAmount: 0, isDealTranche: true, isClosed: isFinal, description: description, cellIndex: data.cellIndex }; if (incomeData.cellIndex === undefined) { const dateKey = mainStore._getDateKey(new Date(data.date)); incomeData.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); } const newOp = await mainStore.createEvent(incomeData); if (isFinal) { await mainStore.closePreviousTranches(data.projectId, data.categoryId, data.contractorId, data.counterpartyIndividualId); await mainStore.createWorkAct(data.projectId, data.categoryId, data.contractorId, data.counterpartyIndividualId, data.amount, new Date(), newOp._id, true, data.companyId, data.individualId); } } catch (e) { console.error('Smart Deal Error:', e); alert('Ошибка при проведении транша: ' + e.message); } };
const handleItemClick = (item) => { if (item.isList && item.originalOp) { handleEditOperation(item.originalOp); } else if (!item.isList && item.isLinked && item.linkTooltip) { infoModalTitle.value = 'Связь'; infoModalMessage.value = item.linkTooltip; showInfoModal.value = true; } };

const handleTaxDelete = async (operation) => { isTaxDetailsPopupVisible.value = false; if (!operation) return; try { await mainStore.deleteOperation(operation); await mainStore.fetchAllEntities(); } catch(e) { alert("Ошибка удаления налога: " + e.message); } };
const handleRetailClosure = async (payload) => { try { const pId = payload.projectId || (payload.projectIds && payload.projectIds.length > 0 ? payload.projectIds[0] : null); await mainStore.closeRetailDaily(payload.amount, new Date(payload.date), pId); isRetailPopupVisible.value = false; } catch (e) { alert('Ошибка: ' + e.message); } };
const handleRetailSave = async ({ id, data }) => { isRetailPopupVisible.value = false; try { const pId = data.projectId || (data.projectIds && data.projectIds.length > 0 ? data.projectIds[0] : null); await mainStore.updateOperation(id, { amount: -Math.abs(data.amount), projectId: pId, date: new Date(data.date) }); } catch (e) { alert('Ошибка сохранения списания: ' + e.message); } };
const handleRetailDelete = async (op) => { isRetailPopupVisible.value = false; try { await mainStore.deleteOperation(op); } catch (e) { alert('Ошибка удаления'); } };
const handleRefundSave = async ({ mode, id, data }) => { isRefundPopupVisible.value = false; try { if (mode === 'create') await mainStore.createEvent(data); else await mainStore.updateOperation(id, data); } catch (e) { alert('Ошибка сохранения возврата'); } };
const handleRefundDelete = async (op) => { isRefundPopupVisible.value = false; try { await mainStore.deleteOperation(op); } catch (e) { alert('Ошибка удаления'); } };
const handleClosePopup = () => { isIncomePopupVisible.value = false; isExpensePopupVisible.value = false; operationToEdit.value = null; };
const handleCloseWithdrawalPopup = () => { isWithdrawalPopupVisible.value = false; operationToEdit.value = null; };
const handleWithdrawalSave = async ({ mode, id, data }) => { try { if (mode === 'create') { if (data.cellIndex === undefined) { const dateKey = mainStore._getDateKey(new Date(data.date)); data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); } await mainStore.createEvent(data); } else { await mainStore.updateOperation(id, data); } isWithdrawalPopupVisible.value = false; } catch (e) { console.error("Mobile Withdrawal Save Error", e); alert("Ошибка сохранения"); } };
const handleOperationDelete = async (operation) => { if (!operation) return; await mainStore.deleteOperation(operation); handleClosePopup(); };
const handleAction = () => {}; 
</script>

<template>
  <div class="mobile-layout" @click="isContextMenuVisible = false">
    
    <div v-if="mainStore.isAuthLoading" class="loading-screen">
      <div class="spinner"></div>
      <p>Загрузка...</p>
    </div>

    <div v-else-if="!mainStore.user" class="login-screen">
      <div class="login-box">
          <h1>Управляйте финансами легко INDEX12.COM</h1>
          <a href="/auth/google" class="google-login-button">Войти через Google</a>
      </div>
    </div>

    <template v-else>
        <!-- Fullscreen Widget Overlay (без изменений) -->
        <div v-if="isWidgetFullscreen" class="fullscreen-widget-overlay">
             <!-- ... (код виджета) ... -->
             <div class="fs-header">
                <div class="fs-title">{{ activeWidgetTitle }}</div>
                <div class="fs-controls">
                    <!-- 🟢 НОВАЯ КНОПКА: Учет скрытых счетов -->
                    <button 
                        v-if="activeWidgetKey === 'accounts'" 
                        class="action-square-btn" 
                        :class="{ active: mainStore.includeExcludedInTotal }" 
                        @click="mainStore.toggleExcludedInclusion()" 
                        title="Учитывать скрытые счета"
                    >
                        <!-- Иконка: Глаз (Открыт/Включено) -->
                        <svg v-if="mainStore.includeExcludedInTotal" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        <!-- Иконка: Глаз перечеркнут (Скрыто) -->
                        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                            <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                    </button>

                    <button v-if="!isListWidget" ref="filterBtnRef" class="action-square-btn" :class="{ active: isFilterOpen || filterMode !== 'all' || sortMode !== 'default' }" @click.stop="toggleFilter" title="Фильтр"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg></button>
                    <button class="action-square-btn" :class="{ active: showFutureBalance }" @click="showFutureBalance = !showFutureBalance" title="Прогноз"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg></button>
                </div>
            </div>
            <div class="fs-body">
                <div v-if="!activeWidgetItems.length" class="fs-empty">Пусто</div>
                <div class="fs-list">
                    <div v-for="item in activeWidgetItems" :key="item._id" class="fs-item" @click="handleItemClick(item)">
                       <template v-if="item.isList">
                           <div class="fs-item-left"><div class="fs-date">{{ formatDateShort(item.date) }}</div><div class="fs-info-col"><div class="fs-name-text">{{ item.name }}</div><div class="fs-sub-text" v-if="item.subName">{{ item.subName }}</div></div></div>
                           <div class="fs-val" :class="item.isIncome ? 'green-text' : 'red-text'">{{ item.isIncome ? '+' : '-' }} {{ formatNumber(Math.abs(item.balance)) }} ₸</div>
                       </template>
                       <template v-else>
                           <div class="fs-name-col"><div class="fs-name-row"><span v-if="item.linkMarkerColor" class="color-dot" :style="{ backgroundColor: item.linkMarkerColor }"></span><span class="fs-name">{{ item.name }}</span><span v-if="item.isLinked" class="link-icon" style="margin-left: 6px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></span>
                           <!-- 🟢 Иконка исключенного счета (Динамическая) -->
                           <span v-if="item.isExcluded" class="excluded-icon" :class="{ 'included-now': mainStore.includeExcludedInTotal }" title="Исключен из общего баланса" style="margin-left: 6px;">
                                <svg v-if="mainStore.includeExcludedInTotal" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>
                                </svg>
                           </span>
                           </div><div v-if="item.subName" class="fs-sub-text-small">{{ item.subName }}</div><div v-if="item.regime" class="fs-regime-badge" :class="item.regime === 'УПР' ? 'badge-upr' : 'badge-our'">{{ item.regime }} {{ item.percent }}%</div></div>
                           <div class="fs-val-block"><div v-if="!showFutureBalance" class="fs-val" :class="getValueClass(item.currentBalance, activeWidgetKey)">{{ formatVal(item.currentBalance) }}</div><div v-else class="fs-val-forecast"><span class="fs-curr" :class="getValueClass(item.currentBalance, activeWidgetKey)">{{ formatVal(item.currentBalance) }}</span><span class="fs-arrow">></span><span v-if="isWidgetDeltaMode" class="fs-fut" :class="getDeltaClass(item.futureChange, activeWidgetKey)">{{ formatDelta(item.futureChange) }}</span><span v-else class="fs-fut" :class="Number(item.futureBalance) < 0 ? 'red-text' : 'white-text'">{{ formatVal(item.futureBalance) }}</span></div></div>
                       </template>
                    </div>
                </div>
            </div>
            <div class="fs-footer"><button class="btn-back" @click="handleWidgetBack">Назад</button></div>
            <Teleport to="body"><div v-if="isFilterOpen" class="filter-dropdown-fixed" :style="filterPos" ref="filterDropdownRef" @mousedown.stop @click.stop><div class="filter-group"><div class="filter-group-title">Сортировка</div><ul><li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')"><span>По убыванию</span></li><li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')"><span>По возрастанию</span></li></ul></div><div class="filter-group"><div class="filter-group-title">Фильтр</div><ul><li :class="{ active: filterMode === 'all' }" @click="setFilterMode('all')">Все</li><li :class="{ active: filterMode === 'nonZero' }" @click="setFilterMode('nonZero')">Скрыть 0</li><li :class="{ active: filterMode === 'positive' }" @click="setFilterMode('positive')">Только (+)</li><li :class="{ active: filterMode === 'negative' }" @click="setFilterMode('negative')">Только (-)</li></ul></div></div></Teleport>
        </div>

        <div class="main-content-view">
            <MobileHeaderTotals class="fixed-header" />
            
            <div class="layout-body">
              <MobileWidgetGrid class="section-widgets" :class="{ 'expanded-widgets': mainStore.isHeaderExpanded }" @widget-click="onWidgetClick" />
              
              <div class="section-timeline" v-show="!mainStore.isHeaderExpanded">
                <div v-if="isTimelineLoading" class="section-loading"><div class="spinner-small"></div></div>
                <!-- 🟢 FIX: Прокидываем событие дропа -->
                <MobileTimeline v-else ref="timelineRef" @show-menu="handleShowMenu" @drop-operation="handleOperationDrop" />
              </div>
              
              <div class="section-chart" v-show="!mainStore.isHeaderExpanded">
                <div v-if="isTimelineLoading" class="section-loading"><div class="spinner-small"></div></div>
                <MobileChartSection v-else ref="chartRef" @scroll="onChartScroll" />
              </div>
            </div>
            
            <div class="fixed-footer">
              <MobileActionPanel @action="handleAction" @open-graph="showGraphModal = true" />
            </div>
        </div>
    </template>

    <!-- 🟢 ГЛОБАЛЬНОЕ МЕНЮ (ДЛЯ ПУСТЫХ ЯЧЕЕК) -->
    <CellContextMenu 
        v-if="isContextMenuVisible" 
        :style="contextMenuPosition" 
        @select="handleContextMenuSelect" 
    />

    <!-- Popups -->
    <InfoModal v-if="showInfoModal" :title="infoModalTitle" :message="infoModalMessage" @close="showInfoModal = false" />
    <MobileGraphModal v-if="showGraphModal" @close="showGraphModal = false" />
    <IncomePopup v-if="isIncomePopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" :operation-to-edit="operationToEdit" @close="handleClosePopup" @save="handleOperationSave" @operation-deleted="handleOperationDelete($event)" @trigger-prepayment="handleSwitchToPrepayment" @trigger-smart-deal="handleSwitchToSmartDeal" />
    <ExpensePopup v-if="isExpensePopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" :operation-to-edit="operationToEdit" @close="handleClosePopup" @save="handleOperationSave" @operation-deleted="handleOperationDelete($event)" />
    <PrepaymentModal v-if="isPrepaymentModalVisible" :initialData="prepaymentData" :dateKey="prepaymentDateKey" @close="isPrepaymentModalVisible = false" @save="handlePrepaymentSave" />
    <SmartDealPopup v-if="isSmartDealPopupVisible" :deal-status="smartDealStatus" :current-amount="smartDealPayload?.amount || 0" :project-name="smartDealPayload?.projectName || 'Проект'" :contractor-name="smartDealPayload?.contractorName || 'Контрагент'" :category-name="smartDealPayload?.categoryName || 'Категория'" @close="handleSmartDealCancel" @confirm="handleSmartDealConfirm" />
    <TransferPopup v-if="isTransferPopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" @close="isTransferPopupVisible = false" @save="handleTransferSave" />
    <WithdrawalPopup v-if="isWithdrawalPopupVisible" :initial-data="{ amount: 0 }" :operation-to-edit="operationToEdit" @close="handleCloseWithdrawalPopup" @save="handleWithdrawalSave" />
    <RetailClosurePopup v-if="isRetailPopupVisible" :operation-to-edit="operationToEdit" @close="isRetailPopupVisible = false" @confirm="handleRetailClosure" @save="handleRetailSave" @delete="handleRetailDelete" />
    <RefundPopup v-if="isRefundPopupVisible" :operation-to-edit="operationToEdit" @close="isRefundPopupVisible = false" @save="handleRefundSave" @delete="handleRefundDelete" />
    <TaxPaymentDetailsPopup v-if="isTaxDetailsPopupVisible" :operation-to-edit="operationToEdit" @close="isTaxDetailsPopupVisible = false" @delete="handleTaxDelete" />
  </div>
</template>

<style scoped>
.mobile-layout { height: 100vh; height: 100dvh; width: 100vw; background-color: var(--color-background, #1a1a1a); display: flex; flex-direction: column; overflow: hidden; }
.loading-screen { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; }
.spinner { width: 40px; height: 40px; border: 3px solid #333; border-top-color: var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px; }
.section-loading { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.spinner-small { width: 20px; height: 20px; border: 2px solid #333; border-top-color: var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.login-screen { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #1a1a1a; padding: 20px; box-sizing: border-box; }
.login-box { width: 100%; max-width: 320px; text-align: center; }
.login-box h1 { color: #fff; font-size: 24px; margin-bottom: 10px; font-weight: 700; }
.google-login-button { display: block; width: 100%; padding: 12px; background: #fff; color: #333; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin-bottom: 10px; }
.dev-login-button { display: block; width: 100%; padding: 12px; background: #333; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; border: 1px solid #444; }

/* Fullscreen Styles */
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
.excluded-icon { display: inline-flex; align-items: center; opacity: 0.8; color: #888; transition: all 0.2s; }
.excluded-icon.included-now { color: #34c759; opacity: 1; text-shadow: 0 0 5px rgba(52, 199, 89, 0.4); }

.red-text { color: #ff3b30 !important; }
.green-text { color: #34c759 !important; }
.white-text { color: #fff !important; }
.fs-empty { text-align: center; color: #666; margin-top: 50px; }
.fs-footer { padding: 15px 20px; background-color: var(--color-background, #1a1a1a); border-top: 1px solid var(--color-border, #444); }
.btn-back { width: 100%; height: 48px; background: #333; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
.main-content-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; width: 100%; height: 100%; }
.fixed-header, .fixed-footer { flex-shrink: 0; }
.layout-body { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; position: relative; }
.section-widgets { width: 100%; flex-shrink: 0; flex-basis: auto; max-height: 60vh; overflow-y: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
.section-widgets.expanded-widgets { flex: 1 1 0px; min-height: 0; height: auto; max-height: none; padding-bottom: 80px; }
:deep(.widgets-grid) { align-content: start !important; min-height: min-content; }
.section-widgets::-webkit-scrollbar { display: none; }
.section-timeline { flex-shrink: 0; height: 180px; border-top: 1px solid var(--color-border, #444); }
.section-chart { flex-grow: 1; min-height: 50px; border-top: 1px solid var(--color-border, #444); }
.fixed-footer { flex-shrink: 0; z-index: 200; background-color: var(--color-background, #1a1a1a); border-top: 1px solid var(--color-border, #444); }
.fs-regime-badge { font-size: 10px; padding: 1px 5px; border-radius: 4px; font-weight: 700; text-transform: uppercase; margin-top: 3px; display: inline-block; width: fit-content; }
.badge-upr { background-color: rgba(52, 199, 89, 0.15); color: #34c759; border: 1px solid rgba(52, 199, 89, 0.3); }
.badge-our { background-color: rgba(255, 157, 0, 0.15); color: #FF9D00; border: 1px solid rgba(255, 157, 0, 0.3); }
</style>