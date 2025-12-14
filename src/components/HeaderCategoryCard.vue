<script setup>
import { ref, watch, computed, nextTick } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import filterIcon from '@/assets/filter-edit.svg';

/**
 * * --- МЕТКА ВЕРСИИ: v59.1 - STYLING FIX ---
 * * ВЕРСИЯ: 59.1
 * * ИЗМЕНЕНИЯ:
 * 1. (STYLE) Прогноз для доходов теперь отображается зеленым цветом (class 'income').
 * 2. (STYLE) Текущий факт для доходов отображается стандартным серым (class 'normal-text' изменен на var(--color-text)).
 */

const props = defineProps({
  title: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const emit = defineEmits(['add', 'edit']);
const mainStore = useMainStore();

const isTransferWidget = computed(() => {
  return props.widgetKey === 'transfers' || 
         (props.widgetKey.startsWith('cat_') && mainStore.getCategoryById(props.widgetKey.replace('cat_', ''))?.name.toLowerCase() === 'перевод');
});

const isIncomeListWidget = computed(() => props.widgetKey === 'incomeList');
const isExpenseListWidget = computed(() => props.widgetKey === 'expenseList');
const isWithdrawalListWidget = computed(() => props.widgetKey === 'withdrawalList');
const isSummaryWidget = computed(() => isIncomeListWidget.value || isExpenseListWidget.value || isTransferWidget.value || isWithdrawalListWidget.value);

const displayTitle = computed(() => isTransferWidget.value ? 'Мои переводы' : props.title);

const categoryBreakdown = computed(() => {
  const source = mainStore.dashboardForecastState[props.widgetKey] ? mainStore.futureCategoryBreakdowns : mainStore.currentCategoryBreakdowns;
  return source[props.widgetKey] || { income: 0, expense: 0, total: 0 };
});

const currentSum = computed(() => {
  let list = [];
  if (isTransferWidget.value) list = mainStore.currentTransfers;
  else if (isIncomeListWidget.value) list = mainStore.currentIncomes;
  else if (isExpenseListWidget.value) list = mainStore.currentExpenses;
  else if (isWithdrawalListWidget.value) list = mainStore.currentWithdrawals;
  return (list || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
});

// 🟢 ИСПРАВЛЕНО: Прогноз теперь показывает только БУДУЩИЕ операции
const projectedSum = computed(() => {
  let list = [];
  if (isTransferWidget.value) list = mainStore.futureTransfers;
  else if (isIncomeListWidget.value) list = mainStore.futureIncomes;
  else if (isExpenseListWidget.value) list = mainStore.futureExpenses;
  else if (isWithdrawalListWidget.value) list = mainStore.futureWithdrawals;
  
  const futureSum = (list || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
  
  return futureSum; 
});

const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

/* ======================= FILTER TELEPORT ======================= */
const isFilterOpen = ref(false);
const filterBtnRef = ref(null);
const filterDropdownRef = ref(null);
const filterPos = ref({ top: '0px', left: '0px' });
const filterMode = ref('all');

const updateFilterPosition = () => {
  if (filterBtnRef.value) {
    const rect = filterBtnRef.value.getBoundingClientRect();
    filterPos.value = { top: `${rect.bottom + 5}px`, left: `${rect.right - 160}px` };
  }
};

watch(isFilterOpen, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    updateFilterPosition();
    document.addEventListener('mousedown', handleFilterClickOutside);
    window.addEventListener('resize', updateFilterPosition);
    window.addEventListener('scroll', updateFilterPosition, true);
  } else {
    document.removeEventListener('mousedown', handleFilterClickOutside);
    window.removeEventListener('resize', updateFilterPosition);
    window.removeEventListener('scroll', updateFilterPosition, true);
  }
});

const handleFilterClickOutside = (event) => {
  const insideTrigger = filterBtnRef.value && filterBtnRef.value.contains(event.target);
  const insideDropdown = filterDropdownRef.value && filterDropdownRef.value.contains(event.target);
  if (!insideTrigger && !insideDropdown) isFilterOpen.value = false;
};

const setFilterMode = (mode) => { filterMode.value = mode; };
</script>

<template>
  <!-- 🟢 Убрал .stop чтобы клик прошел вверх к TheHeader для Fullscreen -->
  <div class="dashboard-card" @click="isFilterOpen = false">

    <div class="card-title-container">
      <div class="card-title">
        {{ displayTitle }}
      </div>

      <div class="card-actions">
        <!-- Фильтр -->
        <button v-if="!isSummaryWidget" class="action-square-btn" ref="filterBtnRef" @click.stop="isFilterOpen = !isFilterOpen" title="Фильтр">
          <img :src="filterIcon" alt="Filter" class="icon-svg" />
        </button>
        
        <!-- Прогноз -->
        <button class="action-square-btn" :class="{ 'active': showFutureBalance }" @click.stop="showFutureBalance = !showFutureBalance" title="Прогноз">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
        </button>
        
        <!-- Редактировать -->
        <button @click.stop="$emit('edit')" class="action-square-btn" title="Редактировать">
           <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>

        <!-- Добавить -->
        <button @click.stop="$emit('add')" class="action-square-btn" title="Добавить">
           <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </div>

    <!-- Teleport FILTER Menu -->
    <Teleport to="body">
      <div v-if="isFilterOpen" class="filter-dropdown-fixed" :style="filterPos" ref="filterDropdownRef" @click.stop>
        <div class="filter-group">
           <div class="filter-group-title">Отображение</div>
           <ul>
             <li :class="{ active: filterMode === 'all' }" @click="setFilterMode('all')">Все</li>
             <li :class="{ active: filterMode === 'nonZero' }" @click="setFilterMode('nonZero')">Скрыть 0</li>
           </ul>
        </div>
      </div>
    </Teleport>

    <div class="category-items-list-scroll">
      <div v-if="isSummaryWidget" class="summary-container">
        <div class="summary-row">
            <span class="summary-label">Всего</span>
            <span class="summary-value-block">
                <!-- ФАКТ: Для доходов используется normal-text (теперь серый) -->
                <span class="current-val" :class="{ 'normal-text': isIncomeListWidget, 'expense': isExpenseListWidget, 'transfer-neutral': isTransferWidget, 'withdrawal': isWithdrawalListWidget }">
                    <template v-if="isExpenseListWidget || isWithdrawalListWidget">- </template>{{ formatNumber(currentSum) }} ₸
                </span>
                
                <!-- ПРОГНОЗ (ТОЛЬКО БУДУЩЕЕ) -->
                <template v-if="showFutureBalance">
                    <span class="summary-arrow"> &gt; </span>
                    <!-- 
                         ИЗМЕНЕНИЕ: 
                         Для доходов (isIncomeListWidget) теперь ставим класс 'income' (зеленый),
                         вместо 'normal-text'.
                    -->
                    <span class="projected-val" :class="{ 'income': isIncomeListWidget, 'expense': isExpenseListWidget, 'transfer-neutral': isTransferWidget, 'withdrawal': isWithdrawalListWidget }">
                        <template v-if="isExpenseListWidget || isWithdrawalListWidget">- </template>
                        <template v-else-if="isIncomeListWidget">+</template>
                        {{ formatNumber(projectedSum) }} ₸
                    </span>
                </template>
            </span>
        </div>
      </div>

      <div v-else class="category-breakdown-list">
        <div class="category-item" v-if="filterMode === 'all' || categoryBreakdown.income !== 0">
          <span>Доходы</span><span class="income">₸ {{ formatNumber(categoryBreakdown.income) }}</span>
        </div>
        <div class="category-item" v-if="filterMode === 'all' || categoryBreakdown.expense !== 0">
          <span>Расходы</span><span class="expense">₸ {{ formatNumber(categoryBreakdown.expense) }}</span>
        </div>
        <div class="category-item category-item-total" v-if="filterMode === 'all' || categoryBreakdown.total !== 0">
            <span>Итого</span>
            <span :class="{ 'income': categoryBreakdown.total > 0, 'expense': categoryBreakdown.total < 0 }">
                <template v-if="categoryBreakdown.total < 0">-</template>₸ {{ formatNumber(Math.abs(categoryBreakdown.total)) }}
            </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-card { 
  display: flex; flex-direction: column; 
  height: 100%; 
  overflow: hidden; 
  padding-right: 1.5rem; border-right: 1px solid var(--color-border); position: relative; 
}
.dashboard-card:last-child { border-right: none; padding-right: 0; }

.card-title-container { 
  display: flex; justify-content: space-between; align-items: center; 
  height: var(--h-header-card); 
  flex-shrink: 0; 
}

.card-title { 
  font-size: var(--font-sm); 
  font-weight: var(--fw-semi); 
  color: var(--text-main); 
  position: relative; z-index: 101; 
  letter-spacing: 0.01em;
}

.card-actions { display: flex; gap: 6px; position: relative; z-index: 101; }

.action-square-btn { 
  width: 18px; height: 18px; 
  border: 1px solid transparent; border-radius: 4px; 
  background-color: #3D3B3B; 
  display: flex; align-items: center; justify-content: center; 
  cursor: pointer; padding: 0; color: var(--text-mute); 
  transition: all var(--trans-fast); 
}
.action-square-btn:hover { background-color: #555; color: #ccc; }
.action-square-btn.active { background-color: var(--color-primary); color: #fff; border-color: transparent; }
.icon-svg { width: 11px; height: 11px; display: block; object-fit: contain; }

.category-items-list-scroll { 
  flex-grow: 1; 
  overflow-y: auto; 
  padding-right: 5px; 
  scrollbar-width: none; 
  min-height: 0; 
  display: flex; flex-direction: column; 
}
.category-items-list-scroll::-webkit-scrollbar { display: none; }

.summary-container { display: flex; flex-direction: column; justify-content: flex-start; height: 100%; padding-top: 4px; }
.summary-row { display: flex; justify-content: space-between; align-items: baseline; width: 100%; }
.summary-label { font-size: var(--font-sm); color: var(--text-soft); white-space: nowrap; }

.summary-value-block { 
  font-size: var(--font-sm); 
  font-weight: var(--fw-medium); 
  text-align: right; 
  white-space: nowrap; 
  font-variant-numeric: tabular-nums;
}

.income { color: var(--color-primary); font-size: var(--font-sm);} 
.expense { color: var(--color-danger); font-size: var(--font-sm); } 
.withdrawal { color: #ffffff; font-size: var(--font-sm);} 
.transfer-neutral { color: var(--color-text); font-size: var(--font-sm);} 

/* ИЗМЕНЕНИЕ: Для 'normal-text' (используется для ФАКТА доходов) 
  установили var(--color-text), чтобы он был стандартным серым/текстовым, 
  а не ярко-белым (heading). 
*/
.normal-text { color: var(--color-text); font-size: var(--font-sm);} 

.summary-arrow { color: var(--text-mute); margin: 0 4px; font-size: 0.9em; }

.category-breakdown-list { display: flex; flex-direction: column; }
.category-item { display: flex; justify-content: space-between; font-size: var(--font-sm); margin-bottom: 0.25rem; flex-shrink: 0; }
.category-item span:first-child { color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
.category-item span:last-child { color: var(--color-text); font-weight: var(--fw-medium); white-space: nowrap; font-variant-numeric: tabular-nums; }
.category-item span.income { color: var(--color-primary); }
.category-item span.expense { color: var(--color-danger); }
.category-item-total { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--color-border); }

@media (max-height: 900px) {
  .dashboard-card { min-width: 100px; padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .card-item { font-size: 0.8em; }
  .summary-value-block { font-size: 0.85em; } 
  .card-actions { gap: 3px; }
}
</style>