<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import CreditWizardPopup from './CreditWizardPopup.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import DateRangePicker from './DateRangePicker.vue';

const props = defineProps({
  title: { type: String, default: 'Редактировать операции (Кредиты)' }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

// --- ТАБЫ ---
const activeTab = ref('active'); // 'active' | 'history' | 'schedule'

// --- СОСТОЯНИЕ ---
const localCredits = ref([]);
const historyItems = ref([]);
const scheduleItems = ref([]);
const isWizardVisible = ref(false);
const editingCreditItem = ref(null); // 🟢 Для режима настройки графика
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const isDeleting = ref(false);
const isSaving = ref(false);

// --- ФИЛЬТРЫ ---
const filters = ref({
    creditor: '',   // Выпадающий список (ID)
    amount: '',     // Текстовый поиск
    account: '',    // Выпадающий список (ID)
    owner: '',      // Выпадающий список (ID)
    payment: '',    // Текстовый поиск
    day: '',        // Текстовый поиск
    // Для истории
    dateRange: { from: null, to: null }
});

// --- СПРАВОЧНИКИ ДЛЯ ФИЛЬТРОВ ---
const accounts = computed(() => mainStore.accounts);

// Собираем всех владельцев (Компании + Физлица)
const ownersOptions = computed(() => {
    const opts = [];
    opts.push({ label: 'Компании', options: mainStore.companies.map(c => ({ value: `company-${c._id}`, label: c.name })) });
    opts.push({ label: 'Физлица', options: mainStore.individuals.map(i => ({ value: `individual-${i._id}`, label: i.name })) });
    return opts;
});

// Собираем всех кредиторов (Контрагенты + Физлица)
const creditorsOptions = computed(() => {
    const opts = [];
    opts.push({ label: 'Контрагенты', options: mainStore.contractors.map(c => ({ value: c._id, label: c.name })) });
    opts.push({ label: 'Физлица', options: mainStore.individuals.map(i => ({ value: i._id, label: i.name })) });
    return opts;
});

// --- ЗАГРУЗКА ДАННЫХ ---
const loadData = () => {
    // 1. ДЕЙСТВУЮЩИЕ КРЕДИТЫ
    const source = mainStore.currentCreditBalances.length ? mainStore.currentCreditBalances : mainStore.credits;

    localCredits.value = source.map(c => {
        // Определяем имя и ID кредитора для фильтрации
        let creditorName = c.name; 
        let creditorId = null;
        
        if (c.contractorId) {
            const contr = mainStore.contractors.find(x => x._id === (c.contractorId._id || c.contractorId));
            if (contr) { creditorName = contr.name; creditorId = contr._id; }
        } else if (c.individualId) {
            const ind = mainStore.individuals.find(x => x._id === (c.individualId._id || c.individualId));
            if (ind) { creditorName = ind.name; creditorId = ind._id; }
        }

        // Определяем владельца и счет
        let ownerName = '-';
        let ownerVal = '';
        let accountName = '-';
        let accountId = c.targetAccountId || null; // Если есть поле в модели, иначе ищем через операции (сложнее)
        // В рамках текущей модели Credit может не иметь прямой ссылки на targetAccountId, если он создан не через Wizard
        // Но для фильтрации попробуем найти
        
        // 🟢 Для отображения в списке нам важно понимать, настроен ли график
        const isConfigured = c.monthlyPayment > 0 && c.paymentDay > 0;

        return {
            ...c,
            // Данные для отображения/фильтрации
            creditorName,
            creditorId, 
            
            totalDebtFormatted: formatNumber(c.totalDebt),
            balanceFormatted: formatNumber(c.balance !== undefined ? c.balance : c.totalDebt),
            
            paymentFormatted: formatNumber(c.monthlyPayment),
            
            accountName, // В текущей реализации может быть пустым, если не сохранили при создании
            accountId, 
            
            ownerName,
            ownerVal, 
            
            isConfigured, // 🟢 Флаг для UI

            // Модели для редактирования
            editName: c.name,
            editPayment: formatNumber(c.monthlyPayment),
            editDay: c.paymentDay
        };
    });

    // 2. ИСТОРИЯ ПОГАШЕНИЙ
    const repaymentCatId = mainStore.loanRepaymentCategoryId;
    if (repaymentCatId) {
        historyItems.value = mainStore.allOperationsFlat.filter(op => {
            if (op.type !== 'expense') return false;
            const catId = op.categoryId?._id || op.categoryId;
            return catId === repaymentCatId;
        }).map(op => ({
            _id: op._id,
            date: new Date(op.date).toLocaleDateString(),
            rawDate: new Date(op.date),
            amount: formatNumber(Math.abs(op.amount)),
            creditor: op.contractorId?.name || op.counterpartyIndividualId?.name || '---',
            account: op.accountId?.name || '---'
        })).sort((a, b) => b.rawDate - a.rawDate);
    } else {
        historyItems.value = [];
    }

    // 3. ГРАФИК (Прогноз)
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

// --- ФИЛЬТРАЦИЯ ---
const filteredList = computed(() => {
    if (activeTab.value === 'active') {
        return localCredits.value.filter(item => {
            if (filters.value.creditor && item.creditorId !== filters.value.creditor) return false;
            if (filters.value.amount) {
                const q = filters.value.amount.trim();
                if (!item.totalDebtFormatted.includes(q) && !item.balanceFormatted.includes(q)) return false;
            }
            if (filters.value.account && item.accountId !== filters.value.account) return false;
            if (filters.value.owner && item.ownerVal !== filters.value.owner) return false;
            if (filters.value.payment && !item.paymentFormatted.includes(filters.value.payment)) return false;
            if (filters.value.day && String(item.paymentDay) !== filters.value.day) return false;
            return true;
        });
    }
    if (activeTab.value === 'history') {
        return historyItems.value.filter(item => {
            const { from, to } = filters.value.dateRange;
            if (from && item.rawDate < new Date(from)) return false;
            if (to && item.rawDate > new Date(to)) return false;
            return true;
        });
    }
    if (activeTab.value === 'schedule') {
        return scheduleItems.value;
    }
    return [];
});

// --- ИТОГИ ---
const summaryStats = computed(() => {
    if (activeTab.value === 'active') {
        const list = filteredList.value;
        const total = list.reduce((acc, c) => acc + (c.totalDebt || 0), 0);
        const balance = list.reduce((acc, c) => acc + (c.balance || 0), 0); 
        const payment = list.reduce((acc, c) => acc + (c.monthlyPayment || 0), 0);
        return { 
            l1: 'Общая сумма', v1: formatNumber(total), 
            l2: 'Платеж/мес', v2: formatNumber(payment), 
            l3: 'Остаток долга', v3: formatNumber(balance) 
        };
    }
    if (activeTab.value === 'history') {
        const list = filteredList.value;
        const totalPaid = list.reduce((acc, h) => acc + parseFloat(h.amount.replace(/\s/g, '')), 0);
        return {
            l1: 'Всего погашено', v1: formatNumber(totalPaid),
            l2: 'Операций', v2: list.length, 
            l3: '', v3: ''
        };
    }
    if (activeTab.value === 'schedule') {
        const list = filteredList.value;
        const totalFuture = list.reduce((acc, s) => acc + parseFloat(s.amount.replace(/\s/g, '')), 0);
        return {
            l1: 'К выплате', v1: formatNumber(totalFuture),
            l2: 'Платежей', v2: list.length,
            l3: '', v3: ''
        };
    }
    return { l1:'', v1:'', l2:'', v2:'', l3:'', v3:'' };
});

onMounted(async () => {
    await mainStore.fetchAllEntities(); 
    loadData();
});

watch(() => mainStore.credits, loadData, { deep: true });
watch(() => mainStore.allOperationsFlat, loadData, { deep: true });

// --- ACTIONS ---
const openWizard = () => { 
    editingCreditItem.value = null; // Сброс для создания нового
    isWizardVisible.value = true; 
};

// 🟢 Открыть визард для настройки существующего кредита
const openScheduleWizard = (item) => {
    editingCreditItem.value = item;
    isWizardVisible.value = true;
};

const handleWizardSave = async (payload) => {
    try {
        await mainStore.addCredit(payload);
        isWizardVisible.value = false;
        loadData();
    } catch (e) {
        alert('Ошибка при создании: ' + e.message);
    }
};

// 🟢 Обработка обновления существующего кредита
const handleWizardUpdate = async (payload) => {
    try {
        // payload содержит { _id, monthlyPayment, paymentDay, ... }
        // Используем batchUpdate для обновления одной записи
        await mainStore.batchUpdateEntities('credits', [payload]);
        isWizardVisible.value = false;
        editingCreditItem.value = null;
        loadData();
    } catch (e) {
        alert('Ошибка при обновлении: ' + e.message);
    }
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
    } catch(e) { alert(e.message); }
    finally { isDeleting.value = false; }
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      <div class="popup-header"><h3>{{ title }}</h3></div>

      <!-- TABS -->
      <div class="tabs-header">
          <button class="tab-btn" :class="{ active: activeTab === 'active' }" @click="activeTab = 'active'">Действующие кредиты</button>
          <button class="tab-btn" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">История погашений</button>
          <button class="tab-btn" :class="{ active: activeTab === 'schedule' }" @click="activeTab = 'schedule'">График платежей</button>
      </div>

      <!-- SUMMARY -->
      <div class="summary-bar" v-if="activeTab === 'active'">
          <div class="sum-item"><span class="sum-label">{{ summaryStats.l1 }}:</span><span class="sum-val">{{ summaryStats.v1 }} ₸</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">{{ summaryStats.l2 }}:</span><span class="sum-val income-text">{{ summaryStats.v2 }} ₸</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">{{ summaryStats.l3 }}:</span><span class="sum-val warn-text">{{ summaryStats.v3 }} ₸</span></div>
      </div>
      
      <!-- SUMMARY HISTORY -->
      <div class="summary-bar" v-else-if="activeTab === 'history'">
          <div class="sum-item"><span class="sum-label">{{ summaryStats.l1 }}:</span><span class="sum-val">{{ summaryStats.v1 }} ₸</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">{{ summaryStats.l2 }}:</span><span class="sum-val">{{ summaryStats.v2 }}</span></div>
      </div>

      <!-- SUMMARY SCHEDULE -->
      <div class="summary-bar" v-else-if="activeTab === 'schedule'">
          <div class="sum-item"><span class="sum-label">{{ summaryStats.l1 }}:</span><span class="sum-val">{{ summaryStats.v1 }} ₸</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">{{ summaryStats.l2 }}:</span><span class="sum-val">{{ summaryStats.v2 }}</span></div>
      </div>


      <!-- Вкладка 1: ДЕЙСТВУЮЩИЕ -->
      <template v-if="activeTab === 'active'">
          <!-- ФИЛЬТРЫ -->
          <div class="filters-row active-grid">
            <div class="filter-col">
               <select v-model="filters.creditor" class="filter-input filter-select">
                  <option value="">Кредитор</option>
                  <optgroup v-for="grp in creditorsOptions" :key="grp.label" :label="grp.label">
                      <option v-for="opt in grp.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </optgroup>
               </select>
            </div>
            <div class="filter-col"><input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма" /></div>
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
            <div class="filter-col"><input type="text" v-model="filters.payment" class="filter-input" placeholder="Платеж" /></div>
            <div class="filter-col"><input type="text" v-model="filters.day" class="filter-input" placeholder="День" /></div>
            <div class="filter-col col-trash"></div>
          </div>

          <div class="list-scroll">
             <div v-if="filteredList.length === 0" class="empty-state">Нет кредитов (или фильтр скрыл все).</div>
             
             <draggable v-model="localCredits" item-key="_id" handle=".drag-handle" ghost-class="ghost">
                <template #item="{ element: item }">
                   <div class="grid-row active-grid">
                      <!-- Редактируемые поля -->
                      <div class="col"><input type="text" v-model="item.editName" class="edit-input" /></div>
                      <!-- Остаток -->
                      <div class="col"><input type="text" v-model="item.balanceFormatted" class="edit-input amount-input" readonly style="background:#f9f9f9; color:#555;"/></div>
                      
                      <div class="col text-display">{{ item.accountName }}</div>
                      <div class="col text-display">{{ item.ownerName }}</div>

                      <!-- 🟢 ЛОГИКА ОТОБРАЖЕНИЯ: Если кредит настроен - поля ввода, если нет - КНОПКА -->
                      <template v-if="item.isConfigured">
                          <div class="col"><input type="text" v-model="item.editPayment" class="edit-input amount-input" /></div>
                          <div class="col"><input type="number" v-model="item.editDay" class="edit-input center-input" /></div>
                      </template>
                      <template v-else>
                          <div class="col" style="grid-column: span 2; display: flex; justify-content: center;">
                              <button class="btn-create-schedule" @click="openScheduleWizard(item)">
                                  📅 Создать график
                              </button>
                          </div>
                      </template>
                      
                      <div class="col-trash">
                        <button class="delete-btn" @click="askDelete(item)"><svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                      </div>
                   </div>
                </template>
             </draggable>
          </div>
      </template>

      <!-- Вкладка 2: ИСТОРИЯ -->
      <template v-else-if="activeTab === 'history'">
          <div class="filters-row history-grid">
             <div class="filter-col"><DateRangePicker v-model="filters.dateRange" placeholder="Период" /></div>
             <div class="filter-col header-label">КРЕДИТОР</div>
             <div class="filter-col header-label">СУММА ПОГАШЕНИЯ</div>
             <div class="filter-col header-label">СЧЕТ СПИСАНИЯ</div>
          </div>
          <div class="list-scroll">
              <div v-if="filteredList.length === 0" class="empty-state">Истории погашений нет.</div>
              <div v-for="op in filteredList" :key="op._id" class="grid-row history-grid">
                  <div class="col text-display">{{ op.date }}</div>
                  <div class="col text-display">{{ op.creditor }}</div>
                  <div class="col text-display expense">- {{ op.amount }} ₸</div>
                  <div class="col text-display">{{ op.account }}</div>
              </div>
          </div>
      </template>

      <!-- Вкладка 3: ГРАФИК -->
      <template v-else-if="activeTab === 'schedule'">
          <div class="filters-row schedule-grid">
             <div class="filter-col header-label">ДАТА</div>
             <div class="filter-col header-label">КРЕДИТ</div>
             <div class="filter-col header-label">СУММА ПЛАТЕЖА</div>
             <div class="filter-col header-label">ОСТАТОК ПОСЛЕ</div>
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
            <button v-if="activeTab === 'active'" class="btn-save">Сохранить изменения</button>
        </div>
      </div>
    </div>
    
    <!-- 🟢 Передаем editingCredit -->
    <CreditWizardPopup 
        v-if="isWizardVisible" 
        :editingCredit="editingCreditItem"
        @close="isWizardVisible = false"
        @save="handleWizardSave"
        @update="handleWizardUpdate" 
    />
    
    <ConfirmationPopup v-if="showDeleteConfirm" title="Удаление кредита" message="Удалить запись о кредите?" @close="showDeleteConfirm = false" @confirm="confirmDelete" />
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; max-height: 85vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 95%; max-width: 1300px; border: 1px solid #ddd; }
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
.filters-row { margin: 10px 0; }
.grid-row { padding: 4px 1.5rem; background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; margin-bottom: 6px; }

/* Active Grid: 8 cols + trash */
.active-grid { grid-template-columns: 140px 100px 120px 120px 120px 120px 100px 60px 40px; }
.history-grid { grid-template-columns: 120px 1fr 150px 150px; }
.schedule-grid { grid-template-columns: 120px 1fr 150px 150px; }

.header-label { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.text-display { font-size: 13px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.expense { color: var(--color-danger); }

.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; max-height: 55vh; scrollbar-width: none; }
.list-scroll::-webkit-scrollbar { display: none; }

/* Inputs */
.filter-input, .edit-input { width: 100%; height: 28px; border: 1px solid #ccc; border-radius: 6px; padding: 0 6px; font-size: 13px; background: #fff; box-sizing: border-box; }
.amount-input { text-align: right; font-weight: 700; }
.center-input { text-align: center; }
.filter-select { -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }

.delete-btn { width: 28px; height: 28px; border: 1px solid #E0E0E0; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.delete-btn:hover { border-color: #FF3B30; }
.delete-btn svg { width: 14px; stroke: #999; }
.delete-btn:hover svg { stroke: #FF3B30; }

/* 🟢 Стили для новой кнопки графика */
.btn-create-schedule {
    background: #E0E7FF;
    color: #4F46E5;
    border: 1px solid #C7D2FE;
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
}
.btn-create-schedule:hover {
    background: #4F46E5;
    color: white;
}

.popup-footer { padding: 1.5rem; border-top: 1px solid #E0E0E0; display: flex; justify-content: space-between; background: #F9F9F9; border-radius: 0 0 12px 12px; }
.footer-actions { display: flex; gap: 10px; }
.btn-add-new-footer { padding: 0 16px; height: 28px; border-radius: 6px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; border: none; display: flex; align-items: center; }
.btn-income { background: #10b981; }
.btn-close { padding: 0 16px; height: 28px; background: white; border: 1px solid #d1d5db; color: #374151; border-radius: 6px; cursor: pointer; font-size: 13px; }
.btn-save { padding: 0 16px; height: 28px; background: #111827; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }

.empty-state { text-align: center; padding: 3rem; color: #999; font-style: italic; }
</style>