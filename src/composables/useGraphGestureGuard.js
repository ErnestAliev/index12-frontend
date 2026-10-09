import { watch, onUnmounted } from 'vue';
import { createGraphGestureGuard } from '@/utils/graphGestureGuard.js';
import { bindGraphGestureGuard } from '@/utils/graphGestureListeners.js';

export function useGraphGestureGuard(chartRef, onDismiss, { tapOnly = false } = {}) {
  const guard = createGraphGestureGuard({ tapOnly, onDismiss: () => {
    onDismiss();
    const chart = chartRef.value?.chart;
    if (chart && (chart.getActiveElements().length || chart.tooltip?.getActiveElements().length)) {
      chart.setActiveElements([]);
      chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
      chart.render();
    }
  } });
  let removeListeners;

  // vue-chartjs forwards the Chart instance through a typed component ref.
  // It can still be null at this parent's mounted hook. Observe the actual
  // canvas so touch/scroll listeners attach when the chart becomes ready.
  watch(() => chartRef.value?.chart?.canvas, (canvas) => {
    removeListeners?.();
    if (!canvas) return;
    // Cells and graph belong to the same gesture scope: tablet scrolling changes
    // chart data even when the finger never touches the canvas.
    const root = canvas.closest('[data-graph-workspace], .graph-modal-content, .mobile-graph-content') ||
      canvas.closest('.graph-area') || canvas.parentElement;
    removeListeners = bindGraphGestureGuard(guard, root);
  }, { flush: 'post' });
  onUnmounted(() => removeListeners?.());

  return guard;
}
