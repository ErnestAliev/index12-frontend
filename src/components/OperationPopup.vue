<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import axios from 'axios';
import { useMainStore } from '@/stores/mainStore';
import ConfirmationPopup from './ConfirmationPopup.vue';
import PrepaymentModal from './PrepaymentModal.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v22.0 - PREPAYMENT FLOW ---
 * * ВЕРСИЯ: 22.0 - Интеграция PrepaymentModal и очистка от "Доплат"
 * * ДАТА: 2025-11-20
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (CLEANUP) Полностью удалена логика `isPostPayment` (Доплата/Постоплата).
 * 2. (FEATURE) Добавлен `PrepaymentModal`.
 * 3. (LOGIC) При выборе категории "Предоплата" открывается `PrepaymentModal`.
 * 4. (LOGIC) Данные из модалки (dealTotal, parentDealId, isDeal) сохраняются в операцию.
 */

console.log('--- OperationPopup.vue v22.0 (Prepayment Flow) ЗАГРУЖЕН ---');

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
  'operation-updated'
]);

// --- ДАННЫЕ ---
const amount = ref('');
const selectedAccountId = ref(null);
const selectedOwner = ref(null); 
const selectedContractorId = ref(null);
const selectedCategoryId = ref(null);
const selectedProjectId = ref(null);

// Данные Сделки (получаем из PrepaymentModal)
const isDeal = ref(false);
const dealTotal = ref(0);
const parentDealId = ref(null);
// Для авто-акта
const autoActData = ref(null); 

const errorMessage = ref('');
const amountInput = ref(null);
const isInlineSaving = ref(false);

// --- INLINE CREATE STATES ---
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
const showPrepaymentModal = ref(false);

// ФИЛЬТРАЦИЯ КАТЕГОРИЙ
const availableCategories = computed(() => {
  return mainStore.categories.filter(c => {
    const name = c.name.toLowerCase().trim();
    return name !== 'перевод' && name !== 'transfer' && name !== 'доплата' && name !== 'постоплата';
  });
});

const selectedCategoryName = computed(() => {
    const cat = mainStore.categories.find(c => c._id === selectedCategoryId.value);
    return cat ? cat.name.toLowerCase().trim() : '';
});

// Детектор предоплаты (для открытия модалки)
const isPrepaymentCategory = computed(() => selectedCategoryName.value === 'предоплата');

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
  if (input.value !== formattedValue) input.value = formattedValue; 
  nextTick(() => {
    if (input.selectionStart !== undefined) input.setSelectionRange(cursorPosition + cursorOffset, cursorPosition + cursorOffset);
  });
};

// --- AUTO-SELECT LOGIC ---
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
      const pId = (contractor.defaultProjectId && typeof contractor.defaultProjectId === 'object') ? contractor.defaultProjectId._id : contractor.defaultProjectId;
      selectedProjectId.value = pId;
    }
    if (setCategory && contractor.defaultCategoryId) {
      const cId = (contractor.defaultCategoryId && typeof contractor.defaultCategoryId === 'object') ? contractor.defaultCategoryId._id : contractor.defaultCategoryId;
      const catObj = mainStore.categories.find(c => c._id === cId);
      if (catObj) {
         const name = catObj.name.toLowerCase().trim();
         if (name !== 'перевод' && name !== 'transfer') selectedCategoryId.value = cId;
      } else {
          selectedCategoryId.value = cId;
      }
    }
  }
};

const onCategoryChange = () => {
    if (isPrepaymentCategory.value) {
        // Перед открытием модалки проверим, заполнены ли сумма и контрагент
        // Но мы разрешаем открыть модалку и там заполнить недостающее (если логика позволит)
        // Лучше открывать модалку, но если нет контрагента - предупредить внутри модалки (или задизейблить там выбор сделок)
        // Пока просто открываем
        showPrepaymentModal.value = true;
    } else {
        // Сброс данных сделки, если сменили категорию на обычную
        isDeal.value = false;
        dealTotal.value = 0;
        parentDealId.value = null;
        autoActData.value = null;
    }
};

// --- PREPAYMENT MODAL HANDLER ---
const handlePrepaymentConfirm = (data) => {
    // data = { amount, mode, dealTotal, isDeal, parentDealId, createAutoAct }
    amount.value = formatNumber(data.amount);
    dealTotal.value = data.dealTotal;
    isDeal.value = data.isDeal;
    parentDealId.value = data.parentDealId;
    
    if (data.createAutoAct) {
        autoActData.value = {
            shouldCreate: true,
            amount: data.amount, // Сумма акта равна сумме, закрывающей сделку? Или общей сумме? 
            // ТЗ: "создается операция 'Исполнение' (Акт) на ВСЮ сумму сделки"
            // ВАЖНО: Если это финальный платеж, то акт на ОБЩУЮ сумму.
            totalAmount: data.mode === 'new' ? data.dealTotal : 0 // Для 'existing' надо брать из стора, но мы можем передать
            // Упростим: Если createAutoAct=true, мы создаем акт на сумму dealTotal (если новая) или остаток+оплаченное (если старая).
            // Логику создания акта вынесем в handleSave
        };
    } else {
        autoActData.value = null;
    }

    showPrepaymentModal.value = false;
};


// --- MOUNTED ---
onMounted(() => {
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
    
    // Восстановление данных сделки
    if (op.isDeal) isDeal.value = true;
    if (op.dealTotal) dealTotal.value = op.dealTotal;
    if (op.parentDealId) parentDealId.value = op.parentDealId._id || op.parentDealId;

    if (op.date) editableDate.value = toInputDate(new Date(op.date));
  } else {
    setTimeout(() => { if (amountInput.value) amountInput.value.focus(); }, 100);
  }
});

const _getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => {
  const year = date.getFullYear();
  const doy = _getDayOfYear(date);
  return `${year}-${doy}`;
};

// =================================================================
// --- HANDLE SAVE ---
// =================================================================
const handleSave = async () => {
  if (isInlineSaving.value) return;
  errorMessage.value = '';

  const amountParsed = parseFloat((amount.value || '').replace(/ /g, ''));

  if (isNaN(amountParsed) || amountParsed <= 0 || !selectedAccountId.value || !selectedOwner.value) {
    errorMessage.value = 'Заполните обязательные поля: Сумма, Счет, Компания/Физлицо.';
    return;
  }
  if (!selectedContractorId.value) {
    errorMessage.value = 'Выберите Контрагента.';
    return;
  }

  isInlineSaving.value = true;

  try {
    const [year, month, day] = editableDate.value.split('-').map(Number);
    const finalDate = new Date(year, month - 1, day, 12, 0, 0); 
    const dateKey = _getDateKey(finalDate); 
    
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
      
      // Поля сделки (из PrepaymentModal)
      isDeal: isDeal.value,
      dealTotal: dealTotal.value,
      parentDealId: parentDealId.value
    };

    // 1. Сохраняем операцию (Доход/Расход)
    let savedOp;
    if (!props.operationToEdit || isCloneMode.value) {
      savedOp = await saveCreateOrClone(base, dateKey);
      isCloneMode.value = false;
    } else {
      const prev = props.operationToEdit;
      const oldDateKey = prev.dateKey; 
      const oldCellIndex = Number.isInteger(prev.cellIndex) ? prev.cellIndex : 0;
      savedOp = await saveEdit(prev._id, base, oldDateKey, oldCellIndex, dateKey, oldCellIndex);
      isCloneMode.value = false;
    }

    // 2. ЛОГИКА АВТО-АКТА (ЕСЛИ ВКЛЮЧЕНО)
    // Если пользователь выбрал чекбокс в модалке
    if (autoActData.value?.shouldCreate) {
        // Нам нужно найти полную сумму сделки.
        // Если это New Deal, она в dealTotal.
        // Если Existing, нам нужно найти сделку в сторе, чтобы узнать total.
        let totalForAct = 0;
        if (isDeal.value) {
            totalForAct = dealTotal.value;
        } else if (parentDealId.value) {
            const parentDeal = mainStore.allOperationsFlat.find(o => o._id === parentDealId.value);
            if (parentDeal) totalForAct = parentDeal.dealTotal;
        }
        
        // Если нашли сумму, создаем акт
        if (totalForAct > 0) {
            console.log('[OperationPopup] Авто-создание Акта на сумму:', totalForAct);
            await mainStore.createAct({
                date: finalDate,
                amount: -totalForAct, // Акт - это "расход" обязательств, но в системе это отрицательное число? В TransferPopup amount парсится как abs, а в payload идет -abs.
                contractorId: selectedContractorId.value,
                projectId: selectedProjectId.value,
                categoryId: selectedCategoryId.value, // Какую категорию ставить? Ту же "Предоплата"? Нет, Акт обычно "Выполненные работы".
                // Но у нас нет такой категории по дефолту. 
                // Вариант: найти категорию "Реализация" или создать?
                // ТЗ: "создается операция 'Исполнение' (Акт)". 
                // В TransferPopup для акта берется categoryId из селекта.
                // Давайте используем ту же категорию, что и у сделки, или найдем дефолтную.
                // Лучше всего использовать ID категории текущей операции, так как это связка.
                // Но логически это странно (Акт с категорией Предоплата).
                // Пусть пока будет текущая категория, пользователь потом может поменять.
                // Или лучше "Оказание услуг"?
                // Используем текущую selectedCategoryId, чтобы не усложнять.
                
                // Важно: parentDealId для Акта - это ID самой сделки (или Предоплаты, которая создала сделку).
                parentDealId: isDeal.value ? savedOp._id : parentDealId.value 
            });
        }
    }

    emit('close');

  } catch (error) {
    console.error('OperationPopup: Error', error);
    errorMessage.value = 'Ошибка при сохранении. Попробуйте снова.';
  } finally {
    isInlineSaving.value = false;
  }
};

async function saveCreateOrClone(base, dateKey) {
  let cellIndexToUse = 0;
  try {
    if (typeof mainStore.getFirstFreeCellIndex === 'function') {
      const freeIndex = await mainStore.getFirstFreeCellIndex(dateKey, 0);
      cellIndexToUse = Number.isInteger(freeIndex) ? freeIndex : 0;
    }
  } catch(e) { cellIndexToUse = 0; }

  const payload = { ...base, dateKey, cellIndex: cellIndexToUse };
  const response = await axios.post(`${API_BASE_URL}/events`, payload);
  emit('operation-added', response.data);
  return response.data; // Возвращаем для ID
}

async function saveEdit(opId, base, oldDateKey, oldCellIndex, newDateKey, desiredCellIndex) {
  const positionChanged = (newDateKey !== oldDateKey); 
  let res;
  if (positionChanged) {
    await mainStore.moveOperation(
      { _id: opId, ...base, dateKey: oldDateKey, cellIndex: oldCellIndex },
      oldDateKey, newDateKey, Number.isInteger(desiredCellIndex) ? desiredCellIndex : 0
    );
    res = await axios.put(`${API_BASE_URL}/events/${opId}`, { ...base, dateKey: newDateKey, cellIndex: desiredCellIndex });
    emit('operation-updated', { dateKey: newDateKey, oldDateKey: oldDateKey });
  } else {
    res = await axios.put(`${API_BASE_URL}/events/${opId}`, { ...base, dateKey: oldDateKey, cellIndex: oldCellIndex });
    emit('operation-updated', { dateKey: oldDateKey, oldDateKey: null });
  }
  return res.data;
}

// --- OWNER CREATE ---
const openCreateOwnerModal = () => {
  ownerTypeToCreate.value = 'company';
  newOwnerName.value = '';
  showCreateOwnerModal.value = true;
  nextTick(() => newOwnerInputRef.value?.focus());
};

const cancelCreateOwner = () => {
  if (isInlineSaving.value) return;
  showCreateOwnerModal.value = false;
  newOwnerName.value = '';
  if (selectedOwner.value === '--CREATE_NEW--') selectedOwner.value = null;
};

const setOwnerTypeToCreate = (type) => {
  ownerTypeToCreate.value = type;
  newOwnerInputRef.value?.focus();
};

const saveNewOwner = async () => {
  if (isInlineSaving.value) return;
  const name = newOwnerName.value.trim();
  const type = ownerTypeToCreate.value; 
  if (!name) return;
  isInlineSaving.value = true;
  try {
    let newItem;
    if (type === 'company') {
      const existing = mainStore.companies.find(c => c.name.toLowerCase() === name.toLowerCase());
      newItem = existing ? existing : await mainStore.addCompany(name);
    } else { 
      const existing = mainStore.individuals.find(i => i.name.toLowerCase() === name.toLowerCase());
      newItem = existing ? existing : await mainStore.addIndividual(name);
    }
    selectedOwner.value = `${type}-${newItem._id}`;
    showCreateOwnerModal.value = false; newOwnerName.value = '';
  } catch (e) { console.error(e); } 
  finally { isInlineSaving.value = false; }
};

// --- INLINE CREATE ---
const showAccountInput = () => { isCreatingAccount.value = true; nextTick(() => newAccountInput.value?.focus()); };
const cancelCreateAccount = () => { isCreatingAccount.value = false; newAccountName.value = ''; };
const saveNewAccount = async () => {
  const name = newAccountName.value.trim(); if (!name) return;
  let cId = null, iId = null;
  if (selectedOwner.value) { const [type, id] = selectedOwner.value.split('-'); if (type === 'company') cId = id; else iId = id; }
  const newItem = await mainStore.addAccount({ name, companyId: cId, individualId: iId });
  selectedAccountId.value = newItem._id; onAccountSelected(newItem._id); cancelCreateAccount();
};

const showContractorInput = () => { isCreatingContractor.value = true; nextTick(() => newContractorInput.value?.focus()); };
const cancelCreateContractor = () => { isCreatingContractor.value = false; newContractorName.value = ''; };
const saveNewContractor = async () => {
  const name = newContractorName.value.trim(); if (!name) return;
  const newItem = await mainStore.addContractor(name);
  selectedContractorId.value = newItem._id; onContractorSelected(newItem._id, true, true); cancelCreateContractor();
};

const showProjectInput = () => { isCreatingProject.value = true; nextTick(() => newProjectInput.value?.focus()); };
const cancelCreateProject = () => { isCreatingProject.value = false; newProjectName.value = ''; };
const saveNewProject = async () => {
  const name = newProjectName.value.trim(); if (!name) return;
  const newItem = await mainStore.addProject(name);
  selectedProjectId.value = newItem._id; cancelCreateProject();
};

const showCategoryInput = () => { isCreatingCategory.value = true; nextTick(() => newCategoryInput.value?.focus()); };
const cancelCreateCategory = () => { isCreatingCategory.value = false; newCategoryName.value = ''; };
const saveNewCategory = async () => {
  const name = newCategoryName.value.trim(); if (!name) return;
  const newItem = await mainStore.addCategory(name);
  selectedCategoryId.value = newItem._id; cancelCreateCategory();
};

// --- UI ---
const isEditMode = computed(() => !!props.operationToEdit && !isCloneMode.value);
const title = computed(() => {
  if (isCloneMode.value) return `Копия: ${props.type === 'income' ? 'Доход' : 'Расход'}`;
  if (isEditMode.value) return `${props.type === 'income' ? 'Доход' : 'Расход'}`;
  return `Новый ${props.type === 'income' ? 'Доход' : 'Расход'}`;
});
const popupTheme = computed(() => {
  if (isEditMode.value) return 'theme-edit';
  return props.type === 'income' ? 'theme-income' : 'theme-expense';
});
const buttonText = computed(() => {
  if (isCloneMode.value) return 'Создать копию';
  return isEditMode.value ? 'Сохранить' : 'Создать';
});
const buttonClass = computed(() => {
  if (isEditMode.value) return 'btn-submit-edit';
  return props.type === 'income' ? 'btn-submit-income' : 'btn-submit-expense';
});

const closePopup = () => { if (isInlineSaving.value) return; emit('close'); };
const handleDeleteClick = () => { isDeleteConfirmVisible.value = true; };
const onDeleteConfirmed = async () => {
  if (!props.operationToEdit?._id) return;
  await mainStore.deleteOperation(props.operationToEdit);
  emit('operation-deleted', { dateKey: props.operationToEdit.dateKey });
  emit('close'); isDeleteConfirmVisible.value = false;
};
const handleCopyClick = () => {
  isCloneMode.value = true; editableDate.value = toInputDate(props.date);
  nextTick(() => { amountInput.value?.focus(); });
};

// Конвертируем строку суммы в число для пропса модалки
const rawAmountNum = computed(() => parseFloat((amount.value || '').replace(/ /g, '')) || 0);
</script>

<template>
  <div class="popup-overlay" @click.self="closePopup">
    <div class="popup-content" :class="popupTheme">
      <h3>{{ title }}</h3>

      <!-- 🟢 NEW: Текст меняется, если это Предоплата (но форма та же, открываем модалку по категории) -->
      <label>{{ isPrepaymentCategory ? 'Сумма предоплаты' : 'Сумма' }}</label>
      <input type="text" inputmode="decimal" v-model="amount" placeholder="0" ref="amountInput" class="form-input" @input="onAmountInput" />

      <template v-if="props.type !== 'transfer' && !showCreateOwnerModal">
        
        <label>{{ props.type === 'income' ? 'На мой счет' : 'Со счета' }} *</label>
        <select v-if="!isCreatingAccount" v-model="selectedAccountId" @change="e => e.target.value === '--CREATE_NEW--' ? showAccountInput() : onAccountSelected(e.target.value)" class="form-select">
          <option :value="null" disabled>Выберите счет</option>
          <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">{{ acc.name }}</option>
          <option value="--CREATE_NEW--">[ + Создать новый счет ]</option>
        </select>
        <div v-else class="inline-create-form">
          <input type="text" v-model="newAccountName" placeholder="Название счета" ref="newAccountInput" @keyup.enter="saveNewAccount" @keyup.esc="cancelCreateAccount" />
          <button @click="saveNewAccount" class="btn-inline-save">✓</button>
          <button @click="cancelCreateAccount" class="btn-inline-cancel">X</button>
        </div>
      
        <label>Моей Компании/Физлица *</label>
        <select v-model="selectedOwner" @change="e => e.target.value === '--CREATE_NEW--' && openCreateOwnerModal()" class="form-select">
          <option :value="null" disabled>Выберите владельца</option>
          <optgroup label="Компании">
            <option v-for="comp in mainStore.companies" :key="comp._id" :value="`company-${comp._id}`">{{ comp.name }}</option>
          </optgroup>
          <optgroup label="Физлица">
            <option v-for="ind in mainStore.individuals" :key="ind._id" :value="`individual-${ind._id}`">{{ ind.name }}</option>
          </optgroup>
          <option value="--CREATE_NEW--">[ + Создать... ]</option>
        </select>
        
        <label>{{ props.type === 'income' ? 'От контрагента' : 'Контрагенту' }} *</label>
        <select v-if="!isCreatingContractor" v-model="selectedContractorId" @change="e => e.target.value === '--CREATE_NEW--' ? showContractorInput() : onContractorSelected(e.target.value, true, true)" class="form-select">
          <option :value="null" disabled>Выберите контрагента</option>
          <option v-for="c in mainStore.contractors" :key="c._id" :value="c._id">{{ c.name }}</option>
          <option value="--CREATE_NEW--">[ + Создать нового контрагента ]</option>
        </select>
        <div v-else class="inline-create-form">
          <input type="text" v-model="newContractorName" placeholder="Название контрагента" ref="newContractorInput" @keyup.enter="saveNewContractor" @keyup.esc="cancelCreateContractor" />
          <button @click="saveNewContractor" class="btn-inline-save">✓</button>
          <button @click="cancelCreateContractor" class="btn-inline-cancel">X</button>
        </div>

        <label>{{ props.type === 'income' ? 'Из проекта' : 'В проект' }}</label>
        <select v-if="!isCreatingProject" v-model="selectedProjectId" @change="e => e.target.value === '--CREATE_NEW--' && showProjectInput()" class="form-select">
          <option :value="null">Без проекта</option>
          <option v-for="p in mainStore.projects" :key="p._id" :value="p._id">{{ p.name }}</option>
          <option value="--CREATE_NEW--">[ + Создать новый проект ]</option>
        </select>
        <div v-else class="inline-create-form">
          <input type="text" v-model="newProjectName" placeholder="Название проекта" ref="newProjectInput" @keyup.enter="saveNewProject" @keyup.esc="cancelCreateProject" />
          <button @click="saveNewProject" class="btn-inline-save">✓</button>
          <button @click="cancelCreateProject" class="btn-inline-cancel">X</button>
        </div>

        <label>По категории</label>
        <!-- 🟢 При изменении проверяем, не Предоплата ли это -->
        <select v-if="!isCreatingCategory" v-model="selectedCategoryId" @change="e => e.target.value === '--CREATE_NEW--' ? showCategoryInput() : onCategoryChange()" class="form-select">
          <option :value="null">Без категории</option>
          <option v-for="cat in availableCategories" :key="cat._id" :value="cat._id">{{ cat.name }}</option>
          <option value="--CREATE_NEW--">[ + Создать новую категорию ]</option>
        </select>
        <div v-else class="inline-create-form">
          <input type="text" v-model="newCategoryName" placeholder="Название категории" ref="newCategoryInput" @keyup.enter="saveNewCategory" @keyup.esc="cancelCreateCategory" />
          <button @click="saveNewCategory" class="btn-inline-save">✓</button>
          <button @click="cancelCreateCategory" class="btn-inline-cancel">X</button>
        </div>
        
        <!-- 🟢 Доп. информация о сделке, если выбрана Предоплата -->
        <div v-if="isPrepaymentCategory && (dealTotal > 0 || parentDealId)" class="deal-info-preview">
           <small v-if="isDeal">Новая сделка на {{ formatNumber(dealTotal) }} ₸</small>
           <small v-if="parentDealId">Привязано к существующей сделке</small>
           <button class="btn-link" @click="showPrepaymentModal = true">Настроить</button>
        </div>

      </template>

      <template v-if="showCreateOwnerModal">
        <!-- ... Код создания владельца (без изменений) ... -->
        <div class="smart-create-owner">
          <h4 class="smart-create-title">Что вы хотите создать?</h4>
          <div class="smart-create-tabs">
            <button :class="{ active: ownerTypeToCreate === 'company' }" @click="setOwnerTypeToCreate('company')">Компанию</button>
            <button :class="{ active: ownerTypeToCreate === 'individual' }" @click="setOwnerTypeToCreate('individual')">Физлицо</button>
          </div>
          <label>Название</label>
          <input type="text" v-model="newOwnerName" :placeholder="ownerTypeToCreate === 'company' ? 'Название компании' : 'Имя Физлица'" ref="newOwnerInputRef" class="form-input" @keyup.enter="saveNewOwner" @keyup.esc="cancelCreateOwner" />
          <div class="smart-create-actions">
            <button @click="cancelCreateOwner" class="btn-submit btn-submit-secondary">Отмена</button>
            <button @click="saveNewOwner" class="btn-submit btn-submit-edit">Создать</button>
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
            <button class="icon-btn" title="Копировать" @click="handleCopyClick"><svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg></button>
            <button class="icon-btn danger" title="Удалить" @click="handleDeleteClick"><svg class="icon" viewBox="0 0 24 24"><path d="M9 3h6a1 1 0 0 1 1 1v1h5v2H3V5h5V4a1 1 0 0 1 1-1Zm2 6h2v9h-2V9Zm6 0h2v9h-2V9ZM5 9h2v9H5V9Z"/></svg></button>
          </div>
        </div>
      </template>
    </div>
  </div>

  <ConfirmationPopup v-if="isDeleteConfirmVisible" title="Подтвердите удаление" message="Вы уверены, что хотите удалить эту операцию?" @close="isDeleteConfirmVisible = false" @confirm="onDeleteConfirmed" />
  
  <!-- 🟢 NEW: Модалка Предоплаты -->
  <PrepaymentModal
    v-if="showPrepaymentModal"
    :initialAmount="rawAmountNum"
    :contractorId="selectedContractorId"
    :projectId="selectedProjectId"
    @close="showPrepaymentModal = false"
    @confirm="handlePrepaymentConfirm"
  />
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; color: #1a1a1a; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem; }
h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 2rem; text-align: left; font-size: 22px; font-weight: 600; }
label { display: block; margin-bottom: 0.5rem; margin-top: 1rem; color: #333; font-size: 14px; font-weight: 500; }
.form-input, .form-select { width: 100%; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; -webkit-appearance: none; -moz-appearance: none; appearance: none; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.form-select { background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.41 0.589844L6 5.16984L10.59 0.589844L12 2.00019L6 8.00019L0 2.00019L1.41 0.589844Z' fill='%23333'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; padding-right: 40px; }
.form-input:focus, .form-select:focus { outline: none; border-color: #F36F3F; box-shadow: 0 0 0 2px rgba(243, 111, 63, 0.2); }
.theme-income .form-input:focus, .theme-income .form-select:focus { border-color: #28B8A0; box-shadow: 0 0 0 2px rgba(40, 184, 160, 0.2); }
.theme-edit .form-input:focus, .theme-edit .form-select:focus { border-color: #222222; box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.2); }

.inline-create-form { display: flex; align-items: center; gap: 8px; }
.inline-create-form input { flex: 1; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; }
.inline-create-form input:focus { outline: none; border-color: #F36F3F; }
.inline-create-form button { flex-shrink: 0; border: none; border-radius: 8px; color: white; font-size: 16px; cursor: pointer; height: 48px; width: 48px; padding: 0; line-height: 1; }
.inline-create-form button.btn-inline-save { background-color: #34C759; }
.inline-create-form button.btn-inline-cancel { background-color: #FF3B30; }
.error-message { color: #FF3B30; text-align: center; margin-top: 1rem; font-size: 14px; }
.popup-actions-row { display: flex; align-items: center; gap: 10px; margin-top: 2rem; }
.save-wide { flex: 1 1 auto; height: 54px; }
.icon-actions { display: flex; gap: 10px; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border: none; border-radius: 10px; background: #EFEFEF; color: #222; cursor: pointer; }
.icon-btn:hover { background: #E5E5EE; }
.icon-btn.danger { background: #FF3B30; color: #fff; }
.icon-btn.danger:hover { background: #d93025; }
.icon { width: 28px; height: 28px; fill: currentColor; }
.btn-submit { width: 100%; height: 50px; padding: 0 1rem; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background-color 0.2s ease; }
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

/* Deal Info */
.deal-info-preview {
  background: #f9fff9; border: 1px solid #28B8A0; padding: 8px 12px; border-radius: 8px; margin-top: 5px;
  display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #333;
}
.btn-link { background: none; border: none; color: var(--color-primary); text-decoration: underline; cursor: pointer; font-size: 13px; padding: 0; }
</style>
