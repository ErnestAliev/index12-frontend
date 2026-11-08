import { createServer } from "vite";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-search-vite",
  server: { host: "127.0.0.1", port: 5197, strictPort: true },
});
let browser;
try {
  await server.listen();
  await mkdir("output/playwright", { recursive: true });
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE ERROR", e.message);
  });
  await page.goto(
    "http://127.0.0.1:5197/tests/browser/fixtures/team-chat-search.html",
  );
  const header = page.locator(".codex-window-header");
  const height = (await header.boundingBox()).height;
  await page.getByRole("button", { name: "Меню чата", exact: true }).tap();
  await page.getByRole("button", { name: "Поиск", exact: true }).tap();
  const field = page.getByRole("searchbox", {
    name: "Поиск в чатах",
    exact: true,
  });
  assert.ok(
    await field.evaluate((el) => document.activeElement === el),
    "first tap focuses search",
  );
  assert.equal((await header.boundingBox()).height, height);
  await field.fill("Договор");
  await page.waitForFunction(
    () => window.chatSearch.total === 3 && !window.chatSearch.busy,
  );
  assert.equal(await page.locator(".codex-window-header").count(), 1);
  assert.equal(await page.locator(".task-header:visible").count(), 0);
  assert.ok((await page.locator(".search-current mark:visible").count()) > 0);
  assert.equal(await page.locator(".team-compose-area:visible").count(), 0);
  assert.equal(await page.locator(".team-search-count").innerText(), "3/3");
  await page
    .getByRole("button", { name: "Предыдущее совпадение", exact: true })
    .tap();
  await page.waitForFunction(
    () => window.chatSearch.index === 1 && !window.chatSearch.busy,
  );
  await page
    .getByRole("button", { name: "Предыдущее совпадение", exact: true })
    .tap();
  await page.waitForFunction(
    () => window.chatSearch.index === 0 && !window.chatSearch.busy,
  );
  assert.ok(
    await page
      .locator(
        '[data-message-id="00000000-0000-4000-8000-000000000002"]:visible',
      )
      .count(),
    "older history result is loaded in context",
  );
  await page.screenshot({ path: "output/playwright/chat-search-phone.png" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.screenshot({path:`output/playwright/chat-search-${theme}.png`});
  }
  assert.equal(await field.evaluate(el => document.activeElement === el), true, "navigation preserves the search keyboard");

  await field.fill("Дог");
  await page.waitForTimeout(300);
  await field.fill("ничего-не-найдено");
  await page.getByText("Ничего не найдено", { exact: true }).waitFor();
  await page.waitForTimeout(700);
  assert.equal(
    await page.locator(".team-search-count").innerText(),
    "0",
    "late response must not replace a newer query",
  );
  await page.getByRole("button", { name: "Закрыть поиск", exact: true }).tap();
  await page.getByRole("button", { name: "Меню чата", exact: true }).waitFor();
  assert.equal(await page.locator(".team-compose-area:visible").count(), 1);
  // Slow deletion: close menu and hide immediately; even stale snapshots cannot revive it.
  const message = page.locator(".team-message:visible").last(),
    id = await message.getAttribute("data-message-id");
  const bubble = message.locator(".team-bubble");
  await bubble.click({ button: "right" });
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page
    .getByRole("button", { name: "Удалить для всех", exact: true })
    .click();
  await page.waitForFunction(
    (id) => window.searchChat.messageDeletions[id]?.status === "pending",
    id,
  );
  assert.equal(
    await page.locator(`[data-message-id="${id}"]:visible`).count(),
    0,
  );
  await page.evaluate(() => window.staleSnapshot());
  assert.equal(
    await page.locator(`[data-message-id="${id}"]:visible`).count(),
    0,
  );
  await page.evaluate(() => window.rejectDelete());
  await page
    .getByText("Не удалось удалить сообщение", { exact: true })
    .waitFor();
  assert.equal(
    await page.locator(`[data-message-id="${id}"]:visible`).count(),
    0,
  );
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await page.evaluate(() => window.releaseDelete());
  await page.waitForFunction(
    (id) => window.searchChat.messageDeletions[id]?.status === "done",
    id,
  );
  await page.evaluate(() => window.staleSnapshot());
  assert.equal(
    await page.locator(`[data-message-id="${id}"]:visible`).count(),
    0,
  );
  const stamp = page.locator(".team-message:visible").last();
  assert.equal(await stamp.locator("header time").count(), 0);
  assert.equal(await stamp.locator("footer time").count(), 1);
  assert.equal(await stamp.locator("footer .team-read-receipt").count(), 1);
  for (const width of [320, 736, 1280]) {
    await page.setViewportSize({ width, height: width === 736 ? 390 : 844 });
    await page.getByRole("button", { name: "Меню чата", exact: true }).click();
    await page.getByRole("button", { name: "Поиск", exact: true }).click();
    const bar = await page.locator(".team-search-bar").boundingBox(),
      fieldBox = await field.boundingBox();
    assert.ok(fieldBox.width > 60);
    assert.ok(bar.x >= 0 && bar.x + bar.width <= width);
    await page
      .getByRole("button", { name: "Закрыть поиск", exact: true })
      .click();
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{for (const edge of ['left','right'])document.documentElement.style.setProperty(`--safe-area-${edge}`,'20px');document.documentElement.style.setProperty('--safe-area-top','20px');document.documentElement.style.setProperty('--safe-area-bottom','34px');Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>400});window.visualViewport.dispatchEvent(new Event('resize'));});
  await page.getByRole('button',{name:'Меню чата',exact:true}).tap();
  await page.getByRole('button',{name:'Поиск',exact:true}).tap();
  const keyboardField=await field.boundingBox();assert.ok(keyboardField.y>=20&&keyboardField.y+keyboardField.height<400-12);
  await page.getByRole('button',{name:'Закрыть поиск',exact:true}).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: dropdown search, autofocus, one header, counts, navigation/old history, highlighted context, stale query cancellation, immediate deletion with retry and no resurrection, footer timestamps/receipts, 320/390/736/1280 layouts",
  );
} finally {
  await browser?.close();
  await server.close();
}
