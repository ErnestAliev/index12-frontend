import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
import assert from "node:assert/strict";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-mcp-setup-vite",
  server: { host: "127.0.0.1", port: 5218, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser =
    engine === "webkit"
      ? await webkit.launch({ headless: true })
      : await chromium.launch({
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          headless: true,
        });
  for (const theme of ["light", "dark"])
    for (const width of [320, 390, 834, 1280]) {
      const touch = width < 1000,
        context = await browser.newContext({
          viewport: { width, height: 900 },
          isMobile: touch,
          hasTouch: touch,
        });
      context.setDefaultTimeout(10000);
      await context.addInitScript((touch) => {
        window.fixtureShare = touch;
      }, touch);
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await context.route("https://chatgpt.com/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<title>Isolated ChatGPT link fixture</title>",
        }),
      );
      await page.goto(
        "http://127.0.0.1:5218/tests/browser/fixtures/team-mcp-setup.html",
      );
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        for (const [side, value] of Object.entries({
          top: 24,
          bottom: 34,
          left: 16,
          right: 16,
        }))
          document.documentElement.style.setProperty(
            "--safe-area-" + side,
            value + "px",
          );
      }, theme);
      const activate = (locator) => (touch ? locator.tap() : locator.click());
      const setup = page.locator(".mcp-setup");
      await setup.waitFor();
      assert.equal(
        await page
          .getByRole("heading", {
            name: "Подключить MCP коннектор",
            exact: true,
          })
          .count(),
        1,
      );
      assert.ok(
        (await setup.innerText()).length < 450,
        "keep the setup compact",
      );
      assert.equal(await setup.locator("button").count(), 1);
      assert.equal(
        await setup.locator("details,ol,pre,input").count(),
        0,
        "no alternative setup methods, scripts or long instructions",
      );
      assert.match(await setup.innerText(), /INDEX12/);
      assert.match(
        await setup.innerText(),
        /https:\/\/api.index12.com\/team-mcp/,
      );
      assert.match(await setup.innerText(), /OAuth/);
      const opener = setup.getByRole("link", {
        name: "Плагины ChatGPT",
        exact: true,
      });
      assert.equal(
        await opener.getAttribute("href"),
        "https://chatgpt.com/plugins",
      );
      assert.equal(await opener.getAttribute("target"), "_blank");
      if (engine === "chromium") {
        const [popup] = await Promise.all([
          context.waitForEvent("page"),
          activate(opener),
        ]);
        await popup.waitForLoadState();
        assert.equal(popup.url(), "https://chatgpt.com/plugins");
        await popup.close();
        await page.bringToFront();
      }
      const transfer = setup.getByRole("button", {
        name: touch ? "Поделиться" : "Скопировать сообщение",
        exact: true,
      });
      await activate(transfer);
      const text = await page.evaluate(
        () => window.setupShares.at(-1)?.text || window.setupCopies.at(-1),
      );
      assert.match(
        text,
        /На компьютере откройте https:\/\/chatgpt.com\/plugins/,
      );
      assert.match(text, /Добавить пользовательский сервер MCP/);
      assert.match(text, /Название: INDEX12/);
      assert.match(text, /URL сервера: https:\/\/api.index12.com\/team-mcp/);
      assert.match(text, /Аутентификация: OAuth/);
      assert.match(text, /своим логином сотрудника INDEX12/);
      assert.equal(
        await page.evaluate(() => setupCopies.length),
        touch ? 0 : 1,
      );
      if (touch) {
        assert.deepEqual(
          Object.keys(await page.evaluate(() => setupShares[0])).sort(),
          ["text", "title"],
          "send every step together as a single share payload",
        );
        await page.evaluate(() => (window.setupShareError = "AbortError"));
        await activate(transfer);
        assert.equal(
          await page.evaluate(() => setupCopies.length),
          0,
          "cancelling the share sheet does not copy or send anything",
        );
        assert.equal(await setup.getByRole("alert").count(), 0);
        await page.evaluate(() => (window.setupShareError = "NotAllowedError"));
        await activate(transfer);
        assert.equal(
          await page.evaluate(() => setupCopies.at(-1)),
          text,
          "failed share falls back to the complete message",
        );
        await page.evaluate(() => {
          window.setupShareError = null;
          window.setupShareUnavailable = true;
        });
      }
      await page.evaluate(() => (window.setupCopyFails = true));
      await activate(transfer);
      const manual = setup.getByRole("textbox", {
        name: "Сообщение для подключения",
        exact: true,
      });
      await manual.waitFor();
      assert.equal(await manual.inputValue(), text);
      assert.equal(
        await manual.evaluate((el) => el.selectionEnd - el.selectionStart),
        text.length,
      );
      assert.match(await setup.getByRole("alert").innerText(), /скопируйте/);
      await page.evaluate(() => (window.setupCopyFails = false));
      await activate(transfer);
      assert.equal(await manual.count(), 0);
      assert.match(await setup.getByRole("status").innerText(), /скопировано/);
      const bounds = await setup.evaluate((el) => ({
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
        button: el.querySelector("button").getBoundingClientRect().toJSON(),
      }));
      assert.ok(
        bounds.scroll <= width &&
          bounds.button.height >= 44 &&
          bounds.button.x >= 16 &&
          bounds.button.right <= width - 16,
        JSON.stringify(bounds),
      );
      assert.ok(
        bounds.button.bottom <= 900 - 34,
        "transfer action remains above the safe area",
      );
      await page.keyboard.press("Tab");
      await page.evaluate(() => window.setupFixture.publish());
      await page.locator(".mcp-install").waitFor();
      assert.equal(
        await page.locator(".mcp-install").getAttribute("href"),
        "https://chatgpt.com/plugins/plugin_fixture",
      );
      assert.equal(
        await setup.locator("dl").count(),
        0,
        "published plugin needs no server fields",
      );
      await activate(
        setup.getByRole("button", {
          name: touch ? "Поделиться" : "Скопировать сообщение",
          exact: true,
        }),
      );
      assert.match(
        await page.evaluate(() => setupCopies.at(-1)),
        /https:\/\/chatgpt.com\/plugins\/plugin_fixture/,
      );
      assert.doesNotMatch(
        await page.evaluate(() => setupCopies.at(-1)),
        /team-mcp/,
      );
      assert.deepEqual(
        await page.evaluate(() => window.setupWrites),
        [],
        "sharing setup data never creates grants or sends work messages",
      );
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${engine} ${theme} ${width}: compact setup, one complete share message, cancel/copy/manual fallbacks, published link, safe-area bounds`,
      );
      await context.close();
    }
} finally {
  await browser?.close();
  await server.close();
}
