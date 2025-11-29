<script setup>
import { ref, onMounted, watch, nextTick, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import MobileDayColumn from './MobileDayColumn.vue';

const emit = defineEmits(['show-menu']);
const mainStore = useMainStore();

const allDays = ref([]);
const visibleDays = ref([]);
const scrollContainer = ref(null);
const windowWidth = ref(window.innerWidth);

// Константы
const COL_WIDTH_VW = 25; 
const BUFFER_COLS = 4;

const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// 1. Генерация дней (Строго по проекции)
const generateAllDays = () => {
  const proj = mainStore.projection;
  if (!proj || !proj.rangeStartDate || !proj.rangeEndDate) return;

  const start = new Date(proj.rangeStartDate);
  // const end = new Date(proj.rangeEndDate); // Не используется, берем totalDays из diff
  
  // Рассчитываем точное количество дней
  const diffTime = new Date(proj.rangeEndDate).getTime() - start.getTime();
  const totalDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  const days = [];
  const todayReal = new Date();

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    
    days.push({
      id: i,
      date: new Date(d),
      isToday: sameDay(d, todayReal),
      dayOfYear: getDayOfYear(d),
      dateKey: _getDateKey(d)
    });
  }
  
  allDays.value = days;
  updateVisibleDays();
};

// 2. Виртуализация (Ограничена массивом allDays)
const currentPaddingLeft = ref(0);

const updateVisibleDays = () => {
  if (!scrollContainer.value) return;
  
  const scrollLeft = scrollContainer.value.scrollLeft;
  const containerW = scrollContainer.value.clientWidth || windowWidth.value;
  const colWidthPx = (containerW / 100) * COL_WIDTH_VW; 
  
  if (!colWidthPx) return;

  const startIndex = Math.floor(scrollLeft / colWidthPx);
  const endIndex = Math.ceil((scrollLeft + containerW) / colWidthPx);

  // Жесткое ограничение индексов: не выходить за пределы массива
  const renderStart = Math.max(0, startIndex - BUFFER_COLS);
  const renderEnd = Math.min(allDays.value.length, endIndex + BUFFER_COLS);

  visibleDays.value = allDays.value.slice(renderStart, renderEnd);
  currentPaddingLeft.value = renderStart * COL_WIDTH_VW;
};

// 3. Отслеживание позиции (Просто пишем в стор, где мы)
const onScroll = () => {
  window.requestAnimationFrame(() => {
      updateVisibleDays();
      updateStorePosition();
  });
};

const updateStorePosition = () => {
   if (!scrollContainer.value || allDays.value.length === 0) return;
   
   const el = scrollContainer.value;
   const containerW = el.clientWidth;
   const centerPx = el.scrollLeft + (containerW / 2);
   const colWidthPx = (containerW / 100) * COL_WIDTH_VW; 
   
   const centerIndex = Math.floor(centerPx / colWidthPx);
   
   if (centerIndex >= 0 && centerIndex < allDays.value.length) {
       const day = allDays.value[centerIndex];
       if (day) {
           // Пишем только текущую дату просмотра. 
           // Это НЕ сдвигает график, так как setToday не вызывается.
           mainStore.setCurrentViewDate(day.date);
       }
   }
};

// 4. Центрирование (Вызывается только при загрузке или смене режима)
const scrollToDate = (targetDate) => {
    if (!scrollContainer.value || allDays.value.length === 0) return;
    
    // Ищем индекс дня
    let idx = allDays.value.findIndex(d => sameDay(d.date, targetDate));
    
    // Если не нашли (сменился год или диапазон), пытаемся найти "Сегодня" или середину
    if (idx === -1) idx = allDays.value.findIndex(d => d.isToday);
    if (idx === -1) idx = Math.floor(allDays.value.length / 2);
    
    const el = scrollContainer.value;
    const colWidthPx = (el.clientWidth / 100) * COL_WIDTH_VW;
    
    // Центрируем: (позиция элемента) - (половина экрана) + (половина элемента)
    let scrollPos = (idx * colWidthPx) - (el.clientWidth / 2) + (colWidthPx / 2);
    
    // Мгновенный скролл без анимации для жесткой фиксации при смене режима
    el.scrollLeft = Math.max(0, scrollPos);
    updateVisibleDays();
};

// Реакция на изменение данных (Переключение режима)
watch(() => mainStore.projection, async () => {
  generateAllDays();
  await nextTick();
  // При смене режима восстанавливаем позицию на основе того, куда смотрел юзер
  if (mainStore.currentViewDate) {
      scrollToDate(new Date(mainStore.currentViewDate));
  } else {
      scrollToDate(new Date());
  }
}, { deep: true });

// Подгрузка данных при скролле (Только данные, не структура)
watch(visibleDays, () => {
    visibleDays.value.forEach(day => mainStore.fetchOperations(day.dateKey));
}, { deep: true });

onMounted(() => {
  windowWidth.value = window.innerWidth;
  generateAllDays();
  // При первой загрузке скроллим к "Сегодня" или сохраненной дате
  const initialDate = mainStore.currentViewDate ? new Date(mainStore.currentViewDate) : new Date();
  setTimeout(() => scrollToDate(initialDate), 50);
});

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${visibleDays.value.length}, ${COL_WIDTH_VW}vw)`,
  paddingLeft: `${currentPaddingLeft.value}vw`,
  height: '100%'
}));
</script>

<template>
  <div class="timeline-container">
    <div class="timeline-scroll-area" ref="scrollContainer" @scroll="onScroll">
      <!-- Жесткая ширина контейнера = кол-во дней * ширина колонки -->
      <div class="timeline-wrapper" :style="{ width: `${allDays.length * COL_WIDTH_VW}vw` }">
        <div class="timeline-grid" :style="gridStyle">
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
    </div>
  </div>
</template>

<style scoped>
.timeline-container {
  width: 100%;
  height: 100%; 
  background-color: var(--color-background, #1a1a1a);
  overflow: hidden;
  position: relative;
}

.timeline-scroll-area {
  width: 100%;
  height: 100%;
  overflow-x: auto; 
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch; /* Инерция iOS */
  scrollbar-width: none; 
}
.timeline-scroll-area::-webkit-scrollbar { display: none; }

.timeline-wrapper {
  height: 100%;
  position: relative;
}

.timeline-grid {
  height: 100%;
  box-sizing: border-box;
}
</style>