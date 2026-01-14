<script setup>
import { ref, computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import MobilePeriodSelector from '@/components/mobile/MobilePeriodSelector.vue';

const emit = defineEmits(['action', 'open-ai', 'open-projects', 'open-user-menu']);
const mainStore = useMainStore();

// Period selector modal
const showPeriodSelector = ref(false);

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

const openAi = () => emit('open-ai');
const openProjects = () => emit('open-projects');
const openUserMenu = () => emit('open-user-menu');
const toggleWidgets = () => mainStore.toggleHeaderExpansion();
const openPeriodSelector = () => showPeriodSelector.value = true;

// Period display text
const periodDisplayText = computed(() => {
  const filter = mainStore.periodFilter;
  if (!filter || filter.mode === 'all') {
    return 'Весь период';
  }
  if (filter.mode === 'custom' && filter.customStart && filter.customEnd) {
    const start = new Date(filter.customStart);
    const end = new Date(filter.customEnd);
    const formatShort = (d) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(d);
    return `${formatShort(start)}—${formatShort(end)}`;
  }
  return 'Период';
});

onMounted(async () => {
    console.log('[MOBILE ACTION PANEL] onMounted called');
    console.log('[MOBILE ACTION PANEL] projection.mode:', mainStore.projection?.mode);
    
    // Если при загрузке режим не определен — ставим дефолт '12d'
    if (!mainStore.projection?.mode) {
        console.log('[MOBILE ACTION PANEL] No projection mode, setting to 12d');
        const today = new Date();
        mainStore.setToday(getDayOfYear(today));
        await mainStore.updateFutureProjectionByMode('12d', today);
        console.log('[MOBILE ACTION PANEL] After updateFutureProjectionByMode, projection.mode:', mainStore.projection?.mode);
        // Данные загрузит HomeView или watcher
    } else {
        console.log('[MOBILE ACTION PANEL] Projection mode already set:', mainStore.projection.mode);
    }
});
</script>

<template>
  <div class="mobile-action-panel-wrapper">
    <div class="chart-controls-row">
      <!-- 1. AI ассистент (disabled for manager) -->
      <button 
        class="icon-circle" 
        :disabled="mainStore.workspaceRole === 'manager'"
        @click="openAi" 
        title="AI ассистент"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2l1.2 4.2L17.4 8 13.2 9.2 12 13.4 10.8 9.2 6.6 8l4.2-1.8L12 2z" />
          <path d="M19 10l.9 3.1L23 14l-3.1.9L19 18l-.9-3.1L15 14l3.1-.9L19 10z" />
          <path d="M5 12l.8 2.6L8.4 15l-2.6.8L5 18.4l-.8-2.6L1.6 15l2.6-.8L5 12z" />
        </svg>
      </button>
      
      <!-- 2. Проекты (always active) -->
      <button class="icon-circle" @click="openProjects" title="Рабочие области">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>
      
      <!-- 3. Period Selector (disabled for manager) -->
      <button 
        class="period-button"
        :disabled="mainStore.workspaceRole === 'manager'"
        @click="openPeriodSelector"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <span class="period-text">{{ periodDisplayText }}</span>
        <div v-if="mainStore.periodFilter?.mode === 'custom'" class="period-indicator"></div>
      </button>

      <!-- 4. Аватар пользователя (always active) -->
      <button class="icon-circle user-avatar" @click="openUserMenu" title="Профиль">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </button>

      <!-- 5. Виджеты (disabled for manager) -->
      <button 
        class="icon-circle header-expand-btn" 
        :class="{ 'active': mainStore.isHeaderExpanded }"
        :disabled="mainStore.workspaceRole === 'manager'"
        @click="toggleWidgets"
        title="Виджеты"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
      </button>
    </div>
    
    <!-- Period Selector Modal -->
    <MobilePeriodSelector 
      v-if="showPeriodSelector" 
      @close="showPeriodSelector = false"
      @apply="showPeriodSelector = false"
    />
  </div>
</template>

<style scoped>
.mobile-action-panel-wrapper {
  display: flex;
  flex-direction: column;
  background-color: var(--widget-background, #ffffff);
  border-top: 1px solid var(--widget-border, #e0e0e0);
  flex-shrink: 0;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
}

.chart-controls-row {
  height: 88px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  padding-bottom: 24px;
  gap: 8px;
}

/* Period Button */
.period-button {
  height: 36px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: var(--color-text, #fff);
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  position: relative;
}

.period-button:active {
  transform: scale(0.95);
  background: rgba(255,255,255,0.1);
}

.period-text {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.period-indicator {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary, #34c759);
}

/* Кнопки (AI, Projects, Avatar, Widgets) */
.icon-circle, .header-expand-btn {
  width: 36px; 
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.1);
  display: flex; 
  align-items: center; 
  justify-content: center;
  color: var(--color-heading, #fff); 
  background: transparent; 
  padding: 0; 
  cursor: pointer;
  transition: all 0.2s;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
}

.icon-circle:active, .header-expand-btn:active { 
  background-color: rgba(255,255,255,0.1); 
  color: #fff; 
  border-color: #fff; 
}

.header-expand-btn.active {
  color: var(--color-primary, #34c759);
  border-color: var(--color-primary, #34c759);
  background: rgba(52, 199, 89, 0.1);
}

/* Disabled state for buttons (manager role) */
.icon-circle:disabled, 
.header-expand-btn:disabled,
.arrow-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  pointer-events: none;
}

/* Disabled state for period button */
.period-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  pointer-events: none;
}

.icon-circle svg, .header-expand-btn svg { display: block; }

/* Avatar styling */
.user-avatar {
  overflow: hidden;
  padding: 0;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}
</style>