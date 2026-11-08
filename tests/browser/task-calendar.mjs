import process from 'node:process';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';
const useWebkit = process.argv.includes('--webkit');
const server = await createServer({ root: process.cwd(), envDir: '/private/tmp', cacheDir: '/private/tmp/index12-task-calendar-vite', server: { host: '127.0.0.1', port: 5201, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = useWebkit ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5201/tests/browser/fixtures/task-calendar.html');
  const panel = page.locator('.task-panel');
  await panel.getByRole('button', { name: 'Себе', exact: true }).waitFor();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    const tones = await panel.locator('.recipient-options button').evaluateAll(buttons => buttons.map(b => ({ tone: b.dataset.tone, border: getComputedStyle(b).borderTopWidth, bg: getComputedStyle(b).backgroundColor, whiteSpace: getComputedStyle(b).whiteSpace })));
    assert.deepEqual(tones.map(t => t.tone), ['manager', 'director', 'employee']);
    assert.ok(tones.every(t => t.border === '1px' && t.whiteSpace === 'nowrap'));
    assert.equal(new Set(tones.map(t => t.bg)).size, 3);
    await page.screenshot({ path: `output/playwright/task-chips-${theme}-${useWebkit ? 'webkit' : 'chromium'}.png` });
  }
  for (const width of [320, 375, 736, 390]) {
    await page.setViewportSize({ width, height: width === 736 ? 390 : 844 });
    await page.waitForFunction(() => { const r = document.querySelector('.recipient-line').getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth; });
    const line = await panel.locator('.recipient-line').boundingBox();
    assert.ok(line.x >= 0 && line.x + line.width <= width);
    assert.ok(line.height <= 60, 'recipient chips remain on one line');
  }
  await panel.getByRole('button', { name: 'Найти сотрудника', exact: true }).tap();
  const recipient = panel.getByRole('combobox');
  assert.equal(await recipient.evaluate(e => e === document.activeElement), true);
  await recipient.fill('Вален');
  await panel.getByRole('option', { name: 'Валентина', exact: true }).tap();
  assert.equal(await panel.getByRole('button', { name: 'Срочно', exact: true }).getAttribute('data-tone'), 'urgent');
  await page.screenshot({ path: `output/playwright/task-timing-chips-${useWebkit ? 'webkit' : 'chromium'}.png` });
  await panel.getByRole('button', { name: 'К сроку', exact: true }).tap();
  await panel.getByRole('dialog', { name: 'Выберите дату' }).waitFor();
  await page.evaluate(() => window.taskCalendar.showTasks());
  const filter = panel.getByRole('button', { name: 'Фильтры', exact: true });
  await filter.tap(); await panel.getByLabel('Ответственный', { exact: true }).selectOption('employee');
  await page.touchscreen.tap(15, 650);
  assert.equal(await panel.locator('.task-filters').count(), 0, 'outside tap dismisses the popover');
  assert.equal(await panel.locator('.task-list-row').count(), 2);
  await filter.tap(); await panel.getByRole('button', { name: 'Сбросить', exact: true }).tap();
  assert.equal(await panel.locator('.task-filters').count(), 0);
  assert.equal(await panel.locator('.task-list-row').count(), 3);
  await page.evaluate(() => window.taskCalendar.showCalendar());
  await page.locator('.calendar-event').first().waitFor();
  const toggle = page.getByRole('button', { name: 'Фильтры календаря', exact: true });
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const title = await page.locator('.calendar-header h2').boundingBox(),
      controls = await page.locator('.calendar-header .calendar-filter-toggle').boundingBox();
    assert.ok(title.x + title.width <= controls.x + 1, 'calendar heading and controls do not overlap');
  }
  await page.evaluate(() => {
    for (const edge of ['left', 'right', 'top']) document.documentElement.style.setProperty(`--safe-area-${edge}`, '20px');
    document.documentElement.style.setProperty('--safe-area-bottom', '34px');
  });
  await toggle.tap();
  const drawer = await page.locator('.calendar-sidebar').boundingBox();
  assert.ok(drawer.x >= 20 && drawer.x + drawer.width <= 370);
  assert.ok(drawer.y >= 20 && drawer.y + drawer.height <= 844 - 34);
  assert.ok(drawer.y <= (await page.locator('.calendar-header').boundingBox()).y + (await page.locator('.calendar-header').boundingBox()).height + 12);
  await page.screenshot({ path: `output/playwright/calendar-filters-mobile-${useWebkit ? 'webkit' : 'chromium'}.png` });
  await page.touchscreen.tap(30, 140);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'a tap on the header dismisses filters too');
  await toggle.tap();
  const employee = page.getByLabel('Фильтр по сотруднику', { exact: true });
  await employee.selectOption('mine');
  assert.equal(await page.locator('.calendar-event').count(), 1);
  await employee.selectOption('employee');
  assert.equal(await page.locator('.calendar-event').count(), 1);
  assert.equal(await page.locator('.unscheduled button').innerText(), 'Без срока');
  await employee.selectOption('all');
  assert.equal(await page.locator('.calendar-event').count(), 2);
  await page.touchscreen.tap(10, 700);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await page.screenshot({ path: `output/playwright/calendar-chat-mobile-${useWebkit ? 'webkit' : 'chromium'}.png` });
  await page.setViewportSize({ width: 1280, height: 900 });
  await employee.selectOption('employee');
  await page.screenshot({ path: `output/playwright/calendar-chat-desktop-${useWebkit ? 'webkit' : 'chromium'}.png` });
  await employee.selectOption('all');
  const next = await page.evaluate(() => new Date(Date.parse(window.taskCalendar.tasks[1].dueDate + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10));
  const transfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.setData('application/x-index12-task', 'chat:22222222-2222-4222-8222-222222222222'); return data; });
  await page.locator(`[data-date="${next}"]`).dispatchEvent('drop', { dataTransfer: transfer });
  await page.waitForFunction(date => window.taskCalendar.tasks[1].dueDate === date, next);
  await page.locator(`[data-date="${next}"] .calendar-event`).waitFor();
  const staffTask = page.getByRole('button', { name: 'Задача Валентины', exact: true });
  assert.match(await staffTask.innerText(), /18:05/);
  await staffTask.click();
  await page.locator('.task-overview').waitFor();
  assert.equal(await page.evaluate(() => window.taskCalendar.chat.requestedTaskId), '22222222-2222-4222-8222-222222222222');
  assert.equal(await page.locator('.calendar-window').count(), 0);
  assert.deepEqual(errors, []);
  console.log(`PASS (${useWebkit ? 'webkit' : 'chromium'}): role/timing chips, touch recipient search, outside filter dismiss/reset, calendar all/mine/employee/undated tasks and original chat task navigation`);
} finally { await browser?.close(); await server.close(); }
