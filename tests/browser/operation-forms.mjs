// The real forms, mobile global CSS and native date inputs; inspect DOM, no images.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';

const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const origin = 'http://127.0.0.1:5233';
const server = await createServer({
  root: process.cwd(), envDir: '/private/tmp', cacheDir: '/private/tmp/index12-operation-forms-vite',
  server: { host: '127.0.0.1', port: 5233, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  for (const width of [320, 390, 768, 1024, 1440]) {
    const height = width === 390 ? 844 : 950;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width <= 1024 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/tests/browser/fixtures/operation-forms.html`);
    await page.waitForFunction(() => !!window.operationForms);
    for (const theme of ['dark', 'light']) for (const type of ['income', 'expense', 'transfer']) {
      await page.evaluate(({ theme, type }) => {
        document.documentElement.dataset.theme = theme;
        for (const side of ['top', 'bottom', 'left', 'right']) {
          document.documentElement.style.setProperty(`--safe-area-${side}`, side === 'bottom' ? '34px' : side === 'top' && innerWidth === 390 ? '47px' : '20px');
        }
        operationForms.open(type, true);
      }, { theme, type });
      const form = page.locator('.financial-operation-popup');
      await form.waitFor();
      await page.waitForFunction(() => document.querySelector('.operation-comment')?.value === 'Короткий комментарий');
      const geometry = await form.evaluate(el => {
        const css = selector => getComputedStyle(el.querySelector(selector));
        const rect = selector => el.querySelector(selector).getBoundingClientRect().toJSON();
        return {
          form: el.getBoundingClientRect().toJSON(), scroll: el.scrollWidth, client: el.clientWidth,
          heading: css('h3').fontSize, amount: css('[inputmode="decimal"]').fontSize,
          date: css('.date-value-text').fontSize, comment: css('.operation-comment').fontSize,
          values: [...el.querySelectorAll('.select-search-input, .selected-text, .placeholder')].map(item => getComputedStyle(item).fontSize),
          weights: [...el.querySelectorAll('[inputmode="decimal"], .select-search-input, .selected-text, .placeholder, .operation-comment, .date-value-text')].map(item => getComputedStyle(item).fontWeight),
          colors: [...el.querySelectorAll('[inputmode="decimal"], .select-search-input, .selected-text, .placeholder, .operation-comment, .date-value-text')].map(item => getComputedStyle(item).color),
          fields: [...el.querySelectorAll('.select-trigger, .custom-input-box, .operation-comment')].map(item => item.getBoundingClientRect().height),
          commentBox: rect('.operation-comment'), dateBox: rect('.date-box'), dateInput: rect('.date-overlay'),
          dateText: rect('.date-value-text'), badge: rect('.date-badge'), icon: rect('.calendar-icon-svg'),
          commentBackground: css('.operation-comment').backgroundColor, fieldBackground: css('.custom-input-box').backgroundColor,
          commentBorder: css('.operation-comment').borderRadius, fieldBorder: css('.custom-input-box').borderRadius,
        };
      });
      assert.equal(geometry.heading, '18px');
      assert.ok([geometry.amount, geometry.date, geometry.comment, ...geometry.values].every(size => size === '14px'), JSON.stringify(geometry));
      assert.ok(geometry.weights.every(weight => weight === '400'), JSON.stringify(geometry));
      assert.ok(geometry.colors.every(color => color === geometry.colors[0]), JSON.stringify(geometry));
      assert.ok(geometry.fields.every(height => Math.abs(height - 44) < 1), JSON.stringify(geometry));
      assert.ok(geometry.form.left >= 31 && geometry.form.right <= width - 31 && geometry.form.width <= 440);
      assert.ok(geometry.scroll <= geometry.client + 1, JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.commentBox.width - geometry.dateBox.width) < 1);
      assert.equal(geometry.commentBackground, geometry.fieldBackground);
      assert.equal(geometry.commentBorder, geometry.fieldBorder);
      assert.ok(geometry.dateInput.height >= 42 && geometry.dateInput.width >= geometry.dateBox.width - 2);
      assert.ok(geometry.dateText.right <= geometry.badge.left && geometry.badge.right <= geometry.icon.left);
      const close = form.getByRole('button', { name: 'Закрыть операцию', exact: true });
      assert.equal(await close.count(), 1);
      const closeBox = await close.boundingBox();
      assert.equal(closeBox.width, 44);
      assert.equal(closeBox.height, 44);
      if (type === 'transfer') {
        const modes = form.getByRole('group', { name: 'Вид операции' });
        assert.equal(await modes.locator('..').getAttribute('class'), 'operation-heading');
        const activate = element => width <= 1024 ? element.tap() : element.click();
        await activate(modes.getByRole('button', { name: 'Вывод из системы', exact: true }));
        assert.equal(await modes.getByRole('button', { name: 'Вывод из системы', exact: true }).getAttribute('aria-pressed'), 'true');
        await form.getByRole('combobox', { name: 'Получатель средств' }).waitFor();
        await activate(modes.getByRole('button', { name: 'Между счетами', exact: true }));
        assert.equal(await modes.getByRole('button', { name: 'Между счетами', exact: true }).getAttribute('aria-pressed'), 'true');
      }
      const date = form.getByLabel('Дата операции', { exact: true });
      await date.scrollIntoViewIfNeeded();
      await date.evaluate(el => el.addEventListener('click', event => { event.preventDefault(); el.dataset.tapped = 'yes'; }, { once: true }));
      if (width <= 1024) await date.tap({ position: { x: 4, y: 4 } });
      else await date.click({ position: { x: 4, y: 4 } });
      assert.equal(await date.getAttribute('data-tapped'), 'yes');
      await date.fill('2099-12-31');
      await page.waitForFunction(() => document.querySelector('.date-value-text')?.textContent === '31.12.2099');
      assert.equal((await form.locator('.date-badge').innerText()).trim(), 'ПЛАН');
      await form.locator('.operation-details-toggle').click();
      await form.getByRole('button', { name: 'Изменить описание' }).click();
      assert.equal(await form.getByLabel('Описание операции').evaluate(el => getComputedStyle(el).fontSize), '14px');
      const comment = form.locator('.operation-comment');
      await comment.fill('Комментарий без увеличенного шрифта');
      const focus = await comment.evaluate(el => ({ outline: getComputedStyle(el).outlineWidth, shadow: getComputedStyle(el).boxShadow }));
      assert.equal(focus.outline, '0px');
      assert.equal(focus.shadow, 'none');
      // A reduced viewport represents the space left above a mobile keyboard.
      await page.setViewportSize({ width, height: 460 });
      const save = form.locator('.popup-actions-row .btn-submit');
      await save.scrollIntoViewIfNeeded();
      const saveBox = await save.boundingBox();
      assert.ok(saveBox.y >= 20 && saveBox.y + saveBox.height <= 460 - 45, JSON.stringify(saveBox));
      // The close action remains visible while the long form is scrolled down.
      const stickyClose = await close.boundingBox();
      assert.ok(stickyClose.y >= 20 && stickyClose.y + stickyClose.height < 160, JSON.stringify(stickyClose));
      if (width <= 1024) await close.tap(); else await close.click();
      await form.waitFor({ state: 'detached' });
      await page.setViewportSize({ width, height });
      // Empty controls use the same scale as populated controls.
      await page.evaluate(type => operationForms.open(type), type);
      await form.waitFor();
      if (width === 390) {
        const phone = await form.evaluate(el => ({
          height: el.clientHeight, content: el.scrollHeight,
          close: el.querySelector('.operation-close').getBoundingClientRect().toJSON(),
          save: el.querySelector('.btn-submit').getBoundingClientRect().toJSON(),
        }));
        assert.ok(phone.content <= phone.height + 1, JSON.stringify(phone));
        assert.ok(phone.close.top >= 47 && phone.save.bottom <= height - 46, JSON.stringify(phone));
      }
      const emptyFields = await form.locator('[inputmode="decimal"], .select-search-input, .selected-text, .placeholder, .operation-comment').evaluateAll(items => items.map(el => ({
        text: el.value || el.textContent,
        size: getComputedStyle(el).fontSize,
        weight: getComputedStyle(el).fontWeight,
        color: getComputedStyle(el).color,
        placeholderColor: el.matches('input, textarea') ? getComputedStyle(el, '::placeholder').color : getComputedStyle(el).color,
        placeholderWeight: el.matches('input, textarea') ? getComputedStyle(el, '::placeholder').fontWeight : '400',
      })));
      assert.ok(emptyFields.every(field => field.size === '14px' && field.weight === '400' && field.placeholderWeight === '400'), JSON.stringify(emptyFields));
      assert.ok(emptyFields.every(field => field.color === emptyFields[0].color && field.placeholderColor === field.color), JSON.stringify(emptyFields));
      console.log(`PASS ${engine} ${width} ${theme} ${type}: type scale, fields, comment, date hit area/picker value, safe area, reduced viewport`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
