<script setup>
import { ref, computed, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import MobileGraphRenderer from '@/components/mobile/MobileGraphRenderer.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v54.0 - EXACT WIDTH MATCH ---
 * * ВЕРСИЯ: 54.0
 * * ИЗМЕНЕНИЯ:
 * 1. Ширина графика теперь рассчитывается точно так же, как у Timeline (25vw * кол-во дней).
 * 2. Убран лишний паддинг или враппер, который мог сбивать синхронизацию.
 */

const emit = defineEmits(['scroll']);
const mainStore = useMainStore();

const visibleDays = ref([]);

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;

const generateDays = () => {
  const proj = mainStore.projection;
  if (!proj || !proj.rangeStartDate || !proj.rangeEndDate) return;

  const start = new Date(proj.rangeStartDate);
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
      dateKey: _getDateKey(d)
    });
  }
  visibleDays.value = days;
};

watch(() => mainStore.projection, generateDays, { deep: true, immediate: true });

const scrollContainer = ref(null);
const onScroll = (e) => { emit('scroll', e.target.scrollLeft); };
const setScroll = (left) => { if (scrollContainer.value) scrollContainer.value.scrollLeft = left; };
defineExpose({ setScroll });

// 🟢 Ширина = Кол-во дней * 25vw. Точное совпадение с MobileTimeline.
const chartWidthStyle = computed(() => ({
  width: `${visibleDays.value.length * 25}vw`,
  height: '100%',
  minWidth: '100%' // Чтобы не схлопывалось
}));
</script>

<template>
  <div class="mobile-chart-section">
    <div class="chart-scroll-area scroll-touch" ref="scrollContainer" @scroll="onScroll">
      <!-- Контейнер графика с точной шириной -->
      <div class="chart-wide-wrapper" :style="chartWidthStyle">
        <MobileGraphRenderer 
          v-if="visibleDays.length"
          :visibleDays="visibleDays"
          :animate="false"
          :showSummaries="true"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-chart-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-background, #1a1a1a);
  border-top: 1px solid var(--color-border, #444);
  min-height: 0; 
  position: relative;
}

.chart-scroll-area {
  flex-grow: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  position: relative;
  width: 100%;
  height: 100%;
  
  /* 🟢 FIX: Инерция и правильная обработка тачей */
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  touch-action: pan-x;
}
.chart-scroll-area::-webkit-scrollbar { display: none; }

.chart-wide-wrapper {
    /* Flex чтобы растянуть график */
    display: flex;
    flex-direction: column;
}
</style>