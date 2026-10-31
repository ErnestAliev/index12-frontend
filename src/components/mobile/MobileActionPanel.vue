<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import CodexIcon from '@/components/CodexIcon.vue';

const emit = defineEmits(['action', 'open-codex', 'open-projects', 'open-user-menu', 'prev-month', 'next-month']);
const props = defineProps({
  currentMonthLabel: { type: String, default: '' },
  prevMonthLabel: { type: String, default: '' },
  nextMonthLabel: { type: String, default: '' }
});

const mainStore = useMainStore();

const openCodex = () => emit('open-codex');
const openProjects = () => emit('open-projects');
const openUserMenu = () => emit('open-user-menu');
const toggleWidgets = () => mainStore.toggleHeaderExpansion();

const monthLabel = computed(() => props.currentMonthLabel || '—');
</script>

<template>
  <div class="mobile-action-panel-wrapper">
    <div class="chart-controls-row">
      <!-- 1. Codex (disabled for manager) -->
      <button 
        class="icon-circle" 
        :disabled="mainStore.workspaceRole === 'manager'"
        @click="openCodex"
        title="Codex" aria-label="Открыть чат Codex"
      >
        <CodexIcon />
      </button>
      
      <!-- 2. Проекты -->
      <button v-if="mainStore.workspaceRole !== 'manager'" class="icon-circle" @click="openProjects" title="Рабочие области">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>

      <!-- 3. Перелистывание месяцев -->
      <div class="month-nav" :class="{ disabled: mainStore.workspaceRole === 'manager' }">
        <button 
          class="icon-circle arrow-btn" 
          :disabled="mainStore.workspaceRole === 'manager'"
          @click="emit('prev-month')"
          :title="prevMonthLabel || 'Предыдущий месяц'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div class="month-text">{{ monthLabel }}</div>
        <button 
          class="icon-circle arrow-btn" 
          :disabled="mainStore.workspaceRole === 'manager'"
          @click="emit('next-month')"
          :title="nextMonthLabel || 'Следующий месяц'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

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

.month-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 33px;

  min-width: 150px;
  justify-content: center;
}

.month-nav.disabled {
  opacity: 0.35;
  pointer-events: none;
}

.month-text {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text, #fff);
  text-transform: capitalize;
  white-space: nowrap;
}

/* Кнопки (Codex, Projects, Avatar, Widgets) */
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

<style scoped>
@media (max-width: 400px) {
  .chart-controls-row { display: grid; grid-template-columns: repeat(4, 1fr); height: auto; min-height: 96px; gap: 2px 6px; padding: 4px 8px 16px; justify-items: center; }
  .month-nav { grid-column: 1 / -1; grid-row: 1; min-width: 0; justify-content: center; }
  .month-nav .arrow-btn { width: 36px; height: 32px; }
  .chart-controls-row > .icon-circle { width: 40px; height: 40px; }
}
</style>
