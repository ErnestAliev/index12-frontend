import assert from "node:assert/strict";
export async function verifyAdministrationBrowser({
  context,
  browser,
  base,
  origin,
  token,
  employeePage,
  output,
}) {
  const admin = await context.newPage(),
    errors = [];
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto(base + "/team/" + token, { waitUntil: "domcontentloaded" });
  const frame = admin.getByRole("dialog", {
    name: "Чат Сотрудники",
    exact: true,
  });
  await frame.waitFor();
  const setup = admin.getByRole("dialog", { name: "Chat", exact: true });
  if (await setup.isVisible())
    await setup
      .getByRole("button", { name: "Закрыть настройку чата", exact: true })
      .click();
  await frame.getByRole("tab", { name: /^Участники/ }).click();
  assert.equal(await frame.locator(".member-own-role").count(), 0);
  assert.equal(
    await frame
      .getByRole("region", { name: "Приглашения в чат", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await frame
      .locator(".team-heading")
      .getByLabel("Моя роль в чате", { exact: true })
      .count(),
    1,
  );
  const inviteButton = frame.getByRole("button", {
    name: "Пригласить по ссылке",
    exact: true,
  });
  await inviteButton.click();
  const activeRow = frame.locator(".member-invite");
  const field = activeRow.getByLabel("Ссылка приглашения в чат", {
    exact: true,
  });
  await field.waitFor();
  const first = {
    _id: await activeRow.getAttribute("data-invite-id"),
    url: await field.inputValue(),
  };
  const row = frame.locator(`.member-invite[data-invite-id="${first._id}"]`);
  for (let i = 0; i < 3; i++) {
    await field.click();
    const selection = await field.evaluate((e) => ({
      start: e.selectionStart,
      end: e.selectionEnd,
      length: e.value.length,
    }));
    assert.equal(selection.start, 0);
    assert.equal(selection.end, selection.length);
  }
  await row
    .getByRole("button", { name: "Скопировать ссылку", exact: true })
    .click();
  await row.waitFor({ state: "hidden" });
  await inviteButton.click();
  await field.waitFor();
  assert.equal(
    await field.inputValue(),
    first.url,
    "Opening the invitation again reuses its link",
  );
  const changed = admin.waitForResponse(
    (r) =>
      r.url().endsWith("/team-chat/invites/" + first._id) &&
      r.request().method() === "PATCH",
  );
  await row.locator("select").selectOption("manager");
  const update = await (await changed).json();
  await admin.waitForFunction(
    ({ id, url }) =>
      document.querySelector(`[data-invite-id="${id}"] input`)?.value === url,
    { id: first._id, url: update.url },
  );
  assert.notEqual(update.url, first.url);
  assert.equal(
    (
      await (
        await context.request.get(
          origin + "/api/team-chat/invite/" + first.url.split("/").at(-1),
        )
      ).json()
    ).joinable,
    false,
  );
  await frame
    .getByRole("button", { name: "Закрыть приглашение", exact: true })
    .click();
  const person = frame.getByRole("article", {
    name: "Участник Browser employee",
    exact: true,
  });
  const expand = person.getByRole("button", {
    name: "Настройки Browser employee",
    exact: true,
  });
  assert.equal(
    await person
      .getByRole("button", { name: "Закрыть доступ", exact: true })
      .count(),
    0,
  );
  // All widths and themes: compact rows, aligned text/controls, no duplicate select arrows.
  for (const width of [1440, 390, 320])
    for (const theme of ["dark", "light"]) {
      await admin.setViewportSize({ width, height: 844 });
      await admin.evaluate(
        (t) => document.documentElement.setAttribute("data-theme", t),
        theme,
      );
      await person.scrollIntoViewIfNeeded();
      const metrics = await frame.locator(".member-admin").evaluate((e) => ({
        overflow: e.scrollWidth - e.clientWidth,
        rows: [...e.querySelectorAll(".member-row")].map(
          (r) => r.getBoundingClientRect().height,
        ),
        icons: [...e.querySelectorAll("button:has(svg)")]
          .filter((b) => b.getClientRects().length)
          .map((b) => {
            const r = b.getBoundingClientRect(),
              s = b.querySelector("svg").getBoundingClientRect();
            return Math.abs(r.y + r.height / 2 - s.y - s.height / 2);
          }),
        arrows: [...e.querySelectorAll(".team-role-select")].map((s) => {
          const r = s.querySelector("select").getBoundingClientRect(),
            a = s.querySelector("svg").getBoundingClientRect();
          return {
            center: Math.abs(r.y + r.height / 2 - a.y - a.height / 2),
            height: r.height,
            background: getComputedStyle(s.querySelector("select"))
              .backgroundImage,
          };
        }),
      }));
      assert.ok(metrics.overflow <= 1);
      assert.ok(metrics.rows.every((h) => h <= 56));
      assert.ok(metrics.icons.every((v) => v < 1));
      assert.ok(
        metrics.arrows.every((v) => v.center < 1 && v.background === "none"),
      );
      assert.ok(
        metrics.arrows.every((v) => v.height >= (width <= 480 ? 44 : 36)),
      );
      await admin.screenshot({
        path: `${output}/team-chat-members-${width}-${theme}.png`,
        animations: "disabled",
      });
      await expand.click();
      const actions = await person
        .locator(".member-actions button")
        .evaluateAll((buttons) =>
          buttons.map((b) => b.getBoundingClientRect().y),
        );
      assert.ok(actions.every((y) => Math.abs(y - actions[0]) < 1));
      await admin.screenshot({
        path: `${output}/team-chat-member-expanded-${width}-${theme}.png`,
        animations: "disabled",
      });
      await expand.click();
    }
  await inviteButton.click();
  await row.locator(".member-link-settings summary").click();
  admin.once("dialog", (d) => d.accept());
  await row
    .getByRole("button", { name: "Удалить ссылку", exact: true })
    .click();
  await row.waitFor({ state: "hidden" });
  // Member settings stay collapsed until explicitly opened.
  await expand.click();
  await person
    .getByRole("button", { name: "Закрыть доступ", exact: true })
    .click();
  await person
    .getByRole("button", { name: "Вернуть доступ", exact: true })
    .waitFor();
  await employeePage
    .getByRole("heading", { name: "Доступ отозван", exact: true })
    .waitFor();
  await person
    .getByRole("button", { name: "Вернуть доступ", exact: true })
    .click();
  await employeePage.evaluate(() => window.dispatchEvent(new Event("focus")));
  await employeePage
    .getByRole("dialog", { name: "Чат Сотрудники", exact: true })
    .waitFor();

  // A logged-out employee requests recovery. Only owner verification produces the secret.
  const recoveryContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    recoveryPage = await recoveryContext.newPage();
  recoveryPage.on("pageerror", (e) => errors.push(e.message));
  await recoveryPage.goto(base + "/team/" + token, {
    waitUntil: "domcontentloaded",
  });
  await recoveryPage
    .getByRole("dialog", { name: "Chat", exact: true })
    .getByRole("button", { name: "Позже", exact: true })
    .click();
  await recoveryPage
    .getByRole("button", { name: "Забыли пароль?", exact: true })
    .click();
  await recoveryPage
    .getByLabel("Номер телефона", { exact: true })
    .fill("7010000003");
  assert.equal(
    await recoveryPage
      .getByLabel("Номер телефона", { exact: true })
      .getAttribute("placeholder"),
    "Номер телефона",
  );
  await recoveryPage
    .getByRole("button", { name: "Запросить восстановление", exact: true })
    .click();
  await recoveryPage
    .getByRole("status")
    .getByText(/владелец получит запрос/)
    .waitFor();
  const recovery = frame.getByRole("region", {
    name: "Восстановление доступа",
    exact: true,
  });
  await recovery.getByText("Browser employee", { exact: true }).waitFor();
  const issue = recovery.getByRole("button", {
    name: "Выдать одноразовую ссылку",
    exact: true,
  });
  assert.equal(await issue.isDisabled(), true);
  await recovery
    .getByLabel("Запрос подтверждён через известный контакт", { exact: true })
    .check();
  await issue.click();
  const reset = await recovery
    .getByLabel("Ссылка восстановления пароля", { exact: true })
    .inputValue();
  const resetUrl = new URL(reset);
  await recoveryPage.goto(base + resetUrl.pathname + resetUrl.search, {
    waitUntil: "domcontentloaded",
  });
  await recoveryPage
    .getByLabel("Новый пароль", { exact: true })
    .fill("new-browser-passphrase");
  await recoveryPage
    .getByLabel("Повторите пароль", { exact: true })
    .fill("new-browser-passphrase");
  await recoveryPage
    .getByRole("button", { name: "Сохранить пароль", exact: true })
    .click();
  await recoveryPage
    .getByText("Пароль обновлён. Войдите с номером телефона и новым паролем", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await recoveryPage
      .getByLabel("Номер телефона", { exact: true })
      .inputValue(),
    "",
  );
  await employeePage.getByLabel("Номер телефона", { exact: true }).waitFor();
  assert.equal(
    await employeePage
      .getByLabel("Номер телефона", { exact: true })
      .inputValue(),
    "",
  );
  await recoveryPage.goto(base + resetUrl.pathname + resetUrl.search, {
    waitUntil: "domcontentloaded",
  });
  await recoveryPage
    .getByRole("heading", { name: "Восстановить доступ", exact: true })
    .waitFor();
  await recoveryPage
    .getByRole("button", { name: "Запросить восстановление", exact: true })
    .waitFor();
  admin.once("dialog", (d) => d.accept());
  await person
    .getByRole("button", {
      name: "Удалить сотрудника Browser employee",
      exact: true,
    })
    .click();
  await person.waitFor({ state: "hidden" });
  await recoveryContext.close();
  await admin.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: stable full-link selection/copy, automatic role rotation and deletion, centered responsive controls, access restore, verified password recovery and cleared employee credentials",
  );
}
