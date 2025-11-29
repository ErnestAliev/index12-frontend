<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';

// 🟢 3. Добавлено событие 'open-graph'
const emit = defineEmits(['action', 'open-graph']);
const mainStore = useMainStore();

// --- ЛОГИКА УПРАВЛЕНИЯ ГРАФИКОМ ---
const viewModes = ['12d', '1m', '3m', '6m', '1y'];
const displayModes = { '12d': '12 ДНЕЙ', '1m': '1 МЕС', '3m': '3 МЕС', '6m': '6 МЕС', '1y': '1 ГОД' };

const viewMode = computed(() => mainStore.projection?.mode || '12d');

const displayModeText = computed(() => displayModes[viewMode.value] || '12 ДНЕЙ');
const displayNum = computed(() => displayModeText.value.split(' ')[0]);
const displayText = computed(() => displayModeText.value.split(' ')[1]);

const switchViewMode = async () => {
    const currentIndex = viewModes.indexOf(viewMode.value);
    const nextIndex = (currentIndex + 1) % viewModes.length;
    const newMode = viewModes[nextIndex];
    
    // 🟢 2. Исправлена логика получения текущей даты для переключения
    const currentTodayDate = new Date(); 
    if (mainStore.todayDayOfYear) {
       const year = currentTodayDate.getFullYear();
       const startOfYear = new Date(year, 0, 1);
       // Устанавливаем дату на основе дня года
       currentTodayDate.setTime(startOfYear.getTime() + (mainStore.todayDayOfYear * 24 * 60 * 60 * 1000));
    }
    
    await mainStore.updateFutureProjectionByMode(newMode, currentTodayDate);
    await mainStore.loadCalculationData(newMode, currentTodayDate);
};

const shiftPeriod = async (direction) => {
    const year = new Date().getFullYear();
    const currentDay = mainStore.todayDayOfYear || 0;
    
    // Воссоздаем дату из дня года
    const date = new Date(year, 0, 1);
    if (currentDay > 0) {
        date.setDate(currentDay + 1); // +1 так как jan 1 это 0-й индекс смещения или 1-й день? обычно dayOfYear 1-based
    } else {
        const now = new Date();
        date.setMonth(now.getMonth());
        date.setDate(now.getDate());
    }

    if (viewMode.value === '12d') {
        date.setDate(date.getDate() + (direction * 1));
    } else {
        const step = viewMode.value.includes('m') ? parseInt(viewMode.value) : 1;
        // Для года (1y) шаг 1, но метод setFullYear/setMonth
        if (viewMode.value === '1y') {
             // Сдвиг на полгода или год? Обычно шаг навигации = периоду.
             // В коде было (direction * step) для месяцев. 
             // Если '1y', parseInt вернет 1. Сдвинем на 12 месяцев или 6?
             // Оставим логику месяцев:
             date.setMonth(date.getMonth() + (direction * (viewMode.value === '1y' ? 12 : step)));
        } else {
             date.setMonth(date.getMonth() + (direction * step));
        }
    }

    const newDayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    mainStore.setToday(newDayOfYear);
    await mainStore.updateFutureProjectionByMode(viewMode.value, date);
    // 🟢 Важно: перезагружаем данные после сдвига
    await mainStore.loadCalculationData(viewMode.value, date);
};

// --- ЛОГИКА ВИДЖЕТОВ ---
const toggleWidgets = () => {
    mainStore.toggleHeaderExpansion();
};
</script>

<template>
  <div class="mobile-action-panel-wrapper">
    
    <!-- РЯД 1: Управление графиком и виджетами -->
    <div class="chart-controls-row">
      <!-- 🟢 3. Левая иконка: Сделана кнопкой, вызывает событие -->
      <button class="icon-circle clickable" @click="$emit('open-graph')">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><rect x="3" y="12" width="6" height="8"></rect><rect x="9" y="8" width="6" height="12"></rect><rect x="15" y="4" width="6" height="16"></rect></svg>
      </button>
      
      <!-- Центр: Навигация (12 ДНЕЙ) -->
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

      <!-- Правая иконка: Сетка (Кнопка переключения виджетов) -->
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
}

/* --- РЯД 1: КОНТРОЛЫ --- */
.chart-controls-row {
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  border-bottom: none; 
}

.nav-center { display: flex; align-items: center; gap: 20px; }
.arrow-btn { background: none; border: none; padding: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.arrow-btn:active { opacity: 0.7; }

.period-label { display: flex; flex-direction: column; align-items: center; cursor: pointer; line-height: 1; user-select: none; }
.days-num { font-size: 20px; font-weight: 700; color: #fff; }
.days-text { font-size: 9px; color: #888; font-weight: 600; text-transform: uppercase; margin-top: 2px; }

/* Левая иконка (кнопка) */
.icon-circle {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: center;
  color: #aaa;
  background: transparent;
  padding: 0;
  cursor: pointer;
  transition: all 0.2s;
}
.icon-circle:active { background-color: rgba(255,255,255,0.1); color: #fff; border-color: #fff; }

/* СТИЛИ ДЛЯ ПРАВОЙ КНОПКИ */
.header-expand-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #aaa;
  padding: 0;
  transition: background-color 0.2s, border-color 0.2s, color 0.2s;
}

.header-expand-btn:hover {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.2);
  color: #fff;
}

.header-expand-btn.active {
  color: var(--color-primary, #34c759);
  border-color: var(--color-primary, #34c759);
  background: rgba(52, 199, 89, 0.1);
}

.header-expand-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
}
</style>