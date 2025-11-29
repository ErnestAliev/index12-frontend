<script setup>
import { computed } from 'vue';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import MobileWidgetCard from './MobileWidgetCard.vue';

const emit = defineEmits(['widget-click', 'widget-add', 'widget-edit']);
const mainStore = useMainStore();

const gridWidgets = computed({
  get: () => {
    let layout = mainStore.dashboardLayout || [];
    // Фильтруем технические виджеты (тоталы и плейсхолдеры)
    layout = layout.filter(key => key !== 'currentTotal' && key !== 'futureTotal' && !key.startsWith('placeholder_'));
    
    // Если хедер свернут, показываем только первые 4
    if (!mainStore.isHeaderExpanded) {
      return layout.slice(0, 4); 
    }
    // Если развернут — показываем всё
    return layout;
  },
  set: (newOrder) => {
    // При изменении порядка сохраняем скрытые элементы на своих местах (в конце списка или как было задумано логикой)
    const hidden = mainStore.dashboardLayout.filter(key => key === 'currentTotal' || key === 'futureTotal' || key.startsWith('placeholder_') || !newOrder.includes(key));
    mainStore.dashboardLayout = [...newOrder, ...hidden];
  }
});

const handleWidgetClick = (key) => {
  emit('widget-click', key);
};
</script>

<template>
  <div class="mobile-widgets-wrapper" :class="{ expanded: mainStore.isHeaderExpanded }">
    <!-- 
      🟢 FIX: Настройки для Drag-and-Drop на мобильных 
      delay="300" — задержка 300мс (долгое нажатие) для начала перетаскивания.
      delay-on-touch-only="true" — задержка работает только на тач-экранах.
      touch-start-threshold="5" — допуск смещения пальца (чтобы не срывалось при дрожи).
      Убран проп handle=".widget-title", теперь можно тянуть за весь виджет.
    -->
    <draggable 
      v-model="gridWidgets" 
      item-key="toString"
      class="widgets-grid"
      ghost-class="ghost"
      drag-class="drag-item"
      :delay="300" 
      :delay-on-touch-only="true"
      :touch-start-threshold="5"
      :animation="200"
      :force-fallback="false"
    >
      <template #item="{ element }">
        <div class="grid-item">
          <MobileWidgetCard 
             :widget-key="element" 
             @click="handleWidgetClick"
             @add="emit('widget-add', element)"
             @edit="emit('widget-edit', element)"
          />
        </div>
      </template>
    </draggable>
  </div>
</template>

<style scoped>
.mobile-widgets-wrapper {
  background-color: var(--color-background, #1a1a1a);
  border-bottom: 1px solid var(--color-border, #444);
  
  display: block; 
  flex-shrink: 0;
  
  /* 🟢 FIX: Включаем нативную инерционную прокрутку для iOS */
  overflow-y: auto; 
  -webkit-overflow-scrolling: touch; 
  overscroll-behavior: contain; 
  
  /* Исправление для Safari Flexbox bug */
  min-height: 0;
  
  transition: all 0.3s ease;
  scrollbar-width: none; 
}
.mobile-widgets-wrapper::-webkit-scrollbar { display: none; }

.widgets-grid {
  display: grid;
  grid-template-columns: 1fr 1fr; /* Две колонки */
  gap: 1px;
  background-color: var(--color-border, #444);
  padding: 1px 0;
  /* Растягиваем контент, чтобы скролл понимал размеры */
  min-height: min-content; 
  padding-bottom: 1px; 
}

.grid-item {
  background-color: var(--color-background-soft, #282828);
  min-width: 0;
  height: 90px;
  /* 🟢 FIX: Запрет выделения текста при долгом нажатии для драга */
  user-select: none;
  -webkit-user-select: none;
}

.ghost {
  opacity: 0.5;
  background: #333;
}

.drag-item {
  opacity: 1;
  background: #444;
  box-shadow: 0 10px 20px rgba(0,0,0,0.5);
  z-index: 9999;
}
</style>