<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber as formatBalance } from '@/utils/formatters.js'; 
import ConfirmationPopup from './ConfirmationPopup.vue';
import BaseSelect from './BaseSelect.vue'; 
import InfoModal from './InfoModal.vue';
import { accountSuggestions } from '@/data/accountSuggestions.js'; 

/**
 * * --- МЕТКА ВЕРСИИ: v29.3 - WIDGET FREEZE FIX ---
 * * ВЕРСИЯ: 29.3
 * * ДАТА: 2025-12-11
 * * ИЗМЕНЕНИЯ:
 * 1. handleSave: Добавлена принудительная проверка владельцев счетов перед отправкой.
 * Теперь ID компаний/физлиц всегда попадают в payload, что чинит "зависание" виджетов при оптимистичном обновлении.
 */

const mainStore = useMainStore();

const props = defineProps({
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  transferToEdit: { type: Object, default: null },
  minAllowedDate: { type: Date, default: null },
  maxAllowedDate: { type: Date, default: null }
});

const emit = defineEmits(['close', 'save']);

const amount = ref('');
const fromAccountId = ref(null);
const toAccountId = ref(null);
const categoryId = ref(null);
const selectedFromOwner = ref(null); 
const selectedToOwner = ref(null); 
const isInlineSaving = ref(false);

const transferPurpose = ref('internal'); 

const purposeOptions = [
  { value: 'internal', label: 'Между счетами одной компании' },
  { value: 'inter_company', label: 'Между моими компаниями' },
  { value: 'personal', label: 'Перевод на личную карту' }
];

// InfoModal
const showInfoModal = ref(false);
const infoModalTitle = ref('Внимание');
const infoModalMessage = ref('');

const showError = (msg) => {
    infoModalTitle.value = 'Внимание';
    infoModalMessage.value = msg;
    showInfoModal.value = true;
};

// 🟢 CASH REGISTER LOGIC (Новое)
const showCashChoiceModal = ref(false);
const showSpecialCashInfo = ref(false);
const accountCreationPlaceholder = ref('Название счета'); 
const isCreatingSpecialAccount = ref(false); 
const creatingAccountFor = ref(null); // 'from' | 'to'

const smartHint = computed(() => {
  if (transferPurpose.value === 'internal') {
    return 'Вы перекладываете деньги с одного счета на другой внутри одной компании.';
  }
  if (transferPurpose.value === 'inter_company') {
    if (selectedFromOwner.value && selectedFromOwner.value.startsWith('individual-')) {
        return 'Перевод с личной карты/счета на нужды компании (Вложение средств).';
    }
    return 'Вы переводите деньги между своими компаниями. Налог будет начислен получателю.';
  }
  if (transferPurpose.value === 'personal') {
      return 'Вы переводите деньги на личный счет или карту. Деньги бизнеса -> Личные деньги.';
  }
  return '';
});

const taxCalculation = computed(() => {
    if (transferPurpose.value !== 'inter_company') return null;
    if (!selectedToOwner.value) return null;
    const [type, id] = selectedToOwner.value.split('-');
    if (type !== 'company') return null;
    const company = mainStore.companies.find(c => c._id === id);
    if (!company) return null;
    const percent = company.taxPercent !== undefined ? company.taxPercent : (company.taxRegime === 'our' ? 10 : 3);
    const rawAmount = parseFloat((amount.value || '0').replace(/\s/g, ''));
    if (!rawAmount || rawAmount <= 0) return null;
    const taxVal = rawAmount * (percent / 100);
    return { percent, taxAmount: taxVal, targetCompanyName: company.name };
});

const toInputDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const toDisplayDate = (dateStr) => { if (!dateStr) return ''; const [year, month, day] = dateStr.split('-'); return `${day}.${month}.${year}`; }
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

const formatNumber = (numStr) => { const clean = `${numStr}`.replace(/[^0-9]/g, ''); return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
const onAmountInput = (event) => { amount.value = formatNumber(event.target.value.replace(/[^0-9]/g, '')); };

const getOwnerName = (acc) => {
    if (acc.companyId) { const cId = (typeof acc.companyId === 'object') ? acc.companyId._id : acc.companyId; const c = mainStore.companies.find(comp => comp._id === cId); return c ? `Компания: ${c.name}` : 'Компания'; }
    if (acc.individualId) { const iId = (typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId; const i = mainStore.individuals.find(ind => ind._id === iId); return i ? `Физлицо: ${i.name}` : 'Физлицо'; }
    return 'Нет привязки';
};

const accountOptions = computed(() => {
  const options = mainStore.currentAccountBalances.map(acc => ({
    value: acc._id,
    label: acc.name,
    rightText: `${formatBalance(Math.abs(acc.balance))} ₸`,
    tooltip: getOwnerName(acc),
    isSpecial: false
  }));
  // 🟢 Sticky option via slot
  options.push({ isActionRow: true });
  return options;
});

const ownerOptions = computed(() => {
  const opts = [];
  if (mainStore.currentCompanyBalances.length) {
      opts.push({ label: 'Компании', isHeader: true });
      mainStore.currentCompanyBalances.forEach(c => { opts.push({ value: `company-${c._id}`, label: c.name, rightText: `${formatBalance(Math.abs(c.balance || 0))} ₸`, isSpecial: false }); });
  }
  if (mainStore.currentIndividualBalances.length) {
      opts.push({ label: 'Физлица', isHeader: true });
      mainStore.currentIndividualBalances.forEach(i => { opts.push({ value: `individual-${i._id}`, label: i.name, rightText: `${formatBalance(Math.abs(i.balance || 0))} ₸`, isSpecial: false }); });
  }
  opts.push({ isActionRow: true }); // Для кнопок "Создать..."
  return opts;
});

watch([selectedFromOwner, selectedToOwner], ([newFrom, newTo]) => {
  if (!newFrom || !newTo) return;
  const [fromType, fromId] = newFrom.split('-');
  const [toType, toId] = newTo.split('-');
  if (fromId === toId && fromType === toType) { transferPurpose.value = 'internal'; }
  else { if (toType === 'individual') { transferPurpose.value = 'personal'; } else { transferPurpose.value = 'inter_company'; } }
});

const isProgrammaticFrom = ref(false);
const isProgrammaticTo = ref(false);

const showFromAccountSuggestions = ref(false);
const fromAccountSuggestionsList = computed(() => {
    const query = newFromAccountName.value.trim().toLowerCase();
    if (query.length < 2) return [];
    return accountSuggestions.filter(bank => bank.name.toLowerCase().includes(query) || (bank.keywords && bank.keywords.some(k => k.startsWith(query)))).slice(0, 4);
});
const selectFromAccountSuggestion = (bank) => { isProgrammaticFrom.value = true; newFromAccountName.value = bank.name; showFromAccountSuggestions.value = false; nextTick(() => { newFromAccountInput.value?.focus(); isProgrammaticFrom.value = false; }); };
const handleFromAccountBlur = () => { setTimeout(() => { showFromAccountSuggestions.value = false; }, 200); };
const handleFromAccountFocus = () => { if (newFromAccountName.value.length >= 2) showFromAccountSuggestions.value = true; };
watch(newFromAccountName, (val) => { if (isProgrammaticFrom.value) return; showFromAccountSuggestions.value = val.length >= 2; });

const showToAccountSuggestions = ref(false);
const toAccountSuggestionsList = computed(() => {
    const query = newToAccountName.value.trim().toLowerCase();
    if (query.length < 2) return [];
    return accountSuggestions.filter(bank => bank.name.toLowerCase().includes(query) || (bank.keywords && bank.keywords.some(k => k.startsWith(query)))).slice(0, 4);
});
const selectToAccountSuggestion = (bank) => { isProgrammaticTo.value = true; newToAccountName.value = bank.name; showToAccountSuggestions.value = false; nextTick(() => { newToAccountInput.value?.focus(); isProgrammaticTo.value = false; }); };
const handleToAccountBlur = () => { setTimeout(() => { showToAccountSuggestions.value = false; }, 200); };
const handleToAccountFocus = () => { if (newToAccountName.value.length >= 2) showToAccountSuggestions.value = true; };
watch(newToAccountName, (val) => { if (isProgrammaticTo.value) return; showToAccountSuggestions.value = val.length >= 2; });

// 🟢 NEW CASH LOGIC HANDLERS
const openCashChoice = (target) => {
    creatingAccountFor.value = target; // 'from' or 'to'
    showCashChoiceModal.value = true;
};

const handleCashChoice = (type) => {
    showCashChoiceModal.value = false;
    if (type === 'special') {
        showSpecialCashInfo.value = true;
    } else {
        startCashCreation('regular');
    }
};

const confirmSpecialCash = () => {
    showSpecialCashInfo.value = false;
    startCashCreation('special');
};

const startCashCreation = (type) => {
    accountCreationPlaceholder.value = type === 'special' ? 'Название спец. кассы' : 'Название кассы';
    isCreatingSpecialAccount.value = (type === 'special');
    
    if (creatingAccountFor.value === 'from') {
        fromAccountId.value = null;
        isCreatingFromAccount.value = true;
        newFromAccountName.value = '';
        nextTick(() => newFromAccountInput.value?.focus());
    } else {
        toAccountId.value = null;
        isCreatingToAccount.value = true;
        newToAccountName.value = '';
        nextTick(() => newToAccountInput.value?.focus());
    }
};

const showFromAccountInput = () => {
    creatingAccountFor.value = 'from';
    isCreatingSpecialAccount.value = false;
    accountCreationPlaceholder.value = 'Название счета';
    isCreatingFromAccount.value = true; 
    newFromAccountName.value = '';
    nextTick(() => newFromAccountInput.value?.focus()); 
};

const showToAccountInput = () => {
    creatingAccountFor.value = 'to';
    isCreatingSpecialAccount.value = false;
    accountCreationPlaceholder.value = 'Название счета';
    isCreatingToAccount.value = true; 
    newToAccountName.value = '';
    nextTick(() => newToAccountInput.value?.focus()); 
};

// SELECT HANDLERS
const handleFromAccountChange = (val) => { 
    if (val === '--CREATE_NEW--') { 
        showFromAccountInput();
    } else { 
        fromAccountId.value = val;
        onFromAccountSelected(val); 
    } 
};
const handleToAccountChange = (val) => { 
    if (val === '--CREATE_NEW--') { 
        showToAccountInput();
    } else { 
        toAccountId.value = val;
        onToAccountSelected(val); 
    } 
};

const handleFromOwnerChange = (val) => { if (val === '--CREATE_NEW--') { selectedFromOwner.value = null; openCreateOwnerModal('from'); } };
const handleToOwnerChange = (val) => { if (val === '--CREATE_NEW--') { selectedToOwner.value = null; openCreateOwnerModal('to'); } };

const onFromAccountSelected = (accountId) => {
  const selectedAccount = mainStore.accounts.find(acc => acc._id === accountId);
  if (selectedAccount) {
    if (selectedAccount.companyId) { const cId = typeof selectedAccount.companyId === 'object' ? selectedAccount.companyId._id : selectedAccount.companyId; selectedFromOwner.value = `company-${cId}`; } 
    else if (selectedAccount.individualId) { const iId = typeof selectedAccount.individualId === 'object' ? selectedAccount.individualId._id : selectedAccount.individualId; selectedFromOwner.value = `individual-${iId}`; } 
  } else { selectedFromOwner.value = null; }
};

const onToAccountSelected = (accountId) => {
  const selectedAccount = mainStore.accounts.find(acc => acc._id === accountId);
  if (selectedAccount) {
    if (selectedAccount.companyId) { const cId = typeof selectedAccount.companyId === 'object' ? selectedAccount.companyId._id : selectedAccount.companyId; selectedToOwner.value = `company-${cId}`; } 
    else if (selectedAccount.individualId) { const iId = typeof selectedAccount.individualId === 'object' ? selectedAccount.individualId._id : selectedAccount.individualId; selectedToOwner.value = `individual-${iId}`; } 
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

const title = computed(() => { if (props.transferToEdit && !isCloneMode.value) return 'Редактировать перевод'; return 'Новый перевод'; });
const buttonText = computed(() => { if (isCloneMode.value) return 'Создать копию перевода'; if (props.transferToEdit) return 'Сохранить'; return 'Добавить перевод'; });

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
  } catch (e) { showError('Ошибка: '+e.message); } finally { isInlineSaving.value = false; }
};

const cancelCreateFromAccount = () => { 
    isCreatingFromAccount.value = false; 
    newFromAccountName.value = ''; 
    isCreatingSpecialAccount.value = false;
};
const saveNewFromAccount = async () => {
  if (isInlineSaving.value) return; const name = newFromAccountName.value.trim(); if (!name) return; isInlineSaving.value = true;
  try {
    let cId = null, iId = null; if (selectedFromOwner.value) { const [type, id] = selectedFromOwner.value.split('-'); if (type === 'company') cId = id; else iId = id; }
    // 🟢 PASS EXCLUDED FLAG
    const newItem = await mainStore.addAccount({ 
        name: name, 
        companyId: cId, 
        individualId: iId,
        isExcluded: isCreatingSpecialAccount.value 
    }); 
    fromAccountId.value = newItem._id; onFromAccountSelected(newItem._id);
    cancelCreateFromAccount(); 
  } catch (e) { showError(e.message); } finally { isInlineSaving.value = false; }
};

const cancelCreateToAccount = () => { 
    isCreatingToAccount.value = false; 
    newToAccountName.value = ''; 
    isCreatingSpecialAccount.value = false;
};
const saveNewToAccount = async () => {
  if (isInlineSaving.value) return; const name = newToAccountName.value.trim(); if (!name) return; isInlineSaving.value = true;
  try {
    let cId = null, iId = null; if (selectedToOwner.value) { const [type, id] = selectedToOwner.value.split('-'); if (type === 'company') cId = id; else iId = id; }
    // 🟢 PASS EXCLUDED FLAG
    const newItem = await mainStore.addAccount({ 
        name: name, 
        companyId: cId, 
        individualId: iId,
        isExcluded: isCreatingSpecialAccount.value
    }); 
    toAccountId.value = newItem._id; onToAccountSelected(newItem._id);
    cancelCreateToAccount(); 
  } catch (e) { showError(e.message); } finally { isInlineSaving.value = false; }
};

const handleSave = async () => {
  errorMessage.value = '';
  const cleanedAmount = (amountInput.value?.value || amount.value).replace(/ /g, '');
  const amountParsed = parseFloat(cleanedAmount);
  if (isNaN(amountParsed) || amountParsed <= 0) { showError('Введите корректную сумму'); return; }
  if (!fromAccountId.value || !toAccountId.value) { showError('Выберите счета отправителя и получателя'); return; }
  if (fromAccountId.value === toAccountId.value) { showError('Счета не должны совпадать'); return; }

  const isEdit = !!props.transferToEdit;
  const transferId = props.transferToEdit?._id;
  const isClone = isCloneMode.value;
  const [year, month, day] = editableDate.value.split('-').map(Number); const finalDate = new Date(year, month - 1, day, 12, 0, 0); 
  
  // 🟢 REFACTORED OWNER RESOLUTION (FIX FOR OPTIMISTIC UPDATES)
  const resolveOwner = (accountId, ownerValue) => {
      let cId = null;
      let iId = null;

      // 1. Try from UI selection
      if (ownerValue && ownerValue !== '--CREATE_NEW--') {
          const [type, id] = ownerValue.split('-');
          if (type === 'company') cId = id;
          else if (type === 'individual') iId = id;
      }

      // 2. If missing, force fetch from Account
      if (!cId && !iId && accountId) {
          const acc = mainStore.accounts.find(a => a._id === accountId);
          if (acc) {
               if (acc.companyId) cId = (typeof acc.companyId === 'object') ? acc.companyId._id : acc.companyId;
               else if (acc.individualId) iId = (typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
          }
      }
      return { companyId: cId, individualId: iId };
  };

  const fromOwnerData = resolveOwner(fromAccountId.value, selectedFromOwner.value);
  const toOwnerData = resolveOwner(toAccountId.value, selectedToOwner.value);

  const fromCompanyId = fromOwnerData.companyId;
  const fromIndividualId = fromOwnerData.individualId;
  const toCompanyId = toOwnerData.companyId;
  const toIndividualId = toOwnerData.individualId;
  
  let finalCategoryId = categoryId.value;
  if (transferPurpose.value === 'inter_company') { finalCategoryId = null; }

  const updates = [];
  // Existing Batch Update Logic (Kept for safety, though resolveOwner now handles ID retrieval for payload)
  if (fromAccountId.value && selectedFromOwner.value) {
      const acc = mainStore.accounts.find(a => a._id === fromAccountId.value);
      if (acc) {
          const [type, id] = selectedFromOwner.value.split('-');
          const currentCompId = (acc.companyId && typeof acc.companyId === 'object') ? acc.companyId._id : acc.companyId;
          const currentIndId = (acc.individualId && typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
          let needsUpdate = false;
          if (type === 'company' && currentCompId !== id) needsUpdate = true;
          if (type === 'individual' && currentIndId !== id) needsUpdate = true;
          if (needsUpdate) {
              const updateData = { _id: acc._id, name: acc.name, order: acc.order };
              if (type === 'company') { updateData.companyId = id; updateData.individualId = null; }
              else { updateData.companyId = null; updateData.individualId = id; }
              updates.push(updateData);
          }
      }
  }
  if (toAccountId.value && selectedToOwner.value) {
      const acc = mainStore.accounts.find(a => a._id === toAccountId.value);
      if (acc) {
          const [type, id] = selectedToOwner.value.split('-');
          const currentCompId = (acc.companyId && typeof acc.companyId === 'object') ? acc.companyId._id : acc.companyId;
          const currentIndId = (acc.individualId && typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
          let needsUpdate = false;
          if (type === 'company' && currentCompId !== id) needsUpdate = true;
          if (type === 'individual' && currentIndId !== id) needsUpdate = true;
          if (needsUpdate) {
              const existing = updates.find(u => u._id === acc._id);
              if (!existing) {
                  const updateData = { _id: acc._id, name: acc.name, order: acc.order };
                  if (type === 'company') { updateData.companyId = id; updateData.individualId = null; }
                  else { updateData.companyId = null; updateData.individualId = id; }
                  updates.push(updateData);
              }
          }
      }
  }
  if (updates.length > 0) { await mainStore.batchUpdateEntities('accounts', updates); }

  let finalTaxAmount = 0;
  if (taxCalculation.value) { finalTaxAmount = taxCalculation.value.taxAmount; }

  const transferPayload = { 
      date: finalDate, amount: amountParsed, 
      fromAccountId: fromAccountId.value, toAccountId: toAccountId.value, 
      fromCompanyId: fromCompanyId, toCompanyId: toCompanyId, 
      fromIndividualId: fromIndividualId, toIndividualId: toIndividualId, 
      categoryId: finalCategoryId, transferPurpose: transferPurpose.value,
      transferReason: null, taxAmount: finalTaxAmount
  };
  
  emit('save', { mode: (!isEdit || isClone) ? 'create' : 'edit', id: (!isEdit || isClone) ? null : transferId, data: transferPayload, originalTransfer: isEdit ? props.transferToEdit : null });
};

const closePopup = () => { emit('close'); };
</script>

<template>
  <div class="popup-overlay" @click.self="closePopup">
    <div class="popup-content theme-transfer">
      <h3>{{ title }}</h3>

      <template v-if="!showCreateOwnerModal">
        <div class="custom-input-box input-spacing" :class="{ 'has-value': !!amount }">
          <div class="input-inner-content">
             <span v-if="amount" class="floating-label">Сумма, ₸</span>
             <input type="text" inputmode="decimal" v-model="amount" :placeholder="amount ? '' : 'Перевожу деньги ₸'" ref="amountInput" class="real-input" @input="onAmountInput" autocomplete="off" />
          </div>
      </div>
        
        <!-- СЧЕТ ОТПРАВИТЕЛЯ -->
        <BaseSelect v-if="!isCreatingFromAccount" v-model="fromAccountId" :options="accountOptions" placeholder="Со счета" label="Со счета" class="input-spacing" @change="handleFromAccountChange">
            <template #action-item>
                <div class="dual-action-row">
                    <button @click="showFromAccountInput" class="btn-dual-action left">Создать счет</button>
                    <button @click="openCashChoice('from')" class="btn-dual-action right"> Создать кассу</button>
                </div>
            </template>
        </BaseSelect>
        <div v-else class="inline-create-form input-spacing relative">
          <input type="text" v-model="newFromAccountName" :placeholder="accountCreationPlaceholder" ref="newFromAccountInput" @keyup.enter="saveNewFromAccount" @keyup.esc="cancelCreateFromAccount" @blur="handleFromAccountBlur" @focus="handleFromAccountFocus" autocomplete="off" />
          <button @click="saveNewFromAccount" class="btn-inline-save">✓</button>
          <button @click="cancelCreateFromAccount" class="btn-inline-cancel">✕</button>
          <ul v-if="showFromAccountSuggestions && fromAccountSuggestionsList.length > 0" class="bank-suggestions-list">
              <li v-for="(bank, idx) in fromAccountSuggestionsList" :key="idx" @mousedown.prevent="selectFromAccountSuggestion(bank)">{{ bank.name }}</li>
          </ul>
        </div>

        <BaseSelect v-model="selectedFromOwner" :options="ownerOptions" placeholder="Отправитель" label="Отправитель" class="input-spacing" @change="handleFromOwnerChange">
            <template #action-item>
                <div class="dual-action-row">
                    <button @click="openCreateOwnerModal('company')" class="btn-dual-action left">+ Создать Компанию</button>
                    <button @click="openCreateOwnerModal('individual')" class="btn-dual-action right">+ Создать Физлицо</button>
                </div>
            </template>
        </BaseSelect>

        <!-- СЧЕТ ПОЛУЧАТЕЛЯ -->
        <BaseSelect v-if="!isCreatingToAccount" v-model="toAccountId" :options="accountOptions" placeholder="На счет" label="На счет" class="input-spacing" @change="handleToAccountChange">
            <template #action-item>
                <div class="dual-action-row">
                    <button @click="showToAccountInput" class="btn-dual-action left">Создать счет</button>
                    <button @click="openCashChoice('to')" class="btn-dual-action right"> Создать кассу</button>
                </div>
            </template>
        </BaseSelect>
        <div v-else class="inline-create-form input-spacing relative">
          <input type="text" v-model="newToAccountName" :placeholder="accountCreationPlaceholder" ref="newToAccountInput" @keyup.enter="saveNewToAccount" @keyup.esc="cancelCreateToAccount" @blur="handleToAccountBlur" @focus="handleToAccountFocus" autocomplete="off" />
          <button @click="saveNewToAccount" class="btn-inline-save">✓</button>
          <button @click="cancelCreateToAccount" class="btn-inline-cancel">✕</button>
          <ul v-if="showToAccountSuggestions && toAccountSuggestionsList.length > 0" class="bank-suggestions-list">
              <li v-for="(bank, idx) in toAccountSuggestionsList" :key="idx" @mousedown.prevent="selectToAccountSuggestion(bank)">{{ bank.name }}</li>
          </ul>
        </div>

        <BaseSelect v-model="selectedToOwner" :options="ownerOptions" placeholder="Получатель" label="Получатель" class="input-spacing" @change="handleToOwnerChange">
            <template #action-item>
                <div class="dual-action-row">
                    <button @click="openCreateOwnerModal('company')" class="btn-dual-action left">+ Создать Компанию</button>
                    <button @click="openCreateOwnerModal('individual')" class="btn-dual-action right">+ Создать Физлицо</button>
                </div>
            </template>
        </BaseSelect>

        <div class="input-spacing">
            <BaseSelect v-model="transferPurpose" :options="purposeOptions" placeholder="Цель перевода" label="Цель перевода" />
        </div>

        <div class="tax-info-box" v-if="taxCalculation">
            <div class="tax-row"><span class="tax-label">Сумма перевода:</span><span>{{ amount || 0 }} ₸</span></div>
            <div class="tax-row"><span class="tax-label">Налог ({{ taxCalculation.percent }}% от получателя):</span><span class="tax-val warn-text">{{ formatNumber(taxCalculation.taxAmount) }} ₸</span></div>
            <div class="tax-divider"></div>
            <div class="tax-row total"><span class="tax-label">Будет начислено в налоги:</span><span>{{ formatNumber(taxCalculation.taxAmount) }} ₸</span></div>
            <p class="tax-hint">Сумма налога не списывается со счета автоматически.</p>
        </div>

        <div class="hint-box" v-if="smartHint">{{ smartHint }}</div>
        
        <div class="custom-input-box input-spacing has-value date-box">
           <div class="input-inner-content">
              <span class="floating-label">Дата перевода</span>
              <div class="date-display-row">
                 <span class="date-value-text">{{ toDisplayDate(editableDate) }}</span>
                 <input type="date" v-model="editableDate" class="real-input date-overlay" :min="minDateString" :max="maxDateString" />
                 <svg class="calendar-icon-svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              </div>
           </div>
        </div>

        <div class="popup-actions-row">
          <button @click="handleSave" class="btn-submit save-wide" :class="buttonText === 'Сохранить' ? 'btn-submit-edit' : 'btn-submit-transfer'" :disabled="isInlineSaving">
            {{ buttonText }}
          </button>

          <div v-if="props.transferToEdit && !isCloneMode" class="icon-actions">
            <button class="icon-btn copy-btn" title="Копировать" @click="handleCopyClick" :disabled="isInlineSaving"><svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg></button>
            <button class="icon-btn delete-btn" title="Удалить" @click="handleDeleteClick" :disabled="isInlineSaving"><svg class="icon-stroke" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
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
          <input type="text" v-model="newOwnerName" :placeholder="ownerTypeToCreate === 'company' ? 'Название компании' : 'Имя Физлица'" ref="newOwnerInputRef" class="form-input input-spacing" @keyup.enter="saveNewOwner" @keyup.esc="cancelCreateOwner" autocomplete="off" />
          <div class="smart-create-actions">
            <button @click="cancelCreateOwner" class="btn-modal-action btn-modal-cancel" :disabled="isInlineSaving">Отмена</button>
            <button @click="saveNewOwner" class="btn-modal-action btn-modal-create" :disabled="isInlineSaving">Создать</button>
          </div>
        </div>
      </template>
      
    </div>

    <!-- 🟢 CHOICE MODAL: ВЫБОР ТИПА КАССЫ -->
    <div v-if="showCashChoiceModal" class="inner-overlay" @click.self="showCashChoiceModal = false">
        <div class="choice-box">
            <h4>Создание кассы</h4>
            <p class="choice-desc">Отображаются в виджете 
                <br> "Счета/Кассы"</p>
            <div class="choice-actions">
                <button class="btn-choice-option" @click="handleCashChoice('regular')">
                    <span class="opt-title">Обычная касса</span>
                </button>
                <button class="btn-choice-option" @click="handleCashChoice('special')">
                    <span class="opt-title">Особая касса</span>
                </button>
            </div>
            <button class="btn-cancel-link" @click="showCashChoiceModal = false">Отмена</button>
        </div>
    </div>

    <!-- 🟢 INFO MODAL: ОСОБАЯ КАССА -->
    <InfoModal 
       v-if="showSpecialCashInfo" 
       title="Особая касса" 
       message="Вы создаёте особый вид кассы, которую можно исключать из общих расчётов. Сделать это можно в настройках 'Счета/Кассы'." 
       buttonText="Продолжить создание"
       @close="confirmSpecialCash"
    />

  </div>

  <InfoModal v-if="showInfoModal && !showSpecialCashInfo" :title="infoModalTitle" :message="infoModalMessage" @close="showInfoModal = false" />
  <ConfirmationPopup v-if="isDeleteConfirmVisible" title="Подтвердите удаление" message="Вы уверены, что хотите удалить этот перевод?" @close="isDeleteConfirmVisible = false" @confirm="onDeleteConfirmed" />
</template>

<style scoped>
/* 🟢 CSS ПЕРЕМЕННЫЕ */
.popup-content {
    /* 🟢 Цвет ТЕМНО-СИНИЙ */
    --color-transfer: #2F3340; 
    --color-danger: #FF3B30;
    /* 🟢 Передаем focus-color в BaseSelect */
    --focus-color: #2F3340;
    --focus-shadow: rgba(47, 51, 64, 0.2);
    /* 🟢 SYSTEM APPLE FONT */
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
}
:deep(*), :deep(input), :deep(button), :deep(select), :deep(textarea) { font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important; }

.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; color: #1a1a1a; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem; }
.theme-edit { border-top: 4px solid var(--color-transfer); }
.theme-transfer { border-top: 4px solid var(--color-transfer); }

h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 2rem; text-align: left; font-size: 22px; font-weight: 700; }
.hint-box { background-color: #E3F2FD; border: 1px solid #90CAF9; color: #0D47A1; padding: 10px 12px; border-radius: 8px; font-size: 0.85em; line-height: 1.4; margin-bottom: 12px; }
.tax-info-box { background-color: #FFF3E0; border: 1px solid #FFE0B2; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.tax-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; color: #555; }
.tax-divider { height: 1px; background-color: #FFCC80; margin: 6px 0; }
.total { font-weight: 700; font-size: 14px; color: #333; }
.warn-text { color: #F59E0B; font-weight: 600; }
.tax-hint { font-size: 11px; color: #888; margin-top: 8px; margin-bottom: 0; font-style: italic; }

.custom-input-box { width: 100%; height: 54px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; padding: 0 14px; display: flex; align-items: center; position: relative; transition: all 0.2s ease; box-sizing: border-box; }
/* 🟢 2. ФОКУС СУММЫ - ТЕМНО-СИНИЙ */
.custom-input-box:focus-within { border-color: var(--color-transfer) !important; box-shadow: 0 0 0 1px var(--focus-shadow) !important; }
.input-inner-content { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.floating-label { font-size: 11px; color: #999; margin-bottom: -2px; margin-top: 4px; }
.real-input { width: 100%; border: none; background: transparent; padding: 0; font-size: 15px !important; color: #1a1a1a; font-weight: 500; height: auto; line-height: 1.3; outline: none; font-family: inherit; }
.date-display-row { display: flex; justify-content: space-between; align-items: center; position: relative; width: 100%; }
.date-value-text { font-size: 15px; font-weight: 500; color: #1a1a1a; }
.date-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; z-index: 2; }
.calendar-icon-svg { width: 18px; height: 18px; stroke: #999; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.input-spacing { margin-bottom: 12px; }
.form-input { width: 100%; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.form-input:focus { outline: none; border-color: var(--color-transfer); }
.error-message { color: #FF3B30; text-align: center; margin-top: 1rem; font-size: 14px; }
.popup-actions-row { display: flex; align-items: center; gap: 10px; margin-top: 2rem; }
.save-wide { flex: 1 1 auto; height: 54px; }
.icon-actions { display: flex; gap: 10px; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 10px; cursor: pointer; background: #F4F4F4; border: 1px solid #E0E0E0; color: #333; transition: all 0.2s; padding: 0; }
.copy-btn:hover { background: #E8F5E9; border-color: #A5D6A7; color: #34C759; }
.delete-btn:hover { background: #FFF0F0; border-color: #FFD0D0; color: #FF3B30; }
.delete-btn:hover .icon-stroke { stroke: #FF3B30; }
.icon { width: 20px; height: 20px; fill: currentColor; display: block; }
.icon-stroke { width: 20px; height: 20px; stroke: #333; fill: none; transition: stroke 0.2s; }
.btn-submit { width: 100%; height: 50px; padding: 0 1rem; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; font-family: inherit; cursor: pointer; transition: background-color 0.2s ease; }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-submit-transfer { background-color: var(--color-transfer); }
.btn-submit-transfer:hover:not(:disabled) { background-color: #2f3d6bff; }
.btn-submit-edit { background-color: #444; }

/* Inline Create */
.inline-create-form { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.inline-create-form input { flex: 1; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a; font-size: 15px; box-sizing: border-box; }
.inline-create-form input:focus { outline: none; border-color: var(--color-transfer); }

/* Buttons inline */
.btn-inline-save { width: 48px; height: 48px; background-color: transparent; border: 1px solid var(--color-transfer); color: var(--color-transfer); border-radius: 8px; font-size: 20px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; }
.btn-inline-save:hover { background-color: var(--color-transfer); color: #fff; }
.btn-inline-cancel { width: 48px; height: 48px; background-color: transparent; border: 1px solid var(--color-danger); color: var(--color-danger); border-radius: 8px; font-size: 20px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; }
.btn-inline-cancel:hover { background-color: var(--color-danger); color: #fff; }

/* Modal Buttons */
.btn-modal-action { flex: 1; height: 48px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; }
.btn-modal-cancel { background-color: #f0f0f0; color: #333; border: 1px solid #ddd; }
.btn-modal-create { background-color: var(--color-transfer); color: white; } 
.btn-modal-create:hover { background-color: #444; }

.smart-create-owner { border-top: 1px solid #E0E0E0; margin-top: 1.5rem; padding-top: 1.5rem; }
.smart-create-title { font-size: 18px; font-weight: 600; color: #1a1a1a; text-align: center; margin-top: 0; margin-bottom: 1.5rem; }
.smart-create-tabs { display: flex; justify-content: center; gap: 10px; margin-bottom: 1.5rem;  }
.smart-create-tabs button { flex: 1; padding: 12px; font-size: 14px; font-weight: 500; border: 1px solid #E0E0E0; border-radius: 8px; background: #FFFFFF; color: #030303; cursor: pointer; transition: all 0.2s; }
.smart-create-tabs button.active { background: #222; color: #FFFFFF; border-color: #222; }
.smart-create-actions { display: flex; gap: 10px; margin-top: 1rem; }

/* Dual Action in Select */
.dual-action-row { display: flex; width: 100%; height: 46px; border-top: 1px solid #eee; }
.btn-dual-action { flex: 1; border: none; background-color: #fff; font-size: 13px; font-weight: 600; color: var(--color-transfer); cursor: pointer; transition: background-color 0.2s; white-space: nowrap; }
.btn-dual-action:hover { background-color: #f0f8ff; }
.btn-dual-action.left { border-right: 1px solid #eee; border-bottom-left-radius: 8px; }
.btn-dual-action.right { border-bottom-right-radius: 8px; }

/* Sticky buttons in list */
:deep(.list-item-wrapper.is-action-row) { position: sticky; bottom: 0; z-index: 10; background-color: #fff; border-top: 1px solid #eee; }
:deep(.list-item-wrapper.is-special) { color: var(--color-transfer); font-weight: 600; position: sticky !important; bottom: 0 !important; z-index: 10; background-color: #fff; border-top: 1px solid #eee; }
:deep(.list-item-wrapper.is-special:hover) { background-color: #f0f8ff; }

.relative { position: relative; }
.bank-suggestions-list { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #E0E0E0; border-top: none; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); z-index: 2000; list-style: none; padding: 0; margin: 0; max-height: 160px; overflow-y: auto; }
.bank-suggestions-list li { padding: 10px 14px; font-size: 14px; color: #333; cursor: pointer; border-bottom: 1px solid #f5f5f5; }
.bank-suggestions-list li:last-child { border-bottom: none; }
.bank-suggestions-list li:hover { background-color: #f9f9f9; }

/* 🟢 СТИЛИ ДЛЯ МОДАЛКИ ВЫБОРА (CHOICE BOX) */
.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 2100; }
.choice-box { background: #fff; padding: 24px; border-radius: 12px; width: 340px; text-align: center; box-shadow: 0 5px 30px rgba(0,0,0,0.3); }
.choice-box h4 { margin: 0 0 15px 0; color: #222; font-size: 18px; font-weight: 700; }
.choice-desc { font-size: 14px; color: #666; margin-bottom: 20px; }
.choice-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; }
.btn-choice-option { 
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 12px; background: #F9F9F9; border: 1px solid #E0E0E0; border-radius: 8px; cursor: pointer; transition: all 0.2s;
}
.btn-choice-option:hover { background: #f0f8ff; border-color: #2F3340; }
.opt-title { font-size: 15px; font-weight: 600; color: #222; margin-bottom: 4px; }
.btn-cancel-link { background: none; border: none; font-size: 14px; color: #888; cursor: pointer; text-decoration: underline; }
.btn-cancel-link:hover { color: #555; }

/* 🟢 MOBILE OPTIMIZATION */
@media (max-width: 600px), (max-height: 900px) {
  .popup-content {
    padding: 1.5rem;
    margin: 1rem;
    width: auto;
    max-width: none;
  }
  h3 {
    font-size: 18px;
    margin-bottom: 1rem;
  }
  .custom-input-box {
    height: 44px;
  }
  .input-spacing {
    margin-bottom: 8px;
  }
  .btn-submit, .btn-modal-action, .btn-inline-save, .btn-inline-cancel {
    height: 44px;
    font-size: 15px;
  }
  .icon-btn {
    width: 44px;
    height: 44px;
  }
  .form-input {
    height: 44px;
  }
  .floating-label {
    font-size: 10px;
    margin-bottom: 0;
  }
  .real-input {
    font-size: 14px !important;
  }
  .popup-actions-row {
    margin-top: 1.5rem;
  }
  /* Specific to Transfer Popup */
  .hint-box {
    font-size: 12px;
    padding: 8px;
    margin-bottom: 8px;
  }
  .tax-info-box {
    padding: 8px;
    margin-bottom: 8px;
  }
  .tax-row {
    font-size: 12px;
  }
}
</style>