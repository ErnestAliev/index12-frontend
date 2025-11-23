<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import BaseSelect from './BaseSelect.vue'; // 🟢 Импортируем BaseSelect

const props = defineProps({
  initialData: { type: Object, required: true }, // { amount, fromAccountName, ... }
});

const emit = defineEmits(['close', 'save']);

const amount = ref(props.initialData.amount || 0);
const formattedAmount = ref('');
// 🟢 destination теперь используется как комментарий и "Куда"
const destination = ref('');
const reason = ref('Личные нужды');
const isSaving = ref(false);

const reasonOptions = [
  { value: 'Личные нужды', label: 'Личные нужды' },
  { value: 'Дивиденды', label: 'Дивиденды' },
  { value: 'Развитие бизнеса (Наличные)', label: 'Развитие бизнеса (Наличные)' },
  { value: 'Другое', label: 'Другое' }
];

const onAmountInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = Number(raw);
  formattedAmount.value = formatNumber(Number(raw));
};

const handleSave = () => {
  if (amount.value <= 0 || isSaving.value) return;
  
  isSaving.value = true;
  
  emit('save', {
    amount: amount.value,
    // 🟢 Передаем destination как destination (он же комментарий)
    destination: destination.value,
    reason: reason.value,
    type: 'expense', 
    isWithdrawal: true 
  });

  setTimeout(() => { isSaving.value = false; }, 3000);
};

onMounted(() => {
  formattedAmount.value = formatNumber(amount.value);
  nextTick(() => document.querySelector('.wd-focus')?.focus());
});
</script>

<template>
  <div class="withdrawal-overlay" @mousedown.self="$emit('close')">
    <div class="withdrawal-content">
      <div class="wd-header">
        <h4>Оформление вывода</h4>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      
      <div class="wd-info-box">
        Вы оформляете вывод средств со счета <b>{{ initialData.fromAccountName }}</b>. <br>
        Деньги будут списаны с баланса бизнеса.
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
      
      <!-- 🟢 Инпут "Куда" удален, используем destination как комментарий -->
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
        <!-- 🟢 Используем BaseSelect для Причины -->
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
          {{ isSaving ? 'Сохранение...' : 'Подтвердить' }}
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
  z-index: 2000;
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