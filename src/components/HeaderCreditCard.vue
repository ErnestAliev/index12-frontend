<script setup>
import { ref, computed, nextTick, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useUiStore } from '@/stores/uiStore';
import { formatNumber } from '@/utils/formatters.js';

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true }, 
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true },
  emptyText: { type: String, default: "Кредитов нет" }
});

const emit = defineEmits(['add', 'edit']);
const mainStore = useMainStore();
const uiStore = useUiStore();

const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

const isFilterOpen = ref(false);
const filterBtnRef = ref(null);
const filterDropdownRef = ref(null);
const filterPos = ref({ top: '0px', left: '0px' });

// Use uiStore for persistent filter state
const sortMode = computed({
  get: () => uiStore.getWidgetSortMode(props.widgetKey),
  set: (val) => uiStore.setWidgetSortMode(props.widgetKey, val)
});

// Show green button when filters are not default
const isFilterActive = computed(() => {
  return sortMode.value !== 'default';
});

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

const processedItems = computed(() => {
  let list = [...props.items];
  if (sortMode.value === 'desc') list.sort((a, b) => Math.abs(b.balance || 0) - Math.abs(a.balance || 0));
  else if (sortMode.value === 'asc') list.sort((a, b) => Math.abs(a.balance || 0) - Math.abs(b.balance || 0));
  return list;
});

const setSortMode = (mode) => { 
    sortMode.value = mode; 
    isFilterOpen.value = false;
};
const formatMoney = (val) => formatNumber(Math.abs(val || 0));

// =========================
// UI snapshot (screen = truth)
// =========================
function getSnapshot() {
  const rows = (processedItems.value || []).map((item) => {
    const cur = Number(item?.balance) || 0;
    const fut = Number(item?.futureBalance) || 0;
    return {
      id: item?._id ?? null,
      name: item?.name ?? '',
      current: cur,
      currentText: `₸ ${formatMoney(cur)}`,
      future: fut,
      futureText: `${formatMoney(fut)}`,
    };
  });

  const totalCurrent = rows.reduce((s, r) => s + (Number(r.current) || 0), 0);
  const totalFuture = rows.reduce((s, r) => s + (Number(r.future) || 0), 0);

  return {
    key: props.widgetKey,
    title: props.title,
    type: 'credits',
    showFutureBalance: Boolean(showFutureBalance.value),
    sortMode: sortMode.value,
    rows,
    totals: {
      totalCurrent,
      totalCurrentText: `₸ ${formatMoney(totalCurrent)}`,
      totalFuture,
      totalFutureText: `${formatMoney(totalFuture)}`,
    }
  };
}

defineExpose({ getSnapshot });
</script>

<template>
  <!-- 🟢 Убрал .stop чтобы клик прошел вверх к TheHeader для Fullscreen -->
  <div class="dashboard-card" @click="isFilterOpen = false">
    
    <div class="card-title-container">
      <div class="card-title">{{ props.title }}</div>

      <div class="card-actions">
        <button class="action-square-btn" :class="{ active: isFilterActive }" ref="filterBtnRef" @click.stop="isFilterOpen = !isFilterOpen" title="Фильтр">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
        </button>
        <button class="action-square-btn" :class="{ 'active': showFutureBalance }" @click.stop="showFutureBalance = !showFutureBalance" title="Прогноз">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
        </button>
        <button @click.stop="$emit('edit')" class="action-square-btn" title="Список транзакций">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button @click.stop="$emit('add')" class="action-square-btn" title="Добавить кредит">
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
            <li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')"><span>По убыванию</span></li>
            <li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')"><span>По возрастанию</span></li>
          </ul>
        </div>
      </div>
    </Teleport>
    
    <div class="card-items-list" :class="{ 'forecast-mode': showFutureBalance }">
      <div v-for="item in processedItems" :key="item._id" class="card-item">
        <span class="name-cell">{{ item.name }}</span>
        
        <span v-if="!showFutureBalance" class="single-balance expense">
          ₸ {{ formatMoney(item.balance) }}
        </span>

        <span v-else class="forecast-display">
          <span class="current-cell expense"><span class="currency">₸</span> {{ formatMoney(item.balance) }}</span>
          <span class="arrow-cell">></span>
          <span class="future-cell expense">{{ formatMoney(item.futureBalance) }}</span>
        </span>
      </div>
      <p v-if="!processedItems.length" class="card-item-empty">{{ emptyText }}</p>
    </div>
  </div>
</template>

<style scoped>
.dashboard-card { 
  display: flex; flex-direction: column; height: 100%; 
  overflow: hidden; padding-right: 1.5rem; border-right: 1px solid var(--color-border); position: relative; 
}
.dashboard-card:last-child { border-right: none; padding-right: 0; }

.card-title-container { 
  display: flex; justify-content: space-between; align-items: center; 
  height: var(--h-header-card); flex-shrink: 0; 
}

.card-title { 
  font-size: var(--font-sm); color: var(--text-main); position: relative; z-index: 101; font-weight: var(--fw-semi);
}

.card-actions { display: flex; gap: 6px; position: relative; z-index: 101; }

/* 🟢 1. ВОЗВРАТ СЕРОГО ФОНА */
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

.card-items-list { 
  flex-grow: 1; overflow-y: auto; padding-right: 5px; scrollbar-width: none; min-height: 0; display: flex; flex-direction: column; 
}
.card-items-list::-webkit-scrollbar { display: none; }

/* 🟢 2. ШРИФТЫ НЕ ПРЫГАЮТ (везде 13px) */
.card-item { 
  display: flex; justify-content: space-between; 
  font-size: var(--font-sm);
  margin-bottom: 2px;
}

.card-items-list.forecast-mode { 
  display: grid; grid-template-columns: minmax(0, 1fr) auto 12px auto; column-gap: 6px; 
  align-items: center; align-content: start; 
  font-size: var(--font-sm);
  
  /* 🟢 3. КОМПЕНСАЦИЯ ВЫСОТЫ (row-gap заменяет margin-bottom) */
  row-gap: 2px;
}
.card-items-list.forecast-mode .card-item { display: contents; }
.card-items-list.forecast-mode .forecast-display { display: contents; }

.name-cell { color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

/* 🟢 FIX: Размер шрифта наследуется, без уменьшения */
.current-cell { font-weight: var(--fw-medium); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.arrow-cell { color: var(--text-mute); text-align: center; user-select: none; }
.future-cell { font-weight: var(--fw-medium); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }

.currency { font-size: 0.85em; color: var(--text-mute); margin-right: 2px; font-weight: 400; }
.card-item-empty { font-size: var(--font-xs); color: #666; grid-column: 1 / -1; }
.expense { color: var(--color-danger) !important; }

/* 🟢 FIX: Размер шрифта наследуется */
.single-balance { font-weight: var(--fw-medium); white-space: nowrap; font-variant-numeric: tabular-nums; }
.single-balance.expense { color: var(--color-danger) !important; }

@media (max-height: 900px) {
  .dashboard-card { padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .card-item { font-size: 0.8em; margin-bottom: 0.2rem; }
}
</style>