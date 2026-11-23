// Real PDF parsing/editing and DOM geometry, synthetic transport/assets; no screenshots or live messages.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const origin = 'http://127.0.0.1:5237';
const server = await createServer({ root: process.cwd(), envDir: '/private/tmp', cacheDir: '/private/tmp/index12-chat-pdf-render', server: { host: '127.0.0.1', port: 5237, strictPort: true }, plugins: [{ name: 'pdf-return-fixture', configureServer(s) {
  s.middlewares.use('/__pdf-return', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module" src="/tests/browser/fixtures/chat-pdf-return.js"></script></body></html>'); });
} }] });
let browser;
try {
  await server.listen();
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const sizes = process.argv.includes('--smoke') ? [[390, 844]] : [[320, 844], [390, 844], [844, 390], [834, 1112], [1280, 900]];
  for (const [width, height] of sizes) for (const theme of (process.argv.includes('--smoke') ? ['dark'] : ['dark', 'light'])) for (const inTask of [false, true]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1024, isMobile: width < 1024 });
    const page = await context.newPage(), errors = [], remote = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin || url.protocol === 'blob:') return route.continue();
      if (url.hostname !== 'fonts.googleapis.com') remote.push(url.href);
      return route.abort();
    });
    await page.addInitScript(() => {
      window.sharedPdfs = [];
      Object.defineProperty(navigator, 'canShare', { value: ({ files }) => files?.[0]?.type === 'application/pdf' });
      Object.defineProperty(navigator, 'share', { value: async data => {
        if (window.cancelShare) throw new DOMException('Cancelled', 'AbortError');
        window.sharedPdfs.push({ keys: Object.keys(data), name: data.files[0].name, bytes: Array.from(new Uint8Array(await data.files[0].arrayBuffer())) });
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
    await composer.fill('Подписанный договор'); await composer.blur();
    const dialog = page.locator('.media-preview-dialog');
    const open = async () => {
      await composer.blur();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (inTask && await page.getByRole('button', { name: 'Параметры задачи', exact: true }).getAttribute('aria-expanded') === 'false') await page.getByRole('button', { name: 'Параметры задачи', exact: true }).press('Enter');
      await activate(source);
      try { await page.waitForFunction(() => !!document.querySelector('.pdf-scroll canvas')?.width && !document.querySelector('.media-actions button')?.disabled); }
      catch (error) { console.log({ errors, dom: await dialog.innerText() }); throw error; }
      await page.waitForFunction(() => ![...document.querySelectorAll('.media-actions button')].find(button => button.textContent.includes('Подпись / печать'))?.disabled);
    };
    async function fits(format) {
      const geometry = await page.locator('.pdf-scroll').evaluate(el => {
        const box = item => { const r = item.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        return { stage: box(el), sheet: box(el.querySelector('.page')), scroll: el.scrollLeft, body: box(el.closest('dialog')) };
      });
      const { stage, sheet, body } = geometry;
      assert.ok(sheet.left >= stage.left - 1 && sheet.right <= stage.right + 1 && sheet.top >= stage.top - 1 && sheet.bottom <= stage.bottom + 1, JSON.stringify(geometry));
      const ratio = format === 'landscape' || format === 'rotated' ? 842 / 595 : 595 / 842;
      assert.ok(Math.abs(sheet.width - sheet.height * ratio) < 2, JSON.stringify({ format, geometry }));
      assert.ok(sheet.width > 40 && sheet.height > 40 && (Math.abs(sheet.width - stage.width) < 2 || Math.abs(sheet.height - stage.height) < 2), JSON.stringify(geometry));
      assert.ok(body.top >= 20 && body.bottom <= height - 34 + 1, JSON.stringify(geometry));
      assert.equal(geometry.scroll, 0);
      assert.equal(await dialog.locator('iframe').count(), 0, 'no browser PDF/blob viewer to crop pages or share its source URL');
    }
    await open(); await fits('portrait');
    const controls = await dialog.locator('header button, .media-actions button').evaluateAll(items => items.map(item => {
      const r = item.getBoundingClientRect(); return { width: r.width, height: r.height, left: r.left, right: r.right };
    }));
    const dialogBox = await dialog.boundingBox();
    assert.ok(controls.every(r => r.width >= 44 && r.height >= 44 && r.left >= dialogBox.x && r.right <= dialogBox.x + dialogBox.width + 1), JSON.stringify(controls));
    if (height > 700) {
      await page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => innerHeight - 300 }); visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForFunction(() => document.querySelector('.media-preview-dialog').getBoundingClientRect().bottom <= innerHeight - 300 + 1);
      await page.waitForFunction(() => { const s = document.querySelector('.pdf-scroll').getBoundingClientRect(), p = document.querySelector('.pdf-scroll .page').getBoundingClientRect(); return p.top >= s.top - 1 && p.bottom <= s.bottom + 1; });
      await fits('portrait');
      await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForFunction(() => document.querySelector('.media-preview-dialog').getBoundingClientRect().bottom > innerHeight - 100);
    }
    const initialWidth = (await dialog.locator('.page').first().boundingBox()).width;
    if (width < 1024) {
      await dialog.locator('.pdf-scroll').evaluate(el => {
        const rect = el.getBoundingClientRect(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const fire = (type, gap) => {
          const points = gap ? [-1, 1].map((side, i) => ({ identifier: i, target: el, clientX: cx + side * gap, clientY: cy, screenX: cx + side * gap, screenY: cy, pageX: cx + side * gap, pageY: cy })) : [];
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperties(event, { touches: { value: points }, changedTouches: { value: points } }); el.dispatchEvent(event);
        };
        fire('touchstart', 30); fire('touchmove', 60); fire('touchmove', 90); fire('touchmove', 120); fire('touchend', 0);
      });
    } else {
      await dialog.locator('.pdf-scroll').dispatchEvent('wheel', { deltaY: -90, ctrlKey: true });
    }
    await page.waitForFunction(initial => document.querySelector('.pdf-scroll .page').getBoundingClientRect().width > initial * 1.2, initialWidth);
    await activate(dialog.getByRole('button', { name: 'Вписать страницу целиком', exact: true }));
    await fits('portrait');
    await activate(dialog.getByRole('button', { name: 'Поделиться', exact: true }));
    await page.waitForFunction(() => sharedPdfs.length === 1);
    assert.deepEqual(await page.evaluate(() => sharedPdfs[0].keys), ['files'], 'external share contains no URL, blob URL, title or caption');
    assert.equal(Buffer.from(await page.evaluate(() => sharedPdfs[0].bytes)).toString(), await page.evaluate(() => pdfFixture.originalBytes));
    const image = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 80;
      const ctx = canvas.getContext('2d'); ctx.strokeStyle = '#123a80'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(5, 60); ctx.lineTo(70, 20); ctx.lineTo(100, 60); ctx.lineTo(220, 20); ctx.stroke();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const selectImage = async file => {
      const choosing = page.waitForEvent('filechooser');
      await activate(dialog.getByRole('button', { name: 'Подпись / печать', exact: true }));
      const chooser = await choosing; await chooser.setFiles(file);
    };
    const drag = async (locator, dx, dy) => {
      const r = await locator.boundingBox(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (width >= 1024) {
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
      } else {
        const event = (x, y) => ({ pointerType: 'touch', pointerId: 7, isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, screenX: x, screenY: y });
        await locator.dispatchEvent('pointerdown', event(x, y));
        for (let step = 1; step <= 8; step++) await page.locator('html').dispatchEvent('pointermove', event(x + dx * step / 8, y + dy * step / 8));
        await page.locator('html').dispatchEvent('pointerup', event(x + dx, y + dy));
      }
    };
    await selectImage([]);
    assert.equal(await dialog.locator('.stampEditor').count(), 0, 'cancel does not insert a mark');
    await selectImage({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await dialog.locator('.pdf-error').waitFor();
    assert.equal(await dialog.locator('.stampEditor').count(), 0);
    await selectImage({ name: 'signature.png', mimeType: 'image/png', buffer: Buffer.from(image) });
    await dialog.locator('.stampEditor canvas').waitFor();
    const beforeMove = await dialog.locator('.stampEditor').boundingBox();
    await drag(dialog.locator('.stampEditor canvas'), 18, 24);
    const afterMove = await dialog.locator('.stampEditor').boundingBox();
    assert.ok(Math.abs(afterMove.x - beforeMove.x) > 5 || Math.abs(afterMove.y - beforeMove.y) > 5, 'signature can be repositioned');
    await drag(dialog.locator('.stampEditor .resizer.bottomRight'), 24, 10);
    const resized = await dialog.locator('.stampEditor').boundingBox();
    assert.ok(Math.abs(resized.width - afterMove.width) > 5, 'signature can be resized');
    await activate(dialog.locator('.stampEditor .deleteButton'));
    assert.equal(await dialog.locator('.stampEditor').count(), 0, 'signature can be deleted');
    await activate(dialog.getByRole('button', { name: 'Отменить действие в PDF', exact: true }));
    await dialog.locator('.stampEditor canvas').waitFor();
    await dialog.getByRole('button', { name: 'Готово', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => pdfFixture.uploads.length), 0, 'signature image never uploads separately');
    assert.ok(await dialog.getByRole('button', { name: 'Поделиться', exact: true }).isDisabled(), 'do not share the original while edits are pending');
    page.once('dialog', question => question.dismiss());
    await activate(dialog.getByRole('button', { name: 'Закрыть договор.pdf', exact: true }));
    assert.equal(await dialog.count(), 1, 'cancel closing keeps unsaved edits');
    await activate(dialog.getByRole('button', { name: 'Готово', exact: true }));
    await dialog.getByRole('button', { name: 'В чат', exact: true }).waitFor();
    await activate(dialog.getByRole('button', { name: 'Поделиться', exact: true }));
    await page.waitForFunction(() => sharedPdfs.length === 2);
    assert.deepEqual(await page.evaluate(() => sharedPdfs[1].keys), ['files']);
    assert.match(await page.evaluate(() => sharedPdfs[1].name), /подписан\.pdf$/);
    await page.evaluate(() => { pdfFixture.failUpload = true; });
    await activate(dialog.getByRole('button', { name: 'В чат', exact: true }));
    await dialog.locator('.media-action-error').waitFor();
    assert.match(await dialog.locator('.media-action-error').innerText(), /Попробуйте ещё раз/);
    assert.equal(await page.evaluate(() => pdfFixture.uploads.length), 0);
    assert.equal(await dialog.locator('.page').count(), 1, 'failed upload preserves the signed PDF for retry');
    await page.evaluate(() => { pdfFixture.failUpload = false; });
    await activate(dialog.getByRole('button', { name: 'В чат', exact: true }));
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Убрать файл Договор — подписан.pdf', exact: true }).waitFor();
    assert.equal(await composer.inputValue(), 'Подписанный договор');
    assert.equal(await page.evaluate(() => pdfFixture.sent.length), 0);
    const prepared = await page.evaluate(async () => {
      const { loadPdf } = await import('/src/utils/pdfPreview.js');
      const source = pdfFixture.uploads[0];
      const loading = loadPdf(new Uint8Array(source.bytes));
      const doc = await loading.promise;
      const page = await doc.getPage(1);
      const result = { count: doc.numPages, annotations: await page.getAnnotations(), text: (await page.getTextContent()).items.map(item => item.str).join(' '), uploaded: source.fileId, original: pdfFixture.original.fileId };
      await loading.destroy(); return result;
    });
    assert.equal(prepared.count, 1);
    assert.match(prepared.text, /ORIGINAL DOCUMENT/);
    const stamp = prepared.annotations.find(annotation => annotation.subtype === 'Stamp');
    assert.ok(stamp && stamp.rect[2] > stamp.rect[0] && stamp.rect[3] > stamp.rect[1], JSON.stringify(prepared.annotations));
    assert.equal(stamp.hasAppearance, true, 'saved stamp has a PDF appearance for other PDF applications');
    assert.notEqual(prepared.uploaded, prepared.original);
    await activate(page.getByRole('button', { name: 'Отправить', exact: true }));
    await page.waitForFunction(() => pdfFixture.sent.length === 1 && !document.querySelector('.team-delivery'));
    const sent = await page.evaluate(() => pdfFixture.sent[0]);
    assert.deepEqual(sent.fileIds, [prepared.uploaded]);
    assert.equal(sent.taskId, inTask ? await page.evaluate(() => pdfFixture.task._id) : undefined);
    assert.equal(sent.text, 'Подписанный договор');
    await activate(page.locator('.team-attachment-row .team-file').filter({ hasText: 'Договор — подписан.pdf' }));
    await page.waitForFunction(() => !!document.querySelector('.pdf-scroll canvas')?.width && ![...document.querySelectorAll('.media-actions button')].find(button => button.textContent.includes('Подпись / печать'))?.disabled);
    assert.ok(await dialog.getByRole('button', { name: 'Готово', exact: true }).isDisabled(), 'opening an already signed document does not change it');
    await activate(dialog.getByRole('button', { name: 'Закрыть договор — подписан.pdf', exact: true }));
    for (const format of ['landscape', 'rotated', 'multiple']) {
      await page.evaluate(format => pdfFixture.setFormat(format), format);
      await open(); await fits(format);
      if (format === 'multiple') {
        assert.equal(await dialog.locator('.page').count(), 3);
        await dialog.locator('.pdf-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.waitForFunction(() => document.querySelector('.pdf-page-number')?.textContent.includes('3 / 3'));
      }
      await activate(dialog.getByRole('button', { name: 'Закрыть договор.pdf', exact: true }));
    }
    if (width === 390 && theme === 'dark') {
      await page.evaluate(() => pdfFixture.setFormat('portrait'));
      await open();
      await selectImage({ name: 'stamp.png', mimeType: 'image/png', buffer: Buffer.from(image) });
      await activate(dialog.getByRole('button', { name: 'Готово', exact: true }));
      await page.evaluate(() => { pdfFixture.holdUpload = true; });
      await activate(dialog.getByRole('button', { name: 'В чат', exact: true }));
      await page.waitForFunction(() => !!pdfFixture.releaseUpload);
      await page.evaluate(() => { pdfFixture.chat.me = { ...pdfFixture.chat.me, workspaceId: 'another-workspace' }; pdfFixture.releaseUpload(); });
      await dialog.waitFor({ state: 'detached' });
      await page.waitForFunction(() => !document.querySelector('.team-upload-state'));
      assert.equal(await page.getByRole('button', { name: 'Убрать файл Договор — подписан.pdf', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => pdfFixture.sent.length), 1, 'late upload cannot enter or send from a different workspace');
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, [], 'all PDF bytes, fonts and resources stay on our origin');
    console.log(`PASS ${engine} ${width}×${height} ${theme} ${inTask ? 'task' : 'chat'}: fitted page formats, real image stamp, editable PDF save, file-only external share and same-discussion send`);
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
