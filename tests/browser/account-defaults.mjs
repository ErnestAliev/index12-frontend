// Render the actual editor against synthetic local state; inspect DOM, no screenshots.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const origin = 'http://127.0.0.1:5222';
const server = await createServer({ root: process.cwd(), envDir: '/private/tmp', server: { host: '127.0.0.1', port: 5222, strictPort: true }, plugins: [{ name: 'defaults-fixture', configureServer(s) { s.middlewares.use('/__account-defaults', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><div id="app"></div><script type="module" src="/tests/browser/fixtures/account-defaults.js"></script>'); }); } }] });
let browser;
try {
  await server.listen();
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  for (const theme of ['dark', 'light']) for (const width of [320, 390, 1280]) {
    const touch = width < 1000;
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(12000);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.goto(origin + '/__account-defaults');
    await page.evaluate(t => { document.documentElement.dataset.theme = t; document.documentElement.style.setProperty('--safe-area-bottom', '34px'); }, theme);
    const first = page.getByRole('checkbox', { name: 'Счёт по умолчанию: BCCUU', exact: true });
    const second = page.getByRole('checkbox', { name: 'Счёт по умолчанию: Второй', exact: true });
    await first.waitFor();
    assert.equal(await page.getByRole('checkbox').count(), 2);
    await first.scrollIntoViewIfNeeded();
    if (touch) await first.locator('..').tap(); else await first.click();
    if (touch) await second.locator('..').tap(); else await second.click();
    await page.waitForFunction(() => window.accountDefaults.saves.at(-1)?.filter(r => r.isDefaultForExpenses).length === 2);
    const saved = await page.evaluate(() => window.accountDefaults.saves.at(-1));
    assert.deepEqual(saved.filter(a => a.isDefaultForExpenses).map(a => a.name), ['BCCUU', 'Второй']);
    assert.ok(saved.filter(a => a.isCashRegister || a.isExcluded).every(a => a.isDefaultForExpenses === false));
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('.header-default').getBoundingClientRect();
      const cell = document.querySelector('.account-default-row .edit-default').getBoundingClientRect();
      const scroller = document.querySelector('.accounts-editor .list-editor');
      return { header: header.x + header.width / 2, cell: cell.x + cell.width / 2, height: cell.height, scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, scrollerWidth: scroller.clientWidth, contentWidth: scroller.scrollWidth };
    });
    assert.ok(Math.abs(geometry.header - geometry.cell) < 2, JSON.stringify(geometry));
    assert.ok(geometry.height >= 44);
    assert.ok(geometry.scrollWidth <= geometry.viewport, JSON.stringify(geometry));
    if (touch) assert.ok(geometry.contentWidth > geometry.scrollerWidth);
    await page.evaluate(() => { window.accountDefaults.open.value = false; });
    await page.getByRole('button', { name: 'Открыть', exact: true }).click();
    assert.ok(await first.isChecked());
    assert.ok(await second.isChecked());
    // Keyboard toggling also persists, and a non-admin cannot change defaults.
    await first.focus(); await page.keyboard.press('Space');
    await page.waitForFunction(() => window.accountDefaults.saves.at(-1)?.filter(r => r.isDefaultForExpenses).length === 1);
    await page.evaluate(() => { window.accountDefaults.main.user.workspaceRole = 'manager'; });
    assert.ok(await second.isDisabled());
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} ${theme} ${width}: multiple defaults, save/reopen, cash/hidden exclusion, column alignment, ${touch ? 'touch' : 'mouse'} and keyboard, role restriction`);
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
