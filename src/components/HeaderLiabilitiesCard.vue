<script setup>
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v2.0 - VISUAL FIX ---
 * * ВЕРСИЯ: 2.0 - Приведение к стандарту dashboard-card
 * * ДАТА: 2025-11-20
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (UI) Удалена кастомная верстка. Теперь используется стандартный список `.card-items-list`.
 * 2. (UI) Убраны иконки и лишние отступы.
 * 3. (STYLE) Цвета соответствуют логике:
 * - "Мы должны" -> Красный (это наш долг/обязательство).
 * - "Нам должны" -> Зеленый (это наши будущие деньги).
 */

const props = defineProps({
  title: { type: String, default: 'Мои обязательства' },
  weOweAmount: { type: Number, default: 0 },   // Мы должны
  theyOweAmount: { type: Number, default: 0 }, // Нам должны
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const formatCurrency = (val) => {
  const absVal = Math.abs(val);
  return `${formatNumber(absVal)} ₸`;
};
</script>

<template>
  <div class="dashboard-card">
    
    <!-- Стандартный заголовок -->
    <div class="card-title-container">
      <div class="card-title">
        {{ title }}
      </div>
    </div>

    <!-- Стандартный список элементов -->
    <div class="card-items-list">
      
      <!-- Строка 1: Мы должны -->
      <div class="card-item">
        <span title="Полученные авансы, по которым работа не сдана">Мы должны</span>
        <span class="value-expense">
          {{ formatCurrency(weOweAmount) }}
        </span>
      </div>

      <!-- Строка 2: Нам должны -->
      <div class="card-item">
        <span title="Остатки по сделкам, где внесена только часть суммы">Нам должны</span>
        <span class="value-income">
          {{ formatCurrency(theyOweAmount) }}
        </span>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* Используем те же классы, что и в HeaderBalanceCard/HeaderCategoryCard */

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
  cursor: default;
  white-space: nowrap;
}

/* Список элементов */
.card-items-list {
  flex-grow: 1;
  overflow-y: auto;
  padding-right: 5px;
  scrollbar-width: none;
  display: flex;
  flex-direction: column;
  gap: 4px; /* Небольшой отступ между строками */
}

.card-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9em;
  margin-bottom: 0.25rem;
}

.card-item span:first-child {
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 10px;
}

.card-item span:last-child {
  font-weight: 500;
  white-space: nowrap;
}

/* Цвета значений */
.value-expense {
  color: var(--color-danger); /* Красный для наших обязательств */
}
.value-income {
  color: var(--color-primary); /* Зеленый для долгов нам */
}

@media (max-height: 900px) {
  .dashboard-card { min-width: 100px; padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .card-item { font-size: 0.8em; margin-bottom: 0.2rem; }
}
</style>
