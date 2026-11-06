import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { openChatMenu } from "./team-chat-navigation.mjs";
export async function verifyNotificationMenu({
  browser,
  employeePage,
  base,
  token,
  output,
}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: await employeePage.context().storageState(),
  });
  let subscribed = false,
    binds = 0,
    removals = 0;
  const key = Buffer.alloc(65, 1).toString("base64url");
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { get: () => true });
    window.PushManager = class {};
    const permission = () =>
      localStorage.getItem("fixture-push-permission") || "default";
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        get permission() {
          return permission();
        },
        requestPermission() {
          localStorage.setItem("fixture-push-permission", "granted");
          localStorage.setItem(
            "fixture-push-prompts",
            String(
              Number(localStorage.getItem("fixture-push-prompts") || 0) + 1,
            ),
          );
          return Promise.resolve("granted");
        },
      },
    });
    const device = {
      endpoint: "https://fcm.googleapis.com/fixture-ui-device",
      options: { applicationServerKey: new Uint8Array(65).fill(1).buffer },
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: "a".repeat(65), auth: "b".repeat(24) },
        };
      },
      async unsubscribe() {
        localStorage.removeItem("fixture-push-device");
        return true;
      },
    };
    const registration = {
      active: { scriptURL: location.origin + "/team-sw.js" },
      pushManager: {
        async getSubscription() {
          return localStorage.getItem("fixture-push-device") ? device : null;
        },
        async subscribe() {
          localStorage.setItem("fixture-push-device", "1");
          return device;
        },
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: async () => registration,
        getRegistration: async () => registration,
        addEventListener() {},
        removeEventListener() {},
      },
    });
  });
  await context.route("**/api/team-chat/push/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const headers = {
      "Access-Control-Allow-Origin": base,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers":
        "content-type,x-index12-workspace-id,x-index12-chat-only",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    let json;
    if (path.endsWith("/key")) json = { configured: true, publicKey: key };
    else if (path.endsWith("/status")) json = { enabled: subscribed };
    else if (req.method() === "POST") {
      assert.equal(req.postDataJSON().token, token);
      subscribed = true;
      binds++;
      json = { enabled: true };
    } else if (req.method() === "DELETE") {
      subscribed = false;
      removals++;
      json = { enabled: false };
    } else throw Error("Unexpected push request");
    return route.fulfill({ json, headers });
  });
  // This isolated device tests the logout UI without revoking the real fixture device's session.
  await context.route("**/api/team-chat/logout", (r) =>
    r.fulfill({
      status: r.request().method() === "OPTIONS" ? 204 : 200,
      json:
        r.request().method() === "OPTIONS" ? undefined : { loggedOut: true },
      headers: {
        "Access-Control-Allow-Origin": base,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers":
          "content-type,x-index12-workspace-id,x-index12-chat-only",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
    }),
  );

  try {
    const page = await context.newPage();
    await page.goto(base + "/team/" + token, { waitUntil: "domcontentloaded" });
    const frame = page.getByRole("dialog", {
      name: "Чат Сотрудники",
      exact: true,
    });
    await frame.waitFor();
    const setup = page.getByRole("dialog", { name: "Chat", exact: true });
    if (await setup.isVisible())
      await setup
        .getByRole("button", { name: "Продолжить", exact: true })
        .click();
    let menu = await openChatMenu(frame);
    const labels = (await menu.locator("button").allTextContents()).map((t) =>
      t.trim(),
    );
    assert.deepEqual(labels.slice(0, 3), ["Чат", "Заявки", "Задачи"]);
    assert.equal(labels.at(-1), "Выйти");
    assert.equal(
      await menu
        .getByRole("button", { name: "Настройки чата", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await frame
        .getByRole("region", { name: "Настройки чата", exact: true })
        .count(),
      0,
    );
    await menu
      .getByRole("button", { name: "Включить уведомления", exact: true })
      .click();
    await menu
      .getByRole("button", { name: "Выключить уведомления", exact: true })
      .waitFor();
    assert.equal(binds, 1);
    assert.equal(
      await menu.getByText("Уведомления включены", { exact: true }).count(),
      0,
    );
    assert.equal(
      await menu
        .getByText("Chat добавлен на главный экран", { exact: true })
        .count(),
      0,
    );
    await menu
      .getByRole("button", { name: "Выключить уведомления", exact: true })
      .click();
    await menu
      .getByRole("button", { name: "Включить уведомления", exact: true })
      .waitFor();
    assert.equal(removals, 1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await frame.waitFor();
    menu = await openChatMenu(frame);
    await menu
      .getByRole("button", { name: "Включить уведомления", exact: true })
      .waitFor();
    assert.equal(
      binds,
      1,
      "Reload never silently re-enables an opted-out device",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("fixture-push-prompts")),
      "1",
      "Reload never triggers a permission prompt",
    );
    await menu
      .getByRole("button", { name: "Включить уведомления", exact: true })
      .click();
    await menu
      .getByRole("button", { name: "Выключить уведомления", exact: true })
      .waitFor();
    assert.equal(binds, 2);
    for (const theme of ["dark", "light"]) {
      const name = theme === "dark" ? "Тёмная тема" : "Светлая тема";
      await menu.getByRole("button", { name, exact: true }).click();
      menu = await openChatMenu(frame);
      await page.screenshot({
        path: `${output}/team-chat-unified-menu-${theme}.png`,
        animations: "disabled",
      });
    }
    await menu.getByRole("button", { name: "Выйти", exact: true }).click();
    await frame.waitFor({ state: "hidden" });
    await page.getByLabel("Номер телефона", { exact: true }).waitFor();
    console.log(
      "PASS: compact Chat/Requests/Tasks menu, one theme action, scoped device push on/off across reload, no installation/status clutter and direct logout",
    );
  } finally {
    await context.close();
  }
}
