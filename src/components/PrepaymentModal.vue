<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v1.1 - SMART LOGIC ---
 * * ВЕРСИЯ: 1.1 - Умные подсказки и валидация
 * * ДАТА: 2025-11-20
 * * ЧТО РЕАЛИЗОВАНО:
 * 1. Ввод общей суммы сделки.
 * 2. Авто-расчет долга клиента.
 * 3. Блокировка сохранения при некорректных данных.
 */

const props = defineProps({
  initialData: { type: Object, required: true }, // Данные из OperationPopup (сумма, контрагент и т.д.)
  dateKey: { type: String, required: true }
});

const emit = defineEmits(['close', 'save']);
const mainStore = useMainStore();

// Данные формы
const amount = ref(props.initialData.amount || 0);
const formattedAmount = ref('');
const totalDealAmount = ref(0);
const formattedTotalDeal = ref('');

// Ввод суммы (Аванс)
const onAmountInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = Number(raw);
  formattedAmount.value = formatNumber(Number(raw));
};

// Ввод общей суммы (Сделка)
const onTotalDealInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  totalDealAmount.value = Number(raw);
  formattedTotalDeal.value = formatNumber(Number(raw));
};

// Получение имени контрагента для отображения
const contractorName = computed(() => {
  const cId = props.initialData.contractorId;
  if (!cId) return 'Не выбран';
  // Если передан объект
  if (typeof cId === 'object' && cId.name) return cId.name;
  // Если ID - ищем в сторе
  const c = mainStore.contractors.find(i => i._id === cId);
  return c ? c.name : 'Неизвестный контрагент';
});

// Умные подсказки
const smartHint = computed(() => {
  const current = amount.value;
  const total = totalDealAmount.value;

  if (total <= 0 && current > 0) {
    return {
      text: 'Введите общую сумму сделки, чтобы система рассчитала обязательства.',
      type: 'neutral'
    };
  }

  if (current > total) {
    return {
      text: 'Ошибка: Вносимая сумма не может быть больше общей суммы сделки!',
      type: 'error'
    };
  }

  if (total > 0 && current === total) {
    return {
      text: `Это полная оплата. Операция будет считаться полностью закрытой. Мы должны клиенту услуги на ${formatNumber(total)} ₸.`,
      type: 'success'
    };
  }

  if (total > 0 && current < total) {
    const percent = Math.round((current / total) * 100);
    const debt = total - current;
    return {
      text: `Вы получили часть суммы (${percent}%). Остаток долга клиента по этой сделке составит ${formatNumber(debt)} ₸. Эта сумма отобразится в виджете "Нам должны".`,
      type: 'info'
    };
  }
  
  return null;
});

const isSaveDisabled = computed(() => {
  return amount.value <= 0 || totalDealAmount.value <= 0 || amount.value > totalDealAmount.value;
});

const handleSave = () => {
  if (isSaveDisabled.value) return;

  // Формируем финальный объект для сохранения
  const finalOperation = {
    ...props.initialData,
    amount: amount.value,
    totalDealAmount: totalDealAmount.value,
    type: 'income', // Предоплата - это доход
    dateKey: props.dateKey,
    // isPrepayment: true // Можно добавить флаг, но пока определяем по категории
  };

  emit('save', finalOperation);
};

onMounted(() => {
  // Инициализируем форматированные значения
  formattedAmount.value = formatNumber(amount.value);
  // Фокус на поле общей суммы
  nextTick(() => {
     document.querySelector('.smart-focus')?.focus();
  });
});
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <h3>Оформление предоплаты</h3>
      
      <div class="info-block">
        <span class="label">Контрагент:</span>
        <span class="value">{{ contractorName }}</span>
      </div>

      <div class="form-group">
        <label>Вносимая сумма (Аванс)</label>
        <input 
          type="text" 
          v-model="formattedAmount" 
          @input="onAmountInput" 
          class="form-input"
          placeholder="0"
        />
      </div>

      <div class="form-group">
        <label>Общая сумма сделки</label>
        <input 
          type="text" 
          v-model="formattedTotalDeal" 
          @input="onTotalDealInput" 
          placeholder="Введите полную стоимость" 
          class="form-input smart-focus"
        />
      </div>

      <transition name="fade">
        <div v-if="smartHint" class="hint-box" :class="smartHint.type">
          {{ smartHint.text }}
        </div>
      </transition>

      <div class="actions">
        <button class="btn-cancel" @click="$emit('close')">Отмена</button>
        <button class="btn-save" @click="handleSave" :disabled="isSaveDisabled">
          Подтвердить
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.6); z-index: 2000; /* Поверх всего */
  display: flex; justify-content: center; align-items: center;
  backdrop-filter: blur(3px);
}

.modal-content {
  background: #F4F4F4; padding: 2rem; border-radius: 12px;
  width: 90%; max-width: 420px;
  box-shadow: 0 15px 40px rgba(0,0,0,0.3);
  color: #1a1a1a;
  animation: slideUp 0.2s ease-out;
}

h3 { margin: 0 0 1.5rem 0; font-size: 1.4rem; font-weight: 600; }

.info-block { 
  margin-bottom: 1.5rem; font-size: 0.95rem; color: #666; 
  background: #e9e9e9; padding: 10px; border-radius: 6px;
}
.info-block .value { font-weight: 700; color: #1a1a1a; margin-left: 5px; }

.form-group { margin-bottom: 1rem; }
label { display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.9rem; color: #333; }

.form-input {
  width: 100%; height: 50px; padding: 0 14px;
  background: #fff; border: 1px solid #E0E0E0; border-radius: 8px;
  font-size: 1.1rem; font-weight: 600; color: #1a1a1a;
  box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s;
}
.form-input:focus { outline: none; border-color: #34c759; box-shadow: 0 0 0 3px rgba(52, 199, 89, 0.15); }

.hint-box {
  margin-top: 1.5rem; padding: 1rem; border-radius: 8px;
  font-size: 0.9rem; line-height: 1.4;
  transition: all 0.3s;
}
.hint-box.success { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
.hint-box.info { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
.hint-box.error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
.hint-box.neutral { background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb; }

.actions { margin-top: 2rem; display: flex; gap: 10px; }
.btn-save {
  flex: 1; height: 50px; background: #34c759; color: #fff;
  border: none; border-radius: 8px; font-size: 1rem; font-weight: 600;
  cursor: pointer; transition: background 0.2s;
}
.btn-save:hover:not(:disabled) { background: #2da84e; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; background: #ccc; }

.btn-cancel {
  padding: 0 20px; height: 50px; background: #e0e0e0; color: #333;
  border: none; border-radius: 8px; font-size: 1rem; font-weight: 500;
  cursor: pointer; transition: background 0.2s;
}
.btn-cancel:hover { background: #d1d1d1; }

@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
