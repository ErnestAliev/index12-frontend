<script setup>
import { computed } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';

const props = defineProps({
  operation: { type: Object, default: null },
  dateKey: { type: String, required: true },
  cellIndex: { type: Number, required: true }
});

// 🟢 Новое событие show-menu
const emit = defineEmits(['show-menu']);
const mainStore = useMainStore();

/* Логика определения типов операций */
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

const isWithdrawalOp = computed(() => props.operation && props.operation.isWithdrawal);
const isRetailWriteOffOp = computed(() => mainStore._isRetailWriteOff(props.operation));

const toOwnerName = computed(() => {
  const op = props.operation;
  if (!op) return '';
  if (op.toCompanyId) return typeof op.toCompanyId === 'object' ? op.toCompanyId.name : 'Компания...';
  if (op.toIndividualId) return typeof op.toIndividualId === 'object' ? op.toIndividualId.name : 'Физлицо...';
  return op.toAccountId?.name || 'Счет...';
});

// 🟢 Обработчик клика
const handleClick = (event) => {
  // Передаем данные ячейки родителю для открытия меню
  emit('show-menu', {
      operation: props.operation,
      dateKey: props.dateKey,
      cellIndex: props.cellIndex,
      // Можно передать координаты для анимации, если нужно, но просили по центру
  });
};
</script>

<template>
  <div class="mobile-cell" @click.stop="handleClick">
    <div
      v-if="operation"
      class="op-chip"
      :class="{ 
         transfer: isTransferOp, 
         income: operation.type==='income' && !isPrepaymentOp && !isWithdrawalOp, 
         expense: operation.type==='expense' && !isWithdrawalOp,
         prepayment: isPrepaymentOp,
         withdrawal: isWithdrawalOp,
         writeoff: isRetailWriteOffOp 
      }"
    >
      <!-- Содержимое чипа -->
      <template v-if="isTransferOp">
        <span class="amt">{{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="desc">{{ toOwnerName }}</span>
      </template>

      <template v-else-if="isWithdrawalOp">
        <span class="amt">- {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="desc">{{ operation.destination || 'Вывод' }}</span>
      </template>

      <template v-else-if="isRetailWriteOffOp">
        <span class="amt">- {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="desc">Списание</span>
      </template>

      <template v-else>
        <span class="amt">
          {{ operation.type === 'income' ? '+' : '-' }} {{ formatNumber(Math.abs(operation.amount)) }}
        </span>
        <span class="desc">
          {{ isPrepaymentOp ? 'Предоплата' : (operation.categoryId?.name || 'Без категории') }}
        </span>
      </template>
    </div>
    
    <!-- Пустая ячейка (прозрачная зона для клика) -->
    <div v-else class="empty-slot"></div>
  </div>
</template>

<style scoped>
.mobile-cell {
  width: 100%;
  height: 28px; /* Чуть компактнее чем на десктопе (36px) */
  border-bottom: 1px solid rgba(255,255,255,0.05);
  padding: 2px 4px;
  box-sizing: border-box;
  cursor: pointer; /* Добавили курсор */
}
/* Эффект нажатия */
.mobile-cell:active {
    background-color: rgba(255, 255, 255, 0.05);
}

.empty-slot {
  width: 100%;
  height: 100%;
}

.op-chip {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  font-size: 10px;
  overflow: hidden;
  background: #383838;
  color: #fff;
  white-space: nowrap;
}

.amt { font-weight: 700; margin-right: 4px; }
.desc { font-weight: 400; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; }

/* Цвета (как на десктопе) */
.income .amt { color: var(--color-primary, #34c759); }
.expense .amt { color: var(--color-danger, #ff3b30); }
.prepayment .amt { color: #FF9D00; }

.withdrawal { background: #2F3340; }
.withdrawal .amt { color: #DE8FFF; }
.withdrawal .desc { color: #B085D0; }

.writeoff .amt { color: #ef4444; }

.transfer { background: #2F3340; }
.transfer .amt { color: #d4d8e3; }
.transfer .desc { color: #98a2b3; }
</style>