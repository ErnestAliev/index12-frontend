<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import HourCell from './HourCell.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v1.2-YEAR-AWARE-FIX ---
 * * ВЕРСИЯ: 1.2 - Исправление "слепоты к году" (dayOfYear -> dateKey)
 * * ДАТА: 2025-11-10
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (ARCH) Компонент теперь принимает `dateKey` ("YYYY-DOY") вместо `dayOfYear`.
 * 2. (API) `operations` computed теперь использует `mainStore.getOperationsForDay(props.dateKey)`.
 * 3. (API) `onDrop` теперь перехватывает событие и добавляет `toDateKey: props.dateKey`,
 * как того ожидает HomeView (v4.6+).
 * 4. (ARCH) Передает `dateKey` вниз в `HourCell.vue`.
 */

const props = defineProps({
  date: { type: Date, required: true },
  isToday: { type: Boolean, default: false },
  // dayOfYear: { type: Number, required: true } // 🔴 УДАЛЕНО
  dateKey: { type: String, required: true } // 🟢 ДОБАВЛЕНО
});

const emit = defineEmits(['edit-operation', 'add-operation', 'drop-operation']);

const mainStore = useMainStore();

const operations = computed(() => {
  // 🔴 ИЗМЕНЕНО: Используем dateKey
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
  // HomeView (v4.6) ожидает { operation, toCellIndex, toDateKey }
  
  console.log(`[DayColumn] 💧 onDrop в ${props.dateKey}.`);

  emit('drop-operation', {
    ...dropDataFromHourCell,
    toDateKey: props.dateKey // 🟢 ДОБАВЛЯЕМ КЛЮЧ ДАТЫ
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
  min-width: 150px; 
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
</style>