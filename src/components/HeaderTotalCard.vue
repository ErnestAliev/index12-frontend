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
  // ---
  widgetKey: { type: String, required: true },
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

const handleSelect = (newWidgetKey) => {
  mainStore.replaceWidget(props.widgetIndex, newWidgetKey);
  isDropdownOpen.value = false;
};

// --- !!! НОВАЯ ЛОГИКА: Клик снаружи !!! ---
const handleClickOutside = (event) => {
  // 3. Проверяем, был ли клик СНАРУЖИ этого компонента
  if (cardRef.value && !cardRef.value.contains(event.target)) {
    isDropdownOpen.value = false; // Закрываем меню
  }
};

// 4. "Наблюдаем" за состоянием меню
watch(isDropdownOpen, (isOpen) => {
  if (isOpen) {
    // 🔴 НОВОЕ: Очищаем поиск при открытии
    searchQuery.value = ''; 
    document.addEventListener('mousedown', handleClickOutside);
  } else {
    document.removeEventListener('mousedown', handleClickOutside);
  }
});
// --- КОНЕЦ НОВОЙ ЛОГИКИ ---

</script>

<style scoped>
/* Стили карточки (без изменений) */
.dashboard-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-right: 1.5rem; /* Базовый отступ */
  border-right: 1px solid var(--color-border);
  /* min-width: 150px; (🟢 УДАЛЕНО: Позволяем карточке сжиматься) */
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

/* (Стиль даты v2.2) */
.card-sub-balance .subtitle-date {
  color: var(--color-primary); /* Зеленый */
  font-weight: 500;
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

/* (Стили для +/- v2.1) */
.card-total-balance.expense {
  color: var(--color-danger); /* Красный/Оранжевый */
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

/* === 🟢 НАЧАЛО ИЗМЕНЕНИЙ (ШРИФТЫ ДЛЯ ПЛАНШЕТА v2.12) === */
@media (max-height: 900px) {
  .dashboard-card {
    min-width: 100px; 
    padding-right: 0.8rem; /* Чуть меньше отступ */
  }
  .card-total-balance {
    font-size: 1.4em; /* Агрессивное уменьшение */
  }
  .card-sub-balance {
    font-size: 0.7em; /* Агрессивное уменьшение */
  }
  .card-title {
    font-size: 0.75em;
  }
}

/* 🔴 ИЗМЕНЕНИЕ (v2.12): Адаптация под ширину (960px - 1200px) */
@media (max-width: 1200px) {
  /* 🔴 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Даем минимальную ширину и убираем padding-right */
  .dashboard-card {
      min-width: 140px !important;
      padding-right: 0.4rem; 
  }
  .card-total-balance {
    font-size: 1.4em; /* Уменьшаем основной шрифт */
  }
  .card-sub-balance {
    /* 🔴 САМЫЙ КРИТИЧЕСКИЙ ШАГ: Максимальное сжатие, чтобы избежать переноса строки и схлопывания */
    font-size: 0.4em; /* ГАРАНТИРОВАННОЕ УМЕНЬШЕНИЕ до 0.4em */
  }
  .card-title {
    font-size: 0.7em;
  }
}
/* === 🟢 КОНЕЦ ИЗМЕНЕНИЙ === */
</style>
