<script setup>
import { computed } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v51.1 - CREDIT INCOME STYLE (MOBILE) ---
 * * ВЕРСИЯ: 51.1 - Стилизация доходов по кредитам для мобильных
 * * ДАТА: 2025-11-30
 */

const props = defineProps({
  operation: { type: Object, default: null },
  dateKey: { type: String, required: true },
  cellIndex: { type: Number, required: true }
});

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

// 🟢 Детектор Кредита (Доход)
const isCreditIncomeOp = computed(() => mainStore._isCreditIncome(props.operation));

const toOwnerName = computed(() => {
  const op = props.operation;
  if (!op) return '';
  if (op.toCompanyId) return typeof op.toCompanyId === 'object' ? op.toCompanyId.name : 'Компания...';
  if (op.toIndividualId) return typeof op.toIndividualId === 'object' ? op.toIndividualId.name : 'Физлицо...';
  return op.toAccountId?.name || 'Счет...';
});
</script>

<template>
  <div class="mobile-cell">
    <div
      v-if="operation"
      class="op-chip"
      :class="{ 
         transfer: isTransferOp, 
         income: operation.type==='income' && !isPrepaymentOp && !isWithdrawalOp && !isCreditIncomeOp, 
         expense: operation.type==='expense' && !isWithdrawalOp,
         prepayment: isPrepaymentOp,
         withdrawal: isWithdrawalOp,
         writeoff: isRetailWriteOffOp,
         'credit-income': isCreditIncomeOp /* 🟢 Новый класс */
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

      <!-- 🟢 КРЕДИТ -->
      <template v-else-if="isCreditIncomeOp">
        <span class="amt">+ {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="desc">Кредит</span>
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
    
    <!-- Пустая ячейка -->
    <div v-else class="empty-slot"></div>
  </div>
</template>

<style scoped>
.mobile-cell {
  width: 100%;
  height: 28px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  padding: 2px 4px;
  box-sizing: border-box;
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

/* Цвета */
.income .amt { color: var(--color-primary, #34c759); }
.expense .amt { color: var(--color-danger, #ff3b30); }
.prepayment .amt { color: #FF9D00; }

.withdrawal { background: #2F3340; }
.withdrawal .amt { color: #DE8FFF; }
.withdrawal .desc { color: #B085D0; }

.writeoff .amt { color: #ef4444; }

/* 🟢 СТИЛИ КРЕДИТА */
.credit-income { background: #2F3340; }
.credit-income .amt { color: #8FD4FF; }
.credit-income .desc { color: #8FD4FF; opacity: 0.8; }

.transfer { background: #2F3340; }
.transfer .amt { color: #d4d8e3; }
.transfer .desc { color: #98a2b3; }
</style>