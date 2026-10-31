<script setup>
import { computed } from 'vue';

import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import { useWidgetData } from '@/composables/useWidgetData.js';
import MobileWidgetCard from './MobileWidgetCard.vue';

const emit = defineEmits(['widget-click', 'widget-add', 'widget-edit']);
const mainStore = useMainStore();
const { getWidgetItems } = useWidgetData();
const supportedKeys = computed(() => new Set(mainStore.allWidgets.map(widget => widget.key).filter(key => key !== 'currentTotal' && key !== 'futureTotal')));

const gridWidgets = computed({
  get: () => {
    if (!mainStore.isHeaderExpanded) return [];
    const layout = [...new Set([...mainStore.dashboardLayout, ...supportedKeys.value])];
    return layout.filter(key => supportedKeys.value.has(key)
      && (getWidgetItems(key, false)?.length || getWidgetItems(key, true)?.length));
  },
  set: (newOrder) => {
    const currentLayout = mainStore.dashboardLayout;
    const visible = new Set(gridWidgets.value);
    const hidden = currentLayout.filter(key => !visible.has(key));
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
        <div class="grid-item" :data-widget-key="element">
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
  grid-template-columns: 1fr; 
  
  background-color: transparent; 
  
  height: auto;
  min-height: 100%;
}

.grid-item {
  background-color: transparent;
  min-width: 0;
  /* 🟢 ИЗМЕНЕНО: Убрана фиксированная высота 240px, теперь auto */
  height: auto; 
  user-select: none;
  -webkit-user-select: none;
  touch-action: pan-y;
}

@media (orientation: landscape) {
  /* В ландшафте можно сделать 2 колонки, если экран широкий */
  .widgets-grid {
     grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  }
}

.ghost {
  opacity: 0.5;
  background: #333;
  border-radius: 8px;
}

.drag-item {
  opacity: 1;
  background: #444;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  z-index: 9999;
  border-radius: 8px;
}
</style>
