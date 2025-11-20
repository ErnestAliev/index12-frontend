<script setup>
import { computed, ref, nextTick, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v1.2 - STYLE FIX (NO SCROLL) ---
 * * ВЕРСИЯ: 1.2 - Скрытие скроллбара и унификация стилей
 * * ДАТА: 2025-11-20
 * * ЧТО ИСПРАВЛЕНО:
 * 1. (CSS) Добавлены стили скрытия скроллбара (scrollbar-width: none).
 * 2. (CSS) Унифицированы отступы с HeaderBalanceCard.
 */

const props = defineProps({
  title: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const mainStore = useMainStore();
const isDropdownOpen = ref(false);
const menuRef = ref(null);
const searchQuery = ref('');

const filteredWidgets = computed(() => {
  if (!searchQuery.value) return mainStore.allWidgets;
  const query = searchQuery.value.toLowerCase();
  return mainStore.allWidgets.filter(widget => widget.name.toLowerCase().includes(query));
});

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

// Данные из стора
const obligations = computed(() => mainStore.obligationsWidgetData);

// Форматтеры
const weOweFormatted = computed(() => formatNumber(obligations.value.weOweWork));
const oweUsFormatted = computed(() => formatNumber(obligations.value.oweUsMoney));
</script>

<template>
  <div class="dashboard-card">
    
    <!-- ЗАГОЛОВОК -->
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
    </div>

    <!-- КОНТЕНТ: СПИСОК (ROWS) -->
    <div class="card-items-list">
        
        <!-- Строка 1: МЫ ДОЛЖНЫ -->
        <div class="card-item">
            <div class="item-info">
                <span class="item-label">Мы должны</span>
                <span class="item-sub">Оплачено, не сдано</span>
            </div>
            <span class="item-value we-owe">
                <template v-if="obligations.weOweWork > 0">- </template>
                {{ weOweFormatted }} ₸
            </span>
        </div>

        <!-- Строка 2: НАМ ДОЛЖНЫ -->
        <div class="card-item">
            <div class="item-info">
                <span class="item-label">Нам должны</span>
                <span class="item-sub">Сделка есть, нет оплаты</span>
            </div>
            <span class="item-value owe-us">
                {{ oweUsFormatted }} ₸
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
  font-size: 0.85em; color: #aaa; transition: color 0.2s; cursor: pointer; 
  position: relative; z-index: 101; 
}
.card-title:hover { color: #ddd; }
.card-title span { font-size: 0.8em; margin-left: 4px; }

.widget-dropdown { position: absolute; top: 35px; left: 0; width: 220px; background-color: #f4f4f4; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); z-index: 100; padding: 8px; box-sizing: border-box; max-height: 400px; display: flex; flex-direction: column; }
.widget-search-input { flex-shrink: 0; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px; font-size: 0.9em; box-sizing: border-box; width: 100%; background-color: #FFFFFF; color: #333; }
.widget-search-input:focus { outline: none; border-color: #007AFF; }
.widget-dropdown ul { list-style: none; margin: 0; padding: 0; flex-grow: 1; overflow-y: auto; }
.widget-dropdown li { padding: 10px 12px; border-radius: 6px; font-size: 0.9em; color: #333; cursor: pointer; font-weight: 500 !important; }
.widget-dropdown li:not(.disabled):hover { background-color: #e9e9e9; }
.widget-dropdown li.active { color: #333; background-color: #e0e0e0; }
.widget-dropdown li.disabled { color: #aaa; background-color: transparent; cursor: not-allowed; }

/* --- Стили списка (Унифицировано с HeaderBalanceCard) --- */
.card-items-list {
    flex-grow: 1;
    overflow-y: auto;
    padding-right: 5px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 4px;
    
    /* 🔴 Скрытие скроллбара (было пропущено) */
    scrollbar-width: none; 
    -ms-overflow-style: none; 
    min-height: 0;
}
.card-items-list::-webkit-scrollbar { 
    display: none; 
}

.card-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.item-info {
    display: flex;
    flex-direction: column;
}

.item-label {
    font-size: 0.9em;
    color: #ccc; 
}

.item-sub {
    font-size: 0.7em;
    color: #666;
    margin-top: 2px;
}

.item-value {
    font-size: 0.95em;
    font-weight: 600;
    white-space: nowrap;
}

.we-owe { color: var(--color-text); } 
.owe-us { color: var(--color-primary); } 

@media (max-height: 900px) {
  .dashboard-card { min-width: 100px; padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .card-items-list { gap: 8px; }
}
</style>
