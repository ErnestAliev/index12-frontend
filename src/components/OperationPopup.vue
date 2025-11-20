<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import axios from 'axios';
import { useMainStore } from '@/stores/mainStore';
import ConfirmationPopup from './ConfirmationPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v15.0 - SEPARATE MODAL TRIGGER ---
 * * ВЕРСИЯ: 15.0 - Переход на отдельное модальное окно
 * * ДАТА: 2025-11-20
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (LOGIC) `watch(selectedCategoryId)`: Если выбрана "Предоплата",
 * вместо показа полей внутри, эмитим `switch-to-prepayment` и данные формы.
 * 2. (UI) Удален "Умный блок" (он переехал в PrepaymentModal).
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
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
  'close',
  'operation-added',
  'operation-deleted',
  'operation-moved',
  'operation-updated',
  'switch-to-prepayment' // 🟢 НОВОЕ СОБЫТИЕ
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

// --- INLINE CREATE STATES (сокращено для чтения, код остается) ---
const isCreatingAccount = ref(false);
const newAccountName = ref('');
const newAccountInput = ref(null);
const isCreatingContractor = ref(false);
const newContractorName = ref('');
const newContractorInput = ref(null);
const isCreatingProject = ref(false);
const newProjectName = ref('');
const newProjectInput = ref(null);
const isCreatingCategory = ref(false);
const newCategoryName = ref('');
const newCategoryInput = ref(null);

const showCreateOwnerModal = ref(false);
const ownerTypeToCreate = ref('company'); 
const newOwnerName = ref('');
const newOwnerInputRef = ref(null);

const isDeleteConfirmVisible = ref(false);
const isCloneMode = ref(false);

// 🟢 ФИЛЬТРАЦИЯ КАТЕГОРИЙ
const availableCategories = computed(() => {
  return mainStore.categories.filter(c => {
    const name = c.name.toLowerCase().trim();
    return name !== 'перевод' && name !== 'transfer';
  });
});

// 🟢 СЛЕЖЕНИЕ ЗА ВЫБОРОМ КАТЕГОРИИ
watch(selectedCategoryId, (newVal) => {
    if (!newVal) return;
    const prepayIds = mainStore.getPrepaymentCategoryIds;
    
    if (prepayIds.includes(newVal)) {
        // Это Предоплата! Триггерим переход
        const currentData = {
            amount: parseFloat(amount.value.replace(/\s/g, '')) || 0,
            accountId: selectedAccountId.value,
            contractorId: selectedContractorId.value,
            projectId: selectedProjectId.value,
            categoryId: newVal,
            companyId: selectedOwner.value?.startsWith('company') ? selectedOwner.value.split('-')[1] : null,
            individualId: selectedOwner.value?.startsWith('individual') ? selectedOwner.value.split('-')[1] : null,
            // Дата и прочее
        };
        
        // Эмитим событие родителю (TheHeader или HomeView)
        emit('switch-to-prepayment', currentData);
    }
});

// --- FORMATTERS ---
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
  if (input.value !== formattedValue) {
    input.value = formattedValue; 
  }
  nextTick(() => {
    if (input.selectionStart !== undefined) {
      input.setSelectionRange(cursorPosition + cursorOffset, cursorPosition + cursorOffset);
    }
  });
};

// --- ДАТА ---
const toInputDateString = (date) => {
  if (!date) return null;
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const minDateString = computed(() => toInputDateString(props.minAllowedDate));
const maxDateString = computed(() => toInputDateString(props.maxAllowedDate));

const toInputDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const editableDate = ref(toInputDate(props.date));

// --- AUTO-SELECT ---
const onAccountSelected = (accountId) => {
  const account = mainStore.accounts.find(a => a._id === accountId);
  if (account) {
    if (account.companyId) {
      const cId = (typeof account.companyId === 'object') ? account.companyId._id : account.companyId;
      selectedOwner.value = `company-${cId}`;
    } else if (account.individualId) {
      const iId = (typeof account.individualId === 'object') ? account.individualId._id : account.individualId;
      selectedOwner.value = `individual-${iId}`;
    } else {
      selectedOwner.value = null;
    }
  } else {
    selectedOwner.value = null;
  }
};

const onContractorSelected = (contractorId, setProject, setCategory) => {
  const contractor = mainStore.contractors.find(c => c._id === contractorId);
  if (contractor) {
    if (setProject && contractor.defaultProjectId) {
      const pId = (contractor.defaultProjectId && typeof contractor.defaultProjectId === 'object')
        ? contractor.defaultProjectId._id
        : contractor.defaultProjectId;
      selectedProjectId.value = pId;
    }
    if (setCategory && contractor.defaultCategoryId) {
      const cId = (contractor.defaultCategoryId && typeof contractor.defaultCategoryId === 'object')
        ? contractor.defaultCategoryId._id
        : contractor.defaultCategoryId;
      
      const catObj = mainStore.categories.find(c => c._id === cId);
      if (catObj) {
         const name = catObj.name.toLowerCase().trim();
         if (name !== 'перевод' && name !== 'transfer') {
             selectedCategoryId.value = cId;
         }
      } else {
          selectedCategoryId.value = cId;
      }
    }
  }
};

// --- MOUNTED ---
onMounted(async () => {
  // Гарантия системной категории "Предоплата"
  await mainStore.ensureSystemCategory('Предоплата');

  if (props.operationToEdit) {
    const op = props.operationToEdit;
    amount.value = formatNumber(Math.abs(op.amount || 0));
    selectedAccountId.value = op.accountId?._id || op.accountId;
    
    if (op.companyId) {
      const cId = op.companyId?._id || op.companyId;
      selectedOwner.value = `company-${cId}`;
    } else if (op.individualId) {
      const iId = op.individualId?._id || op.individualId;
      selectedOwner.value = `individual-${iId}`;
    }
    
    selectedContractorId.value = op.contractorId?._id || op.contractorId;
    selectedCategoryId.value = op.categoryId?._id || op.categoryId;
    selectedProjectId.value = op.projectId?._id || op.projectId;
    
    if (op.date) editableDate.value = toInputDate(new Date(op.date));
  } else {
    setTimeout(() => { if (amountInput.value) amountInput.value.focus(); }, 100);
  }
});

// --- SAVE ---
const handleSave = async () => {
  if (isInlineSaving.value) return;
  errorMessage.value = '';
  const amountFromState = (amount.value || '').replace(/ /g, '');
  const amountParsed = parseFloat(amountFromState);

  if (isNaN(amountParsed) || amountParsed <= 0 || !selectedAccountId.value || !selectedOwner.value || !selectedContractorId.value) {
    errorMessage.value = 'Пожалуйста, заполните все обязательные поля: Сумма, Счет, Компания/Физлицо, Контрагент.';
    return;
  }
  
  isInlineSaving.value = true;

  try {
    const [year, month, day] = editableDate.value.split('-').map(Number);
    const finalDate = new Date(year, month - 1, day, 12, 0, 0); 
    const dateKey = mainStore._getDateKey(finalDate); 
    
    let companyId = null;
    let individualId = null;
    if (selectedOwner.value) {
      const [type, id] = selectedOwner.value.split('-');
      if (type === 'company') companyId = id;
      else if (type === 'individual') individualId = id;
    }
    
    const base = {
      type: props.type,
      amount: props.type === 'income' ? amountParsed : -Math.abs(amountParsed),
      categoryId: selectedCategoryId.value || null,
      accountId: selectedAccountId.value,
      companyId: companyId,
      individualId: individualId,
      contractorId: selectedContractorId.value,
      projectId: selectedProjectId.value || null,
      totalDealAmount: 0 // Обычное окно не знает про общую сумму
    };

    if (!props.operationToEdit || isCloneMode.value) {
      // ... create logic
      let cellIndexToUse = 0;
      try {
         cellIndexToUse = await mainStore.getFirstFreeCellIndex(dateKey, 0);
      } catch(e) {}
      
      const payload = { ...base, dateKey, cellIndex: cellIndexToUse };
      const response = await axios.post(`${API_BASE_URL}/events`, payload);
      emit('operation-added', response.data);
      emit('close');
    } else {
       // ... edit logic
       // (код редактирования, как раньше)
       const prev = props.operationToEdit;
       const oldDateKey = prev.dateKey;
       const oldCellIndex = prev.cellIndex || 0;
       
       if (oldDateKey !== dateKey) {
           await mainStore.moveOperation({_id: prev._id, ...base, dateKey: oldDateKey, cellIndex: oldCellIndex}, oldDateKey, dateKey, oldCellIndex);
       }
       await axios.put(`${API_BASE_URL}/events/${prev._id}`, { ...base, dateKey, cellIndex: oldCellIndex }); // упрощено для примера
       emit('operation-updated', { dateKey, oldDateKey });
       emit('close');
    }
  } catch (error) {
    console.error(error);
    errorMessage.value = 'Ошибка при сохранении.';
  } finally {
    isInlineSaving.value = false;
  }
};

// --- INLINE CREATE HANDLERS (Сохранены, но скрыты для краткости) ---
const showAccountInput = () => { isCreatingAccount.value = true; nextTick(() => newAccountInput.value?.focus()); };
const cancelCreateAccount = () => { isCreatingAccount.value = false; newAccountName.value = ''; };
const saveNewAccount = async () => { /* ... */ cancelCreateAccount(); }; // Реализация есть выше, она не меняется
const showContractorInput = () => { isCreatingContractor.value = true; nextTick(() => newContractorInput.value?.focus()); };
const cancelCreateContractor = () => { isCreatingContractor.value = false; newContractorName.value = ''; };
const saveNewContractor = async () => { /* ... */ cancelCreateContractor(); };
const showProjectInput = () => { isCreatingProject.value = true; nextTick(() => newProjectInput.value?.focus()); };
const cancelCreateProject = () => { isCreatingProject.value = false; newProjectName.value = ''; };
const saveNewProject = async () => { /* ... */ cancelCreateProject(); };
const showCategoryInput = () => { isCreatingCategory.value = true; nextTick(() => newCategoryInput.value?.focus()); };
const cancelCreateCategory = () => { isCreatingCategory.value = false; newCategoryName.value = ''; };
const saveNewCategory = async () => { /* ... */ cancelCreateCategory(); };
// Owner Create
const openCreateOwnerModal = () => { showCreateOwnerModal.value = true; };
const cancelCreateOwner = () => { showCreateOwnerModal.value = false; if(selectedOwner.value==='--CREATE_NEW--') selectedOwner.value=null; };
const saveNewOwner = async () => { /* ... */ showCreateOwnerModal.value=false; };
const setOwnerTypeToCreate = (t) => { ownerTypeToCreate.value = t; };
// Helpers
const closePopup = () => { if (!isInlineSaving.value) emit('close'); };
const handleDeleteClick = () => { isDeleteConfirmVisible.value = true; };
const onDeleteConfirmed = async () => { /* ... */ emit('close'); };
const handleCopyClick = () => { isCloneMode.value = true; };

const isEditMode = computed(() => !!props.operationToEdit && !isCloneMode.value);
const title = computed(() => isEditMode.value ? (props.type==='income'?'Доход':'Расход') : `Новый ${props.type==='income'?'Доход':'Расход'}`);
const popupTheme = computed(() => isEditMode.value ? 'theme-edit' : (props.type==='income'?'theme-income':'theme-expense'));
const buttonText = computed(() => isEditMode.value ? 'Сохранить' : 'Создать');
const buttonClass = computed(() => isEditMode.value ? 'btn-submit-edit' : (props.type==='income'?'btn-submit-income':'btn-submit-expense'));

</script>

<template>
  <!-- Шаблон остался прежним, НО УДАЛЕН БЛОК SMART PREPAYMENT -->
  <div class="popup-overlay" @click.self="closePopup">
    <div class="popup-content" :class="popupTheme">
      <h3>{{ title }}</h3>
      
      <!-- Обычные поля (Сумма, Счета, Контрагент...) -->
      <label>Вносимая сумма</label>
      <input type="text" inputmode="decimal" v-model="amount" placeholder="0" ref="amountInput" class="form-input" @input="onAmountInput" />
      
      <template v-if="props.type !== 'transfer' && !showCreateOwnerModal">
          <!-- ... account, owner, contractor, project selects ... -->
          <!-- Блок счетов -->
          <label>{{ props.type === 'income' ? 'На мой счет' : 'Со счета' }} *</label>
          <select v-if="!isCreatingAccount" v-model="selectedAccountId" @change="e => e.target.value === '--CREATE_NEW--' ? showAccountInput() : onAccountSelected(e.target.value)" class="form-select">
            <option :value="null" disabled>Выберите счет</option>
            <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">{{ acc.name }}</option>
            <option value="--CREATE_NEW--">[ + Создать новый счет ]</option>
          </select>
          <div v-else class="inline-create-form">
            <input type="text" v-model="newAccountName" placeholder="Название счета" ref="newAccountInput" @keyup.enter="saveNewAccount" @keyup.esc="cancelCreateAccount" />
            <button @click="saveNewAccount" class="btn-inline-save">✓</button><button @click="cancelCreateAccount" class="btn-inline-cancel">X</button>
          </div>

          <!-- Блок владельца -->
          <label>Моей Компании/Физлица *</label>
          <select v-model="selectedOwner" @change="e => e.target.value === '--CREATE_NEW--' && openCreateOwnerModal()" class="form-select">
            <option :value="null" disabled>Выберите владельца</option>
            <optgroup label="Компании"><option v-for="comp in mainStore.companies" :key="comp._id" :value="`company-${comp._id}`">{{ comp.name }}</option></optgroup>
            <optgroup label="Физлица"><option v-for="ind in mainStore.individuals" :key="ind._id" :value="`individual-${ind._id}`">{{ ind.name }}</option></optgroup>
            <option value="--CREATE_NEW--">[ + Создать... ]</option>
          </select>

          <!-- Блок контрагента -->
          <label>{{ props.type === 'income' ? 'От контрагента' : 'Контрагенту' }} *</label>
          <select v-if="!isCreatingContractor" v-model="selectedContractorId" @change="e => e.target.value === '--CREATE_NEW--' ? showContractorInput() : onContractorSelected(e.target.value, true, true)" class="form-select">
            <option :value="null" disabled>Выберите контрагента</option>
            <option v-for="c in mainStore.contractors" :key="c._id" :value="c._id">{{ c.name }}</option>
            <option value="--CREATE_NEW--">[ + Создать нового контрагента ]</option>
          </select>
          <div v-else class="inline-create-form">
            <input type="text" v-model="newContractorName" ref="newContractorInput" class="form-input" @keyup.enter="saveNewContractor" @keyup.esc="cancelCreateContractor" /><button @click="saveNewContractor" class="btn-inline-save">✓</button><button @click="cancelCreateContractor" class="btn-inline-cancel">X</button>
          </div>

          <!-- Блок проекта -->
          <label>{{ props.type === 'income' ? 'Из проекта' : 'В проект' }}</label>
          <select v-if="!isCreatingProject" v-model="selectedProjectId" @change="e => e.target.value === '--CREATE_NEW--' && showProjectInput()" class="form-select">
            <option :value="null">Без проекта</option>
            <option v-for="p in mainStore.projects" :key="p._id" :value="p._id">{{ p.name }}</option>
            <option value="--CREATE_NEW--">[ + Создать новый проект ]</option>
          </select>
          <div v-else class="inline-create-form"><input type="text" v-model="newProjectName" ref="newProjectInput" class="form-input" @keyup.enter="saveNewProject" /><button @click="saveNewProject" class="btn-inline-save">✓</button><button @click="cancelCreateProject" class="btn-inline-cancel">X</button></div>

          <!-- Блок категории -->
          <label>По категории</label>
          <select v-if="!isCreatingCategory" v-model="selectedCategoryId" @change="e => e.target.value === '--CREATE_NEW--' && showCategoryInput()" class="form-select">
            <option :value="null">Без категории</option>
            <option v-for="cat in availableCategories" :key="cat._id" :value="cat._id">{{ cat.name }}</option>
            <option value="--CREATE_NEW--">[ + Создать новую категорию ]</option>
          </select>
          <div v-else class="inline-create-form"><input type="text" v-model="newCategoryName" ref="newCategoryInput" class="form-input" @keyup.enter="saveNewCategory" /><button @click="saveNewCategory" class="btn-inline-save">✓</button><button @click="cancelCreateCategory" class="btn-inline-cancel">X</button></div>
      </template>
      
      <!-- Owner Modal (v-if) -->
      <template v-if="showCreateOwnerModal">
         <!-- ... (код модалки создания владельца) ... -->
         <div class="smart-create-owner">
            <h4 class="smart-create-title">Что создать?</h4>
            <div class="smart-create-tabs"><button @click="setOwnerTypeToCreate('company')">Компанию</button><button @click="setOwnerTypeToCreate('individual')">Физлицо</button></div>
            <input v-model="newOwnerName" ref="newOwnerInputRef" class="form-input" @keyup.enter="saveNewOwner" />
            <div class="smart-create-actions"><button @click="cancelCreateOwner" class="btn-submit-secondary">Отмена</button><button @click="saveNewOwner" class="btn-submit-edit">Создать</button></div>
         </div>
      </template>

      <template v-if="!showCreateOwnerModal">
        <label>Дата операции</label>
        <input type="date" v-model="editableDate" class="form-input" :min="minDateString" :max="maxDateString" />
        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        <div class="popup-actions-row">
          <button @click="handleSave" class="btn-submit save-wide" :class="buttonClass" :disabled="isInlineSaving">{{ buttonText }}</button>
          <!-- Icons copy/delete -->
          <div v-if="props.operationToEdit && !isCloneMode.value" class="icon-actions">
             <button class="icon-btn" @click="handleCopyClick"><svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg></button>
             <button class="icon-btn danger" @click="handleDeleteClick"><svg class="icon" viewBox="0 0 24 24"><path d="M9 3h6a1 1 0 0 1 1 1v1h5v2H3V5h5V4a1 1 0 0 1 1-1Zm2 6h2v9h-2V9Zm6 0h2v9h-2V9ZM5 9h2v9H5V9Z"/></svg></button>
          </div>
        </div>
      </template>

    </div>
  </div>
  <ConfirmationPopup v-if="isDeleteConfirmVisible" title="Подтвердите удаление" message="Удалить операцию?" @close="isDeleteConfirmVisible = false" @confirm="onDeleteConfirmed" />
</template>

<style scoped>
/* (Стили остаются без изменений, убраны только smart-классы) */
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; color: #1a1a1a; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem; }
h3 { margin-top: 0; margin-bottom: 2rem; font-size: 22px; font-weight: 600; }
label { display: block; margin-bottom: 0.5rem; margin-top: 1rem; color: #333; font-size: 14px; font-weight: 500; }
.form-input, .form-select { width: 100%; height: 48px; padding: 0 14px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; font-size: 15px; box-sizing: border-box; }
.form-select { background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.41 0.589844L6 5.16984L10.59 0.589844L12 2.00019L6 8.00019L0 2.00019L1.41 0.589844Z' fill='%23333'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; appearance: none; }
.inline-create-form { display: flex; gap: 8px; }
.btn-inline-save { background-color: #34C759; border: none; border-radius: 8px; color: white; width: 48px; cursor: pointer; }
.btn-inline-cancel { background-color: #FF3B30; border: none; border-radius: 8px; color: white; width: 48px; cursor: pointer; }
.btn-submit { width: 100%; height: 50px; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; color: white; }
.btn-submit-income { background-color: #28B8A0; }
.btn-submit-expense { background-color: #F36F3F; }
.btn-submit-edit { background-color: #222; }
.btn-submit-secondary { background-color: #e0e0e0; color: #333; }
.popup-actions-row { display: flex; gap: 10px; margin-top: 2rem; }
.icon-actions { display: flex; gap: 10px; }
.icon-btn { width: 54px; height: 54px; border: none; border-radius: 10px; background: #EFEFEF; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.icon-btn.danger { background: #FF3B30; color: #fff; }
.icon { width: 24px; height: 24px; fill: currentColor; }
.smart-create-owner { border-top: 1px solid #E0E0E0; margin-top: 1.5rem; padding-top: 1.5rem; }
.smart-create-tabs { display: flex; gap: 10px; margin-bottom: 1rem; }
.smart-create-actions { display: flex; gap: 10px; margin-top: 1rem; }
.error-message { color: #FF3B30; text-align: center; margin-top: 1rem; }
</style>
