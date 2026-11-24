import { onBeforeUnmount, ref } from 'vue';

export function useTaskContextMenu(open) {
  const touch = ref(window.matchMedia('(pointer: coarse)').matches);
  let pointerType = "mouse", suppressed = false, timer, point;
  function stop() {
    clearTimeout(timer); timer = null; point = null;
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', end, true);
    document.removeEventListener('pointercancel', end, true);
    document.removeEventListener('pointerdown', anotherPointer, true);
    window.removeEventListener('blur', stop);
  }
  function move(event) { if (point?.id === event.pointerId && Math.hypot(event.clientX - point.x, event.clientY - point.y) > 10) stop(); }
  function end(event) { if (point?.id === event.pointerId) stop(); }
  function anotherPointer(event) { if (point && point.id !== event.pointerId) stop(); }
  function down(event, task) {
    stop();
    pointerType = event.pointerType || "mouse";
    touch.value = pointerType !== 'mouse';
    suppressed = false;
    if (pointerType === 'mouse' || event.button !== 0 || event.isPrimary === false || event.target.closest('button,a,input,textarea,select,dialog')) return;
    point = { id: event.pointerId, x: event.clientX, y: event.clientY };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    document.addEventListener('pointerdown', anotherPointer, true);
    window.addEventListener('blur', stop);
    timer = setTimeout(() => { stop(); suppressed = true; open(task, true); }, 500);
  }
  function drag() { stop(); suppressed = true; }
  function click(event) {
    if (!suppressed) return;
    event.preventDefault();
    event.stopPropagation();
    suppressed = false;
  }
  function context(event, task) {
    if (event.target.closest("button,a,input,textarea,select,dialog")) return;
    event.preventDefault();
    // Safari may send a MouseEvent for a touch contextmenu. Remember the
    // initiating pointer instead of detecting iPad from the viewport or UA.
    if ((event.pointerType || pointerType) !== "mouse") {
      // Native contextmenu can arrive before our timer on iOS.
      const pending = !!timer;
      stop();
      if (pending && !suppressed) { suppressed = true; open(task, true); }
      return;
    }
    open(task, false);
  }
  onBeforeUnmount(stop);
  function keys(event, task) {
    if (event.target.closest("a")) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      open(task, false);
    }
  }
  return { down, drag, click, context, keys, touch };
}
