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
  let lastMousePosition = null;
  let mousePositionAtScroll = null;
  let lastScrollEventTimeStamp = -Infinity;

  const dismiss = () => {
    const wasBlocked = blocked;
    authorized = false;
    tap = null;
    blocked = true;
    // One invalidation is enough for the entire swipe (including inertia and
    // date-range updates). Repainting a chart on every move stalls iPad scroll.
    if (!wasBlocked) onDismiss();
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
      lastMousePosition = { x: point.x, y: point.y };
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

  const scroll = (eventTimeStamp) => {
    lastScrollAt = now();
    mousePositionAtScroll = lastMousePosition;
    if (Number.isFinite(eventTimeStamp)) lastScrollEventTimeStamp = eventTimeStamp;
    if (gesture) gesture.cancelled = true;
    dismiss();
  };

  const allowEvent = (event, replay = false) => {
    if (!event || gesture) return false;
    if (replay) return !touchMode && !tapOnly && !blocked && now() - lastScrollAt >= 150;
    const fromTouch = touchMode || event.sourceCapabilities?.firesTouchEvents || event.pointerType === 'touch';
    if (event.type === 'click') {
      const sameTarget = tap && (event.target === tap.target || event.target?.contains?.(tap.target));
      if (fromTouch && (!sameTarget || now() - tap.endedAt > 800 ||
        Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > slop)) return false;
      authorized = true;
      blocked = false;
      return true;
    }
    if (fromTouch || tapOnly) return false;
    if (event.type === 'mousemove') {
      // Safari can send mousemove as the canvas slides under a stationary
      // cursor. That is not a new hover while wheel momentum is still running.
      if (now() - lastScrollAt < 150) return false;
      if (Number.isFinite(event.timeStamp) && event.timeStamp <= lastScrollEventTimeStamp) return false;
      if (blocked && mousePositionAtScroll && event.clientX === mousePositionAtScroll.x && event.clientY === mousePositionAtScroll.y) return false;
      blocked = false;
      if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        lastMousePosition = { x: event.clientX, y: event.clientY };
      }
    }
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
