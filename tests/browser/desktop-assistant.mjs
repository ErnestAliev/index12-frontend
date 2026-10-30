// Synthetic API data; real Vue app and real Chromium interactions.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const liveApi = process.env.INDEX12_ASSISTANT_TEST_API;
const server = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)),
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
});
let browser, page;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.SCROLL_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const browserErrors = [], legacyRequests = [], sent = [], uploaded = new Map();
  page.on('requestfailed', r=>console.error('request failed',r.url(),r.failure()?.errorText));
  page.on('pageerror', e => { browserErrors.push(e.message); console.error('Browser error:',e.message); });
  await page.addInitScript(() => {
    localStorage.setItem('app_data_version', '1');
    window.SpeechRecognition = class {
      start() { this.onresult?.({ results: [[{ transcript: 'Голосовая проверка' }]] }); }
      stop() { this.onend?.(); }
    };
  });
  let connected = false;
  let history = [{ id: 'old-question', role: 'user', content: 'Старый вопрос' }, { id: 'old-answer', role: 'assistant', content: 'Сохранённая история' }];
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let data = [];
    if (path.startsWith('/api/ai')) { legacyRequests.push(path); return route.fulfill({ status: 404, body: '{}' }); }
    if (path.endsWith('/auth/me')) data = { _id: 'actor', name: 'Проверка', workspaceRole: 'admin', role: 'admin', currentWorkspaceId: 'workspace', createdAt: '2026-01-01' };
    if (path.endsWith('/snapshot')) data = { timestamp: new Date().toISOString(), accountBalances: {}, companyBalances: {}, individualBalances: {}, contractorBalances: {} };
    if (liveApi && path.startsWith('/api/codex')) { const response=await route.fetch({url:liveApi+path.replace('/api/codex','')});return route.fulfill({response}); }
    if (path.startsWith('/api/codex')) {
      const subpath = path.replace('/api/codex', '');
      if (subpath === '/status') data = { connected, configured: true, reason: 'Нет связи с Codex на Mac. Запустите связку Index12.' };
      else if (subpath === '/chats' && request.method() === 'GET') data = { chats: [{ id: 'chat', title: 'Мой чат', threadId: 'thread' }] };
      else if (subpath === '/chats' && request.method() === 'POST') data = { chat: { id: 'chat', title: 'Новый чат' } };
      else if (subpath === '/chats/chat') data = { chat: { id: 'chat', title: 'Мой чат', threadId: 'thread' }, cachedHistory: { messages: history, nextCursor: null } };
      else if (subpath === '/chats/chat/files') {
        const file = { fileId: crypto.randomUUID(), name: decodeURIComponent(request.headers()['x-file-name']), mimeType: request.headers()['x-file-type'], size: request.postDataBuffer().length };
        uploaded.set(file.fileId, { ...file, data: request.postDataBuffer() });
        data = { file };
      }
      else if (subpath.startsWith('/files/')) {
        const file = uploaded.get(subpath.split('/').at(-1));
        return route.fulfill({ contentType: file.mimeType, body: file.data });
      }
      else if (subpath === '/chats/chat/jobs') {
        const body = request.postDataJSON();
        if (body.kind === 'history') data = { job: { status: 'completed', result: { messages: history, nextCursor: null } } };
        else {
          sent.push(body);
          history.push({ id: `user-${sent.length}`, role: 'user', content: body.message, attachments: body.attachments });
          history.push({ id: `answer-${sent.length}`, role: 'assistant', content: 'Проверка успешна' });
          data = { job: { status: 'completed', result: { text: 'Проверка успешна', threadId: 'thread' } } };
        }
      }
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://127.0.0.1:5188/');
  checks: {
  const open = page.getByRole('button', { name: 'Открыть чат Codex' });
  try { await open.waitFor({timeout:10000}); } catch(e) { console.log((await page.locator('body').innerText()).slice(0,1800));await mkdir('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/codex-window-failed.png'});throw e; }
  assert.equal(await open.evaluate(el => el.previousElementSibling.classList.contains('receipt-btn')), true, 'Codex button is directly below receipt generator');
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Чат Codex' });
  if(liveApi){
    await dialog.getByText('Codex · подключён',{exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Новый чат'}).click();
    await page.waitForFunction(()=>!document.querySelector('.desktop-toolbar button').disabled);
    if (process.env.INDEX12_ASSISTANT_TEST_FILE) await dialog.locator('input[type=file]').setInputFiles(process.env.INDEX12_ASSISTANT_TEST_FILE);
    await dialog.getByRole('textbox').fill(process.env.INDEX12_ASSISTANT_TEST_PROMPT || 'Проверка нового окна Codex. Ответь ровно: Проверка успешна. Не используй инструменты.');
    await dialog.getByRole('textbox').press('Enter');
    await dialog.locator('.codex-message.assistant .codex-text').filter({hasText:process.env.INDEX12_ASSISTANT_TEST_EXPECTED || 'Проверка успешна'}).waitFor({timeout:90000});
    await page.waitForFunction(()=>!document.querySelector('.codex-typing'));
    await dialog.getByRole('button',{name:'Закрыть чат Codex'}).click();await open.click();
    await dialog.locator('.codex-message.assistant .codex-text').filter({hasText:process.env.INDEX12_ASSISTANT_TEST_EXPECTED || 'Проверка успешна'}).waitFor({timeout:15000});
    await page.waitForFunction(()=>!document.querySelector('.codex-typing'));
    if (process.env.INDEX12_ASSISTANT_TEST_FILE) {
      const downloadPromise = page.waitForEvent('download');
      await dialog.locator('.desktop-file-link').first().click();
      const download = await downloadPromise;
      assert.deepEqual(await readFile(await download.path()), await readFile(process.env.INDEX12_ASSISTANT_TEST_FILE));
    }
    await mkdir('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/codex-window-live.png'});
    assert.deepEqual(browserErrors,[]);console.log('PASS: standalone Codex window → new /api/codex route → real Mongo queue → shared Codex → answer → reopen history');break checks;
  }
  await dialog.getByText('Сохранённая история', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Анализ', exact: true }).count(), 0, 'no preset prompts');
  assert.equal(await page.locator('.hidden-widgets-container').count(), 0, 'no invisible legacy AI widgets');
  const input = dialog.getByRole('textbox');
  await input.fill('Проверка Enter'); await input.press('Enter');
  await dialog.getByRole('alert').waitFor();
  assert.equal(await input.inputValue(), 'Проверка Enter'); assert.equal(sent.length, 0);
  connected = true;
  await dialog.getByText('Codex · подключён', { exact: true }).waitFor({ timeout: 8000 });
  await input.press('Shift+Enter'); assert.ok((await input.inputValue()).endsWith('\n')); assert.equal(sent.length, 0);
  await input.press('Enter'); await dialog.getByText('Проверка успешна', { exact: true }).waitFor();
  assert.equal(sent.length, 1);
  await dialog.getByRole('button', { name: 'Голосовой ввод', exact: true }).click();
  assert.equal(await input.inputValue(), 'Голосовая проверка');
  await dialog.getByRole('button', { name: 'Отправить', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.codex-message.assistant').length === 3);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5l8AAAAASUVORK5CYII=', 'base64');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
  await dialog.locator('.desktop-attachments img').waitFor(); await input.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.codex-message.assistant').length === 4);
  assert.equal(sent.at(-1).attachments.length, 1);
  const before = await dialog.boundingBox();
  async function dragHandle(label, dx, dy) {
    const handle = dialog.getByRole('separator', { name: label }); const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 }); await page.mouse.up();
  }
  await dragHandle('Ширина чата Codex', -120, 0);
  const wider = await dialog.boundingBox(); assert.equal(Math.round(wider.width - before.width), 120); assert.equal(wider.height, before.height);
  await dragHandle('Высота чата Codex', 0, -80);
  const taller = await dialog.boundingBox(); assert.equal(Math.round(taller.height - wider.height), 80); assert.equal(taller.width, wider.width);
  await dialog.getByRole('separator', { name: 'Ширина чата Codex' }).focus(); await page.keyboard.press('ArrowLeft');
  const resized = await dialog.boundingBox(); assert.equal(Math.round(resized.width - taller.width), 20);
  assert.ok(Math.abs(resized.x + resized.width - (before.x + before.width)) < 1, 'right edge stays anchored');
  assert.ok(Math.abs(resized.y + resized.height - (before.y + before.height)) < 1, 'bottom edge stays anchored');
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/codex-window-desktop.png' });
  // The underlying service remains interactive: no modal backdrop or layout reflow.
  await page.getByRole('button', { name: 'Журнал операций', exact: true }).click();
  await page.locator('.operations-editor-modal').waitFor();
  assert.equal(await page.locator('.operations-editor-modal .desktop-assistant').count(), 0);
  assert.equal(await page.locator('.operations-editor-modal [role=tab]').count(), 0);
  await page.locator('.operations-editor-modal .modal-close-btn').click();
  await dialog.getByRole('button', { name: 'Закрыть чат Codex' }).click();
  await open.click(); assert.equal(Math.round((await dialog.boundingBox()).width), Math.round(resized.width));
  await dialog.focus(); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('http://127.0.0.1:5188/mobile');
  await page.getByRole('button', { name: 'Открыть чат Codex' }).click();
  await dialog.getByText('Сохранённая история', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'AI', exact: true }).count(), 0);
  assert.equal(await dialog.locator('.resize-handle').count(), 0);
  const mobileBox = await dialog.boundingBox(); assert.ok(mobileBox.width <= 390 && mobileBox.height <= 844);
  await dialog.locator('input[type=file]').setInputFiles([{ name: 'ведомость.xlsm', mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12', buffer: Buffer.from('PK\x03\x04Excel fixture') }, { name:'данные.csv', mimeType:'text/csv', buffer:Buffer.from('name,amount\nTest,100') }]);
  await dialog.locator('.desktop-file-name[title="ведомость.xlsm"]').waitFor();
  await input.fill('Мобильная проверка'); await input.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.codex-message.assistant').length === 5);
  assert.equal(sent.at(-1).message, 'Мобильная проверка');
  assert.equal(sent.at(-1).attachments.length, 2);
  await dialog.locator('.desktop-file-link').filter({hasText:'ведомость.xlsm'}).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await dialog.locator('.desktop-file-link').filter({hasText:'ведомость.xlsm'}).click();
  assert.equal((await downloadPromise).suggestedFilename(),'ведомость.xlsm');
  await page.screenshot({ path: 'output/playwright/codex-window-mobile.png' });
  await dialog.getByRole('button', { name: 'Закрыть чат Codex' }).click();
  assert.deepEqual(legacyRequests, []); assert.deepEqual(browserErrors, []);
  console.log('PASS: Codex button placement; desktop width/height/keyboard resize; saved size; service interaction; journal has no chat; mobile Codex only; no legacy API requests; history, Enter, voice transcript and images');
  }
} finally { await page?.unrouteAll({ behavior: 'ignoreErrors' }); await browser?.close(); await server.close(); }
