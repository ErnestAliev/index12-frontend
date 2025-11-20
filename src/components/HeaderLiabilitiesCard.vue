<script setup>
import { computed } from 'vue';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v1.0 - NEW WIDGET ---
 * * ВЕРСИЯ: 1.0 - Виджет "Мои обязательства"
 * * ДАТА: 2025-11-20
 *
 * ОПИСАНИЕ:
 * Карточка отображает два показателя:
 * 1. Мы должны (Работами) - полученные авансы минус закрытые акты.
 * 2. Нам должны (Деньгами) - недоплаченные остатки по сделкам.
 */

const props = defineProps({
  title: { type: String, default: 'Мои обязательства' },
  weOweAmount: { type: Number, default: 0 },   // Мы должны (работами)
  theyOweAmount: { type: Number, default: 0 }, // Нам должны (деньгами)
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

// Форматирование с валютой
const formatCurrency = (val) => {
  const absVal = Math.abs(val);
  const str = formatNumber(absVal);
  return `${str} ₸`;
};
</script>

<template>
  <div class="dashboard-card liabilities-card">
    
    <!-- Заголовок (статичный, так как это спец. виджет) -->
    <div class="card-title-container">
      <div class="card-title">
        {{ title }}
      </div>
      <!-- Иконка для красоты (можно добавить действия позже) -->
      <div class="card-actions">
        <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
      </div>
    </div>

    <div class="liabilities-content">
      
      <!-- Строка 1: Мы должны -->
      <div class="liability-row">
        <div class="row-label">
          <span class="label-main">Мы должны</span>
          <span class="label-sub">(Работами)</span>
        </div>
        <div class="row-value we-owe">
          {{ formatCurrency(weOweAmount) }}
        </div>
      </div>
      
      <div class="divider"></div>

      <!-- Строка 2: Нам должны -->
      <div class="liability-row">
        <div class="row-label">
          <span class="label-main">Нам должны</span>
          <span class="label-sub">(Деньгами)</span>
        </div>
        <div class="row-value they-owe">
          {{ formatCurrency(theyOweAmount) }}
        </div>
      </div>

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
  min-height: 0;
}
.dashboard-card:last-child {
  border-right: none;
  padding-right: 0;
}

/* Заголовок */
.card-title-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 32px;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}
.card-title {
  font-size: 0.85em;
  color: #aaa;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.icon-svg {
  width: 14px;
  height: 14px;
  color: #555;
}

/* Контент */
.liabilities-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.liability-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.row-label {
  display: flex;
  flex-direction: column;
}
.label-main {
  font-size: 0.9em;
  color: var(--color-text);
  font-weight: 500;
}
.label-sub {
  font-size: 0.7em;
  color: #666;
}

.row-value {
  font-size: 1.1em;
  font-weight: 700;
  white-space: nowrap;
}

/* Цвета значений */
.we-owe {
  color: #ff9f0a; /* Оранжевый (предупреждение) */
}
.they-owe {
  color: var(--color-primary); /* Зеленый (потенциальный доход) */
}

.divider {
  height: 1px;
  background-color: var(--color-border);
  opacity: 0.5;
  width: 100%;
}

@media (max-height: 900px) {
  .dashboard-card { padding-right: 1rem; min-width: 140px; }
  .card-title { font-size: 0.75em; }
  .row-value { font-size: 1em; }
  .label-main { font-size: 0.85em; }
}
</style>
