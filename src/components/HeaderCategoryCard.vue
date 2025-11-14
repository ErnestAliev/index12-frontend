<script setup>
// 🔴 НОВОЕ: импортируем ref, watch, computed
import { ref, watch, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v2.5-FONT-WEIGHT-FIX ---
 * * ВЕРСИЯ: 2.5 - Исправлен "прыгающий" font-weight
 * ДАТА: 2025-11-09
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (FIX) Добавлен `!important` к `font-weight: 500`
 * в `.widget-dropdown li` для победы над
 * глобальным сбросом `font-weight: normal`.
 */

const props = defineProps({
  title: { type: String, required: true },
  widgetKey: { type: String, required: true }, // 'cat_12345'
  widgetIndex: { type: Number, required: true } 
});

const mainStore = useMainStore();
const isDropdownOpen = ref(false);
const cardRef = ref(null);

// --- 🔴 НОВОЕ: Логика поиска ---
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
// --- КОНЕЦ НОВОГО ---

// --- Логика для выпадающего меню (как в других виджетах) ---
const handleSelect = (newWidgetKey) => {
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
    // 🔴 НОВОЕ: Очищаем поиск при открытии
    searchQuery.value = '';
    document.addEventListener('mousedown', handleClickOutside);
  } else {
    document.removeEventListener('mousedown', handleClickOutside);
  }
});
// --- Конец логики меню ---

// --- !!! НОВЫЙ БЛОК: Получаем разбивку !!! ---
const breakdown = computed(() => {
  const data = mainStore.currentCategoryBreakdowns[props.widgetKey];
  if (!data) {
    return { income: 0, expense: 0, total: 0 };
  }
  return data;
});
// --- КОНЕЦ НОВОГО БЛОКА ---


// --- 🔴 НОВОЕ: ОПРЕДЕЛЯЕМ ТИП КАТЕГОРИИ ---
const isTransferCategory = computed(() => props.title.toLowerCase() === 'перевод');

// --- 🔴 НОВОЕ: ЛОГИКА ДЛЯ СПИСКА ПЕРЕВОДОВ ---
/**
 * Получает имя счета из объекта (если он .populate)
 * или ищет в mainStore.accounts по ID (если это строка)
 */
const getAccountName = (acc) => {
  if (acc?.name) return acc.name; // 1. Populated object
  if (acc) { // 2. String ID
     // --- 🔴 ИСПРАВЛЕНИЕ: Добавлена защита (|| []) ---
     const account = (mainStore.accounts || []).find(a => a._id === acc);
     return account ? account.name : '???';
  }
  return '???'; // 3. Null
}

/**
 * Фильтрует ВСЕ операции "до сегодня"
 * и оставляет только переводы, сортируя их
 */
const transferOps = computed(() => {
  if (!isTransferCategory.value) return [];
  
  // --- 🔴 ИСПРАВЛЕНИЕ: Добавлена защита (|| []) ---
  // Это предотвратит сбой, если mainStore.currentOps еще undefined
  return (mainStore.currentOps || [])
    .filter(op => op.type === 'transfer' || op.isTransfer === true)
    .sort((a, b) => {
      // Сортировка по дате (dayOfYear) и cellIndex
      if (a.dayOfYear !== b.dayOfYear) {
        return b.dayOfYear - a.dayOfYear; // Новые дни вверху
      }
      return b.cellIndex - a.cellIndex; // Новые операции в дне вверху
    });
});
// --- КОНЕЦ НОВОГО ---

</script>

<template>
  <div class="dashboard-card" ref="cardRef">
    
    <div 
      class="card-title-container" 
      @click="isDropdownOpen = !isDropdownOpen"
    >
      <div class="card-title">{{ title }} <span>▽</span></div>
      
      <div v-if="isDropdownOpen" class="widget-dropdown">
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

    <div class="category-breakdown-list" v-if="!isTransferCategory">
      <div class="category-item">
        <span>Доход</span>
        <span class="income">+ {{ formatNumber(breakdown.income) }}</span>
      </div>
      <div class="category-item">
        <span>Расход</span>
        <span class="expense">- {{ formatNumber(breakdown.expense) }}</span>
      </div>
      </div>

    <div class="category-items-list-scroll" v-else>
      <p v-if="!transferOps.length" class="category-item-empty">
        ...переводов нет...
      </p>
      
      <div v-for="op in transferOps" :key="op._id" class="category-item">
        <span>{{ getAccountName(op.fromAccountId) }} → {{ getAccountName(op.toAccountId) }}</span>
        <span>₸ {{ formatNumber(op.amount) }}</span>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* (Стили карточки v4.1 - без изменений) */
.dashboard-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-right: 1.5rem;
  border-right: 1px solid var(--color-border);
  min-width: 150px;
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

/* (Стили списка v4.1 - без изменений) */
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

/* (Стили списка v4.1 - без изменений) */
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


/* --- 🔴 ИСПРАВЛЕНИЕ v2.3: Стили для Dropdown --- */
.widget-dropdown {
  position: absolute;
  top: 35px;
  left: 0;
  width: 220px; /* (Чуть шире) */
  background-color: #f4f4f4;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  z-index: 100;
  padding: 8px;
  box-sizing: border-box;
  
  /* 🔴 НОВОЕ: Ограничение высоты */
  max-height: 400px;
  display: flex;
  flex-direction: column;
}

/* 🔴 ИСПРАВЛЕНИЕ v2.4: Стили для поиска */
.widget-search-input {
  flex-shrink: 0;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 0.7em;
  box-sizing: border-box;
  width: 100%;

  /* --- 🔴 НОВОЕ: Исправление цвета --- */
  background-color: #FFFFFF;
  color: #333;
  /* --- КОНЕЦ НОВОГО --- */
}
.widget-search-input:focus {
  outline: none;
  border-color: #007AFF; /* (Цвет как у "Создать") */
}
/* --- */

.widget-dropdown ul {
  list-style: none;
  margin: 0;
  padding: 0;
  
  /* 🔴 НОВОЕ: Скролл */
  flex-grow: 1;
  overflow-y: auto;
}
/* --- КОНЕЦ ИСПРАВЛЕНИЯ --- */

.widget-dropdown li {
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.7em;
  color: #333;
  cursor: pointer;
  
  /* --- 🔴 ИСПРАВЛЕНИЕ v2.5: !important --- */
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
</style>