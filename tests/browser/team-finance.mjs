import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
import assert from "node:assert/strict";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-finance-vite",
  server: { host: "127.0.0.1", port: 5224, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        });
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 950 },
      hasTouch: width < 1000,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(8000);
    await page.goto(
      "http://127.0.0.1:5224/tests/browser/fixtures/team-finance.html",
    );
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--safe-area-bottom", "34px");
      document.documentElement.style.setProperty("--safe-area-left", "16px");
      document.documentElement.style.setProperty("--safe-area-right", "16px");
    });
    const activate = (element) =>
      width < 1000 ? element.tap() : element.click();
    const panel = page.locator(".team-conversation").last();
    async function open(type) {
      await activate(
        page
          .getByRole("button", { name: "Добавить в чат", exact: true })
          .last(),
      );
      await activate(
        page.getByRole("menuitem", { name: "Создать " + type, exact: true }),
      );
      await page.locator("dialog .financial-operation-popup").waitFor();
    }
    async function choose(label, name) {
      const field = page
        .locator("dialog .base-select")
        .filter({ has: page.locator(`input[aria-label="${label}"]`) });
      if (await field.count()) await activate(field.locator(".select-trigger"));
      else
        await activate(
          page
            .locator("dialog .base-select")
            .filter({ hasText: label })
            .first()
            .locator(".select-trigger"),
        );
      await activate(
        page.getByRole("option").filter({ hasText: name }).first(),
      );
    }
    await open("доход");
    const dialog = page.locator("dialog.team-finance-dialog");
    await dialog.locator('input[inputmode="decimal"]').fill("1000");
    await choose("Куда (Счет)", "Касса сотрудника");
    await choose("От кого", "Поставщик");
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const layout = await dialog
      .locator(".financial-operation-popup")
      .evaluate((el) => ({
        rect: el.getBoundingClientRect().toJSON(),
        dialog: el.closest("dialog").getBoundingClientRect().toJSON(),
        overlay: el.parentElement.getBoundingClientRect().toJSON(),
        padding: getComputedStyle(el.parentElement).padding,
        dialogCss: getComputedStyle(el.closest("dialog")).cssText,
        scroll: document.documentElement.scrollWidth,
        balance: el.innerText.includes("После расхода"),
        creation: el.innerText.includes("Создать счет"),
      }));
    assert.ok(
      layout.rect.left >= 16 &&
        layout.rect.right <= width - 16 &&
        layout.scroll <= width,
      JSON.stringify(layout),
    );
    assert.equal(layout.creation, false);
    await page.evaluate(() => (window.financeFail = true));
    await activate(dialog.locator(".popup-actions-row .btn-submit").first());
    await dialog.getByRole("alertdialog").waitFor();
    assert.equal(
      await dialog
        .getByText("Счёт недоступен. Обновите форму", { exact: true })
        .count(),
      1,
    );
    await activate(
      dialog.getByRole("button", { name: "Понятно", exact: true }),
    );
    assert.equal(
      (await dialog.locator('input[inputmode="decimal"]').inputValue()).replace(
        /\s/g,
        "",
      ),
      "1000",
    );
    await page.evaluate(() => (window.financeFail = false));
    await activate(dialog.locator(".popup-actions-row .btn-submit").first());
    await dialog.waitFor({ state: "detached" });
    await page.locator("[data-operation-type=income]").waitFor();
    const writes = await page.evaluate(() => window.financeWrites);
    assert.equal(writes.length, 2);
    assert.equal(writes[0].requestId, writes[1].requestId);
    await open("расход");
    await dialog.locator('input[inputmode="decimal"]').fill("500");
    await choose("Счет списания", "Касса сотрудника");
    await dialog
      .getByRole("textbox", { name: "Комментарий к расходу" })
      .fill("Комментарий");
    assert.equal(await dialog.locator(".offset-toggle-btn").count(), 0);
    await activate(dialog.locator(".popup-actions-row .btn-submit").first());
    await dialog.waitFor({ state: "detached" });
    const expense = page.locator("[data-operation-type=expense]");
    await expense.waitFor();
    assert.equal(
      await expense
        .getByRole("button", { name: "Согласовать", exact: true })
        .count(),
      0,
    );
    await page.evaluate(() => window.financeFixture.owner());
    await activate(
      expense.getByRole("button", { name: "Согласовать", exact: true }),
    );
    await expense.locator("[data-state=approved]").waitFor();
    await open("перевод");
    await dialog.locator('input[inputmode="decimal"]').fill("200");
    await choose("Со счета", "Касса сотрудника");
    await choose("На счет", "Счёт получателя");
    await activate(dialog.locator(".popup-actions-row .btn-submit").first());
    await dialog.waitFor({ state: "detached" });
    await page.locator("[data-operation-type=transfer]").waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    `Chat finance ${engine}: real forms, restricted account options, retained drafts, cards, approval, touch and desktop geometry passed`,
  );
} finally {
  await browser?.close();
  await server.close();
}
