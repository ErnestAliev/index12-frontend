<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber as formatBalance } from '@/utils/formatters.js'; 
import ConfirmationPopup from './ConfirmationPopup.vue';
import BaseSelect from './BaseSelect.vue'; 

/**
 * * --- МЕТКА ВЕРСИИ: v19.1 - PRO UI UPDATE ---
 * * ВЕРСИЯ: 19.1 - Обновленный дизайн и цвета
 * * ДАТА: 2025-11-21
 * *
 * * 1. Добавлены CSS переменные для тем (--focus-color) в контейнер попапа.
 * * 2. BaseSelect теперь наследует цвет темы (Зеленый/Оранжевый/Черный).
 */

const mainStore = useMainStore();

const props = defineProps({
  type: { type: String, required: true },
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  operationToEdit: { type: Object, default: null },
  minAllowedDate: { type: Date, default: null },
  maxAllowedDate: { type: Date, default: null }
});

const emit = defineEmits([
  'close', 'operation-deleted', 'operation-moved', 'trigger-prepayment', 'save'
]);

// --- ДАННЫЕ ---
const amount = ref('');
const selectedAccountId = ref(null);
const selectedOwner = ref(null);
const selectedContractorId = ref(null);
const selectedCategoryId = ref(null);
const selectedProjectId = ref(null);

const errorMessage = ref('');
const amountInput = ref(null);
const isInlineSaving = ref(false);
const isInitialLoad = ref(true); 

// --- INLINE CREATE STATES ---
const isCreatingAccount = ref(false); const newAccountName = ref(''); const newAccountInput = ref(null);
const isCreatingContractor = ref(false); const newContractorName = ref(''); const newContractorInput = ref(null);
const isCreatingProject = ref(false); const newProjectName = ref(''); const newProjectInput = ref(null);
const isCreatingCategory = ref(false); const newCategoryName = ref(''); const newCategoryInput = ref(null);

const showCreateOwnerModal = ref(false);
const ownerTypeToCreate = ref('company'); 
const newOwnerName = ref('');
const newOwnerInputRef = ref(null);

const isDeleteConfirmVisible = ref(false);
const isCloneMode = ref(false);

// --- FORMATTERS ---
const formatNumber = (numStr) => {
  const clean = `${numStr}`.replace(/[^0-9]/g, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const toInputDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const toInputDateString = (date) => date ? toInputDate(date) : null;

const editableDate = ref(toInputDate(props.date));
const minDateString = computed(() => toInputDateString(props.minAllowedDate));
const maxDateString = computed(() => toInputDateString(props.maxAllowedDate));

// 🟢 OPTIONS
const accountOptions = computed(() => {
  const opts = mainStore.currentAccountBalances.map(acc => ({
    value: acc._id,
    label: acc.name,
    rightText: `${formatBalance(Math.abs(acc.balance))} ₸`, 
    isSpecial: false
  }));
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать новый счет', isSpecial: true });
  return opts;
});

const ownerOptions = computed(() => {
  const opts = [];
  mainStore.companies.forEach(c => { opts.push({ value: `company-${c._id}`, label: c.name, isSpecial: false }); });
  mainStore.individuals.forEach(i => { opts.push({ value: `individual-${i._id}`, label: i.name, isSpecial: false }); });
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать Компанию/Физлицо', isSpecial: true });
  return opts;
});

const contractorOptions = computed(() => {
  const opts = mainStore.contractors.map(c => ({ value: c._id, label: c.name, isSpecial: false }));
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать контрагента', isSpecial: true });
  return opts;
});

const projectOptions = computed(() => {
  const opts = mainStore.projects.map(p => ({ value: p._id, label: p.name, isSpecial: false }));
  opts.unshift({ value: null, label: 'Без проекта', isSpecial: false });
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать проект', isSpecial: true });
  return opts;
});

const categoryOptions = computed(() => {
  const validCats = mainStore.categories.filter(c => {
    const name = c.name.toLowerCase().trim();
    return name !== 'перевод' && name !== 'transfer';
  });
  const opts = validCats.map(c => ({ value: c._id, label: c.name, isSpecial: false }));
  opts.unshift({ value: null, label: 'Без категории', isSpecial: false });
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать категорию', isSpecial: true });
  return opts;
});

// 🟢 HANDLERS
const handleAccountChange = (val) => { if (val === '--CREATE_NEW--') { selectedAccountId.value = null; showAccountInput(); } else { onAccountSelected(val); } };
const handleOwnerChange = (val) => { if (val === '--CREATE_NEW--') { selectedOwner.value = null; openCreateOwnerModal(); } };
const handleContractorChange = (val) => { if (val === '--CREATE_NEW--') { selectedContractorId.value = null; showContractorInput(); } else { onContractorSelected(val, true, true); } };
const handleProjectChange = (val) => { if (val === '--CREATE_NEW--') { selectedProjectId.value = null; showProjectInput(); } };
const handleCategoryChange = (val) => { if (val === '--CREATE_NEW--') { selectedCategoryId.value = null; showCategoryInput(); } };

watch(selectedCategoryId, (newVal) => {
    if (isInitialLoad.value) return;
    if (!newVal || newVal === '--CREATE_NEW--') return;
    const prepayIds = mainStore.getPrepaymentCategoryIds;
    if (prepayIds.includes(newVal)) {
        const rawAmount = parseFloat(amount.value.replace(/\s/g, '')) || 0;
        const currentData = {
            amount: rawAmount, accountId: selectedAccountId.value, contractorId: selectedContractorId.value,
            projectId: selectedProjectId.value, categoryId: newVal,
            companyId: selectedOwner.value?.startsWith('company') ? selectedOwner.value.split('-')[1] : null,
            individualId: selectedOwner.value?.startsWith('individual') ? selectedOwner.value.split('-')[1] : null,
            date: editableDate.value, cellIndex: props.cellIndex, operationToEdit: props.operationToEdit
        };
        emit('trigger-prepayment', currentData);
    }
});

const onAmountInput = (event) => {
  const input = event.target; const value = input.value; const cursorPosition = input.selectionStart;
  const rawValue = value.replace(/[^0-9]/g, ''); const formattedValue = formatNumber(rawValue);
  const cursorOffset = formattedValue.length - value.length; amount.value = formattedValue;
  if (input.value !== formattedValue) input.value = formattedValue;
  nextTick(() => { if (input.selectionStart !== undefined) input.setSelectionRange(cursorPosition + cursorOffset, cursorPosition + cursorOffset); });
};

const onAccountSelected = (accountId) => {
  const account = mainStore.accounts.find(a => a._id === accountId);
  if (account) {
    if (account.companyId) { const cId = (typeof account.companyId === 'object') ? account.companyId._id : account.companyId; selectedOwner.value = `company-${cId}`; } 
    else if (account.individualId) { const iId = (typeof account.individualId === 'object') ? account.individualId._id : account.individualId; selectedOwner.value = `individual-${iId}`; } 
    else { selectedOwner.value = null; }
  } else { selectedOwner.value = null; }
};

const onContractorSelected = (contractorId, setProject, setCategory) => {
  const contractor = mainStore.contractors.find(c => c._id === contractorId);
  if (contractor) {
    if (setProject && contractor.defaultProjectId) { const pId = (contractor.defaultProjectId && typeof contractor.defaultProjectId === 'object') ? contractor.defaultProjectId._id : contractor.defaultProjectId; selectedProjectId.value = pId; }
    if (setCategory && contractor.defaultCategoryId) { const cId = (contractor.defaultCategoryId && typeof contractor.defaultCategoryId === 'object') ? contractor.defaultCategoryId._id : contractor.defaultCategoryId; selectedCategoryId.value = cId; }
  }
};

onMounted(async () => {
  isInitialLoad.value = true; 
  if (props.operationToEdit) {
    const op = props.operationToEdit; amount.value = formatNumber(Math.abs(op.amount || 0)); selectedAccountId.value = op.accountId?._id || op.accountId;
    if (op.companyId) { const cId = op.companyId?._id || op.companyId; selectedOwner.value = `company-${cId}`; } 
    else if (op.individualId) { const iId = op.individualId?._id || op.individualId; selectedOwner.value = `individual-${iId}`; }
    selectedContractorId.value = op.contractorId?._id || op.contractorId;
    const catId = op.categoryId?._id || op.categoryId; const prepId = op.prepaymentId?._id || op.prepaymentId; selectedCategoryId.value = catId || prepId || null;
    selectedProjectId.value = op.projectId?._id || op.projectId;
    if (op.date) editableDate.value = toInputDate(new Date(op.date));
  } else { setTimeout(() => { if (amountInput.value) amountInput.value.focus(); }, 100); }
  await nextTick(); isInitialLoad.value = false;
});

const handleSave = () => {
  if (isInlineSaving.value) return; errorMessage.value = '';
  const amountFromState = (amount.value || '').replace(/ /g, ''); const amountParsed = parseFloat(amountFromState);
  if (isNaN(amountParsed) || amountParsed <= 0 || !selectedAccountId.value || !selectedOwner.value || !selectedContractorId.value) { errorMessage.value = 'Пожалуйста, заполните все обязательные поля: Сумма, Счет, Компания/Физлицо, Контрагент.'; return; }
  const [year, month, day] = editableDate.value.split('-').map(Number); const finalDate = new Date(year, month - 1, day, 12, 0, 0); 
  let companyId = null; let individualId = null;
  if (selectedOwner.value) { const [type, id] = selectedOwner.value.split('-'); if (type === 'company') companyId = id; else if (type === 'individual') individualId = id; }
  const payload = { type: props.type, amount: props.type === 'income' ? amountParsed : -Math.abs(amountParsed), categoryId: selectedCategoryId.value || null, accountId: selectedAccountId.value, companyId: companyId, individualId: individualId, contractorId: selectedContractorId.value, projectId: selectedProjectId.value || null, date: finalDate };
  const isEdit = !!props.operationToEdit && !isCloneMode.value;
  emit('save', { mode: isEdit ? 'edit' : 'create', id: isEdit ? props.operationToEdit._id : null, data: payload, originalOperation: isEdit ? props.operationToEdit : null });
};

// INLINE CREATE HANDLERS
const showAccountInput = () => { isCreatingAccount.value = true; nextTick(() => newAccountInput.value?.focus()); };
const cancelCreateAccount = () => { isCreatingAccount.value = false; newAccountName.value = ''; };
const saveNewAccount = async () => { if (isInlineSaving.value) return; const name = newAccountName.value.trim(); if (!name) return; isInlineSaving.value = true; try { const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase()); let cId = null, iId = null; if (selectedOwner.value) { const [type, id] = selectedOwner.value.split('-'); if (type === 'company') cId = id; else iId = id; } if (existing) { selectedAccountId.value = existing._id; onAccountSelected(existing._id); } else { const newItem = await mainStore.addAccount({ name: name, companyId: cId, individualId: iId }); selectedAccountId.value = newItem._id; onAccountSelected(newItem._id); } cancelCreateAccount(); } catch (e) { console.error(e); } finally { isInlineSaving.value = false; } };
const showContractorInput = () => { isCreatingContractor.value = true; nextTick(() => newContractorInput.value?.focus()); };
const cancelCreateContractor = () => { isCreatingContractor.value = false; newContractorName.value = ''; };
const saveNewContractor = async () => { if (isInlineSaving.value) return; const name = newContractorName.value.trim(); if (!name) return; isInlineSaving.value = true; try { const existing = mainStore.contractors.find(c => c.name.toLowerCase() === name.toLowerCase()); if (existing) { selectedContractorId.value = existing._id; onContractorSelected(existing._id, true, true); } else { const newItem = await mainStore.addContractor(name); selectedContractorId.value = newItem._id; onContractorSelected(newItem._id, true, true); } cancelCreateContractor(); } catch (e) { console.error(e); } finally { isInlineSaving.value = false; } };
const showProjectInput = () => { isCreatingProject.value = true; nextTick(() => newProjectInput.value?.focus()); };
const cancelCreateProject = () => { isCreatingProject.value = false; newProjectName.value = ''; };
const saveNewProject = async () => { if (isInlineSaving.value) return; const name = newProjectName.value.trim(); if (!name) return; isInlineSaving.value = true; try { const existing = mainStore.projects.find(p => p.name.toLowerCase() === name.toLowerCase()); if (existing) selectedProjectId.value = existing._id; else { const newItem = await mainStore.addProject(name); selectedProjectId.value = newItem._id; } cancelCreateProject(); } catch (e) { console.error(e); } finally { isInlineSaving.value = false; } };
const showCategoryInput = () => { isCreatingCategory.value = true; nextTick(() => newCategoryInput.value?.focus()); };
const cancelCreateCategory = () => { isCreatingCategory.value = false; newCategoryName.value = ''; };
const saveNewCategory = async () => { if (isInlineSaving.value) return; const name = newCategoryName.value.trim(); if (!name) return; isInlineSaving.value = true; try { const existing = mainStore.categories.find(c => c.name.toLowerCase() === name.toLowerCase()); if (existing) selectedCategoryId.value = existing._id; else { const newItem = await mainStore.addCategory(name); selectedCategoryId.value = newItem._id; } cancelCreateCategory(); } catch (e) { console.error(e); } finally { isInlineSaving.value = false; } };
const openCreateOwnerModal = () => { ownerTypeToCreate.value = 'company'; newOwnerName.value = ''; showCreateOwnerModal.value = true; nextTick(() => newOwnerInputRef.value?.focus()); };
const cancelCreateOwner = () => { if (isInlineSaving.value) return; showCreateOwnerModal.value = false; newOwnerName.value = ''; if (selectedOwner.value === '--CREATE_NEW--') selectedOwner.value = null; };
const setOwnerTypeToCreate = (type) => { ownerTypeToCreate.value = type; newOwnerInputRef.value?.focus(); };
const saveNewOwner = async () => { if (isInlineSaving.value) return; const name = newOwnerName.value.trim(); const type = ownerTypeToCreate.value; if (!name) return; isInlineSaving.value = true; try { let newItem; if (type === 'company') { const existing = mainStore.companies.find(c => c.name.toLowerCase() === name.toLowerCase()); newItem = existing ? existing : await mainStore.addCompany(name); } else { const existing = mainStore.individuals.find(i => i.name.toLowerCase() === name.toLowerCase()); newItem = existing ? existing : await mainStore.addIndividual(name); } selectedOwner.value = `${type}-${newItem._id}`; showCreateOwnerModal.value = false; newOwnerName.value = ''; } catch (e) { console.error(e); } finally { isInlineSaving.value = false; } };

// UI Helpers
const closePopup = () => { if (!isInlineSaving.value) emit('close'); };
const handleDeleteClick = () => { isDeleteConfirmVisible.value = true; };
const onDeleteConfirmed = async () => { try { if (!props.operationToEdit?._id) return; await mainStore.deleteOperation(props.operationToEdit); emit('operation-deleted', { dateKey: props.operationToEdit.dateKey }); emit('close'); } catch (e) { console.error(e); } finally { isDeleteConfirmVisible.value = false; } };
const handleCopyClick = () => { isCloneMode.value = true; editableDate.value = toInputDate(props.date); nextTick(() => { amountInput.value?.focus(); }); };

const isEditMode = computed(() => !!props.operationToEdit && !isCloneMode.value);
const title = computed(() => { if (isCloneMode.value) return `Копия: ${props.type === 'income' ? 'Доход' : 'Расход'}`; if (isEditMode.value) return `${props.type === 'income' ? 'Доход' : 'Расход'}`; return `Новый ${props.type === 'income' ? 'Доход' : 'Расход'}`; });
const popupTheme = computed(() => { if (isEditMode.value) return 'theme-edit'; return props.type === 'income' ? 'theme-income' : 'theme-expense'; });
const buttonText = computed(() => { if (isCloneMode.value) return 'Создать копию'; return isEditMode.value ? 'Сохранить' : 'Создать'; });
const buttonClass = computed(() => { if (isEditMode.value) return 'btn-submit-edit'; return props.type === 'income' ? 'btn-submit-income' : 'btn-submit-expense'; });
</script>

<template>
  <div class="popup-overlay" @click.self="closePopup">
    <!-- 🟢 Привязка темы через CSS переменные -->
    <div class="popup-content" :class="popupTheme">
      <h3>{{ title }}</h3>

      <label>Сумма</label>
      <input type="text" inputmode="decimal" v-model="amount" placeholder="0" ref="amountInput" class="form-input" @input="onAmountInput" />

      <template v-if="props.type !== 'transfer' && !showCreateOwnerModal">
        <!-- 1. СЧЕТ -->
        <label>{{ props.type === 'income' ? 'На мой счет' : 'Со счета' }} *</label>
        <BaseSelect
          v-if="!isCreatingAccount"
          v-model="selectedAccountId"
          :options="accountOptions"
          placeholder="Выберите счет"
          @change="handleAccountChange"
        />
        <div v-else class="inline-create-form">
          <input type="text" v-model="newAccountName" placeholder="Название счета" ref="newAccountInput" @keyup.enter="saveNewAccount" @keyup.esc="cancelCreateAccount" />
          <button @click="saveNewAccount" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateAccount" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>
      
        <!-- 2. ВЛАДЕЛЕЦ -->
        <label>Моей Компании/Физлица *</label>
        <BaseSelect
          v-model="selectedOwner"
          :options="ownerOptions"
          placeholder="Выберите владельца"
          @change="handleOwnerChange"
        />

        <!-- 3. КОНТРАГЕНТ -->
        <label>{{ props.type === 'income' ? 'От контрагента' : 'Контрагенту' }} *</label>
        <BaseSelect
          v-if="!isCreatingContractor"
          v-model="selectedContractorId"
          :options="contractorOptions"
          placeholder="Выберите контрагента"
          @change="handleContractorChange"
        />
        <div v-else class="inline-create-form">
          <input type="text" v-model="newContractorName" placeholder="Название контрагента" ref="newContractorInput" @keyup.enter="saveNewContractor" @keyup.esc="cancelCreateContractor" />
          <button @click="saveNewContractor" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateContractor" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>

        <!-- 4. ПРОЕКТ -->
        <label>{{ props.type === 'income' ? 'Из проекта' : 'В проект' }}</label>
        <BaseSelect
          v-if="!isCreatingProject"
          v-model="selectedProjectId"
          :options="projectOptions"
          placeholder="Без проекта"
          @change="handleProjectChange"
        />
        <div v-else class="inline-create-form">
          <input type="text" v-model="newProjectName" placeholder="Название проекта" ref="newProjectInput" @keyup.enter="saveNewProject" @keyup.esc="cancelCreateProject" />
          <button @click="saveNewProject" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateProject" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>

        <!-- 5. КАТЕГОРИЯ -->
        <label>По категории</label>
        <BaseSelect
          v-if="!isCreatingCategory"
          v-model="selectedCategoryId"
          :options="categoryOptions"
          placeholder="Без категории"
          @change="handleCategoryChange"
        />
        <div v-else class="inline-create-form">
          <input type="text" v-model="newCategoryName" placeholder="Название категории" ref="newCategoryInput" @keyup.enter="saveNewCategory" @keyup.esc="cancelCreateCategory" />
          <button @click="saveNewCategory" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateCategory" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
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

      <template v-if="!showCreateOwnerModal">
        <label>Дата операции</label>
        <input type="date" v-model="editableDate" class="form-input" :min="minDateString" :max="maxDateString" />

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

        <div class="popup-actions-row">
          <button @click="handleSave" class="btn-submit save-wide" :class="buttonClass" :disabled="isInlineSaving">
            {{ buttonText }}
          </button>
          <div v-if="props.operationToEdit && !isCloneMode.value" class="icon-actions">
            <button class="icon-btn" title="Копировать" @click="handleCopyClick" aria-label="Копировать" :disabled="isInlineSaving">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg>
            </button>
            <button class="icon-btn danger" title="Удалить" @click="handleDeleteClick" aria-label="Удалить" :disabled="isInlineSaving">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6a1 1 0 0 1 1 1v1h5v2H3V5h5V4a1 1 0 0 1 1-1Zm2 6h2v9h-2V9Zm6 0h2v9h-2V9ZM5 9h2v9H5V9Z"/></svg>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>

  <ConfirmationPopup v-if="isDeleteConfirmVisible" title="Подтвердите удаление" message="Вы уверены, что хотите удалить эту операцию?" @close="isDeleteConfirmVisible = false" @confirm="onDeleteConfirmed" />
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; color: #1a1a1a; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem; }
h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 2rem; text-align: left; font-size: 22px; font-weight: 600; }
label { display: block; margin-bottom: 0.5rem; margin-top: 1rem; color: #333; font-size: 14px; font-weight: 500; }

/* 🟢 ОПРЕДЕЛЕНИЕ ТЕМ (CSS Переменные) */
.theme-income { --focus-color: #28B8A0; --focus-shadow: rgba(40, 184, 160, 0.2); }
.theme-expense { --focus-color: #F36F3F; --focus-shadow: rgba(243, 111, 63, 0.2); }
.theme-edit { --focus-color: #222222; --focus-shadow: rgba(34, 34, 34, 0.2); }

.form-input { width: 100%; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.form-input:focus { outline: none; border-color: var(--focus-color); box-shadow: 0 0 0 2px var(--focus-shadow); }

.inline-create-form { display: flex; align-items: center; gap: 8px; margin-bottom: 15px; }
.inline-create-form input { flex: 1; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; }
.inline-create-form input:focus { outline: none; border-color: var(--focus-color); box-shadow: 0 0 0 2px var(--focus-shadow); }
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
.btn-submit-income { background-color: #28B8A0; }
.btn-submit-income:hover:not(:disabled) { background-color: #1f9c88; }
.btn-submit-expense { background-color: #F36F3F; }
.btn-submit-expense:hover:not(:disabled) { background-color: #d95a30; }
.btn-submit-edit { background-color: #222222; }
.btn-submit-edit:hover:not(:disabled) { background-color: #333333; }
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
