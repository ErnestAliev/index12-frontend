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

const operations = computed(() => {
  return mainStore.getOperationsForDay(props.dateKey);
});

const cells = computed(() => {
  const cellArray = [];
  const ops = operations.value;
  
  for (let i = 0; i < 24; i++) {
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
  background-color: var(--color-background-soft);
  border-left: 1px solid var(--color-border);
  border-right: 1px solid var(--color-border);
}

.column-header {
  padding: 8px;
  text-align: center;
  font-size: 0.9em;
  color: #aaa;
  border-bottom: 2px solid var(--color-border);
  position: sticky;
  top: 0;
  background-color: var(--color-background-soft);
  z-index: 10;
}
.day-column.today .column-header {
  color: var(--color-primary);
  font-weight: bold;
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