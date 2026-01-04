<script setup>
import { computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';

const emit = defineEmits(['action', 'open-ai', 'open-projects', 'open-user-menu']);
const mainStore = useMainStore();

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

onMounted(async () => {
    // Если при загрузке режим не определен — ставим дефолт '12d'
    if (!mainStore.projection?.mode) {
        const today = new Date();
        mainStore.setToday(getDayOfYear(today));
        await mainStore.updateFutureProjectionByMode('12d', today);
        // Данные загрузит HomeView или watcher
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
      <button class="icon-circle" @click="openProjects" title="Проекты">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>
      
      <!-- 3. Переключатель режимов (disabled for manager) -->
      <div class="nav-center" :class="{ 'disabled': mainStore.workspaceRole === 'manager' }">
        <button 
          class="arrow-btn" 
          :disabled="mainStore.workspaceRole === 'manager'"
          @click="switchViewMode(-1)"
        >
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        
        <div 
          class="period-label" 
          :class="{ 'disabled': mainStore.workspaceRole === 'manager' }"
          @click="mainStore.workspaceRole !== 'manager' && switchViewMode(1)"
        >
          <span class="days-num">{{ currentDisplay.num }}</span>
          <span class="days-text">{{ currentDisplay.unit || currentDisplay.text }}</span>
        </div>
        
        <button 
          class="arrow-btn" 
          :disabled="mainStore.workspaceRole === 'manager'"
          @click="switchViewMode(1)"
        >
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <!-- 4. Аватар пользователя (always active) -->
      <button class="icon-circle user-avatar" @click="openUserMenu" title="Профиль">
        <img v-if="mainStore.user?.picture" :src="mainStore.user.picture" alt="Avatar" class="avatar-img" />
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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

/* Уменьшенный центральный переключатель */
.nav-center { 
  display: flex; 
  align-items: center; 
  gap: 12px;
  flex-shrink: 0;
}

.arrow-btn { 
  background: none; 
  border: none; 
  padding: 6px;
  cursor: pointer; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
}
.arrow-btn:active { opacity: 0.7; transform: scale(0.95); }

.period-label { 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  cursor: pointer; 
  line-height: 1; 
  user-select: none; 
  width: 60px;
  flex-shrink: 0;
}
.days-num { font-size: 18px; font-weight: 700; color: #fff; }
.days-text { font-size: 8px; color: #888; font-weight: 600; text-transform: uppercase; margin-top: 2px; }

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

/* Disabled state for nav-center container */
.nav-center.disabled {
  opacity: 0.3;
  pointer-events: none;
}

.nav-center.disabled .period-label {
  cursor: not-allowed;
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