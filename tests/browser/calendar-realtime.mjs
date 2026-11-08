import process from "node:process";
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

export async function verifyRealtimeCalendar({ origin, headers, cookie, scope }) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const output = `${root}output/playwright`;
  const html = `<html><head></head><body><div id="app"></div><script type="module">
    import {createApp} from '/node_modules/.vite/deps/vue.js';
    import {createPinia} from '/node_modules/.vite/deps/pinia.js';
    import Calendar from '/src/components/BusinessCalendar.vue';
    import {useBusinessStore} from '/src/stores/businessStore.js';
    import {useSocketStore} from '/src/stores/socketStore.js';
    import '/src/assets/main.css';
    const pinia=createPinia(),app=createApp(Calendar);app.use(pinia);
    const business=useBusinessStore(pinia),sockets=useSocketStore(pinia);
    business.start(${JSON.stringify(`${scope.actorId}:${scope.workspaceId}`)});sockets.connect(${JSON.stringify(scope.workspaceId)});
    window.testCalendar={business,sockets};app.mount('#app');
  </script></body></html>`;
  const server = await createServer({ root, envDir: '/private/tmp', define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(origin + '/api') }, server: { host: '127.0.0.1', port: 5173, strictPort: true }, plugins: [{ name: 'isolated-calendar-test', configureServer(server) { server.middlewares.use('/__calendar-test', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); }); } }] });
  let browser, page;
  try {
    await server.listen(); await mkdir(output, { recursive: true });
    browser = await chromium.launch({ executablePath: process.env.SCROLL_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
    await context.addCookies([{ name: 'connect.sid', value: cookie, url: origin }]);
    page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(4000);
    await page.goto('http://127.0.0.1:5173/__calendar-test', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.testCalendar?.sockets.isConnected);
    const api = async (path, body, method = 'POST') => { const response = await fetch(origin + '/api/mcp/business' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data; };
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date());
    const next = new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
    const task = await api('/tasks', { title: 'Realtime browser test', dueDate: day, startsAt: day + 'T06:00:00Z', endsAt: day + 'T07:00:00Z', idempotencyKey: 'calendar-realtime-browser' });
    const chip = page.getByRole('button', { name: 'Realtime browser test', exact: true }); await chip.waitFor();
    await chip.click(); const card = page.getByRole('dialog', { name: 'Карточка задачи', exact: true });
    await api('/tasks/' + task.id, { expectedVersion: 0, changes: { description: 'Updated remotely', dueDate: next, startsAt: next + 'T08:00:00Z', endsAt: next + 'T09:00:00Z' } }, 'PATCH');
    await page.waitForFunction(() => document.querySelector('[aria-label="Описание задачи"]')?.value === 'Updated remotely');
    assert.equal(await card.getByLabel('Дата задачи', { exact: true }).inputValue(), next);
    assert.equal(await card.getByLabel('Время начала', { exact: true }).inputValue(), '13:00');
    await card.getByLabel('Описание задачи', { exact: true }).fill('Unsaved local draft');
    await api('/tasks/' + task.id, { expectedVersion: 1, changes: { description: 'Concurrent remote version' } }, 'PATCH');
    await card.getByRole('alert').filter({ hasText: 'другом устройстве' }).waitFor();
    assert.equal(await card.getByLabel('Описание задачи', { exact: true }).inputValue(), 'Unsaved local draft');
    await card.getByRole('button', { name: 'Загрузить актуальную версию', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Описание задачи"]')?.value === 'Concurrent remote version');
    // Simulate the phone's socket sleeping; focus alone recovers the missed update.
    await page.evaluate(() => window.testCalendar.sockets.socket.disconnect());
    await api('/tasks/' + task.id, { expectedVersion: 2, changes: { title: 'Recovered after mobile wake' } }, 'PATCH');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.querySelector('[aria-label="Название задачи"]')?.value === 'Recovered after mobile wake');
    await page.evaluate(() => window.testCalendar.sockets.socket.connect());
    await page.waitForFunction(() => window.testCalendar.sockets.isConnected);
    // Joining after reconnect must reread changes made during the gap.
    await page.evaluate(() => window.testCalendar.sockets.socket.disconnect());
    await api('/tasks/' + task.id, { expectedVersion: 3, changes: { description: 'Reconnect catchup' } }, 'PATCH');
    await page.evaluate(() => window.testCalendar.sockets.socket.connect());
    await page.waitForFunction(() => document.querySelector('[aria-label="Описание задачи"]')?.value === 'Reconnect catchup');
    await page.screenshot({ path: `${output}/calendar-realtime-desktop.png` });
    await api('/tasks/' + task.id, { expectedVersion: 4 }, 'DELETE');
    await card.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Recovered after mobile wake', exact: true }).waitFor({ state: 'hidden' });
    // Workspace selected while offline must be the room used on reconnect.
    await page.evaluate(workspaceId => {
      window.calendarSignals = [];
      window.addEventListener('index12:calendar-changed', event => window.calendarSignals.push(event.detail.workspaceId));
      const sockets = window.testCalendar.sockets;
      sockets.socket.disconnect(); sockets.switchWorkspace(workspaceId, 'offline-selected-workspace'); sockets.socket.connect();
    }, scope.workspaceId);
    await page.waitForFunction(() => window.calendarSignals.includes('offline-selected-workspace'));
    await page.evaluate(() => { window.calendarSignals = []; });
    const isolated = await api('/tasks', { title: 'Workspace isolation test', dueDate: day, idempotencyKey: 'calendar-workspace-isolation' });
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => window.calendarSignals), [], 'Old workspace room must not receive notifications after offline switch');
    await page.evaluate(workspaceId => window.testCalendar.sockets.connect(workspaceId), scope.workspaceId);
    await page.getByRole('button', { name: 'Workspace isolation test', exact: true }).waitFor();
    await api('/tasks/' + isolated.id, { expectedVersion: 0 }, 'DELETE');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await api('/tasks', { title: 'Mobile realtime task', dueDate: day, idempotencyKey: 'calendar-realtime-mobile' });
    await page.locator(`[data-date="${mobile.task.dueDate}"]`).click();
    await page.getByRole('button', { name: 'Mobile realtime task', exact: true }).waitFor();
    await api('/tasks/' + mobile.id, { expectedVersion: 0, changes: { title: 'Mobile title updated' } }, 'PATCH');
    await page.getByRole('button', { name: 'Mobile title updated', exact: true }).waitFor();
    await page.screenshot({ path: `${output}/calendar-realtime-mobile.png` });
    assert.deepEqual(errors, []);
    console.log('PASS: actual browser + remote MCP + Socket.IO: create, move/time/description, open editor, concurrent draft, mobile wake, reconnect and deletion without reload');
  } catch (e) { await page?.screenshot({ path: `${output}/calendar-realtime-failure.png` }).catch(() => {}); throw e; }
  finally { await browser?.close(); await server.close(); }
}
