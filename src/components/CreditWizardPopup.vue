<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';
import BaseSelect from './BaseSelect.vue';

const emit = defineEmits(['close', 'save']);
const mainStore = useMainStore();

// --- Вкладки (как в редакторе предоплат) ---
const activeTab = ref('params'); // 'params' | 'schedule'

// --- Данные формы ---
const selectedCreditorValue = ref(null); // ID кредитора
const balance = ref(''); // Сумма кредита
const selectedAccountId = ref(null); // Счет
const selectedOwnerValue = ref(null); // Владелец
const monthlyPayment = ref(''); // Платеж
const paymentDay = ref(''); // День

// --- Состояния создания (Inline) ---
const isCreatingCreditor = ref(false); const newCreditorName = ref(''); const newCreditorType = ref('contractor'); const newCreditorInputRef = ref(null);
const isCreatingAccount = ref(false); const newAccountName = ref(''); const newAccountInputRef = ref(null);
const isCreatingOwner = ref(false); const newOwnerName = ref(''); const newOwnerType = ref('company'); const newOwnerInputRef = ref(null);
const isSavingInline = ref(false);

// --- Состояние графика ---
const schedule = ref([]);

// --- Форматтеры ---
const formatMoney = (val) => {
  if (!val) return '';
  const num = parseFloat(val.toString().replace(/\s/g, ''));
  if (isNaN(num)) return '';
  return formatNumber(num);
};
const parseMoney = (val) => {
  if (!val) return 0;
  return parseFloat(val.toString().replace(/\s/g, ''));
};

const onBalanceInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  balance.value = formatNumber(raw);
  calculateSchedule();
};
const onPaymentInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  monthlyPayment.value = formatNumber(raw);
  calculateSchedule();
};
const onDayInput = (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val)) val = '';
    else if (val < 1) val = 1;
    else if (val > 31) val = 31;
    paymentDay.value = val;
    calculateSchedule();
};

// --- Опции СЕЛЕКТОВ (Копия логики из OperationPopup) ---
const creditorOptions = computed(() => {
    const opts = [];
    const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
    const filteredContractors = mainStore.contractors.filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));
    
    if (filteredContractors.length > 0) {
        opts.push({ label: 'Банки / Организации', isHeader: true });
        filteredContractors.forEach(c => opts.push({ value: `contr_${c._id}`, label: c.name }));
    }
    const filteredIndividuals = mainStore.individuals.filter(i => {
        const n = i.name.trim().toLowerCase();
        return n !== 'розничные клиенты' && n !== 'розница';
    });
    if (filteredIndividuals.length > 0) {
        opts.push({ label: 'Частные лица', isHeader: true });
        filteredIndividuals.forEach(i => opts.push({ value: `ind_${i._id}`, label: i.name }));
    }
    opts.push({ value: '--CREATE_NEW--', label: '+ Создать нового кредитора', isSpecial: true });
    return opts;
});

const accountOptions = computed(() => {
  const opts = mainStore.currentAccountBalances.map(acc => ({
    value: acc._id,
    label: acc.name,
    rightText: `${formatNumber(Math.abs(acc.balance))} ₸`
  }));
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать новый счет', isSpecial: true });
  return opts;
});

const ownerOptions = computed(() => {
  const opts = [];
  if (mainStore.currentCompanyBalances.length) {
      opts.push({ label: 'Компании', isHeader: true });
      mainStore.currentCompanyBalances.forEach(c => opts.push({ value: `company-${c._id}`, label: c.name }));
  }
  if (mainStore.currentIndividualBalances.length) {
      opts.push({ label: 'Физлица', isHeader: true });
      mainStore.currentIndividualBalances.forEach(i => {
           if (i._id === mainStore.retailIndividualId) return;
           opts.push({ value: `individual-${i._id}`, label: i.name });
      });
  }
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать владельца', isSpecial: true });
  return opts;
});

// --- Handlers Селектов ---
const handleCreditorChange = (val) => {
    if (val === '--CREATE_NEW--') { selectedCreditorValue.value = null; isCreatingCreditor.value = true; nextTick(() => newCreditorInputRef.value?.focus()); }
};
const handleAccountChange = (val) => {
    if (val === '--CREATE_NEW--') { selectedAccountId.value = null; isCreatingAccount.value = true; nextTick(() => newAccountInputRef.value?.focus()); }
    else {
        // Авто-выбор владельца
        const acc = mainStore.accounts.find(a => a._id === val);
        if (acc) {
            if (acc.companyId) selectedOwnerValue.value = `company-${typeof acc.companyId === 'object' ? acc.companyId._id : acc.companyId}`;
            else if (acc.individualId) selectedOwnerValue.value = `individual-${typeof acc.individualId === 'object' ? acc.individualId._id : acc.individualId}`;
        }
    }
};
const handleOwnerChange = (val) => {
    if (val === '--CREATE_NEW--') { selectedOwnerValue.value = null; isCreatingOwner.value = true; nextTick(() => newOwnerInputRef.value?.focus()); }
};

// --- Логика Inline создания ---
const saveNewCreditor = async () => {
    const name = newCreditorName.value.trim(); if (!name) return;
    try {
        let newItem; isSavingInline.value = true;
        if (newCreditorType.value === 'contractor') { newItem = await mainStore.addContractor(name); selectedCreditorValue.value = `contr_${newItem._id}`; } 
        else { newItem = await mainStore.addIndividual(name); selectedCreditorValue.value = `ind_${newItem._id}`; }
        isCreatingCreditor.value = false; newCreditorName.value = '';
    } catch (e) { console.error(e); } finally { isSavingInline.value = false; }
};
const saveNewAccount = async () => {
    const name = newAccountName.value.trim(); if (!name) return;
    try {
        isSavingInline.value = true;
        // Попробуем привязать к выбранному владельцу, если он уже выбран
        let cId = null, iId = null;
        if (selectedOwnerValue.value && selectedOwnerValue.value !== '--CREATE_NEW--') {
             const [type, id] = selectedOwnerValue.value.split('-');
             if (type === 'company') cId = id; else iId = id;
        }
        const newItem = await mainStore.addAccount({ name, companyId: cId, individualId: iId });
        selectedAccountId.value = newItem._id;
        isCreatingAccount.value = false; newAccountName.value = '';
    } catch (e) { console.error(e); } finally { isSavingInline.value = false; }
};
const saveNewOwner = async () => {
    const name = newOwnerName.value.trim(); if (!name) return;
    try {
        isSavingInline.value = true; let newItem;
        if (newOwnerType.value === 'company') { newItem = await mainStore.addCompany(name); selectedOwnerValue.value = `company-${newItem._id}`; } 
        else { newItem = await mainStore.addIndividual(name); selectedOwnerValue.value = `individual-${newItem._id}`; }
        isCreatingOwner.value = false; newOwnerName.value = '';
    } catch (e) { console.error(e); } finally { isSavingInline.value = false; }
};

// --- Логика Расчета Графика ---
const calculateSchedule = () => {
  const totalDebt = parseMoney(balance.value);
  const payment = parseMoney(monthlyPayment.value);
  const day = parseInt(paymentDay.value) || 25;
  
  if (totalDebt <= 0 || payment <= 0) { schedule.value = []; return; }

  const payments = [];
  let remaining = totalDebt;
  let currentDate = new Date();
  
  if (currentDate.getDate() > day) currentDate.setMonth(currentDate.getMonth() + 1);
  currentDate.setDate(day);

  let safetyCounter = 0;
  while (remaining > 0 && safetyCounter < 360) {
      let amount = payment;
      if (remaining < payment) amount = remaining;
      payments.push({ date: new Date(currentDate), amount: amount, remainingAfter: Math.max(0, remaining - amount) });
      remaining -= amount;
      currentDate.setMonth(currentDate.getMonth() + 1);
      safetyCounter++;
  }
  schedule.value = payments;
};

const totalPaymentsSum = computed(() => schedule.value.reduce((acc, p) => acc + p.amount, 0));

// --- Финальное сохранение ---
const handleSave = () => {
    const debt = parseMoney(balance.value);
    if (!selectedCreditorValue.value || debt <= 0 || !selectedAccountId.value || !selectedOwnerValue.value) {
        alert('Заполните все обязательные поля (Кредитор, Сумма, Счет, Владелец)');
        return;
    }

    const [prefix, id] = selectedCreditorValue.value.split('_');
    let contractorId = null; let individualId = null; let name = '';

    if (prefix === 'contr') { contractorId = id; const c = mainStore.contractors.find(x => x._id === id); name = c ? c.name : 'Кредит'; } 
    else { individualId = id; const i = mainStore.individuals.find(x => x._id === id); name = i ? i.name : 'Займ'; }

    // Парсинг владельца для привязки счета (если нужно обновить)
    // В данном случае мы просто сохраняем факт. 
    // Но если счет был создан без владельца, можно обновить. (Опустим для упрощения).

    const payload = {
        name: name,
        totalDebt: debt,
        monthlyPayment: parseMoney(monthlyPayment.value),
        paymentDay: parseInt(paymentDay.value) || 25,
        contractorId, individualId,
        schedule: schedule.value,
        // Доп данные для создания операции "Приход"
        targetAccountId: selectedAccountId.value 
    };
    emit('save', payload);
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wizard-content">
      
      <div class="popup-header">
        <h3>Добавление кредита</h3>
      </div>

      <!-- TABS -->
      <div class="tabs-header">
          <button class="tab-btn" :class="{ active: activeTab === 'params' }" @click="activeTab = 'params'">Параметры</button>
          <button class="tab-btn" :class="{ active: activeTab === 'schedule' }" @click="activeTab = 'schedule'">График платежей ({{ schedule.length }})</button>
      </div>

      <div class="wizard-body">
        
        <!-- Вкладка 1: Параметры -->
        <div v-if="activeTab === 'params'" class="params-tab">
            
            <!-- 1. КРЕДИТОР -->
            <div v-if="!isCreatingCreditor" class="input-spacing">
                <BaseSelect 
                    v-model="selectedCreditorValue" :options="creditorOptions"
                    label="Кредитор" placeholder="Выберите кредитора"
                    @change="handleCreditorChange"
                />
            </div>
            <div v-else class="inline-create-form input-spacing">
                <div class="create-type-switcher">
                    <span :class="{active: newCreditorType==='contractor'}" @click="newCreditorType='contractor'">Банк</span>
                    <span :class="{active: newCreditorType==='individual'}" @click="newCreditorType='individual'">Физлицо</span>
                </div>
                <div class="create-row">
                    <input type="text" v-model="newCreditorName" ref="newCreditorInputRef" placeholder="Название кредитора" class="create-input" @keyup.enter="saveNewCreditor" @keyup.esc="isCreatingCreditor=false"/>
                    <button class="btn-icon-save" @click="saveNewCreditor">✓</button>
                    <button class="btn-icon-cancel" @click="isCreatingCreditor=false">✕</button>
                </div>
            </div>

            <!-- 2. СУММА -->
            <div class="custom-input-box input-spacing" :class="{ 'has-value': !!balance }">
                <div class="input-inner-content">
                   <span v-if="balance" class="floating-label">Сумма кредита, ₸</span>
                   <input type="text" v-model="balance" @input="onBalanceInput" class="real-input" placeholder="Сумма кредита ₸" />
                </div>
            </div>

            <!-- 3. СЧЕТ -->
            <div v-if="!isCreatingAccount" class="input-spacing">
                <BaseSelect 
                    v-model="selectedAccountId" :options="accountOptions"
                    label="На счет" placeholder="Выберите счет зачисления"
                    @change="handleAccountChange"
                />
            </div>
            <div v-else class="inline-create-form input-spacing">
                <div class="create-row">
                    <input type="text" v-model="newAccountName" ref="newAccountInputRef" placeholder="Название счета" class="create-input" @keyup.enter="saveNewAccount" @keyup.esc="isCreatingAccount=false"/>
                    <button class="btn-icon-save" @click="saveNewAccount">✓</button>
                    <button class="btn-icon-cancel" @click="isCreatingAccount=false">✕</button>
                </div>
            </div>

            <!-- 4. ВЛАДЕЛЕЦ -->
            <div v-if="!isCreatingOwner" class="input-spacing">
                <BaseSelect 
                    v-model="selectedOwnerValue" :options="ownerOptions"
                    label="Владелец счета" placeholder="Выберите владельца"
                    @change="handleOwnerChange"
                />
            </div>
            <div v-else class="inline-create-form input-spacing">
                <div class="create-type-switcher">
                    <span :class="{active: newOwnerType==='company'}" @click="newOwnerType='company'">Компания</span>
                    <span :class="{active: newOwnerType==='individual'}" @click="newOwnerType='individual'">Физлицо</span>
                </div>
                <div class="create-row">
                    <input type="text" v-model="newOwnerName" ref="newOwnerInputRef" placeholder="Имя владельца" class="create-input" @keyup.enter="saveNewOwner" @keyup.esc="isCreatingOwner=false"/>
                    <button class="btn-icon-save" @click="saveNewOwner">✓</button>
                    <button class="btn-icon-cancel" @click="isCreatingOwner=false">✕</button>
                </div>
            </div>

            <!-- 5. ПЛАТЕЖ -->
            <div class="custom-input-box input-spacing" :class="{ 'has-value': !!monthlyPayment }">
                <div class="input-inner-content">
                   <span v-if="monthlyPayment" class="floating-label">Ежемесячный платеж, ₸</span>
                   <input type="text" v-model="monthlyPayment" @input="onPaymentInput" class="real-input" placeholder="Ежемесячный платеж ₸" />
                </div>
            </div>

            <!-- 6. ДЕНЬ -->
            <div class="custom-input-box input-spacing" :class="{ 'has-value': !!paymentDay }">
                <div class="input-inner-content">
                   <span v-if="paymentDay" class="floating-label">День платежа</span>
                   <input type="number" v-model="paymentDay" @input="onDayInput" class="real-input" placeholder="День платежа (1-31)" min="1" max="31"/>
                </div>
            </div>
        </div>

        <!-- Вкладка 2: График (Копия стиля из редактора) -->
        <div v-if="activeTab === 'schedule'" class="schedule-tab">
            <div class="summary-bar" v-if="schedule.length > 0">
                <div class="sum-item"><span class="sum-label">Всего выплат:</span><span class="sum-val expense">{{ formatMoney(totalPaymentsSum) }} ₸</span></div>
                <div class="sum-sep">/</div>
                <div class="sum-item"><span class="sum-label">Срок:</span><span class="sum-val">{{ schedule.length }} мес.</span></div>
            </div>
            
            <!-- Заголовки таблицы -->
            <div class="filters-row schedule-header" v-if="schedule.length > 0">
                 <div class="col-date">Дата</div>
                 <div class="col-amount">Сумма</div>
                 <div class="col-rem">Остаток</div>
            </div>

            <div class="list-scroll">
                <div v-if="schedule.length === 0" class="empty-state">
                    Заполните сумму и платеж во вкладке "Параметры".
                </div>
                
                <div v-for="(item, idx) in schedule" :key="idx" class="grid-row">
                    <div class="col-date">{{ item.date.toLocaleDateString() }}</div>
                    <div class="col-amount expense">- {{ formatMoney(item.amount) }}</div>
                    <div class="col-rem">{{ formatMoney(item.remainingAfter) }}</div>
                </div>
            </div>
        </div>

      </div>

      <div class="popup-footer">
        <!-- Кнопка создания СЛЕВА -->
        <button class="btn-add-new-footer btn-credit" @click="handleSave">
            + Создать обязательство
        </button>
        <div class="footer-actions">
            <button class="btn-close" @click="$emit('close')">Отмена</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 2000; }
.wizard-content { background: #F9F9F9; width: 100%; max-width: 500px; border-radius: 12px; display: flex; flex-direction: column; max-height: 90vh; box-shadow: 0 20px 60px rgba(0,0,0,0.3); border: 1px solid #ddd; }

.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 22px; color: #1a1a1a; font-weight: 700; }

/* Tabs */
.tabs-header { display: flex; gap: 24px; padding: 0 1.5rem; margin-top: 0.5rem; border-bottom: 1px solid #e5e7eb; }
.tab-btn { background: none; border: none; border-bottom: 3px solid transparent; font-size: 14px; font-weight: 600; color: #6b7280; padding: 10px 0; cursor: pointer; transition: all 0.2s; }
.tab-btn.active { color: #111827; border-color: #111827; }
.tab-btn:hover { color: #374151; }

.wizard-body { padding: 1.5rem; overflow-y: auto; }
.params-tab { display: flex; flex-direction: column; }

/* Inputs Styles (Unified) */
.input-spacing { margin-bottom: 12px; }
.custom-input-box { width: 100%; height: 54px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; padding: 0 14px; display: flex; align-items: center; transition: all 0.2s ease; box-sizing: border-box; }
.custom-input-box:focus-within { border-color: #222; box-shadow: 0 0 0 1px rgba(0,0,0,0.1); }
.input-inner-content { width: 100%; display: flex; flex-direction: column; justify-content: center; }
.floating-label { font-size: 11px; color: #999; margin-bottom: -2px; margin-top: 4px; }
.real-input { width: 100%; border: none; background: transparent; padding: 0; font-size: 15px; color: #1a1a1a; font-weight: 500; outline: none; }
.real-input::placeholder { font-weight: 400; color: #aaa; }

/* Inline Create Styles */
.inline-create-form { background: #fff; border: 1px solid #7B1FA2; border-radius: 8px; padding: 10px; }
.create-type-switcher { display: flex; gap: 10px; margin-bottom: 8px; }
.create-type-switcher span { font-size: 12px; color: #666; cursor: pointer; padding: 4px 8px; border-radius: 4px; background: #eee; }
.create-type-switcher span.active { background: #222; color: #fff; }
.create-row { display: flex; gap: 8px; align-items: center; }
.create-input { flex-grow: 1; height: 36px; border: 1px solid #ddd; border-radius: 6px; padding: 0 8px; font-size: 14px; }
.btn-icon-save, .btn-icon-cancel { width: 36px; height: 36px; border: none; border-radius: 6px; cursor: pointer; color: #fff; font-size: 14px; display: flex; align-items: center; justify-content: center; }
.btn-icon-save { background-color: #34C759; }
.btn-icon-cancel { background-color: #FF3B30; }

/* Schedule Tab Styles */
.summary-bar { display: flex; align-items: center; gap: 15px; padding: 10px; background-color: #fff; border: 1px solid #eee; border-radius: 8px; margin-bottom: 10px; font-size: 13px; }
.sum-item { display: flex; gap: 5px; }
.sum-label { color: #666; }
.sum-val { font-weight: 700; color: #333; }
.sum-sep { color: #ddd; }
.expense { color: #ff3b30; }

.schedule-header { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 0 10px; font-size: 11px; color: #888; font-weight: 600; margin-bottom: 5px; }
.grid-row { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 8px 10px; background: #fff; border-bottom: 1px solid #eee; font-size: 13px; color: #333; }
.list-scroll { max-height: 300px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px; background: #fff; }
.empty-state { padding: 20px; text-align: center; color: #999; font-style: italic; font-size: 13px; }

/* Footer */
.popup-footer { padding: 1.5rem; border-top: 1px solid #E0E0E0; display: flex; justify-content: space-between; align-items: center; background: #F9F9F9; border-radius: 0 0 12px 12px; }
.btn-add-new-footer { padding: 0 16px; height: 36px; border-radius: 6px; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; border: none; display: flex; align-items: center; }
.btn-credit { background-color: #7B1FA2; } 
.btn-credit:hover { background-color: #6A1B9A; }
.btn-close { padding: 0 16px; height: 36px; background: white; border: 1px solid #d1d5db; color: #374151; border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 14px; }
.btn-close:hover { background: #f3f4f6; }
</style>