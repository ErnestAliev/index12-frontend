<script setup>
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v4.1 - REMOVE SWITCHER ---
 * * ВЕРСИЯ: 4.1 - Удалена функция смены виджета через заголовок
 */

const props = defineProps({
  title: { type: String, required: true },
  totalBalance: { type: Number, required: true },
  subtitlePrefix: { type: String, required: true },
  subtitleDate: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

// emit 'open-menu' больше не используется
</script>

<template>
  <div class="dashboard-card">
    <!-- card-drag-handle оставляем для перетаскивания -->
    <div class="card-title-container card-drag-handle">
      <div class="card-title">{{ title }}</div>
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

/* Стили контейнера заголовка (Drag Handle) */
.card-title-container { 
  height: 30px; margin-bottom: 0.5rem; flex-shrink: 0; 
  cursor: grab; position: relative; 
}
.card-title-container:active { cursor: grabbing; }

/* Заголовок больше не кликабельный */
.card-title { font-size: 0.85em; color: #aaa; }

.card-total-balance.expense { color: var(--color-danger); }
</style>