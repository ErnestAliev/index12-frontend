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

async function mockApi(page, beforeResponse = async () => {}) {
  // This scenario reloads an existing workspace, after its data migration.
  await page.addInitScript(() => localStorage.setItem('app_data_version', '1'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path.endsWith('/auth/me')) data = { _id: 'scroll-test', workspaceRole: 'admin', role: 'admin', createdAt: '2026-01-01' };
    if (path.endsWith('/accounts')) data = [{ _id: 'scroll-account', name: 'Test account', initialBalance: 100000, isExcluded: false }];
    if (path.endsWith('/snapshot')) data = { timestamp: new Date().toISOString(), accountBalances: { 'scroll-account': 100000 }, companyBalances: {}, individualBalances: {}, contractorBalances: {} };
    if (route.request().method() !== 'GET') data = { ...route.request().postDataJSON(), _id: `test-${path}` };
    await beforeResponse(path);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
}

function visibleCards() {
  return [...document.querySelectorAll('div[id^="chartjs-custom-tooltip-"]')]
    .filter(el => !el.id.endsWith('-backdrop') && Number(el.style.opacity) > 0)
    .map(el => ({ text: el.textContent, left: el.getBoundingClientRect().left, top: el.getBoundingClientRect().top }));
}

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

async function checkTimelineSwitcher(page) {
  const checkButtons = async () => {
    await page.locator('.vertical-resizer').hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.timeline-switcher')).opacity === '1');
    const buttons = await page.locator('.timeline-switcher .control-btn').evaluateAll(elements => elements.map(button => {
      const rect = button.getBoundingClientRect();
      const unobscured = [0.15, 0.5, 0.85].every(x => [0.15, 0.5, 0.85].every(y =>
        button.contains(document.elementFromPoint(rect.x + rect.width * x, rect.y + rect.height * y))));
      return { title: button.title, unobscured };
    }));
    assert.equal(buttons.length, 3);
    for (const button of buttons) assert.ok(button.unobscured, `switcher action is covered: ${button.title}`);
  };
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    await checkButtons();
    if (theme === 'dark' && process.env.SCROLL_TEST_SWITCHER_SCREENSHOT) {
      await page.screenshot({ path: process.env.SCROLL_TEST_SWITCHER_SCREENSHOT });
    }
    for (const [selector, direction] of [['.arrow-down-btn', 'down'], ['.arrow-up-btn', 'up']]) {
      await page.locator(`.timeline-switcher ${selector}`).click({ timeout: 2000 });
      await page.waitForFunction(direction => {
        const height = document.querySelector('.timeline-grid-wrapper').getBoundingClientRect().height;
        return direction === 'down' ? height > 318 : Math.abs(height - 100) < 1;
      }, direction);
      await checkButtons();
      await page.locator('.timeline-switcher .grip-handle').click({ timeout: 2000 });
      await page.waitForFunction(() => Math.abs(document.querySelector('.timeline-grid-wrapper').getBoundingClientRect().height - 318) < 1);
      await checkButtons();
    }
  }
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const viewport = document.querySelector('.workspace-scroll-viewport');
    viewport.scrollLeft = viewport.clientWidth / 2;
  });
  await waitForScrollStop(page);
  await checkButtons();
  await page.evaluate(() => document.querySelector('.workspace-scroll-viewport').scrollLeft = 0);
  await waitForScrollStop(page);
  await page.mouse.move(5, 5);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.timeline-switcher')).opacity === '0');
}

try {
  await server.listen();
  const executablePath = process.env.SCROLL_TEST_CHROME ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
  browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ executablePath }));
  // Hold each bootstrap stage independently: the layout must be usable before
  // entity responses and must retain its loaders while operations are pending.
  for (const width of [1916, 1024]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width === 1024,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' });
    if (width === 1024) await context.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let releaseEntities, releaseOperations;
    const entitiesReady = new Promise(resolve => { releaseEntities = resolve; });
    const operationsReady = new Promise(resolve => { releaseOperations = resolve; });
    let operationsRequested = false;
    await mockApi(page, async path => {
      if (path.startsWith('/api/events')) { operationsRequested = true; await operationsReady; }
      else if (!path.endsWith('/auth/me')) await entitiesReady;
    });
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.home-main-content');
    // Vite injects component/base CSS after module evaluation. WebKit can
    // expose the DOM before those styles while API responses are held.
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.home-layout')).display === 'flex' &&
      getComputedStyle(document.body).margin === '0px');
    const checkLoadingLayout = async () => {
      const geometry = await page.evaluate(() => {
        const viewport = document.querySelector('.workspace-scroll-viewport').getBoundingClientRect();
        const rect = selector => {
          const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
          return { x, y, width, height };
        };
        return { viewport: { x: viewport.x, width: viewport.width }, divider: rect('.divider-wrapper'),
          timeline: rect('.timeline-grid-wrapper'), graph: rect('.graph-area-wrapper'),
          loaders: [...document.querySelectorAll('.section-loading-overlay')].map(el => {
            const box = el.getBoundingClientRect();
            const spinner = el.querySelector('.spinner-small').getBoundingClientRect();
            return { x: box.x, width: box.width, center: spinner.x + spinner.width / 2 };
          }) };
      });
      assert.ok(geometry.viewport.width > page.viewportSize().width - 150);
      for (const area of [geometry.timeline, geometry.graph, geometry.divider]) {
        assert.ok(area.width >= geometry.viewport.width - 1, `pending data cannot collapse a work area: ${JSON.stringify(geometry)}`);
        assert.ok(area.height > 20, `pending data preserves area heights: ${JSON.stringify(geometry)}`);
      }
      assert.ok(Math.abs(geometry.divider.width - geometry.viewport.width) < 1, 'month controls span the viewport before data arrives');
      assert.equal(geometry.loaders.length, 2, 'both work areas keep their loaders until bootstrap completes');
      for (const loader of geometry.loaders) {
        assert.ok(Math.abs(loader.width - geometry.viewport.width) < 1);
        assert.ok(Math.abs(loader.center - geometry.viewport.x - geometry.viewport.width / 2) < 1, 'loading spinner stays centered in the visible viewport');
      }
    };
    try {
      await page.waitForTimeout(100);
      await checkLoadingLayout();
      if (width === 1916) {
        await page.waitForTimeout(5000);
        await checkLoadingLayout();
        if (process.env.SCROLL_TEST_SCREENSHOT) await page.screenshot({ path: process.env.SCROLL_TEST_SCREENSHOT });
      }
      await page.setViewportSize({ width: width - 120, height: 900 });
      await page.waitForTimeout(100);
      await checkLoadingLayout();
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(() => Math.abs(document.querySelector('.divider-wrapper').getBoundingClientRect().width -
        document.querySelector('.workspace-scroll-viewport').clientWidth) < 1);
      releaseEntities();
      const deadline = Date.now() + 5000;
      while (!operationsRequested && Date.now() < deadline) await page.waitForTimeout(50);
      assert.ok(operationsRequested, 'operation loading follows entity loading');
      await page.waitForTimeout(100);
      await checkLoadingLayout();
      releaseOperations();
      await page.waitForFunction(() => !document.querySelector('.section-loading-overlay'));
      await page.waitForSelector('.workspace-scroll-viewport canvas');
      await page.evaluate(async engine => {
        const { Chart } = await import(`/node_modules/.vite-scroll-${engine}/deps/chart__js_auto.js`);
        window.__scrollChart = Chart.getChart(document.querySelector('.workspace-scroll-viewport canvas'));
      }, engine);
      checkFrame(await page.evaluate(measureFrame));
      await checkTimelineSwitcher(page);
      assert.deepEqual(errors, []);
      console.log(`${engine} ${width}px: all three switcher actions remain unobscured in both themes, expanded states and after scrolling`);
      console.log(`${engine} ${width}px: delayed entities, delayed operations, loading resize and ready layout passed`);
    } finally {
      releaseEntities(); releaseOperations();
      await context.close();
    }
  }
  for (const width of [1024, 834]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' });
    await context.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mockApi(page);
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
    await page.waitForTimeout(3500);
    assert.equal((await page.evaluate(measureFrame)).overlays, 1, 'a tapped summary stays open until an explicit dismissal');
    await page.mouse.move(10, 10);
    await page.waitForTimeout(100);
    assert.equal((await page.evaluate(measureFrame)).overlays, 1, 'compatibility mouse movement does not dismiss a tapped summary');
    for (const edge of ['left', 'right']) {
      const point = await page.evaluate(edge => {
        const chart = window.__scrollChart;
        const rect = chart.canvas.getBoundingClientRect();
        const viewport = document.querySelector('.workspace-scroll-viewport').getBoundingClientRect();
        const columnWidth = rect.width / chart.data.labels.length;
        const index = edge === 'left' ? Math.ceil((viewport.left - rect.left) / columnWidth) : Math.floor((viewport.right - rect.left) / columnWidth) - 1;
        const center = chart.getDatasetMeta(0).data[index].getCenterPoint();
        return { x: rect.x + center.x * rect.width / chart.width, y: rect.y + center.y * rect.height / chart.height, label: chart.data.labels[index] };
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
      const cards = await page.evaluate(visibleCards);
      assert.equal(cards.length, 1);
      assert.ok(cards[0].text.includes(point.label), 'one tap on another bar replaces the displayed day');
      assert.ok(bounds.left >= bounds.viewportLeft && bounds.right <= bounds.viewportRight, 'edge tap card stays inside the visible workspace');
    }
    // Blank gutter beside the chart (the top-left corner is the menu button).
    const chartGutter = await page.locator('.chart-wrapper').boundingBox();
    await page.touchscreen.tap(5, chartGutter.y + chartGutter.height / 2);
    await page.waitForTimeout(80);
    assert.equal((await page.evaluate(measureFrame)).overlays, 0, 'a tap outside the chart and card dismisses the summary');
    await page.touchscreen.tap(target.x, target.y);
    await page.waitForTimeout(80);
    assert.equal((await page.evaluate(measureFrame)).overlays, 1, 'a dismissed summary can be reopened');

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

  for (const mobile of [true, false]) {
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1366, height: mobile ? 844 : 1000 }, hasTouch: mobile,
      ...(mobile ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' } : {}) });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mockApi(page);
    await page.goto(server.resolvedUrls.local[0]);
    const selector = mobile ? '.mobile-chart-section canvas' : '.workspace-scroll-viewport canvas';
    await page.waitForSelector(selector);
    await page.evaluate(async ({ engine, selector }) => {
      const { Chart } = await import(`/node_modules/.vite-scroll-${engine}/deps/chart__js_auto.js`);
      window.__scrollChart = Chart.getChart(document.querySelector(selector));
    }, { engine, selector });
    await page.waitForTimeout(400);
    const points = await page.evaluate(() => {
      const chart = window.__scrollChart;
      const rect = chart.canvas.getBoundingClientRect();
      return chart.getDatasetMeta(0).data.map((bar, index) => ({ x: rect.x + bar.x * rect.width / chart.width,
        y: rect.y + (bar.base - 12) * rect.height / chart.height, label: chart.data.labels[index] }))
        .filter(p => p.x > 20 && p.x < innerWidth - 20 && p.y > 0 && p.y < innerHeight - 10);
    });
    assert.ok(points.length >= 2, 'at least two graph bars are available');
    if (mobile) {
      await page.touchscreen.tap(points[0].x, points[0].y);
      await page.waitForTimeout(3500);
      let cards = await page.evaluate(visibleCards);
      assert.equal(cards.length, 1, 'phone summary has no auto-close timeout');
      assert.ok(cards[0].text.includes(points[0].label));
      await page.touchscreen.tap(cards[0].left + 30, cards[0].top + 50);
      await page.waitForTimeout(100);
      assert.equal((await page.evaluate(visibleCards)).length, 1, 'touching card content keeps it open');
      await page.touchscreen.tap(points[1].x, points[1].y);
      await page.waitForTimeout(100);
      cards = await page.evaluate(visibleCards);
      assert.equal(cards.length, 1);
      assert.ok(cards[0].text.includes(points[1].label), 'the backdrop allows another day to open with one tap');
      await page.touchscreen.tap(5, 400);
      await page.waitForTimeout(100);
      assert.equal((await page.evaluate(visibleCards)).length, 0, 'outside phone tap dismisses the card');
      await page.touchscreen.tap(points[0].x, points[0].y);
      await page.waitForTimeout(100);
      assert.equal((await page.evaluate(visibleCards)).length, 1, 'phone card can reopen after dismissal');
    } else {
      await page.mouse.move(points[0].x, points[0].y);
      await page.waitForTimeout(100);
      assert.equal((await page.evaluate(visibleCards)).length, 1, 'desktop hover still opens the summary');
      await page.mouse.move(5, 400);
      await page.waitForTimeout(2700);
      assert.equal((await page.evaluate(visibleCards)).length, 0, 'desktop hover still dismisses after leaving');
    }
    assert.deepEqual(errors, []);
    console.log(`${engine}: ${mobile ? 'phone tap persistence, day switching and outside dismissal' : 'desktop hover'} passed`);
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
