// Rendered labels and geometry only; synthetic chat/operation state, no screenshots.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const server = await createServer({ root: process.cwd(), envDir: '/private/tmp', cacheDir: '/private/tmp/index12-finance-card-layout', server: { host: '127.0.0.1', port: 5238, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  for (const width of [320, 390, 834, 1280]) for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width < 1024, isMobile: width < 1024 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto('http://127.0.0.1:5238/tests/browser/fixtures/operation-share.html');
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.setProperty('--safe-area-bottom', '34px');
      for (const side of ['left', 'right']) document.documentElement.style.setProperty('--safe-area-' + side, '12px');
      document.querySelector('#timeline-source').remove();
    }, theme);
    for (const inTask of [false, true]) for (const kind of ['income', 'expense', 'transfer', 'withdrawal']) {
      const type = kind === 'withdrawal' ? 'transfer' : kind;
      const id = await page.evaluate(({ type, kind, inTask }) => {
        shareFixture.clearFinance();
        const id = shareFixture.financeCard(type, inTask, kind === 'withdrawal');
        const rows = inTask ? shareFixture.chat.threads[shareFixture.task._id].messages : shareFixture.chat.state.messages;
        const message = rows.find(row => row._id === id);
        message.financeOperation.amount = 29669688.75;
        const field = label => message.financeOperation.rows.find(row => row.label === label);
        field('Описание').value = 'Оплата монтажа вентиляции по договору № 12.\n' + 'Длинное назначение платежа '.repeat(10);
        field('Комментарий').value = 'Первый платёж.\nПосле подтверждения руководителем';
        if (type === 'expense') message.approvalRequest = { state: 'pending', recipients: [{ actorId: shareFixture.chat.me.actorId, name: 'Эрнест', state: 'pending' }] };
        return id;
      }, { type, kind, inTask });
      const card = page.locator(`[data-message-id="${id}"] .team-finance-message`);
      await card.waitFor();
      const expectedLabels = type === 'transfer'
        ? ['Со счёта', 'Отправитель', kind === 'withdrawal' ? 'Кому' : 'На счёт', ...(kind === 'withdrawal' ? [] : ['Получатель'])]
        : [type === 'income' ? 'На счёт' : 'Со счёта', 'Владелец', type === 'income' ? 'От кого' : 'Кому'];
      expectedLabels.push('Проект', 'Категория', 'Подкатегория', 'Комментарий', 'Описание', 'Дата');
      assert.deepEqual(await card.locator('.finance-label').allTextContents(), expectedLabels);
      const text = await card.innerText();
      assert.match(text, /BCC UU/);
      assert.match(text, /ТОО UU/);
      assert.match(text, /Монтаж/);
      assert.match(text, /Первый платёж\.\nПосле подтверждения руководителем/);
      assert.match(text, /Оплата монтажа вентиляции по договору № 12/);
      assert.match(text, /18\.11\.2026/);
      assert.match(text, /Создано:.*Давид/s);
      if (kind === 'transfer') { assert.match(text, /Kaspi Gold Шерхан/); assert.match(text, /Получатель\s+Шерхан/); }
      if (kind === 'withdrawal') { assert.match(text, /Вывод из системы/); assert.match(text, /Кому\s+Давид/); assert.ok(!text.includes('На счёт')); }
      if (type !== 'transfer') assert.match(text, /Поставщик/);
      const layout = await card.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const children = [...el.querySelectorAll('.finance-heading, .finance-label, .finance-value')];
        return { left: rect.left, right: rect.right, scroll: el.scrollWidth, width: el.clientWidth, children: children.map(item => {
          const r = item.getBoundingClientRect(), css = getComputedStyle(item);
          return { left: r.left, right: r.right, size: css.fontSize, weight: css.fontWeight, whiteSpace: css.whiteSpace, label: item.classList.contains('finance-label') };
        }) };
      });
      assert.ok(layout.left >= 12 && layout.right <= width - 12, JSON.stringify(layout));
      assert.ok(layout.scroll <= layout.width + 1, JSON.stringify(layout));
      assert.ok(layout.children.every(r => r.left >= layout.left - 1 && r.right <= layout.right + 1), JSON.stringify(layout));
      for (const r of layout.children.filter(r => r.label || r.whiteSpace === 'pre-wrap')) {
        assert.equal(r.size, r.label ? '12px' : '13px');
        assert.equal(r.weight, '400');
      }
      assert.equal(await card.locator('.finance-open .task-approval').count(), 0, 'approval controls remain separate from opening the operation');
      if (type === 'expense') assert.equal(await card.getByRole('button', { name: 'Согласовать', exact: true }).count(), 1);
      // Older cached cards without rich rows still show their description/comment;
      // absent information is explicit rather than silently omitted.
      await page.evaluate(({ id, inTask }) => {
        const rows = inTask ? shareFixture.chat.threads[shareFixture.task._id].messages : shareFixture.chat.state.messages;
        const op = rows.find(row => row._id === id).financeOperation;
        delete op.rows;
        op.comment = '';
      }, { id, inTask });
      assert.equal(await card.locator('[data-field="Комментарий"] .finance-value').innerText(), '—');
      assert.match(await card.locator('[data-field="Описание"] .finance-value').innerText(), /Проверить поступление/);
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${width} ${theme} ${inTask ? 'task' : 'chat'} ${kind}: amount, ordered labeled fields, owners, classification, full comment/description, audit and bounds`);
    }
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
