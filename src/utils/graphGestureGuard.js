// Chart.js receives compatibility mouse events after touch gestures and replays
// its last event on data updates. Neither is evidence of a new tap on a bar.
export function createGraphGestureGuard({ onDismiss = () => {}, now = Date.now, tapOnly = false } = {}) {
  const slop = 8;
  let touchMode = false;
  let gesture = null;
  let tap = null;
  let authorized = false;
  let blocked = false;
  let lastScrollAt = -Infinity;

  const dismiss = () => {
    authorized = false;
    tap = null;
    blocked = true;
    onDismiss();
  };

  const start = (point) => {
    if (point.pointerType === 'mouse') {
      touchMode = false;
      gesture = null;
      tap = null;
      return;
    }
    touchMode = true;
    authorized = false;
    tap = null;
    if (gesture) {
      gesture.cancelled = true;
      dismiss();
      return;
    }
    gesture = {
      ...point, startedAt: now(), moved: false,
      cancelled: now() - lastScrollAt < 150,
    };
  };

  const move = (point) => {
    if (point.pointerType === 'mouse' && !gesture) {
      touchMode = false;
      return;
    }
    if (!gesture || gesture.id !== point.id) return;
    if (Math.hypot(point.x - gesture.x, point.y - gesture.y) > slop) {
      gesture.moved = true;
      dismiss();
    }
  };

  const end = (point) => {
    if (!gesture || gesture.id !== point.id) return;
    move(point);
    if (!gesture.moved && !gesture.cancelled && now() - gesture.startedAt <= 500) {
      tap = { target: gesture.target, x: point.x, y: point.y, endedAt: now() };
    }
    gesture = null;
  };

  const cancel = () => {
    gesture = null;
    dismiss();
  };

  const scroll = () => {
    lastScrollAt = now();
    if (gesture) gesture.cancelled = true;
    dismiss();
  };

  const allowEvent = (event, replay = false) => {
    if (!event || gesture) return false;
    if (replay) return !touchMode && !tapOnly && !blocked;
    const fromTouch = touchMode || event.sourceCapabilities?.firesTouchEvents || event.pointerType === 'touch';
    if (event.type === 'click') {
      if (fromTouch && (!tap || event.target !== tap.target || now() - tap.endedAt > 800 ||
        Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > slop)) return false;
      authorized = true;
      blocked = false;
      return true;
    }
    if (fromTouch || tapOnly) return false;
    if (event.type === 'mousemove') blocked = false;
    return !blocked;
  };

  return {
    start, move, end, cancel, scroll, dismiss, allowEvent,
    canShowTooltip: () => !gesture && !blocked && (!(touchMode || tapOnly) || authorized),
    // This runs before both the chart's onClick and the built-in tooltip plugin.
    plugin: {
      id: 'graphGestureGuard',
      beforeEvent: (_chart, args) => allowEvent(args.event.native, args.replay),
    },
  };
}
