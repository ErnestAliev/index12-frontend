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

// 🟢 FIX: Exclude 'liabilities' from lists so filtering applies
const isListWidget = computed(() => {
    return ['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(props.widgetKey);
});

// 🟢 Global sort/filter settings
const sortMode = computed(() => mainStore.widgetSortMode);
const filterMode = computed(() => mainStore.widgetFilterMode);

const items = computed(() => {
  const k = props.widgetKey;
  
  // Helper to create a unified object with SEPARATE fields
  const mapItem = (item, futureMap) => {
      const currentVal = item.balance || 0;
      const rawFutureVal = futureMap ? (futureMap.get(item._id) || 0) : 0;
      let delta = 0;
      
      // For Accounts & Companies, store has TOTAL forecast. Calculate Delta.
      if (['accounts', 'companies'].includes(k)) {
          if (futureMap) {
             delta = rawFutureVal - currentVal;
          }
      } else {
          // For others (contractors, projects, categories, individuals), store has DELTA.
          delta = rawFutureVal;
      }

      return {
          ...item,
          currentBalance: currentVal,
          futureChange: delta,
          totalForecast: currentVal + delta 
      };
  };

  // 1. ACCOUNTS
  if (k === 'accounts') {
      const current = mainStore.currentAccountBalances || [];
      const future = mainStore.futureAccountBalances || []; 
      const futureMap = new Map(future.map(i => [i._id, i.balance]));
      const list = current.map(item => mapItem(item, futureMap));
      return filterAndSort(list);
  }

  // 2. COMPANIES
  if (k === 'companies') {
      const current = mainStore.currentCompanyBalances || [];
      const future = mainStore.futureCompanyBalances || []; 
      const futureMap = new Map(future.map(i => [i._id, i.balance]));
      const list = current.map(item => mapItem(item, futureMap));
      return filterAndSort(list);
  }
  
  // 3. CONTRACTORS
  if (k === 'contractors') {
      const current = mainStore.currentContractorBalances || [];
      const future = mainStore.futureContractorChanges || []; 
      const futureMap = new Map(future.map(c => [c._id, c.balance]));
      let list = current.map(item => mapItem(item, futureMap));
      const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
      list = list.filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));
      return filterAndSort(list);
  }
  
  // 4. PROJECTS
  if (k === 'projects') {
      const current = mainStore.currentProjectBalances || [];
      const future = mainStore.futureProjectChanges || []; 
      const futureMap = new Map(future.map(p => [p._id, p.balance]));
      const list = current.map(item => mapItem(item, futureMap));
      return filterAndSort(list);
  }

  // 5. INDIVIDUALS
  if (k === 'individuals') {
      const current = mainStore.currentIndividualBalances || [];
      const future = mainStore.futureIndividualChanges || []; 
      const futureMap = new Map(future.map(i => [i._id, i.balance]));
      const list = current.map(item => mapItem(item, futureMap));
      return filterAndSort(list);
  }
  
  // 6. CATEGORIES
  if (k === 'categories') {
      const current = mainStore.currentCategoryBalances || [];
      const future = mainStore.futureCategoryBalances || []; 
      const futureMap = new Map(future.map(c => [c._id, c.balance]));
      let list = current.map(item => mapItem(item, futureMap));
      const visibleIds = new Set(mainStore.visibleCategories.map(c => c._id));
      list = list.filter(c => visibleIds.has(c._id));
      return filterAndSort(list);
  }

  // 7. LIABILITIES
  if (k === 'liabilities') {
      const weOweCurrent = mainStore.liabilitiesWeOwe || 0;
      const weOweFuture = mainStore.liabilitiesWeOweFuture || 0; 
      const theyOweCurrent = mainStore.liabilitiesTheyOwe || 0;
      const theyOweFuture = mainStore.liabilitiesTheyOweFuture || 0;

      const rawList = [
          { 
              _id: 'we', 
              name: 'Мы должны', 
              currentBalance: weOweCurrent,
              futureChange: weOweFuture - weOweCurrent, 
              totalForecast: weOweFuture 
          },
          { 
              _id: 'they', 
              name: 'Нам должны', 
              currentBalance: theyOweCurrent,
              futureChange: theyOweFuture - theyOweCurrent, 
              totalForecast: theyOweFuture,
              isIncome: true 
          }
      ];
      return filterAndSort(rawList);
  }
  
  // 8. LISTS (UPDATED for Split View)
  if (isListWidget.value) {
      // Get Current lists (Fact)
      let currentList = [];
      if (k === 'incomeList') currentList = mainStore.currentIncomes;
      else if (k === 'expenseList') currentList = mainStore.currentExpenses;
      else if (k === 'withdrawalList') currentList = mainStore.currentWithdrawals;
      else if (k === 'transfers') currentList = mainStore.currentTransfers;
      
      const currentSum = currentList.reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);

      // Get Future lists (Forecast)
      let futureList = [];
      if (k === 'incomeList') futureList = mainStore.futureIncomes;
      else if (k === 'expenseList') futureList = mainStore.futureExpenses;
      else if (k === 'withdrawalList') futureList = mainStore.futureWithdrawals;
      else if (k === 'transfers') futureList = mainStore.futureTransfers;

      const futureSum = futureList.reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
      
      // If forecast is NOT active, we just show current sum (balance)
      // If forecast IS active, we show currentSum > futureSum (as delta)
      
      return [{
          _id: 'total',
          name: 'Всего',
          currentBalance: currentSum,
          futureChange: futureSum, // In this context, future list IS the delta (items that haven't happened yet)
          totalForecast: currentSum + futureSum,
          // Legacy field for non-forecast mode
          balance: isForecastActive.value ? (currentSum + futureSum) : currentSum,
          isList: true,
          isIncome: k === 'incomeList'
      }];
  }
  
  return [];
});

// 🟢 Sorting & Filtering Logic
function filterAndSort(originalList) {
    let list = [...(originalList || [])];
    
    const getFilterValue = (item) => {
        if (isForecastActive.value && item.totalForecast !== undefined) {
            return item.totalForecast;
        }
        return item.balance !== undefined ? item.balance : item.currentBalance;
    };

    if (filterMode.value === 'positive') list = list.filter(i => getFilterValue(i) > 0);
    else if (filterMode.value === 'negative') list = list.filter(i => getFilterValue(i) < 0);
    else if (filterMode.value === 'nonZero') list = list.filter(i => getFilterValue(i) !== 0);

    const getSortVal = (i) => getFilterValue(i);
    if (sortMode.value === 'desc') list.sort((a, b) => getSortVal(b) - getSortVal(a));
    else if (sortMode.value === 'asc') list.sort((a, b) => getSortVal(a) - getSortVal(b));

    return list;
}

const isEmpty = computed(() => {
    if (isListWidget.value) return false; 
    return items.value.length === 0;
});

const formatVal = (val) => `${formatNumber(Math.abs(Number(val) || 0))} ₸`;
const formatDelta = (val) => {
  const num = Number(val) || 0;
  if (num === 0) return '0'; 
  const formatted = formatNumber(Math.abs(num));
  return num > 0 ? `+ ${formatted}` : `- ${formatted}`; // Removed ₸ to save space if needed, or keep it
};

const getValueClass = (val, isIncomeWidget = false) => {
    const num = Number(val) || 0;
    
    if (props.widgetKey === 'liabilities') {
        return num < 0 ? 'red-text' : 'white-text'; 
    }
    
    if (isListWidget.value) {
        if (props.widgetKey === 'incomeList') return 'green-text';
        if (props.widgetKey === 'transfers') return 'white-text';
        return 'red-text';
    }
    
    return num < 0 ? 'red-text' : 'white-text';
};

const getDeltaClass = (val) => {
    const num = Number(val) || 0;
    
    // For expense/withdrawal lists, a positive delta means MORE expense, so it should probably be red?
    // Or stick to green = plus, red = minus mathematically.
    // Let's stick to math logic: + is green, - is red.
    return num > 0 ? 'green-text' : (num < 0 ? 'red-text' : 'white-text');
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
      
      <!-- 🟢 GRID для выравнивания (как в десктопе HeaderBalanceCard.vue) -->
      <div v-else class="items-list" :class="{ 'forecast-mode': isForecastActive }">
        <div v-for="item in items.slice(0, 3)" :key="item._id" class="list-item">
          
          <div class="name-cell">
              {{ item.name }}
          </div>
          
          <!-- 🟢 UNIVERSAL FORECAST DISPLAY (Flattened for Grid) -->
          <template v-if="isForecastActive">
              <!-- Current Balance (Aligned Right) -->
              <div class="current-cell" :class="getValueClass(item.currentBalance)">
                {{ formatVal(item.currentBalance) }}
              </div>
              
              <!-- Arrow Separator -->
              <div class="arrow-cell">&gt;</div>
              
              <!-- Delta (Change) (Aligned Right) -->
              <div class="future-cell" :class="getDeltaClass(item.futureChange)">
                {{ formatDelta(item.futureChange) }}
              </div>
          </template>

          <!-- 🟢 NORMAL MODE -->
          <template v-else>
              <div class="single-val-cell" :class="getValueClass(item.balance || item.currentBalance)">
                {{ formatVal(item.balance || item.currentBalance) }}
              </div>
          </template>
          
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

/* 🟢 Standard List (Flex) */
.items-list { 
  display: flex; 
  flex-direction: column; 
  gap: 3px; 
}

.list-item { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  font-size: 10px; 
  line-height: 1.4; 
}

/* 🟢 Forecast Mode (Grid Layout for Alignment) */
.items-list.forecast-mode {
  display: grid;
  /* Name (auto) | Current (right) | Arrow | Future (right) */
  /* minmax(0, 1fr) for name allows it to truncate properly */
  grid-template-columns: minmax(0, 1fr) auto 12px auto; 
  column-gap: 4px;
  row-gap: 3px;
  align-items: center;
  align-content: center; /* Center content vertically in available space */
}

/* Make list-item transparent to grid in forecast mode */
.items-list.forecast-mode .list-item {
  display: contents;
}

/* --- CELL STYLES --- */

.name-cell { 
  color: #ccc; 
  white-space: nowrap; 
  overflow: hidden; 
  text-overflow: ellipsis; 
  text-align: left;
}

/* Used in normal mode (flex) */
.single-val-cell {
  text-align: right;
  white-space: nowrap;
}

/* Used in forecast mode (grid) */
.current-cell {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums; /* Monospace digits for alignment */
}

.arrow-cell {
  text-align: center;
  color: #666;
  font-size: 9px;
}

.future-cell {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* COLORS */
.red-text { color: #ff3b30; }
.green-text { color: #34c759; }
.orange-text { color: #FF9D00; }
.white-text { color: #fff; }

.empty-text { font-size: 10px; color: #555; text-align: center; margin-top: 0; }
.more-text { 
  font-size: 10px; color: #666; text-align: right; margin-top: 2px; 
  /* Make sure more-text spans all columns in grid mode */
  grid-column: 1 / -1; 
}
</style>