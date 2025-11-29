<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

const props = defineProps({
  widgetKey: { type: String, required: true },
});

// События клика, добавления и редактирования
const emit = defineEmits(['click', 'add', 'edit']);

const mainStore = useMainStore();

const widgetInfo = computed(() => {
  const w = mainStore.allWidgets.find(x => x.key === props.widgetKey);
  return w ? w.name : 'Виджет';
});

// Проверяем, включен ли прогноз для этого виджета
const isForecastActive = computed(() => {
  return mainStore.dashboardForecastState[props.widgetKey] ?? false;
});

// Получаем данные (Синхронизировано с логикой TheHeader.vue)
const items = computed(() => {
  const k = props.widgetKey;
  const useFuture = isForecastActive.value;
  
  if (k === 'accounts') return useFuture ? mainStore.futureAccountBalances : mainStore.currentAccountBalances;
  if (k === 'companies') return useFuture ? mainStore.futureCompanyBalances : mainStore.currentCompanyBalances;
  
  if (k === 'contractors') {
      const source = useFuture ? mainStore.futureContractorBalances : mainStore.currentContractorBalances;
      // Фильтр: исключаем свои компании из списка контрагентов (как на десктопе)
      const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
      return (source || []).filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));
  }
  
  if (k === 'projects') return useFuture ? mainStore.futureProjectBalances : mainStore.currentProjectBalances;
  if (k === 'individuals') return useFuture ? mainStore.futureIndividualBalances : mainStore.currentIndividualBalances;
  
  if (k === 'categories') {
      const source = useFuture ? mainStore.futureCategoryBalances : mainStore.currentCategoryBalances;
      const visibleIds = new Set(mainStore.visibleCategories.map(c => c._id));
      return (source || []).filter(c => visibleIds.has(c._id));
  }
  
  // Для списков операций показываем агрегированную сумму "Всего"
  if (['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(k)) {
      let list = [];
      if (k === 'incomeList') list = useFuture ? mainStore.futureIncomes : mainStore.currentIncomes;
      else if (k === 'expenseList') list = useFuture ? mainStore.futureExpenses : mainStore.currentExpenses;
      else if (k === 'withdrawalList') list = useFuture ? mainStore.futureWithdrawals : mainStore.currentWithdrawals;
      else if (k === 'transfers') list = useFuture ? mainStore.futureTransfers : mainStore.currentTransfers;
      
      const sum = (list || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
      const label = useFuture ? 'Всего (Прогноз)' : 'Всего (Текущее)';
      return [{ _id: 'total', name: label, balance: sum }];
  }
  
  return [];
});

const isEmpty = computed(() => items.value.length === 0);
const formatVal = (val) => `${formatNumber(Math.abs(Number(val) || 0))} ₸`;
const isExpense = (val) => Number(val) < 0;

const handleClick = () => {
  emit('click', props.widgetKey);
};
</script>

<template>
  <div class="mobile-widget-card" @click="handleClick">
    <div class="widget-header">
      <div class="widget-title-row">
        <span class="widget-title">{{ widgetInfo }}</span>
        <span v-if="isForecastActive" class="forecast-badge">Прогноз</span>
      </div>
      <div class="widget-arrow">
         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </div>
    </div>

    <div class="widget-body scrollable-list">
      <div v-if="isEmpty" class="empty-text">Нет данных</div>
      <div v-else class="items-list">
        <!-- Показываем топ-3 элемента -->
        <div v-for="item in items.slice(0, 3)" :key="item._id" class="list-item">
          <span class="item-name">{{ item.name }}</span>
          <span class="item-val" :class="{ 'red-text': isExpense(item.balance) }">
            {{ formatVal(item.balance) }}
          </span>
        </div>
        <div v-if="items.length > 3" class="more-text">Еще {{ items.length - 3 }}...</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-widget-card {
  background-color: var(--color-background-soft, #282828);
  border: 1px solid var(--color-border, #444);
  height: 90px;
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  box-sizing: border-box;
  overflow: hidden;
  cursor: pointer; 
}
.mobile-widget-card:active {
  background-color: rgba(255,255,255,0.05);
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
  height: 20px;
}

.widget-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.widget-title {
  font-size: 11px; color: #aaa; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.forecast-badge {
  font-size: 9px;
  background-color: rgba(52, 199, 89, 0.15);
  color: var(--color-primary, #34c759);
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 500;
}

.widget-body { flex-grow: 1; overflow: hidden; }
.items-list { display: flex; flex-direction: column; gap: 2px; }
.list-item { display: flex; justify-content: space-between; font-size: 10px; line-height: 1.4; }
.item-name { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 65%; }
.item-val { color: #fff; font-weight: 500; }
.red-text { color: #ff3b30; }
.empty-text { font-size: 10px; color: #555; text-align: center; margin-top: 5px; }
.more-text { font-size: 9px; color: #666; text-align: right; }
</style>