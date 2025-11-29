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
// MobileBottomNav удален

// Modals (Оставляем импорты на случай, если они нужны для чтения, но триггеры удалены из UI)
// В режиме "Только просмотр" они фактически не вызываются пользователем
import EntityPopup from '@/components/EntityPopup.vue';
import EntityListEditor from '@/components/EntityListEditor.vue';
import OperationListEditor from '@/components/OperationListEditor.vue';
import OperationPopup from '@/components/OperationPopup.vue';
import TransferPopup from '@/components/TransferPopup.vue';
import WithdrawalPopup from '@/components/WithdrawalPopup.vue';
import RetailClosurePopup from '@/components/RetailClosurePopup.vue';
import RefundPopup from '@/components/RefundPopup.vue';

const mainStore = useMainStore();
const timelineRef = ref(null);
const chartRef = ref(null);

// --- Widget Fullscreen Logic ---
const activeWidgetKey = ref(null);
const isWidgetFullscreen = computed(() => !!activeWidgetKey.value);

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

// Управление прогнозом внутри виджета
const showFutureBalance = computed({
  get: () => activeWidgetKey.value ? (mainStore.dashboardForecastState[activeWidgetKey.value] ?? false) : false,
  set: (val) => { if (activeWidgetKey.value) mainStore.setForecastState(activeWidgetKey.value, val); }
});

// Получение и фильтрация данных для полноэкранного списка
const activeWidgetItems = computed(() => {
  const k = activeWidgetKey.value;
  if (!k) return [];
  
  const useFuture = showFutureBalance.value;
  let items = [];
  
  if (k === 'accounts') items = useFuture ? mainStore.futureAccountBalances : mainStore.currentAccountBalances;
  else if (k === 'companies') items = useFuture ? mainStore.futureCompanyBalances : mainStore.currentCompanyBalances;
  else if (k === 'contractors') {
      const source = useFuture ? mainStore.futureContractorBalances : mainStore.currentContractorBalances;
      const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
      items = (source || []).filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));
  }
  else if (k === 'projects') items = useFuture ? mainStore.futureProjectBalances : mainStore.currentProjectBalances;
  else if (k === 'individuals') items = useFuture ? mainStore.futureIndividualBalances : mainStore.currentIndividualBalances;
  else if (k === 'categories') {
      const source = useFuture ? mainStore.futureCategoryBalances : mainStore.currentCategoryBalances;
      const visibleIds = new Set(mainStore.visibleCategories.map(c => c._id));
      items = (source || []).filter(c => visibleIds.has(c._id));
  }
  else if (['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(k)) {
      let list = [];
      if (k === 'incomeList') list = mainStore.currentIncomes;
      else if (k === 'expenseList') list = mainStore.currentExpenses;
      else if (k === 'withdrawalList') list = mainStore.currentWithdrawals;
      else if (k === 'transfers') list = mainStore.currentTransfers;
      const sum = (list || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
      items = [{ _id: 'total', name: 'Всего за период', balance: sum }];
  }

  let filtered = [...items];
  if (filterMode.value === 'positive') filtered = filtered.filter(i => (i.balance || 0) > 0);
  else if (filterMode.value === 'negative') filtered = filtered.filter(i => (i.balance || 0) < 0);
  else if (filterMode.value === 'nonZero') filtered = filtered.filter(i => (i.balance || 0) !== 0);

  if (sortMode.value === 'desc') filtered.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  else if (sortMode.value === 'asc') filtered.sort((a, b) => (a.balance || 0) - (b.balance || 0));

  return filtered;
});

const handleWidgetBack = () => { 
    activeWidgetKey.value = null; 
    isFilterOpen.value = false; 
};
const onWidgetClick = (key) => { activeWidgetKey.value = key; };

// --- Handlers for Entity Popups (Removed from UI but kept for safety/logic integrity) ---
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

// --- Operation Modals (Removed triggers) ---
const isOperationPopupVisible = ref(false);
const operationType = ref('income');
const isTransferPopupVisible = ref(false);
const isWithdrawalPopupVisible = ref(false);
const isRetailPopupVisible = ref(false);
const isRefundPopupVisible = ref(false);
const operationToEdit = ref(null);
const selectedDate = ref(new Date());
const selectedCellIndex = ref(0);

// Action handler обновлен (но сами кнопки действий удалены в MobileActionPanel)
const handleAction = (type) => {
  // Заглушка, если вдруг вызов придет
  console.log('Action triggered:', type);
};

// Клик по операции отключен на уровне ячейки (MobileHourCell), 
// но если нужно, можно оставить пустую функцию
const handleOpClick = (op) => {
  // Режим просмотра: можно открыть попап только для чтения, 
  // но по ТЗ "Вносить данные будет через десктоп", подразумевается 
  // и редактирование тоже. Пока отключаем реакцию.
  console.log('Op click disabled for view-only mode');
};

const handleOpAdd = ({ date, cellIndex }) => {
  // Отключено
};

let isSyncing = false;
const onTimelineScroll = (event) => { if (isSyncing) return; isSyncing = true; if (chartRef.value) chartRef.value.setScroll(event.target.scrollLeft); requestAnimationFrame(() => isSyncing = false); };
const onChartScroll = (left) => { if (isSyncing) return; isSyncing = true; const el = timelineRef.value?.$el.querySelector('.timeline-grid'); if (el) el.scrollLeft = left; requestAnimationFrame(() => isSyncing = false); };

onMounted(async () => {
  await mainStore.checkAuth();
  if (!mainStore.user) return;
  await mainStore.fetchAllEntities();
  nextTick(() => {
      const el = timelineRef.value?.$el.querySelector('.timeline-grid');
      if (el) { el.addEventListener('scroll', onTimelineScroll); const w = window.innerWidth * 0.25; el.scrollLeft = w * 4; if (chartRef.value) chartRef.value.setScroll(w * 4); }
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

const formatVal = (val) => `${formatNumber(Math.abs(Number(val) || 0))} ₸`;
const isExpense = (val) => Number(val) < 0;
</script>

<template>
  <div class="mobile-layout">
    
    <!-- 🟢 ПОЛНОЭКРАННЫЙ ВИДЖЕТ (ТОЛЬКО ПРОСМОТР) -->
    <div v-if="isWidgetFullscreen" class="fullscreen-widget-overlay">
        <div class="fs-header">
            <div class="fs-title">{{ activeWidgetTitle }}</div>
            
            <!-- 🟢 ПАНЕЛЬ УПРАВЛЕНИЯ (Убраны Редактировать и Создать) -->
            <div class="fs-controls">
                <!-- Фильтр -->
                <button ref="filterBtnRef" class="action-square-btn" :class="{ active: isFilterOpen || filterMode !== 'all' }" @click.stop="toggleFilter" title="Фильтр">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                </button>
                <!-- Прогноз (Реализация п.5 ТЗ) -->
                <button class="action-square-btn" :class="{ active: showFutureBalance }" @click="showFutureBalance = !showFutureBalance" title="Прогноз">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                </button>
            </div>
        </div>

        <!-- Teleport MENU -->
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
                    <span class="fs-val" :class="{ 'red-text': isExpense(item.balance) }">
                        {{ formatVal(item.balance) }}
                    </span>
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
          <!-- 
             🟢 ЛОГИКА ОТОБРАЖЕНИЯ (п.6 ТЗ): 
             MobileWidgetGrid скрыт по умолчанию (v-show).
             Тоталы показаны в MobileHeaderTotals (всегда).
             Остальные виджеты - в MobileWidgetGrid, который зависит от isHeaderExpanded.
          -->
          <MobileWidgetGrid 
             v-show="mainStore.isHeaderExpanded" 
             class="section-widgets" 
             @widget-click="onWidgetClick" 
          />
          
          <div class="section-timeline">
            <!-- События клика и добавления отключены -->
            <MobileTimeline ref="timelineRef" />
          </div>
          <div class="section-chart">
            <MobileChartSection ref="chartRef" @scroll="onChartScroll" />
          </div>
        </div>
        
        <div class="fixed-footer">
          <MobileActionPanel @action="handleAction" />
          <!-- MobileBottomNav удален -->
        </div>
    </template>

    <!-- Modals (Оставлены в коде, но UI вызова удален) -->
    <!-- ...код модалок остался для компиляции, но они не открываются... -->
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


.fs-body { flex-grow: 1; overflow-y: auto; padding: 16px; }
.fs-list { display: flex; flex-direction: column; gap: 8px; }
.fs-item {
    display: flex; justify-content: space-between; align-items: center; padding: 15px;
    background: var(--color-background-soft, #282828); border: 1px solid var(--color-border, #444);
    border-radius: 8px;
}
.fs-name { font-size: 14px; color: #fff; font-weight: 600; text-transform: uppercase; }
.fs-val { font-size: 14px; color: #fff; font-weight: 700; }
.red-text { color: #ff3b30; }
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