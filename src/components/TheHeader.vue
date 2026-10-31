<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';
import { getHeaderWidgetColumns } from '@/utils/homeLayout.js';

// Карточки
import HeaderTotalCard from './HeaderTotalCard.vue';
import HeaderBalanceCard from './HeaderBalanceCard.vue';
import HeaderCategoryCard from './HeaderCategoryCard.vue';

// Попапы
import TransferPopup from './TransferPopup.vue';
import EntityPopup from './EntityPopup.vue';
import EntityListEditor from './EntityListEditor.vue';
import TransferListEditor from './TransferListEditor.vue';
import OperationListEditor from './OperationListEditor.vue';

import IncomePopup from './IncomePopup.vue';
import ExpensePopup from './ExpensePopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v47.1 - DRAGGABLE FIX ---
 * * ВЕРСИЯ: 47.1
 * * ДАТА: 2025-12-15
 * * ИЗМЕНЕНИЯ:
 * 1. (FIX) Удален комментарий из слота #item в draggable, который вызывал ошибку "Item slot must have only one child".
 */

const mainStore = useMainStore();

// --- ГЛОБАЛЬНОЕ МЕНЮ ВИДЖЕТОВ ---
const activeDropdown = ref(null);
const searchQuery = ref('');

// 🟢 FULLSCREEN STATE
const fullscreenWidgetKey = ref(null);

const openFullscreen = (key) => {
  // Don't open if we're dragging or if it's a placeholder
  if (isDragging.value) return;
  if (key && typeof key === 'string' && !key.startsWith('placeholder_')) {
    fullscreenWidgetKey.value = key;
    document.body.style.overflow = 'hidden'; // Блокируем скролл страницы
  }
};

const closeFullscreen = () => {
  fullscreenWidgetKey.value = null;
  document.body.style.overflow = ''; // Разблокируем скролл
};

const filteredWidgets = computed(function() {
  if (!searchQuery.value) return mainStore.allWidgets;
  const query = searchQuery.value.toLowerCase();
  return mainStore.allWidgets.filter(function(widget) {
    return widget.name.toLowerCase().includes(query);
  });
});

const handleOpenMenu = (payload) => {
  const rect = payload.event.currentTarget.getBoundingClientRect();
  activeDropdown.value = {
    index: payload.widgetIndex,
    key: payload.widgetKey,
    top: rect.bottom + 5,
    left: rect.left,
    width: 220
  };
  searchQuery.value = '';
};

const handleMenuSelect = (newWidgetKey) => {
  if (activeDropdown.value) {
    // Find first placeholder in localWidgets
    const placeholderIndex = localWidgets.value.findIndex(w => w && typeof w === 'string' && w.startsWith('placeholder_'));
    
    if (placeholderIndex !== -1) {
      // Convert localWidgets index to dashboardLayout index
      // Count how many real widgets (not placeholders, not fixed) are before this position
      let dashboardIndex = 0;
      for (let i = 0; i < placeholderIndex; i++) {
        const widget = localWidgets.value[i];
        if (widget !== 'currentTotal' && widget !== 'futureTotal' && widget && typeof widget === 'string' && !widget.startsWith('placeholder_')) {
          dashboardIndex++;
        }
      }
      
      mainStore.replaceWidget(dashboardIndex, newWidgetKey);
    }
    activeDropdown.value = null;
  }
};

const closeDropdown = () => {
  activeDropdown.value = null;
};

// Keep the widget order and CSS grid in sync when rotating a tablet.
const windowSize = ref({ width: window.innerWidth, height: window.innerHeight });
const updateSize = () => {
  windowSize.value = { width: window.innerWidth, height: window.innerHeight };
};
const widgetColumns = computed(() => getHeaderWidgetColumns(windowSize.value));
const isPortraitTablet = computed(() => widgetColumns.value === 4);
onMounted(() => window.addEventListener('resize', updateSize));
onUnmounted(() => window.removeEventListener('resize', updateSize));

const ruSuperShort = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
const todayStr = computed(() => { const d = new Date(); return ruSuperShort.format(d); });
const futureUntilStr = computed(() => {
  const d = mainStore.projection?.rangeEndDate ? new Date(mainStore.projection.rangeEndDate) : null;
  return (d && !isNaN(d.getTime())) ? ruSuperShort.format(d) : todayStr.value;
});

const localWidgets = computed({
  get: () => {
    const rowSize = widgetColumns.value;
    
    const layout = [...mainStore.dashboardLayout];
    
    // Insert fixed widgets at their positions in first row
    const result = [];
    
    // Position 0: currentTotal (fixed)
    result.push('currentTotal');
    
    // Positions 1 to (rowSize-2): from dashboardLayout
    const middleCount = rowSize - 2;
    
    for (let i = 0; i < middleCount; i++) {
      if (i < layout.length && layout[i]) {
        result.push(layout[i]);
      } else {
        result.push(`placeholder_${i + 1}`);
      }
    }
    
    // Last position of first row: futureTotal (fixed)
    result.push('futureTotal');
    
    // Add remaining widgets after first row (positions 6+)
    for (let i = middleCount; i < layout.length; i++) {
      if (layout[i]) {
        result.push(layout[i]);
      } else {
        result.push(`placeholder_${result.length}`);
      }
    }
    
    // Keep every saved widget available; expanded grids can scroll after three rows.
    const totalSlots = Math.ceil(Math.max(result.length, rowSize) / rowSize) * rowSize;

    while (result.length < totalSlots) {
      result.push(`placeholder_${result.length}`);
    }
    
    return result;
  },
  set: (newOrder) => {
    const rowSize = widgetColumns.value;
    
    // Remove positions 0 (currentTotal) and rowSize-1 from first row (futureTotal)
    const filtered = newOrder.filter((k, index) => {
      // Skip currentTotal (position 0)
      if (index === 0 && k === 'currentTotal') return false;
      // Skip futureTotal (position 5 in 6-col or position 4 in 5-col)
      if (index === rowSize - 1 && k === 'futureTotal') return false;
      // In first row, skip futureTotal if it somehow appears elsewhere
      if (index < rowSize && k === 'futureTotal') return false;
      if (k === 'currentTotal') return false;
      // Skip placeholders
      if (k && typeof k === 'string' && k.startsWith('placeholder_')) return false;
      
      return true;
    });
    
    mainStore.dashboardLayout = filtered;
  }
});

// Hidden widgets: widgets that exist but are NOT in dashboardLayout and NOT fixed widgets


// ===============================
// HTML5 DRAG-AND-DROP
// ===============================
const draggedIndex = ref(null);
const dropTargetIndex = ref(null);
const isDragging = ref(false);

const handleDragStart = (event, index) => {
  const widget = localWidgets.value[index];
  
  // Check if drag started from an interactive element (button, input, etc)
  const target = event.target;
  const isInteractive = target.closest('button, input, select, textarea, a, [role="button"]');
  
  if (isInteractive) {
    event.preventDefault();
    return;
  }
  
  // Prevent dragging fixed widgets
  if (widget === 'currentTotal' || widget === 'futureTotal') {
    event.preventDefault();
    return;
  }
  event.stopPropagation();
  isDragging.value = true;
  draggedIndex.value = index;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/html', event.target.innerHTML);
};

const handleDragOver = (event, index) => {
  event.preventDefault();
  event.stopPropagation();
  dropTargetIndex.value = index;
  event.dataTransfer.dropEffect = 'move';
};

const handleDrop = (event, index) => {
  event.preventDefault();
  event.stopPropagation();
  if (draggedIndex.value === null) return;
  
  const draggedWidget = localWidgets.value[draggedIndex.value];
  
  // Swap dragged with target index
  const newLocalWidgets = [...localWidgets.value];
  const targetWidget = newLocalWidgets[index];
  newLocalWidgets[index] = draggedWidget;
  newLocalWidgets[draggedIndex.value] = targetWidget;

  // Build layout without placeholders and fixed widgets
  const rowSize = widgetColumns.value;
  const filtered = newLocalWidgets.filter((widget, idx) => {
    if (!widget) return false;
    const isPlaceholder = typeof widget === 'string' && widget.startsWith('placeholder_');
    if (isPlaceholder) return false;
    if (idx === 0 && widget === 'currentTotal') return false;
    if (idx === rowSize - 1 && widget === 'futureTotal') return false;
    if (widget === 'currentTotal' || widget === 'futureTotal') return false;
    return true;
  });

  mainStore.dashboardLayout = filtered;
  
  draggedIndex.value = null;
  dropTargetIndex.value = null;
};

const handleDragEnd = () => {
  draggedIndex.value = null;
  dropTargetIndex.value = null;
  // Reset isDragging after a short delay to prevent click from firing
  setTimeout(() => {
    isDragging.value = false;
  }, 100);
};

const handleCardClick = (event, widgetKey) => {
  // Don't open fullscreen if:
  // 1. Currently dragging
  // 2. Clicked on a button or interactive element
  // 3. Widget is a placeholder
  if (isDragging.value) return;
  if (event.target.closest('button, input, select, textarea, a, [role="button"]')) return;
  if (widgetKey && typeof widgetKey === 'string' && widgetKey.startsWith('placeholder_')) return;
  
  openFullscreen(widgetKey);
};

// ===============================
// SWAP WITH NEIGHBOR
// ===============================
const canSwapLeft = (index) => {
  const rowSize = widgetColumns.value;
  const currentWidget = localWidgets.value[index];
  
  // Can't swap fixed widgets
  if (currentWidget === 'currentTotal' || currentWidget === 'futureTotal') return false;
  
  // Can't swap if at left edge of row
  if (index % rowSize === 0) return false;
  
  const leftIndex = index - 1;
  if (leftIndex < 0) return false;
  
  const leftWidget = localWidgets.value[leftIndex];
  
  // Can't swap with fixed widgets or placeholders
  if (leftWidget === 'currentTotal' || leftWidget === 'futureTotal') return false;
  if (leftWidget && typeof leftWidget === 'string' && leftWidget.startsWith('placeholder_')) return false;
  
  return true;
};

const canSwapRight = (index) => {
  const rowSize = widgetColumns.value;
  const currentWidget = localWidgets.value[index];
  
  // Can't swap fixed widgets
  if (currentWidget === 'currentTotal' || currentWidget === 'futureTotal') return false;
  
  // Can't swap if at right edge of row
  if ((index + 1) % rowSize === 0) return false;
  
  const rightIndex = index + 1;
  if (rightIndex >= localWidgets.value.length) return false;
  
  const rightWidget = localWidgets.value[rightIndex];
  
  // Can't swap with fixed widgets or placeholders
  if (rightWidget === 'currentTotal' || rightWidget === 'futureTotal') return false;
  if (rightWidget && typeof rightWidget === 'string' && rightWidget.startsWith('placeholder_')) return false;
  
  return true;
};

const swapWithNeighbor = (index, direction) => {
  const rowSize = widgetColumns.value;
  const targetIndex = direction === 'left' ? index - 1 : index + 1;
  
  // Safety checks
  if (targetIndex < 0 || targetIndex >= localWidgets.value.length) return;
  
  const currentWidget = localWidgets.value[index];
  const targetWidget = localWidgets.value[targetIndex];
  
  // Don't swap fixed widgets or placeholders
  if (currentWidget === 'currentTotal' || currentWidget === 'futureTotal') return;
  if (targetWidget === 'currentTotal' || targetWidget === 'futureTotal') return;
  if (targetWidget && typeof targetWidget === 'string' && targetWidget.startsWith('placeholder_')) return;
  
  // Convert localWidgets indices to dashboardLayout indices
  // We need to map from visual position to store position
  // Position 0 = currentTotal (not in dashboardLayout)
  // Positions 1-4 (desktop) or 1-3 (tablet) = dashboardLayout[0-3] or [0-2]
  // Position 5 (desktop) or 4 (tablet) = futureTotal (not in dashboardLayout)
  // Positions 6+ = dashboardLayout[4+] or [3+]
  
  const getDashboardIndex = (localIndex) => {
    if (localIndex === 0) return -1; // currentTotal
    if (localIndex === rowSize - 1) return -1; // futureTotal
    if (localIndex < rowSize - 1) {
      // First row (excluding currentTotal and futureTotal)
      return localIndex - 1;
    } else {
      // Second row and beyond
      return localIndex - 2; // -1 for currentTotal, -1 for futureTotal
    }
  };
  
  const currentDashboardIndex = getDashboardIndex(index);
  const targetDashboardIndex = getDashboardIndex(targetIndex);
  
  if (currentDashboardIndex === -1 || targetDashboardIndex === -1) return;
  
  // Create new dashboardLayout with swapped widgets
  const newLayout = [...mainStore.dashboardLayout];
  [newLayout[currentDashboardIndex], newLayout[targetDashboardIndex]] = 
    [newLayout[targetDashboardIndex], newLayout[currentDashboardIndex]];
  
  // Update store
  mainStore.dashboardLayout = newLayout;
};


// ===============================
// ===============================

// When header is not expanded, only the first row is visible (6 desktop, 5 tablet grid)

// ... states ...
const isTransferPopupVisible = ref(false);
const isTransferEditorVisible = ref(false);
const isOperationListEditorVisible = ref(false);
const operationListEditorType = ref('income'); 
const operationListEditorTitle = ref('');
const operationListEditorFilterMode = ref('default');

const isIncomePopupVisible = ref(false);
const isExpensePopupVisible = ref(false);

const isEntityPopupVisible = ref(false);

const popupTitle = ref('');
const popupInitialValue = ref(''); 
const popupEntityType = ref(''); 
const saveHandler = ref(null);
const deleteHandler = ref(null); 
const showDeleteInPopup = ref(false); 
const isListEditorVisible = ref(false);
const editorTitle = ref('');
const editorItems = ref([]);
const editorSavePath = ref(null);

// ... computed balances ...
const loggedCurrentTotal = computed(() => mainStore.currentTotalBalance);
const loggedFutureTotal = computed(() => mainStore.futureTotalBalance);

const mergeBalances = (currentBalances, futureData, isDelta = false) => {
  const safeCurrent = Array.isArray(currentBalances) ? currentBalances : [];
  let result = safeCurrent;

  if (futureData) {
      const futureMap = new Map((futureData || []).map(item => [item._id, item || {}]));
      result = safeCurrent.map(item => {
          const future = futureMap.get(item._id) || {};
          const fallback = isDelta ? 0 : item.balance;
          return {
              ...item,
              futureBalance: future.balance ?? fallback,
              // сохраняем раздельные суммы доход/расход, если есть
              incomeAbs: item.incomeAbs,
              expenseAbs: item.expenseAbs,
              futureIncomeAbs: future.futureIncomeAbs ?? item.futureIncomeAbs,
              futureExpenseAbs: future.futureExpenseAbs ?? item.futureExpenseAbs
          };
      });
  }

  return result.sort((a, b) => (a.order || 0) - (b.order || 0));
};


const mergedAccountBalances = computed(() => mergeBalances(mainStore.currentAccountBalances, mainStore.futureAccountBalances, false));
const mergedCompanyBalances = computed(() => mergeBalances(mainStore.currentCompanyBalances, mainStore.futureCompanyBalances, false));

const mergedContractorBalances = computed(() => {
    const allMerged = mergeBalances(mainStore.currentContractorBalances, mainStore.futureContractorChanges, true);
    const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
    return allMerged.filter(contr => !myCompanyNames.has(contr.name.trim().toLowerCase()));
});

const mergedProjectBalances = computed(() => {
    const list = Array.isArray(mainStore.projectPnlBalances) ? mainStore.projectPnlBalances : [];
    return [...list].sort((a, b) => (a.order || 0) - (b.order || 0));
});

const mergedIndividualBalances = computed(() => {
    const allMerged = mergeBalances(mainStore.currentIndividualBalances, mainStore.futureIndividualChanges, true);
    const accountMap = new Map();
    mainStore.accounts.forEach(acc => {
        if (acc.individualId) {
            const iId = (typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
            if (iId) accountMap.set(iId, acc.name);
        }
    });
    return allMerged.map(ind => ({
        ...ind,
        linkedAccountName: accountMap.get(ind._id) || null
    }));
});

const mergedCategoryBalances = computed(() => {
    const allMerged = mergeBalances(mainStore.currentCategoryBalances, mainStore.futureCategoryChanges, true);
    const visibleIds = new Set(mainStore.visibleCategories.map(c => c._id));
    return allMerged.filter(c => visibleIds.has(c._id));
});

// ... popup handlers ...
const openAddPopup = (title, storeAction, entityType = '') => { 
    popupTitle.value = title; 
    popupInitialValue.value = ''; 
    showDeleteInPopup.value = false; 
    saveHandler.value = storeAction; 
    deleteHandler.value = null; 
    popupEntityType.value = entityType; 
    isEntityPopupVisible.value = true; 
};

const openEditPopup = (title, items, path) => { editorTitle.value = title; editorItems.value = JSON.parse(JSON.stringify(items)); editorSavePath.value = path; isListEditorVisible.value = true; };
const openRenamePopup = (title, entity, storeUpdateAction, canDelete = false, entityType = '') => {
  popupTitle.value = title; popupInitialValue.value = entity.name; showDeleteInPopup.value = canDelete; 
  popupEntityType.value = ''; 
  saveHandler.value = async (newName) => { if (entityType) { const updatedItem = { ...entity, name: newName }; await mainStore.batchUpdateEntities(entityType, [updatedItem]); } };
  if (canDelete && entityType) { deleteHandler.value = async ({ deleteOperations, done }) => { try { await mainStore.deleteEntity(entityType, entity._id, deleteOperations); isEntityPopupVisible.value = false; } catch (e) { alert('Ошибка удаления: ' + e.message); if(done) done(); } }; } else { deleteHandler.value = null; }
  isEntityPopupVisible.value = true;
};
const onEntitySave = async (name) => { if (saveHandler.value) { try { await saveHandler.value(name); } catch (e) { console.error(e); } } isEntityPopupVisible.value = false; };
const onEntityDelete = (payload) => { if (deleteHandler.value) deleteHandler.value(payload); };
const onEntityListSave = async (updatedItems) => { if (editorSavePath.value) { try { await mainStore.batchUpdateEntities(editorSavePath.value, updatedItems); } catch (e) { console.error(e); } } isListEditorVisible.value = false; };
const getWidgetByKey = (key) => mainStore.allWidgets.find(w => w.key === key);

const onCategoryAdd = (widgetKey, index) => {
    if (widgetKey === 'transfers') { isTransferPopupVisible.value = true; return; }
    if (widgetKey === 'incomeList') { isIncomePopupVisible.value = true; return; }
    if (widgetKey === 'expenseList') { isExpensePopupVisible.value = true; return; }

    
    if (widgetKey.startsWith('cat_')) {
        const catId = widgetKey.replace('cat_', '');
        const category = mainStore.getCategoryById(catId);
        if (category) {
            const catName = category.name.toLowerCase().trim();
            if (catName === 'перевод' || catName === 'transfer') {
                isTransferPopupVisible.value = true;
                return;
            }
        }
    }
    const widget = getWidgetByKey(widgetKey);
    if (widget?.name.toLowerCase().includes('перевод') || widget?.name.toLowerCase().includes('transfer')) { 
        isTransferPopupVisible.value = true; 
        return;
    }
    isExpensePopupVisible.value = true;
};

const onCategoryEdit = (widgetKey) => {
    operationListEditorFilterMode.value = 'default';
    if (widgetKey === 'transfers') { isTransferEditorVisible.value = true; return; }
    if (widgetKey === 'incomeList') { operationListEditorTitle.value = 'Редактировать доходы'; operationListEditorType.value = 'income'; isOperationListEditorVisible.value = true; return; }
    if (widgetKey === 'expenseList') { operationListEditorTitle.value = 'Редактировать расходы'; operationListEditorType.value = 'expense'; isOperationListEditorVisible.value = true; return; }

    
    const catId = widgetKey.replace('cat_', '');
    const category = mainStore.getCategoryById(catId);
    if (category) {
        const lowerName = category.name.toLowerCase();
        if (lowerName === 'перевод' || lowerName === 'transfer') isTransferEditorVisible.value = true;
        else openRenamePopup(`Категория: ${category.name}`, category, null, true, 'categories');
    }
};

const handleTransferSave = async ({ mode, id, data }) => {
    try {
        if (mode === 'create') {
            if (data.cellIndex === undefined) {
                const dateKey = data.dateKey || mainStore._getDateKey(new Date(data.date));
                data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey);
            }
            await mainStore.createTransfer(data);
        } else {
            await mainStore.updateTransfer(id, data);
        }
        isTransferPopupVisible.value = false;
    } catch (e) {
        console.error(e);
        alert('Ошибка сохранения перевода');
    }
};
const handleOperationAdded = async ({ mode, id, data }) => {
    if (mode === 'create') {
        if (data.cellIndex === undefined) {
             const dateKey = data.dateKey || mainStore._getDateKey(new Date(data.date));
             data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey);
        }
        await mainStore.createEvent(data);
    }
    isIncomePopupVisible.value = false;
    isExpensePopupVisible.value = false;
};

const handleWithdrawalSaved = async ({ mode, id, data }) => { isWithdrawalPopupVisible.value = false; try { if (mode === 'create') await mainStore.createEvent(data); } catch (e) { console.error(e); alert('Ошибка сохранения вывода'); } };
</script>

<template>
  <!-- ГЛОБАЛЬНОЕ МЕНЮ -->
  <div v-if="activeDropdown" class="global-menu-overlay" @click="closeDropdown">
    <div class="global-widget-dropdown" :style="{ top: activeDropdown.top + 'px', left: activeDropdown.left + 'px', width: activeDropdown.width + 'px' }" @click.stop>
      <input type="text" class="widget-search-input" v-model="searchQuery" placeholder="Поиск..." />
      <ul>
        <li v-for="widget in filteredWidgets" :key="widget.key" :class="{ 'active': widget.key === activeDropdown.key, 'disabled': mainStore.dashboardLayout.includes(widget.key) && widget.key !== activeDropdown.key }" @click="handleMenuSelect(widget.key)">
          {{ widget.name }}
        </li>
      </ul>
    </div>
  </div>

  <!-- 🟢 FULLSCREEN OVERLAY -->
  <Teleport to="body">
    <div v-if="fullscreenWidgetKey" class="fullscreen-overlay" @click.self="closeFullscreen">
       <div class="fullscreen-content">
          <div class="fullscreen-card-container">
             <!-- Рендерим нужный виджет на основе fullscreenWidgetKey -->
             
             <HeaderTotalCard
                v-if="fullscreenWidgetKey === 'currentTotal'"
                :title="'Всего на счетах\nна текущий момент'"
                :totalBalance="loggedCurrentTotal" 
                :subtitlePrefix="`Сейчас на ${mainStore.currentAccountBalances.length} счетах`"
                :subtitleDate="`до ${todayStr}`"
                :widgetKey="fullscreenWidgetKey"
                :widgetIndex="-1"
             />

             <HeaderBalanceCard
                v-else-if="fullscreenWidgetKey === 'accounts'"
                title="Счета/Кассы"
                :items="mergedAccountBalances" emptyText="...счетов нет..."
                :widgetKey="fullscreenWidgetKey" :widgetIndex="-1"
                :isDeltaMode="false"
                @add="openAddPopup('Новый счет', mainStore.addAccount, 'account')"
                @edit="openEditPopup('Редактировать счета', mainStore.accounts, 'accounts')"
             />

             <HeaderBalanceCard
                v-else-if="fullscreenWidgetKey === 'companies'"
                title="Владельцы счетов"
                :items="mergedCompanyBalances" emptyText="...владельцев нет..."
                :widgetKey="fullscreenWidgetKey" :widgetIndex="-1"
                :isDeltaMode="false"
                @add="openAddPopup('Новая компания', mainStore.addCompany, 'company')"
                @edit="openEditPopup('Редактировать компании', mainStore.companies, 'companies')"
             />

             <HeaderBalanceCard
                v-else-if="fullscreenWidgetKey === 'contractors'"
                title="Мои контрагенты"
                :items="mergedContractorBalances" emptyText="...контрагентов нет..."
                :widgetKey="fullscreenWidgetKey" :widgetIndex="-1"
                :isDeltaMode="true"
                @add="openAddPopup('Новый контрагент', mainStore.addContractor, 'contractor')"
                @edit="openEditPopup('Редактировать контрагентов', mainStore.visibleContractors, 'contractors')"
             />

             <HeaderBalanceCard
                v-else-if="fullscreenWidgetKey === 'projects'"
                title="Мои проекты"
                :items="mergedProjectBalances" emptyText="...проектов нет..."
                :widgetKey="fullscreenWidgetKey" :widgetIndex="-1"
                :isDeltaMode="true"
                @add="openAddPopup('Новый проект', mainStore.addProject, 'project')"
                @edit="openEditPopup('Редактировать проекты', mainStore.projects, 'projects')"
             />

             <HeaderBalanceCard
                v-else-if="fullscreenWidgetKey === 'individuals'"
                title="Физлица"
                :items="mergedIndividualBalances" emptyText="...физлиц нет..."
                :widgetKey="fullscreenWidgetKey" :widgetIndex="-1"
                :isDeltaMode="true"
                @add="openAddPopup('Новое Физлицо', mainStore.addIndividual, 'individual')"
                @edit="openEditPopup('Редактировать Физлиц', mainStore.individuals, 'individuals')"
             />

             <HeaderBalanceCard
                v-else-if="fullscreenWidgetKey === 'categories'"
                title="Категории"
                :items="mergedCategoryBalances" emptyText="...категорий нет..."
                :widgetKey="fullscreenWidgetKey" :widgetIndex="-1"
                :isDeltaMode="true"
                @add="openAddPopup('Новая категория', mainStore.addCategory, 'category')"
                @edit="openEditPopup('Редактировать категории', mainStore.visibleCategories, 'categories')"
             />

             <HeaderTotalCard
                v-else-if="fullscreenWidgetKey === 'futureTotal'"
                :title="'Всего на счетах\nс учетом будущих'"
                :totalBalance="loggedFutureTotal" 
                :subtitlePrefix="`Будет на ${mainStore.futureAccountBalances.length} счетах`"
                :subtitleDate="`до ${futureUntilStr}`"
                :widgetKey="fullscreenWidgetKey"
                :widgetIndex="-1"
             />

             <HeaderCategoryCard
                v-else-if="fullscreenWidgetKey === 'transfers' || (fullscreenWidgetKey && typeof fullscreenWidgetKey === 'string' && fullscreenWidgetKey.startsWith('cat_')) || fullscreenWidgetKey === 'incomeList' || fullscreenWidgetKey === 'expenseList' || fullscreenWidgetKey === 'withdrawalList'"
                :title="getWidgetByKey(fullscreenWidgetKey)?.name || '...'"
                :widgetKey="fullscreenWidgetKey"
                :widgetIndex="-1"
                @add="onCategoryAdd(fullscreenWidgetKey, -1)"
                @edit="onCategoryEdit(fullscreenWidgetKey)"
             />
          </div>
       </div>
    </div>
  </Teleport>

  <!-- NATIVE HTML5 DRAG-AND-DROP GRID -->
  <div 
    class="header-dashboard"
    :class="{ 'expanded': mainStore.isHeaderExpanded, 'portrait-tablet': isPortraitTablet }"
    :style="{ '--widget-columns': widgetColumns }"
  >
    <div
      v-for="(widgetKey, index) in localWidgets"
      :key="widgetKey"
      class="dashboard-card-wrapper"
      :class="{
        'dragging': draggedIndex === index,
        'drop-target': dropTargetIndex === index && widgetKey && typeof widgetKey === 'string' && widgetKey.startsWith('placeholder_')
      }"
      :draggable="widgetKey !== 'currentTotal' && widgetKey !== 'futureTotal' && widgetKey && typeof widgetKey === 'string' && !widgetKey.startsWith('placeholder_')"
      @dragstart="handleDragStart($event, index)"
      @dragover="handleDragOver($event, index)"
      @drop="handleDrop($event, index)"
      @dragend="handleDragEnd"
      @click="handleCardClick($event, widgetKey)"
    >
        <div v-if="widgetKey && typeof widgetKey === 'string' && widgetKey.startsWith('placeholder_')" class="dashboard-card placeholder-card"></div>

        <HeaderTotalCard
          v-else-if="widgetKey === 'currentTotal'"
          :title="'Всего на счетах\nна текущий момент'"
          :totalBalance="loggedCurrentTotal" 
          :subtitlePrefix="`Сейчас на ${mainStore.currentAccountBalances.length} счетах`"
          :subtitleDate="`до ${todayStr}`"
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @open-menu="handleOpenMenu"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'accounts'"
          title="Счета/Кассы"
          :items="mergedAccountBalances" emptyText="...счетов нет..."
          :widgetKey="widgetKey" :widgetIndex="index"
          :isDeltaMode="false"
          @add="openAddPopup('Новый счет', mainStore.addAccount, 'account')"
          @edit="openEditPopup('Редактировать счета', mainStore.accounts, 'accounts')"
          @open-menu="handleOpenMenu"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'companies'"
          title="Владельцы счетов"
          :items="mergedCompanyBalances" emptyText="...владельцев нет..."
          :widgetKey="widgetKey" :widgetIndex="index"
          :isDeltaMode="false"
          @add="openAddPopup('Новая компания', mainStore.addCompany, 'company')"
          @edit="openEditPopup('Редактировать компании', mainStore.companies, 'companies')"
          @open-menu="handleOpenMenu"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'contractors'"
          title="Мои контрагенты"
          :items="mergedContractorBalances" emptyText="...контрагентов нет..."
          :widgetKey="widgetKey" :widgetIndex="index"
          :isDeltaMode="true"
          @add="openAddPopup('Новый контрагент', mainStore.addContractor, 'contractor')"
          @edit="openEditPopup('Редактировать контрагентов', mainStore.visibleContractors, 'contractors')"
          @open-menu="handleOpenMenu"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'projects'"
          title="Мои проекты"
          :items="mergedProjectBalances" emptyText="...проектов нет..."
          :widgetKey="widgetKey" :widgetIndex="index"
          :isDeltaMode="true"
          @add="openAddPopup('Новый проект', mainStore.addProject, 'project')"
          @edit="openEditPopup('Редактировать проекты', mainStore.projects, 'projects')"
          @open-menu="handleOpenMenu"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'individuals'"
          title="Физлица"
          :items="mergedIndividualBalances" emptyText="...физлиц нет..."
          :widgetKey="widgetKey" :widgetIndex="index"
          :isDeltaMode="true"
          @add="openAddPopup('Новое Физлицо', mainStore.addIndividual, 'individual')"
          @edit="openEditPopup('Редактировать Физлиц', mainStore.individuals, 'individuals')"
          @open-menu="handleOpenMenu"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'categories'"
          title="Категории"
          :items="mergedCategoryBalances" emptyText="...категорий нет..."
          :widgetKey="widgetKey" :widgetIndex="index"
          :isDeltaMode="true"
          @add="openAddPopup('Новая категория', mainStore.addCategory, 'category')"
          @edit="openEditPopup('Редактировать категории', mainStore.visibleCategories, 'categories')"
          @open-menu="handleOpenMenu"
        />

        <HeaderTotalCard
          v-else-if="widgetKey === 'futureTotal'"
          :title="'Всего на счетах\nс учетом будущих'"
          :totalBalance="loggedFutureTotal" 
          :subtitlePrefix="`Будет на ${mainStore.futureAccountBalances.length} счетах`"
          :subtitleDate="`до ${futureUntilStr}`"
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @open-menu="handleOpenMenu"
        />

        <HeaderCategoryCard
          v-else-if="widgetKey === 'transfers' || (widgetKey && typeof widgetKey === 'string' && widgetKey.startsWith('cat_')) || widgetKey === 'incomeList' || widgetKey === 'expenseList' || widgetKey === 'withdrawalList'"
          :title="getWidgetByKey(widgetKey)?.name || '...'"
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @add="onCategoryAdd(widgetKey, index)"
          @edit="onCategoryEdit(widgetKey)"
          @open-menu="handleOpenMenu"
        />
      </div>
  </div>


  <!-- Popups -->
  <EntityPopup 
      v-if="isEntityPopupVisible" 
      :title="popupTitle" 
      :initial-value="popupInitialValue" 
      :show-delete="showDeleteInPopup" 
      :entity-type="popupEntityType"
      @close="isEntityPopupVisible = false" 
      @save="onEntitySave" 
      @delete="onEntityDelete" 
  />
  
  <EntityListEditor v-if="isListEditorVisible" :title="editorTitle" :items="editorItems" @close="isListEditorVisible = false" @save="onEntityListSave" />
  <TransferPopup v-if="isTransferPopupVisible" :date="new Date()" :cellIndex="0" @close="isTransferPopupVisible = false" @save="handleTransferSave" />
  <TransferListEditor v-if="isTransferEditorVisible" @close="isTransferEditorVisible = false" />
  <OperationListEditor v-if="isOperationListEditorVisible" :title="operationListEditorTitle" :type="operationListEditorType" :filter-mode="operationListEditorFilterMode" @close="isOperationListEditorVisible = false" />
  
  <IncomePopup v-if="isIncomePopupVisible" :date="new Date()" :cellIndex="0" @close="isIncomePopupVisible = false" @save="handleOperationAdded" />
  <ExpensePopup v-if="isExpensePopupVisible" :date="new Date()" :cellIndex="0" @close="isExpensePopupVisible = false" @save="handleOperationAdded" />


</template>

<style scoped>
.header-dashboard { display: grid; grid-template-columns: repeat(var(--widget-columns), minmax(0, 1fr)); gap: var(--widget-grid-gap); padding: var(--widget-grid-padding); background-color: var(--widget-grid-color); border-radius: var(--widget-grid-border-radius); border: var(--widget-grid-border-width) solid var(--widget-grid-color); margin-bottom: 0.4rem; height: 100%; box-sizing: border-box; min-height: 0; width: 100%; overflow: hidden; grid-template-rows: 1fr; }
.dashboard-card-wrapper { position: relative; display: flex; flex-direction: column; background-color: var(--widget-background); min-width: 0; min-height: 0; cursor: default; transition: background-color 0.2s; }
.dashboard-card-wrapper[draggable="true"] { cursor: grab; }
.dashboard-card-wrapper[draggable="true"]:active { cursor: grabbing; }


.dashboard-card-wrapper.drop-target {
  outline: 2px solid var(--color-success, #4CAF50);
  outline-offset: -2px;
}

/* 🟢 HOVER EFFECT - используем переменные из theme.css */
.dashboard-card-wrapper:hover {
  background-color: var(--widget-bg-hover);
  border-color: var(--widget-border-hover);
}

:deep(.dashboard-card) { 
  flex: 1; 
  display: flex; 
  flex-direction: column; 
  background-color: transparent; 
  padding: 8px 12px !important; 
  border: none !important; 
  min-width: 0; 
  box-sizing: border-box; 
  margin: 0 !important; 
  min-height: 0;
}


/* Disable pointer events when dragging to prevent interference */
.dashboard-card-wrapper.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

/* 🟢 FULLSCREEN STYLES */
.fullscreen-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.7); /* Затемнение */
  backdrop-filter: blur(5px);      /* Размытие */
  z-index: 5000;
  display: flex; justify-content: center; align-items: center;
  padding: 40px;
  box-sizing: border-box;
}

.fullscreen-content {
  width: 100%; max-width: 800px; height: 80vh;
  display: flex; flex-direction: column;
}

.fullscreen-card-container {
  width: 100%; height: 100%;
  background: var(--widget-background);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  border: 1px solid var(--color-border);
  overflow: hidden;
  /* 🟢 Внутри карточки все шрифты будут крупнее/стандартными */
}

/* Принудительно растягиваем карточку внутри модалки */
.fullscreen-card-container :deep(.dashboard-card) {
    padding: 24px !important;
    height: 100% !important;
}

/* Увеличиваем шрифт в полноэкранном режиме */
.fullscreen-card-container :deep(.card-title) { font-size: 18px !important; }
.fullscreen-card-container :deep(.card-items-list),
.fullscreen-card-container :deep(.card-item) { font-size: 16px !important; line-height: 1.6 !important; }
.fullscreen-card-container :deep(.card-total-balance) { font-size: 48px !important; }


/* 🟢 DEFAULT 6x1 LOGIC (Desktop > 1400px) */
.dashboard-card-wrapper:nth-child(6n) { border-right: none !important; }
.header-dashboard:not(.expanded) .dashboard-card-wrapper:nth-child(n+7) { display: none; }
.header-dashboard:not(.expanded) .dashboard-card-wrapper { border-bottom: none !important; }

/* Tablet typography; column count is shared with the widget ordering. */
@media (min-width: 768px) and (max-width: 1400px) {
  :deep(.dashboard-card),
  :deep(.card-items-list),
  :deep(.card-item),
  :deep(.category-items-list-scroll),
  :deep(.category-item),
  :deep(.summary-value-block),
  :deep(.card-items-list.forecast-mode) {
      font-size: var(--font-sm, 13px) !important;
  }
  
  :deep(.current-cell), :deep(.future-cell), :deep(.forecast-display) { font-size: inherit !important; }
  
  .dashboard-card-wrapper:nth-child(6n) { border-right: 1px solid var(--color-border) !important; }
  .dashboard-card-wrapper:nth-child(5n) { border-right: none !important; }
  .header-dashboard:not(.expanded) .dashboard-card-wrapper:nth-child(n+6) { display: none; }
  .header-dashboard.expanded .dashboard-card-wrapper:nth-last-child(-n+5) { border-bottom: none !important; }
}

/* Portrait tablets need room for complete totals and usable widget controls. */
.header-dashboard.portrait-tablet:not(.expanded) .dashboard-card-wrapper:nth-child(n+5) { display: none; }
.header-dashboard.portrait-tablet.expanded .dashboard-card-wrapper { display: flex; }
.header-dashboard.portrait-tablet :deep(.dashboard-card) { padding: 8px 10px !important; overflow: hidden; }
.header-dashboard.portrait-tablet :deep(.card-title-container) {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  height: 48px;
  min-height: 48px;
  margin-bottom: 6px;
}
.header-dashboard.portrait-tablet :deep(.is-mirrored .card-title-container) { align-items: flex-end; }
.header-dashboard.portrait-tablet :deep(.card-title) { font-size: 12px; line-height: 1.25; }
.header-dashboard.portrait-tablet :deep(.card-actions) { gap: 4px; flex-shrink: 0; }
.header-dashboard.portrait-tablet :deep(.action-square-btn) { width: 22px; height: 22px; flex-shrink: 0; }
.header-dashboard.portrait-tablet :deep(.card-item) { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
.header-dashboard.portrait-tablet :deep(.card-items-list) { padding-right: 0; }
.header-dashboard.portrait-tablet :deep(.card-items-list.forecast-mode) { display: flex; }
.header-dashboard.portrait-tablet :deep(.forecast-mode .card-item) { grid-template-columns: minmax(0, 1fr); gap: 0; }
.header-dashboard.portrait-tablet :deep(.forecast-display) { display: flex; justify-content: flex-end; gap: 4px; }
.header-dashboard.portrait-tablet :deep(.card-item),
.header-dashboard.portrait-tablet :deep(.card-items-list.forecast-mode) { font-size: 12px !important; }
.header-dashboard.portrait-tablet :deep(.summary-row) { flex-direction: column; align-items: stretch; gap: 4px; }
.header-dashboard.portrait-tablet :deep(.summary-value-block) { display: flex; justify-content: flex-end; flex-wrap: wrap; }
.header-dashboard.portrait-tablet :deep(.category-item span:first-child) { min-width: 0; }
.header-dashboard.portrait-tablet :deep(.card-sub-balance) { font-size: 12px; line-height: 1.4; }

/* 🟢 EXPANDED LOGIC */
.header-dashboard.expanded { grid-template-rows: none; grid-auto-rows: minmax(130px, 1fr); overflow-x: hidden; overflow-y: auto; }

@media (min-width: 1401px) {
  .header-dashboard.expanded .dashboard-card-wrapper:nth-last-child(-n+6) { border-bottom: none !important; }
}

.sortable-ghost { opacity: 0.4; background-color: #333; }
.sortable-drag { background-color: var(--color-background-soft); box-shadow: 0 5px 15px rgba(0,0,0,0.3); opacity: 1; z-index: 2000; }
.header-dashboard.expanded :deep(.card-title span) { display: none !important; }
.header-dashboard.expanded :deep(.card-title) { cursor: default; pointer-events: none; }

/* Mobile fallback */
@media (max-height: 900px) { :deep(.dashboard-card) { padding: 8px 10px !important; } }

.global-menu-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 5000; background: transparent; }
.global-widget-dropdown { position: fixed; background-color: #f4f4f4; border-radius: 8px; box-shadow: 0 5px 25px rgba(0,0,0,0.3); padding: 8px; box-sizing: border-box; max-height: 400px; display: flex; flex-direction: column; color: #333; }
.widget-search-input { flex-shrink: 0; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px; font-size: 0.85em; box-sizing: border-box; width: 100%; background-color: #FFFFFF; color: #333; }
.widget-search-input:focus { outline: none; border-color: #007AFF; }
.global-widget-dropdown ul { list-style: none; margin: 0; padding: 0; flex-grow: 1; overflow-y: auto; }
.global-widget-dropdown li { padding: 10px 12px; border-radius: 6px; font-size: 0.85em; color: #333; cursor: pointer; font-weight: 500; }
.global-widget-dropdown li:hover { background-color: #e9e9e9; }
.global-widget-dropdown li.active { color: #333; background-color: #e0e0e0; }
.global-widget-dropdown li.disabled { color: #aaa; background-color: transparent; cursor: not-allowed; }
</style>
