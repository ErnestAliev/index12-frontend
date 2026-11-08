// DOM-only flow with synthetic data; no screenshots or production requests.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const server = await createServer({ root: process.cwd(), envDir: '/private/tmp', cacheDir: '/private/tmp/index12-subtasks-vite', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width === 390, isMobile: width === 390 });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/tests/browser/fixtures/task-calendar.html`);
    await page.waitForFunction(() => window.taskCalendar);
    await page.evaluate(() => {
      const fixture = window.taskCalendar, parent = fixture.tasks[0];
      fixture.messages.push({ _id: parent._id, taskId: parent._id, kind: 'task', authorId: parent.creatorId, authorName: parent.creatorName, createdAt: parent.createdAt, text: '', attachments: [] });
      fixture.showChat();
      fixture.chat.requestedTaskId = parent._id;
    });
    const parentId = await page.evaluate(() => window.taskCalendar.tasks[0]._id);
    await page.getByRole('button', { name: 'Добавить в чат', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Новая подзадача', exact: true }).click();
    await page.getByRole('button', { name: 'Себе', exact: true }).click();
    await page.getByRole('button', { name: 'Срочно', exact: true }).click();
    await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
    await page.getByRole('textbox', { name: 'Описание задачи', exact: true }).fill('Подготовить акт для основной задачи');
    await page.getByRole('button', { name: 'Поставить подзадачу', exact: true }).click();
    await page.locator('.task-subtask-row').waitFor();
    assert.equal(await page.evaluate(() => window.taskCalendar.chat.requestedTaskId), parentId, 'return to parent after creation');
    const childId = await page.evaluate(() => window.taskCalendar.tasks.find(t => t.parentTaskId)._id);
    assert.equal(await page.locator('.task-subtask-row').count(), 1);
    await page.locator('.task-subtask-row').click();
    await page.locator('.task-parent-link').waitFor();
    assert.equal(await page.evaluate(() => window.taskCalendar.chat.requestedTaskId), childId);
    await page.getByRole('combobox', { name: 'Статус задачи', exact: true }).click();
    await page.getByRole('option', { name: 'В процессе', exact: true }).click();
    assert.equal(await page.evaluate(() => window.taskCalendar.tasks[0].status), 'open');
    await page.getByRole('button', { name: 'Добавить подзадачу', exact: true }).click();
    await page.getByRole('button', { name: 'Себе', exact: true }).click();
    await page.getByRole('button', { name: 'Без срока', exact: true }).click();
    await page.getByRole('textbox', { name: 'Описание задачи', exact: true }).fill('Вложенная подзадача');
    await page.getByRole('button', { name: 'Поставить подзадачу', exact: true }).click();
    await page.getByRole('button', { name: 'Вложенная подзадача', exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.taskCalendar.chat.requestedTaskId), childId);
    assert.equal(await page.evaluate(() => window.taskCalendar.tasks.at(-1).parentTaskId), childId);
    await page.getByRole('button', { name: 'Добавить подзадачу', exact: true }).click();
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    assert.equal(await page.evaluate(() => window.taskCalendar.chat.requestedTaskId), childId, 'cancel returns to immediate parent');
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    assert.equal(await page.evaluate(() => window.taskCalendar.chat.requestedTaskId), parentId);
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await page.locator('.task-cover').waitFor();
    assert.equal(await page.locator('.task-cover').count(), 1, 'no extra cards in the general chat');
    await page.getByRole('button', { name: 'Подзадачи: 1', exact: true }).click();
    await page.locator('.task-subtask-row').waitFor();
    assert.equal(await page.evaluate(() => window.taskCalendar.chat.requestedTaskId), parentId);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: mobile/desktop subtask creation, delegation flow, urgent deadline, nested parent links, cancellation, navigation and uncluttered general chat');
} finally { await browser?.close(); await server.close(); }
