<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import HourCell from './HourCell.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v1.3-FULL-TOUCH-DRAG-FIX ---
 * * ВЕРСИЯ: 1.3 - Финальное исправление Drag-n-Drop для планшетов.
 * * ДАТА: 2025-11-16
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (LOGIC) onDropFromHourCell переименован в onDrop для HourCell.
 * 2. (LOGIC) onColumnDrop добавлен для обработки Drop на саму колонку (например, при touch).
 * 3. (TEMPLATE) Колонка DayColumn теперь является drop-зоной (@dragover.prevent, @drop="onColumnDrop").
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
// --- 🔴 ИСПРАВЛЕНИЕ: onDrop (для HourCell) ---
// =================================================================
const onDrop = (dropDataFromHourCell) => {
  // dropDataFromHourCell = { operation, toCellIndex }
  // HomeView (v4.6) ожидает { operation, toCellIndex, toDateKey }
  
  console.log(`[DayColumn] 💧 onDrop (ИЗ ЯЧЕЙКИ) в ${props.dateKey}.`);

  // Если HourCell передал toDateKey, значит это Touch Drop, который уже знает точную цель
  if (dropDataFromHourCell.toDateKey) {
     emit('drop-operation', dropDataFromHourCell);
     return;
  }

  // Если toDateKey не передан, то это Mouse Drop внутри колонки или на HourCell.
  emit('drop-operation', {
    ...dropDataFromHourCell,
    toDateKey: props.dateKey // 🟢 ДОБАВЛЯЕМ КЛЮЧ ДАТЫ
  });
};


// =================================================================
// --- 🟢 НОВОЕ: onColumnDrop для самой колонки (для тача/пустого места) ---
// =================================================================
const onColumnDrop = (event) => {
  event.preventDefault(); 
  
  const raw = event.dataTransfer.getData('application/json'); 
  if (!raw) return;
  
  let operationData = null; 
  try { operationData = JSON.parse(raw); } catch { return; }
  
  // Если операция уже содержит toDateKey, значит это touch, который прошел
  // через HourCell, но упал на пустое место. HourCell уже обработал сброс
  // в onTouchEnd, но мы должны убедиться, что HomeView получит данные.
  if (operationData.toDateKey) {
    emit('drop-operation', operationData);
    return;
  }
  
  // Это Drop на пустое место в колонке (Mouse Drop).
  // Мы берем первую свободную ячейку.
  console.log(`[DayColumn] 💧 onColumnDrop (НА ПУСТОЕ МЕСТО) в ${props.dateKey}.`);
  
  emit('drop-operation', {
    operation: operationData,
    toCellIndex: 0, 
    toDateKey: props.dateKey 
  });
};

</script>

<template>
  <div 
    class="day-column" 
    :class="{ 'today': isToday }"
    @dragover.prevent 
    @drop="onColumnDrop"
  >
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
  /* min-width: 150px; (🟢 УДАЛЕНО: Это исправляет "сломанные 12 колонок") */
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

/* === 🟢 НАЧАЛО ИЗМЕНЕНИЙ (ШРИФТЫ ДЛЯ ПЛАНШЕТА v1.5) === */
@media (max-height: 900px) {
  .column-header {
    font-size: 0.7em; /* Агрессивное уменьшение */
    padding: 3px 4px; /* Уменьшаем отступы */
  }
}

/* 🔴 ИЗМЕНЕНИЕ (v1.5): Адаптация под ширину (960px - 1200px) */
@media (max-width: 1200px) {
  .column-header {
    font-size: 0.7em; /* 🔴 Уменьшаем шрифт */
  }
}
/* === 🟢 КОНЕЦ ИЗМЕНЕНИЙ === */
</style>
