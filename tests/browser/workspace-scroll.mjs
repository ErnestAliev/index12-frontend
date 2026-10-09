// npm run test:browser [-- --webkit]
// Uses a local Vite server and synthetic API responses; never writes real data.
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';

const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const server = await createServer({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  cacheDir: `node_modules/.vite-scroll-${engine}`,
  server: { host: '127.0.0.1', port: engine === 'webkit' ? 5186 : 5185, strictPort: true },
});
let browser;

// Sample every rendered frame, including during inertia and window recycling.
function measureFrame() {
  const viewport = document.querySelector('.workspace-scroll-viewport');
  const columns = [...viewport.querySelectorAll('.day-column')];
  const totals = [...viewport.querySelectorAll('.day-summary')];
  const chart = window.__scrollChart;
  const canvas = chart.canvas.getBoundingClientRect();
  const bounds = viewport.getBoundingClientRect();
  let mismatch = 0;
  let datesMatch = columns.length === totals.length && columns.length === chart.data.labels.length;
  columns.forEach((column, i) => {
    const rect = column.getBoundingClientRect();
    const total = totals[i];
    const [year, doy] = column.dataset.dateKey.split('-').map(Number);
    const date = new Date(year, 0, doy);
    const label = date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    datesMatch &&= total?.dataset.dateKey === column.dataset.dateKey && chart.data.labels[i] === label;
    if (rect.right < bounds.left || rect.left > bounds.right) return;
    const bar = chart.getDatasetMeta(0).data[i];
    if (!total || !bar) { mismatch = Infinity; return; }
    mismatch = Math.max(mismatch, Math.abs(total.getBoundingClientRect().x - rect.x),
      Math.abs(canvas.x + bar.x * canvas.width / chart.width - (rect.x + rect.width / 2)));
  });
  const overlays = [...document.querySelectorAll('div[id^="chartjs-custom-tooltip-"]')]
    .filter(el => Number(el.style.opacity) > 0).length;
  return { left: viewport.scrollLeft, mismatch, datesMatch, overlays, columns: columns.length,
    width: viewport.clientWidth, scrollWidth: viewport.scrollWidth, innerScroll: document.querySelector('.timeline-grid-wrapper').scrollTop };
}

function checkFrame(frame) {
  assert.equal(frame.datesMatch, true, 'table, chart and totals must describe the same dates');
  assert.ok(frame.mismatch < 0.6, `day alignment diverged by ${frame.mismatch}px`);
}

async function waitForScrollStop(page) {
  await page.evaluate(() => { window.__settleScroll = null; });
  await page.waitForFunction(() => {
    const left = document.querySelector('.workspace-scroll-viewport').scrollLeft;
    if (!window.__settleScroll || window.__settleScroll.left !== left) {
      window.__settleScroll = { left, changedAt: performance.now() };
      return false;
    }
    return performance.now() - window.__settleScroll.changedAt > 250;
  }, null, { polling: 50 });
}

try {
  await server.listen();
  const executablePath = process.env.SCROLL_TEST_CHROME ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
  browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ executablePath }));
  for (const width of [1024, 834]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' });
    await context.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      if (path.endsWith('/auth/me')) data = { _id: 'scroll-test', workspaceRole: 'admin', role: 'admin', createdAt: '2026-01-01' };
      if (path.endsWith('/accounts')) data = [{ _id: 'scroll-account', name: 'Test account', initialBalance: 100000, isExcluded: false }];
      if (path.endsWith('/snapshot')) data = { timestamp: new Date().toISOString(), accountBalances: { 'scroll-account': 100000 }, companyBalances: {}, individualBalances: {}, contractorBalances: {} };
      if (route.request().method() !== 'GET') data = { ...route.request().postDataJSON(), _id: `test-${path}` };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForSelector('.workspace-scroll-viewport canvas');
    await page.evaluate(async (engine) => {
      const { Chart } = await import(`/node_modules/.vite-scroll-${engine}/deps/chart__js_auto.js`);
      window.__scrollChart = Chart.getChart(document.querySelector('.workspace-scroll-viewport canvas'));
    }, engine);
    await page.waitForTimeout(250);
    checkFrame(await page.evaluate(measureFrame));

    // Expose the frame sampler to rAF in the browser without changing app code.
    await page.evaluate(`window.__measureScrollFrame = ${measureFrame.toString()}`);
    const cdp = engine === 'chromium' ? await context.newCDPSession(page) : null;
    for (const zone of ['.timeline-grid-wrapper', '.chart-wrapper', '.summaries-wrapper']) {
      await page.evaluate(() => document.querySelector('.workspace-scroll-viewport').scrollLeft = 0);
      await page.waitForTimeout(250);
      const bounds = await page.locator('.workspace-scroll-viewport').boundingBox();
      const box = await page.locator(zone).boundingBox();
      const x = bounds.x + bounds.width * 0.7;
      const y = box.y + Math.min(100, box.height / 2);
      if (!cdp) await page.mouse.move(x, y);
      await page.evaluate(() => {
        window.__scrollFrames = [];
        window.__recordScroll = true;
        const frame = () => {
          window.__scrollFrames.push(window.__measureScrollFrame());
          if (window.__recordScroll) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      if (cdp) {
        await cdp.send('Input.synthesizeScrollGesture', { x, y, xDistance: -400, yDistance: 0,
          speed: 1200, gestureSourceType: 'touch', preventFling: false });
      } else {
        // WebKit's public automation API exposes taps and wheel input, not a
        // native touch fling. Real touch inertia is exercised above in Chromium.
        await page.mouse.wheel(400, 0);
      }
      await page.waitForTimeout(800);
      const frames = await page.evaluate(() => { window.__recordScroll = false; return window.__scrollFrames; });
      assert.ok(frames.length > 3);
      for (const frame of frames) {
        checkFrame(frame);
        if (frame.left > 1) assert.equal(frame.overlays, 0, `scrolling must not open a summary: ${JSON.stringify(frame)}`);
      }
      assert.ok(frames.at(-1).left > 100, `${zone} must scroll horizontally`);
      if (cdp) assert.ok(frames.at(-1).left > 400, 'finger release must retain native inertia');
      console.log(`${engine} ${width}px ${zone}: ${frames.length} frames, aligned, no overlays`);
    }

    // A stationary touch after settling still opens the correct bar summary.
    await waitForScrollStop(page);
    await page.evaluate(() => {
      window.__tapTrace = [];
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'scroll']) {
        document.addEventListener(type, e => queueMicrotask(() => window.__tapTrace.push({ type, target: e.target.tagName,
          x: e.clientX, y: e.clientY, prevented: e.defaultPrevented, detail: e.detail })), { capture: true });
      }
      const plugin = window.__scrollChart.config.plugins.find(p => p.id === 'graphGestureGuard');
      const original = plugin.beforeEvent;
      plugin.beforeEvent = (...args) => {
        const allowed = original(...args);
        window.__tapTrace.push({ chartEvent: args[1].event.native.type, allowed });
        return allowed;
      };
    });
    const target = await page.evaluate(() => {
      const chart = window.__scrollChart;
      const rect = chart.canvas.getBoundingClientRect();
      const viewport = document.querySelector('.workspace-scroll-viewport').getBoundingClientRect();
      const index = Math.floor((viewport.x + viewport.width / 2 - rect.x) / (rect.width / chart.data.labels.length));
      const point = chart.getDatasetMeta(0).data[index].getCenterPoint();
      return { x: rect.x + point.x * rect.width / chart.width, y: rect.y + point.y * rect.height / chart.height };
    });
    await page.touchscreen.tap(target.x, target.y);
    try {
      await page.waitForFunction(() => [...document.querySelectorAll('div[id^="chartjs-custom-tooltip-"]')].some(el => Number(el.style.opacity) > 0), null, { timeout: 2000 });
    } catch (error) {
      console.error('tap diagnostics', await page.evaluate(() => ({ trace: window.__tapTrace, left: document.querySelector('.workspace-scroll-viewport').scrollLeft,
        active: window.__scrollChart.getActiveElements().map(e => ({ index: e.index, datasetIndex: e.datasetIndex })), opacity: window.__scrollChart.tooltip.opacity })));
      throw error;
    }
    for (const edge of ['left', 'right']) {
      const point = await page.evaluate(edge => {
        const chart = window.__scrollChart;
        const rect = chart.canvas.getBoundingClientRect();
        const viewport = document.querySelector('.workspace-scroll-viewport').getBoundingClientRect();
        const columnWidth = rect.width / chart.data.labels.length;
        const index = edge === 'left' ? Math.ceil((viewport.left - rect.left) / columnWidth) : Math.floor((viewport.right - rect.left) / columnWidth) - 1;
        const center = chart.getDatasetMeta(0).data[index].getCenterPoint();
        return { x: rect.x + center.x * rect.width / chart.width, y: rect.y + center.y * rect.height / chart.height };
      }, edge);
      await page.touchscreen.tap(point.x, point.y);
      await page.waitForTimeout(80);
      const bounds = await page.evaluate(() => {
        const card = [...document.querySelectorAll('div[id^="chartjs-custom-tooltip-"]')].find(el => Number(el.style.opacity) > 0);
        const viewport = document.querySelector('.workspace-scroll-viewport').getBoundingClientRect();
        const rect = card?.getBoundingClientRect();
        return { visible: !!card, left: rect?.left, right: rect?.right, viewportLeft: viewport.left, viewportRight: viewport.right };
      });
      assert.equal(bounds.visible, true);
      assert.ok(bounds.left >= bounds.viewportLeft && bounds.right <= bounds.viewportRight, 'edge tap card stays inside the visible workspace');
    }

    // Vertical table scroll is independent of the shared horizontal position.
    const before = await page.evaluate(measureFrame);
    const tableBox = await page.locator('.timeline-grid-wrapper').boundingBox();
    await page.mouse.move(width / 2, tableBox.y + 100);
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(250);
    const vertical = await page.evaluate(measureFrame);
    assert.ok(vertical.innerScroll > before.innerScroll);
    assert.equal(vertical.left, before.left);
    assert.equal(vertical.overlays, 0);
    checkFrame(vertical);

    // Long forecasts recycle bounded windows; dates stay aligned after resize.
    await page.evaluate(async () => {
      const { useMainStore } = await import('/src/stores/mainStore.js');
      useMainStore().setProjectionRange(new Date(2026, 0, 1), new Date(2026, 11, 31));
    });
    await page.waitForTimeout(300);
    if (cdp) {
      await page.evaluate(() => { window.__scrollFrames = []; window.__recordScroll = true;
        const frame = () => { window.__scrollFrames.push(window.__measureScrollFrame()); if (window.__recordScroll) requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
      });
      const viewport = await page.locator('.workspace-scroll-viewport').boundingBox();
      const chart = await page.locator('.chart-wrapper').boundingBox();
      await cdp.send('Input.synthesizeScrollGesture', { x: viewport.x + viewport.width * 0.8, y: chart.y + 100,
        xDistance: -viewport.width * 3, yDistance: 0, speed: 3500, gestureSourceType: 'touch', preventFling: false });
      await waitForScrollStop(page);
      const frames = await page.evaluate(() => { window.__recordScroll = false; return window.__scrollFrames; });
      for (const frame of frames) { checkFrame(frame); assert.equal(frame.overlays, 0); assert.ok(frame.columns <= 55); }
      console.log(`${engine} ${width}px: fast buffered-window fling passed (${frames.length} frames)`);
    }
    for (const index of [45.5, 92.25, 210.75, 350]) {
      await page.evaluate(index => {
        const viewport = document.querySelector('.workspace-scroll-viewport');
        viewport.scrollLeft = index * viewport.clientWidth / 11;
      }, index);
      await page.waitForTimeout(100);
      const frame = await page.evaluate(measureFrame);
      checkFrame(frame);
      assert.ok(frame.columns <= 55);
    }
    const previous = await page.evaluate(measureFrame);
    await page.setViewportSize({ width: width + 250, height: 900 });
    await page.waitForTimeout(250);
    const resized = await page.evaluate(measureFrame);
    checkFrame(resized);
    assert.ok(Math.abs(previous.left / previous.width - resized.left / resized.width) < 0.02);
    await page.getByRole('button', { name: /^\d+д$/ }).last().click();
    await page.waitForTimeout(250);
    const month = await page.evaluate(measureFrame);
    checkFrame(month);
    assert.ok(month.scrollWidth <= month.width + 1, 'full-month mode has no horizontal overflow');
    await page.getByRole('button', { name: '7д', exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: '→', exact: true }).click();
    await page.waitForTimeout(400);
    checkFrame(await page.evaluate(measureFrame));
    assert.deepEqual(errors, []);
    console.log(`${engine} ${width}px: tap, vertical scroll, long forecast, resize and month navigation passed`);
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
