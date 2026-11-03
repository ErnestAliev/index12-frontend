import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

export async function verifyBusinessUi({ apiUrl, entitiesApiUrl, actor, workspaceId, company, profile }) {
  const taskDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date());
  const output = fileURLToPath(new URL('../../output/playwright/', import.meta.url));
  const server = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), server: { host: '127.0.0.1', port: 5192, strictPort: true } });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.SCROLL_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path.startsWith('/api/business')) {
        const response = await route.fetch({ url: apiUrl + path.slice(4), headers: { ...request.headers(), 'x-test-actor': actor, 'x-test-workspace': workspaceId, origin: 'http://127.0.0.1:5192' } });
        return route.fulfill({ response });
      }
      if (/^\/api\/(companies|contractors)(\/|$)/.test(path)) {
        const response = await route.fetch({ url: entitiesApiUrl + path.slice(4) }); return route.fulfill({ response });
      }
      let data = [];
      if (path.endsWith('/auth/me')) data = { _id: actor, id: actor, name: 'Проверка', role: 'admin', workspaceRole: 'admin', currentWorkspaceId: workspaceId };
      if (path.endsWith('/workspaces')) data = [{ _id: workspaceId, name: 'Проверка', userId: actor, isDefault: true }];
      if (path.endsWith('/snapshot')) data = { timestamp: new Date().toISOString(), accountBalances: {}, companyBalances: {}, individualBalances: {}, contractorBalances: {} };
      if (path.endsWith('/appearance-themes')) data = { themes: [] };
      if (path.endsWith('/appearance-templates')) data = { templates: [] };
      if (path.endsWith('/codex/status')) data = { connected: false, configured: false };
      return route.fulfill({ json: data });
    });
    await page.goto('http://127.0.0.1:5192/');
    await page.getByRole('button', { name: 'Открыть календарь задач', exact: true }).click();
    const calendar = page.getByRole('dialog', { name: 'Календарь задач', exact: true });
    await calendar.getByRole('button', { name: '+ Задача', exact: true }).click();
    await calendar.getByRole('textbox', { name: 'Название задачи', exact: true }).fill('Сверить налоговые уведомления');
    await calendar.getByRole('combobox', { name: 'Компания задачи', exact: true }).selectOption(company._id);
    await calendar.getByLabel('Дата задачи', { exact: true }).fill(taskDate);
    await calendar.getByRole('button', { name: 'Сохранить задачу', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Открыть календарь задач', exact: true }).click();
    const day = calendar.getByRole('button', { name: new RegExp(`^${taskDate},`) });
    await day.click();
    await calendar.getByRole('button', { name: 'Сверить налоговые уведомления', exact: true }).waitFor();
    await calendar.getByRole('combobox', { name: 'Фильтр по компании', exact: true }).selectOption(company._id);
    await calendar.getByRole('checkbox', { name: 'Выполнить: Сверить налоговые уведомления', exact: true }).check();
    await calendar.getByRole('button', { name: 'Сверить налоговые уведомления', exact: true }).waitFor({ state: 'hidden' });
    await calendar.getByRole('checkbox', { name: 'Выполненные', exact: true }).check();
    await calendar.getByRole('button', { name: 'Сверить налоговые уведомления', exact: true }).waitFor();
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: `${output}/business-calendar-desktop.png` });
    await calendar.getByRole('button', { name: 'Закрыть календарь', exact: true }).click();
    await page.locator('.contractor-editor-btn').click();
    await page.getByRole('button', { name: '+ Создать контрагента', exact: true }).click();
    const create = page.locator('.create-modal');
    await create.getByRole('textbox', { name: 'БИН/ИИН', exact: true }).fill(profile.identificationNumber);
    await create.getByRole('button', { name: 'Применить реквизиты', exact: true }).waitFor();
    assert.equal(await create.locator('.name-input').inputValue(), profile.name);
    await create.getByRole('button', { name: 'Создать', exact: true }).click();
    await create.waitFor({ state: 'hidden' });
    await page.locator('.contractor-name-cell').filter({ hasText: '' }).first().waitFor();
    await page.locator('.contractor-bin-cell').first().click();
    const legal = page.getByRole('dialog', { name: 'Реквизиты контрагента', exact: true });
    await legal.getByText('Реквизиты', { exact: true }).click();
    assert.equal(await legal.getByRole('textbox', { name: 'Юридический адрес', exact: true }).inputValue(), profile.legalAddress);
    await legal.getByText('Проверки ограничений · не выполнены', { exact: true }).click();
    await legal.getByText('Судебные дела: не проверены', { exact: true }).waitFor();
    await legal.getByRole('button', { name: 'Закрыть реквизиты', exact: true }).click();
    await page.locator('.contractor-popup .modal-close-btn').click();
    await page.locator('.edit-btn').click();
    await page.getByRole('tab', { name: 'Компании и КГД', exact: true }).click();
    await page.getByRole('textbox', { name: 'Название компании', exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Название компании', exact: true }).fill('ТОО Тест · сохранено');
    await page.getByRole('button', { name: 'Сохранить реквизиты', exact: true }).click();
    await page.getByText('Реквизиты сохранены', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/business-company-desktop.png` });
    await page.reload();
    await page.locator('.edit-btn').click();
    await page.getByRole('tab', { name: 'Компании и КГД', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Название компании', exact: true }).inputValue(), 'ТОО Тест · сохранено');
    await page.locator('.editor-modal .close-btn').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:5192/mobile');
    // Routing may redirect /mobile to the responsive main view.
    const menu = page.locator('.user-avatar, .user-menu-btn, .mobile-user-btn').first();
    if (await menu.count()) await menu.click();
    else await page.getByRole('button', { name: /меню/i }).first().click();
    await page.getByRole('button', { name: 'Календарь задач', exact: true }).click();
    await page.getByRole('dialog', { name: 'Календарь задач', exact: true }).waitFor();
    assert.ok(await page.getByRole('dialog', { name: 'Календарь задач' }).evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await page.screenshot({ path: `${output}/business-calendar-mobile.png` });
    assert.deepEqual(errors, []);
    console.log('PASS: real Vue → HTTP → MongoDB, task persistence/completion, BIN lookup and contractor creation, saved company profile, desktop/mobile calendar');
  } finally { await browser?.close(); await server.close(); }
}
