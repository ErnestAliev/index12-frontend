import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGraphGestureGuard } from '../src/utils/graphGestureGuard.js';
import { bindGraphGestureGuard } from '../src/utils/graphGestureListeners.js';

function setup(pointerEvents = true) {
  const root = new EventTarget();
  const doc = new EventTarget();
  doc.defaultView = { PointerEvent: pointerEvents ? function () {} : undefined };
  root.ownerDocument = doc;
  let time = 1000;
  const guard = createGraphGestureGuard({ now: () => time });
  const dispose = bindGraphGestureGuard(guard, root, { guardClicks: true });
  const send = (target, type, props = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'touch', clientX: 30, clientY: 50, detail: 1 }, props);
    target.dispatchEvent(event);
    return event;
  };
  return { root, doc, send, dispose, advance: ms => time += ms };
}

test('native pointer movement remains unblocked while its ghost click is stopped before a card handler', () => {
  const s = setup();
  let opens = 0;
  s.root.addEventListener('click', () => opens++);
  s.send(s.root, 'pointerdown');
  assert.equal(s.send(s.doc, 'pointermove', { clientX: 100 }).defaultPrevented, false);
  s.send(s.doc, 'pointerup', { clientX: 100 });
  assert.equal(s.send(s.root, 'click').defaultPrevented, true);
  assert.equal(opens, 0);
  s.send(s.root, 'pointerdown');
  s.send(s.doc, 'pointerup', { clientX: 31 });
  assert.equal(s.send(s.root, 'click', { clientX: 31 }).defaultPrevented, false);
  assert.equal(opens, 1);
  s.dispose();
});

test('the first touch stops inertia without opening a card; a settled tap and keyboard activation work', () => {
  const s = setup();
  s.send(s.root, 'scroll');
  s.send(s.root, 'pointerdown');
  s.send(s.doc, 'pointerup');
  assert.equal(s.send(s.root, 'click').defaultPrevented, true);
  assert.equal(s.send(s.root, 'click', { detail: 0 }).defaultPrevented, false);
  s.advance(200);
  s.send(s.root, 'pointerdown');
  s.send(s.doc, 'pointerup');
  assert.equal(s.send(s.root, 'click').defaultPrevented, false);
  s.dispose();
});

test('Safari touch-event fallback also permits native movement and rejects cancelled swipes', () => {
  const s = setup(false);
  const touch = { identifier: 1, clientX: 30, clientY: 50 };
  s.send(s.root, 'touchstart', { touches: [touch] });
  assert.equal(s.send(s.doc, 'touchmove', { changedTouches: [{ ...touch, clientX: 100 }] }).defaultPrevented, false);
  s.send(s.doc, 'touchcancel');
  assert.equal(s.send(s.root, 'click').defaultPrevented, true);
  s.send(s.root, 'touchstart', { touches: [touch] });
  s.send(s.doc, 'touchend', { changedTouches: [touch] });
  assert.equal(s.send(s.root, 'click').defaultPrevented, false);
  s.dispose();
});

test('listener cleanup stops intercepting clicks after the workspace is unmounted', () => {
  const s = setup();
  s.send(s.root, 'pointerdown');
  s.send(s.doc, 'pointercancel');
  assert.equal(s.send(s.root, 'click').defaultPrevented, true);
  s.dispose();
  assert.equal(s.send(s.root, 'click').defaultPrevented, false);
});
