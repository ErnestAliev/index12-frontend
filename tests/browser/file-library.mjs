// Real components and synthetic files; DOM and gestures only, no screenshots or downloads.
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  server: { host: "127.0.0.1", port: 5211, strictPort: true },
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
        isMobile: mobile,
        hasTouch: mobile,
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
        "http://127.0.0.1:5211/tests/browser/fixtures/file-library.html",
      );
      await page.evaluate(
        ({ theme, mobile }) => {
          document.documentElement.dataset.theme = theme;
          if (mobile)
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
        },
        { theme, mobile },
      );
      const library = page.getByRole("region", { name: "Файлы рабочего чата" }),
        activate = (locator) => (mobile ? locator.tap() : locator.click());
      const chooseFilter = async (name, title, choice) => {
        await activate(library.getByRole("button", { name, exact: true }));
        await activate(
          page
            .getByRole("dialog", { name: title, exact: true })
            .getByRole("button", { name: choice, exact: true }),
        );
      };
      await library.locator("[data-file-id]").first().waitFor();
      assert.equal(
        await library.locator(".file-toolbar").count(),
        0,
        "no permanent filter row",
      );
      const header = await library
          .locator(".file-library-header")
          .boundingBox(),
        strip = await library
          .getByRole("toolbar", { name: "Фильтры и отображение файлов" })
          .boundingBox();
      assert.ok(
        header.height <= (mobile ? 140 : 64),
        "compact header preserves preview space",
      );
      const filterButtons = library.getByRole("toolbar").getByRole("button");
      const rows = await filterButtons.evaluateAll((items) =>
        items.map((el) => Math.round(el.getBoundingClientRect().y)),
      );
      assert.equal(
        new Set(rows).size,
        1,
        "filters and gallery/list share one row",
      );

      const bounds = await library.boundingBox();
      assert.equal(bounds.width, mobile ? 390 : 1280);
      assert.equal(bounds.height, mobile ? 844 : 900);
      assert.equal(await library.locator("[data-file-id]").count(), 80);
      assert.equal(
        await page.evaluate(() => window.fileFixture.views.length),
        0,
      );
      const style = await library.evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        z: +getComputedStyle(el).zIndex,
        overflow: el.scrollWidth <= el.clientWidth,
      }));
      assert.ok(
        theme === "dark"
          ? Number(style.background.match(/\d+/)[0]) < 80
          : Number(style.background.match(/\d+/)[0]) > 220,
      );
      assert.ok(style.z > 6000);
      assert.ok(style.overflow);
      await activate(
        library.getByRole("button", { name: "Показать ещё", exact: true }),
      );
      assert.equal(await library.locator("[data-file-id]").count(), 83);
      await chooseFilter("Проект файлов", "Проекты", "Проект системы");
      await page.waitForFunction(
        () => document.querySelectorAll("[data-file-id]").length === 41,
      );
      await chooseFilter("Проект файлов", "Проекты", "Без проекта");
      await page.waitForFunction(
        () => document.querySelectorAll("[data-file-id]").length === 42,
      );
      await chooseFilter("Проект файлов", "Проекты", "Все проекты");
      await chooseFilter("Тип файла", "Типы файлов", "Документы");
      await page.waitForFunction(
        () => document.querySelectorAll("[data-file-id]").length === 1,
      );
      await activate(
        library.getByRole("button", { name: "Список", exact: true }),
      );
      assert.equal(await library.locator(".file-list").count(), 1);
      await activate(
        library.getByRole("button", { name: "Фильтры файлов", exact: true }),
      );
      const extra = page.getByRole("dialog", {
        name: "Фильтры и вид",
        exact: true,
      });
      await extra.getByLabel("Размер миниатюр", { exact: true }).fill("300");
      await activate(
        extra.getByRole("button", { name: "Закрыть фильтр", exact: true }),
      );
      assert.equal(
        await library.evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--file-size"),
        ),
        "300px",
      );
      await activate(
        library.getByRole("button", { name: "Галерея", exact: true }),
      );
      const card = library.locator("[data-file-id]").first();
      if (!mobile) await card.click({ button: "right" });
      else
        await card.evaluate(async (el) => {
          const r = el.getBoundingClientRect();
          el.dispatchEvent(
            new PointerEvent("pointerdown", {
              bubbles: true,
              pointerId: 4,
              pointerType: "touch",
              clientX: r.x + 20,
              clientY: r.y + 20,
            }),
          );
          await new Promise((resolve) => setTimeout(resolve, 560));
          el.dispatchEvent(
            new PointerEvent("pointerup", {
              bubbles: true,
              pointerId: 4,
              pointerType: "touch",
            }),
          );
          el.click();
        });
      const menu = page.getByRole("menu", { name: "Действия с файлом" });
      await menu.waitFor();
      assert.equal(
        await page.evaluate(() => window.fileFixture.views.length),
        0,
        "context menu does not count as preview",
      );
      await activate(
        menu.getByRole("menuitemcheckbox", { name: "Важное", exact: true }),
      );
      await page.waitForFunction(() =>
        window.fileFixture.files[0].tags.includes("important"),
      );
      await activate(
        library.getByRole("button", {
          name: "Открыть файл Заметки.txt",
          exact: true,
        }),
      );
      const inspector = library.getByRole("complementary", {
        name: "Сведения о файле",
      });
      await inspector.locator("pre").waitFor();
      assert.equal(
        await inspector.locator("pre").innerText(),
        "Содержимое тестового документа",
      );
      await page.waitForFunction(() => window.fileFixture.views.length === 1);
      await activate(
        library.getByRole("button", { name: "Список", exact: true }),
      );
      if (!mobile) {
        const list = library.locator(".file-library-scroll"),
          divider = library.getByRole("separator", {
            name: "Ширина списка и предпросмотра",
            exact: true,
          });
        const listBefore = await list.boundingBox(),
          previewBefore = await inspector.boundingBox(),
          content = await inspector.locator(".inspector-preview").boundingBox();
        assert.ok(
          previewBefore.width > listBefore.width * 2,
          "list defaults to a large preview on the right",
        );
        assert.ok(
          content.height > 400,
          "preview uses the window height instead of a 250px box",
        );
        const grip = await divider.boundingBox();
        await page.mouse.move(grip.x + grip.width / 2, grip.y + 80);
        await page.mouse.down();
        await page.mouse.move(grip.x - 100, grip.y + 80);
        await page.mouse.up();
        const enlarged = await inspector.boundingBox();
        assert.ok(
          enlarged.width > previewBefore.width + 90,
          "divider expands preview without opening a separate viewer",
        );
        assert.ok((await list.boundingBox()).width < listBefore.width - 90);
        await divider.focus();
        await divider.press("ArrowRight");
        assert.ok(
          (await inspector.boundingBox()).width < enlarged.width - 25,
          "keyboard also adjusts the split",
        );
      } else {
        assert.equal(
          await library
            .getByRole("separator", {
              name: "Ширина списка и предпросмотра",
              exact: true,
            })
            .count(),
          0,
          "phone keeps its full-width preview",
        );
      }
      await inspector
        .getByLabel("Описание файла", { exact: true })
        .fill("Новое описание");
      await inspector
        .getByLabel("Описание файла", { exact: true })
        .press("Tab");
      await page.waitForFunction(
        () => window.fileFixture.files[0].description === "Новое описание",
      );
      await activate(
        inspector.getByRole("button").filter({ hasText: "Общий чат" }),
      );
      if (mobile) await library.waitFor({ state: "detached" });
      else {
        await page.waitForFunction(() =>
          document
            .querySelector(".team-file-library")
            ?.classList.contains("floating"),
        );
        const dock = await library.boundingBox();
        assert.ok(dock.x > 500 && dock.width < 800);
        const narrowList = library.locator(".file-library-scroll");
        assert.ok(
          await narrowList.evaluate(
            (el) => el.scrollWidth <= el.clientWidth + 1,
          ),
          "narrow list keeps names inside its own column",
        );
        assert.ok(
          (await inspector.boundingBox()).width >
            (await narrowList.boundingBox()).width * 1.5,
          "floating window preserves the generous preview",
        );
      }
      await page.waitForFunction(() =>
        document
          .querySelector(
            '[data-message-id=\"' + window.fileFixture.messageId + '\"]',
          )
          ?.classList.contains("reply-target"),
      );
      await page.evaluate(() =>
        window.fileFixture.chat.openFiles(window.fileFixture.files[82].fileId),
      );
      await library.waitFor();
      await library
        .getByRole("complementary", { name: "Сведения о файле" })
        .waitFor();
      assert.match(
        await library.locator(".file-inspector header strong").innerText(),
        /Документ 82/,
        "old file opens beyond first page",
      );
      await activate(
        library.getByRole("button", {
          name: "Закрыть сведения о файле",
          exact: true,
        }),
      );
      if (!mobile) {
        if (
          !(await library.evaluate((el) => el.classList.contains("floating")))
        )
          await activate(
            library.getByRole("button", {
              name: "Уменьшить окно файлов",
              exact: true,
            }),
          );
        const before = await library.boundingBox(),
          handle = library.getByRole("button", {
            name: "Изменить размер окна файлов",
            exact: true,
          });
        const leftEdge = library.getByRole("separator", {
            name: "Ширина окна файлов слева",
            exact: true,
          }),
          leftGrip = await leftEdge.boundingBox();
        await page.mouse.move(leftGrip.x + 4, leftGrip.y + 70);
        await page.mouse.down();
        await page.mouse.move(leftGrip.x - 96, leftGrip.y + 70);
        await page.mouse.up();
        const wider = await library.boundingBox();
        assert.equal(Math.round(wider.width - before.width), 100);
        assert.ok(
          Math.abs(wider.x + wider.width - before.x - before.width) < 1,
          "left edge expands while right stays anchored",
        );
        await leftEdge.focus();
        await leftEdge.press("ArrowRight");
        assert.equal(
          Math.round((await library.boundingBox()).width - before.width),
          80,
        );
        const topEdge = library.getByRole("separator", {
            name: "Высота окна файлов сверху",
            exact: true,
          }),
          oldTop = await library.boundingBox();
        await topEdge.focus();
        await topEdge.press("ArrowDown");
        const shorter = await library.boundingBox();
        assert.equal(Math.round(oldTop.height - shorter.height), 20);
        assert.ok(
          Math.abs(shorter.y + shorter.height - oldTop.y - oldTop.height) < 1,
          "top edge keeps the bottom anchored",
        );
        // Restore the original outer dimensions for the existing corner checks.
        await topEdge.press("ArrowUp");
        await leftEdge.focus();
        for (let n = 0; n < 4; n++) await leftEdge.press("ArrowRight");
        await handle.focus();
        await handle.press("ArrowLeft");
        assert.equal((await library.boundingBox()).width, before.width - 20);
        const corner = await handle.boundingBox();
        await page.mouse.move(corner.x + 10, corner.y + 10);
        await page.mouse.down();
        await page.mouse.move(corner.x - 10, corner.y - 10);
        await page.mouse.up();
        assert.equal(
          (await library.boundingBox()).width,
          before.width - 40,
          "corner drag resizes the actual window",
        );
        await handle.press("ArrowUp");
        await handle.press("ArrowUp");
        await handle.press("ArrowUp");
        const header = library.locator(".file-library-header"),
          r = await header.boundingBox();
        await page.mouse.move(r.x + 55, r.y + 15);
        await page.mouse.down();
        await page.mouse.move(r.x + 5, r.y + 65);
        await page.mouse.up();
        const after = await library.boundingBox();
        assert.ok(after.y >= before.y + 40);
        await activate(
          library.getByRole("button", { name: "На весь экран", exact: true }),
        );
        assert.equal((await library.boundingBox()).width, 1280);
      } else {
        await page.setViewportSize({ width: 390, height: 410 });
        await page.waitForFunction(
          () =>
            document.querySelector(".team-file-library").getBoundingClientRect()
              .height <= 410,
        );
        const r = await library.boundingBox();
        assert.ok(r.height <= 410);
        await page.setViewportSize({ width: 390, height: 844 });
      }
      await activate(
        library.getByRole("button", { name: "Закрыть файлы", exact: true }),
      );
      const previousViews = await page.evaluate(
        () => window.fileFixture.views.length,
      );
      await activate(page.locator("[data-media-file-id]").first());
      await page.waitForFunction(
        (count) => window.fileFixture.views.length > count,
        previousViews,
      );
      await activate(
        page
          .getByRole("dialog", { name: "Заметки.txt", exact: true })
          .getByRole("button", { name: "Закрыть заметки.txt", exact: true }),
      );
      await activate(
        page.getByRole("button", {
          name: "В коллекции: Заметки.txt",
          exact: true,
        }),
      );
      await library.waitFor();
      await library.locator(".file-inspector").waitFor();
      await activate(
        library.getByRole("button", {
          name: "Закрыть сведения о файле",
          exact: true,
        }),
      );
      await chooseFilter("Тип файла", "Типы файлов", "Таблицы");
      await page.waitForFunction(
        () => document.querySelectorAll("[data-file-id]").length === 1,
      );
      await activate(
        library.getByRole("button", {
          name: "В чат: Таблица.xlsx",
          exact: true,
        }),
      );
      await page.waitForFunction(
        () =>
          window.fileFixture.chat.requestedTaskId === window.fileFixture.taskId,
      );
      await page.locator(".task-panel .task-overview").waitFor();
      await page.evaluate(() => window.fileFixture.chat.stop());
      await library.waitFor({ state: "detached" });
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${engine} ${mobile ? "touch" : "mouse"} ${theme}: filters, pages, list/gallery, sizing, tags, real previews, source links, old attachments and session cleanup`,
      );
      await context.close();
    }
  for (const width of [320, 768, 1024])
    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 320 ? 700 : 1024 },
        hasTouch: true,
        isMobile: width === 320,
      });
      context.setDefaultTimeout(10000);
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) =>
        new URL(route.request().url()).hostname === "127.0.0.1"
          ? route.continue()
          : route.abort(),
      );
      await page.goto(
        "http://127.0.0.1:5211/tests/browser/fixtures/file-library.html",
      );
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        for (const [side, value] of Object.entries({
          left: 16,
          right: 16,
          top: 24,
          bottom: 34,
        }))
          document.documentElement.style.setProperty(
            "--safe-area-" + side,
            value + "px",
          );
      }, theme);
      const library = page.getByRole("region", { name: "Файлы рабочего чата" });
      await library.locator("[data-file-id]").first().waitFor();
      const strip = library.getByRole("toolbar", {
          name: "Фильтры и отображение файлов",
        }),
        header = library.locator(".file-library-header");
      const headerBox = await header.boundingBox(),
        stripBox = await strip.boundingBox();
      assert.ok(
        stripBox.x >= 16 && stripBox.x + stripBox.width <= width - 16 + 1,
        "all common icons fit within safe areas",
      );
      const buttons = strip.getByRole("button");
      assert.equal(await buttons.count(), 6);
      assert.ok(
        await buttons.evaluateAll((items) =>
          items.every(
            (el) =>
              el.getBoundingClientRect().height >= 44 &&
              el.getBoundingClientRect().width >= 44,
          ),
        ),
        "touch targets stay usable",
      );
      if (width >= 768) {
        const input = await library.getByRole("searchbox").boundingBox();
        assert.equal(
          Math.round(input.y + input.height / 2),
          Math.round(stripBox.y + stripBox.height / 2),
          "iPad puts controls in the header",
        );
        assert.ok(headerBox.height < 90);
      } else assert.ok(headerBox.height < 145);
      const projects = library.getByRole("button", {
        name: "Проект файлов",
        exact: true,
      });
      await projects.tap();
      const picker = page.getByRole("dialog", { name: "Проекты", exact: true });
      await picker.waitFor();
      let box = await picker.boundingBox();
      assert.ok(
        box.x >= 8 && box.x + box.width <= width - 8,
        "filter is centred and bounded",
      );
      await projects.tap();
      await picker.waitFor({ state: "detached" });
      await projects.tap();
      await picker
        .getByRole("button", { name: "Без проекта", exact: true })
        .tap();
      await page.waitForFunction(
        () => document.querySelectorAll("[data-file-id]").length === 42,
      );
      assert.equal(await projects.getAttribute("aria-pressed"), "true");
      await projects.tap();
      assert.equal(
        await picker
          .getByRole("button", { name: "Без проекта", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await picker
        .getByRole("button", { name: "Все проекты", exact: true })
        .tap();
      const people = library.getByRole("button", {
        name: "Кто загрузил",
        exact: true,
      });
      const tint = await people
        .locator(".file-icon-surface")
        .evaluate((el) => getComputedStyle(el).color);
      assert.equal(
        tint,
        theme === "dark" ? "rgb(141, 188, 204)" : "rgb(40, 95, 115)",
        "soft icon colours follow the selected theme",
      );
      await people.tap();
      const employees = page.getByRole("dialog", {
        name: "Сотрудники",
        exact: true,
      });
      await employees
        .getByRole("button", { name: "Эрнест", exact: true })
        .tap();
      await page.waitForFunction(() =>
        window.fileFixture.requests.some(
          (req) => req.params?.uploader === "owner:fixture",
        ),
      );
      assert.equal(await people.getAttribute("aria-pressed"), "true");
      await people.tap();
      await employees
        .getByRole("button", { name: "Все сотрудники", exact: true })
        .tap();
      const more = library.getByRole("button", {
        name: "Фильтры файлов",
        exact: true,
      });
      await more.tap();
      const extra = page.getByRole("dialog", {
        name: "Фильтры и вид",
        exact: true,
      });
      await extra.getByRole("button", { name: "По имени", exact: true }).tap();
      await page.waitForFunction(
        () => window.fileFixture.requests.at(-1)?.params?.sort === "name",
      );
      await extra.getByRole("button", { name: "Важное", exact: true }).tap();
      await page.waitForFunction(
        () => window.fileFixture.requests.at(-1)?.params?.tag === "important",
      );
      await extra
        .getByRole("button", { name: "Сбросить фильтры", exact: true })
        .tap();
      await extra
        .getByRole("button", { name: "Закрыть фильтр", exact: true })
        .tap();
      await projects.tap();
      await page.keyboard.press("Escape");
      await picker.waitFor({ state: "detached" });
      await projects.tap();
      await library.getByRole("searchbox").tap();
      await picker.waitFor({ state: "detached" });
      if (width >= 768) {
        await library
          .getByRole("button", { name: "Уменьшить окно файлов", exact: true })
          .tap();
        await projects.tap();
        box = await picker.boundingBox();
        const frame = await library.boundingBox();
        assert.ok(
          box.x >= frame.x + 8 &&
            box.x + box.width <= frame.x + frame.width - 8,
          "floating window also contains its filter",
        );
        await page.setViewportSize({ width: 390, height: 410 });
        await page.waitForFunction(() => {
          const popup = document.querySelector(".file-filter-popover");
          return popup && popup.getBoundingClientRect().right <= 390;
        });
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${engine} ${width}px ${theme}: compact icon row, safe areas, iPad header, chips, toggle, dismissal and floating bounds`,
      );
      await context.close();
    }
} finally {
  await browser?.close();
  await server.close();
}
