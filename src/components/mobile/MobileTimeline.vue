<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import MobileDayColumn from './MobileDayColumn.vue';

const emit = defineEmits(['op-click', 'op-add']);
const mainStore = useMainStore();

// --- Логика генерации дней (упрощенная версия из HomeView) ---
const today = ref(new Date());
const visibleDays = ref([]);

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;

// Реакция на изменение режима (12д, 1мес и т.д.) через mainStore.projection
const viewMode = computed(() => mainStore.projection?.mode || '12d');

const generateDays = () => {
  const mode = viewMode.value;
  const t = new Date(); t.setHours(0,0,0,0);
  
  // Берем totalDays из стора или дефолт
  let total = 12;
  if (mode === '1m') total = 30;
  else if (mode === '3m') total = 90;
  else if (mode === '6m') total = 180;
  else if (mode === '1y') total = 360;
  else total = 12;

  // Логика смещения: начинаем за 5 дней до сегодня (как в десктопе)
  let startDate = new Date(t);
  startDate.setDate(startDate.getDate() - 5);

  const days = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push({
      id: i,
      date: d,
      isToday: sameDay(d, t),
      dateKey: _getDateKey(d)
    });
  }
  visibleDays.value = days;
  
  // Подгружаем данные
  days.forEach(day => mainStore.fetchOperations(day.dateKey));
};

watch(viewMode, () => {
  generateDays();
});

onMounted(() => {
  generateDays();
  // Скроллим к "сегодня" (5-й день)
  // Небольшая задержка, чтобы DOM отрисовался
  setTimeout(() => {
      const el = document.querySelector('.timeline-grid');
      if (el) {
          // Ширина колонки 25vw. Сегодня это 6-я колонка (индекс 5).
          // Хотим, чтобы она была где-то в начале/центре.
          // 5 * 25vw = 125vw. Скролл на 100vw покажет 5-8 дни.
          const scrollPos = (window.innerWidth * 0.25) * 4; // Скролл на 4 колонки
          el.scrollLeft = scrollPos;
      }
  }, 100);
});

const gridStyle = computed(() => {
  // Ширина каждой колонки 25% от ширины экрана (4 колонки в зоне видимости)
  // Всего колонок: visibleDays.length
  return {
    gridTemplateColumns: `repeat(${visibleDays.value.length}, 25vw)`
  };
});
</script>

<template>
  <div class="timeline-container">
    <div class="timeline-grid" :style="gridStyle">
      <MobileDayColumn 
        v-for="day in visibleDays"
        :key="day.dateKey"
        :date="day.date"
        :is-today="day.isToday"
        :date-key="day.dateKey"
        @op-click="(op) => emit('op-click', op)"
        @op-add="(payload) => emit('op-add', payload)"
      />
    </div>
  </div>
</template>

<style scoped>
.timeline-container {
  width: 100%;
  height: 100%; /* Занимает всю высоту родителя (timeline-area) */
  background-color: var(--color-background, #1a1a1a);
  overflow: hidden;
}

.timeline-grid {
  display: grid;
  height: 100%;
  overflow-x: auto; /* Горизонтальный скролл */
  overflow-y: hidden;
  /* Скрытие скроллбара */
  scrollbar-width: none; 
}
.timeline-grid::-webkit-scrollbar { display: none; }
</style>