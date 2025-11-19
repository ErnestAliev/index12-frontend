<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import axios from 'axios';
import { useMainStore } from '@/stores/mainStore';
import ConfirmationPopup from './ConfirmationPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v17.0 - SMART TRANSFER MODE ---
 * * ВЕРСИЯ: 17.0 - Реализация режима "Умный перевод" (Деньги / Акт)
 * * ДАТА: 2025-11-19
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (NEW) Добавлен ref `transferMode` ('money' | 'act').
 * 2. (UI) Добавлен переключатель режимов вверху попапа.
 * 3. (UI) Реализована условная отрисовка полей:
 * - 'money': Счета (как было раньше).
 * - 'act': Контрагент, Категория, Проект (новое).
 * 4. (LOGIC) Обновлена валидация и сборка payload в `handleSave`.
 * 5. (STYLE) Добавлены стили для переключателя и новых полей.
 */

const mainStore = useMainStore();
const props = defineProps({
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  transferToEdit: { type: Object, default: null },
  minAllowedDate: { type: Date, default: null },
  maxAllowedDate: { type: Date, default: null }
});

const emit = defineEmits(['close', 'transfer-complete']);

// 🟢 NEW: Режим работы попапа
const transferMode = ref('money');

// --- Данные для полей ---
const amount = ref('');

// Поля для РЕЖИМА ДЕНЕГ
const fromAccountId = ref(null);
const toAccountId = ref(null);
const selectedFromOwner = ref(null); 
const selectedToOwner = ref(null); 

// Поля для РЕЖИМА АКТА (Обязательств)
const selectedContractorId = ref(null);
const selectedProjectId = ref(null);
const selectedActCategoryId = ref(null); // Отдельная переменная для категории акта

// Системная категория для обычного перевода
const transferCategoryId = ref(null);

const isInlineSaving = ref(false);

const toInputDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const editableDate = ref(toInputDate(props.date));

const minDateString = computed(() => {
  return props.minAllowedDate ? toInputDate(props.minAllowedDate) : null;
});
const maxDateString = computed(() => {
  return props.maxAllowedDate ? toInputDate(props.maxAllowedDate) : null;
});

const errorMessage = ref('');
const amountInput = ref(null);

// --- Состояние для кнопок ---
const isDeleteConfirmVisible = ref(false);
const isCloneMode = ref(false);

// --- INLINE CREATE STATES (Для режима денег) ---
const isCreatingFromAccount = ref(false);
const newFromAccountName = ref('');
const newFromAccountInput = ref(null);
const isCreatingToAccount = ref(false);
const newToAccountName = ref('');
const newToAccountInput = ref(null);

// "Smart Create" Owner
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

// --- AUTO-SELECT LOGIC ---
const onFromAccountSelected = (accountId) => {
  const selectedAccount = mainStore.accounts.find(acc => acc._id === accountId);
  if (selectedAccount) {
    if (selectedAccount.companyId) {
      const cId = typeof selectedAccount.companyId === 'object' ? selectedAccount.companyId._id : selectedAccount.companyId;
      selectedFromOwner.value = `company-${cId}`;
    } else if (selectedAccount.individualId) {
      const iId = typeof selectedAccount.individualId === 'object' ? selectedAccount.individualId._id : selectedAccount.individualId;
      selectedFromOwner.value = `individual-${iId}`;
    } else {
      selectedFromOwner.value = null;
    }
  } else {
    selectedFromOwner.value = null;
  }
};

const onToAccountSelected = (accountId) => {
  const selectedAccount = mainStore.accounts.find(acc => acc._id === accountId);
  if (selectedAccount) {
    if (selectedAccount.companyId) {
      const cId = typeof selectedAccount.companyId === 'object' ? selectedAccount.companyId._id : selectedAccount.companyId;
      selectedToOwner.value = `company-${cId}`;
    } else if (selectedAccount.individualId) {
      const iId = typeof selectedAccount.individualId === 'object' ? selectedAccount.individualId._id : selectedAccount.individualId;
      selectedToOwner.value = `individual-${iId}`;
    } else {
      selectedToOwner.value = null;
    }
  } else {
    selectedToOwner.value = null;
  }
};

// --- MOUNTED ---
onMounted(async () => {
  // 1. Получаем системную категорию "Перевод"
  let sysTransferCat = mainStore.categories.find(c => c.name.toLowerCase() === 'перевод');
  if (!sysTransferCat) {
    try {
        sysTransferCat = await mainStore.addCategory('Перевод');
    } catch (e) { console.error("Error creating transfer category", e)}
  }
  transferCategoryId.value = sysTransferCat ? sysTransferCat._id : null;

  // 2. Инициализация данных
  if (props.transferToEdit) {
    const item = props.transferToEdit;
    amount.value = formatNumber(Math.abs(item.amount));
    
    // ОПРЕДЕЛЯЕМ РЕЖИМ ПО ТИПУ ОПЕРАЦИИ
    if (item.type === 'act') {
        transferMode.value = 'act';
        selectedContractorId.value = item.contractorId?._id || item.contractorId;
        selectedProjectId.value = item.projectId?._id || item.projectId;
        selectedActCategoryId.value = item.categoryId?._id || item.categoryId;
    } else {
        transferMode.value = 'money';
        fromAccountId.value = item.fromAccountId?._id || item.fromAccountId;
        toAccountId.value = item.toAccountId?._id || item.toAccountId;
        
        // Владельцы
        if (item.fromCompanyId) {
          const cId = item.fromCompanyId?._id || item.fromCompanyId;
          selectedFromOwner.value = `company-${cId}`;
        } else if (item.fromIndividualId) {
          const iId = item.fromIndividualId?._id || item.fromIndividualId;
          selectedFromOwner.value = `individual-${iId}`;
        }
        
        if (item.toCompanyId) {
          const cId = item.toCompanyId?._id || item.toCompanyId;
          selectedToOwner.value = `company-${cId}`;
        } else if (item.toIndividualId) {
          const iId = item.toIndividualId?._id || item.toIndividualId;
          selectedToOwner.value = `individual-${iId}`;
        }
    }

    if (item.date) {
      editableDate.value = toInputDate(new Date(item.date));
    }
  } else {
    // Новый перевод
    setTimeout(() => {
      if (amountInput.value) amountInput.value.focus();
    }, 100);
  }
});

const title = computed(() => {
  if (transferMode.value === 'act') {
      return props.transferToEdit ? 'Редактирование Акта' : 'Подписание Акта (Выполнение)';
  }
  return props.transferToEdit && !isCloneMode.value ? 'Перевод' : 'Новый перевод';
});

const buttonText = computed(() => {
  if (transferMode.value === 'act') return 'Подписать Акт';
  if (props.transferToEdit && !isCloneMode.value) return 'Сохранить';
  return 'Добавить перевод';
});

const handleDeleteClick = () => { isDeleteConfirmVisible.value = true; };

const onDeleteConfirmed = async () => {
  try {
    if (!props.transferToEdit?._id) return;
    await mainStore.deleteOperation(props.transferToEdit);
    emit('transfer-complete', { dateKey: props.transferToEdit.dateKey });
    emit('close');
  } catch (e) { console.error(e); } 
  finally { isDeleteConfirmVisible.value = false; }
};

const handleCopyClick = () => {
  isCloneMode.value = true;
  editableDate.value = toInputDate(props.date); 
  nextTick(() => { amountInput.value?.focus(); });
};

// --- SMART CREATE OWNER (Only for Money Mode) ---
const openCreateOwnerModal = (target) => {
  creatingOwnerFor.value = target; 
  ownerTypeToCreate.value = 'company'; 
  newOwnerName.value = '';
  showCreateOwnerModal.value = true;
  nextTick(() => newOwnerInputRef.value?.focus());
};

const cancelCreateOwner = () => {
  if (isInlineSaving.value) return;
  showCreateOwnerModal.value = false;
  newOwnerName.value = '';
  if (creatingOwnerFor.value === 'from' && selectedFromOwner.value === '--CREATE_NEW--') selectedFromOwner.value = null;
  if (creatingOwnerFor.value === 'to' && selectedToOwner.value === '--CREATE_NEW--') selectedToOwner.value = null;
};

const setOwnerTypeToCreate = (type) => {
  ownerTypeToCreate.value = type;
  newOwnerInputRef.value?.focus();
};

const saveNewOwner = async () => {
  if (isInlineSaving.value) return;
  const name = newOwnerName.value.trim();
  const type = ownerTypeToCreate.value; 
  const target = creatingOwnerFor.value; 
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
    
    const newOwnerKey = `${type}-${newItem._id}`;
    if (target === 'from') selectedFromOwner.value = newOwnerKey;
    else selectedToOwner.value = newOwnerKey;

    showCreateOwnerModal.value = false;
    newOwnerName.value = '';

  } catch (e) { console.error(e); } 
  finally { isInlineSaving.value = false; }
};

// --- INLINE CREATE (Счета - только для Money Mode) ---
const showFromAccountInput = () => { isCreatingFromAccount.value = true; nextTick(() => newFromAccountInput.value?.focus()); };
const cancelCreateFromAccount = () => { isCreatingFromAccount.value = false; newFromAccountName.value = ''; };
const saveNewFromAccount = async () => {
  if (isInlineSaving.value) return;
  const name = newFromAccountName.value.trim();
  if (!name) return;
  isInlineSaving.value = true;
  try {
    let cId = null, iId = null;
    if (selectedFromOwner.value) {
        const [type, id] = selectedFromOwner.value.split('-');
        if (type === 'company') cId = id; else iId = id;
    }
    const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (existing) { fromAccountId.value = existing._id; onFromAccountSelected(existing._id); } 
    else {
      const newItem = await mainStore.addAccount({ name: name, companyId: cId, individualId: iId });
      fromAccountId.value = newItem._id;
      onFromAccountSelected(newItem._id);
    }
    cancelCreateFromAccount(); 
  } catch (e) { console.error(e); } finally { isInlineSaving.value = false; }
};

const showToAccountInput = () => { isCreatingToAccount.value = true; nextTick(() => newToAccountInput.value?.focus()); };
const cancelCreateToAccount = () => { isCreatingToAccount.value = false; newToAccountName.value = ''; };
const saveNewToAccount = async () => {
  if (isInlineSaving.value) return;
  const name = newToAccountName.value.trim();
  if (!name) return;
  isInlineSaving.value = true;
  try {
    let cId = null, iId = null;
    if (selectedToOwner.value) {
        const [type, id] = selectedToOwner.value.split('-');
        if (type === 'company') cId = id; else iId = id;
    }
    const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (existing) { toAccountId.value = existing._id; onToAccountSelected(existing._id); } 
    else {
      const newItem = await mainStore.addAccount({ name: name, companyId: cId, individualId: iId });
      toAccountId.value = newItem._id;
      onToAccountSelected(newItem._id);
    }
    cancelCreateToAccount(); 
  } catch (e) { console.error(e); } finally { isInlineSaving.value = false; }
};

const _getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000); 
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

const _getDateKey = (date) => {
  const year = date.getFullYear();
  const doy = _getDayOfYear(date);
  return `${year}-${doy}`;
};

const syncState = async (dateKey, oldDateKey = null) => {
  try {
    await mainStore.refreshDay(dateKey);
    if (oldDateKey && oldDateKey !== dateKey) await mainStore.refreshDay(oldDateKey);
    await mainStore.fetchAllEntities();
    mainStore.displayCache = { ...mainStore.displayCache };
    mainStore.calculationCache = { ...mainStore.calculationCache };
  } catch (e) { console.error(e); }
};

const handleSave = async () => {
  if (isInlineSaving.value) return;

  errorMessage.value = '';
  
  const cleanedAmount = (amountInput.value?.value || amount.value).replace(/ /g, '');
  const amountParsed = parseFloat(cleanedAmount);

  if (isNaN(amountParsed) || amountParsed <= 0) {
    errorMessage.value = 'Введите корректную сумму';
    return;
  }

  // ВАЛИДАЦИЯ ПО РЕЖИМАМ
  if (transferMode.value === 'money') {
      if (!fromAccountId.value || !toAccountId.value) {
        errorMessage.value = 'Выберите счета отправителя и получателя';
        return;
      }
      if (fromAccountId.value === toAccountId.value) {
        errorMessage.value = 'Счета не должны совпадать';
        return;
      }
  } else {
      // Режим 'act'
      if (!selectedContractorId.value) {
        errorMessage.value = 'Выберите контрагента';
        return;
      }
  }

  isInlineSaving.value = true; 

  try {
    const [year, month, day] = editableDate.value.split('-').map(Number);
    const finalDate = new Date(year, month - 1, day, 12, 0, 0); 
    const dateKey = _getDateKey(finalDate);

    // Подготовка данных для MONEY режима
    let fromCompanyId = null, fromIndividualId = null;
    let toCompanyId = null, toIndividualId = null;
    
    if (transferMode.value === 'money') {
        if (selectedFromOwner.value) {
          const [type, id] = selectedFromOwner.value.split('-');
          if (type === 'company') fromCompanyId = id; else fromIndividualId = id;
        }
        if (selectedToOwner.value) {
          const [type, id] = selectedToOwner.value.split('-');
          if (type === 'company') toCompanyId = id; else toIndividualId = id;
        }
    }

    // Формирование общего payload
    // Если act - отправляем type: 'act' и спец поля
    // Если money - отправляем type: 'transfer' и счета
    const payload = {
        date: finalDate,
        amount: amountParsed,
        type: transferMode.value === 'act' ? 'act' : 'transfer',
        
        // Поля для Перевода
        fromAccountId: transferMode.value === 'money' ? fromAccountId.value : null,
        toAccountId: transferMode.value === 'money' ? toAccountId.value : null,
        fromCompanyId: transferMode.value === 'money' ? fromCompanyId : null,
        toCompanyId: transferMode.value === 'money' ? toCompanyId : null, 
        fromIndividualId: transferMode.value === 'money' ? fromIndividualId : null, 
        toIndividualId: transferMode.value === 'money' ? toIndividualId : null, 
        
        // Поля для Акта
        contractorId: transferMode.value === 'act' ? selectedContractorId.value : null,
        projectId: transferMode.value === 'act' ? selectedProjectId.value : null,
        categoryId: transferMode.value === 'act' ? selectedActCategoryId.value : transferCategoryId.value,
        
        // Доп поля
        dateKey: dateKey
    };

    let savedOperation;
    const oldDateKey = props.transferToEdit ? props.transferToEdit.dateKey : null;

    // ВЫЗОВ МЕТОДОВ STORE
    if (transferMode.value === 'act') {
        // Для Акта используем createAct (который мы добавим в store) или createOperation
        // Если редактируем
        if (props.transferToEdit && !isCloneMode.value) {
             // Обновление через store (нужно добавить updateAct или использовать updateOperation)
             savedOperation = await mainStore.updateOperation(props.transferToEdit._id, payload);
        } else {
             // Создание
             savedOperation = await mainStore.createAct(payload);
        }
    } else {
        // Обычный перевод
        if (!props.transferToEdit || isCloneMode.value) {
          savedOperation = await mainStore.createTransfer(payload);
        } else {
          savedOperation = await mainStore.updateTransfer(props.transferToEdit._id, payload);
        }
    }
    
    emit('transfer-complete', { 
      dateKey: savedOperation?.dateKey || dateKey,
      operation: savedOperation 
    });
    emit('close');

    syncState(dateKey, oldDateKey); 

  } catch (error) { 
    console.error(error);
    errorMessage.value = 'Ошибка при сохранении. Попробуйте снова.';
  } finally {
    isInlineSaving.value = false; 
  }
};

const closePopup = () => { 
  if (isInlineSaving.value) return; 
  emit('close'); 
};
</script>

<template>
  <div class="popup-overlay" @click.self="closePopup">
    <div class="popup-content theme-edit">
      
      <div class="mode-switcher">
        <button 
          class="mode-btn" 
          :class="{ active: transferMode === 'money' }"
          @click="transferMode = 'money'"
        >
          💸 Перевод денег
        </button>
        <button 
          class="mode-btn" 
          :class="{ active: transferMode === 'act' }"
          @click="transferMode = 'act'"
        >
          📄 Закрыть Акт
        </button>
      </div>

      <h3>{{ title }}</h3>

      <template v-if="!showCreateOwnerModal">
        <label>Сумма ({{ transferMode === 'act' ? 'по Акту' : 'Перевода' }}), Т</label>
        <input type="text" inputmode="decimal" v-model="amount" placeholder="0" ref="amountInput" class="form-input" @input="onAmountInput" />
        
        <template v-if="transferMode === 'money'">
            <label>Со счета *</label>
            <select v-if="!isCreatingFromAccount" v-model="fromAccountId" @change="e => e.target.value === '--CREATE_NEW--' ? showFromAccountInput() : onFromAccountSelected(e.target.value)" class="form-select">
              <option :value="null" disabled>Выберите счет</option>
              <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">{{ acc.name }}</option>
              <option value="--CREATE_NEW--">[ + Создать новый счет ]</option>
            </select>
            <div v-else class="inline-create-form">
              <input type="text" v-model="newFromAccountName" placeholder="Название счета (От)" ref="newFromAccountInput" @keyup.enter="saveNewFromAccount" @keyup.esc="cancelCreateFromAccount" />
              <button @click="saveNewFromAccount" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
              <button @click="cancelCreateFromAccount" class="btn-inline-cancel" :disabled="isInlineSaving">X</button>
            </div>
            
            <label>Компании/Физлица (Отправитель)</label>
            <select v-model="selectedFromOwner" @change="e => e.target.value === '--CREATE_NEW--' && openCreateOwnerModal('from')" class="form-select">
              <option :value="null">Автоматически</option>
              <optgroup label="Компании">
                <option v-for="comp in mainStore.companies" :key="comp._id" :value="`company-${comp._id}`">{{ comp.name }}</option>
              </optgroup>
              <optgroup label="Физлица">
                <option v-for="ind in mainStore.individuals" :key="ind._id" :value="`individual-${ind._id}`">{{ ind.name }}</option>
              </optgroup>
              <option value="--CREATE_NEW--">[ + Создать... ]</option>
            </select>

            <label>На счет *</label>
            <select v-if="!isCreatingToAccount" v-model="toAccountId" @change="e => e.target.value === '--CREATE_NEW--' ? showToAccountInput() : onToAccountSelected(e.target.value)" class="form-select">
              <option :value="null" disabled>Выберите счет</option>
              <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">{{ acc.name }}</option>
              <option value="--CREATE_NEW--">[ + Создать новый счет ]</option>
            </select>
            <div v-else class="inline-create-form">
              <input type="text" v-model="newToAccountName" placeholder="Название счета (Куда)" ref="newToAccountInput" @keyup.enter="saveNewToAccount" @keyup.esc="cancelCreateToAccount" />
              <button @click="saveNewToAccount" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
              <button @click="cancelCreateToAccount" class="btn-inline-cancel" :disabled="isInlineSaving">X</button>
            </div>
            
            <label>Компании/Физлица (Получатель)</label>
            <select v-model="selectedToOwner" @change="e => e.target.value === '--CREATE_NEW--' && openCreateOwnerModal('to')" class="form-select">
              <option :value="null">Автоматически</option>
              <optgroup label="Компании">
                <option v-for="comp in mainStore.companies" :key="comp._id" :value="`company-${comp._id}`">{{ comp.name }}</option>
              </optgroup>
              <optgroup label="Физлица">
                <option v-for="ind in mainStore.individuals" :key="ind._id" :value="`individual-${ind._id}`">{{ ind.name }}</option>
              </optgroup>
              <option value="--CREATE_NEW--">[ + Создать... ]</option>
            </select>
        </template>

        <template v-if="transferMode === 'act'">
            <div class="act-hint">
                Вы фиксируете выполнение обязательств. Деньги не двигаются.
            </div>

            <label>Контрагент (Клиент) *</label>
            <select v-model="selectedContractorId" class="form-select">
               <option :value="null">Выберите контрагента</option>
               <option v-for="c in mainStore.contractors" :key="c._id" :value="c._id">{{ c.name }}</option>
            </select>

            <label>Категория (Что закрываем)</label>
            <select v-model="selectedActCategoryId" class="form-select">
               <option :value="null">Без категории</option>
               <option v-for="cat in mainStore.categories" :key="cat._id" :value="cat._id">{{ cat.name }}</option>
            </select>

            <label>Проект (Опционально)</label>
            <select v-model="selectedProjectId" class="form-select">
               <option :value="null">Без проекта</option>
               <option v-for="p in mainStore.projects" :key="p._id" :value="p._id">{{ p.name }}</option>
            </select>
        </template>

        <label>Дата {{ transferMode === 'act' ? 'акта' : 'поступления денег' }}</label>
        <input type="date" v-model="editableDate" class="form-input" :min="minDateString" :max="maxDateString" />

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

        <div class="popup-actions-row">
          <button 
            @click="handleSave" 
            class="btn-submit save-wide" 
            :class="transferMode === 'act' ? 'btn-submit-act' : (buttonText === 'Сохранить' ? 'btn-submit-edit' : 'btn-submit-transfer')" 
            :disabled="isInlineSaving"
          >
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

  <ConfirmationPopup v-if="isDeleteConfirmVisible" title="Подтвердите удаление" message="Вы уверены, что хотите удалить эту операцию?" @close="isDeleteConfirmVisible = false" @confirm="onDeleteConfirmed" />
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; color: #1a1a1a; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem; }
h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 2rem; text-align: left; font-size: 22px; font-weight: 600; }
label { display: block; margin-bottom: 0.5rem; margin-top: 1rem; color: #333; font-size: 14px; font-weight: 500; }
.form-input, .form-select { width: 100%; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; -webkit-appearance: none; -moz-appearance: none; appearance: none; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.form-select { background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.41 0.589844L6 5.16984L10.59 0.589844L12 2.00019L6 8.00019L0 2.00019L1.41 0.589844Z' fill='%23333'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; padding-right: 40px; }
select option[value="--CREATE_NEW--"] { font-style: italic; color: #007AFF; background-color: #f4f4f4; }
.theme-edit .form-input:focus, .theme-edit .form-select:focus { outline: none; border-color: #222222; box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.2); }
.error-message { color: #FF3B30; text-align: center; margin-top: 1rem; font-size: 14px; }
.inline-create-form { display: flex; align-items: center; gap: 8px; }
.inline-create-form input { flex: 1; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; }
.inline-create-form input:focus { outline: none; border-color: #222222; box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.2); }
.inline-create-form button { flex-shrink: 0; border: none; border-radius: 8px; color: white; font-size: 16px; cursor: pointer; height: 48px; width: 48px; padding: 0; line-height: 1; }
.inline-create-form button.btn-inline-save { background-color: #34C759; }
.inline-create-form button.btn-inline-save:disabled { background-color: #9bd6a8; cursor: not-allowed; }
.inline-create-form button.btn-inline-cancel { background-color: #FF3B30; }
.inline-create-form button.btn-inline-cancel:disabled { background-color: #f0a19c; cursor: not-allowed; }
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

/* 🟢 Стили для Акта */
.btn-submit-act { background-color: #5856D6; }
.btn-submit-act:hover:not(:disabled) { background-color: #4745a8; }
.act-hint { font-size: 0.85em; color: #666; background: #fff3cd; padding: 10px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #ffeeba; }

/* 🟢 Стили переключателя */
.mode-switcher { display: flex; background: #e0e0e0; border-radius: 8px; padding: 4px; margin-bottom: 20px; }
.mode-btn { flex: 1; border: none; background: transparent; padding: 8px; border-radius: 6px; font-weight: 500; color: #666; cursor: pointer; transition: all 0.2s; }
.mode-btn.active { background: #fff; color: #222; box-shadow: 0 2px 5px rgba(0,0,0,0.1); font-weight: 600; }

.smart-create-owner { border-top: 1px solid #E0E0E0; margin-top: 1.5rem; padding-top: 1.5rem; }
.smart-create-title { font-size: 18px; font-weight: 600; color: #1a1a1a; text-align: center; margin-top: 0; margin-bottom: 1.5rem; }
.smart-create-tabs { display: flex; justify-content: center; gap: 10px; margin-bottom: 1.5rem; }
.smart-create-tabs button { flex: 1; padding: 12px; font-size: 14px; font-weight: 500; border: 1px solid #E0E0E0; border-radius: 8px; background: #FFFFFF; color: #333; cursor: pointer; transition: all 0.2s; }
.smart-create-tabs button.active { background: #222222; color: #FFFFFF; border-color: #222222; }
.smart-create-actions { display: flex; gap: 10px; margin-top: 1rem; }
.smart-create-actions .btn-submit { flex: 1; }
.btn-submit-secondary { background-color: #e0e0e0; color: #333; font-weight: 500; }
.btn-submit-secondary:hover:not(:disabled) { background-color: #d1d1d1; }
</style>
