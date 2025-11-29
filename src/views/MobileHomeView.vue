<script setup>
import { onMounted, ref, nextTick, computed, watch, onUnmounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

// UI
import MobileHeaderTotals from '@/components/mobile/MobileHeaderTotals.vue';
import MobileWidgetGrid from '@/components/mobile/MobileWidgetGrid.vue';
import MobileTimeline from '@/components/mobile/MobileTimeline.vue';
import MobileChartSection from '@/components/mobile/MobileChartSection.vue';
import MobileActionPanel from '@/components/mobile/MobileActionPanel.vue';

// Modals
import EntityPopup from '@/components/EntityPopup.vue';
import EntityListEditor from '@/components/EntityListEditor.vue';
import OperationListEditor from '@/components/OperationListEditor.vue';
import OperationPopup from '@/components/OperationPopup.vue';
import TransferPopup from '@/components/TransferPopup.vue';
import WithdrawalPopup from '@/components/WithdrawalPopup.vue';
import RetailClosurePopup from '@/components/RetailClosurePopup.vue';
import RefundPopup from '@/components/RefundPopup.vue';
import MobileGraphModal from '@/components/mobile/MobileGraphModal.vue'; // 🟢 1. ИМПОРТ MOBILE MODAL

const mainStore = useMainStore();
const timelineRef = ref(null);
const chartRef = ref(null);

const showGraphModal = ref(false);
const isDataLoaded = ref(false); 

// --- Widget Fullscreen Logic ---
const activeWidgetKey = ref(null);
const isWidgetFullscreen = computed(() => !!activeWidgetKey.value);

// 🟢 БЛОКИРОВКА СКРОЛЛА ПРИ ОТКРЫТИИ ПОЛНОЭКРАННОГО ВИДЖЕТА
watch(isWidgetFullscreen, (isOpen) => {
    if (isOpen) {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden'; 
    } else {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    }
});

onUnmounted(() => {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
});

const activeWidgetTitle = computed(() => {
  if (!activeWidgetKey.value) return '';
  const w = mainStore.allWidgets.find(x => x.key === activeWidgetKey.value);
  return w ? w.name : 'Виджет';
});

// --- Filter Logic (Teleported) ---
const isFilterOpen = ref(false);
const filterBtnRef = ref(null); 
const filterPos = ref({ top: '0px', right: '16px' }); 
const sortMode = ref('default'); 
const filterMode = ref('all'); 

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

const closeFilter = () => { isFilterOpen.value = false; };
const setSortMode = (mode) => { sortMode.value = mode; isFilterOpen.value = false; };
const setFilterMode = (mode) => { filterMode.value = mode; isFilterOpen.value = false; };

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
          return { ...item, futureBalance: futureVal };
      });
  } else {
      result = currentBalances.map(item => ({ ...item, futureBalance: isDelta ? 0 : item.balance }));
  }
  return result;
};

const isWidgetDeltaMode = computed(() => {
    const k = activeWidgetKey.value;
    return ['contractors', 'projects', 'individuals', 'categories'].includes(k);
});

const activeWidgetItems = computed(() => {
  const k = activeWidgetKey.value;
  if (!k) return [];
  
  let items = [];
  
  if (k === 'accounts') {
      items = mergeBalances(mainStore.currentAccountBalances, mainStore.futureAccountBalances, false);
  } 
  else if (k === 'companies') {
      items = mergeBalances(mainStore.currentCompanyBalances, mainStore.futureCompanyBalances, false);
  } 
  else if (k === 'contractors') {
      items = mergeBalances(mainStore.currentContractorBalances, mainStore.futureContractorChanges, true);
      const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
      items = items.filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));
  }
  else if (k === 'projects') {
      items = mergeBalances(mainStore.currentProjectBalances, mainStore.futureProjectChanges, true);
  }
  else if (k === 'individuals') {
      items = mergeBalances(mainStore.currentIndividualBalances, mainStore.futureIndividualChanges, true);
  }
  else if (k === 'categories') {
      items = mergeBalances(mainStore.currentCategoryBalances, mainStore.futureCategoryChanges, true);
      const visibleIds = new Set(mainStore.visibleCategories.map(c => c._id));
      items = items.filter(c => visibleIds.has(c._id));
  }
  else if (['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(k)) {
      let listCurr = [];
      let listFut = [];
      
      if (k === 'incomeList') { listCurr = mainStore.currentIncomes; listFut = mainStore.futureIncomes; }
      else if (k === 'expenseList') { listCurr = mainStore.currentExpenses; listFut = mainStore.futureExpenses; }
      else if (k === 'withdrawalList') { listCurr = mainStore.currentWithdrawals; listFut = mainStore.futureWithdrawals; }
      else if (k === 'transfers') { listCurr = mainStore.currentTransfers; listFut = mainStore.futureTransfers; }
      
      const sumCurr = (listCurr || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
      const sumFut = (listFut || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
      
      items = [{ _id: 'total', name: 'Всего', balance: sumCurr, futureBalance: sumCurr + sumFut }];
  }

  let filtered = [...items];
  const targetBalanceKey = showFutureBalance.value ? 'futureBalance' : 'balance'; 

  if (filterMode.value === 'positive') filtered = filtered.filter(i => (i[targetBalanceKey] || 0) > 0);
  else if (filterMode.value === 'negative') filtered = filtered.filter(i => (i[targetBalanceKey] || 0) < 0);
  else if (filterMode.value === 'nonZero') filtered = filtered.filter(i => (i[targetBalanceKey] || 0) !== 0);

  const getSortVal = (i) => i[targetBalanceKey] || 0;
  if (sortMode.value === 'desc') filtered.sort((a, b) => getSortVal(b) - getSortVal(a));
  else if (sortMode.value === 'asc') filtered.sort((a, b) => getSortVal(a) - getSortVal(b));

  return filtered;
});

const handleWidgetBack = () => { 
    activeWidgetKey.value = null; 
    isFilterOpen.value = false; 
};
const onWidgetClick = (key) => { activeWidgetKey.value = key; };

const formatVal = (val) => `${formatNumber(Math.abs(Number(val) || 0))} ₸`;
const formatDelta = (val) => {
  const num = Number(val) || 0;
  if (num === 0) return '0 ₸';
  const formatted = formatNumber(Math.abs(num));
  return num > 0 ? `+ ${formatted} ₸` : `- ${formatted} ₸`;
};
const isExpense = (val) => Number(val) < 0;

const isEntityPopupVisible = ref(false);
const isListEditorVisible = ref(false);
const popupTitle = ref('');
const popupSaveAction = ref(null);
const editorTitle = ref('');
const editorItems = ref([]);
const editorSavePath = ref(null);
const isOperationListEditorVisible = ref(false);
const operationListEditorTitle = ref('');
const operationListEditorType = ref('income');
const isOperationPopupVisible = ref(false);
const operationType = ref('income');
const isTransferPopupVisible = ref(false);
const isWithdrawalPopupVisible = ref(false);
const isRetailPopupVisible = ref(false);
const isRefundPopupVisible = ref(false);
const operationToEdit = ref(null);
const selectedDate = ref(new Date());
const selectedCellIndex = ref(0);
const handleAction = (type) => { console.log('Action:', type); };
const handleOpClick = (op) => {};
const handleOpAdd = () => {};
let isSyncing = false;
const onTimelineScroll = (event) => { if (isSyncing) return; isSyncing = true; if (chartRef.value) chartRef.value.setScroll(event.target.scrollLeft); requestAnimationFrame(() => isSyncing = false); };
const onChartScroll = (left) => { if (isSyncing) return; isSyncing = true; const el = timelineRef.value?.$el.querySelector('.timeline-grid'); if (el) el.scrollLeft = left; requestAnimationFrame(() => isSyncing = false); };

const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

onMounted(async () => {
  await mainStore.checkAuth();
  if (!mainStore.user) return;
  
  await mainStore.fetchAllEntities();
  
  const today = new Date();
  const todayDay = getDayOfYear(today);
  mainStore.setToday(todayDay);

  const currentMode = mainStore.projection?.mode || '12d';
  await mainStore.loadCalculationData(currentMode, today);
  
  isDataLoaded.value = true;

  nextTick(() => {
      const el = timelineRef.value?.$el.querySelector('.timeline-grid');
      if (el) { 
          el.addEventListener('scroll', onTimelineScroll); 
          const w = window.innerWidth * 0.25; 
          el.scrollLeft = w * 4; 
          if (chartRef.value) chartRef.value.setScroll(w * 4); 
      }
  });
});

const handleGlobalClick = (e) => {
    if (isFilterOpen.value && filterBtnRef.value && !filterBtnRef.value.contains(e.target)) {
        const menu = document.querySelector('.filter-dropdown-fixed');
        if (menu && !menu.contains(e.target)) {
            isFilterOpen.value = false;
        }
    }
};
onMounted(() => document.addEventListener('click', handleGlobalClick));
onUnmounted(() => document.removeEventListener('click', handleGlobalClick));
</script>

<template>
  <div class="mobile-layout">
    
    <div v-if="isWidgetFullscreen" class="fullscreen-widget-overlay">
        <div class="fs-header">
            <div class="fs-title">{{ activeWidgetTitle }}</div>
            <div class="fs-controls">
                <button ref="filterBtnRef" class="action-square-btn" :class="{ active: isFilterOpen || filterMode !== 'all' }" @click.stop="toggleFilter" title="Фильтр">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                </button>
                <button class="action-square-btn" :class="{ active: showFutureBalance }" @click="showFutureBalance = !showFutureBalance" title="Прогноз">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                </button>
            </div>
        </div>

        <Teleport to="body">
          <div v-if="isFilterOpen" class="filter-dropdown-fixed mobile-filter-menu" :style="filterPos" @click.stop>
            <div class="filter-group">
               <div class="filter-group-title">Сортировка</div>
               <ul>
                 <li :class="{ active: sortMode === 'default' }" @click="setSortMode('default')">По умолчанию</li>
                 <li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')">По убыванию</li>
                 <li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')">По возрастанию</li>
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

        <div class="fs-body">
            <div v-if="activeWidgetItems.length === 0" class="fs-empty">Нет данных</div>
            <div v-else class="fs-list">
                <div v-for="item in activeWidgetItems" :key="item._id" class="fs-item">
                    <span class="fs-name">{{ item.name }}</span>
                    
                    <span v-if="!showFutureBalance" class="fs-val" :class="{ 'red-text': isExpense(item.balance) }">
                        {{ formatVal(item.balance) }}
                    </span>

                    <div v-else class="fs-val-forecast">
                        <span class="fs-curr" :class="{ 'red-text': isExpense(item.balance) }">
                            {{ formatVal(item.balance) }}
                        </span>
                        <span class="fs-arrow">></span>
                        <span v-if="isWidgetDeltaMode" class="fs-fut" :class="{ 'red-text': item.futureBalance < 0, 'green-text': item.futureBalance > 0 }">
                            {{ formatDelta(item.futureBalance) }}
                        </span>
                        <span v-else class="fs-fut" :class="{ 'red-text': isExpense(item.futureBalance) }">
                            {{ formatVal(item.futureBalance) }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <div class="fs-footer">
            <button class="btn-back" @click="handleWidgetBack">Назад</button>
        </div>
    </div>

    <!-- ОБЫЧНЫЙ РЕЖИМ -->
    <template v-else>
        <MobileHeaderTotals class="fixed-header" />
        <div class="layout-body">
          <MobileWidgetGrid 
             v-show="mainStore.isHeaderExpanded" 
             class="section-widgets" 
             @widget-click="onWidgetClick" 
             @widget-add="(w) => { /* TODO: Add logic */ }"
             @widget-edit="(w) => { /* TODO: Edit logic */ }"
          />
          <div class="section-timeline">
            <MobileTimeline v-if="isDataLoaded" ref="timelineRef" />
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

    <!-- 🟢 2. ИСПОЛЬЗУЕМ MobileGraphModal -->
    <MobileGraphModal v-if="showGraphModal" @close="showGraphModal = false" />
    
    <!-- (Other modals) -->
    <EntityPopup v-if="isEntityPopupVisible" :title="popupTitle" @close="isEntityPopupVisible = false" @save="(val) => popupSaveAction(val)" />
    <EntityListEditor v-if="isListEditorVisible" :title="editorTitle" :items="editorItems" @close="isListEditorVisible = false" @save="(items) => { /* save logic */ }" />
    <OperationListEditor v-if="isOperationListEditorVisible" :title="operationListEditorTitle" :type="operationListEditorType" @close="isOperationListEditorVisible = false" />
    <OperationPopup v-if="isOperationPopupVisible" :type="operationType" :date="selectedDate" :cellIndex="selectedCellIndex" :operation-to-edit="operationToEdit" @close="isOperationPopupVisible = false" />
    <TransferPopup v-if="isTransferPopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" @close="isTransferPopupVisible = false" />
    <WithdrawalPopup v-if="isWithdrawalPopupVisible" :initial-data="{ amount: 0 }" @close="isWithdrawalPopupVisible = false" />
    <RetailClosurePopup v-if="isRetailPopupVisible" :operation-to-edit="operationToEdit" @close="isRetailPopupVisible = false" />
    <RefundPopup v-if="isRefundPopupVisible" :operation-to-edit="operationToEdit" @close="isRefundPopupVisible = false" />
  </div>
</template>

<style scoped>
.mobile-layout {
  height: 100vh; height: 100dvh; width: 100vw;
  background-color: var(--color-background, #1a1a1a);
  display: flex; flex-direction: column; overflow: hidden; 
}

/* FULLSCREEN STYLES */
.fullscreen-widget-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: var(--color-background, #1a1a1a);
    z-index: 2000; display: flex; flex-direction: column;
}

.fs-header {
    height: 60px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center;
    padding: 0 16px; border-bottom: 1px solid var(--color-border, #444);
    background-color: var(--color-background-soft, #282828);
}
.fs-title { font-size: 18px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }

.fs-controls { display: flex; gap: 8px; }

.action-square-btn {
  width: 32px; height: 32px;
  border: 1px solid transparent; border-radius: 6px;
  background-color: #3D3B3B;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; padding: 0; color: #888;
  transition: all 0.2s ease;
}
.action-square-btn:hover { background-color: #555; color: #ccc; }
.action-square-btn.active { background-color: #34c759; color: #fff; border-color: transparent; }

/* 🟢 СТИЛИ ДЛЯ СКРОЛЛА */
.fs-body { 
    flex-grow: 1; 
    overflow-y: auto; 
    padding: 16px; 
    /* Скрываем скроллбар */
    scrollbar-width: none; 
    -ms-overflow-style: none;
}
.fs-body::-webkit-scrollbar { 
    display: none; 
}

.fs-list { display: flex; flex-direction: column; gap: 8px; }
.fs-item {
    display: flex; justify-content: space-between; align-items: center; padding: 15px;
    background: var(--color-background-soft, #282828); border: 1px solid var(--color-border, #444);
    border-radius: 8px;
}
.fs-name { font-size: 14px; color: #fff; font-weight: 600; text-transform: uppercase; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-val { font-size: 14px; color: #fff; font-weight: 700; }

.fs-val-forecast { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.fs-curr { color: #ccc; font-weight: 500; }
.fs-arrow { color: #666; font-size: 12px; }
.fs-fut { font-weight: 700; color: #fff; }

.red-text { color: #ff3b30 !important; }
.green-text { color: #34c759 !important; }

.fs-empty { text-align: center; color: #666; margin-top: 50px; }

.fs-footer {
    padding: 15px 20px; background-color: var(--color-background, #1a1a1a);
    border-top: 1px solid var(--color-border, #444);
}
.btn-back {
    width: 100%; height: 48px; background: #333; color: #fff;
    border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;
}

/* Normal Layout */
.fixed-header, .fixed-footer { flex-shrink: 0; }
.layout-body { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.section-widgets { flex-shrink: 0; max-height: 60vh; overflow-y: auto; scrollbar-width: none; }
.section-timeline { flex-shrink: 0; height: 180px; border-top: 1px solid var(--color-border, #444); }
.section-chart { flex-grow: 1; min-height: 50px; border-top: 1px solid var(--color-border, #444); }
.fixed-footer { flex-shrink: 0; z-index: 200; background-color: var(--color-background, #1a1a1a); border-top: 1px solid var(--color-border, #444); }
</style>

<style>
.mobile-filter-menu {
    z-index: 5001 !important;
    background-color: #333 !important;
    border-color: #555 !important;
    color: #fff !important;
    position: fixed;
    width: 160px;
    border-radius: 8px;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
    padding: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
}
.mobile-filter-menu .filter-group { display: flex; flex-direction: column; }
.mobile-filter-menu .filter-group-title { font-size: 11px; text-transform: uppercase; color: #888; padding: 4px 12px; font-weight: 600; letter-spacing: 0.5px; }
.mobile-filter-menu ul { list-style: none; margin: 0; padding: 0; }
.mobile-filter-menu li { padding: 8px 12px; font-size: 13px; color: #ddd !important; cursor: pointer; transition: background-color 0.2s; display: flex; align-items: center; justify-content: space-between; }
.mobile-filter-menu li:hover { background-color: rgba(255, 255, 255, 0.05); }
.mobile-filter-menu li.active { background-color: rgba(52, 199, 89, 0.2) !important; color: #34c759 !important; }
</style>