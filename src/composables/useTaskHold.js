import { onBeforeUnmount } from "vue";
export function useTaskHold(open) {
  let timer,
    start,
    suppressed = false;
  function cancel() {
    clearTimeout(timer);
    timer = null;
  }
  function down(event, task) {
    cancel();
    suppressed = false;
    if (event.button !== 0 || event.target.closest("[role=checkbox],a")) return;
    start = { x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      suppressed = true;
      open(task, true);
    }, 450);
  }
  function move(event) {
    if (
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
    )
      cancel();
  }
  function click(event) {
    if (suppressed) {
      event.preventDefault();
      event.stopPropagation();
      suppressed = false;
    }
  }
  function context(event, task) {
    if (event.target.closest('a')) return;
    event.preventDefault();
    cancel();
    open(task, false);
  }
  function keys(event, task) {
    if (event.target.closest('a')) return;
    if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      open(task, false);
    }
  }
  onBeforeUnmount(cancel);
  return { down, move, cancel, click, context, keys };
}
