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
const activeTab = ref('clients'); // 'clients' (Сделки) | 'retail' (Розница)

const localItems = ref([]);
const processingItems = ref(new Set());

// --- STATES ---
const showCloseConfirm = ref(false);
const itemToClose = ref(null);
const closingAmountInput = ref('');
const maxClosingAmount = ref(0);

// Retail
const showRetailPopup = ref(false);

// Delete States
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const isDeleting = ref(false);

// Filters
const filters = ref({
  dateRange: { from: null, to: null },
  contractorValue: '',
  project: ''
});

// DATA SOURCES
const projects = computed(() => mainStore.projects);
const contractors = computed(() => mainStore.contractors);

// Хелперы
const formatDateReadable = (dateVal) => {
  if (!dateVal) return '-';
  return new Date(dateVal).toLocaleDateString('ru-RU');
};
const formatTotal = (val) => `${formatNumber(Math.abs(val))} ₸`;

// Загрузка данных
const loadOperations = () => {
  const allOps = mainStore.allOperationsFlat;
  
  // 1. СДЕЛКИ (CLIENTS)
  // Ищем Доходы, где totalDealAmount > 0
  const dealOps = allOps.filter(op => {
      if (op.type !== 'income') return false;
      return (op.totalDealAmount || 0) > 0;
  });

  // 2. ИСТОРИЯ РОЗНИЦЫ (RETAIL ADJUSTMENTS)
  // Ищем Расходы без счета, привязанные к "Розничные клиенты"
  const retailWriteOffs = mainStore.getRetailWriteOffs;

  // Предварительно собираем map доходов розницы по проектам для обогащения истории
  const retailIncomesByProject = new Map();
  const retailIndId = mainStore.retailIndividualId;
  
  if (retailIndId) {
      allOps.forEach(op => {
          if (op.type === 'income' && (op.counterpartyIndividualId?._id === retailIndId || op.counterpartyIndividualId === retailIndId)) {
              const pId = op.projectId?._id || op.projectId;
              if (pId) {
                  if (!retailIncomesByProject.has(pId)) retailIncomesByProject.set(pId, []);
                  retailIncomesByProject.get(pId).push(op);
              }
          }
      });
  }

  // Собираем единый список для отображения
  const combined = [];

  // Мапим Сделки
  dealOps.forEach(op => {
      const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
      if (indId === mainStore.retailIndividualId) return;

      const total = op.totalDealAmount || 0;
      const paid = op.amount || 0;
      const debt = total - paid; 
      
      combined.push({
          _id: op._id,
          originalOp: op,
          type: 'deal',
          date: op.date,
          contractorName: op.contractorId?.name || op.counterpartyIndividualId?.name || '---',
          projectName: op.projectId?.name || '---',
          amount: paid, 
          amountFormatted: formatNumber(paid),
          totalDeal: total,
          totalDealFormatted: formatNumber(total),
          debt: debt > 0 ? debt : 0,
          isClosed: !!op.isClosed,
          projectId: op.projectId?._id || op.projectId,
          contractorValue: op.contractorId ? `contr_${op.contractorId._id || op.contractorId}` : `ind_${indId}`
      });
  });

  // Мапим Розницу (История корректировок)
  retailWriteOffs.forEach(op => {
      const pId = op.projectId?._id || op.projectId;
      const relatedIncomes = pId ? (retailIncomesByProject.get(pId) || []) : [];
      
      // Вычисляем данные "сделки" на основе проекта
      let totalDealSum = 0;
      let totalReceivedSum = 0;
      let firstIncomeDate = null;
      let accountName = '-';
      let companyName = '-';
      let contractorName = 'Розничный клиент';

      if (relatedIncomes.length > 0) {
          // Сортируем по дате
          relatedIncomes.sort((a,b) => new Date(a.date) - new Date(b.date));
          firstIncomeDate = relatedIncomes[0].date;
          
          // Берем реквизиты из первого платежа
          const first = relatedIncomes[0];
          accountName = first.accountId?.name || '-';
          companyName = first.companyId?.name || first.individualId?.name || '-';
          
          relatedIncomes.forEach(inc => {
              totalReceivedSum += (inc.amount || 0);
              totalDealSum += (inc.totalDealAmount || 0);
          });
      }
      
      // Если сделка не задана явно в доходах, считаем, что "Общая сумма" = "Получено" (или как-то иначе, но по ТЗ нужны эти поля)
      // Если totalDealSum 0, то долг считаем 0
      const debt = Math.max(0, totalDealSum - totalReceivedSum);

      combined.push({
          _id: op._id,
          originalOp: op,
          type: 'retail_adj',
          date: op.date, // Дата корректировки
          
          // Данные для расширенной строки истории
          incomeDate: firstIncomeDate,
          accountName: accountName,
          companyName: companyName,
          contractorName: contractorName,
          
          projectName: op.projectId?.name || '---',
          amount: Math.abs(op.amount), // Сумма списания
          amountFormatted: formatNumber(Math.abs(op.amount)),
          
          // Агрегированные данные по проекту
          projectReceived: totalReceivedSum,
          projectReceivedFormatted: formatNumber(totalReceivedSum),
          projectTotalDeal: totalDealSum,
          projectTotalDealFormatted: formatNumber(totalDealSum),
          projectDebt: debt,
          projectDebtFormatted: formatNumber(debt),

          description: op.description || 'Корректировка',
          projectId: op.projectId?._id || op.projectId,
          isClosed: true
      });
  });

  localItems.value = combined.sort((a, b) => new Date(b.date) - new Date(a.date));
};

onMounted(() => { 
    if (props.initialTab && ['clients', 'retail'].includes(props.initialTab)) {
        activeTab.value = props.initialTab;
    }
    loadOperations(); 
});

watch(() => mainStore.allOperationsFlat, loadOperations, { deep: true });

// COMPUTED LISTS
const filteredItems = computed(() => {
  let list = [];
  if (activeTab.value === 'clients') {
      list = localItems.value.filter(i => i.type === 'deal');
  } else {
      list = localItems.value.filter(i => i.type === 'retail_adj');
  }

  return list.filter(item => {
    const { from, to } = filters.value.dateRange;
    const itemDate = new Date(item.date).toISOString().slice(0, 10);
    if (from && itemDate < from) return false;
    if (to && itemDate > to) return false;

    if (filters.value.project && item.projectId !== filters.value.project) return false;
    if (activeTab.value === 'clients' && filters.value.contractorValue && item.contractorValue !== filters.value.contractorValue) return false;

    return true;
  });
});

// Опции для фильтра
const contractorOptions = computed(() => {
    return mainStore.contractors.map(c => ({ value: `contr_${c._id}`, label: c.name }));
});

// SUMMARIES
const clientsSummary = computed(() => {
    let totalPrepayment = 0;
    let totalDeals = 0;
    filteredItems.value.forEach(i => {
        totalPrepayment += i.amount;
        totalDeals += i.totalDeal;
    });
    const debt = totalDeals - totalPrepayment;
    return { received: formatTotal(totalPrepayment), debt: formatTotal(debt > 0 ? debt : 0) };
});

const retailSummary = computed(() => {
    // 1. Общая сумма сделок (Total Deal) по всем розничным операциям
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

const onClosingAmountInput = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    closingAmountInput.value = formatNumber(raw);
};

const confirmCloseDeal = async () => {
    if (!itemToClose.value) return;
    const item = itemToClose.value;
    const amountVal = parseFloat(closingAmountInput.value.replace(/\s/g, ''));
    
    if (!amountVal || amountVal <= 0) {
        alert("Введите сумму акта"); return;
    }

    showCloseConfirm.value = false;
    processingItems.value.add(item._id);
    
    try {
        await mainStore.closePrepaymentDeal(item.originalOp, amountVal);
        await mainStore.fetchAllEntities();
        loadOperations();
    } catch (e) { 
        alert('Ошибка: ' + e.message);
    } finally { 
        processingItems.value.delete(item._id); 
        itemToClose.value = null; 
    }
};

const handleRetailClosure = async (payload) => {
    try {
        await mainStore.closeRetailDaily(payload.amount, new Date(payload.date), payload.projectId);
        showRetailPopup.value = false;
        await mainStore.fetchAllEntities();
        loadOperations();
    } catch (e) { alert('Ошибка: ' + e.message); }
};

const askDelete = (item) => { itemToDelete.value = item; showDeleteConfirm.value = true; };
const confirmDelete = async () => { 
    if (!itemToDelete.value) return; 
    isDeleting.value = true; 
    try { 
        await mainStore.deleteOperation(itemToDelete.value.originalOp); 
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
      </div>
      
      <!-- STATS PANELS -->
      <div class="summary-bar" v-if="activeTab === 'clients'">
          <div class="sum-item"><span class="sum-label">Внесено авансов:</span><span class="sum-val income-text">{{ clientsSummary.received }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Нам должны еще:</span><span class="sum-val warn-text">{{ clientsSummary.debt }}</span></div>
      </div>

      <div class="summary-bar" v-if="activeTab === 'retail'">
          <div class="sum-item"><span class="sum-label">Общая сумма по предоплатам:</span><span class="sum-val">{{ retailSummary.totalDeal }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Внесено предоплат на сумму:</span><span class="sum-val income-text">{{ retailSummary.received }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Нам должны еще:</span><span class="sum-val warn-text">{{ retailSummary.debt }}</span></div>
          <div class="sum-sep">|</div>
          <button class="btn-small-action" @click="showRetailPopup = true">Внести корректировку</button>
      </div>

      <!-- FILTERS -->
      <div class="filters-row">
        <div class="filter-col col-date"><DateRangePicker v-model="filters.dateRange" placeholder="Период" /></div>
        
        <div class="filter-col col-contr" v-if="activeTab === 'clients'">
             <select v-model="filters.contractorValue" class="filter-input filter-select">
                 <option value="">Контрагент</option>
                 <option v-for="c in contractorOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
             </select>
        </div>
        <div class="filter-col col-proj"><select v-model="filters.project" class="filter-input filter-select"><option value="">Проект</option><option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option></select></div>
        <div class="filter-col"></div>
      </div>
      
      <!-- LIST -->
      <div class="list-scroll">
        <div v-if="filteredItems.length === 0" class="empty-state">Нет записей.</div>
        
        <!-- CLIENTS LIST (DEALS) -->
        <template v-if="activeTab === 'clients'">
            <div class="list-header-row deals-grid">
                <span>Дата</span><span>Контрагент</span><span>Проект</span><span>Аванс</span><span>Долг клиента</span><span>Статус</span>
            </div>
            <div v-for="item in filteredItems" :key="item._id" class="grid-row deals-grid" :class="{ 'row-closed': item.isClosed }">
              <div class="col-date">{{ formatDateReadable(item.date) }}</div>
              <div class="col-contr" :title="item.contractorName">{{ item.contractorName }}</div>
              <div class="col-proj" :title="item.projectName">{{ item.projectName }}</div>
              <div class="col-amount income-text">+ {{ item.amountFormatted }} ₸</div>
              <div class="col-debt warn-text">{{ formatNumber(item.debt) }} ₸</div>
              
              <div class="col-status">
                  <button v-if="!item.isClosed" class="btn-close-deal" @click="initiateCloseDeal(item)" title="Закрыть сделку (Акт)">
                      Закрыть
                  </button>
                  <span v-else class="status-closed">Закрыто</span>
              </div>
            </div>
        </template>

        <!-- RETAIL LIST (HISTORY) -->
        <template v-else>
            <!-- Детальная таблица истории -->
            <div class="list-header-row retail-history-grid">
                <span>Статус</span>
                <span>Поступление</span>
                <span>Предоплата</span>
                <span>Счет</span>
                <span>Компания</span>
                <span>Контрагент</span>
                <span>Проект</span>
                <span>Долг</span>
                <span>Сделка</span>
                <span>Корректировка</span>
                <span></span>
            </div>
            <div v-for="item in filteredItems" :key="item._id" class="grid-row retail-history-grid">
                <div class="col-status-text">Исплн.</div>
                <div class="col-date">{{ formatDateReadable(item.incomeDate) }}</div>
                
                <!-- Сумма предоплаты (Показываем сколько всего внесено по проекту, или прочерк) -->
                <div class="col-amount income-text" :title="'Всего по проекту'">
                    {{ item.projectReceived ? item.projectReceivedFormatted + ' ₸' : '-' }}
                </div>
                
                <div class="col-text" :title="item.accountName">{{ item.accountName }}</div>
                <div class="col-text" :title="item.companyName">{{ item.companyName }}</div>
                <div class="col-text" :title="item.contractorName">{{ item.contractorName }}</div>
                <div class="col-text" :title="item.projectName">{{ item.projectName }}</div>
                
                <div class="col-debt warn-text">{{ item.projectDebtFormatted }} ₸</div>
                <div class="col-total-deal">{{ item.projectTotalDeal ? item.projectTotalDealFormatted + ' ₸' : '-' }}</div>
                
                <div class="col-date">{{ formatDateReadable(item.date) }}</div>

                <div class="col-trash">
                     <button class="delete-btn" @click="askDelete(item)" title="Удалить">
                       <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        </template>
      </div>

      <div class="popup-footer">
        <button class="btn-close" @click="$emit('close')">Закрыть</button>
      </div>
    </div>
    
    <!-- POPUPS -->
    <RetailClosurePopup v-if="showRetailPopup" @close="showRetailPopup = false" @confirm="handleRetailClosure" />
    
    <div v-if="showCloseConfirm" class="inner-overlay" @click.self="showCloseConfirm = false">
      <div class="delete-confirm-box">
        <h4>Закрытие сделки</h4>
        <p class="confirm-text">На какую сумму подписан акт выполненных работ?</p>
        <div class="input-wrapper">
           <input type="text" v-model="closingAmountInput" class="amount-input-large" @input="onClosingAmountInput" />
        </div>
        <div class="delete-actions">
           <button class="btn-cancel" @click="showCloseConfirm = false">Отмена</button>
           <button class="btn-save-confirm" @click="confirmCloseDeal">Подтвердить</button>
        </div>
      </div>
    </div>

    <ConfirmationPopup v-if="showDeleteConfirm" title="Удалить запись?" message="Вы уверены?" confirmText="Да, удалить" @close="showDeleteConfirm = false" @confirm="confirmDelete" />
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; height: 65vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 98%; max-width: 1600px; border: 1px solid #ddd; }
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

.btn-small-action { padding: 6px 12px; background: #333; color: #fff; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; }
.btn-small-action:hover { background: #555; }

.filters-row { display: flex; gap: 12px; padding: 10px 1.5rem; align-items: center; background: #f9f9f9; border-bottom: 1px solid #eee; }
.filter-input { height: 32px; padding: 0 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; background: #fff; }

.list-scroll { flex-grow: 1; overflow-y: auto; padding: 0 1.5rem 1rem; scrollbar-width: none; }
.list-scroll::-webkit-scrollbar { display: none; }

.list-header-row { display: grid; font-size: 11px; font-weight: 600; color: #888; padding: 8px 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #eee; }
.grid-row { display: grid; align-items: center; padding: 10px 12px; background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; margin-bottom: 6px; font-size: 12px; color: #333; }
.grid-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.row-closed { opacity: 0.6; background-color: #f3f4f6; }

/* GRID CONFIGS */
.deals-grid { grid-template-columns: 100px 150px 150px 120px 120px 100px; gap: 10px; }

/* 🟢 NEW RETAIL GRID (11 columns) */
.retail-history-grid { 
    grid-template-columns: 50px 100px 120px 100px 100px 100px 120px 120px 120px 100px 40px; 
    gap: 8px;
    align-items: center;
}

.col-date { color: #555; white-space: nowrap; }
.col-status-text { color: #888; font-weight: 600; font-size: 10px; }
.col-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-amount, .col-debt, .col-total-deal { font-weight: 700; text-align: right; }

.btn-close-deal { padding: 4px 8px; background: #10b981; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; }
.btn-close-deal:hover { background: #059669; }
.status-closed { font-size: 11px; color: #999; font-weight: 600; border: 1px solid #ddd; padding: 2px 6px; border-radius: 4px; }

.delete-btn { width: 28px; height: 28px; border: 1px solid #eee; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.delete-btn svg { width: 14px; stroke: #999; }
.delete-btn:hover { border-color: #ff3b30; }
.delete-btn:hover svg { stroke: #ff3b30; }

.popup-footer { padding: 1.5rem; border-top: 1px solid #eee; display: flex; justify-content: flex-end; background: #f9f9f9; border-radius: 0 0 12px 12px; }
.btn-close { padding: 8px 16px; background: white; border: 1px solid #ccc; border-radius: 6px; cursor: pointer; font-weight: 500; color: #333; }

/* Confirm Box */
.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 10; }
.delete-confirm-box { background: #fff; padding: 24px; border-radius: 12px; width: 300px; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.2); }
.delete-confirm-box h4 { margin: 0 0 10px; font-size: 18px; font-weight: 600; }
.confirm-text { font-size: 14px; margin-bottom: 20px; color: #555; }
.amount-input-large { width: 100%; font-size: 20px; font-weight: 700; padding: 10px; border: 1px solid #ddd; border-radius: 8px; text-align: center; box-sizing: border-box; margin-bottom: 15px; }
.delete-actions { display: flex; gap: 10px; justify-content: center; }
.btn-cancel { background: #e0e0e0; color: #333; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
.btn-save-confirm { background: #10b981; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
</style>