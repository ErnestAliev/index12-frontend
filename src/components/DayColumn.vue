<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import HourCell from './HourCell.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v1.5-TRUE-TIME-FIX ---
 * * ВЕРСИЯ: 1.5
 * * ДАТА: 2025-12-12
 * * ИЗМЕНЕНИЯ:
 * 1. onDrop: Внедрена логика "Истинного времени".
 * - Для колонки "СЕГОДНЯ" используется new Date() (Сейчас), чтобы избежать рассинхрона с сервером (Слепая зона).
 * - Для остальных дней остается 12:00 (Полдень) для защиты от часовых поясов.
 */

const props = defineProps({
  date: { type: Date, required: true },
  isToday: { type: Boolean, default: false },
  dateKey: { type: String, required: true }
});

const emit = defineEmits(['edit-operation', 'add-operation', 'drop-operation']);

const mainStore = useMainStore();

// --- AI snapshot helpers (timeline) ---
const _pickName = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  return v?.name || v?.title || v?.label || v?.displayName || null;
};

const _normalizeOpForAi = (op) => {
  if (!op || typeof op !== 'object') return null;

  const amount = (typeof op.amount === 'number') ? op.amount : (typeof op.sum === 'number' ? op.sum : null);

  // Prefer explicit date on op; fallback to the column day date
  const d = op.date ? new Date(op.date) : new Date(props.date);
  const dateIso = (!isNaN(d.getTime())) ? d.toISOString().slice(0, 10) : null;

  const n = Number(amount || 0);
  const isTransfer = !!(op.isTransfer || op.type === 'transfer');
  const isWithdrawal = !!(op.isWithdrawal || op.type === 'withdrawal');
  const isTax = !!(op.isTax || op.isTaxPayment || op.type === 'tax');

  // AI-friendly kind: income/expense/transfer/withdrawal/tax/unknown
  let aiKind = 'unknown';
  if (isTransfer) aiKind = 'transfer';
  else if (isWithdrawal) aiKind = 'withdrawal';
  else if (isTax) aiKind = 'tax';
  else if (Number.isFinite(n) && n > 0) aiKind = 'income';
  else if (Number.isFinite(n) && n < 0) aiKind = 'expense';

  return {
    id: op._id || op.id || null,
    type: op.type || null,
    aiKind,
    dateKey: props.dateKey,
    date: dateIso,
    cellIndex: (op.cellIndex ?? null),
    amount: Number.isFinite(n) ? n : null,
    contractor: _pickName(op.contractorId) || _pickName(op.contractor) || _pickName(op.contractorName) || null,
    category: _pickName(op.categoryId) || _pickName(op.category) || _pickName(op.categoryName) || null,
    project: _pickName(op.projectId) || _pickName(op.project) || _pickName(op.projectName) || null,
    company: _pickName(op.companyId) || _pickName(op.company) || _pickName(op.companyName) || null,
    comment: op.comment || op.note || null,
    isTransfer,
    isWithdrawal,
    isTax,
  };
};

const operations = computed(() => {
  return mainStore.getOperationsForDay(props.dateKey);
});

// Expose timeline operations so the desktop AI snapshot builder can pull them
// without relying on any expanded/collapsed widget UI.
const getAiSnapshot = () => {
  const ops = operations.value || [];
  return {
    kind: 'timelineDay',
    dateKey: props.dateKey,
    date: props.date?.toISOString?.().slice(0, 10) || null,
    isToday: !!props.isToday,
    operations: ops.map(_normalizeOpForAi).filter(Boolean)
  };
};

defineExpose({
  getAiSnapshot
});

const cells = computed(() => {
  const cellArray = [];
  const ops = operations.value;

  for (let i = 0; i < 32; i++) { // 🟢 UPDATED: 28 -> 32 rows
    cellArray.push({
      id: i,
      operation: ops.find(op => op.cellIndex === i) || null
    });
  }
  return cellArray;
});

const formattedDate = computed(() => {
  return props.date.toLocaleString('ru-RU', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
});

const onEdit = (operation) => {
  emit('edit-operation', operation);
};

const onAdd = (event, cellIndex) => {
  emit('add-operation', event, cellIndex);
};

// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ: onDrop (TRUE TIME LOGIC) ---
// =================================================================
const onDrop = (dropDataFromHourCell) => {
  // dropDataFromHourCell = { operation, toCellIndex }

  let targetDate;

  if (props.isToday) {
      // 🟢 FIX: Если это колонка СЕГОДНЯ -> используем текущее системное время (new Date()).
      // Это гарантирует, что для сервера операция происходит "сейчас" (или чуть в прошлом),
      // и она будет корректно включена в расчет текущего баланса (Snapshot).
      // Это устраняет "дерганье" виджетов в утренние часы.
      targetDate = new Date();
  } else {
      // 🟢 STANDART: Если это ВЧЕРА или ЗАВТРА -> используем 12:00 (Полдень).
      // Это защита от смены даты на предыдущий/следующий день из-за конвертации часовых поясов (UTC).
      targetDate = new Date(props.date);
      targetDate.setHours(12, 0, 0, 0);
  }

  emit('drop-operation', {
    ...dropDataFromHourCell,
    toDateKey: props.dateKey,
    targetDate: targetDate // Передаем точное вычисленное время
  });
};
</script>

<template>
  <div class="day-column" :class="{ 'today': isToday }">
    <div class="column-header">
      {{ formattedDate }}
    </div>

    <div class="column-body">
      <HourCell
        v-for="cell in cells"
        :key="cell.id"
        :operation="cell.operation"
        :dateKey="props.dateKey" :cellIndex="cell.id"
        @edit-operation="onEdit"
        @add-operation="onAdd"
        @drop-operation="onDrop"
      />
    </div>
  </div>
</template>

<style scoped>
/* (Стили без изменений) */
.day-column {
  flex: 1;
  background-color: var(--day-column-bg);
  border-left: 1px solid var(--day-column-border);
  border-right: 1px solid var(--day-column-border);
}

.column-header {
  padding: 8px;
  text-align: center;
  font-size: 0.9em;
  color: var(--day-header-text);
  border-bottom: 2px solid var(--day-column-border);
  position: sticky;
  top: 0;
  background-color: var(--day-header-bg);
  z-index: 10;
}
.day-column.today .column-header {
  color: var(--day-header-today-text);
  font-weight: bold;
}

/* 🟢 Визуальная граница между прошлым и будущим */
.day-column.today {
  border-right: var(--day-today-border-width) solid var(--day-today-border-color);
}
.column-body {
  /* ... */
}

@media (max-height: 900px) {
  .column-header {
    font-size: 0.7em; 
    padding: 3px 4px; 
  }
}

@media (max-width: 1200px) {
  .column-header {
    font-size: 0.7em; 
  }
}
</style>
