<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import BaseSelect from './BaseSelect.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v15.3 - TOOLTIPS ---
 * * ВЕРСИЯ: 15.3
 * * ДАТА: 2025-12-05
 * * ИЗМЕНЕНИЯ:
 * 1. (UI) Добавлены тултипы для счетов.
 */

const mainStore = useMainStore();

const props = defineProps({
  initialData: { type: Object, default: () => ({}) },
  operationToEdit: { type: Object, default: null }
});

const emit = defineEmits(['close', 'save']);

// --- ДАННЫЕ ФОРМЫ ---
const amount = ref(0);
const formattedAmount = ref('');
const reason = ref('Личные нужды');
const isSaving = ref(false);

// Селекты
const fromAccountId = ref(null);
const selectedIndividualId = ref(null); // ID получателя (Физлицо)

// --- Создание нового физлица ---
const isCreatingIndividual = ref(false);
const newIndividualName = ref('');
const newIndividualInputRef = ref(null);

// --- Опции ---
const reasonOptions = [
  { value: 'Личные нужды', label: 'Личные нужды' },
  { value: 'Дивиденды', label: 'Дивиденды' },
  { value: 'Развитие бизнеса (Наличные)', label: 'Развитие бизнеса (Наличные)' },
  { value: 'Другое', label: 'Другое' }
];

// 🟢 1. Хелпер для названия владельца (для Tooltip)
const getOwnerName = (acc) => {
    if (acc.companyId) {
        const cId = (typeof acc.companyId === 'object') ? acc.companyId._id : acc.companyId;
        const c = mainStore.companies.find(comp => comp._id === cId);
        return c ? `Компания: ${c.name}` : 'Компания';
    }
    if (acc.individualId) {
        const iId = (typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
        const i = mainStore.individuals.find(ind => ind._id === iId);
        return i ? `Физлицо: ${i.name}` : 'Физлицо';
    }
    return 'Нет привязки';
};

// Опции счетов (откуда)
const accountOptions = computed(() => {
  return mainStore.currentAccountBalances.map(acc => ({
    value: acc._id,
    label: acc.name,
    rightText: `${formatNumber(Math.abs(acc.balance))} ₸`,
    tooltip: getOwnerName(acc), // 🟢 Добавлена подсказка
    isSpecial: false
  }));
});

// Опции Физлиц (Получателей)
const individualOptions = computed(() => {
  // Исключаем системные сущности (Розница) и владельцев счетов (опционально, но пользователь просил просто список)
  const opts = mainStore.individuals
    .filter(i => {
        const name = i.name.toLowerCase().trim();
        return name !== 'розничные клиенты' && name !== 'розница';
    })
    .map(i => ({
        value: i._id,
        label: i.name
    }));
    
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать Физлицо', isSpecial: true });
  return opts;
});

// --- СОСТОЯНИЯ ---
const isCloneMode = ref(false);
const isDeleteConfirmVisible = ref(false);
const editableDate = ref('');

// --- ВЫЧИСЛЯЕМЫЕ СВОЙСТВА ---
const isEditMode = computed(() => !!props.operationToEdit && !isCloneMode.value);

const title = computed(() => {
    if (isCloneMode.value) return 'Копия: Вывод денег';
    if (isEditMode.value) return 'Редактировать Вывод денег';
    return 'Оформление вывода';
});

const btnText = computed(() => {
    if (isSaving.value) return 'Сохранение...';
    if (isCloneMode.value) return 'Создать копию вывода';
    if (isEditMode.value) return 'Сохранить';
    return 'Подтвердить';
});

// --- FORMATTERS ---
const toInputDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const toDisplayDate = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
};

// --- HANDLERS ---
const onAmountInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = Number(raw);
  formattedAmount.value = formatNumber(Number(raw));
};

// Обработка выбора физлица
const handleIndividualChange = (val) => {
    if (val === '--CREATE_NEW--') {
        selectedIndividualId.value = null;
        isCreatingIndividual.value = true;
        nextTick(() => newIndividualInputRef.value?.focus());
    }
};

// Создание физлица
const createIndividual = async () => {
    const name = newIndividualName.value.trim();
    if (!name) return;
    try {
        const newInd = await mainStore.addIndividual(name);
        selectedIndividualId.value = newInd._id;
        isCreatingIndividual.value = false;
        newIndividualName.value = '';
    } catch (e) {
        alert('Ошибка создания: ' + e.message);
    }
};

const cancelCreateIndividual = () => {
    isCreatingIndividual.value = false;
    newIndividualName.value = '';
};

const handleSave = async () => {
  if (amount.value <= 0 || isSaving.value || !fromAccountId.value) {
      return;
  }
  
  if (!selectedIndividualId.value) {
      alert('Выберите получателя (Физлицо)');
      return;
  }
  
  isSaving.value = true;
  
  const [year, month, day] = editableDate.value.split('-').map(Number);
  const finalDate = new Date(year, month - 1, day, 12, 0, 0);

  // 1. Находим или создаем категорию "Вывод средств"
  let withdrawalCat = mainStore.categories.find(c => {
      const n = c.name.toLowerCase().trim();
      return n === 'вывод средств' || n === 'вывод' || n === 'withdrawal';
  });
  
  if (!withdrawalCat) {
      try {
          withdrawalCat = await mainStore.addCategory('Вывод средств');
      } catch (e) {
          console.error("Failed to create category", e);
      }
  }

  const payload = {
    amount: amount.value,
    destination: reason.value, 
    reason: reason.value,
    description: reason.value, 
    type: 'expense', 
    isWithdrawal: true,
    accountId: fromAccountId.value,
    date: finalDate,
    categoryId: withdrawalCat ? withdrawalCat._id : null,
    counterpartyIndividualId: selectedIndividualId.value,
    individualId: null,
    contractorId: null
  };

  const mode = (!isEditMode.value || isCloneMode.value) ? 'create' : 'edit';
  const opId = (mode === 'edit') ? props.operationToEdit._id : null;

  emit('save', {
    mode,
    id: opId,
    data: payload,
    originalOperation: props.operationToEdit
  });

  // Fallback
  setTimeout(() => { isSaving.value = false; }, 3000);
};

// --- ДЕЙСТВИЯ ---
const handleCopy = () => {
    isCloneMode.value = true;
    editableDate.value = toInputDate(new Date());
    nextTick(() => {
        document.querySelector('.wd-amount')?.focus();
    });
};

const handleDeleteClick = () => {
    isDeleteConfirmVisible.value = true;
};

// Мгновенное удаление БЕЗ полной перезагрузки
const confirmDelete = () => {
    if (!props.operationToEdit?._id) return;

    isDeleteConfirmVisible.value = false;
    emit('close'); 

    mainStore.deleteOperation(props.operationToEdit)
        .catch(e => {
            console.error("Ошибка при фоновом удалении вывода:", e);
        });
};

onMounted(() => {
  if (props.operationToEdit) {
      const op = props.operationToEdit;
      amount.value = Math.abs(op.amount || 0);
      fromAccountId.value = op.accountId?._id || op.accountId;
      reason.value = op.reason || op.description || 'Личные нужды';
      selectedIndividualId.value = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
      editableDate.value = toInputDate(new Date(op.date));
  } else {
      amount.value = props.initialData.amount || 0;
      fromAccountId.value = props.initialData.fromAccountId || null;
      editableDate.value = toInputDate(new Date());
  }
  
  formattedAmount.value = formatNumber(amount.value);
  nextTick(() => document.querySelector('.wd-amount')?.focus());
});
</script>

<template>
  <div class="withdrawal-overlay" @mousedown.self="$emit('close')">
    <div class="withdrawal-content">
      
      <h3>{{ title }}</h3>
      
      <div class="wd-info-box" v-if="!isEditMode && !isCloneMode && initialData.fromAccountName">
        Вывод средств со счета <b>{{ initialData.fromAccountName }}</b>.
      </div>
      
      <!-- СУММА -->
      <div class="custom-input-box input-spacing" :class="{ 'has-value': !!amount }">
          <div class="input-inner-content">
             <span v-if="amount" class="floating-label">Сумма к выводу, ₸</span>
             <input 
               type="text" 
               v-model="formattedAmount" 
               @input="onAmountInput"
               class="wd-input wd-amount" 
               placeholder="Сумма вывода ₸"
             >
          </div>
      </div>
      
      <!-- СЧЕТ СПИСАНИЯ -->
      <BaseSelect
        v-model="fromAccountId"
        :options="accountOptions"
        label="Счет списания"
        placeholder="Откуда (Счет)"
        class="input-spacing"
      />

      <!-- ПОЛУЧАТЕЛЬ (ФИЗЛИЦО) -->
      <template v-if="!isCreatingIndividual">
          <BaseSelect
            v-model="selectedIndividualId"
            :options="individualOptions"
            label="Получатель (Физлицо)"
            placeholder="Выберите получателя"
            class="input-spacing"
            @change="handleIndividualChange"
          />
      </template>
      <div v-else class="inline-create-form input-spacing">
          <input type="text" v-model="newIndividualName" placeholder="Имя нового физлица" ref="newIndividualInputRef" class="create-input" @keyup.enter="createIndividual" @keyup.esc="cancelCreateIndividual" />
          <button @click="createIndividual" class="btn-icon-save" :disabled="isSaving">✓</button>
          <button @click="cancelCreateIndividual" class="btn-icon-cancel" :disabled="isSaving">✕</button>
      </div>

      <!-- ПРИЧИНА -->
      <BaseSelect
        v-model="reason"
        :options="reasonOptions"
        label="Причина / Цель"
        placeholder="Выберите причину"
        class="input-spacing"
      />

      <!-- ДАТА -->
      <div class="custom-input-box input-spacing has-value date-box">
         <div class="input-inner-content">
             <span class="floating-label">Дата вывода</span>
             <div class="date-display-row">
                 <span class="date-value-text">{{ toDisplayDate(editableDate) }}</span>
                 <input 
                   type="date" 
                   v-model="editableDate" 
                   class="date-overlay"
                 />
                 <span class="calendar-icon">📅</span>
             </div>
         </div>
      </div>

      <!-- ФУТЕР -->
      <div class="popup-actions-row">
        <button 
          class="btn-submit save-wide wd-btn-confirm" 
          @click="handleSave" 
          :disabled="amount <= 0 || isSaving || !fromAccountId || !selectedIndividualId"
        >
          {{ btnText }}
        </button>

        <div class="icon-actions" v-if="isEditMode">
            <button class="icon-btn copy-btn" title="Копировать" @click="handleCopy" :disabled="isSaving">
              <svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg>
            </button>
            <button class="icon-btn delete-btn" title="Удалить" @click="handleDeleteClick" :disabled="isSaving">
              <svg class="icon-stroke" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        </div>
      </div>
      
    </div>

    <!-- ПОПАП УДАЛЕНИЯ -->
    <ConfirmationPopup 
        v-if="isDeleteConfirmVisible" 
        title="Удаление вывода" 
        message="Вы действительно хотите удалить этот вывод? Средства вернутся на баланс." 
        confirmText="Удалить"
        @close="isDeleteConfirmVisible = false" 
        @confirm="confirmDelete" 
    />
  </div>
</template>

<style scoped>
.withdrawal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.6);
  display: flex; justify-content: center; align-items: center;
  z-index: 3000; 
  backdrop-filter: blur(2px);
}
.withdrawal-content {
  background: #F4F4F4; 
  padding: 2rem; 
  border-radius: 12px; 
  width: 100%; 
  max-width: 420px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  margin: 2rem 1rem;
  display: flex; flex-direction: column; 
}

h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 2rem; text-align: left; font-size: 22px; font-weight: 700; }

.wd-info-box {
  background: #F3E5F5; 
  border: 1px solid #E1BEE7;
  padding: 12px; border-radius: 8px;
  font-size: 13px; color: #4A148C;
  line-height: 1.4; margin-bottom: 1rem;
}

.custom-input-box {
  width: 100%; height: 54px; 
  background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; 
  padding: 0 14px; display: flex; align-items: center; position: relative; transition: all 0.2s ease;
  box-sizing: border-box;
}
.custom-input-box:focus-within { border-color: #7B1FA2; box-shadow: 0 0 0 1px rgba(123, 31, 162, 0.2); }
.custom-input-box:not(.has-value) .wd-input { padding-top: 10px; }

.input-inner-content { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.floating-label { font-size: 11px; color: #999; margin-bottom: -2px; margin-top: 4px; }

.wd-input { 
  width: 100%; border: none; background: transparent; 
  font-size: 15px; color: #1a1a1a; font-weight: 500; outline: none; height: auto; line-height: 1.3;
  padding: 0;
}
.wd-amount { font-weight: 500; font-size: 16px; }

.input-spacing { margin-bottom: 12px; }

.date-box { justify-content: space-between; }
.date-display-row { display: flex; justify-content: space-between; align-items: center; position: relative; width: 100%; }
.date-value-text { font-size: 15px; font-weight: 500; color: #1a1a1a; }
.date-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; z-index: 2; }
.calendar-icon { font-size: 16px; color: #999; }

/* Inline create styles */
.inline-create-form { display: flex; gap: 8px; align-items: center; }
.create-input { flex-grow: 1; height: 48px; padding: 0 10px; border: 1px solid #7B1FA2; border-radius: 6px; font-size: 14px; margin: 0; }
.create-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(123, 31, 162, 0.2); }
.btn-icon-save, .btn-icon-cancel { width: 48px; height: 48px; border: none; border-radius: 6px; cursor: pointer; color: #fff; font-size: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.btn-icon-save { background-color: #34C759; }
.btn-icon-cancel { background-color: #FF3B30; }

/* Футер */
.popup-actions-row { 
  display: flex; 
  align-items: center; 
  gap: 10px; 
  margin-top: 2rem; 
}

.save-wide { flex: 1 1 auto; height: 54px; }
.icon-actions { display: flex; gap: 10px; }

.wd-btn-confirm { 
  padding: 0 1rem; height: 50px; border: none; 
  background: #7B1FA2; color: #fff; 
  border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 16px;
  transition: background 0.2s; 
}
.wd-btn-confirm:hover:not(:disabled) { background: #6A1B9A; }
.wd-btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }

.icon-btn { 
  display: inline-flex; align-items: center; justify-content: center; 
  width: 54px; height: 54px; border-radius: 10px; cursor: pointer; 
  background: #F4F4F4; border: 1px solid #E0E0E0; color: #333;
  transition: all 0.2s; padding: 0;
}
.copy-btn:hover { background: #E8F5E9; border-color: #A5D6A7; color: #34C759; }
.delete-btn:hover { background: #FFF0F0; border-color: #FFD0D0; color: #FF3B30; }
.delete-btn:hover .icon-stroke { stroke: #FF3B30; }
.icon { width: 70%; height: 70%; fill: currentColor; display: block; pointer-events: none; }
.icon-stroke { width: 20px; height: 20px; stroke: #333; fill: none; transition: stroke 0.2s; }
</style>