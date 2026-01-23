<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';

const emit = defineEmits(['action', 'open-ai', 'open-projects', 'open-user-menu', 'prev-month', 'next-month']);
const props = defineProps({
  currentMonthLabel: { type: String, default: '' },
  prevMonthLabel: { type: String, default: '' },
  nextMonthLabel: { type: String, default: '' }
});

const mainStore = useMainStore();

const openAi = () => emit('open-ai');
const openProjects = () => emit('open-projects');
const openUserMenu = () => emit('open-user-menu');
const toggleWidgets = () => mainStore.toggleHeaderExpansion();

const monthLabel = computed(() => props.currentMonthLabel || '—');
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
  border-radius: 12px;
  padding: 0 8px;
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
