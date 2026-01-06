<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';

const mainStore = useMainStore();

const props = defineProps({
  showWidgetsToggle: { type: Boolean, default: true },
  showChartIcon: { type: Boolean, default: true } // 🟢 Настройка скрытия левой иконки
});

const emit = defineEmits(['range-change']);

const viewModes = ['12d', '1m', '3m', '6m', '1y'];
const displayModes = { '12d': '12 ДНЕЙ', '1m': '1 МЕС', '3m': '3 МЕС', '6m': '6 МЕС', '1y': '1 ГОД' };

const viewMode = computed(() => mainStore.projection?.mode || '12d');

const displayModeText = computed(() => displayModes[viewMode.value] || '12 ДНЕЙ');
const displayNum = computed(() => displayModeText.value.split(' ')[0]);
const displayText = computed(() => displayModeText.value.split(' ')[1]);

// Переключение режима (циклично)
const switchViewMode = async () => {
    const currentIndex = viewModes.indexOf(viewMode.value);
    const nextIndex = (currentIndex + 1) % viewModes.length;
    const newMode = viewModes[nextIndex];
    
    const currentTodayDate = new Date(); 
    
    mainStore.setCurrentViewDate(currentTodayDate);
    
    const start = new Date(currentTodayDate.getFullYear(), 0, 0);
    const diff = (currentTodayDate - start) + ((start.getTimezoneOffset() - currentTodayDate.getTimezoneOffset()) * 60 * 1000);
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    mainStore.setToday(dayOfYear);

    // Обновляем UI (текст на кнопке)
    await mainStore.updateFutureProjectionByMode(newMode, currentTodayDate);
    
    // Грузим данные
    mainStore.loadCalculationData(newMode, currentTodayDate);
    
    // Сообщаем родителю
    emit('range-change');
};

// Сдвиг периода (Стрелки)
const shiftPeriod = async (direction) => {
    const year = new Date().getFullYear();
    const currentDay = mainStore.todayDayOfYear || 0;
    const date = new Date(year, 0); 
    date.setDate(currentDay > 0 ? currentDay : new Date().getDate());

    if (viewMode.value === '12d') {
        date.setDate(date.getDate() + (direction * 1)); 
    } else {
        const step = viewMode.value.includes('m') ? parseInt(viewMode.value) : 1;
        date.setMonth(date.getMonth() + (direction * step));
    }

    const newDayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    
    mainStore.setToday(newDayOfYear);
    mainStore.setCurrentViewDate(date);
    
    await mainStore.updateFutureProjectionByMode(viewMode.value, date);
    mainStore.loadCalculationData(viewMode.value, date);
    
    emit('range-change');
};

const toggleWidgets = () => {
    mainStore.toggleHeaderExpansion();
};
</script>

<template>
  <div class="chart-controls-panel">
    
    <!-- 🟢 Левая иконка: показываем только если разрешено -->
    <div v-if="showChartIcon" class="icon-circle">
       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><rect x="3" y="12" width="6" height="8"></rect><rect x="9" y="8" width="6" height="12"></rect><rect x="15" y="4" width="6" height="16"></rect></svg>
    </div>
    <!-- Плейсхолдер, чтобы центровка не сбивалась -->
    <div v-else class="icon-circle spacer"></div>
    
    <!-- Центр -->
    <div class="nav-center">
      <button class="arrow-btn" @click="shiftPeriod(-1)">
         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      
      <div class="period-label" @click="switchViewMode">
        <span class="days-num">{{ displayNum }}</span>
        <span class="days-text">{{ displayText }}</span>
      </div>
      
      <button class="arrow-btn" @click="shiftPeriod(1)">
         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>

    <!-- Правая кнопка -->
    <button v-if="showWidgetsToggle" class="icon-circle clickable" @click="toggleWidgets" :class="{ active: mainStore.isHeaderExpanded }">
       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
       </svg>
    </button>
    <div v-else class="icon-circle spacer"></div>
  </div>
</template>

<style scoped>
.chart-controls-panel {
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  background-color: var(--widget-background, #ffffff);
  border-top: 1px solid var(--widget-border, #e0e0e0);
}

.nav-center {
  display: flex;
  align-items: center;
  gap: 20px;
}

.arrow-btn {
  background: none; border: none; padding: 5px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.arrow-btn:active { opacity: 0.7; }

.period-label {
  display: flex; flex-direction: column; align-items: center;
  cursor: pointer; line-height: 1; user-select: none;
}

.days-num {
  font-size: 20px; font-weight: 700; color: var(--color-text, #fff);
}

.days-text {
  font-size: 9px; color: var(--text-mute, #888); font-weight: 600;
  text-transform: uppercase; margin-top: 2px;
}

.icon-circle {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: center;
  color: #aaa;
  transition: all 0.2s;
}
.icon-circle.clickable { cursor: pointer; }
.icon-circle.active { 
  background-color: rgba(255,255,255,0.1); 
  border-color: #fff; 
  color: #fff; 
}
.icon-circle.spacer {
    border-color: transparent;
    pointer-events: none;
}
</style>