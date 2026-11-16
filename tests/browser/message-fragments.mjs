import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-fragments-vite",
  server: { host: "127.0.0.1", port: 5223, strictPort: true },
});
async function selectText(source, text) {
  await source.evaluate((root, text) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
      nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const full = nodes.map((node) => node.textContent).join(""),
      start = full.indexOf(text);
    if (start < 0) throw Error("Fixture selection not found: " + text);
    let offset = 0,
      first,
      last;
    for (const node of nodes) {
      if (!first && start < offset + node.length)
        first = [node, start - offset];
      if (start + text.length <= offset + node.length) {
        last = [node, start + text.length - offset];
        break;
      }
      offset += node.length;
    }
    const range = document.createRange();
    range.setStart(...first);
    range.setEnd(...last);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, text);
}
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
  for (const chat of ["team", "codex"])
    for (const width of [320, 390, 1280])
      for (const theme of ["dark", "light"]) {
        const mobile = width < 1000,
          context = await browser.newContext({
            viewport: { width, height: 950 },
            hasTouch: mobile,
            isMobile: mobile,
          });
        const page = await context.newPage(),
          errors = [],
          sends = [];
        context.setDefaultTimeout(10000);
        await context.addInitScript(
          ({ mobile, theme }) => {
            window.fixtureMobile = mobile;
            localStorage.setItem("theme", theme);
            window.fragmentCopies = [];
            Object.defineProperty(navigator, "clipboard", {
              configurable: true,
              value: {
                writeText: async (text) => {
                  window.fragmentCopies.push(text);
                },
              },
            });
          },
          { mobile, theme },
        );
        page.on("pageerror", (e) => errors.push(e.message));
        const history = [
          {
            id: "source-assistant",
            role: "assistant",
            content:
              "Первый абзац.\n\nВот **нужный** [фрагмент](https://example.invalid) длинного ответа.\n\nПоследний абзац.",
          },
          {
            id: "source-user",
            role: "user",
            content:
              "Своё сообщение.\n\nЗдесь свой фрагмент для обсуждения.\n\nКонец сообщения.",
          },
        ];
        await page.route("**/api/**", async (route) => {
          const path = new URL(route.request().url()).pathname;
          let data = [];
          if (path.endsWith("/codex/status"))
            data = { connected: true, configured: true };
          else if (path.endsWith("/codex/chats"))
            data = {
              chats: [{ id: "chat", title: "Комментарии", threadId: "thread" }],
            };
          else if (path.endsWith("/codex/chats/chat"))
            data = {
              chat: { id: "chat", threadId: "thread" },
              cachedHistory: { messages: history },
            };
          else if (path.endsWith("/codex/chats/chat/jobs")) {
            const body = route.request().postDataJSON();
            if (body.kind === "history")
              data = {
                job: { status: "completed", result: { messages: history } },
              };
            else {
              sends.push(body);
              history.push({
                id: "sent-" + sends.length,
                role: "user",
                content: body.message,
              });
              data = {
                job: {
                  status: "completed",
                  result: { threadId: "thread", text: "Комментарий получен" },
                },
              };
            }
          }
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(data),
          });
        });
        await page.goto(
          "http://127.0.0.1:5223/tests/browser/fixtures/fragments-" +
            chat +
            ".html",
        );
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          for (const side of ["left", "right"])
            document.documentElement.style.setProperty(
              "--safe-area-" + side,
              "16px",
            );
          document.documentElement.style.setProperty(
            "--safe-area-bottom",
            "34px",
          );
        }, theme);
        const mainInput = page.getByRole("textbox", {
          name: chat === "team" ? "Сообщение сотрудникам" : "Спросите Codex",
          exact: true,
        });
        await mainInput.fill("Несохранённый основной текст");
        if (chat === "codex")
          await page
            .locator("input[type=file]")
            .setInputFiles({
              name: "черновик.txt",
              mimeType: "text/plain",
              buffer: Buffer.from("не прикреплять к комментарию"),
            });
        const activate = (locator) =>
          mobile ? locator.tap() : locator.click();
        for (const [index, excerpt] of [
          [0, "нужный фрагмент"],
          [1, "свой фрагмент"],
        ]) {
          const source = page.locator("[data-fragment-source]").nth(index);
          await source.waitFor();
          const selectionStyle = await source.evaluate(
            (el) =>
              getComputedStyle(el.querySelector(".codex-text")).userSelect,
          );
          assert.equal(selectionStyle, "text");
          if (mobile && chat === "team" && index === 0) {
            const box = await source.boundingBox();
            await source.dispatchEvent("pointerdown", {
              pointerType: "touch",
              pointerId: 71,
              button: 0,
              clientX: box.x + 8,
              clientY: box.y + 8,
            });
            const menu = page.getByRole("dialog", {
              name: "Действия с сообщением",
              exact: true,
            });
            await page
              .getByRole("button", { name: "Цитировать", exact: true })
              .waitFor().catch(async e => { console.error(JSON.stringify({ errors, dialogs: await page.getByRole('dialog').allTextContents(), menus: await page.locator('.team-message-menu').allTextContents() })); throw e; });
            await source.dispatchEvent("pointerup", {
              pointerType: "touch",
              pointerId: 71,
            });
            await activate(
              page.getByRole("button", { name: "Цитировать", exact: true }),
            );
          }
          await selectText(source, excerpt);
          const toolbar = page.getByRole("toolbar", {
            name: "Выделенный текст",
            exact: true,
          });
          await toolbar.waitFor();
          await source.dispatchEvent("contextmenu", { button: 2 });
          assert.equal(
            await page.evaluate(() => getSelection().toString()),
            excerpt,
          );
          await activate(
            toolbar.getByRole("button", { name: "Копировать", exact: true }),
          );
          assert.equal(
            await page.evaluate(() => fragmentCopies.at(-1)),
            excerpt,
          );
          await selectText(source, excerpt);
          await toolbar.waitFor();
          const bounds = await toolbar.boundingBox();
          assert.ok(
            bounds.x >= 16 && bounds.x + bounds.width <= width - 16,
            JSON.stringify(bounds),
          );
          await activate(
            toolbar.getByRole("button", {
              name: /^(Комментировать|Цитировать)$/,
            }),
          );
          const editor = page.getByRole("form", {
            name: "Комментарий к фрагменту",
            exact: true,
          });
          await editor.waitFor();
          assert.equal(await editor.locator("blockquote").innerText(), excerpt);
          await editor
            .getByRole("textbox", { name: "Текст комментария", exact: true })
            .fill("Комментарий " + index);
          const focus = await editor.getByRole('textbox').evaluate(el => ({ outline: getComputedStyle(el).outlineWidth, style: getComputedStyle(el).outlineStyle, font: getComputedStyle(el).fontSize }));
          assert.equal(focus.style, 'none');
          if (mobile) assert.equal(focus.font, '16px');
          const sent = chat === 'codex' ? page.waitForResponse(response => response.url().endsWith('/codex/chats/chat/jobs') && response.request().postDataJSON()?.kind === 'send') : null;
          await activate(
            editor.getByRole("button", { name: "Отправить", exact: true }),
          );
          await editor.waitFor({ state: "hidden" });
          if (sent) await sent;
          assert.equal(
            await mainInput.inputValue(),
            "Несохранённый основной текст",
          );
          if (chat === "team") {
            await page.waitForFunction(
              (index) => fragmentRequests.length === index + 1,
              index,
            );
            const payload = await page.evaluate(() => fragmentRequests.at(-1));
            assert.equal(payload.replyExcerpt.text, excerpt);
            assert.equal(payload.text, "Комментарий " + index);
            await page
              .locator(".team-reply-quote")
              .filter({ hasText: excerpt })
              .waitFor();
          } else {
            await page.waitForFunction(
              () => !document.querySelector(".codex-typing"),
            );
            assert.ok(sends[index].message.includes("> " + excerpt));
            assert.deepEqual(sends[index].attachments, []);
            await page
              .locator(".codex-fragment-quote")
              .filter({ hasText: excerpt })
              .waitFor();
          }
        }
        assert.deepEqual(errors, []);
        console.log(
          `PASS ${engine} ${chat} ${width} ${theme}: selected quote, copy, inline comment, own/other messages and preserved composer`,
        );
        await context.close();
      }
} finally {
  await browser?.close();
  await server.close();
}
