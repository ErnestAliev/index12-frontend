// A menu opened during a held pointer must never treat that release as a choice.
export function useOpeningGestureGuard(required) {
  let control = null,
    point = null;
  const target = (event) =>
    event.target?.closest?.('button,a,input,textarea,select,[role="menuitem"]');
  function down(event) {
    if (event.button !== 0) return;
    control = target(event);
    point = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function cancel() {
    control = null;
    point = null;
  }
  function move(event) {
    if (
      point?.id === event.pointerId &&
      Math.hypot(event.clientX - point.x, event.clientY - point.y) > 10
    )
      cancel();
  }
  function keys(event) {
    if (event.key === "Enter" || event.key === " ") control = target(event);
  }
  function click(event) {
    if (!required) return;
    const chosen = target(event),
      fresh = chosen && chosen === control;
    cancel();
    if (!fresh) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  return { down, move, cancel, keys, click };
}
