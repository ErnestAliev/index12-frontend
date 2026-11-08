import process from 'node:process';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const server = await createServer({ root: process.cwd(), envDir: '/private/tmp', cacheDir: '/private/tmp/index12-calendar-layout-vite', server: { host: '127.0.0.1', port: 5204, strictPort: true } });
let browser;
const manualId = '88888888-8888-4888-8888-888888888888';
try {
  await server.listen();
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const theme of ['light', 'dark']) for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: width === 320 ? 568 : width === 390 ? 844 : 900 }, hasTouch: width < 1000, isMobile: width < 1000 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5204/tests/browser/fixtures/task-calendar.html');
    await page.waitForFunction(() => window.taskCalendar);
    await page.evaluate(({ theme, manualId }) => {
      document.documentElement.dataset.theme = theme;
      const fixture = window.taskCalendar, day = fixture.tasks[0].dueDate;
      fixture.manualTasks.push({ _id: manualId, title: 'Оплатить налоги за ТОО YYY', description: 'Договор заканчивается — нужно продлить', status: 'open', version: 0, dueDate: day, startsAt: day + 'T05:00:00.000Z', endsAt: day + 'T06:00:00.000Z', allDay: false, reminderOffsets: [10,30,60], reminderDates: [], links: [], attachments: [], source: 'manual', party: { kind: 'companies', id: 'company' }, partyName: 'ТОО YYY' });
      for (let i = 0; i < 3; i++) fixture.tasks.push({ ...fixture.tasks[1], _id: crypto.randomUUID(), description: i ? 'Приступить немедленно' : 'Запросить закрывающие документы: ИП Шиповский', deletedAt: `2026-11-0${8-i}T08:01:00.000Z` });
      fixture.showCalendar();
    }, { theme, manualId });
    const search = page.getByRole('searchbox', { name: 'Поиск задач', exact: true });
    await search.click(); await search.pressSequentially('налоги');
    const searchStyle = await search.evaluate(el => { const s = getComputedStyle(el); return [s.outlineStyle, s.boxShadow, s.borderTopWidth]; });
    assert.deepEqual(searchStyle, ['none', 'none', '0px'], `${theme}/${width}: pointer search has no inner frame`);
    await search.fill('');
    if (width < 1000) await page.getByRole('button', { name: 'Фильтры календаря', exact: true }).click();
    for (const name of ['Фильтр по контрагенту', 'Фильтр по сотруднику']) {
      const select = page.getByLabel(name, { exact: true });
      await select.dispatchEvent('pointerdown', { pointerType: 'mouse', button: 0 }); await select.focus();
      const styles = await select.evaluate(el => { const s = getComputedStyle(el); return { outline: s.outlineStyle, shadow: s.boxShadow, font: s.fontSize, height: el.getBoundingClientRect().height }; });
      assert.equal(styles.outline, 'none'); assert.equal(styles.shadow, 'none'); assert.equal(styles.font, '13px'); assert.ok(styles.height <= 36);
    }
    if (width < 1000) await page.locator('.calendar-filter-backdrop').click({ position: { x: 2, y: 2 } });
    await page.evaluate(id => { window.taskCalendar.business.requestedTask = id; }, manualId);
    const card = page.getByRole('dialog', { name: 'Карточка задачи', exact: true }); await card.waitFor();
    const geometry = await card.evaluate(el => {
      const rect = name => el.querySelector(`[aria-label="${name}"]`).getBoundingClientRect().toJSON();
      const input = el.querySelector('[aria-label="Название задачи"]');
      return { titleFont: parseFloat(getComputedStyle(input).fontSize), title: input.getBoundingClientRect().toJSON(), description: rect('Описание задачи'), date: rect('Дата задачи'), endDate: rect('Дата окончания'), start: rect('Время начала'), end: rect('Время окончания'), card: el.getBoundingClientRect().toJSON() };
    });
    assert.ok(geometry.titleFont <= 16);
    assert.equal(await card.getByLabel('Описание задачи', { exact: true }).evaluate(el => getComputedStyle(el).fontSize), '14px');
    for (const label of ['Дата задачи', 'Дата окончания', 'Время начала', 'Время окончания']) {
      assert.equal(await card.getByLabel(label, { exact: true }).evaluate(el => getComputedStyle(el).textAlign), 'center');
    }
    const quick = card.getByRole('group', { name: 'Напоминания до начала задачи' });
    assert.equal(await quick.getByRole('button').count(), 4);
    assert.equal(await card.locator('.overdue-row').count(), 0);
    const expand = card.getByRole('button', { name: 'Дополнительные напоминания', exact: true });
    if (width < 1000) await expand.tap(); else await expand.click();
    await card.getByLabel('Количество напоминаний о просрочке').waitFor();
    assert.equal(await expand.getAttribute('aria-expanded'), 'true');
    await card.getByRole('button', { name: 'Дата и время', exact: true }).click();
    await card.getByLabel('Дата и время напоминания', { exact: true }).waitFor();
    await expand.click();
    assert.equal(await card.locator('.overdue-row').count(), 0);
    assert.equal(await card.locator('.custom-reminder-row').count(), 0);
    assert.ok(Math.abs(geometry.description.width - geometry.title.width) < 1, 'description fills the same form width as the title');
    assert.ok(Math.abs(geometry.date.y - geometry.endDate.y) < 1, 'start/end dates share the first row');
    assert.ok(Math.abs(geometry.start.y - geometry.end.y) < 1 && geometry.start.y >= geometry.date.bottom, 'start/end times share the next row');
    for (const rect of [geometry.date, geometry.endDate, geometry.start, geometry.end]) {
      assert.ok(rect.x >= geometry.card.x && rect.right <= geometry.card.right + 1 && rect.height <= 40);
    }
    if (width !== 320) await card.screenshot({ path: `output/playwright/calendar-manual-${theme}-${width}-${engine}.png` });
    await card.getByRole('button', { name: 'Закрыть карточку задачи', exact: true }).click();
    await page.getByRole('button', { name: 'Удалённые задачи', exact: true }).click();
    const trash = page.getByRole('dialog', { name: 'Удалённые задачи', exact: true });
    await trash.locator('.deleted-task-row').first().waitFor();
    const appearance = await trash.evaluate(el => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { bg: s.backgroundColor, opacity: s.opacity, onTop: el.contains(hit) };
    });
    assert.notEqual(appearance.bg, 'rgba(0, 0, 0, 0)'); assert.notEqual(appearance.bg, 'transparent');
    assert.equal(appearance.opacity, '1'); assert.equal(appearance.onTop, true);
    assert.equal(await trash.locator('time[datetime]').count(), 3);
    assert.match(await trash.locator('time').first().innerText(), /13:01/);
    const rowBoxes = await trash.locator('.deleted-task-row').evaluateAll(rows => rows.map(row => ({
      title: row.querySelector('.deleted-task-title').getBoundingClientRect().toJSON(),
      time: row.querySelector('time').getBoundingClientRect().toJSON(),
      button: row.querySelector('button').getBoundingClientRect().toJSON(),
    })));
    for (const row of rowBoxes) {
      assert.ok(row.time.right <= row.button.x + 1, 'deletion date and restore action do not overlap');
      assert.ok(width < 540 ? row.title.bottom <= row.time.y : row.title.right <= row.time.x, 'task title has its own space');
    }
    const deletedSearch = trash.getByRole('searchbox'); await deletedSearch.click();
    assert.equal(await deletedSearch.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    await page.keyboard.press('Tab'); await deletedSearch.focus();
    assert.notEqual(await deletedSearch.evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'keyboard navigation retains an indicator');
    await deletedSearch.click();
    if (width !== 320) await trash.screenshot({ path: `output/playwright/calendar-trash-${theme}-${width}-${engine}.png` });
    assert.deepEqual(errors, []); await page.close();
  }
  console.log(`PASS (${engine}): light/dark, 320/390/1280, compact manual title, paired dates/times, pointer/keyboard focus, opaque top-layer trash and deletion timestamps without overlap`);
} finally { await browser?.close(); await server.close(); }
