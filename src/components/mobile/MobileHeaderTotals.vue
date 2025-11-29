<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

const mainStore = useMainStore();

// Получаем данные из стора
const currentTotal = computed(() => mainStore.currentTotalBalance);
const futureTotal = computed(() => mainStore.futureTotalBalance);
const accountsCount = computed(() => mainStore.currentAccountBalances.length);

// 🟢 ИЗМЕНЕНО: year: '2-digit'
const todayStr = computed(() => {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date());
});

// 🟢 ИЗМЕНЕНО: year: '2-digit'
const futureDateStr = computed(() => {
  const d = mainStore.projection?.rangeEndDate ? new Date(mainStore.projection.rangeEndDate) : new Date();
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' }).format(d);
});
</script>

<template>
  <div class="mobile-totals-wrapper">
    <!-- Левая карточка: Текущее -->
    <div class="total-card left-card">
      <div class="card-label">Всего на счетах<br>на текущий момент</div>
      <div class="card-value">
        <span class="currency">₸</span> {{ formatNumber(currentTotal) }}
      </div>
      <div class="card-sub">
        Всего на {{ accountsCount }} счетах • <span class="green-text">до {{ todayStr }}</span>
      </div>
    </div>

    <!-- Разделитель -->
    <div class="divider"></div>

    <!-- Правая карточка: Будущее -->
    <div class="total-card right-card">
      <div class="card-label right-align">Всего на счетах<br>с учетом будущих</div>
      <div class="card-value right-align">
        {{ formatNumber(futureTotal) }} <span class="currency">₸</span>
      </div>
      <div class="card-sub right-align">
        Всего на {{ accountsCount }} счетах • <span class="green-text">до {{ futureDateStr }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-totals-wrapper {
  display: flex;
  width: 100%;
  height: 90px;
  background-color: var(--color-background-soft, #282828);
  border-bottom: 1px solid var(--color-border, #444);
  flex-shrink: 0;
}

.total-card {
  flex: 1;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.divider {
  width: 1px;
  background-color: var(--color-border, #444);
  height: 100%;
}

.card-label {
  font-size: 10px;
  color: #888;
  margin-bottom: 4px;
  line-height: 1.2;
}

.card-value {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
  white-space: nowrap;
}

.currency {
  font-size: 14px;
  color: #aaa;
  font-weight: 400;
}

.card-sub {
  font-size: 9px;
  color: #666;
}

.green-text {
  color: var(--color-primary, #34c759);
}

.right-align {
  text-align: right;
}
</style>