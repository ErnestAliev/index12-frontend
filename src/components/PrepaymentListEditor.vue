<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useDealStore } from '@/stores/dealStore'; // 🟢 Импорт DealStore
import { formatNumber } from '@/utils/formatters.js';

import DateRangePicker from './DateRangePicker.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import RetailClosurePopup from './RetailClosurePopup.vue';
import WorkActPopup from './WorkActPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v73.2 - HIDE ACCOUNT IN HISTORY ---
 * * ВЕРСИЯ: 73.2
 * * ИЗМЕНЕНИЯ:
 * 1. (UX) В вкладке "История корректировок" скрыта колонка "Счет", так как для списаний/корректировок 
 * она часто неактуальна (списание из общего баланса).
 * 2. Сетка таблицы (Grid) переведена на динамический стиль для корректного отображения колонок.
 */

const props = defineProps({
  title: { type: String, default: 'Управление предоплатами' },
  initialTab: { type: String, default: 'clients' },
  widgetKey: { type: String, default: null }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();
const dealStore = useDealStore(); // 🟢 Подключение

// TABS
const activeTab = ref(props.initialTab || 'clients'); 

// 🟢 КОЛОНКИ: Управление видимостью
const showActDateColumn = computed(() => {
    return activeTab.value !== 'retail';
});

const showAccountColumn = computed(() => {
    // Скрываем колонку "Счет" в истории корректировок
    return activeTab.value !== 'history_retail';
});

// 🟢 ГРИД: Динамический шаблон колонок
const gridStyle = computed(() => {
    // Базовая структура:
    // 1. Статус (80px)
    // 2. Дата (100px)
    // 3. Сумма/Бюджет (130px)
    // 4. Сумма/Отработано (130px)
    // 5. Долг (130px)
    // 6. [ОПЦИОНАЛЬНО] Счет (120px)
    // 7. Компания (120px)
    // 8. Контрагент (120px)
    // 9. Проект (120px)
    // 10. Категория (120px)
    // 11. [ОПЦИОНАЛЬНО] Дата Акта (130px)
    // 12. Действия (60px)
    // 13. Удалить (40px)
    
    let cols = '80px 100px 130px 130px 130px ';
    
    if (showAccountColumn.value) {
        cols += '120px ';
    }
    
    // Компания, Контрагент, Проект, Категория
    cols += '120px 120px 120px 120px ';
    
    if (showActDateColumn.value) {
        cols += '130px ';
    }
    
    // Actions + Delete
    cols += '60px 40px';
    
    return {
        gridTemplateColumns: cols
    };
});

const localItems = ref([]);
const processingItems = ref(new Set());

// STATES
const isLoading = ref(true); 
const itemToClose = ref(null);
const showWorkActPopup = ref(false);
const showRetailPopup = ref(false);
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const isDeleting = ref(false); 

// FILTERS
const filters = ref({
  dateRange: { from: null, to: null },
  adjustDateRange: { from: null, to: null }, 
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

const projects = computed(() => mainStore.projects);
const contractors = computed(() => mainStore.contractors);
const accounts = computed(() => mainStore.accounts);
const companies = computed(() => mainStore.companies);
const categories = computed(() => mainStore.categories); 

const formatDateReadable = (dateVal) => dateVal ? new Date(dateVal).toLocaleDateString('ru-RU') : '-';
const formatTotal = (val) => `${formatNumber(Math.abs(val || 0))} ₸`;

// 🟢 LOAD DATA (VIA DEAL STORE)
const loadOperations = () => {
  isLoading.value = true;
  
  setTimeout(() => {
      try {
          const combined = [];
          
          // Получаем готовые сгруппированные сделки из DealStore
          const groups = dealStore.dealGroups; 

          groups.forEach((history, key) => {
              if (!history || history.length === 0) return;
              
              // Определяем тип группы (Розница или Клиент) по первой записи
              const isRetailGroup = history[0].isRetail;

              // --- 1. B2B CLIENTS ---
              if (!isRetailGroup) {
                  history.forEach(deal => {
                      deal.ops.forEach(op => {
                          if (op.type !== 'income') return;

                          const actDate = op.isClosed ? (op.closingDate || op.updatedAt || op.date) : null;
                          const currentDebt = Math.max(0, deal.budget - deal.received);
                          
                          let statusLabel = 'Получ';
                          if (op.isDealTranche) statusLabel = 'Транш';
                          if (op.isClosed) statusLabel = op.isDealTranche ? 'Отраб' : 'Испл';

                          combined.push({
                              _id: op._id, 
                              originalOp: op, 
                              type: 'deal',
                              statusLabel: statusLabel,
                              date: op.date, 
                              adjustDate: actDate, 
                              totalDeal: deal.budget, 
                              totalDealFormatted: formatNumber(deal.budget),
                              amount: op.amount || 0, 
                              amountFormatted: formatNumber(op.amount || 0),
                              debt: currentDebt,
                              debtFormatted: formatNumber(currentDebt),
                              accountName: op.accountId?.name || '-',
                              companyName: op.companyId?.name || op.individualId?.name || '-',
                              contractorName: op.contractorId?.name || op.counterpartyIndividualId?.name || '-',
                              projectName: op.projectId?.name || '---',
                              categoryName: op.categoryId?.name || '-',
                              accountId: op.accountId?._id || op.accountId,
                              companyId: op.companyId?._id || op.companyId,
                              contractorValue: op.contractorId ? `contr_${op.contractorId._id || op.contractorId}` : `ind_${op.counterpartyIndividualId?._id || op.counterpartyIndividualId}`,
                              projectId: op.projectId?._id || op.projectId,
                              categoryId: op.categoryId?._id || op.categoryId,
                              isClosed: !!op.isClosed
                          });
                      });
                  });
              }
              
              // --- 2. RETAIL ---
              else {
                  const retailBox = history[0];
                  // A. ACTIVE RETAIL
                  const advance = Math.max(0, retailBox.received - retailBox.workedOut);
                  
                  if (advance > 0) {
                      const sampleOp = retailBox.ops[0] || {};
                      combined.push({
                          _id: `retail_summary_${key}`, 
                          originalOp: sampleOp, 
                          type: 'retail_adj',
                          statusLabel: 'Аванс', 
                          date: sampleOp.date || new Date(), 
                          adjustDate: null,
                          totalDeal: retailBox.received, 
                          totalDealFormatted: formatNumber(retailBox.received),
                          amount: retailBox.workedOut, 
                          amountFormatted: formatNumber(retailBox.workedOut),
                          debt: advance, 
                          debtFormatted: formatNumber(advance),
                          projectName: sampleOp.projectId?.name || 'Без проекта', 
                          contractorName: 'Розничные клиенты',
                          accountName: sampleOp.accountId?.name || '-', 
                          companyName: sampleOp.companyId?.name || '-',
                          categoryName: sampleOp.categoryId?.name || '-',
                          projectId: sampleOp.projectId?._id || sampleOp.projectId,
                          categoryId: sampleOp.categoryId?._id || sampleOp.categoryId,
                          companyId: sampleOp.companyId?._id || sampleOp.companyId,
                          isClosed: false
                      });
                  }

                  // B. HISTORY RETAIL
                  retailBox.ops.forEach(op => {
                      if (op.type === 'expense') { 
                          combined.push({
                              _id: op._id, 
                              originalOp: op, 
                              type: 'history_retail',
                              statusLabel: 'Спис', 
                              date: op.date, 
                              adjustDate: op.date,
                              totalDeal: retailBox.received, 
                              totalDealFormatted: formatNumber(retailBox.received),
                              amount: Math.abs(op.amount), 
                              amountFormatted: formatNumber(Math.abs(op.amount)),
                              debt: advance, 
                              debtFormatted: formatNumber(advance),
                              projectName: op.projectId?.name || 'Без проекта', 
                              contractorName: 'Розничные клиенты',
                              accountName: op.accountId?.name || '-', 
                              companyName: op.companyId?.name || '-', 
                              categoryName: op.categoryId?.name || '-',
                              projectId: op.projectId?._id || op.projectId, 
                              categoryId: op.categoryId?._id || op.categoryId,
                              companyId: op.companyId?._id || op.companyId,
                              accountId: op.accountId?._id || op.accountId,
                              isClosed: true
                          });
                      }
                  });
              }
          });

          localItems.value = combined.sort((a, b) => new Date(b.date) - new Date(a.date));
      } finally {
          isLoading.value = false;
      }
  }, 50); 
};

onMounted(async () => { 
    isLoading.value = true;
    await mainStore.fetchAllEntities(); 
    loadOperations(); 
});

watch(() => dealStore.dealGroups, () => {
    loadOperations();
}, { deep: true });

// FILTER LOGIC
const filteredItems = computed(() => {
  const list = localItems.value.filter(i => i.type === (activeTab.value === 'clients' ? 'deal' : (activeTab.value === 'retail' ? 'retail_adj' : 'history_retail')));
  
  return list.filter(item => {
    const { from, to } = filters.value.dateRange;
    if (from && new Date(item.date) < new Date(from)) return false;
    if (to && new Date(item.date) > new Date(to)) return false;
    
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
    let totalDeal = 0, totalPrepayment = 0, totalDebt = 0;
    const uniqueDeals = new Set();
    
    filteredItems.value.forEach(i => {
       if (i.type !== 'deal') return;
       const status = dealStore.getOpTrancheStatus(i._id);
       const dealUUID = status?.dealUUID || `${i.projectId}_${i.contractorValue}_${i.categoryId}_fallback`;
       
       if (!uniqueDeals.has(dealUUID)) {
           uniqueDeals.add(dealUUID);
           totalDeal += (i.totalDeal || 0);
           totalDebt += (i.debt || 0);
       }
       totalPrepayment += (i.amount || 0);
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
        tDeal += i.totalDeal; 
        tExec += i.amount;    
        tDebt += i.debt;      
    });
    return { totalDeal: formatTotal(tDeal), received: formatTotal(tExec), debt: formatTotal(tDebt) };
});

const historySummary = computed(() => {
    let totalIn = 0, totalOut = 0;
    dealStore.dealGroups.forEach((history) => {
        if (!history[0]?.isRetail) return;
        const box = history[0];
        totalIn += box.received;
        totalOut += box.workedOut;
    });

    return { 
        total: formatTotal(totalIn), 
        worked: formatTotal(totalOut), 
        debt: formatTotal(Math.max(0, totalIn - totalOut)) 
    };
});

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
    showDeleteConfirm.value = false; 
    
    try {
        await mainStore.deleteOperation(itemToDelete.value.originalOp);
        setTimeout(() => { isDeleting.value = false; }, 500);
    } catch (e) { alert(e.message); isDeleting.value = false; }
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

const accountOptions = computed(() => mainStore.accounts);
const categoryOptions = computed(() => mainStore.categories);
const contractorOptions = computed(() => {
    const opts = [];
    opts.push({ label: 'Контрагенты', options: mainStore.contractors.map(c => ({ value: `contr_${c._id}`, label: c.name })) });
    return opts;
});

const isWidgetOnDashboard = computed(() => {
  if (!props.widgetKey) return null;
  return mainStore.dashboardLayout.includes(props.widgetKey);
});

const toggleWidgetOnDashboard = () => {
  if (!props.widgetKey) return;
  if (isWidgetOnDashboard.value) {
    mainStore.dashboardLayout = mainStore.dashboardLayout.filter(k => k !== props.widgetKey);
  } else {
    mainStore.dashboardLayout = [...mainStore.dashboardLayout, props.widgetKey];
  }
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor relative-container">
      
      <div v-if="isLoading || isDeleting" class="loading-overlay">
          <div class="spinner"></div>
          <div class="loading-text">{{ isDeleting ? 'Удаление операции...' : 'Загрузка списка...' }}</div>
      </div>

      <div class="popup-header">
        <div class="header-with-toggle">
          <h3>{{ title }}</h3>
          <button v-if="widgetKey && isWidgetOnDashboard !== null" class="widget-toggle-btn" @click.stop="toggleWidgetOnDashboard" :title="isWidgetOnDashboard ? 'Скрыть' : 'Показать'">
            <svg v-if="isWidgetOnDashboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
            <span class="toggle-label">{{ isWidgetOnDashboard ? 'На столе' : 'Скрыт' }}</span>
          </button>
        </div>
      </div>

      <div class="tabs-header">
          <button class="tab-btn" :class="{ active: activeTab === 'clients' }" @click="activeTab = 'clients'">Предоплаты по сделкам</button>
          <button class="tab-btn" :class="{ active: activeTab === 'retail' }" @click="activeTab = 'retail'">Предоплаты по розничным клиентам</button>
          <button class="tab-btn" :class="{ active: activeTab === 'history_retail' }" @click="activeTab = 'history_retail'">История корректировок</button>
      </div>
      
      <div class="summary-bar" v-if="activeTab === 'clients'">
          <div class="sum-item"><span class="sum-label">Общая сумма по предоплатам:</span><span class="sum-val">{{ clientsSummary.total }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Внесено предоплат на сумму:</span><span class="sum-val income-text">{{ clientsSummary.received }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Нам должны еще:</span><span class="sum-val warn-text">{{ clientsSummary.debt }}</span></div>
      </div>
      
      <div class="summary-bar" v-if="activeTab === 'retail'">
          <div class="sum-item"><span class="sum-label">Всего поступило (Аванс):</span><span class="sum-val income-text">{{ retailSummary.totalDeal }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Отработано (Списано):</span><span class="sum-val">{{ retailSummary.received }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Остаток долга перед клиентами:</span><span class="sum-val warn-text">{{ retailSummary.debt }}</span></div>
          <div class="sum-sep">|</div>
          <button class="btn-small-action" @click="showRetailPopup = true">Внести корректировку</button>
      </div>

      <div class="summary-bar" v-if="activeTab === 'history_retail'">
          <div class="sum-item"><span class="sum-label">Всего поступило (Аванс):</span><span class="sum-val income-text">{{ historySummary.total }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Отработано (Списано):</span><span class="sum-val">{{ historySummary.worked }}</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Остаток долга перед клиентами:</span><span class="sum-val warn-text">{{ historySummary.debt }}</span></div>
      </div>

      <div class="table-wrapper">
          <!-- 🟢 ПРИМЕНЯЕМ ДИНАМИЧЕСКИЙ СТИЛЬ ГРИДА -->
          <div class="list-header-row unified-grid" :style="gridStyle">
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
              
              <!-- 🟢 СКРЫВАЕМ СЧЕТ В ИСТОРИИ -->
              <div class="header-filter-wrapper" v-if="showAccountColumn">
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
            <div v-if="filteredItems.length === 0 && !isLoading" class="empty-state">Нет записей.</div>
            
            <div v-show="!isLoading">
                <!-- 🟢 ПРИМЕНЯЕМ ДИНАМИЧЕСКИЙ СТИЛЬ ГРИДА -->
                <div v-for="item in filteredItems" :key="item._id" class="grid-row unified-grid" :class="{ 'row-closed': item.isClosed }" :style="gridStyle">
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
                  
                  <!-- 🟢 СКРЫВАЕМ СЧЕТ В ИСТОРИИ -->
                  <div class="col-text" :title="item.accountName" v-if="showAccountColumn">{{ item.accountName }}</div>

                  <div class="col-text" style="font-weight: 600;" :title="item.companyName">{{ item.companyName }}</div>
                  <div class="col-text" :title="item.contractorName">{{ item.contractorName }}</div>
                  <div class="col-text" :title="item.projectName">{{ item.projectName }}</div>
                  <div class="col-text" :title="item.categoryName">{{ item.categoryName }}</div>
                  
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
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 3500; overflow-y: auto; }
.popup-content { background: var(--color-background); border-radius: 12px; display: flex; flex-direction: column; height: 50vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 90%; max-width: 1900px; border: 1px solid var(--color-border); }
.relative-container { position: relative; overflow: hidden; }

.loading-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(255,255,255,0.8); z-index: 50;
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    backdrop-filter: blur(2px);
}
.spinner {
    width: 40px; height: 40px;
    border: 4px solid #f3f3f3; border-top: 4px solid #28B8A0; border-radius: 50%;
    animation: spin 1s linear infinite; margin-bottom: 10px;
}
.loading-text { font-size: 14px; font-weight: 600; color: #555; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 24px; color: var(--color-heading); font-weight: 700; }
.header-with-toggle { display: flex; align-items: center; gap: 16px; }
.widget-toggle-btn { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--color-background); border: 1px solid var(--color-border); border-radius: 8px; cursor: pointer; transition: all 0.2s; font-size: 13px; color: var(--color-text-soft); }
.widget-toggle-btn:hover { border-color: var(--color-primary); background: var(--color-background-mute); }
.widget-toggle-btn svg { width: 16px; height: 16px; flex-shrink: 0; }
.widget-toggle-btn .toggle-label { font-weight: 500; }
.tabs-header { display: flex; gap: 24px; padding: 0 1.5rem; margin-top: 1rem; border-bottom: 1px solid var(--color-border); }
.tab-btn { background: none; border: none; border-bottom: 3px solid transparent; font-size: 15px; font-weight: 600; color: var(--color-text-soft); padding: 12px 0; cursor: pointer; transition: all 0.2s; }
.tab-btn.active { color: var(--color-heading) ; border-color: var(--color-heading) ; }
.tab-btn:hover { color: var(--color-text); }
.summary-bar { display: flex; align-items: center; gap: 15px; padding: 15px 24px; background-color: var(--color-background-soft); border-bottom: 1px solid var(--color-border); font-size: 15px; color: var(--color-text); flex-wrap: wrap;}
.sum-item { display: flex; gap: 6px; }
.sum-label { color: var(--color-text-soft); }
.sum-val { font-weight: 700; }
.sum-sep { color: var(--color-border); }
.income-text { color: #10b981; }
.warn-text { color: #f59e0b; }
.expense-text { color: #ef4444; }
.btn-small-action { padding: 6px 12px; background: #10b981; color: #fff; border-radius: 6px; border: none; cursor: pointer; font-size: 10px; font-weight: 600; }
.btn-small-action:hover { background: #555; }
.table-wrapper { flex-grow: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.list-header-row { padding: 0 12px; height: 44px; background: var(--color-background-soft); position: sticky; top: 0; z-index: 10; border-bottom: 1px solid var(--color-border); display: grid; align-items: center; }
.empty-state { padding: 20px; text-align: center; color: var(--color-text-soft); font-size: 14px; }
.header-filter-wrapper { width: 100%; height: 100%; display: flex; align-items: center; font-size: 10px; font-weight: 700; color: var(--color-text-soft); text-transform: uppercase; }
.header-select, .header-input, :deep(.date-picker-input) { width: 100%; border: 1px solid transparent; border-radius: 4px; padding: 0 4px; font-size: 10px; font-weight: 700; color: var(--color-text-soft); background: transparent; height: 28px; box-sizing: border-box; outline: none; transition: all 0.2s; text-transform: uppercase; }
.header-select:hover, .header-input:hover, :deep(.date-picker-input:hover) { background: var(--color-background-mute); }
.header-select:focus, .header-input:focus, :deep(.date-picker-input:focus) { border-color: var(--color-border); background: var(--color-background); }
.header-date-picker { width: 100%; }
:deep(.dp__input) { border: none !important; background: transparent !important; font-size: 10px !important; font-weight: 700 !important; color: var(--color-text-soft) !important; padding: 0 4px !important; height: 28px !important; text-transform: uppercase; box-shadow: none !important; }
:deep(.dp__input_icon) { display: none; }
:deep(.dp__input:hover) { background: var(--color-background-mute) !important; }
.header-select { -webkit-appearance: none; appearance: none; cursor: pointer; }
.header-select option { text-transform: none; font-weight: normal; color: var(--color-text); }
.header-select.disabled { opacity: 0.5; cursor: not-allowed; }
.header-input::placeholder { color: var(--color-text-soft); opacity: 1; }
.header-input::-webkit-input-placeholder { color: var(--color-text-soft); }
.list-scroll { flex-grow: 1; overflow-x: auto; overflow-y: auto; scrollbar-width: auto; }
.grid-row { align-items: center; padding: 10px 12px; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 8px; margin-bottom: 6px; font-size: 12px; color: var(--color-text); }
.grid-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.row-closed { opacity: 0.75; background-color: var(--color-background-mute); }

/* 🟢 Unified Grid: базовые стили, но колонки теперь задаются инлайн через :style */
.unified-grid { 
  display: grid; 
  gap: 10px; 
  min-width: 1440px; 
}

.col-date { color: var(--color-text-soft); white-space: nowrap; font-size: 11px; }
.col-status-text { color: var(--color-text-soft); font-weight: 600; font-size: 11px; text-transform: uppercase; }
.status-tranche { color: var(--color-text-soft); font-style: italic; }
.status-done { color: var(--color-text-soft); font-style: italic; text-decoration: line-through; }
.status-received { color: #10b981; }
.status-advance { color: #F59E0B; }
.col-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-amount, .col-debt { font-weight: 700; text-align: left; font-variant-numeric: tabular-nums; }
.col-actions { display: flex; justify-content: flex-start; }
.btn-close-deal { padding: 4px 8px; background: #10b981; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; }
.status-icon-check { font-size: 14px; color: #10b981; font-weight: 800; }
.delete-btn { width: 28px; height: 28px; border: 1px solid var(--color-border); background: var(--color-background); border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.delete-btn svg { width: 14px; stroke: var(--color-text-soft); }
.delete-btn:hover { border-color: #ff3b30; stroke: #ff3b30; }
.popup-footer { padding: 1.5rem; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; background: var(--color-background); border-radius: 0 0 12px 12px; flex-shrink: 0;}
.btn-close { padding: 8px 16px; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 6px; cursor: pointer; font-weight: 500; color: var(--color-text); }
</style>