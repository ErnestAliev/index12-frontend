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
      sent = [];
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
            sent.push({ kind: "codex", text: body.message });
          data = {
            job: {
              status: "completed",
              result:
                body.kind === "history"
                  ? { messages: [] }
                  : { text: "Готово", threadId: "thread" },
            },
          };
        }
        if (
          path.endsWith("/team-chat/messages") &&
          request.method() === "POST"
        ) {
          const body = request.postDataJSON();
          sent.push({ kind: "team", text: body.text });
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
