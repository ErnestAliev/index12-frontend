<script setup>
import { ref, computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import EntityListEditor from './EntityListEditor.vue';
import OperationListEditor from './OperationListEditor.vue';
import TaxListEditor from './TaxListEditor.vue';
import TransferListEditor from './TransferListEditor.vue';
import PrepaymentListEditor from './PrepaymentListEditor.vue';
import WithdrawalListEditor from './WithdrawalListEditor.vue';
import CreditListEditor from './CreditListEditor.vue';
import CreateEntityModal from './CreateEntityModal.vue';
import CreditWizardPopup from './CreditWizardPopup.vue';

const emit = defineEmits(['close']);
const mainStore = useMainStore();

// Create entity modal state
const showCreateEntityModal = ref(false);
const createEntityType = ref('');

// Credit wizard state
const showCreditWizard = ref(false);
const editingCredit = ref(null);

// Get items from store for each entity type
const accountItems = computed(() => mainStore.accounts || []);
const companyItems = computed(() => mainStore.companies || []);
const individualItems = computed(() => mainStore.individuals || []);
const contractorItems = computed(() => mainStore.contractors || []);
const projectItems = computed(() => mainStore.projects || []);
const categoryItems = computed(() => mainStore.categories || []);

// Tab definitions with default order
const defaultTabs = [
  { id: 'accounts', label: 'Счета', component: null },
  { id: 'companies', label: 'Компании', component: null },
  { id: 'individuals', label: 'Физлица', component: null },
  { id: 'contractors', label: 'Контрагенты', component: null },
  { id: 'projects', label: 'Проекты', component: null },
  { id: 'taxes', label: 'Налоги', component: null },
  { id: 'transfers', label: 'Переводы', component: null },
  { id: 'prepayments', label: 'Предоплаты', component: null },
  { id: 'categories', label: 'Категории', component: null },
  { id: 'incomes', label: 'Доходы', component: null },
  { id: 'expenses', label: 'Расходы', component: null },
  { id: 'withdrawals', label: 'Выводы', component: null },
  { id: 'credits', label: 'Кредиты', component: null }
];

const tabs = ref([...defaultTabs]);
// Refs for child components
const contractorsEditorRef = ref(null);
const projectsEditorRef = ref(null);
const categoriesEditorRef = ref(null);
const taxesEditorRef = ref(null);
const transfersEditorRef = ref(null);
const operationEditorRef = ref(null);
const withdrawalsEditorRef = ref(null);
const creditsEditorRef = ref(null);

const activeTabId = ref('accounts');
const draggedTabId = ref(null);

// Load saved tab order from localStorage
onMounted(() => {
  const savedOrder = localStorage.getItem('universalEditModalTabOrder');
  if (savedOrder) {
    try {
      const orderIds = JSON.parse(savedOrder);
      // Reorder tabs based on saved order
      const reordered = orderIds
        .map(id => defaultTabs.find(t => t.id === id))
        .filter(Boolean);
      
      // Add any new tabs that weren't in saved order
      const existingIds = new Set(orderIds);
      const newTabs = defaultTabs.filter(t => !existingIds.has(t.id));
      
      tabs.value = [...reordered, ...newTabs];
    } catch (e) {
      console.error('Failed to load tab order:', e);
    }
  }
});

// Save tab order to localStorage
const saveTabOrder = () => {
  const order = tabs.value.map(t => t.id);
  localStorage.setItem('universalEditModalTabOrder', JSON.stringify(order));
};

// Drag & Drop handlers
const onDragStart = (e, tabId) => {
  draggedTabId.value = tabId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', tabId);
  e.target.classList.add('dragging');
};

const onDragEnd = (e) => {
  e.target.classList.remove('dragging');
  draggedTabId.value = null;
};

const onDragOver = (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
};

const onDrop = (e, targetTabId) => {
  e.preventDefault();
  
  if (!draggedTabId.value || draggedTabId.value === targetTabId) return;
  
  const draggedIndex = tabs.value.findIndex(t => t.id === draggedTabId.value);
  const targetIndex = tabs.value.findIndex(t => t.id === targetTabId);
  
  if (draggedIndex === -1 || targetIndex === -1) return;
  
  // Reorder tabs
  const newTabs = [...tabs.value];
  const [draggedTab] = newTabs.splice(draggedIndex, 1);
  newTabs.splice(targetIndex, 0, draggedTab);
  
  tabs.value = newTabs;
  saveTabOrder();
};

const selectTab = (tabId) => {
  console.log('🔄 Switching tab to:', tabId);
  activeTabId.value = tabId;
};

// Get current entity name for create button
const currentEntityName = computed(() => {
  const tab = tabs.value.find(t => t.id === activeTabId.value);
  if (!tab) return 'объект';
  
  const names = {
    accounts: 'счет',
    companies: 'компанию',
    individuals: 'физлицо',
    contractors: 'контрагента',
    projects: 'проект',
    categories: 'категорию'
  };
  
  return names[tab.id] || 'объект';
});

// Get button config for current tab
const currentButtonConfig = computed(() => {
  const configs = {
    accounts: { show: true, label: 'Создать счет', color: '#10b981', handler: startCreating },
    companies: { show: true, label: 'Создать компанию', color: '#10b981', handler: startCreating },
    individuals: { show: true, label: 'Создать физлицо', color: '#10b981', handler: startCreating },
    contractors: { show: true, label: 'Создать контрагента', color: '#10b981', handler: startCreating },
    projects: { show: true, label: 'Создать проект', color: '#10b981', handler: startCreating },
    categories: { show: true, label: 'Создать категорию', color: '#10b981', handler: startCreating },
    taxes: { show: true, label: 'Оплатить налоги', color: '#10b981', handler: handlePayTaxes },
    transfers: { show: false, label: '', color: '', handler: null }, // Hidden - uses internal popup
    incomes: { show: false, label: '', color: '', handler: null }, // Hidden - uses internal popup
    expenses: { show: false, label: '', color: '', handler: null }, // Hidden - uses internal popup
    withdrawals: { show: true, label: 'Вывод средств', color: '#DE8FFF', handler: () => withdrawalsEditorRef.value?.openCreatePopup?.() },
    credits: { show: true, label: 'Создать кредит', color: '#10b981', handler: () => { editingCredit.value = null; showCreditWizard.value = true; } },
    prepayments: { show: false, label: '', color: '', handler: null }
  };
  
  return configs[activeTabId.value] || { show: false, label: '', color: '', handler: null };
});

// Action handlers
const startCreating = () => {
  console.log('🆕 Opening create modal for:', activeTabId.value);
  createEntityType.value = activeTabId.value;
  showCreateEntityModal.value = true;
};

const handleEntityCreated = (newItem) => {
  console.log('✅ Entity created:', newItem);
  // Modal will close automatically, entity already added to store
};

const handlePayTaxes = () => {
    console.log('💳 CLICKED: Pay Taxes');
    console.log('🔗 Ref value:', taxesEditorRef.value);
    
    if (taxesEditorRef.value && typeof taxesEditorRef.value.triggerPay === 'function') {
        taxesEditorRef.value.triggerPay();
    } else {
        console.error('❌ Error: taxesEditorRef is missing or triggerPay is not a function');
        alert('Ошибка: Не удалось открыть окно оплаты. Попробуйте обновить страницу.');
    }
};

const closeModal = () => {
  emit('close');
};

// Credit wizard handlers
const handleCreditWizardSave = async (creditData) => {
  try {
    await mainStore.addCredit(creditData);
    await mainStore.fetchAllEntities();
    showCreditWizard.value = false;
  } catch (error) {
    console.error('Error saving credit:', error);
  }
};

const handleCreditWizardUpdate = async ({ id, updates }) => {
  try {
    await mainStore.updateCredit(id, updates);
    await mainStore.fetchAllEntities();
    showCreditWizard.value = false;
  } catch (error) {
    console.error('Error updating credit:', error);
  }
};
</script>

<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="universal-edit-modal">
      <!-- Header with close button -->
      <div class="modal-header">
        <h2>Редактирование данных</h2>
        <button class="close-btn" @click="closeModal">&times;</button>
      </div>

      <!-- Draggable Tab Bar -->
      <div class="tab-bar">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="tab"
          :class="{ active: activeTabId === tab.id, dragging: draggedTabId === tab.id }"
          draggable="true"
          @click="selectTab(tab.id)"
          @dragstart="onDragStart($event, tab.id)"
          @dragend="onDragEnd"
          @dragover="onDragOver"
          @drop="onDrop($event, tab.id)"
        >
          <span class="tab-label">{{ tab.label }}</span>
        </div>
      </div>

      <!-- Tab Content Area -->
      <div class="tab-content">
        <!-- Accounts Tab -->
        <EntityListEditor
          v-if="activeTabId === 'accounts'"
          ref="accountsEditorRef"
          title="Редактирование счетов"
          entity-type="accounts"
          widget-key="accounts"
          :items="accountItems"
          @close="() => {}"
          @save="(items) => mainStore.batchUpdateEntities('accounts', items)"
        />
        
        <!-- Companies Tab -->
        <EntityListEditor
          v-else-if="activeTabId === 'companies'"
          ref="companiesEditorRef"
          title="Редактирование компаний"
          entity-type="companies"
          widget-key="companies"
          :items="companyItems"
          @close="() => {}"
          @save="(items) => mainStore.batchUpdateEntities('companies', items)"
        />
        
        <!-- Individuals Tab -->
        <EntityListEditor
          v-else-if="activeTabId === 'individuals'"
          ref="individualsEditorRef"
          title="Редактирование физлиц"
          entity-type="individuals"
          widget-key="individuals"
          :items="individualItems"
          @close="() => {}"
          @save="(items) => mainStore.batchUpdateEntities('individuals', items)"
        />
        
        <!-- Contractors Tab -->
        <EntityListEditor
          v-else-if="activeTabId === 'contractors'"
          ref="contractorsEditorRef"
          title="Редактирование контрагентов"
          entity-type="contractors"
          widget-key="contractors"
          :items="contractorItems"
          @close="() => {}"
          @save="(items) => mainStore.batchUpdateEntities('contractors', items)"
        />
        
        <!-- Projects Tab -->
        <EntityListEditor
          v-else-if="activeTabId === 'projects'"
          ref="projectsEditorRef"
          title="Редактирование проектов"
          entity-type="projects"
          widget-key="projects"
          :items="projectItems"
          @close="() => {}"
          @save="(items) => mainStore.batchUpdateEntities('projects', items)"
        />
        
        <!-- Taxes Tab -->
        <TaxListEditor
          v-else-if="activeTabId === 'taxes'"
          ref="taxesEditorRef"
          widget-key="taxes"
          @close="() => {}"
        />
        
        <!-- Transfers Tab -->
        <TransferListEditor
          v-else-if="activeTabId === 'transfers'"
          ref="transfersEditorRef"
          widget-key="transfers"
          @close="() => {}"
        />
        
        <!-- Prepayments Tab -->
        <PrepaymentListEditor
          v-else-if="activeTabId === 'prepayments'"
          widget-key="liabilities"
          @close="() => {}"
        />
        
        <!-- Categories Tab -->
        <EntityListEditor
          v-else-if="activeTabId === 'categories'"
          ref="categoriesEditorRef"
          title="Редактирование категорий"
          entity-type="categories"
          widget-key="categories"
          :items="categoryItems"
          @close="() => {}"
          @save="(items) => mainStore.batchUpdateEntities('categories', items)"
        />
        
        <!-- Incomes Tab -->
        <OperationListEditor
          v-else-if="activeTabId === 'incomes'"
          ref="operationEditorRef"
          title="Редактирование доходов"
          type="income"
          widget-key="incomeList"
          @close="() => {}"
        />
        
        <!-- Expenses Tab -->
        <OperationListEditor
          v-else-if="activeTabId === 'expenses'"
          title="Редактирование расходов"
          type="expense"
          widget-key="expenseList"
          @close="() => {}"
        />
        
        <!-- Withdrawals Tab -->
        <WithdrawalListEditor
          v-else-if="activeTabId === 'withdrawals'"
          ref="withdrawalsEditorRef"
          widget-key="withdrawalList"
          @close="() => {}"
        />
        
        <!-- Credits Tab -->
        <CreditListEditor
          v-else-if="activeTabId === 'credits'"
          ref="creditsEditorRef"
          widget-key="credits"
          @close="() => {}"
        />
      </div>
      
      <!-- Sticky Footer with Actions -->
      <div class="modal-footer">
        <!-- Create button - tab-aware -->
        <div v-if="currentButtonConfig.show" class="footer-center">
          <button 
            class="btn-create" 
            :style="{ backgroundColor: currentButtonConfig.color }"
            @click="currentButtonConfig.handler"
          >
            + {{ currentButtonConfig.label }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- Create Entity Modal -->
    <CreateEntityModal
      v-if="showCreateEntityModal"
      :entity-type="createEntityType"
      @close="showCreateEntityModal = false"
      @created="handleEntityCreated"
    />
    
    <!-- Credit Wizard Popup -->
    <CreditWizardPopup
      v-if="showCreditWizard"
      :editingCredit="editingCredit"
      @close="showCreditWizard = false"
      @save="handleCreditWizardSave"
      @update="handleCreditWizardUpdate"
    />
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  backdrop-filter: blur(3px);
}

.universal-edit-modal {
  width: 95vw;
  height: 90vh;
  background: var(--color-background);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-background-soft);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.3rem;
  color: var(--color-heading);
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--color-text-soft);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--color-text);
}

/* Tab Bar - Chrome style */
.tab-bar {
  display: flex;
  gap: 2px;
  padding: 8px 8px 0 8px;
  background-color: var(--color-background-mute);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.tab-bar::-webkit-scrollbar {
  height: 6px;
}

.tab-bar::-webkit-scrollbar-track {
  background: transparent;
}

.tab-bar::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.tab {
  position: relative;
  padding: 10px 20px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-bottom: none;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
  white-space: nowrap;
  min-width: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab:hover {
  background: var(--color-background);
}

.tab.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  border-bottom: 1px solid var(--color-primary);
  margin-bottom: -1px;
  font-weight: 600;
  color: white;
}

.tab.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.tab-label {
  font-size: 14px;
  color: var(--color-text);
}

.tab.active .tab-label {
  color: white;
}

/* Tab Content Area */
.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  background: var(--color-background);
  position: relative;
}

/* Override nested popup modal styles to work as inline content */
.tab-content :deep(.popup-overlay) {
  position: static !important;
  background: transparent !important;
  backdrop-filter: none !important;
  width: 100% !important;
  height: 100% !important;
  display: block !important;
  z-index: auto !important;
}

.tab-content :deep(.popup-content) {
  width: 100% !important;
  max-width: none !important;
  height: auto !important;
  min-height: calc(90vh - 130px) !important;
  margin: 0 !important;
  box-shadow: none !important;
  border: none !important;
  border-radius: 0 !important;
  background: var(--color-background) !important;
  padding: 2rem !important;
}

/* Ensure h3 titles don't have excessive margin */
.tab-content :deep(h3) {
  margin-top: 0 !important;
}

/* Hide nested editor footers - we use the main modal footer instead */
.tab-content :deep(.editor-footer) {
  display: none !important;
}

.tab-content :deep(.popup-actions) {
  display: none !important;
}

/* Hide all internal editor footers - buttons are in main modal footer */
.tab-content :deep(.popup-footer) {
  display: none !important;
}

.tab-content :deep(.sticky-footer) {
  display: none !important;
}

/* Important: Allow inner overlays (delete dialogs, etc) to show */
.tab-content :deep(.inner-overlay) {
  display: flex !important;
  position: absolute !important;
  z-index: 1000 !important;
}

/* Placeholder content */
.content-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-soft);
}

.content-placeholder h3 {
  font-size: 1.5rem;
  margin-bottom: 8px;
  color: var(--color-text);
}

.content-placeholder p {
  font-size: 1rem;
  opacity: 0.7;
}

/* Mobile optimization */
@media (max-width: 768px) {
  .universal-edit-modal {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
  }
  
  .tab {
    min-width: 80px;
    padding: 8px 12px;
  }
  
  .tab-label {
    font-size: 13px;
  }
}

/* Modal Footer - Sticky */
.modal-footer {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px 24px;
  background: var(--color-background);
  border-top: 2px solid var(--color-border);
  z-index: 100;
}

.footer-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-create {
  padding: 0 32px;
  height: 44px;
  border: none;
  background: var(--color-primary);
  border-radius: 8px;
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  min-width: 200px;
}

.btn-create:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(40, 184, 160, 0.3);
}
</style>
