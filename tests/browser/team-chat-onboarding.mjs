import assert from "node:assert/strict";
export async function verifyOnboardingBrowser({
  browser,
  base,
  token,
  output,
}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/team/" + token, { waitUntil: "domcontentloaded" });
  const setup = page.getByRole("dialog", { name: "Chat", exact: true });
  await setup.waitFor();
  await setup.getByText(/Выберите «На экран Домой»/).waitFor();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => document.documentElement.setAttribute("data-theme", t),
      theme,
    );
    await page.screenshot({
      path: `${output}/team-chat-ios-install-${theme}.png`,
    });
    const metrics = await setup.evaluate((e) => {
      const r = e.getBoundingClientRect(),
        close = e.querySelector('[aria-label="Закрыть настройку чата"]'),
        icon = close.querySelector("svg");
      const a = close.getBoundingClientRect(),
        b = icon.getBoundingClientRect();
      return {
        x: r.x,
        right: r.right,
        bottom: r.bottom,
        center: Math.abs(a.y + a.height / 2 - b.y - b.height / 2),
      };
    });
    assert.ok(
      metrics.x >= 0 &&
        metrics.right <= 390 &&
        metrics.bottom <= 844 &&
        metrics.center < 1,
    );
  }
  await setup.getByRole("button", { name: "Позже", exact: true }).click();
  await page
    .getByLabel("Номер телефона", { exact: true })
    .fill("+7 (705) 488-66-98");
  assert.equal(
    await page.getByLabel("Номер телефона", { exact: true }).inputValue(),
    "705 488 66 98",
  );
  await page.screenshot({ path: `${output}/team-chat-invite-phone.png` });
  await context.close();

  // Controlled latency and paged HTTP responses verify loaders, request counts and scroll anchors.
  const history = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const workspaceId = "a".repeat(24),
    actorId = "fixture-actor";
  await history.addInitScript(
    ({ workspaceId, actorId }) => {
      localStorage.setItem("index12-chat-setup:" + workspaceId, "1");
      localStorage.setItem(
        "index12-chat-push-offer:" + workspaceId + ":" + actorId,
        "1",
      );
    },
    { workspaceId, actorId },
  );
  const identity = {
    workspaceId,
    actorId,
    displayName: "History fixture",
    name: "Fixture chat",
    status: "active",
    role: "employee",
    roles: { employee: "Сотрудник" },
  };
  const messages = Array.from({ length: 130 }, (_, i) => ({
    _id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    authorId: "other",
    authorName: "Fixture",
    text: "History message " + i,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    attachments: [],
  }));
  let release,
    requested = 0;
  const delayed = new Promise((r) => (release = r));
  await history.route("**/team-chat/**", async (route) => {
    const url = new URL(route.request().url());
    let data;
    if (url.pathname.includes("/invite/"))
      data = {
        workspaceId,
        name: "Fixture chat",
        inviterName: "Fixture owner",
        roleName: "Сотрудник",
      };
    else if (url.pathname.endsWith("/me")) data = identity;
    else if (url.pathname.endsWith("/state")) {
      await delayed;
      data = {
        identity,
        messages: messages.slice(-50),
        requests: [],
        members: [],
        companies: [],
        hasMore: true,
      };
    } else if (url.pathname.endsWith("/messages")) {
      requested++;
      await new Promise((r) => setTimeout(r, 200));
      const index = messages.findIndex(
        (m) => m._id === url.searchParams.get("before"),
      );
      data = {
        messages: messages.slice(Math.max(0, index - 50), index),
        hasMore: index > 50,
      };
    } else return route.abort();
    await route.fulfill({
      json: data,
      headers: {
        "Access-Control-Allow-Origin": base,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers":
          "content-type,x-index12-workspace-id,x-index12-chat-only",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
    });
  });
  const h = await history.newPage();
  h.on("pageerror", (e) => errors.push(e.message));
  await h.goto(base + "/team/" + token, { waitUntil: "domcontentloaded" });
  await h.getByText("Загружаем историю сообщений…", { exact: true }).waitFor();
  release();
  const feed = h.getByRole("region", {
    name: "Чат сотрудников",
    exact: true,
  });
  await feed.locator(".team-message").first().waitFor();
  assert.equal(await feed.locator(".team-message").count(), 50);
  assert.equal(requested, 0);
  await feed.evaluate((e) => {
    e.scrollTop = 0;
  });
  await h.waitForFunction(
    () => document.querySelectorAll(".team-message").length === 100,
  );
  assert.equal(requested, 1);
  const anchor = await feed.evaluate((e) => {
    const firstOld = e.querySelector(
      '[data-message-id="00000000-0000-4000-8000-000000000080"]',
    );
    return {
      top: firstOld.getBoundingClientRect().top - e.getBoundingClientRect().top,
      scroll: e.scrollTop,
    };
  });
  assert.ok(
    anchor.scroll > 100 && Math.abs(anchor.top) < 120,
    "Prepending retains the first visible message at the same screen location",
  );
  await feed.evaluate((e) => {
    e.scrollTop = 0;
  });
  await h.waitForFunction(
    () => document.querySelectorAll(".team-message").length === 130,
  );
  assert.equal(requested, 2);
  await feed.evaluate((e) => {
    e.scrollTop = 0;
  });
  await h.waitForTimeout(250);
  assert.equal(
    requested,
    2,
    "History ends without requesting the same page again",
  );
  await h.screenshot({ path: `${output}/team-chat-history.png` });
  messages.push(
    ...Array.from({ length: 120 }, (_, offset) => {
      const i = 130 + offset;
      return {
        ...messages[0],
        _id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        text: "History message " + i,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      };
    }),
  );
  await h.evaluate(() => window.dispatchEvent(new Event("focus")));
  await feed.locator("[data-gap-before]").waitFor();
  await feed.locator("[data-gap-before]").evaluate((button) => button.click());
  await h.waitForFunction(
    () => document.querySelectorAll(".team-message").length === 230,
  );
  await feed.locator("[data-gap-before]").evaluate((button) => button.click());
  await h.waitForFunction(
    () => document.querySelectorAll(".team-message").length === 250,
  );
  assert.equal(await feed.locator("[data-gap-before]").count(), 0);
  assert.equal(
    requested,
    4,
    "A long reconnect gap is recovered in two bounded pages",
  );
  await history.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: iPhone install instructions, preserved invite shortcut, phone paste, loading state, automatic 50-message pages and stable scroll position",
  );
}
