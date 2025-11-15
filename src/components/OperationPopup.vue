<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import axios from 'axios';
import { useMainStore } from '@/stores/mainStore';
import ConfirmationPopup from './ConfirmationPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v2.4-YEAR-AWARE-FIX ---
 * * ВЕРСИЯ: 2.4 - Исправление "слепоты к году" (dayOfYear -> dateKey)
 * ДАТА: 2025-11-10
 *
 * ИСПРАВЛЕНИЯ:
 * 1. (ARCH) Добавлены helpers `_getDayOfYear` и `_getDateKey`.
 * 2. (ARCH) `handleSave` теперь вычисляет и использует `dateKey` ("YYYY-DOY")
 * вместо `dayOfYear`.
 * 3. (API) `saveCreateOrClone` и `saveEdit` передают `dateKey` (строку) в
 * `mainStore`, что исправляет ошибку `dateKey.split is not a function`.
 * 4. (API) `emit('operation-updated')` теперь возвращает `{ dateKey }`.
 * 5. (Совместимость) Код v2.3 (проверка дубликатов) сохранен.
 */
// !!! ИСПРАВЛЕНИЕ: Читаем "боевой" URL из Vercel !!!
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
// (Старый код: const API_BASE_URL = 'http://localhost:3000/api';)
const mainStore = useMainStore();

const props = defineProps({
  type: { type: String, required: true },
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  operationToEdit: { type: Object, default: null }
});

const emit = defineEmits([
  'close',
  'operation-added',
  'operation-deleted',
  'operation-moved',
  'operation-updated'
]);

// --- ОБЯЗАТЕЛЬНЫЕ ПОЛЯ ---
const amount = ref('');
const selectedAccountId = ref(null);
const selectedCompanyId = ref(null);
const selectedContractorId = ref(null);

// --- НЕОБЯЗАТЕЛЬНЫЕ ПОЛЯ ---
const selectedCategoryId = ref(null);
const selectedProjectId = ref(null);

// для transfer:
const selectedFromAccountId = ref(null);
const selectedToAccountId   = ref(null);

const errorMessage = ref('');
const amountInput = ref(null);

// --- INLINE CREATE STATES ---
const isCreatingCategory = ref(false);
const newCategoryName = ref('');
const isCreatingAccount = ref(false);
const newAccountName = ref('');
const isCreatingCompany = ref(false);
const newCompanyName = ref('');
const isCreatingContractor = ref(false);
const newContractorName = ref('');
const isCreatingProject = ref(false);
const newProjectName = ref('');

const newCategoryInput = ref(null);
const newAccountInput = ref(null);
const newCompanyInput = ref(null);
const newContractorInput = ref(null);
const newProjectInput = ref(null);

const isDeleteConfirmVisible = ref(false);
const isCloneMode = ref(false);

// --- ДАТА ---
const toInputDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const editableDate = ref(toInputDate(props.date));

// --- ФОРМАТИРОВАНИЕ СУММЫ ---
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

// --- АВТОМАТИЧЕСКАЯ ПРИВЯЗКА КОМПАНИИ ПРИ ВЫБОРЕ СЧЕТА ---
const onAccountSelected = (accountId) => {
  
  // --- 🔴 ЛОГИРОВАНИЕ ОСТАВЛЕНО ДЛЯ ОТЛАДКИ ---
  console.log(`[OperationPopup] 🕵️‍♂️ onAccountSelected CALLED with accountId:`, accountId);
  const selectedAccount = mainStore.accounts.find(acc => acc._id === accountId);
  
  if (selectedAccount) {
    if (selectedAccount.companyId) {
      const cId = typeof selectedAccount.companyId === 'object'
        ? selectedAccount.companyId._id
        : selectedAccount.companyId;
      console.log(`[OperationPopup] 🟢 Set selectedCompanyId.value to:`, cId);
      selectedCompanyId.value = cId;
    } else {
      console.log(`[OperationPopup] ⚠️ Account has NO companyId.`);
    }
  }
};

// --- АВТОМАТИЧЕСКАЯ ПРИВЯЗКА (КОНТРАГЕНТ -> ПРОЕКТ / КАТЕГОРИЯ) ---
const onContractorSelected = (contractorId, fillProject = true, fillCategory = true) => {
  console.log(`[OperationPopup] 🕵️‍♂️ onContractorSelected CALLED with contractorId:`, contractorId);
  const selectedContractor = mainStore.contractors.find(c => c._id === contractorId);

  if (!selectedContractor) {
    console.log(`[OperationPopup] ❌ Contractor NOT FOUND for id:`, contractorId);
    return;
  }

  // 1. Пытаемся установить ПРОЕКТ
  if (fillProject && selectedContractor.defaultProjectId) {
    const pId = typeof selectedContractor.defaultProjectId === 'object'
      ? selectedContractor.defaultProjectId._id
      : selectedContractor.defaultProjectId;
    selectedProjectId.value = pId;
    console.log(`[OperationPopup] 🟢 Set selectedProjectId.value to:`, pId);
  } else if (fillProject) {
    console.log(`[OperationPopup] ⚠️ Contractor has NO defaultProjectId.`);
  }

  // 2. Пытаемся установить КАТЕГОРИЮ
  if (fillCategory && selectedContractor.defaultCategoryId) {
    const cId = typeof selectedContractor.defaultCategoryId === 'object'
      ? selectedContractor.defaultCategoryId._id
      : selectedContractor.defaultCategoryId;
    selectedCategoryId.value = cId;
    console.log(`[OperationPopup] 🟢 Set selectedCategoryId.value to:`, cId);
  } else if (fillCategory) {
    console.log(`[OperationPopup] ⚠️ Contractor has NO defaultCategoryId.`);
  }
};


// --- ИНИЦИАЛИЗАЦИЯ ПРИ РЕДАКТИРОВАНИИ ---
onMounted(() => {
  if (props.operationToEdit) {
    const op = props.operationToEdit;
    amount.value = formatNumber(Math.abs(op.amount));

    // --- Сначала ставим данные из операции ---
    selectedAccountId.value = op.accountId?._id || null;
    selectedCompanyId.value = op.companyId?._id || null;
    selectedContractorId.value = op.contractorId?._id || null;
    selectedProjectId.value = op.projectId?._id || null;
    selectedCategoryId.value = op.categoryId?._id || null;
    
    if (op.type === 'transfer') {
      selectedFromAccountId.value = op.fromAccountId?._id || null;
      selectedToAccountId.value   = op.toAccountId?._id   || null;
    }

    // --- 2. Теперь, заполняем ПУСТЫЕ поля значениями по умолчанию ---
    
    // Если счет есть, а компании нет -> ищем компанию по умолчанию
    if (selectedAccountId.value && !selectedCompanyId.value) {
      onAccountSelected(selectedAccountId.value);
    }
    
    // Если контрагент есть, а проекта или категории нет -> ищем по умолчанию
    if (selectedContractorId.value) {
      onContractorSelected(
        selectedContractorId.value, 
        !selectedProjectId.value,  // fillProject? (Только если его нет)
        !selectedCategoryId.value // fillCategory? (Только если ее нет)
      );
    }

    // 🔴 ИЗМЕНЕНО: Используем 'op.date' (которое mainStore(v4.2) теперь гарантирует)
    // или props.date как запасной вариант
    editableDate.value = toInputDate(op.date ? new Date(op.date) : props.date);
    
  } else {
    setTimeout(() => { amountInput.value?.focus(); }, 100);
  }
});


// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ: Helpers для handleSave (v2.4) ---
// =================================================================
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
// =================================================================


// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ: handleSave (v2.4) ---
// =================================================================
const handleSave = async () => {
  errorMessage.value = '';

  const amountFromDOM = (amountInput.value?.value || '').replace(/ /g, '');
  const amountParsed = parseFloat(amountFromDOM);

  // --- ВАЛИДАЦИЯ ДЛЯ ПЕРЕВОДОВ ---
  if (props.type === 'transfer') {
    if (isNaN(amountParsed) || amountParsed <= 0 || !selectedFromAccountId.value || !selectedToAccountId.value) {
      errorMessage.value = 'Введите сумму и выберите оба счёта.';
      return;
    }
    if (selectedFromAccountId.value === selectedToAccountId.value) {
      errorMessage.value = 'Счёт-источник и счёт-получатель не должны совпадать.';
      return;
    }
  } 
  // --- ВАЛИДАЦИЯ ДЛЯ ДОХОДОВ/РАСХОДОВ ---
  else {
    if (isNaN(amountParsed) || amountParsed <= 0 || !selectedAccountId.value || !selectedCompanyId.value || !selectedContractorId.value) {
      errorMessage.value = 'Пожалуйста, заполните все обязательные поля: Сумма, Счет, Компания, Контрагент.';
      return;
    }
  }

  try {
    // 🔴 ИЗМЕНЕНО: Вычисляем dateKey
    const [year, month, day] = editableDate.value.split('-').map(Number);
    const finalDate = new Date(year, month - 1, day);
    const dateKey = _getDateKey(finalDate); // 🔴 КЛЮЧЕВОЙ МОМЕНТ
    // const dayOfYear = getDayOfYear(finalDate); // (УДАЛЕНО)

    const base =
      (props.type === 'transfer')
        ? {
            type: 'transfer',
            amount: amountParsed,
            fromAccountId: selectedFromAccountId.value,
            toAccountId: selectedToAccountId.value,
            categoryId: selectedCategoryId.value,
            companyId: null, // Переводы не участвуют в расчетах компаний
            contractorId: null, // Переводы не участвуют в расчетах контрагентов
            projectId: null // Переводы не участвуют в расчетах проектов
          }
        : {
            type: props.type,
            amount: props.type === 'income' ? amountParsed : -Math.abs(amountParsed),
            categoryId: selectedCategoryId.value,
            accountId: selectedAccountId.value,
            companyId: selectedCompanyId.value,
            contractorId: selectedContractorId.value,
            projectId: selectedProjectId.value
          };

    if (!props.operationToEdit || isCloneMode.value) {
      // 🔴 ИЗМЕНЕНО: Передаем dateKey
      await saveCreateOrClone(base, dateKey);
      emit('close');
      isCloneMode.value = false;
      return;
    }

    const prev = props.operationToEdit;
    // 🔴 ИЗМЕНЕНО: Убедимся, что у операции есть dateKey
    const oldDateKey = prev.dateKey; 
    if (!oldDateKey) {
        console.error("!!! ОШИБКА: Редактируемая операция не имеет dateKey!", prev);
        errorMessage.value = "Ошибка: Редактируемая операция не имеет ключа даты.";
        return;
    }
    const oldCellIndex = Number.isInteger(prev.cellIndex) ? prev.cellIndex : 0;
    const desiredCellIndex = oldCellIndex; // (При редактировании cellIndex не меняется)

    // 🔴 ИЗМЕНЕНО: Передаем dateKey
    await saveEdit(prev._id, base, oldDateKey, oldCellIndex, dateKey, desiredCellIndex);
    emit('close');
    isCloneMode.value = false;

  } catch (error) {
    console.error('OperationPopup: ошибка handleSave', error);
    errorMessage.value = 'Ошибка при сохранении. Попробуйте снова.';
  }
};
// =================================================================


// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ: saveCreateOrClone (v2.4) ---
// =================================================================
async function saveCreateOrClone(base, dateKey) {
  let cellIndexToUse = 0;
  try {
    if (typeof mainStore.getFirstFreeCellIndex === 'function') {
      // 🔴 ИЗМЕНЕНО: Используем dateKey (строку)
      // Это исправляет ошибку `dateKey.split is not a function`
      const freeIndex = await mainStore.getFirstFreeCellIndex(dateKey, 0);
      cellIndexToUse = Number.isInteger(freeIndex) ? freeIndex : 0;
    }
  } catch(e) { 
      console.error('Ошибка getFirstFreeCellIndex:', e);
      cellIndexToUse = 0; 
  }

  // 🔴 ИЗМЕНЕНО: Передаем dateKey
  // Бэкенд должен быть обновлен, чтобы принимать dateKey вместо dayOfYear
  const payload = { ...base, dateKey, cellIndex: cellIndexToUse };
  
  // ==================================================================
  // --- 💡 ИСПРАВЛЕНИЕ: Заменяем localhost на API_BASE_URL ---
  // ==================================================================
  const response = await axios.post(`${API_BASE_URL}/events`, payload);
  
  // 🔴 ИСПРАВЛЕНИЕ: Обновляем все сущности после создания операции
  await mainStore.fetchAllEntities();
  
  // 🔴 ИЗМЕНЕНО: Обновляем HomeView с помощью полного объекта
  emit('operation-added', response.data);
}
// =================================================================


// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ: saveEdit (v2.4) ---
// =================================================================
async function saveEdit(opId, base, oldDateKey, oldCellIndex, newDateKey, desiredCellIndex) {
  // 🔴 ИЗМЕНЕНО: Сравниваем dateKey
  const positionChanged = (newDateKey !== oldDateKey); // (cellIndex не меняется при редактировании)

  if (positionChanged) {
    try {
      // 🔴 ИЗМЕНЕНО: Передаем dateKey
      // `moveOperation` также должен быть обновлен на бэкенде
      await mainStore.moveOperation(
        { _id: opId, ...base, dateKey: oldDateKey, cellIndex: oldCellIndex },
        oldDateKey,
        newDateKey,
        Number.isInteger(desiredCellIndex) ? desiredCellIndex : 0
      );
      // 🔴 ИЗМЕНЕНО: Этот emit больше не используется в HomeView (v4.6+)
      // emit('operation-moved', { operation: { _id: opId }, toDateKey: newDateKey, toCellIndex: desiredCellIndex });
    } catch (e) {
      console.error('moveOperation error', e);
      throw e;
    }
    
    // Обновляем данные операции (позиция уже обновлена)
    // ==================================================================
    // --- 💡 ИСПРАВЛЕНИЕ: Заменяем localhost на API_BASE_URL ---
    // ==================================================================
    await axios.put(`${API_BASE_URL}/events/${opId}`, {
      // 🔴 ИЗМЕНЕНО: Передаем dateKey
      ...base,
      dateKey: newDateKey,  
      cellIndex: desiredCellIndex
    });
    // 🔴 ИСПРАВЛЕНИЕ: Обновляем все сущности после редактирования
    await mainStore.fetchAllEntities();
    // 🔴 ИЗМЕНЕНО: Уведомляем HomeView
    emit('operation-updated', { dateKey: newDateKey });
    
  } else {
    // Позиция не изменилась, просто обновляем данные
    // ==================================================================
    // --- 💡 ИСПРАВЛЕНИЕ: Заменяем localhost на API_BASE_URL ---
    // ==================================================================
    await axios.put(`${API_BASE_URL}/events/${opId}`, {
      ...base,
      dateKey: oldDateKey, // 🔴 ИЗМЕНЕНО
      cellIndex: oldCellIndex
    });
    // 🔴 ИСПРАВЛЕНИЕ: Обновляем все сущности после редактирования
    await mainStore.fetchAllEntities();
    // 🔴 ИЗМЕНЕНО: Уведомляем HomeView
    emit('operation-updated', { dateKey: oldDateKey });
  }
}
// =================================================================


// =================================================================
// --- 🔴 v2.3: Функции Inline-Create (С ИСПРАВЛЕНИЯМИ) ---
// =================================================================

const showCategoryInput = () => { isCreatingCategory.value = true; nextTick(() => newCategoryInput.value?.focus()); };
const cancelCreateCategory = () => { isCreatingCategory.value = false; newCategoryName.value = ''; };
const saveNewCategory = async () => {
  const name = newCategoryName.value.trim();
  if (!name) return;
  
  // ПРОВЕРКА
  const existing = mainStore.categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    selectedCategoryId.value = existing._id;
  } else {
    try {
      const newItem = await mainStore.addCategory(name);
      selectedCategoryId.value = newItem._id;
      // 🔴 ИСПРАВЛЕНИЕ: Обновляем все сущности после создания категории
      await mainStore.fetchAllEntities();
    } catch (e) { console.error(e); }
  }
  cancelCreateCategory();
};

const showAccountInput = () => { isCreatingAccount.value = true; nextTick(() => newAccountInput.value?.focus()); };
const cancelCreateAccount = () => { isCreatingAccount.value = false; newAccountName.value = ''; };
const saveNewAccount = async () => {
  const name = newAccountName.value.trim();
  if (!name) return;

  // ПРОВЕРКА
  const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    // Выбираем существующий
    if (props.type === 'transfer') {
      selectedToAccountId.value = existing._id;
    } else {
      selectedAccountId.value = existing._id;
      onAccountSelected(existing._id); // Вызываем для авто-выбора компании
    }
  } else {
    // Создаем новый, используя УЖЕ ВЫБРАННУЮ КОМПАНИЮ
    try {
      const newItem = await mainStore.addAccount({
        name: name,
        companyId: selectedCompanyId.value // Привязываем к выбранной компании
      });
      
      // Автоматически выбираем новый счет
      if (props.type === 'transfer') {
        selectedToAccountId.value = newItem._id;
      } else {
        selectedAccountId.value = newItem._id;
        onAccountSelected(newItem._id); // Вызываем для авто-выбора компании
      }
      // 🔴 ИСПРАВЛЕНИЕ: Обновляем все сущности после создания счета
      await mainStore.fetchAllEntities();
    } catch (e) { 
      console.error('Ошибка создания счета:', e); 
    }
  }
  cancelCreateAccount(); 
};


const showCompanyInput = () => { isCreatingCompany.value = true; nextTick(() => newCompanyInput.value?.focus()); };
const cancelCreateCompany = () => { isCreatingCompany.value = false; newCompanyName.value = ''; };
const saveNewCompany = async () => {
  const name = newCompanyName.value.trim();
  if (!name) return;
  
  // ПРОВЕРКА
  const existing = mainStore.companies.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    selectedCompanyId.value = existing._id;
  } else {
    try {
      const newItem = await mainStore.addCompany(name);
      selectedCompanyId.value = newItem._id;
      // 🔴 ИСПРАВЛЕНИЕ: Обновляем все сущности после создания компании
      await mainStore.fetchAllEntities();
    } catch (e) { console.error(e); }
  }
  cancelCreateCompany();
};

const showContractorInput = () => { isCreatingContractor.value = true; nextTick(() => newContractorInput.value?.focus()); };
const cancelCreateContractor = () => { isCreatingContractor.value = false; newContractorName.value = ''; };
const saveNewContractor = async () => {
  const name = newContractorName.value.trim();
  if (!name) return;
  
  // ПРОВЕРКА
  const existing = mainStore.contractors.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    selectedContractorId.value = existing._id;
    // 🔴 НОВОЕ: Сразу подставляем defaults
    onContractorSelected(existing._id, true, true);
  } else {
    try {
      const newItem = await mainStore.addContractor(name);
      selectedContractorId.value = newItem._id;
      // 🔴 ИСПРАВЛЕНИЕ: Обновляем все сущности после создания контрагента
      await mainStore.fetchAllEntities();
    } catch (e) { console.error(e); }
  }
  cancelCreateContractor();
};

const showProjectInput = () => { isCreatingProject.value = true; nextTick(() => newProjectInput.value?.focus()); };
const cancelCreateProject = () => { isCreatingProject.value = false; newProjectName.value = ''; };
const saveNewProject = async () => {
  const name = newProjectName.value.trim();
  if (!name) return;

  // ПРОВЕРКА
  const existing = mainStore.projects.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    selectedProjectId.value = existing._id;
  } else {
    try {
      const newItem = await mainStore.addProject(name);
      selectedProjectId.value = newItem._id;
      // 🔴 ИСПРАВЛЕНИЕ: Обновляем все сущности после создания проекта
      await mainStore.fetchAllEntities();
    } catch (e) { console.error(e); }
  }
  cancelCreateProject();
};
// --- КОНЕЦ v2.3 ---

// --- UI COMPUTED (без изменений) ---
const title = computed(() => {
  if (props.type === 'transfer') {
    return props.operationToEdit && !isCloneMode.value ? 'Перевод' : 'Новый перевод';
  }
  if (props.operationToEdit && !isCloneMode.value) {
    return props.type === 'income' ? 'Доход' : 'Расход';
  }
  return props.type === 'income' ? 'Новый доход' : 'Новый расход';
});

const buttonText = computed(() => {
  if (props.type === 'transfer') {
    return props.operationToEdit && !isCloneMode.value ? 'Сохранить' : 'Добавить перевод';
  }
  if (props.operationToEdit && !isCloneMode.value) return 'Сохранить';
  return props.type === 'income' ? 'Добавить доход' : 'Добавить расход';
});

const buttonClass = computed(() => {
  if (props.type === 'transfer') return 'btn-submit-edit';
  if (props.operationToEdit && !isCloneMode.value) return 'btn-submit-edit';
  return props.type === 'income' ? 'btn-submit-income' : 'btn-submit-expense';
});

const popupTheme = computed(() => {
  if (props.type === 'transfer') return 'theme-edit';
  if (props.operationToEdit && !isCloneMode.value) return 'theme-edit';
  return props.type === 'income' ? 'theme-income' : 'theme-expense';
});

const closePopup = () => emit('close');

// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ: Удаление и Клонирование (v2.4) ---
// =================================================================
const handleDeleteClick = () => { isDeleteConfirmVisible.value = true; };

const onDeleteConfirmed = async () => {
  try {
    if (!props.operationToEdit?._id) return;
    
    // 🔴 ИЗМЕНЕНО: Используем mainStore.deleteOperation
    await mainStore.deleteOperation(props.operationToEdit);
    
    // 🔴 ИСПРАВЛЕНИЕ: Обновляем все сущности после удаления
    await mainStore.fetchAllEntities();
    
    // 🔴 ИЗМЕНЕНО: Отправляем dateKey
    emit('operation-deleted', { dateKey: props.operationToEdit.dateKey });
    emit('close');
  } catch (e) {
    console.error('Ошибка при удалении', e);
  } finally {
    isDeleteConfirmVisible.value = false;
  }
};

const handleCopyClick = () => {
  isCloneMode.value = true;
  // 🔴 ИЗМЕНЕНО: При клонировании сбрасываем дату на ту,
  // которая пришла из props (дата кликнутой ячейки)
  editableDate.value = toInputDate(props.date);
  nextTick(() => { amountInput.value?.focus(); });
};
// =================================================================

</script>

<template>
  <div class="popup-overlay" @click.self="closePopup">
    <div class="popup-content" :class="popupTheme">
      <h3>{{ title }}</h3>

      <label>Сумма, Т</label>
      <input
        type="text"
        inputmode="decimal"
        v-model="amount"
        placeholder="0"
        ref="amountInput"
        class="form-input"
        @input="onAmountInput"
      />

      <template v-if="props.type !== 'transfer'">
        <label>{{ props.type === 'income' ? 'На счет' : 'Со счета' }} *</label>
        <select
          v-if="!isCreatingAccount"
          v-model="selectedAccountId"
          @change="e => {
            if (e.target.value === '--CREATE_NEW--') {
              showAccountInput();
            } else {
              onAccountSelected(e.target.value);
            }
          }"
          class="form-select"
        >
          <option :value="null" disabled>Выберите счет</option>
          <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">{{ acc.name }}</option>
          <option value="--CREATE_NEW--">[ + Создать новый счет ]</option>
        </select>
        <div v-else class="inline-create-form">
          <input type="text" v-model="newAccountName" placeholder="Название счета" ref="newAccountInput" @keyup.enter="saveNewAccount" @keyup.esc="cancelCreateAccount" />
          <button @click="saveNewAccount" class="btn-inline-save">✓</button>
          <button @click="cancelCreateAccount" class="btn-inline-cancel">X</button>
        </div>
      </template>

      <template v-else>
        <label>Со счета *</label>
        <select v-model="selectedFromAccountId" class="form-select">
          <option :value="null" disabled>Выберите счёт-источник</option>
          <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">{{ acc.name }}</option>
        </select>

        <label>На счёт *</label>
        <select
          v-if="!isCreatingAccount"
          v-model="selectedToAccountId"
          @change="e => e.target.value === '--CREATE_NEW--' && showAccountInput()"
          class="form-select"
        >
          <option :value="null" disabled>Выберите счёт-получатель</option>
          <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">{{ acc.name }}</option>
          <option value="--CREATE_NEW--">[ + Создать новый счет ]</option>
        </select>
         <div v-else class="inline-create-form">
          <input type="text" v-model="newAccountName" placeholder="Название счета" ref="newAccountInput" @keyup.enter="saveNewAccount" @keyup.esc="cancelCreateAccount" />
          <button @click="saveNewAccount" class="btn-inline-save">✓</button>
          <button @click="cancelCreateAccount" class="btn-inline-cancel">X</button>
        </div>
      </template>

      <label>Компания *</label>
      <select
        v-if="!isCreatingCompany"
        v-model="selectedCompanyId"
        @change="e => e.target.value === '--CREATE_NEW--' && showCompanyInput()"
        class="form-select"
        :disabled="props.type === 'transfer'"
      >
        <option :value="null" disabled>Выберите компанию</option>
        <option v-for="comp in mainStore.companies" :key="comp._id" :value="comp._id">{{ comp.name }}</option>
        <option value="--CREATE_NEW--">[ + Создать новую компанию ]</option>
      </select>
      <div v-else class="inline-create-form">
        <input type="text" v-model="newCompanyName" placeholder="Название компании" ref="newCompanyInput" @keyup.enter="saveNewCompany" @keyup.esc="cancelCreateCompany" />
        <button @click="saveNewCompany" class="btn-inline-save">✓</button>
        <button @click="cancelCreateCompany" class="btn-inline-cancel">X</button>
      </div>

      <label>Контрагент *</label>
      <select
        v-if="!isCreatingContractor"
        v-model="selectedContractorId"
        @change="e => {
          if (e.target.value === '--CREATE_NEW--') {
            showContractorInput();
          } else {
            onContractorSelected(e.target.value, true, true);
          }
        }"
        class="form-select"
        :disabled="props.type === 'transfer'"
      >
        <option :value="null" disabled>Выберите контрагента</option>
        <option v-for="c in mainStore.contractors" :key="c._id" :value="c._id">{{ c.name }}</option>
        <option value="--CREATE_NEW--">[ + Создать нового контрагента ]</option>
      </select>
      <div v-else class="inline-create-form">
        <input type="text" v-model="newContractorName" placeholder="Название контрагента" ref="newContractorInput" @keyup.enter="saveNewContractor" @keyup.esc="cancelCreateContractor" />
        <button @click="saveNewContractor" class="btn-inline-save">✓</button>
        <button @click="cancelCreateContractor" class="btn-inline-cancel">X</button>
      </div>

      <label>Проект</label>
      <select
        v-if="!isCreatingProject"
        v-model="selectedProjectId"
        @change="e => e.target.value === '--CREATE_NEW--' && showProjectInput()"
        class="form-select"
        :disabled="props.type === 'transfer'"
      >
        <option :value="null">Без проекта</option>
        <option v-for="p in mainStore.projects" :key="p._id" :value="p._id">{{ p.name }}</option>
        <option value="--CREATE_NEW--">[ + Создать новый проект ]</option>
      </select>
      <div v-else class="inline-create-form">
        <input type="text" v-model="newProjectName" placeholder="Название проекта" ref="newProjectInput" @keyup.enter="saveNewProject" @keyup.esc="cancelCreateProject" />
        <button @click="saveNewProject" class="btn-inline-save">✓</button>
        <button @click="cancelCreateProject" class="btn-inline-cancel">X</button>
      </div>

      <label>Категория</label>
      <select
        v-if="!isCreatingCategory"
        v-model="selectedCategoryId"
        @change="e => e.target.value === '--CREATE_NEW--' && showCategoryInput()"
        class="form-select"
      >
        <option :value="null">Без категории</option>
        <option v-for="cat in mainStore.categories" :key="cat._id" :value="cat._id">{{ cat.name }}</option>
        <option value="--CREATE_NEW--">[ + Создать новую категорию ]</option>
      </select>
      <div v-else class="inline-create-form">
        <input type="text" v-model="newCategoryName" placeholder="Название категории" ref="newCategoryInput" @keyup.enter="saveNewCategory" @keyup.esc="cancelCreateCategory" />
        <button @click="saveNewCategory" class="btn-inline-save">✓</button>
        <button @click="cancelCreateCategory" class="btn-inline-cancel">X</button>
      </div>

      <label>Дата операции</label>
      <input type="date" v-model="editableDate" class="form-input" />

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

      <div class="popup-actions-row">
        <button @click="handleSave" class="btn-submit save-wide" :class="buttonClass">
          {{ buttonText }}
        </button>

        <div v-if="props.operationToEdit && !isCloneMode.value" class="icon-actions">
          <button class="icon-btn" title="Копировать" @click="handleCopyClick" aria-label="Копировать">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/>
            </svg>
          </button>

          <button class="icon-btn danger" title="Удалить" @click="handleDeleteClick" aria-label="Удалить">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 3h6a1 1 0 0 1 1 1v1h5v2H3V5h5V4a1 1 0 0 1 1-1Zm2 6h2v9h-2V9Zm6 0h2v9h-2V9ZM5 9h2v9H5V9Z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <ConfirmationPopup
    v-if="isDeleteConfirmVisible"
    title="Подтвердите удаление"
    message="Вы уверены, что хотите удалить эту операцию?"
    @close="isDeleteConfirmVisible = false"
    @confirm="onDeleteConfirmed"
  />
</template>

<style scoped>
/* (Стили я не менял, они идентичны твоим из v2.3) */
.popup-overlay {
  position: fixed; top: 0; left: 0;
  width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  overflow-y: auto;
}
.popup-content {
  background: #F4F4F4;
  padding: 2rem;
  border-radius: 12px;
  color: #1a1a1a;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  margin: 2rem 1rem;
}
h3 {
  color: #1a1a1a;
  margin-top: 0;
  margin-bottom: 2rem;
  text-align: left;
  font-size: 22px;
  font-weight: 600;
}
label {
  display: block;
  margin-bottom: 0.5rem;
  margin-top: 1rem;
  color: #333;
  font-size: 14px;
  font-weight: 500;
}
.form-input,
.form-select {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  margin: 0;
  background: #FFFFFF;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  color: #1a1a1a;
  font-size: 15px;
  font-family: inherit;
  box-sizing: border-box;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.form-select {
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.41 0.589844L6 5.16984L10.59 0.589844L12 2.00019L6 8.00019L0 2.00019L1.41 0.589844Z' fill='%23333'%3E%3C/path%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 40px;
}
.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: #F36F3F;
  box-shadow: 0 0 0 2px rgba(243, 111, 63, 0.2);
}
.theme-income .form-input:focus,
.theme-income .form-select:focus {
  border-color: #28B8A0;
  box-shadow: 0 0 0 2px rgba(40, 184, 160, 0.2);
}
.theme-edit .form-input:focus,
.theme-edit .form-select:focus {
  border-color: #222222;
  box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.2);
}
select option[value="--CREATE_NEW--"] {
  font-style: italic;
  color: #007AFF;
  background-color: #f4f4f4;
}

.inline-create-form {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 15px;
}
.inline-create-form input {
  flex: 1;
  height: 48px;
  padding: 0 14px;
  margin: 0;
  background: #FFFFFF;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  color: #1a1a1a;
  font-size: 15px;
  font-family: inherit;
  box-sizing: border-box;
}
.inline-create-form input:focus {
  outline: none;
  border-color: #F36F3F;
}
.inline-create-form button {
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 16px;
  cursor: pointer;
  height: 48px;
  width: 48px;
  padding: 0;
  line-height: 1;
}
.inline-create-form button.btn-inline-save { background-color: #34C759; }
.inline-create-form button.btn-inline-cancel { background-color: #FF3B30; }

.error-message {
  color: #FF3B30;
  text-align: center;
  margin-top: 1rem;
  font-size: 14px;
}

.popup-actions-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 2rem;
}
.save-wide {
  flex: 1 1 auto;
  height: 54px;
}
.icon-actions {
  display: flex;
  gap: 10px;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border: none;
  border-radius: 10px;
  background: #EFEFEF;
  color: #222;
  cursor: pointer;
}
.icon-btn:hover {
  background: #E5E5EE;
}
.icon-btn.danger {
  background: #FF3B30;
  color: #fff;
}
.icon-btn.danger:hover {
  background: #d93025;
}
.icon {
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  fill: currentColor;
  display: block;
  pointer-events: none;
}

.btn-submit {
  width: 100%;
  height: 50px;
  padding: 0 1rem;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.btn-submit-income { background-color: #34c759; }
.btn-submit-income:hover { background-color: #34c759; }
.btn-submit-expense { background-color: #ff3b30; }
.btn-submit-expense:hover { background-color: #ff3b30; }
.btn-submit-edit { background-color: #222222; }
.btn-submit-edit:hover { background-color: #444444; }
</style>
