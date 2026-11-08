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
      geometry.dialog.y >= 0 && geometry.stage.b <= geometry.viewport - 12,
      JSON.stringify(geometry),
    );
  }
  await geometry();
  assert.equal(
    await page.locator(".image-zoom-controls").isVisible(),
    false,
    "touch uses gestures without a toolbar",
  );
  const closeButton = page.getByRole("button", {
    name: "Закрыть фото.png",
    exact: true,
  });
  const closeBox = await closeButton.boundingBox();
  assert.ok(closeBox.width >= 44 && closeBox.height >= 44);
  async function noPointerFrame() {
    for (const selector of [
      ".media-preview-dialog header button",
      ".zoom-image-stage",
    ]) {
      const visual = await page.locator(selector).evaluate((el) => {
        const s = getComputedStyle(el);
        return { outline: s.outlineStyle, shadow: s.boxShadow };
      });
      assert.equal(visual.outline, "none");
      assert.equal(visual.shadow, "none");
    }
  }
  await noPointerFrame();
  const stage = page.locator(".zoom-image-stage"),
    image = page.locator(".zoom-image");
  const r = await stage.boundingBox(),
    x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const scale = () =>
    image.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  await touch("touchStart", [
    { x: x - 30, y, id: 1 },
    { x: x + 30, y, id: 2 },
  ]);
  await touch("touchMove", [
    { x: x - 75, y, id: 1 },
    { x: x + 75, y, id: 2 },
  ]);
  await touch("touchEnd", []);
  assert.ok((await scale()) > 2, "pinch zoom remains available");
  await touch("touchStart", [{ x, y, id: 3 }]);
  await touch("touchMove", [{ x: x + 45, y: y + 20, id: 3 }]);
  await touch("touchEnd", []);
  assert.ok(
    (await image.evaluate(
      (el) => new DOMMatrix(getComputedStyle(el).transform).e,
    )) > 0,
    "touch pans an enlarged photo",
  );
  for (let i = 0; i < 2; i++) {
    await touch("touchStart", [{ x, y, id: 4 }]);
    await touch("touchEnd", []);
    if (!i) await page.waitForTimeout(80);
  }
  assert.equal(await scale(), 1, "double tap resets zoom");
  await noPointerFrame();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await page.screenshot({
      path: `output/playwright/media-touch-${theme}.png`,
    });
  }
  await page.setViewportSize({ width: 736, height: 390 });
  await page.evaluate(() => {
    for (const edge of ["left", "right"])
      document.documentElement.style.setProperty(`--safe-area-${edge}`, "20px");
    document.documentElement.style.setProperty("--safe-area-bottom", "34px");
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(70);
  await geometry();
  await noPointerFrame();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    for (const edge of ["left", "right", "bottom"])
      document.documentElement.style.setProperty(`--safe-area-${edge}`, "0px");
    window.dispatchEvent(new Event("resize"));
  });
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
  await page.locator("input[type=file]").setInputFiles({
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
  await page.locator("input[type=file]").setInputFiles({
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
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const mouse = await desktop.newPage();
  await mouse.goto(url);
  await mouse.evaluate(() => window.releaseMedia());
  await mouse.getByRole("button", { name: "Фото.png", exact: true }).click();
  await mouse.waitForFunction(
    () => document.querySelector(".zoom-image")?.naturalWidth === 1200,
  );
  assert.equal(await mouse.locator(".image-zoom-controls").isVisible(), true);
  await mouse.getByRole("button", { name: "Увеличить", exact: true }).click();
  assert.ok(
    (await mouse
      .locator(".zoom-image")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)) > 1,
  );
  await mouse
    .getByRole("button", { name: "Закрыть фото.png", exact: true })
    .focus();
  await mouse.keyboard.press("Tab");
  assert.equal(
    await mouse
      .locator(".zoom-image-stage")
      .evaluate((el) => document.activeElement === el),
    true,
  );
  assert.notEqual(
    await mouse
      .locator(".zoom-image-stage")
      .evaluate((el) => getComputedStyle(el).boxShadow),
    "none",
    "keyboard focus remains visible",
  );
  await mouse.keyboard.press("+");
  await mouse.keyboard.press("0");
  await mouse.keyboard.press("Shift+Tab");
  assert.equal(
    await mouse
      .locator(".media-preview-dialog header button")
      .evaluate((el) => getComputedStyle(el).outlineStyle),
    "solid",
  );
  await mouse.screenshot({
    path: "output/playwright/media-keyboard-desktop.png",
  });
  await desktop.close();
  console.log(
    "PASS: visible geometry, immediate loading, persisted cache without repeat downloads, upload seeding, identity isolation, error/retry, storage fallback and upload indicators above the composer/safe area",
  );
} finally {
  await browser?.close();
  await server.close();
}
