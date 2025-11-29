<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

const props = defineProps({
  widgetKey: { type: String, required: true },
});

const emit = defineEmits(['click', 'add', 'edit']);
const mainStore = useMainStore();

const widgetInfo = computed(() => {
  const w = mainStore.allWidgets.find(x => x.key === props.widgetKey);
  return w ? w.name : 'Виджет';
});

const isForecastActive = computed(() => {
  return mainStore.dashboardForecastState[props.widgetKey] ?? false;
});

const isListWidget = computed(() => {
    return ['incomeList', 'expenseList', 'withdrawalList', 'transfers', 'liabilities'].includes(props.widgetKey);
});

// 🟢 Получаем глобальные настройки сортировки
const sortMode = computed(() => mainStore.widgetSortMode);
const filterMode = computed(() => mainStore.widgetFilterMode);

const items = computed(() => {
  const k = props.widgetKey;
  const useFuture = isForecastActive.value;
  
  if (k === 'accounts') return filterAndSort(useFuture ? mainStore.futureAccountBalances : mainStore.currentAccountBalances);
  if (k === 'companies') return filterAndSort(useFuture ? mainStore.futureCompanyBalances : mainStore.currentCompanyBalances);
  
  if (k === 'contractors') {
      const source = useFuture ? mainStore.futureContractorBalances : mainStore.currentContractorBalances;
      const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
      const list = (source || []).filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));
      return filterAndSort(list);
  }
  
  if (k === 'projects') return filterAndSort(useFuture ? mainStore.futureProjectBalances : mainStore.currentProjectBalances);
  if (k === 'individuals') return filterAndSort(useFuture ? mainStore.futureIndividualBalances : mainStore.currentIndividualBalances);
  
  if (k === 'categories') {
      const source = useFuture ? mainStore.futureCategoryBalances : mainStore.currentCategoryBalances;
      const visibleIds = new Set(mainStore.visibleCategories.map(c => c._id));
      const list = (source || []).filter(c => visibleIds.has(c._id));
      return filterAndSort(list);
  }
  
  if (isListWidget.value) {
      let list = [];
      if (k === 'incomeList') list = useFuture ? mainStore.futureIncomes : mainStore.currentIncomes;
      else if (k === 'expenseList') list = useFuture ? mainStore.futureExpenses : mainStore.currentExpenses;
      else if (k === 'withdrawalList') list = useFuture ? mainStore.futureWithdrawals : mainStore.currentWithdrawals;
      else if (k === 'transfers') list = useFuture ? mainStore.futureTransfers : mainStore.currentTransfers;
      else if (k === 'liabilities') {
          return [
              { _id: 'we', name: 'Мы должны', balance: useFuture ? mainStore.liabilitiesWeOweFuture : mainStore.liabilitiesWeOwe },
              { _id: 'they', name: 'Нам должны', balance: useFuture ? mainStore.liabilitiesTheyOweFuture : mainStore.liabilitiesTheyOwe, isIncome: true }
          ];
      }
      
      const totalSum = list.reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
      
      return [{
          _id: 'total',
          name: 'Всего',
          balance: totalSum,
          isList: true,
          isIncome: k === 'incomeList'
      }];
  }
  
  return [];
});

// 🟢 Функция фильтрации и сортировки (аналогична MobileHomeView)
function filterAndSort(originalList) {
    let list = [...(originalList || [])];
    const targetKey = isForecastActive.value ? 'futureBalance' : 'balance';

    // Фильтр
    if (filterMode.value === 'positive') list = list.filter(i => (i[targetKey] || 0) > 0);
    else if (filterMode.value === 'negative') list = list.filter(i => (i[targetKey] || 0) < 0);
    else if (filterMode.value === 'nonZero') list = list.filter(i => (i[targetKey] || 0) !== 0);

    // Сортировка
    const getVal = (i) => i[targetKey] || 0;
    if (sortMode.value === 'desc') list.sort((a, b) => getVal(b) - getVal(a));
    else if (sortMode.value === 'asc') list.sort((a, b) => getVal(a) - getVal(b));

    return list;
}

const isEmpty = computed(() => {
    if (isListWidget.value) return false; 
    return items.value.length === 0;
});

const formatVal = (val) => `${formatNumber(Math.abs(Number(val) || 0))} ₸`;

const getValueClass = (item) => {
    const val = Number(item.balance) || 0;
    if (props.widgetKey === 'liabilities') {
        if (item.isIncome) return 'orange-text'; 
        return 'red-text';
    }
    
    if (item.isList) {
        if (props.widgetKey === 'incomeList') return 'green-text';
        if (props.widgetKey === 'transfers') return 'white-text';
        return 'red-text';
    }
    
    return val < 0 ? 'red-text' : 'white-text';
};

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
        <!-- Показываем элементы (Для Доходов/Расходов тут будет 1 строка "Всего") -->
        <div v-for="item in items.slice(0, 3)" :key="item._id" class="list-item">
          <div class="item-left">
              <span class="item-name">{{ item.name }}</span>
          </div>
          <span class="item-val" :class="getValueClass(item)">
            {{ formatVal(item.balance) }}
          </span>
        </div>
        
        <div v-if="items.length > 3" class="more-text">
           Еще {{ items.length - 3 }}...
        </div>
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
  padding: 8px 12px;
  box-sizing: border-box;
  overflow: hidden;
  cursor: pointer; 
  border-radius: 8px; 
}
.mobile-widget-card:active {
  background-color: rgba(255,255,255,0.05);
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
  height: 22px;
}

.widget-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.widget-title {
  font-size: 10px; color: #aaa; font-weight: 600;
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

.widget-body { flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }

.items-list { display: flex; flex-direction: column; gap: 3px; }

.list-item { 
    display: flex; justify-content: space-between; align-items: center; 
    font-size: 10px; line-height: 1.4; 
}

.item-left { display: flex; align-items: center; gap: 8px; overflow: hidden; max-width: 65%; }
.item-name { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.item-val { color: #fff;  white-space: nowrap; font-size: 10px; }

.red-text { color: #ff3b30; }
.green-text { color: #34c759; }
.orange-text { color: #FF9D00; }
.white-text { color: #fff; }

.empty-text { font-size: 10px; color: #555; text-align: center; margin-top: 0; }
.more-text { font-size: 10px; color: #666; text-align: right; margin-top: 2px; }
</style>