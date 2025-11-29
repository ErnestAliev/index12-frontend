<script setup>
import { ref, computed, onMounted, watch } from 'vue';
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

const viewMode = computed(() => mainStore.projection?.mode || '12d');
const currentToday = computed(() => {
    const year = new Date().getFullYear();
    const date = new Date(year, 0);
    // Если todayDayOfYear не задан, берем сегодня
    const day = mainStore.todayDayOfYear || getDayOfYear(new Date());
    date.setDate(day);
    return date;
});

const generateDays = () => {
  const t = currentToday.value;
  let startDate = new Date(t);
  startDate.setDate(startDate.getDate() - 5);

  const days = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push({
      id: i,
      date: d,
      isToday: sameDay(d, new Date()),
      dateKey: _getDateKey(d)
    });
  }
  visibleDays.value = days;
};

// Реактивность
watch(() => mainStore.todayDayOfYear, generateDays);
watch(viewMode, generateDays);

onMounted(() => {
  generateDays();
});

// Скролл
const scrollContainer = ref(null);
const onScroll = (e) => { emit('scroll', e.target.scrollLeft); };
const setScroll = (left) => { if (scrollContainer.value) scrollContainer.value.scrollLeft = left; };
defineExpose({ setScroll });
</script>

<template>
  <div class="mobile-chart-section">
    <div class="chart-scroll-area" ref="scrollContainer" @scroll="onScroll">
      <div class="chart-wide-wrapper">
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
  min-height: 0; /* Важно для Flexbox */
}

.chart-scroll-area {
  flex-grow: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  position: relative;
}
.chart-scroll-area::-webkit-scrollbar { display: none; }

.chart-wide-wrapper {
  height: 100%;
  width: 300vw; /* 12 колонок */
}
</style>