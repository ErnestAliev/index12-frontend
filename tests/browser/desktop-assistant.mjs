// Isolated real Vue browser flow. Every API call is synthetic unless INDEX12_ASSISTANT_TEST_API is set.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const liveApi = process.env.INDEX12_ASSISTANT_TEST_API;
const server = await createServer({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  optimizeDeps: { noDiscovery: true, include: ['vue', 'pinia'] },
  plugins: [{ name: 'assistant-test-harness', configureServer(vite) {
    vite.middlewares.use('/__assistant-test', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/__assistant-test', `<!doctype html><html data-theme="dark"><head><style>
      body{margin:0;background:#181818} #app{height:100vh;display:flex;flex-direction:column;font-family:Arial,sans-serif;color:#ccc;
      --ai-pane-bg:#181818;--ai-pane-surface:#232323;--ai-pane-surface-soft:#181818;--ai-pane-hover:#252525;--ai-pane-border:#333;--ai-pane-text:#ccc;--ai-pane-muted:#999;--color-primary:#34c759;--color-text:#ccc;--text-mute:#999;--color-background:#232323;--widget-background:#181818;--widget-border:#333;--color-background-soft:#252525}
      .reference{flex-shrink:0;border-bottom:1px solid #444}.reference:before{content:'AI';display:block;padding:8px 10px;color:#34c759;font-size:12px}
      </style></head><body><div id="app"></div><script type="module">
      import {createApp,h,ref} from 'vue';
      import {createPinia} from 'pinia';
      import DesktopAssistant from '/src/components/DesktopAssistant.vue';
      import AssistantComposer from '/src/components/AssistantComposer.vue';
      import ImportExportModal from '/src/components/ImportExportModal.vue';
      import '/src/assets/main.css';
      import {useMainStore} from '/src/stores/mainStore.js';
      const params = new URLSearchParams(location.search); const mobile = params.has('mobile');
      const app=createApp({setup(){const ai=ref('');return()=>params.has('journal') ? h(ImportExportModal) : h('div',{style:'height:100%;display:flex;flex-direction:column'},[
      h('div',{class:'reference'},h(AssistantComposer,{modelValue:ai.value,mobile,'onUpdate:modelValue':v=>ai.value=v,placeholder:'Спросите AI...'})),
      h(DesktopAssistant,{apiBaseUrl:${JSON.stringify(liveApi || '/api')},mobile})]);}});
      const pinia=createPinia();app.use(pinia);window.assistantStore=useMainStore(pinia);window.assistantStore.user={_id:'actor',currentWorkspaceId:'workspace'};window.assistantStore.exportAllOperations=async()=>({operations:[]});app.mount('#app');
      </script></body></html>`));
    });
  } }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.SCROLL_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 950 } });
  const browserErrors = [];
  page.on('pageerror', e => browserErrors.push(e.message));
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      start() { this.onresult?.({ results: [[{ transcript: 'Голосовая проверка' }]] }); }
      stop() { this.onend?.(); }
    };
  });
  if (!liveApi) await page.route('**/api/**', route => route.fulfill({contentType:'application/json',body:'[]'}));
  let connected = false, sent = [], history = [{ id: 'old-question', role: 'user', content: 'Старый вопрос' }, { id: 'old-answer', role: 'assistant', content: 'Сохранённая история' }];
  if (!liveApi) await page.route('**/api/ai/desktop/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/ai/desktop', '');
    let data = {};
    if (path === '/status') data = { connected, configured: true, reason: 'Нет связи с Codex на Mac. Запустите связку Index12.' };
    else if (path === '/chats' && request.method() === 'GET') data = { chats: [{ id: 'chat', title: 'Мой чат', threadId: 'thread' }] };
    else if (path === '/chats' && request.method() === 'POST') data = { chat: { id: 'chat', title: 'Новый чат' } };
    else if (path === '/chats/chat') data = { chat: { id: 'chat', title: 'Мой чат', threadId: 'thread' }, cachedHistory: { messages: history, nextCursor: null } };
    else if (path === '/chats/chat/jobs') {
      const body = request.postDataJSON();
      if (body.kind === 'history') data = { job: { status: 'completed', result: { messages: history, nextCursor: null } } };
      else {
        sent.push(body); history.push({ id: `user-${sent.length}`, role: 'user', content: body.message, attachments: body.attachments });
        history.push({ id: `answer-${sent.length}`, role: 'assistant', content: 'Проверка успешна' });
        data = { job: { status: 'completed', result: { text: 'Проверка успешна', threadId: 'thread' } } };
      }
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://127.0.0.1:5188/__assistant-test');
  const chat = page.getByRole('region', { name: 'Помощник Codex' });
  await chat.getByRole('button', { name: '＋ Новый чат' }).waitFor();
  if (!liveApi) {
    await chat.getByText('Сохранённая история', { exact: true }).waitFor();
    const input = chat.getByRole('textbox');
    await input.fill('Проверка Enter'); await input.press('Enter');
    await chat.getByRole('alert').waitFor();
    assert.equal(await input.inputValue(), 'Проверка Enter', 'offline send preserves the draft'); assert.equal(sent.length, 0);
    connected = true;
    await chat.getByText('Codex · подключён', { exact: true }).waitFor({ timeout: 8000 });
    await input.press('Shift+Enter'); assert.ok((await input.inputValue()).endsWith('\n')); assert.equal(sent.length, 0);
    await input.press('Enter'); await chat.getByText('Проверка успешна', { exact: true }).waitFor();
    assert.equal(sent.length, 1); assert.equal(sent[0].message, 'Проверка Enter');
    await chat.getByRole('button', { name: 'Голосовой ввод', exact: true }).click();
    assert.equal(await input.inputValue(), 'Голосовая проверка');
    await chat.getByRole('button', { name: 'Отправить', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.desktop-assistant .journal-ai-message.assistant').length === 3);
    assert.equal(sent.length, 2); assert.equal(sent[1].message, 'Голосовая проверка');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5l8AAAAASUVORK5CYII=', 'base64');
    await chat.locator('input[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
    await chat.locator('.desktop-attachments img').waitFor();
    await input.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.desktop-assistant .journal-ai-message.assistant').length === 4);
    assert.equal(sent.length, 3); assert.equal(sent[2].attachments.length, 1);
    await chat.getByRole('button', { name: 'Счета', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.desktop-assistant .journal-ai-message.assistant').length === 5);
    assert.equal(sent[3].message, 'Счета');
    for (const mobile of [false, true]) {
      if (mobile) { await page.setViewportSize({ width: 390, height: 844 }); await page.goto('http://127.0.0.1:5188/__assistant-test?mobile'); }
      await chat.getByText('Сохранённая история', { exact: true }).waitFor();
      const sizes = await page.locator('.ai-input-container').evaluateAll(elements => elements.map(el => {
        const cs = getComputedStyle(el), textarea = el.querySelector('textarea'), send = el.querySelector('.ai-send-btn');
        return { height: el.getBoundingClientRect().height, padding: cs.padding, background: cs.backgroundColor, border: cs.borderTop, send: send.getBoundingClientRect().width, fontSize: getComputedStyle(textarea).fontSize };
      }));
      assert.equal(sizes[0].height, sizes[1].height); assert.equal(sizes[0].padding, sizes[1].padding); assert.equal(sizes[0].background, sizes[1].background); assert.equal(sizes[0].send, sizes[1].send);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await mkdir('output/playwright', { recursive: true });
      await page.screenshot({ path: `output/playwright/codex-${mobile ? 'mobile' : 'desktop'}.png` });
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('http://127.0.0.1:5188/__assistant-test?journal');
    await page.getByRole('tab', { name: 'AI', exact: true }).click();
    const measure = () => page.locator('.journal-ai-pane .ai-input-container').evaluate(el => {
      const cs=getComputedStyle(el), send=el.querySelector('.ai-send-btn');
      return {height:el.getBoundingClientRect().height,padding:cs.padding,background:cs.backgroundColor,send:send.getBoundingClientRect().width,font:getComputedStyle(el.querySelector('textarea')).fontSize};
    });
    const aiStyle=await measure();
    await page.getByRole('tab', { name: 'Codex', exact: true }).click();
    await page.locator('.journal-ai-pane .desktop-assistant .ai-input-container').waitFor();
    assert.deepEqual(await measure(), aiStyle, 'AI and Codex composers match inside the real journal');
    await page.screenshot({path:'output/playwright/codex-journal.png'});
    console.log('PASS: offline history, draft preservation, automatic reconnect, Enter/Shift+Enter, button send, speech transcript, images, quick buttons, matching AI/Codex composers, mobile layout');
  } else {
    await chat.getByText('Codex · подключён', { exact: true }).waitFor();
    await chat.getByRole('button', { name: '＋ Новый чат' }).click();
    await page.waitForFunction(() => !document.querySelector('.desktop-assistant .desktop-toolbar button').disabled);
    await chat.getByRole('textbox').fill('Проверка связи интерфейса. Ответь ровно: Проверка успешна. Не используй инструменты.');
    await chat.getByRole('textbox').press('Enter');
    await chat.locator('.journal-ai-message.assistant .journal-ai-text').filter({ hasText: 'Проверка успешна' }).waitFor({ timeout: 90000 });
    await chat.getByRole('button', { name: 'Обновить связь и историю' }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('.desktop-assistant .ai-send-btn').disabled || !document.querySelector('.desktop-assistant .journal-ai-typing'));
    await chat.getByRole('button', { name: 'Обновить связь и историю' }).click();
    await chat.locator('.journal-ai-message.assistant .journal-ai-text').filter({ hasText: 'Проверка успешна' }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.desktop-assistant .journal-ai-typing'));
    const png = await page.evaluate(() => { const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#0000ff';ctx.fillRect(0,0,160,100);return canvas.toDataURL('image/png').split(',')[1]; });
    await chat.locator('input[type=file]').setInputFiles({name:'blue.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await chat.locator('.desktop-attachments img').waitFor();
    await chat.getByRole('textbox').fill('Какого цвета изображение? Ответь одним словом по-русски. Не используй инструменты.');
    await chat.getByRole('textbox').press('Enter');
    await chat.locator('.journal-ai-message.assistant .journal-ai-text').filter({hasText:/син/i}).waitFor({timeout:90000});
    await page.waitForFunction(() => !document.querySelector('.desktop-assistant .journal-ai-typing'));
    await mkdir('output/playwright', { recursive: true });
    await page.screenshot({ path: 'output/playwright/codex-live.png' });
    console.log('PASS: real browser → HTTP router → Mongo queue → shared Codex daemon → reply → canonical history in browser');
  }
  assert.deepEqual(browserErrors, []);
} finally { await browser?.close(); await server.close(); }
