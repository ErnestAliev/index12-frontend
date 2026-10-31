<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useWidgetData } from '@/composables/useWidgetData.js';
import { getHeaderWidgetColumns } from '@/utils/homeLayout.js';
import DashboardWidget from './DashboardWidget.vue';
import WidgetPicker from './WidgetPicker.vue';
const store = useMainStore();
const { getWidgetItems } = useWidgetData();
const emit = defineEmits(['edit-operation']);
const showWidgetPicker = ref(false);
const fullscreenWidgetKey = ref(null);
const closeButton = ref(null);
const draggedKey = ref(null);
const windowSize = ref({ width: window.innerWidth, height: window.innerHeight });
const localWidgets = computed(() => ['money', ...store.dashboardLayout]);
const widgetColumns = computed(() => Math.min(getHeaderWidgetColumns(windowSize.value), localWidgets.value.length));
const isPortraitTablet = computed(() => windowSize.value.width <= 1400 && windowSize.value.height > windowSize.value.width);
const widgetName = key => store.allWidgets.find(widget => widget.key === key)?.name || '';
const widgetItems = key => getWidgetItems(key, store.dashboardForecastState[key] === true);
let previousFocus;
async function openFullscreen(key) {
  if (draggedKey.value || key === 'money') return;
  previousFocus = document.activeElement;
  fullscreenWidgetKey.value = key;
  await nextTick(); closeButton.value?.focus();
}
function closeFullscreen() { fullscreenWidgetKey.value = null; previousFocus?.focus?.(); }
function editOperation(operation) { closeFullscreen(); emit('edit-operation', operation); }
function dropWidget(key) {
  const from = store.dashboardLayout.indexOf(draggedKey.value), to = store.dashboardLayout.indexOf(key);
  if (from >= 0 && to >= 0 && from !== to) {
    const next = [...store.dashboardLayout]; [next[from], next[to]] = [next[to], next[from]]; store.dashboardLayout = next;
  }
  draggedKey.value = null;
}
function startDrag(event, key) {
  if (key === 'money' || event.target.closest('button, input, a, summary')) { event.preventDefault(); return; }
  draggedKey.value = key; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', key);
}
const updateSize = () => { windowSize.value = { width: window.innerWidth, height: window.innerHeight }; };
function keyboard(event) {
  if (!fullscreenWidgetKey.value || showWidgetPicker.value) return;
  if (event.key === 'Escape') closeFullscreen();
  if (event.key !== 'Tab') return;
  const controls = [...closeButton.value.closest('[role="dialog"]').querySelectorAll('button:not(:disabled), input, summary')];
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
onMounted(() => { window.addEventListener('resize', updateSize); document.addEventListener('keydown', keyboard); });
onUnmounted(() => { window.removeEventListener('resize', updateSize); document.removeEventListener('keydown', keyboard); });
</script>
<template>
  <div class="header-dashboard" :class="{ expanded: store.isHeaderExpanded, 'portrait-tablet': isPortraitTablet }" :style="{ '--widget-columns': widgetColumns }">
    <div v-for="(key, index) in localWidgets" :key="key" class="dashboard-card-wrapper" :data-widget-key="key" :style="!store.isHeaderExpanded && index >= widgetColumns ? { display: 'none' } : {}" :draggable="key !== 'money'" @dragstart="startDrag($event, key)" @dragend="draggedKey = null" @dragover.prevent @drop.prevent="dropWidget(key)" @click="openFullscreen(key)">
      <DashboardWidget :widget-key="key" :widget-index="index" :items="widgetItems(key)" @open="openFullscreen(key)" @manage="showWidgetPicker = true" @edit-operation="editOperation" />
    </div>
  </div>
  <WidgetPicker v-if="showWidgetPicker" @close="showWidgetPicker = false" />
  <Teleport to="body">
    <div v-if="fullscreenWidgetKey" class="fullscreen-overlay" @click.self="closeFullscreen">
      <section class="fullscreen-content" role="dialog" aria-modal="true" :aria-label="widgetName(fullscreenWidgetKey)">
        <button ref="closeButton" type="button" class="fullscreen-close" aria-label="Закрыть виджет" @click="closeFullscreen">×</button>
        <div class="fullscreen-card-container"><DashboardWidget :widget-key="fullscreenWidgetKey" :items="widgetItems(fullscreenWidgetKey)" expanded @manage="showWidgetPicker = true" @edit-operation="editOperation" /></div>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.header-dashboard { display: grid; width: 100%; box-sizing: border-box; grid-template-columns: repeat(var(--widget-columns), minmax(0, 1fr)); grid-template-rows: 1fr; gap: var(--widget-grid-gap); padding: var(--widget-grid-padding); background: var(--widget-grid-color); border: 1px solid var(--widget-grid-color); border-radius: var(--widget-grid-border-radius); height: 100%; min-height: 0; overflow: hidden; }
.header-dashboard.expanded { grid-template-rows: none; grid-auto-rows: minmax(130px, 1fr); overflow-y: auto; }
.dashboard-card-wrapper { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--widget-background); }
.dashboard-card-wrapper[draggable="true"] { cursor: grab; }
:deep(.dashboard-card) { flex: 1; min-width: 0; min-height: 0; margin: 0 !important; padding: 8px 12px !important; border: 0 !important; box-sizing: border-box; }
.portrait-tablet :deep(.card-title-container) { flex-direction: column; align-items: flex-start; gap: 3px; height: auto; min-height: 44px; }
.portrait-tablet :deep(.card-items-list.forecast-mode) { display: flex; }
.portrait-tablet :deep(.forecast-mode .card-item) { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }
.portrait-tablet :deep(.forecast-display) { display: flex; justify-content: flex-end; gap: 4px; }
.fullscreen-overlay { position: fixed; inset: 0; padding: 24px; z-index: 2100; display: grid; place-items: center; background: #0009; }
.fullscreen-content { width: min(100%, 900px); height: min(80vh, 780px); display: flex; flex-direction: column; min-height: 0; }
.fullscreen-close { align-self: flex-end; flex-shrink: 0; margin-bottom: 8px; width: 36px; height: 36px; padding: 0; font-size: 24px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--widget-background); color: var(--color-text); }
.fullscreen-card-container { flex: 1; min-height: 0; overflow: hidden; background: var(--widget-background); border: 1px solid var(--color-border); border-radius: 12px; box-shadow: var(--tooltip-shadow); }
.fullscreen-card-container :deep(.dashboard-card) { height: 100%; padding: 20px !important; }
</style>
