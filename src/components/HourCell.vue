<script setup>
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v3.3 - HIDE EXCLUDED ACCOUNTS ---
 * * ВЕРСИЯ: 3.3
 * * ДАТА: 2025-12-10
 * * ИЗМЕНЕНИЯ:
 * 1. (LOGIC) Добавлена проверка isOpVisible. Теперь операции по скрытым счетам не отображаются,
 * если выключена настройка "Показывать скрытые" (includeExcludedInTotal).
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

// Проверка на розничного клиента
const isRetailClient = computed(() => {
    const op = props.operation;
    if (!op) return false;
    const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
    return indId && indId === mainStore.retailIndividualId;
});

// 🟢 1. Получаем список ID исключенных счетов
const excludedAccountIds = computed(() => {
    // Если глобальная настройка "Показывать скрытые" включена - возвращаем пустой набор
    if (mainStore.includeExcludedInTotal) return new Set();
    
    const ids = new Set();
    mainStore.accounts.forEach(a => {
        if (a.isExcluded) ids.add(a._id);
    });
    return ids;
});

// 🟢 2. Видимость текущей операции
const isOpVisible = computed(() => {
    const op = props.operation;
    if (!op) return false;
    
    // Если включен показ скрытых - всегда true
    if (mainStore.includeExcludedInTotal) return true;

    // Проверяем счет операции
    if (op.accountId) {
        const aId = typeof op.accountId === 'object' ? op.accountId._id : op.accountId;
        if (excludedAccountIds.value.has(aId)) return false;
    }
    return true;
});

// 🟢 3. Детектор ЗАКРЫТОЙ сделки/факта (Зеленый)
const isClosedDealOp = computed(() => {
    const op = props.operation;
    if (!op) return false;
    // Любой доход, который помечен как закрытый
    if (op.type === 'income' && op.isClosed === true) return true;
    return false;
});

// 🟢 4. Детектор ОТКРЫТОЙ предоплаты / Сделки / Транша (Оранжевый)
const isPrepaymentOp = computed(() => {
    const op = props.operation;
    if (!op || isTransferOp.value || op.isWithdrawal) return false;
    if (op.type !== 'income') return false;
    
    // Если уже закрыта -> это не "Предоплата" в контексте цвета
    if (isClosedDealOp.value) return false;

    // Признаки предоплаты:
    // а) Есть бюджет сделки (Якорь)
    if ((op.totalDealAmount || 0) > 0) return true;
    // б) Это транш (открытый)
    if (op.isDealTranche === true) return true;
    // в) Категория "Предоплата"
    const prepayIds = mainStore.getPrepaymentCategoryIds;
    const catId = op.categoryId?._id || op.categoryId;
    const prepId = op.prepaymentId?._id || op.prepaymentId;
    if ((catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment)) return true;
    
    // г) Розничный клиент: если не закрыто (closed !== true), значит это предоплата (долг)
    if (isRetailClient.value && op.isClosed !== true) return true;

    return false;
});

const isTechnicalOp = computed(() => {
    const op = props.operation;
    return op && op.type === 'expense' && !op.accountId && !op.isWithdrawal; 
});

const isWithdrawalOp = computed(() => props.operation && props.operation.isWithdrawal);
const isCreditIncomeOp = computed(() => mainStore._isCreditIncome(props.operation));

const toOwnerName = computed(() => {
  const op = props.operation;
  if (!op) return '';
  if (op.toCompanyId) return typeof op.toCompanyId === 'object' ? op.toCompanyId.name : 'Компания...'; 
  if (op.toIndividualId) return typeof op.toIndividualId === 'object' ? op.toIndividualId.name : 'Физлицо...';
  return op.toAccountId?.name || 'Счет...';
});

// 🟢 Хелпер для очистки текста от суммы
const cleanDescription = (desc) => {
    if (!desc) return '';
    const cleaned = desc.replace(/^[\d\s]+\s/, '').trim();
    return cleaned || desc;
};

const chipLabel = computed(() => {
  const op = props.operation;
  if (!op) return '';
  
  if (isClosedDealOp.value) {
      if (isRetailClient.value) {
          // 🟢 Розница Факт: Просто название категории
          return op.categoryId?.name || 'Выручка';
      }
      return 'Сделка закрыта'; 
  }

  if (op.isDealTranche === true) {
      if (op.description && op.description.includes('транш')) {
          // 🟢 Применяем умную очистку
          return cleanDescription(op.description);
      }
      return 'Транш';
  }
  
  if (isPrepaymentOp.value) {
      if (isRetailClient.value) return 'Предоплата (Розница)';
      return op.description && op.description.includes('транш') ? cleanDescription(op.description) : 'Предоплата';
  }
  
  if (isTechnicalOp.value) return op.description || 'Отработали';
  
  return op.categoryId?.name || 'Без категории';
});

// 🟢 Показывать галочку ТОЛЬКО для закрытых B2B сделок (не розница)
const showCheckmark = computed(() => {
    if (!isClosedDealOp.value) return false;
    if (isRetailClient.value) return false; // Розница без галочки
    return true;
});

const onAddClick = (event) => emit('add-operation', event, props.cellIndex);
const onEditClick = () => { if (props.operation) emit('edit-operation', props.operation); };

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
  emit('drop-operation', { operation: operationData, toCellIndex: props.cellIndex });
};
</script>

<template>
  <div class="hour-cell" :class="{ 'drag-over': isDragOver }" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <!-- 🟢 FIX: Добавлено условие isOpVisible -->
    <div
      v-if="operation && isOpVisible"
      class="operation-chip"
      :class="{ 
         transfer: isTransferOp, 
         income: operation.type==='income' && !isPrepaymentOp && !isWithdrawalOp && !isCreditIncomeOp && !isClosedDealOp, 
         expense: operation.type==='expense' && !isWithdrawalOp && !isTechnicalOp,
         
         /* 🟢 Оранжевый */
         prepayment: isPrepaymentOp,
         
         /* 🟢 Зеленый (Закрытые) */
         'closed-deal': isClosedDealOp,
         
         withdrawal: isWithdrawalOp,
         technical: isTechnicalOp, 
         'credit-income': isCreditIncomeOp 
      }"
      draggable="true"
      @dragstart="onDragStart" @dragend="onDragEnd"
      @click.stop="onEditClick"
    >
      <template v-if="isTransferOp">
        <span class="op-amount">{{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">{{ toOwnerName }}</span>
      </template>
      <template v-else-if="isWithdrawalOp">
        <span class="op-amount">- {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">{{ operation.destination || 'Вывод' }}</span>
      </template>
      <template v-else-if="isTechnicalOp">
        <span class="op-amount">✓ {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">{{ chipLabel }}</span>
      </template>
      <template v-else-if="isCreditIncomeOp">
        <span class="op-amount">+ {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">Кредит</span>
      </template>

      <!-- ОБЫЧНЫЕ / ПРЕДОПЛАТА / ЗАКРЫТЫЕ -->
      <template v-else>
        <span class="op-amount">
            <!-- 🟢 FIX: Галочка только если showCheckmark -->
            {{ showCheckmark ? '✓' : '' }} {{ operation.type === 'income' ? '+' : '-' }} {{ formatNumber(Math.abs(operation.amount)) }}
        </span>
        <span class="op-meta">{{ chipLabel }}</span>
      </template>
    </div>

    <div v-else class="cell-empty-space" @click="onAddClick($event)">&nbsp;</div>
  </div>
</template>

<style scoped>
.hour-cell { width: 100%; height: 36px; border-bottom: 1px solid var(--color-border); display:flex; align-items:center; padding:4px 8px; box-sizing:border-box; flex-shrink:0; transition: background-color .12s ease-in-out; }
.hour-cell.drag-over { background: rgba(255,255,255,.04); outline:1px dashed var(--color-border); }
.hour-cell:last-child { border-bottom:none; }
.cell-empty-space { width:100%; height:100%; cursor:cell; border-radius:4px; }
.cell-empty-space:hover { background: rgba(255,255,255,.05); }
.operation-chip { background:#383838; border: 1px solid rgba(52, 199, 89, 0.3);  padding:4px 8px; width:100%; border-radius:4px; font-size: 12px; display:flex; justify-content:space-between; cursor:grab; overflow:hidden; user-select:none; }
.operation-chip:active { cursor:grabbing; }
.operation-chip:hover { background:#4a4a4c; }
.op-amount { font-weight:bold; margin-right:6px; white-space:nowrap; }
.op-meta { color:#aaa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

.income .op-amount { color: var(--color-primary); }
.expense .op-amount { color: var(--color-danger); }

/* 🟢 ПРЕДОПЛАТА (ОТКРЫТАЯ) - Оранжевый фон и текст */
.prepayment {
  background: rgba(255, 157, 0, 0.15);
  border: 1px solid rgba(255, 157, 0, 0.3);
}
.prepayment .op-amount { color: #FF9D00 !important; }

/* 🟢 ЗАКРЫТАЯ СДЕЛКА (И ФАКТ РОЗНИЦЫ) - Зеленый фон и текст */
.closed-deal { 
  background: rgba(52, 199, 89, 0.15); 
  border: 1px solid rgba(52, 199, 89, 0.3); 
}
.closed-deal .op-amount { color: #34c759 !important; }
.closed-deal .op-meta { color: #a3e6b1; }

.technical { background: #383838; border: 1px solid #444; }
.technical .op-amount { color: #E6C845; } 
.technical .op-meta { color: #B0B090; }

.withdrawal { background: #2F3340; }
.withdrawal .op-amount { color: #DE8FFF; }
.withdrawal .op-meta { color: #B085D0; }

.credit-income { background-color: #2F3340; }
.credit-income .op-amount { color: #8FD4FF; }
.credit-income .op-meta { color: #8FD4FF; opacity: 0.8; }

.transfer { background:#2F3340; }
.transfer .op-amount { color:#d4d8e3; } 
.transfer .op-meta { color:#98a2b3; }

@media (max-height: 900px) { .hour-cell { padding: 2px 4px; height: 28px; } .operation-chip { font-size: 0.7em; padding: 3px 6px; } }
@media (max-width: 1200px) { .hour-cell { padding: 4px 6px; } .operation-chip { font-size: 0.7em; padding: 3px 6px; } }
</style>