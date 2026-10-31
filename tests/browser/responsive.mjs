// Isolated responsive/touch regression check; all API traffic is mocked.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)),
  server: { host: '127.0.0.1', port: 5187, strictPort: true } });
const accounts = [
  { _id: 'cash', name: 'Наличный счет с длинным названием', initialBalance: 10875000, companyId: 'company', isExcluded: false },
  { _id: 'bank', name: 'BCC UU', initialBalance: 1111017, companyId: 'company', isExcluded: false },
  { _id: 'kaspi', name: 'Kaspi Pay', initialBalance: 73197, companyId: 'company', isExcluded: false },
];
const date = new Date();
const dateKey = `${date.getFullYear()}-${Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(date.getFullYear(), 0, 0)) / 86400000)}`;
const operations = [
  { _id: 'income', type: 'income', amount: 600000, accountId: 'cash', categoryId: 'category', cellIndex: 0 },
  { _id: 'expense', type: 'expense', amount: 270400, accountId: 'bank', categoryId: 'category', cellIndex: 1 },
  { _id: 'transfer', type: 'transfer', isTransfer: true, amount: 100000, fromAccountId: 'cash', toAccountId: 'bank', fromCompanyId: 'company', toCompanyId: 'company', cellIndex: 2 },
].map(op => ({ ...op, date: date.toISOString(), dateKey }));
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.SCROLL_TEST_CHROME ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined) });
  const context = await browser.newContext({ viewport: { width: 834, height: 1194 }, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1' });
  await context.addInitScript(() => {
    localStorage.setItem('app_data_version', '1');
    localStorage.setItem('dashboardLayout', JSON.stringify(['upcomingPayments', 'accounts', 'projects']));
    localStorage.setItem('dashboardLayout:before-v2', JSON.stringify(['accounts', 'companies', 'contractors', 'projects', 'incomeList', 'expenseList', 'transfers', 'individuals', 'categories', 'subcategories']));
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
  });
  const page = await context.newPage();
  const errors = [];
  const writes = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') writes.push(path);
    let data = [];
    if (path.endsWith('/user/appearance-themes')) data = {themes:[]};
    if (path.endsWith('/auth/me')) data = { _id: 'responsive-user', workspaceRole: 'admin', role: 'admin', createdAt: '2026-01-01' };
    if (path.endsWith('/accounts')) data = accounts;
    if (path.endsWith('/companies')) data = [{ _id: 'company', name: 'Владелец с длинным названием' }];
    if (path.endsWith('/categories')) data = [{ _id: 'category', name: 'Продажи' }, { _id: 'transfer-category', name: 'Перевод' }];
    if (path.endsWith('/events')) data = operations;
    if (path.endsWith('/snapshot')) data = { timestamp: date.toISOString(), accountBalances: { cash: 10875000, bank: 1111017, kaspi: 73197 }, companyBalances: { company: 12059214 }, individualBalances: {}, contractorBalances: {} };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('.header-dashboard');
  await page.waitForFunction(() => !document.querySelector('.section-loading-overlay'));
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dashboardLayout'))), ['accounts', 'companies', 'contractors', 'projects', 'individuals', 'categories']);
  for (const [width, height, expected] of [[768, 1024, 4], [834, 1194, 4], [1024, 1366, 4], [1024, 768, 5], [1366, 1024, 5], [1512, 982, 6]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(expected => getComputedStyle(document.querySelector('.header-dashboard')).gridTemplateColumns.split(' ').length === expected, expected);
    const geometry = await page.locator('.header-dashboard').evaluate(el => {
      const cards = [...el.querySelectorAll(':scope > .dashboard-card-wrapper')].filter(card => getComputedStyle(card).display !== 'none');
      return { count: cards.length, totals: [...el.querySelectorAll('.card-total-balance')].filter(total => total.getBoundingClientRect().width).map(total => {
        const range = document.createRange(); range.selectNodeContents(total);
        const text = range.getBoundingClientRect();
        const card = total.closest('.dashboard-card').getBoundingClientRect();
        return { text: total.textContent, fits: text.left >= card.left && text.right <= card.right, bottom: total.getBoundingClientRect().bottom, cardBottom: card.bottom };
      }) };
    });
    assert.equal(geometry.count, expected, `visible card count at ${width}x${height}`);
    assert.equal(geometry.totals.length, 2);
    for (const total of geometry.totals) assert.ok(total.fits && total.bottom <= total.cardBottom, JSON.stringify({ width, total }));
    console.log(`PASS ${width}x${height}: ${expected} cards, complete totals`);
  }
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.evaluate(async () => {
    const { useMainStore } = await import('/src/stores/mainStore.js');
    window.responsiveStore = useMainStore();
    window.responsiveStore.isHeaderExpanded = true;
  });
  await page.waitForTimeout(400);
  const expanded = await page.locator('.header-dashboard').evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight }));
  assert.ok(expanded.scroll <= expanded.height + 1, JSON.stringify(expanded));
  await page.evaluate(() => window.responsiveStore.isHeaderExpanded = false);
  await page.waitForTimeout(400);
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/tablet-portrait.png' });

  // Remove iPad identification to exercise the phone route.
  await context.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'iPhone' }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${server.resolvedUrls.local[0]}mobile`);
  await page.waitForSelector('.mobile-cell .op-chip.income');
  for (const [chip, modal, amount] of [['income', 'income', '600000'], ['expense', 'expense', '270400'], ['transfer', 'transfer', '100000']]) {
    await page.locator(`.mobile-cell .op-chip.${chip}`).first().tap();
    const popup = page.locator(`.popup-content.theme-${modal}`);
    await popup.waitFor();
    await page.waitForFunction(({ modal, amount }) => document.querySelector(`.popup-content.theme-${modal} input`)?.value.replace(/\s/g, '') === amount, { modal, amount });
    const bounds = await popup.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, `phone popup stays in viewport: ${JSON.stringify(bounds)}`);
    assert.ok(await popup.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'form content cannot overflow horizontally');
    console.log(`PASS phone tap ${chip}: correct popup and amount`);
    await page.screenshot({ path: `output/playwright/mobile-${chip}.png` });
    await page.locator('.popup-overlay').click({ position: { x: 3, y: 3 } });
    await popup.waitFor({ state: 'detached' });
  }
  const client = await context.newCDPSession(page);
  const heldChip = await page.locator('.mobile-cell .op-chip.income').first().boundingBox();
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: heldChip.x + heldChip.width / 2, y: heldChip.y + heldChip.height / 2 }] });
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.dragging-clone').count(), 1, 'holding starts a drag');
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal(await page.locator('.dragging-clone').count(), 0, 'cancelling clears the drag');
  assert.equal(await page.locator('.popup-overlay').count(), 0);
  console.log('PASS hold and cancel: drag starts and cleans up without opening a popup');

  // Real touch stream: a swipe on a chip must not open a popup or move it.
  const chip = page.locator('.mobile-cell .op-chip.income').first();
  const box = await chip.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - 35, y: point.y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.popup-overlay').count(), 0);
  assert.equal(await page.locator('.dragging-clone').count(), 0);
  assert.deepEqual(writes, [], 'opening and scrolling chips must not write data');
  assert.deepEqual(errors, []);
  console.log('PASS swipe: no popup, no clone, no data writes; no browser errors');
} finally {
  await browser?.close();
  await server.close();
}
