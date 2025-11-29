<script setup>
import { computed } from 'vue';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import MobileWidgetCard from './MobileWidgetCard.vue';

const mainStore = useMainStore();

// Фильтруем виджеты (убираем Total-ы, т.к. они в хедере)
const gridWidgets = computed({
  get: () => {
    let layout = mainStore.dashboardLayout || [];
    layout = layout.filter(key => key !== 'currentTotal' && key !== 'futureTotal' && !key.startsWith('placeholder_'));

    if (!mainStore.isHeaderExpanded) {
      return layout.slice(0, 4); // Показываем 4 виджета (2 строки по 2)
    }
    return layout;
  },
  set: (newOrder) => {
    // Простое обновление (для полноценной синхронизации с десктопом нужна сложная логика слияния)
    // Сейчас просто сохраняем порядок
    const hidden = mainStore.dashboardLayout.filter(key => key === 'currentTotal' || key === 'futureTotal' || key.startsWith('placeholder_') || !newOrder.includes(key));
    mainStore.dashboardLayout = [...newOrder, ...hidden];
  }
});

const toggleExpand = () => {
  mainStore.toggleHeaderExpansion();
};
</script>

<template>
  <div class="mobile-widgets-wrapper">
    <!-- 2. Драг-н-Дроп Сетка -->
    <draggable 
      v-model="gridWidgets" 
      item-key="toString"
      class="widgets-grid"
      ghost-class="ghost"
      handle=".widget-header" 
      :animation="200"
    >
      <template #item="{ element }">
        <div class="grid-item">
          <MobileWidgetCard :widget-key="element" />
        </div>
      </template>
    </draggable>

    <!-- 3. Кнопка расширения ВНИЗУ по центру -->
    <div class="expand-control">
      <button 
        class="expand-btn" 
        :class="{ active: mainStore.isHeaderExpanded }"
        @click="toggleExpand"
      >
        <!-- Точка (свернуто) или Линия (развернуто) как индикатор -->
        <div class="indicator-dot" v-if="!mainStore.isHeaderExpanded"></div>
        <div class="indicator-line" v-else></div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mobile-widgets-wrapper {
  background-color: var(--color-background, #1a1a1a);
  border-bottom: 1px solid var(--color-border, #444);
  display: flex;
  flex-direction: column;
  /* Адаптивная высота: если свернуто - занимает меньше места, развернуто - больше */
  flex-shrink: 0; 
}

.widgets-grid {
  display: grid;
  grid-template-columns: 1fr 1fr; /* 2 колонки */
  gap: 1px; /* Тонкие разделители */
  background-color: var(--color-border, #444); /* Цвет линий сетки */
  padding: 1px;
}

.grid-item {
  background-color: var(--color-background-soft, #282828);
  min-width: 0;
  /* 4. Высота блока адаптивная, но фиксированная для ряда */
  height: 120px; 
}

.expand-control {
  height: 16px; /* Очень узкая полоска снизу */
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--color-background-soft, #282828);
  border-top: 1px solid var(--color-border, #444);
  cursor: pointer;
}

.expand-btn {
  background: none;
  border: none;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0;
  cursor: pointer;
}

.indicator-dot {
  width: 6px;
  height: 6px;
  background-color: #666;
  border-radius: 50%;
}

.indicator-line {
  width: 20px;
  height: 2px;
  background-color: #666;
}

.ghost {
  opacity: 0.5;
  background: #333;
}
</style>