<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import BaseSelect from './BaseSelect.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v13.0 - STRICT RECIPIENT CREATE ---
 * * ВЕРСИЯ: 13.0 - Убран ручной ввод, добавлено создание Физлица/Контрагента
 * * ДАТА: 2025-11-25
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (UI) Удален режим "Ввести вручную". Только селект.
 * 2. (FEAT) В селект добавлены опции "+ Создать Физлицо", "+ Создать Контрагента".
 * 3. (LOGIC) При выборе создания открывается модалка, создается сущность и выбирается.
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
const selectedDestinationValue = ref(null); 

// --- ЛОГИКА СОЗДАНИЯ ПОЛУЧАТЕЛЯ ---
const showCreateRecipientModal = ref(false);
const recipientTypeToCreate = ref('individual'); // 'individual' | 'contractor'
const newRecipientName = ref('');
const newRecipientInputRef = ref(null);
const isSavingRecipient = ref(false);

// --- Опции ---
const reasonOptions = [
  { value: 'Личные нужды', label: 'Личные нужды' },
  { value: 'Дивиденды', label: 'Дивиденды' },
  { value: 'Развитие бизнеса (Наличные)', label: 'Развитие бизнеса (Наличные)' },
  { value: 'Другое', label: 'Другое' }
];

// Опции счетов (откуда)
const accountOptions = computed(() => {
  return mainStore.currentAccountBalances.map(acc => ({
    value: acc._id,
    label: acc.name,
    rightText: `${formatNumber(Math.abs(acc.balance))} ₸`,
    isSpecial: false
  }));
});

// Опции получателей (куда)
const destinationOptions = computed(() => {
    const opts = [];
    
    // Счета (кроме текущего)
    mainStore.accounts.forEach(acc => {
        if (acc._id !== fromAccountId.value) {
            opts.push({ value: `acc_${acc._id}`, label: acc.name, rightText: 'Счет', isSpecial: false });
        }
    });

    // Физлица
    mainStore.individuals.forEach(ind => {
        opts.push({ value: `ind_${ind._id}`, label: ind.name, rightText: 'Физлицо', isSpecial: false });
    });

    // Контрагенты
    mainStore.contractors.forEach(c => {
        opts.push({ value: `contr_${c._id}`, label: c.name, rightText: 'Контрагент', isSpecial: false });
    });
    
    // Опции создания
    opts.push({ value: 'create-ind', label: '+ Создать Физлицо', isSpecial: true });
    opts.push({ value: 'create-contr', label: '+ Создать Контрагента', isSpecial: true });
    
    return opts;
});

// Следим за выбором создания
watch(selectedDestinationValue, (val) => {
    if (val === 'create-ind') {
        selectedDestinationValue.value = null;
        openCreateRecipient('individual');
    } else if (val === 'create-contr') {
        selectedDestinationValue.value = null;
        openCreateRecipient('contractor');
    }
});

const openCreateRecipient = (type) => {
    recipientTypeToCreate.value = type;
    newRecipientName.value = '';
    showCreateRecipientModal.value = true;
    nextTick(() => { if(newRecipientInputRef.value) newRecipientInputRef.value.focus(); });
};

const cancelCreateRecipient = () => {
    showCreateRecipientModal.value = false;
    newRecipientName.value = '';
};

const saveNewRecipient = async () => {
    const name = newRecipientName.value.trim();
    if (!name) return;
    isSavingRecipient.value = true;
    try {
        let newItem = null;
        if (recipientTypeToCreate.value === 'individual') {
            newItem = await mainStore.addIndividual(name);
            selectedDestinationValue.value = `ind_${newItem._id}`;
        } else {
            newItem = await mainStore.addContractor(name);
            selectedDestinationValue.value = `contr_${newItem._id}`;
        }
        cancelCreateRecipient();
    } catch (e) {
        console.error(e);
    } finally {
        isSavingRecipient.value = false;
    }
};

// --- СОСТОЯНИЯ ---
const isCloneMode = ref(false);
const isDeleteConfirmVisible = ref(false);
const isDeleting = ref(false);
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
    if (isCloneMode.value) return 'Создать копию';
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

const handleSave = () => {
  if (amount.value <= 0 || isSaving.value || !fromAccountId.value || !selectedDestinationValue.value) {
      return;
  }
  
  isSaving.value = true;
  
  const [year, month, day] = editableDate.value.split('-').map(Number);
  const finalDate = new Date(year, month - 1, day, 12, 0, 0);

  // Получаем текст из опции для сохранения в destination (для совместимости)
  // НО теперь важно сохранять и ID, если это Физлицо/Контрагент
  const option = destinationOptions.value.find(o => o.value === selectedDestinationValue.value);
  const destText = option ? option.label : 'Неизвестно';
  
  // Парсим ID для сохранения в companyId/individualId/contractorId
  let indId = null, compId = null, contrId = null;
  const [prefix, id] = selectedDestinationValue.value.split('_');
  
  if (prefix === 'ind') indId = id;
  if (prefix === 'contr') contrId = id;
  // Для счетов (acc_) пока просто текст, так как вывод на счет другого лица не линкуется в системе как transfer
  
  const payload = {
    amount: amount.value,
    destination: destText,
    reason: reason.value,
    type: 'expense', 
    isWithdrawal: true,
    accountId: fromAccountId.value,
    date: finalDate,
    individualId: indId,
    contractorId: contrId
  };

  const mode = (!isEditMode.value || isCloneMode.value) ? 'create' : 'edit';
  const opId = (mode === 'edit') ? props.operationToEdit._id : null;

  emit('save', {
    mode,
    id: opId,
    data: payload,
    originalOperation: props.operationToEdit
  });

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

const confirmDelete = async () => {
    if (!props.operationToEdit?._id) return;
    isDeleting.value = true;
    try {
        await mainStore.deleteOperation(props.operationToEdit);
        await mainStore.forceRefreshAll();
        emit('close'); 
    } catch (e) {
        console.error(e);
        alert('Ошибка удаления: ' + e.message);
    } finally {
        isDeleting.value = false;
        isDeleteConfirmVisible.value = false;
    }
};

onMounted(() => {
  if (props.operationToEdit) {
      const op = props.operationToEdit;
      amount.value = Math.abs(op.amount || 0);
      fromAccountId.value = op.accountId?._id || op.accountId;
      reason.value = op.reason || 'Личные нужды';
      editableDate.value = toInputDate(new Date(op.date));
      
      // Восстановление селекта
      if (op.individualId) {
          const iId = op.individualId._id || op.individualId;
          selectedDestinationValue.value = `ind_${iId}`;
      } else if (op.contractorId) {
          const cId = op.contractorId._id || op.contractorId;
          selectedDestinationValue.value = `contr_${cId}`;
      } else {
          // Пробуем найти по тексту destination
          const destText = op.destination || '';
          const found = destinationOptions.value.find(o => o.label === destText);
          if (found) selectedDestinationValue.value = found.value;
      }
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

      <!-- КУДА (СЕЛЕКТ) -->
      <BaseSelect
        v-model="selectedDestinationValue"
        :options="destinationOptions"
        label="Куда (Получатель)"
        placeholder="Выберите получателя"
        class="input-spacing"
      />

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
          :disabled="amount <= 0 || isSaving || !fromAccountId || !selectedDestinationValue"
        >
          {{ btnText }}
        </button>

        <div class="icon-actions" v-if="isEditMode">
            <button class="icon-btn copy-btn" title="Копировать" @click="handleCopy" :disabled="isSaving">
              <svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg>
            </button>
            <button class="icon-btn delete-btn" title="Удалить" @click="handleDeleteClick" :disabled="isSaving">
              <svg class="icon" viewBox="0 0 24 24"><path d="M9 3h6a1 1 0 0 1 1 1v1h5v2H3V5h5V4a1 1 0 0 1 1-1Zm2 6h2v9h-2V9Zm6 0h2v9h-2V9ZM5 9h2v9H5V9Z"/></svg>
            </button>
        </div>
      </div>
      
    </div>

    <!-- МОДАЛКА СОЗДАНИЯ ПОЛУЧАТЕЛЯ -->
    <div v-if="showCreateRecipientModal" class="inner-overlay" @click.self="cancelCreateRecipient">
      <div class="create-recipient-box">
        <h4>Новый получатель</h4>
        <p class="sub-text">
          Создание: <b>{{ recipientTypeToCreate === 'individual' ? 'Физлицо' : 'Контрагент' }}</b>
        </p>
        
        <!-- 🟢 БЕЛЫЙ ИНПУТ ДЛЯ НАЗВАНИЯ -->
        <input 
          type="text" 
          v-model="newRecipientName" 
          class="create-recipient-input"
          placeholder="Введите имя/название"
          ref="newRecipientInputRef"
          @keyup.enter="saveNewRecipient"
          @keyup.esc="cancelCreateRecipient"
        />
        
        <div class="recipient-actions">
           <button class="btn-cancel" @click="cancelCreateRecipient">Отмена</button>
           <button class="btn-save-recipient" @click="saveNewRecipient" :disabled="isSavingRecipient">
             {{ isSavingRecipient ? '...' : 'Создать' }}
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
.icon { width: 70%; height: 70%; fill: currentColor; display: block; pointer-events: none; }

/* CREATE RECIPIENT MODAL */
.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 3010; }
.create-recipient-box { background: #fff; padding: 24px; border-radius: 12px; width: 90%; max-width: 350px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center; }
.create-recipient-box h4 { margin: 0 0 10px; color: #222; font-size: 18px; }
.sub-text { font-size: 14px; color: #666; margin-bottom: 15px; }

/* 🟢 БЕЛЫЙ ИНПУТ ДЛЯ СОЗДАНИЯ */
.create-recipient-input { 
  width: 100%; height: 40px; 
  border: 1px solid #ccc; border-radius: 6px; 
  padding: 0 10px; font-size: 15px; margin-bottom: 20px; 
  box-sizing: border-box; 
  background-color: #ffffff; color: #1a1a1a;
}
.create-recipient-input:focus { outline: none; border-color: #7B1FA2; }

.recipient-actions { display: flex; justify-content: space-between; align-items: center; }
.btn-cancel { background: #e0e0e0; color: #333; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 500; }
.btn-cancel:hover { background: #d1d1d1; }
.btn-save-recipient { padding: 10px 20px; background-color: #7B1FA2; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; }
.btn-save-recipient:hover { background-color: #6A1B9A; }
.btn-save-recipient:disabled { opacity: 0.7; cursor: wait; }
</style>