// Run via the sibling backend's isolated MongoDB integration fixture --browser.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

export async function verifySubcategoryUi({ apiUrl, seed }) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const server = await createServer({ root, configFile: `${root}/vite.config.js`, envFile: false, define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiUrl) }, server: { host: '127.0.0.1', port: 5188, strictPort: true } });
  let browser;
  let page;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.SCROLL_TEST_CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
    await context.addInitScript(() => localStorage.setItem('app_data_version', '1'));
    page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.stack); });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      // All data is local. A mistaken production API configuration fails closed.
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return route.abort();
      return route.continue();
    });
    const ready = async () => {
      await page.waitForSelector('.workspace-scroll-viewport');
      await page.waitForFunction(() => !document.querySelector('.section-loading-overlay'));
      await page.waitForTimeout(700);
    };
    const select = async (popup, label, option) => {
      const field = popup.locator('.base-select').filter({ has: page.locator('.placeholder, .small-label').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).first();
      await field.locator('.select-trigger').click();
      await field.locator('.list-item-wrapper').filter({ has: page.getByText(option, { exact: true }) }).click();
      await popup.locator('h3').click();
    };
    await page.goto(server.resolvedUrls.local[0]); await ready();
    const emptyCell = page.locator('.day-column.today .cell-empty-space').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await emptyCell.click();
    await page.locator('.context-menu .btn-income').click();
    const income = page.locator('.popup-content.theme-income');
    await income.waitFor();
    await income.locator('input.real-input').first().fill('700');
    await select(income, 'Куда (Счет)', 'Тестовый счет');
    await select(income, 'От кого', 'Поставщик');
    await select(income, 'Категория', 'Коммуналка');
    const detail = income.getByTestId('subcategory-field');
    await detail.locator('.select-trigger').click();
    await detail.getByText('+ Добавить подкатегорию', { exact: true }).click();
    await detail.getByRole('textbox', { name: 'Название подкатегории' }).fill('Тепло');
    await detail.getByRole('button', { name: 'Сохранить подкатегорию', exact: true }).click();
    await detail.getByText('Тепло', { exact: true }).waitFor();
    const saving = page.waitForResponse(response => response.url() === `${apiUrl}/events` && response.request().method() === 'POST');
    await income.locator('.btn-submit').click();
    const savedResponse = await saving;
    assert.equal(savedResponse.status(), 201);
    const saved = await savedResponse.json();
    assert.equal(saved.subcategoryId.name, 'Тепло');
    await income.waitFor({ state: 'detached' });
    await page.reload(); await ready();
    const newChip = page.locator(`.operation-chip[data-operation-id="${saved._id}"]`);
    await newChip.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await newChip.click();
    await income.waitFor();
    assert.ok((await income.getByTestId('subcategory-field').innerText()).includes('Тепло'));
    await page.locator('.popup-overlay').click({ position: { x: 3, y: 3 } });
    await income.waitFor({ state: 'detached' });
    console.log('PASS browser → API → MongoDB → reload: income created with a new subcategory and reopened intact');

    // Historical payment can acquire detail without altering its amount.
    const oldChip = page.locator(`.operation-chip[data-operation-id="${seed.legacyId}"]`);
    await oldChip.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await oldChip.click();
    const expense = page.locator('.popup-content.theme-expense'); await expense.waitFor();
    await expense.getByTestId('subcategory-field').locator('.select-trigger').click();
    assert.equal(await expense.getByTestId('subcategory-field').getByText('Свет', { exact: true }).count(), 0, 'repair cannot use utilities detail');
    await expense.locator('h3').click();
    // Expense category is a multi-select: replace Repair with Utilities.
    await select(expense, 'Категория', 'Ремонт');
    await select(expense, 'Категория', 'Коммуналка');
    await select(expense, 'Подкатегория', 'Свет');
    const editing = page.waitForResponse(response => response.url().endsWith(`/events/${seed.legacyId}`) && response.request().method() === 'PUT');
    await expense.locator('.btn-submit').click();
    const edited = await (await editing).json();
    assert.equal(edited.subcategoryId.name, 'Свет');
    assert.equal(Math.abs(edited.amount), 120);
    await expense.waitFor({ state: 'detached' });
    console.log('PASS historical expense: related choices only, detail saved with original amount');

    await page.locator('.home-right-panel .header-expand-btn').click();
    await page.waitForFunction(() => document.querySelector('.home-header').getBoundingClientRect().height > 250);
    await page.waitForTimeout(350);
    const widget = page.locator('.header-dashboard [data-testid="subcategory-widget"]');
    await widget.waitFor();
    assert.ok((await widget.innerText()).includes('Коммуналка → Тепло'));
    assert.ok((await widget.innerText()).includes('Переводы 300'));
    await mkdir(`${root}/output/playwright`, { recursive: true });
    await page.screenshot({ path: `${root}/output/playwright/subcategory-widget.png` });
    const headerBounds = await page.locator('.home-header').boundingBox();
    const widgetBounds = await widget.boundingBox();
    assert.ok(widgetBounds.y + widgetBounds.height <= headerBounds.y + headerBounds.height + 1, 'subcategory widget is inside the expanded header');
    await page.locator('.home-right-panel .header-expand-btn').click();
    await page.waitForTimeout(350);

    // Hover the actual balance bar: its custom tooltip lists the new detail.
    const point = await page.evaluate(async () => {
      const { Chart } = await import('/node_modules/.vite/deps/chart__js_auto.js');
      const canvas = document.querySelector('.workspace-scroll-viewport canvas');
      const chart = Chart.getChart(canvas);
      const today = document.querySelector('.day-column.today').getBoundingClientRect();
      const rect = canvas.getBoundingClientRect();
      const x = today.x + today.width / 2 - rect.x;
      const bars = chart.getDatasetMeta(0).data;
      const bar = bars.reduce((best, item) => Math.abs(item.x - x) < Math.abs(best.x - x) ? item : best);
      return { x: rect.x + bar.x, y: rect.y + (bar.y + bar.base) / 2 };
    });
    await page.mouse.move(point.x, point.y);
    await page.waitForFunction(() => [...document.querySelectorAll('div[id^="chartjs-custom-tooltip-"]')].some(el => Number(el.style.opacity) > 0 && el.textContent.includes('Тепло')));
    console.log('PASS graph hover: actual custom tooltip includes the subcategory');

    await page.locator('.import-export-btn').click();
    const journal = page.locator('.operations-table'); await journal.waitFor();
    await journal.getByRole('columnheader').filter({ has: page.getByLabel('Фильтр по подкатегории') }).waitFor();
    await page.getByLabel('Фильтр по подкатегории').selectOption('Тепло');
    const rows = journal.locator('tbody tr');
    assert.equal(await rows.count(), 1);
    assert.ok((await rows.first().innerText()).includes('700'));
    assert.ok((await rows.first().innerText()).includes('Тепло'));
    await page.getByText('По подкатегориям', { exact: true }).waitFor();
    await page.screenshot({ path: `${root}/output/playwright/subcategory-report.png` });
    console.log('PASS journal and charts: separate column, detail filter, filtered amount and category/subcategory chart');
    await page.locator('.modal-close-btn').click();
    await page.locator('.home-right-panel .edit-btn').click();
    await page.getByRole('tab', { name: 'Подкатегории', exact: true }).click();
    const manager = page.getByTestId('subcategory-manager'); await manager.waitFor();
    const renamedInput = manager.getByRole('textbox', { name: 'Подкатегория Тепло', exact: true });
    await renamedInput.fill('Теплоснабжение');
    const renameResponse = page.waitForResponse(response => response.url() === `${apiUrl}/subcategories/${saved.subcategoryId._id}` && response.request().method() === 'PUT');
    await renamedInput.locator('..').getByRole('button', { name: 'Сохранить', exact: true }).click();
    assert.equal((await (await renameResponse).json()).name, 'Теплоснабжение');
    await manager.getByRole('textbox', { name: 'Подкатегория Теплоснабжение', exact: true }).waitFor();
    console.log('PASS subcategory directory: rename through the actual editor persists through the API');
    assert.deepEqual(errors, []);

    // The shared selector also appears in the mobile transfer form.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.resolvedUrls.local[0]}mobile`);
    const mobileTransfer = page.locator('.mobile-cell .op-chip.transfer').first();
    await mobileTransfer.waitFor(); await mobileTransfer.tap();
    const transfer = page.locator('.popup-content.theme-transfer'); await transfer.waitFor();
    assert.ok((await transfer.getByTestId('subcategory-field').innerText()).includes('Между счетами'));
    const bounds = await transfer.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.screenshot({ path: `${root}/output/playwright/subcategory-mobile.png` });
    assert.deepEqual(errors, []);
    console.log('PASS mobile transfer: saved detail visible and form stays inside phone viewport; no browser errors');
  } catch (error) {
    if (page) {
      await mkdir(`${root}/output/playwright`, { recursive: true });
      await page.screenshot({ path: `${root}/output/playwright/subcategory-error.png` });
      console.error('Browser state:', (await page.locator('body').innerText()).slice(0, 2500));
    }
    throw error;
  } finally { await browser?.close(); await server.close(); }
}
