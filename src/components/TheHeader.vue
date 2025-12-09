<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';
import draggable from 'vuedraggable';

// Карточки
import HeaderTotalCard from './HeaderTotalCard.vue';
import HeaderBalanceCard from './HeaderBalanceCard.vue';
import HeaderCategoryCard from './HeaderCategoryCard.vue';
import HeaderLiabilitiesCard from './HeaderLiabilitiesCard.vue'; 
import HeaderCreditCard from './HeaderCreditCard.vue'; 
// 🟢 Импорт карточки налогов
import HeaderTaxCard from './HeaderTaxCard.vue';

// Попапы
import TransferPopup from './TransferPopup.vue';
import EntityPopup from './EntityPopup.vue';
import EntityListEditor from './EntityListEditor.vue';
import TransferListEditor from './TransferListEditor.vue';
import OperationListEditor from './OperationListEditor.vue';
import WithdrawalPopup from './WithdrawalPopup.vue';
import CreditListEditor from './CreditListEditor.vue'; 
import CreditWizardPopup from './CreditWizardPopup.vue'; 
import PrepaymentModal from './PrepaymentModal.vue';
import RetailClosurePopup from './RetailClosurePopup.vue';
import RefundPopup from './RefundPopup.vue';
import PrepaymentListEditor from './PrepaymentListEditor.vue';
import WithdrawalListEditor from './WithdrawalListEditor.vue';

// 🟢 НОВЫЕ ПОПАПЫ ДЛЯ НАЛОГОВ
import TaxListEditor from './TaxListEditor.vue';
import TaxPaymentPopup from './TaxPaymentPopup.vue';

import IncomePopup from './IncomePopup.vue';
import ExpensePopup from './ExpensePopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v46.5 - FORCE FONT SIZE FIX ---
 * * ВЕРСИЯ: 46.5
 * * ДАТА: 2025-12-09
 * * ИЗМЕНЕНИЯ:
 * 1. (GRID) Планшетная сетка 5 колонок для ширины 768px - 1400px.
 * 2. (CSS) Добавлены жесткие переопределения (!important) шрифтов для внутренних элементов карточек.
 * Это отменяет действие локальных медиа-запросов (max-height: 900px) внутри компонентов, 
 * которые уменьшали шрифт при включении прогноза.
 */

const mainStore = useMainStore();

// --- ГЛОБАЛЬНОЕ МЕНЮ ВИДЖЕТОВ ---
const activeDropdown = ref(null);
const searchQuery = ref('');

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
    mainStore.replaceWidget(activeDropdown.value.index, newWidgetKey);
    activeDropdown.value = null;
  }
};

const closeDropdown = () => {
  activeDropdown.value = null;
};

// ... adaptive utils ...
const windowWidth = ref(window.innerWidth);
const updateWidth = () => { windowWidth.value = window.innerWidth; };

// 🟢 Tablet Detection via MatchMedia (Sync with CSS)
// Расширяем диапазон до 1400px (iPad Pro, горизонтальные планшеты).
const tabletMediaQuery = window.matchMedia('(min-width: 768px) and (max-width: 1400px)');
const isTabletGrid = ref(tabletMediaQuery.matches);

const handleTabletChange = (e) => {
  isTabletGrid.value = e.matches;
};

onMounted(() => {
  window.addEventListener('resize', updateWidth);
  if (tabletMediaQuery.addEventListener) {
    tabletMediaQuery.addEventListener('change', handleTabletChange);
  } else {
    tabletMediaQuery.addListener(handleTabletChange);
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', updateWidth);
  if (tabletMediaQuery.removeEventListener) {
    tabletMediaQuery.removeEventListener('change', handleTabletChange);
  } else {
    tabletMediaQuery.removeListener(handleTabletChange);
  }
});

const isTablet = computed(() => windowWidth.value < 1400); 

const ruShort = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
const ruSuperShort = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
const todayStr = computed(() => { const d = new Date(); return isTablet.value ? ruSuperShort.format(d) : ruShort.format(d); });
const futureUntilStr = computed(() => {
  const d = mainStore.projection?.rangeEndDate ? new Date(mainStore.projection.rangeEndDate) : null;
  return (d && !isNaN(d.getTime())) ? (isTablet.value ? ruSuperShort.format(d) : ruShort.format(d)) : todayStr.value;
});

const localWidgets = computed({
  get: () => {
    if (mainStore.isHeaderExpanded) {
      const layoutSet = new Set(mainStore.dashboardLayout);
      const allKeys = mainStore.allWidgets.map(w => w.key);
      const ordered = [...mainStore.dashboardLayout];
      
      // Добавляем скрытые виджеты
      allKeys.forEach(k => { if (!layoutSet.has(k)) ordered.push(k); });
      
      // 🟢 Сетка 5x для планшетов (включая Pro до 1400px)
      const rowSize = isTabletGrid.value ? 5 : 6;
      
      const rows = Math.ceil(Math.max(ordered.length, 1) / rowSize); 
      const totalSlots = rows * rowSize;
      
      // Плейсхолдеры
      while (ordered.length < totalSlots) { ordered.push(`placeholder_${ordered.length}`); }
      return ordered;
    }
    return mainStore.dashboardLayout;
  },
  set: (newOrder) => {
    const realWidgets = newOrder.filter(k => !k.startsWith('placeholder_'));
    mainStore.dashboardLayout = realWidgets;
  }
});

// ... states ...
const isTransferPopupVisible = ref(false);
const isTransferEditorVisible = ref(false);
const isOperationListEditorVisible = ref(false);
const operationListEditorType = ref('income'); 
const operationListEditorTitle = ref('');
const operationListEditorFilterMode = ref('default');

const isIncomePopupVisible = ref(false);
const isExpensePopupVisible = ref(false);

const isWithdrawalPopupVisible = ref(false);
const isCreditEditorVisible = ref(false); 
const isCreditWizardVisible = ref(false); 
const isPrepaymentEditorVisible = ref(false);
const prepaymentEditorInitialTab = ref('clients');
const isWithdrawalListEditorVisible = ref(false);
const isEntityPopupVisible = ref(false);
const isRetailPopupVisible = ref(false);
const isRefundPopupVisible = ref(false);

// 🟢 Налоговые стейты
const isTaxListEditorVisible = ref(false);
const isTaxPaymentPopupVisible = ref(false);

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
  let result = currentBalances || [];
  if (futureData) {
      const futureMap = new Map(futureData.map(item => [item._id, item.balance]));
      result = currentBalances.map(item => {
          const fallback = isDelta ? 0 : item.balance;
          return { ...item, futureBalance: futureMap.get(item._id) ?? fallback };
      });
  }
  return result.sort((a, b) => (a.order || 0) - (b.order || 0));
};

const loggedAccountBalances = computed(() => mergeBalances(mainStore.currentAccountBalances, mainStore.futureAccountBalances, false));
const mergedCompanyBalances = computed(() => mergeBalances(mainStore.currentCompanyBalances, mainStore.futureCompanyBalances, false));

const mergedContractorBalances = computed(() => {
    const allMerged = mergeBalances(mainStore.currentContractorBalances, mainStore.futureContractorChanges, true);
    const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
    return allMerged.filter(contr => !myCompanyNames.has(contr.name.trim().toLowerCase()));
});

const mergedProjectBalances = computed(() => mergeBalances(mainStore.currentProjectBalances, mainStore.futureProjectChanges, true));

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

const mergedCreditBalances = computed(() => {
    return mainStore.futureCreditBalances.sort((a, b) => (b.balance || 0) - (a.balance || 0));
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
    if (widgetKey === 'withdrawalList') { isWithdrawalPopupVisible.value = true; return; }
    
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

const onLiabilitiesAdd = () => { isIncomePopupVisible.value = true; };

const onCategoryEdit = (widgetKey) => {
    operationListEditorFilterMode.value = 'default';
    if (widgetKey === 'transfers') { isTransferEditorVisible.value = true; return; }
    if (widgetKey === 'incomeList') { operationListEditorTitle.value = 'Редактировать доходы'; operationListEditorType.value = 'income'; isOperationListEditorVisible.value = true; return; }
    if (widgetKey === 'expenseList') { operationListEditorTitle.value = 'Редактировать расходы'; operationListEditorType.value = 'expense'; isOperationListEditorVisible.value = true; return; }
    if (widgetKey === 'withdrawalList') { isWithdrawalListEditorVisible.value = true; return; }
    
    const catId = widgetKey.replace('cat_', '');
    const category = mainStore.getCategoryById(catId);
    if (category) {
        const lowerName = category.name.toLowerCase();
        if (lowerName === 'перевод' || lowerName === 'transfer') isTransferEditorVisible.value = true;
        else openRenamePopup(`Категория: ${category.name}`, category, null, true, 'categories');
    }
};

const onLiabilitiesEdit = () => { prepaymentEditorInitialTab.value = 'clients'; isPrepaymentEditorVisible.value = true; };
const onLiabilitiesTab = (tabName) => { prepaymentEditorInitialTab.value = tabName; isPrepaymentEditorVisible.value = true; };

const onCreditsEdit = () => { isCreditEditorVisible.value = true; };
const onCreditsAdd = () => { isCreditWizardVisible.value = true; };

// 🟢 ОБРАБОТЧИКИ НАЛОГОВ
const onTaxesAdd = () => {
    isTaxPaymentPopupVisible.value = true;
};
const onTaxesEdit = () => {
    isTaxListEditorVisible.value = true;
};

const handleTaxPaymentSuccess = () => {
    isTaxPaymentPopupVisible.value = false;
    mainStore.fetchAllEntities();
};

const handleWizardSave = async (payload) => {
    isCreditWizardVisible.value = false;
    try {
        const systemEntities = await mainStore.ensureSystemEntities();
        const repaymentCatId = systemEntities.repaymentCat._id;
        const creditPayload = {
            name: payload.name, totalDebt: payload.totalDebt, monthlyPayment: payload.monthlyPayment,
            paymentDay: payload.paymentDay, contractorId: payload.contractorId, individualId: payload.individualId
        };
        await mainStore.addCredit(creditPayload);
        const operationsPromises = payload.schedule.map(item => {
            return mainStore.createEvent({
                date: item.date, amount: -item.amount, type: 'expense', categoryId: repaymentCatId,
                contractorId: payload.contractorId, individualId: payload.individualId,
                description: `Погашение обязательства: ${payload.name}`, accountId: null
            });
        });
        await Promise.all(operationsPromises);
        await mainStore.fetchAllEntities();
        if (mainStore.projection.mode) { await mainStore.loadCalculationData(mainStore.projection.mode, mainStore.currentViewDate); }
    } catch (e) { console.error("Ошибка сохранения обязательства:", e); alert("Не удалось создать обязательство: " + e.message); }
};

const handleTransferComplete = async (eventData) => { if (eventData?.dateKey) await mainStore.refreshDay(eventData.dateKey); isTransferPopupVisible.value = false; };
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

  <!-- DRAGGABLE -->
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
        <div v-if="widgetKey.startsWith('placeholder_')" class="dashboard-card placeholder-card"></div>

        <HeaderTotalCard
          v-else-if="widgetKey === 'currentTotal'"
          :title="'Всего на счетах\nна текущий момент'"
          :totalBalance="loggedCurrentTotal" 
          :subtitlePrefix="`Всего на ${mainStore.currentAccountBalances.length} счетах`"
          :subtitleDate="`до ${todayStr}`"
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @open-menu="handleOpenMenu"
        />
        
        <!-- 🟢 NEW: Виджет Налогов -->
        <HeaderTaxCard
          v-else-if="widgetKey === 'taxes'"
          title="Мои налоги"
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @add="onTaxesAdd"
          @edit="onTaxesEdit"
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
          @add="onLiabilitiesAdd"
          @edit="onLiabilitiesEdit"
          @open-tab="onLiabilitiesTab"
          @open-menu="handleOpenMenu"
        />

        <HeaderCreditCard
          v-else-if="widgetKey === 'credits'"
          title="Мои кредиты"
          :items="mergedCreditBalances"
          emptyText="...кредитов нет..."
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @add="onCreditsAdd"
          @edit="onCreditsEdit"
          @open-menu="handleOpenMenu"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'accounts'"
          title="Счета/Кассы"
          :items="loggedAccountBalances" emptyText="...счетов нет..."
          :widgetKey="widgetKey" :widgetIndex="index"
          :isDeltaMode="false"
          @add="openAddPopup('Новый счет', mainStore.addAccount, 'account')"
          @edit="openEditPopup('Редактировать счета', mainStore.accounts, 'accounts')"
          @open-menu="handleOpenMenu"
        />

        <HeaderBalanceCard
          v-else-if="widgetKey === 'companies'"
          title="Мои компании"
          :items="mergedCompanyBalances" emptyText="...компаний нет..."
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
          :subtitlePrefix="`Всего на ${mainStore.accounts.length} счетах`"
          :subtitleDate="`до ${futureUntilStr}`"
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @open-menu="handleOpenMenu"
        />

        <HeaderCategoryCard
          v-else-if="widgetKey === 'transfers' || widgetKey.startsWith('cat_') || widgetKey === 'incomeList' || widgetKey === 'expenseList' || widgetKey === 'withdrawalList'"
          :title="getWidgetByKey(widgetKey)?.name || '...'"
          :widgetKey="widgetKey"
          :widgetIndex="index"
          @add="onCategoryAdd(widgetKey, index)"
          @edit="onCategoryEdit(widgetKey)"
          @open-menu="handleOpenMenu"
        />
      </div>
    </template>
  </draggable>

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
  <TransferPopup v-if="isTransferPopupVisible" :date="new Date()" :cellIndex="0" @close="isTransferPopupVisible = false" @transfer-complete="handleTransferComplete" />
  <TransferListEditor v-if="isTransferEditorVisible" @close="isTransferEditorVisible = false" />
  <OperationListEditor v-if="isOperationListEditorVisible" :title="operationListEditorTitle" :type="operationListEditorType" :filter-mode="operationListEditorFilterMode" @close="isOperationListEditorVisible = false" />
  
  <IncomePopup v-if="isIncomePopupVisible" :date="new Date()" :cellIndex="0" @close="isIncomePopupVisible = false" @save="handleOperationAdded" />
  <ExpensePopup v-if="isExpensePopupVisible" :date="new Date()" :cellIndex="0" @close="isExpensePopupVisible = false" @save="handleOperationAdded" />
  <WithdrawalPopup v-if="isWithdrawalPopupVisible" :initial-data="{ amount: 0 }" @close="isWithdrawalPopupVisible = false" @save="handleWithdrawalSaved" />
  <CreditListEditor v-if="isCreditEditorVisible" @close="isCreditEditorVisible = false" />
  <CreditWizardPopup v-if="isCreditWizardVisible" @close="isCreditWizardVisible = false" @save="handleWizardSave" />
  <PrepaymentListEditor v-if="isPrepaymentEditorVisible" :initial-tab="prepaymentEditorInitialTab" @close="isPrepaymentEditorVisible = false" />
  <WithdrawalListEditor v-if="isWithdrawalListEditorVisible" @close="isWithdrawalListEditorVisible = false" />
  
  <!-- 🟢 POPUPS НАЛОГОВ -->
  <TaxListEditor v-if="isTaxListEditorVisible" @close="isTaxListEditorVisible = false" />
  <TaxPaymentPopup v-if="isTaxPaymentPopupVisible" @close="isTaxPaymentPopupVisible = false" @success="handleTaxPaymentSuccess" />

</template>

<style scoped>
.header-dashboard { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1px; padding: 1px; background-color: var(--color-border); border-radius: 8px; border: 1px solid var(--color-border); margin-bottom: 0.4rem; height: 100%; box-sizing: border-box; min-height: 0; width: 100%; overflow: hidden; grid-template-rows: 1fr; }
.dashboard-card-wrapper { position: relative; display: flex; flex-direction: column; background-color: var(--color-background-soft); min-width: 0; min-height: 0; border-right: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); cursor: grab; }
.dashboard-card-wrapper:active { cursor: grabbing; }
:deep(.dashboard-card) { flex: 1; display: flex; flex-direction: column; background-color: transparent; padding: 8px 12px !important; border: none !important; min-width: 0; box-sizing: border-box; margin: 0 !important; min-height: 0; }

/* 🟢 DEFAULT 6x1 LOGIC (Desktop > 1400px) */
.dashboard-card-wrapper:nth-child(6n) { border-right: none !important; }
.header-dashboard:not(.expanded) .dashboard-card-wrapper:nth-child(n+7) { display: none; }
.header-dashboard:not(.expanded) .dashboard-card-wrapper { border-bottom: none !important; }

/* 🟢 TABLET LOGIC (5 columns) - NOW INCLUDES ALL UP TO 1400px */
@media (min-width: 768px) and (max-width: 1400px) {
  /* Сетка 5 колонок */
  .header-dashboard {
    grid-template-columns: repeat(5, 1fr);
  }

  /* 🟢 FIX FONT SIZE STABILITY */
  /* Принудительно задаем размер шрифта, чтобы он не уменьшался при активации прогноза.
     Переопределяем стили для всех типов контента внутри карточек:
     - .card-items-list (списки счетов/компаний)
     - .card-item (строки)
     - .category-items-list-scroll (списки категорий)
     - .summary-value-block (итоги категорий)
     - .forecast-mode (сам режим прогноза)
  */
  :deep(.dashboard-card),
  :deep(.card-items-list),
  :deep(.card-item),
  :deep(.category-items-list-scroll),
  :deep(.category-item),
  :deep(.summary-value-block),
  :deep(.card-items-list.forecast-mode) {
      font-size: var(--font-sm, 13px) !important;
  }
  
  /* Игнорируем уменьшение для конкретных ячеек */
  :deep(.current-cell),
  :deep(.future-cell),
  :deep(.forecast-display) {
      font-size: inherit !important;
  }
  
  /* Сбрасываем стили для 6-й колонки */
  .dashboard-card-wrapper:nth-child(6n) {
    border-right: 1px solid var(--color-border) !important;
  }
  
  /* Убираем границу у 5-го элемента в ряду */
  .dashboard-card-wrapper:nth-child(5n) {
    border-right: none !important;
  }
  
  /* В свернутом состоянии скрываем всё после 5-го элемента */
  .header-dashboard:not(.expanded) .dashboard-card-wrapper:nth-child(n+6) { 
    display: none; 
  }
  
  /* В развернутом состоянии, у последних 5 элементов убираем нижнюю границу */
  .header-dashboard.expanded .dashboard-card-wrapper:nth-last-child(-n+5) { 
    border-bottom: none !important; 
  }
}

/* 🟢 EXPANDED LOGIC */
.header-dashboard.expanded { grid-template-rows: none; grid-auto-rows: minmax(130px, 1fr); overflow: hidden; }

/* Default desktop expanded bottom border removal (last 6 items) */
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