<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

import DateRangePicker from './DateRangePicker.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import RetailClosurePopup from './RetailClosurePopup.vue';
import WorkActPopup from './WorkActPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v71.0 - RETAIL NO DATE COL ---
 * * ВЕРСИЯ: 71.0
 * * ДАТА: 2025-12-03
 * * ИСПРАВЛЕНИЯ:
 * 1. (UI) Убрана колонка "Дата Акта" для вкладки "Предоплаты по розничным клиентам".
 * 2. (CSS) Добавлен динамический класс сетки для перестройки колонок.
 */

const props = defineProps({
  title: { type: String, default: 'Управление предоплатами' },
  initialTab: { type: String, default: 'clients' } 
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

// TABS
const activeTab = ref(props.initialTab || 'clients'); 

// 🟢 COMPUTED: Показывать ли колонку "Дата Акта"
const showActDateColumn = computed(() => {
    // Скрываем только для активной розницы (авансов), так как там дата корректировки не имеет смысла (она еще не создана)
    // Для истории (history_retail) дата корректировки важна, там оставляем?
    // User asked: "Предоплаты по розничным клиентам колонка - дата акта лишняя". This refers to 'retail' tab.
    return activeTab.value !== 'retail';
});

const localItems = ref([]);
const processingItems = ref(new Set());

// STATES
const itemToClose = ref(null);
const showWorkActPopup = ref(false);
const showRetailPopup = ref(false);
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const isDeleting = ref(false);

// FILTERS
const filters = ref({
  dateRange: { from: null, to: null },
  adjustDateRange: { from: null, to: null }, // Фильтр Даты Акта
  status: '',
  totalDeal: '', 
  amount: '',
  debt: '',
  account: '',
  company: '',
  contractorValue: '',
  project: '',
  category: '' 
});

// DATA SOURCES
const projects = computed(() => mainStore.projects);
const contractors = computed(() => mainStore.contractors);
const accounts = computed(() => mainStore.accounts);
const companies = computed(() => mainStore.companies);
const categories = computed(() => mainStore.categories); 

const formatDateReadable = (dateVal) => dateVal ? new Date(dateVal).toLocaleDateString('ru-RU') : '-';
const formatTotal = (val) => `${formatNumber(Math.abs(val || 0))} ₸`;

// LOAD DATA
const loadOperations = () => {
  const combined = [];
  const retailIndId = mainStore.retailIndividualId;
  
  // --- 1. B2B (Clients) ---
  const sourceOps = mainStore.dealOperations.length > 0 ? mainStore.dealOperations : mainStore.allOperationsFlat;
  const dealOps = sourceOps.filter(op => op.type === 'income' && ((op.totalDealAmount || 0) > 0 || op.isDealTranche));
  
  // Сортировка
  dealOps.sort((a, b) => new Date(a.date) - new Date(b.date));

  const dealsState = new Map();

  dealOps.forEach(op => {
      const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
      if (retailIndId && String(indId) === String(retailIndId)) return; // Skip retail

      const p = op.projectId?._id || op.projectId || 'noproj';
      const c = op.categoryId?._id || op.categoryId || 'nocat';
      const contrId = op.contractorId ? (op.contractorId._id || op.contractorId) : (op.counterpartyIndividualId?._id || op.counterpartyIndividualId || 'nocontr');
      const dealKey = `${p}_${c}_${contrId}`;

      if (!dealsState.has(dealKey)) dealsState.set(dealKey, { budget: 0, paid: 0 });
      const state = dealsState.get(dealKey);

      if ((op.totalDealAmount || 0) > 0) state.budget = op.totalDealAmount;
      state.paid += (op.amount || 0);

      const actDate = op.isClosed ? (op.closingDate || op.updatedAt || op.date) : null;

      combined.push({
          _id: op._id, originalOp: op, type: 'deal',
          statusLabel: op.isDealTranche ? (op.isClosed ? 'Отраб' : 'Транш') : (op.isClosed ? 'Испл' : 'Получ'),
          date: op.date, 
          adjustDate: actDate, 
          totalDeal: state.budget, totalDealFormatted: formatNumber(state.budget),
          amount: op.amount || 0, amountFormatted: formatNumber(op.amount || 0),
          accountName: op.accountId?.name || '-',
          companyName: op.companyId?.name || op.individualId?.name || '-',
          contractorName: op.contractorId?.name || op.counterpartyIndividualId?.name || '-',
          projectName: op.projectId?.name || '---',
          categoryName: op.categoryId?.name || '-',
          debt: Math.max(0, state.budget - state.paid),
          debtFormatted: formatNumber(Math.max(0, state.budget - state.paid)),
          accountId: op.accountId?._id || op.accountId,
          companyId: op.companyId?._id || op.companyId,
          contractorValue: op.contractorId ? `contr_${op.contractorId._id || op.contractorId}` : `ind_${indId}`,
          projectId: op.projectId?._id || op.projectId,
          categoryId: op.categoryId?._id || op.categoryId,
          isClosed: !!op.isClosed
      });
  });

  // --- 2. RETAIL ---
  if (retailIndId) {
      const projectMap = new Map(); 

      mainStore.allOperationsFlat.forEach(op => {
          const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
          if (String(indId) !== String(retailIndId)) return;

          const pId = op.projectId?._id || op.projectId;
          const pKey = pId || 'no_proj';
          const pName = op.projectId?.name || 'Без проекта';

          if (!projectMap.has(pKey)) {
              projectMap.set(pKey, { 
                  projectId: pId, 
                  projectName: pName, 
                  incomes: [], 
                  expenses: [],
                  totalIn: 0, 
                  totalOut: 0,
                  accountName: '-', 
                  companyName: '-', 
                  categoryName: '-',
                  companyId: null,
                  categoryId: null
              });
          }
          const group = projectMap.get(pKey);

          if (op.type === 'income') {
              if (op.isClosed === true) return;

              group.incomes.push(op);
              group.totalIn += (op.amount || 0);
              
              if (group.accountName === '-') group.accountName = op.accountId?.name || '-';
              if (group.companyName === '-') group.companyName = op.companyId?.name || op.individualId?.name || '-';
              if (group.categoryName === '-') group.categoryName = op.categoryId?.name || '-';
              if (!group.companyId) group.companyId = op.companyId?._id || op.companyId;
              if (!group.categoryId) group.categoryId = op.categoryId?._id || op.categoryId;

          } else if (op.type === 'expense' && !op.accountId) {
              group.expenses.push(op);
              group.totalOut += Math.abs(op.amount || 0);
              
              if (group.companyName === '-' && op.companyId) {
                   const cId = op.companyId._id || op.companyId; 
                   const comp = mainStore.companies.find(c => c._id === cId);
                   if (comp) group.companyName = comp.name;
                   group.companyId = cId;
              }
          }
      });

      projectMap.forEach(group => {
          const debt = Math.max(0, group.totalIn - group.totalOut);

          // A. Активные предоплаты
          if (debt > 0) {
              combined.push({
                  _id: `retail_${group.projectId || 'noproj'}`, 
                  originalOp: group.incomes[0] || {}, 
                  type: 'retail_adj',
                  statusLabel: 'Аванс', 
                  date: group.incomes[0]?.date || new Date(), 
                  adjustDate: null,
                  
                  totalDeal: group.totalIn, 
                  totalDealFormatted: formatNumber(group.totalIn),
                  
                  amount: group.totalOut, 
                  amountFormatted: formatNumber(group.totalOut),
                  
                  debt: debt, 
                  debtFormatted: formatNumber(debt),
                  
                  projectName: group.projectName, 
                  contractorName: 'Розничные клиенты',
                  accountName: group.accountName, 
                  companyName: group.companyName,
                  categoryName: group.categoryName,
                  
                  projectId: group.projectId, 
                  categoryId: group.categoryId,
                  companyId: group.companyId,
                  
                  isClosed: false
              });
          }

          // B. История
          group.expenses.forEach(op => {
              combined.push({
                  _id: op._id, 
                  originalOp: op, 
                  type: 'history_retail',
                  statusLabel: 'Спис', 
                  date: op.date, 
                  adjustDate: op.date,
                  
                  totalDeal: group.totalIn, 
                  totalDealFormatted: formatNumber(group.totalIn),
                  
                  amount: Math.abs(op.amount), 
                  amountFormatted: formatNumber(Math.abs(op.amount)),
                  
                  debt: debt, 
                  debtFormatted: formatNumber(debt),
                  
                  projectName: group.projectName, 
                  contractorName: 'Розничные клиенты',
                  accountName: group.accountName, 
                  companyName: group.companyName, 
                  categoryName: op.categoryId?.name || group.categoryName,
                  
                  projectId: group.projectId, 
                  categoryId: op.categoryId?._id || op.categoryId,
                  companyId: op.companyId?._id || op.companyId,
                  
                  isClosed: true
              });
          });
      });
  }

  localItems.value = combined.sort((a, b) => new Date(b.date) - new Date(a.date));
};

onMounted(async () => { 
    await mainStore.fetchAllEntities(); 
    loadOperations(); 
});

watch(() => mainStore.allOperationsFlat, loadOperations, { deep: true });

// FILTER LOGIC
const filteredItems = computed(() => {
  const list = localItems.value.filter(i => i.type === (activeTab.value === 'clients' ? 'deal' : (activeTab.value === 'retail' ? 'retail_adj' : 'history_retail')));
  
  return list.filter(item => {
    // 1. Дата создания/операции
    const { from, to } = filters.value.dateRange;
    if (from && new Date(item.date) < new Date(from)) return false;
    if (to && new Date(item.date) > new Date(to)) return false;
    
    // 2. Дата Акта / Корректировки
    const { from: adjFrom, to: adjTo } = filters.value.adjustDateRange;
    if (adjFrom || adjTo) {
        if (!item.adjustDate) return false; 
        if (adjFrom && new Date(item.adjustDate) < new Date(adjFrom)) return false;
        if (adjTo && new Date(item.adjustDate) > new Date(adjTo)) return false;
    }

    if (filters.value.project && item.projectId !== filters.value.project) return false;
    if (filters.value.company && item.companyId !== filters.value.company) return false;
    if (filters.value.account && item.accountName !== filters.value.account) return false; 
    if (filters.value.category && item.categoryId !== filters.value.category) return false;
    
    if (filters.value.contractorValue) {
        if (item.contractorName !== 'Розничные клиенты' && item.contractorValue && item.contractorValue !== filters.value.contractorValue) {
            return false;
        }
    }

    if (filters.value.totalDeal && !item.totalDealFormatted?.includes(filters.value.totalDeal)) return false;
    
    return true;
  });
});

const clientsSummary = computed(() => {
    let totalDeal = 0;
    let totalPrepayment = 0;
    let totalDebt = 0;
    const dealMap = new Map(); 
    
    filteredItems.value.forEach(i => {
       if (i.type !== 'deal') return;
       const catId = i.originalOp.categoryId?._id || i.originalOp.categoryId;
       const key = `${i.projectId}_${i.contractorValue}_${catId}`;
       
       if (!dealMap.has(key)) dealMap.set(key, { budget: 0, paid: 0, maxDate: new Date(0), lastDebt: 0 });
       const d = dealMap.get(key);
       
       if (i.totalDeal > d.budget) d.budget = i.totalDeal; 
       d.paid += i.amount;
       if (new Date(i.date) > d.maxDate) { d.maxDate = new Date(i.date); d.lastDebt = i.debt; }
    });
    
    dealMap.forEach(d => { 
        totalDeal += d.budget; 
        totalPrepayment += d.paid; 
        totalDebt += d.lastDebt; 
    });
    
    return { 
        total: formatTotal(totalDeal), 
        received: formatTotal(totalPrepayment), 
        debt: formatTotal(totalDebt) 
    };
});

const retailSummary = computed(() => {
    let tDeal = 0, tExec = 0, tDebt = 0;
    const activeRetailItems = localItems.value.filter(i => i.type === 'retail_adj');
    activeRetailItems.forEach(i => {
        tDeal += i.totalDeal; tExec += i.amount; tDebt += i.debt;
    });
    return { totalDeal: formatTotal(tDeal), received: formatTotal(tExec), debt: formatTotal(tDebt) };
});

const historySummary = computed(() => {
    const retailId = mainStore.retailIndividualId;
    let totalIn = 0;
    let totalOut = 0;
    
    mainStore.allOperationsFlat.forEach(op => {
        if (String(op.counterpartyIndividualId?._id || op.counterpartyIndividualId) !== String(retailId)) return;
        if (op.type === 'income') {
            if (op.isClosed !== true) totalIn += (op.amount || 0); 
        }
        else if (op.type === 'expense' && !op.accountId) totalOut += Math.abs(op.amount || 0);
    });
    
    return {
        total: formatTotal(totalIn),
        worked: formatTotal(totalOut),
        debt: formatTotal(Math.max(0, totalIn - totalOut))
    };
});

// --- Actions ---
const handleRetailClosure = async (payload) => {
    try {
        const pId = payload.projectId || (payload.projectIds ? payload.projectIds[0] : null);
        await mainStore.closeRetailDaily(payload.amount, new Date(payload.date), pId);
        showRetailPopup.value = false;
    } catch (e) { alert(e.message); }
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

const initiateCloseDeal = (item) => {
    if (item.isClosed) return; 
    itemToClose.value = item;
    showWorkActPopup.value = true;
};

const handleWorkActConfirm = async (payload) => {
    if (!itemToClose.value) return;
    const amountVal = itemToClose.value.amount; 
    const op = itemToClose.value.originalOp;
    showWorkActPopup.value = false;
    processingItems.value.add(itemToClose.value._id);
    try {
        await mainStore.createWorkAct(
            op.projectId?._id || op.projectId,
            op.categoryId?._id || op.categoryId,
            op.contractorId?._id || op.contractorId,
            op.counterpartyIndividualId?._id || op.counterpartyIndividualId,
            amountVal,
            payload.date, 
            op._id 
        );
    } catch (e) { alert('Ошибка: ' + e.message); } 
    finally { processingItems.value.delete(itemToClose.value._id); itemToClose.value = null; }
};

// --- Опции фильтров ---
const accountOptions = computed(() => mainStore.accounts);
const categoryOptions = computed(() => mainStore.categories);
const contractorOptions = computed(() => {
    const opts = [];
    opts.push({ label: 'Контрагенты', options: mainStore.contractors.map(c => ({ value: `contr_${c._id}`, label: c.name })) });
    return opts;
});
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      <div class="popup-header"><h3>{{ title }}</h3></div>

      <div class="tabs-header">
          <button class="tab-btn" :class="{ active: activeTab === 'clients' }" @click="activeTab = 'clients'">Предоплаты по сделкам</button>
          <button class="tab-btn" :class="{ active: activeTab === 'retail' }" @click="activeTab = 'retail'">Предоплаты по розничным клиентам</button>
          <button class="tab-btn" :class="{ active: activeTab === 'history_retail' }" @click="activeTab = 'history_retail'">История корректировок</button>
      </div>
      
      <!-- B2B SUMMARY -->
      <div class="summary-bar" v-if="activeTab === 'clients'">
          <div class="sum-item"><span class="sum-label">Общая сумма по предоплатам:</span><span class="sum-val">{{ clientsSummary.total }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Внесено предоплат на сумму:</span><span class="sum-val income-text">{{ clientsSummary.received }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Нам должны еще:</span><span class="sum-val warn-text">{{ clientsSummary.debt }}</span></div>
      </div>
      
      <!-- RETAIL SUMMARY -->
      <div class="summary-bar" v-if="activeTab === 'retail'">
          <div class="sum-item"><span class="sum-label">Всего поступило (Аванс):</span><span class="sum-val income-text">{{ retailSummary.totalDeal }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Отработано (Списано):</span><span class="sum-val">{{ retailSummary.received }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Остаток долга перед клиентами:</span><span class="sum-val warn-text">{{ retailSummary.debt }}</span></div>
          <div class="sum-sep">|</div>
          <button class="btn-small-action" @click="showRetailPopup = true">Внести корректировку</button>
      </div>

      <!-- HISTORY SUMMARY -->
      <div class="summary-bar" v-if="activeTab === 'history_retail'">
          <div class="sum-item"><span class="sum-label">Всего поступило (Аванс):</span><span class="sum-val income-text">{{ historySummary.total }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Отработано (Списано):</span><span class="sum-val">{{ historySummary.worked }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Остаток долга перед клиентами:</span><span class="sum-val warn-text">{{ historySummary.debt }}</span></div>
      </div>

      <div class="table-wrapper">
          <!-- 🟢 HEADER WITH FILTERS -->
          <div class="list-header-row unified-grid" :class="{ 'no-act-date': !showActDateColumn }">
              <div class="header-filter-wrapper">СТАТУС</div>
              <div class="header-filter-wrapper">
                  <DateRangePicker v-model="filters.dateRange" placeholder="ДАТА ОП." class="header-date-picker" />
              </div>
              <div class="header-filter-wrapper">
                  {{ activeTab === 'retail' ? 'ПОСТУПИЛО' : (activeTab === 'history_retail' ? 'ВСЕГО ПОСТУПИЛО' : 'БЮДЖЕТ') }}
              </div>
              <div class="header-filter-wrapper">
                  {{ activeTab === 'retail' ? 'ОТРАБОТАНО' : (activeTab === 'history_retail' ? 'ОТРАБОТАНО (СПИС)' : 'ВНЕСЕНО') }}
              </div>
              <div class="header-filter-wrapper">ДОЛГ</div>
              <div class="header-filter-wrapper">
                   <select v-model="filters.account" class="header-select">
                       <option value="">СЧЕТ</option>
                       <option v-for="a in accounts" :key="a._id" :value="a.name">{{ a.name }}</option>
                   </select>
              </div>
              <div class="header-filter-wrapper">
                   <select v-model="filters.company" class="header-select"><option value="">КОМПАНИЯ</option><option v-for="c in companies" :key="c._id" :value="c._id">{{ c.name }}</option></select>
              </div>
              <div class="header-filter-wrapper">
                   <select v-model="filters.contractorValue" class="header-select" :disabled="activeTab !== 'clients'">
                       <option value="">КОНТРАГЕНТ</option>
                       <optgroup v-for="grp in contractorOptions" :key="grp.label" :label="grp.label">
                           <option v-for="opt in grp.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                       </optgroup>
                   </select>
              </div>
              <div class="header-filter-wrapper">
                   <select v-model="filters.project" class="header-select"><option value="">ПРОЕКТ</option><option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option></select>
              </div>
              <div class="header-filter-wrapper">
                   <select v-model="filters.category" class="header-select">
                       <option value="">КАТЕГОРИЯ</option>
                       <option v-for="cat in categories" :key="cat._id" :value="cat._id">{{ cat.name }}</option>
                   </select>
              </div>
              
              <!-- 🟢 Conditional Date Picker -->
              <div class="header-filter-wrapper" v-if="showActDateColumn">
                  <DateRangePicker 
                      v-model="filters.adjustDateRange" 
                      :placeholder="activeTab === 'history_retail' ? 'ДАТА КОРР.' : 'ДАТА АКТА'" 
                      class="header-date-picker" 
                  />
              </div>
              
              <div class="header-filter-wrapper"></div>
              <div class="header-filter-wrapper"></div>
          </div>

          <div class="list-scroll">
            <div v-if="filteredItems.length === 0" class="empty-state">Нет записей.</div>
            <div v-for="item in filteredItems" :key="item._id" class="grid-row unified-grid" :class="{ 'row-closed': item.isClosed, 'no-act-date': !showActDateColumn }">
              <div class="col-status-text" :class="{ 'status-done': item.isClosed }">{{ item.statusLabel }}</div>
              <div class="col-date">{{ formatDateReadable(item.date) }}</div>
              
              <template v-if="activeTab === 'retail'">
                  <div class="col-amount income-text">+ {{ item.totalDealFormatted }} ₸</div>
                  <div class="col-amount">{{ item.amountFormatted }} ₸</div>
              </template>
              <template v-else-if="activeTab === 'history_retail'">
                  <div class="col-amount income-text" style="font-size: 11px;">+ {{ item.totalDealFormatted }} ₸</div>
                  <div class="col-amount expense-text">- {{ item.amountFormatted }} ₸</div>
              </template>
              <template v-else>
                  <div class="col-amount">{{ item.totalDealFormatted }} ₸</div>
                  <div class="col-amount income-text">+ {{ item.amountFormatted }} ₸</div>
              </template>

              <div class="col-debt warn-text">{{ item.debtFormatted }}</div>
              <div class="col-text" :title="item.accountName">{{ item.accountName }}</div>
              <div class="col-text" style="font-weight: 600;" :title="item.companyName">{{ item.companyName }}</div>
              <div class="col-text" :title="item.contractorName">{{ item.contractorName }}</div>
              <div class="col-text" :title="item.projectName">{{ item.projectName }}</div>
              <div class="col-text" :title="item.categoryName">{{ item.categoryName }}</div>
              
              <!-- 🟢 Conditional Date -->
              <div class="col-date" v-if="showActDateColumn">{{ formatDateReadable(item.adjustDate) }}</div>
              
              <div class="col-actions">
                  <div v-if="activeTab === 'clients'">
                      <button v-if="!item.isClosed" class="btn-close-deal" @click="initiateCloseDeal(item)" title="Подтвердить выполнение работ">Закрыть</button>
                      <span v-else class="status-icon-check">✓</span>
                  </div>
              </div>
              <div class="col-actions">
                  <button class="delete-btn" @click="askDelete(item)"><svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
              </div>
            </div>
          </div>
      </div>

      <div class="popup-footer">
        <button class="btn-close" @click="$emit('close')">Закрыть</button>
      </div>
    </div>
    
    <RetailClosurePopup v-if="showRetailPopup" @close="showRetailPopup = false" @confirm="handleRetailClosure" />
    <WorkActPopup v-if="showWorkActPopup && itemToClose" :dealItem="itemToClose" @close="showWorkActPopup = false" @confirm="handleWorkActConfirm" />
    <ConfirmationPopup v-if="showDeleteConfirm" title="Удаление" message="Вы уверены?" @close="showDeleteConfirm = false" @confirm="confirmDelete" />
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; height: 50vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 90%; max-width: 1900px; border: 1px solid #ddd; }
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
.btn-small-action { padding: 6px 12px; background: #10b981; color: #fff; border-radius: 6px; border: none; cursor: pointer; font-size: 10px; font-weight: 600; }
.btn-small-action:hover { background: #555; }
.table-wrapper { flex-grow: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.list-header-row { padding: 0 12px; height: 44px; background: #fff; position: sticky; top: 0; z-index: 10; border-bottom: 1px solid #eee; display: grid; align-items: center; }
.empty-state { padding: 20px; text-align: center; color: #777; font-size: 14px; }
.header-filter-wrapper { width: 100%; height: 100%; display: flex; align-items: center; font-size: 10px; font-weight: 700; color: #555; text-transform: uppercase; }
.header-select, .header-input, :deep(.date-picker-input) { width: 100%; border: 1px solid transparent; border-radius: 4px; padding: 0 4px; font-size: 10px; font-weight: 700; color: #4B5563; background: transparent; height: 28px; box-sizing: border-box; outline: none; transition: all 0.2s; text-transform: uppercase; }
.header-select:hover, .header-input:hover, :deep(.date-picker-input:hover) { background: #f3f4f6; }
.header-select:focus, .header-input:focus, :deep(.date-picker-input:focus) { border-color: #d1d5db; background: #fff; }
.header-date-picker { width: 100%; }
:deep(.dp__input) { border: none !important; background: transparent !important; font-size: 10px !important; font-weight: 700 !important; color: #4B5563 !important; padding: 0 4px !important; height: 28px !important; text-transform: uppercase; box-shadow: none !important; }
:deep(.dp__input_icon) { display: none; }
:deep(.dp__input:hover) { background: #f3f4f6 !important; }
.header-select { -webkit-appearance: none; appearance: none; cursor: pointer; }
.header-select option { text-transform: none; font-weight: normal; color: #333; }
.header-select.disabled { opacity: 0.5; cursor: not-allowed; }
.header-input::placeholder { color: #4B5563; opacity: 1; }
.header-input::-webkit-input-placeholder { color: #4B5563; }
.list-scroll { flex-grow: 1; overflow-x: auto; overflow-y: auto; scrollbar-width: auto; }
.grid-row { align-items: center; padding: 10px 12px; background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; margin-bottom: 6px; font-size: 12px; color: #333; }
.grid-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.row-closed { opacity: 0.75; background-color: #f8fafc; }

/* 🟢 UNIFIED GRID (Default) */
.unified-grid { 
  display: grid; 
  /* 13 columns total (last is Act Date) */
  grid-template-columns: 80px 100px 130px 130px 130px 120px 120px 120px 120px 120px 130px 60px 40px; 
  gap: 10px; 
  min-width: 1440px; 
}

/* 🟢 GRID WITHOUT ACT DATE (12 columns) */
.unified-grid.no-act-date {
  /* Removed 130px from end */
  grid-template-columns: 80px 100px 130px 130px 130px 120px 120px 120px 120px 120px 60px 40px;
}

.col-date { color: #555; white-space: nowrap; font-size: 11px; }
.col-status-text { color: #888; font-weight: 600; font-size: 11px; text-transform: uppercase; }
.status-tranche { color: #6b7280; font-style: italic; }
.status-done { color: #9ca3af; font-style: italic; text-decoration: line-through; }
.status-received { color: #10b981; }
.status-advance { color: #F59E0B; }
.col-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-amount, .col-debt { font-weight: 700; text-align: left; font-variant-numeric: tabular-nums; }
.col-actions { display: flex; justify-content: flex-start; }
.btn-close-deal { padding: 4px 8px; background: #10b981; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; }
.status-icon-check { font-size: 14px; color: #10b981; font-weight: 800; }
.delete-btn { width: 28px; height: 28px; border: 1px solid #eee; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.delete-btn svg { width: 14px; stroke: #999; }
.delete-btn:hover { border-color: #ff3b30; stroke: #ff3b30; }
.popup-footer { padding: 1.5rem; border-top: 1px solid #eee; display: flex; justify-content: flex-end; background: #f9f9f9; border-radius: 0 0 12px 12px; flex-shrink: 0;}
.btn-close { padding: 8px 16px; background: white; border: 1px solid #ccc; border-radius: 6px; cursor: pointer; font-weight: 500; color: #333; }
</style>