import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5192, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.SCROLL_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  await mkdir(`${root}/output/playwright`, { recursive: true });
  for (const fixture of [{ name: 'desktop-dark', width: 1280, height: 900 }, { name: 'desktop-light', width: 1280, height: 900, light: true }, { name: 'mobile-dark', width: 390, height: 844, mobile: true }, { name: 'mobile-light', width: 320, height: 640, mobile: true, light: true }]) {
    const context = await browser.newContext({ viewport: { width: fixture.width, height: fixture.height }, isMobile: !!fixture.mobile, hasTouch: !!fixture.mobile });
    await context.addInitScript(light => { localStorage.setItem('app_data_version', '1'); localStorage.setItem('theme', light ? 'light' : 'dark'); }, !!fixture.light);
    const page = await context.newPage(), errors = [], answers = [];
    page.on('pageerror', error => errors.push(error.message));
    let job, count = 0, sendCount = 0, prompt;
    const history = [{ id: 'hello', role: 'assistant', content: 'Тестовый чат готов.' }];
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname; let data = [];
      if (path.endsWith('/auth/me')) data = { _id: 'actor', currentWorkspaceId: 'workspace', role: 'admin', workspaceRole: 'admin', createdAt: '2026-01-01' };
      if (path.endsWith('/snapshot')) data = { timestamp: new Date().toISOString(), accountBalances: {}, companyBalances: {}, individualBalances: {}, contractorBalances: {} };
      if (path.endsWith('/codex/status')) data = { connected: true, configured: true };
      if (path.endsWith('/codex/chats')) data = { chats: [{ id: 'chat', title: 'Проверка вопросов', threadId: 'thread' }] };
      if (path.endsWith('/codex/chats/chat')) data = { chat: { id: 'chat', threadId: 'thread' }, cachedHistory: { messages: history }, ...(job?.status === 'running' ? { pendingJob: job } : {}) };
      if (path.endsWith('/codex/chats/chat/jobs')) {
        const body = request.postDataJSON();
        if (body.kind === 'history') data = { job: { status: 'completed', result: { messages: history } } };
        else {
          sendCount++; count++; history.push({ id: `user-${count}`, role: 'user', content: body.message });
          job = { id: `job-${count}`, status: 'running', pendingRequests: [{ id: `question-${count}`, prompt, expiresAt: new Date(Date.now() + 600000).toISOString() }] }; data = { job };
        }
      }
      if (/\/codex\/jobs\/job-\d+$/.test(path)) data = { job };
      if (path.endsWith('/answer')) {
        const body = request.postDataJSON(); answers.push(body);
        const text = body.action === 'accept' ? `Тестовый ответ ${count} принят.` : 'Пользователь отклонил запрос. Подтверждено выполненных действий: **0**.';
        history.push({ id: `answer-${count}`, role: 'assistant', content: text });
        job = body.action === 'accept' ? { id: job.id, status: 'completed', result: { text, threadId: 'thread' } } : { id: job.id, status: 'failed', error: 'Пользователь отклонил запрос.', result: { execution: { error: { code: 'USER_DECLINED' }, completed: [], text } } };
        data = { received: true };
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`http://127.0.0.1:5192/${fixture.mobile ? 'mobile' : ''}`);
    await page.evaluate(light => document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark'), !!fixture.light);
    await page.getByRole('button', { name: 'Открыть чат Codex' }).click();
    const dialog = page.getByRole('dialog', { name: 'Чат Codex' });
    await dialog.getByText('Тестовый чат готов.').waitFor();
    await page.waitForFunction(() => !document.querySelector('.codex-typing'));
    prompt = { kind: 'form', source: 'MCP', message: 'Разрешить доступ к тестовому интерфейсу INDEX12?', fields: [{ key: 'approve', label: 'Разрешить тестовый доступ', type: 'boolean', required: true }] };
    await dialog.getByRole('textbox', { name: 'Спросите Codex' }).fill('Проверка формы');
    await dialog.getByRole('textbox', { name: 'Спросите Codex' }).press('Enter');
    await dialog.getByText(prompt.message).waitFor();
    assert.equal(answers.length, 0, 'no automatic answer');
    await dialog.getByRole('button', { name: 'Закрыть чат Codex' }).click();
    await page.getByRole('button', { name: 'Открыть чат Codex' }).click();
    await dialog.getByText(prompt.message).waitFor();
    assert.equal(sendCount, 1, 'reopen waits for the same job without replaying the message');
    const geometry = await dialog.locator('.codex-request-card').evaluate(el => ({ width: el.getBoundingClientRect().width, scroll: el.scrollWidth, client: el.clientWidth }));
    assert.ok(geometry.scroll <= geometry.client + 1);
    await page.mouse.move(20, 20);
    await page.screenshot({ path: `${root}/output/playwright/codex-question-${fixture.name}.png`, animations: 'disabled' });
    await dialog.getByRole('combobox', { name: 'Разрешить тестовый доступ' }).selectOption({ label: 'Да' });
    await dialog.getByRole('button', { name: 'Ответить', exact: true }).click();
    await dialog.getByText('Тестовый ответ 1 принят.', { exact: true }).waitFor();
    assert.deepEqual(answers[0], { action: 'accept', values: { approve: true } });
    await page.waitForFunction(() => !document.querySelector('.codex-typing'));
    prompt = { kind: 'questions', message: 'Codex задаёт вопрос', fields: [{ key: 'period', label: 'Какой период проверить?', type: 'choice', required: true, options: [{ value: 'Октябрь', label: 'Октябрь', description: 'Весь месяц' }, { value: 'Сентябрь', label: 'Сентябрь' }] }] };
    await dialog.getByRole('textbox', { name: 'Спросите Codex' }).fill('Проверка вариантов'); await dialog.getByRole('textbox', { name: 'Спросите Codex' }).press('Enter');
    await dialog.getByRole('radio', { name: /Октябрь/ }).check();
    await dialog.getByRole('button', { name: 'Ответить', exact: true }).click();
    await dialog.getByText('Тестовый ответ 2 принят.', { exact: true }).waitFor();
    assert.deepEqual(answers[1], { action: 'accept', values: { period: 'Октябрь' } });
    await page.waitForFunction(() => !document.querySelector('.codex-typing'));
    prompt = { kind: 'approval', message: 'Разрешить Codex управлять приложением «Google Chrome»?', source: 'Управление компьютером', fields: [] };
    await dialog.getByRole('textbox', { name: 'Спросите Codex' }).fill('Проверка отказа'); await dialog.getByRole('textbox', { name: 'Спросите Codex' }).press('Enter');
    await dialog.getByText('Требуется разрешение', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Разрешить', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Ответить', exact: true }).count(), 0);
    await page.screenshot({ path: `${root}/output/playwright/codex-permission-${fixture.name}.png`, animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Отклонить', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Пользователь отклонил' }).waitFor();
    assert.equal(answers[2].action, 'decline'); assert.equal(sendCount, 3); assert.deepEqual(errors, []);
    console.log(`PASS ${fixture.name}: question shown, survives reopen, typed answer, choices, decline, no replay or auto-accept`);
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
