<script setup>
import { ref, onMounted, watch, nextTick, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import MobileDayColumn from './MobileDayColumn.vue';

const emit = defineEmits(['show-menu']);
const mainStore = useMainStore();

// "Полный" список дней (все данные)
const allDays = ref([]);
// "Видимый" список дней (только те, что рендерим сейчас)
const visibleDays = ref([]);

const scrollContainer = ref(null);
const windowWidth = ref(window.innerWidth);

// Константы виртуализации
const COL_WIDTH_VW = 25; // Ширина одной колонки в VW
const BUFFER_COLS = 4;   // Сколько колонок рендерить за краями экрана (прелоад)

// --- Хелперы ---
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;

// 🟢 ГЕНЕРАЦИЯ ВСЕХ ДНЕЙ (ДАННЫЕ)
const generateAllDays = () => {
  const proj = mainStore.projection;
  if (!proj || !proj.rangeStartDate || !proj.rangeEndDate) return;

  const start = new Date(proj.rangeStartDate);
  const end = new Date(proj.rangeEndDate);
  
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  const totalDays = diffDays + 1;
  
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
  
  allDays.value = days;
  updateVisibleDays(); // Первичный расчет видимых
};

// 🟢 ВИРТУАЛИЗАЦИЯ: Расчет видимых колонок
const updateVisibleDays = () => {
  if (!scrollContainer.value) return;
  
  const scrollLeft = scrollContainer.value.scrollLeft;
  const containerW = scrollContainer.value.clientWidth || windowWidth.value;
  
  // Ширина одной колонки в пикселях
  const colWidthPx = (containerW / 100) * COL_WIDTH_VW; 
  if (!colWidthPx) return;

  // Индексы
  const startIndex = Math.floor(scrollLeft / colWidthPx);
  const endIndex = Math.ceil((scrollLeft + containerW) / colWidthPx);

  // Добавляем буфер
  const renderStart = Math.max(0, startIndex - BUFFER_COLS);
  const renderEnd = Math.min(allDays.value.length, endIndex + BUFFER_COLS);

  // Вырезаем кусок
  visibleDays.value = allDays.value.slice(renderStart, renderEnd);
  
  // Сдвиг сетки, чтобы компенсировать пропущенные колонки
  currentPaddingLeft.value = renderStart * COL_WIDTH_VW;
};

// 🟢 НОВОЕ: Загрузка данных для видимых дней
// Если данных нет в кеше, загружаем их точечно
const fetchVisibleData = () => {
    visibleDays.value.forEach(day => {
        // Проверяем, есть ли данные в кеше магазина
        // (Функция fetchOperations сама проверяет кеш, так что можно вызывать безопасно)
        mainStore.fetchOperations(day.dateKey);
    });
};

const currentPaddingLeft = ref(0);

// Скролл хендлер
const onScroll = () => {
  window.requestAnimationFrame(updateVisibleDays);
};

// Центрирование (переписано под виртуализацию)
const scrollToCenter = () => {
    if (scrollContainer.value && allDays.value.length > 0) {
        const el = scrollContainer.value;
        const colWidthPx = (el.clientWidth / 100) * COL_WIDTH_VW;
        
        const todayIndex = allDays.value.findIndex(d => d.isToday);
        
        let targetScroll = 0;
        if (todayIndex !== -1) {
            targetScroll = (todayIndex * colWidthPx) - (el.clientWidth / 2) + (colWidthPx / 2);
        } else {
            const totalWidthPx = allDays.value.length * colWidthPx;
            targetScroll = (totalWidthPx / 2) - (el.clientWidth / 2);
        }
        
        el.scrollLeft = targetScroll > 0 ? targetScroll : 0;
        updateVisibleDays(); // Форсируем обновление после прыжка
    }
};

// Вотчеры
watch(() => mainStore.projection, () => {
  generateAllDays();
  nextTick(() => {
      scrollToCenter();
  });
}, { deep: true, immediate: true });

// Когда меняются видимые дни, пробуем подгрузить данные
watch(visibleDays, () => {
    fetchVisibleData();
}, { deep: true });

onMounted(() => {
  windowWidth.value = window.innerWidth;
  generateAllDays();
  setTimeout(scrollToCenter, 100);
});

// Динамические стили для эмуляции полной ширины
const spacerStyle = computed(() => ({
  width: `${allDays.value.length * COL_WIDTH_VW}vw`,
  height: '1px' // Распорка только для ширины
}));

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
      
      <!-- Контейнер-обертка с реальной шириной контента -->
      <div class="timeline-wrapper" :style="{ width: `${allDays.length * COL_WIDTH_VW}vw` }">
        
        <!-- Сетка с видимыми колонками и отступом слева -->
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
  scrollbar-width: none; 
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch; 
}
.timeline-scroll-area::-webkit-scrollbar { display: none; }

.timeline-wrapper {
  height: 100%;
  position: relative;
  /* Ширина задается инлайново */
}

.timeline-grid {
  /* Grid template и padding-left задаются инлайново для виртуализации */
  height: 100%;
  box-sizing: border-box;
}
</style>