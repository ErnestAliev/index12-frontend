<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import MobileDayColumn from './MobileDayColumn.vue';

const emit = defineEmits(['show-menu']);
const mainStore = useMainStore();

const visibleDays = ref([]);
const scrollContainer = ref(null);

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;

// 🟢 СТРОГАЯ СИНХРОНИЗАЦИЯ С ГРАФИКОМ
// Мы строим дни на основе проекции, рассчитанной в сторе (updateFutureProjectionByMode).
// Это гарантирует, что начало и конец таймлайна совпадают с датами в заголовке "Всего".
const generateDays = () => {
  const proj = mainStore.projection;
  if (!proj || !proj.rangeStartDate || !proj.rangeEndDate) return;

  const start = new Date(proj.rangeStartDate);
  const end = new Date(proj.rangeEndDate);
  
  // Рассчитываем количество дней между датами
  // Добавляем 1, т.к. разница дат 13-13 = 0, но это 1 день
  const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  
  const days = [];
  const todayReal = new Date();

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    
    days.push({
      id: i,
      date: new Date(d),
      isToday: sameDay(d, todayReal), // Подсветка реального "сегодня"
      dateKey: _getDateKey(d)
    });
  }
  
  visibleDays.value = days;
  
  // 🟢 ВАЖНО: Убран индивидуальный fetch. Данные загружаются оптом в ActionPanel.
};

const scrollToCenter = () => {
    if (scrollContainer.value) {
        const el = scrollContainer.value;
        const totalWidthVW = visibleDays.value.length * 25; // 25vw ширина колонки
        const centerVW = totalWidthVW / 2;
        const scrollPos = (centerVW * window.innerWidth / 100) - (window.innerWidth / 2);
        el.scrollLeft = scrollPos > 0 ? scrollPos : 0;
    }
};

// Реактивно обновляем сетку при любом изменении проекции (даты или режима)
watch(() => mainStore.projection, () => {
  generateDays();
  // Скроллим к центру только если изменился режим (длина массива сильно изменилась)
  // Для плавности при навигации можно добавить условия, но для старта это надежно.
  nextTick(() => {
      // Центрируем, если это смена режима
      scrollToCenter();
  });
}, { deep: true, immediate: true });

onMounted(() => {
  generateDays();
  setTimeout(scrollToCenter, 100);
});

const gridStyle = computed(() => {
  return {
    gridTemplateColumns: `repeat(${visibleDays.value.length}, 25vw)`
  };
});
</script>

<template>
  <div class="timeline-container">
    <div class="timeline-grid" ref="scrollContainer" :style="gridStyle">
      <MobileDayColumn 
        v-for="day in visibleDays"
        :key="day.dateKey"
        :date="day.date"
        :is-today="day.isToday"
        :date-key="day.dateKey"
        @show-menu="(payload) => emit('show-menu', payload)"
      />
    </div>
  </div>
</template>

<style scoped>
.timeline-container {
  width: 100%;
  height: 100%; 
  background-color: var(--color-background, #1a1a1a);
  overflow: hidden;
}

.timeline-grid {
  display: grid;
  height: 100%;
  overflow-x: auto; 
  overflow-y: hidden;
  scrollbar-width: none; 
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch; 
}
.timeline-grid::-webkit-scrollbar { display: none; }
</style>