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
const chatUrl = "https://www.index12.com/team/fixture-invitation-0000000000";
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
  for (const device of ["mobile", "desktop"])
    for (const theme of ["light", "dark"])
      for (const width of [320, 390, 1280]) {
        const mobile = device === "mobile",
          touch = mobile || width < 1000;
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          isMobile: mobile,
          hasTouch: touch,
          userAgent: mobile
            ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.7 Mobile/15E148 Safari/604.1"
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/157.0.0.0 Safari/537.36",
        });
        context.setDefaultTimeout(10000);
        await context.addInitScript((device) => {
          window.fixtureDevice = device;
          window.fixtureShare = device === "mobile";
          Object.defineProperty(navigator, "platform", {
            value: device === "mobile" ? "iPhone" : "Win32",
          });
        }, device);
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
          for (const side of ["left", "right", "bottom"])
            document.documentElement.style.setProperty(
              "--safe-area-" + side,
              (side === "bottom" ? 34 : 16) + "px",
            );
        }, theme);
        const activate = (locator) => (touch ? locator.tap() : locator.click()),
          root = page.getByRole("region", {
            name: "MCP-коннектор",
            exact: true,
          });
        const heading = (name) =>
            root.getByRole("heading", { name, exact: true }),
          next = async () => {
            await activate(
              root.getByRole("button", {
                name: "Чат открыт на компьютере",
                exact: true,
              }),
            );
          };
        await heading(
          mobile ? "Откройте чат на компьютере" : "Откройте плагины ChatGPT",
        ).waitFor();
        assert.equal(await heading("MCP-коннектор").count(), 0);
        assert.equal(
          await root.getByRole("list").count(),
          0,
          "connections stay hidden until setup is confirmed",
        );
        async function bounds() {
          const b = await root.evaluate((el) => ({
            scroll: document.documentElement.scrollWidth,
            width: innerWidth,
            buttons: [...el.querySelectorAll("button,.setup-primary")]
              .filter((e) => e.getClientRects().length)
              .map((e) => e.getBoundingClientRect().toJSON()),
          }));
          assert.ok(
            b.scroll <= width &&
              b.buttons.every(
                (r) => r.height >= 44 && r.x >= 16 && r.right <= width - 16,
              ),
            JSON.stringify(b),
          );
        }
        if (mobile) {
          assert.equal(
            await root
              .getByRole("textbox", { name: "Ссылка на ваш чат", exact: true })
              .inputValue(),
            chatUrl,
          );
          await activate(
            root.getByRole("button", {
              name: "Подключить на компьютер чат",
              exact: true,
            }),
          );
          assert.ok(
            (await page.evaluate(() => setupShares.at(-1).text)).endsWith(
              chatUrl,
            ),
          );
          await bounds();
          await next();
          await heading("Откройте плагины ChatGPT").waitFor();
          await page.evaluate(() => (window.setupShareError = "AbortError"));
          await activate(
            root.getByRole("button", {
              name: "Отправить ссылку на плагины",
              exact: true,
            }),
          );
          await heading("Откройте плагины ChatGPT").waitFor();
          await page.evaluate(() => (window.setupShareError = ""));
          await activate(
            root.getByRole("button", {
              name: "Отправить ссылку на плагины",
              exact: true,
            }),
          );
          assert.ok(
            (await page.evaluate(() => setupShares.at(-1).text)).endsWith(
              "https://chatgpt.com/plugins",
            ),
          );
          await page.evaluate(() => setupFixture.reopen());
          await heading("Добавьте пользовательский сервер MCP").waitFor();
          await page.evaluate(() => setupFixture.computerConnected());
          await heading("Добавьте пользовательский сервер MCP").waitFor();
        } else {
          const opener = root.getByRole("link", {
            name: "Открыть плагины ChatGPT",
            exact: true,
          });
          assert.equal(
            await opener.getAttribute("href"),
            "https://chatgpt.com/plugins",
          );
          if (engine === "chromium") {
            const [popup] = await Promise.all([
              context.waitForEvent("page"),
              activate(opener),
            ]);
            await popup.waitForLoadState();
            assert.equal(popup.url(), "https://chatgpt.com/plugins");
            await popup.close();
            await page.bringToFront();
          } else await activate(opener);
        }
        await heading("Добавьте пользовательский сервер MCP").waitFor();
        assert.equal(
          await root
            .getByRole("button", { name: "Готово", exact: true })
            .count(),
          0,
        );
        assert.ok(
          Number(
            await root
              .locator("strong")
              .first()
              .evaluate((el) => getComputedStyle(el).fontWeight),
          ) >= 700,
        );
        await bounds();
        assert.equal(await root.getByRole("textbox").inputValue(), "INDEX12");
        await activate(
          root.getByRole("button", {
            name: "Скопировать название",
            exact: true,
          }),
        );
        await heading("Вставьте в поле «Подключение»").waitFor();
        assert.equal(await page.evaluate(() => setupCopies.at(-1)), "INDEX12");
        assert.equal(
          await root.getByRole("textbox").inputValue(),
          "https://api.index12.com/team-mcp",
        );
        await page.evaluate(() => (window.setupCopyFails = true));
        await activate(
          root.getByRole("button", {
            name: "Скопировать URL сервера",
            exact: true,
          }),
        );
        await heading("Вставьте в поле «Подключение»").waitFor();
        assert.equal(
          await root
            .getByRole("textbox")
            .evaluate((el) => el.selectionEnd - el.selectionStart),
          "https://api.index12.com/team-mcp".length,
        );
        await page.evaluate(() => (window.setupCopyFails = false));
        await activate(
          root.getByRole("button", { name: "Назад", exact: true }),
        );
        await heading("Добавьте пользовательский сервер MCP").waitFor();
        await activate(
          root.getByRole("button", {
            name: "Скопировать название",
            exact: true,
          }),
        );
        await heading("Вставьте в поле «Подключение»").waitFor();
        await page.evaluate(() => setupFixture.reopen());
        await heading("Вставьте в поле «Подключение»").waitFor();
        await activate(
          root.getByRole("button", {
            name: "Скопировать URL сервера",
            exact: true,
          }),
        );
        assert.equal(
          await page.evaluate(() => setupCopies.at(-1)),
          "https://api.index12.com/team-mcp",
        );
        await heading("Завершите подключение в ChatGPT").waitFor();
        assert.equal(
          await heading("Подключения").count(),
          0,
          "copying must never fabricate a connected state",
        );
        await bounds();
        await page.evaluate(() => setupFixture.connected());
        await heading("Подключения").waitFor();
        await root
          .getByRole("button", { name: "Отключить ChatGPT", exact: true })
          .waitFor();
        assert.match(
          await root.getByRole("list").innerText(),
          /Компьютер подключён/,
        );
        await bounds();
        await activate(
          root.getByRole("button", {
            name: "Добавить подключение",
            exact: true,
          }),
        );
        await heading(
          mobile ? "Откройте чат на компьютере" : "Откройте плагины ChatGPT",
        ).waitFor();
        assert.deepEqual(await page.evaluate(() => setupWrites), []);
        assert.deepEqual(errors, []);
        console.log(
          `PASS ${engine} ${device} ${theme} ${width}: automatic advances, combined Add step, separate copy steps, scoped progress, back/resume, real-connection completion and safe bounds`,
        );
        await context.close();
      }
} finally {
  await browser?.close();
  await server.close();
}
