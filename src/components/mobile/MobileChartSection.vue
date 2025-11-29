<script setup>
import { ref, computed, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import GraphRenderer from '@/components/GraphRenderer.vue';

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

// 🟢 ГЕНЕРАЦИЯ ДНЕЙ ДЛЯ ГРАФИКА
// Полностью дублирует логику MobileTimeline для идеальной синхронизации.
// График строится на тех же данных projection, что и таймлайн.
const generateDays = () => {
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
  visibleDays.value = days;
};

// Следим за изменениями в сторе
watch(() => mainStore.projection, generateDays, { deep: true, immediate: true });

// Скролл
const scrollContainer = ref(null);
const onScroll = (e) => { emit('scroll', e.target.scrollLeft); };
const setScroll = (left) => { if (scrollContainer.value) scrollContainer.value.scrollLeft = left; };
defineExpose({ setScroll });

// Динамическая ширина: 25vw на 1 день (как в MobileTimeline)
// Это гарантирует, что столбцы графика будут точно под колонками дней.
const chartWidthStyle = computed(() => ({
  width: `${visibleDays.value.length * 25}vw`,
  height: '100%'
}));
</script>

<template>
  <div class="mobile-chart-section">
    <div class="chart-scroll-area" ref="scrollContainer" @scroll="onScroll">
      <div class="chart-wide-wrapper" :style="chartWidthStyle">
        <!-- Передаем visibleDays в рендерер, он сам построит график -->
        <GraphRenderer 
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
}

.chart-scroll-area {
  flex-grow: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  position: relative;
}
.chart-scroll-area::-webkit-scrollbar { display: none; }

/* .chart-wide-wrapper ширина задается инлайново через :style */
</style>