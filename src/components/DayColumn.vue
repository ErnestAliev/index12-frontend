<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import HourCell from './HourCell.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v1.4-DROP-NOON-FIX ---
 * * ВЕРСИЯ: 1.4 - Фикс прыжков времени
 * * ДАТА: 2025-12-03
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. onDrop: Теперь `targetDate` устанавливается строго на 12:00 (Полдень).
 * Это гарантирует, что дата останется в пределах того же дня при любых конвертациях UTC.
 * Позиционирование по вертикали теперь полностью зависит от `toCellIndex`.
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
// --- 🔴 ИСПРАВЛЕНИЕ: onDrop ---
// =================================================================
const onDrop = (dropDataFromHourCell) => {
  // dropDataFromHourCell = { operation, toCellIndex }
  
  // 🟢 FIX: Устанавливаем целевую дату на 12:00:00 того же дня.
  // Это предотвращает смещение на предыдущий день из-за часовых поясов (UTC+5/6),
  // так как 00:00 локального времени может стать 18:00 прошлого дня в UTC.
  const targetDate = new Date(props.date);
  targetDate.setHours(12, 0, 0, 0);

  // (`[DayColumn] 💧 onDrop Safe. DateKey: ${props.dateKey}, Cell: ${dropDataFromHourCell.toCellIndex}, TargetDate(Noon): ${targetDate}`);

  emit('drop-operation', {
    ...dropDataFromHourCell,
    toDateKey: props.dateKey,
    targetDate: targetDate // Дата фиксирует День, CellIndex фиксирует Позицию
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
/* (Стили я не менял, они идентичны твоим из v1.1) */
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
  /* (Стили не менялись) */
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