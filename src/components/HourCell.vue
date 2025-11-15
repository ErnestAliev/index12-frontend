<script setup>
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v1.2-TOUCH-DRAG-FIX ---
 * * ВЕРСИЯ: 1.2 - Добавлена поддержка Drag-n-Drop для планшетов (Touch Events).
 * * ДАТА: 2025-11-16
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (ARCH) Добавлены функции onTouchStart/Move/End/Cancel для эмуляции
 * логики перетаскивания (Long-tap = DragStart) на сенсорных экранах.
 * 2. (TEMPLATE) В элемент .operation-chip добавлены @touchstart, @touchmove, @touchend.
 * 3. (TEMPLATE) В элемент .hour-cell добавлены data-date-key и data-cell-index
 * для корректного определения цели сброса при touch-перетаскивании.
 */

const props = defineProps({
  operation: { type: Object, default: null },
  // dayOfYear: { type: Number, required: true }, // 🔴 УДАЛЕНО
  dateKey: { type: String, required: true }, // 🟢 ДОБАВЛЕНО
  cellIndex: { type: Number, required: true }
});

const emit = defineEmits(['edit-operation', 'add-operation', 'drop-operation']);
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

/* * DnD для Мыши (Mouse) * */
const onDragStart = (event) => {
  if (!props.operation) return;
  // `props.operation` УЖЕ содержит `dateKey`
  event.dataTransfer.setData('application/json', JSON.stringify(props.operation));
  event.dataTransfer.effectAllowed = 'move';
  event.currentTarget.style.opacity = '0.5';
};
const onDragEnd = (event) => { event.currentTarget.style.opacity = '1'; };
const onDragOver = (event) => { event.preventDefault(); isDragOver.value = true; event.dataTransfer.dropEffect = 'move'; };
const onDragLeave = () => { isDragOver.value = false; };

// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ: onDrop ---
// =================================================================
const onDrop = (event) => {
  event.preventDefault(); isDragOver.value = false;
  const raw = event.dataTransfer.getData('application/json'); if (!raw) return;
  let operationData = null; try { operationData = JSON.parse(raw); } catch { return; }
  if (!operationData || !operationData._id) return;

  console.log(`[HourCell] 💧 onDrop в ячейку ${props.cellIndex}.`);

  // 🔴 ИЗМЕНЕНО:
  // Мы больше не отправляем `toDayOfYear`.
  // DayColumn (v1.2+) перехватит это и добавит `toDateKey`.
  emit('drop-operation', {
    operation: operationData,
    toCellIndex: props.cellIndex 
  });
};

// =================================================================
// --- 🟢 НОВЫЙ КОД: Обработчики для сенсорного Drag & Drop ---
// (Эмулируем drag-n-drop через touch events)
// =================================================================

let dragInProgress = false;
let touchTimeout = null;

const onTouchStart = (event) => {
  if (props.operation) {
    // 1. Не даем браузеру начать скроллинг/масштабирование (если это не долгий тап)
    event.stopPropagation();
    
    // 2. Устанавливаем таймер для имитации "долгого нажатия" (если движение начнется раньше, таймер отменится)
    touchTimeout = setTimeout(() => {
      // Это имитация dragstart
      dragInProgress = true;
      event.currentTarget.style.opacity = '0.5';
      
      // Создаем фейковое событие DragStart и прикрепляем данные
      const fakeEvent = {
        dataTransfer: {
          setData: (type, data) => event.currentTarget.dataset.dragData = data,
          effectAllowed: 'move',
        },
        currentTarget: event.currentTarget,
      };
      
      fakeEvent.dataTransfer.setData('application/json', JSON.stringify(props.operation));
      console.log('[HourCell] 🖐️ Long-tap START');
      
      // Предотвращаем дальнейший скроллинг
      event.preventDefault(); 
    }, 500); // 500ms - время "долгого нажатия"
  }
};

const onTouchMove = (event) => {
  // Если еще не перетаскиваем и таймаут установлен, отменяем "долгий тап"
  if (touchTimeout && !dragInProgress) {
    clearTimeout(touchTimeout);
    touchTimeout = null;
    return; // Разрешаем скроллинг
  }
  
  if (dragInProgress) {
    // 1. Блокируем скроллинг страницы
    event.preventDefault();
    
    // 2. Имитация DragOver: находим элемент под пальцем
    const touch = event.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);

    // 3. Если это другая ячейка - делаем ее `drag-over`
    const newTargetCell = targetElement.closest('.hour-cell');
    
    // Проверяем, чтобы новая цель была не пустым местом в DayColumn
    if (newTargetCell) {
        const targetCellIndex = newTargetCell.dataset.cellIndex;
        const targetDateKey = newTargetCell.dataset.dateKey;

        // Если ячейка сменилась ИЛИ это другая дата
        const isNewTarget = newTargetCell !== document.querySelector('.hour-cell.drag-over');

        if (isNewTarget) {
            document.querySelectorAll('.hour-cell').forEach(c => c.classList.remove('drag-over'));
            newTargetCell.classList.add('drag-over');
        
            // Сохраняем целевые данные
            event.currentTarget.dataset.dropTarget = targetCellIndex;
            event.currentTarget.dataset.dropTargetKey = targetDateKey;
        }
    }
  }
};

const onTouchEnd = (event) => {
  // Если не было таймаута (т.е. это обычный тап/клик), но и не было dragInProgress
  if (touchTimeout && !dragInProgress) {
    clearTimeout(touchTimeout);
    // Имитация обычного клика (на Add или Edit)
    // Если есть операция -> Edit, иначе -> Add
    if (props.operation) {
      onEditClick();
    } else {
      onAddClick(event);
    }
    return;
  }
  
  if (dragInProgress) {
    // 1. Имитация DragEnd
    dragInProgress = false;
    event.currentTarget.style.opacity = '1';
    document.querySelectorAll('.hour-cell').forEach(c => c.classList.remove('drag-over'));
    
    // 2. Имитация Drop
    const targetCellIndex = event.currentTarget.dataset.dropTarget;
    const dragData = event.currentTarget.dataset.dragData;

    if (dragData && targetCellIndex) {
      let operationData = null; try { operationData = JSON.parse(dragData); } catch { return; }
      if (!operationData || !operationData._id) return;
      
      console.log(`[HourCell] 🖐️ Tap END/DROP в ячейку ${targetCellIndex}.`);

      // Вызываем onDrop с фейковым событием DataTransfer
      onDrop({
          preventDefault: () => {},
          dataTransfer: {
              getData: () => dragData
          }
      });
    }
    
    // Очистка
    delete event.currentTarget.dataset.dropTarget;
    delete event.currentTarget.dataset.dropTargetKey;
    delete event.currentTarget.dataset.dragData;
    
    // Если это был Long-tap + Drop, нам не нужно, чтобы это становилось кликом
    event.preventDefault(); 
  }
};

const onTouchCancel = () => {
  if (touchTimeout) { clearTimeout(touchTimeout); touchTimeout = null; }
  dragInProgress = false;
  document.querySelectorAll('.hour-cell').forEach(c => c.classList.remove('drag-over'));
};

</script>

<template>
  <div
    class="hour-cell"
    :class="{ 'drag-over': isDragOver }"
    @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop"
    :data-date-key="dateKey" 
    :data-cell-index="cellIndex"
  >
    <div
      v-if="operation"
      class="operation-chip"
      :class="{ transfer: isTransferOp, income: operation.type==='income', expense: operation.type==='expense' }"
      draggable="true"
      @dragstart="onDragStart" @dragend="onDragEnd"
      @click.stop="onEditClick"
      @touchstart.stop="onTouchStart" @touchmove.stop="onTouchMove" @touchend.stop="onTouchEnd" @touchcancel.stop="onTouchCancel"
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
  /* 🟢 НОВЫЙ СТИЛЬ: Отключаем нативный drag-n-drop и выделение на touch-устройствах */
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
