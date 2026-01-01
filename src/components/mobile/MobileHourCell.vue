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

const isClosedDealOp = computed(() => {
    const op = props.operation;
    if (!op) return false;
    if (op.type === 'income' && op.isClosed === true) return true;
    return false;
});

const isPrepaymentOp = computed(() => {
    const op = props.operation;
    if (!op || isTransferOp.value || op.isWithdrawal) return false;
    if (op.type !== 'income') return false;
    if (isClosedDealOp.value) return false;
    if ((op.totalDealAmount || 0) > 0) return true;
    if (op.isDealTranche === true) return true;
    const prepayIds = mainStore.getPrepaymentCategoryIds;
    const catId = op.categoryId?._id || op.categoryId;
    const prepId = op.prepaymentId?._id || op.prepaymentId;
    if ((catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment)) return true;
    if (isRetailClient.value && op.isClosed !== true) return true;
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
  if (op.isDealTranche === true) {
      if (op.description && op.description.includes('транш')) return op.description;
      return 'Транш';
  }
  if (isPrepaymentOp.value) {
      if (isRetailClient.value) return 'Предоплата (Розница)';
      return op.description && op.description.includes('транш') ? op.description : 'Предоплата';
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
         income: operation.type==='income' && !isPrepaymentOp && !isWithdrawalOp && !isCreditIncomeOp && !isClosedDealOp, 
         expense: operation.type==='expense' && !isWithdrawalOp && !isTechnicalOp,
         prepayment: isPrepaymentOp,
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
          {{ showCheckmark ? '✓ ' : '' }}{{ operation.type === 'income' ? '+' : '-' }} {{ formatNumber(Math.abs(operation.amount)) }}
        </span>
        <span class="desc">
          {{ isPrepaymentOp ? (isRetailClient ? 'Предоплата' : 'Транш/Аванс') : (operation.categoryId?.name || 'Без категории') }}
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

/* 🟢 Оранжевый */
.prepayment { background: rgba(255, 157, 0, 0.1); }
.prepayment .amt { color: #FF9D00; }

/* 🟢 Зеленый (Закрытые) */
.closed-deal { background: rgba(52, 199, 89, 0.1); }
.closed-deal .amt { color: #34c759; }

.withdrawal { background: #2F3340; }
.withdrawal .amt { color: #DE8FFF; }
.withdrawal .desc { color: #B085D0; }

.writeoff .amt { color: #ef4444; }

.credit-income { background: #2F3340; }
.credit-income .amt { color: #8FD4FF; }
.credit-income .desc { color: #8FD4FF; opacity: 0.8; }

.transfer { background: #2F3340; }
.transfer .amt { color: #d4d8e3; }
.transfer .desc { color: #98a2b3; }

/* 🟢 АКТ ВЫПОЛНЕННЫХ РАБОТ */
.work-act { background: rgba(80, 80, 80, 0.15); }
.work-act .amt { color: #90c990; }
.work-act .desc { color: #a0a0a0; }
</style>