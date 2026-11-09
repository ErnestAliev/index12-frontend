import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const server = await createServer({ root: process.cwd(), envDir: '/private/tmp', server: { host: '127.0.0.1', port: 5209, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname !== '127.0.0.1' || route.request().resourceType() === 'image' ? route.abort() : route.continue());
  await page.goto('http://127.0.0.1:5209/tests/browser/fixtures/task-calendar.html');
  const panel = page.locator('.task-panel');
  await panel.getByRole('button', { name: 'Кому?', exact: true }).waitFor();
  assert.equal(await panel.locator('.creation-title').count(), 0);
  assert.equal(await panel.getByRole('button', { name: 'Найти сотрудника', exact: true }).count(), 0);
  await panel.getByRole('button', { name: 'Кому?', exact: true }).tap();
  await panel.getByRole('button', { name: 'Найти сотрудника', exact: true }).tap();
  await panel.getByRole('combobox', { name: 'Найти сотрудника' }).fill('Вален');
  await panel.getByRole('option', { name: 'Валентина', exact: true }).tap();
  const add = () => panel.getByRole('button', { name: 'Добавить ответственного', exact: true }).tap();
  await add();
  assert.equal(await panel.locator('.recipient-options button').filter({ hasText: 'Валентина' }).count(), 0);
  await panel.getByRole('button', { name: 'Себе', exact: true }).tap();
  await panel.getByRole('button', { name: 'Без срока', exact: true }).waitFor();
  await add();
  assert.equal(await panel.getByRole('button', { name: 'Себе', exact: true }).count(), 0);
  assert.equal(await panel.locator('.recipient-options button').count(), 1);
  await panel.getByRole('button', { name: 'Назад', exact: true }).tap();
  await panel.getByRole('button', { name: 'Убрать ответственного Валентина', exact: true }).tap();
  await panel.getByRole('button', { name: 'Без срока', exact: true }).tap();
  await panel.getByRole('button', { name: 'Без проекта', exact: true }).tap();
  const text = panel.getByRole('textbox', { name: 'Описание задачи', exact: true });
  await text.fill('Сохранённый текст задачи');
  await page.evaluate(() => {
    for (const [side, value] of Object.entries({ top: 24, bottom: 34, left: 16, right: 16 })) document.documentElement.style.setProperty('--safe-area-' + side, value + 'px');
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 410 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => document.querySelector('.codex-chat-window').getBoundingClientRect().height <= 410);
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    const geometry = await panel.evaluate(el => {
      const box = selector => el.querySelector(selector).getBoundingClientRect().toJSON();
      return { input: box('textarea'), tools: box('.description-tools'), summary: box('.draft-summary'), button: box('.task-publish'), opacity: getComputedStyle(el.querySelector('.task-publish')).opacity, font: getComputedStyle(el.querySelector('textarea')).fontSize };
    });
    assert.ok(geometry.input.height <= 112 && geometry.summary.bottom <= geometry.button.top, JSON.stringify(geometry));
    assert.ok(geometry.button.bottom <= 400 && geometry.button.x >= 16 && geometry.button.right <= 374, JSON.stringify(geometry));
    assert.ok(geometry.tools.top >= geometry.input.top && geometry.tools.bottom <= geometry.input.bottom + 1);
    assert.equal(geometry.opacity, '1'); assert.equal(geometry.font, '16px');
  }
  await panel.getByRole('button', { name: 'Убрать ответственного Эрнест', exact: true }).tap();
  await panel.getByRole('button', { name: 'Валентина', exact: true }).tap();
  assert.equal(await text.inputValue(), 'Сохранённый текст задачи');
  await panel.getByRole('button', { name: 'Поставить задачу', exact: true }).tap();
  await page.waitForFunction(() => window.taskCalendar.tasks.some(task => task.description === 'Сохранённый текст задачи'));
  const saved = await page.evaluate(() => window.taskCalendar.tasks.find(task => task.description === 'Сохранённый текст задачи'));
  assert.deepEqual(saved.assigneeIds, ['employee']);
  await page.goto('http://127.0.0.1:5209/tests/browser/fixtures/task-calendar.html');
  await page.waitForFunction(() => window.taskCalendar);
  await page.evaluate(() => { window.taskCalendar.chat.me.owner = false; });
  await panel.getByRole('button', { name: 'Себе', exact: true }).waitFor();
  assert.equal(await panel.locator('.recipient-tools-reveal,.recipient-heading-toggle,.recipient-create,.recipient-input').count(), 0, 'staff never receive owner controls');
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: owner-only disclosure, no duplicate assignees, individual removal, preserved draft, compact keyboard layout in both themes, opaque footer and staff permissions`);
} finally { await browser?.close(); await server.close(); }
