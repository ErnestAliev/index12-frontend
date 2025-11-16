<script setup>
import { ref, watch, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
// Импортируем утилиту форматирования, используемую в других карточках
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v5.6-CATEGORY-CARD-REBUILD ---
 * * ВЕРСИЯ: 5.6 - Полное восстановление HeaderCategoryCard
 * ДАТА: 2025-11-16
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (КРИТИЧЕСКАЯ ОШИБКА) Компонент полностью восстановлен.
 *    В предыдущей версии код был ошибочно заменен на код из OperationPopup.
 * 2. Восстановлена стандартная логика карточки (dropdown, поиск, выбор виджета).
 * 3. Добавлена логика отображения данных категории (Доход, Расход, Итого).
 */

const props = defineProps({
  title: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const mainStore = useMainStore();
const isDropdownOpen = ref(false);
const cardRef = ref(null);
const searchQuery = ref('');

// --- Логика Dropdown (Аналогично HeaderTotalCard) ---
const filteredWidgets = computed(() => {
  // Реактивно обновляется при создании новых категорий благодаря mainStore.allWidgets
  if (!searchQuery.value) {
    return mainStore.allWidgets;
  }
  const query = searchQuery.value.toLowerCase();
  return mainStore.allWidgets.filter(widget =>
    widget.name.toLowerCase().includes(query)
  );
});

// Обработчик выбора нового виджета
const handleSelect = (newWidgetKey) => {
  // Проверка на disabled состояние
  if (mainStore.dashboardLayout.includes(newWidgetKey) && newWidgetKey !== props.widgetKey) {
    return;
  }
  mainStore.replaceWidget(props.widgetIndex, newWidgetKey);
  isDropdownOpen.value = false;
};

// Логика клика снаружи
const handleClickOutside = (event) => {
  if (cardRef.value && !cardRef.value.contains(event.target)) {
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

// --- Логика данных категории ---
const categoryBreakdown = computed(() => {
  // Получаем данные из стора по ключу виджета (например, 'cat_654...')
  return mainStore.currentCategoryBreakdowns[props.widgetKey] || { income: 0, expense: 0, total: 0 };
});
</script>

<template>
  <div class="dashboard-card" ref="cardRef">

    <div
      class="card-title-container"
      @click="isDropdownOpen = !isDropdownOpen"
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

    <div class="category-items-list-scroll">
      <div class="category-breakdown-list">

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
/* Стили взяты из предоставленного вами файла, так как они были корректны для карточки */
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
  height: 30px;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
  cursor: pointer;
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

/* (Стили списка v4.1) */
.category-breakdown-list {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 0.25rem;
}
.category-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.9em;
  margin-bottom: 0.25rem;
}
.category-item span:first-child {
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 10px;
}
.category-item span:last-child {
  color: var(--color-text);
  font-weight: 500;
  white-space: nowrap;
}
.category-item span.income {
  color: var(--color-primary); /* Зеленый */
}
.category-item span.expense {
  color: var(--color-danger); /* Оранжевый/Красный */
}

/* НОВОЕ: Стиль для строки "Итого" */
.category-item-total {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

/* (Стили скролла v4.1) */
.category-items-list-scroll {
  flex-grow: 1;
  overflow-y: auto;
  padding-right: 5px;
  scrollbar-width: none;
  -ms-overflow-style: none;
  min-height: 0;
}

.category-items-list-scroll::-webkit-scrollbar {
  display: none;
}
.category-item-empty {
  font-size: 0.9em;
  color: #666;
}


/* --- Стили для Dropdown (v2.3-v2.5) --- */
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
  /* Увеличим шрифт для консистентности (было 0.7em) */
  font-size: 0.9em;
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
  /* Увеличим шрифт для консистентности (было 0.7em) */
  font-size: 0.9em;
  color: #333;
  cursor: pointer;
  font-weight: 500 !important; /* (v2.5 fix) */
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

/* === Адаптация для планшета === */
@media (max-height: 900px) {
  .dashboard-card {
    min-width: 100px;
    padding-right: 1rem;
  }
  .card-title {
    font-size: 0.8em;
  }
  .category-item {
    font-size: 0.8em;
    margin-bottom: 0.2rem;
  }
  .category-item span:first-child {
    padding-right: 5px;
  }
}
</style>
