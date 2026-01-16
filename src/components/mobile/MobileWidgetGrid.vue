<script setup>
import { computed, ref } from 'vue';
import { useWidgetData } from '@/composables/useWidgetData.js';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import MobileWidgetCard from './MobileWidgetCard.vue';

const emit = defineEmits(['widget-click', 'widget-add', 'widget-edit']);
const mainStore = useMainStore();
const { getWidgetItems } = useWidgetData();

// --- Snapshot support for AI (mobile)
// We keep refs to rendered widget cards so we can ask them for snapshots.
const widgetRefMap = new Map();

const captureWidgetRef = (key, el) => {
  if (el) widgetRefMap.set(key, el);
  else widgetRefMap.delete(key);
};

const buildWidgetSnapshot = (key) => {
  const inst = widgetRefMap.get(key);
  // Prefer the widget card's own snapshot if it exposes one.
  const fromComponent = (typeof inst?.getSnapshot === 'function') ? inst.getSnapshot() : null;
  if (fromComponent) return fromComponent;

  // Fallback: include the widget key and its computed items (if available).
  // This keeps AI functional even if a specific widget card doesn't expose getSnapshot yet.
  let items = null;
  try {
    items = getWidgetItems(key);
  } catch (e) {
    items = null;
  }

  return {
    key,
    items
  };
};
// IMPORTANT: AI snapshot must include ALL widgets, even hidden ones!
// Mobile should match desktop behavior: use all available widget keys
const getAllWidgetKeysForSnapshot = () => {
  // Get all widget keys from store configuration
  const allKeys = (mainStore.allWidgets || []).map(w => w.key);
  
  // Filter out totals and placeholders (same as desktop)
  return allKeys.filter(
    key => key !== 'currentTotal' && key !== 'futureTotal' && !String(key).startsWith('placeholder_')
  );
};

const getSnapshot = () => {
  const ts = new Date().toISOString();
  const keys = getAllWidgetKeysForSnapshot();

  return {
    v: 1,
    ts,
    meta: {
      source: 'MobileWidgetGrid',
      platform: 'mobile',
      headerExpanded: Boolean(mainStore.isHeaderExpanded)
    },
    ui: {
      isHeaderExpanded: Boolean(mainStore.isHeaderExpanded)
    },
    widgets: keys.map(buildWidgetSnapshot).filter(Boolean)
  };
};

defineExpose({ getSnapshot });

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
             :ref="(el) => captureWidgetRef(element, el)"
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