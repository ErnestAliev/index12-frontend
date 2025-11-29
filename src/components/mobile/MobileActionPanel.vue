<script setup>
import { computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';

const emit = defineEmits(['action', 'open-graph']);
const mainStore = useMainStore();

// Список режимов (идентичен десктопному NavigationPanel)
const viewModes = [
  { key: '12d', num: '12', unit: 'ДНЕЙ' },
  { key: '1m',  num: '1',  unit: 'МЕСЯЦ' },
  { key: '3m',  num: '3',  text: 'МЕСЯЦА', unit: 'МЕСЯЦА' },
  { key: '6m',  num: '6',  text: 'МЕСЯЦЕВ', unit: 'МЕСЯЦЕВ' },
  { key: '1y',  num: '1',  unit: 'ГОД' }
];

// Текущий режим из стора
const viewModeKey = computed(() => mainStore.projection?.mode || '12d');

// Индекс текущего режима
const currentViewIndex = computed(() => {
    const idx = viewModes.findIndex(v => v.key === viewModeKey.value);
    return idx !== -1 ? idx : 0;
});

// Объект текущего режима для отображения
const currentDisplay = computed(() => viewModes[currentViewIndex.value]);

// Хелпер для получения текущей опорной даты (сегодня)
const getCurrentDate = () => {
    const year = new Date().getFullYear();
    const currentDay = mainStore.todayDayOfYear || 1;
    const date = new Date(year, 0, 1);
    date.setDate(currentDay);
    return date;
};

// 🟢 ЛОГИКА ДЕСКТОПА: ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ
// direction: -1 (Влево/Меньше) или 1 (Вправо/Больше)
const switchViewMode = async (direction) => {
    let nextIndex = currentViewIndex.value + direction;
    
    // Цикличное переключение (как карусель)
    if (nextIndex >= viewModes.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = viewModes.length - 1;
    
    const newMode = viewModes[nextIndex].key;
    const currentDate = getCurrentDate();

    // 1. Обновляем проекцию в сторе (это пересчитает даты rangeStartDate/EndDate)
    mainStore.updateFutureProjectionByMode(newMode, currentDate);
    
    // 2. Загружаем данные для нового периода
    await mainStore.loadCalculationData(newMode, currentDate);
};

const openGraph = () => emit('open-graph');
const toggleWidgets = () => mainStore.toggleHeaderExpansion();

onMounted(async () => {
    // Инициализация при старте, если режим еще не задан в сторе
    if (!mainStore.projection?.mode) {
        const today = new Date();
        // Вычисляем день года
        const start = new Date(today.getFullYear(), 0, 0);
        const diff = (today - start) + ((start.getTimezoneOffset() - today.getTimezoneOffset()) * 60 * 1000);
        const oneDay = 1000 * 60 * 60 * 24;
        const todayDay = Math.floor(diff / oneDay);
        
        mainStore.setToday(todayDay);
        mainStore.updateFutureProjectionByMode('12d', today);
        await mainStore.loadCalculationData('12d', today);
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
        <!-- Стрелка Влево: Предыдущий режим (например, с 1мес на 12д) -->
        <button class="arrow-btn" @click="switchViewMode(-1)">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        
        <!-- Текст текущего режима -->
        <div class="period-label" @click="switchViewMode(1)">
          <span class="days-num">{{ currentDisplay.num }}</span>
          <span class="days-text">{{ currentDisplay.unit || currentDisplay.text }}</span>
        </div>
        
        <!-- Стрелка Вправо: Следующий режим (например, с 12д на 1мес) -->
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