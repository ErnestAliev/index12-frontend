<script setup>
import { ref, computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useProjectionStore } from '@/stores/projectionStore';
import HeaderTotalCard from '@/components/HeaderTotalCard.vue';

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
today.setHours(0, 0, 0, 0);

// Форматирование дат
const formatDate = (date) => {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ru-RU', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  }).format(date);
};

const formatNumber = (num) => {
  return new Intl.NumberFormat('ru-RU').format(Math.abs(num || 0));
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
    
    const dateTime = date.getTime();
    return dateTime >= analyticsStartDate.value.getTime() && 
           dateTime <= analyticsEndDate.value.getTime();
  }
};

// Обработка клика по дате
const selectDate = (date) => {
  if (!date) return;
  
  if (mode.value === 'forecast') {
    // Прогноз: только конечная дата
    forecastEndDate.value = new Date(date);
  } else {
    // Аналитика: диапазон
    if (!analyticsStartDate.value || analyticsEndDate.value) {
      // Начинаем новый диапазон
      analyticsStartDate.value = new Date(date);
      analyticsEndDate.value = null;
    } else {
      // Завершаем диапазон
      if (date < analyticsStartDate.value) {
        analyticsEndDate.value = analyticsStartDate.value;
        analyticsStartDate.value = new Date(date);
      } else {
        analyticsEndDate.value = new Date(date);
      }
    }
  }
};

// Быстрый выбор месяцев (для Прогноза)
const addMonths = (count) => {
  const newDate = new Date(today);
  newDate.setMonth(newDate.getMonth() + count);
  newDate.setDate(new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate()); // Last day of month
  forecastEndDate.value = newDate;
  currentMonth.value = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
};

// 🟢 Track which quick-select button is active
const activeQuickSelect = computed(() => {
  if (!forecastEndDate.value) return null;
  
  const todayStartOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const forecastEndStartOfDay = new Date(forecastEndDate.value.getFullYear(), forecastEndDate.value.getMonth(), forecastEndDate.value.getDate());

  const diffTime = Math.abs(forecastEndStartOfDay.getTime() - todayStartOfDay.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Check if it matches common presets (approximately)
  // Using a small tolerance for day count
  const tolerance = 2; // +/- 2 days
  
  const checkMonthDiff = (targetMonths) => {
    const targetDate = new Date(todayStartOfDay);
    targetDate.setMonth(targetDate.getMonth() + targetMonths + 1); // Go to next month
    targetDate.setDate(0); // Last day of target month
    
    const targetDiffTime = Math.abs(targetDate.getTime() - todayStartOfDay.getTime());
    const targetDiffDays = Math.ceil(targetDiffTime / (1000 * 60 * 60 * 24));
    
    return diffDays >= targetDiffDays - tolerance && diffDays <= targetDiffDays + tolerance;
  };

  if (checkMonthDiff(1)) return 1; // +1 month
  if (checkMonthDiff(2)) return 2; // +2 months
  if (checkMonthDiff(3)) return 3; // +3 months
  if (checkMonthDiff(6)) return 6; // +6 months
  
  return null;
});

// Reset filter to default state
const handleReset = async () => {
  // Reset projection to end of current month
  await mainStore.setProjectionToEndOfMonth();
  
  // Reset period filter to default 'all' mode
  mainStore.setPeriodFilter({
    mode: 'all',
    startDate: null,
    endDate: null
  });
  
  emit('close');
};

const applyPeriod = () => {
  if (mode.value === 'forecast' && forecastEndDate.value) {
    // 🔥 SYMMETRIC EXPANSION: Expand equally in both directions from today
    // Calculate how many months ahead we're going
    const monthsAhead = Math.ceil((forecastEndDate.value - today) / (1000 * 60 * 60 * 24 * 30));
    
    // Go same number of months back
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - monthsAhead);
    startDate.setDate(1); // Start of that month
    
    // Update projection
    projectionStore.setProjectionRange(startDate, forecastEndDate.value);
    mainStore.setPeriodFilter({
      mode: 'custom',
      customStart: startDate.toISOString(),
      customEnd: forecastEndDate.value.toISOString(),
      isForecastMode: true  // 🔥 Remember this was forecast mode
    });
  } else if (mode.value === 'analytics' && analyticsStartDate.value && analyticsEndDate.value) {
    // 🔥 ANALYTICS: Set projection to exact selected range
    projectionStore.setProjectionRange(analyticsStartDate.value, analyticsEndDate.value);
    
    mainStore.setPeriodFilter({
      mode: 'custom',
      customStart: analyticsStartDate.value.toISOString(),
      customEnd: analyticsEndDate.value.toISOString(),
      isForecastMode: false  // 🔥 Remember this was analytics mode
    });
  }
  
  emit('apply');
  emit('close');
};

// Computed для виджетов
const earliestOpDate = computed(() => {
  const ops = mainStore.allKnownOperations || [];
  if (ops.length === 0) return today;
  const dates = ops.map(op => new Date(op.date)).filter(d => !isNaN(d));
  return dates.length > 0 ? new Date(Math.min(...dates)) : today;
});

// Инициализация
// Инициализация
onMounted(() => {
  const filter = mainStore.periodFilter;
  
  if (filter && filter.mode === 'custom' && filter.customStart && filter.customEnd) {
    const start = new Date(filter.customStart);
    const end = new Date(filter.customEnd);
    const todayCheck = new Date();
    todayCheck.setHours(0, 0, 0, 0);
    
    // 🔥 Use saved mode flag if available
    if (filter.isForecastMode !== undefined) {
      if (filter.isForecastMode) {
        mode.value = 'forecast';
        forecastEndDate.value = end;
      } else {
        mode.value = 'analytics';
        analyticsStartDate.value = start;
        analyticsEndDate.value = end;
      }
    } else {
      // Fallback to old logic if flag not set
      if (start >= todayCheck) {
        mode.value = 'forecast';
        forecastEndDate.value = end;
      } else {
        mode.value = 'analytics';
        analyticsStartDate.value = start;
        analyticsEndDate.value = end;
      }
    }
    
    currentMonth.value = new Date(end.getFullYear(), end.getMonth(), 1);
    return;
  }
  
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  forecastEndDate.value = endOfMonth;
});
</script>

<template>
  <div class="period-selector">
    <div class="period-content">
      <!-- Balance Widgets -->
      <div class="balance-widgets">
        <HeaderTotalCard
          :title="'Всего на счетах\nна текущий момент'"
          :totalBalance="mainStore.currentTotalBalance"
          :subtitlePrefix="`Сейчас на ${mainStore.currentAccountBalances.length} счетах`"
          :subtitleDate="`до ${formatDate(today)}`"
          widgetKey="currentTotal"
          :widgetIndex="0"
        />

        <HeaderTotalCard
          :title="'Всего на счетах\nс учетом будущих'"
          :totalBalance="mainStore.futureTotalBalance"
          :subtitlePrefix="`Будет на ${mainStore.futureAccountBalances.length} счетах`"
          :subtitleDate="`до ${forecastEndDate ? formatDate(forecastEndDate) : '—'}`"
          widgetKey="futureTotal"
          :widgetIndex="1"
        />
      </div>

      <!-- Переключатель режимов -->
      <div class="mode-switcher">
        <button 
          :class="{ active: mode === 'forecast' }" 
          @click="mode = 'forecast'"
        >
          Прогноз
        </button>
        <button 
          :class="{ active: mode === 'analytics' }" 
          @click="mode = 'analytics'"
        >
          Аналитика
        </button>
      </div>

      <!-- Быстрый выбор (только для Прогноза) -->
      <div v-if="mode === 'forecast'" class="quick-select">
        <button :class="{ active: activeQuickSelect === 1 }" @click="addMonths(1)">+1 мес</button>
        <button :class="{ active: activeQuickSelect === 2 }" @click="addMonths(2)">+2 мес</button>
        <button :class="{ active: activeQuickSelect === 3 }" @click="addMonths(3)">+3 мес</button>
        <button :class="{ active: activeQuickSelect === 5 }" @click="addMonths(5)">+5 мес</button>
        <button :class="{ active: activeQuickSelect === 6 }" @click="addMonths(6)">+6 мес</button>
      </div>

      <!-- Календарь -->
      <div class="calendar">
        <!-- Навигация -->
        <div class="calendar-nav">
          <button @click="changeMonth(-1)">‹</button>
          <h4>{{ calendarTitle }}</h4>
          <button @click="changeMonth(1)">›</button>
        </div>

        <!-- Дни недели -->
        <div class="calendar-weekdays">
          <div>Пн</div>
          <div>Вт</div>
          <div>Ср</div>
          <div>Чт</div>
          <div>Пт</div>
          <div>Сб</div>
          <div>Вс</div>
        </div>

        <!-- Дни месяца -->
        <div class="calendar-days">
          <div 
            v-for="(day, index) in calendarDays" 
            :key="index"
            :class="{
              'calendar-day': true,
              'today': day.date && isToday(day.date),
              'selected': day.date && isSelected(day.date),
              'empty': !day.date
            }"
            @click="selectDate(day.date)"
          >
            {{ day.date ? day.date.getDate() : '' }}
          </div>
        </div>
      </div>

      <!-- Кнопки действий -->
      <div class="actions">
        <button class="btn-cancel" @click="handleReset">Сброс</button>
        <button class="btn-apply" @click="applyPeriod">Применить</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.period-selector {
  background: var(--filter-dropdown-bg);
  border: 1px solid var(--filter-dropdown-border);
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  box-shadow: var(--filter-dropdown-shadow);
  max-height: 100vh;
  overflow-y: auto;
}

.period-content {
  padding: 20px;
}

.balance-widgets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.mode-switcher {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.mode-switcher button {
  flex: 1;
  padding: 10px;
  border: 2px solid var(--color-border);
  background: var(--btn-panel-bg);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-main);
  transition: all 0.2s;
  font-weight: 500;
}

.mode-switcher button.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: white;
  font-weight: 600;
}

.active-period-indicator {
  padding: 10px 12px;
  background: var(--btn-panel-bg-active);
  border-left: 3px solid var(--color-primary);
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.indicator-label {
  color: var(--text-mute);
  font-weight: 500;
}

.indicator-value {
  color: var(--color-primary);
  font-weight: 600;
}

.quick-select {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.quick-select button {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--color-border);
  background: var(--btn-panel-bg);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-main);
  transition: all 0.2s;
  font-weight: 500;
}

.quick-select button:hover {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.quick-select button.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
  font-weight: 700;
}

.calendar {
  margin-bottom: 16px;
}

.calendar-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.calendar-nav button {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-main);
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 6px;
  transition: background 0.2s;
}

.calendar-nav button:hover {
  background: var(--btn-panel-bg-hover);
}

.calendar-nav h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  text-transform: capitalize;
}

.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 8px;
}

.calendar-weekdays div {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-mute);
  padding: 8px 0;
}

.calendar-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.calendar-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
  background: var(--btn-panel-bg);
  color: var(--text-main);
}

.calendar-day.empty {
  background: transparent;
  cursor: default;
}

.calendar-day:hover:not(.empty) {
  background: var(--btn-panel-bg-hover);
  border-color: var(--color-primary);
}

.calendar-day.today {
  border-color: var(--color-primary);
  font-weight: 600;
}

.calendar-day.selected {
  background: var(--color-primary);
  color: white;
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 12px;
}

.actions button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--btn-panel-bg);
  color: var(--text-main);
  border: 1px solid var(--color-border);
}

.btn-cancel:hover {
  background: var(--btn-panel-bg-hover);
}

.btn-apply {
  background: var(--color-primary);
  color: white;
}

.btn-apply:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}
</style>
