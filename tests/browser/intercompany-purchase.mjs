// Real forms/store/timeline, controlled HTTP receipts; no screenshots or production data.
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  server: { host: "127.0.0.1", port: 5220, strictPort: true },
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
  for (const mobile of [false, true])
    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
        hasTouch: mobile,
        isMobile: mobile,
      });
      context.setDefaultTimeout(10000);
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (route) =>
        new URL(route.request().url()).hostname === "127.0.0.1"
          ? route.continue()
          : route.abort(),
      );
      await page.goto(
        "http://127.0.0.1:5220/tests/browser/fixtures/intercompany-purchase.html",
      );
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      const activate = (locator) => (mobile ? locator.tap() : locator.click());
      async function choose(label, value) {
        const field = page
          .locator(".base-select")
          .filter({
            has: page.locator(".placeholder, .small-label", { hasText: label }),
          })
          .first();
        await activate(field.locator(".select-trigger"));
        await activate(
          field.locator(".option-label").getByText(value, { exact: true }),
        );
      }
      await page
        .locator('.popup-content input[inputmode="decimal"]')
        .fill("1234.56");
      await choose("Счет списания", "UUU основной");
      const party = page
        .locator(".base-select")
        .filter({ has: page.getByRole("combobox", { name: "Кому (Контрагент)", exact: true }) });
      await activate(party.locator(".select-trigger"));
      const headers = await party.locator(".group-header").allTextContents();
      assert.ok(
        headers.findIndex((text) => text.includes("Мои компании")) >
          headers.findIndex((text) => text.includes("Физлица")),
      );
      assert.equal(
        await party
          .locator(".option-label")
          .getByText("TOO UUU", { exact: true })
          .count(),
        0,
        "current owner is not a purchase counterparty",
      );
      await activate(
        party.locator(".option-label").getByText("TOO YYY", { exact: true }),
      );
      await choose("Счёт зачисления", "YYY основной");
      await choose("Категория", "Услуги");
      await choose("Проект", "Проект из системы");
      await activate(page.locator(".popup-content .save-wide"));
      await page.locator(".popup-content").waitFor({ state: "hidden" });
      await page.waitForFunction(
        () =>
          window.purchaseTest.store.getOperationsForDay("2026-314").length ===
          2,
      );
      const payload = await page.evaluate(
        () =>
          window.purchaseTest.requests.find(
            (row) => row.path === "/intercompany-purchases",
          ).data,
      );
      assert.equal(payload.purchaseAccountId, "000000000000000000000012");
      assert.equal(payload.contractorId, null);
      assert.equal(payload.amount, -1234.56);
      const chips = page.locator('[data-date-key="2026-314"] .operation-chip');
      assert.equal(await chips.count(), 2);
      assert.ok(
        (await chips.allTextContents()).every((text) =>
          text.includes("Услуги"),
        ),
      );
      await page.evaluate(() => window.purchaseTest.openIncome());
      await page.locator(".popup-content").waitFor();
      assert.equal(await page.getByRole('combobox',{name:'От кого',exact:true}).inputValue(),'TOO UUU');
      assert.ok(
        (await page.locator(".popup-content").innerText()).includes(
          "UUU основной",
        ),
      );
      await page.locator(".popup-overlay").click({ position: { x: 2, y: 2 } });
      // A failing HTTP update rolls both amounts back together.
      await page.evaluate(() => window.purchaseTest.editIncome());
      await page.waitForFunction(() => window.purchaseTest.pending);
      assert.deepEqual(
        await page.evaluate(() =>
          window.purchaseTest.store
            .getOperationsForDay("2026-314")
            .map((op) => op.amount)
            .sort((a, b) => a - b),
        ),
        [-2000, 2000],
      );
      await page.evaluate(() => window.purchaseTest.reject());
      await page.waitForFunction(() => window.purchaseTest.error);
      assert.deepEqual(
        await page.evaluate(() =>
          window.purchaseTest.store
            .getOperationsForDay("2026-314")
            .map((op) => op.amount)
            .sort((a, b) => a - b),
        ),
        [-1234.56, 1234.56],
      );
      // Drag the income half. Both rows move before the server has answered.
      if (!mobile) {
        await chips
          .nth(1)
          .dragTo(page.locator('[data-date-key="2026-315"] .hour-cell').nth(6));
      } else await page.evaluate(() => window.purchaseTest.moveIncome());
      await page.waitForFunction(() => window.purchaseTest.pending);
      assert.equal(
        await page.evaluate(
          () =>
            window.purchaseTest.store.getOperationsForDay("2026-314").length,
        ),
        0,
      );
      assert.deepEqual(
        await page.evaluate(() =>
          window.purchaseTest.store
            .getOperationsForDay("2026-315")
            .map((op) => op.cellIndex)
            .sort((a, b) => a - b),
        ),
        [5, 6],
      );
      await page.evaluate(() => window.purchaseTest.release());
      await page.waitForFunction(() => !window.purchaseTest.pending);
      await page.evaluate(() => window.purchaseTest.openIncome("2026-315"));
      await activate(page.locator(".popup-content .delete-btn"));
      await page
        .getByText("Удалить связанный расход и доход?", { exact: true })
        .waitFor();
      await activate(
        page.getByRole("button", { name: "Да, удалить", exact: true }),
      );
      await page.waitForFunction(() => window.purchaseTest.pending);
      assert.equal(
        await page.evaluate(
          () =>
            window.purchaseTest.store.getOperationsForDay("2026-315").length,
        ),
        0,
      );
      await page.evaluate(() => window.purchaseTest.release());
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${engine} ${mobile ? "touch" : "mouse"} ${theme}: managed-company section, peer account, pair creation, income editing, atomic optimistic edit/rollback, linked move and deletion`,
      );
      await context.close();
    }
} finally {
  await browser?.close();
  await server.close();
}
