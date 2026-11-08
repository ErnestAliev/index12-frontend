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
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5201/tests/browser/fixtures/task-calendar.html');
  const panel = page.locator('.task-panel');
  await panel.getByRole('button', { name: 'Себе', exact: true }).waitFor();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    const tones = await panel.locator('.recipient-options button').evaluateAll(buttons => buttons.map(b => ({ tone: b.dataset.tone, border: getComputedStyle(b,'::before').borderTopWidth, bg: getComputedStyle(b,'::before').backgroundColor, whiteSpace: getComputedStyle(b).whiteSpace })));
    assert.deepEqual(tones.map(t => t.tone), ['manager', 'director', 'employee']);
    assert.ok(tones.every(t => t.border === '1px' && t.whiteSpace === 'nowrap'));
    assert.equal(new Set(tones.map(t => t.bg)).size, 3);
    assert.ok(await panel.locator('.task-choice-chip').first().evaluate(el => el.getBoundingClientRect().height - 14 <= 32));
    await page.screenshot({ path: `output/playwright/task-chips-${theme}-${useWebkit ? 'webkit' : 'chromium'}.png` });
  }
  for (const width of [320, 375, 736, 390]) {
    await page.setViewportSize({ width, height: width === 736 ? 390 : 844 });
    await page.waitForFunction(() => { const r = document.querySelector('.recipient-line').getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth; });
    const line = await panel.locator('.recipient-line').boundingBox();
    assert.ok(line.x >= 0 && line.x + line.width <= width);
    assert.ok(line.height <= 50, 'recipient chips remain on one line');
  }
  await panel.getByRole('button', { name: 'Найти сотрудника', exact: true }).tap();
  const recipient = panel.getByRole('combobox');
  assert.equal(await recipient.evaluate(e => e === document.activeElement), true);
  await recipient.fill('Вален');
  await panel.getByRole('option', { name: 'Валентина', exact: true }).tap();
  assert.equal(await panel.getByRole('button', { name: 'Срочно', exact: true }).getAttribute('data-tone'), 'urgent');
  assert.equal(await panel.locator('.inline-choices .task-choice-chip > .task-chip-label').count(), 3, 'all chip labels paint above the tinted surface');
  await page.screenshot({ path: `output/playwright/task-timing-chips-${useWebkit ? 'webkit' : 'chromium'}.png` });
  const deadline = await panel.getByRole('button', { name: 'К сроку', exact: true }).boundingBox();
  await page.touchscreen.tap(deadline.x + deadline.width / 2, deadline.y + 3);
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
  await page.locator('.mobile-agenda-task').first().waitFor();
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
  assert.equal(await page.locator('.mobile-agenda-task').count(), 1);
  await employee.selectOption('employee');
  assert.equal(await page.locator('.mobile-agenda-task').count(), 1);
  assert.equal(await page.locator('.calendar-sidebar h3').count(), 1, 'only the separate undated list keeps its heading');
  assert.equal(await employee.locator('option').first().innerText(), 'Все сотрудники');
  assert.equal(await page.getByLabel('Фильтр по контрагенту').locator('option').first().innerText(), 'Все контрагенты');
  assert.ok(drawer.height < 320, 'mobile filters stay compact');
  await employee.selectOption('all');
  assert.equal(await page.locator('.mobile-agenda-task').count(), 2);
  await page.touchscreen.tap(10, 700);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await page.screenshot({ path: `output/playwright/calendar-chat-mobile-${useWebkit ? 'webkit' : 'chromium'}.png` });
  assert.equal(await page.locator('.calendar-event:visible').count(), 0, 'mobile day cells have no task buttons');
  assert.ok((await page.locator('.mobile-agenda').boundingBox()).height > 300, 'agenda receives the remaining screen space');
  await page.getByRole('button', { name: 'Без даты', exact: true }).tap();
  assert.equal(await page.locator('.mobile-agenda-task>span').innerText(), 'Без срока');
  const today = await page.evaluate(() => window.taskCalendar.tasks[0].dueDate);
  await page.locator(`[data-date="${today}"]`).tap();
  assert.equal(await page.locator('.task-popover').count(), 0, 'selecting a date does not accidentally open a task');
  assert.equal(await page.locator('.mobile-agenda-task').count(), 2);
  await page.locator('.mobile-agenda-task').filter({ hasText: 'Задача Валентины' }).tap();
  const card = page.getByRole('dialog', { name: 'Карточка задачи', exact: true });
  await card.waitFor(); assert.equal(await page.locator('.calendar-window').count(), 1);
  await card.getByLabel('Текст задачи', { exact: true }).fill('Изменено из календаря');
  await page.waitForFunction(() => window.taskCalendar.tasks[1].description === 'Изменено из календаря');
  await card.getByLabel('Время задачи', { exact: true }).fill('16:20');
  await page.waitForFunction(() => window.taskCalendar.tasks[1].dueTime === '16:20');
  await card.getByRole('button', { name: 'Снимок.png', exact: true }).tap();
  await page.waitForFunction(() => document.querySelector('dialog[aria-label="Снимок.png"] img')?.naturalWidth > 0);
  await page.getByRole('button', { name: 'Закрыть снимок.png', exact: true }).tap();
  await card.getByRole('combobox', { name: 'Статус задачи', exact: true }).selectOption('progress');
  await page.waitForFunction(() => window.taskCalendar.tasks[1].status === 'progress');
  await page.screenshot({ path: `output/playwright/calendar-task-inline-${useWebkit ? 'webkit' : 'chromium'}.png` });
  await card.getByRole('button', { name: 'Удалить задачу', exact: true }).tap();
  await card.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Удалённые задачи', exact: true }).tap();
  const trash = page.getByRole('dialog', { name: 'Удалённые задачи', exact: true });
  await trash.getByRole('searchbox', { name: 'Поиск удалённых задач' }).tap();
  assert.equal(await trash.getByRole('searchbox').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
  await page.screenshot({ path: `output/playwright/calendar-deleted-tasks-${useWebkit ? 'webkit' : 'chromium'}.png` });
  await trash.getByRole('button', { name: 'Восстановить Изменено из календаря', exact: true }).tap();
  await trash.getByText('Нет удалённых задач', { exact: true }).waitFor();
  await trash.getByRole('button', { name: 'Закрыть удалённые задачи', exact: true }).tap();
  assert.equal(await page.locator('.mobile-agenda-task').count(), 2);
  await page.evaluate(async () => {
    const base = window.taskCalendar.tasks[1];
    for (let i = 0; i < 8; i++) window.taskCalendar.tasks.push({ ...base, _id: crypto.randomUUID(), description: `Задача ${i + 1}`, dueTime: `${String(i + 8).padStart(2,'0')}:00` });
    await window.taskCalendar.business.refresh();
  });
  assert.equal(await page.locator('.mobile-agenda-task').count(), 10);
  const list = page.locator('.mobile-agenda-list');
  assert.ok(await list.evaluate(el => el.scrollHeight > el.clientHeight));
  await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: `output/playwright/calendar-ten-tasks-${useWebkit ? 'webkit' : 'chromium'}.png` });
  for (const dimensions of [{ width: 320, height: 568 }, { width: 736, height: 390 }]) {
    await page.setViewportSize(dimensions);
    const agenda = await page.locator('.mobile-agenda').boundingBox();
    assert.ok(agenda.width > 100 && agenda.height > 140, 'short screens keep a usable agenda');
    assert.equal(await page.locator('.calendar-event:visible').count(), 0);
    await page.screenshot({ path: `output/playwright/calendar-${dimensions.width}-${useWebkit ? 'webkit' : 'chromium'}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await employee.selectOption('employee');
  await page.screenshot({ path: `output/playwright/calendar-chat-desktop-${useWebkit ? 'webkit' : 'chromium'}.png` });
  await employee.selectOption('all');
  const next = await page.evaluate(() => new Date(Date.parse(window.taskCalendar.tasks[1].dueDate + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10));
  const transfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.setData('application/x-index12-task', 'chat:22222222-2222-4222-8222-222222222222'); return data; });
  await page.locator(`[data-date="${next}"]`).dispatchEvent('drop', { dataTransfer: transfer });
  await page.waitForFunction(date => window.taskCalendar.tasks[1].dueDate === date, next);
  await page.locator(`[data-date="${next}"] .calendar-event`).waitFor();
  const staffTask = page.getByRole('button', { name: 'Изменено из календаря', exact: true });
  assert.match(await staffTask.innerText(), /16:20/);
  await staffTask.click();
  await card.waitFor();
  assert.equal(await page.locator('.calendar-window').count(), 1);
  await card.getByRole('button', { name: 'Перейти в рабочий чат', exact: true }).click();
  await page.locator('.task-overview').waitFor();
  assert.equal(await page.evaluate(() => window.taskCalendar.chat.requestedTaskId), '22222222-2222-4222-8222-222222222222');
  assert.equal(await page.locator('.calendar-window').count(), 0);
  const status = panel.getByRole('combobox', { name: 'Статус задачи', exact: true });
  await status.waitFor();
  assert.equal(await status.evaluate(el => getComputedStyle(el).backgroundImage), 'none', 'a shared select must not add a second chevron');
  assert.equal(await panel.locator('.task-statuses button').count(), 0);
  await status.selectOption('delayed');
  await page.waitForFunction(() => window.taskCalendar.tasks[1].status === 'delayed');
  await status.selectOption('done');
  await page.waitForFunction(() => window.taskCalendar.tasks[1].status === 'done');
  for (const theme of ['light','dark']) for (const width of [320,390,1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const description of ['Приступить немедленно', 'Длинная задача: подготовить договор, забрать документы и передать сотруднику для проверки. '.repeat(3)]) {
      await page.evaluate(description => { window.taskCalendar.chat.state.tasks.find(t => t._id.startsWith('2222')).description = description; }, description);
      const bounds = await status.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height <= 26);
      assert.ok(bounds.width < 90, 'the completed-status chip sizes to its label');
      const layout = await panel.locator('.task-summary').evaluate(el => {
        const box = selector => el.querySelector(selector).getBoundingClientRect().toJSON();
        return { colors: ['.task-who-label','.task-when-label','.task-from-label'].map(s => getComputedStyle(el.querySelector(s)).color), width: el.getBoundingClientRect().width, chip: box('.task-status-select'), text: box('.task-description'), labels: ['.task-who-label','.task-when-label','.task-from-label'].map(box), values: ['.task-who-value','.task-when-value','.task-from-value'].map(box), overflow: el.scrollWidth > el.clientWidth };
      });
      assert.ok(Math.abs(layout.chip.y - layout.text.y) < 5, 'status and description start on the same line');
      assert.ok(layout.chip.right <= layout.text.x, 'status appears immediately before the task text');
      assert.equal(layout.overflow, false);
      assert.equal(new Set(layout.colors).size, 1, 'all metadata labels share the same text style');
      for (let i = 0; i < 3; i++) {
        assert.equal(layout.labels[i].x, layout.labels[0].x, 'labels share one column');
        assert.equal(layout.values[i].x, layout.values[0].x, 'values share a separate column');
        assert.ok(Math.abs(layout.labels[i].y - layout.values[i].y) < 5, 'label and value share a row');
      }
      if (layout.width >= 350) assert.ok(layout.values[0].right <= layout.text.x, 'task text occupies the third column');
      await page.screenshot({ path: `output/playwright/task-columns-${description.length < 30 ? 'short' : 'long'}-${theme}-${width}-${useWebkit ? 'webkit' : 'chromium'}.png` });
    }
  }
  await status.selectOption('open');
  const newWidth = (await status.boundingBox()).width;
  await status.selectOption('progress');
  assert.ok((await status.boundingBox()).width > newWidth, 'chip width follows the selected status without moving metadata columns');
  await panel.locator('.task-description').click();
  await panel.getByRole('textbox', { name: 'Описание задачи', exact: true }).fill('Отредактировано в новой сетке');
  await page.locator('dialog.task-text-editor').click({ position: { x: -5, y: -5 }, force: true });
  await panel.locator('.task-description').filter({ hasText: 'Отредактировано в новой сетке' }).waitFor();
  assert.equal(await page.locator('dialog.task-text-editor').count(), 0);
  assert.equal(await status.evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
  assert.equal(await status.evaluate(el => getComputedStyle(el).opacity), '0');
  for (const theme of ['light','dark']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await panel.locator('.task-description').tap();
    const editor = page.locator('dialog.task-text-editor'), input = editor.getByRole('textbox');
    await input.waitFor();
    assert.equal(await editor.locator('button, header').count(), 0, 'editing is just the text field');
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    await input.fill('Длинный текст. '.repeat(30));
    const styles = await input.evaluate(el => { const s = getComputedStyle(el); return [s.fontSize,s.outlineStyle,s.boxShadow]; });
    assert.deepEqual(styles, ['16px','none','none'], 'touch and typing never add a heavy focus frame');
    const shade = await editor.evaluate(el => getComputedStyle(el, '::backdrop').backgroundColor);
    assert.notEqual(shade, 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: `output/playwright/task-editor-${theme}-${useWebkit ? 'webkit' : 'chromium'}.png` });
    await page.setViewportSize({ width: 390, height: 390 });
    await page.waitForFunction(() => { const r = document.querySelector('dialog.task-text-editor').getBoundingClientRect(); return r.y >= 12 && r.bottom <= innerHeight - 12; });
    const r = await editor.boundingBox();
    assert.ok(r.y >= 12 && r.y + r.height <= 378, 'editor fits the reduced viewport with keyboard space');
    await input.fill('');
    await editor.click({ position: { x: -5, y: -5 }, force: true });
    await editor.getByRole('alert').waitFor();
    assert.equal(await editor.isVisible(), true, 'an empty edit cannot erase the task');
    await input.fill('Изменено касанием снаружи ' + theme);
    await page.evaluate(() => {
      const adapter = window.taskCalendar.teamApi.defaults.adapter;
      window.taskCalendar.teamApi.defaults.adapter = async config => {
        if (config.method === 'patch') { window.taskCalendar.teamApi.defaults.adapter = adapter; throw new Error('Нет соединения'); }
        return adapter(config);
      };
    });
    await editor.click({ position: { x: -5, y: -5 }, force: true });
    await editor.getByRole('alert').filter({ hasText: 'Нет соединения' }).waitFor();
    assert.equal(await input.inputValue(), 'Изменено касанием снаружи ' + theme, 'failed save keeps the draft');
    await editor.click({ position: { x: -5, y: -5 }, force: true });
    await editor.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.taskCalendar.chat.error), '', 'retry removes the error from the successful save');
    await panel.locator('.task-description').filter({ hasText: 'Изменено касанием снаружи ' + theme }).waitFor();
  }


  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const f = window.taskCalendar;
    f.tasks.slice(0,3).forEach((t,i) => { t.status = ['open','progress','done'][i]; f.messages.push({ _id: crypto.randomUUID(), kind: 'task', taskId: t._id, authorId: 'owner:actor', authorName: 'Эрнест', text: '', attachments: [], createdAt: new Date().toISOString() }); });
    f.chat.state.tasks = [...f.tasks];
    f.showChat();
  });
  for (const theme of ['light','dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.locator('.task-cover').first().waitFor();
    const colors = await page.locator('.task-cover').evaluateAll(els => els.map(el => { const s = getComputedStyle(el); return { state: el.dataset.status, left: s.borderLeftColor, right: s.borderRightColor }; }));
    assert.notEqual(colors.find(c => c.state === 'open').left, colors.find(c => c.state === 'open').right, 'active task has a visible tinted accent');
    assert.notEqual(colors.find(c => c.state === 'progress').left, colors.find(c => c.state === 'progress').right, 'in-progress task keeps its accent');
    assert.equal(colors.find(c => c.state === 'done').left, colors.find(c => c.state === 'done').right, 'completed tasks stay quiet');
    await page.screenshot({ path: `output/playwright/task-cover-accent-${theme}-${useWebkit ? 'webkit' : 'chromium'}.png` });
  }

  assert.deepEqual(errors, []);
  console.log(`PASS (${useWebkit ? 'webkit' : 'chromium'}): role/timing chips, touch recipient search, outside filter dismiss/reset, compact calendar/filter, day-only selection, 10-task agenda, inline chat editing, deletion/restore and explicit chat navigation`);
} finally { await browser?.close(); await server.close(); }
