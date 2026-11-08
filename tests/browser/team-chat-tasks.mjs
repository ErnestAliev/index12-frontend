import process from "node:process";
import { Buffer } from "node:buffer";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const suffix = " " + Date.now();
const fixture = JSON.parse(
  await readFile(
    process.env.INDEX12_TASK_BROWSER_FIXTURE ||
      "/private/tmp/index12-task-browser.json",
    "utf8",
  ),
);
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-task-vite-cache",
  define: {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(
      fixture.origin + "/api",
    ),
  },
  server: { host: "127.0.0.1", port: 5192, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await ctx.addCookies([
    { name: "connect.sid", value: fixture.cookie, url: fixture.origin },
  ]);
  const page = await ctx.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300));
  });
  await page.goto(`http://127.0.0.1:5192/team/${fixture.inviteToken}`);
  await page
    .getByRole("button", { name: "Добавить в чат", exact: true })
    .waitFor({ timeout: 20000 });
  if (await page.locator(".chat-setup-backdrop").count())
    await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Добавить в чат", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Новая задача", exact: true })
    .click();
  const panel = page.locator(".task-panel");
  await panel.getByRole("button", { name: "Себе", exact: true }).click();
  await panel.getByRole("button", { name: "К сроку", exact: true }).click();
  await panel.getByRole("dialog", { name: "Выберите дату" }).waitFor();
  await panel.locator(".calendar button").nth(14).click();
  await panel
    .getByRole("textbox", { name: "Описание задачи", exact: true })
    .fill("Проверить договор и забрать документы" + suffix);
  await panel
    .getByRole("button", { name: "Указать время", exact: true })
    .click();
  await panel.getByRole("button", { name: "18 часов", exact: true }).click();
  await panel.locator(".clock-face button").filter({ hasText: /^15$/ }).click();
  await panel
    .getByRole("button", { name: "Поставить задачу", exact: true })
    .click();
  await panel.waitFor({ state: "hidden" });
  const cover = page
    .locator(".task-cover")
    .filter({ hasText: "Проверить договор и забрать документы" + suffix });
  await cover.waitFor();
  assert.equal((await cover.boundingBox()).height, 90);
  await cover.click();
  await panel
    .locator(".task-discussion .team-compose-area input[type=file]")
    .setInputFiles({
      name: "Снимок.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.waitForFunction(
    () => !!document.querySelector(".task-discussion .team-staged"),
  );
  await panel
    .getByRole("textbox", { name: "Сообщение", exact: true })
    .fill("Первое сообщение в задаче");
  await panel.getByRole("button", { name: "Отправить", exact: true }).click();
  await panel
    .locator(".task-discussion .team-message")
    .filter({ hasText: "Первое сообщение в задаче" })
    .waitFor();
  await panel
    .locator(".task-discussion .team-feed")
    .getByRole("button", { name: "Снимок.png", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Снимок.png", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Закрыть снимок.png", exact: true })
    .click();
  if (!(await panel.locator(".task-overview").isVisible()))
    await panel
      .getByRole("button", { name: "Параметры задачи", exact: true })
      .click();
  await panel.locator(".task-description").click();
  await panel
    .getByRole("textbox", { name: "Описание задачи", exact: true })
    .fill("Договор проверен — забрать документы" + suffix);
  await page.locator(".task-header").click();
  await panel
    .locator(".task-description")
    .filter({ hasText: "Договор проверен — забрать документы" + suffix })
    .waitFor();
  await panel
    .getByRole("button", { name: "Кому: Calendar owner", exact: true })
    .click();
  await panel.getByRole("button", { name: "Employee", exact: true }).click();
  await panel.getByRole("combobox", { name: "Статус задачи", exact: true }).selectOption("progress");
  await panel.getByRole("combobox", { name: "Статус задачи", exact: true }).selectOption("done");
  await panel.getByRole("button", { name: "Назад", exact: true }).click();
  const completed = page
    .locator(".task-cover")
    .filter({ hasText: "Договор проверен — забрать документы" + suffix });
  assert.equal((await completed.boundingBox()).height, 44);
  await page.getByRole("button", { name: "Меню чата", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Заявки", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Задачи", exact: true }).click();
  await panel.locator(".task-list-row").first().waitFor();
  await panel.getByRole("button", { name: "Фильтры", exact: true }).click();
  await panel.getByLabel("Ответственный", { exact: true }).selectOption("");
  await panel.getByLabel("Срок", { exact: true }).selectOption("none");
  await panel.getByRole("button", { name: "Фильтры", exact: true }).click();
  await mkdir("output/playwright", { recursive: true });
  await panel.getByRole("button", { name: "Фильтры", exact: true }).click();
  await panel.getByRole("button", { name: "Сбросить", exact: true }).click();
  await panel.getByRole("button", { name: "Фильтры", exact: true }).click();
  await page.screenshot({
    path: "output/playwright/production-tasks-mobile.png",
  });
  // The window already follows visualViewport; emulate keyboard geometry and safe insets separately.
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 736, height: 390 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(viewport);
    for (const bottom of [0, 20, 34]) {
      await page.evaluate((bottom) => {
        document.documentElement.style.setProperty(
          "--safe-area-bottom",
          bottom + "px",
        );
        document.documentElement.style.setProperty("--safe-area-left", "20px");
        document.documentElement.style.setProperty("--safe-area-right", "20px");
      }, bottom);
      await panel
        .getByRole("button", { name: "Новая задача", exact: true })
        .click();
      await panel.getByRole("button", { name: "Себе", exact: true }).click();
      await panel
        .getByRole("button", { name: "Без срока", exact: true })
        .click();
      const publish = panel.getByRole("button", {
        name: "Поставить задачу",
        exact: true,
      });
      await publish.scrollIntoViewIfNeeded();
      const bounds = await publish.boundingBox();

      assert.ok(
        bounds.x >= 20 && bounds.x + bounds.width <= viewport.width - 20,
        "safe side areas respected",
      );
      assert.ok(
        bounds.y + bounds.height <= viewport.height - bottom - 12,
        JSON.stringify({ viewport, bottom, bounds }),
      );
      assert.ok(bounds.height >= 44, "bottom action hit target");
      await panel.getByRole("button", { name: "Закрыть", exact: true }).click();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await panel
    .getByRole("button", { name: "Новая задача", exact: true })
    .click();
  await panel.getByRole("button", { name: "Себе", exact: true }).click();
  await panel.getByRole("button", { name: "Без срока", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", {
      configurable: true,
      get: () => 440,
    });
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() =>
    document.querySelector(".codex-chat-window.keyboard-open"),
  );
  const keyboardButton = await panel
    .getByRole("button", { name: "Поставить задачу", exact: true })
    .boundingBox();

  assert.ok(
    keyboardButton.y + keyboardButton.height <= 430,
    "submit stays above simulated keyboard",
  );
  await page.screenshot({
    path: "output/playwright/production-task-keyboard.png",
  });

  assert.deepEqual(errors, []);
  console.log(
    "PASS: real Vue UI creation, immediate calendar, dial time, comments, inline text/assignee edits, completion, filters",
  );
} finally {
  await browser?.close();
  await server.close();
}
