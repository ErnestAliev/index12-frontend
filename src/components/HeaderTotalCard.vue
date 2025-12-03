<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

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

/* Унификация заголовка */
.card-title { 
  font-size: var(--font-sm); 
  font-weight: var(--fw-semi);
  color: var(--text-mute); /* Чуть приглушенный для заголовка "Всего..." */
  white-space: pre-line; 
  line-height: 1.3;
  letter-spacing: 0.01em;
}

.card-title-container { 
  min-height: var(--h-header-card); 
  height: auto;
  margin-bottom: var(--gap-sm); 
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

/* Крупная сумма */
.card-total-balance { 
  font-size: var(--font-3xl); /* 32px */
  font-weight: var(--fw-bold); 
  color: var(--text-main); 
  margin-bottom: 4px; 
  white-space: nowrap; 
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.card-total-balance.expense { color: var(--color-danger); }

.currency-symbol {
  font-weight: var(--fw-regular);
  opacity: 0.7;
  font-size: 0.8em;
}

.card-sub-balance { 
  font-size: var(--font-xs);
  color: var(--text-mute); 
}
.card-sub-balance .subtitle-date { 
  color: var(--color-primary); 
  font-weight: var(--fw-medium); 
}
</style>