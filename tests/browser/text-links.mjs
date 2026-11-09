// Synthetic chat data and DOM checks only; never load external links or capture images.
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  server: { host: "127.0.0.1", port: 5196, strictPort: true },
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
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage(),
      errors = [];
    context.setDefaultTimeout(10000);
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("**/*", (route) =>
      new URL(route.request().url()).hostname === "127.0.0.1"
        ? route.continue()
        : route.fulfill({
            status: 200,
            contentType: "text/html",
            body: "<title>Local link target</title>",
          }),
    );
    await page.goto(
      "http://127.0.0.1:5196/tests/browser/fixtures/team-chat-search.html",
    );
    await page.locator(".team-bubble").last().waitFor();
    await page.evaluate(() => {
      const chat = window.searchChat,
        task = chat.state.tasks[0];
      task.description = "Договор https://example.com/task и www.example.org";
      chat.state.messages = [
        {
          _id: "links-message",
          text: "Текст https://example.com/chat?q=1&b=2.\n`https://code.example.com`",
          authorId: "other",
          authorName: "Тест",
          attachments: [],
          createdAt: new Date().toISOString(),
          readCount: 0,
        },
        {
          _id: "links-task",
          kind: "task",
          taskId: task._id,
          authorId: "actor",
          authorName: "Тест",
          attachments: [],
          createdAt: new Date().toISOString(),
        },
      ];
    });
    const activate = async (locator) =>
      mobile ? locator.tap() : locator.click();
    async function opensLink(locator, url, keyboard = false) {
      await locator.scrollIntoViewIfNeeded();
      assert.equal(await locator.getAttribute("href"), url);
      assert.equal(await locator.getAttribute("rel"), "noopener noreferrer");
      const opened = context.waitForEvent("page");
      if (keyboard) {
        await locator.focus();
        await locator.press("Enter");
      } else await activate(locator);
      const tab = await opened;
      await tab.waitForURL(url);
      await tab.close();
    }
    for (const theme of ["dark", "light"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      const message = page.locator('[data-message-id="links-message"]');
      assert.equal(await message.locator("code a").count(), 0);
      await opensLink(message.locator("a"), "https://example.com/chat?q=1&b=2");
      await opensLink(
        page.locator(".cover-title a").first(),
        "https://example.com/task",
      );
      assert.equal(
        await page.locator(".task-panel").count(),
        0,
        "task link does not open its card",
      );
    }
    await activate(page.locator(".cover-title .linked-text > span").first());
    const description = page.locator(".task-description");
    await description.waitFor();
    await opensLink(
      description.locator("a").first(),
      "https://example.com/task",
      !mobile,
    );
    assert.equal(
      await page.locator(".task-text-editor").count(),
      0,
      "task link does not start editing",
    );
    await activate(description.locator(".linked-text > span").first());
    const editor = page.getByRole("textbox", {
      name: "Описание задачи",
      exact: true,
    });
    if (mobile)
      await page.evaluate(() => {
        const root = document.documentElement;
        for (const [side, value] of Object.entries({
          top: 24,
          bottom: 34,
          left: 16,
          right: 16,
        }))
          root.style.setProperty(`--safe-area-${side}`, value + "px");
        Object.defineProperty(window.visualViewport, "height", {
          configurable: true,
          get: () => 560,
        });
        window.visualViewport.dispatchEvent(new Event("resize"));
      });
    await editor.fill("Новый текст https://example.com/edited");
    const links = page.getByRole("navigation", { name: "Ссылки в тексте" });
    await links.waitFor();
    const bounds = await links.boundingBox();
    assert.ok(
      bounds.x >= (mobile ? 16 : 0) &&
        bounds.y >= (mobile ? 24 : 0) &&
        bounds.x + bounds.width <= (mobile ? 374 : 1280) &&
        bounds.y + bounds.height <= (mobile ? 526 : 900),
    );
    await opensLink(links.locator("a"), "https://example.com/edited");
    assert.equal(
      await editor.inputValue(),
      "Новый текст https://example.com/edited",
    );
    assert.equal(
      await editor.count(),
      1,
      "opening an editor link does not save or close the editor",
    );
    await page.evaluate(() => {
      window.searchChat.requestedTaskId = null;
      const input = document.createElement("input");
      input.type = "text";
      input.setAttribute("aria-label", "Тестовое текстовое поле");
      input.value = "https://example.com/input";
      input.style.cssText =
        "position:fixed;top:200px;left:20px;width:280px;z-index:99999";
      document.body.append(input);
      input.focus();
    });
    await opensLink(links.locator("a"), "https://example.com/input");
    assert.equal(
      await page.getByLabel("Тестовое текстовое поле").inputValue(),
      "https://example.com/input",
    );
    await page.evaluate(() => {
      const input = document.createElement("input");
      input.type = "password";
      input.value = "https://private.example.com";
      document.body.append(input);
      input.focus();
    });
    await links.waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${engine} ${mobile ? "touch" : "mouse/keyboard"}: chat, task, editor and text-field links, both themes`,
    );
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
