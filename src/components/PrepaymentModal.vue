<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

const props = defineProps({
  initialData: { type: Object, required: true },
  dateKey: { type: String, required: true }
});

const emit = defineEmits(['close', 'save']);
const mainStore = useMainStore();

// --- ДАННЫЕ ФОРМЫ ---
const amount = ref(props.initialData.amount || 0);
const formattedAmount = ref('');

const totalDealAmount = ref(0);
const formattedTotalDeal = ref('');

const isSaving = ref(false);

// --- ВЫЧИСЛЯЕМЫЕ СВОЙСТВА ---

// Имя контрагента (Только чтение)
const contractorName = computed(() => {
  const cId = props.initialData.contractorId;
  const indId = props.initialData.counterpartyIndividualId;
  
  if (cId) {
      if (typeof cId === 'object' && cId.name) return cId.name;
      const c = mainStore.contractors.find(i => i._id === cId);
      return c ? c.name : 'Неизвестный контрагент';
  }
  if (indId) {
      if (typeof indId === 'object' && indId.name) return indId.name;
      const i = mainStore.individuals.find(x => x._id === indId);
      return i ? i.name : 'Неизвестное физлицо';
  }
  return 'Не выбран';
});

// Расчет долга клиента (Общая сумма - Внесенный аванс)
const clientDebt = computed(() => {
    const total = totalDealAmount.value;
    const paid = amount.value;
    return total > paid ? total - paid : 0;
});

// Валидация
const isSaveDisabled = computed(() => {
  // Сумма аванса > 0, Общая сумма > 0, Аванс не может быть больше Общей суммы
  return amount.value <= 0 || totalDealAmount.value <= 0 || amount.value > totalDealAmount.value;
});

// --- МЕТОДЫ ---

const onAmountInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = Number(raw);
  formattedAmount.value = formatNumber(Number(raw));
};

const onTotalDealInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  totalDealAmount.value = Number(raw);
  formattedTotalDeal.value = formatNumber(Number(raw));
};

const handleSave = () => {
  if (isSaveDisabled.value || isSaving.value) return;
  isSaving.value = true;

  // Формируем финальный объект операции
  const finalOperation = {
    ...props.initialData,
    amount: amount.value,
    totalDealAmount: totalDealAmount.value, // Маркер сделки
    type: 'income',
    dateKey: props.dateKey
  };

  emit('save', finalOperation);
  
  // Сброс лоадера по тайм-ауту (на всякий случай)
  setTimeout(() => { if (isSaving.value) isSaving.value = false; }, 3000);
};

onMounted(() => {
  formattedAmount.value = formatNumber(amount.value);
  // Фокус на поле "Общая сумма", так как аванс уже предзаполнен
  nextTick(() => { document.querySelector('.smart-focus')?.focus(); });
});
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <h3>Оформление предоплаты</h3>
      
      <!-- Инфо-блок: Контрагент -->
      <div class="info-block">
        <span class="label">Контрагент:</span>
        <span class="value">{{ contractorName }}</span>
      </div>

      <!-- Поле 1: Вносимая сумма (Аванс) -->
      <div class="form-group">
        <label>Вносимая сумма (Аванс)</label>
        <div class="input-wrapper">
            <input 
              type="text" 
              v-model="formattedAmount" 
              @input="onAmountInput" 
              class="form-input"
              placeholder="0"
            />
            <span class="currency">₸</span>
        </div>
      </div>

      <!-- Поле 2: Общая сумма сделки -->
      <div class="form-group">
        <label>Общая сумма сделки</label>
        <div class="input-wrapper">
            <input 
              type="text" 
              v-model="formattedTotalDeal" 
              @input="onTotalDealInput" 
              placeholder="Введите полную стоимость" 
              class="form-input smart-focus"
            />
            <span class="currency">₸</span>
        </div>
      </div>

      <!-- Расчет долга (Отображается, если введен бюджет) -->
      <div class="debt-info" v-if="totalDealAmount > 0">
          <span class="debt-label">Остаток долга клиента:</span>
          <span class="debt-value">{{ formatNumber(clientDebt) }} ₸</span>
      </div>

      <!-- Кнопки -->
      <div class="actions">
        <button class="btn-cancel" @click="$emit('close')" :disabled="isSaving">Отмена</button>
        <button class="btn-save" @click="handleSave" :disabled="isSaveDisabled || isSaving" :class="{ 'btn-loading': isSaving }">
          {{ isSaving ? 'Сохранение...' : 'Подтвердить' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { 
  position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
  background: rgba(0,0,0,0.6); z-index: 2000; 
  display: flex; justify-content: center; align-items: center; 
  backdrop-filter: blur(3px); 
}

.modal-content { 
  background: #F4F4F4; padding: 2rem; border-radius: 12px; 
  width: 90%; max-width: 420px; 
  box-shadow: 0 15px 40px rgba(0,0,0,0.3); color: #1a1a1a; 
  animation: slideUp 0.2s ease-out; 
}

h3 { margin: 0 0 1.5rem 0; font-size: 1.4rem; font-weight: 700; text-align: center; color: #1a1a1a; }

.info-block { 
  margin-bottom: 1.5rem; font-size: 0.95rem; color: #666; 
  background: #e9e9e9; padding: 12px; border-radius: 8px; 
  display: flex; justify-content: space-between; align-items: center;
}
.info-block .value { font-weight: 700; color: #1a1a1a; }

.form-group { margin-bottom: 1.2rem; }
label { display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.9rem; color: #555; }

.input-wrapper { position: relative; width: 100%; }
.form-input { 
  width: 100%; height: 50px; padding: 0 40px 0 14px; /* Место справа для валюты */
  background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; 
  font-size: 1.2rem; font-weight: 600; color: #1a1a1a; 
  box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; 
  text-align: right; 
}
.form-input:focus { outline: none; border-color: #FF9D00; box-shadow: 0 0 0 3px rgba(255, 157, 0, 0.2); }
.currency { 
  position: absolute; right: 14px; top: 50%; transform: translateY(-50%); 
  color: #999; font-weight: 500; font-size: 1rem; pointer-events: none;
}

.debt-info { 
  margin-bottom: 2rem; padding: 16px; 
  background-color: #FFF3E0; border: 1px solid #FFE0B2; border-radius: 8px; 
  display: flex; justify-content: space-between; align-items: center; 
}
.debt-label { font-size: 0.95rem; color: #E65100; font-weight: 500; }
.debt-value { font-size: 1.2rem; font-weight: 800; color: #E65100; }

.actions { display: flex; gap: 12px; }
.btn-save { 
  flex: 1; height: 52px; background: #FF9D00; color: #fff; 
  border: none; border-radius: 8px; font-size: 1rem; font-weight: 700; 
  cursor: pointer; transition: background 0.2s; 
}
.btn-save:hover:not(:disabled) { background: #fb8c00; }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; background: #ccc; }

.btn-cancel { 
  padding: 0 24px; height: 52px; background: #e0e0e0; color: #333; 
  border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; 
  cursor: pointer; transition: background 0.2s; 
}
.btn-cancel:hover:not(:disabled) { background: #d1d1d1; }

@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>