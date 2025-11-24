<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';
import draggable from 'vuedraggable';

/**
 * * --- МЕТКА ВЕРСИИ: v37.0 - EQUAL ROW HEIGHT ---
 * * ВЕРСИЯ: 37.0 - Равная высота рядов в Grid
 * * ДАТА: 2025-11-24
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (CSS) .header-dashboard.expanded: grid-auto-rows: minmax(130px, 1fr).
 * Это гарантирует, что ни один ряд не будет уже 130px, даже если контента мало.
 * Если контейнер выше, ряды растянутся равномерно (1fr).
 */

console.log('--- TheHeader.vue v37.0 (Equal Row Height) ЗАГРУЖЕН ---');

// Карточки
import HeaderTotalCard from './HeaderTotalCard.vue';
import HeaderBalanceCard from './HeaderBalanceCard.vue';
import HeaderCategoryCard from './HeaderCategoryCard.vue';
import HeaderLiabilitiesCard from './HeaderLiabilitiesCard.vue'; 
import TransferPopup from './TransferPopup.vue';
import EntityPopup from './EntityPopup.vue';
import EntityListEditor from './EntityListEditor.vue';
import TransferListEditor from './TransferListEditor.vue';
import OperationListEditor from './OperationListEditor.vue';
import OperationPopup from './OperationPopup.vue';
import WithdrawalPopup from './WithdrawalPopup.vue';

const mainStore = useMainStore();

// Управление списком виджетов для драг-н-дропа
const localWidgets = computed({
  get: () => {
    if (mainStore.isHeaderExpanded) {
      const layoutSet = new Set(mainStore.dashboardLayout);
      const allKeys = mainStore.allWidgets.map(w => w.key);
      
      const ordered = [...mainStore.dashboardLayout];
      
      allKeys.forEach(k => {
          if (!layoutSet.has(k)) ordered.push(k);
      });

      const rowSize = 6;
      const rows = Math.ceil(Math.max(ordered.length, 1) / rowSize); 
      const totalSlots = rows * rowSize;
      while (ordered.length < totalSlots) {
        ordered.push(`placeholder_${ordered.length}`);
      }
      return ordered;
    }
    return mainStore.dashboardLayout;
  },
  set: (newOrder) => {
    const realWidgets = newOrder.filter(k => !k.startsWith('placeholder_'));
    mainStore.dashboardLayout = realWidgets;
  }
});

// Состояния попапов
const isTransferPopupVisible = ref(false);
const isTransferEditorVisible = ref(false);
const isOperationListEditorVisible = ref(false);
const operationListEditorType = ref('income'); 
const operationListEditorTitle = ref('');
const operationListEditorFilterMode = ref('default');
const isOperationPopupVisible = ref(false);
const operationPopupType = ref('income');
const isWithdrawalPopupVisible = ref(false);

const isEntityPopupVisible = ref(false);
const popupTitle = ref('');
const popupInitialValue = ref(''); 
const saveHandler = ref(null);
const deleteHandler = ref(null); 
const showDeleteInPopup = ref(false); 
const isListEditorVisible = ref(false);
const editorTitle = ref('');
const editorItems = ref([]);
const editorSavePath = ref(null);

/* ======================= Адаптивность Дат ======================= */
const windowWidth = ref(window.innerWidth);
const updateWidth = () => { windowWidth.value = window.innerWidth; };
onMounted(() => window.addEventListener('resize', updateWidth));
onUnmounted(() => window.removeEventListener('resize', updateWidth));
const isTablet = computed(() => windowWidth.value < 1400);
const ruShort = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
const ruSuperShort = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
const todayStr = computed(() => {
  const d = new Date();
  return isTablet.value ? ruSuperShort.format(d) : ruShort.format(d);
});
const futureUntilStr = computed(() => {
  const d = mainStore.projection?.rangeEndDate ? new Date(mainStore.projection.rangeEndDate) : null;
  if (d && !isNaN(d.getTime())) {
    return isTablet.value ? ruSuperShort.format(d) : ruShort.format(d);
  }
  return todayStr.value;
});

/* ======================= Данные ======================= */
const loggedCurrentTotal = computed(() => mainStore.currentTotalBalance);
const loggedFutureTotal = computed(() => mainStore.futureTotalBalance);

const mergeBalances = (currentBalances, futureBalances) => {
  let result = currentBalances || [];
  if (futureBalances) {
      const futureMap = new Map(futureBalances.map(item => [item._id, item.balance]));
      result = currentBalances.map(item => ({
        ...item,
        futureBalance: futureMap.get(item._id) ?? item.balance
      }));
  }
  return result.sort((a, b) => (a.order || 0) - (b.order || 0));
};

const loggedAccountBalances = computed(() => mergeBalances(mainStore.currentAccountBalances, mainStore.futureAccountBalances));
const mergedCompanyBalances = computed(() => mergeBalances(mainStore.currentCompanyBalances, mainStore.futureCompanyBalances));
const mergedContractorBalances = computed(() => mergeBalances(mainStore.currentContractorBalances, mainStore.futureContractorBalances));
const mergedProjectBalances = computed(() => mergeBalances(mainStore.currentProjectBalances, mainStore.futureProjectBalances));
const mergedIndividualBalances = computed(() => mergeBalances(mainStore.currentIndividualBalances, mainStore.futureIndividualBalances));

const mergedCategoryBalances = computed(() => {
    const allMerged = mergeBalances(mainStore.currentCategoryBalances, mainStore.futureCategoryBalances);
    const visibleIds = new Set(mainStore.visibleCategories.map(c => c._id));
    return allMerged.filter(c => visibleIds.has(c._id));
});

const openAddPopup = (title, storeAction) => {
  popupTitle.value = title;
  popupInitialValue.value = '';
  showDeleteInPopup.value = false;
  saveHandler.value = storeAction;
  deleteHandler.value = null;
  isEntityPopupVisible.value = true;
};

const openEditPopup = (title, items, path) => {
  editorTitle.value = title;
  editorItems.value = JSON.parse(JSON.stringify(items));
  editorSavePath.value = path;
  isListEditorVisible.value = true;
};

const openRenamePopup = (title, entity, storeUpdateAction, canDelete = false, entityType = '') => {
  popupTitle.value = title;
  popupInitialValue.value = entity.name;
  showDeleteInPopup.value = canDelete; 
  saveHandler.value = async (newName) => {
      if (entityType) {
          const updatedItem = { ...entity, name: newName };
          await mainStore.batchUpdateEntities(entityType, [updatedItem]);
      }
  };
  if (canDelete && entityType) {
      deleteHandler.value = async ({ deleteOperations, done }) => {
          try {
             await mainStore.deleteEntity(entityType, entity._id, deleteOperations);
             isEntityPopupVisible.value = false;
          } catch (e) {
             alert('Ошибка удаления: ' + e.message);
             if(done) done();
          }
      };
  } else {
      deleteHandler.value = null;
  }
  isEntityPopupVisible.value = true;
};

const onEntitySave = async (name) => {
  if (saveHandler.value) {
    try { await saveHandler.value(name); } catch (e) { console.error(e); }
  }
  isEntityPopupVisible.value = false;
};

const onEntityDelete = (payload) => {
    if (deleteHandler.value) {
        deleteHandler.value(payload);
    }
};

const onEntityListSave = async (updatedItems) => {
  if (editorSavePath.value) {
    try { await mainStore.batchUpdateEntities(editorSavePath.value, updatedItems); } catch (e) { console.error(e); }
  }
  isListEditorVisible.value = false;
};

const getWidgetByKey = (key) => mainStore.allWidgets.find(w => w.key === key);

const onCategoryAdd = (widgetKey, index) => {
    if (widgetKey === 'incomeList') { operationPopupType.value = 'income'; isOperationPopupVisible.value = true; return; }
    if (widgetKey === 'expenseList') { operationPopupType.value = 'expense'; isOperationPopupVisible.value = true; return; }
    if (widgetKey === 'withdrawalList') { isWithdrawalPopupVisible.value = true; return; }
    const widget = getWidgetByKey(widgetKey);
    if (widget?.name.toLowerCase() === 'перевод' || widget?.name.toLowerCase() === 'transfer') { isTransferPopupVisible.value = true; }
};

const onCategoryEdit = (widgetKey) => {
    operationListEditorFilterMode.value = 'default';
    if (widgetKey === 'incomeList') { operationListEditorTitle.value = 'Редактировать доходы'; operationListEditorType.value = 'income'; isOperationListEditorVisible.value = true; return; }
    if (widgetKey === 'expenseList') { operationListEditorTitle.value = 'Редактировать расходы'; operationListEditorType.value = 'expense'; isOperationListEditorVisible.value = true; return; }
    if (widgetKey === 'withdrawalList') { operationListEditorTitle.value = 'Редактировать выводы'; operationListEditorType.value = 'withdrawal'; isOperationListEditorVisible.value = true; return; }
    const catId = widgetKey.replace('cat_', '');
    const category = mainStore.getCategoryById(catId);
    if (category) {
        const lowerName = category.name.toLowerCase();
        const isTransfer = (lowerName === 'перевод' || lowerName === 'transfer');
        if (isTransfer) isTransferEditorVisible.value = true;
        else openRenamePopup(`Категория: ${category.name}`, category, null, true, 'categories');
    }
};

const onLiabilitiesEdit = () => {
    operationListEditorTitle.value = 'Редактировать операции (Предоплаты)';
    operationListEditorType.value = 'income';
    operationListEditorFilterMode.value = 'prepayment_only'; 
    isOperationListEditorVisible.value = true;
};

const handleTransferComplete = async (eventData) => {
    if (eventData?.dateKey) await mainStore.refreshDay(eventData.dateKey);
    isTransferPopupVisible.value = false;
};

const handleOperationAdded = async (newOp) => {
    if (newOp?.dateKey) await mainStore.addOperation(newOp);
    isOperationPopupVisible.value = false;
};

const handleWithdrawalSaved = async ({ mode, id, data }) => {
    isWithdrawalPopupVisible.value = false;
    try { if (mode === 'create') await mainStore.createEvent(data); } catch (e) { console.error(e); alert('Ошибка сохранения вывода'); }
};
</script>

<template>
  <!-- DRAGGABLE WRAPPER -->
  <draggable 
    v-model="localWidgets" 
    item-key="key"
    class="header-dashboard"
    :class="{ 'expanded': mainStore.isHeaderExpanded }"
    ghost-class="sortable-ghost"
    drag-class="sortable-drag"
    :animation="200"
  >
    <template #item="{ element: widgetKey, index }">
      
      <div class="dashboard-card-wrapper">
        
        <div 
          v-if="widgetKey.startsWith('placeholder_')" 
          class="dashboard-card placeholder-card"
        >
        </div>

        <HeaderTotalCard
          v-else-if="widgetKey === 'currentTotal'"
          title="Всего (на тек. момент)"
          :totalBalance="loggedCurrentTotal" 
          :subtitlePrefix="`Всего на ${mainStore.currentAccountBalances.length} счетах`"
          :subtitleDate="`до ${todayStr}`"
          :widgetKey="widgetKey"
          :widgetIndex="index"
        />
        
        <HeaderLiabilitiesCard
          v-else-if="widgetKey === 'liabilities'"
          title="Мои предоплаты" 
          :weOweAmount="mainStore.liabilitiesWeOwe"
          :theyOweAmount="mainStore.liabilitiesTheyOwe"
          :weOweAmountFuture="mainStore.liabilitiesWeOweFuture"
          :theyOweAmountFuture="mainStore.liabilitiesTheyOweFuture"
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @edit="onLiabilitiesEdit"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'accounts'"
          title="Мои счета"
          :items="loggedAccountBalances" 
          emptyText="...счетов нет..."
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @add="openAddPopup('Новый счет', mainStore.addAccount)"
          @edit="openEditPopup('Редактировать счета', mainStore.accounts, 'accounts')"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'companies'"
          title="Мои компании"
          :items="mergedCompanyBalances" emptyText="...компаний нет..."
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @add="openAddPopup('Новая компания', mainStore.addCompany)"
          @edit="openEditPopup('Редактировать компании', mainStore.companies, 'companies')"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'contractors'"
          title="Мои контрагенты"
          :items="mergedContractorBalances" emptyText="...контрагентов нет..."
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @add="openAddPopup('Новый контрагент', mainStore.addContractor)"
          @edit="openEditPopup('Редактировать контрагентов', mainStore.visibleContractors, 'contractors')"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'projects'"
          title="Мои проекты"
          :items="mergedProjectBalances" emptyText="...проектов нет..."
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @add="openAddPopup('Новый проект', mainStore.addProject)"
          @edit="openEditPopup('Редактировать проекты', mainStore.projects, 'projects')"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'individuals'"
          title="Мои Физлица"
          :items="mergedIndividualBalances" 
          emptyText="...физлиц нет..."
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @add="openAddPopup('Новое Физлицо', mainStore.addIndividual)"
          @edit="openEditPopup('Редактировать Физлиц', mainStore.individuals, 'individuals')"
        />
        
        <HeaderBalanceCard
          v-else-if="widgetKey === 'categories'"
          title="Категории"
          :items="mergedCategoryBalances" 
          emptyText="...категорий нет..."
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @add="openAddPopup('Новая категория', mainStore.addCategory)"
          @edit="openEditPopup('Редактировать категории', mainStore.visibleCategories, 'categories')"
        />

        <HeaderTotalCard
          v-else-if="widgetKey === 'futureTotal'"
          title="Всего (с уч. будущих)"
          :totalBalance="loggedFutureTotal" 
          :subtitlePrefix="`Всего на ${mainStore.accounts.length} счетах`"
          :subtitleDate="`до ${futureUntilStr}`"
          :widgetKey="widgetKey"
          :widgetIndex="index"
        />

        <HeaderCategoryCard
          v-else-if="widgetKey.startsWith('cat_') || widgetKey === 'incomeList' || widgetKey === 'expenseList' || widgetKey === 'withdrawalList'"
          :title="getWidgetByKey(widgetKey)?.name || '...'"
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @add="onCategoryAdd(widgetKey, index)"
          @edit="onCategoryEdit(widgetKey)"
        />
      </div>
    </template>
  </draggable>

  <EntityPopup
    v-if="isEntityPopupVisible"
    :title="popupTitle"
    :initial-value="popupInitialValue"
    :show-delete="showDeleteInPopup"
    @close="isEntityPopupVisible = false"
    @save="onEntitySave"
    @delete="onEntityDelete"
  />
  <EntityListEditor
    v-if="isListEditorVisible"
    :title="editorTitle"
    :items="editorItems"
    @close="isListEditorVisible = false"
    @save="onEntityListSave"
  />
  <TransferPopup
      v-if="isTransferPopupVisible"
      :date="new Date()"
      :cellIndex="0"
      @close="isTransferPopupVisible = false"
      @transfer-complete="handleTransferComplete"
    />
    
  <TransferListEditor
    v-if="isTransferEditorVisible"
    @close="isTransferEditorVisible = false"
  />

  <OperationListEditor
    v-if="isOperationListEditorVisible"
    :title="operationListEditorTitle"
    :type="operationListEditorType"
    :filter-mode="operationListEditorFilterMode"
    @close="isOperationListEditorVisible = false"
  />

  <OperationPopup
    v-if="isOperationPopupVisible"
    :type="operationPopupType"
    :date="new Date()"
    :cellIndex="0"
    @close="isOperationPopupVisible = false"
    @operation-added="handleOperationAdded"
  />

  <WithdrawalPopup 
     v-if="isWithdrawalPopupVisible" 
     :initial-data="{ amount: 0 }" 
     @close="isWithdrawalPopupVisible = false" 
     @save="handleWithdrawalSaved"
  />
</template>

<style scoped>
.header-dashboard {
  display: grid; /* Grid всегда */
  grid-template-columns: repeat(6, 1fr);
  gap: 1px; 
  padding: 1px; 
  background-color: var(--color-border); 
  
  border-radius: 8px;
  border: 1px solid var(--color-border); 
  
  margin-bottom: 0.4rem;
  height: 100%;
  box-sizing: border-box;
  min-height: 0; 
  width: 100%;
  overflow: hidden;
}

/* Обертка карточки */
.dashboard-card-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  background-color: var(--color-background-soft);
  min-width: 0;
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  cursor: grab;
}

.dashboard-card-wrapper:active {
  cursor: grabbing;
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
}

/* Убираем правую границу у 6-го элемента (конец строки) */
.dashboard-card-wrapper:nth-child(6n) {
  border-right: none !important;
}

/* В свернутом режиме (1 ряд): скрываем лишние и убираем низ */
.header-dashboard:not(.expanded) .dashboard-card-wrapper:nth-child(n+7) {
  display: none;
}
.header-dashboard:not(.expanded) .dashboard-card-wrapper {
  border-bottom: none !important;
}

/* 🟢 ИЗМЕНЕНО: Grid Auto Rows с minmax, чтобы ряды были одинаковыми */
.header-dashboard.expanded {
  grid-auto-rows: minmax(130px, 1fr); /* Равная высота рядов */
  overflow: hidden;
}

/* В развернутом режиме убираем нижнюю границу у последних 6 */
.header-dashboard.expanded .dashboard-card-wrapper:nth-last-child(-n+6) {
  border-bottom: none !important;
}

/* Стили при перетаскивании */
.sortable-ghost {
  opacity: 0.4;
  background-color: #333;
}
.sortable-drag {
  background-color: var(--color-background-soft);
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
  opacity: 1;
  z-index: 2000;
}

/* Скрытие элементов управления в expanded режиме */
.header-dashboard.expanded :deep(.card-title span),
.header-dashboard.expanded :deep(.card-title-container .widget-dropdown) {
  display: none !important;
}
.header-dashboard.expanded :deep(.card-title) {
  cursor: default;
  pointer-events: none;
}

@media (max-height: 900px) {
  :deep(.dashboard-card) {
    padding: 8px 10px !important;
  }
}
</style>