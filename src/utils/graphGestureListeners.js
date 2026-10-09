export function bindGraphGestureGuard(guard, root, { guardClicks = false } = {}) {
  const doc = root.ownerDocument;
  const removers = [];
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler, { capture: true, passive: type !== 'click' });
    removers.push(() => target.removeEventListener(type, handler, { capture: true }));
  };
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
  listen(root, 'scroll', e => guard.scroll(e.timeStamp));
  listen(root, 'wheel', e => guard.scroll(e.timeStamp));
  if (guardClicks) {
    listen(root, 'click', e => {
      // Keyboard activation has no pointing gesture to validate.
      if (e.detail === 0 || guard.allowEvent(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    });
  }
  return () => removers.forEach(remove => remove());
}
