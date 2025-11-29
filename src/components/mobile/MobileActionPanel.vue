<script setup>
import { computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';

const emit = defineEmits(['action', 'open-graph']);
const mainStore = useMainStore();

// Режимы (Строго как в Desktop)
const viewModes = [
  { key: '12d', num: '12', unit: 'ДНЕЙ' },
  { key: '1m',  num: '1',  unit: 'МЕСЯЦ' },
  { key: '3m',  num: '3',  text: 'МЕСЯЦА', unit: 'МЕСЯЦА' },
  { key: '6m',  num: '6',  text: 'МЕСЯЦЕВ', unit: 'МЕСЯЦЕВ' },
  { key: '1y',  num: '1',  unit: 'ГОД' }
];

// Текущий режим из стора
const viewModeKey = computed(() => mainStore.projection?.mode || '12d');

const currentViewIndex = computed(() => {
    return viewModes.findIndex(v => v.key === viewModeKey.value);
});

const currentDisplay = computed(() => {
    const idx = currentViewIndex.value !== -1 ? currentViewIndex.value : 0;
    return viewModes[idx];
});

// Получение текущей даты
const getCurrentDate = () => {
    const year = new Date().getFullYear();
    const currentDay = mainStore.todayDayOfYear || 1;
    const date = new Date(year, 0, 1);
    date.setDate(currentDay);
    return date;
};

// 🟢 ПЕРЕКЛЮЧЕНИЕ РЕЖИМА (СТРЕЛКИ В ЦЕНТРЕ)
const changeViewMode = (direction) => {
    let nextIndex = currentViewIndex.value + direction;
    
    // Цикл по кругу
    if (nextIndex < 0) nextIndex = viewModes.length - 1;
    if (nextIndex >= viewModes.length) nextIndex = 0;
    
    const newMode = viewModes[nextIndex].key;
    const currentDate = getCurrentDate();

    // 1. МГНОВЕННОЕ обновление состояния (Optimistic UI)
    // Мы вручную меняем режим в проекции, чтобы интерфейс (цифра и таймлайн) отреагировали сразу
    if (mainStore.projection) {
        mainStore.projection.mode = newMode;
    }
    // Вызываем метод стора для пересчета дат проекции (rangeStartDate/EndDate)
    mainStore.updateFutureProjectionByMode(newMode, currentDate);
    
    // 2. Фоновая загрузка данных (виджеты и операции)
    // Не используем await, чтобы не фризить UI
    mainStore.loadCalculationData(newMode, currentDate).catch(err => {
        console.error("Ошибка загрузки данных:", err);
    });
};

const shiftPeriod = (direction) => {
    const date = getCurrentDate();
    const mode = viewModeKey.value;

    // Логика сдвига (как в Desktop)
    if (mode === '12d') {
        date.setDate(date.getDate() + (direction * 1));
    } else {
        const step = mode.includes('m') ? parseInt(mode) : 1;
        if (mode === '1y') {
             date.setMonth(date.getMonth() + (direction * 12));
        } else {
             date.setMonth(date.getMonth() + (direction * step));
        }
    }

    // Сохраняем новый день
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const diff = date - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const newDayOfYear = Math.floor(diff / oneDay);
    
    mainStore.setToday(newDayOfYear);
    
    // Обновляем проекцию и данные
    mainStore.updateFutureProjectionByMode(mode, date);
    mainStore.loadCalculationData(mode, date);
};

const openGraph = () => emit('open-graph');
const toggleWidgets = () => mainStore.toggleHeaderExpansion();

onMounted(async () => {
    // Гарантированный старт с 12 дней, если режим не задан
    if (viewModeKey.value !== '12d') {
        const today = new Date();
        const todayDay = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
        
        mainStore.setToday(todayDay);
        mainStore.updateFutureProjectionByMode('12d', today);
        mainStore.loadCalculationData('12d', today);
    }
});
</script>

<template>
  <div class="mobile-action-panel-wrapper">
    <div class="chart-controls-row">
      <!-- График -->
      <button class="icon-circle clickable" @click="openGraph">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><rect x="3" y="12" width="6" height="8"></rect><rect x="9" y="8" width="6" height="12"></rect><rect x="15" y="4" width="6" height="16"></rect></svg>
      </button>
      
      <!-- Навигация -->
      <div class="nav-center">
        <button class="arrow-btn" @click="changeViewMode(-1)">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        
        <!-- Текст режима -->
        <div class="period-label">
          <span class="days-num">{{ currentDisplay.num }}</span>
          <span class="days-text">{{ currentDisplay.unit || currentDisplay.text }}</span>
        </div>
        
        <button class="arrow-btn" @click="changeViewMode(1)">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <!-- Виджеты -->
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
    cursor: default; line-height: 1; user-select: none; width: 70px;
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