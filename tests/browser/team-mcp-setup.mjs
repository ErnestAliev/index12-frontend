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
        const ownLink = root.getByRole("textbox", {
          name: "Ссылка на ваш чат",
          exact: true,
        });
        await ownLink.waitFor();
        assert.equal(await ownLink.inputValue(), chatUrl);
        await activate(
          root.getByRole("button", {
            name: "Скопировать ссылку на чат",
            exact: true,
          }),
        );
        assert.equal(await page.evaluate(() => setupCopies.at(-1)), chatUrl);
        if (mobile) {
          assert.equal(
            await root.locator(".mcp-setup").count(),
            0,
            "phone only transfers the personal chat link",
          );
          assert.match(
            await root.getByRole("list").innerText(),
            /Компьютер не подключён/,
          );
          const transfer = root.getByRole("button", {
            name: "Подключить на компьютер чат",
            exact: true,
          });
          assert.equal(
            await root.locator("button").first().innerText(),
            "Подключить на компьютер чат",
          );
          await activate(transfer);
          const data = await page.evaluate(() => setupShares.at(-1));
          assert.match(data.text, /Откройте на компьютере/);
          assert.ok(data.text.endsWith(chatUrl));
          assert.doesNotMatch(data.text, /team-mcp|access=|password/);
          const copies = await page.evaluate(() => setupCopies.length);
          await page.evaluate(() => (window.setupShareError = "AbortError"));
          await activate(transfer);
          assert.equal(await page.evaluate(() => setupCopies.length), copies);
          await page.evaluate(
            () => (window.setupShareError = "NotAllowedError"),
          );
          await activate(transfer);
          assert.equal(await page.evaluate(() => setupCopies.at(-1)), chatUrl);
          await page.evaluate(() => setupFixture.computerConnected());
          await root
            .getByText("Компьютер подключён", { exact: true })
            .waitFor();
        } else {
          assert.equal(
            await root
              .getByRole("button", {
                name: "Подключить на компьютер чат",
                exact: true,
              })
              .count(),
            0,
            "a narrow computer window remains a computer",
          );
          assert.match(
            await root.getByRole("list").innerText(),
            /Компьютер подключён/,
          );
          const setup = root.locator(".mcp-setup"),
            opener = setup.getByRole("link", {
              name: "Открыть плагины ChatGPT",
              exact: true,
            });
          assert.equal(
            await opener.getAttribute("href"),
            "https://chatgpt.com/plugins",
          );
          assert.equal(await setup.getByRole("textbox").count(), 2);
          assert.doesNotMatch(
            await setup.innerText(),
            /OAuth|Аутентификация|автозаполнение/i,
          );
          assert.ok((await setup.innerText()).length < 280);
          assert.match(
            await setup.locator("strong").innerText(),
            /Нажмите «Добавить»/,
          );
          assert.match(await setup.innerText(), /справа вверху/);
          await activate(
            setup.getByRole("button", {
              name: "Скопировать название",
              exact: true,
            }),
          );
          assert.equal(
            await page.evaluate(() => setupCopies.at(-1)),
            "INDEX12",
          );
          await activate(
            setup.getByRole("button", {
              name: "Скопировать URL сервера",
              exact: true,
            }),
          );
          assert.equal(
            await page.evaluate(() => setupCopies.at(-1)),
            "https://api.index12.com/team-mcp",
          );
          await page.evaluate(() => (window.setupCopyFails = true));
          await activate(
            setup.getByRole("button", {
              name: "Скопировать URL сервера",
              exact: true,
            }),
          );
          const field = setup.getByRole("textbox", {
            name: "URL-адрес сервера MCP",
            exact: true,
          });
          assert.equal(
            await field.evaluate((el) => el.selectionEnd - el.selectionStart),
            (await field.inputValue()).length,
          );
          await page.evaluate(() => (window.setupCopyFails = false));
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
        }
        const bounds = await root.evaluate((el) => ({
          scroll: document.documentElement.scrollWidth,
          width: innerWidth,
          buttons: [...el.querySelectorAll("button,.setup-open")]
            .filter((e) => e.getClientRects().length)
            .map((e) => e.getBoundingClientRect().toJSON()),
        }));
        assert.ok(
          bounds.scroll <= width &&
            bounds.buttons.every(
              (b) => b.height >= 44 && b.x >= 16 && b.right <= width - 16,
            ),
          JSON.stringify(bounds),
        );
        assert.deepEqual(await page.evaluate(() => setupWrites), []);
        assert.deepEqual(errors, []);
        console.log(
          `PASS ${engine} ${device} ${theme} ${width}: personal login link, actual device states, mobile handoff or desktop MCP copy fields, safe bounds`,
        );
        await context.close();
      }
} finally {
  await browser?.close();
  await server.close();
}
