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

// Храним полную дату центрального элемента для точного восстановления
const currentCenterDate = ref(new Date());
// Флаг для блокировки событий скролла при программной прокрутке
const ignoreScrollEvents = ref(false);

const COL_WIDTH_VW = 25; 
const BUFFER_COLS = 4;

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
      dayOfYear: getDayOfYear(d),
      dateKey: _getDateKey(d)
    });
  }
  
  allDays.value = days;
  // Сразу обновляем видимые дни для корректной отрисовки DOM
  updateVisibleDays();
};

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

const fetchVisibleData = () => {
    visibleDays.value.forEach(day => {
        mainStore.fetchOperations(day.dateKey);
    });
};

const currentPaddingLeft = ref(0);

const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

const updateCenterDate = debounce(() => {
    if (!scrollContainer.value || allDays.value.length === 0) return;
    
    const el = scrollContainer.value;
    const containerW = el.clientWidth;
    const centerPx = el.scrollLeft + (containerW / 2);
    const colWidthPx = (containerW / 100) * COL_WIDTH_VW; 
    
    if (!colWidthPx) return;

    const centerIndex = Math.floor(centerPx / colWidthPx);
    
    if (centerIndex >= 0 && centerIndex < allDays.value.length) {
        const centerDay = allDays.value[centerIndex];
        if (centerDay) {
            currentCenterDate.value = new Date(centerDay.date);
            
            // 🟢 ВАЖНО: Просто обновляем метку "текущий просмотр"
            // Не трогаем mainStore.setToday(), чтобы не сдвигать проекцию
            mainStore.setCurrentViewDate(centerDay.date);
        }
    }
}, 150);

const onScroll = () => {
  if (ignoreScrollEvents.value) return; 
  window.requestAnimationFrame(updateVisibleDays);
  updateCenterDate();
};

const scrollToCenter = () => {
    if (scrollContainer.value && allDays.value.length > 0) {
        const el = scrollContainer.value;
        ignoreScrollEvents.value = true; // Блокируем обновление state от скролла

        const colWidthPx = (el.clientWidth / 100) * COL_WIDTH_VW;
        
        // 1. Ищем точную дату (год+месяц+день)
        let targetIndex = allDays.value.findIndex(d => sameDay(d.date, currentCenterDate.value));
        
        // 2. Если нет точной, ищем по DOY (на случай смены года в логике)
        if (targetIndex === -1) {
             targetIndex = allDays.value.findIndex(d => d.dayOfYear === mainStore.todayDayOfYear);
        }
        // 3. Fallback: Сегодня
        if (targetIndex === -1) {
            targetIndex = allDays.value.findIndex(d => d.isToday);
        }
        // 4. Fallback: Середина
        if (targetIndex === -1) {
            targetIndex = Math.floor(allDays.value.length / 2);
        }
        
        let targetScroll = 0;
        if (targetIndex !== -1) {
            targetScroll = (targetIndex * colWidthPx) - (el.clientWidth / 2) + (colWidthPx / 2);
        }
        
        el.scrollLeft = targetScroll > 0 ? targetScroll : 0;
        
        updateVisibleDays();

        // Разблокируем через небольшую паузу
        setTimeout(() => {
            ignoreScrollEvents.value = false;
        }, 200);
    }
};

// Следим за изменением проекции (данных)
watch(() => mainStore.projection, async () => {
  generateAllDays();
  await nextTick();
  // Двойной RAF для гарантии пересчета стилей браузером
  requestAnimationFrame(() => {
      requestAnimationFrame(() => {
          scrollToCenter();
      });
  });
}, { deep: true });

watch(visibleDays, () => {
    fetchVisibleData();
}, { deep: true });

onMounted(() => {
  windowWidth.value = window.innerWidth;
  
  // Инициализация центральной даты
  if (mainStore.currentViewDate) {
      currentCenterDate.value = new Date(mainStore.currentViewDate);
  } else if (mainStore.todayDayOfYear) {
      const projStart = mainStore.projection?.rangeStartDate ? new Date(mainStore.projection.rangeStartDate) : new Date();
      const year = projStart.getFullYear();
      const d = new Date(year, 0); 
      d.setDate(mainStore.todayDayOfYear);
      currentCenterDate.value = d;
  } else {
      currentCenterDate.value = new Date();
  }

  generateAllDays();
  setTimeout(scrollToCenter, 100);
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
  scrollbar-width: none; 
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch; 
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