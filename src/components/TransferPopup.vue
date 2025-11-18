<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import axios from 'axios';
import { useMainStore } from '@/stores/mainStore';
import ConfirmationPopup from './ConfirmationPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v12.0 - Лимит дат в попапах ---
 * * ВЕРСИЯ: 12.0 - Ограничение календаря
 * ДАТА: 2025-11-18
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (NEW) Добавлены props `minAllowedDate` и `maxAllowedDate`.
 * 2. (NEW) Добавлены computed `minDateString` и `maxDateString`
 * (используя существующий helper `toInputDate`).
 * 3. (NEW) `<input type="date">` теперь имеет атрибуты
 * :min="minDateString" и :max="maxDateString".
 */

// 🔴 НОВАЯ УСТАНОВКА: ЛОГИРОВАНИЕ
console.log('--- TransferPopup.vue v12.0 (Лимит дат в попапах) ЗАГРУЖЕН ---');

const mainStore = useMainStore();
const props = defineProps({
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  transferToEdit: { type: Object, default: null },
  // 🟢 NEW (v12.0)
  minAllowedDate: { type: Date, default: null },
  maxAllowedDate: { type: Date, default: null }
});

const emit = defineEmits(['close', 'transfer-complete']);

// --- Данные для полей ---
const amount = ref('');
const fromAccountId = ref(null);
const toAccountId = ref(null);
const categoryId = ref(null);

// 🟢 v9.0 (Шаг 6): НОВЫЕ ref'ы
const selectedFromOwner = ref(null); // (хранит 'company-ID' или 'individual-ID')
const selectedToOwner = ref(null); // (хранит 'company-ID' или 'individual-ID')


const toInputDate = (date) => {
  // 🔴 ЛОГИРОВАНИЕ
  // console.log('[TransferPopup] toInputDate: Входящая дата:', date);
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const result = `${year}-${month}-${day}`;
  // console.log('[TransferPopup] toInputDate: Результат:', result);
  return result;
};
const editableDate = ref(toInputDate(props.date));

// 🟢 NEW (v12.0): Ограничения для <input type="date">
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

// --- INLINE CREATE STATES (v4.1) ---
const isCreatingFromAccount = ref(false);
const newFromAccountName = ref('');
const newFromAccountInput = ref(null);
const isCreatingToAccount = ref(false);
const newToAccountName = ref('');
const newToAccountInput = ref(null);
const isCreatingCategory = ref(false);
const newCategoryName = ref('');
const newCategoryInput = ref(null);

// 🟢 v9.0 (Шаг 6): "Smart Create" модал для Владельца (Компания/Физлицо)
const showCreateOwnerModal = ref(false);
const ownerTypeToCreate = ref('company'); // 'company' или 'individual'
const newOwnerName = ref('');
const newOwnerInputRef = ref(null);
const creatingOwnerFor = ref('from'); // 🟢 v9.0 (Шаг 6): 'from' или 'to'

// --- Форматирование суммы (без изменений) ---
const formatNumber = (numStr) => {
  const clean = `${numStr}`.replace(/[^0-9]/g, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const onAmountInput = (event) => {
  // 🔴 ЛОГИРОВАНИЕ
  // console.log('[TransferPopup] onAmountInput СРАБОТАЛ');
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

// =================================================================
// --- 🟢 v9.0 (Шаг 6): АВТОМАТИЧЕСКАЯ ПРИВЯЗКА ВЛАДЕЛЬЦА ПРИ ВЫБОРЕ СЧЕТА ---
// =================================================================
const onFromAccountSelected = (accountId) => {
  console.log(`[TransferPopup] onFromAccountSelected: Выбран счет ${accountId}`);
  const selectedAccount = mainStore.accounts.find(acc => acc._id === accountId);
  if (selectedAccount) {
    // (Используем данные, добавленные в Шаге 4)
    if (selectedAccount.companyId) {
      const cId = typeof selectedAccount.companyId === 'object' ? selectedAccount.companyId._id : selectedAccount.companyId;
      selectedFromOwner.value = `company-${cId}`;
      console.log(`[TransferPopup] onFromAccountSelected: Авто-установлен Владелец (Компания) ${selectedFromOwner.value}`);
    } else if (selectedAccount.individualId) {
      const iId = typeof selectedAccount.individualId === 'object' ? selectedAccount.individualId._id : selectedAccount.individualId;
      selectedFromOwner.value = `individual-${iId}`;
      console.log(`[TransferPopup] onFromAccountSelected: Авто-установлен Владелец (Физлицо) ${selectedFromOwner.value}`);
    } else {
      selectedFromOwner.value = null;
    }
  } else {
    selectedFromOwner.value = null;
  }
};

const onToAccountSelected = (accountId) => {
  console.log(`[TransferPopup] onToAccountSelected: Выбран счет ${accountId}`);
  const selectedAccount = mainStore.accounts.find(acc => acc._id === accountId);
  if (selectedAccount) {
    if (selectedAccount.companyId) {
      const cId = typeof selectedAccount.companyId === 'object' ? selectedAccount.companyId._id : selectedAccount.companyId;
      selectedToOwner.value = `company-${cId}`;
      console.log(`[TransferPopup] onToAccountSelected: Авто-установлен Владелец (Компания) ${selectedToOwner.value}`);
    } else if (selectedAccount.individualId) {
      const iId = typeof selectedAccount.individualId === 'object' ? selectedAccount.individualId._id : selectedAccount.individualId;
      selectedToOwner.value = `individual-${iId}`;
      console.log(`[TransferPopup] onToAccountSelected: Авто-установлен Владелец (Физлицо) ${selectedToOwner.value}`);
    } else {
      selectedToOwner.value = null;
    }
  } else {
    selectedToOwner.value = null;
  }
};
// =================================================================


// --- Заполнение полей при редактировании ---
onMounted(async () => {
  // 🔴 ЛОГИРОВАНИЕ
  if (props.transferToEdit) {
    console.log('[TransferPopup] onMounted: РЕЖИМ РЕДАКТИРОВАНИЯ', props.transferToEdit);
  } else {
    console.log('[TransferPopup] onMounted: РЕЖИМ СОЗДАНИЯ');
  }

  // Находим категорию "Перевод"
  let transferCategory = mainStore.categories.find(c => c.name.toLowerCase() === 'перевод');
  if (!transferCategory) {
    try {
        console.log('[TransferPopup] onMounted: Категория "Перевод" не найдена, создаю...');
        transferCategory = await mainStore.addCategory('Перевод');
    } catch (e) { console.error("[TransferPopup] onMounted: Не удалось создать категорию 'Перевод'", e)}
  }
  // Устанавливаем ID по умолчанию
  const defaultCategoryId = transferCategory ? transferCategory._id : null;
  console.log(`[TransferPopup] onMounted: ID категории "Перевод" (defaultCategoryId): ${defaultCategoryId}`);

  // Если редактируем существующий перевод
  if (props.transferToEdit) {
    const transfer = props.transferToEdit;
    amount.value = formatNumber(Math.abs(transfer.amount));
    fromAccountId.value = transfer.fromAccountId?._id || transfer.fromAccountId;
    toAccountId.value = transfer.toAccountId?._id || transfer.toAccountId;
    
    // 🟢 v9.0 (Шаг 6): Устанавливаем `selectedOwner` на основе данных операции
    // (Логика авто-выбора при on...AccountSelected может не сработать, если счет был удален,
    // поэтому устанавливаем владельца принудительно из данных самого перевода)
    
    // FROM
    if (transfer.fromCompanyId) {
      const cId = transfer.fromCompanyId?._id || transfer.fromCompanyId;
      selectedFromOwner.value = `company-${cId}`;
    } else if (transfer.fromIndividualId) {
      const iId = transfer.fromIndividualId?._id || transfer.fromIndividualId;
      selectedFromOwner.value = `individual-${iId}`;
    }
    
    // TO
    if (transfer.toCompanyId) {
      const cId = transfer.toCompanyId?._id || transfer.toCompanyId;
      selectedToOwner.value = `company-${cId}`;
    } else if (transfer.toIndividualId) {
      const iId = transfer.toIndividualId?._id || transfer.toIndividualId;
      selectedToOwner.value = `individual-${iId}`;
    }
    
    // 🔴 v9.0 (Шаг 6): Старая логика `on...AccountSelected` и `fromCompanyId` УДАЛЕНА.
    // ...

    // =================================================================
    // --- 🔴 ИСПРАВЛЕНИЕ (FIX #17): Категория "Перевод" ---
    // =================================================================
    const savedCategoryId = transfer.categoryId?._id;
    console.log(`[TransferPopup] onMounted: Сохраненный ID категории: ${savedCategoryId}`);
    
    if (savedCategoryId && savedCategoryId !== 'transfer') {
      categoryId.value = savedCategoryId;
      console.log(`[TransferPopup] onMounted: Установлена категория из операции: ${savedCategoryId}`);
    } else {
      categoryId.value = defaultCategoryId;
      console.log(`[TransferPopup] onMounted: Установлена категория по умолчанию (Перевод): ${defaultCategoryId}`);
    }
    // =================================================================

    if (transfer.date) {
      editableDate.value = toInputDate(new Date(transfer.date));
    }
  } else {
    // Устанавливаем категорию "Перевод" для нового
    categoryId.value = defaultCategoryId;
    console.log(`[TransferPopup] onMounted: Установлена категория для нового перевода: ${defaultCategoryId}`);
    
    setTimeout(() => {
      if (amountInput.value) {
        amountInput.value.focus();
        console.log('[TransferPopup] onMounted: Фокус установлен на amountInput');
      }
    }, 100);
  }
});

// --- Заголовок и кнопка (без изменений) ---
const title = computed(() => {
  if (props.transferToEdit && !isCloneMode.value) {
    return 'Перевод';
  }
  return 'Новый перевод';
});

const buttonText = computed(() => {
  if (props.transferToEdit && !isCloneMode.value) {
    return 'Сохранить';
  }
  return 'Добавить перевод';
});

// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ: Кнопки Удаления и Клонирования (v4.2) ---
// =================================================================
const handleDeleteClick = () => {
  console.log('[TransferPopup] handleDeleteClick: Нажата кнопка "Удалить"');
  isDeleteConfirmVisible.value = true;
};

const onDeleteConfirmed = async () => {
  console.log('[TransferPopup] onDeleteConfirmed: Удаление подтверждено');
  try {
    if (!props.transferToEdit?._id) {
      console.error('[TransferPopup] onDeleteConfirmed: Ошибка! Нет operationToEdit._id');
      return;
    }
    
    await mainStore.deleteOperation(props.transferToEdit);
    
    console.log('[TransferPopup] onDeleteConfirmed: Вызываю emit transfer-complete (для обновления UI)');
    emit('transfer-complete', { dateKey: props.transferToEdit.dateKey });
    emit('close');
  } catch (e) {
    console.error('Ошибка при удалении перевода', e);
  } finally {
    isDeleteConfirmVisible.value = false;
  }
};

const handleCopyClick = () => {
  console.log('[TransferPopup] handleCopyClick: Нажата кнопка "Копировать"');
  isCloneMode.value = true;
  editableDate.value = toInputDate(props.date); 
  nextTick(() => { amountInput.value?.focus(); });
};
// =================================================================


// =================================================================
// --- 🟢 v9.0 (Шаг 6): "Smart Create" для Владельца ---
// =================================================================
const openCreateOwnerModal = (target) => {
  console.log(`[TransferPopup] openCreateOwnerModal: Открыто модальное окно "Smart Create" (target: ${target})`);
  creatingOwnerFor.value = target; // 'from' или 'to'
  ownerTypeToCreate.value = 'company'; // Сброс на "Компанию" по умолчанию
  newOwnerName.value = '';
  showCreateOwnerModal.value = true;
  nextTick(() => newOwnerInputRef.value?.focus());
};

const cancelCreateOwner = () => {
  console.log('[TransferPopup] cancelCreateOwner: Отмена "Smart Create"');
  showCreateOwnerModal.value = false;
  newOwnerName.value = '';
  
  // Сбрасываем <select> обратно, если он был на "--CREATE_NEW--"
  if (creatingOwnerFor.value === 'from' && selectedFromOwner.value === '--CREATE_NEW--') {
    selectedFromOwner.value = null;
  }
  if (creatingOwnerFor.value === 'to' && selectedToOwner.value === '--CREATE_NEW--') {
    selectedToOwner.value = null;
  }
};

const setOwnerTypeToCreate = (type) => {
  ownerTypeToCreate.value = type;
  newOwnerInputRef.value?.focus();
};

const saveNewOwner = async () => {
  const name = newOwnerName.value.trim();
  const type = ownerTypeToCreate.value; // 'company' или 'individual'
  const target = creatingOwnerFor.value; // 'from' или 'to'
  if (!name) return;
  
  console.log(`[TransferPopup] saveNewOwner: 💾 Сохранение (Target: ${target}, Тип: ${type}, Имя: ${name})`);

  try {
    let newItem;
    if (type === 'company') {
      const existing = mainStore.companies.find(c => c.name.toLowerCase() === name.toLowerCase());
      newItem = existing ? existing : await mainStore.addCompany(name);
    } else { // 'individual'
      const existing = mainStore.individuals.find(i => i.name.toLowerCase() === name.toLowerCase());
      newItem = existing ? existing : await mainStore.addIndividual(name);
    }
    
    // Устанавливаем новый `selectedOwner`
    const newOwnerKey = `${type}-${newItem._id}`;
    if (target === 'from') {
      selectedFromOwner.value = newOwnerKey;
    } else {
      selectedToOwner.value = newOwnerKey;
    }
    console.log(`[TransferPopup] saveNewOwner: ✅ УСПЕХ. Установлен ${target} owner: ${newOwnerKey}`);

  } catch (e) {
    console.error(`[TransferPopup] saveNewOwner: ❌ Ошибка при создании ${type}`, e);
  }
  
  cancelCreateOwner(); // Закрываем модальное окно
};
// =================================================================


// =================================================================
// --- 🔴 v4.1: Функции Inline-Create (Остальные) ---
// =================================================================
const showCategoryInput = () => { console.log('[TransferPopup] showCategoryInput'); isCreatingCategory.value = true; nextTick(() => newCategoryInput.value?.focus()); };
const cancelCreateCategory = () => { console.log('[TransferPopup] cancelCreateCategory'); isCreatingCategory.value = false; newCategoryName.value = ''; };
const saveNewCategory = async () => {
  const name = newCategoryName.value.trim();
  console.log(`[TransferPopup] saveNewCategory: Сохраняю категорию '${name}'`);
  if (!name) return;
  
  const existing = mainStore.categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    categoryId.value = existing._id;
  } else {
    try {
      const newItem = await mainStore.addCategory(name);
      categoryId.value = newItem._id;
    } catch (e) { console.error(e); }
  }
  cancelCreateCategory();
};

// --- "FROM" ---
const showFromAccountInput = () => { console.log('[TransferPopup] showFromAccountInput'); isCreatingFromAccount.value = true; nextTick(() => newFromAccountInput.value?.focus()); };
const cancelCreateFromAccount = () => { console.log('[TransferPopup] cancelCreateFromAccount'); isCreatingFromAccount.value = false; newFromAccountName.value = ''; };
const saveNewFromAccount = async () => {
  const name = newFromAccountName.value.trim();
  console.log(`[TransferPopup] saveNewFromAccount: Сохраняю счет (From) '${name}'`);
  if (!name) return;

  // 🟢 v9.0 (Шаг 6): Определяем владельца для нового счета
  let cId = null;
  let iId = null;
  if (selectedFromOwner.value) {
      const [type, id] = selectedFromOwner.value.split('-');
      if (type === 'company') cId = id;
      if (type === 'individual') iId = id;
  }

  const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    fromAccountId.value = existing._id;
    onFromAccountSelected(existing._id);
  } else {
    try {
      const newItem = await mainStore.addAccount({ name: name, companyId: cId, individualId: iId });
      fromAccountId.value = newItem._id;
      onFromAccountSelected(newItem._id);
    } catch (e) { console.error('Ошибка создания счета (From):', e); }
  }
  cancelCreateFromAccount(); 
};

// --- "TO" ---
const showToAccountInput = () => { console.log('[TransferPopup] showToAccountInput'); isCreatingToAccount.value = true; nextTick(() => newToAccountInput.value?.focus()); };
const cancelCreateToAccount = () => { console.log('[TransferPopup] cancelCreateToAccount'); isCreatingToAccount.value = false; newToAccountName.value = ''; };
const saveNewToAccount = async () => {
  const name = newToAccountName.value.trim();
  console.log(`[TransferPopup] saveNewToAccount: Сохраняю счет (To) '${name}'`);
  if (!name) return;
  
  // 🟢 v9.0 (Шаг 6): Определяем владельца для нового счета
  let cId = null;
  let iId = null;
  if (selectedToOwner.value) {
      const [type, id] = selectedToOwner.value.split('-');
      if (type === 'company') cId = id;
      if (type === 'individual') iId = id;
  }

  const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    toAccountId.value = existing._id;
    onToAccountSelected(existing._id);
  } else {
    try {
      const newItem = await mainStore.addAccount({ name: name, companyId: cId, individualId: iId });
      toAccountId.value = newItem._id;
      onToAccountSelected(newItem._id);
    } catch (e) { console.error('Ошибка создания счета (To):', e); }
  }
  cancelCreateToAccount(); 
};

// 🔴 v9.0 (Шаг 6): `showFromCompanyInput` / `saveNewFromCompany` / `showToCompanyInput` / `saveNewToCompany` УДАЛЕНЫ.
// --- КОНЕЦ v4.1 ---

// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ: Логика _getDateKey (v4.2) ---
// =================================================================
// Эти helpers нужны для `handleSave`
const _getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000); // 60 * 1000 = 60000
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
// --- 🟢 v9.0 (Шаг 6): Логика Сохранения ---
// =================================================================

// 🔴 НОВЫЙ HELPER (ОШИБКА #2)
// Эта функция запускает синхронизацию в фоне, не блокируя UI
const syncState = async (dateKey, oldDateKey = null) => {
  try {
    console.log(`[TransferPopup] syncState (async): 🔄 ФОНОВАЯ СИНХРОНИЗАЦИЯ для ${dateKey}...`);
    
    await mainStore.refreshDay(dateKey);
    if (oldDateKey && oldDateKey !== dateKey) {
      console.log(`[TransferPopup] syncState (async): 🔄 Обновляю также старый день ${oldDateKey}`);
      await mainStore.refreshDay(oldDateKey);
    }
    
    console.log(`[TransferPopup] syncState (async): 🔄 Обновляю все сущности (балансы)...`);
    await mainStore.fetchAllEntities();
    
    mainStore.displayCache = { ...mainStore.displayCache };
    mainStore.calculationCache = { ...mainStore.calculationCache };
    
    console.log(`[TransferPopup] syncState (async): ✅ ФОНОВАЯ СИНХРОНИЗАЦИЯ для ${dateKey} ЗАВЕРШЕНА.`);

  } catch (e) {
    console.error('❌ Ошибка фоновой синхронизации TransferPopup:', e);
  }
};


const handleSave = async () => {
  console.log('[TransferPopup] handleSave: НАЧАТО сохранение...');
  errorMessage.value = '';
  
  const cleanedAmount = (amountInput.value?.value || amount.value).replace(/ /g, '');
  const amountParsed = parseFloat(cleanedAmount);

  // Валидация
  if (isNaN(amountParsed) || amountParsed <= 0) {
    errorMessage.value = 'Введите корректную сумму';
    console.warn('[TransferPopup] handleSave: Ошибка валидации: Некорректная сумма');
    return;
  }
  if (!fromAccountId.value || !toAccountId.value) {
    errorMessage.value = 'Выберите счета отправителя и получателя';
    console.warn('[TransferPopup] handleSave: Ошибка валидации: Счета не выбраны');
    return;
  }
  if (fromAccountId.value === toAccountId.value) {
    errorMessage.value = 'Счета не должны совпадать';
    console.warn('[TransferPopup] handleSave: Ошибка валидации: Счета совпадают');
    return;
  }

  try {
    const [year, month, day] = editableDate.value.split('-').map(Number);
    const finalDate = new Date(year, month - 1, day, 12, 0, 0); // 12:00
    const dateKey = _getDateKey(finalDate);
    console.log(`[TransferPopup] handleSave: Дата операции: ${finalDate.toISOString()}, dateKey: ${dateKey}`);

    // 🟢 v9.0 (Шаг 6): Парсим selectedOwner'ов
    let fromCompanyId = null, fromIndividualId = null;
    if (selectedFromOwner.value) {
      const [type, id] = selectedFromOwner.value.split('-');
      if (type === 'company') fromCompanyId = id;
      else if (type === 'individual') fromIndividualId = id;
    }
    
    let toCompanyId = null, toIndividualId = null;
    if (selectedToOwner.value) {
      const [type, id] = selectedToOwner.value.split('-');
      if (type === 'company') toCompanyId = id;
      else if (type === 'individual') toIndividualId = id;
    }
    // ---

    const transferPayload = {
        date: finalDate,
        amount: amountParsed,
        fromAccountId: fromAccountId.value,
        toAccountId: toAccountId.value, 
        fromCompanyId: fromCompanyId, // 🟢 v9.0
        toCompanyId: toCompanyId, // 🟢 v9.0
        fromIndividualId: fromIndividualId, // 🟢 v9.0
        toIndividualId: toIndividualId, // 🟢 v9.0
        categoryId: categoryId.value
    };

    let savedOperation;
    const oldDateKey = props.transferToEdit ? props.transferToEdit.dateKey : null;

    if (!props.transferToEdit || isCloneMode.value) {
      console.log('[TransferPopup] handleSave: РЕЖИМ СОЗДАНИЯ/КЛОНИРОВАНИЯ');
      savedOperation = await mainStore.createTransfer(transferPayload);
    } else {
      console.log(`[TransferPopup] handleSave: РЕЖИМ РЕДАКТИРОВАНИЯ (ID: ${props.transferToEdit._id})`);
      savedOperation = await mainStore.updateTransfer(
        props.transferToEdit._id, 
        transferPayload
      );
    }
    
    console.log('✅ TransferPopup: Перевод сохранен. Закрываю попап...');
    emit('transfer-complete', { 
      dateKey: savedOperation?.dateKey || dateKey,
      operation: savedOperation 
    });
    emit('close');

    syncState(dateKey, oldDateKey); // Вызов БЕЗ await

  } catch (error) { 
    console.error('❌ Ошибка при сохранении перевода:', error);
    errorMessage.value = 'Ошибка при сохранении. Попробуйте снова.';
  }
};
// =================================================================

const closePopup = () => { 
  console.log('[TransferPopup] closePopup: 🛑 Закрытие попапа (через overlay или отмену)');
  emit('close'); 
};
</script>

<template>
  <div class="popup-overlay" @click.self="closePopup">
    <div class="popup-content theme-edit">
      
      <h3>{{ title }}</h3>

      <!-- 
        // =================================================================
        // --- 🟢 v9.0 (Шаг 6): Блок "Перевод" (БЕЗ "Smart Create" модала) ---
        // =================================================================
      -->
      <template v-if="!showCreateOwnerModal">
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
        
        <label>Со счета *</label>
        <select 
          v-if="!isCreatingFromAccount" 
          v-model="fromAccountId" 
          @change="e => {
            if (e.target.value === '--CREATE_NEW--') showFromAccountInput();
            else onFromAccountSelected(e.target.value);
          }" 
          class="form-select"
        >
          <option :value="null" disabled>Выберите счет</option>
          <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">
            {{ acc.name }}
          </option>
          <option value="--CREATE_NEW--">[ + Создать новый счет ]</option>
        </select>
        <div v-else class="inline-create-form">
          <input type="text" v-model="newFromAccountName" placeholder="Название счета (От)" ref="newFromAccountInput" @keyup.enter="saveNewFromAccount" @keyup.esc="cancelCreateFromAccount" />
          <button @click="saveNewFromAccount" class="btn-inline-save">✓</button>
          <button @click="cancelCreateFromAccount" class="btn-inline-cancel">X</button>
        </div>
        
        <!-- 🟢 v9.0 (Шаг 6): ЗАМЕНЕННЫЙ БЛОК "ВЛАДЕЛЕЦ (ОТПРАВИТЕЛЬ)" -->
        <label>Компании/Физлица (Отправитель)</label>
        <select 
          v-model="selectedFromOwner" 
          @change="e => {
            if (e.target.value === '--CREATE_NEW--') openCreateOwnerModal('from');
          }" 
          class="form-select"
        >
          <option :value="null">Автоматически</option>
          <optgroup label="Компании">
            <option v-for="comp in mainStore.companies" :key="comp._id" :value="`company-${comp._id}`">{{ comp.name }}</option>
          </optgroup>
          <optgroup label="Физлица">
            <option v-for="ind in mainStore.individuals" :key="ind._id" :value="`individual-${ind._id}`">{{ ind.name }}</option>
          </optgroup>
          <option value="--CREATE_NEW--">[ + Создать... ]</option>
        </select>
        <!-- (Старый inline-create компании удален) -->

        <label>На счет *</label>
        <select 
          v-if="!isCreatingToAccount" 
          v-model="toAccountId" 
          @change="e => {
            if (e.target.value === '--CREATE_NEW--') showToAccountInput();
            else onToAccountSelected(e.target.value);
          }" 
          class="form-select"
        >
          <option :value="null" disabled>Выберите счет</option>
          <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">
            {{ acc.name }}
          </option>
          <option value="--CREATE_NEW--">[ + Создать новый счет ]</option>
        </select>
        <div v-else class="inline-create-form">
          <input type="text" v-model="newToAccountName" placeholder="Название счета (Куда)" ref="newToAccountInput" @keyup.enter="saveNewToAccount" @keyup.esc="cancelCreateToAccount" />
          <button @click="saveNewToAccount" class="btn-inline-save">✓</button>
          <button @click="cancelCreateToAccount" class="btn-inline-cancel">X</button>
        </div>
        
        <!-- 🟢 v9.0 (Шаг 6): ЗАМЕНЕННЫЙ БЛОК "ВЛАДЕЛЕЦ (ПОЛУЧАТЕЛЬ)" -->
        <label>Компании/Физлица (Получатель)</label>
        <select 
          v-model="selectedToOwner" 
          @change="e => {
            if (e.target.value === '--CREATE_NEW--') openCreateOwnerModal('to');
          }" 
          class="form-select"
        >
          <option :value="null">Автоматически</option>
          <optgroup label="Компании">
            <option v-for="comp in mainStore.companies" :key="comp._id" :value="`company-${comp._id}`">{{ comp.name }}</option>
          </optgroup>
          <optgroup label="Физлица">
            <option v-for="ind in mainStore.individuals" :key="ind._id" :value="`individual-${ind._id}`">{{ ind.name }}</option>
          </optgroup>
          <option value="--CREATE_NEW--">[ + Создать... ]</option>
        </select>
        <!-- (Старый inline-create компании удален) -->
        
        <label>Категория</label>
        <select 
          v-if="!isCreatingCategory"
          v-model="categoryId" 
          @change="e => {
            if (e.target.value === '--CREATE_NEW--') showCategoryInput();
            else categoryId = e.target.value;
          }"
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


        <label>Дата поступления денег</label>
        <!-- 🟢 UPDATED (v12.0): Добавлены :min и :max -->
        <input 
          type="date" 
          v-model="editableDate" 
          class="form-input"
          :min="minDateString"
          :max="maxDateString"
        />

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

        <div class="popup-actions-row">
          <button @click="handleSave" class="btn-submit save-wide" :class="buttonText === 'Сохранить' ? 'btn-submit-edit' : 'btn-submit-transfer'">
            {{ buttonText }}
          </button>

          <div v-if="props.transferToEdit && !isCloneMode.value" class="icon-actions">
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
      </template>

      <!-- 
        // =================================================================
        // --- 🟢 v9.0 (Шаг 6): Модал "Smart Create" (Вместо inline-create) ---
        // =================================================================
      -->
      <template v-if="showCreateOwnerModal">
        <div class="smart-create-owner">
          <h4 class="smart-create-title">Что вы хотите создать?</h4>
          
          <div class="smart-create-tabs">
            <button 
              :class="{ active: ownerTypeToCreate === 'company' }"
              @click="setOwnerTypeToCreate('company')">
              Компанию
            </button>
            <button 
              :class="{ active: ownerTypeToCreate === 'individual' }"
              @click="setOwnerTypeToCreate('individual')">
              Физлицо
            </button>
          </div>

          <label>Название</label>
          <input 
            type="text" 
            v-model="newOwnerName" 
            :placeholder="ownerTypeToCreate === 'company' ? 'Название компании' : 'Имя Физлица'" 
            ref="newOwnerInputRef"
            class="form-input"
            @keyup.enter="saveNewOwner"
            @keyup.esc="cancelCreateOwner"
          />

          <div class="smart-create-actions">
            <button @click="cancelCreateOwner" class="btn-submit btn-submit-secondary">
              Отмена
            </button>
            <button @click="saveNewOwner" class="btn-submit btn-submit-edit">
              Создать
            </button>
          </div>
        </div>
      </template>
      
    </div>
  </div>

  <ConfirmationPopup
    v-if="isDeleteConfirmVisible"
    title="Подтвердите удаление"
    message="Вы уверены, что хотите удалить этот перевод?"
    @close="isDeleteConfirmVisible = false"
    @confirm="onDeleteConfirmed"
  />
</template>

<style scoped>
/* (Стили v4.1) */
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
/* (v4.1) Добавлена опция создания */
select option[value="--CREATE_NEW--"] {
  font-style: italic;
  color: #007AFF;
  background-color: #f4f4f4;
}

.theme-edit .form-input:focus,
.theme-edit .form-select:focus {
  outline: none;
  border-color: #222222; 
  box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.2);
}

.error-message {
  color: #FF3B30;
  text-align: center; 
  margin-top: 1rem;
  font-size: 14px;
}

/* (v4.1) Стили для inline-create */
.inline-create-form {
  display: flex;
  align-items: center;
  gap: 8px;
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
  border-color: #222222; 
  box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.2);
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


/* НОВОЕ: Стили для строки действий */
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
.icon-btn:hover { background: #E5E5E5; }
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

/* (v4.1) Изменена кнопка "Добавить" */
.btn-submit-transfer {
  background-color: #2f3340;
}
.btn-submit-transfer:hover {
  background-color: #2f3d6bff;
}

.btn-submit-edit {
  background-color: #222222;
}
.btn-submit-edit:hover {
  background-color: #444444;
}

/* 🟢 v9.0 (Шаг 6): Стили для "Smart Create" */
.smart-create-owner {
  border-top: 1px solid #E0E0E0;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
}
.smart-create-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  text-align: center;
  margin-top: 0;
  margin-bottom: 1.5rem;
}
.smart-create-tabs {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 1.5rem;
}
.smart-create-tabs button {
  flex: 1;
  padding: 12px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  background: #FFFFFF;
  color: #333;
  cursor: pointer;
  transition: all 0.2s;
}
.smart-create-tabs button.active {
  background: #222222;
  color: #FFFFFF;
  border-color: #222222;
}
.smart-create-actions {
  display: flex;
  gap: 10px;
  margin-top: 1rem; /* Отступ перед кнопками */
}
.smart-create-actions .btn-submit {
  flex: 1;
}

/* (Стиль для кнопки "Отмена" в Smart Create) */
.btn-submit-secondary {
  background-color: #e0e0e0;
  color: #333;
  font-weight: 500;
}
.btn-submit-secondary:hover {
  background-color: #d1d1d1;
}
</style>
