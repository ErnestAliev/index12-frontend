<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import OperationPopup from './OperationPopup.vue';
import WithdrawalPopup from './WithdrawalPopup.vue';
import DateRangePicker from './DateRangePicker.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import RetailClosurePopup from './RetailClosurePopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v26.11 - REFACTORING STAGE 2.8 - HISTORY CLEANUP ---
 * * ВЕРСИЯ: 26.11.8 - Очистка фильтров и колонок для Истории
 * * ДАТА: 2025-11-26
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (UI) Таб "История": Оставлены только колонки: Статус, Дата, Сумма, Проект, Удалить.
 * 2. (UI) Таб "История": Фильтры приведены в соответствие с колонками.
 * 3. (LOGIC) handleRetailClosure принимает projectIds (массив) и берет первый для сохранения.
 */

const props = defineProps({
  title: { type: String, default: 'Редактировать операции' },
  type: { type: String, required: true }, 
  filterMode: { type: String, default: 'default' } 
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

// 🟢 TABS
const activeTab = ref('clients'); // 'clients' | 'retail' | 'history'

const localItems = ref([]);
const isSaving = ref(false);

// State для закрытия (Чекбокс)
const showCloseConfirm = ref(false);
const itemToClose = ref(null);
const processingItems = ref(new Set());

// State для закрытия (Розница)
const showRetailPopup = ref(false);

// State для удаления списания (История)
const showDeleteWriteOffConfirm = ref(false);
const writeOffToDelete = ref(null);
const isDeletingWriteOff = ref(false);

// Filters
const filters = ref({
  dateRange: { from: null, to: null },
  owner: '',
  account: '',
  amount: '',
  contractorValue: '',
  category: '',
  project: ''
});

const isCreatePopupVisible = ref(false);
const isWithdrawalPopupVisible = ref(false);
const isDeleting = ref(false);
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const withdrawalToEdit = ref(null);

// DATA SOURCES
const accounts = computed(() => mainStore.accounts);
const projects = computed(() => mainStore.projects);
const categories = computed(() => mainStore.categories.filter(c => !['перевод', 'transfer'].includes(c.name.toLowerCase())));
const companies = computed(() => mainStore.companies);
const individuals = computed(() => mainStore.individuals);

// 🟢 ОПРЕДЕЛЕНИЕ ID "РОЗНИЦЫ"
const retailIndividualId = computed(() => {
    const retail = mainStore.individuals.find(i => i.name.toLowerCase().trim() === 'розница');
    return retail ? retail._id : null;
});

const contractorOptions = computed(() => {
  const opts = [];
  const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
  const filteredContractors = mainStore.contractors.filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));

  if (filteredContractors.length > 0) {
      const group = { label: 'Юрлица / ИП', options: [] };
      filteredContractors.forEach(c => group.options.push({ value: `contr_${c._id}`, label: c.name }));
      opts.push(group);
  }
  
  const ownerIds = new Set();
  mainStore.accounts.forEach(acc => {
      if (acc.individualId) {
          const iId = (typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
          if (iId) ownerIds.add(iId);
      }
  });
  
  // Исключаем владельцев И исключаем "Розницу" из общего списка выбора
  const filteredIndividuals = mainStore.individuals.filter(i => !ownerIds.has(i._id) && i._id !== retailIndividualId.value);

  if (filteredIndividuals.length > 0) {
      const group = { label: 'Физлица (Контрагенты)', options: [] };
      filteredIndividuals.forEach(i => group.options.push({ value: `ind_${i._id}`, label: i.name }));
      opts.push(group);
  }
  return opts;
});

// Helpers
const toInputDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const formatDateReadable = (dateVal) => {
  if (!dateVal) return '';
  return new Date(dateVal).toLocaleDateString('ru-RU');
};
const getOwnerId = (compId, indId) => {
  if (compId) return typeof compId === 'object' ? `company-${compId._id}` : `company-${compId}`;
  if (indId) return typeof indId === 'object' ? `individual-${indId._id}` : `individual-${indId}`;
  return null;
};
const formatTotal = (val) => `${formatNumber(Math.abs(val))} ₸`;

// Loaders
const isSystemPrepayment = (item) => {
    const op = item.originalOp || item;
    const prepayIds = mainStore.getPrepaymentCategoryIds;
    const catId = op.categoryId?._id || op.categoryId;
    const prepId = op.prepaymentId?._id || op.prepaymentId;
    return (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
};

const isWithdrawalMode = computed(() => props.type === 'withdrawal');

const loadOperations = () => {
  const allOps = mainStore.allOperationsFlat;
  const targetOps = allOps.filter(op => {
    if (isWithdrawalMode.value) return op.isWithdrawal;
    if (op.type !== props.type) return false;
    if (op.isTransfer || op.isWithdrawal) return false;
    if (op.categoryId?.name?.toLowerCase() === 'перевод') return false;
    if (props.filterMode === 'prepayment_only') return isSystemPrepayment(op);
    return true;
  });

  localItems.value = targetOps.sort((a, b) => new Date(b.date) - new Date(a.date)).map(op => {
      const ownerId = getOwnerId(op.companyId, op.individualId);
      let contrVal = null;
      const cId = op.contractorId?._id || op.contractorId;
      const indContrId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
      if (cId) contrVal = `contr_${cId}`;
      else if (indContrId) contrVal = `ind_${indContrId}`;

      return {
        _id: op._id,
        originalOp: op,
        date: toInputDate(op.date),
        amount: Math.abs(op.amount),
        amountFormatted: formatNumber(Math.abs(op.amount)),
        totalDealAmount: op.totalDealAmount || 0, 
        accountId: op.accountId?._id || op.accountId,
        ownerId: ownerId,
        contractorValue: contrVal, 
        categoryId: op.categoryId?._id || op.categoryId,
        projectId: op.projectId?._id || op.projectId,
        destination: op.destination || '',
        isClosed: !!op.isClosed, 
        isDeleted: false,
        // Для фильтрации
        rawIndContractorId: indContrId,
        projectName: op.projectId?.name || '---'
      };
    });
};

onMounted(() => { 
    loadOperations(); 
    // Принудительно проверяем розницу, если еще не загружена
    if (!retailIndividualId.value) mainStore.fetchAllEntities();
});

// 🟢 SPLIT LISTS
const clientItems = computed(() => {
    return localItems.value.filter(item => {
        // Исключаем Розницу
        return item.rawIndContractorId !== retailIndividualId.value;
    });
});

const retailItems = computed(() => {
    return localItems.value.filter(item => {
        // Только Розница
        return item.rawIndContractorId === retailIndividualId.value;
    });
});

// 🟢 HISTORY ITEMS (Write-offs)
const historyItems = computed(() => {
    return mainStore.getRetailWriteOffs.map(op => {
        return {
            ...op,
            dateFormatted: toInputDate(op.date),
            amountAbs: Math.abs(op.amount),
            projectId: op.projectId?._id || op.projectId,
            projectName: op.projectId?.name || '---',
            // Флаг для фильтрации
            isDeleted: false 
        };
    });
});

const currentTabItems = computed(() => {
    if (activeTab.value === 'clients') return clientItems.value;
    if (activeTab.value === 'retail') return retailItems.value;
    return historyItems.value; 
});

// 🟢 FILTERING LOGIC
const filteredItems = computed(() => {
  const list = currentTabItems.value;

  return list.filter(item => {
    if (item.isDeleted) return false;
    const { from, to } = filters.value.dateRange;
    
    // Дата (для истории и обычных)
    const itemDate = item.date || item.dateFormatted;
    if (from && itemDate < from) return false;
    if (to && itemDate > to) return false;

    // Сумма
    const itemAmt = item.amount !== undefined ? item.amount : item.amountAbs;
    if (filters.value.amount && !String(itemAmt).includes(filters.value.amount.replace(/\s/g, ''))) return false;
    
    // Владелец и Счет (ТОЛЬКО НЕ В ИСТОРИИ)
    if (activeTab !== 'history') {
        if (filters.value.owner && item.ownerId !== filters.value.owner) return false;
        if (filters.value.account && item.accountId !== filters.value.account) return false;
    }
    
    // Остальные фильтры
    if (!isWithdrawalMode.value) {
        if (activeTab !== 'history') {
            if (filters.value.contractorValue && item.contractorValue !== filters.value.contractorValue) return false;
            if (filters.value.category && item.categoryId !== filters.value.category) return false;
        }
        // Проект фильтруем везде, если выбран
        if (filters.value.project && item.projectId !== filters.value.project) return false;
    }

    // Доп фильтры для истории (если они нужны, они совпадают по ключам)
    if (activeTab.value === 'history') {
        if (filters.value.project && item.projectId !== filters.value.project) return false;
    }

    return true;
  });
});

// 🟢 CALCULATED SUMS FOR TABS

// Таб 1: Клиенты
const clientsSummary = computed(() => {
    let totalDeal = 0;
    let prepayment = 0;
    
    clientItems.value.forEach(item => {
        if (item.isClosed) return; // Закрытые не считаем в долг
        totalDeal += (item.totalDealAmount || 0);
        prepayment += (item.amount || 0);
    });
    
    const debt = totalDeal > prepayment ? totalDeal - prepayment : 0;
    
    return {
        total: formatTotal(totalDeal),
        prepayment: formatTotal(prepayment),
        debt: formatTotal(debt)
    };
});

// Таб 2: Розница
const retailSummary = computed(() => {
    // Получено (Сумма всех приходов по рознице)
    const received = retailItems.value.reduce((acc, item) => acc + (item.amount || 0), 0);
    
    // Списано (Сумма всех списаний из истории)
    const writeOffs = mainStore.getRetailWriteOffs.reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
    
    // Должны отработать
    const debt = received - writeOffs;
    
    return {
        received: formatTotal(received),
        writeOffs: formatTotal(writeOffs),
        debt: formatTotal(debt > 0 ? debt : 0)
    };
});

// Таб 3: История (Те же цифры, что и в рознице)
const historySummary = computed(() => retailSummary.value);


// 🟢 ACTIONS
const initiateClosePrepayment = (item) => {
    if (item.isClosed) { alert('Эта операция уже закрыта.'); return; }
    itemToClose.value = item;
    showCloseConfirm.value = true;
};
const confirmClosePrepayment = async () => {
    if (!itemToClose.value) return;
    const item = itemToClose.value;
    showCloseConfirm.value = false;
    processingItems.value.add(item._id);
    try {
        await mainStore.closePrepaymentDeal(item.originalOp);
        item.isClosed = true;
        await mainStore.fetchAllEntities();
        loadOperations();
    } catch (e) { alert('Ошибка закрытия: ' + e.message); } 
    finally { processingItems.value.delete(item._id); itemToClose.value = null; }
};

// 🟢 ОБРАБОТКА ЗАКРЫТИЯ СМЕНЫ (ПРОЕКТ - массив или одиночный)
const handleRetailClosure = async ({ amount, projectIds }) => {
    try {
        // Берем первый проект из массива (ограничение бэкенда)
        const projectId = (projectIds && projectIds.length > 0) ? projectIds[0] : null;
        
        await mainStore.closeRetailDaily(amount, new Date(), projectId);
        showRetailPopup.value = false;
        await mainStore.fetchAllEntities();
        loadOperations();
    } catch (e) {
        alert('Ошибка: ' + e.message);
    }
};

// Удаление списания (Восстановление долга)
const askDeleteWriteOff = (item) => {
    writeOffToDelete.value = item;
    showDeleteWriteOffConfirm.value = true;
};
const confirmDeleteWriteOff = async () => {
    if (!writeOffToDelete.value) return;
    isDeletingWriteOff.value = true;
    try {
        await mainStore.deleteOperation(writeOffToDelete.value);
        await mainStore.fetchAllEntities(); 
    } catch(e) { alert(e.message); } 
    finally { 
        isDeletingWriteOff.value = false; 
        showDeleteWriteOffConfirm.value = false; 
        writeOffToDelete.value = null;
    }
};

// CRUD Handlers
const openCreatePopup = () => { 
    if (isWithdrawalMode.value) { withdrawalToEdit.value = null; isWithdrawalPopupVisible.value = true; } 
    else { isCreatePopupVisible.value = true; }
};
const editWithdrawal = (item) => { withdrawalToEdit.value = item.originalOp; isWithdrawalPopupVisible.value = true; };
const handleOperationAdded = async (newOp) => { isCreatePopupVisible.value = false; await mainStore.fetchAllEntities(); loadOperations(); };
const handleWithdrawalSaved = async ({ mode, id, data }) => { isWithdrawalPopupVisible.value = false; if (mode === 'create') await mainStore.createEvent(data); else await mainStore.updateOperation(id, data); await mainStore.fetchAllEntities(); loadOperations(); };
const onAmountInput = (item) => { const raw = item.amountFormatted.replace(/[^0-9]/g, ''); item.amountFormatted = formatNumber(raw); item.amount = Number(raw); };
const askDelete = (item) => { itemToDelete.value = item; showDeleteConfirm.value = true; };
const confirmDelete = async () => { if (!itemToDelete.value) return; isDeleting.value = true; try { await mainStore.deleteOperation(itemToDelete.value.originalOp); itemToDelete.value.isDeleted = true; showDeleteConfirm.value = false; } catch (e) { alert(e.message); } finally { isDeleting.value = false; } };
const handleSave = async () => {
  isSaving.value = true;
  try {
    const updates = [];
    for (const item of localItems.value) {
      if (item.isDeleted) continue;
      const original = item.originalOp;
      
      let companyId = null;
      let individualId = null;
      if (item.ownerId) {
          const [type, id] = item.ownerId.split('-');
          if (type === 'company') companyId = id;
          else individualId = id;
      }

      let contractorId = null;
      let counterpartyIndividualId = null;
      if (item.contractorValue) {
          const [prefix, id] = item.contractorValue.split('_');
          if (prefix === 'contr') contractorId = id;
          else if (prefix === 'ind') counterpartyIndividualId = id;
      }

      const [year, month, day] = item.date.split('-').map(Number);
      const newDateObj = new Date(year, month - 1, day, 12, 0, 0);

      const isChanged = 
        toInputDate(original.date) !== item.date ||
        Math.abs(original.amount) !== item.amount ||
        (original.accountId?._id || original.accountId) !== item.accountId ||
        (original.companyId?._id || original.companyId) !== companyId ||
        (original.individualId?._id || original.individualId) !== individualId ||
        (original.contractorId?._id || original.contractorId) !== contractorId ||
        (original.counterpartyIndividualId?._id || original.counterpartyIndividualId) !== counterpartyIndividualId ||
        (original.categoryId?._id || original.categoryId) !== item.categoryId ||
        (original.projectId?._id || original.projectId) !== item.projectId;

      if (isChanged) {
        updates.push(mainStore.updateOperation(item._id, {
          date: newDateObj,
          amount: props.type === 'income' ? item.amount : -item.amount,
          accountId: item.accountId,
          companyId, individualId,
          contractorId, counterpartyIndividualId,
          categoryId: item.categoryId,
          projectId: item.projectId,
          destination: item.destination,
          isWithdrawal: isWithdrawalMode.value
        }));
      }
    }
    if (updates.length > 0) await Promise.all(updates);
    emit('close');
  } catch (e) { console.error(e); } finally { isSaving.value = false; }
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      
      <div class="popup-header">
        <h3>{{ title }}</h3>
      </div>

      <!-- 🟢 TABS -->
      <div class="tabs-header" v-if="props.filterMode === 'prepayment_only'">
          <button class="tab-btn" :class="{ active: activeTab === 'clients' }" @click="activeTab = 'clients'">
            Предоплаты по сделкам
          </button>
          <button class="tab-btn" :class="{ active: activeTab === 'retail' }" @click="activeTab = 'retail'">
            Предоплаты по розничным клиентам
          </button>
          <button class="tab-btn" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">
            История списаний
          </button>
      </div>
      
      <!-- 🟢 CLIENTS SUMMARY (Таб 1) -->
      <div class="summary-bar" v-if="activeTab === 'clients' && props.filterMode === 'prepayment_only'">
          <div class="sum-item">
              <span class="sum-label">Общая сумма:</span>
              <span class="sum-val">{{ clientsSummary.total }}</span>
          </div>
          <div class="sum-sep">/</div>
          <div class="sum-item">
              <span class="sum-label">Предоплата:</span>
              <span class="sum-val income-text">{{ clientsSummary.prepayment }}</span>
          </div>
          <div class="sum-sep">/</div>
          <div class="sum-item">
              <span class="sum-label">Остаток долга:</span>
              <span class="sum-val warn-text">{{ clientsSummary.debt }}</span>
          </div>
      </div>

      <!-- 🟢 RETAIL SUMMARY (Таб 2) -->
      <div class="summary-bar" v-if="activeTab === 'retail' && props.filterMode === 'prepayment_only'">
          <div class="sum-item">
               <span class="sum-label">Получено (Розница):</span>
               <span class="sum-val income-text">{{ retailSummary.received }}</span>
          </div>
          <div class="sum-sep">/</div>
          <div class="sum-item">
               <span class="sum-label">Списали:</span>
               <span class="sum-val">{{ retailSummary.writeOffs }}</span>
          </div>
          <div class="sum-sep">/</div>
          <div class="sum-item">
               <span class="sum-label">Должны отработать:</span>
               <span class="sum-val warn-text">{{ retailSummary.debt }}</span>
          </div>
      </div>

      <!-- 🟢 HISTORY SUMMARY (Таб 3) -->
      <div class="summary-bar" v-if="activeTab === 'history' && props.filterMode === 'prepayment_only'">
          <div class="sum-item">
               <span class="sum-label">Получено (Розница):</span>
               <span class="sum-val income-text">{{ historySummary.received }}</span>
          </div>
          <div class="sum-sep">/</div>
          <div class="sum-item">
               <span class="sum-label">Списали:</span>
               <span class="sum-val">{{ historySummary.writeOffs }}</span>
          </div>
          <div class="sum-sep">/</div>
          <div class="sum-item">
               <span class="sum-label">Должны отработать:</span>
               <span class="sum-val warn-text">{{ historySummary.debt }}</span>
          </div>
      </div>

      <!-- FILTERS -->
      <div class="filters-row" :class="{ 'with-checkbox': props.filterMode === 'prepayment_only' && activeTab === 'clients', 'history-mode': activeTab === 'history' }">
        <!-- Колонка чекбокса/статуса -->
        <div class="filter-col col-check">
           <span v-if="activeTab === 'clients'">Закр.</span>
           <span v-if="activeTab === 'history'">Статус</span>
        </div>
        
        <!-- Дата -->
        <div class="filter-col col-date"><DateRangePicker v-model="filters.dateRange" placeholder="Период" /></div>
        
        <!-- Для обычных режимов: Владелец, Счет -->
        <template v-if="activeTab !== 'history'">
            <div class="filter-col col-owner"><select v-model="filters.owner" class="filter-input filter-select"><option value="">Владелец</option><optgroup label="Компании"><option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option></optgroup></select></div>
            <div class="filter-col col-acc"><select v-model="filters.account" class="filter-input filter-select"><option value="">Счет</option><option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option></select></div>
        </template>
        
        <!-- Сумма -->
        <div class="filter-col col-amount"><input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма" /></div>
        
        <!-- Для обычных режимов: Контрагент, Категория, Проект -->
        <template v-if="!isWithdrawalMode && activeTab !== 'history'">
            <div class="filter-col col-contr" v-if="activeTab === 'clients'">
               <select v-model="filters.contractorValue" class="filter-input filter-select"><option value="">Контрагент</option><optgroup v-for="g in contractorOptions" :key="g.label" :label="g.label"><option v-for="o in g.options" :key="o.value" :value="o.value">{{ o.label }}</option></optgroup></select>
            </div>
            <div class="filter-col col-cat"><select v-model="filters.category" class="filter-input filter-select"><option value="">Категория</option><option v-for="c in categories" :key="c._id" :value="c._id">{{ c.name }}</option></select></div>
            <div class="filter-col col-proj"><select v-model="filters.project" class="filter-input filter-select"><option value="">Проект</option><option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option></select></div>
        </template>

        <!-- 🟢 Для Истории: Только Проект -->
        <template v-if="activeTab === 'history'">
             <div class="filter-col col-proj"><select v-model="filters.project" class="filter-input filter-select"><option value="">Проект</option><option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option></select></div>
        </template>

        <!-- Мусор -->
        <div class="filter-col col-trash"></div>
      </div>
      
      <div class="list-scroll">
        <div v-if="activeTab !== 'history' && filteredItems.length === 0" class="empty-state">Операций не найдено.</div>
        
        <!-- TAB 1 & 2: Clients & Retail Income -->
        <template v-if="activeTab !== 'history'">
            <div 
               v-for="item in filteredItems" 
               :key="item._id" 
               class="grid-row" 
               :class="{ 'is-closed': item.isClosed, 'with-checkbox': props.filterMode === 'prepayment_only' && activeTab === 'clients' }"
            >
              <div class="col-check">
                 <template v-if="props.filterMode === 'prepayment_only' && activeTab === 'clients'">
                    <div v-if="processingItems.has(item._id)" class="spinner-mini"></div>
                    <input v-else type="checkbox" :checked="item.isClosed" @click.prevent="initiateClosePrepayment(item)" />
                 </template>
              </div>

              <div class="col-date"><input type="date" v-model="item.date" class="edit-input date-input" :disabled="item.isClosed" /></div>
              <div class="col-owner"><select v-model="item.ownerId" class="edit-input select-input" :disabled="item.isClosed"><option :value="null">-</option><optgroup label="Компании"><option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option></optgroup></select></div>
              <div class="col-acc"><select v-model="item.accountId" class="edit-input select-input" :disabled="item.isClosed"><option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option></select></div>
              <div class="col-amount"><input type="text" v-model="item.amountFormatted" @input="onAmountInput(item)" class="edit-input amount-input" :disabled="item.isClosed" /></div>
              
              <template v-if="!isWithdrawalMode">
                  <div class="col-contr" v-if="activeTab === 'clients'">
                     <select v-model="item.contractorValue" class="edit-input select-input" :disabled="item.isClosed"><option :value="null">-</option><optgroup v-for="g in contractorOptions" :key="g.label" :label="g.label"><option v-for="o in g.options" :key="o.value" :value="o.value">{{ o.label }}</option></optgroup></select>
                  </div>
                  <div class="col-cat"><select v-model="item.categoryId" class="edit-input select-input" :disabled="item.isClosed"><option :value="null">-</option><option v-for="c in categories" :key="c._id" :value="c._id">{{ c.name }}</option></select></div>
                  <div class="col-proj"><select v-model="item.projectId" class="edit-input select-input" :disabled="item.isClosed"><option :value="null">-</option><option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option></select></div>
              </template>

              <div class="col-trash">
                <button class="delete-btn" @click="askDelete(item)" title="Удалить">
                   <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
        </template>

        <!-- 🟢 TAB 3: Retail History (Only requested columns) -->
        <template v-else>
            <div v-if="filteredItems.length === 0" class="empty-state">Нет списаний.</div>
            
            <div class="grid-row history-row-short" v-for="wo in filteredItems" :key="wo._id">
                <!-- Статус -->
                <div class="col-check col-status">
                   <span class="status-dot"></span>
                </div>
                
                <!-- Дата -->
                <div class="col-date">
                   <span class="readonly-text">{{ formatDateReadable(wo.date) }}</span>
                </div>
                
                <!-- Сумма -->
                <div class="col-amount">
                   <span class="amount-text-exp">- {{ formatNumber(Math.abs(wo.amount)) }}</span>
                </div>

                <!-- Проект -->
                <div class="col-proj">
                    <span class="readonly-text">{{ wo.projectName }}</span>
                </div>

                <!-- Удалить -->
                <div class="col-trash">
                    <button class="delete-btn btn-restore" @click="askDeleteWriteOff(wo)" title="Удалить">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        </template>
      </div>

      <div class="popup-footer">
        <div class="footer-left-actions">
            <button v-if="activeTab !== 'history'" class="btn-add-new-footer btn-income" @click="openCreatePopup">+ Создать</button>
            
            <!-- 🟢 НОВОЕ МЕСТО КНОПКИ РОЗНИЦЫ -->
            <button 
              v-if="activeTab === 'retail' && props.filterMode === 'prepayment_only'" 
              class="btn-add-new-footer btn-orange-retail" 
              @click="showRetailPopup = true"
            >
                Внести сумму выполненных работ
            </button>
        </div>

        <div class="footer-actions">
            <button class="btn-close" @click="$emit('close')">Закрыть</button>
            <button v-if="activeTab !== 'history'" class="btn-save" @click="handleSave" :disabled="isSaving">Сохранить изменения</button>
        </div>
      </div>
    </div>

    <OperationPopup v-if="isCreatePopupVisible" :type="type" :date="new Date()" :cellIndex="0" @close="isCreatePopupVisible = false" @operation-added="handleOperationAdded" />
    <RetailClosurePopup v-if="showRetailPopup" @close="showRetailPopup = false" @confirm="handleRetailClosure" />
    <ConfirmationPopup v-if="showCloseConfirm" title="Закрытие сделки" message="Закрыть сделку? Будет создан акт выполненных работ." confirmText="Закрыть" @close="showCloseConfirm = false" @confirm="confirmClosePrepayment" />
    <ConfirmationPopup v-if="showDeleteWriteOffConfirm" title="Отмена списания" message="Вы уверены? Это вернет сумму долга перед розницей." confirmText="Удалить" @close="showDeleteWriteOffConfirm = false" @confirm="confirmDeleteWriteOff" />
    
    <div v-if="showDeleteConfirm" class="inner-overlay" @click.self="showDeleteConfirm = false"><div class="delete-confirm-box"><h4>Удалить?</h4><div class="delete-actions"><button class="btn-delete-confirm" @click="confirmDelete">Да, удалить</button><button class="btn-cancel" @click="showDeleteConfirm = false">Отмена</button></div></div></div>
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; max-height: 85vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 95%; max-width: 1300px; border: 1px solid #ddd; }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 24px; color: #111827; font-weight: 700; letter-spacing: -0.02em; }

/* TABS */
.tabs-header { display: flex; gap: 24px; padding: 0 1.5rem; margin-top: 1rem; border-bottom: 1px solid #e5e7eb; }
.tab-btn { background: none; border: none; border-bottom: 3px solid transparent; font-size: 15px; font-weight: 600; color: #6b7280; padding: 12px 0; cursor: pointer; transition: all 0.2s; }
.tab-btn.active { color: #10b981; border-color: #10b981; }
.tab-btn:hover { color: #374151; }

/* SUMMARIES */
.summary-bar { display: flex; align-items: center; gap: 15px; padding: 15px 24px; background-color: #fff; border-bottom: 1px solid #eee; font-size: 15px; color: #333; }
.sum-item { display: flex; gap: 6px; }
.sum-label { color: #666; }
.sum-val { font-weight: 700; }
.sum-sep { color: #ddd; }
.income-text { color: #10b981; }
.warn-text { color: #f59e0b; }

/* RETAIL */
.retail-summary-block { display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; padding: 16px 24px; margin: 1.5rem 1.5rem 1rem; border-radius: 10px; border: 1px solid #a7f3d0; }
.retail-info { font-size: 16px; font-weight: 500; color: #047857; }
.retail-value { font-weight: 800; font-size: 20px; margin-left: 12px; color: #065f46; }

/* 🟢 СТИЛЬ ДЛЯ КНОПКИ РОЗНИЦЫ (Оранжевый) */
.btn-orange-retail {
    background-color: #f59e0b !important; /* Оранжевый */
    color: white;
}
.btn-orange-retail:hover {
    background-color: #d97706 !important; /* Темнее при наведении */
}

/* 🟢 Grid System */
.filters-row, .grid-row { 
  display: grid; 
  /* Стандарт: чек/статус, дата, вл, счет, сумма, контр, кат, про, корз */
  grid-template-columns: 50px 130px 1fr 1fr 120px 1fr 1fr 1fr 50px; 
  gap: 12px; 
  align-items: center; 
  padding: 0 1.5rem; 
}

/* 🟢 History Short Mode: Status | Date | Sum | Project | Delete */
.history-row-short {
    grid-template-columns: 50px 150px 150px 1fr 50px !important; 
}
.filters-row.history-mode {
    grid-template-columns: 50px 150px 150px 1fr 50px !important; 
}
/* Убираем старые конфликты */
.filters-row.with-checkbox, .grid-row.with-checkbox { 
    grid-template-columns: 50px 130px 1fr 1fr 120px 1fr 1fr 1fr 50px; 
}

/* Элемент статуса (точка) */
.status-dot { width: 10px; height: 10px; border-radius: 50%; background-color: #10b981; }
.col-status { display: flex; justify-content: center; align-items: center; }

.filters-row { margin-bottom: 10px; }

.grid-row { 
  padding: 4px 1.5rem; 
  background: #fff; 
  border: 1px solid #E0E0E0; 
  border-radius: 8px;
  margin-bottom: 6px;
  transition: box-shadow 0.2s;
}
.grid-row:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  border-color: #ccc;
}
.grid-row.is-closed { background-color: #f3f4f6; opacity: 0.8; }
.grid-row.is-closed .edit-input { color: #9ca3af; text-decoration: line-through; background-color: transparent; border-color: transparent; }

/* 🟢 FIX: Добавлен flex для центрирования содержимого колонок */
.col-check { display: flex; justify-content: center; align-items: center; }
.col-trash { display: flex; justify-content: center; align-items: center; }
.col-date { display: flex; align-items: center; }

.col-check input { width: 20px; height: 20px; border-radius: 4px; border: 2px solid #d1d5db; cursor: pointer; accent-color: #10b981; }
.spinner-mini { width: 20px; height: 20px; border: 2px solid #e5e7eb; border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; max-height: 55vh; scrollbar-width: none; -ms-overflow-style: none; }
.list-scroll::-webkit-scrollbar { display: none; }

/* Readonly Text */
.readonly-text { font-size: 13px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.amount-text-exp { font-weight: 700; color: #ef4444; text-align: right; display: block; width: 100%; }

/* Inputs (28px) */
.edit-input { 
  width: 100%; height: 28px; 
  background: #FFFFFF; border: 1px solid #ccc; border-radius: 6px; 
  padding: 0 10px; font-size: 13px; color: #333; 
  box-sizing: border-box; margin: 0; display: block; 
}
.edit-input:focus { outline: none; border-color: #222; box-shadow: 0 0 0 2px rgba(34,34,34,0.1); }

/* Filter Inputs (28px) */
.filter-input { width: 100%; height: 28px; border: 1px solid #ccc; border-radius: 6px; padding: 0 6px; font-size: 13px; color: #333; box-sizing: border-box; background-color: #fff; margin: 0; }
.filter-select, .select-input { 
  -webkit-appearance: none; appearance: none; 
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); 
  background-repeat: no-repeat; background-position: right 10px center; 
  padding-right: 30px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; 
}
.filter-input:focus { outline: none; border-color: var(--color-primary); }

.amount-input { text-align: right; font-weight: 700; color: #333; }
.date-input { color: #555; }

/* Кнопка удаления (Стиль из TransferListEditor) */
.delete-btn { 
  width: 28px; height: 28px; 
  border: 1px solid #E0E0E0; background: #fff; 
  border-radius: 6px; 
  display: flex; align-items: center; justify-content: center; 
  cursor: pointer; transition: all 0.2s; padding: 0; margin: 0;
}
.delete-btn svg { width: 14px; height: 14px; stroke: #999; }
.delete-btn:hover { border-color: #FF3B30; background: #FFF5F5; }
.delete-btn:hover svg { stroke: #FF3B30; }

/* Footer Styles */
.popup-footer { 
  padding: 1.5rem; border-top: 1px solid #E0E0E0; 
  display: flex; justify-content: space-between;
  align-items: center;
  background-color: #F9F9F9; border-radius: 0 0 12px 12px; 
}

.footer-left-actions {
    display: flex;
    gap: 10px;
}

.btn-add-new-footer { 
  padding: 0 16px; height: 28px; 
  border: 1px solid transparent; 
  border-radius: 6px; 
  color: #fff; 
  font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; 
  white-space: nowrap;
  display: flex; align-items: center; justify-content: center;
}

.btn-income { background: #10b981; }
.btn-income:hover { background: #059669; }

.footer-actions { display: flex; gap: 10px; }

.btn-save { 
  padding: 0 16px; height: 28px; background: #111827; 
  color: white; border-radius: 6px; font-weight: 600; border: none; cursor: pointer; font-size: 13px;
  display: flex; align-items: center; justify-content: center;
}
.btn-save:hover { background: #374151; }

.btn-close { 
  padding: 0 16px; height: 28px; background: white; border: 1px solid #d1d5db; 
  color: #374151; border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 13px;
  display: flex; align-items: center; justify-content: center;
}
.btn-close:hover { background: #f3f4f6; }

.empty-state { text-align: center; padding: 4rem; color: #9ca3af; font-style: italic; }
</style>