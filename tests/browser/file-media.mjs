// Synthetic in-browser media and DOM geometry only; no screenshots or device downloads.
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium",
  server = await createServer({
    root: process.cwd(),
    envDir: "/private/tmp",
    server: { host: "127.0.0.1", port: 5214, strictPort: true },
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
  for (const width of [320, 390, 844])
    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 844 ? 390 : 844 },
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      await page.route("**/*", (r) =>
        r.request().url().startsWith("blob:http://127.0.0.1:5214/") ||
        new URL(r.request().url()).hostname === "127.0.0.1"
          ? r.continue()
          : r.abort(),
      );
      await page.goto(
        "http://127.0.0.1:5214/tests/browser/fixtures/file-media.html?nav=1",
      );
      await page.evaluate(
        ({ theme, width }) => {
          document.documentElement.dataset.theme = theme;
          for (const [side, n] of Object.entries({
            left: width === 844 ? 44 : 16,
            right: width === 844 ? 44 : 16,
            bottom: 34,
          }))
            document.documentElement.style.setProperty(
              "--safe-area-" + side,
              n + "px",
            );
        },
        { theme, width },
      );
      const buttons = page.locator(".chart-controls-row>button");
      assert.equal(await buttons.count(), 7);
      const rectangles = await buttons.evaluateAll((items) =>
        items.map((item) => {
          const r = item.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            right: r.right,
            bottom: r.bottom,
            height: r.height,
            width: r.width,
          };
        }),
      );
      assert.equal(
        new Set(rectangles.map((r) => r.y)).size,
        1,
        "all seven icons stay on one row",
      );
      assert.ok(rectangles[0].x >= 16 && rectangles.at(-1).right <= width - 16);
      assert.ok(rectangles.every((r) => r.height === 44 && r.width >= 36));
      for (let i = 1; i < rectangles.length; i++)
        assert.ok(
          rectangles[i].x >= rectangles[i - 1].right,
          "no overlapping touch targets",
        );
      await page
        .getByRole("button", { name: "Открыть чат Codex", exact: true })
        .tap();
      await page
        .getByRole("button", { name: "Открыть чат сотрудников", exact: true })
        .tap();
      await page
        .getByRole("button", { name: "Открыть меню", exact: true })
        .tap();
      assert.deepEqual(await page.evaluate(() => window.fileMedia.events), [
        "codex",
        "chat",
        "menu",
      ]);
      await page
        .getByRole("button", { name: "Открыть файлы", exact: true })
        .tap();
      assert.equal(
        await page.evaluate(() => window.fileMedia.chat.fileLibraryOpen),
        true,
      );
      await page
        .getByRole("button", { name: "Выбор месяца", exact: true })
        .tap();
      await page
        .getByRole("dialog", { name: "Переключение месяцев" })
        .waitFor();
      assert.equal(await buttons.count(), 7);
      await context.close();
    }
  const context = await browser.newContext({
      viewport: { width: 1000, height: 700 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (r) =>
    r.request().url().startsWith("blob:http://127.0.0.1:5214/") ||
    new URL(r.request().url()).hostname === "127.0.0.1"
      ? r.continue()
      : r.abort(),
  );
  await page.addInitScript(() => {
    const make = URL.createObjectURL.bind(URL),
      free = URL.revokeObjectURL.bind(URL);
    window.thumbUrls = new Set();
    URL.createObjectURL = (blob) => {
      const url = make(blob);
      window.thumbUrls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.thumbUrls.delete(url);
      free(url);
    };
  });
  await page.goto(
    "http://127.0.0.1:5214/tests/browser/fixtures/file-media.html",
  );
  try {
    await page.waitForFunction(
      () =>
        ["photo", "video"].every(
          (id) =>
            document.querySelector('[data-thumb="' + id + '"] img')
              ?.naturalWidth > 0,
        ),
      null,
      { timeout: 20000 },
    );
  } catch (error) {
    console.log(
      await page.evaluate(() => ({
        gets: window.fileMedia?.gets,
        states: [...document.querySelectorAll("[data-thumb]")].map((el) => ({
          id: el.dataset.thumb,
          img: el.querySelector("img")?.naturalWidth,
          title: el.querySelector(".file-thumbnail")?.title,
        })),
      })),
    );
    console.log(errors);
    throw error;
  }
  assert.equal(
    await page
      .locator('[data-thumb="photo"] img')
      .evaluate((img) => img.naturalWidth),
    640,
  );
  assert.equal(
    await page
      .locator('[data-thumb="video"] img')
      .evaluate((img) => img.naturalWidth),
    640,
  );
  assert.equal(
    await page.locator('[data-thumb="video"] .file-video-badge').count(),
    1,
  );
  await page.waitForFunction(() =>
    document
      .querySelector('[data-thumb="broken"] .file-thumbnail')
      ?.title.includes("недоступен"),
  );
  assert.equal(await page.locator('[data-thumb="broken"] img').count(), 0);
  assert.equal(
    await page.evaluate(() => window.fileMedia.writes.length),
    0,
    "thumbnails never acknowledge a view",
  );
  const before = await page.evaluate(() => window.fileMedia.gets.length);
  await page.evaluate(() => (window.fileMedia.show.value = false));
  await page.waitForFunction(() => window.thumbUrls.size === 0);
  await page.evaluate(() => (window.fileMedia.show.value = true));
  await page.waitForFunction(
    () => document.querySelector('[data-thumb="video"] img')?.naturalWidth > 0,
  );
  assert.equal(
    await page.evaluate(() => window.fileMedia.gets.length),
    before,
    "original bytes and generated frames are cached",
  );
  await page.evaluate(() => (window.fileMedia.show.value = false));
  await page.waitForFunction(() => window.thumbUrls.size === 0);
  await page.evaluate(() => {
    window.fileMedia.chat.me = {
      ...window.fileMedia.chat.me,
      actorId: "another-actor",
    };
    window.fileMedia.show.value = true;
  });
  await page.waitForFunction(
    () => document.querySelector('[data-thumb="video"] img')?.naturalWidth > 0,
  );
  assert.ok(
    (await page.evaluate(() => window.fileMedia.gets.length)) > before,
    "cache stays scoped to the actor",
  );
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    `PASS ${engine}: seven navigation icons in one row, image/video thumbnails, native decode, corrupt fallback, scoped cache and URL cleanup; no screenshots`,
  );
} finally {
  await browser?.close();
  await server.close();
}
