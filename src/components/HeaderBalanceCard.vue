<script setup>
// 🔴 НОВОЕ: импортируем ref и computed (watch уже был)
import { ref, watch, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

// 🔴 НОВОЕ: Импортируем иконку фильтра
import filterIcon from '@/assets/filter-edit.svg';

/**
 * * --- МЕТКА ВЕРСИИ: v2.5-FONT-WEIGHT-FIX ---
 * * (с доработками для прогноза v1.0)
 * *
 * * ЧТО ДОБАВЛЕНО (Прогноз v1.0):\
 * 1. Добавлена кнопка прогноза `↗`.
 * 2. `showFutureBalance` теперь `computed` из `mainStore.dashboardForecastState`.
 * 3. В `<template>` `v-for` добавлена логика `v-if/v-else` для
 * отображения либо "Баланс", либо "Баланс > Будущий Баланс".
 * 4. Добавлены стили для `.forecast-btn`, `.active`, `.forecast-display`.
 */

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true }, // 🔴 Принимает item.balance и item.futureBalance
  emptyText: { type: String, default: "...нет..." },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true },
});

const mainStore = useMainStore();
const isDropdownOpen = ref(false);
const isFilterDropdownOpen = ref(false); // 🔴 НОВОЕ: Состояние для фильтра
const cardRef = ref(null);

// --- 🔴 НОВОЕ: Состояние фильтров ---
const filterState = computed(() => {
  if (props.widgetKey === 'balance_account') return mainStore.accountFilterState;
  if (props.widgetKey === 'balance_company') return mainStore.companyFilterState;
  if (props.widgetKey === 'balance_contractor') return mainStore.contractorFilterState;
  if (props.widgetKey === 'balance_project') return mainStore.projectFilterState;
  return 'all';
});

const setFilterState = (state) => {
  if (props.widgetKey === 'balance_account') mainStore.setAccountFilterState(state);
  if (props.widgetKey === 'balance_company') mainStore.setCompanyFilterState(state);
  if (props.widgetKey === 'balance_contractor') mainStore.setContractorFilterState(state);
  if (props.widgetKey === 'balance_project') mainStore.setProjectFilterState(state);
  isFilterDropdownOpen.value = false;
};
// ------------------------------------\

// --- 🔴 НОВОЕ: Прогноз (Forecast) ---
const showFutureBalance = computed(() => mainStore.dashboardForecastState === 'SHOW_FUTURE');
const toggleForecast = () => {
  mainStore.setForecastState(
    showFutureBalance.value ? 'SHOW_CURRENT' : 'SHOW_FUTURE'
  );
};
// ------------------------------------\

// --- 🔴 НОВОЕ: Поиск и фильтрация виджетов ---
const searchQuery = ref('');

// Список всех виджетов (Balance)
const allBalanceWidgets = computed(() => mainStore.widgetConfigs.filter(w => w.type === 'balance'));

const filteredWidgets = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return allBalanceWidgets.value;
  
  return allBalanceWidgets.value.filter(widget => 
    widget.name.toLowerCase().includes(query)
  );
});

// --- 🔴 НОВОЕ: Обработчик выбора виджета ---
const handleSelect = (newWidgetKey) => {
  if (newWidgetKey === props.widgetKey) {
    isDropdownOpen.value = false;
    return;
  }
  
  // Проверяем, не занят ли уже этот виджет другим местом
  const isWidgetUsed = mainStore.dashboardLayout.includes(newWidgetKey);
  if (isWidgetUsed) {
    // В этом случае просто не даем выбрать
    return;
  }

  // Замена виджета в хранилище
  mainStore.replaceWidget(props.widgetIndex, newWidgetKey);
  isDropdownOpen.value = false;
};
// ----------------------------------------------------\

// --- 🔴 НОВОЕ: Логика закрытия при клике вне карточки ---
const closeDropdownOnOutsideClick = (event) => {
  if (isDropdownOpen.value && cardRef.value && !cardRef.value.contains(event.target)) {
    isDropdownOpen.value = false;
  }
  // 🔴 Также закрываем фильтр
  if (isFilterDropdownOpen.value && cardRef.value && !cardRef.value.contains(event.target)) {
    isFilterDropdownOpen.value = false;
  }
};

// Регистрируем и отменяем слушатель
watch([isDropdownOpen, isFilterDropdownOpen], (newVals) => {
  const [isDDOpen, isFDOOpen] = newVals;
  if (isDDOpen || isFDOOpen) {
    document.addEventListener('click', closeDropdownOnOutsideClick);
  } else {
    document.removeEventListener('click', closeDropdownOnOutsideClick);
  }
});
// ----------------------------------------------------\

// --- 🔴 НОВОЕ: Динамический класс для цвета ---
const balanceClass = (balance) => {
  if (balance > 0) return 'balance-positive';
  if (balance < 0) return 'balance-negative';
  return 'balance-zero';
};
// ------------------------------------\
</script>

<template>
  <div class="dashboard-card" ref="cardRef"> 
    
    <div class="card-title-container" @click.stop="isDropdownOpen = !isDropdownOpen"> 
      <span class="card-title">{{ props.title }}</span>
      <span class="widget-dropdown-icon">▼</span>
    </div>

    <div class="card-content">
      <div v-if="props.items.length === 0" class="empty-display">
        {{ props.emptyText }}
      </div>
      
      <div v-else class="balance-list">
        <div v-for="item in props.items" :key="item.id" class="balance-item">
          <span class="item-name">{{ item.name }}</span>
          
          <div class="balance-values">
            <span :class="['balance-display', balanceClass(item.balance)]">
              {{ formatNumber(item.balance) }}
            </span>
            
            <span 
              v-if="showFutureBalance" 
              :class="['forecast-display', balanceClass(item.futureBalance)]"
            >
              / {{ formatNumber(item.futureBalance) }}
            </span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="card-actions">
      <button 
        :class="['forecast-btn', { 'active': showFutureBalance }]"
        @click="toggleForecast"
      >
        ↗
      </button>
      
      <button 
        :class="['filter-btn', { 'active': filterState !== 'all' }]"
        @click.stop="isFilterDropdownOpen = !isFilterDropdownOpen"
      >
        <img :src="filterIcon" alt="Filter" class="filter-icon" />
      </button>
    </div>

    <div v-if="isDropdownOpen" class="widget-dropdown" @click.stop>
      
      <input 
        type="text" 
        v-model="searchQuery" 
        placeholder="Поиск..." 
        class="widget-search-input"
        @click.stop
      />
      
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
    
    <div v-if="isFilterDropdownOpen" class="filter-dropdown" @click.stop>
      <div class="filter-group-title">Фильтр баланса</div>
      <ul>
        <li 
          :class="{ 'active': filterState === 'all' }"
          @click="setFilterState('all')"
        >
          Все
        </li>
        <li 
          :class="{ 'active': filterState === 'positive' }"
          @click="setFilterState('positive')"
        >
          Положительный
        </li>
        <li 
          :class="{ 'active': filterState === 'negative' }"
          @click="setFilterState('negative')"
        >
          Отрицательный
        </li>
        <li 
          :class="{ 'active': filterState === 'zero' }"
          @click="setFilterState('zero')"
        >
          Нулевой
        </li>
      </ul>
    </div>
    
  </div>
</template>

<style scoped>
/* ================================================= */
/* Стили карточки                                    */
/* ================================================= */
.dashboard-card {
  /* 🔴 ИСПРАВЛЕНИЕ v4.1: Теперь flex-shrink: 1 (вместо 0) */
  flex-shrink: 1; /* Разрешаем сжиматься, если не хватает места */
  background-color: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  position: relative; /* Для позиционирования дропдаунов */
  min-width: 150px;
  max-width: 300px;
}

/* ================================================= */
/* Заголовок + кнопка                                */
/* ================================================= */
.card-title-container {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  margin-bottom: 8px; /* Добавил отступ */
}
.card-title {
  font-size: 0.8em;
  font-weight: 500;
  color: var(--color-text-secondary); /* Серый */
  text-transform: uppercase;
}
.widget-dropdown-icon {
  font-size: 0.6em;
  color: var(--color-text-secondary);
  transition: transform 0.2s;
}
.card-title-container:hover .widget-dropdown-icon {
  color: var(--color-link);
}


/* ================================================= */
/* Основное содержимое (Список счетов/компаний)      */
/* ================================================= */
.card-content {
  /* 🔴 ИСПРАВЛЕНИЕ: Уменьшаем внутренний отступ */
  /* margin-bottom: 12px; */
  max-height: 180px; /* Чтобы ограничить размер карточки */
  overflow-y: auto; /* Добавляем скролл */
  padding-bottom: 8px;
}
.empty-display {
  font-size: 0.9em;
  color: #888;
  padding: 10px 0;
  text-align: center;
}
.balance-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.balance-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.item-name {
  font-size: 0.85em;
  font-weight: 500;
  color: var(--color-text);
  margin-right: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.balance-values {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.balance-display {
  font-size: 0.85em;
  font-weight: 700;
  line-height: 1.2;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* --- Прогноз v1.0: Стили для баланса --- */
.forecast-display {
  font-size: 0.85em;
  font-weight: 500;
  line-height: 1.2;
  margin-left: 4px;
  opacity: 0.7; /* Сделать будущий баланс чуть бледнее */
  text-align: right;
}
/* --- */
.balance-positive { color: var(--color-positive); }
.balance-negative { color: var(--color-negative); }
.balance-zero { color: var(--color-text); }


/* ================================================= */
/* Действия (Actions)                                */
/* ================================================= */
.card-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
  gap: 8px;
  /* 🔴 ИСПРАВЛЕНИЕ: Добавлено позиционирование */
  position: relative; /* Для правильного z-index дропдаунов */
  z-index: 100; /* Должен быть выше основного списка balance-list */
}

/* --- Кнопки действий (Фильтр и Прогноз) --- */
.forecast-btn, .filter-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: 600;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}
.forecast-btn:hover, .filter-btn:hover {
  background-color: #eee;
}
.forecast-btn.active {
  color: var(--color-link); /* Активный цвет как у "Создать" */
}
.filter-btn.active {
  color: var(--color-link); /* Активный цвет как у "Создать" */
}

.filter-icon {
  width: 14px;
  height: 14px;
  /* 🔴 НОВОЕ: Стили для SVG */
  filter: grayscale(100%) brightness(1.5);
  display: block; /* Убрать лишние пробелы */
}
.filter-btn.active .filter-icon {
  /* Убрать фильтр, чтобы иконка была цветной */
  filter: none; 
}


/* ================================================= */
/* Выпадающий список виджетов (Dropdown - Смена типа)*/
/* ================================================= */
.widget-dropdown {
  position: absolute;
  top: 100%; /* Позиционируем под карточкой */
  right: 0;
  width: 100%;
  max-width: 250px;
  min-width: 200px;
  background-color: #fcfcfc;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 200; /* Должен быть выше всех карточек */
  
  /* 🔴 НОВОЕ: Внутренний скролл */
  max-height: 300px;
  display: flex;
  flex-direction: column;
  
  /* 🔴 НОВОЕ: Отступы (отличны от TotalCard) */
  padding: 8px;
  transform: translateY(4px); /* Небольшой отступ от карточки */
}

/* --- Поле поиска --- */
.widget-search-input {
  height: 32px;
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
  color: #007AFF; /* (Цвет как у "Создать") */
  background-color: #e0e0e0;
}
.widget-dropdown li.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  text-decoration: line-through;
}


/* ================================================= */
/* Выпадающий список фильтров (Dropdown - Фильтр)    */
/* ================================================= */
.filter-dropdown {
  position: absolute;
  /* top: 100%; <- Старая позиция */
  bottom: 100%; /* 🔴 НОВАЯ ПОЗИЦИЯ: Над карточкой */
  right: 0;
  width: 100%;
  max-width: 200px;
  background-color: #fcfcfc;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 150; /* Ниже чем .widget-dropdown (200) и выше чем .card-actions (100) */
  padding: 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transform: translateY(-4px); /* Небольшой отступ от карточки */
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
</style>
