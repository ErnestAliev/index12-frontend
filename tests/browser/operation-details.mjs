import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-operation-details-vite",
  server: { host: "127.0.0.1", port: 5227, strictPort: true },
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
  for (const width of [390, 1280])
    for (const theme of ["dark", "light"])
      for (const type of ["income", "expense", "transfer"]) {
        const context = await browser.newContext({
            viewport: { width, height: 950 },
            hasTouch: width < 1000,
          }),
          page = await context.newPage(),
          errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.setDefaultTimeout(10000);
        await page.goto(
          "http://127.0.0.1:5227/tests/browser/fixtures/operation-share.html",
        );
        await page.evaluate(
          ({ type, theme }) => {
            document.documentElement.dataset.theme = theme;
            document.documentElement.style.setProperty(
              "--safe-area-bottom",
              "34px",
            );
            document.documentElement.style.setProperty(
              "--safe-area-left",
              "16px",
            );
            document.documentElement.style.setProperty(
              "--safe-area-right",
              "16px",
            );
            shareFixture.mode(type);
            shareFixture.operation.description =
              "Lounge One — коммунальные платежи. По задаче " +
              shareFixture.task._id +
              ".";
            shareFixture.operation.comment = "Отдельный комментарий";
            const message = {
              _id: crypto.randomUUID(),
              kind: "operation_share",
              operationShare: {
                operationId: shareFixture.operation._id,
                title: "Операция",
                mode: "button",
                rows: [{ label: "Сумма", value: "130 000 ₸" }],
              },
              text: "Операция",
              authorId: shareFixture.chat.me.actorId,
              authorName: "Эрнест",
              attachments: [],
              createdAt: new Date().toISOString(),
            };
            shareFixture.chat.mergeMessage(message);
            shareFixture.chat.mergeMessage({
              ...message,
              _id: crypto.randomUUID(),
              workspaceId: shareFixture.user.currentWorkspaceId,
              operationShare: {
                ...message.operationShare,
                mode: "table",
                rows: [
                  {
                    label: "Описание",
                    value: shareFixture.operation.description,
                  },
                ],
              },
            });
          },
          { type, theme },
        );
        const taskLink = page
          .getByRole("table", { name: "Поля операции" })
          .getByRole("link", { name: "Открыть исходную задачу" });
        await taskLink.waitFor();
        assert.match(
          await taskLink.getAttribute("href"),
          /task=22222222-2222-4222-8222-222222222222/,
        );
        const activate = (element) =>
          width < 1000 ? element.tap() : element.click();
        await activate(page.locator(".operation-share-button").last());
        const dialog = page.locator("dialog.team-finance-dialog"),
          form = dialog.locator(".financial-operation-popup");
        await form.waitFor();
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        assert.equal(await form.locator(".floating-label").count(), 0);
        assert.equal(await form.locator(".operation-details-body").count(), 0);
        await page
          .waitForFunction(() =>
            [
              ...document.querySelectorAll(
                "dialog.team-finance-dialog .popup-actions-row .btn-submit",
              ),
            ].some((el) =>
              ["rgb(33, 130, 62)", "rgb(25, 107, 49)"].includes(
                getComputedStyle(el).backgroundColor,
              ),
            ),
          )
          .catch(async (e) => {
            console.error(
              "COLOR",
              theme,
              type,
              await form
                .locator(".popup-actions-row .btn-submit")
                .evaluate((el) => ({
                  cls: el.className,
                  bg: getComputedStyle(el).backgroundColor,
                  color: getComputedStyle(el).color,
                  html: el.outerHTML,
                  rules: [...document.styleSheets].flatMap((sheet) => {
                    try {
                      return [...sheet.cssRules].flatMap((rule) =>
                        rule.selectorText &&
                        el.matches(rule.selectorText) &&
                        rule.style.background
                          ? [
                              {
                                sel: rule.selectorText,
                                bg: rule.style.background,
                              },
                            ]
                          : [],
                      );
                    } catch {
                      return [];
                    }
                  }),
                })),
            );
            throw e;
          });
        const geometry = await form.evaluate((el) => {
          const save = el.querySelector(".popup-actions-row .btn-submit"),
            close = el.querySelector(".finance-close");
          return {
            rect: el.getBoundingClientRect().toJSON(),
            save: save.getBoundingClientRect().toJSON(),
            background: getComputedStyle(save).backgroundColor,
            color: getComputedStyle(save).color,
            close: close.getBoundingClientRect().toJSON(),
            heading: el.querySelector("h3").getBoundingClientRect().toJSON(),
          };
        });
        assert.ok(geometry.rect.height < 780, JSON.stringify(geometry));
        assert.equal(geometry.save.height, 44);
        assert.ok(
          ["rgb(33, 130, 62)", "rgb(25, 107, 49)"].includes(
            geometry.background,
          ),
          JSON.stringify({ theme, type, geometry }),
        );
        assert.equal(geometry.color, "rgb(255, 255, 255)");
        assert.ok(
          geometry.close.top >= geometry.rect.top &&
            geometry.close.bottom < geometry.rect.top + 80,
          JSON.stringify(geometry),
        );
        await activate(
          form.getByRole("button", { name: "Описание", exact: true }),
        );
        assert.match(
          await form.locator(".operation-details-body").innerText(),
          /Lounge One/,
        );
        assert.ok(
          (await form
            .getByRole("link", { name: "Открыть исходную задачу" })
            .count()) >= 1,
        );
        await activate(form.getByRole("button", { name: "Изменить описание" }));
        await form
          .getByRole("textbox", { name: "Описание операции" })
          .fill(
            "Уточнённое описание. По задаче " +
              "22222222-2222-4222-8222-222222222222" +
              ".",
          );
        await activate(form.locator(".popup-actions-row .btn-submit"));
        await dialog.waitFor({ state: "detached" });
        const body = await page.evaluate(() => operationWrites.at(-1).body);
        assert.match(body.description, /Уточнённое описание/);
        assert.equal(body.comment, "Отдельный комментарий");
        await activate(page.locator(".operation-share-button").last());
        await form.waitFor();
        await dialog.getByRole("button", { name: "Закрыть операцию" }).focus();
        let focus = await dialog
          .getByRole("button", { name: "Закрыть операцию" })
          .evaluate((el) => ({
            outline: getComputedStyle(el).outlineWidth,
            shadow: getComputedStyle(el).boxShadow,
          }));
        assert.equal(focus.outline, "0px");
        assert.equal(focus.shadow, "none");
        await page.keyboard.press("Tab");
        await dialog.getByRole("button", { name: "Закрыть операцию" }).focus();
        focus = await dialog
          .getByRole("button", { name: "Закрыть операцию" })
          .evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth));
        assert.ok(focus >= 2);
        await activate(
          form.locator(".operation-details-tasks").getByRole("link").first(),
        );
        await dialog.waitFor({ state: "detached" });
        assert.equal(
          await page.evaluate(() => shareFixture.chat.requestedTaskId),
          "22222222-2222-4222-8222-222222222222",
        );
        assert.deepEqual(errors, []);
        await context.close();
      }
  console.log(
    `Operation details ${engine}: compact layout, green save, hidden labels, editable description, preserved comment, task navigation and pointer/keyboard focus passed`,
  );
} finally {
  await browser?.close();
  await server.close();
}
