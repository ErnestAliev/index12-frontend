<script setup>
// 🔴 НОВОЕ: импортируем ref, computed, watch И nextTick
import { ref, watch, computed, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

// 🔴 НОВОЕ: Импортируем иконку фильтра
import filterIcon from '@/assets/filter-edit.svg';

/**
 * * --- МЕТКА ВЕРСИИ: v2.7 (Fix #13a) ---
 * * (с доработками для прогноза v1.0)
 * *
 * * ЧТО ИСПРАВЛЕНО (Fix #13a):
 * 1. `handleSelect` теперь закрывает dropdown
 * через `nextTick()`. Это дает `@click.stop`
 * завершиться до уничтожения компонента,
 * предотвращая "проваливание" клика в DayColumn.
 * 2. (NEW) Добавлено подробное логирование.
 */

// 🔴 НОВАЯ УСТАНОВКА: ЛОГИРОВАНИЕ
console.log('--- HeaderBalanceCard.vue v2.7 (Fix #13a) ЗАГРУЖЕН ---');


const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true }, // 🔴 Принимает item.balance и item.futureBalance
  emptyText: { type: String, default: "...нет..." },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const emit = defineEmits(['add', 'edit']);

const mainStore = useMainStore();
const cardRef = ref(null);

// 🔴 ИЗМЕНЕНО: Состояние для переключателя прогноза из Pinia
const showFutureBalance = computed({
  get: () => {
    const state = mainStore.dashboardForecastState[props.widgetKey] ?? false;
    // 🔴 ЛОГИРОВАНИЕ
    // console.log(`[HeaderBalanceCard: ${props.title}] computed: showFutureBalance (GET): ${state}`);
    return state;
  },
  set: (val) => {
    // 🔴 ЛОГИРОВАНИЕ
    console.log(`[HeaderBalanceCard: ${props.title}] computed: showFutureBalance (SET): ${val}`);
    mainStore.setForecastState(props.widgetKey, val);
  }
});

/* ======================= 🔴 1. ЛОГИКА ФИЛЬТРОВ И СОРТИРОВКИ ======================= */
const isFilterOpen = ref(false);
const filterBtnRef = ref(null);
const filterDropdownRef = ref(null);

// 'default' - как пришло от стора
// 'desc' - от большего к меньшему
// 'asc' - от меньшего к большему
const sortMode = ref('default'); 

// 'all' - все
// 'positive' - balance > 0
// 'negative' - balance < 0
// 'nonZero' - balance != 0 (скрыть нулевые)
const filterMode = ref('all');

/**
 * 🔴 Вычисляемое свойство, которое обрабатывает
 * props.items на основе `sortMode` и `filterMode`.
 */
const processedItems = computed(() => {
  // 🔴 ЛОГИРОВАНИЕ
  // console.log(`[HeaderBalanceCard: ${props.title}] computed: processedItems (sort: ${sortMode.value}, filter: ${filterMode.value})`);
  let items = [...props.items]; // Копируем, чтобы не мутировать props

  // 1. Применяем ФИЛЬТР
  if (filterMode.value === 'positive') {
    items = items.filter(item => (item.balance || 0) > 0);
  } else if (filterMode.value === 'negative') {
    items = items.filter(item => (item.balance || 0) < 0);
  } else if (filterMode.value === 'nonZero') {
    // Скрываем все, что равно 0 (включая -0 и +0)
    items = items.filter(item => (item.balance || 0) !== 0);
  }
  // 'all' - ничего не делаем

  // 2. Применяем СОРТИРОВКУ
  if (sortMode.value === 'desc') {
    // От большего к меньшему
    items.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  } else if (sortMode.value === 'asc') {
    // От меньшего к большему
    items.sort((a, b) => (a.balance || 0) - (b.balance || 0));
  }
  // 'default' - ничего не делаем, оставляем как есть

  return items;
});

// 🔴 Функции для установки режимов из меню
const setSortMode = (mode) => {
  // 🔴 ЛОГИРОВАНИЕ
  console.log(`[HeaderBalanceCard: ${props.title}] setSortMode: ${mode}`);
  sortMode.value = mode;
  // isFilterOpen.value = false; // (Опционально) Закрывать меню при клике
};
const setFilterMode = (mode) => {
  // 🔴 ЛОГИРОВАНИЕ
  console.log(`[HeaderBalanceCard: ${props.title}] setFilterMode: ${mode}`);
  filterMode.value = mode;
  // isFilterOpen.value = false; // (Опционально) Закрывать меню при клике
};

// 🔴 Обработчик клика снаружи для НОВОГО меню фильтров
const handleFilterClickOutside = (event) => {
  if (
    filterDropdownRef.value && !filterDropdownRef.value.contains(event.target) &&
    filterBtnRef.value && !filterBtnRef.value.contains(event.target)
  ) {
    // 🔴 ЛОГИРОВАНИЕ
    console.log(`[HeaderBalanceCard: ${props.title}] handleFilterClickOutside: Клик снаружи, закрываю ФИЛЬТР`);
    isFilterOpen.value = false;
  }
};

watch(isFilterOpen, (isOpen) => {
  if (isOpen) {
    // 🔴 ЛОГИРОВАНИЕ
    console.log(`[HeaderBalanceCard: ${props.title}] watch: Дропдаун ФИЛЬТРА ОТКРЫТ`);
    document.addEventListener('mousedown', handleFilterClickOutside);
  } else {
    // 🔴 ЛОГИРОВАНИЕ
    console.log(`[HeaderBalanceCard: ${props.title}] watch: Дропдаун ФИЛЬТРА ЗАКРЫТ`);
    document.removeEventListener('mousedown', handleFilterClickOutside);
  }
});
/* ======================= КОНЕЦ НОВОЙ ЛОГИКИ ======================= */


/* ======================= 2. ЛОГИКА ВЫБОРА ВИДЖЕТА (старая) ======================= */
const isDropdownOpen = ref(false);
const searchQuery = ref('');
const filteredWidgets = computed(() => {
  // ... (старый код без изменений) ...
  if (!searchQuery.value) {
    return mainStore.allWidgets;
  }
  const query = searchQuery.value.toLowerCase();
  return mainStore.allWidgets.filter(widget => 
    widget.name.toLowerCase().includes(query)
  );
});

// --- 🔴 ИСПРАВЛЕНИЕ: Функция форматирования (v2.2) ---
const formatBalance = (balance) => {
  // ... (старый код без изменений) ...
  const num = Number(balance) || 0;
  // 🔴 ВАЖНО: Принудительно используем 0, если futureBalance еще не приехал (NaN)
  const safeBalance = isNaN(num) ? 0 : num;
  const formatted = formatNumber(Math.abs(safeBalance)); 
  
  if (safeBalance < 0) {
    return `- ${formatted}`;
  }
  return formatted; 
};
// --- КОНЕЦ ИСПРАВЛЕНИЯ ---

// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ (FIX #13a): Проваливающийся клик ---
// =================================================================
const handleSelect = (newWidgetKey) => {
  // 🔴 ЛОГИРОВАНИЕ
  console.log(`[HeaderBalanceCard: ${props.title}] handleSelect: Выбран виджет ${newWidgetKey}`);
  
  // 1. Меняем виджет в store
  mainStore.replaceWidget(props.widgetIndex, newWidgetKey);
  
  // 2. 🔴 ИСПРАВЛЕНИЕ:
  // Мы *не* закрываем дропдаун немедленно.
  // Мы ждем, пока Vue "отпустит" текущий event loop,
  // чтобы `@click.stop` успел 100% отработать.
  nextTick(() => {
    isDropdownOpen.value = false;
    console.log(`[HeaderBalanceCard: ${props.title}] handleSelect: (nextTick) Дропдаун закрыт`);
  });
};
// =================================================================


// --- !!! НОВАЯ ЛОГИКА: Клик снаружи (для старого меню) !!! ---
const handleClickOutside = (event) => {
  // ... (старый код без изменений) ...
  if (cardRef.value && !cardRef.value.contains(event.target)) {
    // 🔴 ЛОГИРОВАНИЕ
    console.log(`[HeaderBalanceCard: ${props.title}] handleClickOutside: Клик снаружи, закрываю дропдаун`);
    isDropdownOpen.value = false; // Закрываем меню
  }
};

watch(isDropdownOpen, (isOpen) => {
  // ... (старый код без изменений) ...
  if (isOpen) {
    // 🔴 ЛОГИРОВАНИЕ
    console.log(`[HeaderBalanceCard: ${props.title}] watch: Дропдаун ВЫБОРА ВИДЖЕТА ОТКРЫТ`);
    searchQuery.value = '';
    document.addEventListener('mousedown', handleClickOutside);
  } else {
    // 🔴 ЛОГИРОВАНИЕ
    console.log(`[HeaderBalanceCard: ${props.title}] watch: Дропдаун ВЫБОРА ВИДЖЕТА ЗАКРЫТ`);
    document.removeEventListener('mousedown', handleClickOutside);
  }
});
// --- КОНЕЦ НОВОЙ ЛОГИКИ ---

const toggleDropdown = () => {
  // 🔴 ЛОГИРОВАНИЕ
  console.log(`[HeaderBalanceCard: ${props.title}] toggleDropdown: Клик по заголовку`);
  isDropdownOpen.value = !isDropdownOpen.value;
};

</script>

<template>
  <div class="dashboard-card" ref="cardRef" @click.stop="isFilterOpen = false">
    
    <div class="card-title-container">
      <div 
        class="card-title" 
        @click.stop="toggleDropdown"
        >
        {{ props.title }} <span>▽</span>
        
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

      <div class="card-actions">
        <button 
          class="action-btn" 
          ref="filterBtnRef" 
          @click.stop="isFilterOpen = !isFilterOpen"
        >
          <img :src="filterIcon" alt="Filter" class="filter-icon" />
        </button>
        
        <button 
          class="action-btn forecast-btn"
          :class="{ 'active': showFutureBalance }"
          @click.stop="showFutureBalance = !showFutureBalance"
          title="Показать/скрыть прогноз"
        >
          ↗
        </button>
        
        <button @click.stop="$emit('add')" class="action-btn">+</button>
        <button @click.stop="$emit('edit')" class="action-btn">✎</button>
      </div>

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
        
        <span 
          v-if="!showFutureBalance"
          :class="{ 
            'expense': item.balance < 0 
          }"
        >
          ₸ {{ formatBalance(item.balance) }}
        </span>

        <span v-else class="forecast-display">
          <span 
            :class="{ 
              'expense': item.balance < 0 
            }"
          >
            ₸ {{ formatBalance(item.balance) }}
          </span>
          
          <span class="forecast-arrow">></span>
          
          <span 
            :class="{ 
              'expense': item.futureBalance < 0 
            }"
          >
            {{ formatBalance(item.futureBalance) }}
          </span>
        </span>
        </div>
      <p v-if="!processedItems.length" class="card-item-empty">{{ props.emptyText }}</p>
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
  /* min-width: 150px; (🟢 УДАЛЕНО: Позволяем карточке сжиматься) */
  position: relative;
  min-height: 0;
}
.dashboard-card:last-child {
  border-right: none;
  padding-right: 0;
}
.card-title-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 30px; 
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}
.card-title {
  font-size: 0.85em;
  color: #aaa;
  cursor: pointer;
  transition: color 0.2s;
  position: relative; /* 🔴 НОВОЕ: для z-index старого меню */
  z-index: 101; /* 🔴 НОВОЕ: чтобы было выше нового меню */
}
.card-title:hover {
  color: #ddd;
}
.card-title span {
  font-size: 0.8em;
  margin-left: 4px;
}
.card-actions {
  display: flex;
  gap: 8px;
  /* 🔴 НОВОЕ: для z-index кнопок */
  position: relative;
  z-index: 101;
}
.action-btn {
  background: none;
  border: none;
  color: #777;
  cursor: pointer;
  padding: 0;
  font-size: 1.1em;
  line-height: 1;
  transition: color 0.2s;
  /* 🔴 НОВОЕ: для выравнивания иконки */
  display: flex;
  align-items: center;
  justify-content: center;
}
.action-btn:hover {
  color: #ccc;
}

/* 🔴 НОВОЕ: Стили для кнопки прогноза */
.forecast-btn {
  font-size: 1.4em; /* Крупнее */
  font-weight: bold;
  line-height: 1;
  padding-bottom: 2px; /* Выравнивание */
}
.action-btn.active {
  color: var(--color-primary); /* Подсветка */
}

/* 🔴 НОВОЕ: Стили для иконки фильтра */
.filter-icon {
  width: 14px;
  height: 14px;
  opacity: 0.7;
  transition: opacity 0.2s;
}
.action-btn:hover .filter-icon {
  opacity: 1;
}

/* (Стили списка v4.1 - без изменений) */
.card-items-list {
  flex-grow: 1;
  overflow-y: auto;
  padding-right: 5px;
  scrollbar-width: none;
  -ms-overflow-style: none;
  min-height: 0;
}
/* ... (прочие стили списка) ... */
.card-items-list::-webkit-scrollbar { display: none; }
.card-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.9em;
  margin-bottom: 0.25rem;
}
.card-item-empty { font-size: 0.9em; color: #666; }
.card-item span:first-child {
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 10px;
}
.card-item span:last-child {
  color: var(--color-text);
  font-weight: 500;
  white-space: nowrap;
}
.card-item span.expense { color: var(--color-danger); }


/* 🔴 НОВОЕ: Стили для отображения прогноза */
.forecast-display {
  display: flex;
  align-items: center;
  gap: 4px;
  /* Стили копируются из .card-item span:last-child */
  color: var(--color-text);
  font-weight: 500;
  white-space: nowrap;
}
.forecast-arrow {
  font-size: 0.9em;
  color: #777;
}
/* Применяем .expense к дочерним span */
.forecast-display span.expense {
  color: var(--color-danger);
}


/* --- Стили для Dropdown (v2.3 - v2.5) --- */
.widget-dropdown {
  position: absolute;
  top: 35px;
  left: 0;
  width: 220px; 
  background-color: #f4f4f4;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  z-index: 100; /* (z-index 100, ниже чем .card-title) */
  padding: 8px;
  box-sizing: border-box;
  max-height: 400px;
  display: flex;
  flex-direction: column;
}
/* ... (стили .widget-search-input, ul, li) ... */
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
.widget-search-input:focus { outline: none; border-color: #007AFF; }
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
  font-weight: 500 !important; /* (v2.5) */
}
.widget-dropdown li:hover { background-color: #e9e9e9; }
.widget-dropdown li.active { color: #333; background-color: #e0e0e0; }
.widget-dropdown li.disabled { color: #aaa; background-color: transparent; cursor: not-allowed; }


/* --- 🔴 НОВОЕ: Стили для меню "Фильтр" --- */
.filter-dropdown {
  position: absolute;
  top: 35px;
  right: 0; /* Выравнивание по правому краю */
  width: 200px; /* Немного уже */
  background-color: #f4f4f4;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  z-index: 100; /* Ниже чем .card-title и .card-actions */
  padding: 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.filter-group-title {
  font-size: 0.75em;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  margin-bottom: 6px;
  padding-left: 2px;
}
.filter-dropdown ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.filter-dropdown li {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 0.85em;
  color: #333;
  cursor: pointer;
  font-weight: 500 !important; /* (Как в v2.5) */
  transition: background-color 0.2s;
}
.filter-dropdown li:hover {
  background-color: #e9e9e9;
}
.filter-dropdown li.active {
  color: #007AFF; /* (Цвет как у "Создать") */
  background-color: #e0e0e0;
}

/* === 🟢 НАЧАЛО ИЗМЕНЕНИЙ (ШРИФТЫ ДЛЯ ПЛАНШЕТА) === */
@media (max-height: 900px) {
  .dashboard-card {
    min-width: 100px; /* Уменьшаем мин. ширину */
    padding-right: 1rem;
  }
  .card-title {
    font-size: 0.8em;
  }
  .card-item {
    font-size: 0.8em; /* Уменьшаем шрифт списка */
    margin-bottom: 0.2rem;
  }
  .card-item span:first-child {
    padding-right: 5px; /* Уменьшаем отступ у имени */
  }
  .forecast-display {
    gap: 2px; /* Сжимаем отступ в прогнозе */
  }
  .action-btn {
    font-size: 1em;
    gap: 6px;
  }
  .forecast-btn {
    font-size: 1.2em;
  }
  .filter-icon {
    width: 12px;
    height: 12px;
  }
}
/* === 🟢 КОНЕЦ ИЗМЕНЕНИЙ === */
</style>
