<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v4.0 - RENAME WIDGET ---
 * * ВЕРСИЯ: 4.0 - Переименование виджета
 * * ДАТА: 2025-11-20
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (UI) Заголовок по умолчанию изменен на "Мои предоплаты".
 */

const props = defineProps({
  title: { type: String, default: 'Мои предоплаты' }, // 🟢 ОБНОВЛЕНО
  weOweAmount: { type: Number, default: 0 },        
  theyOweAmount: { type: Number, default: 0 },       
  weOweAmountFuture: { type: Number, default: 0 },   
  theyOweAmountFuture: { type: Number, default: 0 }, 
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const emit = defineEmits(['edit']);
const mainStore = useMainStore();

const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

const isDropdownOpen = ref(false);
const menuRef = ref(null);
const searchQuery = ref('');

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

const formatCurrency = (val) => {
  const absVal = Math.abs(val);
  return `${formatNumber(absVal)} ₸`;
};

const displayWeOwe = computed(() => {
    if (!showFutureBalance.value) return formatCurrency(props.weOweAmount);
    return `${formatCurrency(props.weOweAmount)} > ${formatCurrency(props.weOweAmountFuture)}`;
});

const displayTheyOwe = computed(() => {
    if (!showFutureBalance.value) return formatCurrency(props.theyOweAmount);
    return `${formatCurrency(props.theyOweAmount)} > ${formatCurrency(props.theyOweAmountFuture)}`;
});
</script>

<template>
  <div class="dashboard-card">
    
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
        
        <button 
          @click.stop="$emit('edit')" 
          class="action-square-btn"
          title="Редактировать"
        >
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
      </div>
    </div>

    <div class="card-items-list">
      
      <div class="card-item">
        <span title="Полученные авансы, по которым работа не сдана">Мы должны</span>
        <span class="value-expense">
          {{ displayWeOwe }}
        </span>
      </div>

      <div class="card-item">
        <span title="Остатки по сделкам, где внесена только часть суммы">Нам должны</span>
        <!-- 🟢 ИЗМЕНЕН КЛАСС ДЛЯ ОРАНЖЕВОГО ЦВЕТА -->
        <span class="value-orange">
          {{ displayTheyOwe }}
        </span>
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

.widget-dropdown { position: absolute; top: 35px; left: 0; width: 220px; background-color: #f4f4f4; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); z-index: 100; padding: 8px; box-sizing: border-box; max-height: 400px; display: flex; flex-direction: column; }
.widget-search-input { flex-shrink: 0; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px; font-size: 0.9em; box-sizing: border-box; width: 100%; background-color: #FFFFFF; color: #333; }
.widget-search-input:focus { outline: none; border-color: #007AFF; }
.widget-dropdown ul { list-style: none; margin: 0; padding: 0; flex-grow: 1; overflow-y: auto; }
.widget-dropdown li { padding: 10px 12px; border-radius: 6px; font-size: 0.9em; color: #333; cursor: pointer; font-weight: 500 !important; }
.widget-dropdown li:hover { background-color: #e9e9e9; }
.widget-dropdown li.active { color: #333; background-color: #e0e0e0; }
.widget-dropdown li.disabled { color: #aaa; background-color: transparent; cursor: not-allowed; }

.card-items-list { flex-grow: 1; overflow-y: auto; padding-right: 5px; scrollbar-width: none; display: flex; flex-direction: column; gap: 4px; }
.card-item { display: flex; justify-content: space-between; align-items: center; font-size: 0.9em; margin-bottom: 0.25rem; }
.card-item span:first-child { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
.card-item span:last-child { font-weight: 500; white-space: nowrap; }

.value-expense { color: var(--color-danger); }
/* 🟢 НОВЫЙ ЦВЕТ ДЛЯ "НАМ ДОЛЖНЫ" */
.value-orange { color: #FF9D00; }

@media (max-height: 900px) {
  .dashboard-card { min-width: 100px; padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .card-item { font-size: 0.8em; margin-bottom: 0.2rem; }
  .action-square-btn { width: 16px; height: 16px; }
  .icon-svg { width: 10px; height: 10px; }
}
</style>
