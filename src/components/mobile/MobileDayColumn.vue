<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import MobileHourCell from './MobileHourCell.vue';

const props = defineProps({
  date: { type: Date, required: true },
  isToday: { type: Boolean, default: false },
  dateKey: { type: String, required: true }
});

// 🟢 FIX: Добавлен 'drop-operation' в emits
const emit = defineEmits(['show-menu', 'drop-operation']); 
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

const headerDate = computed(() => {
  return props.date.toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
});

const handleShowMenu = (payload) => {
    emit('show-menu', { ...payload, date: props.date });
};
</script>

<template>
  <div class="mobile-day-col" :class="{ today: isToday }">
    <div class="day-header">{{ headerDate }}</div>
    <div class="day-body">
      <!-- 🟢 FIX: Пробрасываем @drop-operation наверх -->
      <MobileHourCell 
        v-for="cell in cells" 
        :key="cell.id"
        :operation="cell.operation"
        :date-key="dateKey"
        :cell-index="cell.id"
        @show-menu="handleShowMenu"
        @drop-operation="(payload) => emit('drop-operation', payload)"
      />
    </div>
  </div>
</template>

<style scoped>
.mobile-day-col {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--color-border, #444);
  background-color: var(--color-background-soft, #282828);
  min-width: 0; 
}

.day-header {
  text-align: center;
  font-size: 11px;
  color: #888;
  padding: 8px 4px;
  border-bottom: 1px solid var(--color-border, #444);
  background-color: var(--color-background, #1a1a1a);
  font-weight: 500;
  text-transform: lowercase;
}

.mobile-day-col.today .day-header {
  color: var(--color-primary, #34c759);
  font-weight: 700;
}

.day-body {
  flex-grow: 1;
  overflow-y: auto; 
  scrollbar-width: none; 
}
.day-body::-webkit-scrollbar { display: none; }
</style>