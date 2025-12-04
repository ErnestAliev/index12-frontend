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

// Текущий режим берем строго из стора
const viewModeKey = computed(() => mainStore.projection?.mode || '12d');

// Индекс текущего режима в массиве
const currentViewIndex = computed(() => {
    const idx = viewModes.findIndex(v => v.key === viewModeKey.value);
    return idx !== -1 ? idx : 0;
});

const currentDisplay = computed(() => viewModes[currentViewIndex.value]);

// Хелпер для вычисления дня года
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / 86400000);
};

// Логика переключения (Влево/Вправо)
const switchViewMode = async (direction) => {
    let nextIndex = currentViewIndex.value + direction;
    
    // Циклическое переключение
    if (nextIndex >= viewModes.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = viewModes.length - 1;
    
    const newMode = viewModes[nextIndex].key;
    
    // 🟢 ВАЖНО: При переключении режима ВСЕГДА возвращаемся к "Сегодня"
    // Это предотвращает баги с датами и "прыжки" расчетов
    const targetDate = new Date(); 

    // 1. Сначала обновляем проекцию в сторе
    await mainStore.updateFutureProjectionByMode(newMode, targetDate);
    
    // 2. Жестко устанавливаем "Сегодня" как якорь
    mainStore.setToday(getDayOfYear(targetDate));

    // 3. Загружаем данные для нового режима и даты "Сегодня"
    await mainStore.loadCalculationData(newMode, targetDate);
};

const openGraph = () => emit('open-graph');
const toggleWidgets = () => mainStore.toggleHeaderExpansion();

onMounted(async () => {
    // Если при загрузке режим не определен — ставим дефолт '12d'
    if (!mainStore.projection?.mode) {
        const today = new Date();
        mainStore.setToday(getDayOfYear(today));
        await mainStore.updateFutureProjectionByMode('12d', today);
        // Данные загрузит HomeView или watcher
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
        
        <!-- Клик по тексту тоже переключает вперед -->
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