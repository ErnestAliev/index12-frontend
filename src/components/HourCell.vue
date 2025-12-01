<script setup>
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';

const props = defineProps({
  operation: { type: Object, default: null },
  dateKey: { type: String, required: true },
  cellIndex: { type: Number, required: true }
});

const emit = defineEmits(['edit-operation', 'add-operation', 'drop-operation']);
const isDragOver = ref(false);
const mainStore = useMainStore();

/* UI-детектор перевода */
const isTransferOp = computed(() => {
  const op = props.operation;
  if (!op) return false;
  if (op.isWithdrawal) return false; 
  
  if (op.type?.toLowerCase?.() === 'transfer') return true;
  if (op.isTransfer === true) return true;
  if (op.transferGroupId) return true;
  const cat = op.categoryId?.name?.toLowerCase?.() || '';
  return cat === 'перевод' || cat === 'transfer';
});

// UI-детектор предоплаты (Сценарий 1)
const isPrepaymentOp = computed(() => {
    const op = props.operation;
    if (!op || isTransferOp.value || op.isWithdrawal) return false;
    if (op.type !== 'income') return false;
    
    // Если указана общая сумма сделки -> это Предоплата по сделке
    if ((op.totalDealAmount || 0) > 0) return true;
    
    // Если контрагент - Розничные клиенты
    const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
    if (indId && indId === mainStore.retailIndividualId) return true;

    // Проверка по категориям
    const prepayIds = mainStore.getPrepaymentCategoryIds;
    const catId = op.categoryId?._id || op.categoryId;
    const prepId = op.prepaymentId?._id || op.prepaymentId;
    
    return (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
});

// UI-детектор технической операции (Сценарий 3: Отработали)
// Расход без счета = Техническое списание обязательств
const isTechnicalOp = computed(() => {
    const op = props.operation;
    // Расход, без счета списания и не являющийся выводом средств
    return op && op.type === 'expense' && !op.accountId && !op.isWithdrawal; 
});

const isWithdrawalOp = computed(() => {
    return props.operation && props.operation.isWithdrawal;
});

const isCreditIncomeOp = computed(() => {
    return mainStore._isCreditIncome(props.operation);
});

const toOwnerName = computed(() => {
  const op = props.operation;
  if (!op) return '';
  
  if (op.toCompanyId) {
      if (typeof op.toCompanyId === 'object') return op.toCompanyId.name;
      return 'Компания...'; 
  }
  
  if (op.toIndividualId) {
      if (typeof op.toIndividualId === 'object') return op.toIndividualId.name;
      return 'Физлицо...';
  }
  
  return op.toAccountId?.name || 'Счет...';
});

const chipLabel = computed(() => {
  const op = props.operation;
  if (!op) return '';
  
  if (isPrepaymentOp.value) return 'Предоплата';
  // Для технических операций показываем описание или "Отработали"
  if (isTechnicalOp.value) return op.description || 'Отработали';
  
  return op.categoryId?.name || 'Без категории';
});

/* Клики */
const onAddClick = (event) => emit('add-operation', event, props.cellIndex);
const onEditClick = () => {
  if (!props.operation) return;
  emit('edit-operation', props.operation);
};

const onDragStart = (event) => {
  if (!props.operation) return;
  event.dataTransfer.setData('application/json', JSON.stringify(props.operation));
  event.dataTransfer.effectAllowed = 'move';
  event.currentTarget.style.opacity = '0.5';
};
const onDragEnd = (event) => { event.currentTarget.style.opacity = '1'; };
const onDragOver = (event) => { event.preventDefault(); isDragOver.value = true; event.dataTransfer.dropEffect = 'move'; };
const onDragLeave = () => { isDragOver.value = false; };

const onDrop = (event) => {
  event.preventDefault(); isDragOver.value = false;
  const raw = event.dataTransfer.getData('application/json'); if (!raw) return;
  let operationData = null; try { operationData = JSON.parse(raw); } catch { return; }
  if (!operationData || !operationData._id) return;
  
  emit('drop-operation', {
    operation: operationData,
    toCellIndex: props.cellIndex 
  });
};
</script>

<template>
  <div
    class="hour-cell"
    :class="{ 'drag-over': isDragOver }"
    @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop"
  >
    <div
      v-if="operation"
      class="operation-chip"
      :class="{ 
         transfer: isTransferOp, 
         income: operation.type==='income' && !isPrepaymentOp && !isWithdrawalOp && !isCreditIncomeOp, 
         expense: operation.type==='expense' && !isWithdrawalOp && !isTechnicalOp,
         prepayment: isPrepaymentOp,
         withdrawal: isWithdrawalOp,
         technical: isTechnicalOp, /* 🟢 Класс для технических операций */
         'credit-income': isCreditIncomeOp 
      }"
      draggable="true"
      @dragstart="onDragStart" @dragend="onDragEnd"
      @click.stop="onEditClick"
    >
      <!-- ПЕРЕВОД -->
      <template v-if="isTransferOp">
        <span class="op-amount">{{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">{{ toOwnerName }}</span>
      </template>

      <!-- ВЫВОД -->
      <template v-else-if="isWithdrawalOp">
        <span class="op-amount">- {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">{{ operation.destination || 'Вывод' }}</span>
      </template>

      <!-- 🟢 ТЕХНИЧЕСКАЯ ОПЕРАЦИЯ (Отработка) -->
      <template v-else-if="isTechnicalOp">
        <span class="op-amount">✓ {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">{{ chipLabel }}</span>
      </template>

      <!-- КРЕДИТ -->
      <template v-else-if="isCreditIncomeOp">
        <span class="op-amount">+ {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">Кредит</span>
      </template>

      <!-- ОБЫЧНЫЕ / ПРЕДОПЛАТА -->
      <template v-else>
        <span class="op-amount">
          {{ operation.type === 'income' ? '+' : '-' }} {{ formatNumber(Math.abs(operation.amount)) }}
        </span>
        <span class="op-meta">{{ chipLabel }}</span>
      </template>
    </div>

    <div v-else class="cell-empty-space" @click="onAddClick($event)">&nbsp;</div>
  </div>
</template>

<style scoped>
.hour-cell {
  width: 100%; height: 36px; border-bottom: 1px solid var(--color-border);
  display:flex; align-items:center; padding:4px 8px; box-sizing:border-box; flex-shrink:0;
  transition: background-color .12s ease-in-out, outline-color .12s ease-in-out;
}
.hour-cell.drag-over { background: rgba(255,255,255,.04); outline:1px dashed var(--color-border); outline-offset:-1px; }
.hour-cell:last-child { border-bottom:none; }

.cell-empty-space { width:100%; height:100%; cursor:cell; border-radius:4px; }
.cell-empty-space:hover { background: rgba(255,255,255,.05); }

.operation-chip {
  background:#383838; padding:4px 8px; width:100%;
  border-radius:4px; font-size:.85em; display:flex; justify-content:space-between;
  cursor:grab; transition: background-color .2s; overflow:hidden; user-select:none;
}
.operation-chip:active { cursor:grabbing; }
.operation-chip:hover { background:#4a4a4c; }

.op-amount { font-weight:bold; margin-right:6px; white-space:nowrap; }
.op-meta { color:#aaa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* Цвета */
.income .op-amount { color: var(--color-primary); }
.expense .op-amount { color: var(--color-danger); }

/* 🟢 ПРЕДОПЛАТА: Оранжевый текст суммы */
.prepayment .op-amount { color: #FF9D00 !important; }

/* 🟢 ТЕХНИЧЕСКАЯ: Серый фон, Золотистый текст */
.technical { background: #383838; border: 1px solid #444; }
.technical .op-amount { color: #E6C845; } /* Золотистый */
.technical .op-meta { color: #B0B090; }

/* ВЫВОД */
.withdrawal { background: #2F3340; }
.withdrawal:hover { background: #3a3f50; }
.withdrawal .op-amount { color: #DE8FFF; }
.withdrawal .op-meta { color: #B085D0; }

/* КРЕДИТ */
.credit-income { background-color: #2F3340; }
.credit-income:hover { background-color: #3a3f50; }
.credit-income .op-amount { color: #8FD4FF; }
.credit-income .op-meta { color: #8FD4FF; opacity: 0.8; }

/* ПЕРЕВОД */
.transfer { background:#2F3340; }
.transfer:hover { background:#3a3f50; }
.transfer .op-amount { color:#d4d8e3; } 
.transfer .op-meta { color:#98a2b3; }

@media (max-height: 900px) {
  .hour-cell { padding: 2px 4px; height: 28px; }
  .operation-chip { font-size: 0.7em; padding: 3px 6px; }
  .op-amount { margin-right: 4px; }
}
@media (max-width: 1200px) {
  .hour-cell { padding: 4px 6px; }
  .operation-chip { font-size: 0.7em; padding: 3px 6px; }
}
</style>