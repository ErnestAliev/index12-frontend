// Run through tests/integration/project-scope.cjs --browser in the sibling backend.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

export async function verifyProjectScopeUi({ apiUrl, seed }) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const server = await createServer({ root, configFile: `${root}/vite.config.js`, envFile: false, define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiUrl) }, server: { host: '127.0.0.1', port: 5188, strictPort: true } });
  let browser, page;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.SCROLL_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
    await context.addInitScript(() => localStorage.setItem('app_data_version', '1'));
    page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    const ready = async () => {
      await page.waitForSelector('.workspace-scroll-viewport');
      await page.waitForFunction(() => !document.querySelector('.section-loading-overlay'));
      await page.waitForTimeout(400);
    };
    const field = (popup, label) => popup.locator('.base-select').filter({ has: page.locator('.placeholder, .small-label').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).first();
    const select = async (popup, label, option) => {
      const control = field(popup, label);
      await control.locator('.select-trigger').click();
      await control.locator('.list-item-wrapper').filter({ has: page.getByText(option, { exact: true }) }).click();
      await popup.locator('h3').click();
    };
    await page.goto(server.resolvedUrls.local[0]); await ready();
    const created = [];
    for (const kind of ['income', 'expense', 'transfer']) {
      const empty = page.locator('.day-column.today .cell-empty-space').first();
      await empty.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await empty.click();
      // Activate the real menu button by keyboard: moving below the timeline dismisses this existing menu.
      await page.locator(`.context-menu .btn-${kind}`).press('Enter');
      const popup = page.locator(`.popup-content.theme-${kind}`); await popup.waitFor();
      await popup.locator('input.real-input').first().fill(kind === 'income' ? '3000000' : kind === 'expense' ? '1000000' : '800');
      if (kind === 'transfer') {
        await select(popup, 'Со счета', 'Тестовый счет');
        await select(popup, 'На счет', 'Второй счет');
      } else {
        await select(popup, kind === 'income' ? 'Куда (Счет)' : 'Счет списания', 'Тестовый счет');
        await select(popup, kind === 'income' ? 'От кого' : 'Кому (Контрагент)', 'Поставщик');
        if (!(await field(popup, 'Категория').innerText()).includes('Коммуналка')) await select(popup, 'Категория', 'Коммуналка');
      }
      await select(popup, 'Проект', seed.projects[0].name);
      await select(popup, 'Проект', 'Все проекты');
      assert.equal(await field(popup, 'Проект').locator('.selected-text').innerText(), 'Все проекты');
      if (kind !== 'transfer') {
        await select(popup, 'Проект', seed.projects[1].name);
        assert.equal(await field(popup, 'Проект').locator('.selected-text').innerText(), seed.projects[1].name);
        await select(popup, 'Проект', 'Все проекты');
      }
      const savedResponse = page.waitForResponse(response => response.url() === `${apiUrl}/${kind === 'transfer' ? 'transfers' : 'events'}` && response.request().method() === 'POST');
      await popup.locator('.btn-submit').click();
      const response = await savedResponse; assert.equal(response.status(), 201, await response.text());
      const op = await response.json(); created.push(op);
      if (kind !== 'transfer') assert.equal(op.categoryId?._id, String(seed.categories.utilities._id));
      assert.equal(op.projectScope, 'all'); assert.equal(op.projectId, null); assert.equal(op.isSplitParent, false);
      await popup.waitFor({ state: 'detached' });
      await page.reload(); await ready();
      const chip = page.locator(`.operation-chip[data-operation-id="${op._id}"]`);
      await chip.scrollIntoViewIfNeeded(); await page.waitForTimeout(350); await chip.click();
      await popup.waitFor();
      assert.equal(await field(popup, 'Проект').locator('.selected-text').innerText(), 'Все проекты');
      if (kind === 'expense') {
        for (const project of seed.projects) await select(popup, 'Проект', project.name);
        const splitting = page.waitForResponse(response => response.url().endsWith(`/events/${op._id}`) && response.request().method() === 'PUT');
        await popup.locator('.btn-submit').click();
        const splitResponse = await splitting; assert.equal(splitResponse.status(), 200);
        const split = await splitResponse.json();
        assert.equal(split.isSplitParent, true); assert.equal(split.allocationChanges.operations.length, 3);
        await popup.waitFor({ state: 'detached' });
        await chip.click(); await popup.waitFor();
        await select(popup, 'Проект', 'Все проекты');
        const unsplitting = page.waitForResponse(response => response.url().endsWith(`/events/${op._id}`) && response.request().method() === 'PUT');
        await popup.locator('.btn-submit').click();
        const unsplitResponse = await unsplitting; assert.equal(unsplitResponse.status(), 200);
        const unsplit = await unsplitResponse.json();
        assert.equal(unsplit.projectScope, 'all'); assert.equal(unsplit.allocationChanges.deletedIds.length, 3);
        await popup.waitFor({ state: 'detached' });
        await chip.click(); await popup.waitFor();
        assert.equal(await field(popup, 'Проект').locator('.selected-text').innerText(), 'Все проекты');
        console.log('PASS live editing: shared payment → 3 exact allocations → shared payment; derived allocations removed');
      }
      await page.locator('.popup-overlay').click({ position: { x: 3, y: 3 } });
      await popup.waitFor({ state: 'detached' });
      console.log(`PASS browser → API → MongoDB → reload: ${kind}, exclusive All projects, one unallocated payment`);
    }
    // Desktop tooltip and journal show the shared label, not an empty project.
    await page.getByRole('button', { name: '21д', exact: true }).click();
    await page.waitForTimeout(400);
    const chip = page.locator(`.operation-chip[data-operation-id="${created[1]._id}"]`);
    await chip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await chip.hover();
    await page.getByText('Все проекты — единый платёж без распределения', { exact: true }).waitFor();
    await page.mouse.move(0, 0);
    const point = await page.evaluate(async () => {
      const { Chart } = await import('/node_modules/.vite/deps/chart__js_auto.js');
      const canvas = document.querySelector('.workspace-scroll-viewport canvas');
      const chart = Chart.getChart(canvas);
      const today = document.querySelector('.day-column.today').getBoundingClientRect();
      const rect = canvas.getBoundingClientRect();
      const x = today.x + today.width / 2 - rect.x;
      const bar = chart.getDatasetMeta(0).data.reduce((best, item) => Math.abs(item.x - x) < Math.abs(best.x - x) ? item : best);
      return { x: rect.x + bar.x, y: rect.y + (bar.y + bar.base) / 2 };
    });
    await page.mouse.move(point.x, point.y);
    await page.waitForFunction(() => [...document.querySelectorAll('div[id^="chartjs-custom-tooltip-"]')].some(el => Number(el.style.opacity) > 0 && el.textContent.includes('Все проекты')));
    console.log('PASS actual graph hover tooltip includes All projects');
    await page.mouse.move(0, 0);
    await page.locator('.import-export-btn').click();
    const journal = page.locator('.operations-table'); await journal.waitFor();
    const row = journal.locator('tbody tr').filter({ hasText: 'Все проекты' });
    assert.ok(await row.count() >= 3);
    await page.getByText('По проектам', { exact: true }).waitFor();
    await mkdir(`${root}/output/playwright`, { recursive: true });
    await page.screenshot({ path: `${root}/output/playwright/project-scope-report.png` });
    await page.locator('.modal-close-btn').click();
    // Mobile form reopens the same transfer scope and fits the phone viewport.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.resolvedUrls.local[0]}mobile`);
    const mobileTransfer = page.locator('.mobile-cell .op-chip.transfer').first();
    await mobileTransfer.waitFor(); await mobileTransfer.tap();
    const transfer = page.locator('.popup-content.theme-transfer'); await transfer.waitFor();
    await select(transfer, 'Проект', 'Все проекты');
    assert.ok((await transfer.getByTestId('transfer-project-field').innerText()).includes('Все проекты'));
    const bounds = await transfer.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.screenshot({ path: `${root}/output/playwright/project-scope-mobile.png` });
    assert.deepEqual(errors, []);
    console.log('PASS tooltips, journal/project chart, mobile transfer field and no browser errors');
  } catch (error) {
    if (page) {
      await mkdir(`${root}/output/playwright`, { recursive: true });
      await page.screenshot({ path: `${root}/output/playwright/project-scope-error.png` });
      console.error('Visible form:', (await page.locator('.popup-content').allTextContents()).join(' ').slice(-1500));
    }
    throw error;
  } finally { await browser?.close(); await server.close(); }
}
