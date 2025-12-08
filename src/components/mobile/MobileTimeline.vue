<script setup>
import { ref, onMounted, watch, nextTick, computed, onUnmounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import MobileDayColumn from './MobileDayColumn.vue';

const emit = defineEmits(['show-menu', 'drop-operation']);
const mainStore = useMainStore();

const allDays = ref([]);
const visibleDays = ref([]);

const scrollContainer = ref(null);
const windowWidth = ref(window.innerWidth);

const COL_WIDTH_VW = 25; 
const BUFFER_COLS = 4;

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
  ('[DEBUG_MT] generateAllDays: START');
  const proj = mainStore.projection;
  
  if (!proj || !proj.rangeStartDate || !proj.rangeEndDate) {
      ('[DEBUG_MT] generateAllDays: SKIP (No projection data)');
      return;
  }

  const start = new Date(proj.rangeStartDate);
  start.setHours(12, 0, 0, 0);

  const diffTime = new Date(proj.rangeEndDate).getTime() - start.getTime();
  const totalDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  (`[DEBUG_MT] generateAllDays: Range calculated. Start: ${start.toISOString()}, TotalDays: ${totalDays}`);

  if (totalDays > 2000 || totalDays < 0) {
      console.warn('[DEBUG_MT] 🚨 ANOMALY: Too many days or negative!', totalDays);
      return;
  }
  
  const days = [];
  const todayReal = new Date();
  
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
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
  (`[DEBUG_MT] generateAllDays: Generated ${days.length} days.`);
};

const currentPaddingLeft = ref(0);

const updateVisibleDays = () => {
  if (!scrollContainer.value) return;
  
  const scrollLeft = scrollContainer.value.scrollLeft;
  const containerW = scrollContainer.value.clientWidth || windowWidth.value;
  if (containerW <= 0) return;

  const colWidthPx = (containerW / 100) * COL_WIDTH_VW; 
  if (!colWidthPx || colWidthPx <= 0) return;

  const startIndex = Math.floor(scrollLeft / colWidthPx);
  const endIndex = Math.ceil((scrollLeft + containerW) / colWidthPx);

  const renderStart = Math.max(0, startIndex - BUFFER_COLS);
  const renderEnd = Math.min(allDays.value.length, endIndex + BUFFER_COLS);

  // (`[DEBUG_MT] updateVisibleDays: Rendering ${renderStart} to ${renderEnd}`); // Spammy log

  visibleDays.value = allDays.value.slice(renderStart, renderEnd);
  currentPaddingLeft.value = renderStart * COL_WIDTH_VW;
};

let storeUpdateTimeout = null;

const onScroll = () => {
  if (isProgrammaticScroll.value) {
      // ('[DEBUG_MT] onScroll: Ignored (programmatic)');
      return;
  }

  window.requestAnimationFrame(() => {
      updateVisibleDays();
  });

  clearTimeout(storeUpdateTimeout);
  storeUpdateTimeout = setTimeout(() => {
      ('[DEBUG_MT] onScroll (Debounced): Calling updateStorePosition');
      updateStorePosition();
  }, 300);
};

const updateStorePosition = () => {
   if (!scrollContainer.value || allDays.value.length === 0) return;
   const el = scrollContainer.value;
   const containerW = el.clientWidth;
   const centerPx = el.scrollLeft + (containerW / 2);
   const colWidthPx = (containerW / 100) * COL_WIDTH_VW; 
   if (!colWidthPx) return;

   const centerIndex = Math.floor(centerPx / colWidthPx);
   
   if (centerIndex >= 0 && centerIndex < allDays.value.length) {
       const day = allDays.value[centerIndex];
       if (day) { 
           const currentStoreDate = new Date(mainStore.currentViewDate);
           if (!sameDay(currentStoreDate, day.date)) {
               (`[DEBUG_MT] updateStorePosition: 🔄 Updating Store Date to ${day.date.toISOString().slice(0,10)}`);
               const safeDate = new Date(day.date);
               safeDate.setHours(12, 0, 0, 0);
               mainStore.setCurrentViewDate(safeDate); 
           } else {
               (`[DEBUG_MT] updateStorePosition: Date match (${day.date.toISOString().slice(0,10)}), no update needed.`);
           }
       }
   }
};

const scrollToDate = (targetDate) => {
    ('[DEBUG_MT] scrollToDate: Target', targetDate);
    if (!scrollContainer.value || allDays.value.length === 0) {
        ('[DEBUG_MT] scrollToDate: Container or days missing');
        return;
    }
    
    let idx = allDays.value.findIndex(d => sameDay(d.date, targetDate));
    if (idx === -1) {
        ('[DEBUG_MT] scrollToDate: Target date not found, checking Today/Center');
        idx = allDays.value.findIndex(d => d.isToday);
    }
    if (idx === -1) idx = Math.floor(allDays.value.length / 2);
    
    (`[DEBUG_MT] scrollToDate: Scrolling to index ${idx}`);

    const el = scrollContainer.value;
    const colWidthPx = (el.clientWidth / 100) * COL_WIDTH_VW;
    if (!colWidthPx) return;
    
    let scrollPos = (idx * colWidthPx) - (el.clientWidth / 2) + (colWidthPx / 2);
    scrollPos = Math.max(0, scrollPos);

    if (Math.abs(el.scrollLeft - scrollPos) < 2) {
        ('[DEBUG_MT] scrollToDate: Already at position');
        return;
    }

    isProgrammaticScroll.value = true;
    el.scrollLeft = scrollPos;
    
    setTimeout(() => { 
        ('[DEBUG_MT] scrollToDate: Programmatic lock released');
        isProgrammaticScroll.value = false; 
    }, 300);
    updateVisibleDays();
};

const setScroll = (left) => {
    if (scrollContainer.value) {
        if (Math.abs(scrollContainer.value.scrollLeft - left) < 1) return;
        isProgrammaticScroll.value = true;
        scrollContainer.value.scrollLeft = left;
        updateVisibleDays();
        setTimeout(() => { isProgrammaticScroll.value = false; }, 50);
    }
};
defineExpose({ setScroll });

watch(() => mainStore.projection, async (newVal, oldVal) => {
  ('[DEBUG_MT] Watcher: projection changed');
  if (!newVal) return;
  
  const toDayStr = (d) => { 
      if (!d) return ''; 
      const date = new Date(d); 
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; 
  };

  let shouldUpdate = !oldVal || newVal.mode !== oldVal.mode;
  
  if (!shouldUpdate && oldVal) {
      const startSame = toDayStr(newVal.rangeStartDate) === toDayStr(oldVal.rangeStartDate);
      const endSame = toDayStr(newVal.rangeEndDate) === toDayStr(oldVal.rangeEndDate);
      
      (`[DEBUG_MT] Watcher: Check dates. StartSame=${startSame}, EndSame=${endSame}`);

      if (!startSame || !endSame) {
          shouldUpdate = true;
      }
  }

  if (!shouldUpdate) {
      ('[DEBUG_MT] Watcher: Update SKIPPED (Same dates/mode)');
      return; 
  }

  ('[DEBUG_MT] Watcher: PROCEEDING to generate days');
  generateAllDays();
  await nextTick(); 
  
  setTimeout(() => {
      const target = mainStore.currentViewDate ? new Date(mainStore.currentViewDate) : new Date();
      scrollToDate(target); 
  }, 100);
}, { deep: true });

const visibleDayKeys = computed(() => visibleDays.value.map(d => d.dateKey).join(','));
let fetchTimeout = null;

watch(visibleDayKeys, () => {
    clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(() => {
        // ('[DEBUG_MT] Fetching operations for visible days...');
        visibleDays.value.forEach(day => mainStore.fetchOperations(day.dateKey));
    }, 200);
});

onMounted(() => {
  ('[DEBUG_MT] onMounted');
  windowWidth.value = window.innerWidth;
  generateAllDays();
  const initialDate = mainStore.currentViewDate ? new Date(mainStore.currentViewDate) : new Date();
  setTimeout(() => scrollToDate(initialDate), 100);
});

onUnmounted(() => {
    ('[DEBUG_MT] onUnmounted');
    clearTimeout(storeUpdateTimeout);
    clearTimeout(fetchTimeout);
});

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${visibleDays.value.length}, ${COL_WIDTH_VW}vw)`,
  paddingLeft: `${currentPaddingLeft.value}vw`,
  height: 'auto',
  minHeight: '100%'
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
  overflow-y: auto;
  
  -webkit-overflow-scrolling: touch; 
  overscroll-behavior-x: contain;
  touch-action: pan-x pan-y;
  scrollbar-width: none; 
}
.timeline-scroll-area::-webkit-scrollbar { display: none; }

.timeline-wrapper {
  height: auto;
  min-height: 100%;
  position: relative;
}

.timeline-grid {
  height: auto;
  min-height: 100%;
  box-sizing: border-box;
}

:deep(.mobile-day-col) {
  height: auto !important;
  min-height: 100% !important;
  overflow: visible !important;
}
:deep(.day-body) {
  overflow: visible !important;
  height: auto !important;
  flex-grow: 0 !important; 
}
:deep(.day-header) {
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 1px 0 rgba(255,255,255,0.1); 
}
</style>