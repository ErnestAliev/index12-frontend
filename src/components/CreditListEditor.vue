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

// Табы
const activeTab = ref('active'); // 'active' | 'history' | 'schedule'

const localCredits = ref([]);
const historyItems = ref([]);
const scheduleItems = ref([]);

const isWizardVisible = ref(false);
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const isDeleting = ref(false);
const isSaving = ref(false);

// Фильтры
const filters = ref({
    dateRange: { from: null, to: null },
    creditor: '',
    account: '',
    owner: '',
    project: '',
    category: '',
    amount: ''
});

// Справочники
const accounts = computed(() => mainStore.accounts);
const companies = computed(() => mainStore.companies);
const individuals = computed(() => mainStore.individuals);
const contractors = computed(() => mainStore.contractors);
const projects = computed(() => mainStore.projects);
const categories = computed(() => mainStore.categories);

// --- ЗАГРУЗКА ДАННЫХ ---
const loadData = () => {
    // 1. Действующие кредиты (Берем из computed currentCreditBalances, чтобы видеть актуальный остаток)
    // Если currentCreditBalances еще не готов, берем raw credits, но лучше computed.
    // mainStore.currentCreditBalances уже содержит поле `balance` (Долг - Погашения)
    const sourceCredits = mainStore.currentCreditBalances.length > 0 ? mainStore.currentCreditBalances : mainStore.credits;

    localCredits.value = sourceCredits.map(c => ({
        ...c,
        // Для UI
        amountFormatted: formatNumber(c.totalDebt), // Изначальная сумма
        balanceFormatted: formatNumber(c.balance !== undefined ? c.balance : c.totalDebt), // Текущий остаток
        paymentFormatted: formatNumber(c.monthlyPayment),
        
        // Временные поля для селектов (пока пустые, если в базе нет привязки)
        tempAccountId: c.accountId || null,
        tempOwnerId: c.individualId ? `individual-${c.individualId._id || c.individualId}` : null, 
        tempProjectId: null,
        tempCategoryId: null
    }));

    // 2. История погашений (Расход по категории "Погашение займов")
    const repaymentCatId = mainStore.loanRepaymentCategoryId;
    const allOps = mainStore.allOperationsFlat;
    
    historyItems.value = allOps.filter(op => {
        if (op.type !== 'expense') return false;
        const catId = op.categoryId?._id || op.categoryId;
        return repaymentCatId && catId === repaymentCatId;
    }).sort((a, b) => new Date(b.date) - new Date(a.date)).map(op => ({
        ...op,
        dateFormatted: new Date(op.date).toLocaleDateString(),
        amountFormatted: formatNumber(Math.abs(op.amount)),
        creditorName: op.contractorId?.name || '---',
        accountName: op.accountId?.name || '---'
    }));

    // 3. ГРАФИК ПЛАТЕЖЕЙ (ГЕНЕРАЦИЯ)
    // Поскольку мы не храним график в базе, мы генерируем прогноз на основе ТЕКУЩЕГО ОСТАТКА.
    scheduleItems.value = [];
    const today = new Date();
    
    localCredits.value.forEach(credit => {
        // Используем текущий баланс (остаток долга), чтобы график был актуальным
        const currentDebt = credit.balance !== undefined ? credit.balance : credit.totalDebt;
        const payment = credit.monthlyPayment || 0;
        const day = credit.paymentDay || 25;
        
        // Если долг погашен или платеж 0, графика нет
        if (currentDebt > 0 && payment > 0) {
            let remaining = currentDebt;
            let currentDt = new Date(today);
            
            // Находим ближайшую дату платежа
            if (currentDt.getDate() > day) {
                currentDt.setMonth(currentDt.getMonth() + 1);
            }
            currentDt.setDate(day);
            
            // Генерируем платежи пока долг не кончится (с лимитом, чтобы не зависнуть)
            let safety = 0;
            while (remaining > 0 && safety < 360) {
                let payAmount = Math.min(remaining, payment);
                let remAfter = remaining - payAmount;
                
                scheduleItems.value.push({
                    creditName: credit.name,
                    date: new Date(currentDt),
                    dateFormatted: currentDt.toLocaleDateString(),
                    amount: payAmount,
                    amountFormatted: formatNumber(payAmount),
                    remaining: remAfter,
                    remainingFormatted: formatNumber(remAfter),
                    status: 'Ожидается' 
                });
                
                remaining = remAfter;
                currentDt.setMonth(currentDt.getMonth() + 1);
                safety++;
            }
        }
    });
    // Сортируем общий график по дате
    scheduleItems.value.sort((a, b) => a.date - b.date);
};

onMounted(() => {
    if (mainStore.user) {
        loadData();
    }
});

watch(() => mainStore.credits, loadData, { deep: true });
watch(() => mainStore.currentCreditBalances, loadData, { deep: true }); // Следим за пересчетом балансов
watch(() => mainStore.allOperationsFlat, loadData, { deep: true }); 

// --- ВЫЧИСЛЯЕМЫЕ СВОЙСТВА ---

const filteredList = computed(() => {
    if (activeTab.value === 'active') {
        return localCredits.value.filter(item => {
            if (filters.value.amount && !String(item.totalDebt).includes(filters.value.amount)) return false;
            if (filters.value.creditor && item.contractorId !== filters.value.creditor) return false;
            return true;
        });
    }
    if (activeTab.value === 'history') {
        return historyItems.value.filter(item => {
             const { from, to } = filters.value.dateRange;
             if (from && new Date(item.date) < new Date(from)) return false;
             if (to && new Date(item.date) > new Date(to)) return false;
             return true;
        });
    }
    if (activeTab.value === 'schedule') {
        // Можно добавить фильтр по датам для графика
        return scheduleItems.value;
    }
    return [];
});

const summaryStats = computed(() => {
    if (activeTab.value === 'active') {
        const totalDebt = localCredits.value.reduce((acc, c) => acc + (c.totalDebt || 0), 0);
        const currentBalance = localCredits.value.reduce((acc, c) => acc + (c.balance || 0), 0);
        const totalMonthly = localCredits.value.reduce((acc, c) => acc + (c.monthlyPayment || 0), 0);
        return { 
            label1: 'Общая сумма', val1: formatNumber(totalDebt), 
            label2: 'Платеж/мес', val2: formatNumber(totalMonthly),
            label3: 'Остаток долга', val3: formatNumber(currentBalance) 
        };
    }
    if (activeTab.value === 'history') {
        const totalPaid = historyItems.value.reduce((acc, h) => acc + Math.abs(h.amount || 0), 0);
        return {
            label1: 'Всего погашено', val1: formatNumber(totalPaid),
            label2: 'Операций', val2: historyItems.value.length,
            label3: '', val3: ''
        };
    }
    if (activeTab.value === 'schedule') {
        let futurePay = 0;
        scheduleItems.value.forEach(s => futurePay += s.amount);
        return {
            label1: 'К выплате', val1: formatNumber(futurePay),
            label2: 'Платежей', val2: scheduleItems.value.length,
            label3: '', val3: ''
        };
    }
    return { label1: '', val1: '', label2: '', val2: '', label3: '', val3: '' };
});

// --- ДЕЙСТВИЯ ---

const handleCreateClick = () => {
    isWizardVisible.value = true;
};

const handleWizardSave = async (payload) => {
    isWizardVisible.value = false;
    try {
        await mainStore.ensureSystemEntities();
        
        let bankContractor = null;
        if (payload.contractorId) {
             bankContractor = mainStore.contractors.find(c => c._id === payload.contractorId);
        }
        if (!bankContractor && payload.name) {
             bankContractor = await mainStore.addContractor(payload.name);
        }

        const creditPayload = {
            name: payload.name,
            totalDebt: payload.totalDebt,
            monthlyPayment: payload.monthlyPayment,
            paymentDay: payload.paymentDay,
            contractorId: bankContractor?._id,
            individualId: payload.individualId
            // schedule не сохраняем, он генерируется
        };
        
        await mainStore.addCredit(creditPayload);
        
        await mainStore.fetchAllEntities();
        loadData();

    } catch (e) {
        console.error("Ошибка создания кредита:", e);
        alert("Не удалось создать кредит: " + e.message);
    }
};

const handleSaveChanges = async () => {
    emit('close');
};

const openDeleteDialog = (item) => {
    itemToDelete.value = item;
    showDeleteConfirm.value = true;
};

const confirmDelete = async () => {
    if (!itemToDelete.value) return;
    isDeleting.value = true;
    try {
        await mainStore.deleteEntity('credits', itemToDelete.value._id, false);
        showDeleteConfirm.value = false;
        itemToDelete.value = null;
    } catch (e) {
        alert('Ошибка удаления: ' + e.message);
    } finally {
        isDeleting.value = false;
    }
};

const cancelDelete = () => {
    showDeleteConfirm.value = false;
    itemToDelete.value = null;
};

// Хелперы для инпутов (заглушки, сохранение пока не реализовано для inline)
const onDebtInput = (item) => { /* ... */ };
const onPaymentInput = (item) => { /* ... */ };

</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      
      <div class="popup-header">
        <h3>{{ title }}</h3>
      </div>

      <!-- TABS -->
      <div class="tabs-header">
          <button class="tab-btn" :class="{ active: activeTab === 'active' }" @click="activeTab = 'active'">Действующие кредиты</button>
          <button class="tab-btn" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">История погашений</button>
          <button class="tab-btn" :class="{ active: activeTab === 'schedule' }" @click="activeTab = 'schedule'">График платежей</button>
      </div>

      <!-- SUMMARY BAR -->
      <div class="summary-bar" v-if="summaryStats.label1">
          <div class="sum-item">
              <span class="sum-label">{{ summaryStats.label1 }}:</span>
              <span class="sum-val">{{ summaryStats.val1 }} ₸</span>
          </div>
          <div class="sum-sep" v-if="summaryStats.label2">/</div>
          <div class="sum-item" v-if="summaryStats.label2">
              <span class="sum-label">{{ summaryStats.label2 }}:</span>
              <span class="sum-val income-text">{{ summaryStats.val2 }} ₸</span>
          </div>
          <div class="sum-sep" v-if="summaryStats.label3">/</div>
          <div class="sum-item" v-if="summaryStats.label3">
              <span class="sum-label">{{ summaryStats.label3 }}:</span>
              <span class="sum-val warn-text">{{ summaryStats.val3 }} ₸</span>
          </div>
      </div>
      
      <!-- --- Вкл. 1: ДЕЙСТВУЮЩИЕ КРЕДИТЫ --- -->
      <template v-if="activeTab === 'active'">
          <div class="filters-row active-grid">
            <div class="filter-col col-creditor">
               <select v-model="filters.creditor" class="filter-input filter-select">
                  <option value="">Кредитор</option>
                  <optgroup label="Контрагенты"><option v-for="c in contractors" :key="c._id" :value="c._id">{{ c.name }}</option></optgroup>
               </select>
            </div>
            <div class="filter-col col-amount"><input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма" /></div>
            <div class="filter-col col-account">
               <select v-model="filters.account" class="filter-input filter-select">
                  <option value="">Счет</option>
                  <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
               </select>
            </div>
            <div class="filter-col col-owner">
               <select v-model="filters.owner" class="filter-input filter-select">
                  <option value="">Владелец</option>
                  <optgroup label="Компании"><option v-for="c in companies" :key="c._id" :value="c._id">{{ c.name }}</option></optgroup>
               </select>
            </div>
            <div class="filter-col col-project">
               <select v-model="filters.project" class="filter-input filter-select">
                  <option value="">Проект</option>
                  <option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option>
               </select>
            </div>
            <div class="filter-col col-category">
               <select v-model="filters.category" class="filter-input filter-select">
                  <option value="">Категория</option>
                  <option v-for="c in categories" :key="c._id" :value="c._id">{{ c.name }}</option>
               </select>
            </div>
            <div class="filter-col col-payment"><input type="text" class="filter-input" placeholder="Платеж" /></div>
            <div class="filter-col col-day"><input type="text" class="filter-input" placeholder="День" /></div>
            <div class="filter-col col-trash"></div>
          </div>

          <div class="list-scroll">
             <div v-if="filteredList.length === 0" class="empty-state">Нет действующих кредитов.</div>
             <draggable v-model="localCredits" item-key="_id" handle=".drag-handle" ghost-class="ghost">
                <template #item="{ element: item }">
                   <div class="grid-row active-grid">
                      <div class="col-creditor"><input type="text" v-model="item.name" class="edit-input" /></div>
                      <div class="col-amount"><input type="text" v-model="item.balanceFormatted" @input="onDebtInput(item)" class="edit-input amount-input" /></div>
                      
                      <div class="col-account">
                          <select v-model="item.tempAccountId" class="edit-input select-input">
                              <option :value="null">-</option>
                              <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
                          </select>
                      </div>
                      <div class="col-owner">
                          <select v-model="item.tempOwnerId" class="edit-input select-input">
                              <option :value="null">-</option>
                              <optgroup label="Компании"><option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option></optgroup>
                          </select>
                      </div>
                      <div class="col-project">
                          <select v-model="item.tempProjectId" class="edit-input select-input">
                               <option :value="null">-</option>
                               <option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option>
                          </select>
                      </div>
                      <div class="col-category">
                          <select v-model="item.tempCategoryId" class="edit-input select-input">
                               <option :value="null">-</option>
                               <option v-for="c in categories" :key="c._id" :value="c._id">{{ c.name }}</option>
                          </select>
                      </div>

                      <div class="col-payment"><input type="text" v-model="item.paymentFormatted" @input="onPaymentInput(item)" class="edit-input amount-input" /></div>
                      <div class="col-day"><input type="number" v-model="item.paymentDay" class="edit-input center-input" min="1" max="31" /></div>
                      
                      <div class="col-trash">
                        <button class="delete-btn" @click="openDeleteDialog(item)" title="Удалить">
                           <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                   </div>
                </template>
             </draggable>
          </div>
      </template>

      <!-- --- Вкл. 2: ИСТОРИЯ ПОГАШЕНИЙ --- -->
      <template v-else-if="activeTab === 'history'">
          <div class="filters-row history-grid">
              <div class="filter-col"><DateRangePicker v-model="filters.dateRange" placeholder="Период" /></div>
              <div class="filter-col"><span class="header-label">Кредитор</span></div>
              <div class="filter-col"><span class="header-label">Сумма погашения</span></div>
              <div class="filter-col"><span class="header-label">Счет списания</span></div>
          </div>
          <div class="list-scroll">
               <div v-if="filteredList.length === 0" class="empty-state">История пуста.</div>
               <div v-for="op in filteredList" :key="op._id" class="grid-row history-grid">
                   <div class="col-date text-display">{{ op.dateFormatted }}</div>
                   <div class="col-creditor text-display">{{ op.creditorName }}</div>
                   <div class="col-amount text-display expense">- {{ op.amountFormatted }}</div>
                   <div class="col-account text-display">{{ op.accountName }}</div>
               </div>
          </div>
      </template>

      <!-- --- Вкл. 3: ГРАФИК ПЛАТЕЖЕЙ --- -->
      <template v-else-if="activeTab === 'schedule'">
          <div class="filters-row schedule-grid">
              <div class="filter-col"><span class="header-label">Дата</span></div>
              <div class="filter-col"><span class="header-label">Кредит</span></div>
              <div class="filter-col"><span class="header-label">Сумма платежа</span></div>
              <div class="filter-col"><span class="header-label">Остаток после</span></div>
          </div>
          <div class="list-scroll">
               <div v-if="filteredList.length === 0" class="empty-state">График пуст (или кредит погашен).</div>
               <div v-for="item in filteredList" :key="item._id" class="grid-row schedule-grid">
                    <div class="col-date text-display">{{ item.dateFormatted }}</div>
                    <div class="col-name text-display">{{ item.creditName }}</div>
                    <div class="col-amount text-display expense">{{ item.amountFormatted }}</div>
                    <div class="col-rem text-display">{{ item.remainingFormatted }}</div>
               </div>
          </div>
      </template>

      <div class="popup-footer">
        <div class="footer-left-actions">
            <button v-if="activeTab === 'active'" class="btn-add-new-footer btn-income" @click="handleCreateClick">
              + Создать
            </button>
        </div>
        <div class="footer-actions">
            <button class="btn-close" @click="$emit('close')">Закрыть</button>
            <button v-if="activeTab === 'active'" class="btn-save" :disabled="isSaving" @click="handleSaveChanges">Сохранить изменения</button>
        </div>
      </div>
    </div>

    <!-- Визард -->
    <CreditWizardPopup 
        v-if="isWizardVisible" 
        @close="isWizardVisible = false" 
        @save="handleWizardSave" 
    />

    <!-- Удаление -->
    <ConfirmationPopup 
        v-if="showDeleteConfirm" 
        title="Удаление кредита" 
        message="Вы уверены? История погашений останется в операциях." 
        confirmText="Удалить"
        @close="showDeleteConfirm = false" 
        @confirm="confirmDelete" 
    />

  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; max-height: 85vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 95%; max-width: 1300px; border: 1px solid #ddd; }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 24px; color: #111827; font-weight: 700; letter-spacing: -0.02em; }

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

/* GRIDS DEFINITIONS */
.filters-row, .grid-row { display: grid; gap: 10px; align-items: center; padding: 0 1.5rem; }
.filters-row { margin: 10px 0; }
.grid-row { padding: 4px 1.5rem; background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; margin-bottom: 6px; transition: box-shadow 0.2s; }
.grid-row:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-color: #ccc; }

/* Active Credits Grid: Creditor | Amount | Account | Owner | Project | Category | Payment | Day | Trash */
.active-grid { grid-template-columns: 160px 110px 130px 130px 130px 130px 110px 60px 40px; }

/* History Grid */
.history-grid { grid-template-columns: 120px 1fr 150px 150px; }

/* Schedule Grid */
.schedule-grid { grid-template-columns: 120px 1fr 150px 150px; }

.header-label { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.text-display { font-size: 13px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; max-height: 55vh; scrollbar-width: none; }
.list-scroll::-webkit-scrollbar { display: none; }

.edit-input { width: 100%; height: 28px; background: #FFFFFF; border: 1px solid #ccc; border-radius: 6px; padding: 0 10px; font-size: 13px; color: #333; display: block; box-sizing: border-box; }
.filter-input { width: 100%; height: 28px; border: 1px solid #ccc; border-radius: 6px; padding: 0 6px; font-size: 13px; background-color: #fff; display: block; box-sizing: border-box; }
.filter-select, .select-input { -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.amount-input { text-align: right; font-weight: 700; color: #333; }
.center-input { text-align: center; }
.expense { color: var(--color-danger); font-weight: 500; }

.delete-btn { width: 28px; height: 28px; border: 1px solid #E0E0E0; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; color: #999; margin: 0; padding: 0; }
.delete-btn:hover { border-color: #FF3B30; background: #FFF5F5; color: #FF3B30; }
.delete-btn svg { width: 14px; height: 14px; stroke: currentColor; }

.empty-state { text-align: center; padding: 4rem; color: #9ca3af; font-style: italic; }

.popup-footer { padding: 1.5rem; border-top: 1px solid #E0E0E0; display: flex; justify-content: space-between; align-items: center; background-color: #F9F9F9; border-radius: 0 0 12px 12px; }
.footer-left-actions { display: flex; gap: 10px; }
.footer-actions { display: flex; gap: 10px; }
.btn-add-new-footer { padding: 0 16px; height: 28px; border-radius: 6px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; display: flex; align-items: center; transition: all 0.2s; }
.btn-income { background: #10b981; } 
.btn-income:hover { background: #059669; }
.btn-close { padding: 0 16px; height: 28px; background: white; border: 1px solid #d1d5db; color: #374151; border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 13px; }
.btn-close:hover { background: #f3f4f6; }
.btn-save { padding: 0 16px; height: 28px; background: #111827; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; }
.btn-save:hover { background: #374151; }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

@media (max-width: 1200px) {
    .filters-row { display: none; }
    .grid-row { display: flex; flex-direction: column; height: auto; padding: 1rem; gap: 10px; }
}
</style>