<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import filterIcon from '@/assets/filter-edit.svg';

/**
 * * --- МЕТКА ВЕРСИИ: v3.8 - FORCE DEFAULT SORT ---
 * * ВЕРСИЯ: 3.8 - Принудительная сортировка по order в режиме default
 * * ДАТА: 2025-11-22
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (LOGIC) В processedItems добавлена явная сортировка по order, если режим сортировки 'default'.
 * Это финальная защита от "скачущего" порядка категорий, даже если данные пришли неотсортированными.
 */

console.log('--- HeaderBalanceCard.vue v3.8 (Force Default Sort) ЗАГРУЖЕН ---');

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true },
  emptyText: { type: String, default: "...нет..." },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const emit = defineEmits(['add', 'edit']);
const mainStore = useMainStore();

const menuRef = ref(null);

// --- Прогноз ---
const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

/* ======================= ЛОГИКА ФИЛЬТРОВ ======================= */
const isFilterOpen = ref(false);
const filterBtnRef = ref(null);
const filterDropdownRef = ref(null);
const sortMode = ref('default'); 
const filterMode = ref('all');

const processedItems = computed(() => {
  // Создаем копию массива, чтобы сортировка не мутировала пропс
  let items = [...props.items];

  // Фильтрация
  if (filterMode.value === 'positive') items = items.filter(item => (item.balance || 0) > 0);
  else if (filterMode.value === 'negative') items = items.filter(item => (item.balance || 0) < 0);
  else if (filterMode.value === 'nonZero') items = items.filter(item => (item.balance || 0) !== 0);

  // Сортировка
  if (sortMode.value === 'desc') {
    items.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  } else if (sortMode.value === 'asc') {
    items.sort((a, b) => (a.balance || 0) - (b.balance || 0));
  } else {
    // 🟢 FIX v3.8: Явная сортировка по order в режиме по умолчанию
    items.sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  return items;
});

const setSortMode = (mode) => { sortMode.value = mode; };
const setFilterMode = (mode) => { filterMode.value = mode; };

const handleFilterClickOutside = (event) => {
  if (filterDropdownRef.value && !filterDropdownRef.value.contains(event.target) &&
    filterBtnRef.value && !filterBtnRef.value.contains(event.target)) {
    isFilterOpen.value = false;
  }
};

watch(isFilterOpen, (isOpen) => {
  if (isOpen) document.addEventListener('mousedown', handleFilterClickOutside);
  else document.removeEventListener('mousedown', handleFilterClickOutside);
});

/* ======================= ЛОГИКА ВЫБОРА ВИДЖЕТА ======================= */
const isDropdownOpen = ref(false);
const searchQuery = ref('');
const filteredWidgets = computed(() => {
  if (!searchQuery.value) return mainStore.allWidgets;
  const query = searchQuery.value.toLowerCase();
  return mainStore.allWidgets.filter(widget => widget.name.toLowerCase().includes(query));
});

const formatBalance = (balance) => {
  const num = Number(balance) || 0;
  const safeBalance = isNaN(num) ? 0 : num;
  const formatted = formatNumber(Math.abs(safeBalance)); 
  if (safeBalance < 0) return `- ${formatted}`;
  return formatted; 
};

const handleSelect = (newWidgetKey) => {
  mainStore.replaceWidget(props.widgetIndex, newWidgetKey);
  nextTick(() => { isDropdownOpen.value = false; });
};

const handleClickOutside = (event) => {
  if (menuRef.value && !menuRef.value.contains(event.target)) {
    isDropdownOpen.value = false; 
  }
};

watch(isDropdownOpen, (isOpen) => {
  if (isOpen) {
    searchQuery.value = '';
    document.addEventListener('mousedown', handleClickOutside);
  } else {
    document.removeEventListener('mousedown', handleClickOutside);
  }
});

const toggleDropdown = () => { isDropdownOpen.value = !isDropdownOpen.value; };
</script>

<template>
  <div class="dashboard-card" @click.stop="isFilterOpen = false">
    
    <div class="card-title-container">
      <div class="card-title" ref="menuRef" @click.stop="toggleDropdown">
        {{ props.title }} <span>▽</span>
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
        <!-- 1. ФИЛЬТР -->
        <button 
          class="action-square-btn" 
          ref="filterBtnRef" 
          @click.stop="isFilterOpen = !isFilterOpen"
          title="Фильтр и сортировка"
        >
          <img :src="filterIcon" alt="Filter" class="icon-svg" />
        </button>
        
        <!-- 2. ПРОГНОЗ -->
        <button 
          class="action-square-btn"
          :class="{ 'active': showFutureBalance }"
          @click.stop="showFutureBalance = !showFutureBalance"
          title="Показать прогноз"
        >
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="7" y1="17" x2="17" y2="7"></line>
            <polyline points="7 7 17 7 17 17"></polyline>
          </svg>
        </button>
        
        <!-- 3. РЕДАКТИРОВАТЬ -->
        <button 
          @click.stop="$emit('edit')" 
          class="action-square-btn"
          title="Редактировать список"
        >
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
      </div>

      <!-- ВЫПАДАШКА ФИЛЬТРА -->
      <div v-if="isFilterOpen" class="filter-dropdown" ref="filterDropdownRef" @click.stop>
        <div class="filter-group">
          <div class="filter-group-title">Сортировка</div>
          <ul>
            <li :class="{ active: sortMode === 'default' }" @click="setSortMode('default')">По умолчанию</li>
            <li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')">От большего к меньшему</li>
            <li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')">От меньшего к большему</li>
          </ul>
        </div>
        <div class="filter-group">
          <div class="filter-group-title">Фильтр</div>
          <ul>
            <li :class="{ active: filterMode === 'all' }" @click="setFilterMode('all')">Показать все</li>
            <li :class="{ active: filterMode === 'nonZero' }" @click="setFilterMode('nonZero')">Скрыть нулевые</li>
            <li :class="{ active: filterMode === 'positive' }" @click="setFilterMode('positive')">Только положительные</li>
            <li :class="{ active: filterMode === 'negative' }" @click="setFilterMode('negative')">Только отрицательные</li>
          </ul>
        </div>
      </div>
    </div>
    
    <div class="card-items-list">
      <div v-for="item in processedItems" :key="item._id" class="card-item">
        <span>{{ item.name }}</span>
        <span v-if="!showFutureBalance" :class="{ 'expense': item.balance < 0 }">
          ₸ {{ formatBalance(item.balance) }}
        </span>
        <span v-else class="forecast-display">
          <span :class="{ 'expense': item.balance < 0 }">
            ₸ {{ formatBalance(item.balance) }}
          </span>
          <span class="forecast-arrow">></span>
          <span :class="{ 'expense': item.futureBalance < 0 }">
            {{ formatBalance(item.futureBalance) }}
          </span>
        </span>
      </div>
      <p v-if="!processedItems.length" class="card-item-empty">{{ props.emptyText }}</p>
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
  height: 32px; 
  margin-bottom: 0.5rem; flex-shrink: 0;
}
.card-title {
  font-size: 0.85em; color: #aaa; cursor: pointer; transition: color 0.2s;
  position: relative; z-index: 101;
}
.card-title:hover { color: #ddd; }
.card-title span { font-size: 0.8em; margin-left: 4px; }

.card-actions { display: flex; gap: 6px; position: relative; z-index: 101; }
.action-square-btn { width: 18px; height: 18px; border: 1px solid transparent; border-radius: 4px; background-color: #3D3B3B; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; color: #888; transition: all 0.2s ease; }
.action-square-btn:hover { background-color: #555; color: #ccc; }
.action-square-btn.active { background-color: #34c759; color: #fff; border-color: transparent; }
.icon-svg { width: 11px; height: 11px; display: block; object-fit: contain; }

.card-items-list { flex-grow: 1; overflow-y: auto; padding-right: 5px; scrollbar-width: none; -ms-overflow-style: none; min-height: 0; }
.card-items-list::-webkit-scrollbar { display: none; }
.card-item { display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 0.25rem; }
.card-item-empty { font-size: 0.9em; color: #666; }
.card-item span:first-child { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
.card-item span:last-child { color: var(--color-text); font-weight: 500; white-space: nowrap; }
.card-item span.expense { color: var(--color-danger); }
.forecast-display { display: flex; align-items: center; gap: 4px; color: var(--color-text); font-weight: 500; white-space: nowrap; }
.forecast-arrow { font-size: 0.9em; color: #777; }
.forecast-display span.expense { color: var(--color-danger); }

.widget-dropdown { position: absolute; top: 35px; left: 0; width: 220px; background-color: #f4f4f4; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); z-index: 100; padding: 8px; box-sizing: border-box; max-height: 400px; display: flex; flex-direction: column; }
.widget-search-input { flex-shrink: 0; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px; font-size: 0.9em; box-sizing: border-box; width: 100%; background-color: #FFFFFF; color: #333; }
.widget-search-input:focus { outline: none; border-color: #007AFF; }
.widget-dropdown ul { list-style: none; margin: 0; padding: 0; flex-grow: 1; overflow-y: auto; }
.widget-dropdown li { padding: 10px 12px; border-radius: 6px; font-size: 0.9em; color: #333; cursor: pointer; font-weight: 500 !important; }
.widget-dropdown li:hover { background-color: #e9e9e9; }
.widget-dropdown li.active { color: #333; background-color: #e0e0e0; }
.widget-dropdown li.disabled { color: #aaa; background-color: transparent; cursor: not-allowed; }

.filter-dropdown { position: absolute; top: 35px; right: 0; width: 200px; background-color: #f4f4f4; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); z-index: 100; padding: 10px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; }
.filter-group-title { font-size: 0.75em; font-weight: 600; color: #888; text-transform: uppercase; margin-bottom: 6px; padding-left: 2px; }
.filter-dropdown ul { list-style: none; margin: 0; padding: 0; }
.filter-dropdown li { padding: 8px 10px; border-radius: 6px; font-size: 0.85em; color: #333; cursor: pointer; font-weight: 500 !important; transition: background-color 0.2s; }
.filter-dropdown li:hover { background-color: #e9e9e9; }
.filter-dropdown li.active { color: #007AFF; background-color: #e0e0e0; }

@media (max-height: 900px) {
  .dashboard-card { min-width: 100px; padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .card-item { font-size: 0.8em; margin-bottom: 0.2rem; }
  .card-item span:first-child { padding-right: 5px; }
  .forecast-display { gap: 2px; }
  .card-actions { gap: 3px; }
  .action-square-btn { width: 16px; height: 16px; }
  .icon-svg { width: 10px; height: 10px; }
}
</style>