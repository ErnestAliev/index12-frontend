<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import GraphRenderer from '@/components/GraphRenderer.vue';

const emit = defineEmits(['scroll']); // Событие скролла для синхронизации
const mainStore = useMainStore();

// --- Генерация дней (Дублируем логику для автономности компонента) ---
const today = ref(new Date());
const visibleDays = ref([]);

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;

const viewMode = computed(() => mainStore.projection?.mode || '12d');

const generateDays = () => {
  const mode = viewMode.value;
  const t = new Date(); t.setHours(0,0,0,0);
  
  let total = 12; // Для мобильной версии всегда 12 колонок в базе, но данные могут быть за другой период?
  // На скриншоте "12 дней". Пока ориентируемся на режим 12 дней.
  
  let startDate = new Date(t);
  startDate.setDate(startDate.getDate() - 5);

  const days = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push({
      id: i,
      date: d,
      isToday: sameDay(d, t),
      dateKey: _getDateKey(d)
    });
  }
  visibleDays.value = days;
};

onMounted(() => {
  generateDays();
});

// --- Скролл ---
const scrollContainer = ref(null);

const onScroll = (e) => {
  emit('scroll', e.target.scrollLeft);
};

// Публичный метод для установки скролла извне (от родителя)
const setScroll = (left) => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollLeft = left;
  }
};

defineExpose({ setScroll, scrollContainer });

// --- Навигация ---
// Пока заглушки, так как логика смены дат глобальна
const prevPeriod = () => { /* Logic */ };
const nextPeriod = () => { /* Logic */ };
</script>

<template>
  <div class="mobile-chart-section">
    <!-- Область скролла графика -->
    <div class="chart-scroll-area" ref="scrollContainer" @scroll="onScroll">
      <div class="chart-wide-wrapper">
        <!-- 
             Переиспользуем GraphRenderer. 
             width: 300vw обеспечит совпадение колонок с таймлайном (12 col * 25vw = 300vw).
             showSummaries="true" покажет таблицу под графиком.
        -->
        <GraphRenderer 
          v-if="visibleDays.length"
          :visibleDays="visibleDays"
          :animate="false"
          :showSummaries="true"
        />
      </div>
    </div>

    <!-- Панель управления графиком -->
    <div class="chart-controls">
      <button class="icon-btn left">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><rect x="3" y="12" width="6" height="8" rx="1"></rect><rect x="9" y="8" width="6" height="12" rx="1"></rect><rect x="15" y="4" width="6" height="16" rx="1"></rect></svg>
      </button>
      
      <div class="nav-center">
        <button class="arrow-btn" @click="prevPeriod">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div class="period-label">
          <span class="days-num">12</span>
          <span class="days-text">дней</span>
        </div>
        <button class="arrow-btn" @click="nextPeriod">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>

      <button class="icon-btn right">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mobile-chart-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-background, #1a1a1a);
  border-top: 1px solid var(--color-border, #444);
}

.chart-scroll-area {
  flex-grow: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none; /* Firefox */
  position: relative;
}
.chart-scroll-area::-webkit-scrollbar { display: none; }

.chart-wide-wrapper {
  height: 100%;
  width: 300vw; /* 12 колонок * 25vw */
  /* GraphRenderer внутри займет 100% высоты и ширины этого враппера */
}

/* Стилизация контролов */
.chart-controls {
  height: 50px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  border-top: 1px solid var(--color-border, #444);
  background-color: var(--color-background-soft, #282828);
  flex-shrink: 0;
}

.icon-btn {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-center {
  display: flex;
  align-items: center;
  gap: 10px;
}

.arrow-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.period-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.days-num {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.days-text {
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
}
</style>