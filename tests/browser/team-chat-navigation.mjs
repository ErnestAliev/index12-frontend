import assert from "node:assert/strict";
export async function openChatMenu(frame) {
  const trigger = frame.getByRole("button", { name: "Меню чата", exact: true });
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  const menu = frame.getByRole("dialog", { name: "Меню чата", exact: true });
  const back = menu.getByRole("button", {
    name: "Назад к разделам чата",
    exact: true,
  });
  if (await back.count()) await back.click();
  return menu;
}
export async function openChatSettings(frame) {
  const menu = await openChatMenu(frame);
  await menu
    .getByRole("button", { name: "Настройки чата", exact: true })
    .click();
  return menu;
}
export async function closeChatMenu(frame) {
  const trigger = frame.getByRole("button", { name: "Меню чата", exact: true });
  if ((await trigger.getAttribute("aria-expanded")) === "true")
    await trigger.click();
}
export async function selectSection(frame, label) {
  const menu = await openChatMenu(frame);
  await menu
    .getByRole("button", {
      name: label === "Участники" ? "Роли и участники" : label,
      exact: true,
    })
    .click();
}
export async function hasSection(frame, label) {
  const wasOpen =
    (await frame
      .getByRole("button", { name: "Меню чата", exact: true })
      .getAttribute("aria-expanded")) === "true";
  const menu = await openChatMenu(frame);
  const count = await menu
    .getByRole("button", {
      name: label === "Участники" ? "Роли и участники" : label,
      exact: true,
    })
    .count();
  if (!wasOpen) await closeChatMenu(frame);
  return count;
}
export async function verifyTopNavigation(page, frame, output) {
  const originalViewport = page.viewportSize();
  const trigger = frame.getByRole("button", { name: "Меню чата", exact: true });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 360 },
    { width: 820, height: 1180 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(
      ({ id, width, height }) => {
        const b = document.getElementById(id)?.getBoundingClientRect();
        return (
          b && Math.abs(b.width - width) < 2 && Math.abs(b.height - height) < 2
        );
      },
      { id: await frame.getAttribute("id"), ...viewport },
    );
    const button = await trigger.boundingBox();
    assert.ok(
      button.y < 70 && button.width <= 138 && button.height >= 44,
      "One compact dropdown remains at the top on every device",
    );
    assert.ok(
      await trigger.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      }),
    );
    assert.equal(await frame.getByRole("tab").count(), 0);
    assert.equal(
      await frame.locator(".codex-window-header button").count(),
      2,
      "Only section dropdown and icon-only close remain beside the name",
    );
    const close = frame.getByRole("button", {
      name: "Закрыть чат Сотрудники",
      exact: true,
    });
    assert.equal(await close.textContent(), "");
    const menu = await openChatMenu(frame),
      bounds = await menu.boundingBox();
    assert.ok(
      bounds.y >= button.y + button.height &&
        bounds.y + bounds.height <= viewport.height,
      "Dropdown remains inside available screen space",
    );
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
    await menu
      .getByRole("button", { name: "Настройки чата", exact: true })
      .waitFor();
    if (output)
      await page.screenshot({
        path: `${output}/team-chat-header-${viewport.width}.png`,
        animations: "disabled",
      });
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    assert.equal(await frame.isVisible(), true);
    await selectSection(frame, "Задачи");
    assert.equal(await trigger.getAttribute("data-section"), "tasks");
    await selectSection(frame, "Сообщения");
    assert.equal(await trigger.getAttribute("data-section"), "messages");
  }
  await page.setViewportSize(originalViewport);
  const url = page.url();
  await frame
    .getByRole("button", { name: "Закрыть чат Сотрудники", exact: true })
    .click();
  await frame.waitFor({ state: "hidden" });
  assert.equal(page.url(), url);
  await page.getByRole("button", { name: "Открыть чат", exact: true }).click();
  await frame.waitFor();
  await frame
    .getByRole("region", { name: "Сообщения сотрудников", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Войти", exact: true }).count(),
    0,
  );
}
