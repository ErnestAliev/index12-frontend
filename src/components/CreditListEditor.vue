<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import CreditWizardPopup from './CreditWizardPopup.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import DateRangePicker from './DateRangePicker.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v28.7 - SELECT FILTERS FOR HISTORY & SCHEDULE ---
 * * ВЕРСИЯ: 28.7
 * * ДАТА: 2025-12-01
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (Template) Вкладка "История": Фильтр "Кредитор" заменен на select (выбор из контрагентов/физлиц).
 * 2. (Template) Вкладка "График": Фильтр "Кредит" заменен на select (выбор из списка активных кредитов).
 * 3. (Logic) loadData: Добавлены поля creditorId (в историю) и creditId (в график) для точной фильтрации.
 * 4. (Logic) filteredList: Обновлена логика фильтрации для select-полей (точное совпадение ID).
 */

const props = defineProps({
  title: { type: String, default: 'Редактировать операции (Кредиты)' }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const activeTab = ref('active'); 

const localCredits = ref([]);
const historyItems = ref([]);
const scheduleItems = ref([]);
const isWizardVisible = ref(false);
const editingCreditItem = ref(null); 
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const isDeleting = ref(false);

// Фильтры
const filters = ref({
    dateRange: { from: null, to: null }, 
    creditor: '',   
    amount: '',     
    balance: '',    
    account: '',    
    owner: '',      
    project: '',
    category: '',
});

// Сброс фильтров при переключении вкладок
watch(activeTab, () => {
    filters.value = {
        dateRange: { from: null, to: null }, 
        creditor: '',   
        amount: '',     
        balance: '',    
        account: '',    
        owner: '',      
        project: '',
        category: '',
    };
});

const accounts = computed(() => mainStore.accounts);
const projects = computed(() => mainStore.projects);
const categories = computed(() => mainStore.categories);

// Опции для выбора владельца (Компании/Физлица)
const ownersOptions = computed(() => {
    const opts = [];
    opts.push({ label: 'Компании', options: mainStore.companies.map(c => ({ value: `company-${c._id}`, label: c.name })) });
    opts.push({ label: 'Физлица', options: mainStore.individuals.map(i => ({ value: `individual-${i._id}`, label: i.name })) });
    return opts;
});

// Опции для выбора кредитора (Контрагенты/Физлица)
const creditorsOptions = computed(() => {
    const opts = [];
    opts.push({ label: 'Контрагенты', options: mainStore.contractors.map(c => ({ value: c._id, label: c.name })) });
    opts.push({ label: 'Физлица', options: mainStore.individuals.map(i => ({ value: i._id, label: i.name })) });
    return opts;
});

// Опции для выбора Кредита (для вкладки График)
const activeCreditsOptions = computed(() => {
    return localCredits.value.map(c => ({ value: c._id, label: c.name }));
});

const toInputDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const toDisplayDate = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    return d.toLocaleDateString('ru-RU');
};

const loadData = () => {
    // 1. ДЕЙСТВУЮЩИЕ КРЕДИТЫ
    const source = mainStore.currentCreditBalances.length ? mainStore.currentCreditBalances : mainStore.credits;

    localCredits.value = source.map(c => {
        let creditorName = c.name; 
        let creditorId = null;
        
        if (c.contractorId) {
            const contr = mainStore.contractors.find(x => x._id === (c.contractorId._id || c.contractorId));
            if (contr) { creditorName = contr.name; creditorId = contr._id; }
        } else if (c.individualId) {
            const ind = mainStore.individuals.find(x => x._id === (c.individualId._id || c.individualId));
            if (ind) { creditorName = ind.name; creditorId = ind._id; }
        }

        let accountName = '-';
        let accountId = c.targetAccountId || c.accountId || null;
        if (accountId) {
            const acc = mainStore.accounts.find(a => a._id === accountId);
            if (acc) accountName = acc.name;
        }

        let ownerName = '-';
        let ownerVal = '';
        if (accountId) {
            const acc = mainStore.accounts.find(a => a._id === accountId);
            if (acc) {
                 if (acc.companyId) {
                     const cId = typeof acc.companyId === 'object' ? acc.companyId._id : acc.companyId;
                     const comp = mainStore.companies.find(x => x._id === cId);
                     if (comp) { ownerName = comp.name; ownerVal = `company-${cId}`; }
                 } else if (acc.individualId) {
                     const iId = typeof acc.individualId === 'object' ? acc.individualId._id : acc.individualId;
                     const ind = mainStore.individuals.find(x => x._id === iId);
                     if (ind) { ownerName = ind.name; ownerVal = `individual-${iId}`; }
                 }
            }
        }

        const isConfigured = c.monthlyPayment > 0 && c.paymentDay > 0;

        let projectName = '-';
        const pId = c.projectId ? (c.projectId._id || c.projectId) : null;
        if (pId) {
            const p = mainStore.projects.find(x => x._id === pId);
            if (p) projectName = p.name;
        }

        let categoryName = '-';
        const catId = c.categoryId ? (c.categoryId._id || c.categoryId) : null;
        if (catId) {
            const cat = mainStore.categories.find(x => x._id === catId);
            if (cat) categoryName = cat.name;
        }

        return {
            ...c,
            dateFormatted: toInputDate(c.date || new Date()), 
            displayDate: toDisplayDate(c.date || new Date()),
            creditorName,
            creditorId, 
            
            totalDebtFormatted: formatNumber(c.totalDebt),
            balanceFormatted: formatNumber(c.balance !== undefined ? c.balance : c.totalDebt),
            paymentFormatted: formatNumber(c.monthlyPayment),
            
            accountName,
            accountId,
            ownerName, 
            ownerVal, 
            projectName, 
            categoryName, 
            
            projectId: pId,
            categoryId: catId,

            isConfigured,
            editName: c.name,
            editPayment: formatNumber(c.monthlyPayment),
            editDay: c.paymentDay
        };
    });

    // 2. ИСТОРИЯ
    const repaymentCatId = mainStore.loanRepaymentCategoryId;
    if (repaymentCatId) {
        historyItems.value = mainStore.allOperationsFlat.filter(op => {
            if (op.type !== 'expense') return false;
            const catId = op.categoryId?._id || op.categoryId;
            return String(catId) === String(repaymentCatId);
        }).map(op => ({
            _id: op._id,
            date: new Date(op.date).toLocaleDateString(),
            rawDate: new Date(op.date),
            amount: formatNumber(Math.abs(op.amount)),
            creditor: op.contractorId?.name || op.counterpartyIndividualId?.name || '---',
            // Сохраняем ID кредитора для фильтрации (Select)
            creditorId: (op.contractorId?._id || op.contractorId) || (op.counterpartyIndividualId?._id || op.counterpartyIndividualId),
            account: op.accountId?.name || '---'
        })).sort((a, b) => b.rawDate - a.rawDate);
    } else {
        historyItems.value = [];
    }

    // 3. ГРАФИК
    scheduleItems.value = [];
    const today = new Date();
    
    localCredits.value.forEach(credit => {
        const currentDebt = credit.balance !== undefined ? credit.balance : credit.totalDebt;
        const payment = credit.monthlyPayment || 0;
        const day = credit.paymentDay || 25;

        if (currentDebt > 0 && payment > 0) {
            let remaining = currentDebt;
            let currentDt = new Date(today);
            if (currentDt.getDate() > day) currentDt.setMonth(currentDt.getMonth() + 1);
            currentDt.setDate(day);

            let safety = 0;
            while (remaining > 0 && safety < 60) { 
                let payAmount = Math.min(remaining, payment);
                let remAfter = remaining - payAmount;
                scheduleItems.value.push({
                    _id: `${credit._id}_${safety}`,
                    date: currentDt.toLocaleDateString(),
                    rawDate: new Date(currentDt),
                    creditName: credit.name,
                    creditId: credit._id, // ID кредита для фильтрации
                    amount: formatNumber(payAmount),
                    remaining: formatNumber(remAfter)
                });
                remaining = remAfter;
                currentDt.setMonth(currentDt.getMonth() + 1);
                safety++;
            }
        }
    });
    scheduleItems.value.sort((a, b) => a.rawDate - b.rawDate);
};

const filteredList = computed(() => {
    const { from, to } = filters.value.dateRange;
    const fDate = (itemDate) => {
        if (from && itemDate < new Date(from)) return false;
        if (to && itemDate > new Date(to)) return false;
        return true;
    };
    
    // Вспомогательная функция для текстового поиска
    const matchText = (val, filter) => {
        if (!filter) return true;
        if (!val) return false;
        const cleanVal = String(val).toLowerCase().replace(/\s/g, '');
        const cleanFilter = filter.toLowerCase().replace(/\s/g, '');
        return cleanVal.includes(cleanFilter);
    };

    // --- 1. АКТИВНЫЕ КРЕДИТЫ ---
    if (activeTab.value === 'active') {
        return localCredits.value.filter(item => {
            if (from && item.dateFormatted < from) return false;
            if (to && item.dateFormatted > to) return false;

            if (filters.value.creditor && item.creditorId !== filters.value.creditor) return false;
            if (filters.value.amount && !item.totalDebtFormatted.includes(filters.value.amount)) return false;
            if (filters.value.balance && !item.balanceFormatted.includes(filters.value.balance)) return false;

            if (filters.value.account && item.accountId !== filters.value.account) return false;
            if (filters.value.project && item.projectId !== filters.value.project) return false;
            if (filters.value.category && item.categoryId !== filters.value.category) return false;
            return true;
        });
    }
    
    // --- 2. ИСТОРИЯ ---
    if (activeTab.value === 'history') {
        return historyItems.value.filter(item => {
            if (!fDate(item.rawDate)) return false;
            
            // Фильтр по Кредитору теперь через Select (ID)
            if (filters.value.creditor && item.creditorId !== filters.value.creditor) return false;
            
            if (!matchText(item.amount, filters.value.amount)) return false;
            if (!matchText(item.account, filters.value.account)) return false;
            return true;
        });
    }
    
    // --- 3. ГРАФИК ---
    if (activeTab.value === 'schedule') {
        return scheduleItems.value.filter(item => {
            if (!fDate(item.rawDate)) return false;
            
            // Фильтр по Кредиту теперь через Select (Credit ID)
            // Используем filters.creditor как переменную для хранения ID кредита в этой вкладке
            if (filters.value.creditor && item.creditId !== filters.value.creditor) return false;
            
            if (!matchText(item.amount, filters.value.amount)) return false;
            if (!matchText(item.remaining, filters.value.balance)) return false;
            return true;
        });
    }
    return [];
});

const summaryStats = computed(() => {
    const source = activeTab.value === 'active' ? filteredList.value : localCredits.value;
    const total = source.reduce((acc, c) => acc + (c.totalDebt || 0), 0);
    const balance = source.reduce((acc, c) => acc + (c.balance || 0), 0); 
    const payment = source.reduce((acc, c) => acc + (c.monthlyPayment || 0), 0);
    
    return { 
        l1: 'Общая сумма', v1: formatNumber(total), 
        l2: 'Остаток долга', v2: formatNumber(balance),
        l3: 'Ежемесячный платеж', v3: formatNumber(payment) 
    };
});

onMounted(async () => {
    await mainStore.fetchAllEntities(); 
    loadData();
});

watch(() => mainStore.credits, loadData, { deep: true });
watch(() => mainStore.allOperationsFlat, loadData, { deep: true });

const openWizard = () => { 
    editingCreditItem.value = null; 
    isWizardVisible.value = true; 
};

const openScheduleWizard = (item) => {
    editingCreditItem.value = item;
    isWizardVisible.value = true;
};

const handleWizardSave = async (payload) => {
    try {
        await mainStore.addCredit(payload);
        isWizardVisible.value = false;
        loadData();
    } catch (e) { alert('Ошибка: ' + e.message); }
};

const handleWizardUpdate = async (payload) => {
    try {
        await mainStore.batchUpdateEntities('credits', [payload]);
        isWizardVisible.value = false;
        editingCreditItem.value = null;
        loadData();
    } catch (e) { alert('Ошибка обновления: ' + e.message); }
};

const askDelete = (item) => { itemToDelete.value = item; showDeleteConfirm.value = true; };
const confirmDelete = async () => {
    if (!itemToDelete.value) return;
    isDeleting.value = true;
    try {
        await mainStore.deleteEntity('credits', itemToDelete.value._id, false);
        showDeleteConfirm.value = false;
        itemToDelete.value = null;
        loadData();
    } catch(e) { alert('Ошибка при удалении: ' + e.message); }
    finally { isDeleting.value = false; }
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      <div class="popup-header"><h3>{{ title }}</h3></div>

      <div class="tabs-header">
          <button class="tab-btn" :class="{ active: activeTab === 'active' }" @click="activeTab = 'active'">Действующие кредиты</button>
          <button class="tab-btn" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">История погашений</button>
          <button class="tab-btn" :class="{ active: activeTab === 'schedule' }" @click="activeTab = 'schedule'">График платежей</button>
      </div>

      <div class="summary-bar">
          <div class="sum-item"><span class="sum-label">{{ summaryStats.l1 }}:</span><span class="sum-val">{{ summaryStats.v1 }} ₸</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">{{ summaryStats.l2 }}:</span><span class="sum-val warn-text">{{ summaryStats.v2 }} ₸</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">{{ summaryStats.l3 }}:</span><span class="sum-val">{{ summaryStats.v3 }} ₸</span></div>
      </div>

      <template v-if="activeTab === 'active'">
          <div class="filters-row active-grid">
            <div class="filter-col col-date">
               <DateRangePicker v-model="filters.dateRange" placeholder="Период" />
            </div>
            
            <div class="filter-col">
               <select v-model="filters.creditor" class="filter-input filter-select">
                  <option value="">Кредитор</option>
                  <optgroup v-for="grp in creditorsOptions" :key="grp.label" :label="grp.label">
                      <option v-for="opt in grp.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </optgroup>
               </select>
            </div>
            
            <div class="filter-col"><input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма" /></div>
            <div class="filter-col"><input type="text" v-model="filters.balance" class="filter-input" placeholder="Остаток" /></div>
            
            <div class="filter-col">
               <select v-model="filters.account" class="filter-input filter-select">
                  <option value="">Счет</option>
                  <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
               </select>
            </div>
            
            <div class="filter-col">
               <select v-model="filters.owner" class="filter-input filter-select">
                  <option value="">Владелец</option>
                  <optgroup v-for="grp in ownersOptions" :key="grp.label" :label="grp.label">
                      <option v-for="opt in grp.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </optgroup>
               </select>
            </div>
            
            <div class="filter-col">
               <select v-model="filters.project" class="filter-input filter-select">
                  <option value="">Проект</option>
                  <option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option>
               </select>
            </div>
            
            <div class="filter-col">
               <select v-model="filters.category" class="filter-input filter-select">
                  <option value="">Категория</option>
                  <option v-for="c in categories" :key="c._id" :value="c._id">{{ c.name }}</option>
               </select>
            </div>
            
            <div class="filter-col header-label center-text">График</div>
            <div class="filter-col col-trash"></div>
          </div>

          <div class="list-scroll">
             <div v-if="filteredList.length === 0" class="empty-state">Нет кредитов.</div>
             
             <draggable v-model="localCredits" item-key="_id" handle=".drag-handle" ghost-class="ghost">
                <template #item="{ element: item }">
                   <div class="grid-row active-grid">
                      <div class="col text-display">{{ item.displayDate }}</div>

                      <div class="col text-display">{{ item.creditorName }}</div>
                      
                      <div class="col text-display">{{ item.totalDebtFormatted }} ₸</div>
                      
                      <div class="col text-display highlight-text">{{ item.balanceFormatted }} ₸</div>
                      
                      <div class="col text-display">{{ item.accountName }}</div>
                      
                      <div class="col text-display">{{ item.ownerName }}</div>

                      <div class="col text-display">{{ item.projectName }}</div>

                      <div class="col text-display">{{ item.categoryName }}</div>
                      
                      <div class="col center-content">
                          <button v-if="!item.isConfigured" class="btn-icon-blue-square" @click="openScheduleWizard(item)" title="Создать график платежей">
                             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                          </button>
                          <div v-else class="schedule-info" @click="openScheduleWizard(item)" title="Изменить график">
                              <span>{{ item.editPayment }} / {{ item.editDay }}</span>
                          </div>
                      </div>
                      
                      <div class="col-trash">
                        <button class="delete-btn" @click="askDelete(item)"><svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                      </div>
                   </div>
                </template>
             </draggable>
          </div>
      </template>

      <template v-else-if="activeTab === 'history'">
          <div class="filters-row history-grid">
             <div class="filter-col"><DateRangePicker v-model="filters.dateRange" placeholder="Период" /></div>
             <div class="filter-col">
                <!-- Замена input на select -->
                <select v-model="filters.creditor" class="filter-input filter-select">
                  <option value="">Кредитор</option>
                  <optgroup v-for="grp in creditorsOptions" :key="grp.label" :label="grp.label">
                      <option v-for="opt in grp.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </optgroup>
               </select>
             </div>
             <div class="filter-col"><input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма" /></div>
             <div class="filter-col"><input type="text" v-model="filters.account" class="filter-input" placeholder="Счет" /></div>
          </div>
          <div class="list-scroll">
              <div v-if="filteredList.length === 0" class="empty-state">Истории нет.</div>
              <div v-for="op in filteredList" :key="op._id" class="grid-row history-grid">
                  <div class="col text-display">{{ op.date }}</div>
                  <div class="col text-display">{{ op.creditor }}</div>
                  <div class="col text-display expense">- {{ op.amount }} ₸</div>
                  <div class="col text-display">{{ op.account }}</div>
              </div>
          </div>
      </template>

      <template v-else-if="activeTab === 'schedule'">
          <div class="filters-row schedule-grid">
             <div class="filter-col"><DateRangePicker v-model="filters.dateRange" placeholder="Период" /></div>
             <div class="filter-col">
                <!-- Замена input на select -->
                <select v-model="filters.creditor" class="filter-input filter-select">
                  <option value="">Кредит</option>
                  <option v-for="c in activeCreditsOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
               </select>
             </div>
             <div class="filter-col"><input type="text" v-model="filters.amount" class="filter-input" placeholder="Платеж" /></div>
             <div class="filter-col"><input type="text" v-model="filters.balance" class="filter-input" placeholder="Остаток" /></div>
          </div>
          <div class="list-scroll">
              <div v-if="filteredList.length === 0" class="empty-state">График пуст.</div>
              <div v-for="s in filteredList" :key="s._id" class="grid-row schedule-grid">
                  <div class="col text-display">{{ s.date }}</div>
                  <div class="col text-display">{{ s.creditName }}</div>
                  <div class="col text-display expense">{{ s.amount }} ₸</div>
                  <div class="col text-display">{{ s.remaining }} ₸</div>
              </div>
          </div>
      </template>

      <div class="popup-footer">
        <div class="footer-left-actions">
            <button v-if="activeTab === 'active'" class="btn-add-new-footer btn-income" @click="openWizard">+ Создать</button>
        </div>
        <div class="footer-actions">
            <button class="btn-close" @click="$emit('close')">Закрыть</button>
        </div>
      </div>
    </div>
    
    <CreditWizardPopup v-if="isWizardVisible" :editingCredit="editingCreditItem" @close="isWizardVisible = false" @save="handleWizardSave" @update="handleWizardUpdate" />
    <ConfirmationPopup v-if="showDeleteConfirm" title="Удаление кредита" message="Удалить запись о кредите?" @close="showDeleteConfirm = false" @confirm="confirmDelete" />
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; height: 50vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 95%; max-width: 1400px; border: 1px solid #ddd; }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 24px; color: #111827; font-weight: 700; }

.tabs-header { display: flex; gap: 24px; padding: 0 1.5rem; margin-top: 1rem; border-bottom: 1px solid #e5e7eb; }
.tab-btn { background: none; border: none; border-bottom: 3px solid transparent; font-size: 15px; font-weight: 600; color: #6b7280; padding: 12px 0; cursor: pointer; transition: all 0.2s; }
.tab-btn.active { color: #111827; border-color: #111827; }
.tab-btn:hover { color: #374151; }

.summary-bar { display: flex; align-items: center; gap: 15px; padding: 15px 24px; background-color: #fff; border-bottom: 1px solid #eee; font-size: 15px; color: #333; }
.sum-item { display: flex; gap: 6px; }
.sum-label { color: #666; }
.sum-val { font-weight: 700; }
.sum-sep { color: #ddd; }
.income-text { color: #10b981; }
.warn-text { color: #f59e0b; }

/* GRIDS */
.filters-row, .grid-row { display: grid; gap: 10px; align-items: center; padding: 0 1.5rem; }
.filters-row { margin: 0px; }
.grid-row { padding: 8px 1.5rem; background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; margin-bottom: 6px; }

/* 🟢 FIX: 10 колонок с фиксированными размерами для ровного выравнивания */
.active-grid { 
  grid-template-columns: 130px minmax(10px, 1fr) 100px 99px minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) 100px 40px
}
.history-grid { grid-template-columns: 130px minmax(10px, 1fr) 100px 99px minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) 100px 40px }
.schedule-grid { grid-template-columns: 130px minmax(10px, 1fr) 100px 99px minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) 100px 40px }

.header-label { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.center-text { text-align: center; }
.text-display { font-size: 13px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.expense { color: var(--color-danger); }
.highlight-text { font-weight: 800; color: #222; }

.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; max-height: 55vh; scrollbar-width: none; }
.list-scroll::-webkit-scrollbar { display: none; }

/* Inputs 28px */
.filter-input, .edit-input { 
  width: 100%; height: 28px; border: 1px solid #ccc; border-radius: 6px; 
  padding: 0 6px; font-size: 10px; background: #fff; box-sizing: border-box; color: #333; 
}
.filter-input:focus, .edit-input:focus { outline: none; border-color: #222; }
.filter-select { 
  -webkit-appearance: none; appearance: none; 
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); 
  background-repeat: no-repeat; background-position: right 10px center; 
  padding-right: 30px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; 
}

/* Delete Btn */
.delete-btn { width: 28px; height: 28px; border: 1px solid #E0E0E0; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.delete-btn:hover { border-color: #FF3B30; background: #FFF5F5; }
.delete-btn svg { width: 14px; stroke: #999; transition: stroke 0.2s; }
.delete-btn:hover svg { stroke: #FF3B30; }

/* 🟢 Кнопка-квадрат для графика */
.btn-icon-blue-square {
     height: 28px;
    border: 1px solid #C7D2FE; background: #E0E7FF;
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.2s;
    color: #4F46E5;
}
.btn-icon-blue-square:hover { background: #4F46E5; color: white; }
.btn-icon-blue-square svg { width: 16px; height: 16px; }

.schedule-info {
    font-size: 12px; color: #666; background: #f3f4f6;
    padding: 4px; border-radius: 4px; cursor: pointer;
    text-align: center; height: 28px; display: flex; align-items: center; justify-content: center; width: 100%;
}
.schedule-info:hover { background: #e5e7eb; }
.center-content { display: flex; justify-content: center; align-items: center; }

.popup-footer { padding: 1.5rem; border-top: 1px solid #E0E0E0; display: flex; justify-content: space-between; align-items: center; background: #F9F9F9; border-radius: 0 0 12px 12px; }
.footer-actions { display: flex; gap: 10px; }
.btn-add-new-footer { padding: 0 16px; height: 28px; border-radius: 6px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; border: none; display: flex; align-items: center; }
.btn-income { background: #10b981; }
.btn-close { padding: 0 16px; height: 28px; background: white; border: 1px solid #d1d5db; color: #374151; border-radius: 6px; cursor: pointer; font-size: 13px; }
.btn-save { padding: 0 16px; height: 28px; background: #111827; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }

.empty-state { text-align: center; padding: 3rem; color: #999; font-style: italic; }
</style>