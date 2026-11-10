// Exercise the shipped app tree and styles. Every API response is local synthetic data.
import assert from "node:assert/strict";
export async function verifyAppComposers(browser, origin, engine) {
  for (const [width, height, touch] of [
    [320, 720, true],
    [390, 844, true],
    [844, 390, true],
    [768, 1024, true],
    [1024, 768, true],
    [1440, 900, false],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
    });
    context.setDefaultTimeout(12000);
    await context.addInitScript(() => {
      localStorage.setItem("app_data_version", "1");
      localStorage.setItem("theme", "dark");
    });
    const page = await context.newPage(),
      sent = [],
      uploads = [],
      uploadedFiles = new Map();
    let slowJob = false, slowPolls = 0;
    await page.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname;
      if (path.startsWith("/api/")) {
        let data = [];
        if (path.endsWith("/auth/me"))
          data = {
            _id: "actor",
            currentWorkspaceId: "workspace",
            role: "admin",
            workspaceRole: "admin",
          };
        if (path.endsWith("/snapshot"))
          data = {
            timestamp: new Date().toISOString(),
            accountBalances: {},
            companyBalances: {},
            individualBalances: {},
            contractorBalances: {},
          };
        if (path.endsWith("/team-chat/me"))
          data = {
            actorId: "owner:actor",
            workspaceId: "workspace",
            owner: true,
            status: "active",
            displayName: "Тест",
            roles: {},
          };
        if (
          path.endsWith("/team-chat/state") ||
          path.endsWith("/team-chat/messages")
        )
          data = {
            messages: [],
            tasks: [],
            members: [],
            people: [],
            hasMore: false,
          };
        if (path.endsWith("/team-chat/task-options"))
          data = { projects: [], parties: [] };
        if (path.endsWith("/team-chat/events")) return route.abort();
        if (path.endsWith("/codex/status"))
          data = { connected: true, configured: true };
        if (path.endsWith("/codex/chats"))
          data = {
            chats: [{ id: "chat", title: "Проверка", threadId: "thread" }],
          };
        if (path.endsWith("/codex/chats/chat"))
          data = {
            chat: { id: "chat", threadId: "thread" },
            cachedHistory: { messages: [] },
          };
        if (path.endsWith("/codex/chats/chat/jobs")) {
          const body = request.postDataJSON();
          if (body.kind !== "history")
            sent.push({
              kind: "codex",
              text: body.message,
              attachments: body.attachments,
            });
          data = {
            job: {
              status: "completed",
              result:
                body.kind === "history"
                  ? { messages: [] }
                  : { text: "Готово", threadId: "thread" },
            },
          };
          if (slowJob && body.kind === 'history' && slowPolls >= 3) data = { job: { status: 'completed', result: { messages: [{ id: 'slow-answer', role: 'assistant', content: 'Долгий ответ получен' }] } } };
          if (slowJob && body.kind === 'send') data = { job: { id: 'slow-model', status: 'running' } };
        }
        if (path.endsWith('/codex/jobs/slow-model')) {
          slowPolls++;
          data = { job: { id: 'slow-model', status: slowPolls < 3 ? 'running' : 'completed', result: { text: 'Долгий ответ получен', threadId: 'thread' } } };
        }
        if (
          path.endsWith("/team-chat/messages") &&
          request.method() === "POST"
        ) {
          const body = request.postDataJSON();
          sent.push({
            kind: "team",
            text: body.text,
            attachments: (body.fileIds || []).map((id) =>
              uploadedFiles.get(id),
            ),
          });
          data = {
            message: {
              _id: crypto.randomUUID(),
              text: body.text,
              authorId: "owner:actor",
              attachments: [],
              createdAt: new Date().toISOString(),
            },
          };
        }
        if (
          request.method() === "POST" &&
          (path.endsWith("/team-chat/files") ||
            path.endsWith("/codex/chats/chat/files"))
        ) {
          const name = decodeURIComponent(request.headers()["x-file-name"]);
          uploads.push(name);
          await new Promise((resolve) => setTimeout(resolve, 100));
          data = {
            file: {
              fileId: crypto.randomUUID(),
              name,
              // WebKit's intercepted File request may omit the binary body.
              size: request.postDataBuffer()?.length ?? 1,
              mimeType: "text/plain",
            },
          };
          uploadedFiles.set(data.file.fileId, data.file);
        }
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      }
      if (url.origin !== origin || path.includes("socket.io"))
        return route.abort();
      return route.continue();
    });
    await page.goto(origin + (width < 1100 ? "/mobile" : "/"));
    for (const kind of ["team", "codex"]) {
      const name =
        kind === "team" ? "Открыть чат сотрудников" : "Открыть чат Codex";
      await page.getByRole("button", { name, exact: true }).click();
      const frame = page.getByRole("dialog", {
        name: kind === "team" ? "Чат Сотрудники" : "Чат Codex",
        exact: true,
      });
      await frame.waitFor();
      const field = frame.locator(".codex-input"),
        send = frame.getByRole("button", { name: "Отправить", exact: true });
      await field.waitFor();
      for (const theme of ["dark", "light"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          for (const [side, value] of Object.entries({
            top: 20,
            right: 12,
            bottom: 34,
            left: 12,
          }))
            document.documentElement.style.setProperty(
              "--safe-area-" + side,
              value + "px",
            );
        }, theme);
        if (width === 768 || width === 1440) {
          await verifyFileDrop({
            page,
            frame,
            field,
            send,
            kind,
            sent,
            uploads,
          });
          console.log(
            `PASS ${engine} ${kind} ${width} ${theme}: multi-file drop, cancellation, validation, preserved draft, removal and attachment send`,
          );
        }
        await field.fill("");
        await field.blur();
        if (kind === "team") {
          await send.waitFor();
          assert.ok(await send.isDisabled());
        }
        for (const keyboard of touch ? [false, true] : [false]) {
          await field.focus();
          if (touch)
            await page.evaluate((keyboard) => {
              Object.defineProperty(visualViewport, "height", {
                configurable: true,
                value: keyboard
                  ? Math.min(360, innerHeight - 160)
                  : innerHeight,
              });
              Object.defineProperty(visualViewport, "offsetTop", {
                configurable: true,
                value: keyboard ? 24 : 0,
              });
              visualViewport.dispatchEvent(new Event("resize"));
            }, keyboard);
          await field.fill("");
          await field.pressSequentially("Тест отправки");
          await send.waitFor();
          await page.waitForFunction(
            (id) =>
              !document.querySelector("#" + id + " .codex-send-btn").disabled,
            await frame.getAttribute("id"),
          );
          const appearance = await send.evaluate(async (el) => {
            // Finish layout/colour transitions before measuring the final painted state.
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            for (const animation of el.getAnimations())
              await animation.finished.catch(() => {});
            const style = getComputedStyle(el),
              glyph = el.querySelector("svg"),
              rect = el.getBoundingClientRect(),
              bg = style.backgroundColor.match(/[\d.]+/g).map(Number),
              fg = getComputedStyle(glyph)
                .color.match(/[\d.]+/g)
                .map(Number);
            const lum = (c) =>
                c
                  .slice(0, 3)
                  .map((v) => v / 255)
                  .map((v) =>
                    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
                  )
                  .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0),
              a = lum(bg),
              b = lum(fg);
            const center = document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2,
              ),
              vp = visualViewport;
            return {
              bg,
              fg,
              opacity: style.opacity,
              contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
              hit: el.contains(center),
              viewport:
                rect.top >= vp.offsetTop &&
                rect.bottom <= vp.offsetTop + vp.height + 1 &&
                rect.left >= vp.offsetLeft &&
                rect.right <= vp.offsetLeft + vp.width + 1,
              rect: rect.toJSON(),
              viewportBounds: { top: vp.offsetTop, height: vp.height },
              stroke: getComputedStyle(glyph).stroke,
            };
          });
          assert.ok(
            appearance.bg[1] > appearance.bg[0] * 1.3 &&
              appearance.bg[1] > appearance.bg[2] * 1.3,
            JSON.stringify({ kind, width, theme, keyboard, appearance }),
          );
          assert.ok(
            appearance.contrast >= 3 &&
              appearance.opacity === "1" &&
              appearance.hit &&
              appearance.viewport,
            JSON.stringify({ kind, width, theme, keyboard, appearance }),
          );
          const before = sent.length;
          const delivered = page.waitForResponse(
            (response) =>
              response.request().method() === "POST" &&
              new URL(response.url()).pathname.endsWith(
                kind === "team"
                  ? "/team-chat/messages"
                  : "/codex/chats/chat/jobs",
              ),
          );
          await (touch ? send.tap() : send.click());
          await delivered;
          await page.waitForFunction(
            () =>
              !document.querySelector(".codex-chat-window .codex-input")
                ?.value ||
              document.querySelector(".codex-chat-window .codex-input")
                ?.value === "",
          );
          assert.equal(
            sent.length,
            before + 1,
            "the visible send target submits exactly once",
          );
        }
        console.log(
          `PASS ${engine} full app ${kind} ${width}×${height} ${theme}: typed text, green action, visible arrow, keyboard, hit target and actual send`,
        );
      }
      if (touch)
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, "height", {
            configurable: true,
            value: innerHeight,
          });
          Object.defineProperty(visualViewport, "offsetTop", {
            configurable: true,
            value: 0,
          });
          visualViewport.dispatchEvent(new Event("resize"));
        });
      if (kind === 'codex' && width === 390) {
        // Move the wall clock forward six minutes during an actual running job.
        // Timers and network polling stay real: the old five-minute cutoff fails here.
        slowJob = true;
        await field.fill('Долгий запрос модели');
        await send.tap();
        await frame.getByLabel('Codex готовит ответ').waitFor();
        await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 360000; });
        await frame.getByText('Долгий ответ получен', { exact: true }).waitFor();
        assert.ok(slowPolls >= 3);
        assert.equal(await frame.getByRole('alert').count(), 0);
        assert.equal(sent.filter(row => row.text === 'Долгий запрос модели').length, 1);
        slowJob = false;
        console.log(`PASS ${engine}: running cloud request remains attached after six minutes and returns once without resubmission`);
      }
      await frame
        .getByRole("button", {
          name:
            kind === "team" ? "Закрыть чат Сотрудники" : "Закрыть чат Codex",
          exact: true,
        })
        .click();
    }
    await context.close();
  }
}

async function verifyFileDrop({
  page,
  frame,
  field,
  send,
  kind,
  sent,
  uploads,
}) {
  if (kind === "codex")
    await page.waitForFunction(
      (id) => {
        const select = document.querySelector(
          "#" + id + " .desktop-chat-picker select",
        );
        return select?.value === "chat" && !select.disabled;
      },
      await frame.getAttribute("id"),
    );
  const area = frame.locator(
      kind === "team" ? ".team-chat-conversation" : ".desktop-assistant",
    ),
    overlay = frame.locator(".chat-file-drop");
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(["Документ"], "Перетащен.txt", { type: "text/plain" }),
    );
    data.items.add(new File(["a,b\n1,2"], "Таблица.csv", { type: "text/csv" }));
    return data;
  });
  assert.equal(
    await field.evaluate((el) => {
      const data = new DataTransfer();
      data.setData("text/plain", "Текст");
      const event = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
      });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    false,
    "ordinary text drags retain native behaviour",
  );
  const tooMany = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    for (let i = 0; i < 6; i++)
      data.items.add(
        new File(["x"], "Лимит" + i + ".txt", { type: "text/plain" }),
      );
    return data;
  });
  const beforeUploads = uploads.length;
  await area.dispatchEvent("drop", { dataTransfer: tooMany });
  await frame
    .getByRole("alert")
    .filter({ hasText: /пяти файлов/ })
    .waitFor();
  assert.equal(
    uploads.length,
    beforeUploads,
    "invalid batches are not partly uploaded",
  );
  await area.dispatchEvent("dragenter", { dataTransfer: transfer });
  await overlay.waitFor();
  assert.equal(
    await overlay.evaluate((el) => getComputedStyle(el).pointerEvents),
    "none",
  );
  await field.dispatchEvent("dragenter", { dataTransfer: transfer });
  await field.dispatchEvent("dragleave", { dataTransfer: transfer });
  assert.ok(
    await overlay.isVisible(),
    "moving over nested controls keeps the drop highlight",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("dragend")));
  await overlay.waitFor({ state: "hidden" });
  await field.fill("Черновик с вложениями");
  const beforeSent = sent.length;
  await area.dispatchEvent("dragenter", { dataTransfer: transfer });
  await field.dispatchEvent("dragover", { dataTransfer: transfer });
  await field.dispatchEvent("drop", { dataTransfer: transfer });
  if (kind === "team")
    await field.dispatchEvent("drop", { dataTransfer: transfer });
  await overlay.waitFor({ state: "hidden" });
  const removeName = (name) =>
    (kind === "team" ? "Убрать файл " : "Убрать ") + name;
  await frame
    .getByRole("button", { name: removeName("Таблица.csv"), exact: true })
    .waitFor();
  assert.equal(await field.inputValue(), "Черновик с вложениями");
  assert.equal(
    sent.length,
    beforeSent,
    "a drop stages attachments without sending",
  );
  assert.equal(
    await frame
      .getByRole("button", { name: removeName("Перетащен.txt"), exact: true })
      .count(),
    1,
    "a drop adds each file once",
  );
  await frame
    .getByRole("button", { name: removeName("Перетащен.txt"), exact: true })
    .click();
  assert.equal(
    await frame
      .getByRole("button", { name: removeName("Перетащен.txt"), exact: true })
      .count(),
    0,
  );
  const extra = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["Ещё"], "Ещё.txt", { type: "text/plain" }));
    return data;
  });
  await area.dispatchEvent("drop", { dataTransfer: extra });
  await frame
    .getByRole("button", { name: removeName("Ещё.txt"), exact: true })
    .waitFor();
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname.endsWith(
        kind === "team" ? "/team-chat/messages" : "/codex/chats/chat/jobs",
      ),
  );
  await send.click();
  await response;
  assert.equal(sent.length, beforeSent + 1);
  assert.deepEqual(
    sent.at(-1).attachments.map((file) => file.name),
    ["Таблица.csv", "Ещё.txt"],
  );
  assert.equal(sent.at(-1).text, "Черновик с вложениями");
  await frame
    .getByRole("button", { name: removeName("Ещё.txt"), exact: true })
    .waitFor({ state: "hidden" });
  await transfer.dispose();
  await tooMany.dispose();
  await extra.dispose();
}
