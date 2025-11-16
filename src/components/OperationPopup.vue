<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import axios from 'axios';
import { useMainStore } from '@/stores/mainStore';
import ConfirmationPopup from './ConfirmationPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v5.3-DATE-FIX ---
 * * ВЕРСИЯ: 5.3 - Исправление сдвига даты
 * ДАТА: 2025-11-16
 *
 * ИСПРАВЛЕНИЯ:
 * 1. (FIX 1A) `handleSave` теперь создает дату на 12:00 (полдень) для избежания сдвига часовых поясов.
 *
 * --- 🔴 ИСПРАВЛЕНИЕ (17.11.2025) ---
 * 1. (FIX #14) Восстановлена функция `onAmountInput` и `formatNumber`
 * для форматирования сумм (разделители тысячных).
 * 2. (FIX #13) Полностью удален блок `<template v-else>` (форма перевода).
 * 3. (FIX #13) Удалены связанные `ref` (`selectedFromAccountId`, `selectedToAccountId`).
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

// --- 🔴 УДАЛЕНО (FIX #13) ---
// const selectedFromAccountId = ref(null);
// const selectedToAccountId   = ref(null);

const errorMessage = ref('');
const amountInput = ref(null);

// --- INLINE CREATE STATES ---
const isCreatingAccount = ref(false);
const newAccountName = ref('');
const newAccountInput = ref(null);
const isCreatingCompany = ref(false);
const newCompanyName = ref('');
const newCompanyInput = ref(null);
const isCreatingContractor = ref(false);
const newContractorName = ref('');
const newContractorInput = ref(null);
const isCreatingProject = ref(false);
const newProjectName = ref('');
const newProjectInput = ref(null);
const isCreatingCategory = ref(false);
const newCategoryName = ref('');
const newCategoryInput = ref(null);
// --- (Конец Inline Create) ---


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

// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ (FIX #14): ФОРМАТИРОВАНИЕ СУММЫ ---
// =================================================================
const formatNumber = (numStr) => {
  const clean = `${numStr}`.replace(/[^0-9]/g, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const onAmountInput = (event) => {
  const input = event.target;
  const value = input.value;
  const cursorPosition = input.selectionStart;
  
  // 1. Очищаем значение от всего, кроме цифр
  const rawValue = value.replace(/[^0-9]/g, '');
  
  // 2. Форматируем
  const formattedValue = formatNumber(rawValue);
  
  // 3. Считаем, насколько изменилась длина (из-за добавления/удаления пробелов)
  const cursorOffset = formattedValue.length - value.length;
  
  // 4. Устанавливаем форматированное значение
  amount.value = formattedValue;
  if (input.value !== formattedValue) {
    input.value = formattedValue; // Принудительно ставим в DOM
  }
  
  // 5. Восстанавливаем позицию курсора
  nextTick(() => {
    if (input.selectionStart !== undefined) {
      input.setSelectionRange(cursorPosition + cursorOffset, cursorPosition + cursorOffset);
    }
  });
};
// =================================================================


// --- АВТОМАТИЧЕСКАЯ ПРИВЯЗКА КОМПАНИИ ПРИ ВЫБОРЕ СЧЕТА ---
const onAccountSelected = (accountId) => {
  const account = mainStore.accounts.find(a => a._id === accountId);
  if (account && account.companyId) {
    // (v4.4) Убедимся, что companyId - это строка, а не объект
    const cId = (account.companyId && typeof account.companyId === 'object')
      ? account.companyId._id
      : account.companyId;
    selectedCompanyId.value = cId;
  }
};

// --- АВТОМАТИЧЕСКАЯ ПРИВЯЗКА (КОНТРАГЕНТ -> ПРОЕКТ / КАТЕГОРИЯ) ---
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
      selectedCategoryId.value = cId;
    }
  }
};


// --- ИНИЦИАЛИЗАЦИЯ ПРИ РЕДАКТИРОВАНИИ ---
onMounted(() => {
  if (props.operationToEdit) {
    // РЕЖИМ РЕДАКТИРОВАНИЯ
    const op = props.operationToEdit;
    amount.value = formatNumber(Math.abs(op.amount || 0));
    selectedAccountId.value = op.accountId?._id || op.accountId;
    selectedCompanyId.value = op.companyId?._id || op.companyId;
    selectedContractorId.value = op.contractorId?._id || op.contractorId;
    selectedCategoryId.value = op.categoryId?._id || op.categoryId;
    selectedProjectId.value = op.projectId?._id || op.projectId;
    
    if (op.date) {
      editableDate.value = toInputDate(new Date(op.date));
    }
    
  } else {
    // РЕЖИМ СОЗДАНИЯ
    // Автофокус на поле суммы
    setTimeout(() => {
      if (amountInput.value) {
        amountInput.value.focus();
      }
    }, 100);
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
// --- 🔴 ИСПРАВЛЕНИЕ: handleSave (v5.3) ---
// =================================================================
const handleSave = async () => {
  errorMessage.value = '';

  // 🔴 ИСПРАВЛЕНИЕ (FIX #14): Используем .value или amount, а не amountInput.value
  const amountFromState = (amount.value || '').replace(/ /g, '');
  const amountParsed = parseFloat(amountFromState);

  // --- ВАЛИДАЦИЯ ДЛЯ ДОХОДОВ/РАСХОДОВ ---
  // (Блок `props.type === 'transfer'` удален)
  if (isNaN(amountParsed) || amountParsed <= 0 || !selectedAccountId.value || !selectedCompanyId.value || !selectedContractorId.value) {
    errorMessage.value = 'Пожалуйста, заполните все обязательные поля: Сумма, Счет, Компания, Контрагент.';
    return;
  }
  
  try {
    // 🔴 ИЗМЕНЕНО: Вычисляем dateKey
    const [year, month, day] = editableDate.value.split('-').map(Number);

    // !!! ИСПРАВЛЕНИЕ (1A): Устанавливаем время на 12:00 (полдень) !!!
    // const finalDate = new Date(year, month - 1, day); // УДАЛЕНО
    const finalDate = new Date(year, month - 1, day, 12, 0, 0); // ДОБАВЛЕНО

    const dateKey = _getDateKey(finalDate); // 🔴 КЛЮЧЕВОЙ МОМЕНТ
    
    const base = {
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
    
    // 🔴 ИЗМЕНЕНО: Передаем dateKey
    await saveEdit(prev._id, base, oldDateKey, oldCellIndex, dateKey, oldCellIndex);
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
  const finalDateKey = positionChanged ? newDateKey : oldDateKey;

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
    // 🔴 ИЗМЕНЕНО: Уведомляем HomeView
    emit('operation-updated', { dateKey: newDateKey, oldDateKey: oldDateKey });
    
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
    // 🔴 ИЗМЕНЕНО: Уведомляем HomeView
    emit('operation-updated', { dateKey: oldDateKey, oldDateKey: null });
  }
}
// =================================================================


// =================================================================
// --- 🔴 v2.3: Функции Inline-Create (без изменений) ---
// =================================================================
// ... (Все функции Inline-Create)
const showAccountInput = () => { isCreatingAccount.value = true; nextTick(() => newAccountInput.value?.focus()); };
const cancelCreateAccount = () => { isCreatingAccount.value = false; newAccountName.value = ''; };
const saveNewAccount = async () => {
  const name = newAccountName.value.trim();
  if (!name) return;
  const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    selectedAccountId.value = existing._id;
    onAccountSelected(existing._id);
  } else {
    try {
      const newItem = await mainStore.addAccount({ name: name, companyId: selectedCompanyId.value });
      selectedAccountId.value = newItem._id;
      onAccountSelected(newItem._id);
    } catch (e) { console.error(e); }
  }
  cancelCreateAccount();
};

const showCompanyInput = () => { isCreatingCompany.value = true; nextTick(() => newCompanyInput.value?.focus()); };
const cancelCreateCompany = () => { isCreatingCompany.value = false; newCompanyName.value = ''; };
const saveNewCompany = async () => {
  const name = newCompanyName.value.trim();
  if (!name) return;
  const existing = mainStore.companies.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    selectedCompanyId.value = existing._id;
  } else {
    try {
      const newItem = await mainStore.addCompany(name);
      selectedCompanyId.value = newItem._id;
    } catch (e) { console.error(e); }
  }
  cancelCreateCompany();
};

const showContractorInput = () => { isCreatingContractor.value = true; nextTick(() => newContractorInput.value?.focus()); };
const cancelCreateContractor = () => { isCreatingContractor.value = false; newContractorName.value = ''; };
const saveNewContractor = async () => {
  const name = newContractorName.value.trim();
  if (!name) return;
  const existing = mainStore.contractors.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    selectedContractorId.value = existing._id;
    onContractorSelected(existing._id, true, true);
  } else {
    try {
      const newItem = await mainStore.addContractor(name);
      selectedContractorId.value = newItem._id;
      onContractorSelected(newItem._id, true, true);
    } catch (e) { console.error(e); }
  }
  cancelCreateContractor();
};

const showProjectInput = () => { isCreatingProject.value = true; nextTick(() => newProjectInput.value?.focus()); };
const cancelCreateProject = () => { isCreatingProject.value = false; newProjectName.value = ''; };
const saveNewProject = async () => {
  const name = newProjectName.value.trim();
  if (!name) return;
  const existing = mainStore.projects.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    selectedProjectId.value = existing._id;
  } else {
    try {
      const newItem = await mainStore.addProject(name);
      selectedProjectId.value = newItem._id;
    } catch (e) { console.error(e); }
  }
  cancelCreateProject();
};

const showCategoryInput = () => { isCreatingCategory.value = true; nextTick(() => newCategoryInput.value?.focus()); };
const cancelCreateCategory = () => { isCreatingCategory.value = false; newCategoryName.value = ''; };
const saveNewCategory = async () => {
  const name = newCategoryName.value.trim();
  if (!name) return;
  const existing = mainStore.categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    selectedCategoryId.value = existing._id;
  } else {
    try {
      const newItem = await mainStore.addCategory(name);
      selectedCategoryId.value = newItem._id;
    } catch (e) { console.error(e); }
  }
  cancelCreateCategory();
};
// =================================================================

// --- UI COMPUTED (без изменений) ---
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
// =================================================================

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
      </template>

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
/* (Стили не менялись) */
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
.icon-btn:hover { background: #E5E5EE; }
.icon-btn.danger { background: #FF3B30; color: #fff; }
.icon-btn.danger:hover { background: #d93025; }
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
.btn-submit-income {
  background-color: #28B8A0;
}
.btn-submit-income:hover {
  background-color: #1f9c88;
}
.btn-submit-expense {
  background-color: #F36F3F;
}
.btn-submit-expense:hover {
  background-color: #d95a30;
}
.btn-submit-edit {
  background-color: #222222;
}
.btn-submit-edit:hover {
  background-color: #333333;
}
</style>
