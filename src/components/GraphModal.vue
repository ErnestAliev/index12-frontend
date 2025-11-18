<!--
 * * --- МЕТКА ВЕРСИИ: v13.0 - Модальное окно "Графики" ---
 * * ВЕРСИЯ: 13.0 - Полностью новый компонент
 * ДАТА: 2025-11-18
 *
 * ОПИСАНИЕ:
 * Этот компонент реализует модальное окно, которое дублирует
 * функционал графиков с главной страницы, но позволяет
 * просматривать их в режимах 1мес, 3мес, 6мес, 1год
 * без горизонтального скролла (вмещая все дни в одно окно).
 -->
<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import NavigationPanel from './NavigationPanel.vue';
import YAxisPanel from './YAxisPanel.vue';
import GraphRenderer from './GraphRenderer.vue';

const emit = defineEmits(['close']);
const mainStore = useMainStore();

// Состояние
const isLoading = ref(true);
const yAxisLabels = ref([]);
const currentViewMode = ref('12d');
const today = ref(new Date());
const visibleDays = ref([]); // Массив дней для рендера графика

// --- Хелперы для дат (аналогично HomeView) ---
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

const _getDateKey = (date) => {
  const year = date.getFullYear();
  const doy = getDayOfYear(date);
  return `${year}-${doy}`;
};

/**
 * Генерирует массив дней (visibleDays) для выбранного режима.
 * В отличие от HomeView (где всегда 12 колонок), здесь
 * количество дней зависит от режима (30, 90, 180...).
 */
const generateVisibleDays = (mode) => {
  // Получаем количество дней для режима (например, 30 для '1m')
  const modeDays = mainStore.computeTotalDaysForMode(mode, today.value);
  
  // Центрируем "сегодня" в этом диапазоне, 
  // но для длинных диапазонов (год) логичнее показывать прошедшее + будущее.
  // Используем логику mainStore для определения rangeStartDate, 
  // чтобы график точно соответствовал загруженным данным.
  
  // 1. Вычисляем диапазон дат так же, как это делает store при загрузке
  // (Это дублирование логики из store необходимо для синхронизации визуализации)
  const baseDate = new Date(today.value);
  let startDate = new Date(baseDate);
  
  switch (mode) {
    case '12d': startDate.setDate(startDate.getDate() - 5); break;
    case '1m':  startDate.setDate(startDate.getDate() - 15); break;
    case '3m':  startDate.setDate(startDate.getDate() - 45); break;
    case '6m':  startDate.setDate(startDate.getDate() - 90); break;
    case '1y':  startDate.setDate(startDate.getDate() - 180); break;
    default:    startDate.setDate(startDate.getDate() - 5);
  }

  const days = [];
  for (let i = 0; i < modeDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    
    days.push({
      id: i,
      date: d,
      isToday: sameDay(d, today.value),
      dayOfYear: getDayOfYear(d),
      dateKey: _getDateKey(d)
    });
  }
  visibleDays.value = days;
};

/**
 * Загружает данные и обновляет график
 */
const loadGraphData = async (mode) => {
  isLoading.value = true;
  // Сбрасываем visibleDays, чтобы GraphRenderer перерисовался с нуля
  visibleDays.value = []; 
  await nextTick();
  
  try {
    // 1. Загружаем данные через action стора
    // (Он обновит calculationCache, который использует GraphRenderer)
    await mainStore.loadCalculationData(mode, today.value);
    
    // 2. Генерируем массив дней для оси X
    generateVisibleDays(mode);
    
  } catch (error) {
    console.error("GraphModal: Ошибка загрузки данных:", error);
  } finally {
    isLoading.value = false;
  }
};

// Обработчик переключения в NavigationPanel
const onChangeView = (newMode) => {
  if (newMode === currentViewMode.value) return;
  currentViewMode.value = newMode;
  loadGraphData(newMode);
};

onMounted(() => {
  // Инициализация
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  today.value = t;
  
  // Загружаем дефолтный вид (12d)
  loadGraphData('12d');
});
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content graph-modal-content">
      
      <!-- Шапка модального окна -->
      <div class="modal-header">
        <h2>Графики</h2>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>
      
      <!-- Тело окна: повторяет структуру HomeView -->
      <div class="graph-modal-body">
        
        <!-- Левая панель: Навигация + Ось Y -->
        <aside class="modal-left-panel">
          <div class="nav-panel-container">
            <NavigationPanel @change-view="onChangeView" />
          </div>
          <div class="divider-placeholder"></div>
          <!-- YAxisPanel получает метки от GraphRenderer -->
          <YAxisPanel :yLabels="yAxisLabels" />
        </aside>

        <!-- Основная область: График -->
        <main class="modal-main-content">
          
          <div v-if="isLoading" class="loading-indicator">
            <div class="spinner"></div>
            <p>Загрузка данных...</p>
          </div>
          
          <div v-else class="graph-wrapper">
            <!-- 
              GraphRenderer автоматически растянется на всю ширину,
              вмещая все дни из visibleDays без скролла (chart.js feature)
            -->
            <GraphRenderer
              v-if="visibleDays.length"
              :visibleDays="visibleDays"
              @update:yLabels="yAxisLabels = $event"
              :animate="true"
            />
          </div>
          
        </main>
        
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- Оболочка Модального Окна --- */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.75); /* Темный фон */
  display: flex; align-items: center; justify-content: center;
  z-index: 2000; /* Поверх всего */
  backdrop-filter: blur(3px);
}

.modal-content {
  width: 95vw;
  max-width: 1600px; /* Очень широкое окно для графиков */
  height: 85vh;
  max-height: 900px;
  
  background: var(--color-background);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 15px 24px;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-background-soft);
}
.modal-header h2 { margin: 0; font-size: 1.2rem; color: var(--color-heading); }

.close-btn {
  background: none; border: none; font-size: 28px;
  color: var(--color-text-soft); cursor: pointer;
  padding: 0; line-height: 1;
}
.close-btn:hover { color: var(--color-text); }

/* --- Структура (Grid Layout) --- */
.graph-modal-body {
  flex-grow: 1;
  display: flex;
  overflow: hidden;
  background-color: var(--color-background);
}

/* Левая панель (фиксированная ширина 60px, как в HomeView) */
.modal-left-panel {
  width: 60px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
}

/* Контейнер для навигации (занимает верхнюю часть) */
.nav-panel-container {
  flex-grow: 1; /* Растягивается, толкая Y-ось вниз */
  min-height: 0;
  border-bottom: 1px solid var(--color-border);
  overflow: hidden;
}

.divider-placeholder {
  flex-shrink: 0; height: 15px;
  background-color: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
}
/* YAxisPanel встанет внизу автоматически благодаря flex-grow у nav-panel */


/* Основная область */
.modal-main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.graph-wrapper {
  flex-grow: 1;
  width: 100%;
  height: 100%;
  padding: 10px; /* Небольшой отступ для графика */
  box-sizing: border-box;
}

/* Стили загрузки */
.loading-indicator {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--color-text);
}
.spinner {
  width: 40px; height: 40px;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
