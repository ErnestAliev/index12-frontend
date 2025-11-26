<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ from: null, to: null })
  },
  placeholder: {
    type: String,
    default: 'Период'
  }
});

const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);
const containerRef = ref(null);

// Текущий просматриваемый месяц
const currentDate = ref(new Date());
const currentMonth = computed(() => currentDate.value.getMonth());
const currentYear = computed(() => currentDate.value.getFullYear());

// Локальное состояние выбора
const localRange = ref({ from: null, to: null });

watch(() => props.modelValue, (newVal) => {
  localRange.value = { ...newVal };
}, { deep: true });

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const daysOfWeek = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU');
};

// 🟢 Улучшенное отображение: если даты совпадают, показываем одну
const displayValue = computed(() => {
  const { from, to } = props.modelValue;
  if (!from && !to) return '';
  if (from && !to) return `${formatDate(from)} - ...`;
  if (from && to && from === to) return formatDate(from); // Одна дата
  return `${formatDate(from)} - ${formatDate(to)}`;
});

const calendarDays = computed(() => {
  const year = currentYear.value;
  const month = currentMonth.value;
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  
  let startDay = firstDayOfMonth.getDay();
  if (startDay === 0) startDay = 7;
  
  const days = [];
  for (let i = 1; i < startDay; i++) {
    days.push({ day: '', date: null, isEmpty: true });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(year, month, i);
    date.setHours(0, 0, 0, 0);
    // Используем локальное время, но в формате YYYY-MM-DD для строк
    const offset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date - offset)).toISOString().slice(0, 10);
    
    days.push({
      day: i,
      date: localISOTime,
      fullDate: date,
      isEmpty: false
    });
  }
  return days;
});

// 🟢 Обновленная логика клика
const handleDayClick = (dayObj) => {
  if (dayObj.isEmpty) return;
  const clickedDate = dayObj.date; // YYYY-MM-DD
  
  // 1. Если ничего не выбрано или диапазон уже полон -> начинаем новый выбор
  if ((!localRange.value.from && !localRange.value.to) || (localRange.value.from && localRange.value.to)) {
    localRange.value.from = clickedDate;
    localRange.value.to = null;
  } 
  // 2. Если выбрана начальная дата, и кликнули ВТОРУЮ (даже если ту же самую)
  else if (localRange.value.from && !localRange.value.to) {
    if (clickedDate < localRange.value.from) {
      localRange.value.to = localRange.value.from;
      localRange.value.from = clickedDate;
    } else {
      localRange.value.to = clickedDate; // Может быть равна from (один день)
    }
    emit('update:modelValue', { ...localRange.value });
    isOpen.value = false;
  }
};

const getDayClass = (dayObj) => {
  if (dayObj.isEmpty) return '';
  const { from, to } = localRange.value;
  const current = dayObj.date;
  
  if (current === from || current === to) return 'is-selected';
  if (from && to && current > from && current < to) return 'is-in-range';
  return '';
};

const prevMonth = () => { currentDate.value = new Date(currentYear.value, currentMonth.value - 1, 1); };
const nextMonth = () => { currentDate.value = new Date(currentYear.value, currentMonth.value + 1, 1); };

const toggle = () => {
  isOpen.value = !isOpen.value;
  if (isOpen.value && props.modelValue.from) {
      currentDate.value = new Date(props.modelValue.from);
  }
};

const close = (e) => { if (containerRef.value && !containerRef.value.contains(e.target)) isOpen.value = false; };
const clear = (e) => {
    e.stopPropagation();
    localRange.value = { from: null, to: null };
    emit('update:modelValue', { from: null, to: null });
};

onMounted(() => document.addEventListener('click', close));
onBeforeUnmount(() => document.removeEventListener('click', close));
</script>

<template>
  <div class="date-range-picker" ref="containerRef" :class="{ 'is-open': isOpen }">
    <!-- Trigger -->
    <div class="picker-trigger" @click="toggle">
      <div class="trigger-content">
         <span v-if="!displayValue" class="placeholder">{{ placeholder }}</span>
         <span v-else class="value-text">{{ displayValue }}</span>
      </div>
      <button v-if="displayValue" class="btn-clear" @click="clear" title="Очистить">✕</button>
      
      <!-- 🟢 Унифицированная иконка (серый SVG) -->
      <span v-else class="calendar-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </span>
    </div>

    <!-- Calendar -->
    <div v-if="isOpen" class="calendar-dropdown">
      <div class="calendar-header">
        <button @click.stop="prevMonth" class="nav-btn">‹</button>
        <span class="month-label">{{ monthNames[currentMonth] }} {{ currentYear }}</span>
        <button @click.stop="nextMonth" class="nav-btn">›</button>
      </div>
      <div class="calendar-weekdays">
        <span v-for="day in daysOfWeek" :key="day">{{ day }}</span>
      </div>
      <div class="calendar-grid">
        <div v-for="(dayObj, idx) in calendarDays" :key="idx"
          class="calendar-cell"
          :class="[{ 'is-empty': dayObj.isEmpty }, getDayClass(dayObj)]"
          @click.stop="handleDayClick(dayObj)"
        >
          {{ dayObj.day }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 🟢 FIX: Добавлен flex и align-items, чтобы компонент не проваливался вниз */
.date-range-picker { 
  position: relative; 
  width: 100%; 
  font-family: inherit;
  display: flex;          /* ВАЖНО */
  align-items: center;    /* ВАЖНО: Центрирует внутренний триггер по вертикали */
}

/* 🟢 ИСПРАВЛЕНО: Высота 28px, Шрифт 13px, Border #E0E0E0 */
.picker-trigger {
  width: 100%; height: 28px; 
  background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 6px; 
  padding: 0 8px; display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; transition: border-color 0.2s; box-sizing: border-box;
}
.date-range-picker.is-open .picker-trigger { border-color: #222; box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.1); }

.trigger-content { flex-grow: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; color: #1a1a1a; }
.placeholder { color: #aaa; font-size: 13px; }
.value-text { font-weight: 500; font-size: 13px; }

.calendar-icon { display: flex; align-items: center; color: #999; }
.btn-clear { background: none; border: none; cursor: pointer; font-size: 12px; color: #999; padding: 0 4px; line-height: 1; }
.btn-clear:hover { color: #ff3b30; }

.calendar-dropdown {
  position: absolute; top: 100%; left: 0; width: 260px;
  background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.15); z-index: 2000; margin-top: 4px; padding: 10px;
}
.calendar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.month-label { font-size: 14px; font-weight: 600; color: #333; }
.nav-btn { background: none; border: 1px solid #eee; border-radius: 4px; cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #555; font-weight: bold; }
.nav-btn:hover { background: #f5f5f5; border-color: #ccc; }

.calendar-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 11px; color: #999; margin-bottom: 4px; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.calendar-cell { height: 30px; display: flex; align-items: center; justify-content: center; font-size: 13px; cursor: pointer; border-radius: 4px; color: #333; transition: background 0.1s; }
.calendar-cell:hover:not(.is-empty):not(.is-selected):not(.is-in-range) { background-color: #f0f0f0; }
.calendar-cell.is-empty { cursor: default; }
.is-selected { background-color: #222; color: #fff; font-weight: 600; }
.is-in-range { background-color: #e0e0e0; color: #333; }
</style>