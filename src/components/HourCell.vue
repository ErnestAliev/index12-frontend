<script setup>
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v1.5-FINAL-ABSOLUTE-TOUCH-FIX ---
 * * ВЕРСИЯ: 1.5 - Окончательный переход на прямое управление Pinia из Touch-событий.
 * * ДАТА: 2025-11-16
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (CRITICAL) onTouchStart: Добавлен event.preventDefault() в самом начале,
 * чтобы агрессивно блокировать нативные жесты скроллинга/зума (основная причина сбоя в режиме планшета).
 * 2. (CRITICAL) Удалены все обработчики Drag-and-Drop (onDragStart, onDrop и т.д.)
 * и emit('drop-operation').
 * 3. (LOGIC) onTouchEnd напрямую вызывает mainStore.moveOperation.
 */

const props = defineProps({
  operation: { type: Object, default: null },
  dateKey: { type: String, required: true },
  cellIndex: { type: Number, required: true }
});

const emit = defineEmits(['edit-operation', 'add-operation']); 

const mainStore = useMainStore();

const isDragOver = ref(false); 

/* UI-детектор перевода (без изменений) */
const isTransferOp = computed(() => {
  const op = props.operation;
  if (!op) return false;
  if (op.type?.toLowerCase?.() === 'transfer') return true;
  if (op.isTransfer === true) return true;
  if (op.transferGroupId) return true;
  const cat = op.categoryId?.name?.toLowerCase?.() || '';
  return cat === 'перевод' || cat === 'transfer';
});

const fromAccountName = computed(() =>
  props.operation?.fromAccountId?.name || props.operation?.fromAccountId || ''
);
const toAccountName = computed(() =>
  props.operation?.toAccountId?.name || props.operation?.toAccountId || ''
);

/* Клики (без изменений) */
const onAddClick = (event) => emit('add-operation', event, props.cellIndex);
const onEditClick = () => {
  if (!props.operation) return;
  emit('edit-operation', props.operation);
};

/* * DnD для Мыши (Mouse) * /
/ * 🔴 ВСЕ ОБРАБОТЧИКИ D&D УДАЛЕНЫ */

// =================================================================
// --- 🟢 НОВЫЙ КОД: Обработчики для сенсорного Drag & Drop ---
// =================================================================

let dragInProgress = false;
let touchTimeout = null;
let originalOperation = null; 

const onTouchStart = (event) => {
  if (props.operation) {
    // 🟢 КРИТИЧЕСКИЙ ФИКС: Агрессивно блокируем нативные жесты сразу
    // Это должно решить проблему с невозможностью начать drag в режиме планшета.
    event.preventDefault(); 
    event.stopPropagation();
    
    originalOperation = props.operation;

    // 2. Устанавливаем таймер для имитации "долгого нажатия"
    touchTimeout = setTimeout(() => {
      dragInProgress = true;
      event.currentTarget.style.opacity = '0.5';
      
      event.currentTarget.dataset.originalDateKey = props.dateKey;
      event.currentTarget.dataset.originalCellIndex = props.cellIndex;
      
      console.log('[HourCell] 🖐️ Long-tap START (Direct Mode)');
    }, 500); 
  }
};

const onTouchMove = (event) => {
  // Отмена Long-tap, если началось движение
  if (touchTimeout && !dragInProgress) {
    clearTimeout(touchTimeout);
    touchTimeout = null;
    return;
  }
  
  if (dragInProgress) {
    event.preventDefault();
    
    const touch = event.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    const newTargetCell = targetElement.closest('.hour-cell');

    let currentTarget = null;
    
    if (newTargetCell) {
        currentTarget = newTargetCell;
    }
    
    if (currentTarget) {
        const targetCellIndex = currentTarget.dataset.cellIndex;
        const targetDateKey = currentTarget.dataset.dateKey;
        
        if (currentTarget.classList.contains('drag-over') === false) {
            document.querySelectorAll('.hour-cell').forEach(c => c.classList.remove('drag-over'));
            currentTarget.classList.add('drag-over');
        }
        
        event.currentTarget.dataset.dropTarget = targetCellIndex;
        event.currentTarget.dataset.dropTargetKey = targetDateKey;
    }
  }
};

const onTouchEnd = (event) => {
  // 1. Обработка обычного клика (если не было dragInProgress)
  if (touchTimeout && !dragInProgress) {
    clearTimeout(touchTimeout);
    if (props.operation) {
      onEditClick();
    } else {
      onAddClick(event);
    }
    return;
  }
  
  // 2. Обработка Drop
  if (dragInProgress) {
    dragInProgress = false;
    event.currentTarget.style.opacity = '1';
    document.querySelectorAll('.hour-cell').forEach(c => c.classList.remove('drag-over'));
    
    const targetCellIndex = event.currentTarget.dataset.dropTarget;
    const targetDateKey = event.currentTarget.dataset.dropTargetKey;
    const originalDateKey = event.currentTarget.dataset.originalDateKey;
    const originalCellIndex = event.currentTarget.dataset.originalCellIndex;
    
    if (originalOperation && targetCellIndex && targetDateKey && originalDateKey) {
      const newCellIndex = Number(targetCellIndex);
      const oldCellIndex = Number(originalCellIndex);

      console.log(`[HourCell] 🖐️ Tap END/DROP: ${originalDateKey}:${oldCellIndex} -> ${targetDateKey}:${newCellIndex}`);
      
      // 🟢 КРИТИЧЕСКИЙ ШАГ: ПРЯМОЙ ВЫЗОВ moveOperation (минуя D&D и emit)
      if (originalDateKey !== targetDateKey || oldCellIndex !== newCellIndex) {
          // Мы не ждем await, так как нам нужно мгновенно освободить UI
          mainStore.moveOperation(
              originalOperation, 
              originalDateKey, 
              targetDateKey, 
              newCellIndex
          );
      }
    }
    
    // Очистка
    originalOperation = null;
    delete event.currentTarget.dataset.dropTarget;
    delete event.currentTarget.dataset.dropTargetKey;
    delete event.currentTarget.dataset.originalDateKey;
    delete event.currentTarget.dataset.originalCellIndex;
    event.preventDefault(); 
  }
};

const onTouchCancel = () => {
  if (touchTimeout) { clearTimeout(touchTimeout); touchTimeout = null; }
  dragInProgress = false;
  originalOperation = null;
  document.querySelectorAll('.hour-cell').forEach(c => c.classList.remove('drag-over'));
};

</script>

<template>
  <div
    class="hour-cell"
    :class="{ 'drag-over': isDragOver }"
    
    :data-date-key="dateKey" 
    :data-cell-index="cellIndex"
  >
    <div
      v-if="operation"
      class="operation-chip"
      :class="{ transfer: isTransferOp, income: operation.type==='income', expense: operation.type==='expense' }"
      
      @click.stop="onEditClick"
      @touchstart.stop="onTouchStart" @touchmove.stop="onTouchMove" @touchend.stop="onTouchEnd" @touchcancel.stop="onTouchCancel"
      
      draggable="false"
      @dragstart.prevent @dragend.prevent @dragover.prevent @dragleave.prevent @drop.prevent
    >
      <template v-if="isTransferOp">
        <span class="op-title">Перевод</span>
        <span class="op-meta">
          {{ fromAccountName }} → {{ toAccountName }}
          <template v-if="operation.amount"> · {{ formatNumber(Math.abs(operation.amount)) }}</template>
        </span>
      </template>

      <template v-else>
        <span class="op-amount">
          {{ operation.type === 'income' ? '+' : '-' }} {{ formatNumber(Math.abs(operation.amount)) }}
        </span>
        <span class="op-meta">{{ operation.categoryId?.name }}</span>
      </template>
    </div>

    <div v-else class="cell-empty-space" @click="onAddClick($event)">&nbsp;</div>
  </div>
</template>

<style scoped>
/* (Стили я не менял, они идентичны твоим) */
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
  /* 🟢 СТИЛИ ДЛЯ БЛОКИРОВКИ НАТИВНОГО D&D */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -khtml-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  touch-action: none; 
}
.operation-chip:active { cursor:grabbing; }
.operation-chip:hover { background:#4a4a4c; }

.op-amount { font-weight:bold; margin-right:6px; white-space:nowrap; }
.op-meta { color:#aaa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* Цвета для обычных операций */
.income .op-amount { color: var(--color-primary); }
.expense .op-amount { color: var(--color-danger); }

/* Нейтральный перевод */
.transfer { background:#2f3340; }
.transfer:hover { background:#3a3f50; }
.transfer .op-title { font-weight:600; margin-right:6px; color:#d4d8e3; }
.transfer .op-meta { color:#98a2b3; }

/* === 🟢 НАЧАЛО ИЗМЕНЕНИЙ (ШРИФТЫ ДЛЯ ПЛАНШЕТА v1.4) === */
@media (max-height: 900px) {
  .hour-cell {
    padding: 2px 4px; /* Агрессивное уменьшение */
    height: 28px; /* Делаем ячейку еще ниже */
  }
  .operation-chip {
    font-size: 0.7em; /* Агрессивное уменьшение шрифта */
    padding: 3px 6px; 
  }
  .op-amount, .op-title {
    margin-right: 4px; 
  }
}

/* 🔴 ИЗМЕНЕНИЕ (v1.4): Адаптация под ширину (960px - 1200px) */
@media (max-width: 1200px) {
  .hour-cell {
    padding: 4px 6px;
  }
  .operation-chip {
    font-size: 0.7em; /* 🔴 Уменьшаем шрифт чипа */
    padding: 3px 6px;
  }
}
/* === 🟢 КОНЕЦ ИЗМЕНЕНИЙ === */
</style>
