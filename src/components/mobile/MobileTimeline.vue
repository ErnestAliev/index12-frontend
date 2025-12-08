<script setup>
import { ref, onMounted, watch, nextTick, computed, onUnmounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import MobileDayColumn from './MobileDayColumn.vue';

// 🟢 FIX: Добавлен 'drop-operation' в emits
const emit = defineEmits(['show-menu', 'drop-operation']);
const mainStore = useMainStore();

const allDays = ref([]);
const visibleDays = ref([]);

const scrollContainer = ref(null);
const windowWidth = ref(window.innerWidth);

const COL_WIDTH_VW = 25; 
const BUFFER_COLS = 4;

// 🟢 1. Флаг для блокировки обратной реакции на скролл
const isProgrammaticScroll = ref(false);

const sameDay = (a, b) => {
    if (!a || !b) return false;
    const d1 = new Date(a);
    const d2 = new Date(b);
    return d1.getFullYear() === d2.getFullYear() && 
           d1.getMonth() === d2.getMonth() && 
           d1.getDate() === d2.getDate();
};

const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;

const generateAllDays = () => {
  const proj = mainStore.projection;
  if (!proj || !proj.rangeStartDate || !proj.rangeEndDate) return;

  const start = new Date(proj.rangeStartDate);
  // 🟢 2. TIMEZONE FIX: Устанавливаем 12:00, чтобы избежать сдвига даты
  start.setHours(12, 0, 0, 0);

  const diffTime = new Date(proj.rangeEndDate).getTime() - start.getTime();
  const totalDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  const days = [];
  const todayReal = new Date();
  
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    // Гарантируем 12:00 для каждого дня
    d.setHours(12, 0, 0, 0);
    
    days.push({
      id: i,
      date: new Date(d),
      isToday: sameDay(d, todayReal),
      dayOfYear: getDayOfYear(d),
      dateKey: _getDateKey(d)
    });
  }
  
  allDays.value = days;
};

const currentPaddingLeft = ref(0);

const updateVisibleDays = () => {
  if (!scrollContainer.value) return;
  
  const scrollLeft = scrollContainer.value.scrollLeft;
  const containerW = scrollContainer.value.clientWidth || windowWidth.value;
  const colWidthPx = (containerW / 100) * COL_WIDTH_VW; 
  
  if (!colWidthPx) return;

  const startIndex = Math.floor(scrollLeft / colWidthPx);
  const endIndex = Math.ceil((scrollLeft + containerW) / colWidthPx);

  const renderStart = Math.max(0, startIndex - BUFFER_COLS);
  const renderEnd = Math.min(allDays.value.length, endIndex + BUFFER_COLS);

  visibleDays.value = allDays.value.slice(renderStart, renderEnd);
  currentPaddingLeft.value = renderStart * COL_WIDTH_VW;
};

// 🟢 3. DEBOUNCE: Таймер для задержки обновления стора
let storeUpdateTimeout = null;

const onScroll = () => {
  // Если скролл вызван программно (например, при загрузке), не обновляем стор
  if (isProgrammaticScroll.value) return;

  // Визуальное обновление (рендеринг колонок) делаем сразу
  window.requestAnimationFrame(() => {
      updateVisibleDays();
  });

  // Обновление глобального состояния откладываем на 150мс после остановки скролла
  clearTimeout(storeUpdateTimeout);
  storeUpdateTimeout = setTimeout(() => {
      updateStorePosition();
  }, 150);
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
           // 🟢 4. CHECK: Обновляем только если день реально изменился
           const currentStoreDate = new Date(mainStore.currentViewDate);
           if (!sameDay(currentStoreDate, day.date)) {
               // Передаем дату с 12:00
               const safeDate = new Date(day.date);
               safeDate.setHours(12, 0, 0, 0);
               mainStore.setCurrentViewDate(safeDate); 
           }
       }
   }
};

const scrollToDate = (targetDate) => {
    if (!scrollContainer.value || allDays.value.length === 0) return;
    
    let idx = allDays.value.findIndex(d => sameDay(d.date, targetDate));
    
    // Fallback: если дата не найдена, ищем сегодня или середину
    if (idx === -1) idx = allDays.value.findIndex(d => d.isToday);
    if (idx === -1) idx = Math.floor(allDays.value.length / 2);
    
    const el = scrollContainer.value;
    const colWidthPx = (el.clientWidth / 100) * COL_WIDTH_VW;
    
    let scrollPos = (idx * colWidthPx) - (el.clientWidth / 2) + (colWidthPx / 2);
    scrollPos = Math.max(0, scrollPos);

    // 🟢 5. OPTIMIZATION: Не скроллим, если уже на месте (погрешность 2px)
    if (Math.abs(el.scrollLeft - scrollPos) < 2) return;

    // Блокируем обратную реакцию onScroll
    isProgrammaticScroll.value = true;
    el.scrollLeft = scrollPos;
    
    // Снимаем блокировку через 300мс (достаточно для завершения инерции)
    setTimeout(() => {
        isProgrammaticScroll.value = false;
    }, 300);

    updateVisibleDays();
};

// Метод для внешнего вызова (например, из графика)
const setScroll = (left) => {
    if (scrollContainer.value) {
        if (Math.abs(scrollContainer.value.scrollLeft - left) < 1) return;
        
        isProgrammaticScroll.value = true;
        scrollContainer.value.scrollLeft = left;
        updateVisibleDays();
        
        // Тут блокировку снимаем быстрее, т.к. это синхронный скролл
        setTimeout(() => { isProgrammaticScroll.value = false; }, 50);
    }
};
defineExpose({ setScroll });

watch(() => mainStore.projection, async (newVal, oldVal) => {
  // Защита от лишних реакций, если объект проекции изменился, но данные те же
  if (oldVal && newVal && newVal.mode === oldVal.mode && newVal.rangeStartDate === oldVal.rangeStartDate) return;

  generateAllDays();
  await nextTick(); 
  
  setTimeout(() => {
      const target = mainStore.currentViewDate ? new Date(mainStore.currentViewDate) : new Date();
      scrollToDate(target); 
  }, 100);
}, { deep: true });

// 🟢 6. DEBOUNCE FETCH: Не грузим данные при быстром скролле
let fetchTimeout = null;
watch(visibleDays, () => {
    clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(() => {
        visibleDays.value.forEach(day => mainStore.fetchOperations(day.dateKey));
    }, 200);
}, { deep: true });

onMounted(() => {
  windowWidth.value = window.innerWidth;
  generateAllDays();
  const initialDate = mainStore.currentViewDate ? new Date(mainStore.currentViewDate) : new Date();
  setTimeout(() => scrollToDate(initialDate), 100);
});

onUnmounted(() => {
    clearTimeout(storeUpdateTimeout);
    clearTimeout(fetchTimeout);
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
    <div class="timeline-scroll-area scroll-touch" ref="scrollContainer" @scroll="onScroll">
      <div class="timeline-wrapper" :style="{ width: `${allDays.length * COL_WIDTH_VW}vw` }">
        <div class="timeline-grid" :style="gridStyle">
          <MobileDayColumn 
            v-for="day in visibleDays"
            :key="day.dateKey"
            :date="day.date"
            :is-today="day.isToday"
            :date-key="day.dateKey"
            @show-menu="(payload) => emit('show-menu', payload)"
            @drop-operation="(payload) => emit('drop-operation', payload)"
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
  -webkit-overflow-scrolling: touch; 
  overscroll-behavior-x: contain;
  touch-action: pan-x;
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