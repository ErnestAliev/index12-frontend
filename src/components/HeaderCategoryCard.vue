<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import filterIcon from '@/assets/filter-edit.svg';

/**
 * * --- МЕТКА ВЕРСИИ: v7.3-CATEGORY-ACTIONS ---
 * * ВЕРСИЯ: 7.3 - Добавление действий в карточку категории
 * ДАТА: 2025-11-16
 *
 * ЧТО ДОБАВЛЕНО:
 * 1. Кнопки действий: Filter, Forecast, Add, Edit.
 * 2. Состояние `showFutureBalance` (для прогноза).
 * 3. Сортировка и фильтрация для списка переводов.
 * 4. Emit событий `add` и `edit` для обработки в TheHeader.
 */

console.log('--- HeaderCategoryCard.vue v7.3-CATEGORY-ACTIONS ЗАГРУЖЕН ---');

const props = defineProps({
  title: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const emit = defineEmits(['add', 'edit']);

const mainStore = useMainStore();
const isDropdownOpen = ref(false);
const cardRef = ref(null);
const searchQuery = ref('');

// --- STATE ДЛЯ ДЕЙСТВИЙ ---
const isFilterOpen = ref(false);
const filterBtnRef = ref(null);
const filterDropdownRef = ref(null);
const sortMode = ref('default'); // 'default', 'desc', 'asc'

// Состояние прогноза (синхронизировано со стором)
const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

// --- Logic Dropdown (Widget Select) ---
const filteredWidgets = computed(() => {
  if (!searchQuery.value) {
    return mainStore.allWidgets;
  }
  const query = searchQuery.value.toLowerCase();
  return mainStore.allWidgets.filter(widget =>
    widget.name.toLowerCase().includes(query)
  );
});

const handleSelect = (newWidgetKey) => {
  if (mainStore.dashboardLayout.includes(newWidgetKey) && newWidgetKey !== props.widgetKey) {
    return;
  }
  mainStore.replaceWidget(props.widgetIndex, newWidgetKey);
  isDropdownOpen.value = false;
};

// --- CLICK OUTSIDE ---
const handleClickOutside = (event) => {
  // Widget Dropdown
  if (isDropdownOpen.value && cardRef.value && !cardRef.value.contains(event.target)) {
    isDropdownOpen.value = false;
  }
  // Filter Dropdown
  if (isFilterOpen.value && filterDropdownRef.value && !filterDropdownRef.value.contains(event.target) && 
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

// =================================================================
// --- ЛОГИКА КАТЕГОРИИ "ПЕРЕВОД" ---
// =================================================================

const isTransferWidget = computed(() => {
  const catId = props.widgetKey.replace('cat_', '');
  const category = mainStore.getCategoryById(catId); 
  return category && category.name.toLowerCase() === 'перевод';
});

const transferList = computed(() => {
  if (!isTransferWidget.value) return [];
  
  // 1. Выбираем источник данных (Текущие или Будущие)
  let list = showFutureBalance.value 
    ? mainStore.futureTransfers 
    : mainStore.currentTransfers;

  // Копируем массив для сортировки
  list = [...list];

  // 2. Сортировка (только для переводов)
  if (sortMode.value === 'desc') {
    list.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  } else if (sortMode.value === 'asc') {
    list.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
  }
  // 'default' - сортировка по дате уже сделана в store

  return list;
});

const getAccountName = (accIdOrObj) => {
  if (!accIdOrObj) return '???';
  const id = typeof accIdOrObj === 'object' ? accIdOrObj._id : accIdOrObj;
  const acc = mainStore.accounts.find(a => a._id === id);
  return acc ? acc.name : 'Удален';
};

const formatTransferDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear().toString().slice(-2);
  return `${day}.${month}.${year}`;
};

// =================================================================
// --- ЛОГИКА ОБЫЧНЫХ КАТЕГОРИЙ ---
// =================================================================

const categoryBreakdown = computed(() => {
  const source = showFutureBalance.value 
    ? mainStore.futureCategoryBreakdowns 
    : mainStore.currentCategoryBreakdowns;
    
  return source[props.widgetKey] || { income: 0, expense: 0, total: 0 };
});

// =================================================================
// --- ДЕЙСТВИЯ ---
// =================================================================
const setSortMode = (mode) => { sortMode.value = mode; };

const toggleDropdown = () => { isDropdownOpen.value = !isDropdownOpen.value; };

const handleAdd = () => {
    // Для перевода: Новый перевод
    // Для категории: (Обычно операции добавляются через ячейки, но можно вызвать общий попап)
    // Передаем вверх, пусть TheHeader решает
    emit('add');
};
const handleEdit = () => {
    // Редактировать название категории
    emit('edit');
};
</script>

<template>
  <div class="dashboard-card" ref="cardRef">

    <!-- HEADER (Title + Actions) -->
    <div class="card-title-container">
      <div class="card-title" @click.stop="toggleDropdown">
        {{ title }} <span>▽</span>
        
        <!-- Widget Selection Dropdown -->
        <div v-if="isDropdownOpen" class="widget-dropdown" @click.stop>
          <input
            type="text"
            class="widget-search-input"
            v-model="searchQuery"
            placeholder="Поиск..."
            @click.stop />
          <ul>
            <li
              v-for="widget in filteredWidgets"
              :key="widget.key"
              :class="{
                'active': widget.key === props.widgetKey,
                'disabled': mainStore.dashboardLayout.includes(widget.key) && widget.key !== props.widgetKey
              }"
              @click.stop="handleSelect(widget.key)"
            >
              {{ widget.name }}
            </li>
          </ul>
        </div>
      </div>

      <!-- 🔴 НОВЫЕ ACTIONS -->
      <div class="card-actions">
        <!-- Filter (Only for Transfers list makes sense to sort) -->
        <button 
          v-if="isTransferWidget"
          class="action-btn" 
          ref="filterBtnRef" 
          @click.stop="isFilterOpen = !isFilterOpen"
        >
          <img :src="filterIcon" alt="Filter" class="filter-icon" />
        </button>
        
        <!-- Forecast Toggle -->
        <button 
          class="action-btn forecast-btn"
          :class="{ 'active': showFutureBalance }"
          @click.stop="showFutureBalance = !showFutureBalance"
          title="Прогноз"
        >
          ↗
        </button>
        
        <!-- Add & Edit -->
        <button @click.stop="handleAdd" class="action-btn">+</button>
        <button @click.stop="handleEdit" class="action-btn">✎</button>
      </div>

      <!-- Filter Dropdown -->
      <div v-if="isFilterOpen" class="filter-dropdown" ref="filterDropdownRef" @click.stop>
        <div class="filter-group">
          <div class="filter-group-title">Сортировка</div>
          <ul>
            <li :class="{ active: sortMode === 'default' }" @click="setSortMode('default')">По дате</li>
            <li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')">Сумма (убыв.)</li>
            <li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')">Сумма (возр.)</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- CONTENT -->
    <div class="category-items-list-scroll">
      
      <!-- ВАРИАНТ 1: ПЕРЕВОДЫ -->
      <div v-if="isTransferWidget" class="transfer-list">
        <div v-for="t in transferList" :key="t._id" class="transfer-item">
          <div class="t-row t-top">
            <span class="t-amount expense">- {{ formatNumber(t.amount) }} ₸</span>
            <span class="t-arrow">→</span>
            <span class="t-amount income">+ {{ formatNumber(t.amount) }} ₸</span>
          </div>
          <div class="t-row t-bottom">
            <span class="t-acc left" :title="getAccountName(t.fromAccountId)">{{ getAccountName(t.fromAccountId) }}</span>
            <span class="t-date">{{ formatTransferDate(t.date) }}</span>
            <span class="t-acc right" :title="getAccountName(t.toAccountId)">{{ getAccountName(t.toAccountId) }}</span>
          </div>
        </div>
        <div v-if="transferList.length === 0" class="category-item-empty">
          {{ showFutureBalance ? 'Нет будущих переводов' : 'Нет переводов' }}
        </div>
      </div>

      <!-- ВАРИАНТ 2: КАТЕГОРИЯ -->
      <div v-else class="category-breakdown-list">
        <div class="category-item">
          <span>Доходы</span>
          <span class="income">₸ {{ formatNumber(categoryBreakdown.income) }}</span>
        </div>
        <div class="category-item">
          <span>Расходы</span>
          <span class="expense">₸ {{ formatNumber(categoryBreakdown.expense) }}</span>
        </div>
        <div class="category-item category-item-total">
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
  display: flex; /* Flex для выравнивания Title и Actions */
  justify-content: space-between;
  align-items: center;
  height: 30px;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}
.card-title {
  font-size: 0.85em;
  color: #aaa;
  transition: color 0.2s;
  cursor: pointer;
  position: relative;
  z-index: 101;
}
.card-title:hover { color: #ddd; }
.card-title span { font-size: 0.8em; margin-left: 4px; }

/* --- ACTIONS STYLES (из BalanceCard) --- */
.card-actions {
  display: flex;
  gap: 8px;
  position: relative;
  z-index: 101;
}
.action-btn {
  background: none;
  border: none;
  color: #777;
  cursor: pointer;
  padding: 0;
  font-size: 1.1em;
  line-height: 1;
  transition: color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.action-btn:hover { color: #ccc; }
.forecast-btn { font-size: 1.4em; font-weight: bold; padding-bottom: 2px; }
.action-btn.active { color: var(--color-primary); }
.filter-icon { width: 14px; height: 14px; opacity: 0.7; transition: opacity 0.2s; }
.action-btn:hover .filter-icon { opacity: 1; }

/* --- Filter Dropdown --- */
.filter-dropdown {
  position: absolute;
  top: 35px;
  right: 0;
  width: 160px;
  background-color: #f4f4f4;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  z-index: 100;
  padding: 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.filter-group-title {
  font-size: 0.75em;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  margin-bottom: 6px;
  padding-left: 2px;
}
.filter-dropdown ul { list-style: none; margin: 0; padding: 0; }
.filter-dropdown li {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 0.85em;
  color: #333;
  cursor: pointer;
  font-weight: 500 !important;
  transition: background-color 0.2s;
}
.filter-dropdown li:hover { background-color: #e9e9e9; }
.filter-dropdown li.active { color: #007AFF; background-color: #e0e0e0; }

/* --- LIST STYLES --- */
.category-items-list-scroll {
  flex-grow: 1;
  overflow-y: auto;
  padding-right: 5px;
  scrollbar-width: none;
  -ms-overflow-style: none;
  min-height: 0;
}
.category-items-list-scroll::-webkit-scrollbar { display: none; }

/* Regular Category Styles */
.category-breakdown-list { display: flex; flex-direction: column; flex-grow: 1; gap: 0.25rem; }
.category-item { display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 0.25rem; }
.category-item span:first-child { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
.category-item span:last-child { color: var(--color-text); font-weight: 500; white-space: nowrap; }
.category-item span.income { color: var(--color-primary); }
.category-item span.expense { color: var(--color-danger); }
.category-item-total { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--color-border); }
.category-item-empty { font-size: 0.9em; color: #666; text-align: center; margin-top: 10px; }

/* Transfer Styles */
.transfer-list { display: flex; flex-direction: column; gap: 10px; }
.transfer-item { display: flex; flex-direction: column; padding-bottom: 8px; border-bottom: 1px solid var(--color-border); }
.transfer-item:last-child { border-bottom: none; }
.t-row { display: flex; justify-content: space-between; align-items: center; line-height: 1.4; }
.t-top { margin-bottom: 2px; }
.t-amount { font-size: 0.9em; font-weight: 500; }
.t-amount.expense { color: var(--color-danger); }
.t-amount.income { color: var(--color-primary); }
.t-arrow { color: #888; font-size: 0.8em; }
.t-bottom { font-size: 0.8em; color: #aaa; }
.t-acc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 35%; }
.t-acc.left { text-align: left; }
.t-acc.right { text-align: right; }
.t-date { color: #666; font-size: 0.9em; white-space: nowrap; }

/* Widget Dropdown */
.widget-dropdown {
  position: absolute; top: 35px; left: 0; width: 220px; 
  background-color: #f4f4f4; border-radius: 8px; 
  box-shadow: 0 5px 15px rgba(0,0,0,0.2); z-index: 100; 
  padding: 8px; box-sizing: border-box; max-height: 400px; 
  display: flex; flex-direction: column;
}
.widget-search-input {
  flex-shrink: 0; padding: 8px 10px; border: 1px solid #ddd; 
  border-radius: 6px; margin-bottom: 8px; font-size: 0.9em; 
  box-sizing: border-box; width: 100%; background-color: #FFFFFF; color: #333;
}
.widget-search-input:focus { outline: none; border-color: #007AFF; }
.widget-dropdown ul { list-style: none; margin: 0; padding: 0; flex-grow: 1; overflow-y: auto; }
.widget-dropdown li {
  padding: 10px 12px; border-radius: 6px; font-size: 0.9em; 
  color: #333; cursor: pointer; font-weight: 500 !important;
}
.widget-dropdown li:not(.disabled):hover { background-color: #e9e9e9; }
.widget-dropdown li.active { color: #333; background-color: #e0e0e0; }
.widget-dropdown li.disabled { color: #aaa; background-color: transparent; cursor: not-allowed; }

@media (max-height: 900px) {
  .dashboard-card { min-width: 100px; padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .category-item { font-size: 0.8em; margin-bottom: 0.2rem; }
  .category-item span:first-child { padding-right: 5px; }
  .t-amount { font-size: 0.85em; }
  .t-bottom { font-size: 0.75em; }
  .action-btn { font-size: 1em; gap: 6px; }
  .forecast-btn { font-size: 1.2em; }
  .filter-icon { width: 12px; height: 12px; }
}
</style>
