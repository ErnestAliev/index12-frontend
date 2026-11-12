import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium",
  current = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  next = "b".repeat(40);
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-updates-vite",
  server: { host: "127.0.0.1", port: 5219, strictPort: true },
});
const html = await readFile("tests/browser/fixtures/team-updates.html", "utf8");
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
  for (const employee of [false, true]) {
    let version = current,
      navigations = 0;
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        userAgent:
          engine === "chromium"
            ? "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36"
            : undefined,
      }),
      page = await context.newPage();
    context.setDefaultTimeout(12000);
    await context.addInitScript(
      (employee) => (window.fixtureEmployee = employee),
      employee,
    );
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("**/app-release.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ version, builtAt: new Date().toISOString() }),
      }),
    );
    await context.route(
      (url) =>
        url.hostname === "127.0.0.1" &&
        ["/", "/team/fixture-invitation-0000000000"].includes(url.pathname),
      (route) => {
        navigations++;
        return route.fulfill({ contentType: "text/html", body: html });
      },
    );
    await page.goto(
      "http://127.0.0.1:5219" +
        (employee ? "/team/fixture-invitation-0000000000" : "/"),
    );
    await page.locator(".team-navigation-trigger").waitFor();
    await page.getByRole("button", { name: "Меню чата", exact: true }).tap();
    await page
      .getByRole("dialog", { name: "Меню чата", exact: true })
      .getByRole("button", { name: "Обновления", exact: true })
      .tap();
    const panel = page.getByRole("region", {
      name: "Обновления INDEX12",
      exact: true,
    });
    await panel.waitFor();
    await page.waitForFunction(() => window.appUpdates.latest);
    assert.match(await panel.innerText(), /актуальная версия/);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => {
        document.documentElement.style.setProperty(
          "--safe-area-bottom",
          "34px",
        );
        document.documentElement.style.setProperty("--safe-area-left", "20px");
        document.documentElement.style.setProperty("--safe-area-right", "20px");
      });
      const button = await panel
        .getByRole("button", { name: "Обновить", exact: true })
        .boundingBox();
      assert.ok(
        button &&
          button.height >= 44 &&
          button.x >= 20 &&
          button.x + button.width <= width - 20,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      window.searchChat.tab = "messages";
      window.updateFixture.applyOldNotification();
      window.updateFixture.openTask();
    });
    const task = page.locator(".task-panel"),
      field = task.locator(".team-compose-area textarea");
    await field.fill("Несохранённое сообщение в задаче");
    for (const offline of [false, true]) {
      await page.evaluate(async (offline) => {
        window.omitSelectedTask = true;
        window.taskOffline = offline;
        window.dispatchEvent(new Event("focus"));
        await window.searchChat.refresh();
        window.updateFixture.pollDestination();
        Object.defineProperty(window.visualViewport, "height", {
          configurable: true,
          get: () => 480,
        });
        window.visualViewport.dispatchEvent(new Event("resize"));
      }, offline);
      assert.equal(
        await field.inputValue(),
        "Несохранённое сообщение в задаче",
      );
      assert.equal(await task.isVisible(), true);
      assert.equal(
        await page.evaluate(() => searchChat.requestedTaskId),
        await page.evaluate(() => updateFixture.taskId),
      );
    }
    await page.evaluate(() => {
      window.taskOffline = false;
      window.omitSelectedTask = false;
    });
    version = next;
    await page.evaluate(() => appUpdates.check(true));
    await task.locator(".app-update.is-inline").waitFor();
    await page.evaluate((version) => updateFixture.openRelease(version), next);
    await panel.waitFor();
    assert.equal(await task.isVisible(), false);
    assert.equal(
      await field.inputValue(),
      "Несохранённое сообщение в задаче",
      "update page must retain the hidden conversation",
    );
    await page.getByRole("button", { name: "Меню чата", exact: true }).tap();
    await page
      .getByRole("dialog", { name: "Меню чата", exact: true })
      .getByRole("button", { name: "Чат", exact: true })
      .tap();
    await task.waitFor({ state: "visible" });
    assert.equal(await field.inputValue(), "Несохранённое сообщение в задаче");
    await page.evaluate((version) => updateFixture.openRelease(version), next);
    await panel.waitFor();
    version = current;
    await Promise.all([
      page.waitForNavigation({ waitUntil: "load" }),
      panel.getByRole("button", { name: "Обновить", exact: true }).tap(),
    ]);
    await page.locator(".task-panel .team-compose-area textarea").waitFor();
    assert.equal(
      await page
        .locator(".task-panel .team-compose-area textarea")
        .inputValue(),
      "Несохранённое сообщение в задаче",
    );
    assert.equal(
      new URL(page.url()).searchParams.get("task"),
      await page.evaluate(() => updateFixture.taskId),
    );
    assert.equal(navigations, 2);
    // Actual unsent sends block a reload instead of losing the queued message.
    await page.evaluate(() => {
      searchChat.outbox = [
        {
          _id: "sending",
          _delivery: "sending",
          text: "Pending",
          createdAt: new Date().toISOString(),
          authorId: "actor",
          authorName: "Эрнест",
          attachments: [],
        },
      ];
      searchChat.tab = "updates";
    });
    await panel.waitFor();
    await panel.getByRole("button", { name: "Обновить", exact: true }).tap();
    assert.match(
      await panel.getByRole("alert").innerText(),
      /отправки сообщений/,
    );
    assert.equal(navigations, 2);
    await page.evaluate(async () => {
      searchChat.outbox = [];
      searchChat.tab = "messages";
      window.omitSelectedTask = true;
      window.taskDenied = true;
      await searchChat.refresh();
    });
    assert.equal(
      await page.evaluate(() => searchChat.requestedTaskId),
      null,
      "confirmed denial closes the task; missing list entries do not",
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${engine} ${employee ? "employee" : "owner"}: task survives polls/keyboard/offline; update notice/menu, preserved draft and actual reload, denied task handled`,
    );
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
