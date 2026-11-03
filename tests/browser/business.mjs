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
    await page.context().route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path.startsWith('/api/business')) {
        const response = await route.fetch({ url: apiUrl + path.slice(4), headers: { ...request.headers(), 'x-test-actor': actor, 'x-test-workspace': workspaceId, origin: 'http://127.0.0.1:5192' } });
        return route.fulfill({ response });
      }
      if (/^\/api\/(companies|contractors|accounts)(\/|$)/.test(path)) {
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
    assert.equal(await page.getByRole('tab', { name: 'Компании и КГД', exact: true }).count(), 0);
    const ownerInput = page.getByRole('textbox', { name: 'Название владельца счета', exact: true }).first();
    const inputBox = await ownerInput.boundingBox();
    await ownerInput.click({ position: { x: inputBox.width - 34, y: inputBox.height / 2 } });
    await ownerInput.fill('ТОО Тест · сохранено');
    await page.locator('.editor-modal').getByRole('button', { name: 'Сохранить', exact: true }).click();
    await page.getByText('Изменения сохранены', { exact: true }).waitFor();
    const [companyPage] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('link', { name: 'ТОО Тест · сохранено', exact: true }).first().click()
    ]);
    companyPage.on('pageerror', error => errors.push(error.message));
    await companyPage.getByRole('heading', { name: 'ТОО Тест · сохранено', exact: true }).waitFor();
    assert.ok(companyPage.url().includes(`/companies/${company._id}`));
    const update = companyPage.getByRole('button', { name: 'Обновить компанию', exact: true });
    assert.equal(await update.isDisabled(), true);
    await companyPage.getByRole('textbox', { name: 'Путь к файлу ЭЦП', exact: true }).fill('/Users/test/company.p12');
    await companyPage.getByLabel('Пароль ЭЦП', { exact: true }).fill('local-test-password');
    await companyPage.getByRole('button', { name: 'Подключить ЭЦП', exact: true }).click();
    await companyPage.getByText('Настройки ЭЦП сохранены', { exact: true }).waitFor();
    assert.equal(await update.isDisabled(), false);
    assert.equal(await companyPage.getByLabel('Пароль ЭЦП', { exact: true }).inputValue(), '');
    await companyPage.reload();
    await companyPage.getByRole('heading', { name: 'ТОО Тест · сохранено', exact: true }).waitFor();
    assert.equal(await companyPage.getByRole('textbox', { name: 'Путь к файлу ЭЦП', exact: true }).inputValue(), '/Users/test/company.p12');
    assert.equal(await companyPage.getByLabel('Пароль ЭЦП', { exact: true }).getAttribute('placeholder'), 'Сохранён');
    await update.click();
    await companyPage.getByText('Данные компании обновлены', { exact: true }).waitFor();
    await companyPage.screenshot({ path: `${output}/business-company-desktop.png` });
    await companyPage.setViewportSize({ width: 390, height: 844 });
    assert.ok(await companyPage.locator('.company-page').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await companyPage.screenshot({ path: `${output}/business-company-mobile.png` });
    await companyPage.getByRole('button', { name: 'Отключить', exact: true }).click();
    await companyPage.getByText('ЭЦП отключена', { exact: true }).waitFor();
    assert.equal(await update.isDisabled(), true);
    await companyPage.close();
    await page.reload();
    await page.locator('.edit-btn').click();
    await page.getByRole('link', { name: 'ТОО Тест · сохранено', exact: true }).first().waitFor();
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
    console.log('PASS: real Vue → HTTP → MongoDB, editor rename/link distinction, separate company tab, persisted local EDS path/encrypted password, update gating, no duplicate company list, desktop/mobile views');
  } finally { await browser?.close(); await server.close(); }
}
