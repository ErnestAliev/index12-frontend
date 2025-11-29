<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import MobileDayColumn from './MobileDayColumn.vue';

const emit = defineEmits(['show-menu']);
const mainStore = useMainStore();

const visibleDays = ref([]);
const scrollContainer = ref(null);

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;

// Режим из стора
const viewMode = computed(() => mainStore.projection?.mode || '12d');

// Текущая якорная дата из стора
const currentTodayDate = computed(() => {
    const year = new Date().getFullYear();
    const date = new Date(year, 0, 1);
    const day = mainStore.todayDayOfYear || getDayOfYear(new Date());
    date.setDate(day);
    return date;
});

const generateDays = () => {
  const mode = viewMode.value;
  // Создаем копию даты, чтобы не мутировать computed
  const anchorDate = new Date(currentTodayDate.value); 
  anchorDate.setHours(0,0,0,0);
  
  let total = 12;
  let offsetStart = -5; 

  // 🟢 СТРОГОЕ СООТВЕТСТВИЕ ДЕСКТОПНОЙ ЛОГИКЕ
  // Логика: показываем симметричный диапазон вокруг текущей даты.
  // Это гарантирует, что "Сегодня" всегда будет (примерно) в центре.
  if (mode === '1m') { 
      total = 30; 
      offsetStart = -15; 
  } else if (mode === '3m') { 
      total = 90; 
      offsetStart = -45; 
  } else if (mode === '6m') { 
      total = 180; 
      offsetStart = -90; 
  } else if (mode === '1y') { 
      total = 360; 
      offsetStart = -180; 
  } else { 
      // 12d
      total = 12; 
      offsetStart = -5; 
  }

  // Расчет даты начала сетки
  let startDate = new Date(anchorDate);
  startDate.setDate(startDate.getDate() + offsetStart);

  const days = [];
  const todayReal = new Date();

  for (let i = 0; i < total; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    
    days.push({
      id: i,
      date: new Date(d), // Важно создавать новый объект даты
      isToday: sameDay(d, todayReal), // Подсветка "настоящего" сегодня
      isAnchor: sameDay(d, anchorDate), // (Опционально) можно использовать для центрирования
      dateKey: _getDateKey(d)
    });
  }
  
  visibleDays.value = days;
  
  // Принудительно запрашиваем операции для новых дней.
  // Это не должно вызывать тормозов, если бэкенд отвечает быстро, 
  // но гарантирует наличие данных при смене режима.
  // Оптимизация: можно запрашивать диапазоном, если API позволяет, но пока оставим как есть для надежности.
  // days.forEach(day => mainStore.fetchOperations(day.dateKey));
};

const scrollToCenter = () => {
    if (scrollContainer.value) {
        const el = scrollContainer.value;
        const totalWidthVW = visibleDays.value.length * 25; // 25vw ширина одной колонки
        const centerVW = totalWidthVW / 2;
        // Расчет пикселей: (Центр всего контента в VW * ширину окна / 100) - (половина ширины экрана)
        const scrollPos = (centerVW * window.innerWidth / 100) - (window.innerWidth / 2);
        el.scrollLeft = scrollPos > 0 ? scrollPos : 0;
    }
};

// Следим за изменением даты или режима
watch([() => mainStore.todayDayOfYear, viewMode], async () => {
  generateDays();
  await nextTick();
  // При смене режима (но не даты) можно центрировать.
  // Если меняется дата (стрелками), лучше не дергать скролл резко, или дергать плавно.
  // Сейчас центрируем всегда для предсказуемости.
  scrollToCenter();
}, { immediate: true });

onMounted(() => {
  generateDays();
  // Скролл к центру при первой загрузке
  setTimeout(() => {
      scrollToCenter();
  }, 100);
});

const gridStyle = computed(() => {
  return {
    // Ширина сетки = кол-во дней * 25vw
    gridTemplateColumns: `repeat(${visibleDays.value.length}, 25vw)`
  };
});
</script>

<template>
  <div class="timeline-container">
    <div class="timeline-grid" ref="scrollContainer" :style="gridStyle">
      <MobileDayColumn 
        v-for="day in visibleDays"
        :key="day.dateKey"
        :date="day.date"
        :is-today="day.isToday"
        :date-key="day.dateKey"
        @show-menu="(payload) => emit('show-menu', payload)"
      />
    </div>
  </div>
</template>

<style scoped>
.timeline-container {
  width: 100%;
  height: 100%; 
  background-color: var(--color-background, #1a1a1a);
  overflow: hidden;
}

.timeline-grid {
  display: grid;
  height: 100%;
  overflow-x: auto; 
  overflow-y: hidden;
  scrollbar-width: none; 
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch; 
}
.timeline-grid::-webkit-scrollbar { display: none; }
</style>