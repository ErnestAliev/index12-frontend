<script setup>
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v3.4 - HIDE EXCLUDED MOBILE ---
 * * ВЕРСИЯ: 3.4
 * * ДАТА: 2025-12-10
 * * ИЗМЕНЕНИЯ:
 * 1. (LOGIC) Добавлена проверка isOpVisible. Теперь операции по скрытым счетам не отображаются в мобильной версии,
 * если выключена настройка "Показывать скрытые".
 */

const props = defineProps({
  operation: { type: Object, default: null },
  dateKey: { type: String, required: true },
  cellIndex: { type: Number, required: true }
});

const emit = defineEmits(['edit-operation', 'add-operation', 'drop-operation', 'show-menu']);
const mainStore = useMainStore();
const visibilityMode = computed(() => mainStore.accountVisibilityMode);

/* --- ЛОГИКА ТИПОВ ОПЕРАЦИЙ (Без изменений) --- */
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

const isRetailClient = computed(() => {
    const op = props.operation;
    if (!op) return false;
    const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
    return indId && indId === mainStore.retailIndividualId;
});

// 🟢 1. Получаем список ID исключенных счетов (Logic copied from HourCell)
const excludedAccountIds = computed(() => {
    const mode = visibilityMode.value;
    if (mode === 'all') return new Set();
    
    const ids = new Set();
    mainStore.accounts.forEach(a => {
        if (mode === 'none') { ids.add(a._id); return; }
        if (mode === 'open' && a.isExcluded) ids.add(a._id);
        if (mode === 'hidden' && !a.isExcluded) ids.add(a._id);
    });
    return ids;
});

// 🟢 2. Видимость текущей операции
const isOpVisible = computed(() => {
    const op = props.operation;
    if (!op) return false;
    
    // Если включен режим «Все» - всегда true
    if (visibilityMode.value === 'all') return true;

    // Проверяем счет операции
    if (op.accountId) {
        const aId = typeof op.accountId === 'object' ? op.accountId._id : op.accountId;
        if (excludedAccountIds.value.has(aId)) return false;
    }
    return true;
});

const isClosedDealOp = computed(() => {
    const op = props.operation;
    if (!op) return false;
    if (op.type === 'income' && op.isClosed === true) return true;
    return false;
});


const isWorkActOp = computed(() => {
    const op = props.operation;
    return op && op.isWorkAct === true; 
});

const isTechnicalOp = computed(() => {
    const op = props.operation;
    if (isWorkActOp.value) return false;
    return op && op.type === 'expense' && !op.accountId && !op.isWithdrawal; 
});

const isWithdrawalOp = computed(() => props.operation && props.operation.isWithdrawal);
const isCreditIncomeOp = computed(() => mainStore._isCreditIncome(props.operation));
const isRetailWriteOffOp = computed(() => mainStore._isRetailWriteOff(props.operation));

// Отображаемая сумма для доходов с учетом взаимозачетов
const displayAmount = computed(() => {
    const op = props.operation;
    if (!op || op.amount === undefined || op.amount === null) return null;
    const amt = Number(op.amount);
    if (!Number.isFinite(amt)) return null;
    if (op.type === 'income') {
        const offsets = mainStore.allOperationsFlat.filter(o => o.offsetIncomeId && mainStore._idsMatch(o.offsetIncomeId, op._id || op.id));
        const offsetTotal = offsets.reduce((s, o) => s + Math.abs(Number(o.amount) || 0), 0);
        return amt - offsetTotal;
    }
    return amt;
});

const toOwnerName = computed(() => {
  const op = props.operation;
  if (!op) return '';
  if (op.toCompanyId) return typeof op.toCompanyId === 'object' ? op.toCompanyId.name : 'Компания...';
  if (op.toIndividualId) return typeof op.toIndividualId === 'object' ? op.toIndividualId.name : 'Физлицо...';
  return op.toAccountId?.name || 'Счет...';
});

const chipLabel = computed(() => {
  const op = props.operation;
  if (!op) return '';
  if (isClosedDealOp.value) {
      if (isRetailClient.value) return op.categoryId?.name || 'Выручка';
      return 'Сделка закрыта'; 
  }
  if (isWorkActOp.value) return 'Отработано';
  if (isTechnicalOp.value) return op.description || 'Техническая';
  return op.categoryId?.name || 'Без категории';
});

const showCheckmark = computed(() => {
    if (!isClosedDealOp.value) return false;
    if (isRetailClient.value) return false; 
    return true;
});

// Клик по пустой ячейке -> Меню
const onAddClick = (event) => {
    emit('show-menu', { 
        dateKey: props.dateKey, 
        cellIndex: props.cellIndex,
        event: event // Передаем событие для координат
    });
};

// Клик по операции -> Меню (или редактирование)
const onEditClick = (event) => { 
    if (props.operation) {
        // Можно передать event для позиционирования меню редактирования, если нужно
        emit('show-menu', { operation: props.operation, event: event });
    }
};

/* --- DRAG & DROP LOGIC --- */
const touchState = ref({ active: false, clone: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

const onTouchStart = (e) => {
    if (!props.operation) return;
    // e.preventDefault(); // Не блокируем скролл сразу
    
    const touch = e.touches[0];
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    
    // Создаем визуальный клон
    const clone = target.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.zIndex = '9999';
    clone.style.opacity = '0.9';
    clone.style.pointerEvents = 'none'; // Чтобы события проходили сквозь клон
    clone.style.boxShadow = '0 10px 20px rgba(0,0,0,0.5)';
    clone.style.transform = 'scale(1.05)';
    clone.classList.add('dragging-clone');
    
    document.body.appendChild(clone);
    
    touchState.value = {
        active: true,
        clone: clone,
        offsetX: touch.clientX - rect.left,
        offsetY: touch.clientY - rect.top
    };
    
    // Делаем оригинал полупрозрачным
    target.style.opacity = '0.3';
};

const onTouchMove = (e) => {
    if (!touchState.value.active) return;
    const touch = e.touches[0];
    
    // Блокируем скролл страницы только если мы реально тащим элемент
    if (e.cancelable) e.preventDefault();
    
    const clone = touchState.value.clone;
    if (clone) {
        clone.style.left = `${touch.clientX - touchState.value.offsetX}px`;
        clone.style.top = `${touch.clientY - touchState.value.offsetY}px`;
    }
};

const onTouchEnd = (e) => {
    if (!touchState.value.active) return;
    const touch = e.changedTouches[0];
    
    // Удаляем клон
    if (touchState.value.clone) {
        document.body.removeChild(touchState.value.clone);
    }
    
    const originalEl = e.currentTarget;
    
    // 🟢 ВАЖНО: Временно скрываем исходный элемент, чтобы elementFromPoint "пробил" его
    // и увидел ячейку под ним (если мы уронили его на то же место или рядом)
    const prevDisplay = originalEl.style.display;
    originalEl.style.display = 'none';
    
    // Ищем элемент под пальцем
    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Восстанавливаем исходный элемент
    originalEl.style.display = prevDisplay;
    originalEl.style.opacity = '1';
    
    touchState.value.active = false;
    
    // Ищем ячейку (.hour-cell)
    const cellEl = targetEl?.closest('.hour-cell');
    
    if (cellEl) {
        const toDateKey = cellEl.getAttribute('data-date-key');
        const toCellIndex = parseInt(cellEl.getAttribute('data-cell-index'));
        
        if (toDateKey && !isNaN(toCellIndex)) {
            emit('drop-operation', {
                operation: props.operation,
                toDateKey: toDateKey,
                toCellIndex: toCellIndex
            });
        }
    }
};
</script>

<template>
  <div 
    class="mobile-cell hour-cell" 
    :data-date-key="dateKey" 
    :data-cell-index="cellIndex"
  >
    <!-- 🟢 FIX: Добавлено условие isOpVisible для скрытия -->
    <div
      v-if="operation && isOpVisible"
      class="op-chip"
      :class="{ 
         transfer: isTransferOp, 
         income: operation.type==='income' && !isWithdrawalOp && !isCreditIncomeOp && !isClosedDealOp, 
         expense: operation.type==='expense' && !isWithdrawalOp && !isTechnicalOp,
         'closed-deal': isClosedDealOp,
         'work-act': isWorkActOp,
         withdrawal: isWithdrawalOp,
         writeoff: isRetailWriteOffOp,
         'credit-income': isCreditIncomeOp 
      }"
      @click.stop="onEditClick($event)"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <template v-if="isTransferOp">
        <span class="amt">{{ formatNumber(Math.abs(displayAmount ?? operation.amount)) }}</span>
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

      <template v-else-if="isWorkActOp">
        <span class="amt">✓ {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="desc">Отработано</span>
      </template>

      <template v-else-if="isCreditIncomeOp">
        <span class="amt">+ {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="desc">Кредит</span>
      </template>

      <template v-else>
        <span class="amt">
          {{ showCheckmark ? '✓ ' : '' }}{{ operation.type === 'income' ? '+' : '-' }} {{ formatNumber(Math.abs(displayAmount ?? operation.amount)) }}
        </span>
        <span class="desc">
          {{ operation.categoryId?.name || 'Без категории' }}
        </span>
      </template>
    </div>
    
    <!-- Пустая ячейка с обработчиком клика -->
    <div v-else class="empty-slot" @click.stop="onAddClick($event)"></div>
  </div>
</template>

<style scoped>
/* Добавлен класс .hour-cell для поиска через closest */
.mobile-cell {
  width: 100%;
  height: 28px;
  border-bottom: 1px solid var(--cell-border, rgba(255,255,255,0.05));
  padding: 2px 4px;
  box-sizing: border-box;
}


.mobile-cell:nth-child(odd) {
  background-color: var(--cell-bg-odd);
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
  background: var(--op-default-bg);
  border: 1px solid var(--op-default-border);
  white-space: nowrap;
}

.amt { font-weight: 700; margin-right: 4px; }
.desc { font-weight: 400; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; }

/* Income - using desktop variables */
.income {
  background: var(--op-income-bg);
  border: 1px solid var(--op-income-border);
}
.income .amt { color: var(--op-income-color); }
.income .desc { color: var(--op-income-meta); }

/* Expense - using desktop variables */
.expense {
  background: var(--op-expense-bg);
  border: 1px solid var(--op-expense-border);
}
.expense .amt { color: var(--op-expense-color); }
.expense .desc { color: var(--op-expense-meta); }

/* Prepayment - using desktop variables */
.prepayment {
  background: var(--op-prepay-bg);
  border: 1px solid var(--op-prepay-border);
}
.prepayment .amt { color: var(--op-prepay-color); }
.prepayment .desc { color: var(--op-prepay-meta); }

/* Closed deal - using desktop variables */
.closed-deal {
  background: var(--op-closed-bg);
  border: 1px solid var(--op-closed-border);
}
.closed-deal .amt { color: var(--op-closed-color); }
.closed-deal .desc { color: var(--op-closed-meta); }

/* Withdrawal - using desktop variables */
.withdrawal {
  background: var(--op-withdrawal-bg);
  border: 1px solid var(--op-withdrawal-border);
}
.withdrawal .amt { color: var(--op-withdrawal-color); }
.withdrawal .desc { color: var(--op-withdrawal-meta); }

/* Write-off */
.writeoff {
  background: var(--op-expense-bg);
  border: 1px solid var(--op-expense-border);
}
.writeoff .amt { color: var(--op-expense-color); }
.writeoff .desc { color: var(--op-expense-meta); }

/* Credit income - using desktop variables */
.credit-income {
  background: var(--op-credit-bg);
  border: 1px solid var(--op-credit-border);
}
.credit-income .amt { color: var(--op-credit-color); }
.credit-income .desc { color: var(--op-credit-meta); }

/* Transfer - using desktop variables */
.transfer {
  background: var(--op-transfer-bg);
  border: 1px solid var(--op-transfer-border);
}
.transfer .amt { color: var(--op-transfer-color); }
.transfer .desc { color: var(--op-transfer-meta); }

/* Work act - using desktop variables */
.work-act {
  background: var(--op-workact-bg);
  border: 1px solid var(--op-workact-border);
}
.work-act .amt { color: var(--op-workact-color); }
.work-act .desc { color: var(--op-workact-meta); }
</style>
```
