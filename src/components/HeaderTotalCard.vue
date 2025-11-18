<script setup>
// 🔴 НОВОЕ: импортируем ref и computed (и nextTick)
import { ref, watch, computed, nextTick } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v2.8 - FIX DROPDOWN CLOSURE ---
 * * ВЕРСИЯ: 2.8 - Исправлено закрытие выпадающего списка по клику вне компонента
 * ДАТА: 2025-11-18
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (FIX) Добавлена более надежная проверка в `handleClickOutside` для корректного закрытия
 * меню выбора виджета при клике в любом месте экрана вне карточки.
 * 2. (REFACTOR) Улучшено логирование.
 */

// 🔴 НОВАЯ УСТАНОВКА: ЛОГИРОВАНИЕ
console.log('--- HeaderTotalCard.vue v2.8 (Fix Dropdown Closure) ЗАГРУЖЕН ---');

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

// =================================================================
// --- 🔴 ИСПРАВЛЕНИЕ (FIX #13a): Проваливающийся клик ---
// =================================================================
const handleSelect = (newWidgetKey) => {
  // 🔴 ЛОГИРОВАНИЕ
  console.log(`[HeaderTotalCard] handleSelect: Выбран виджет ${newWidgetKey}`);
  
  // 1. Меняем виджет в store
  mainStore.replaceWidget(props.widgetIndex, newWidgetKey);
  
  // 2. 🔴 ИСПРАВЛЕНИЕ:
  // Мы ждем, пока Vue "отпустит" текущий event loop,
  // чтобы `@click.stop` успел 100% отработать.
  nextTick(() => {
    isDropdownOpen.value = false;
    console.log('[HeaderTotalCard] handleSelect: (nextTick) Дропдаун закрыт');
  });
};
// =================================================================

// --- !!! ГЛАВНАЯ ЛОГИКА ЗАКРЫТИЯ (Fix Dropdown Closure) !!! ---
const handleClickOutside = (event) => {
  // Проверяем, был ли клик СНАРУЖИ этого компонента
  if (cardRef.value && !cardRef.value.contains(event.target)) {
    // 🔴 ЛОГИРОВАНИЕ
    console.log('[HeaderTotalCard] handleClickOutside: Клик снаружи, закрываю дропдаун');
    isDropdownOpen.value = false; // Закрываем меню
  }
};

// "Наблюдаем" за состоянием меню
watch(isDropdownOpen, (isOpen) => {
  if (isOpen) {
    // 🔴 ЛОГИРОВАНИЕ
    console.log('[HeaderTotalCard] watch: Дропдаун ОТКРЫТ');
    searchQuery.value = ''; 
    document.addEventListener('mousedown', handleClickOutside);
  } else {
    // 🔴 ЛОГИРОВАНИЕ
    console.log('[HeaderTotalCard] watch: Дропдаун ЗАКРЫТ');
    document.removeEventListener('mousedown', handleClickOutside);
  }
});
// --- КОНЕЦ ЛОГИКИ ЗАКРЫТИЯ ---

const toggleDropdown = () => {
  // 🔴 ЛОГИРОВАНИЕ
  console.log('[HeaderTotalCard] toggleDropdown: Клик по заголовку');
  isDropdownOpen.value = !isDropdownOpen.value;
};

</script>

<template>
  <div class="dashboard-card" ref="cardRef">
    
    <div 
      class="card-title-container" 
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

    <div 
      class="card-total-balance"
      :class="{
        'expense': props.totalBalance < 0
      }"
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
/* Стили карточки (без изменений) */
.dashboard-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-right: 1.5rem;
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

/* === 🟢 НАЧАЛО ИЗМЕНЕНИЙ (ШРИФТЫ ДЛЯ ПЛАНШЕТА) === */
@media (max-height: 900px) {
  .dashboard-card {
    min-width: 100px; /* Уменьшаем мин. ширину */
    padding-right: 1rem; /* Уменьшаем отступ */
  }
  .card-total-balance {
    font-size: 1.5em; /* Уменьшаем главный шрифт */
  }
  .card-sub-balance {
    font-size: 0.75em; /* И подпись */
  }
  .card-title {
    font-size: 0.8em;
  }
}
/* === 🟢 КОНЕЦ ИЗМЕНЕНИЙ === */
</style>
