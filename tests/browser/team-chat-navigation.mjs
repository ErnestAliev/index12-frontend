export async function selectSection(frame, label) {
  const select = frame.getByRole("combobox", {
    name: "Раздел чата",
    exact: true,
  });
  if (await select.count()) await select.selectOption({ label });
  else await frame.getByRole("tab", { name: new RegExp("^" + label) }).click();
}
export async function hasSection(frame, label) {
  const select = frame.getByRole("combobox", {
    name: "Раздел чата",
    exact: true,
  });
  if (await select.count())
    return select.locator("option").filter({ hasText: label }).count();
  return frame.getByRole("tab", { name: new RegExp("^" + label) }).count();
}
export async function openChatMenu(frame) {
  const trigger = frame.getByRole("button", { name: "Меню чата", exact: true });
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  return frame.getByRole("dialog", { name: "Меню чата", exact: true });
}
export async function closeChatMenu(frame) {
  const trigger = frame.getByRole("button", { name: "Меню чата", exact: true });
  if ((await trigger.getAttribute("aria-expanded")) === "true")
    await trigger.click();
}
import assert from "node:assert/strict";
export async function verifyTopNavigation(page, frame, output) {
  const originalViewport = page.viewportSize();
  const section = frame.getByRole("combobox", {
    name: "Раздел чата",
    exact: true,
  });
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
        const bounds = document.getElementById(id)?.getBoundingClientRect();
        return (
          bounds &&
          Math.abs(bounds.width - width) < 2 &&
          Math.abs(bounds.height - height) < 2
        );
      },
      { id: await frame.getAttribute("id"), ...viewport },
    );
    const picker = await section.boundingBox();
    const button = await trigger.boundingBox();
    const header = await frame.locator(".team-heading").boundingBox();
    assert.ok(
      Math.abs(picker.x + picker.width / 2 - header.x - header.width / 2) < 2,
      "Section picker stays centered in the header",
    );
    assert.ok(
      picker.y < 70 && button.y < 70,
      "Navigation must stay at the top on every device",
    );
    assert.ok(
      button.width >= 44 && button.height >= 44,
      "Menu needs a full touch target",
    );
    assert.ok(
      await trigger.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      }),
      "Menu must remain clickable above the chat",
    );
    assert.equal(await frame.getByRole("tab").count(), 0);
    const menu = await openChatMenu(frame);
    const bounds = await menu.boundingBox();
    assert.ok(
      bounds.y >= picker.y + picker.height &&
        bounds.y + bounds.height <= viewport.height,
      "Menu opens downwards and stays inside the viewport",
    );
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
    if (output)
      await page.screenshot({
        path: `${output}/team-chat-header-${viewport.width}.png`,
        animations: "disabled",
      });
    await closeChatMenu(frame);
    await selectSection(frame, "Задачи");
    assert.equal(await section.inputValue(), "tasks");
    await selectSection(frame, "Сообщения");
    assert.equal(await section.inputValue(), "messages");
  }
  await page.setViewportSize(originalViewport);
}
