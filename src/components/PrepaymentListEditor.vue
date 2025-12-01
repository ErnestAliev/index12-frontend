<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

import DateRangePicker from './DateRangePicker.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import RetailClosurePopup from './RetailClosurePopup.vue';
import RefundPopup from './RefundPopup.vue';

const props = defineProps({
  title: { type: String, default: 'Управление предоплатами и сделками' }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

// 🟢 TABS & STATE
const activeTab = ref('clients'); // 'clients' | 'retail' | 'history'
const localItems = ref([]);
const processingItems = ref(new Set());

// 🟢 Состояния для закрытия сделки (Partial Close)
const showCloseConfirm = ref(false);
const itemToClose = ref(null);
const closingAmountInput = ref('');
const maxClosingAmount = ref(0);

// 🟢 Retail & Refund States
const showRetailPopup = ref(false);
const showRefundPopup = ref(false);

// 🟢 Delete/History States
const showDeleteWriteOffConfirm = ref(false);
const writeOffToDelete = ref(null);
const isDeletingWriteOff = ref(false);

const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const isDeleting = ref(false);

// 🟢 Filters
const filters = ref({
  dateRange: { from: null, to: null },
  owner: '',
  account: '',
  amount: '',
  contractorValue: '',
  project: ''
});

// DATA SOURCES
const accounts = computed(() => mainStore.accounts);
const projects = computed(() => mainStore.projects);
const companies = computed(() => mainStore.companies);
const individuals = computed(() => mainStore.individuals);

// 🟢 Определение владельца (строка ID)
const getOwnerId = (compId, indId) => {
  if (compId) return typeof compId === 'object' ? `company-${compId._id}` : `company-${compId}`;
  if (indId) return typeof indId === 'object' ? `individual-${indId._id}` : `individual-${indId}`;
  return null;
};

// 🟢 Хелперы дат
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

const formatTotal = (val) => `${formatNumber(Math.abs(val))} ₸`;

// 🟢 ЛОГИКА ОПРЕДЕЛЕНИЯ ПРЕДОПЛАТЫ
const isSystemPrepayment = (item) => {
    const op = item.originalOp || item;
    if (mainStore._isRetailRefund(op)) return true;

    const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
    if (indId && indId === mainStore.retailIndividualId) {
        return (op.totalDealAmount || 0) > 0;
    }

    if ((op.totalDealAmount || 0) > 0) return true;

    const prepayIds = mainStore.getPrepaymentCategoryIds;
    const catId = op.categoryId?._id || op.categoryId;
    const prepId = op.prepaymentId?._id || op.prepaymentId;
    
    return (catId && prepayIds.includes(catId)) ||
           (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
};

// 🟢 LOAD DATA
const loadOperations = () => {
  const allOps = mainStore.allOperationsFlat;
  
  // Фильтруем только предоплаты/сделки + возвраты розницы
  const targetOps = allOps.filter(op => {
      if (op.type === 'expense' && mainStore._isRetailRefund(op)) return true;
      if (op.isTransfer || op.isWithdrawal) return false;
      return isSystemPrepayment(op);
  });

  localItems.value = targetOps.sort((a, b) => new Date(b.date) - new Date(a.date)).map(op => {
      // 1. Авто-определение владельца через счет
      let cId = op.companyId;
      let iId = op.individualId;

      if (!cId && !iId && op.accountId) {
          const accId = (typeof op.accountId === 'object') ? op.accountId._id : op.accountId;
          const storeAccount = mainStore.accounts.find(a => a._id === accId);
          if (storeAccount) {
              cId = storeAccount.companyId;
              iId = storeAccount.individualId;
          }
      }

      const ownerId = getOwnerId(cId, iId);
      
      // 2. Определение имен для отображения (ВМЕСТО СЕЛЕКТОВ)
      let ownerName = '-';
      if (cId) {
          const obj = typeof cId === 'object' ? cId : mainStore.companies.find(c => c._id === cId);
          if (obj) ownerName = obj.name;
      } else if (iId) {
          const obj = typeof iId === 'object' ? iId : mainStore.individuals.find(i => i._id === iId);
          if (obj) ownerName = obj.name;
      }

      let accountName = '-';
      if (op.accountId) {
          const acc = typeof op.accountId === 'object' ? op.accountId : mainStore.accounts.find(a => a._id === op.accountId);
          if (acc) accountName = acc.name;
      }

      let contractorName = '-';
      const contrId = op.contractorId?._id || op.contractorId;
      const indContrId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
      let contrVal = null;

      if (contrId) {
          contrVal = `contr_${contrId}`;
          const c = mainStore.contractors.find(x => x._id === contrId);
          if (c) contractorName = c.name;
      } else if (indContrId) {
          contrVal = `ind_${indContrId}`;
          const i = mainStore.individuals.find(x => x._id === indContrId);
          if (i) contractorName = i.name;
      }

      let projectName = op.projectId?.name || '-';
      if (projectName === '-' && op.projectId) {
           const pId = op.projectId._id || op.projectId;
           const p = mainStore.projects.find(x => x._id === pId);
           if (p) projectName = p.name;
      }

      let amount = Math.abs(op.amount);
      
      return {
        _id: op._id,
        originalOp: op,
        date: toInputDate(op.date), // Для сортировки/фильтрации
        amount: amount,
        amountFormatted: formatNumber(amount),
        totalDealAmount: op.totalDealAmount || 0, 
        
        // Данные для логики сохранения
        accountId: op.accountId?._id || op.accountId,
        ownerId: ownerId, 
        contractorValue: contrVal, 
        categoryId: op.categoryId?._id || op.categoryId,
        projectId: op.projectId?._id || op.projectId,
        
        // Данные для отображения (строки)
        ownerName,
        accountName,
        contractorName,
        projectName,

        isClosed: !!op.isClosed, 
        isDeleted: false,
        rawIndContractorId: indContrId,
        isRefund: op.type === 'expense' 
      };
    });
};

onMounted(() => { 
    if (!mainStore.retailIndividualId) mainStore.fetchAllEntities();
    loadOperations(); 
});

watch(() => mainStore.accounts, loadOperations, { deep: true });
watch(() => mainStore.allOperationsFlat, loadOperations, { deep: true });

// 🟢 COMPUTED LISTS
const clientItems = computed(() => {
    return localItems.value.filter(item => item.rawIndContractorId !== mainStore.retailIndividualId);
});

const retailItems = computed(() => {
    return localItems.value.filter(item => item.rawIndContractorId === mainStore.retailIndividualId);
});

const historyItems = computed(() => {
    return mainStore.getRetailWriteOffs.map(op => ({
        ...op,
        dateFormatted: toInputDate(op.date),
        amountAbs: Math.abs(op.amount),
        projectName: op.projectId?.name || '---',
        isDeleted: false 
    }));
});

const currentTabItems = computed(() => {
    if (activeTab.value === 'clients') return clientItems.value;
    if (activeTab.value === 'retail') return retailItems.value;
    return historyItems.value; 
});

// 🟢 FILTERING
const filteredItems = computed(() => {
  const list = currentTabItems.value;
  return list.filter(item => {
    if (item.isDeleted) return false;
    const { from, to } = filters.value.dateRange;
    
    const itemDate = item.date || item.dateFormatted;
    if (from && itemDate < from) return false;
    if (to && itemDate > to) return false;

    const itemAmt = item.amount !== undefined ? item.amount : item.amountAbs;
    if (filters.value.amount && !String(itemAmt).includes(filters.value.amount.replace(/\s/g, ''))) return false;
    
    if (activeTab.value !== 'history') {
        if (filters.value.owner && item.ownerId !== filters.value.owner) return false;
        if (filters.value.account && item.accountId !== filters.value.account) return false;
        if (filters.value.contractorValue && item.contractorValue !== filters.value.contractorValue) return false;
    }
    
    if (filters.value.project && item.projectId !== filters.value.project) return false;

    return true;
  });
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
  
  const filteredIndividuals = mainStore.individuals.filter(i => {
      if (activeTab.value === 'clients' && i._id === mainStore.retailIndividualId) return false;
      const name = i.name.trim().toLowerCase();
      if (name === 'розничные клиенты' || name === 'розница') return false;
      return true;
  });

  if (filteredIndividuals.length > 0) {
      const group = { label: 'Физлица (Контрагенты)', options: [] };
      filteredIndividuals.forEach(i => group.options.push({ value: `ind_${i._id}`, label: i.name }));
      opts.push(group);
  }
  return opts;
});

// 🟢 SUMMARIES
const clientsSummary = computed(() => {
    let totalDeal = 0;
    let prepayment = 0;
    clientItems.value.forEach(item => {
        if (item.isClosed) return;
        totalDeal += (item.totalDealAmount || 0);
        if (item.isRefund) prepayment -= (item.amount || 0); 
        else prepayment += (item.amount || 0);
    });
    const debt = totalDeal > prepayment ? totalDeal - prepayment : 0;
    return { total: formatTotal(totalDeal), prepayment: formatTotal(prepayment), debt: formatTotal(debt) };
});

const retailSummary = computed(() => {
    const received = retailItems.value.reduce((acc, item) => {
        if (item.isRefund) return acc - (item.amount || 0);
        return acc + (item.amount || 0);
    }, 0);
    
    const writeOffs = mainStore.getRetailWriteOffs.reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
    const debt = received - writeOffs;
    return { received: formatTotal(received), writeOffs: formatTotal(writeOffs), debt: formatTotal(debt > 0 ? debt : 0) };
});
const historySummary = computed(() => retailSummary.value);

// 🟢 ACTIONS
const initiateClosePrepayment = (item) => {
    if (item.isClosed) { alert('Эта операция уже закрыта.'); return; }
    itemToClose.value = item;
    maxClosingAmount.value = item.amount;
    closingAmountInput.value = formatNumber(maxClosingAmount.value);
    showCloseConfirm.value = true;
};

const onClosingAmountInput = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    closingAmountInput.value = formatNumber(raw);
};

const confirmClosePrepayment = async () => {
    if (!itemToClose.value) return;
    const item = itemToClose.value;
    const amountVal = parseFloat(closingAmountInput.value.replace(/\s/g, ''));
    
    if (!amountVal || amountVal <= 0) {
        alert("Введите сумму акта");
        return;
    }

    showCloseConfirm.value = false;
    processingItems.value.add(item._id);
    
    try {
        await mainStore.closePrepaymentDeal(item.originalOp, amountVal);
        if (amountVal >= Math.abs(item.amount)) {
            item.isClosed = true;
        }
        await mainStore.fetchAllEntities();
        loadOperations();
    } catch (e) { 
        alert('Ошибка закрытия: ' + e.message);
    } finally { 
        processingItems.value.delete(item._id); 
        itemToClose.value = null; 
    }
};

const handleRetailClosure = async ({ amount, projectIds, date }) => {
    try {
        const projectId = (projectIds && projectIds.length > 0) ? projectIds[0] : null;
        const closureDate = date ? new Date(date) : new Date(); 
        await mainStore.closeRetailDaily(amount, closureDate, projectId);
        showRetailPopup.value = false;
        await mainStore.fetchAllEntities();
        loadOperations();
    } catch (e) { alert('Ошибка: ' + e.message); }
};

const handleRefundSave = async ({ mode, id, data }) => {
    showRefundPopup.value = false;
    try {
        if (mode === 'create') {
             if (data.cellIndex === undefined) {
                 const dateKey = mainStore._getDateKey(new Date(data.date));
                 data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey);
             }
             await mainStore.createEvent(data);
        } else {
             await mainStore.updateOperation(id, data);
        }
        await mainStore.fetchAllEntities();
        loadOperations();
    } catch(e) { console.error(e); alert('Ошибка сохранения возврата'); }
};

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
        loadOperations();
    } catch(e) { alert(e.message);
    } finally { isDeletingWriteOff.value = false; showDeleteWriteOffConfirm.value = false; writeOffToDelete.value = null; }
};

const askDelete = (item) => { itemToDelete.value = item; showDeleteConfirm.value = true; };
const confirmDelete = async () => { 
    if (!itemToDelete.value) return; 
    isDeleting.value = true; 
    try { 
        await mainStore.deleteOperation(itemToDelete.value.originalOp); 
        itemToDelete.value.isDeleted = true;
        showDeleteConfirm.value = false; 
    } catch (e) { alert(e.message); } finally { isDeleting.value = false; } 
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      
      <div class="popup-header"><h3>{{ title }}</h3></div>

      <!-- TABS -->
      <div class="tabs-header">
          <button class="tab-btn" :class="{ active: activeTab === 'clients' }" @click="activeTab = 'clients'">Предоплаты по сделкам</button>
          <button class="tab-btn" :class="{ active: activeTab === 'retail' }" @click="activeTab = 'retail'">Предоплаты по розничным клиентам</button>
          <button class="tab-btn" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">История списаний</button>
      </div>
      
      <!-- SUMMARIES -->
      <div class="summary-bar" v-if="activeTab === 'clients'">
          <div class="sum-item"><span class="sum-label">Общая сумма:</span><span class="sum-val">{{ clientsSummary.total }}</span></div><div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Предоплата:</span><span class="sum-val income-text">{{ clientsSummary.prepayment }}</span></div><div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Остаток долга:</span><span class="sum-val warn-text">{{ clientsSummary.debt }}</span></div>
      </div>

      <div class="summary-bar" v-if="activeTab === 'retail' || activeTab === 'history'">
          <div class="sum-item"><span class="sum-label">Получено (Розница):</span><span class="sum-val income-text">{{ retailSummary.received }}</span></div><div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Списали:</span><span class="sum-val">{{ retailSummary.writeOffs }}</span></div><div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Должны отработать:</span><span class="sum-val warn-text">{{ retailSummary.debt }}</span></div>
      </div>

      <!-- FILTERS -->
      <div class="filters-row" :class="{ 'with-checkbox': activeTab !== 'history', 'history-mode': activeTab === 'history' }">
        
        <div class="filter-col col-check" v-if="activeTab !== 'history'"><span>Закр.</span></div>
        <div class="filter-col col-check" v-if="activeTab === 'history'"><span>Статус</span></div>
        
        <div class="filter-col col-date"><DateRangePicker v-model="filters.dateRange" placeholder="Период" /></div>
        
        <template v-if="activeTab !== 'history'">
            <div class="filter-col col-owner">
                <select v-model="filters.owner" class="filter-input filter-select">
                    <option value="">Владелец</option>
                    <optgroup label="Компании"><option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option></optgroup>
                    <optgroup label="Физлица"><option v-for="i in individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option></optgroup>
                </select>
            </div>
            <div class="filter-col col-acc"><select v-model="filters.account" class="filter-input filter-select"><option value="">Счет</option><option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option></select></div>
        </template>
        
        <div class="filter-col col-amount"><input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма" /></div>
        
        <template v-if="activeTab !== 'history'">
            <div class="filter-col col-contr">
               <select v-model="filters.contractorValue" class="filter-input filter-select"><option value="">Контрагент</option><optgroup v-for="g in contractorOptions" :key="g.label" :label="g.label"><option v-for="o in g.options" :key="o.value" :value="o.value">{{ o.label }}</option></optgroup></select>
            </div>
            <div class="filter-col col-proj"><select v-model="filters.project" class="filter-input filter-select"><option value="">Проект</option><option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option></select></div>
        </template>

        <template v-if="activeTab === 'history'">
             <div class="filter-col col-proj"><select v-model="filters.project" class="filter-input filter-select"><option value="">Проект</option><option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option></select></div>
        </template>
        <div class="filter-col col-trash"></div>
      </div>
      
      <!-- LIST -->
      <div class="list-scroll">
        <div v-if="filteredItems.length === 0" class="empty-state">Операций не найдено.</div>
        
        <!-- CLIENTS & RETAIL LIST -->
        <template v-if="activeTab !== 'history'">
            <div v-for="item in filteredItems" :key="item._id" class="grid-row with-checkbox" :class="{ 'is-closed': item.isClosed }">
              
              <div class="col-check">
                  <div v-if="processingItems.has(item._id)" class="spinner-mini"></div>
                  <input v-else type="checkbox" :checked="item.isClosed" @click.prevent="initiateClosePrepayment(item)" />
              </div>
              
              <div class="col-date">
                  <span class="readonly-text">{{ formatDateReadable(item.date) }}</span>
              </div>
              
              <div class="col-owner">
                  <span class="readonly-text" :title="item.ownerName">{{ item.ownerName }}</span>
              </div>

              <div class="col-acc">
                  <span class="readonly-text" :title="item.accountName">{{ item.accountName }}</span>
              </div>
              
              <div class="col-amount">
                  <span class="readonly-text amount-display" :class="{'text-red': item.isRefund}">
                      {{ item.amountFormatted }} ₸
                  </span>
              </div>
              
              <div class="col-contr">
                   <span class="readonly-text" :title="item.contractorName">{{ item.contractorName }}</span>
              </div>
              
              <div class="col-proj">
                   <span class="readonly-text" :title="item.projectName">{{ item.projectName }}</span>
              </div>

              <div class="col-trash">
                 <button class="delete-btn" @click="askDelete(item)" title="Удалить">
                   <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
        </template>

        <!-- HISTORY LIST -->
        <template v-else>
            <div class="grid-row history-row-short" v-for="wo in filteredItems" :key="wo._id">
                <div class="col-check col-status"><span class="status-dot"></span></div>
                <div class="col-date"><span class="readonly-text">{{ formatDateReadable(wo.date) }}</span></div>
                <div class="col-amount"><span class="amount-text-exp">- {{ formatNumber(Math.abs(wo.amount)) }}</span></div>
                <div class="col-proj"><span class="readonly-text">{{ wo.projectName }}</span></div>
                <div class="col-trash">
                    <button class="delete-btn btn-restore" @click="askDeleteWriteOff(wo)" title="Удалить">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        </template>
      </div>

      <!-- FOOTER -->
      <div class="popup-footer">
        <div class="footer-left-actions">
            <button v-if="activeTab === 'retail'" class="btn-add-new-footer btn-orange-retail" @click="showRetailPopup = true">Внести сумму выполненных работ</button>
            <button v-if="activeTab === 'retail'" class="btn-add-new-footer btn-refund" @click="showRefundPopup = true">Оформить возврат</button>
        </div>
        <div class="footer-actions">
            <button class="btn-close" @click="$emit('close')">Закрыть</button>
        </div>
      </div>
    </div>
    
    <!-- POPUPS -->
    <RetailClosurePopup v-if="showRetailPopup" @close="showRetailPopup = false" @confirm="handleRetailClosure" />
    <RefundPopup v-if="showRefundPopup" :initial-data="{ contractorValue: `ind_${mainStore.retailIndividualId}` }" @close="showRefundPopup = false" @save="handleRefundSave" />
    
    <!-- Close Deal Popup -->
    <div v-if="showCloseConfirm" class="inner-overlay" @click.self="showCloseConfirm = false">
      <div class="delete-confirm-box">
        <h4>Закрытие сделки</h4>
        <p class="confirm-text">
           Формирование Акта выполненных работ.<br>На какую сумму подписан акт?
        </p>
        <div class="input-wrapper">
           <input type="text" v-model="closingAmountInput" class="amount-input-large" @input="onClosingAmountInput" placeholder="Сумма" />
        </div>
        <p class="hint-text" v-if="itemToClose">Максимально: {{ itemToClose.amountFormatted }} ₸</p>
        <div class="delete-actions">
           <button class="btn-cancel" @click="showCloseConfirm = false">Отмена</button>
           <button class="btn-save-confirm" @click="confirmClosePrepayment">Подтвердить</button>
        </div>
      </div>
    </div>

    <!-- Delete Write-off -->
    <ConfirmationPopup v-if="showDeleteWriteOffConfirm" title="Отмена списания" message="Вы уверены? Это вернет сумму долга перед розницей." confirmText="Удалить" @close="showDeleteWriteOffConfirm = false" @confirm="confirmDeleteWriteOff" />
    
    <!-- Delete Operation -->
    <ConfirmationPopup v-if="showDeleteConfirm" title="Удалить операцию?" message="Вы действительно хотите удалить эту операцию? Это действие необратимо." confirmText="Да, удалить" @close="showDeleteConfirm = false" @confirm="confirmDelete" />
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; height: 50vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 95%; max-width: 1300px; border: 1px solid #ddd; }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 24px; color: #111827; font-weight: 700; letter-spacing: -0.02em; }

/* TABS */
.tabs-header { display: flex; gap: 24px; padding: 0 1.5rem; margin-top: 1rem; border-bottom: 1px solid #e5e7eb; }
.tab-btn { background: none; border: none; border-bottom: 3px solid transparent; font-size: 15px; font-weight: 600; color: #6b7280; padding: 12px 0; cursor: pointer; transition: all 0.2s; }
.tab-btn.active { color: #111827 ; border-color: #111827 ; }
.tab-btn:hover { color: #374151; }

/* SUMMARY */
.summary-bar { display: flex; align-items: center; gap: 15px; padding: 15px 24px; background-color: #fff; border-bottom: 1px solid #eee; font-size: 15px; color: #333; }
.sum-item { display: flex; gap: 6px; }
.sum-label { color: #666; }
.sum-val { font-weight: 700; }
.sum-sep { color: #ddd; }
.income-text { color: #10b981; }
.warn-text { color: #f59e0b; }

/* GRID LAYOUTS */
.filters-row, .grid-row { display: grid; grid-template-columns: 130px 1fr 1fr 120px 1fr 1fr 50px; gap: 12px; align-items: center; padding: 0 1.5rem; }
.filters-row.with-checkbox, .grid-row.with-checkbox { grid-template-columns: 50px 130px 1fr 1fr 120px 1fr 1fr 50px;  }
.history-row-short, .filters-row.history-mode { grid-template-columns: 50px 150px 150px 1fr 50px !important; }

.filters-row { margin-bottom: 0px; }
.grid-row { padding: 4px 1.5rem; background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; margin-bottom: 6px; transition: box-shadow 0.2s; }
.grid-row:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-color: #ccc; }
.grid-row.is-closed { background-color: #f3f4f6; opacity: 0.8; }
.grid-row.is-closed .edit-input { color: #9ca3af; text-decoration: line-through; background-color: transparent; border-color: transparent; }

/* ELEMENTS */
.status-dot { width: 10px; height: 10px; border-radius: 50%; background-color: #10b981; }
.col-status { display: flex; justify-content: center; align-items: center; }
.text-red { color: #ff3b30 !important; }

.col-check, .col-trash { display: flex; justify-content: left; align-items: center; }
.col-check input { width: 20px; height: 20px; border-radius: 4px; border: 2px solid #d1d5db; cursor: pointer; accent-color: #10b981; }
.spinner-mini { width: 20px; height: 20px; border: 2px solid #e5e7eb; border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; max-height: 55vh; scrollbar-width: none; }
.list-scroll::-webkit-scrollbar { display: none; }

.readonly-text { font-size: 13px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.amount-text-exp { font-weight: 700; color: #ef4444; text-align: right; display: block; width: 100%; }
.amount-display { text-align: right; display: block; font-weight: 700; color: #333; }

.edit-input { width: 100%; height: 28px; background: #FFFFFF; border: 1px solid #ccc; border-radius: 6px; padding: 0 10px; font-size: 13px; color: #333; box-sizing: border-box; display: block; }
.edit-input:focus { outline: none; border-color: #222; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1); }
.filter-input { width: 100%; height: 28px; border: 1px solid #e7e7e7; border-radius: 6px; padding: 0 6px; font-size: 13px; color: #333; box-sizing: border-box; background-color: #fff; }

.filter-select, .select-input { -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }

.amount-input { text-align: right; font-weight: 700; color: #333; }

.delete-btn { width: 28px; height: 28px; border: 1px solid #E0E0E0; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.delete-btn svg { width: 14px; height: 14px; stroke: #999; }
.delete-btn:hover { border-color: #FF3B30; background: #FFF5F5; }
.delete-btn:hover svg { stroke: #FF3B30; }

/* FOOTER BUTTONS */
.popup-footer { padding: 1.5rem; border-top: 1px solid #E0E0E0; display: flex; justify-content: space-between; align-items: center; background-color: #F9F9F9; border-radius: 0 0 12px 12px; }
.footer-left-actions { display: flex; gap: 10px; }
.footer-actions { display: flex; gap: 10px; }

.btn-add-new-footer { padding: 0 16px; height: 28px; border: 1px solid transparent; border-radius: 6px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.btn-orange-retail { background-color: #111827 !important; color: white; }
.btn-orange-retail:hover { background-color: #d97706 !important; }
.btn-refund { background-color: #111827  !important; color: white; margin-left: 10px; }
.btn-refund:hover { background-color: #be70df !important; }

.btn-save { padding: 0 16px; height: 28px; background: #111827; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.btn-save:hover { background: #374151; }
.btn-close { padding: 0 16px; height: 28px; background: white; border: 1px solid #d1d5db; color: #374151; border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.btn-close:hover { background: #f3f4f6; }

.empty-state { text-align: center; padding: 4rem; color: #9ca3af; font-style: italic; }

/* MODALS */
.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 1210; }
.delete-confirm-box { background: #fff; padding: 24px; border-radius: 12px; width: 320px; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.2); }
.delete-confirm-box h4 { margin: 0 0 10px; color: #222; font-size: 18px; font-weight: 600; }
.confirm-text { font-size: 14px; margin-bottom: 20px; color: #555; line-height: 1.5; }
.delete-actions { display: flex; gap: 10px; justify-content: center; }
.btn-cancel { background: #e0e0e0; color: #333; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 500; }
.btn-cancel:hover { background: #d1d1d1; }
.btn-delete-confirm { background: #ff3b30; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; }

.input-wrapper { margin-bottom: 15px; }
.amount-input-large { width: 100%; font-size: 24px; font-weight: 700; padding: 10px; border: 1px solid #ddd; border-radius: 8px; outline: none; text-align: center; background: #ffffff; color: #000000; box-sizing: border-box; }
.amount-input-large:focus { border-color: #10b981; }
.hint-text { font-size: 13px; color: #888; margin-bottom: 20px; }
.btn-save-confirm { background: #10b981; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-save-confirm:hover { background: #059669; }
</style>