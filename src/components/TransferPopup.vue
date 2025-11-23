<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import axios from 'axios';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber as formatBalance } from '@/utils/formatters.js'; 
import ConfirmationPopup from './ConfirmationPopup.vue';
import BaseSelect from './BaseSelect.vue'; 

/**
 * * --- МЕТКА ВЕРСИИ: v18.0 - CHAIN CONTINUATION ---
 * * ВЕРСИЯ: 18.0 - Поддержка продолжения цепочек
 * * ДАТА: 2025-11-23
 * *
 * * 1. (FEAT) Добавлен prop `initialData` для предзаполнения полей (при продолжении цепочки).
 * * 2. (LOGIC) При сохранении передается `transferGroupId`, если он был в `initialData`.
 */

const mainStore = useMainStore();
const props = defineProps({
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  transferToEdit: { type: Object, default: null },
  minAllowedDate: { type: Date, default: null },
  maxAllowedDate: { type: Date, default: null },
  initialData: { type: Object, default: null } // 🟢 Новое свойство
});

const emit = defineEmits(['close', 'save']); // save теперь используется для унификации

const amount = ref('');
const fromAccountId = ref(null);
const toAccountId = ref(null);
const categoryId = ref(null);
const selectedFromOwner = ref(null); 
const selectedToOwner = ref(null); 
const isInlineSaving = ref(false);

const toInputDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const toDisplayDate = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}
const editableDate = ref(toInputDate(props.date));
const minDateString = computed(() => props.minAllowedDate ? toInputDate(props.minAllowedDate) : null);
const maxDateString = computed(() => props.maxAllowedDate ? toInputDate(props.maxAllowedDate) : null);

const errorMessage = ref('');
const amountInput = ref(null);
const isDeleteConfirmVisible = ref(false);
const isCloneMode = ref(false);

const isCreatingFromAccount = ref(false); const newFromAccountName = ref(''); const newFromAccountInput = ref(null);
const isCreatingToAccount = ref(false); const newToAccountName = ref(''); const newToAccountInput = ref(null);

const showCreateOwnerModal = ref(false);
const ownerTypeToCreate = ref('company'); 
const newOwnerName = ref('');
const newOwnerInputRef = ref(null);
const creatingOwnerFor = ref('from'); 

const formatNumber = (numStr) => {
  const clean = `${numStr}`.replace(/[^0-9]/g, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const onAmountInput = (event) => {
  const input = event.target;
  const value = input.value;
  const cursorPosition = input.selectionStart;
  const rawValue = value.replace(/[^0-9]/g, '');
  const formattedValue = formatNumber(rawValue);
  const cursorOffset = formattedValue.length - value.length;
  amount.value = formattedValue;
  input.value = formattedValue;
  nextTick(() => {
    input.setSelectionRange(cursorPosition + cursorOffset, cursorPosition + cursorOffset);
  });
};

const accountOptions = computed(() => {
  const options = mainStore.currentAccountBalances.map(acc => ({
    value: acc._id,
    label: acc.name,
    rightText: `${formatBalance(Math.abs(acc.balance))} ₸`,
    isSpecial: false
  }));
  options.push({ value: '--CREATE_NEW--', label: '+ Создать новый счет', rightText: '', isSpecial: true });
  return options;
});

const ownerOptions = computed(() => {
  const opts = [];
  mainStore.currentCompanyBalances.forEach(c => { 
    opts.push({ 
      value: `company-${c._id}`, 
      label: c.name, 
      rightText: `${formatBalance(Math.abs(c.balance || 0))} ₸`,
      isSpecial: false 
    }); 
  });
  mainStore.currentIndividualBalances.forEach(i => { 
    opts.push({ 
      value: `individual-${i._id}`, 
      label: i.name, 
      rightText: `${formatBalance(Math.abs(i.balance || 0))} ₸`,
      isSpecial: false 
    }); 
  });
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать Компанию/Физлицо', isSpecial: true });
  return opts;
});

const handleFromAccountChange = (val) => { if (val === '--CREATE_NEW--') { fromAccountId.value = null; showFromAccountInput(); } else { onFromAccountSelected(val); } };
const handleToAccountChange = (val) => { if (val === '--CREATE_NEW--') { toAccountId.value = null; showToAccountInput(); } else { onToAccountSelected(val); } };
const handleFromOwnerChange = (val) => { if (val === '--CREATE_NEW--') { selectedFromOwner.value = null; openCreateOwnerModal('from'); } };
const handleToOwnerChange = (val) => { if (val === '--CREATE_NEW--') { selectedToOwner.value = null; openCreateOwnerModal('to'); } };

const onFromAccountSelected = (accountId) => {
  const selectedAccount = mainStore.accounts.find(acc => acc._id === accountId);
  if (selectedAccount) {
    if (selectedAccount.companyId) { const cId = typeof selectedAccount.companyId === 'object' ? selectedAccount.companyId._id : selectedAccount.companyId; selectedFromOwner.value = `company-${cId}`; } 
    else if (selectedAccount.individualId) { const iId = typeof selectedAccount.individualId === 'object' ? selectedAccount.individualId._id : selectedAccount.individualId; selectedFromOwner.value = `individual-${iId}`; } 
    else { selectedFromOwner.value = null; }
  } else { selectedFromOwner.value = null; }
};

const onToAccountSelected = (accountId) => {
  const selectedAccount = mainStore.accounts.find(acc => acc._id === accountId);
  if (selectedAccount) {
    if (selectedAccount.companyId) { const cId = typeof selectedAccount.companyId === 'object' ? selectedAccount.companyId._id : selectedAccount.companyId; selectedToOwner.value = `company-${cId}`; } 
    else if (selectedAccount.individualId) { const iId = typeof selectedAccount.individualId === 'object' ? selectedAccount.individualId._id : selectedAccount.individualId; selectedToOwner.value = `individual-${iId}`; } 
    else { selectedToOwner.value = null; }
  } else { selectedToOwner.value = null; }
};

onMounted(async () => {
  let transferCategory = mainStore.categories.find(c => c.name.toLowerCase() === 'перевод');
  if (!transferCategory) { try { transferCategory = await mainStore.addCategory('Перевод'); } catch (e) {} }
  const defaultCategoryId = transferCategory ? transferCategory._id : null;
  categoryId.value = defaultCategoryId;

  // 1. РЕДАКТИРОВАНИЕ
  if (props.transferToEdit) {
    const transfer = props.transferToEdit;
    amount.value = formatNumber(Math.abs(transfer.amount));
    fromAccountId.value = transfer.fromAccountId?._id || transfer.fromAccountId;
    toAccountId.value = transfer.toAccountId?._id || transfer.toAccountId;
    
    if (transfer.fromCompanyId) { const cId = transfer.fromCompanyId?._id || transfer.fromCompanyId; selectedFromOwner.value = `company-${cId}`; } 
    else if (transfer.fromIndividualId) { const iId = transfer.fromIndividualId?._id || transfer.fromIndividualId; selectedFromOwner.value = `individual-${iId}`; }
    if (transfer.toCompanyId) { const cId = transfer.toCompanyId?._id || transfer.toCompanyId; selectedToOwner.value = `company-${cId}`; } 
    else if (transfer.toIndividualId) { const iId = transfer.toIndividualId?._id || transfer.toIndividualId; selectedToOwner.value = `individual-${iId}`; }
    
    if (transfer.date) { editableDate.value = toInputDate(new Date(transfer.date)); }
  } 
  // 2. ПРОДОЛЖЕНИЕ ЦЕПОЧКИ (Новый перевод с предзаполнением)
  else if (props.initialData) {
      const init = props.initialData;
      if (init.amount) amount.value = formatNumber(init.amount);
      
      // Предзаполняем источник
      if (init.fromAccountId) {
          fromAccountId.value = init.fromAccountId;
          // Владелец подтянется автоматически, если он есть в базе, но можно и явно задать
          if (init.fromCompanyId) selectedFromOwner.value = `company-${init.fromCompanyId}`;
          else if (init.fromIndividualId) selectedFromOwner.value = `individual-${init.fromIndividualId}`;
          else onFromAccountSelected(init.fromAccountId); // Попытка автоопределения
      }
      
      // Фокус на поле "Куда" (так как "Откуда" и "Сумма" уже есть)
      setTimeout(() => { 
          // Пока нет рефа на селект "Куда", фокус на сумму по дефолту, пользователь сам перейдет
          if (amountInput.value) amountInput.value.focus(); 
      }, 100);
  }
  // 3. НОВЫЙ ЧИСТЫЙ ПЕРЕВОД
  else {
    setTimeout(() => { if (amountInput.value) amountInput.value.focus(); }, 100);
  }
});

const title = computed(() => { if (props.transferToEdit && !isCloneMode.value) return 'Редактировать перевод'; return 'Новый перевод'; });
const buttonText = computed(() => { if (props.transferToEdit && !isCloneMode.value) return 'Сохранить'; return 'Добавить перевод'; });

const handleDeleteClick = () => { isDeleteConfirmVisible.value = true; };
const onDeleteConfirmed = async () => {
  const opToDelete = props.transferToEdit; emit('close'); 
  try { if (!opToDelete?._id) return; await mainStore.deleteOperation(opToDelete); await mainStore.fetchAllEntities(); } catch (e) { console.error(e); } 
};
const handleCopyClick = () => { isCloneMode.value = true; editableDate.value = toInputDate(props.date); nextTick(() => { amountInput.value?.focus(); }); };

const openCreateOwnerModal = (target) => { creatingOwnerFor.value = target; ownerTypeToCreate.value = 'company'; newOwnerName.value = ''; showCreateOwnerModal.value = true; nextTick(() => newOwnerInputRef.value?.focus()); };
const cancelCreateOwner = () => { if (isInlineSaving.value) return; showCreateOwnerModal.value = false; newOwnerName.value = ''; if (creatingOwnerFor.value === 'from' && selectedFromOwner.value === '--CREATE_NEW--') selectedFromOwner.value = null; if (creatingOwnerFor.value === 'to' && selectedToOwner.value === '--CREATE_NEW--') selectedToOwner.value = null; };
const setOwnerTypeToCreate = (type) => { ownerTypeToCreate.value = type; newOwnerInputRef.value?.focus(); };
const saveNewOwner = async () => {
  if (isInlineSaving.value) return; const name = newOwnerName.value.trim(); const type = ownerTypeToCreate.value; const target = creatingOwnerFor.value; if (!name) return; isInlineSaving.value = true; 
  try {
    let newItem;
    if (type === 'company') { const existing = mainStore.companies.find(c => c.name.toLowerCase() === name.toLowerCase()); newItem = existing ? existing : await mainStore.addCompany(name); } 
    else { const existing = mainStore.individuals.find(i => i.name.toLowerCase() === name.toLowerCase()); newItem = existing ? existing : await mainStore.addIndividual(name); }
    const newOwnerKey = `${type}-${newItem._id}`;
    if (target === 'from') selectedFromOwner.value = newOwnerKey; else selectedToOwner.value = newOwnerKey;
    showCreateOwnerModal.value = false; newOwnerName.value = '';
  } catch (e) { console.error(e); } finally { isInlineSaving.value = false; }
};

const showFromAccountInput = () => { isCreatingFromAccount.value = true; nextTick(() => newFromAccountInput.value?.focus()); };
const cancelCreateFromAccount = () => { isCreatingFromAccount.value = false; newFromAccountName.value = ''; };
const saveNewFromAccount = async () => {
  if (isInlineSaving.value) return; const name = newFromAccountName.value.trim(); if (!name) return; isInlineSaving.value = true;
  try {
    let cId = null, iId = null; if (selectedFromOwner.value) { const [type, id] = selectedFromOwner.value.split('-'); if (type === 'company') cId = id; else iId = id; }
    const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (existing) { fromAccountId.value = existing._id; onFromAccountSelected(existing._id); } 
    else { const newItem = await mainStore.addAccount({ name: name, companyId: cId, individualId: iId }); fromAccountId.value = newItem._id; onFromAccountSelected(newItem._id); }
    cancelCreateFromAccount(); 
  } catch (e) { console.error(e); } finally { isInlineSaving.value = false; }
};
const showToAccountInput = () => { isCreatingToAccount.value = true; nextTick(() => newToAccountInput.value?.focus()); };
const cancelCreateToAccount = () => { isCreatingToAccount.value = false; newToAccountName.value = ''; };
const saveNewToAccount = async () => {
  if (isInlineSaving.value) return; const name = newToAccountName.value.trim(); if (!name) return; isInlineSaving.value = true;
  try {
    let cId = null, iId = null; if (selectedToOwner.value) { const [type, id] = selectedToOwner.value.split('-'); if (type === 'company') cId = id; else iId = id; }
    const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (existing) { toAccountId.value = existing._id; onToAccountSelected(existing._id); } 
    else { const newItem = await mainStore.addAccount({ name: name, companyId: cId, individualId: iId }); toAccountId.value = newItem._id; onToAccountSelected(newItem._id); }
    cancelCreateToAccount(); 
  } catch (e) { console.error(e); } finally { isInlineSaving.value = false; }
};

const handleSave = async () => {
  errorMessage.value = '';
  const cleanedAmount = (amountInput.value?.value || amount.value).replace(/ /g, '');
  const amountParsed = parseFloat(cleanedAmount);
  if (isNaN(amountParsed) || amountParsed <= 0) { errorMessage.value = 'Введите корректную сумму'; return; }
  if (!fromAccountId.value || !toAccountId.value) { errorMessage.value = 'Выберите счета отправителя и получателя'; return; }
  if (fromAccountId.value === toAccountId.value) { errorMessage.value = 'Счета не должны совпадать'; return; }

  const isEdit = !!props.transferToEdit;
  const transferId = props.transferToEdit?._id;
  const isClone = isCloneMode.value;
  const [year, month, day] = editableDate.value.split('-').map(Number); const finalDate = new Date(year, month - 1, day, 12, 0, 0); 
  let fromCompanyId = null, fromIndividualId = null; if (selectedFromOwner.value) { const [type, id] = selectedFromOwner.value.split('-'); if (type === 'company') fromCompanyId = id; else fromIndividualId = id; }
  let toCompanyId = null, toIndividualId = null; if (selectedToOwner.value) { const [type, id] = selectedToOwner.value.split('-'); if (type === 'company') toCompanyId = id; else toIndividualId = id; }
  
  const transferPayload = { 
      date: finalDate, 
      amount: amountParsed, 
      fromAccountId: fromAccountId.value, 
      toAccountId: toAccountId.value, 
      fromCompanyId: fromCompanyId, 
      toCompanyId: toCompanyId, 
      fromIndividualId: fromIndividualId, 
      toIndividualId: toIndividualId, 
      categoryId: categoryId.value,
      // 🟢 FIX: Передаем transferGroupId, если это продолжение цепочки
      transferGroupId: props.initialData?.transferGroupId || props.transferToEdit?.transferGroupId 
  };
  
  emit('save', { 
      mode: (!isEdit || isClone) ? 'create' : 'edit', 
      id: (!isEdit || isClone) ? null : transferId, 
      data: transferPayload, 
      originalTransfer: isEdit ? props.transferToEdit : null 
  });
};

const closePopup = () => { emit('close'); };
</script>

<template>
  <div class="popup-overlay" @click.self="closePopup">
    <div class="popup-content theme-edit">
      
      <h3>{{ title }}</h3>

      <template v-if="!showCreateOwnerModal">
        <div class="custom-input-box input-spacing" :class="{ 'has-value': !!amount }">
          <div class="input-inner-content">
             <span v-if="amount" class="floating-label">Сумма, ₸</span>
             <input 
               type="text" 
               inputmode="decimal" 
               v-model="amount" 
               :placeholder="amount ? '' : 'Перевожу деньги ₸'" 
               ref="amountInput" 
               class="real-input" 
               @input="onAmountInput" 
             />
          </div>
        </div>
        
        <!-- СО СЧЕТА -->
        <BaseSelect
          v-if="!isCreatingFromAccount"
          v-model="fromAccountId"
          :options="accountOptions"
          placeholder="Со счета"
          label="Со счета"
          class="input-spacing"
          @change="handleFromAccountChange"
        />
        <div v-else class="inline-create-form input-spacing">
          <input type="text" v-model="newFromAccountName" placeholder="Название счета (От)" ref="newFromAccountInput" @keyup.enter="saveNewFromAccount" @keyup.esc="cancelCreateFromAccount" />
          <button @click="saveNewFromAccount" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateFromAccount" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>
        
        <!-- ОТПРАВИТЕЛЬ -->
        <BaseSelect
          v-model="selectedFromOwner"
          :options="ownerOptions"
          placeholder="Отправитель (Комп./Физлицо)"
          label="Отправитель"
          class="input-spacing"
          @change="handleFromOwnerChange"
        />

        <!-- НА СЧЕТ -->
        <BaseSelect
          v-if="!isCreatingToAccount"
          v-model="toAccountId"
          :options="accountOptions"
          placeholder="На счет"
          label="На счет"
          class="input-spacing"
          @change="handleToAccountChange"
        />
        <div v-else class="inline-create-form input-spacing">
          <input type="text" v-model="newToAccountName" placeholder="Название счета (Куда)" ref="newToAccountInput" @keyup.enter="saveNewToAccount" @keyup.esc="cancelCreateToAccount" />
          <button @click="saveNewToAccount" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateToAccount" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>
        
        <!-- ПОЛУЧАТЕЛЬ -->
        <BaseSelect
          v-model="selectedToOwner"
          :options="ownerOptions"
          placeholder="Получатель (Комп./Физлицо)"
          label="Получатель"
          class="input-spacing"
          @change="handleToOwnerChange"
        />
        
        <div class="custom-input-box input-spacing has-value date-box">
           <div class="input-inner-content">
              <span class="floating-label">Дата перевода</span>
              <div class="date-display-row">
                 <span class="date-value-text">{{ toDisplayDate(editableDate) }}</span>
                 <input 
                   type="date" 
                   v-model="editableDate" 
                   class="real-input date-overlay"
                   :min="minDateString" :max="maxDateString" 
                 />
                 <span class="calendar-icon">📅</span> 
              </div>
           </div>
        </div>

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

        <div class="popup-actions-row">
          <button @click="handleSave" class="btn-submit save-wide" :class="buttonText === 'Сохранить' ? 'btn-submit-edit' : 'btn-submit-transfer'" :disabled="isInlineSaving">
            {{ buttonText }}
          </button>

          <div v-if="props.transferToEdit && !isCloneMode.value" class="icon-actions">
            <button class="icon-btn copy-btn" title="Копировать" @click="handleCopyClick" aria-label="Копировать" :disabled="isInlineSaving">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg>
            </button>
            <button class="icon-btn delete-btn" title="Удалить" @click="handleDeleteClick" aria-label="Удалить" :disabled="isInlineSaving">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6a1 1 0 0 1 1 1v1h5v2H3V5h5V4a1 1 0 0 1 1-1Zm2 6h2v9h-2V9Zm6 0h2v9h-2V9ZM5 9h2v9H5V9Z"/></svg>
            </button>
          </div>
        </div>
      </template>

      <template v-if="showCreateOwnerModal">
        <div class="smart-create-owner">
          <h4 class="smart-create-title">Что вы хотите создать?</h4>
          <div class="smart-create-tabs">
            <button :class="{ active: ownerTypeToCreate === 'company' }" @click="setOwnerTypeToCreate('company')">Компанию</button>
            <button :class="{ active: ownerTypeToCreate === 'individual' }" @click="setOwnerTypeToCreate('individual')">Физлицо</button>
          </div>
          <label>Название</label>
          <input type="text" v-model="newOwnerName" :placeholder="ownerTypeToCreate === 'company' ? 'Название компании' : 'Имя Физлица'" ref="newOwnerInputRef" class="form-input input-spacing" @keyup.enter="saveNewOwner" @keyup.esc="cancelCreateOwner" />
          <div class="smart-create-actions">
            <button @click="cancelCreateOwner" class="btn-submit btn-submit-secondary" :disabled="isInlineSaving">Отмена</button>
            <button @click="saveNewOwner" class="btn-submit btn-submit-edit" :disabled="isInlineSaving">Создать</button>
          </div>
        </div>
      </template>
      
    </div>
  </div>

  <ConfirmationPopup v-if="isDeleteConfirmVisible" title="Подтвердите удаление" message="Вы уверены, что хотите удалить этот перевод?" @close="isDeleteConfirmVisible = false" @confirm="onDeleteConfirmed" />
</template>

<style scoped>
.theme-edit { --focus-color: #222222; --focus-shadow: rgba(34, 34, 34, 0.2); }

.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; color: #1a1a1a; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem; }
h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 2rem; text-align: left; font-size: 22px; font-weight: 700; }
label { display: block; margin-bottom: 0.5rem; margin-top: 1rem; color: #333; font-size: 14px; font-weight: 500; }

.custom-input-box {
  width: 100%;
  height: 54px;
  background: #FFFFFF;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  position: relative;
  transition: all 0.2s ease;
}
.custom-input-box:focus-within {
  border-color: var(--focus-color, #222);
  box-shadow: 0 0 0 1px var(--focus-shadow, rgba(34,34,34,0.2));
}
.custom-input-box:not(.has-value) .real-input {
    padding-top: 10px;
}

.input-inner-content { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.floating-label { font-size: 11px; color: #999; margin-bottom: -2px; margin-top: 4px; }
.real-input { width: 100%; border: none; background: transparent; padding: 0; font-size: 15px; color: #1a1a1a; font-weight: 500; height: auto; line-height: 1.3; outline: none; }
.real-input::placeholder { font-weight: 400; color: #aaa; }

.date-display-row { display: flex; justify-content: space-between; align-items: center; position: relative; width: 100%; }
.date-value-text { font-size: 15px; font-weight: 500; color: #1a1a1a; }
.date-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; z-index: 2; }
.calendar-icon { font-size: 16px; color: #999; }

.input-spacing { margin-bottom: 12px; }

.form-input { width: 100%; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.form-input:focus { outline: none; border-color: var(--focus-color, #222); box-shadow: 0 0 0 2px var(--focus-shadow, rgba(34,34,34,0.2)); }

.inline-create-form { display: flex; align-items: center; gap: 8px; margin-bottom: 15px; }
.inline-create-form input { flex: 1; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; box-sizing: border-box; }
.inline-create-form input:focus { outline: none; border-color: var(--focus-color, #222); box-shadow: 0 0 0 2px var(--focus-shadow, rgba(34,34,34,0.2)); }
.inline-create-form button { flex-shrink: 0; border: none; border-radius: 8px; color: white; font-size: 16px; cursor: pointer; height: 48px; width: 48px; padding: 0; line-height: 1; display: flex; align-items: center; justify-content: center; }
.inline-create-form button.btn-inline-save { background-color: #34C759; }
.inline-create-form button.btn-inline-save:disabled { background-color: #9bd6a8; cursor: not-allowed; }
.inline-create-form button.btn-inline-cancel { background-color: #FF3B30; }
.inline-create-form button.btn-inline-cancel:disabled { background-color: #f0a19c; cursor: not-allowed; }

.error-message { color: #FF3B30; text-align: center; margin-top: 1rem; font-size: 14px; }
.popup-actions-row { display: flex; align-items: center; gap: 10px; margin-top: 2rem; }
.save-wide { flex: 1 1 auto; height: 54px; }
.icon-actions { display: flex; gap: 10px; }

.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 10px; cursor: pointer; background: #F4F4F4; border: 1px solid #E0E0E0; color: #333; transition: all 0.2s; padding: 0; }
.copy-btn:hover { background: #E8F5E9; border-color: #A5D6A7; color: #34C759; }
.delete-btn:hover { background: #FFF0F0; border-color: #FFD0D0; color: #FF3B30; }
.icon { width: 70%; height: 70%; fill: currentColor; display: block; pointer-events: none; }

.btn-submit { width: 100%; height: 50px; padding: 0 1rem; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; font-family: inherit; cursor: pointer; transition: background-color 0.2s ease; }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-submit-transfer { background-color: #2f3340; }
.btn-submit-transfer:hover:not(:disabled) { background-color: #2f3d6bff; }
.btn-submit-edit { background-color: #222222; }
.btn-submit-edit:hover:not(:disabled) { background-color: #444444; }
.btn-submit-secondary { background-color: #e0e0e0; color: #333; font-weight: 500; }
.btn-submit-secondary:hover:not(:disabled) { background-color: #d1d1d1; }
.smart-create-owner { border-top: 1px solid #E0E0E0; margin-top: 1.5rem; padding-top: 1.5rem; }
.smart-create-title { font-size: 18px; font-weight: 600; color: #1a1a1a; text-align: center; margin-top: 0; margin-bottom: 1.5rem; }
.smart-create-tabs { display: flex; justify-content: center; gap: 10px; margin-bottom: 1.5rem; }
.smart-create-tabs button { flex: 1; padding: 12px; font-size: 14px; font-weight: 500; border: 1px solid #E0E0E0; border-radius: 8px; background: #FFFFFF; color: #333; cursor: pointer; transition: all 0.2s; }
.smart-create-tabs button.active { background: #222222; color: #FFFFFF; border-color: #222222; }
.smart-create-actions { display: flex; gap: 10px; margin-top: 1rem; }
.smart-create-actions .btn-submit { flex: 1; }
</style>