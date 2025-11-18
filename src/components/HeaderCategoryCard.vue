<script setup>
import { ref, watch, computed, nextTick } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import filterIcon from '@/assets/filter-edit.svg';

/**
 * * --- МЕТКА ВЕРСИИ: v6.0 - SUMMARY ONLY LAYOUT ---
 * * ВЕРСИЯ: 6.0 - Скрытие списка, только итоги
 * * ДАТА: 2025-11-19
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (UI) Для виджетов Доход/Расход/Перевод УБРАН список операций.
 * 2. (UI) Вместо списка отображается одна строка: "Всего" и Сумма.
 * 3. (LOGIC) При включении прогноза отображается: "Текущее > Будущее".
 * 4. (LOGIC) Калькуляция сумм происходит "на лету" из списков store.
 */

console.log('--- HeaderCategoryCard.vue v6.0 (Summary Only) ЗАГРУЖЕН ---');

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
const isListWidget = computed(() => isTransferWidget.value || isIncomeListWidget.value || isExpenseListWidget.value);

// --- 🟢 НОВАЯ ЛОГИКА ПОДСЧЕТА СУММ ---

// Получаем списки напрямую, чтобы считать сумму
const currentListRaw = computed(() => {
  if (isIncomeListWidget.value) return mainStore.currentIncomes;
  if (isExpenseListWidget.value) return mainStore.currentExpenses;
  if (isTransferWidget.value) return mainStore.currentTransfers;
  return [];
});

const futureListRaw = computed(() => {
  if (isIncomeListWidget.value) return mainStore.futureIncomes;
  if (isExpenseListWidget.value) return mainStore.futureExpenses;
  if (isTransferWidget.value) return mainStore.futureTransfers;
  return [];
});

// Сумма текущих (всегда считаем абсолютные значения для отображения)
const currentSum = computed(() => {
  return (currentListRaw.value || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
});

// Сумма только будущих
const futureOnlySum = computed(() => {
  return (futureListRaw.value || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
});

// Итоговая прогнозная сумма = Текущие + Будущие
const projectedSum = computed(() => currentSum.value + futureOnlySum.value);


// --- Для обычных категорий (не списочных) ---
const categoryBreakdown = computed(() => {
  if (isListWidget.value) return { income: 0, expense: 0, total: 0 };
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
        <!-- Фильтр -->
        <button class="action-square-btn" ref="filterBtnRef" @click.stop="isFilterOpen = !isFilterOpen" title="Фильтр">
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

      <!-- Фильтр (остался только для обычных категорий, для списков он теперь не нужен, но оставим для совместимости) -->
      <div v-if="isFilterOpen" class="filter-dropdown" ref="filterDropdownRef" @click.stop>
        <div v-if="isListWidget" class="filter-group">
           <div class="filter-group-title">Опции</div>
           <p style="padding: 8px; color: #888; font-size: 0.8em;">Сортировка доступна в режиме редактирования</p>
        </div>
        <div v-else class="filter-group">
           <div class="filter-group-title">Отображение</div>
           <ul>
             <li :class="{ active: filterMode === 'all' }" @click="setFilterMode('all')">Все строки</li>
             <li :class="{ active: filterMode === 'nonZero' }" @click="setFilterMode('nonZero')">Скрыть нули</li>
           </ul>
        </div>
      </div>
    </div>

    <div class="category-items-list-scroll">
      
      <!-- 🟢 НОВЫЙ СВОДНЫЙ ВИД (ДОХОД / РАСХОД / ПЕРЕВОД) -->
      <div v-if="isListWidget" class="summary-container">
        <div class="summary-row">
            <span class="summary-label">Всего</span>
            <span class="summary-value" :class="{ 'income': isIncomeListWidget, 'expense': isExpenseListWidget || isTransferWidget }">
                <!-- ЗНАК -->
                <template v-if="isIncomeListWidget">+</template>
                <template v-else-if="isExpenseListWidget">-</template>
                
                <!-- ТЕКУЩАЯ СУММА -->
                {{ formatNumber(currentSum) }} 
                
                <!-- ПРОГНОЗ (Если включен) -->
                <template v-if="showFutureBalance">
                    <span class="summary-arrow"> &gt; </span>
                    <span class="projected-value">
                        {{ formatNumber(projectedSum) }}
                    </span>
                </template>
                
                <span class="currency"> ₸</span>
            </span>
        </div>
      </div>

      <!-- 3. ОБЫЧНЫЙ СПИСОК КАТЕГОРИИ (Для остальных виджетов категорий) -->
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
  justify-content: flex-start; /* Или center, если нужно по вертикали */
  height: 100%;
  padding-top: 10px; /* Небольшой отступ сверху */
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  width: 100%;
}

.summary-label {
  font-size: 1em;
  color: #ccc; /* Светло-серый для "Всего" */
}

.summary-value {
  font-size: 1.4em; /* Крупный шрифт для суммы */
  font-weight: 700;
  white-space: nowrap;
}
.summary-value.income { color: var(--color-primary); }
.summary-value.expense { color: var(--color-danger); }

.summary-arrow {
  color: #888;
  font-weight: 400;
  margin: 0 4px;
  font-size: 0.8em;
  vertical-align: middle;
}

.projected-value {
  opacity: 0.8; /* Чуть тусклее прогнозная часть, или такой же цвет */
}

.currency {
  font-size: 0.7em;
  font-weight: 400;
  margin-left: 2px;
  color: #888;
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
  .summary-value { font-size: 1.2em; }
  .card-actions { gap: 3px; }
  .action-square-btn { width: 16px; height: 16px; }
  .icon-svg { width: 10px; height: 10px; }
}
</style>
