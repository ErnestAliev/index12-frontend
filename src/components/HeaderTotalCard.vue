<script setup>
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v4.0 - CENTRALIZED MENU ---
 * * ВЕРСИЯ: 4.0 - Использует глобальное меню TheHeader
 */

const props = defineProps({
  title: { type: String, required: true },
  totalBalance: { type: Number, required: true },
  subtitlePrefix: { type: String, required: true },
  subtitleDate: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const emit = defineEmits(['open-menu']);

const onTitleClick = (event) => {
  emit('open-menu', { 
    event, 
    widgetKey: props.widgetKey, 
    widgetIndex: props.widgetIndex 
  });
};
</script>

<template>
  <div class="dashboard-card">
    <!-- 🟢 ADDED CLASS card-drag-handle -->
    <div 
      class="card-title-container card-drag-handle" 
      @click="onTitleClick"
    >
      <div class="card-title">{{ title }} <span>▽</span></div>
    </div>

    <div 
      class="card-total-balance"
      :class="{ 'expense': props.totalBalance < 0 }"
    >
      ₸ {{ props.totalBalance < 0 ? '-' : '' }}{{ formatNumber(Math.abs(props.totalBalance)) }}
    </div>
    
    <div class="card-sub-balance">
      {{ props.subtitlePrefix }} • <span class="subtitle-date">{{ props.subtitleDate }}</span>
    </div>
  </div>
</template>

<style scoped>
.dashboard-card { flex: 1; display: flex; flex-direction: column; padding-right: 1.5rem; border-right: 1px solid var(--color-border); position: relative; }
.dashboard-card:last-child { border-right: none; padding-right: 0; }

.card-total-balance { font-size: 1.8em; font-weight: bold; color: var(--color-heading); margin-bottom: 0.25rem; white-space: nowrap; }
.card-sub-balance { font-size: 0.8em; color: #777; }
.card-sub-balance .subtitle-date { color: var(--color-primary); font-weight: 500; }

/* 🟢 Cursor styles moved here for handle */
.card-title-container { 
  height: 30px; margin-bottom: 0.5rem; flex-shrink: 0; 
  cursor: grab; position: relative; 
}
.card-title-container:active { cursor: grabbing; }

.card-title { font-size: 0.85em; color: #aaa; transition: color 0.2s; }
.card-title:hover { color: #ddd; }
.card-title span { font-size: 0.8em; margin-left: 4px; }
.card-total-balance.expense { color: var(--color-danger); }
</style>