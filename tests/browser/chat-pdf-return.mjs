// Synthetic PDFs, mocked system sharing and transports; no personal documents or screenshots.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const origin = 'http://127.0.0.1:5237';
const server = await createServer({ root: process.cwd(), envDir: '/private/tmp', cacheDir: '/private/tmp/index12-chat-pdf-return', server: { host: '127.0.0.1', port: 5237, strictPort: true }, plugins: [{ name: 'pdf-return-fixture', configureServer(s) {
  s.middlewares.use('/__pdf-return', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module" src="/tests/browser/fixtures/chat-pdf-return.js"></script></body></html>'); });
} }] });
let browser;
try {
  await server.listen();
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  for (const width of [320, 390, 844, 1280]) for (const theme of ['dark', 'light']) for (const inTask of [false, true]) {
    const context = await browser.newContext({ viewport: { width, height: width === 844 ? 390 : 844 }, hasTouch: width < 1024, isMobile: width < 1024 });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(() => {
      window.sharedPdfs = [];
      Object.defineProperty(navigator, 'canShare', { value: ({ files }) => files?.[0]?.type === 'application/pdf' });
      Object.defineProperty(navigator, 'share', { value: async ({ files }) => {
        if (window.cancelShare) throw new DOMException('Cancelled', 'AbortError');
        window.sharedPdfs.push({ name: files[0].name, bytes: await files[0].text() });
      } });
    });
    await page.goto(origin + '/__pdf-return' + (inTask ? '?task=1' : ''));
    await page.evaluate(({ theme, width }) => {
      document.documentElement.dataset.theme = theme;
      for (const [side, value] of Object.entries({ top: 20, bottom: 34, left: width === 844 ? 44 : 0, right: width === 844 ? 44 : 0 })) document.documentElement.style.setProperty('--safe-area-' + side, value + 'px');
    }, { theme, width });
    const activate = locator => width < 1024 ? locator.tap() : locator.click();
    const source = inTask ? page.locator('.task-files > button').filter({ hasText: 'Договор.pdf' }) : page.locator('.team-attachment-row .team-file').filter({ hasText: 'Договор.pdf' });
    const composer = page.locator('.team-chat-conversation textarea');
    await composer.fill('Подписанный договор');
    await composer.blur();
    const open = async () => {
      await composer.blur();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (inTask && await page.getByRole('button', { name: 'Параметры задачи', exact: true }).getAttribute('aria-expanded') === 'false')
        await page.getByRole('button', { name: 'Параметры задачи', exact: true }).press('Enter');
      try { await activate(source); await page.locator('.media-pdf-preview').waitFor(); }
      catch (error) {
        console.log(await page.evaluate(() => ({ preview: document.querySelector('.media-preview-dialog')?.innerText, task: document.querySelector('.task-panel')?.className, expanded: document.querySelector('.task-heading-title')?.getAttribute('aria-expanded'), focus: document.activeElement?.tagName, source: [...document.querySelectorAll('.task-files > button, .team-file')].map(el => ({ text: el.innerText, disabled: el.disabled })), errors: [...document.querySelectorAll('[role="alert"]')].map(el => el.innerText) })));
        throw error;
      }
      await page.getByRole('button', { name: 'Поделиться', exact: true }).waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('.media-actions button').disabled);
    };
    await open();
    const dialog = page.locator('.media-preview-dialog'), button = dialog.getByRole('button', { name: 'Прикрепить подписанный PDF', exact: true });
    const geometry = await dialog.evaluate(el => {
      const box = item => { const r = item.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, width: r.width }; };
      return { dialog: box(el), buttons: [...el.querySelectorAll('.media-actions button, header button')].map(box), pdf: box(el.querySelector('iframe')) };
    });
    assert.ok(geometry.dialog.top >= 20 && geometry.dialog.bottom <= (width === 844 ? 390 : 844) - 34);
    assert.ok(geometry.pdf.height > 40, 'PDF keeps visible space in landscape');
    for (const r of geometry.buttons) {
      assert.ok(r.height >= 44 && r.width >= 44, JSON.stringify(geometry));
      assert.ok(r.left >= geometry.dialog.left && r.right <= geometry.dialog.right);
      assert.ok(r.bottom <= geometry.dialog.bottom);
    }
    await activate(dialog.getByRole('button', { name: 'Поделиться', exact: true }));
    await page.waitForFunction(() => sharedPdfs.length === 1);
    assert.equal(await page.evaluate(() => sharedPdfs.length), 1);
    assert.match(await page.evaluate(() => sharedPdfs[0].bytes), /^%PDF-/);
    assert.equal(await page.evaluate(() => pdfFixture.uploads.length), 0, 'sharing does not upload or send');
    await page.evaluate(() => { window.cancelShare = true; });
    await activate(dialog.getByRole('button', { name: 'Поделиться', exact: true }));
    assert.equal(await dialog.locator('[role="alert"]').count(), 0, 'system cancel is silent');
    const choose = async file => {
      const chooserPromise = page.waitForEvent('filechooser');
      if (width === 1280) await button.press('Enter');
      else await activate(button);
      const chooser = await chooserPromise;
      assert.equal(chooser.isMultiple(), false);
      await chooser.setFiles(file);
    };
    await choose([]);
    assert.equal(await page.evaluate(() => pdfFixture.uploads.length), 0);
    await choose({ name: 'Подпись.png', mimeType: 'image/png', buffer: Buffer.from('not a PDF') });
    assert.match(await dialog.locator('[role="alert"]').innerText(), /формате PDF/);
    assert.equal(await page.evaluate(() => pdfFixture.uploads.length), 0, 'signature images are not accepted');
    const signed = { name: 'Договор подписан.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nSIGNED DOCUMENT\n%%EOF') };
    await choose(signed);
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Убрать файл Договор подписан.pdf', exact: true }).waitFor();
    assert.equal(await composer.inputValue(), 'Подписанный договор');
    assert.equal(await page.evaluate(() => pdfFixture.sent.length), 0, 'existing Send remains explicit');
    const uploaded = await page.evaluate(() => pdfFixture.uploads[0]);
    assert.equal(uploaded.bytes, signed.buffer.toString());
    assert.notEqual(uploaded.fileId, await page.evaluate(() => pdfFixture.original.fileId));
    await activate(page.getByRole('button', { name: 'Отправить', exact: true }));
    await page.waitForFunction(() => pdfFixture.sent.length === 1);
    await page.waitForFunction(() => !document.querySelector('.team-delivery'));
    const sent = await page.evaluate(() => pdfFixture.sent[0]);
    assert.equal(sent.taskId, inTask ? await page.evaluate(() => pdfFixture.task._id) : undefined);
    assert.deepEqual(sent.fileIds, [uploaded.fileId]);
    assert.equal(sent.text, 'Подписанный договор');
    assert.equal(await source.innerText(), 'Договор.pdf');
    // A failed upload leaves an actionable error and the original available for retry.
    await page.evaluate(() => { pdfFixture.failUpload = true; });
    await open();
    await choose(signed);
    await page.locator('.team-error').waitFor();
    assert.match(await page.locator('.team-error').innerText(), /Попробуйте ещё раз/);
    assert.equal(await page.evaluate(() => pdfFixture.sent.length), 1);
    assert.equal(await page.evaluate(() => pdfFixture.uploads.length), 1);
    await page.evaluate(() => { pdfFixture.failUpload = false; pdfFixture.holdUpload = true; });
    await open();
    await choose(signed);
    await page.waitForFunction(() => !!pdfFixture.releaseUpload);
    await page.evaluate(() => { pdfFixture.chat.me = { ...pdfFixture.chat.me, workspaceId: 'another-workspace' }; pdfFixture.releaseUpload(); });
    await page.waitForFunction(() => !document.querySelector('.team-upload-state'));
    assert.equal(await page.getByRole('button', { name: 'Убрать файл Договор подписан.pdf', exact: true }).count(), 0, 'upload from previous workspace cannot enter a new draft');
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} ${width} ${theme} ${inTask ? 'task' : 'chat'}: share/cancel, PDF picker, exact bytes, explicit send, original preserved, errors and workspace guard`);
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
