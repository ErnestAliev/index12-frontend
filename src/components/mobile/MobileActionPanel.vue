<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import UiIcon from '@/components/UiIcon.vue';
import {useTeamChatStore} from '@/stores/teamChatStore';
import CodexIcon from '@/components/CodexIcon.vue';

const emit = defineEmits(['action', 'open-codex', 'open-calendar', 'open-team-chat', 'open-user-menu', 'prev-month', 'next-month']);
const props = defineProps({
  currentMonthLabel: { type: String, default: '' },
  prevMonthLabel: { type: String, default: '' },
  nextMonthLabel: { type: String, default: '' }
});

const mainStore = useMainStore(), teamChat=useTeamChatStore(), monthOpen=ref(false), root=ref(null);
const closeMonth=event=>{if(!root.value?.contains(event.target))monthOpen.value=false;};
const escape=event=>{if(event.key==='Escape')monthOpen.value=false;};
onMounted(()=>{window.addEventListener('pointerdown',closeMonth);window.addEventListener('keydown',escape);});
onBeforeUnmount(()=>{window.removeEventListener('pointerdown',closeMonth);window.removeEventListener('keydown',escape);});

const openCodex = () => emit('open-codex');
const openCalendar = () => emit('open-calendar');
const openUserMenu = () => emit('open-user-menu');
const toggleWidgets = () => mainStore.toggleHeaderExpansion();

const monthLabel = computed(() => props.currentMonthLabel || '—');
</script>

<template>
  <div ref="root" class="mobile-action-panel-wrapper">
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
      
      <!-- Календарь задач -->
      <button :disabled="!mainStore.isAdmin" class="icon-circle" @click="openCalendar" title="Календарь задач" aria-label="Открыть календарь задач">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>
        </svg>
      </button>

      <button class="icon-circle team-chat-button" title="Чат сотрудников" aria-label="Открыть чат сотрудников" :aria-expanded="teamChat.open" @click="emit('open-team-chat')"><UiIcon name="chat"/><span v-if="teamChat.unread||teamChat.pending.length||teamChat.actionable" class="team-unread">{{teamChat.unread+teamChat.pending.length+teamChat.actionable}}</span></button>
      <button class="icon-circle" title="Файлы" aria-label="Открыть файлы" @click="teamChat.openFiles()"><UiIcon name="folder"/></button>
      <button class="icon-circle" title="Выбор месяца" aria-label="Выбор месяца" :aria-expanded="monthOpen" :disabled="mainStore.workspaceRole==='manager'" @click.stop="monthOpen=!monthOpen"><UiIcon name="month"/></button>
      <div v-if="monthOpen" class="month-picker" role="dialog" aria-label="Переключение месяцев" @click.stop><button class="icon-circle" :title="prevMonthLabel||'Предыдущий месяц'" aria-label="Предыдущий месяц" @click="emit('prev-month')"><UiIcon name="chevron-left"/></button><span class="month-text">{{monthLabel}}</span><button class="icon-circle" :title="nextMonthLabel||'Следующий месяц'" aria-label="Следующий месяц" @click="emit('next-month')"><UiIcon name="chevron-right"/></button></div>

      <!-- 4. Аватар пользователя (always active) -->
      <button class="icon-circle user-avatar" @click="openUserMenu" title="Меню" aria-label="Открыть меню">
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
        title="Виджеты" aria-label="Виджеты"
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
  position:relative;
  display: flex;
  flex-direction: column;
  background-color: var(--widget-background, #ffffff);
  border-top: 1px solid var(--widget-border, #e0e0e0);
  flex-shrink: 0;
  z-index: 100;
  padding-bottom: var(--safe-area-bottom);
}

.chart-controls-row {
  height: 68px;
  display: grid;
  grid-template-columns:repeat(6,minmax(0,1fr));
  justify-items:center;
  justify-content: space-between;
  align-items: center;
  padding: 0 calc(12px + var(--safe-area-right)) 0 calc(12px + var(--safe-area-left));
  gap: 4px;
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
.icon-circle{border-color:var(--color-border);border-radius:10px;width:44px;height:44px;transition:background-color .15s,color .15s,border-color .15s}.icon-circle :deep(svg){width:20px;height:20px;display:block}.icon-circle:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}.month-picker{position:absolute;bottom:calc(100% + 8px);left:12px;right:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;background:var(--color-background);color:var(--color-text);border:1px solid var(--color-border);border-radius:12px;box-shadow:0 4px 16px #0002}.month-text{font-weight:500}.team-chat-button{position:relative}.team-unread{position:absolute;right:-4px;top:-4px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:var(--color-primary);color:white;font-size:10px;line-height:16px}.icon-circle:active{color:var(--color-text);background:var(--color-background-soft);border-color:var(--color-border)}
</style>

<style scoped>
.chart-controls-row{grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;padding:0 max(8px,var(--safe-area-right,0px)) 0 max(8px,var(--safe-area-left,0px))}
.chart-controls-row>.icon-circle{width:100%;max-width:44px;min-width:0;height:44px;box-sizing:border-box;border-radius:9px}
.chart-controls-row>.icon-circle :deep(svg){width:18px;height:18px}
</style>
