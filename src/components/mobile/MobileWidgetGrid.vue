<script setup>
import { computed } from 'vue';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import MobileWidgetCard from './MobileWidgetCard.vue';

const emit = defineEmits(['widget-click', 'widget-add', 'widget-edit']);
const mainStore = useMainStore();

const gridWidgets = computed({
  get: () => {
    // 🟢 FIX: Используем allWidgets, чтобы показать ВСЕ доступные виджеты,
    // а не только те, что добавлены на дашборд (dashboardLayout).
    // Если нужно сохранить пользовательский порядок, то логика должна быть сложнее (merge layout + rest),
    // но для "увидеть все" берем исходный список.
    
    // Однако, если мы хотим использовать draggable для сортировки, нам всё же нужен dashboardLayout.
    // Если проблема была в том, что в layout не все виджеты, то это вопрос к store.
    
    // Но давайте сделаем гибрид: берем layout, и если там чего-то нет из allWidgets, добавляем в конец.
    
    let layout = [...mainStore.dashboardLayout];
    const allKeys = mainStore.allWidgets.map(w => w.key);
    
    // Добавляем недостающие виджеты (которых нет в layout)
    allKeys.forEach(key => {
        if (!layout.includes(key)) {
            layout.push(key);
        }
    });

    // Фильтруем системные
    layout = layout.filter(key => key !== 'currentTotal' && key !== 'futureTotal' && !key.startsWith('placeholder_'));
    
    // В свернутом виде — пусто (только шапка)
    if (!mainStore.isHeaderExpanded) {
      return []; 
    }
    
    return layout;
  },
  set: (newOrder) => {
    // При изменении порядка обновляем dashboardLayout
    // Сохраняем системные виджеты, которые могли быть отфильтрованы
    const currentLayout = mainStore.dashboardLayout;
    const hidden = currentLayout.filter(key => key === 'currentTotal' || key === 'futureTotal' || key.startsWith('placeholder_'));
    
    // Если в newOrder есть виджеты, которых не было в dashboardLayout (мы их добавили в get),
    // то теперь они сохранятся в layout.
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
  grid-template-columns: 1fr 1fr;
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
  height: 90px;
  user-select: none;
  -webkit-user-select: none;
  touch-action: pan-y;
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