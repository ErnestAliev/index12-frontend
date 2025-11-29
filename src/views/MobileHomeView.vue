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
import MobileBottomNav from '@/components/mobile/MobileBottomNav.vue';

// Modals
import OperationPopup from '@/components/OperationPopup.vue';
import TransferPopup from '@/components/TransferPopup.vue';
import WithdrawalPopup from '@/components/WithdrawalPopup.vue';
import RetailClosurePopup from '@/components/RetailClosurePopup.vue';
import RefundPopup from '@/components/RefundPopup.vue';
import EntityPopup from '@/components/EntityPopup.vue';
import EntityListEditor from '@/components/EntityListEditor.vue';
import OperationListEditor from '@/components/OperationListEditor.vue';

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
const filterBtnRef = ref(null); // Ссылка на кнопку фильтра
const filterPos = ref({ top: '0px', right: '16px' }); // Позиция меню
const sortMode = ref('default'); // 'default', 'asc', 'desc'
const filterMode = ref('all'); // 'all', 'nonZero', 'positive', 'negative'

const toggleFilter = (event) => {
    if (isFilterOpen.value) {
        isFilterOpen.value = false;
    } else {
        // Вычисляем позицию относительно кнопки
        if (event && event.currentTarget) {
             const rect = event.currentTarget.getBoundingClientRect();
             // Позиционируем чуть ниже кнопки
             filterPos.value = { 
                 top: `${rect.bottom + 5}px`, 
                 // Стараемся выровнять по правому краю кнопки, но не уходить за экран
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
  
  // 1. Получаем исходный список
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
      // Для списков операций пока вернем агрегат (или список операций, если реализовать рендер)
      let list = [];
      if (k === 'incomeList') list = mainStore.currentIncomes;
      else if (k === 'expenseList') list = mainStore.currentExpenses;
      else if (k === 'withdrawalList') list = mainStore.currentWithdrawals;
      else if (k === 'transfers') list = mainStore.currentTransfers;
      const sum = (list || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
      // Для списков операций фильтрация по балансу не совсем применима к одной строке "Итого", но оставим логику
      items = [{ _id: 'total', name: 'Всего за период', balance: sum }];
  }

  // 2. Применяем фильтры
  let filtered = [...items];
  if (filterMode.value === 'positive') filtered = filtered.filter(i => (i.balance || 0) > 0);
  else if (filterMode.value === 'negative') filtered = filtered.filter(i => (i.balance || 0) < 0);
  else if (filterMode.value === 'nonZero') filtered = filtered.filter(i => (i.balance || 0) !== 0);

  // 3. Применяем сортировку
  if (sortMode.value === 'desc') filtered.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  else if (sortMode.value === 'asc') filtered.sort((a, b) => (a.balance || 0) - (b.balance || 0));
  // default: порядок из стора (обычно по order или alphabet)

  return filtered;
});

// Действия в хедере виджета
const handleWidgetBack = () => { 
    activeWidgetKey.value = null; 
    isFilterOpen.value = false; // Закрыть фильтр при выходе
};
const onWidgetClick = (key) => { activeWidgetKey.value = key; };

const handleWidgetAdd = () => {
    const k = activeWidgetKey.value;
    if (k === 'accounts') openAddPopup('Новый счет', mainStore.addAccount);
    else if (k === 'companies') openAddPopup('Новая компания', mainStore.addCompany);
    else if (k === 'contractors') openAddPopup('Новый контрагент', mainStore.addContractor);
    else if (k === 'projects') openAddPopup('Новый проект', mainStore.addProject);
    else if (k === 'categories') openAddPopup('Новая категория', mainStore.addCategory);
    else if (k === 'individuals') openAddPopup('Новое физлицо', mainStore.addIndividual);
    else if (k === 'transfers') isTransferPopupVisible.value = true;
    else if (k === 'incomeList') { operationType.value = 'income'; isOperationPopupVisible.value = true; }
    else if (k === 'expenseList') { operationType.value = 'expense'; isOperationPopupVisible.value = true; }
    else if (k === 'withdrawalList') isWithdrawalPopupVisible.value = true;
};

const handleWidgetEdit = () => {
    const k = activeWidgetKey.value;
    if (k === 'accounts') openEditPopup('Редактировать счета', mainStore.accounts, 'accounts');
    else if (k === 'companies') openEditPopup('Редактировать компании', mainStore.companies, 'companies');
    else if (k === 'contractors') openEditPopup('Редактировать контрагентов', mainStore.visibleContractors, 'contractors');
    else if (k === 'projects') openEditPopup('Редактировать проекты', mainStore.projects, 'projects');
    else if (k === 'categories') openEditPopup('Редактировать категории', mainStore.visibleCategories, 'categories');
    else if (k === 'individuals') openEditPopup('Редактировать физлиц', mainStore.individuals, 'individuals');
    
    else if (k === 'incomeList') { operationListEditorTitle.value = 'Редактировать доходы'; operationListEditorType.value = 'income'; isOperationListEditorVisible.value = true; }
    else if (k === 'expenseList') { operationListEditorTitle.value = 'Редактировать расходы'; operationListEditorType.value = 'expense'; isOperationListEditorVisible.value = true; }
    else if (k === 'withdrawalList') { operationListEditorTitle.value = 'Редактировать выводы'; operationListEditorType.value = 'withdrawal'; isOperationListEditorVisible.value = true; }
};

// --- Helper for Entity Popups ---
const isEntityPopupVisible = ref(false);
const isListEditorVisible = ref(false);
const popupTitle = ref('');
const popupSaveAction = ref(null);
const editorTitle = ref('');
const editorItems = ref([]);
const editorSavePath = ref(null);

// 🟢 Переменные для OperationListEditor
const isOperationListEditorVisible = ref(false);
const operationListEditorTitle = ref('');
const operationListEditorType = ref('income');

const openAddPopup = (title, action) => {
    popupTitle.value = title;
    popupSaveAction.value = async (name) => { await action(name); isEntityPopupVisible.value = false; };
    isEntityPopupVisible.value = true;
};
const openEditPopup = (title, items, path) => {
    editorTitle.value = title;
    editorItems.value = JSON.parse(JSON.stringify(items));
    editorSavePath.value = path;
    isListEditorVisible.value = true;
};
const onEntityListSave = async (items) => {
    await mainStore.batchUpdateEntities(editorSavePath.value, items);
    isListEditorVisible.value = false;
};


// ... (Остальная логика страницы) ...
const isOperationPopupVisible = ref(false);
const operationType = ref('income');
const isTransferPopupVisible = ref(false);
const isWithdrawalPopupVisible = ref(false);
const isRetailPopupVisible = ref(false);
const isRefundPopupVisible = ref(false);
const operationToEdit = ref(null);
const selectedDate = ref(new Date());
const selectedCellIndex = ref(0);

const handleAction = (type) => {
  operationToEdit.value = null; selectedDate.value = new Date(); selectedCellIndex.value = 0;
  if (type === 'transfer') isTransferPopupVisible.value = true;
  else if (type === 'income') { operationType.value = 'income'; isOperationPopupVisible.value = true; }
  else if (type === 'expense') { operationType.value = 'expense'; isOperationPopupVisible.value = true; }
};

const handleOpClick = (op) => {
  operationToEdit.value = op;
  if (mainStore._isRetailWriteOff(op)) { isRetailPopupVisible.value = true; return; }
  if (mainStore._isRetailRefund(op)) { isRefundPopupVisible.value = true; return; }
  if (op.type === 'transfer' || op.isTransfer) isTransferPopupVisible.value = true;
  else if (op.isWithdrawal) isWithdrawalPopupVisible.value = true;
  else { operationType.value = op.type; isOperationPopupVisible.value = true; }
};

const handleOpAdd = ({ date, cellIndex }) => {
  operationToEdit.value = null; selectedDate.value = date; selectedCellIndex.value = cellIndex;
  operationType.value = 'income'; isOperationPopupVisible.value = true;
};

const handleOperationAdded = async (newOp) => { if (newOp?.dateKey) await mainStore.addOperation(newOp); isOperationPopupVisible.value = false; };
const handleOperationSave = async ({ mode, id, data }) => { if (mode === 'create') { if (data.cellIndex === undefined) { const dateKey = mainStore._getDateKey(new Date(data.date)); data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); } await mainStore.createEvent(data); } else await mainStore.updateOperation(id, data); isOperationPopupVisible.value = false; };
const handleTransferSave = async ({ mode, id, data }) => { if (mode === 'create') { if (data.cellIndex === undefined) { const dateKey = mainStore._getDateKey(new Date(data.date)); data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); } await mainStore.createTransfer(data); } else await mainStore.updateTransfer(id, data); isTransferPopupVisible.value = false; };
const handleWithdrawalSave = async ({ mode, id, data }) => { if (mode === 'create') await mainStore.createEvent(data); else await mainStore.updateOperation(id, data); isWithdrawalPopupVisible.value = false; };
const handleRetailSave = async ({ id, data }) => { await mainStore.updateOperation(id, { amount: -Math.abs(data.amount), projectId: data.projectIds[0] || null, date: new Date(data.date) }); isRetailPopupVisible.value = false; };
const handleRefundSave = async ({ mode, id, data }) => { if (mode === 'create') await mainStore.createEvent(data); else await mainStore.updateOperation(id, data); isRefundPopupVisible.value = false; };
const handleRetailDelete = async (op) => { await mainStore.deleteOperation(op); isRetailPopupVisible.value = false; };
const handleRefundDelete = async (op) => { await mainStore.deleteOperation(op); isRefundPopupVisible.value = false; };
const handleOperationDelete = async () => { if (operationToEdit.value) { await mainStore.deleteOperation(operationToEdit.value); isOperationPopupVisible.value = false; } };

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

// Клик вне фильтра закрывает его
const handleGlobalClick = (e) => {
    if (isFilterOpen.value && filterBtnRef.value && !filterBtnRef.value.contains(e.target)) {
        // Проверка, что клик не внутри самого меню (меню в Teleport, поэтому e.target может быть где угодно)
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
    
    <!-- 🟢 ПОЛНОЭКРАННЫЙ ВИДЖЕТ -->
    <div v-if="isWidgetFullscreen" class="fullscreen-widget-overlay">
        <div class="fs-header">
            <div class="fs-title">{{ activeWidgetTitle }}</div>
            
            <!-- 🟢 ПАНЕЛЬ УПРАВЛЕНИЯ (КНОПКИ) -->
            <div class="fs-controls">
                <!-- Фильтр -->
                <button ref="filterBtnRef" class="action-square-btn" :class="{ active: isFilterOpen || filterMode !== 'all' }" @click.stop="toggleFilter" title="Фильтр">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                </button>
                <!-- Прогноз -->
                <button class="action-square-btn" :class="{ active: showFutureBalance }" @click="showFutureBalance = !showFutureBalance" title="Прогноз">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                </button>
                <!-- Редактировать -->
                <button class="action-square-btn" @click="handleWidgetEdit" title="Редактировать">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <!-- Создать -->
                <button class="action-square-btn" @click="handleWidgetAdd" title="Создать">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
            </div>
        </div>

        <!-- 🟢 Teleport MENU (Фильтр поверх всего) -->
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
          <MobileWidgetGrid class="section-widgets" @widget-click="onWidgetClick" />
          <div class="section-timeline">
            <MobileTimeline ref="timelineRef" @op-click="handleOpClick" @op-add="handleOpAdd" />
          </div>
          <div class="section-chart">
            <MobileChartSection ref="chartRef" @scroll="onChartScroll" />
          </div>
        </div>
        <div class="fixed-footer">
          <MobileActionPanel @action="handleAction" />
          <MobileBottomNav />
        </div>
    </template>

    <!-- Modals -->
    <!-- 🟢 Применили z-index: 3000+ в самих компонентах, здесь просто рендерим -->
    <EntityPopup v-if="isEntityPopupVisible" :title="popupTitle" @close="isEntityPopupVisible = false" @save="popupSaveAction" />
    
    <EntityListEditor v-if="isListEditorVisible" :title="editorTitle" :items="editorItems" @close="isListEditorVisible = false" @save="onEntityListSave" />
    <OperationListEditor v-if="isOperationListEditorVisible" :title="operationListEditorTitle" :type="operationListEditorType" @close="isOperationListEditorVisible = false" />

    <OperationPopup v-if="isOperationPopupVisible" :type="operationType" :date="selectedDate" :cellIndex="selectedCellIndex" :operation-to-edit="operationToEdit" @close="isOperationPopupVisible = false" @save="handleOperationSave" @operation-added="handleOperationAdded" @operation-deleted="handleOperationDelete" />
    <TransferPopup v-if="isTransferPopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" :transferToEdit="operationToEdit" @close="isTransferPopupVisible = false" @save="handleTransferSave" />
    <WithdrawalPopup v-if="isWithdrawalPopupVisible" :operation-to-edit="operationToEdit" :initial-data="{ amount: 0 }" @close="isWithdrawalPopupVisible = false" @save="handleWithdrawalSave" />
    <RetailClosurePopup v-if="isRetailPopupVisible" :operation-to-edit="operationToEdit" @close="isRetailPopupVisible = false" @save="handleRetailSave" @delete="handleRetailDelete" />
    <RefundPopup v-if="isRefundPopupVisible" :operation-to-edit="operationToEdit" @close="isRefundPopupVisible = false" @save="handleRefundSave" @delete="handleRefundDelete" />
  </div>
</template>

<style scoped>
.mobile-layout {
  height: 100vh; height: 100dvh; width: 100vw;
  background-color: var(--color-background, #1a1a1a);
  display: flex; flex-direction: column; overflow: hidden; 
}

/* FULLSCREEN STYLES */
/* 🟢 Подняли z-index виджета до 2000, чтобы он был выше основного контента, но ниже модалок */
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
.fs-title { font-size: 18px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }

/* КНОПКИ ДЕЙСТВИЙ */
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

<!-- 🟢 Стили для телепортированного меню (Глобально) -->
<style>
.mobile-filter-menu {
    z-index: 5001 !important; /* Выше чем fullscreen-widget-overlay (2000) */
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
.mobile-filter-menu .filter-group {
  display: flex;
  flex-direction: column;
}
.mobile-filter-menu .filter-group-title {
  font-size: 11px;
  text-transform: uppercase;
  color: #888;
  padding: 4px 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.mobile-filter-menu ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.mobile-filter-menu li {
  padding: 8px 12px;
  font-size: 13px;
  color: #ddd !important;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mobile-filter-menu li:hover {
  background-color: rgba(255, 255, 255, 0.05);
}
.mobile-filter-menu li.active {
    background-color: rgba(52, 199, 89, 0.2) !important;
    color: #34c759 !important;
}
</style>