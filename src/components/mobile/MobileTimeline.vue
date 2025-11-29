<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import MobileDayColumn from './MobileDayColumn.vue';

// 🟢 Обновили emit
const emit = defineEmits(['show-menu']);
const mainStore = useMainStore();

// ... (остальной код без изменений)
const today = ref(new Date());
const visibleDays = ref([]);

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;

const viewMode = computed(() => mainStore.projection?.mode || '12d');

const generateDays = () => {
  const mode = viewMode.value;
  const t = new Date(); t.setHours(0,0,0,0);
  
  let total = 12;
  if (mode === '1m') total = 30;
  else if (mode === '3m') total = 90;
  else if (mode === '6m') total = 180;
  else if (mode === '1y') total = 360;
  else total = 12;

  let startDate = new Date(t);
  startDate.setDate(startDate.getDate() - 5);

  const days = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push({
      id: i,
      date: d,
      isToday: sameDay(d, t),
      dateKey: _getDateKey(d)
    });
  }
  visibleDays.value = days;
  days.forEach(day => mainStore.fetchOperations(day.dateKey));
};

watch(viewMode, () => {
  generateDays();
});

onMounted(() => {
  generateDays();
  setTimeout(() => {
      const el = document.querySelector('.timeline-grid');
      if (el) {
          const scrollPos = (window.innerWidth * 0.25) * 4; 
          el.scrollLeft = scrollPos;
      }
  }, 100);
});

const gridStyle = computed(() => {
  return {
    gridTemplateColumns: `repeat(${visibleDays.value.length}, 25vw)`
  };
});
</script>

<template>
  <div class="timeline-container">
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
}
.timeline-grid::-webkit-scrollbar { display: none; }
</style>