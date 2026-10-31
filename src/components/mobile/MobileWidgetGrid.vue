<script setup>
import { computed, ref } from 'vue';

import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import OverviewWidget from '../OverviewWidget.vue';
import WidgetPicker from '../WidgetPicker.vue';
import { OVERVIEW_WIDGET_KEYS } from '@/utils/dashboardWidgets.js';
import MobileWidgetCard from './MobileWidgetCard.vue';

const emit = defineEmits(['widget-click', 'widget-add', 'widget-edit', 'edit-operation']);
const mainStore = useMainStore();



const showSettings = ref(false);
defineExpose({ openSettings: () => { showSettings.value = true; } });
const gridWidgets = computed({
  get: () => mainStore.isHeaderExpanded ? mainStore.dashboardLayout : [],
  set: order => { mainStore.dashboardLayout = order; }
});

const handleWidgetClick = (key) => {
  emit('widget-click', key);
};
</script>

<template>
  <div class="mobile-widgets-wrapper scroll-touch" :class="{ expanded: mainStore.isHeaderExpanded }">
    <div v-if="mainStore.isHeaderExpanded" class="mobile-overview-heading"><span>Обзор</span><button type="button" @click="showSettings = true">Настроить виджеты</button></div>
    <WidgetPicker v-if="showSettings" @close="showSettings = false" />
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
          <OverviewWidget v-if="OVERVIEW_WIDGET_KEYS.includes(element)" :widget-key="element" mobile @open="handleWidgetClick(element)" @manage="showSettings = true" @edit-operation="emit('edit-operation', $event)" />
          <MobileWidgetCard v-else
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
.mobile-overview-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 12px; color: var(--color-text); font-size: 14px; font-weight: 600; }
.mobile-overview-heading button { padding: 7px 10px; font-size: 12px; background: var(--btn-widget-bg); color: var(--btn-widget-color); border: 1px solid var(--color-border); border-radius: 6px; }
.grid-item { padding: 6px 12px; }
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