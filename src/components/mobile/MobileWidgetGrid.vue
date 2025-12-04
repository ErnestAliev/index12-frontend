<script setup>
import { computed } from 'vue';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import MobileWidgetCard from './MobileWidgetCard.vue';

const emit = defineEmits(['widget-click', 'widget-add', 'widget-edit']);
const mainStore = useMainStore();

const gridWidgets = computed({
  get: () => {
    let layout = [...mainStore.dashboardLayout];
    const allKeys = mainStore.allWidgets.map(w => w.key);
    
    allKeys.forEach(key => {
        if (!layout.includes(key)) {
            layout.push(key);
        }
    });

    layout = layout.filter(key => key !== 'currentTotal' && key !== 'futureTotal' && !key.startsWith('placeholder_'));
    
    if (!mainStore.isHeaderExpanded) {
      return []; 
    }
    
    return layout;
  },
  set: (newOrder) => {
    const currentLayout = mainStore.dashboardLayout;
    const hidden = currentLayout.filter(key => key === 'currentTotal' || key === 'futureTotal' || key.startsWith('placeholder_'));
    mainStore.dashboardLayout = [...newOrder, ...hidden];
  }
});

const handleWidgetClick = (key) => {
  emit('widget-click', key);
};
</script>

<template>
  <div class="mobile-widgets-wrapper scroll-touch" :class="{ expanded: mainStore.isHeaderExpanded }">
    <draggable 
      v-model="gridWidgets" 
      item-key="toString"
      class="widgets-grid"
      ghost-class="ghost"
      drag-class="drag-item"
      :delay="300" 
      :delay-on-touch-only="true"
      :touch-start-threshold="5"
      :fallback-tolerance="5" 
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
  
  overflow-y: auto; 
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch; 
  overscroll-behavior: contain; 
  
  min-height: 0;
  
  scrollbar-width: none; 
}
.mobile-widgets-wrapper::-webkit-scrollbar { display: none; }

.widgets-grid {
  display: grid;
  /* 🟢 ИЗМЕНЕНО: 1 колонка вместо 2 */
  grid-template-columns: 1fr; 
  gap: 1px;
  background-color: var(--color-border, #444);
  padding: 1px 0;
  
  height: auto;
  min-height: 100%;
  padding-bottom: 1px; 
}

.grid-item {
  background-color: var(--color-background-soft, #282828);
  min-width: 0;
  /* 🟢 ИЗМЕНЕНО: Высота увеличена до 150px */
  height: 150px;
  user-select: none;
  -webkit-user-select: none;
  touch-action: pan-y;
}

/* 🟢 LANDSCAPE MODE: Оставляем или корректируем */
@media (orientation: landscape) {
  .grid-item {
    height: 150px; /* Фиксируем и здесь */
  }
  /* Опционально можно вернуть 2 колонки в ландшафте, если нужно:
  .widgets-grid { grid-template-columns: 1fr 1fr; } 
  */
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