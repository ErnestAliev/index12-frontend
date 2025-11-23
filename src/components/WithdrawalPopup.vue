<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import BaseSelect from './BaseSelect.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v4.0 - EDIT MODE & Z-INDEX ---
 * * ВЕРСИЯ: 4.0 - Поддержка редактирования и исправление слоев
 * * ДАТА: 2025-11-23
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (FIX) z-index увеличен до 3000, чтобы окно было выше TransferListEditor.
 * 2. (FEAT) Добавлен prop `operationToEdit` для режима редактирования.
 * 3. (LOGIC) Если сумма вывода (15 000) меньше суммы перевода (20 000), система просто списывает 15 000.
 * Остаток (5 000) остается на балансе счета-источника. Цепочка визуально "завершается" выводом.
 */

const props = defineProps({
  initialData: { type: Object, default: () => ({}) }, // { amount, fromAccountName, fromAccountId... }
  operationToEdit: { type: Object, default: null } // Если редактируем существующий
});

const emit = defineEmits(['close', 'save']);

const amount = ref(0);
const formattedAmount = ref('');
const destination = ref('');
const reason = ref('Личные нужды');
const isSaving = ref(false);

const reasonOptions = [
  { value: 'Личные нужды', label: 'Личные нужды' },
  { value: 'Дивиденды', label: 'Дивиденды' },
  { value: 'Развитие бизнеса (Наличные)', label: 'Развитие бизнеса (Наличные)' },
  { value: 'Другое', label: 'Другое' }
];

const isEditMode = computed(() => !!props.operationToEdit);
const title = computed(() => isEditMode.value ? 'Редактирование вывода' : 'Оформление вывода');
const btnText = computed(() => isSaving.value ? 'Сохранение...' : (isEditMode.value ? 'Сохранить' : 'Подтвердить'));

const onAmountInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = Number(raw);
  formattedAmount.value = formatNumber(Number(raw));
};

const handleSave = () => {
  if (amount.value <= 0 || isSaving.value) return;
  
  isSaving.value = true;
  
  const payload = {
    amount: amount.value,
    destination: destination.value,
    reason: reason.value,
    type: 'expense', 
    isWithdrawal: true,
    // Если создаем новый - берем ID счета из initialData
    // Если редактируем - ID счета обычно не меняется в упрощенном попапе, но можно добавить логику
    accountId: props.operationToEdit?.accountId || props.initialData?.fromAccountId
  };

  emit('save', {
    mode: isEditMode.value ? 'edit' : 'create',
    id: props.operationToEdit?._id,
    data: payload,
    originalOperation: props.operationToEdit
  });

  // Сброс через таймаут на случай ошибки сети
  setTimeout(() => { isSaving.value = false; }, 3000);
};

onMounted(() => {
  if (isEditMode.value) {
      const op = props.operationToEdit;
      amount.value = Math.abs(op.amount || 0);
      destination.value = op.destination || '';
      reason.value = op.reason || 'Личные нужды'; // Если поле reason добавлено в бэк
  } else {
      amount.value = props.initialData.amount || 0;
  }
  
  formattedAmount.value = formatNumber(amount.value);
  
  nextTick(() => document.querySelector('.wd-focus')?.focus());
});
</script>

<template>
  <div class="withdrawal-overlay" @mousedown.self="$emit('close')">
    <div class="withdrawal-content">
      <div class="wd-header">
        <h4>{{ title }}</h4>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      
      <div class="wd-info-box" v-if="!isEditMode && initialData.fromAccountName">
        Вы оформляете вывод средств со счета <b>{{ initialData.fromAccountName }}</b>. <br>
        Деньги будут списаны с баланса.
      </div>
      <div class="wd-info-box" v-else-if="isEditMode">
        Редактирование суммы или назначения вывода.
      </div>
      
      <div class="wd-field">
        <span class="wd-label">Сумма к выводу</span>
        <input 
          type="text" 
          v-model="formattedAmount" 
          @input="onAmountInput"
          class="wd-input wd-amount" 
        >
      </div>
      
      <div class="wd-field">
        <span class="wd-label">Комментарий / Куда</span>
        <input 
          type="text" 
          v-model="destination" 
          class="wd-input wd-focus" 
          placeholder="Например: На карту Kaspi Gold"
        >
      </div>

      <div class="wd-field">
        <BaseSelect
          v-model="reason"
          :options="reasonOptions"
          label="Причина / Цель"
          placeholder="Выберите причину"
        />
      </div>

      <div class="wd-actions">
        <button class="wd-btn-cancel" @click="$emit('close')" :disabled="isSaving">Отмена</button>
        <button 
          class="wd-btn-confirm" 
          @click="handleSave" 
          :disabled="amount <= 0 || isSaving"
        >
          {{ btnText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.withdrawal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.6);
  display: flex; justify-content: center; align-items: center;
  z-index: 3000; /* 🟢 FIX: Выше чем TransferListEditor (1100) */
  backdrop-filter: blur(2px);
}
.withdrawal-content {
  background: #FFF; padding: 24px; border-radius: 12px; width: 90%; max-width: 420px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  display: flex; flex-direction: column; gap: 15px;
  animation: slideUp 0.2s ease-out;
}
@keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.wd-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
.wd-header h4 { margin: 0; font-size: 20px; color: #1a1a1a; font-weight: 700; }
.close-btn { border: none; background: none; font-size: 24px; cursor: pointer; color: #888; line-height: 1; padding: 0; }
.close-btn:hover { color: #333; }

.wd-info-box {
  background: #F3E5F5; 
  border: 1px solid #E1BEE7;
  padding: 12px; border-radius: 8px;
  font-size: 13px; color: #4A148C;
  line-height: 1.4;
}

.wd-field { margin-bottom: 0; }
.wd-label { font-size: 12px; color: #666; font-weight: 600; margin-bottom: 6px; display: block; }
.wd-input { 
  width: 100%; padding: 12px; 
  border: 1px solid #ccc; border-radius: 8px; 
  font-size: 14px; box-sizing: border-box; 
  background: #fff; color: #1a1a1a;
}
.wd-input:focus { outline: none; border-color: #7B1FA2; box-shadow: 0 0 0 2px rgba(123, 31, 162, 0.1); }
.wd-amount { font-weight: 700; font-size: 16px; }

.wd-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
.wd-btn-cancel { padding: 10px 20px; border: 1px solid #ccc; background: transparent; border-radius: 6px; cursor: pointer; font-weight: 500; color: #333; transition: background 0.2s; }
.wd-btn-cancel:hover { background: #f5f5f5; }

.wd-btn-confirm { 
  padding: 10px 20px; border: none; 
  background: #7B1FA2; color: #fff; 
  border-radius: 6px; cursor: pointer; font-weight: 600; 
  transition: background 0.2s; 
}
.wd-btn-confirm:hover:not(:disabled) { background: #6A1B9A; }
.wd-btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
</style>