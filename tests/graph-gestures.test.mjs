import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { Chart, BasicPlatform } from 'chart.js/auto';
import { createGraphGestureGuard } from '../src/utils/graphGestureGuard.js';

function setup(tapOnly = true) {
  let time = 1000;
  let dismissals = 0;
  const canvas = {};
  const guard = createGraphGestureGuard({ tapOnly, now: () => time, onDismiss: () => dismissals++ });
  const point = (x = 100, y = 50, extra = {}) => ({ id: 1, x, y, target: canvas, pointerType: 'touch', ...extra });
  const click = (extra = {}) => ({ type: 'click', target: canvas, clientX: 100, clientY: 50, ...extra });
  return { guard, point, click, advance: ms => time += ms, dismissals: () => dismissals };
}

test('a short tap with finger jitter opens the summary only on click', () => {
  const s = setup();
  s.guard.start(s.point());
  assert.equal(s.guard.canShowTooltip(), false);
  assert.equal(s.guard.allowEvent({ type: 'touchstart' }), false);
  s.guard.move(s.point(103, 52));
  s.advance(120);
  s.guard.end(s.point(103, 52));
  assert.equal(s.guard.canShowTooltip(), false);
  assert.equal(s.guard.allowEvent(s.click({ clientX: 103, clientY: 52 })), true);
  assert.equal(s.guard.canShowTooltip(), true);
});

for (const [label, x, y] of [['horizontal', 130, 50], ['vertical', 100, 80], ['diagonal', 107, 57]]) {
  test(`${label} swipe rejects the compatibility click, even after returning to its origin`, () => {
    const s = setup();
    s.guard.start(s.point());
    s.guard.move(s.point(x, y));
    s.guard.move(s.point());
    s.guard.end(s.point());
    assert.equal(s.guard.allowEvent(s.click()), false);
    assert.equal(s.guard.canShowTooltip(), false);
    assert.ok(s.dismissals() > 0);
  });
}

test('a tap that started in a cell or day total cannot open a bar at release', () => {
  const s = setup();
  s.guard.start(s.point(100, 50, { target: {} }));
  s.guard.end(s.point());
  assert.equal(s.guard.allowEvent(s.click()), false);
});

test('cancellation, multiple fingers and long press cannot turn into a summary click', () => {
  for (const kind of ['cancel', 'multitouch', 'longpress']) {
    const s = setup();
    s.guard.start(s.point());
    if (kind === 'cancel') s.guard.cancel();
    if (kind === 'multitouch') s.guard.start(s.point(101, 51, { id: 2 }));
    if (kind === 'longpress') s.advance(600);
    s.guard.end(s.point());
    assert.equal(s.guard.allowEvent(s.click()), false, kind);
  }
});

test('inertial scrolling rejects its stopping tap, then allows a fresh tap immediately after settling', () => {
  const s = setup();
  s.guard.scroll();
  s.advance(40);
  s.guard.start(s.point());
  s.guard.end(s.point());
  assert.equal(s.guard.allowEvent(s.click()), false);
  s.advance(160);
  s.guard.start(s.point());
  s.guard.end(s.point());
  assert.equal(s.guard.allowEvent(s.click()), true);
});

test('a scroll after touch release invalidates a delayed browser click', () => {
  const s = setup();
  s.guard.start(s.point());
  s.guard.end(s.point());
  s.guard.scroll();
  assert.equal(s.guard.allowEvent(s.click()), false);
});

test('a continuous swipe and its range updates dismiss once instead of repainting on every move', () => {
  const s = setup(false);
  s.guard.start(s.point());
  s.guard.end(s.point());
  assert.equal(s.guard.allowEvent(s.click()), true);
  s.guard.start(s.point());
  for (let x = 110; x <= 600; x += 10) {
    s.guard.move(s.point(x));
    s.guard.dismiss(); // virtual day range update
  }
  s.guard.end(s.point(600));
  for (let i = 0; i < 30; i++) s.guard.scroll(); // native scroll / inertia
  assert.equal(s.dismissals(), 1);
  assert.equal(s.guard.canShowTooltip(), false);
  assert.equal(s.guard.allowEvent(s.click()), false);
  s.advance(200);
  s.guard.start(s.point());
  s.guard.end(s.point());
  assert.equal(s.guard.allowEvent(s.click()), true);
  s.guard.scroll();
  assert.equal(s.dismissals(), 2, 'a newly opened summary is still dismissed by the next scroll');
});

test('dismissal and a shifted date range require a new tap, not a replay or stale touch hover', () => {
  const s = setup(false);
  s.guard.start(s.point());
  s.guard.end(s.point());
  assert.equal(s.guard.allowEvent(s.click()), true);
  s.guard.dismiss();
  assert.equal(s.guard.allowEvent(s.click(), true), false);
  assert.equal(s.guard.allowEvent({ type: 'mousemove' }), false);
  assert.equal(s.guard.canShowTooltip(), false);
  s.guard.start(s.point());
  s.guard.end(s.point());
  assert.equal(s.guard.allowEvent(s.click()), true);
});

test('desktop hover and click still work, including switching from touch to a real mouse', () => {
  const s = setup(false);
  assert.equal(s.guard.allowEvent({ type: 'mousemove' }), true);
  assert.equal(s.guard.canShowTooltip(), true);
  s.guard.start(s.point());
  s.guard.move(s.point(130));
  s.guard.end(s.point(130));
  assert.equal(s.guard.allowEvent({ type: 'mousemove' }), false);
  s.guard.move(s.point(100, 50, { pointerType: 'mouse' }));
  assert.equal(s.guard.allowEvent({ type: 'mousemove' }), true);
  assert.equal(s.guard.allowEvent(s.click()), true);
});

test('Safari mousemove during wheel inertia cannot reopen a summary under a stationary cursor', () => {
  const s = setup(false);
  assert.equal(s.guard.allowEvent({ type: 'mousemove' }), true);
  s.guard.scroll();
  s.guard.move(s.point(100, 50, { pointerType: 'mouse' }));
  assert.equal(s.guard.allowEvent({ type: 'mousemove' }), false);
  assert.equal(s.guard.allowEvent({ type: 'mousemove' }, true), false);
  s.advance(200);
  assert.equal(s.guard.allowEvent({ type: 'mousemove' }), true);
});

test('a stationary cursor remains blocked after wheel scrolling stops until the mouse actually moves', () => {
  const s = setup(false);
  assert.equal(s.guard.allowEvent({ type: 'mousemove', clientX: 50, clientY: 100 }), true);
  s.guard.scroll();
  s.advance(400);
  assert.equal(s.guard.allowEvent({ type: 'mousemove', clientX: 50, clientY: 100 }), false);
  assert.equal(s.guard.allowEvent({ type: 'mousemove', clientX: 51, clientY: 100 }), true);
});

test('a hover queued before the wheel event cannot reopen the card after a delayed chart frame', () => {
  const s = setup(false);
  s.guard.move(s.point(50, 100, { pointerType: 'mouse' }));
  s.guard.scroll(200);
  s.advance(500);
  assert.equal(s.guard.allowEvent({ type: 'mousemove', clientX: 50, clientY: 100, timeStamp: 100 }), false);
  assert.equal(s.guard.allowEvent({ type: 'mousemove', clientX: 50, clientY: 100, timeStamp: 700 }), false);
  s.guard.move(s.point(51, 100, { pointerType: 'mouse' }));
  assert.equal(s.guard.allowEvent({ type: 'mousemove', clientX: 51, clientY: 100, timeStamp: 800 }), true);
});

// Exercise the actual Chart.js event and tooltip pipeline, not just the guard:
// the defect survives an onClick-only fix because tooltip.afterEvent still runs.
for (const [name, filename, tapOnly] of [
  ['mobile', 'mobile/MobileGraphRenderer.vue', true],
  ['tablet', 'GraphRenderer.vue', false],
]) {
  test(`${name}: Chart.js opens on tap but cannot open after a cell swipe or data replay`, () => {
    let time = 1000;
    let opens = 0;
    let clicks = 0;
    let chart;
    let context;
    const guard = createGraphGestureGuard({ tapOnly, now: () => time, onDismiss: () => {
      if (context) {
        context.tooltipPinned = false;
        context.tooltipPinnedKey = '';
        context.tooltipForceUpdate = false;
      }
      chart?.setActiveElements([]);
      chart?.tooltip?.setActiveElements([], { x: 0, y: 0 });
    } });
    const canvas = { width: 300, height: 150, getContext: () => ctx };
    const ctx = new Proxy({ canvas, measureText: text => ({ width: String(text).length * 6 }) }, {
      get: (target, key) => key in target ? target[key] : () => {},
    });
    const source = readFileSync(new URL(`../src/components/${filename}`, import.meta.url), 'utf8');
    const clickStart = source.indexOf('onClick: (event, elements, chart) =>');
    const clickEnd = source.indexOf('\n    plugins:', clickStart);
    context = vm.createContext({ gestureGuard: guard, tooltipPinned: false, tooltipPinnedKey: '', tooltipForceUpdate: false });
    const onClick = vm.runInContext(`({ ${source.slice(clickStart, clickEnd)} }).onClick`, context);
    const events = source.match(/events: \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
    assert.ok(!events.includes('touchstart') && !events.includes('touchmove'));
    chart = new Chart(canvas, {
      type: 'bar', platform: BasicPlatform, plugins: [guard.plugin],
      data: { labels: ['Day'], datasets: [{ data: [100] }] },
      options: {
        responsive: false, animation: false, events,
        onClick: (...args) => { clicks++; onClick(...args); },
        plugins: { legend: { display: false }, tooltip: { enabled: false, external: ({ tooltip }) => {
          if (tooltip.opacity && guard.canShowTooltip()) opens++;
        } } },
      },
    });
    try {
      const { x, y } = chart.getDatasetMeta(0).data[0].getCenterPoint();
      const point = extra => ({ id: 1, pointerType: 'touch', x, y, target: canvas, ...extra });
      const dispatch = type => {
        if (events.includes(type)) chart._eventHandler({ type, x, y, native: { type, target: canvas, clientX: x, clientY: y } });
      };
      guard.start(point());
      dispatch('touchstart');
      dispatch('mousemove');
      assert.equal(opens, 0);
      guard.end(point());
      dispatch('click');
      assert.equal(clicks, 1);
      assert.equal(opens, 1);

      // Swiping the cells replaces the visible chart days on a tablet. The
      // previous canvas event must not activate the summary for the new day.
      guard.start(point({ target: {} }));
      guard.move(point({ x: x + 30 }));
      guard.end(point({ x: x + 30 }));
      dispatch('click');
      dispatch('mousemove');
      chart.data.labels = ['Next day'];
      chart.data.datasets[0].data = [200];
      chart.update('none');
      assert.equal(clicks, 1);
      assert.equal(opens, 1);
      assert.equal(guard.canShowTooltip(), false);
      assert.equal(chart.getActiveElements().length, 0);

      time += 200;
      guard.start(point());
      guard.end(point());
      dispatch('click');
      assert.equal(clicks, 2);
      assert.equal(opens, 2);

      guard.start(point());
      guard.end(point());
      dispatch('click'); // same bar toggles off
      assert.equal(guard.canShowTooltip(), false);
      const beforeReopen = opens;
      guard.start(point());
      guard.end(point());
      dispatch('click');
      assert.equal(guard.canShowTooltip(), true);
      assert.ok(opens > beforeReopen, 'a dismissed summary must open on the next intentional tap');
    } finally {
      chart.destroy();
    }
  });
}
