<script setup>
import { ref, computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useProjectionStore } from '@/stores/projectionStore';

const mainStore = useMainStore();
const projectionStore = useProjectionStore();
const emit = defineEmits(['close', 'apply']);

// Режимы: 'forecast' или 'analytics'
const mode = ref('forecast');

// Для режима Прогноз - только конечная дата
const forecastEndDate = ref(null);

// Для режима Аналитика - диапазон
const analyticsStartDate = ref(null);
const analyticsEndDate = ref(null);

// Календарь
const currentMonth = ref(new Date());
const today = new Date();
today.setHours(0, 0,0, 0);

// Форматирование дат
const formatDate = (date) => {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ru-RU', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  }).format(date);
};

const formatDateShort = (date) => {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ru-RU', { 
    day: 'numeric', 
    month: 'short'
  }).format(date);
};

// Генерация дней месяца
const calendarDays = computed(() => {
  const year = currentMonth.value.getFullYear();
  const month = currentMonth.value.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  const days = [];
  
  // Пустые ячейки до первого дня (Пн=0)
  const startDayOfWeek = (firstDay.getDay() + 6) % 7;
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push({ date: null, isCurrentMonth: false });
  }
  
  // Дни месяца
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    days.push({ date, isCurrentMonth: true });
  }
  
  // Заполнение до 42 ячеек
  while (days.length < 42) {
    days.push({ date: null, isCurrentMonth: false });
  }
  
  return days;
});

// Заголовок календаря
const calendarTitle = computed(() => {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(currentMonth.value);
});

// Навигация по месяцам
const changeMonth = (delta) => {
  const newMonth = new Date(currentMonth.value);
  newMonth.setMonth(newMonth.getMonth() + delta);
  currentMonth.value = newMonth;
};

// Проверка: это сегодня?
const isToday = (date) => {
  if (!date) return false;
  return date.toDateString() === today.toDateString();
};

// Проверка: выбрана ли дата
const isSelected = (date) => {
  if (!date) return false;
  
  if (mode.value === 'forecast') {
    return forecastEndDate.value && 
           date.toDateString() === forecastEndDate.value.toDateString();
  } else {
    // Аналитика: проверка в диапазоне
    if (!analyticsStartDate.value) return false;
    
    if (!analyticsEndDate.value) {
      return date.toDateString() === analyticsStartDate.value.toDateString();
    }
    
    return date >= analyticsStartDate.value && date <= analyticsEndDate.value;
  }
};

// Клик по дате
const handleDateClick = (date) => {
  if (!date) return;
  
  if (mode.value === 'forecast') {
    forecastEndDate.value = date;
  } else {
    // Аналитика: выбор диапазона
    if (!analyticsStartDate.value || (analyticsStartDate.value && analyticsEndDate.value)) {
      // Начать новый выбор
      analyticsStartDate.value = date;
      analyticsEndDate.value = null;
    } else {
      // Завершить выбор
      if (date < analyticsStartDate.value) {
        analyticsEndDate.value = analyticsStartDate.value;
        analyticsStartDate.value = date;
      } else {
        analyticsEndDate.value = date;
      }
    }
  }
};

// Пресеты для прогноза (синхронизированы с десктопом)
const forecastPresets = [
  { label: '+1 мес', action: () => setForecastPreset(1) },
  { label: '+2 мес', action: () => setForecastPreset(2) },
  { label: '+3 мес', action: () => setForecastPreset(3) },
  { label: '+5 мес', action: () => setForecastPreset(5) },
  { label: '+6 мес', action: () => setForecastPreset(6) },
];

const setForecastPreset = (months) => {
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + months);
  endDate.setDate(0); // Последний день предыдущего месяца
  endDate.setMonth(endDate.getMonth() + 1); // Вернуться к нужному месяцу
  forecastEndDate.value = endDate;
  currentMonth.value = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
};

// Пресеты для аналитики
const analyticsPresets = [
  { label: 'Тек месяц', action: () => setAnalyticsCurrentMonth() },
  { label: 'Прош месяц', action: () => setAnalyticsPrevMonth() },
];

const setAnalyticsCurrentMonth = () => {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  analyticsStartDate.value = start;
  analyticsEndDate.value = end;
  currentMonth.value = new Date(start);
};

const setAnalyticsPrevMonth = () => {
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  analyticsStartDate.value = start;
  analyticsEndDate.value = end;
  currentMonth.value = new Date(start);
};

// Сброс фильтра
const handleReset = () => {
  mainStore.setPeriodFilter({
    mode: 'all',
    customStart: null,
    customEnd: null
  });
  
  emit('close');
};

// Применить период
const applyPeriod = () => {
  if (mode.value === 'forecast' && forecastEndDate.value) {
    // 🔥 CRITICAL: НЕ меняем projection.mode! Он должен остаться как '12d', '1m', и т.д.
    // PeriodSelector управляет только periodFilter (фильтрация данных), а не projection (отображение графика)
    mainStore.setPeriodFilter({
      mode: 'custom',
      customStart: today.toISOString(),
      customEnd: forecastEndDate.value.toISOString()
    });
  } else if (mode.value === 'analytics' && analyticsStartDate.value && analyticsEndDate.value) {
    mainStore.setPeriodFilter({
      mode: 'custom',
      customStart: analyticsStartDate.value.toISOString(),
      customEnd: analyticsEndDate.value.toISOString()
    });
  }
  
  emit('apply');
  emit('close');
};

// Отображаемый диапазон
const displayRange = computed(() => {
  if (mode.value === 'forecast') {
    if (!forecastEndDate.value) return 'Выберите дату';
    return `${formatDateShort(today)} — ${formatDateShort(forecastEndDate.value)}`;
  } else {
    if (!analyticsStartDate.value) return 'Выберите период';
    if (!analyticsEndDate.value) return formatDateShort(analyticsStartDate.value);
    return `${formatDateShort(analyticsStartDate.value)} — ${formatDateShort(analyticsEndDate.value)}`;
  }
});

// Инициализация
onMounted(() => {
  const filter = mainStore.periodFilter;
  
 if (filter && filter.mode === 'custom' && filter.customStart && filter.customEnd) {
    const start = new Date(filter.customStart);
    const end = new Date(filter.customEnd);
    const todayCheck = new Date();
    todayCheck.setHours(0, 0, 0, 0);
    
    if (start >= todayCheck) {
      mode.value = 'forecast';
      forecastEndDate.value = end;
    } else {
      mode.value = 'analytics';
      analyticsStartDate.value = start;
      analyticsEndDate.value = end;
    }
    
    currentMonth.value = new Date(end.getFullYear(), end.getMonth(), 1);
    return;
  }
  
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  forecastEndDate.value = endOfMonth;
});
</script>

<template>
  <div class="mobile-period-selector">
    <!-- Header -->
    <div class="modal-header">
      <button class="close-btn" @click="$emit('close')">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      
      <div class="mode-tabs">
        <button 
          class="mode-tab" 
          :class="{ active: mode === 'forecast' }"
          @click="mode = 'forecast'"
        >
          Прогноз
        </button>
        <button 
          class="mode-tab" 
          :class="{ active: mode === 'analytics' }"
          @click="mode = 'analytics'"
        >
          Аналитика
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="modal-body">
      <!-- Selected Range Display -->
      <div class="range-display">
        <span class="range-label">{{ mode === 'forecast' ? 'Прогноз до:' : 'Период:' }}</span>
        <span class="range-dates">{{ displayRange }}</span>
      </div>

      <!-- Presets -->
      <div class="presets">
        <button 
          v-for="preset in (mode === 'forecast' ? forecastPresets : analyticsPresets)" 
          :key="preset.label"
          class="preset-btn"
          @click="preset.action"
        >
          {{ preset.label }}
        </button>
      </div>

      <!-- Calendar Header -->
      <div class="calendar-header">
        <button class="nav-btn" @click="changeMonth(-1)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <h3 class="calendar-title">{{ calendarTitle }}</h3>
        <button class="nav-btn" @click="changeMonth(1)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

      <!-- Calendar Grid -->
      <div class="calendar">
        <div class="weekdays">
          <div class="weekday">Пн</div>
          <div class="weekday">Вт</div>
          <div class="weekday">Ср</div>
          <div class="weekday">Чт</div>
          <div class="weekday">Пт</div>
          <div class="weekday">Сб</div>
          <div class="weekday">Вс</div>
        </div>
        <div class="days-grid">
          <div 
            v-for="(day, index) in calendarDays"
            :key="index"
            class="day-cell"
            :class="{
              'is-today': isToday(day.date),
              'is-selected': isSelected(day.date),
              'is-empty': !day.isCurrentMonth,
              'is-past': day.date && day.date < today && mode === 'forecast'
            }"
            @click="handleDateClick(day.date)"
          >
            <span v-if="day.date">{{ day.date.getDate() }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      <button class="footer-btn reset-btn" @click="handleReset">
        Сбросить
      </button>
      <button class="footer-btn apply-btn" @click="applyPeriod">
        Применить
      </button>
    </div>
  </div>
</template>

<style scoped>
.mobile-period-selector {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: var(--widget-background, #1c1c1e);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.modal-header {
  flex-shrink: 0;
  padding: 16px;
  padding-top: max(16px, env(safe-area-inset-top));
  background: var(--widget-background, #1c1c1e);
  border-bottom: 1px solid var(--widget-border, #333);
  position: relative;
}

.close-btn {
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  right: 16px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.1);
  color: var(--color-text, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:active {
  transform: scale(0.95);
  background: rgba(255,255,255,0.2);
}

.mode-tabs {
  display: flex;
  gap: 8px;
  max-width: 280px;
  margin: 0 auto;
}

.mode-tab {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--widget-border, #333);
  background: transparent;
  color: var(--text-mute, #888);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-tab.active {
  background: var(--color-primary, #34c759);
  color: #fff;
  border-color: var(--color-primary, #34c759);
}

/* Body */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
  -webkit-overflow-scrolling: touch;
}

/* Range Display */
.range-display {
  background: rgba(255,255,255,0.05);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  text-align: center;
}

.range-label {
  display: block;
  font-size: 13px;
  color: var(--text-mute, #888);
  margin-bottom: 4px;
}

.range-dates {
  display: block;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text, #fff);
}

/* Presets */
.presets {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.preset-btn {
  flex-shrink: 0;
  height: 36px;
  padding: 0 16px;
  border-radius: 18px;
  border: 1px solid var(--widget-border, #333);
  background: rgba(255,255,255,0.05);
  color: var(--color-text, #fff);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.preset-btn:active {
  transform: scale(0.95);
  background: rgba(255,255,255,0.1);
}

/* Calendar Header */
.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.calendar-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text, #fff);
  margin: 0;
  text-transform: capitalize;
}

.nav-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.05);
  color: var(--color-text, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:active {
  transform: scale(0.95);
  background: rgba(255,255,255,0.1);
}

/* Calendar */
.calendar {
  background: rgba(255,255,255,0.02);
  border-radius: 16px;
  padding: 16px;
}

.weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.weekday {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-mute, #666);
  padding: 8px 0;
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
}

.day-cell {
  aspect-ratio: 1;
  min-height: 44px; /* Touch target */
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text, #fff);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.day-cell.is-empty {
  color: transparent;
  pointer-events: none;
}

.day-cell.is-past {
  color: var(--text-mute, #555);
  opacity: 0.5;
}

.day-cell.is-today {
  border: 2px solid var(--color-primary, #34c759);
}

.day-cell.is-selected {
  background: var(--color-primary, #34c759);
  color: #fff;
}

.day-cell:not(.is-empty):not(.is-past):active {
  transform: scale(0.9);
  background: rgba(255,255,255,0.1);
}

/* Footer */
.modal-footer {
  flex-shrink: 0;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  background: var(--widget-background, #1c1c1e);
  border-top: 1px solid var(--widget-border, #333);
  display: flex;
  gap: 12px;
}

.footer-btn {
  flex: 1;
  height: 52px;
  border-radius: 14px;
  border: none;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn {
  background: rgba(255,255,255,0.1);
  color: var(--color-text, #fff);
}

.reset-btn:active {
  transform: scale(0.98);
  background: rgba(255,255,255,0.15);
}

.apply-btn {
  background: var(--color-primary, #34c759);
  color: #fff;
}

.apply-btn:active {
  transform: scale(0.98);
  opacity: 0.9;
}
</style>
