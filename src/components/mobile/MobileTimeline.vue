<script setup>
import { ref, onMounted, watch, nextTick, computed } from 'vue';
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

// 🟢 ГЕНЕРАЦИЯ ДНЕЙ ИЗ ПРОЕКЦИИ СТОРА
// Это ключевой момент синхронизации. Мы не придумываем даты сами,
// а берем ровно тот диапазон, который рассчитал стор при смене режима.
const generateDays = () => {
  const proj = mainStore.projection;
  // Если проекция не готова, не рисуем ничего
  if (!proj || !proj.rangeStartDate || !proj.rangeEndDate) return;

  const start = new Date(proj.rangeStartDate);
  const end = new Date(proj.rangeEndDate);
  
  // Вычисляем количество дней в диапазоне (включительно)
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  const totalDays = diffDays + 1; // +1 чтобы включить конечную дату
  
  const days = [];
  const todayReal = new Date();

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    
    days.push({
      id: i,
      date: new Date(d),
      isToday: sameDay(d, todayReal),
      dateKey: _getDateKey(d)
    });
  }
  
  visibleDays.value = days;
};

// Центрирование скролла на "сегодня" или на середину диапазона
const scrollToCenter = () => {
    if (scrollContainer.value) {
        const el = scrollContainer.value;
        // Ширина одной колонки = 25vw
        const colWidthVW = 25; 
        const windowW = window.innerWidth;
        const colWidthPx = (windowW * colWidthVW) / 100;
        
        // Находим индекс сегодняшнего дня, если он есть в списке
        const todayIndex = visibleDays.value.findIndex(d => d.isToday);
        
        let targetScroll = 0;
        if (todayIndex !== -1) {
            // Центрируем на сегодня: позиция дня - половина экрана + половина ширины дня
            targetScroll = (todayIndex * colWidthPx) - (windowW / 2) + (colWidthPx / 2);
        } else {
            // Иначе просто на середину всего списка
            const totalWidthPx = visibleDays.value.length * colWidthPx;
            targetScroll = (totalWidthPx / 2) - (windowW / 2);
        }
        
        el.scrollLeft = targetScroll > 0 ? targetScroll : 0;
    }
};

// Следим за изменениями проекции (это происходит при переключении режима в ActionPanel)
watch(() => mainStore.projection, () => {
  generateDays();
  nextTick(() => {
      scrollToCenter();
  });
}, { deep: true, immediate: true });

onMounted(() => {
  generateDays();
  setTimeout(scrollToCenter, 100);
});

// Динамический стиль сетки
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