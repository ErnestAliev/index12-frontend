import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-operation-share-vite",
  server: { host: "127.0.0.1", port: 5226, strictPort: true },
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
  for (const type of ["expense", "income", "transfer"]) {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 960 },
        hasTouch: true,
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.stack));
    page.setDefaultTimeout(12000);
    await page.goto(
      "http://127.0.0.1:5226/tests/browser/fixtures/operation-share.html",
    );
    await page.waitForFunction(() => window.shareFixture);
    await page.evaluate((type) => window.shareFixture.mode(type), type);
    const chip = page.locator("#timeline-source .operation-chip"),
      chat = page.locator(".team-chat-conversation").last();
    await chip.waitFor();
    async function drop(native = false) {
      if (native) {
        await page.evaluate(() =>
          document.addEventListener(
            "dragstart",
            (event) => {
              window.nativeEffect = event.dataTransfer.effectAllowed;
            },
            { once: true },
          ),
        );
        await chip.dragTo(chat);
        await page
          .getByRole("dialog", { name: "Перенести операцию", exact: true })
          .waitFor();
        assert.equal(
          await page.evaluate(() => window.nativeEffect),
          "copyMove",
        );
        return;
      }
      const token = await page.evaluate(() => {
        const chip = document.querySelector("#timeline-source .operation-chip"),
          dt = new DataTransfer();
        chip.dispatchEvent(
          new DragEvent("dragstart", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
        window.dragData = dt;
        return {
          token: dt.getData("application/x-index12-chat-transfer"),
          effect: dt.effectAllowed,
          original: JSON.parse(dt.getData("application/json")).operation._id,
        };
      });
      assert.ok(token.token);
      await chat.dispatchEvent("dragenter", {
        dataTransfer: await page.evaluateHandle(() => window.dragData),
      });
      await chat.dispatchEvent("drop", {
        dataTransfer: await page.evaluateHandle(() => window.dragData),
      });
      await chip.dispatchEvent("dragend");
      await page
        .getByRole("dialog", { name: "Перенести операцию", exact: true })
        .waitFor();
    }
    await drop(engine === "chromium");
    await page.getByRole("button", { name: "Как кнопку", exact: true }).tap();
    await page.locator(".operation-share-button").waitFor();
    assert.equal(await page.evaluate(() => window.timelineMoves.length), 0);
    const original = await page.evaluate(() => ({
      date: shareFixture.operation.date,
      amount: shareFixture.operation.amount,
    }));
    await page.locator(".operation-share-button").click();
    const dialog = page.locator("dialog.team-finance-dialog");
    await dialog.locator(".financial-operation-popup").waitFor();
    await dialog.locator("input[inputmode=decimal]").fill("140000");
    await dialog.locator("input[type=date]").fill("2026-11-21");
    if (type !== "transfer") {
      const party = dialog
        .locator(".base-select")
        .filter({
          has: page.locator(
            'input[aria-label="' +
              (type === "income" ? "От кого" : "Кому (Контрагент)") +
              '"]',
          ),
        });
      await party.locator(".select-trigger").click();
      await dialog
        .getByRole("option")
        .filter({ hasText: "Новый поставщик" })
        .click();
    }
    assert.equal(await dialog.locator(".icon-actions").count(), 0);
    await dialog.locator(".popup-actions-row .btn-submit").first().click();
    await dialog.waitFor({ state: "detached" }).catch(async (error) => {
      console.error(
        "OPEN DIALOG",
        await dialog.innerText(),
        JSON.stringify(await page.evaluate(() => window.operationWrites)),
      );
      throw error;
    });
    const writes = await page.evaluate(() => window.operationWrites);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].id, "000000000000000000000010");
    assert.equal(Math.abs(writes[0].body.amount), 140000);
    assert.ok(writes[0].body.date.startsWith("2026-11-21"));
    if (type !== "transfer")
      assert.equal(writes[0].body.contractorId, "000000000000000000000007");
    assert.equal(await page.evaluate(() => window.operationShares.length), 1);
    await drop();
    await page
      .getByRole("button", { name: "Как таблицу", exact: true })
      .click();
    const table = page.getByRole("table", { name: "Поля операции" });
    await table.waitFor();
    assert.equal(
      await table.locator("tr").first().locator("th").innerText(),
      "Сумма",
    );
    assert.equal(
      await table.locator("tr").first().locator("td").innerText(),
      new Intl.NumberFormat("ru-RU").format(
        type === "expense" ? -140000 : 140000,
      ) + " ₸",
    );
    const savedTable = await table.innerText();
    await page.evaluate(() => (shareFixture.operation.amount = 777));
    assert.equal(await table.innerText(), savedTable);
    await page.evaluate(() => shareFixture.thread());
    await drop();
    await page.getByRole("button", { name: "Как кнопку", exact: true }).click();
    await page.waitForFunction(() => operationShares.length === 3);
    assert.equal(
      (await page.evaluate(() => operationShares.at(-1))).taskId,
      "22222222-2222-4222-8222-222222222222",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--safe-area-bottom", "34px");
      shareFixture.staff();
    });
    await page.locator(".operation-share-button").last().tap();
    await dialog.locator(".financial-operation-popup").waitFor();
    assert.equal(
      await dialog.locator(".popup-actions-row .btn-submit").count(),
      0,
    );
    assert.equal(
      await dialog.locator("input[inputmode=decimal]").isDisabled(),
      true,
    );
    assert.equal(await page.evaluate(() => window.operationWrites.length), 1);
    const box = await dialog
      .locator(".financial-operation-popup")
      .boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
    await dialog
      .getByRole("button", { name: "Закрыть операцию", exact: true })
      .tap();
    await dialog.waitFor({ state: "detached" });
    await page.evaluate(() => (window.deletedOperation = true));
    await page.locator(".operation-share-button").last().tap();
    await dialog.getByRole("alert").waitFor();
    assert.match(await dialog.innerText(), /Операция удалена/);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    `Operation shares ${engine}: chip copy, buttons, original edits for all three types, frozen tables, task threads, mobile and staff read-only passed`,
  );
} finally {
  await browser?.close();
  await server.close();
}
