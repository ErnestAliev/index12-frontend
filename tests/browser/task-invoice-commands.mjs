// Local task composer only: inspect DOM, geometry and native editing; no screenshots.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const origin = 'http://127.0.0.1:5223';
const server = await createServer({ root: process.cwd(), envDir: '/private/tmp', server: { host: '127.0.0.1', port: 5223, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  for (const theme of ['dark', 'light']) for (const width of [320, 390, 1280]) {
    const touch = width < 1000;
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: touch, isMobile: touch });
    await context.addInitScript(() => { window.SpeechRecognition = class { start() {} stop() {} abort() {} }; });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', r => new URL(r.request().url()).origin === origin && r.request().resourceType() !== 'image' ? r.continue() : r.abort());
    await page.goto(origin + '/tests/browser/fixtures/task-calendar.html' + (touch ? '' : '?desktop'));
    await page.waitForFunction(() => window.taskCalendar);
    // Staff see both shortcuts too. Neither selection nor deletion creates a task.
    await page.evaluate(t => { document.documentElement.dataset.theme = t; window.taskCalendar.chat.me.owner = false; }, theme);
    const panel = page.locator('.task-panel');
    const activate = locator => touch ? locator.tap() : locator.click();
    await activate(panel.getByRole('button', { name: 'Себе', exact: true }));
    await activate(panel.getByRole('button', { name: 'Без срока', exact: true }));
    await activate(panel.getByRole('button', { name: 'Без проекта', exact: true }));
    const input = panel.getByRole('textbox', { name: 'Описание задачи', exact: true });
    const pay = panel.getByRole('button', { name: 'Оплатить счёт', exact: true });
    const issue = panel.getByRole('button', { name: 'Выставить счёт', exact: true });
    const chip = panel.locator('.task-invoice-command');
    await input.fill('Дератизация проекта');
    assert.ok(await pay.isVisible()); assert.ok(await issue.isVisible());
    assert.equal(await chip.count(), 0);
    const before = await page.evaluate(() => window.taskCalendar.tasks.length);
    await activate(pay);
    assert.equal(await chip.innerText(), 'Оплатить счёт');
    assert.equal(await input.inputValue(), 'Дератизация проекта');
    assert.equal(await input.evaluate(el => el.selectionStart), 0);
    await input.press('Backspace');
    await chip.waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), 'Дератизация проекта');
    await activate(pay); await activate(pay); await activate(issue);
    assert.equal(await chip.count(), 1);
    assert.equal(await chip.innerText(), 'Выставить счёт');
    assert.equal(await pay.getAttribute('aria-pressed'), 'false');
    assert.equal(await issue.getAttribute('aria-pressed'), 'true');
    // Native text deletion affects body first; mobile beforeinput removes the atom at its boundary.
    await input.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
    await input.press('Backspace');
    assert.equal(await input.inputValue(), 'Дератизация проект');
    assert.equal(await chip.count(), 1);
    await input.evaluate(el => { el.setSelectionRange(0, 0); el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true })); });
    await chip.waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), 'Дератизация проект');
    await activate(issue);
    // Keyboard navigation selects the shortcut, then returns the caret after the command.
    await pay.focus(); await page.keyboard.press('Enter');
    assert.equal(await chip.innerText(), 'Оплатить счёт');
    // Adding a command never truncates a task that already reaches the text limit.
    await input.press('Backspace');
    await chip.waitFor({ state: 'hidden' });
    await input.fill('x'.repeat(10000));
    await activate(pay);
    assert.equal(await chip.count(), 0);
    assert.equal((await input.inputValue()).length, 10000);
    await panel.getByRole('alert').filter({ hasText: '10 000' }).waitFor();
    await input.fill('Дератизация проекта');
    await activate(pay);
    assert.equal(await panel.getByRole('alert').count(), 0);
    if (touch) {
      await page.evaluate(() => {
        for (const [side, value] of Object.entries({ top: 24, bottom: 34, left: 16, right: 16 })) document.documentElement.style.setProperty('--safe-area-' + side, value + 'px');
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 410 });
        window.visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction(() => document.querySelector('.codex-chat-window').getBoundingClientRect().height <= 410);
    }
    const geometry = await panel.evaluate(el => {
      const box = selector => el.querySelector(selector).getBoundingClientRect().toJSON();
      const textarea = el.querySelector('textarea');
      return { bounds: box('.task-description-box'), tools: box('.description-tools'), pay: box('.task-invoice-shortcut'), payLabel: box('.task-invoice-shortcut span'), issue: el.querySelectorAll('.task-invoice-shortcut')[1].getBoundingClientRect().toJSON(), attach: box('[aria-label="Прикрепить файл"]'), mic: box('[aria-label="Диктовка"]'), chip: box('.task-invoice-command'), textStart: textarea.getBoundingClientRect().x + (parseFloat(getComputedStyle(textarea).paddingLeft) + parseFloat(getComputedStyle(textarea).textIndent)) * .875, publish: box('.task-publish'), viewport: innerWidth, pageWidth: document.documentElement.scrollWidth };
    });
    assert.ok(geometry.pay.x >= geometry.bounds.x && geometry.pay.right <= geometry.issue.x && geometry.issue.right <= geometry.attach.x && geometry.attach.right <= geometry.mic.x && geometry.mic.right <= geometry.bounds.right, JSON.stringify(geometry));
    assert.ok(geometry.pay.height >= 44 && geometry.payLabel.height <= 24, JSON.stringify(geometry));
    assert.ok(Math.abs(geometry.pay.y - geometry.mic.y) < 1 && geometry.tools.bottom <= geometry.bounds.bottom, JSON.stringify(geometry));
    assert.ok(geometry.textStart >= geometry.chip.right + 3, JSON.stringify(geometry));
    assert.ok(geometry.pageWidth <= geometry.viewport, JSON.stringify(geometry));
    if (touch) assert.ok(geometry.publish.bottom <= 400, JSON.stringify(geometry));
    assert.equal(await page.evaluate(() => window.taskCalendar.tasks.length), before);
    await activate(panel.getByRole('button', { name: 'Поставить задачу', exact: true }));
    await page.waitForFunction(() => window.taskCalendar.tasks.some(task => task.description === 'Оплатить счёт: Дератизация проекта'));
    const saved = await page.evaluate(() => window.taskCalendar.tasks.at(-1));
    assert.equal(saved.description, 'Оплатить счёт: Дератизация проекта');
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} ${theme} ${width}: persistent shortcuts, one replaceable command, Backspace/beforeinput removal, unchanged task body, keyboard/${touch ? 'touch' : 'mouse'}, microphone row fits, saved intent for MCP`);
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
