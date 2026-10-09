import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRenderer, markRaw, nextTick, ref } from 'vue';
import { createServer } from 'vite';

test('gesture listeners attach to a late chart ref, follow canvas replacement and clean up', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  let app;
  try {
    const { useGraphGestureGuard } = await server.ssrLoadModule('/src/composables/useGraphGestureGuard.js');
    const renderer = createRenderer({
      createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null,
      nextSibling: () => null, createElement: () => ({}), createText: () => ({}),
      setText() {}, setElementText() {}, patchProp() {},
    });
    const chartRef = ref(null);
    let guard;
    let dismissals = 0;
    app = renderer.createApp({ setup() {
      guard = useGraphGestureGuard(chartRef, () => dismissals++);
      return () => null;
    } });
    app.mount({});
    await nextTick(); // Parent has mounted; vue-chartjs hasn't forwarded a chart.

    const root = new EventTarget();
    const doc = new EventTarget();
    doc.defaultView = { PointerEvent: function () {} };
    root.ownerDocument = doc;
    const canvas = markRaw({ closest: () => root, ownerDocument: doc });
    chartRef.value = markRaw({ chart: { canvas, getActiveElements: () => [] } });
    await nextTick();
    const send = (target, type, x = 50) => {
      const event = new Event(type);
      Object.assign(event, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: 50 });
      target.dispatchEvent(event);
    };
    send(root, 'pointerdown');
    send(doc, 'pointerup');
    assert.equal(guard.allowEvent({ type: 'click', target: root, clientX: 50, clientY: 50 }), true,
      'a touch click must be recognized even when the chart appeared after mounting');
    send(root, 'pointerdown');
    send(doc, 'pointermove', 100);
    send(doc, 'pointerup', 100);
    assert.equal(guard.allowEvent({ type: 'click', target: root, clientX: 50, clientY: 50 }), false);
    assert.equal(dismissals, 1);

    const otherRoot = new EventTarget();
    otherRoot.ownerDocument = doc;
    chartRef.value = markRaw({ chart: { canvas: markRaw({ closest: () => otherRoot }), getActiveElements: () => [] } });
    await nextTick();
    send(otherRoot, 'pointerdown');
    send(doc, 'pointerup');
    assert.equal(guard.allowEvent({ type: 'click', target: otherRoot, clientX: 50, clientY: 50 }), true);
    send(root, 'pointerdown');
    assert.equal(guard.canShowTooltip(), true, 'old canvas root no longer intercepts touches');

    app.unmount();
    app = null;
    send(otherRoot, 'pointerdown');
    assert.equal(guard.canShowTooltip(), true, 'unmount removes all gesture listeners');
  } finally {
    app?.unmount();
    await server.close();
  }
});
