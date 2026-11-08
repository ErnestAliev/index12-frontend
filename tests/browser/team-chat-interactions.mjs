import process from "node:process";
import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
import assert from "node:assert/strict";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-interactions-vite",
  server: { host: "127.0.0.1", port: 5198, strictPort: true },
});
let browser;
const url =
  "http://127.0.0.1:5198/tests/browser/fixtures/team-chat-search.html";
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
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  context.setDefaultTimeout(10000);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.locator(".team-bubble").last().waitFor();
  await page.waitForTimeout(250); // Let the initial history scroll finish before starting a gesture.
  const bubble = page.locator(".team-bubble").last(),
    r = await bubble.boundingBox(),
    x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  let cdp;
  if (engine === "chromium") {
    cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
  } else
    await bubble.dispatchEvent("pointerdown", {
      pointerType: "touch",
      pointerId: 1,
      button: 0,
      clientX: x,
      clientY: y,
    });
  const menu = page.getByRole("dialog", { name: "Сообщение", exact: true });
  await menu.waitFor();
  const laugh = page.getByRole("button", { name: "Реакция 😂", exact: true });
  const target = await laugh.boundingBox();
  if (cdp) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: target.x + target.width / 2,
          y: target.y + target.height / 2,
          id: 1,
        },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } else
    await laugh.dispatchEvent("pointerup", {
      pointerType: "touch",
      pointerId: 1,
      button: 0,
    });
  // Also exercise the late compatibility click even if the engine cancelled it itself.
  await laugh.dispatchEvent("click", { detail: 1 });
  assert.equal(
    await page.evaluate(() => window.reactionRequests.length),
    0,
    "opening release cannot choose an emoji",
  );
  assert.equal(await menu.isVisible(), true);
  await laugh.tap();
  await menu.waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() => window.reactionRequests.length),
    1,
    "one new deliberate tap sends exactly one reaction",
  );
  // A second device remains unread while its chat is closed, backgrounded, hidden or covered.
  const recipient = await context.newPage();
  recipient.on("pageerror", (e) => errors.push(e.message));
  await recipient.goto(url);
  await recipient.waitForFunction(() => window.fixtureOpen);
  await recipient.evaluate(() => (window.fixtureOpen.value = false));
  await recipient.locator(".codex-chat-window").waitFor({ state: "hidden" });
  await page.bringToFront();
  const id = "77777777-7777-4777-8777-777777777777";
  await recipient.evaluate((id) => {
    window.searchChat.state.messages = [
      {
        _id: id,
        authorId: "other",
        authorName: "Валентина",
        text: "Новое сообщение",
        attachments: [],
        createdAt: new Date().toISOString(),
      },
    ];
  }, id);
  await recipient.waitForTimeout(300);
  assert.equal(await recipient.evaluate(() => window.readRequests.length), 0);
  // Headless engines do not consistently background OS windows. Exercise the
  // Page Visibility lifecycle explicitly while keeping the real UI mounted.
  await recipient.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await recipient.evaluate(() => (window.fixtureOpen.value = true));
  await recipient.locator(".codex-chat-window").waitFor();
  await recipient.waitForTimeout(350);
  assert.equal(
    await recipient.evaluate(() => window.readRequests.length),
    0,
    "a background open chat is not a read",
  );
  await recipient.evaluate(() => {
    const el = document.createElement("div");
    el.id = "read-cover";
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      background: "white",
      zIndex: "999999",
    });
    document.body.append(el);
  });
  await recipient.bringToFront();
  await recipient.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await recipient.waitForTimeout(350);
  assert.equal(
    await recipient.evaluate(() => window.readRequests.length),
    0,
    "covered messages are unread",
  );
  await recipient.evaluate(() => {
    document.getElementById("read-cover").remove();
    window.dispatchEvent(new Event("focus"));
  });
  await recipient.waitForFunction(() => window.readRequests.length === 1);
  const reads = await recipient.evaluate(() => window.readRequests);
  assert.equal(reads[0].visibilityConfirmed, true);
  assert.deepEqual(reads[0].ids, [id]);
  assert.deepEqual(errors, []);
  console.log(
    `PASS (${engine}): release/ghost click does not activate menus; deliberate tap works; closed/background/covered chat stays unread; foreground visible message acknowledges once`,
  );
} finally {
  await browser?.close();
  await server.close();
}
