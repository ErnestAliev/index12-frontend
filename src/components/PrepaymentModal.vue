<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v1.0 - SMART PREPAYMENT ---
 * * ВЕРСИЯ: 1.0 - Умное окно предоплаты (Новая / Существующая)
 * * ДАТА: 2025-11-20
 * * Реализует ТЗ v3.3:
 * 1. Режим "Новая сделка": Ввод общей суммы.
 * 2. Режим "Существующая сделка": Выбор из списка активных.
 * 3. Логика "Авто-Акт": Предложение закрыть сделку актом, если сумма совпадает.
 */

const props = defineProps({
  initialAmount: { type: Number, default: 0 },
  contractorId: { type: String, default: null },
  projectId: { type: String, default: null } // Опционально, для фильтрации
});

const emit = defineEmits(['close', 'confirm']);
const mainStore = useMainStore();

const mode = ref('new'); // 'new' | 'existing'
const dealTotal = ref('');
const selectedDealId = ref(null);
const createAutoAct = ref(false);

// Вносимая сумма (редактируемая, если пользователь решил изменить её здесь)
const paymentAmount = ref(''); 

onMounted(() => {
  paymentAmount.value = formatNumber(props.initialAmount);
  
  // Если есть активные сделки у контрагента, переключаем на вкладку выбора
  if (contractorActiveDeals.value.length > 0) {
    mode.value = 'existing';
  }
});

// --- Данные ---
const contractorActiveDeals = computed(() => {
  if (!props.contractorId) return [];
  // Фильтруем активные сделки только для выбранного контрагента
  return mainStore.activeDeals.filter(d => d.contractorId === props.contractorId || d.contractorId?._id === props.contractorId);
});

// --- Вычисления для UI ---

// Числовые значения
const paymentVal = computed(() => parseFloat(paymentAmount.value.replace(/\s/g, '')) || 0);
const totalVal = computed(() => parseFloat(dealTotal.value.replace(/\s/g, '')) || 0);

// Выбранная сделка (объект)
const targetDeal = computed(() => {
  if (mode.value === 'new') return null;
  return contractorActiveDeals.value.find(d => d._id === selectedDealId.value);
});

// Остаток долга ПОСЛЕ текущего платежа
const remainingDebt = computed(() => {
  if (mode.value === 'new') {
    return Math.max(0, totalVal.value - paymentVal.value);
  } else {
    if (!targetDeal.value) return 0;
    // Оставалось оплатить - Текущий платеж
    return Math.max(0, targetDeal.value.remainingToPay - paymentVal.value);
  }
});

// Флаг: Покрывает ли платеж сделку полностью?
const isFullPayment = computed(() => {
  return remainingDebt.value <= 0;
});

// Текст подсказки
const statusHint = computed(() => {
  if (mode.value === 'new') {
    if (totalVal.value <= 0) return 'Введите общую сумму сделки.';
    if (isFullPayment.value) return 'Это полная оплата. Сделка будет считаться полностью оплаченной.';
    const percent = Math.round((paymentVal.value / totalVal.value) * 100);
    return `Вы получили часть суммы (${percent}%). Остаток долга клиента: ${formatNumber(remainingDebt.value)} ₸.`;
  } else {
    if (!targetDeal.value) return 'Выберите сделку из списка.';
    if (isFullPayment.value) return 'Этот платеж полностью закрывает долг клиента по сделке.';
    return `После платежа остаток долга составит ${formatNumber(remainingDebt.value)} ₸.`;
  }
});

// --- Handlers ---
const onPaymentInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  paymentAmount.value = formatNumber(raw);
};

const onTotalInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  dealTotal.value = formatNumber(raw);
};

const selectDeal = (dealId) => {
  selectedDealId.value = dealId;
  // Если выбрали сделку, можно подставить сумму остатка, если она меньше введенной?
  // Нет, лучше оставить введенную пользователем, но подсветить.
  
  // А вот если введенная сумма 0, то подставим остаток
  if (paymentVal.value === 0 && targetDeal.value) {
    paymentAmount.value = formatNumber(targetDeal.value.remainingToPay);
  }
};

const handleConfirm = () => {
  // Валидация
  if (paymentVal.value <= 0) {
    alert("Введите сумму платежа");
    return;
  }
  
  if (mode.value === 'new' && totalVal.value < paymentVal.value) {
    alert("Общая сумма сделки не может быть меньше платежа");
    return;
  }
  
  if (mode.value === 'existing' && !selectedDealId.value) {
    alert("Выберите сделку");
    return;
  }

  emit('confirm', {
    amount: paymentVal.value,
    mode: mode.value,
    // Данные для NEW
    dealTotal: mode.value === 'new' ? totalVal.value : 0,
    isDeal: mode.value === 'new',
    // Данные для EXISTING
    parentDealId: mode.value === 'existing' ? selectedDealId.value : null,
    // Логика авто-акта
    createAutoAct: isFullPayment.value && createAutoAct.value
  });
};

</script>

<template>
  <div class="modal-overlay" @mousedown.self="$emit('close')">
    <div class="modal-content">
      
      <div class="modal-header">
        <h3>Оформление предоплаты</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="modal-body">
        
        <!-- Переключатель режимов -->
        <div class="mode-tabs">
          <button 
            :class="{ active: mode === 'new' }" 
            @click="mode = 'new'"
          >
            Новая сделка
          </button>
          <button 
            :class="{ active: mode === 'existing' }" 
            @click="mode = 'existing'"
            :disabled="contractorActiveDeals.length === 0"
          >
            Существующая ({{ contractorActiveDeals.length }})
          </button>
        </div>

        <!-- Поле Суммы (Общее) -->
        <div class="field-group">
          <label>Вносимая сумма (Предоплата)</label>
          <input type="text" v-model="paymentAmount" @input="onPaymentInput" class="form-input highlight-input" />
        </div>

        <!-- РЕЖИМ: НОВАЯ СДЕЛКА -->
        <div v-if="mode === 'new'" class="mode-section">
          <div class="field-group">
            <label>Общая сумма сделки</label>
            <input type="text" v-model="dealTotal" @input="onTotalInput" class="form-input" placeholder="Сколько всего должен клиент?" />
          </div>
        </div>

        <!-- РЕЖИМ: СУЩЕСТВУЮЩАЯ -->
        <div v-if="mode === 'existing'" class="mode-section">
          <label>Выберите активную сделку:</label>
          <div class="deals-list">
            <div 
              v-for="deal in contractorActiveDeals" 
              :key="deal._id" 
              class="deal-item"
              :class="{ selected: selectedDealId === deal._id }"
              @click="selectDeal(deal._id)"
            >
              <div class="deal-row-main">
                <span class="deal-date">{{ deal.label }}</span>
                <span class="deal-sum">{{ formatNumber(deal.dealTotal) }} ₸</span>
              </div>
              <div class="deal-row-sub">
                <span>Оплачено: {{ formatNumber(deal.paid) }}</span>
                <span class="debt">Долг: {{ formatNumber(deal.remainingToPay) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Информационный блок -->
        <div class="status-box" :class="{ 'success': isFullPayment }">
          <p>{{ statusHint }}</p>
        </div>

        <!-- Авто-Акт (только если сумма закрывает долг) -->
        <div v-if="isFullPayment" class="auto-act-checkbox">
          <label>
            <input type="checkbox" v-model="createAutoAct" />
            <span class="checkbox-label">
              <strong>Создать Акт выполненных работ автоматически?</strong>
              <br>
              <small>Сделка будет закрыта (исполнена) текущей датой.</small>
            </span>
          </label>
        </div>

      </div>

      <div class="modal-footer">
        <button class="btn btn-cancel" @click="$emit('close')">Отмена</button>
        <button class="btn btn-confirm" @click="handleConfirm">Подтвердить</button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 1500; /* Поверх OperationPopup */
  backdrop-filter: blur(3px);
}

.modal-content {
  width: 100%; max-width: 450px;
  background-color: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.3);
  display: flex; flex-direction: column;
  overflow: hidden;
}

.modal-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #eee;
  display: flex; justify-content: space-between; align-items: center;
}
.modal-header h3 { margin: 0; font-size: 18px; color: #333; }
.close-btn { background: none; border: none; font-size: 24px; color: #999; cursor: pointer; }

.modal-body { padding: 1.5rem; }

/* TABS */
.mode-tabs {
  display: flex; background: #f0f0f0; padding: 4px; border-radius: 8px; margin-bottom: 1.5rem;
}
.mode-tabs button {
  flex: 1; padding: 10px; border: none; background: transparent;
  font-size: 14px; font-weight: 500; color: #666; cursor: pointer;
  border-radius: 6px; transition: all 0.2s;
}
.mode-tabs button.active {
  background: #fff; color: #222; box-shadow: 0 2px 4px rgba(0,0,0,0.1); font-weight: 600;
}
.mode-tabs button:disabled { opacity: 0.5; cursor: not-allowed; }

.field-group { margin-bottom: 1.2rem; }
.field-group label { display: block; font-size: 13px; color: #666; margin-bottom: 6px; }
.form-input {
  width: 100%; height: 44px; padding: 0 12px;
  border: 1px solid #ddd; border-radius: 8px; font-size: 16px;
  box-sizing: border-box;
}
.highlight-input { border-color: var(--color-primary); background-color: #f9fff9; font-weight: bold; }

/* LIST */
.deals-list {
  max-height: 180px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px; margin-top: 8px;
}
.deal-item {
  padding: 10px 12px; border-bottom: 1px solid #f5f5f5; cursor: pointer; transition: background 0.1s;
}
.deal-item:hover { background-color: #fafafa; }
.deal-item.selected { background-color: #eefbf2; border-left: 4px solid var(--color-primary); }
.deal-row-main { display: flex; justify-content: space-between; font-weight: 600; color: #333; margin-bottom: 4px; }
.deal-row-sub { display: flex; justify-content: space-between; font-size: 12px; color: #888; }
.deal-row-sub .debt { color: #d63030; }

/* STATUS BOX */
.status-box {
  background: #f4f4f4; padding: 12px; border-radius: 8px; font-size: 13px; color: #555; line-height: 1.4; margin-top: 10px;
}
.status-box.success { background: #eefbf2; color: #2da84e; border: 1px solid #cceid6; }

/* AUTO ACT CHECKBOX */
.auto-act-checkbox {
  margin-top: 15px; padding: 12px; border: 2px dashed var(--color-primary); border-radius: 8px; background: #fff;
}
.auto-act-checkbox label { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.auto-act-checkbox input { margin-top: 4px; accent-color: var(--color-primary); width: 18px; height: 18px; }
.checkbox-label { font-size: 14px; color: #333; line-height: 1.4; }
.checkbox-label small { color: #666; }

/* FOOTER */
.modal-footer {
  padding: 1rem 1.5rem; border-top: 1px solid #eee; display: flex; gap: 10px; justify-content: flex-end;
}
.btn { padding: 10px 20px; border-radius: 8px; border: none; font-size: 15px; font-weight: 600; cursor: pointer; }
.btn-cancel { background: #f0f0f0; color: #333; }
.btn-confirm { background: #222; color: #fff; }
.btn-confirm:hover { background: #444; }
</style>
