<script setup>
import { ref, watch, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v5.7-TRANSFER-VIEW ---
 * * ВЕРСИЯ: 5.7 - Спец-режим для категории "Перевод"
 * ДАТА: 2025-11-16
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (FIX ОШИБКА #2) Добавлена логика определения категории "Перевод".
 * 2. Реализован альтернативный вид отображения: список транзакций
 * (Дата, Сумма, Откуда -> Куда) вместо Доход/Расход.
 */

console.log('--- HeaderCategoryCard.vue v5.7-TRANSFER-VIEW ЗАГРУЖЕН ---');

const props = defineProps({
  title: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const mainStore = useMainStore();
const isDropdownOpen = ref(false);
const cardRef = ref(null);
const searchQuery = ref('');

// --- Логика Dropdown (Без изменений) ---
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

// =================================================================
// --- 🔴 НОВАЯ ЛОГИКА (ОШИБКА #2): Определение "Перевода" ---
// =================================================================

// 1. Определяем, является ли эта карточка "Переводом"
const isTransferWidget = computed(() => {
  // Ключ виджета имеет формат 'cat_{id}'
  const catId = props.widgetKey.replace('cat_', '');
  // Ищем категорию в сторе (helper добавлен в v5.7)
  const category = mainStore.getCategoryById(catId); 
  // Проверяем имя (безопасно)
  return category && category.name.toLowerCase() === 'перевод';
});

// 2. Получаем список переводов (если это виджет перевода)
const transferList = computed(() => {
  if (!isTransferWidget.value) return [];
  // Берем готовый список из стора (добавлен в v5.7)
  return mainStore.currentTransfers; 
});

// 3. Helpers для отображения перевода
const getAccountName = (accIdOrObj) => {
  if (!accIdOrObj) return '???';
  const id = typeof accIdOrObj === 'object' ? accIdOrObj._id : accIdOrObj;
  const acc = mainStore.accounts.find(a => a._id === id);
  return acc ? acc.name : 'Удален';
};

const formatTransferDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  // Формат: 15.11
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
};

// --- Логика данных для ОБЫЧНЫХ категорий (Доход/Расход) ---
const categoryBreakdown = computed(() => {
  return mainStore.currentCategoryBreakdowns[props.widgetKey] || { income: 0, expense: 0, total: 0 };
});
// =================================================================
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
      
      <!-- 🔴 ВАРИАНТ 1: СПИСОК ПЕРЕВОДОВ (Если это категория "Перевод") -->
      <div v-if="isTransferWidget" class="transfer-list">
        <div v-for="t in transferList" :key="t._id" class="transfer-item">
          <!-- Верхняя строка: Дата и Сумма -->
          <div class="t-row">
            <span class="t-date">{{ formatTransferDate(t.date) }}</span>
            <span class="t-amount">{{ formatNumber(t.amount) }} ₸</span>
          </div>
          <!-- Нижняя строка: Откуда -> Куда -->
          <div class="t-row t-details">
            <span class="t-acc">{{ getAccountName(t.fromAccountId) }}</span>
            <span class="t-arrow">→</span>
            <span class="t-acc">{{ getAccountName(t.toAccountId) }}</span>
          </div>
        </div>
        
        <div v-if="transferList.length === 0" class="category-item-empty">
          Нет переводов
        </div>
      </div>

      <!-- 🔴 ВАРИАНТ 2: ОБЫЧНАЯ КАТЕГОРИЯ (Доход/Расход) -->
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
/* Основные стили карточки (Без изменений) */
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

/* Скролл-контейнер */
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

/* --- Стили для обычной категории --- */
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
.category-item span.income { color: var(--color-primary); }
.category-item span.expense { color: var(--color-danger); }

.category-item-total {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}
.category-item-empty {
  font-size: 0.9em;
  color: #666;
  text-align: center;
  margin-top: 10px;
}

/* --- 🔴 НОВЫЕ СТИЛИ: Список переводов --- */
.transfer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.transfer-item {
  display: flex;
  flex-direction: column;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border); /* Разделитель */
}
.transfer-item:last-child {
  border-bottom: none;
}
.t-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  line-height: 1.3;
}
.t-date {
  font-size: 0.75em;
  color: #777;
}
.t-amount {
  font-size: 0.9em;
  font-weight: 500;
  color: var(--color-text);
}
.t-details {
  margin-top: 1px;
}
.t-acc {
  font-size: 0.8em;
  color: #aaa;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 45%; /* Чтобы не наезжали друг на друга */
}
.t-arrow {
  font-size: 0.8em;
  color: #34c759;
  padding: 0 4px;
}

/* --- Dropdown styles (Без изменений) --- */
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
  font-size: 0.9em;
  color: #333;
  cursor: pointer;
  font-weight: 500 !important;
}
.widget-dropdown li:not(.disabled):hover {
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

/* Media Queries (Без изменений) */
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

