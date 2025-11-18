<script setup>
import { ref, watch, computed, nextTick } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v2.9 - SCOPED CLICK FIX ---
 * * ВЕРСИЯ: 2.9 - Исправлена зона закрытия меню
 * * ДАТА: 2025-11-18
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (FIX) `handleClickOutside` теперь проверяет клик относительно `menuContainerRef`
 * (заголовок + меню), а не `cardRef` (вся карточка).
 * Теперь клик в пустое место внутри карточки ЗАКРЫВАЕТ меню.
 */

console.log('--- HeaderTotalCard.vue v2.9 (Scoped Click Fix) ЗАГРУЖЕН ---');

const props = defineProps({
  title: { type: String, required: true },
  totalBalance: { type: Number, required: true },
  subtitlePrefix: { type: String, required: true },
  subtitleDate: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const mainStore = useMainStore();
const isDropdownOpen = ref(false);
// 🟢 NEW: Ref только для зоны меню (заголовок + выпадашка)
const menuContainerRef = ref(null);

const searchQuery = ref('');
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
  console.log(`[HeaderTotalCard] handleSelect: Выбран виджет ${newWidgetKey}`);
  mainStore.replaceWidget(props.widgetIndex, newWidgetKey);
  nextTick(() => {
    isDropdownOpen.value = false;
  });
};

// --- 🟢 УЛУЧШЕННАЯ ЛОГИКА ЗАКРЫТИЯ ---
const handleClickOutside = (event) => {
  // Проверяем клик только относительно menuContainerRef
  // Если клик НЕ в заголовке и НЕ в меню -> закрываем.
  if (menuContainerRef.value && !menuContainerRef.value.contains(event.target)) {
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

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
};
</script>

<template>
  <div class="dashboard-card">
    
    <!-- 🟢 Ref теперь здесь, на контейнере заголовка -->
    <div 
      class="card-title-container" 
      ref="menuContainerRef"
      @click="toggleDropdown"
    >
      <div class="card-title">{{ title }} <span>▽</span></div>
      
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

    <!-- Клик сюда теперь тоже закроет меню -->
    <div 
      class="card-total-balance"
      :class="{ 'expense': props.totalBalance < 0 }"
    >
      ₸ 
      {{ props.totalBalance < 0 ? '-' : '' }}
      {{ formatNumber(Math.abs(props.totalBalance)) }}
    </div>
    
    <div class="card-sub-balance">
      {{ props.subtitlePrefix }} • <span class="subtitle-date">{{ props.subtitleDate }}</span>
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
}
.dashboard-card:last-child {
  border-right: none;
  padding-right: 0;
}
.card-total-balance {
  font-size: 1.8em;
  font-weight: bold;
  color: var(--color-heading);
  margin-bottom: 0.25rem;
  white-space: nowrap;
}
.card-sub-balance {
  font-size: 0.8em;
  color: #777;
}
.card-sub-balance .subtitle-date {
  color: var(--color-primary);
  font-weight: 500;
}
.card-title-container {
  height: 30px; 
  margin-bottom: 0.5rem;
  flex-shrink: 0;
  cursor: pointer;
  /* Важно для позиционирования dropdown внутри этого контейнера */
  position: relative; 
}
.card-title {
  font-size: 0.85em;
  color: #aaa;
  transition: color 0.2s;
}
.card-title:hover {
  color: #ddd;
}
.card-title span {
  font-size: 0.8em;
  margin-left: 4px;
}
.card-total-balance.expense {
  color: var(--color-danger);
}
.widget-dropdown {
  position: absolute;
  top: 35px;
  left: 0;
  width: 220px;
  background-color: #f4f4f4;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  z-index: 100;
  padding: 8px;
  box-sizing: border-box;
  max-height: 400px;
  display: flex;
  flex-direction: column;
}
.widget-search-input {
  flex-shrink: 0;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 0.7em;
  box-sizing: border-box;
  width: 100%;
  background-color: #FFFFFF;
  color: #333;
}
.widget-search-input:focus {
  outline: none;
  border-color: #007AFF;
}
.widget-dropdown ul {
  list-style: none;
  margin: 0;
  padding: 0;
  flex-grow: 1;
  overflow-y: auto;
}
.widget-dropdown li {
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.7em;
  color: #333;
  cursor: pointer;
  font-weight: 500 !important;
}
.widget-dropdown li:hover {
  background-color: #e9e9e9;
}
.widget-dropdown li.active {
  color: #333;
  background-color: #e0e0e0;
}
.widget-dropdown li.disabled {
  color: #aaa;
  background-color: transparent;
  cursor: not-allowed;
}
@media (max-height: 900px) {
  .dashboard-card { min-width: 100px; padding-right: 1rem; }
  .card-total-balance { font-size: 1.5em; }
  .card-sub-balance { font-size: 0.75em; }
  .card-title { font-size: 0.8em; }
}
</style>
