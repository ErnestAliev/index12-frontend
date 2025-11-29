<script setup>
import { computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';

const emit = defineEmits(['action', 'open-graph']);
const mainStore = useMainStore();

const viewModes = [
  { key: '12d', num: '12', unit: 'ДНЕЙ' },
  { key: '1m',  num: '1',  unit: 'МЕСЯЦ' },
  { key: '3m',  num: '3',  text: 'МЕСЯЦА', unit: 'МЕСЯЦА' },
  { key: '6m',  num: '6',  text: 'МЕСЯЦЕВ', unit: 'МЕСЯЦЕВ' },
  { key: '1y',  num: '1',  unit: 'ГОД' }
];

const viewModeKey = computed(() => mainStore.projection?.mode || '12d');

const currentViewIndex = computed(() => {
    const idx = viewModes.findIndex(v => v.key === viewModeKey.value);
    return idx !== -1 ? idx : 0;
});

const currentDisplay = computed(() => viewModes[currentViewIndex.value]);

// 🟢 SMART DATE CALCULATION
// Определяет правильный год для сохраненного дня года (DOY)
// на основе текущего отображаемого диапазона.
const getCurrentDate = () => {
    const currentDay = mainStore.todayDayOfYear || 1;
    
    // Берем "опорный" год из текущей проекции (где пользователь находится сейчас)
    // Если проекции нет, берем текущий календарный год.
    let refYear = new Date().getFullYear();
    if (mainStore.projection && mainStore.projection.rangeStartDate) {
        refYear = new Date(mainStore.projection.rangeStartDate).getFullYear();
    }

    // Создаем варианты дат для этого DOY в разных годах (текущий, пред, след)
    const candidates = [
        createDateFromDOY(refYear, currentDay),
        createDateFromDOY(refYear + 1, currentDay),
        createDateFromDOY(refYear - 1, currentDay)
    ];

    // Ищем тот вариант, который ближе всего к центру текущего диапазона
    // Это решает проблему "прыжка в 2025", когда мы уже в 2026.
    let rangeCenter = new Date();
    if (mainStore.projection && mainStore.projection.rangeStartDate && mainStore.projection.rangeEndDate) {
        const start = new Date(mainStore.projection.rangeStartDate).getTime();
        const end = new Date(mainStore.projection.rangeEndDate).getTime();
        rangeCenter = new Date((start + end) / 2);
    }

    // Находим кандидата с минимальной разницей во времени
    const closest = candidates.reduce((prev, curr) => {
        return (Math.abs(curr - rangeCenter) < Math.abs(prev - rangeCenter) ? curr : prev);
    });

    return closest;
};

// Хелпер: создать дату из года и дня года
const createDateFromDOY = (year, dayOfYear) => {
    const date = new Date(year, 0); // 1 января
    date.setDate(dayOfYear);
    return date;
};

const switchViewMode = async (direction) => {
    let nextIndex = currentViewIndex.value + direction;
    
    if (nextIndex >= viewModes.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = viewModes.length - 1;
    
    const newMode = viewModes[nextIndex].key;
    
    // 🟢 Используем умный расчет даты
    const currentDate = getCurrentDate();

    // 1. Обновляем проекцию мгновенно
    mainStore.updateFutureProjectionByMode(newMode, currentDate);
    
    // 2. Запускаем фоновую загрузку
    mainStore.loadCalculationData(newMode, currentDate);
};

const openGraph = () => emit('open-graph');
const toggleWidgets = () => mainStore.toggleHeaderExpansion();

onMounted(async () => {
    if (!mainStore.projection?.mode) {
        const today = new Date();
        const start = new Date(today.getFullYear(), 0, 0);
        const diff = (today - start) + ((start.getTimezoneOffset() - today.getTimezoneOffset()) * 60 * 1000);
        const oneDay = 1000 * 60 * 60 * 24;
        const todayDay = Math.floor(diff / oneDay);
        
        mainStore.setToday(todayDay);
        mainStore.updateFutureProjectionByMode('12d', today);
        mainStore.loadCalculationData('12d', today);
    }
});
</script>

<template>
  <div class="mobile-action-panel-wrapper">
    <div class="chart-controls-row">
      <!-- Левая кнопка: График -->
      <button class="icon-circle clickable" @click="openGraph">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><rect x="3" y="12" width="6" height="8"></rect><rect x="9" y="8" width="6" height="12"></rect><rect x="15" y="4" width="6" height="16"></rect></svg>
      </button>
      
      <!-- Центр: Переключатель режимов -->
      <div class="nav-center">
        <button class="arrow-btn" @click="switchViewMode(-1)">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        
        <div class="period-label" @click="switchViewMode(1)">
          <span class="days-num">{{ currentDisplay.num }}</span>
          <span class="days-text">{{ currentDisplay.unit || currentDisplay.text }}</span>
        </div>
        
        <button class="arrow-btn" @click="switchViewMode(1)">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <!-- Правая кнопка: Виджеты -->
      <button 
        class="header-expand-btn" 
        :class="{ 'active': mainStore.isHeaderExpanded }"
        @click="toggleWidgets"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mobile-action-panel-wrapper {
  display: flex;
  flex-direction: column;
  background-color: var(--color-background-soft, #282828);
  border-top: 1px solid var(--color-border, #444);
  flex-shrink: 0;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
}

.chart-controls-row {
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
}

.nav-center { display: flex; align-items: center; gap: 20px; }
.arrow-btn { 
    background: none; border: none; padding: 10px;
    cursor: pointer; display: flex; align-items: center; justify-content: center; 
}
.arrow-btn:active { opacity: 0.7; transform: scale(0.95); }

.period-label { 
    display: flex; flex-direction: column; align-items: center; 
    cursor: pointer; line-height: 1; user-select: none; width: 70px;
}
.days-num { font-size: 20px; font-weight: 700; color: #fff; }
.days-text { font-size: 9px; color: #888; font-weight: 600; text-transform: uppercase; margin-top: 2px; }

.icon-circle, .header-expand-btn {
  width: 36px; height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: center;
  color: #aaa; background: transparent; padding: 0; cursor: pointer;
  transition: all 0.2s;
}
.icon-circle:active, .header-expand-btn:active { background-color: rgba(255,255,255,0.1); color: #fff; border-color: #fff; }

.header-expand-btn.active {
  color: var(--color-primary, #34c759);
  border-color: var(--color-primary, #34c759);
  background: rgba(52, 199, 89, 0.1);
}
</style>