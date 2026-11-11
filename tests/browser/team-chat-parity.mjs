import { createServer } from "vite";
import { chromium } from "playwright-core";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const fixture = JSON.parse(
  await readFile(
    process.env.INDEX12_TASK_BROWSER_FIXTURE ||
      "/private/tmp/index12-parity-browser.json",
    "utf8",
  ),
);
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-parity-vite",
  define: {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(
      fixture.origin + "/api",
    ),
  },
  server: { host: "127.0.0.1", port: 5192, strictPort: true },
});
let browser, page;
const errors = [];
const output = "output/playwright";
try {
  await server.listen();
  await mkdir(output, { recursive: true });
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
  await context.addCookies([
    { name: "connect.sid", value: fixture.cookie, url: fixture.origin },
  ]);
  await context.addInitScript(() => {
    class Speech {
      start() {
        window.testDictation = this;
      }
      abort() {}
      stop() {
        this.onend?.();
      }
    }
    window.SpeechRecognition = Speech;
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5192/team/" + fixture.inviteToken);
  await page
    .getByRole("textbox", { name: "Сообщение сотрудникам", exact: true })
    .waitFor();
  if (await page.locator(".chat-setup-backdrop").count())
    await page.keyboard.press("Escape");
  const api = async (path, body, method = "POST") => {
    const res = await context.request.fetch(
      fixture.origin + "/api/team-chat" + path,
      { method, data: body },
    );
    assert.ok(res.ok(), await res.text());
    return res.json();
  };
  const id = randomUUID(),
    title = "Сверить документы и привезти договор " + Date.now();
  await api("/tasks", {
    id,
    description:
      title +
      "\n" +
      "Описание задачи для проверки мобильного экрана. ".repeat(25),
    assigneeIds: ["owner:" + fixture.scope.actorId],
    timing: "none",
  });
  const main = page
    .locator(".team-chat-conversation")
    .filter({ visible: true });
  const mainInput = page.getByRole("textbox", {
    name: "Сообщение сотрудникам",
    exact: true,
  });
  await mainInput.fill("Проверка ввода");
  const style = (field) => {
    const s = getComputedStyle(field);
    return {
      font: s.fontSize,
      border: s.borderRadius,
      padding: s.padding,
      minHeight: s.minHeight,
    };
  };
  const mainStyle = await mainInput.evaluate(style);
  await mainInput.fill("");
  await mainInput.blur();
  const cover = page.locator(".task-cover").filter({ hasText: title });
  await cover.waitFor();
  const geometry = await cover.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      f = el.querySelector(".cover-footer").getBoundingClientRect(),
      p = el.querySelector(".cover-person").getBoundingClientRect(),
      c = el.querySelector(".cover-check").getBoundingClientRect();
    return {
      height: r.height,
      footer: f.width,
      width: r.width,
      personRight: p.right,
      checkLeft: c.left,
      checkRight: c.right,
      right: r.right,
    };
  });
  assert.equal(geometry.height, 90);
  assert.ok(geometry.footer > geometry.width * 0.85);
  assert.ok(
    geometry.checkRight > geometry.right - 45,
    "completion is at the right edge",
  );
  await cover.locator(".cover-title").click();
  const panel = page.locator(".task-panel");
  await panel.locator(".task-discussion .codex-input").waitFor();
  assert.equal(
    await page.locator(".codex-window-header:visible").count(),
    0,
    "main header replaced",
  );
  assert.equal(await panel.locator(".task-header:visible").count(), 1);
  const input = panel.locator(".codex-input");
  await input.fill("Первое сообщение");
  assert.deepEqual(
    await input.evaluate(style),
    mainStyle,
    "both chats use exactly the same composer styles",
  );
  await panel.getByRole("button", { name: "Отправить", exact: true }).click();
  const bubble = panel
    .locator(".team-bubble")
    .filter({ hasText: "Первое сообщение" });
  await bubble.waitFor();
  await bubble.locator(".team-delivery").waitFor({ state: "hidden" });
  await bubble.dispatchEvent("pointerdown", {
    button: 0,
    pointerType: "touch",
    clientX: 140,
    clientY: 220,
    pointerId: 1,
  });
  await page.getByRole("dialog", { name: "Сообщение", exact: true }).waitFor();
  await page.getByRole("button", { name: "Реакция 👍", exact: true }).click();
  await panel
    .getByRole("button", { name: "Реакция 👍: 1", exact: true })
    .waitFor();
  await panel
    .getByRole("button", { name: "Реакция 👍: 1", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      ![
        ...document.querySelectorAll(".task-discussion .team-reactions button"),
      ].some((b) => b.textContent.includes("👍")),
  );
  await bubble.press("Shift+F10");
  await page.getByRole("button", { name: "Ответить", exact: true }).click();
  await input.fill("Ответ с цитатой");
  await panel.getByRole("button", { name: "Отправить", exact: true }).click();
  await panel
    .locator(".team-bubble")
    .filter({ hasText: "Ответ с цитатой" })
    .locator(".team-delivery")
    .waitFor({ state: "hidden" });
  const replyData = await api("/messages?taskId=" + id, undefined, "GET");
  assert.ok(
    replyData.messages.find((m) => m.text === "Ответ с цитатой").replyTo
      ?.messageId,
    "shared reply is persisted in the same task",
  );
  await input.fill("@Emp");
  await panel.getByRole("option").filter({ hasText: "Employee" }).click();
  await input.fill("");
  await panel.locator(".team-compose-area input[type=file]").setInputFiles({
    name: "Снимок.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await panel
    .locator(".team-staged")
    .filter({ hasText: "Снимок.png" })
    .waitFor();
  await input.fill("Изображение");
  await panel.getByRole("button", { name: "Отправить", exact: true }).click();
  await panel
    .locator(".team-feed .team-file")
    .filter({ hasText: "Снимок.png" })
    .click();
  await page.getByRole("dialog", { name: "Снимок.png", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Закрыть снимок.png", exact: true })
    .click();
  // Opening the original dictation control changes the same shared input.
  await panel
    .getByRole("button", { name: "Голосовой ввод", exact: true })
    .click();
  await page.evaluate(() =>
    window.testDictation.onresult({
      results: [[{ transcript: "Проверка диктовки" }]],
    }),
  );
  await page.waitForFunction(
    () =>
      document.querySelector(".task-discussion .codex-input").value ===
      "Проверка диктовки",
  );
  await panel
    .getByRole("button", { name: "Голосовой ввод", exact: true })
    .click();
  await input.fill("Я вижу переписку");
  await input.focus();
  assert.equal(
    await panel.locator(".task-overview").isVisible(),
    false,
    "task details collapse as soon as input is focused",
  );
  for (const bottom of [0, 20, 34]) {
    await page.evaluate((bottom) => {
      document.documentElement.style.setProperty(
        "--safe-area-bottom",
        bottom + "px",
      );
      Object.defineProperty(window.visualViewport, "height", {
        configurable: true,
        get: () => 400,
      });
      window.visualViewport.dispatchEvent(new Event("resize"));
    }, bottom);
    await page.waitForFunction(() =>
      document.querySelector(".codex-chat-window.keyboard-open"),
    );
    const boxes = await panel.evaluate((el) => ({
      feed: el.querySelector(".team-feed").getBoundingClientRect().toJSON(),
      composer: el
        .querySelector(".codex-input-container")
        .getBoundingClientRect()
        .toJSON(),
      header: el.querySelector(".task-header").getBoundingClientRect().toJSON(),
      send: el
        .querySelector(".codex-send-btn")
        .getBoundingClientRect()
        .toJSON(),
    }));
    assert.ok(boxes.feed.height >= 200, JSON.stringify(boxes));
    assert.ok(boxes.send.bottom <= 390, JSON.stringify(boxes));
    assert.ok(boxes.header.height <= 48);
  }
  await page.screenshot({ path: output + "/task-single-header-keyboard.png" });
  await page.evaluate(() => {
    delete window.visualViewport.height;
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await input.blur();
  if (!(await panel.locator(".task-overview").isVisible()))
    await panel
      .getByRole("button", { name: "Параметры задачи", exact: true })
      .click();
  await panel.locator(".task-overview").waitFor({ state: "visible" });
  await panel.getByRole("button", { name: "Назад", exact: true }).click();
  await panel.waitFor({ state: "hidden" });
  assert.equal(await page.locator(".codex-window-header:visible").count(), 1);
  // Holding or moving a task leaves the gesture available for dragging.
  await cover.dispatchEvent("pointerdown", {
    button: 0,
    pointerType: "touch",
    clientX: 100,
    clientY: 100,
  });
  await cover.dispatchEvent("pointermove", { clientX: 100, clientY: 135 });
  await page.waitForTimeout(500);
  assert.equal(
    await page.getByRole("dialog", { name: "Задача", exact: true }).count(),
    0,
  );
  await cover.dispatchEvent("pointerdown", {
    button: 0,
    pointerType: "touch",
    clientX: 100,
    clientY: 100,
  });
  await page.waitForTimeout(650);
  assert.equal(await page.getByRole("dialog", { name: "Задача", exact: true }).count(), 0);
  await cover.locator(".cover-title").press("Shift+F10");
  await page.getByRole("dialog", { name: "Задача", exact: true }).waitFor();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Удалить задачу?", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await cover.waitFor({ state: "hidden" });
  const second = randomUUID(),
    secondTitle = "Удаление внутри задачи " + Date.now();
  await api("/tasks", {
    id: second,
    description: secondTitle,
    assigneeIds: ["owner:" + fixture.scope.actorId],
    timing: "none",
  });
  await page
    .locator(".task-cover")
    .filter({ hasText: secondTitle })
    .locator(".cover-title")
    .click();
  await panel
    .getByRole("button", { name: "Удалить задачу", exact: true })
    .click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await panel.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Меню чата", exact: true }).click();
  const navigation = page.getByRole("dialog", {
    name: "Меню чата",
    exact: true,
  });
  assert.equal(await navigation.locator("button").count(), 4);
  if (
    await navigation
      .getByRole("button", { name: "Светлая тема", exact: true })
      .count()
  )
    await navigation
      .getByRole("button", { name: "Светлая тема", exact: true })
      .click();
  else await page.keyboard.press("Escape");
  const previewId = randomUUID(),
    previewTitle = "Сверка документов " + Date.now();
  await api("/tasks", {
    id: previewId,
    description: previewTitle,
    assigneeIds: ["owner:" + fixture.scope.actorId],
    timing: "none",
  });
  await api("/messages", {
    id: randomUUID(),
    taskId: previewId,
    text: "Документы подготовлены.",
  });
  await api("/messages", {
    id: randomUUID(),
    taskId: previewId,
    text: "Привезу договор к 15:00.",
  });
  await page
    .locator(".task-cover")
    .filter({ hasText: previewTitle })
    .locator(".cover-title")
    .click();
  const finalInput = panel.locator(".codex-input");
  await finalInput.fill("Хорошо, буду ждать");
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-area-top", "20px");
    document.documentElement.style.setProperty("--safe-area-left", "20px");
    document.documentElement.style.setProperty("--safe-area-right", "20px");
    Object.defineProperty(window.visualViewport, "height", {
      configurable: true,
      get: () => 400,
    });
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() =>
    document.querySelector(".codex-chat-window.keyboard-open"),
  );
  const finalBoxes = await panel.evaluate((el) => ({
    feed: el.querySelector(".team-feed").getBoundingClientRect().toJSON(),
    header: el.querySelector(".task-header").getBoundingClientRect().toJSON(),
    send: el.querySelector(".codex-send-btn").getBoundingClientRect().toJSON(),
  }));
  assert.ok(finalBoxes.feed.height >= 180, JSON.stringify(finalBoxes));
  assert.ok(finalBoxes.header.height <= 66);
  assert.ok(finalBoxes.send.right <= 370);
  await page
    .locator(".codex-chat-window")
    .screenshot({ path: output + "/task-single-header-keyboard-light.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: shared composer/styles, replies/menu/reactions, uploads/preview/dictation, one header, keyboard space, hold cancellation and task deletion",
  );
} catch (e) {
  if (page)
    await page.screenshot({ path: output + "/task-parity-failure.png" });
  throw e;
} finally {
  await browser?.close();
  await server.close();
}
