<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import axios from 'axios';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber as formatBalance } from '@/utils/formatters.js'; 
import ConfirmationPopup from './ConfirmationPopup.vue';
import BaseSelect from './BaseSelect.vue'; 

/**
 * * --- МЕТКА ВЕРСИИ: v16.5 - PRO UI UPDATE ---
 * * ВЕРСИЯ: 16.5 - Обновленный дизайн и цвета (перевод)
 * * ДАТА: 2025-11-21
 */

console.log('--- TransferPopup.vue v16.5 (Pro UI) ЗАГРУЖЕН ---');

const mainStore = useMainStore();
const props = defineProps({
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  transferToEdit: { type: Object, default: null },
  minAllowedDate: { type: Date, default: null },
  maxAllowedDate: { type: Date, default: null }
});

const emit = defineEmits(['close', 'transfer-complete']);

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
  mainStore.companies.forEach(c => { opts.push({ value: `company-${c._id}`, label: c.name, isSpecial: false }); });
  mainStore.individuals.forEach(i => { opts.push({ value: `individual-${i._id}`, label: i.name, isSpecial: false }); });
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

  if (props.transferToEdit) {
    const transfer = props.transferToEdit;
    amount.value = formatNumber(Math.abs(transfer.amount));
    fromAccountId.value = transfer.fromAccountId?._id || transfer.fromAccountId;
    toAccountId.value = transfer.toAccountId?._id || transfer.toAccountId;
    
    if (transfer.fromCompanyId) { const cId = transfer.fromCompanyId?._id || transfer.fromCompanyId; selectedFromOwner.value = `company-${cId}`; } 
    else if (transfer.fromIndividualId) { const iId = transfer.fromIndividualId?._id || transfer.fromIndividualId; selectedFromOwner.value = `individual-${iId}`; }
    if (transfer.toCompanyId) { const cId = transfer.toCompanyId?._id || transfer.toCompanyId; selectedToOwner.value = `company-${cId}`; } 
    else if (transfer.toIndividualId) { const iId = transfer.toIndividualId?._id || transfer.toIndividualId; selectedToOwner.value = `individual-${iId}`; }
    
    categoryId.value = defaultCategoryId;
    if (transfer.date) { editableDate.value = toInputDate(new Date(transfer.date)); }
  } else {
    categoryId.value = defaultCategoryId;
    setTimeout(() => { if (amountInput.value) amountInput.value.focus(); }, 100);
  }
});

const title = computed(() => { if (props.transferToEdit && !isCloneMode.value) return 'Перевод'; return 'Новый перевод'; });
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
  const transferPayload = { date: finalDate, amount: amountParsed, fromAccountId: fromAccountId.value, toAccountId: toAccountId.value, fromCompanyId: fromCompanyId, toCompanyId: toCompanyId, fromIndividualId: fromIndividualId, toIndividualId: toIndividualId, categoryId: categoryId.value };
  emit('save', { mode: (!isEdit || isClone) ? 'create' : 'edit', id: (!isEdit || isClone) ? null : transferId, data: transferPayload, originalTransfer: isEdit ? props.transferToEdit : null });
};

const closePopup = () => { emit('close'); };
</script>

<template>
  <div class="popup-overlay" @click.self="closePopup">
    <!-- 🟢 ТЕМА ДЛЯ ПЕРЕВОДА -->
    <div class="popup-content theme-edit">
      
      <h3>{{ title }}</h3>

      <template v-if="!showCreateOwnerModal">
        <label>Сумма, Т</label>
        <input type="text" inputmode="decimal" v-model="amount" placeholder="0" ref="amountInput" class="form-input" @input="onAmountInput" />
        
        <label>Со счета *</label>
        <BaseSelect
          v-if="!isCreatingFromAccount"
          v-model="fromAccountId"
          :options="accountOptions"
          placeholder="Выберите счет"
          @change="handleFromAccountChange"
        />
        <div v-else class="inline-create-form">
          <input type="text" v-model="newFromAccountName" placeholder="Название счета (От)" ref="newFromAccountInput" @keyup.enter="saveNewFromAccount" @keyup.esc="cancelCreateFromAccount" />
          <button @click="saveNewFromAccount" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateFromAccount" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>
        
        <label>Компании/Физлица (Отправитель)</label>
        <BaseSelect
          v-model="selectedFromOwner"
          :options="ownerOptions"
          placeholder="Автоматически"
          @change="handleFromOwnerChange"
        />

        <label>На счет *</label>
        <BaseSelect
          v-if="!isCreatingToAccount"
          v-model="toAccountId"
          :options="accountOptions"
          placeholder="Выберите счет"
          @change="handleToAccountChange"
        />
        <div v-else class="inline-create-form">
          <input type="text" v-model="newToAccountName" placeholder="Название счета (Куда)" ref="newToAccountInput" @keyup.enter="saveNewToAccount" @keyup.esc="cancelCreateToAccount" />
          <button @click="saveNewToAccount" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateToAccount" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>
        
        <label>Компании/Физлица (Получатель)</label>
        <BaseSelect
          v-model="selectedToOwner"
          :options="ownerOptions"
          placeholder="Автоматически"
          @change="handleToOwnerChange"
        />
        
        <label>Дата поступления денег</label>
        <input type="date" v-model="editableDate" class="form-input" :min="minDateString" :max="maxDateString" />

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

        <div class="popup-actions-row">
          <button @click="handleSave" class="btn-submit save-wide" :class="buttonText === 'Сохранить' ? 'btn-submit-edit' : 'btn-submit-transfer'" :disabled="isInlineSaving">
            {{ buttonText }}
          </button>

          <div v-if="props.transferToEdit && !isCloneMode.value" class="icon-actions">
            <button class="icon-btn" title="Копировать" @click="handleCopyClick" aria-label="Копировать" :disabled="isInlineSaving">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg>
            </button>
            <button class="icon-btn danger" title="Удалить" @click="handleDeleteClick" aria-label="Удалить" :disabled="isInlineSaving">
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
          <input type="text" v-model="newOwnerName" :placeholder="ownerTypeToCreate === 'company' ? 'Название компании' : 'Имя Физлица'" ref="newOwnerInputRef" class="form-input" @keyup.enter="saveNewOwner" @keyup.esc="cancelCreateOwner" />
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
/* ТЕМА ПЕРЕВОДА */
.theme-edit { --focus-color: #222222; --focus-shadow: rgba(34, 34, 34, 0.2); }

.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; color: #1a1a1a; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem; }
h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 2rem; text-align: left; font-size: 22px; font-weight: 600; }
label { display: block; margin-bottom: 0.5rem; margin-top: 1rem; color: #333; font-size: 14px; font-weight: 500; }

.form-input { width: 100%; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.form-input:focus { outline: none; border-color: var(--focus-color, #222); box-shadow: 0 0 0 2px var(--focus-shadow, rgba(34,34,34,0.2)); }

.inline-create-form { display: flex; align-items: center; gap: 8px; margin-bottom: 15px; }
.inline-create-form input { flex: 1; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; }
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
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border: none; border-radius: 10px; background: #EFEFEF; color: #222; cursor: pointer; }
.icon-btn:hover { background: #E5E5E5; }
.icon-btn.danger { background: #FF3B30; color: #fff; }
.icon-btn.danger:hover { background: #d93025; }
.icon { width: 28px; height: 28px; min-width: 28px; min-height: 28px; fill: currentColor; display: block; pointer-events: none; }
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
