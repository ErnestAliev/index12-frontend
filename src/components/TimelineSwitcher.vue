<script setup>
import { ref, computed } from 'vue';

const emit = defineEmits(['change-timeline-width', 'expand-charts-max', 'collapse-charts-max', 'center-charts']);

const timelineWidths = ['12d', '1m', '3m', '6m', '1y'];
const currentIndex = ref(0);

const currentWidth = computed(() => timelineWidths[currentIndex.value]);
const isPanelOpen = ref(false);

const openPanel = () => { isPanelOpen.value = true; };
const closePanel = () => { isPanelOpen.value = false; };
const ensureOpen = () => { if (!isPanelOpen.value) isPanelOpen.value = true; };

const changeWidth = (direction) => {
  ensureOpen();
  console.log(`[TimelineSwitcher] changeWidth called with direction: ${direction}, currentIndex: ${currentIndex.value}`);
  const newIndex = currentIndex.value + direction;
  if (newIndex >= 0 && newIndex < timelineWidths.length) {
    currentIndex.value = newIndex;
    console.log(`[TimelineSwitcher] Emitting change-timeline-width: ${currentWidth.value}`);
    emit('change-timeline-width', currentWidth.value);
  } else {
    console.log(`[TimelineSwitcher] Index out of bounds: ${newIndex}`);
  }
};

const expandChartsMax = () => {
  ensureOpen();
  console.log('[TimelineSwitcher] expandChartsMax called');
  emit('expand-charts-max');
};

const collapseChartsMax = () => {
  ensureOpen();
  console.log('[TimelineSwitcher] collapseChartsMax called');
  emit('collapse-charts-max');
};

const centerCharts = () => {
  ensureOpen();
  console.log('[TimelineSwitcher] centerCharts called');
  emit('center-charts');
};

const canDecreaseWidth = computed(() => currentIndex.value > 0);
const canIncreaseWidth = computed(() => currentIndex.value < timelineWidths.length - 1);
</script>

<template>
  <div
    class="timeline-switcher"
    :class="{ open: isPanelOpen }"
    @click.stop
    @pointerenter="openPanel"
    @pointerleave="closePanel"
  >
    <div class="switcher-column center-column">
      <!-- Expand timeline down (arrow up = chart goes UP) -->
      <button 
        class="control-btn arrow-up-btn" 
        @click.stop="collapseChartsMax"
        @touchstart.stop.prevent="collapseChartsMax"
        title="Поднять график вверх (минимизировать таймлайн)"
      >
        ▲
      </button>
      
      <!-- Center grip handle (clickable to reset) -->
      <button 
        class="control-btn grip-handle" 
        @click.stop="centerCharts"
        @touchstart.stop.prevent="centerCharts"
        title="Вернуть в исходное состояние"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="0" width="8" height="8" transform="rotate(45 8 8)" fill="currentColor"/>
        </svg>
      </button>
      
      <!-- Collapse timeline up (arrow down = chart goes DOWN) -->
      <button 
        class="control-btn arrow-down-btn" 
        @click.stop="expandChartsMax"
        @touchstart.stop.prevent="expandChartsMax"
        title="Опустить график вниз (максимизировать таймлайн)"
      >
        ▼
      </button>
    </div>
  </div>
</template>

<style scoped>
.timeline-switcher {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: all;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 50;
}

/* Show on parent hover */
.vertical-resizer:hover .timeline-switcher {
  opacity: 1;
}

.timeline-switcher.open {
  opacity: 1;
  pointer-events: all;
}

.switcher-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
}

.control-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text);
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.control-btn:hover {
  background: rgba(74, 144, 226, 0.2);
  color: var(--color-primary);
  transform: scale(1.1);
}

.control-btn:active {
  transform: scale(0.95);
}

.grip-handle {
  background: rgba(74, 144, 226, 0.15);
  color: var(--color-primary);
  cursor: grab;
}

.grip-handle:hover {
  background: rgba(74, 144, 226, 0.3);
  transform: scale(1.15);
}

.grip-handle:active {
  cursor: grabbing;
  transform: scale(0.9);
}

.arrow-up-btn,
.arrow-down-btn {
  font-size: 18px;
}
</style>
