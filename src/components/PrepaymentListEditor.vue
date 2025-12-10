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
 * * --- МЕТКА ВЕРСИИ: v73.0 - DEAL STORE INTEGRATION ---
 * * ВЕРСИЯ: 73.0
 * * ИЗМЕНЕНИЯ:
 * 1. (FIX) Логика расчета переведена на useDealStore. Теперь редактор берет данные из того же источника, 
 * что и виджеты. Это гарантирует совпадение цифр.
 * 2. loadOperations теперь перебирает готовые "Коробки" сделок (dealGroups) вместо ручного фильтра.
 * 3. Исправлено некорректное отображение "Должны отработать" и "Должны получить".
 */

const props = defineProps({
  title: { type: String, default: 'Управление предоплатами' },
  initialTab: { type: String, default: 'clients' } 
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();
const dealStore = useDealStore(); // 🟢 Подключение

// TABS
const activeTab = ref(props.initialTab || 'clients'); 

const showActDateColumn = computed(() => {
    return activeTab.value !== 'retail';
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
          // Это те же самые данные, что использует виджет
          const groups = dealStore.dealGroups; 

          groups.forEach((history, key) => {
              if (!history || history.length === 0) return;
              
              // Определяем тип группы (Розница или Клиент) по первой записи
              const isRetailGroup = history[0].isRetail;

              // --- 1. B2B CLIENTS ---
              if (!isRetailGroup) {
                  history.forEach(deal => {
                      // Проходимся по всем операциям внутри сделки
                      deal.ops.forEach(op => {
                          // Нас интересуют только доходы (Транши/Предоплаты) для списка
                          if (op.type !== 'income') return;

                          const actDate = op.isClosed ? (op.closingDate || op.updatedAt || op.date) : null;
                          
                          // Текущий долг по сделке
                          const currentDebt = Math.max(0, deal.budget - deal.received);
                          
                          // Статус для лейбла
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
                              
                              // ВАЖНО: Долг берем из состояния сделки, к которой относится транш
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
                  // history[0] - это единственная "вечная" коробка для розницы (per Project+Category)
                  const retailBox = history[0];
                  
                  // Считаем общие показатели для этой коробки
                  // Для розницы в списке мы часто хотим группировать по Проектам
                  // Но dealStore группирует по Project+Category.
                  // Чтобы сохранить логику отображения "по проектам", нам нужно будет сгруппировать их обратно,
                  // ИЛИ отображать как есть (более детально).
                  // Давайте отображать как есть в dealStore (Project + Category), это точнее.
                  
                  // A. ACTIVE RETAIL (Summary row)
                  const debt = Math.max(0, retailBox.workedOut - retailBox.received); // В рознице долг = (Списано - Получено)? Или наоборот? 
                  // В dealStore: liabilitiesTheyOwe (Нам должны) = workedOut - received (Овердрафт/Долг клиента)
                  // В dealStore: liabilitiesWeOwe (Мы должны) = received - workedOut (Аванс)
                  
                  // Для вкладки "Предоплаты по розничным клиентам" мы обычно показываем Авансы (Мы должны)
                  const advance = Math.max(0, retailBox.received - retailBox.workedOut);
                  
                  if (advance > 0) {
                      // Берем данные из первой операции для названий
                      const sampleOp = retailBox.ops[0] || {};
                      
                      combined.push({
                          _id: `retail_summary_${key}`, 
                          originalOp: sampleOp, 
                          type: 'retail_adj',
                          statusLabel: 'Аванс', 
                          date: sampleOp.date || new Date(), 
                          adjustDate: null,
                          
                          totalDeal: retailBox.received, // Всего получено
                          totalDealFormatted: formatNumber(retailBox.received),
                          
                          amount: retailBox.workedOut, // Отработано
                          amountFormatted: formatNumber(retailBox.workedOut),
                          
                          debt: advance, // Остаток аванса
                          debtFormatted: formatNumber(advance),
                          
                          projectName: sampleOp.projectId?.name || 'Без проекта', 
                          contractorName: 'Розничные клиенты',
                          accountName: '-', 
                          companyName: sampleOp.companyId?.name || '-',
                          categoryName: sampleOp.categoryId?.name || '-',
                          
                          projectId: sampleOp.projectId?._id || sampleOp.projectId,
                          categoryId: sampleOp.categoryId?._id || sampleOp.categoryId,
                          companyId: sampleOp.companyId?._id || sampleOp.companyId,
                          
                          isClosed: false
                      });
                  }

                  // B. HISTORY RETAIL (Expenses/Write-offs)
                  retailBox.ops.forEach(op => {
                      if (op.type === 'expense' && !op.accountId) { // Списания
                          combined.push({
                              _id: op._id, 
                              originalOp: op, 
                              type: 'history_retail',
                              statusLabel: 'Спис', 
                              date: op.date, 
                              adjustDate: op.date,
                              
                              totalDeal: retailBox.received, // Контекст всей коробки
                              totalDealFormatted: formatNumber(retailBox.received),
                              
                              amount: Math.abs(op.amount), 
                              amountFormatted: formatNumber(Math.abs(op.amount)),
                              
                              debt: advance, // Текущий остаток аванса
                              debtFormatted: formatNumber(advance),
                              
                              projectName: op.projectId?.name || 'Без проекта', 
                              contractorName: 'Розничные клиенты',
                              accountName: '-', 
                              companyName: op.companyId?.name || '-', 
                              categoryName: op.categoryId?.name || '-',
                              
                              projectId: op.projectId?._id || op.projectId, 
                              categoryId: op.categoryId?._id || op.categoryId,
                              companyId: op.companyId?._id || op.companyId,
                              
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

// Следим за изменениями в dealStore (он реактивный)
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
    
    // Используем Set для подсчета уникальных сделок, чтобы не дублировать бюджет
    // Но так как у нас список траншей, бюджет дублируется в строках.
    // Нам нужно просуммировать уникальные бюджеты и долги.
    
    const uniqueDeals = new Set();
    
    filteredItems.value.forEach(i => {
       if (i.type !== 'deal') return;
       // Группируем по уникальному ID сделки (если он есть в dealStore, иначе собираем ключ)
       // В dealStore мы не прокидывали ID сделки в op, но мы можем использовать dealKey logic
       // Но проще взять op.dealUUID если мы его сохраняли?
       // dealStore.js: opStatusMap.value.set(op._id, { ... dealUUID ... })
       // Мы можем получить статус из dealStore
       
       const status = dealStore.getOpTrancheStatus(i._id);
       const dealUUID = status?.dealUUID || `${i.projectId}_${i.contractorValue}_${i.categoryId}_fallback`;
       
       if (!uniqueDeals.has(dealUUID)) {
           uniqueDeals.add(dealUUID);
           // Берем бюджет и долг только один раз на сделку
           totalDeal += (i.totalDeal || 0);
           totalDebt += (i.debt || 0);
       }
       
       // "Внесено" суммируем по всем траншам
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
        tDeal += i.totalDeal; // Всего получено
        tExec += i.amount;    // Отработано
        tDebt += i.debt;      // Остаток
    });
    return { totalDeal: formatTotal(tDeal), received: formatTotal(tExec), debt: formatTotal(tDebt) };
});

const historySummary = computed(() => {
    const retailId = mainStore.retailIndividualId;
    let totalIn = 0, totalOut = 0;
    // Для истории берем сырые данные, чтобы показать общую картину, 
    // но можно тоже через dealStore, если там хранится полная история.
    // dealStore хранит всё.
    
    // Используем dealStore retail boxes
    dealStore.dealGroups.forEach((history, key) => {
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
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor relative-container">
      
      <div v-if="isLoading || isDeleting" class="loading-overlay">
          <div class="spinner"></div>
          <div class="loading-text">{{ isDeleting ? 'Удаление операции...' : 'Загрузка списка...' }}</div>
      </div>

      <div class="popup-header"><h3>{{ title }}</h3></div>

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
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; height: 50vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 90%; max-width: 1900px; border: 1px solid #ddd; }
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

.unified-grid { 
  display: grid; 
  grid-template-columns: 80px 100px 130px 130px 130px 120px 120px 120px 120px 120px 130px 60px 40px; 
  gap: 10px; 
  min-width: 1440px; 
}

.unified-grid.no-act-date {
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