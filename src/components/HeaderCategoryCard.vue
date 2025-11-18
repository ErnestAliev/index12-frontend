<script setup>
import { ref, watch, computed, nextTick } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import filterIcon from '@/assets/filter-edit.svg';

/**
 * * --- МЕТКА ВЕРСИИ: v7.0 - SUMMARY WIDGETS ---
 * * ВЕРСИЯ: 7.0 - Виджеты Доход/Расход/Перевод переделаны в сводные
 * * ДАТА: 2025-11-19
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (UI) Для incomeList, expenseList и Transfer убран список операций.
 * 2. (UI) Отображается только строка "Всего" и сумма.
 * 3. (LOGIC) При включенном прогнозе отображается "Текущее > Прогноз".
 * 4. (STYLE) Цвета сумм соответствуют типу (Зеленый/Красный/Нейтральный).
 */

console.log('--- HeaderCategoryCard.vue v7.0 (Summary Widgets) ЗАГРУЖЕН ---');

const props = defineProps({
  title: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const emit = defineEmits(['add', 'edit']);
const mainStore = useMainStore();

const isDropdownOpen = ref(false);
const menuRef = ref(null);
const searchQuery = ref('');

const isFilterOpen = ref(false);
const filterBtnRef = ref(null);
const filterDropdownRef = ref(null);
const sortMode = ref('default'); 
const filterMode = ref('all');

const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

const filteredWidgets = computed(() => {
  if (!searchQuery.value) return mainStore.allWidgets;
  const query = searchQuery.value.toLowerCase();
  return mainStore.allWidgets.filter(widget => widget.name.toLowerCase().includes(query));
});

const handleSelect = (newWidgetKey) => {
  if (mainStore.dashboardLayout.includes(newWidgetKey) && newWidgetKey !== props.widgetKey) return;
  mainStore.replaceWidget(props.widgetIndex, newWidgetKey);
  nextTick(() => { isDropdownOpen.value = false; });
};

const handleClickOutside = (event) => {
  if (isDropdownOpen.value && menuRef.value && !menuRef.value.contains(event.target)) {
    isDropdownOpen.value = false;
  }
  if (isFilterOpen.value && 
      filterDropdownRef.value && !filterDropdownRef.value.contains(event.target) && 
      filterBtnRef.value && !filterBtnRef.value.contains(event.target)) {
    isFilterOpen.value = false;
  }
};

watch([isDropdownOpen, isFilterOpen], ([widgetOpen, filterOpen]) => {
  if (widgetOpen || filterOpen) {
    if (widgetOpen) searchQuery.value = '';
    document.addEventListener('mousedown', handleClickOutside);
  } else {
    document.removeEventListener('mousedown', handleClickOutside);
  }
});

// --- Типы виджетов ---
const isTransferWidget = computed(() => {
  const catId = props.widgetKey.replace('cat_', '');
  const category = mainStore.getCategoryById(catId); 
  if (category) {
      const name = category.name.toLowerCase();
      return name === 'перевод' || name === 'transfer';
  }
  return false;
});

const isIncomeListWidget = computed(() => props.widgetKey === 'incomeList');
const isExpenseListWidget = computed(() => props.widgetKey === 'expenseList');

// Группа "Сводные виджеты" (где показываем только Итого)
// Включаем сюда Доходы, Расходы и Переводы
const isSummaryWidget = computed(() => isIncomeListWidget.value || isExpenseListWidget.value || isTransferWidget.value);

// --- Расчет сумм для Сводных виджетов ---

// 1. Текущая сумма (всегда отображается слева или как основная)
const currentSum = computed(() => {
  let list = [];
  if (isIncomeListWidget.value) list = mainStore.currentIncomes;
  else if (isExpenseListWidget.value) list = mainStore.currentExpenses;
  else if (isTransferWidget.value) list = mainStore.currentTransfers;
  
  return (list || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
});

// 2. Сумма будущих операций (для добавления к прогнозу)
const futureOnlySum = computed(() => {
  let list = [];
  if (isIncomeListWidget.value) list = mainStore.futureIncomes;
  else if (isExpenseListWidget.value) list = mainStore.futureExpenses;
  else if (isTransferWidget.value) list = mainStore.futureTransfers;
  
  return (list || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
});

// 3. Прогнозная сумма = Текущие + Будущие
const projectedSum = computed(() => currentSum.value + futureOnlySum.value);


// --- Данные для обычных категорий (не списочных) ---
const categoryBreakdown = computed(() => {
  if (isSummaryWidget.value) return { income: 0, expense: 0, total: 0 };
  const source = showFutureBalance.value ? mainStore.futureCategoryBreakdowns : mainStore.currentCategoryBreakdowns;
  const data = source[props.widgetKey] || { income: 0, expense: 0, total: 0 };
  return data;
});

const setSortMode = (mode) => { sortMode.value = mode; };
const setFilterMode = (mode) => { filterMode.value = mode; };
const toggleDropdown = () => { isDropdownOpen.value = !isDropdownOpen.value; };
const handleAdd = () => { emit('add'); };
const handleEdit = () => { emit('edit'); };
</script>

<template>
  <div class="dashboard-card" ref="cardRef">

    <!-- ЗАГОЛОВОК КАРТОЧКИ -->
    <div class="card-title-container">
      <div class="card-title" ref="menuRef" @click.stop="toggleDropdown">
        {{ title }} <span>▽</span>
        <div v-if="isDropdownOpen" class="widget-dropdown" @click.stop>
          <input type="text" class="widget-search-input" v-model="searchQuery" placeholder="Поиск..." @click.stop />
          <ul>
            <li v-for="widget in filteredWidgets" :key="widget.key"
              :class="{ 'active': widget.key === props.widgetKey, 'disabled': mainStore.dashboardLayout.includes(widget.key) && widget.key !== props.widgetKey }"
              @click.stop="handleSelect(widget.key)">
              {{ widget.name }}
            </li>
          </ul>
        </div>
      </div>

      <div class="card-actions">
        <!-- Фильтр (скрываем для сводных, так как списка нет) -->
        <button v-if="!isSummaryWidget" class="action-square-btn" ref="filterBtnRef" @click.stop="isFilterOpen = !isFilterOpen" title="Фильтр">
          <img :src="filterIcon" alt="Filter" class="icon-svg" />
        </button>
        
        <!-- Прогноз -->
        <button class="action-square-btn" :class="{ 'active': showFutureBalance }" @click.stop="showFutureBalance = !showFutureBalance" title="Прогноз">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
        </button>
        
        <!-- Добавить -->
        <button @click.stop="handleAdd" class="action-square-btn" title="Добавить">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        
        <!-- Редактировать -->
        <button @click.stop="handleEdit" class="action-square-btn" title="Редактировать">
           <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
      </div>

      <!-- Меню фильтра (только для обычных категорий) -->
      <div v-if="isFilterOpen" class="filter-dropdown" ref="filterDropdownRef" @click.stop>
        <div class="filter-group">
           <div class="filter-group-title">Отображение</div>
           <ul>
             <li :class="{ active: filterMode === 'all' }" @click="setFilterMode('all')">Все строки</li>
             <li :class="{ active: filterMode === 'nonZero' }" @click="setFilterMode('nonZero')">Скрыть нули</li>
           </ul>
        </div>
      </div>
    </div>

    <div class="category-items-list-scroll">
      
      <!-- 🟢 1. СВОДНЫЙ ВИД (ДОХОД / РАСХОД / ПЕРЕВОД) -->
      <div v-if="isSummaryWidget" class="summary-container">
        <div class="summary-row">
            <!-- ЛЕВАЯ ЧАСТЬ -->
            <span class="summary-label">Всего</span>
            
            <!-- ПРАВАЯ ЧАСТЬ -->
            <span class="summary-value-block">
                
                <!-- Текущая сумма -->
                <span 
                  class="current-val"
                  :class="{ 
                    'income': isIncomeListWidget, 
                    'expense': isExpenseListWidget,
                    'transfer-neutral': isTransferWidget
                  }"
                >
                    <!-- Знак -->
                    <template v-if="isIncomeListWidget">+</template>
                    <template v-else-if="isExpenseListWidget">-</template>
                    
                    <!-- Значение -->
                    {{ formatNumber(currentSum) }} ₸
                </span>
                
                <!-- Прогнозная часть (при переключении) -->
                <template v-if="showFutureBalance">
                    <span class="summary-arrow"> &gt; </span>
                    
                    <span 
                      class="projected-val"
                      :class="{ 
                        'income': isIncomeListWidget, 
                        'expense': isExpenseListWidget,
                        'transfer-neutral': isTransferWidget
                      }"
                    >
                        {{ formatNumber(projectedSum) }} ₸
                    </span>
                </template>
            </span>
        </div>
      </div>

      <!-- 2. ОБЫЧНЫЕ КАТЕГОРИИ (Списком) -->
      <div v-else class="category-breakdown-list">
        <div class="category-item" v-if="filterMode === 'all' || categoryBreakdown.income !== 0">
          <span>Доходы</span>
          <span class="income">₸ {{ formatNumber(categoryBreakdown.income) }}</span>
        </div>
        <div class="category-item" v-if="filterMode === 'all' || categoryBreakdown.expense !== 0">
          <span>Расходы</span>
          <span class="expense">₸ {{ formatNumber(categoryBreakdown.expense) }}</span>
        </div>
        <div class="category-item category-item-total" v-if="filterMode === 'all' || categoryBreakdown.total !== 0">
            <span>Итого</span>
            <span :class="{ 'income': categoryBreakdown.total > 0, 'expense': categoryBreakdown.total < 0 }">
                <template v-if="categoryBreakdown.total < 0">-</template>
                ₸ {{ formatNumber(Math.abs(categoryBreakdown.total)) }}
            </span>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.dashboard-card {
  flex: 1; display: flex; flex-direction: column;
  padding-right: 1.5rem; border-right: 1px solid var(--color-border);
  position: relative; min-height: 0;
}
.dashboard-card:last-child { border-right: none; padding-right: 0; }

.card-title-container { 
  display: flex; justify-content: space-between; align-items: center; 
  height: 32px; margin-bottom: 0.5rem; flex-shrink: 0; 
}
.card-title { 
  font-size: 0.85em; color: #aaa; transition: color 0.2s; cursor: pointer; 
  position: relative; z-index: 101; 
}
.card-title:hover { color: #ddd; }
.card-title span { font-size: 0.8em; margin-left: 4px; }

.card-actions { display: flex; gap: 6px; position: relative; z-index: 101; }
.action-square-btn { width: 18px; height: 18px; border: 1px solid transparent; border-radius: 4px; background-color: #3D3B3B; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; color: #888; transition: all 0.2s ease; }
.action-square-btn:hover { background-color: #555; color: #ccc; }
.action-square-btn.active { background-color: #34c759; color: #fff; border-color: transparent; }
.icon-svg { width: 11px; height: 11px; display: block; object-fit: contain; }

.filter-dropdown { position: absolute; top: 35px; right: 0; width: 160px; background-color: #f4f4f4; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); z-index: 100; padding: 10px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; }
.filter-group-title { font-size: 0.75em; font-weight: 600; color: #888; text-transform: uppercase; margin-bottom: 6px; padding-left: 2px; }
.filter-dropdown ul { list-style: none; margin: 0; padding: 0; }
.filter-dropdown li { padding: 8px 10px; border-radius: 6px; font-size: 0.85em; color: #333; cursor: pointer; font-weight: 500 !important; transition: background-color 0.2s; }
.filter-dropdown li:hover { background-color: #e9e9e9; }
.filter-dropdown li.active { color: #007AFF; background-color: #e0e0e0; }

.category-items-list-scroll { flex-grow: 1; overflow-y: auto; padding-right: 5px; scrollbar-width: none; -ms-overflow-style: none; min-height: 0; display: flex; flex-direction: column; }
.category-items-list-scroll::-webkit-scrollbar { display: none; }


/* --- 🟢 СТИЛИ ДЛЯ СВОДНОГО ВИДА (SUMMARY) --- */
.summary-container {
  display: flex; 
  flex-direction: column; 
  justify-content: flex-start; 
  height: 100%;
  padding-top: 4px; /* Небольшой отступ сверху */
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline; /* Выравнивание по базовой линии шрифта */
  width: 100%;
}

/* Левая часть: "Всего" */
.summary-label {
  font-size: 0.9em; /* Стандартный размер, как в списках */
  color: #ccc;
  white-space: nowrap;
}

/* Правая часть: Сумма [> Прогноз] */
.summary-value-block {
  font-size: 0.9em; /* Стандартный размер */
  font-weight: 500;
  text-align: right;
  white-space: nowrap;
}

/* Цвета */
.income { color: var(--color-primary); }
.expense { color: var(--color-danger); }
.transfer-neutral { color: var(--color-text); } /* Светлый нейтральный */

.summary-arrow {
  color: #888;
  margin: 0 4px;
  font-size: 0.9em;
}

/* Прогнозная часть может быть чуть тусклее или такая же */
.projected-val {
  /* opacity: 0.9; */
}


/* Стили для обычных категорий */
.category-breakdown-list { display: flex; flex-direction: column; flex-grow: 1; gap: 0.25rem; }
.category-item { display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 0.25rem; }
.category-item span:first-child { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
.category-item span:last-child { color: var(--color-text); font-weight: 500; white-space: nowrap; }
.category-item span.income { color: var(--color-primary); }
.category-item span.expense { color: var(--color-danger); }
.category-item-total { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--color-border); }
.category-item-empty { font-size: 0.9em; color: #666; text-align: center; margin-top: 10px; }

.widget-dropdown { position: absolute; top: 35px; left: 0; width: 220px; background-color: #f4f4f4; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); z-index: 100; padding: 8px; box-sizing: border-box; max-height: 400px; display: flex; flex-direction: column; }
.widget-search-input { flex-shrink: 0; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px; font-size: 0.9em; box-sizing: border-box; width: 100%; background-color: #FFFFFF; color: #333; }
.widget-search-input:focus { outline: none; border-color: #007AFF; }
.widget-dropdown ul { list-style: none; margin: 0; padding: 0; flex-grow: 1; overflow-y: auto; }
.widget-dropdown li { padding: 10px 12px; border-radius: 6px; font-size: 0.9em; color: #333; cursor: pointer; font-weight: 500 !important; }
.widget-dropdown li:not(.disabled):hover { background-color: #e9e9e9; }
.widget-dropdown li.active { color: #333; background-color: #e0e0e0; }
.widget-dropdown li.disabled { color: #aaa; background-color: transparent; cursor: not-allowed; }

@media (max-height: 900px) {
  .dashboard-card { min-width: 100px; padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .category-item { font-size: 0.8em; margin-bottom: 0.2rem; }
  .category-item span:first-child { padding-right: 5px; }
  .summary-value-block { font-size: 0.85em; } /* Адаптив размера */
  .card-actions { gap: 3px; }
  .action-square-btn { width: 16px; height: 16px; }
  .icon-svg { width: 10px; height: 10px; }
}
</style>
