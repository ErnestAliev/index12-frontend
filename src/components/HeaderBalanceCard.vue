<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import filterIcon from '@/assets/filter-edit.svg';

/**
 * * --- МЕТКА ВЕРСИИ: v49.3 - UNIFIED STYLES ---
 * * ВЕРСИЯ: 49.3 - Унификация шрифтов
 * * ДАТА: 2025-12-03
 */

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true },
  emptyText: { type: String, default: "...нет..." },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true },
  isDeltaMode: { type: Boolean, default: false }
});

const emit = defineEmits(['add', 'edit']);
const mainStore = useMainStore();

const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

/* ======================= ФИЛЬТРЫ ======================= */
const isFilterOpen = ref(false);
const filterBtnRef = ref(null);
const filterDropdownRef = ref(null);
const filterPos = ref({ top: '0px', left: '0px' });
const sortMode = ref('default'); 
const filterMode = ref('all');

const updateFilterPosition = () => {
  if (filterBtnRef.value) {
    const rect = filterBtnRef.value.getBoundingClientRect();
    filterPos.value = { top: `${rect.bottom + 5}px`, left: `${rect.right - 160}px` };
  }
};

const processedItems = computed(() => {
  let items = [...props.items];
  if (filterMode.value === 'positive') items = items.filter(item => (item.balance || 0) > 0);
  else if (filterMode.value === 'negative') items = items.filter(item => (item.balance || 0) < 0);
  else if (filterMode.value === 'nonZero') items = items.filter(item => (item.balance || 0) !== 0);

  if (sortMode.value === 'desc') items.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  else if (sortMode.value === 'asc') items.sort((a, b) => (a.balance || 0) - (b.balance || 0));
  else items.sort((a, b) => (a.order || 0) - (b.order || 0));
  return items;
});

const setSortMode = (mode) => { sortMode.value = mode; };
const setFilterMode = (mode) => { filterMode.value = mode; };

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

const formatBalance = (balance) => {
  const num = Number(balance) || 0;
  const safeBalance = isNaN(num) ? 0 : num;
  const formatted = formatNumber(Math.abs(safeBalance)); 
  return safeBalance < 0 ? `- ${formatted}` : formatted;
};

const formatDelta = (val) => {
  const num = Number(val) || 0;
  if (num === 0) return '0';
  const formatted = formatNumber(Math.abs(num));
  return num > 0 ? `+ ${formatted}` : `- ${formatted}`;
};
</script>

<template>
  <div class="dashboard-card" @click.stop="isFilterOpen = false">
    
    <div class="card-title-container">
      <div class="card-title">
        {{ props.title }}
      </div>

      <div class="card-actions">
        <button class="action-square-btn" ref="filterBtnRef" @click.stop="isFilterOpen = !isFilterOpen" title="Фильтр">
          <img :src="filterIcon" alt="Filter" class="icon-svg" />
        </button>
        <button class="action-square-btn" :class="{ 'active': showFutureBalance }" @click.stop="showFutureBalance = !showFutureBalance" title="Прогноз">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
        </button>
        <button @click.stop="$emit('edit')" class="action-square-btn" title="Редактировать">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button @click.stop="$emit('add')" class="action-square-btn" title="Добавить">
           <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="isFilterOpen" class="filter-dropdown-fixed" :style="filterPos" ref="filterDropdownRef" @click.stop>
        <div class="filter-group">
          <div class="filter-group-title">Сортировка</div>
          <ul>
            <li :class="{ active: sortMode === 'default' }" @click="setSortMode('default')"><span>По умолчанию</span></li>
            <li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')"><span>По убыванию</span> <span class="symbol">▼</span></li>
            <li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')"><span>По возрастанию</span> <span class="symbol">▲</span></li>
          </ul>
        </div>
        <div class="filter-group">
          <div class="filter-group-title">Фильтр</div>
          <ul>
            <li :class="{ active: filterMode === 'all' }" @click="setFilterMode('all')">Все</li>
            <li :class="{ active: filterMode === 'nonZero' }" @click="setFilterMode('nonZero')">Скрыть 0</li>
            <li :class="{ active: filterMode === 'positive' }" @click="setFilterMode('positive')">Только (+)</li>
            <li :class="{ active: filterMode === 'negative' }" @click="setFilterMode('negative')">Только (-)</li>
          </ul>
        </div>
      </div>
    </Teleport>
    
    <div class="card-items-list" :class="{ 'forecast-mode': showFutureBalance }">
      <div v-for="item in processedItems" :key="item._id" class="card-item">
        <span class="name-cell">
          {{ item.name }}
          <span v-if="item.linkedAccountName" class="link-icon" :title="`Связан со счетом: ${item.linkedAccountName}`">
             <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          </span>
        </span>
        
        <span v-if="!showFutureBalance" class="single-balance" :class="{ 'expense': item.balance < 0 }">
          <span class="currency">₸</span> {{ formatBalance(item.balance) }}
        </span>

        <span v-else class="forecast-display">
          <span class="current-cell" :class="{ 'expense': item.balance < 0 }">
             <span class="currency">₸</span> {{ formatBalance(item.balance) }}
          </span>
          <span class="arrow-cell">></span>
          <span v-if="isDeltaMode" class="future-cell" :class="{ 'income': item.futureBalance > 0, 'expense': item.futureBalance < 0 }">
             {{ formatDelta(item.futureBalance) }}
          </span>
          <span v-else class="future-cell" :class="{ 'expense': item.futureBalance < 0 }">
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
  display: flex; flex-direction: column; 
  height: 100%; 
  overflow: hidden; 
  padding-right: 1.5rem; border-right: 1px solid var(--color-border); position: relative; 
}
.dashboard-card:last-child { border-right: none; padding-right: 0; }

.card-title-container { display: flex; justify-content: space-between; align-items: center; height: 32px; margin-bottom: 0.5rem; flex-shrink: 0; }

/* 🟢 UNIFIED TITLE */
.card-title { 
  font-size: 13px; 
  font-weight: 600; 
  color: #ffffff; 
  position: relative; z-index: 101; 
  letter-spacing: 0.01em;

}

.card-actions { display: flex; gap: 6px; position: relative; z-index: 101; }
.action-square-btn { width: 18px; height: 18px; border: 1px solid transparent; border-radius: 4px; background-color: #3D3B3B; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; color: #888; transition: all 0.2s ease; }
.action-square-btn:hover { background-color: #555; color: #ccc; }
.action-square-btn.active { background-color: #34c759; color: #fff; border-color: transparent; }
.icon-svg { width: 11px; height: 11px; display: block; object-fit: contain; }

.card-items-list { 
  flex-grow: 1; overflow-y: auto; padding-right: 5px; scrollbar-width: none; min-height: 0; display: flex; flex-direction: column; 
}
.card-items-list::-webkit-scrollbar { display: none; }

/* 🟢 UNIFIED ROW STYLE */
.card-item { 
  display: flex; 
  justify-content: space-between; 
  font-size: 13px;  /* Было 12px */
  flex-shrink: 0; 
 
}

/* Grid for Forecast */
.card-items-list.forecast-mode {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 12px auto; 
  column-gap: 6px;
  align-items: center;
  align-content: start;
  font-size: 25px;  /* Было 12px */
}
.card-items-list.forecast-mode .card-item { 
    display: grid;
  grid-template-columns: minmax(0, 1fr) auto 12px auto; 
  column-gap: 6px;
  align-items: center;
  align-content: start;display: contents;
 font-size: 13px;  /* Было 12px */ }
.card-items-list.forecast-mode .forecast-display { 
    display: grid;
  grid-template-columns: minmax(0, 1fr) auto 12px auto; 
  column-gap: 6px;
  align-items: center;
  align-content: start;display: contents; 
 font-size: 13px;  /* Было 12px */}

.name-cell {
  color: #ccc; 
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
  display: flex; align-items: center; gap: 6px;
}

.link-icon { color: #34c759; display: inline-flex; align-items: center; opacity: 0.6; cursor: help; }
.link-icon:hover { opacity: 1; }

.current-cell { color: var(--color-text); font-weight: 500; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 0.95em; }
.arrow-cell { color: #777; font-size: 0.9em; text-align: center; user-select: none; }
.future-cell { font-weight: 500; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 0.95em; }

.currency { font-size: 0.85em; color: #777; margin-right: 2px; font-weight: 400; }
.card-item-empty { font-size: 12px; color: #666; grid-column: 1 / -1;  }

.expense { color: var(--color-danger) !important; }
.income { color: var(--color-primary) !important; }
.single-balance { color: var(--color-text);  white-space: nowrap; }
.single-balance.expense { font-size: 12px; color: var(--color-danger) !important; font-weight: 500; }

@media (max-height: 900px) {
  .dashboard-card { padding-right: 1rem; }
  .card-item { font-size: 12px;  }
}
</style>