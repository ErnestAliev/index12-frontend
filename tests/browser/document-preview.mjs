// Native workers, actual Office bytes and DOM checks; no real user files or screenshots.
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
import { readFileSync, readdirSync } from "node:fs";
import { documentSamples } from "../fixtures/documentSamples.mjs";
const useBuilt = process.argv.includes("--built-worker");
const builtWorker = useBuilt
  ? readFileSync(
      "dist/assets/" +
        readdirSync("dist/assets").find((name) =>
          /^documentPreview\.worker-.*\.js$/.test(name),
        ),
    )
  : null;
const files = documentSamples(),
  engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  server: { host: "127.0.0.1", port: 5216, strictPort: true },
  plugins: [
    {
      name: "office-fixtures",
      configureServer(server) {
        if (builtWorker)
          server.middlewares.use("/__built-document-worker.js", (_req, res) => {
            res.setHeader("Content-Type", "text/javascript");
            res.end(builtWorker);
          });
        server.middlewares.use("/__document-file", (req, res) => {
          const name = new URL(
              req.url,
              "http://fixture.invalid",
            ).searchParams.get("name"),
            bytes = files.get(name);
          res.setHeader("Content-Type", "application/octet-stream");
          if (!bytes) {
            res.statusCode = 404;
            res.end();
          } else res.end(Buffer.from(bytes));
        });
      },
    },
  ],
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
      context.setDefaultTimeout(15000);
      const page = await context.newPage(),
        errors = [],
        external = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => {
        const url = route.request().url();
        if (
          url.startsWith("blob:http://127.0.0.1:5216/") ||
          new URL(url).hostname === "127.0.0.1"
        )
          return route.continue();
        external.push(url);
        return route.abort();
      });
      await page.addInitScript((built) => {
        const Native = window.Worker;
        window.readers = 0;
        window.Worker = class extends Native {
          constructor(...args) {
            if (built && String(args[0]).includes("documentPreview.worker"))
              args[0] = "/__built-document-worker.js";
            super(...args);
            window.readers++;
            this.closed = false;
          }
          terminate() {
            if (!this.closed) {
              this.closed = true;
              window.readers--;
            }
            return super.terminate();
          }
        };
      }, useBuilt);
      await page.goto(
        "http://127.0.0.1:5216/tests/browser/fixtures/document-preview.html",
      );
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      const reader = page.getByRole("region", { name: "Просмотр документа" }),
        activate = (locator) => (mobile ? locator.tap() : locator.click());
      async function choose(name) {
        await page.evaluate(
          (name) => window.documentFixture.select(name),
          name,
        );
        await page
          .locator(".file-inspector header strong")
          .filter({ hasText: name })
          .waitFor();
        await page.waitForFunction(
          () =>
            document
              .querySelector(".document-preview")
              ?.getAttribute("aria-busy") === "false",
        );
      }
      await reader.getByRole("tab", { name: "Данные", exact: true }).waitFor();
      await reader.getByRole("cell", { name: "Платёж", exact: true }).waitFor();
      assert.equal(
        await reader
          .getByRole("cell", { name: "Отчёт", exact: true })
          .getAttribute("colspan"),
        "3",
      );
      assert.match(
        await reader.locator(".spreadsheet-table").innerText(),
        /1,234\.50/,
      );
      assert.ok(
        (await reader.locator(".spreadsheet-table").innerText()).includes(
          "00123",
        ),
      );
      await activate(
        reader.getByRole("button", { name: "Следующие строки", exact: true }),
      );
      await reader
        .getByRole("cell", { name: "Строка 100", exact: true })
        .waitFor();
      await activate(reader.getByRole("tab", { name: "Итоги", exact: true }));
      await reader.getByRole("cell", { name: "42", exact: true }).waitFor();
      assert.match(
        await reader.locator(".spreadsheet-table").innerText(),
        /10\.11\.2026/,
      );
      const before = await reader
        .locator("td")
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize);
      await activate(
        reader.getByRole("button", {
          name: "Увеличить текст документа",
          exact: true,
        }),
      );
      assert.ok(
        parseFloat(
          await reader
            .locator("td")
            .first()
            .evaluate((el) => getComputedStyle(el).fontSize),
        ) > parseFloat(before),
      );
      await activate(
        page.getByRole("button", { name: "Открыть", exact: true }),
      );
      const dialog = page.getByRole("dialog", {
        name: "Таблица.xlsx",
        exact: true,
      });
      await dialog.getByRole("tab", { name: "Данные", exact: true }).waitFor();
      assert.ok((await dialog.boundingBox()).width > (mobile ? 300 : 900));
      await activate(
        dialog.getByRole("button", {
          name: "Закрыть таблица.xlsx",
          exact: true,
        }),
      );
      if (!mobile && theme === "dark")
        for (const extension of ["xls", "xlsb", "ods", "fods", "csv", "tsv"]) {
          await choose("Таблица." + extension);
          await reader.locator("table").waitFor();
          assert.ok(
            (await reader.locator("table").innerText()).includes(
              extension === "tsv" ? "00123" : "Платёж",
            ),
            extension,
          );
        }
      await choose("Документ.docx");
      await reader
        .getByRole("heading", { name: "Тестовый документ DOCX", exact: true })
        .waitFor();
      assert.match(
        await reader.locator(".reading-document").innerText(),
        /Привет & мир/,
      );
      assert.ok(!(await reader.innerText()).includes("Удалённый текст"));
      assert.ok(!(await reader.innerText()).includes("INCLUDETEXT"));
      await reader
        .getByRole("cell", { name: "1234,50", exact: true })
        .waitFor();
      await choose("Документ.doc");
      await reader.locator("pre").waitFor();
      assert.match(await reader.locator("pre").innerText(), /Сотрудник: Тест/);
      if (!mobile && theme === "dark") {
        for (const [name, content] of [
          ["Документ.odt", "Ячейка ODT"],
          ["Документ.rtf", "Документ"],
          ["Выгрузка.doc", "Выгрузка 1С"],
          ["Презентация.pptx", "Первый слайд"],
          ["Данные.json", "значение"],
          ["Markdown.md", "Текст Markdown"],
        ]) {
          await choose(name);
          assert.ok((await reader.innerText()).includes(content), name);
        }
        await choose("Ссылка.gsheet");
        await reader
          .getByRole("alert")
          .filter({ hasText: "ссылка Google Sheets" })
          .waitFor();
        await choose("Повреждённый.docx");
        await reader.getByRole("alert").filter({ hasText: "XML" }).waitFor();
      }
      await page.evaluate(() => {
        window.documentFixture.select("Таблица.xlsx");
        window.documentFixture.select("Заметки.txt");
      });
      await reader.locator("pre").waitFor();
      assert.match(await reader.locator("pre").innerText(), /Вторая строка/);
      assert.equal(await reader.locator("script,img,iframe,object").count(), 0);
      assert.equal(await page.evaluate(() => window.pwned), undefined);
      assert.ok(!external.some((url) => url.includes("untrusted.invalid")));
      await page.evaluate(() => (window.documentFixture.show.value = false));
      await page.waitForFunction(() => window.readers === 0);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${engine} ${mobile ? "touch" : "mouse"} ${theme}: spreadsheet sheets/pages/formats, readable Word/text, expanded viewer, unsafe content and worker cleanup`,
      );
      await context.close();
    }
} finally {
  await browser?.close();
  await server.close();
}
