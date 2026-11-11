export function useTaskContextMenu(open) {
  let pointerType = "mouse", suppressed = false;
  function down(event) {
    pointerType = event.pointerType || "mouse";
    suppressed = false;
  }
  function drag() { suppressed = true; }
  function click(event) {
    if (!suppressed) return;
    event.preventDefault();
    event.stopPropagation();
    suppressed = false;
  }
  function context(event, task) {
    if (event.target.closest("a")) return;
    event.preventDefault();
    // Safari may send a MouseEvent for a touch contextmenu. Remember the
    // initiating pointer instead of detecting iPad from the viewport or UA.
    if ((event.pointerType || pointerType) !== "mouse") {
      suppressed = true;
      return;
    }
    open(task, false);
  }
  function keys(event, task) {
    if (event.target.closest("a")) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      open(task, false);
    }
  }
  return { down, drag, click, context, keys };
}
