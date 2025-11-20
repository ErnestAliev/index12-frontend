<script setup>
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v1.3-LABEL-FIX ---
 * * ВЕРСИЯ: 1.3 - Подписи для предоплат
 * * ДАТА: 2025-11-20
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (FIX) Чип теперь показывает operation.prepaymentId.name, если он есть.
 */

const props = defineProps({
  operation: { type: Object, default: null },
  dateKey: { type: String, required: true },
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

  console.log(`[HourCell] 💧 onDrop в ячейку ${props.cellIndex}.`);

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
      :class="{ transfer: isTransferOp, income: operation.type==='income', expense: operation.type==='expense' }"
      draggable="true"
      @dragstart="onDragStart" @dragend="onDragEnd"
      @click.stop="onEditClick"
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
        
        <!-- 🟢 FIX: Показываем имя категории ИЛИ имя предоплаты -->
        <span class="op-meta">
          {{ operation.categoryId?.name || operation.prepaymentId?.name || 'Без категории' }}
        </span>
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
