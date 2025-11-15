<script setup>
// 🔴 НОВОЕ: импортируем ref и computed
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
  totalBalance: { type: Number, required: true },
  // --- 🔴 ИСПРАВЛЕНИЕ: (Props) ---
  subtitlePrefix: { type: String, required: true },
  subtitleDate: { type: String, required: true },
  // ---\
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const mainStore = useMainStore();
const isDropdownOpen = ref(false);
const cardRef = ref(null);

// --- 🔴 НОВОЕ: Логика закрытия при клике вне карточки ---
const closeDropdownOnOutsideClick = (event) => {
  if (isDropdownOpen.value && cardRef.value && !cardRef.value.contains(event.target)) {
    isDropdownOpen.value = false;
  }
};
// Регистрируем и отменяем слушатель
watch(isDropdownOpen, (newVal) => {
  if (newVal) {
    document.addEventListener('click', closeDropdownOnOutsideClick);
  } else {
    document.removeEventListener('click', closeDropdownOnOutsideClick);
  }
});
// ----------------------------------------------------\

// --- 🔴 НОВОЕ: Поиск и фильтрация виджетов ---
const searchQuery = ref('');

// Список всех виджетов (Total)
const allTotalWidgets = computed(() => mainStore.widgetConfigs.filter(w => w.type === 'total'));

const filteredWidgets = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return allTotalWidgets.value;
  
  return allTotalWidgets.value.filter(widget => 
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
    // В отличие от Balance/Category, Total не может быть занят
    // но на всякий случай оставим проверку, если логика изменится
    return;
  }

  // Замена виджета в хранилище
  mainStore.replaceWidget(props.widgetIndex, newWidgetKey);
  isDropdownOpen.value = false;
};
// ----------------------------------------------------\

// --- 🔴 НОВОЕ: Динамический класс для цвета ---
const balanceClass = computed(() => {
  if (props.totalBalance > 0) return 'balance-positive';
  if (props.totalBalance < 0) return 'balance-negative';
  return 'balance-zero';
});
</script>

<template>
  <div class="dashboard-card" ref="cardRef"> 
    
    <div class="card-title-container" @click.stop="isDropdownOpen = !isDropdownOpen">
      <span class="card-title">{{ props.title }}</span>
      <span class="widget-dropdown-icon">▼</span>
    </div>

    <div class="card-content">
      <div :class="['balance-display', balanceClass]">
        {{ formatNumber(props.totalBalance) }}
      </div>
    </div>
    
    <div class="card-subtitle">
      {{ props.subtitlePrefix }} <span class="card-subtitle-date">{{ props.subtitleDate }}</span>
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
          :class="{ 'active': widget.key === props.widgetKey }"
          @click.stop="handleSelect(widget.key)"
        >
          {{ widget.name }}
        </li>
      </ul>
    </div>
    
  </div>
</template>

<style scoped>
/* ================================================= */
/* Стили карточки (Идентично HeaderBalanceCard)     */
/* ================================================= */
.dashboard-card {
  /* 🔴 ИСПРАВЛЕНИЕ v4.1: Теперь flex-shrink: 1 (вместо 0) */
  flex-shrink: 1; /* Разрешаем сжиматься, если не хватает места */
  background-color: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  position: relative; /* Для позиционирования дропдауна */
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
/* Основное содержимое                               */
/* ================================================= */
.card-content {
  margin-bottom: 12px;
}
.balance-display {
  font-size: 1.8em;
  font-weight: 700;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.balance-positive { color: var(--color-positive); }
.balance-negative { color: var(--color-negative); }
.balance-zero { color: var(--color-text); }


/* ================================================= */
/* Подзаголовок (Дата/Период)                        */
/* ================================================= */
.card-subtitle {
  font-size: 0.7em;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  font-weight: 500;
  line-height: 1.2;
}
.card-subtitle-date {
  font-weight: 600;
  color: var(--color-text);
}


/* ================================================= */
/* Выпадающий список виджетов (Dropdown)             */
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
  
  /* 🔴 НОВОЕ: Отступы (отличны от BalanceCard) */
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
</style>
