<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import YAxisPanel from '@/components/YAxisPanel.vue';
import GraphRenderer from '@/components/GraphRenderer.vue';

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const isLoading = ref(true);
const yAxisLabels = ref([]);
const currentViewMode = ref('12d');
const today = ref(new Date());
const visibleDays = ref([]);

// --- Navigation Logic (Horizontal for Mobile) ---
const viewModes = ['12d', '1m', '3m', '6m', '1y'];
const displayModes = { '12d': '12 ДНЕЙ', '1m': '1 МЕС', '3m': '3 МЕС', '6m': '6 МЕС', '1y': '1 ГОД' };

const displayModeText = computed(() => displayModes[currentViewMode.value] || '12 ДНЕЙ');

const switchViewMode = (direction) => {
    const currentIndex = viewModes.indexOf(currentViewMode.value);
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = viewModes.length - 1;
    if (nextIndex >= viewModes.length) nextIndex = 0;
    
    onChangeView(viewModes[nextIndex]);
};

// --- Helpers ---
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;

const rangeTotal = computed(() => {
  let total = (mainStore.accounts || []).reduce((acc, item) => acc + (item.initialBalance || 0), 0);
  if (!visibleDays.value || visibleDays.value.length === 0) return total;

  const lastVisibleDate = visibleDays.value[visibleDays.value.length - 1].date;
  const lastVisibleTime = lastVisibleDate.getTime();

  if (mainStore.dailyChartData && mainStore.dailyChartData.size > 0) {
      const entries = Array.from(mainStore.dailyChartData.values());
      entries.sort((a, b) => a.date - b.date);
      for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].date.getTime() <= lastVisibleTime) {
              total = entries[i].closingBalance;
              break; 
          }
      }
  }
  return total;
});

const rangeTotalString = computed(() => {
  const val = rangeTotal.value;
  const formatted = formatNumber(Math.abs(val));
  return val < 0 ? `- ${formatted} ₸` : `${formatted} ₸`;
});

const dateInfoPart = computed(() => {
  let endDateStr = '';
  if (visibleDays.value && visibleDays.value.length > 0) {
    const end = visibleDays.value[visibleDays.value.length - 1].date;
    const fullDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
    endDateStr = fullDate.format(end);
  } else {
    endDateStr = '...';
  }
  return `до ${endDateStr}`;
});

const generateVisibleDays = (mode) => {
  const modeDays = mainStore.computeTotalDaysForMode ? mainStore.computeTotalDaysForMode(mode, today.value) : 12;
  const baseDate = new Date(today.value);
  let startDate = new Date(baseDate);
  
  switch (mode) {
    case '12d': startDate.setDate(startDate.getDate() - 5); break;
    case '1m':  startDate.setDate(startDate.getDate() - 15); break;
    case '3m':  startDate.setDate(startDate.getDate() - 45); break;
    case '6m':  startDate.setDate(startDate.getDate() - 90); break;
    case '1y':  startDate.setDate(startDate.getDate() - 180); break;
    default:    startDate.setDate(startDate.getDate() - 5);
  }

  const days = [];
  for (let i = 0; i < modeDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push({
      id: i,
      date: d,
      isToday: sameDay(d, today.value),
      dayOfYear: getDayOfYear(d),
      dateKey: _getDateKey(d)
    });
  }
  visibleDays.value = days;
};

const loadGraphData = async (mode) => {
  isLoading.value = true;
  await nextTick();
  try {
    if (mainStore.loadCalculationData) {
      await mainStore.loadCalculationData(mode, today.value);
    }
    generateVisibleDays(mode);
  } catch (error) {
    console.error("MobileGraphModal: Error loading data:", error);
  } finally {
    isLoading.value = false;
  }
};

const onChangeView = (newMode) => {
  if (newMode === currentViewMode.value) return;
  currentViewMode.value = newMode;
  loadGraphData(newMode);
};

onMounted(() => {
  // Use today from store if available to match main view
  if (mainStore.todayDayOfYear) {
      const year = new Date().getFullYear();
      const date = new Date(year, 0);
      date.setDate(mainStore.todayDayOfYear);
      today.value = date;
  } else {
      const t = new Date(); t.setHours(0, 0, 0, 0); today.value = t;
  }
  loadGraphData('12d');
});
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content mobile-graph-content">
      
      <!-- Header with Navigation and Close -->
      <div class="modal-header">
        <div class="nav-controls">
            <button class="nav-arrow" @click="switchViewMode(-1)">‹</button>
            <span class="nav-current">{{ displayModeText }}</span>
            <button class="nav-arrow" @click="switchViewMode(1)">›</button>
        </div>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>
      
      <!-- Summary Info -->
      <div class="info-bar">
         <span class="range-total">{{ rangeTotalString }}</span>
         <span class="date-info">{{ dateInfoPart }}</span>
      </div>
      
      <div class="graph-modal-body">
        <!-- Y-Axis (Fixed Left) -->
        <aside class="modal-left-panel">
          <div class="y-axis-wrapper">
             <YAxisPanel :yLabels="yAxisLabels" :bottom-padding="0" />
          </div>
        </aside>

        <!-- Main Graph Area -->
        <main class="modal-main-content">
          <div v-if="isLoading" class="loading-indicator">
            <div class="spinner"></div>
            <p>Загрузка...</p>
          </div>
          <div v-else class="graph-wrapper">
            <GraphRenderer
              v-if="visibleDays.length"
              :visibleDays="visibleDays"
              @update:yLabels="yAxisLabels = $event"
              :animate="true"
              :show-summaries="false"
            />
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.9);
  display: flex; align-items: center; justify-content: center;
  z-index: 3000; backdrop-filter: blur(5px);
}

.modal-content {
  width: 100%; height: 100%; 
  background: var(--color-background); 
  display: flex; flex-direction: column; overflow: hidden;
}

.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; border-bottom: 1px solid var(--color-border);
  background-color: var(--color-background-soft);
  height: 50px; flex-shrink: 0;
}

.nav-controls {
    display: flex; align-items: center; gap: 15px;
}
.nav-arrow {
    background: none; border: 1px solid #444; border-radius: 4px;
    color: #fff; font-size: 18px; width: 30px; height: 30px;
    display: flex; align-items: center; justify-content: center;
    padding: 0; cursor: pointer;
}
.nav-current {
    font-size: 13px; font-weight: 600; color: #fff; text-transform: uppercase;
}

.close-btn {
  background: none; border: none; font-size: 32px;
  color: var(--color-text-soft); cursor: pointer; padding: 0; line-height: 1;
}

.info-bar {
    padding: 10px 16px; 
    background-color: var(--color-background);
    border-bottom: 1px solid var(--color-border);
    display: flex; align-items: baseline; gap: 10px;
    flex-shrink: 0;
}
.range-total { font-size: 20px; font-weight: 700; color: #fff; }
.date-info { font-size: 13px; color: var(--color-primary); }

.graph-modal-body {
  flex-grow: 1; display: flex; overflow: hidden;
  background-color: var(--color-background);
  position: relative;
}

/* ЛЕВАЯ ПАНЕЛЬ (ТОЛЬКО ОСЬ Y) */
.modal-left-panel {
  width: 45px; /* Узкая панель для мобилки */
  flex-shrink: 0;
  display: flex; flex-direction: column;
  background-color: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
  z-index: 2;
}
.y-axis-wrapper {
  flex-grow: 1; min-height: 0; position: relative;
}

/* ОСНОВНАЯ ОБЛАСТЬ */
.modal-main-content {
  flex-grow: 1; display: flex; flex-direction: column;
  overflow: hidden; position: relative;
}
.graph-wrapper {
  flex-grow: 1; width: 100%; height: 100%;
  padding: 0; box-sizing: border-box;
}

.loading-indicator {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--color-text);
}
.spinner {
  width: 30px; height: 30px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>