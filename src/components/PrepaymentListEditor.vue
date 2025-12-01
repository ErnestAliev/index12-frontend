<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

import DateRangePicker from './DateRangePicker.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import RetailClosurePopup from './RetailClosurePopup.vue';

const props = defineProps({
  title: { type: String, default: 'Управление предоплатами' },
  initialTab: { type: String, default: 'clients' } 
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

// TABS
const activeTab = ref('clients'); 

const localItems = ref([]);
const processingItems = ref(new Set());

// STATES
const showCloseConfirm = ref(false);
const itemToClose = ref(null);
const closingAmountInput = ref('');
const maxClosingAmount = ref(0);
const showRetailPopup = ref(false);
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const isDeleting = ref(false);

// FILTERS
const filters = ref({
  dateRange: { from: null, to: null },
  adjustDateRange: { from: null, to: null }, // Для даты корректировки
  status: '',
  account: '',
  company: '',
  contractorValue: '',
  project: '',
  amount: '',
  debt: '' // Для сортировки/фильтрации долга
});

// DATA SOURCES
const projects = computed(() => mainStore.projects);
const contractors = computed(() => mainStore.contractors);
const accounts = computed(() => mainStore.accounts);
const companies = computed(() => mainStore.companies);

// Хелперы
const formatDateReadable = (dateVal) => {
  if (!dateVal) return '-';
  return new Date(dateVal).toLocaleDateString('ru-RU');
};
const formatTotal = (val) => `${formatNumber(Math.abs(val || 0))} ₸`;

// --- ЗАГРУЗКА ДАННЫХ ---
const loadOperations = () => {
  const allOps = mainStore.allOperationsFlat;
  
  // 1. СДЕЛКИ (CLIENTS)
  const dealOps = allOps.filter(op => {
      if (op.type !== 'income') return false;
      return (op.totalDealAmount || 0) > 0;
  });

  // 2. ИСТОРИЯ РОЗНИЦЫ (RETAIL ADJUSTMENTS)
  const retailWriteOffs = mainStore.getRetailWriteOffs;

  // Карта доходов розницы по проектам
  const retailIncomesByProject = new Map();
  const retailIndId = mainStore.retailIndividualId;
  
  if (retailIndId) {
      allOps.forEach(op => {
          const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
          if (op.type === 'income' && indId === retailIndId) {
              const pId = op.projectId?._id || op.projectId;
              if (pId) {
                  if (!retailIncomesByProject.has(pId)) retailIncomesByProject.set(pId, []);
                  retailIncomesByProject.get(pId).push(op);
              }
          }
      });
  }

  const combined = [];

  // --- ОБРАБОТКА: СДЕЛКИ ---
  dealOps.forEach(op => {
      const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
      if (indId === mainStore.retailIndividualId) return; 

      const total = op.totalDealAmount || 0;
      const paid = op.amount || 0;
      const debt = total - paid; 

      // Получаем имена связанных сущностей
      const accName = op.accountId?.name || '-';
      let compName = '-';
      if (op.companyId) compName = op.companyId.name || '-';
      else if (op.individualId) compName = op.individualId.name || '-';
      
      let contrName = '-';
      if (op.contractorId) contrName = op.contractorId.name;
      else if (op.counterpartyIndividualId) contrName = op.counterpartyIndividualId.name;
      
      // ID для фильтрации
      const accId = op.accountId?._id || op.accountId;
      const compId = op.companyId?._id || op.companyId;
      const contrVal = op.contractorId ? `contr_${op.contractorId._id || op.contractorId}` : `ind_${indId}`;
      const projId = op.projectId?._id || op.projectId;

      combined.push({
          _id: op._id,
          originalOp: op,
          type: 'deal',
          
          statusLabel: op.isClosed ? 'Испл' : 'Получ',
          
          date: op.date, 
          adjustDate: op.isClosed ? (op.closingDate || op.updatedAt || new Date()) : null,

          totalDeal: total, 
          amount: paid, 
          amountFormatted: formatNumber(paid),
          
          accountName: accName,
          companyName: compName,
          contractorName: contrName,
          projectName: op.projectId?.name || '---',
          
          debt: debt > 0 ? debt : 0,
          debtFormatted: formatNumber(debt > 0 ? debt : 0),
          
          // IDs for filtering
          accountId: accId,
          companyId: compId,
          contractorValue: contrVal,
          projectId: projId,
          
          isClosed: !!op.isClosed
      });
  });

  // --- ОБРАБОТКА: РОЗНИЦА ---
  retailWriteOffs.forEach(op => {
      const pId = op.projectId?._id || op.projectId;
      const relatedIncomes = pId ? (retailIncomesByProject.get(pId) || []) : [];
      
      let totalDealSum = 0;
      let totalReceivedSum = 0;
      let firstIncomeDate = null;
      let accountName = '-';
      let companyName = '-';
      let contractorName = 'Розничный клиент';

      let accId = null, compId = null;

      if (relatedIncomes.length > 0) {
          relatedIncomes.sort((a,b) => new Date(a.date) - new Date(b.date));
          firstIncomeDate = relatedIncomes[0].date;
          
          const first = relatedIncomes[0];
          accountName = first.accountId?.name || '-';
          accId = first.accountId?._id || first.accountId;
          
          if (first.companyId) { 
              companyName = first.companyId.name || '-'; 
              compId = first.companyId._id || first.companyId;
          }
          else if (first.individualId) { 
              companyName = first.individualId.name || '-';
              compId = first.individualId._id || first.individualId; 
          }
          
          if (first.counterpartyIndividualId) contractorName = first.counterpartyIndividualId.name || contractorName;
          
          relatedIncomes.forEach(inc => {
              totalReceivedSum += (inc.amount || 0);
              totalDealSum += (inc.totalDealAmount || 0);
          });
      }
      
      const debt = Math.max(0, totalDealSum - totalReceivedSum);

      combined.push({
          _id: op._id,
          originalOp: op,
          type: 'retail_adj', 
          
          statusLabel: 'Испл',
          
          date: firstIncomeDate || op.date, 
          adjustDate: op.date, 
          
          totalDeal: totalDealSum,
          amount: totalReceivedSum, 
          amountFormatted: formatNumber(totalReceivedSum), 
          
          accountName: accountName,
          companyName: companyName,
          contractorName: contractorName,
          projectName: op.projectId?.name || '---',
          
          debt: debt,
          debtFormatted: formatNumber(debt),
          
          // IDs for filtering
          accountId: accId,
          companyId: compId,
          projectId: pId,

          isClosed: true
      });
  });

  localItems.value = combined.sort((a, b) => new Date(b.date) - new Date(a.date));
};

onMounted(async () => { 
    await mainStore.fetchAllEntities(); 
    if (props.initialTab && ['clients', 'retail'].includes(props.initialTab)) {
        activeTab.value = props.initialTab;
    }
    loadOperations(); 
});

watch(() => mainStore.allOperationsFlat, loadOperations, { deep: true, immediate: true });

// Сброс фильтров при переключении
watch(activeTab, () => {
    filters.value = {
        dateRange: { from: null, to: null },
        adjustDateRange: { from: null, to: null },
        status: '',
        account: '',
        company: '',
        contractorValue: '',
        project: '',
        amount: '',
        debt: ''
    };
});

// FILTERED LIST
const filteredItems = computed(() => {
  let list = [];
  if (activeTab.value === 'clients') {
      list = localItems.value.filter(i => i.type === 'deal');
  } else {
      list = localItems.value.filter(i => i.type === 'retail_adj');
  }

  // 1. Фильтрация
  let result = list.filter(item => {
    // Дата поступления
    const { from, to } = filters.value.dateRange;
    const itemDateStr = item.date ? new Date(item.date).toISOString().slice(0, 10) : '';
    if (from && (!itemDateStr || itemDateStr < from)) return false;
    if (to && (!itemDateStr || itemDateStr > to)) return false;

    // Дата корректировки
    const { from: adjFrom, to: adjTo } = filters.value.adjustDateRange;
    const adjDateStr = item.adjustDate ? new Date(item.adjustDate).toISOString().slice(0, 10) : '';
    if (adjFrom && (!adjDateStr || adjDateStr < adjFrom)) return false;
    if (adjTo && (!adjDateStr || adjDateStr > adjTo)) return false;

    // Простые фильтры
    if (filters.value.project && item.projectId !== filters.value.project) return false;
    if (filters.value.account && item.accountId !== filters.value.account) return false;
    if (filters.value.company && item.companyId !== filters.value.company) return false;
    
    if (filters.value.amount) {
        const search = filters.value.amount.replace(/\s/g, '');
        if (!item.amountFormatted.replace(/\s/g, '').includes(search)) return false;
    }

    if (activeTab === 'clients' && filters.value.contractorValue && item.contractorValue !== filters.value.contractorValue) return false;
    
    if (filters.value.status && item.statusLabel.toLowerCase() !== filters.value.status.toLowerCase()) return false;

    // Долг: Скрыть 0
    if (filters.value.debt === 'hide_zero') {
        if (item.debt <= 0) return false;
    }

    return true;
  });

  // 2. Сортировка (если выбрана)
  if (filters.value.debt === 'asc') {
      result.sort((a, b) => a.debt - b.debt);
  } else if (filters.value.debt === 'desc') {
      result.sort((a, b) => b.debt - a.debt);
  }

  return result;
});

const contractorOptions = computed(() => mainStore.contractors.map(c => ({ value: `contr_${c._id}`, label: c.name })));

// SUMMARIES
const clientsSummary = computed(() => {
    let totalDeal = 0;
    let totalPrepayment = 0;
    let totalDebt = 0;
    filteredItems.value.forEach(i => {
        totalDeal += (i.totalDeal || 0);
        totalPrepayment += (i.amount || 0);
        totalDebt += (i.debt || 0);
    });
    return { 
        total: formatTotal(totalDeal),
        received: formatTotal(totalPrepayment), 
        debt: formatTotal(totalDebt) 
    };
});

const retailSummary = computed(() => {
    let totalDealSum = 0;
    let totalReceivedSum = 0;
    mainStore.currentIncomes.forEach(op => {
         const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
         if (indId === mainStore.retailIndividualId) {
             totalDealSum += (op.totalDealAmount || 0);
             totalReceivedSum += (op.amount || 0);
         }
    });
    const debt = Math.max(0, totalDealSum - totalReceivedSum);
    
    return { 
        totalDeal: formatTotal(totalDealSum), 
        received: formatTotal(totalReceivedSum), 
        debt: formatTotal(debt) 
    };
});

// ACTIONS
const initiateCloseDeal = (item) => {
    if (item.isClosed) return;
    itemToClose.value = item;
    maxClosingAmount.value = item.amount; 
    closingAmountInput.value = formatNumber(item.amount);
    showCloseConfirm.value = true;
};
const onClosingAmountInput = (e) => { closingAmountInput.value = formatNumber(e.target.value.replace(/[^0-9]/g, '')); };
const confirmCloseDeal = async () => {
    if (!itemToClose.value) return;
    const amountVal = parseFloat(closingAmountInput.value.replace(/\s/g, ''));
    if (!amountVal || amountVal <= 0) { alert("Введите сумму акта"); return; }
    showCloseConfirm.value = false;
    processingItems.value.add(itemToClose.value._id);
    try {
        await mainStore.closePrepaymentDeal(itemToClose.value.originalOp, amountVal);
        await mainStore.fetchAllEntities(); loadOperations();
    } catch (e) { alert('Ошибка: ' + e.message); } 
    finally { processingItems.value.delete(itemToClose.value._id); itemToClose.value = null; }
};
const handleRetailClosure = async (payload) => {
    try {
        await mainStore.closeRetailDaily(payload.amount, new Date(payload.date), payload.projectId);
        showRetailPopup.value = false; await mainStore.fetchAllEntities(); loadOperations();
    } catch (e) { alert('Ошибка: ' + e.message); }
};
const askDelete = (item) => { itemToDelete.value = item; showDeleteConfirm.value = true; };
const confirmDelete = async () => { 
    if (!itemToDelete.value) return; 
    isDeleting.value = true; 
    try { await mainStore.deleteOperation(itemToDelete.value.originalOp); showDeleteConfirm.value = false; } 
    catch (e) { alert(e.message); } finally { isDeleting.value = false; } 
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
      </div>
      
      <!-- STATS: DEALS -->
      <div class="summary-bar" v-if="activeTab === 'clients'">
          <div class="sum-item"><span class="sum-label">Общая сумма по предоплатам:</span><span class="sum-val">{{ clientsSummary.total }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Внесено предоплат на сумму:</span><span class="sum-val income-text">{{ clientsSummary.received }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Нам должны еще:</span><span class="sum-val warn-text">{{ clientsSummary.debt }}</span></div>
      </div>
      
      <!-- STATS: RETAIL -->
      <div class="summary-bar" v-if="activeTab === 'retail'">
          <div class="sum-item"><span class="sum-label">Общая сумма по предоплатам:</span><span class="sum-val">{{ retailSummary.totalDeal }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Внесено предоплат на сумму:</span><span class="sum-val income-text">{{ retailSummary.received }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Нам должны еще:</span><span class="sum-val warn-text">{{ retailSummary.debt }}</span></div>
          <div class="sum-sep">|</div>
          <button class="btn-small-action" @click="showRetailPopup = true">Внести корректировку</button>
      </div>

      <!-- 🟢 ЕДИНАЯ ТАБЛИЦА (UNIFIED GRID) -->
      <div class="table-wrapper">
          
          <!-- ЗАГОЛОВКИ - ОНИ ЖЕ ФИЛЬТРЫ -->
          <div class="list-header-row unified-grid">
              
              <!-- 1. СТАТУС -->
              <div class="header-filter-wrapper">
                  <select v-model="filters.status" class="header-select">
                      <option value="">СТАТУС</option>
                      <option value="Получ">Получ</option>
                      <option value="Испл">Испл</option>
                  </select>
              </div>
              
              <!-- 2. ДАТА ПОСТУПЛЕНИЯ -->
              <div class="header-filter-wrapper">
                  <DateRangePicker v-model="filters.dateRange" placeholder="ДАТА ПОСТУПЛЕНИЯ" class="header-date-picker" />
              </div>
              
              <!-- 3. СУММА ПРЕДОПЛАТЫ -->
              <div class="header-filter-wrapper">
                  <input type="text" v-model="filters.amount" class="header-input" placeholder="СУММА ПРЕДОПЛАТЫ" />
              </div>
              
              <!-- 4. НА СЧЕТ -->
              <div class="header-filter-wrapper">
                  <select v-model="filters.account" class="header-select">
                      <option value="">НА СЧЕТ</option>
                      <option v-for="a in mainStore.accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
                  </select>
              </div>
              
              <!-- 5. МОЕЙ КОМПАНИИ -->
              <div class="header-filter-wrapper">
                  <select v-model="filters.company" class="header-select">
                      <option value="">МОЕЙ КОМПАНИИ</option>
                      <option v-for="c in mainStore.companies" :key="c._id" :value="c._id">{{ c.name }}</option>
                  </select>
              </div>
              
              <!-- 6. ОТ КОНТРАГЕНТА -->
              <div class="header-filter-wrapper">
                  <select v-if="activeTab === 'clients'" v-model="filters.contractorValue" class="header-select">
                      <option value="">ОТ КОНТРАГЕНТА</option>
                      <option v-for="c in contractorOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
                  </select>
                  <select v-else disabled class="header-select disabled">
                      <option>ОТ КОНТРАГЕНТА</option>
                  </select>
              </div>
              
              <!-- 7. ИЗ ПРОЕКТА -->
              <div class="header-filter-wrapper">
                  <select v-model="filters.project" class="header-select">
                      <option value="">ИЗ ПРОЕКТА</option>
                      <option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option>
                  </select>
              </div>
              
              <!-- 8. НАМ ДОЛЖНЫ ЕЩЕ (Сортировка/Фильтр) -->
              <div class="header-filter-wrapper">
                   <select v-model="filters.debt" class="header-select">
                      <option value="">НАМ ДОЛЖНЫ ЕЩЕ</option>
                      <option value="hide_zero">Скрыть 0</option>
                      <option value="desc">По убыванию</option>
                      <option value="asc">По возрастанию</option>
                  </select>
              </div>
              
              <!-- 9. ДАТА ЗАКРЫТИЯ / КОРРЕКТИРОВКИ -->
              <div class="header-filter-wrapper">
                   <DateRangePicker 
                      v-model="filters.adjustDateRange" 
                      :placeholder="activeTab === 'clients' ? 'ДАТА ЗАКРЫТИЯ' : 'ДАТА КОРРЕКТИРОВКИ'" 
                      class="header-date-picker" 
                   />
              </div>
              
              <!-- 10. КНОПКА (ПУСТО) -->
              <div></div>

          </div>

          <!-- Список (Rows 3+) -->
          <div class="list-scroll">
            <div v-if="filteredItems.length === 0" class="empty-state">Нет записей.</div>
            
            <div v-for="item in filteredItems" :key="item._id" class="grid-row unified-grid" :class="{ 'row-closed': item.isClosed }">
              <!-- 1. Статус -->
              <div class="col-status-text">{{ item.statusLabel }}</div>
              
              <!-- 2. Дата поступления -->
              <div class="col-date">{{ formatDateReadable(item.date) }}</div>
              
              <!-- 3. Сумма предоплаты -->
              <div class="col-amount income-text">+ {{ item.amountFormatted }} ₸</div>
              
              <!-- 4. На счет -->
              <div class="col-text" :title="item.accountName">{{ item.accountName }}</div>
              
              <!-- 5. Моей компании -->
              <div class="col-text" :title="item.companyName">{{ item.companyName }}</div>
              
              <!-- 6. От контрагента -->
              <div class="col-text" :title="item.contractorName">{{ item.contractorName }}</div>
              
              <!-- 7. Из проекта -->
              <div class="col-text" :title="item.projectName">{{ item.projectName }}</div>
              
              <!-- 8. Нам должны еще -->
              <div class="col-debt warn-text">{{ item.debtFormatted }} ₸</div>
              
              <!-- 9. Дата закрытия / корректировки -->
              <div class="col-date">{{ item.adjustDate ? formatDateReadable(item.adjustDate) : '-' }}</div>
              
              <!-- 10. Кнопка -->
              <div class="col-actions">
                  <div v-if="activeTab === 'clients'">
                      <button v-if="!item.isClosed" class="btn-close-deal" @click="initiateCloseDeal(item)" title="Закрыть сделку">Закрыть</button>
                      <span v-else class="status-icon-check">✓</span>
                  </div>
                  <div v-if="activeTab === 'retail'">
                      <button class="delete-btn" @click="askDelete(item)" title="Удалить">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                  </div>
              </div>
            </div>
          </div>
      </div>

      <div class="popup-footer">
        <button class="btn-close" @click="$emit('close')">Закрыть</button>
      </div>
    </div>
    
    <RetailClosurePopup v-if="showRetailPopup" @close="showRetailPopup = false" @confirm="handleRetailClosure" />
    <div v-if="showCloseConfirm" class="inner-overlay" @click.self="showCloseConfirm = false">
      <div class="delete-confirm-box">
        <h4>Закрытие сделки</h4>
        <p class="confirm-text">На какую сумму подписан акт выполненных работ?</p>
        <div class="input-wrapper"><input type="text" v-model="closingAmountInput" class="amount-input-large" @input="onClosingAmountInput" /></div>
        <div class="delete-actions"><button class="btn-cancel" @click="showCloseConfirm = false">Отмена</button><button class="btn-save-confirm" @click="confirmCloseDeal">Подтвердить</button></div>
      </div>
    </div>
    <ConfirmationPopup v-if="showDeleteConfirm" title="Удалить запись?" message="Вы уверены?" confirmText="Да, удалить" @close="showDeleteConfirm = false" @confirm="confirmDelete" />
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; height: 50vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 75%; max-width: 1800px; border: 1px solid #ddd; }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 24px; color: #111827; font-weight: 700; }

.tabs-header { display: flex; gap: 24px; padding: 0 1.5rem; margin-top: 1rem; border-bottom: 1px solid #e5e7eb; }
.tab-btn { background: none; border: none; border-bottom: 3px solid transparent; font-size: 15px; font-weight: 600; color: #6b7280; padding: 12px 0; cursor: pointer; transition: all 0.2s; }
.tab-btn.active { color: #111827 ; border-color: #111827 ; }
.tab-btn:hover { color: #374151; }

.summary-bar { display: flex; align-items: center; gap: 15px; padding: 15px 24px; background-color: #fff; border-bottom: 1px solid #eee; font-size: 15px; color: #333; flex-wrap: wrap;}
.sum-item { display: flex; gap: 6px; }
.sum-label { color: #666; }
.sum-val { font-weight: 700; }
.sum-sep { color: #ddd; }
.income-text { color: #10b981; }
.warn-text { color: #f59e0b; }
.expense-text { color: #ef4444; }
.btn-small-action { padding: 6px 12px; background: #333; color: #fff; border-radius: 6px; border: none; cursor: pointer; font-size: 10px; font-weight: 600; }
.btn-small-action:hover { background: #555; }

/* LAYOUT WRAPPER FOR TABLE */
.table-wrapper { flex-grow: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

/* LIST HEADER AS FILTERS */
.list-header-row { 
    padding: 0 12px; 
    height: 44px; /* Фиксируем высоту хедера */
    background: #fff; 
    position: sticky; 
    top: 0; 
    z-index: 10; 
    border-bottom: 1px solid #eee; 
    display: grid; /* Важно, чтобы работал unified-grid */
    align-items: center;
}

.empty-state { padding: 20px; text-align: center; color: #777; font-size: 14px; }
/* Header Inputs Styling */
.header-filter-wrapper { 
    width: 100%; 
    height: 100%;
    display: flex; 
    align-items: center;
}

/* Общие стили для инпутов в хедере */
.header-select, .header-input, :deep(.date-picker-input) {
    width: 100%;
    border: 1px solid transparent; /* Прозрачная граница по умолчанию для чистоты */
    border-radius: 4px;
    padding: 0 4px; 
    font-size: 10px; 
    font-weight: 700;
    color: #4B5563;
    background: transparent;
    height: 28px;
    box-sizing: border-box;
    outline: none;
    transition: all 0.2s;
    text-transform: uppercase;
}

/* Добавляем фон и границу при наведении/фокусе для интерактивности */
.header-select:hover, .header-input:hover, :deep(.date-picker-input:hover) {
    background: #f3f4f6;
}
.header-select:focus, .header-input:focus, :deep(.date-picker-input:focus) { 
    border-color: #d1d5db; 
    background: #fff; 
}

/* Стилизация DateRangePicker внутри хедера через deep селектор */
.header-date-picker {
    width: 100%;
}
:deep(.dp__input) {
   border: none !important;
   background: transparent !important;
   font-size: 10px !important;
   font-weight: 700 !important;
   color: #4B5563 !important;
   padding: 0 4px !important;
   height: 28px !important;
   text-transform: uppercase;
   box-shadow: none !important;
}
:deep(.dp__input_icon) {
    display: none; /* Скрываем иконку календаря для экономии места если нужно */
}
:deep(.dp__input:hover) {
   background: #f3f4f6 !important;
}

.header-select {
    -webkit-appearance: none; appearance: none;
    cursor: pointer;
}
.header-select option { text-transform: none; font-weight: normal; color: #333; }
.header-select.disabled { opacity: 0.5; cursor: not-allowed; }

.header-input::placeholder { color: #4B5563; opacity: 1; }
.header-input::-webkit-input-placeholder { color: #4B5563; }

.list-scroll { flex-grow: 1; overflow-x: auto; overflow-y: auto;  scrollbar-width: auto; }
.grid-row { align-items: center; padding: 10px 12px; background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; margin-bottom: 6px; font-size: 12px; color: #333; }
.grid-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.row-closed { opacity: 0.75; background-color: #f8fafc; }

/* --- UNIFIED GRID: 10 COLUMNS --- */
.unified-grid { 
    display: grid; 
    /* Статус | ДатаП | СуммаП | Счет | МояКомп | Контр | Проект | Долг | ДатаК | Кнопка */
    grid-template-columns: 80px 130px 130px 120px 120px 120px 120px 120px 140px 60px; 
    gap: 10px;
    min-width: 1250px;
}

.col-date { color: #555; white-space: nowrap; font-size: 11px; }
.col-status-text { color: #888; font-weight: 600; font-size: 11px; }
.col-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* CHANGED FROM RIGHT TO LEFT */
.col-amount, .col-debt { font-weight: 700; text-align: left; font-variant-numeric: tabular-nums; }
/* CHANGED FROM CENTER TO FLEX-START */
.col-actions { display: flex; justify-content: flex-start; }

.btn-close-deal { padding: 4px 8px; background: #10b981; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; }
.status-icon-check { font-size: 14px; color: #10b981; font-weight: 800; }

.delete-btn { width: 28px; height: 28px; border: 1px solid #eee; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.delete-btn svg { width: 14px; stroke: #999; }
.delete-btn:hover { border-color: #ff3b30; stroke: #ff3b30; }

.popup-footer { padding: 1.5rem; border-top: 1px solid #eee; display: flex; justify-content: flex-end; background: #f9f9f9; border-radius: 0 0 12px 12px; flex-shrink: 0;}
.btn-close { padding: 8px 16px; background: white; border: 1px solid #ccc; border-radius: 6px; cursor: pointer; font-weight: 500; color: #333; }

.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 10; }
.delete-confirm-box { background: #fff; padding: 24px; border-radius: 12px; width: 300px; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.2); }
.delete-confirm-box h4 { margin: 0 0 10px; font-size: 18px; font-weight: 600; }
.confirm-text { font-size: 14px; margin-bottom: 20px; color: #555; }
.amount-input-large { width: 100%; font-size: 20px; font-weight: 700; padding: 10px; border: 1px solid #ddd; border-radius: 8px; text-align: center; box-sizing: border-box; margin-bottom: 15px; }
.delete-actions { display: flex; gap: 10px; justify-content: center; }
.btn-cancel { background: #e0e0e0; color: #333; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
.btn-save-confirm { background: #10b981; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
</style>