<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v4.3 - MIRROR LAYOUT ---
 * * ВЕРСИЯ: 4.3 - Зеркальное отображение для "Будущего"
 * * ДАТА: 2025-11-29
 * * ЧТО ИЗМЕНЕНО:
 * 1. (LOGIC) Добавлен computed `isFuture` для определения типа карточки.
 * 2. (TEMPLATE) Логика отображения знака валюты (перед/после) в зависимости от типа.
 * 3. (CSS) Класс .is-mirrored для выравнивания по правому краю.
 */

const props = defineProps({
  title: { type: String, required: true },
  totalBalance: { type: Number, required: true },
  subtitlePrefix: { type: String, required: true },
  subtitleDate: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

// Определяем, является ли это карточкой "Всего (будущее)"
const isFuture = computed(() => props.widgetKey === 'futureTotal');

const formattedValue = computed(() => formatNumber(Math.abs(props.totalBalance)));
const sign = computed(() => props.totalBalance < 0 ? '-' : '');
</script>

<template>
  <div class="dashboard-card" :class="{ 'is-mirrored': isFuture }">
    <!-- card-drag-handle оставляем для перетаскивания -->
    <div class="card-title-container card-drag-handle">
      <div class="card-title">{{ title }}</div>
    </div>

    <div 
      class="card-total-balance"
      :class="{ 'expense': props.totalBalance < 0 }"
    >
      <!-- СЦЕНАРИЙ 1: Текущее (Обычный: Знак валюты СЛЕВА) -->
      <template v-if="!isFuture">
        <span class="currency-symbol">₸</span>&nbsp;{{ sign }}{{ formattedValue }}
      </template>

      <!-- СЦЕНАРИЙ 2: Будущее (Зеркальный: Знак валюты СПРАВА) -->
      <template v-else>
        {{ sign }}{{ formattedValue }}&nbsp;<span class="currency-symbol">₸</span>
      </template>
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
  /* По умолчанию выравнивание влево (align-items: flex-start - стандарт для div/flex-column, но уточним) */
  text-align: left;
}
.dashboard-card:last-child { border-right: none; padding-right: 0; }

/* 🟢 ЗЕРКАЛЬНЫЙ РЕЖИМ (ДЛЯ БУДУЩЕГО) */
.dashboard-card.is-mirrored {
  align-items: flex-end; /* Весь контент прижимаем вправо */
  text-align: right;     /* Текст внутри блоков тоже вправо */
}

/* При зеркальном режиме отступ справа убираем, добавляем слева (визуальная компенсация, если нужно, но в гриде padding-right задан глобально) 
   В данном случае паддинг самого контейнера dashboard-card задан глобально, мы меняем только выравнивание контента.
*/

.card-total-balance { 
  font-size: 1.8em; 
  font-weight: bold; 
  color: var(--color-heading); 
  margin-bottom: 0.25rem; 
  white-space: nowrap; 
}

.currency-symbol {
  font-weight: 400; /* Чуть тоньше цифр, чтобы не сливалось, или оставить bold */
  opacity: 0.8;
}

.card-sub-balance { font-size: 0.8em; color: #777; }
.card-sub-balance .subtitle-date { color: var(--color-primary); font-weight: 500; }

/* Стили контейнера заголовка (Drag Handle) */
.card-title-container { 
  min-height: 30px; 
  height: auto;
  margin-bottom: 0.5rem; 
  flex-shrink: 0; 
  cursor: grab; 
  position: relative; 
  display: flex;
  align-items: center; 
  width: 100%; /* Чтобы flex-end родителя работал корректно, контейнер должен быть на всю ширину, но контент внутри выравниваться */
}

/* 🟢 Выравнивание заголовка внутри контейнера */
.dashboard-card:not(.is-mirrored) .card-title-container {
  justify-content: flex-start;
}
.dashboard-card.is-mirrored .card-title-container {
  justify-content: flex-end;
}

.card-title-container:active { cursor: grabbing; }

.card-title { 
  font-size: 0.85em; 
  color: #aaa; 
  white-space: pre-line; 
  line-height: 1.3;
}

.card-total-balance.expense { color: var(--color-danger); }
</style>