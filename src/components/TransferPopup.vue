<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import axios from 'axios';
import { useMainStore } from '@/stores/mainStore';
import ConfirmationPopup from './ConfirmationPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v4.2-YEAR-AWARE-FIX ---
 * * ВЕРСИЯ: 4.2 - Исправление "слепоты к году" (dayOfYear -> dateKey)
 * ДАТА: 2025-11-10
 *
 * ИСПРАВЛЕНИЯ:
 * 1. (ARCH) Добавлены helpers `_getDayOfYear` и `_getDateKey`.
 * 2. (ARCH) `handleSave` теперь вычисляет и использует `dateKey` ("YYYY-DOY").
 * 3. (API) `handleSave` (для create/update) теперь вызывает `mainStore`
 * с `dateKey` (строкой), исправляя ошибку `dateKey.split is not a function`.
 * 4. (API) `onDeleteConfirmed` теперь использует `operation.dateKey`.
 * 5. (FIX) `handleCopyClick` сбрасывает дату на `props.date` (дату ячейки).
 */

const mainStore = useMainStore();
const props = defineProps({
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  transferToEdit: { type: Object, default: null }
});

const emit = defineEmits(['close', 'transfer-complete']);

// --- Данные для полей ---
const amount = ref('');
const fromAccountId = ref(null);
const fromCompanyId = ref(null);
const toAccountId = ref(null);
const toCompanyId = ref(null);
const categoryId = ref(null);

const toInputDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const editableDate = ref(toInputDate(props.date));
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
const isCreatingFromCompany = ref(false);
const newFromCompanyName = ref('');
const newFromCompanyInput = ref(null);
const isCreatingToCompany = ref(false);
const newToCompanyName = ref('');
const newToCompanyInput = ref(null);
const isCreatingCategory = ref(false);
const newCategoryName = ref('');
const newCategoryInput = ref(null);

// --- Форматирование суммы (без изменений) ---
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

// --- Автоматическая привязка компании (без изменений) ---
const onFromAccountSelected = (accountId) => {
  const selectedAccount = mainStore.accounts.find(acc => acc._id === accountId);
  if (selectedAccount && selectedAccount.companyId) {
    const cId = typeof selectedAccount.companyId === 'object'
      ? selectedAccount.companyId._id
      : selectedAccount.companyId;
    fromCompanyId.value = cId;
  }
};

const onToAccountSelected = (accountId) => {
  const selectedAccount = mainStore.accounts.find(acc => acc._id === accountId);
  if (selectedAccount && selectedAccount.companyId) {
    const cId = typeof selectedAccount.companyId === 'object'
      ? selectedAccount.companyId._id
      : selectedAccount.companyId;
    toCompanyId.value = cId;
  }
};

// --- Заполнение полей при редактировании ---
onMounted(async () => {
  // Находим категорию "Перевод"
  let transferCategory = mainStore.categories.find(c => c.name.toLowerCase() === 'перевод');
  if (!transferCategory) {
    // (Гарантируем, что _getOrCreateTransferCategory будет вызван, если категории нет)
    // Либо mainStore.addCategory, если уверены, что он существует
    try {
        transferCategory = await mainStore.addCategory('Перевод');
    } catch (e) { console.error("Не удалось создать категорию 'Перевод'", e)}
  }
  // Устанавливаем ID по умолчанию
  const defaultCategoryId = transferCategory ? transferCategory._id : null;

  // Если редактируем существующий перевод
  if (props.transferToEdit) {
    const transfer = props.transferToEdit;
    amount.value = formatNumber(Math.abs(transfer.amount));
    fromAccountId.value = transfer.fromAccountId?._id || transfer.fromAccountId;
    toAccountId.value = transfer.toAccountId?._id || transfer.toAccountId;
    
    if (fromAccountId.value) {
      onFromAccountSelected(fromAccountId.value);
    }
    if (toAccountId.value) {
      onToAccountSelected(toAccountId.value);
    }

    if (!fromCompanyId.value) {
      fromCompanyId.value = transfer.fromCompanyId?._id || transfer.fromCompanyId;
    }
    if (!toCompanyId.value) {
      toCompanyId.value = transfer.toCompanyId?._id || transfer.toCompanyId;
    }
    
    // (v4.1) Устанавливаем категорию из операции, если она есть, иначе - "Перевод"
    categoryId.value = transfer.categoryId?._id || defaultCategoryId;

    // 🔴 ИЗМЕНЕНО: Используем 'transfer.date' (mainStore v4.2 теперь это гарантирует)
    if (transfer.date) {
      editableDate.value = toInputDate(new Date(transfer.date));
    }
  } else {
    // Устанавливаем категорию "Перевод" для нового
    categoryId.value = defaultCategoryId;
    
    // Автофокус для нового перевода
    setTimeout(() => {
      if (amountInput.value) amountInput.value.focus();
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
  isDeleteConfirmVisible.value = true;
};

const onDeleteConfirmed = async () => {
  try {
    if (!props.transferToEdit?._id) return;
    
    // 🔴 ИЗМЕНЕНО: Используем mainStore.deleteOperation
    await mainStore.deleteOperation(props.transferToEdit);
    
    // 🔴 ИЗМЕНЕНО: Отправляем dateKey
    emit('transfer-complete', { dateKey: props.transferToEdit.dateKey });
    emit('close');
  } catch (e) {
    console.error('Ошибка при удалении перевода', e);
  } finally {
    isDeleteConfirmVisible.value = false;
  }
};

const handleCopyClick = () => {
  isCloneMode.value = true;
  // 🔴 ИЗМЕНЕНО: Сбрасываем дату на дату ячейки
  editableDate.value = toInputDate(props.date); 
  nextTick(() => { amountInput.value?.focus(); });
};
// =================================================================


// =================================================================
// --- 🔴 v4.1: Функции Inline-Create (без изменений) ---
// =================================================================
const showCategoryInput = () => { isCreatingCategory.value = true; nextTick(() => newCategoryInput.value?.focus()); };
const cancelCreateCategory = () => { isCreatingCategory.value = false; newCategoryName.value = ''; };
const saveNewCategory = async () => {
  const name = newCategoryName.value.trim();
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
const showFromAccountInput = () => { isCreatingFromAccount.value = true; nextTick(() => newFromAccountInput.value?.focus()); };
const cancelCreateFromAccount = () => { isCreatingFromAccount.value = false; newFromAccountName.value = ''; };
const saveNewFromAccount = async () => {
  const name = newFromAccountName.value.trim();
  if (!name) return;

  const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    fromAccountId.value = existing._id;
    onFromAccountSelected(existing._id);
  } else {
    try {
      const newItem = await mainStore.addAccount({ name: name, companyId: fromCompanyId.value });
      fromAccountId.value = newItem._id;
      onFromAccountSelected(newItem._id);
    } catch (e) { console.error('Ошибка создания счета (From):', e); }
  }
  cancelCreateFromAccount(); 
};

const showFromCompanyInput = () => { isCreatingFromCompany.value = true; nextTick(() => newFromCompanyInput.value?.focus()); };
const cancelCreateFromCompany = () => { isCreatingFromCompany.value = false; newFromCompanyName.value = ''; };
const saveNewFromCompany = async () => {
  const name = newFromCompanyName.value.trim();
  if (!name) return;
  
  const existing = mainStore.companies.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    fromCompanyId.value = existing._id;
  } else {
    try {
      const newItem = await mainStore.addCompany(name);
      fromCompanyId.value = newItem._id;
    } catch (e) { console.error(e); }
  }
  cancelCreateFromCompany();
};

// --- "TO" ---
const showToAccountInput = () => { isCreatingToAccount.value = true; nextTick(() => newToAccountInput.value?.focus()); };
const cancelCreateToAccount = () => { isCreatingToAccount.value = false; newToAccountName.value = ''; };
const saveNewToAccount = async () => {
  const name = newToAccountName.value.trim();
  if (!name) return;

  const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    toAccountId.value = existing._id;
    onToAccountSelected(existing._id);
  } else {
    try {
      const newItem = await mainStore.addAccount({ name: name, companyId: toCompanyId.value });
      toAccountId.value = newItem._id;
      onToAccountSelected(newItem._id);
    } catch (e) { console.error('Ошибка создания счета (To):', e); }
  }
  cancelCreateToAccount(); 
};

const showToCompanyInput = () => { isCreatingToCompany.value = true; nextTick(() => newToCompanyInput.value?.focus()); };
const cancelCreateToCompany = () => { isCreatingToCompany.value = false; newToCompanyName.value = ''; };
const saveNewToCompany = async () => {
  const name = newToCompanyName.value.trim();
  if (!name) return;
  
  const existing = mainStore.companies.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    toCompanyId.value = existing._id;
  } else {
    try {
      const newItem = await mainStore.addCompany(name);
      toCompanyId.value = newItem._id;
    } catch (e) { console.error(e); }
  }
  cancelCreateToCompany();
};
// --- КОНЕЦ v4.1 ---


// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ: Helpers для handleSave (v4.2) ---
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
// --- 🔴 ИСПРАВЛЕНИЕ: Логика Сохранения (v4.2) ---
// =================================================================
const handleSave = async () => {
  errorMessage.value = '';
  
  const cleanedAmount = (amountInput.value?.value || amount.value).replace(/ /g, '');
  const amountParsed = parseFloat(cleanedAmount);

  // Валидация (без изменений)
  if (isNaN(amountParsed) || amountParsed <= 0) {
    errorMessage.value = 'Введите корректную сумму';
    return;
  }
  if (!fromAccountId.value || !toAccountId.value) {
    errorMessage.value = 'Выберите счета отправителя и получателя';
    return;
  }
  if (fromAccountId.value === toAccountId.value) {
    errorMessage.value = 'Счета не должны совпадать';
    return;
  }

  try {
    const [year, month, day] = editableDate.value.split('-').map(Number);
    const finalDate = new Date(year, month - 1, day);
    
    // 🔴 ИЗМЕНЕНО: Вычисляем dateKey
    const dateKey = _getDateKey(finalDate);

    const transferPayload = {
        date: finalDate, // (mainStore v4.2 ожидает 'date' в payload)
        amount: amountParsed,
        fromAccountId: fromAccountId.value,
        toAccountId: toAccountId.value,
        fromCompanyId: fromCompanyId.value,
        toCompanyId: toCompanyId.value,
        categoryId: categoryId.value
    };

    let savedOperation;

    // Если это клонирование или новый перевод
    if (!props.transferToEdit || isCloneMode.value) {
      // 🔴 ИЗМЕНЕНО: Вызываем createTransfer (он 'year-aware')
      savedOperation = await mainStore.createTransfer(transferPayload);
    } else {
      // 🔴 ИЗМЕНЕНО: Вызываем updateTransfer (он 'year-aware')
      savedOperation = await mainStore.updateTransfer(
        props.transferToEdit._id, 
        transferPayload
      );
    }

    // 🔴 ИЗМЕНЕНО: mainStore.refreshDay и fetchAllEntities
    // УЖЕ вызываются ВНУТРИ createTransfer/updateTransfer.
    // Повторный вызов не нужен.
    
    // await mainStore.refreshDay(dayOfYear); // (УДАЛЕНО - дубликат)
    // await mainStore.fetchAllEntities(); // (УДАЛЕНО - дубликат)
    
    // 🔴 ИЗМЕНЕНО: Отправляем dateKey
    emit('transfer-complete', { dateKey: savedOperation.dateKey || dateKey });

  } catch (error) { 
    console.error('Ошибка при сохранении перевода:', error);
    errorMessage.value = 'Ошибка при сохранении. Попробуйте снова.';
  }
};
// =================================================================

const closePopup = () => { 
  emit('close'); 
};
</script>

<template>
  <div class="popup-overlay" @click.self="closePopup">
    <div class="popup-content theme-edit">
      
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
      
      <label>Мои компании (Отправитель)</label>
      <select 
        v-if="!isCreatingFromCompany" 
        v-model="fromCompanyId" 
        @change="e => {
          if (e.target.value === '--CREATE_NEW--') showFromCompanyInput();
          else fromCompanyId = e.target.value;
        }" 
        class="form-select"
      >
        <option :value="null">Без компании</option>
        <option v-for="comp in mainStore.companies" :key="comp._id" :value="comp._id">
          {{ comp.name }}
        </option>
        <option value="--CREATE_NEW--">[ + Создать новую компанию ]</option>
      </select>
      <div v-else class="inline-create-form">
        <input type="text" v-model="newFromCompanyName" placeholder="Название компании (От)" ref="newFromCompanyInput" @keyup.enter="saveNewFromCompany" @keyup.esc="cancelCreateFromCompany" />
        <button @click="saveNewFromCompany" class="btn-inline-save">✓</button>
        <button @click="cancelCreateFromCompany" class="btn-inline-cancel">X</button>
      </div>

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
      
      <label>Мои компании (Получатель)</label>
      <select 
        v-if="!isCreatingToCompany" 
        v-model="toCompanyId" 
        @change="e => {
          if (e.target.value === '--CREATE_NEW--') showToCompanyInput();
          else toCompanyId = e.target.value;
        }" 
        class="form-select"
      >
        <option :value="null">Без компании</option>
        <option v-for="comp in mainStore.companies" :key="comp._id" :value="comp._id">
          {{ comp.name }}
        </option>
        <option value="--CREATE_NEW--">[ + Создать новую компанию ]</option>
      </select>
      <div v-else class="inline-create-form">
        <input type="text" v-model="newToCompanyName" placeholder="Название компании (Куда)" ref="newToCompanyInput" @keyup.enter="saveNewToCompany" @keyup.esc="cancelCreateToCompany" />
        <button @click="saveNewToCompany" class="btn-inline-save">✓</button>
        <button @click="cancelCreateToCompany" class="btn-inline-cancel">X</button>
      </div>
      
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
      <input type="date" v-model="editableDate" class="form-input" />

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
/* (Стили я не менял, они идентичны твоим из v4.1) */
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
</style>