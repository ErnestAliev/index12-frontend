<script setup>
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v51.1 - CREDIT INCOME STYLE ---
 * * ВЕРСИЯ: 51.1 - Стилизация доходов по кредитам
 * * ДАТА: 2025-11-30
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (LOGIC) Добавлен computed `isCreditIncomeOp` через mainStore._isCreditIncome.
 * 2. (TEMPLATE) Добавлен класс `credit-income` и блок отрисовки для кредитов.
 * 3. (STYLE) Добавлены стили для .credit-income (фон #2F3340, текст #8FD4FF).
 */

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

// UI-детектор предоплаты
const isPrepaymentOp = computed(() => {
    const op = props.operation;
    if (!op || isTransferOp.value || op.isWithdrawal) return false;
    if (op.type !== 'income') return false;
    
    const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
    if (indId && indId === mainStore.retailIndividualId) {
        return (op.totalDealAmount || 0) > 0;
    }

    const prepayIds = mainStore.getPrepaymentCategoryIds;
    const catId = op.categoryId?._id || op.categoryId;
    const prepId = op.prepaymentId?._id || op.prepaymentId;
    
    return (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
});

// UI-детектор вывода
const isWithdrawalOp = computed(() => {
    return props.operation && props.operation.isWithdrawal;
});

// UI-детектор списания (Розница)
const isRetailWriteOffOp = computed(() => {
    return mainStore._isRetailWriteOff(props.operation);
});

// 🟢 UI-детектор Дохода по Кредиту
const isCreditIncomeOp = computed(() => {
    return mainStore._isCreditIncome(props.operation);
});


const fromAccountName = computed(() =>
  props.operation?.fromAccountId?.name || props.operation?.fromAccountId || ''
);

// Имя Владельца-Получателя
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
         expense: operation.type==='expense' && !isWithdrawalOp,
         prepayment: isPrepaymentOp,
         withdrawal: isWithdrawalOp,
         writeoff: isRetailWriteOffOp,
         'credit-income': isCreditIncomeOp /* 🟢 Новый класс */
      }"
      draggable="true"
      @dragstart="onDragStart" @dragend="onDragEnd"
      @click.stop="onEditClick"
    >
      <!-- ПЕРЕВОД: СУММА -> ПОЛУЧАТЕЛЬ (Владелец) -->
      <template v-if="isTransferOp">
        <span class="op-amount">
          {{ formatNumber(Math.abs(operation.amount)) }}
        </span>
        <span class="op-meta">
          {{ toOwnerName }}
        </span>
      </template>

      <!-- ВЫВОД -->
      <template v-else-if="isWithdrawalOp">
        <span class="op-amount">
          - {{ formatNumber(Math.abs(operation.amount)) }}
        </span>
        <span class="op-meta">
           {{ operation.destination || 'Вывод' }}
        </span>
      </template>

      <!-- СПИСАНИЕ (РОЗНИЦА) -->
      <template v-else-if="isRetailWriteOffOp">
        <span class="op-amount">
          - {{ formatNumber(Math.abs(operation.amount)) }}
        </span>
        <span class="op-meta">
           Списание
        </span>
      </template>

      <!-- 🟢 КРЕДИТ (ДОХОД) -->
      <template v-else-if="isCreditIncomeOp">
        <span class="op-amount">
          + {{ formatNumber(Math.abs(operation.amount)) }}
        </span>
        <span class="op-meta">
           Кредит
        </span>
      </template>

      <!-- ОБЫЧНЫЕ ОПЕРАЦИИ -->
      <template v-else>
        <span class="op-amount">
          {{ operation.type === 'income' ? '+' : '-' }} {{ formatNumber(Math.abs(operation.amount)) }}
        </span>
        
        <span class="op-meta">
          {{ isPrepaymentOp ? 'Предоплата' : (operation.categoryId?.name || 'Без категории') }}
        </span>
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

/* Цвета для обычных операций */
.income .op-amount { color: var(--color-primary); }
.expense .op-amount { color: var(--color-danger); }

/* ПРЕДОПЛАТА */
.prepayment .op-amount { color: #FF9D00 !important; }

/* ВЫВОД */
.withdrawal { background: #2F3340; }
.withdrawal:hover { background: #3a3f50; }
.withdrawal .op-amount { color: #DE8FFF; }
.withdrawal .op-meta { color: #B085D0; }

/* СПИСАНИЕ */
.writeoff .op-amount { color: #ef4444; }
.writeoff .op-meta { font-style: normal; }

/* 🟢 КРЕДИТ ДОХОД */
.credit-income {
  background-color: #2F3340; /* Темный фон */
}
.credit-income:hover {
  background-color: #3a3f50;
}
.credit-income .op-amount {
  color: #8FD4FF; /* Голубой текст */
}
.credit-income .op-meta {
  color: #8FD4FF;
  opacity: 0.8;
}

/* ПЕРЕВОД */
.transfer { background:#2F3340; }
.transfer:hover { background:#3a3f50; }
.transfer .op-amount { color:#d4d8e3; } 
.transfer .op-meta { color:#98a2b3; }

@media (max-height: 900px) {
  .hour-cell {
    padding: 2px 4px; 
    height: 28px; 
  }
  .operation-chip {
    font-size: 0.7em; 
    padding: 3px 6px; 
  }
  .op-amount {
    margin-right: 4px; 
  }
}

@media (max-width: 1200px) {
  .hour-cell {
    padding: 4px 6px;
  }
  .operation-chip {
    font-size: 0.7em; 
    padding: 3px 6px; 
  }
}
</style>