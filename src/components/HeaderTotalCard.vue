<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v4.4 - UNIFIED STYLES ---
 * * ВЕРСИЯ: 4.4 - Унификация шрифтов и заголовков
 * * ДАТА: 2025-12-03
 */

const props = defineProps({
  title: { type: String, required: true },
  totalBalance: { type: Number, required: true },
  subtitlePrefix: { type: String, required: true },
  subtitleDate: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const isFuture = computed(() => props.widgetKey === 'futureTotal');
const formattedValue = computed(() => formatNumber(Math.abs(props.totalBalance)));
const sign = computed(() => props.totalBalance < 0 ? '-' : '');
</script>

<template>
  <div class="dashboard-card" :class="{ 'is-mirrored': isFuture }">
    <div class="card-title-container card-drag-handle">
      <div class="card-title">{{ title }}</div>
    </div>

    <div 
      class="card-total-balance"
      :class="{ 'expense': props.totalBalance < 0 }"
    >
      <template v-if="!isFuture">
        <span class="currency-symbol">₸</span>&nbsp;{{ sign }}{{ formattedValue }}
      </template>
      <template v-else>
        {{ sign }}{{ formattedValue }}&nbsp;<span class="currency-symbol">₸</span>
      </template>
    </div>
    
    <div class="card-sub-balance">
      {{ props.subtitlePrefix }} • <span class="subtitle-date">{{ props.subtitleDate }}</span>
    </div>
  </div>
</template>

<style scoped>
.dashboard-card { 
  flex: 1; 
  display: flex; 
  flex-direction: column; 
  padding-right: 1.5rem; 
  border-right: 1px solid var(--color-border); 
  position: relative; 
  text-align: left;
}
.dashboard-card:last-child { border-right: none; padding-right: 0; }

.dashboard-card.is-mirrored {
  align-items: flex-end; 
  text-align: right;     
}

/* 🟢 UNIFIED TITLE */
.card-title { 
  font-size: 13px; 
  font-weight: 600;
  color: #ffffff; 
  white-space: pre-line; 
  line-height: 1.3;
  letter-spacing: 0.01em;
}

.card-title-container { 
  min-height: 32px; 
  height: auto;
  margin-bottom: 0.5rem; 
  flex-shrink: 0; 
  cursor: grab; 
  position: relative; 
  display: flex;
  align-items: center; 
  width: 100%; 
}

.dashboard-card:not(.is-mirrored) .card-title-container { justify-content: flex-start; }
.dashboard-card.is-mirrored .card-title-container { justify-content: flex-end; }
.card-title-container:active { cursor: grabbing; }

/* 🟢 UNIFIED BALANCE SIZE */
.card-total-balance { 
  font-size: 2.5em; /* Было 1.8em (~28px), чуть уменьшил для аккуратности */
  font-weight: 700; 
  color: var(--color-heading); 
  margin-bottom: 0.25rem; 
  white-space: nowrap; 
  line-height: 1.2;
}
.card-total-balance.expense { color: var(--color-danger); }

.currency-symbol {
  font-weight: 400;
  opacity: 0.7;
  font-size: 0.8em;
}

.card-sub-balance { 
  font-size: 11px; /* Было 0.8em */
  color: #777; 
}
.card-sub-balance .subtitle-date { 
  color: var(--color-primary); 
  font-weight: 500; 
}
</style>