<script setup>
import { computed } from 'vue';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import MobileWidgetCard from './MobileWidgetCard.vue';

// 🟢 Добавлены события widget-add, widget-edit
const emit = defineEmits(['widget-click', 'widget-add', 'widget-edit']);

const mainStore = useMainStore();

const gridWidgets = computed({
  get: () => {
    let layout = mainStore.dashboardLayout || [];
    layout = layout.filter(key => key !== 'currentTotal' && key !== 'futureTotal' && !key.startsWith('placeholder_'));
    
    if (!mainStore.isHeaderExpanded) {
      return layout.slice(0, 4); 
    }
    return layout;
  },
  set: (newOrder) => {
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
    <draggable 
      v-model="gridWidgets" 
      item-key="toString"
      class="widgets-grid"
      ghost-class="ghost"
      handle=".widget-title" 
      :delay="200" 
      :delay-on-touch-only="true"
      :touch-start-threshold="5"
      :animation="200"
    >
      <template #item="{ element }">
        <div class="grid-item">
          <!-- 🟢 Пробрасываем события Add/Edit -->
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
  
  /* 🟢 FIX: Safari Scroll */
  display: block; /* Убираем flex, чтобы избежать багов скролла в Safari */
  flex-shrink: 0;
  transition: all 0.3s ease;
  
  /* Настройки скролла */
  overflow-y: auto; 
  -webkit-overflow-scrolling: touch; /* Инерция для iOS */
  touch-action: pan-y; /* Явное указание браузеру на вертикальный скролл */
  
  /* Скрываем скроллбар */
  scrollbar-width: none; 
}
.mobile-widgets-wrapper::-webkit-scrollbar { display: none; }

.widgets-grid {
  display: grid;
  grid-template-columns: 1fr 1fr; /* 2 колонки */
  gap: 1px;
  background-color: var(--color-border, #444);
  padding: 1px 0;
  /* Гарантируем, что контент внутри растягивается корректно */
  min-height: min-content; 
}

.grid-item {
  background-color: var(--color-background-soft, #282828);
  min-width: 0;
  height: 90px;
}

.ghost {
  opacity: 0.5;
  background: #333;
}
</style>