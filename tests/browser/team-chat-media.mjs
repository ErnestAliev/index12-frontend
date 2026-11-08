// Local synthetic files only; no production API or user data.
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-media-repair-vite",
  server: { host: "127.0.0.1", port: 5192, strictPort: true },
});
let browser;
const url = "http://127.0.0.1:5192/tests/browser/fixtures/team-chat-media.html";
try {
  await mkdir("output/playwright", { recursive: true });
  await server.listen();
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.fileGets === 1);
  await page.getByRole("button", { name: "Фото.png", exact: true }).click();
  await page.locator(".media-state").waitFor();
  const box = await page.locator(".media-preview-dialog").boundingBox();
  assert.ok(
    box.height > 400,
    "loading preview must have a real height, not a strip",
  );
  await page.evaluate(() => window.releaseMedia());
  await page.waitForFunction(
    () => document.querySelector(".zoom-image")?.naturalWidth === 1200,
  );
  async function geometry() {
    const geometry = await page.evaluate(() => {
      const rect = (s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom };
      };
      return {
        dialog: rect(".media-preview-dialog"),
        stage: rect(".zoom-image-stage"),
        image: rect(".zoom-image"),
        controls: rect(".image-zoom-controls"),
        viewport: visualViewport.height,
      };
    });
    assert.ok(
      geometry.stage.h > 120 &&
        geometry.image.w > 150 &&
        geometry.image.h > 100,
      JSON.stringify(geometry),
    );
    assert.ok(
      geometry.dialog.y >= 0 && geometry.controls.b <= geometry.viewport - 12,
      JSON.stringify(geometry),
    );
  }
  await geometry();
  await page.screenshot({ path: "output/playwright/media-repair-phone.png" });
  await page
    .getByRole("button", { name: "Закрыть фото.png", exact: true })
    .click();
  let gets = await page.evaluate(() => window.fileGets);
  await page.getByRole("button", { name: "Фото.png", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".zoom-image")?.naturalWidth === 1200,
  );
  assert.equal(
    await page.evaluate(() => window.fileGets),
    gets,
    "repeat open uses local cache",
  );
  await page
    .getByRole("button", { name: "Закрыть фото.png", exact: true })
    .click();
  // Disk cache survives a new page, even with server downloads failing.
  await page.reload();
  await page.waitForFunction(() => window.chatFixture);
  await page.evaluate(() => {
    window.failMedia = true;
    window.releaseMedia();
  });
  await page.getByRole("button", { name: "Фото.png", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".zoom-image")?.naturalWidth === 1200,
  );
  assert.equal(
    await page.evaluate(() => window.fileGets),
    0,
    "reloaded page opens stored file without another download",
  );
  await geometry();
  // Keyboard + nonzero safe area: dialog and controls stay on the visual viewport.
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-area-bottom", "34px");
    Object.defineProperty(window.visualViewport, "height", {
      configurable: true,
      get: () => 400,
    });
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(70);
  await geometry();
  await page
    .getByRole("button", { name: "Закрыть фото.png", exact: true })
    .click();
  await page.evaluate(() => {
    delete window.visualViewport.height;
    window.visualViewport.dispatchEvent(new Event("resize"));
    window.mediaMode.value = "new";
  });
  await page.getByRole("button", { name: "Себе", exact: true }).click();
  await page.getByRole("button", { name: "Без срока", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", {
      configurable: true,
      get: () => 400,
    });
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "Own.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.locator(".upload-state").waitFor();
  const uploadRect = await page.locator(".upload-state").boundingBox();
  assert.ok(
    uploadRect.y >= 0 && uploadRect.y + uploadRect.height < 400 - 12,
    "task upload status is visible",
  );
  await page.locator(".upload-state").waitFor({ state: "hidden" });
  gets = await page.evaluate(() => window.fileGets);
  await page.getByRole("button", { name: "Фото.png", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".zoom-image")?.naturalWidth > 0,
  );
  assert.equal(
    await page.evaluate(() => window.fileGets),
    gets,
    "uploaded file opens directly from local bytes",
  );
  await page
    .getByRole("button", { name: "Закрыть фото.png", exact: true })
    .click();
  await page.evaluate(() => (window.mediaMode.value = "chat"));
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "Own.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.locator(".team-upload-state").waitFor();
  const up = await page.locator(".team-upload-state").boundingBox(),
    composer = await page.locator(".codex-input-container").boundingBox();
  assert.ok(
    up.y + up.height <= composer.y + 1,
    "chat upload status sits above the composer",
  );
  assert.ok(up.y > 0 && up.y + up.height < 400 - 12);
  await page.locator(".team-upload-state").waitFor({ state: "hidden" });
  gets = await page.evaluate(() => window.fileGets);
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await page.waitForFunction(() => window.chatFixture.outbox.length === 0);
  await page.locator(".team-file").last().click();
  await page.waitForFunction(
    () => document.querySelector(".zoom-image")?.naturalWidth > 0,
  );
  assert.equal(
    await page.evaluate(() => window.fileGets),
    gets,
    "delivered own upload never downloads back from server",
  );
  await page
    .getByRole("button", { name: "Закрыть фото.png", exact: true })
    .click();
  // Same file ID under a different actor must not read the other identity's cached bytes.
  await page.evaluate(() => {
    window.chatFixture.me = {
      ...window.chatFixture.me,
      actorId: "different-actor",
    };
    window.failMedia = true;
  });
  await page
    .getByRole("button", { name: "Фото.png", exact: true })
    .first()
    .click();
  await page.getByText("Проверка ошибки загрузки", { exact: true }).waitFor();
  assert.ok((await page.evaluate(() => window.fileGets)) > gets);
  await page.evaluate(() => (window.failMedia = false));
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".zoom-image")?.naturalWidth === 1200,
  );
  await page
    .getByRole("button", { name: "Закрыть фото.png", exact: true })
    .click();
  assert.deepEqual(errors, []);
  await context.close();
  // Storage-denied browsers still download and display files.
  const denied = await browser.newContext({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
  });
  await denied.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw Error("Storage denied");
      },
    }),
  );
  const d = await denied.newPage();
  await d.goto(url);
  await d.evaluate(() => window.releaseMedia());
  await d.getByRole("button", { name: "Фото.png", exact: true }).click();
  await d.waitForFunction(
    () => document.querySelector(".zoom-image")?.naturalWidth === 1200,
  );
  await denied.close();
  console.log(
    "PASS: visible geometry, immediate loading, persisted cache without repeat downloads, upload seeding, identity isolation, error/retry, storage fallback and upload indicators above the composer/safe area",
  );
} finally {
  await browser?.close();
  await server.close();
}
