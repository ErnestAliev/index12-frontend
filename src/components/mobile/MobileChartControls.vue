<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';

const mainStore = useMainStore();

// --- Навигация ---
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
    
    // Обновляем режим. Для этого используем текущую дату из стора или сегодня
    const currentTodayDate = new Date(); // Упростим: отталкиваемся от сегодня, или нужно брать mainStore.todayDayOfYear
    
    // Важно: вызываем обновление проекции
    await mainStore.updateFutureProjectionByMode(newMode, currentTodayDate);
    // И обновляем данные
    await mainStore.loadCalculationData(newMode, currentTodayDate);
};

// Сдвиг периода (Стрелки)
const shiftPeriod = async (direction) => {
    // Получаем текущую базовую дату (сегодня)
    // В идеале store должен хранить "currentViewDate", но пока используем todayDayOfYear
    const year = new Date().getFullYear();
    const currentDay = mainStore.todayDayOfYear || 0;
    const date = new Date(year, 0); // 1 янв
    date.setDate(currentDay > 0 ? currentDay : new Date().getDate()); // Устанавливаем день

    // Логика сдвига
    if (viewMode.value === '12d') {
        date.setDate(date.getDate() + (direction * 1)); // Сдвиг на 1 день
    } else {
        const step = viewMode.value.includes('m') ? parseInt(viewMode.value) : 1;
        date.setMonth(date.getMonth() + (direction * step));
    }

    // Сохраняем в стор
    const newDayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    mainStore.setToday(newDayOfYear);
    
    // Обновляем проекцию
    await mainStore.updateFutureProjectionByMode(viewMode.value, date);
};

// 🟢 ЛОГИКА РАСШИРЕНИЯ ВИДЖЕТОВ (Правая кнопка)
const toggleWidgets = () => {
    mainStore.toggleHeaderExpansion();
};
</script>

<template>
  <div class="chart-controls-panel">
    <!-- Левая иконка: График (Декор или переключение типа графика) -->
    <div class="icon-circle">
       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><rect x="3" y="12" width="6" height="8"></rect><rect x="9" y="8" width="6" height="12"></rect><rect x="15" y="4" width="6" height="16"></rect></svg>
    </div>
    
    <!-- Центр: Навигация -->
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

    <!-- Правая иконка: Сетка (Expand Widgets) -->
    <!-- 🟢 Теперь эта кнопка управляет виджетами -->
    <button class="icon-circle clickable" @click="toggleWidgets" :class="{ active: mainStore.isHeaderExpanded }">
       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
       </svg>
    </button>
  </div>
</template>

<style scoped>
.chart-controls-panel {
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  background-color: var(--color-background-soft, #282828);
  border-top: 1px solid var(--color-border, #444);
  /* Этот компонент будет в фиксированном футере */
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
  font-size: 20px; font-weight: 700; color: #fff;
}

.days-text {
  font-size: 9px; color: #888; font-weight: 600;
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
</style>