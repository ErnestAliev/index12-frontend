// Actual desktop/mobile app → production HTTP handlers → isolated MongoDB.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

export async function verifyWithdrawalUi({ apiUrl, sourceId, destinationId }) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const server = await createServer({ root, envFile: false, define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiUrl) }, server: { host: '127.0.0.1', port: 5188, strictPort: true } });
  let browser, page;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.SCROLL_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: mobile, isMobile: mobile,
        ...(mobile ? { userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' } : {}) });
      await context.addInitScript(() => localStorage.setItem('app_data_version', '1'));
      page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
      const popup = page.locator('.popup-content.theme-transfer');
      const field = label => popup.locator('.base-select').filter({ has: page.locator('.placeholder, .small-label').filter({ hasText: new RegExp(`^${label}$`) }) }).first();
      const select = async (label, name) => {
        const control = field(label); await control.locator('.select-trigger').click();
        await control.locator('.list-item-wrapper').filter({ has: page.getByText(name, { exact: true }) }).click();
        await popup.locator('h3').click();
        await control.locator('.options-list').waitFor({ state: 'detached' });
      };
      await page.goto(server.resolvedUrls.local[0] + (mobile ? 'mobile' : ''));
      await page.waitForFunction(() => !document.querySelector('.section-loading-overlay'));
      const empty = page.locator(mobile ? '.mobile-cell .empty-slot' : '.day-column.today .cell-empty-space').first();
      await empty.scrollIntoViewIfNeeded(); await empty.click();
      await page.locator('.context-menu .btn-transfer').press('Enter');
      await popup.waitFor();
      await popup.getByRole('button', { name: 'Вывод из системы', exact: true }).click();
      assert.equal(await popup.locator('.base-select').count(), 1, 'withdrawal has only the source selector');
      assert.equal(await popup.getByTestId('transfer-project-field').count(), 0);
      assert.equal(await popup.getByText('Цель перевода', { exact: true }).count(), 0);
      await popup.getByRole('textbox', { name: 'Сумма, ₸', exact: true }).fill('1200');
      await select('Со счета', 'Рабочий счёт');
      if (mobile) await popup.getByRole('textbox', { name: 'Комментарий', exact: true }).fill('Комментарий с телефона');
      const bounds = await popup.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= (mobile ? 390 : 1440));
      await mkdir(`${root}/output/playwright`, { recursive: true });
      await page.screenshot({ path: `${root}/output/playwright/withdrawal-${mobile ? 'mobile' : 'desktop'}.png` });
      const response = page.waitForResponse(r => r.url().endsWith('/transfers') && r.request().method() === 'POST');
      await popup.getByRole('button', { name: 'Сохранить вывод', exact: true }).click();
      const savedResponse = await response; assert.equal(savedResponse.status(), 201);
      const saved = await savedResponse.json();
      assert.equal(saved.transferPurpose, 'withdrawal'); assert.equal(saved.transferReason, null);
      assert.equal(saved.toAccountId, null); assert.equal(saved.fromAccountId._id, sourceId);
      await popup.waitFor({ state: 'hidden' });
      const chip = page.locator(mobile ? '.mobile-cell .op-chip.transfer' : '.operation-chip.transfer').filter({ hasText: 'Вне системы' }).last();
      await chip.waitFor(); await chip.click(); await popup.waitFor();
      assert.equal(await popup.getByRole('button', { name: 'Вывод из системы', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await popup.locator('.base-select').count(), 1, 'reopening does not request a recipient or owner repair');
      const editedResponse = page.waitForResponse(r => r.url().endsWith(`/events/${saved._id}`) && r.request().method() === 'PUT');
      await popup.getByRole('textbox', { name: 'Сумма, ₸', exact: true }).fill('1300');
      await popup.getByRole('button', { name: 'Сохранить вывод', exact: true }).click();
      const edited = await (await editedResponse).json();
      assert.equal(edited.amount, 1300); assert.equal(edited.toAccountId, null);
      if (mobile) assert.equal(edited.description, 'Комментарий с телефона');
      await popup.waitFor({ state: 'hidden' });
      // The other mode still accepts a tracked personal card without a purpose dropdown.
      await chip.click(); await popup.waitFor();
      await popup.getByRole('button', { name: 'Между счетами', exact: true }).click();
      await select('На счет', 'Личная карта в учёте');
      const transferResponse = page.waitForResponse(r => r.url().endsWith(`/events/${saved._id}`) && r.request().method() === 'PUT');
      await popup.getByRole('button', { name: 'Сохранить', exact: true }).click();
      const transfer = await (await transferResponse).json();
      assert.equal(transfer.isWithdrawal, false); assert.equal(transfer.toAccountId._id, destinationId);
      assert.equal(transfer.transferReason, null);
      assert.deepEqual(errors, []);
      console.log(`PASS ${mobile ? 'mobile' : 'desktop'}: source-only withdrawal, real persistence, reopening/editing, comment, transfer conversion and viewport`);
      await context.close();
    }
  } catch (error) {
    if (page) { await page.screenshot({ path: `${root}/output/playwright/withdrawal-error.png` }); console.error((await page.locator('.popup-content').allTextContents()).join(' ').slice(-1200)); }
    throw error;
  } finally { await browser?.close(); await server.close(); }
}
