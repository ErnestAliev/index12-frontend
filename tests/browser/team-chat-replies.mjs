import assert from "node:assert/strict";
import { selectSection } from "./team-chat-navigation.mjs";
export async function verifyReplies({
  page,
  phone,
  chat,
  mobile,
  context,
  origin,
  output,
}) {
  await selectSection(chat, "Сообщения");
  await selectSection(mobile, "Сообщения");
  const sourceText = "Уточните время поставки ламп";
  const sent = page.waitForResponse(
    (r) =>
      r.url().endsWith("/team-chat/messages") &&
      r.request().method() === "POST",
  );
  await chat
    .getByLabel("Сообщение сотрудникам", { exact: true })
    .fill(sourceText);
  await chat.getByRole("button", { name: "Отправить", exact: true }).click();
  const source = (await (await sent).json()).message;
  const sourceBubble = mobile.locator(
    `[data-message-id="${source._id}"] .team-bubble`,
  );
  await phone.bringToFront();
  await sourceBubble.waitFor();
  await sourceBubble.scrollIntoViewIfNeeded();
  let box = await sourceBubble.boundingBox();
  await phone.mouse.move(box.x + 30, box.y + 20);
  await phone.mouse.down();
  const menu = phone.getByRole("dialog", { name: "Сообщение", exact: true });
  await menu.waitFor();
  await phone.mouse.up();
  await menu.getByRole("button", { name: "Ответить", exact: true }).click();
  const draft = mobile.locator(".team-reply-quote.composing"),
    input = mobile.getByLabel("Сообщение сотрудникам", { exact: true });
  await draft.getByText("Calendar owner", { exact: true }).waitFor();
  await input.fill("Сохранить черновик");
  await draft
    .getByRole("button", { name: "Отменить ответ", exact: true })
    .click();
  assert.equal(await input.inputValue(), "Сохранить черновик");
  await input.fill("");
  await input.blur();
  const touch = await phone.context().newCDPSession(phone);
  await touch.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  async function swipe(dx, dy) {
    await sourceBubble.scrollIntoViewIfNeeded();
    box = await sourceBubble.boundingBox();
    const x = box.x + 40,
      y = box.y + 25;
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    for (const fraction of [0.25, 0.5, 1])
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + dx * fraction, y: y + dy * fraction, id: 1 }],
      });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  await swipe(3, -65);
  assert.equal(await draft.count(), 0);
  await swipe(85, 2);
  await draft.waitFor();
  await input.fill("Завтра до обеда");
  const answer = phone.waitForResponse(
    (r) =>
      r.url().endsWith("/team-chat/messages") &&
      r.request().method() === "POST",
  );
  await mobile.getByRole("button", { name: "Отправить", exact: true }).click();
  const reply = (await (await answer).json()).message;
  assert.equal(reply.replyTo.messageId, source._id);
  assert.equal(reply.replyTo.text, sourceText);
  await draft.waitFor({ state: "hidden" });
  const replyBubble = mobile.locator(
    `[data-message-id="${reply._id}"] .team-bubble`,
  );
  await replyBubble.getByText("Завтра до обеда", { exact: true }).waitFor();
  await replyBubble
    .getByRole("button", {
      name: "Показать исходное сообщение Calendar owner",
      exact: true,
    })
    .click();
  await mobile
    .locator(`[data-message-id="${source._id}"].reply-target`)
    .waitFor();
  for (const theme of ["dark", "light"]) {
    await phone.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    await replyBubble.scrollIntoViewIfNeeded();
    await phone.screenshot({
      path: `${output}/team-chat-replies-${theme}.png`,
      animations: "disabled",
    });
  }
  const deleted = await context.request.delete(
    origin + "/api/team-chat/messages/" + source._id,
  );
  assert.equal(deleted.status(), 200);
  await replyBubble.getByText("Сообщение удалено", { exact: true }).waitFor();
  await touch.detach();
  // Mobile navigation replaces tabs; account actions and persisted theme live in the bottom menu.
  assert.equal(await mobile.getByRole("tab").count(), 0);
  assert.equal(
    await mobile.locator(".team-heading-role,.team-heading-exit").count(),
    0,
  );
  const nav = mobile.getByRole("combobox", {
      name: "Раздел чата",
      exact: true,
    }),
    navBox = await nav.boundingBox();
  assert.ok(Math.abs(navBox.x + navBox.width / 2 - 195) < 2);
  await mobile.getByRole("button", { name: "Меню чата", exact: true }).click();
  const account = mobile.getByRole("dialog", {
    name: "Меню чата",
    exact: true,
  });
  await account.getByText("Сотрудник", { exact: true }).waitFor();
  await account
    .getByRole("button", { name: "Уведомления", exact: true })
    .waitFor();
  await account.getByRole("button", { name: "Выйти", exact: true }).waitFor();
  await account
    .getByRole("button", { name: "Тёмная тема", exact: true })
    .click();
  assert.equal(
    await phone.evaluate(() => localStorage.getItem("theme")),
    "dark",
  );
  await mobile.getByRole("button", { name: "Меню чата", exact: true }).click();
  await account
    .getByRole("button", { name: "Светлая тема", exact: true })
    .click();
  await selectSection(mobile, "Задачи");
  assert.equal(await nav.inputValue(), "tasks");
  await selectSection(mobile, "Сообщения");
  console.log(
    "PASS: hold-to-reply, native touch swipe, vertical-scroll preservation, quoted replies and deletion, mobile dropdown and account/theme menu",
  );
}
