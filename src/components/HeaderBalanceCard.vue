<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import filterIcon from '@/assets/filter-edit.svg';

/**
 * * --- МЕТКА ВЕРСИИ: v4.3 - REMOVE SWITCHER ---
 * * ВЕРСИЯ: 4.3 - Удалена функция смены виджета через заголовок
 */

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true },
  emptyText: { type: String, default: "...нет..." },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const emit = defineEmits(['add', 'edit']);
const mainStore = useMainStore();

const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

/* ======================= ФИЛЬТРЫ (ЛОКАЛЬНО ЧЕРЕЗ TELEPORT) ======================= */
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
</script>

<template>
  <div class="dashboard-card" @click.stop="isFilterOpen = false">
    
    <div class="card-title-container">
      <div class="card-title">
        {{ props.title }}
      </div>

      <div class="card-actions">
        <button 
          class="action-square-btn" 
          ref="filterBtnRef" 
          @click.stop="isFilterOpen = !isFilterOpen"
          title="Фильтр и сортировка"
        >
          <img :src="filterIcon" alt="Filter" class="icon-svg" />
        </button>
        
        <button 
          class="action-square-btn"
          :class="{ 'active': showFutureBalance }"
          @click.stop="showFutureBalance = !showFutureBalance"
          title="Показать прогноз"
        >
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
        </button>
        
        <button @click.stop="$emit('edit')" class="action-square-btn" title="Редактировать список">
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
            <li :class="{ active: sortMode === 'default' }" @click="setSortMode('default')">
               <span>По умолчанию</span>
            </li>
            <li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')">
               <span>По убыванию</span> <span class="symbol">▼</span>
            </li>
            <li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')">
               <span>По возрастанию</span> <span class="symbol">▲</span>
            </li>
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
    
    <div class="card-items-list">
      <div v-for="item in processedItems" :key="item._id" class="card-item">
        <span>{{ item.name }}</span>
        <span v-if="!showFutureBalance" :class="{ 'expense': item.balance < 0 }">
          ₸ {{ formatBalance(item.balance) }}
        </span>
        <span v-else class="forecast-display">
          <span :class="{ 'expense': item.balance < 0 }">₸ {{ formatBalance(item.balance) }}</span>
          <span class="forecast-arrow">></span>
          <span :class="{ 'expense': item.futureBalance < 0 }">{{ formatBalance(item.futureBalance) }}</span>
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
/* Заголовок больше не кликабельный */
.card-title { font-size: 0.85em; color: #aaa; position: relative; z-index: 101; }

.card-actions { display: flex; gap: 6px; position: relative; z-index: 101; }
.action-square-btn { width: 18px; height: 18px; border: 1px solid transparent; border-radius: 4px; background-color: #3D3B3B; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; color: #888; transition: all 0.2s ease; }
.action-square-btn:hover { background-color: #555; color: #ccc; }
.action-square-btn.active { background-color: #34c759; color: #fff; border-color: transparent; }
.icon-svg { width: 11px; height: 11px; display: block; object-fit: contain; }

.card-items-list { 
  flex-grow: 1; 
  overflow-y: auto; 
  padding-right: 5px; 
  scrollbar-width: none; 
  min-height: 0; 
  display: flex; flex-direction: column; 
}
.card-items-list::-webkit-scrollbar { display: none; }

.card-item { display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 0.25rem; flex-shrink: 0; }
.card-item-empty { font-size: 0.9em; color: #666; }
.card-item span:first-child { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
.card-item span:last-child { color: var(--color-text); font-weight: 500; white-space: nowrap; }
.card-item span.expense { color: var(--color-danger); }
.forecast-display { display: flex; align-items: center; gap: 4px; color: var(--color-text); font-weight: 500; white-space: nowrap; }
.forecast-arrow { font-size: 0.9em; color: #777; }
.forecast-display span.expense { color: var(--color-danger); }

@media (max-height: 900px) {
  .dashboard-card { min-width: 100px; padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .card-item { font-size: 0.8em; margin-bottom: 0.2rem; }
  .action-square-btn { width: 16px; height: 16px; }
  .icon-svg { width: 10px; height: 10px; }
}
</style>

<!-- Глобальные стили для дропдауна -->
<style>
.filter-dropdown-fixed {
  position: fixed; 
  width: 160px;    
  background-color: var(--color-background-soft, #282828);
  border: 1px solid var(--color-border, #444);
  border-radius: 8px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
  z-index: 9999;   
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.filter-group {
  display: flex;
  flex-direction: column;
}

.filter-group-title {
  font-size: 11px;
  text-transform: uppercase;
  color: #888;
  padding: 4px 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.filter-dropdown-fixed ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.filter-dropdown-fixed li {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--color-text, #ddd);
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filter-dropdown-fixed li:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.filter-dropdown-fixed li.active {
  color: var(--color-primary, #34c759);
  background-color: rgba(52, 199, 89, 0.1);
  font-weight: 500;
}

.symbol {
  color: #888;
  font-size: 10px;
}
.active .symbol {
  color: inherit;
}
</style>