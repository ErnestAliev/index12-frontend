import { onMounted, onUnmounted } from 'vue';
import { createGraphGestureGuard } from '@/utils/graphGestureGuard.js';

export function useGraphGestureGuard(chartRef, onDismiss, { tapOnly = false } = {}) {
  const guard = createGraphGestureGuard({ tapOnly, onDismiss: () => {
    onDismiss();
    const chart = chartRef.value?.chart;
    if (chart) {
      chart.setActiveElements([]);
      chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
      chart.render();
    }
  } });
  const listeners = [];
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler, { capture: true, passive: true });
    listeners.push(() => target.removeEventListener(type, handler, true));
  };

  onMounted(() => {
    const canvas = chartRef.value?.chart?.canvas;
    if (!canvas) return;
    // Cells and graph belong to the same gesture scope: tablet scrolling changes
    // chart data even when the finger never touches the canvas.
    const root = canvas.closest('[data-graph-workspace], .graph-modal-content, .mobile-graph-content') ||
      canvas.closest('.graph-area') || canvas.parentElement;
    const doc = canvas.ownerDocument;
    if (doc.defaultView.PointerEvent) {
      const point = e => ({ id: e.pointerId, pointerType: e.pointerType, x: e.clientX, y: e.clientY, target: e.target });
      listen(root, 'pointerdown', e => guard.start(point(e)));
      listen(doc, 'pointermove', e => guard.move(point(e)));
      listen(doc, 'pointerup', e => guard.end(point(e)));
      listen(doc, 'pointercancel', () => guard.cancel());
    } else {
      const point = (e, touch) => ({ id: touch.identifier, x: touch.clientX, y: touch.clientY, target: e.target });
      listen(root, 'touchstart', e => {
        if (e.touches.length !== 1) guard.cancel();
        else guard.start(point(e, e.touches[0]));
      });
      listen(doc, 'touchmove', e => {
        for (const touch of e.changedTouches) guard.move(point(e, touch));
      });
      listen(doc, 'touchend', e => {
        for (const touch of e.changedTouches) guard.end(point(e, touch));
      });
      listen(doc, 'touchcancel', () => guard.cancel());
    }
    listen(root, 'scroll', () => guard.scroll());
    listen(root, 'wheel', () => guard.scroll());
  });
  onUnmounted(() => listeners.forEach(remove => remove()));

  return guard;
}
