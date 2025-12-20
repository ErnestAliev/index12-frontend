<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import { useWidgetData } from '@/composables/useWidgetData.js';

const mainStore = useMainStore();
const activeWidgetKey = ref(null);
const activeWidgetItems = ref([]);

const isWidgetDeltaMode = computed(() => { const k = activeWidgetKey.value; return ['contractors', 'projects', 'individuals', 'categories', 'taxes'].includes(k); });
const getDeltaClass = (val, widgetKey) => { const num = Number(val) || 0; if (num === 0) return 'white-text'; if (widgetKey === 'taxes') return num < 0 ? 'red-text' : 'green-text'; return num > 0 ? 'green-text' : 'red-text'; };

// ===== Sticky footer totals for balance-type widgets (Mobile Fullscreen) =====
const isTotalsWidget = computed(() => {
  const k = activeWidgetKey.value;
  return ['contractors', 'projects', 'individuals', 'categories'].includes(k);
});

const _sumBySign = (list, getter, sign) => {
  if (!Array.isArray(list) || !list.length) return 0;
  let total = 0;
  for (const item of list) {
    const v = Number(getter(item)) || 0;
    if (sign === 'pos') {
      if (v > 0) total += v;
    } else {
      if (v < 0) total += Math.abs(v);
    }
  }
  return total;
};

const _getFactVal = (item) => {
  const v = (item && item.currentBalance !== undefined) ? item.currentBalance : item?.balance;
  return Number(v) || 0;
};

const _getPlanVal = (item) => {
  // For these widgets in mobile fullscreen we show delta mode (futureChange). Fallback to futureBalance.
  const v = (item && item.futureChange !== undefined) ? item.futureChange : item?.futureBalance;
  return Number(v) || 0;
};

const widgetFooterTotals = computed(() => {
  if (!isTotalsWidget.value) return null;
  const list = activeWidgetItems.value || [];

  return {
    factExpense: _sumBySign(list, _getFactVal, 'neg'),
    factIncome: _sumBySign(list, _getFactVal, 'pos'),
    planExpense: _sumBySign(list, _getPlanVal, 'neg'),
    planIncome: _sumBySign(list, _getPlanVal, 'pos'),
  };
});

const formatSignedFooter = (amount, sign) => {
  const num = Math.abs(Number(amount) || 0);
  return `${sign} ${formatNumber(num)} ₸`;
};
</script>

<template>
  <!-- ... other template code ... -->

  <div class="fs-footer">
    <div v-if="isTotalsWidget" class="fs-totals">
      <div class="fs-total-item">
        <div class="fs-total-label">Факт Расход</div>
        <div class="fs-total-value red-text">{{ formatSignedFooter(widgetFooterTotals?.factExpense ?? 0, '-') }}</div>
      </div>
      <div class="fs-total-item">
        <div class="fs-total-label">Факт Доход</div>
        <div class="fs-total-value green-text">{{ formatSignedFooter(widgetFooterTotals?.factIncome ?? 0, '+') }}</div>
      </div>
      <div class="fs-total-item">
        <div class="fs-total-label">План Расход</div>
        <div class="fs-total-value red-text">{{ formatSignedFooter(widgetFooterTotals?.planExpense ?? 0, '-') }}</div>
      </div>
      <div class="fs-total-item">
        <div class="fs-total-label">План Доход</div>
        <div class="fs-total-value green-text">{{ formatSignedFooter(widgetFooterTotals?.planIncome ?? 0, '+') }}</div>
      </div>
    </div>

    <button class="btn-back" @click="handleWidgetBack">Назад</button>
  </div>
</template>

<style scoped>
.fs-footer {
  padding: 12px 16px;
  background-color: var(--color-background, #1a1a1a);
  border-top: 1px solid var(--color-border, #444);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fs-totals {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
}

.fs-total-item {
  min-width: 0;
  padding: 0 8px;
}

.fs-total-item:first-child { padding-left: 0; }
.fs-total-item:last-child { padding-right: 0; }

.fs-total-item:not(:last-child) {
  border-right: 1px solid var(--color-border, #444);
}

.fs-total-label {
  font-size: 10px;
  color: #777;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.05;
  transform: translateY(-1px);
}

.fs-total-value {
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
  line-height: 1.15;
  margin-top: 3px;
}

.btn-back {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--color-border, #444);
  background: var(--color-background-soft, #282828);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.btn-back:active {
  transform: scale(0.98);
}
</style>