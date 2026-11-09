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
  await panel.getByRole('option', { name: 'Валентине', exact: true }).tap();
  const add = () => panel.getByRole('button', { name: 'Добавить ответственного', exact: true }).tap();
  await add();
  assert.equal(await panel.locator('.recipient-options button').filter({ hasText: 'Валентине' }).count(), 0);
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
  await panel.getByRole('button', { name: 'Валентине', exact: true }).tap();
  assert.equal(await text.inputValue(), 'Сохранённый текст задачи');
  await panel.getByRole('button', { name: 'Поставить задачу', exact: true }).tap();
  await page.waitForFunction(() => window.taskCalendar.tasks.some(task => task.description === 'Сохранённый текст задачи'));
  const saved = await page.evaluate(() => window.taskCalendar.tasks.find(task => task.description === 'Сохранённый текст задачи'));
  assert.deepEqual(saved.assigneeIds, ['employee']);
  await page.evaluate(() => { Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => innerHeight }); window.visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForFunction(() => document.querySelector('.codex-chat-window').getBoundingClientRect().height > 800);
  await page.evaluate(id => {
    const fixture = window.taskCalendar, original = fixture.teamApi.defaults.adapter;
    const messages = Array.from({ length: 30 }, (_, index) => ({ _id: crypto.randomUUID(), taskId: id, authorId: 'employee', authorName: 'Валентина', text: `Сообщение ${String(index + 1).padStart(2, '0')}`, attachments: [], createdAt: new Date(Date.UTC(2026, 10, 9, 1, index)).toISOString() }));
    fixture.teamApi.defaults.adapter = async config => config.url === '/messages' && config.params?.taskId === id ? { status: 200, data: { messages, hasMore: false } } : original(config);
    fixture.tasks.find(task => task._id === id).mentionMessageId = messages.at(-1)._id;
    fixture.chat.requestedTaskId = id;
  }, saved._id);
  const feed = panel.getByRole('region', { name: 'Чат задачи', exact: true });
  await feed.getByText('Сообщение 01', { exact: true }).waitFor();
  assert.equal(await feed.evaluate(el => el.scrollTop), 0, 'normal task entry starts at the first loaded message, not the latest mention');
  const opening = await panel.evaluate(el => { const card = el.querySelector('.task-overview').getBoundingClientRect(), first = el.querySelector('[data-message-id]').getBoundingClientRect(), feed = el.querySelector('.team-feed').getBoundingClientRect(); return { cardBottom: card.bottom, firstTop: first.top, feedTop: feed.top, overflowing: el.querySelector('.team-feed').scrollHeight > feed.height }; });
  assert.ok(opening.overflowing && opening.firstTop >= opening.cardBottom && opening.firstTop >= opening.feedTop, JSON.stringify(opening));
  await panel.locator('.task-due').waitFor();
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const [selector, opened] of [['.task-due', '.inline-choices'], ['.task-assignee', '.recipient-line'], ['.task-project-meta > button', '.task-project-picker'], ['.task-creator', '.task-author-details']]) {
      const link = panel.locator(selector);
      assert.ok((await link.evaluate(el => getComputedStyle(el).textDecorationLine)).includes('underline'));
      await link.tap(); await panel.locator(opened).waitFor();
      assert.equal(await link.getAttribute('aria-expanded'), 'true');
      await link.tap(); await panel.locator(opened).waitFor({ state: 'hidden' });
      assert.equal(await link.getAttribute('aria-expanded'), 'false');
    }
  }
  assert.equal(await page.evaluate(id => window.taskCalendar.tasks.find(task => task._id === id).version, saved._id), saved.version, 'inspection and repeated taps never save a change');
  await page.evaluate(id => { const f = window.taskCalendar, task = f.chat.state.tasks.find(task => task._id === id); task.assigneeIds = [task.creatorId]; task.assignees = [{ actorId: task.creatorId, name: task.creatorName }]; f.chat.state.tasks = [...f.tasks]; }, saved._id);
  assert.match(await panel.locator('.task-meta-row').innerText(), /Эрнест\s*\/\s*себе/);
  assert.equal(await panel.locator('.task-meta-row .task-meta-label').count(), 0);
  await panel.locator('.task-assignee').tap();
  assert.equal(await panel.getByRole('button', { name: 'Себе', exact: true }).count(), 0);
  await panel.locator('.task-assignee').tap();
  await page.evaluate(() => window.taskCalendar.showChat());
  const cover = page.locator('.task-cover').filter({ hasText: 'Сохранённый текст задачи' }).locator('.cover-details');
  assert.match(await cover.innerText(), /Эрнест\s*\/\s*себе/);
  assert.doesNotMatch(await cover.innerText(), /От:|Кому:/);
  await page.evaluate(id => { const f = window.taskCalendar, task = f.chat.state.tasks.find(task => task._id === id); task.assigneeIds.push('employee'); task.assignees.push({ actorId: 'employee', name: 'Валентина' }); f.chat.state.tasks = [...f.tasks]; }, saved._id);
  assert.match(await cover.innerText(), /От:.*Эрнест.*Кому:.*Валентине/s);
  await page.goto('http://127.0.0.1:5209/tests/browser/fixtures/task-calendar.html');
  await page.waitForFunction(() => window.taskCalendar);
  await page.evaluate(() => { window.taskCalendar.chat.me.owner = false; });
  await panel.getByRole('button', { name: 'Себе', exact: true }).waitFor();
  assert.equal(await panel.locator('.recipient-tools-reveal,.recipient-heading-toggle,.recipient-create,.recipient-input').count(), 0, 'staff never receive owner controls');
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: owner-only disclosure, no duplicate assignees, individual removal, preserved draft, compact keyboard layout in both themes, opaque footer and staff permissions`);
} finally { await browser?.close(); await server.close(); }
