<!--
 * * --- МЕТКА ВЕРСИИ: v13.6 - Styled Header Info ---
 * * ВЕРСИЯ: 13.6 - Обновлены стили заголовка (серый + зеленый)
 * ДАТА: 2025-11-18
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (LOGIC) Разделил `headerInfoString` на две части: `accountsInfoPart` и `dateInfoPart`.
 * 2. (UI) В шаблоне теперь используются два `<span>` с разными классами (`text-grey`, `text-green`).
 * 3. (CSS) Добавлены соответствующие стили для цветов.
 -->
<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import NavigationPanel from './NavigationPanel.vue';
import YAxisPanel from './YAxisPanel.vue';
import GraphRenderer from './GraphRenderer.vue';

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const isLoading = ref(true);
const yAxisLabels = ref([]);
const currentViewMode = ref('12d');
const today = ref(new Date());
const visibleDays = ref([]);

// --- Хелперы ---
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;

// 🟢 NEW (v13.6): Часть 1 - Информация о счетах
const accountsInfoPart = computed(() => {
  const count = mainStore.accounts ? mainStore.accounts.length : 0;
  return `Всего на ${count} счетах • `;
});

// 🟢 NEW (v13.6): Часть 2 - Информация о дате
const dateInfoPart = computed(() => {
  let endDateStr = '';
  if (visibleDays.value && visibleDays.value.length > 0) {
    const end = visibleDays.value[visibleDays.value.length - 1].date;
    const fullDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    endDateStr = fullDate.format(end);
  } else {
    const fullDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    endDateStr = fullDate.format(new Date());
  }
  // Убираем "г." если форматтер его уже добавил, чтобы не дублировать, или добавляем вручную если нет.
  // Обычно Intl в ru локали добавляет "г.". Но если мы хотим жестко контролировать формат:
  return `до ${endDateStr}`; // Intl обычно возвращает "16 мая 2026 г."
});

const generateVisibleDays = (mode) => {
  const modeDays = mainStore.computeTotalDaysForMode ? mainStore.computeTotalDaysForMode(mode, today.value) : 12;
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

const loadGraphData = async (mode) => {
  isLoading.value = true;
  await nextTick();
  try {
    if (mainStore.loadCalculationData) {
      await mainStore.loadCalculationData(mode, today.value);
    }
    generateVisibleDays(mode);
  } catch (error) {
    console.error("GraphModal: Ошибка загрузки данных:", error);
  } finally {
    isLoading.value = false;
  }
};

const onChangeView = (newMode) => {
  if (newMode === currentViewMode.value) return;
  currentViewMode.value = newMode;
  loadGraphData(newMode);
};

onMounted(() => {
  const t = new Date(); t.setHours(0, 0, 0, 0); today.value = t;
  loadGraphData('12d');
});
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content graph-modal-content">
      
      <div class="modal-header">
        <h2>
          Графики 
          <span class="header-subtitle">
            <!-- 🟢 v13.6: Раздельные стили -->
            <span class="text-grey">{{ accountsInfoPart }}</span>
            <span class="text-green">{{ dateInfoPart }}</span>
          </span>
        </h2>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>
      
      <div class="graph-modal-body">
        
        <aside class="modal-left-panel">
          <div class="nav-panel-container">
            <NavigationPanel @change-view="onChangeView" />
          </div>
          <div class="divider-placeholder"></div>
          <div class="y-axis-wrapper">
             <YAxisPanel :yLabels="yAxisLabels" :bottom-padding="0" />
          </div>
        </aside>

        <main class="modal-main-content">
          <div v-if="isLoading" class="loading-indicator">
            <div class="spinner"></div>
            <p>Загрузка данных...</p>
          </div>
          
          <div v-else class="graph-wrapper">
            <GraphRenderer
              v-if="visibleDays.length"
              :visibleDays="visibleDays"
              @update:yLabels="yAxisLabels = $event"
              :animate="true"
              :show-summaries="false"
            />
          </div>
        </main>
        
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.75);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000; backdrop-filter: blur(3px);
}
.modal-content {
  width: 95vw; max-width: 1600px; height: 85vh; max-height: 900px;
  background: var(--color-background); border-radius: 12px;
  border: 1px solid var(--color-border); box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; overflow: hidden;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 15px 24px; border-bottom: 1px solid var(--color-border);
  background-color: var(--color-background-soft);
}
.modal-header h2 { margin: 0; font-size: 1.2rem; color: var(--color-heading); display: flex; align-items: baseline; }

/* Общий контейнер подзаголовка */
.header-subtitle {
  font-size: 0.85em;
  margin-left: 12px;
  font-weight: 400;
}

/* 🟢 v13.6: Цвета */
.text-grey {
  color: #888;
}
.text-green {
  color: #34c759; /* Используем тот же зеленый, что и в графиках/иконках */
}

.close-btn {
  background: none; border: none; font-size: 28px;
  color: var(--color-text-soft); cursor: pointer; padding: 0; line-height: 1;
}
.close-btn:hover { color: var(--color-text); }

.graph-modal-body {
  flex-grow: 1; display: flex; overflow: hidden;
  background-color: var(--color-background);
}

/* ЛЕВАЯ ПАНЕЛЬ */
.modal-left-panel {
  width: 60px; flex-shrink: 0;
  display: flex; flex-direction: column;
  background-color: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
}
.nav-panel-container {
  flex: 0 0 320px; 
  min-height: 320px;
  border-bottom: 1px solid var(--color-border);
  overflow: hidden;
}
.divider-placeholder {
  flex-shrink: 0; height: 15px;
  background-color: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
}
.y-axis-wrapper {
  flex-grow: 1; min-height: 0; position: relative;
}

/* ОСНОВНАЯ ОБЛАСТЬ */
.modal-main-content {
  flex-grow: 1; display: flex; flex-direction: column;
  overflow: hidden; position: relative;
}
.graph-wrapper {
  flex-grow: 1; width: 100%; height: 100%;
  padding: 0; box-sizing: border-box;
}

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
