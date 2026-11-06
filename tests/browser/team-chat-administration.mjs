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
  await frame
    .getByRole("region", { name: "Приглашения в чат", exact: true })
    .waitFor();
  const created = admin.waitForResponse(
    (r) =>
      r.url().endsWith("/team-chat/invite") && r.request().method() === "POST",
  );
  await frame
    .getByRole("button", { name: "Пригласить по ссылке", exact: true })
    .click();
  const first = (await (await created).json()).invite;
  const row = frame
    .locator(".member-invite")
    .filter({ has: admin.locator(`select[id="invite-${first._id}"]`) });
  const field = row.getByLabel("Ссылка приглашения в чат", { exact: true });
  await field.waitFor();
  assert.equal(await field.inputValue(), first.url);
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
  await row
    .getByRole("button", { name: "Ссылка скопирована", exact: true })
    .waitFor();
  const changed = admin.waitForResponse(
    (r) =>
      r.url().endsWith("/team-chat/invites/" + first._id) &&
      r.request().method() === "PATCH",
  );
  await row.locator("select").selectOption("manager");
  const update = await (await changed).json();
  await admin.waitForFunction(
    ({ id, url }) =>
      document
        .getElementById("invite-" + id)
        ?.closest("article")
        .querySelector("input")?.value === url,
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
  // Desktop/phone, both themes: no field spills out, all action icons share their button center.
  for (const width of [1440, 390])
    for (const theme of ["dark", "light"]) {
      await admin.setViewportSize({ width, height: 844 });
      await admin.evaluate(
        (t) => document.documentElement.setAttribute("data-theme", t),
        theme,
      );
      await row.scrollIntoViewIfNeeded();
      const metrics = await frame.locator(".member-admin").evaluate((e) => ({
        overflow: e.scrollWidth - e.clientWidth,
        icons: [...e.querySelectorAll("button:has(svg)")]
          .filter((b) => b.getClientRects().length)
          .map((b) => {
            const r = b.getBoundingClientRect(),
              s = b.querySelector("svg").getBoundingClientRect();
            return Math.abs(r.y + r.height / 2 - s.y - s.height / 2);
          }),
        arrows: [...e.querySelectorAll("select")].map(
          (s) => getComputedStyle(s).backgroundPosition,
        ),
      }));
      assert.ok(metrics.overflow <= 1);
      assert.ok(metrics.icons.every((v) => v < 1));
      assert.ok(metrics.arrows.every((v) => v.includes("50%")));
      await admin.screenshot({
        path: `${output}/team-chat-members-${width}-${theme}.png`,
      });
    }
  admin.once("dialog", (d) => d.accept());
  await row
    .getByRole("button", { name: "Удалить ссылку", exact: true })
    .click();
  await row.waitFor({ state: "hidden" });

  const person = frame.getByRole("article", {
    name: "Участник Browser employee",
    exact: true,
  });
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
