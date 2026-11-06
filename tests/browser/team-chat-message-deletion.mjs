import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { selectSection } from "./team-chat-navigation.mjs";
export async function verifyMessageDeletion({
  page,
  phone,
  chat,
  mobile,
  context,
  origin,
  category,
  output,
}) {
  await selectSection(chat, "Чат");
  await selectSection(mobile, "Чат");
  const messageMenu = (targetPage) =>
    targetPage.getByRole("dialog", { name: "Сообщение", exact: true });
  async function hold(targetPage, target) {
    await targetPage.bringToFront();
    await target.scrollIntoViewIfNeeded();
    const b = await target.boundingBox();
    await targetPage.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await targetPage.mouse.down();
    await messageMenu(targetPage).waitFor();
    await targetPage.mouse.up();
    return messageMenu(targetPage);
  }
  async function remove(targetPage) {
    await messageMenu(targetPage)
      .getByRole("button", { name: "Удалить", exact: true })
      .click();
    await targetPage
      .getByRole("dialog", { name: "Удалить сообщение?", exact: true })
      .getByRole("button", { name: "Удалить для всех", exact: true })
      .click();
  }
  const downloaded = [];
  const onDownload = (d) => downloaded.push(d);
  phone.on("download", onDownload);
  const file = mobile.getByRole("button", {
    name: "invoice-ui.pdf",
    exact: true,
  });
  await hold(phone, file);
  await messageMenu(phone)
    .getByRole("button", { name: "Удалить", exact: true })
    .waitFor();
  await messageMenu(phone)
    .getByRole("button", { name: "Закрыть меню сообщения", exact: true })
    .click();
  assert.equal(
    downloaded.length,
    0,
    "Holding a file must open actions rather than download it",
  );
  phone.off("download", onDownload);
  const contractors = await (
    await context.request.get(origin + "/api/team-chat/contractors")
  ).json();
  const supplier = contractors.contractors[0];
  assert.ok(supplier);
  const ids = [];
  async function create(client, title) {
    const response = await client.post(origin + "/api/team-chat/requests", {
      data: {
        id: randomUUID(),
        title,
        amount: "25",
        dueDate: "2030-01-15",
        contractorId: supplier._id,
        categoryId: category,
      },
    });
    assert.equal(response.status(), 201, await response.text());
    const data = await response.json();
    ids.push(data);
    return data;
  }
  try {
    const active = await create(
      context.request,
      "Активная карточка для проверки удержания",
    );
    const activeBubble = chat.locator(
      `[data-message-id="${active.message._id}"] .team-bubble`,
    );
    const head = activeBubble.locator(".request-card-head");
    await head.waitFor();
    await hold(page, head);
    assert.equal(
      await head.getAttribute("aria-expanded"),
      "false",
      "Holding a request button must not toggle it",
    );
    await messageMenu(page)
      .getByRole("button", { name: "Закрыть меню сообщения", exact: true })
      .click();
    // A short click still opens the original request card.
    await head.click();
    assert.equal(await head.getAttribute("aria-expanded"), "true");
    await head.click();
    const staffBubble = mobile.locator(
      `[data-message-id="${active.message._id}"] .team-bubble`,
    );
    await hold(phone, staffBubble.locator(".request-card-head"));
    assert.equal(
      await messageMenu(phone)
        .getByRole("button", { name: "Удалить", exact: true })
        .count(),
      0,
      "An employee cannot delete another author's message",
    );
    await messageMenu(phone)
      .getByRole("button", { name: "Закрыть меню сообщения", exact: true })
      .click();
    await hold(page, head);
    await remove(page);
    await activeBubble.waitFor({ state: "hidden" });
    assert.equal(
      (
        await context.request.get(
          origin + `/api/team-chat/requests/${active.request._id}`,
        )
      ).status(),
      200,
      "Removing the chat card does not delete the request itself",
    );
    const deleted = await create(
      phone.context().request,
      "Удалённая заявка для проверки удержания",
    );
    const identity = await (
      await phone.context().request.get(origin + "/api/team-chat/me")
    ).json();
    assert.equal(deleted.message.authorId, identity.actorId);
    const erased = await context.request.delete(
      origin + `/api/team-chat/requests/${deleted.request._id}`,
      { data: { expectedVersion: deleted.request.version } },
    );
    assert.equal(erased.status(), 200, await erased.text());
    const tombstone = mobile.locator(
      `[data-message-id="${deleted.message._id}"] .team-bubble`,
    );
    const placeholder = tombstone.getByText("Заявка удалена", { exact: true });
    await placeholder.waitFor();
    await phone.bringToFront();
    await placeholder.scrollIntoViewIfNeeded();
    const touch = await phone.context().newCDPSession(phone);
    await touch.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    const b = await placeholder.boundingBox();
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }],
    });
    await messageMenu(phone).waitFor();
    assert.equal(
      await messageMenu(phone).getAttribute("data-message-id"),
      deleted.message._id,
      "Touch hold targets the deleted request message",
    );
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal(
      await messageMenu(phone).isVisible(),
      true,
      "Releasing a held touch must not click a menu action",
    );
    await messageMenu(phone)
      .getByRole("button", { name: "Удалить", exact: true })
      .waitFor();
    await phone.screenshot({
      path: `${output}/team-chat-deleted-request-menu.png`,
      animations: "disabled",
    });
    await messageMenu(phone)
      .getByRole("button", { name: "Закрыть меню сообщения", exact: true })
      .click();
    await touch.detach();
    const ownerPlaceholder = chat
      .locator(`[data-message-id="${deleted.message._id}"] .team-bubble`)
      .getByText("Заявка удалена", { exact: true });
    await ownerPlaceholder.waitFor();
    await hold(page, ownerPlaceholder);
    await remove(page);
    await tombstone.waitFor({ state: "hidden" });
    await ownerPlaceholder.waitFor({ state: "hidden" });
    await phone.reload({ waitUntil: "domcontentloaded" });
    await mobile.waitFor();
    assert.equal(
      await mobile
        .locator(`[data-message-id="${deleted.message._id}"]`)
        .count(),
      0,
      "Deleted placeholders do not return after reload",
    );
    console.log(
      "PASS: native touch hold on deleted request placeholders, active request and file actions, short taps preserved, deletion permissions and chat-only card removal",
    );
  } finally {
    for (const { request, message } of ids) {
      await context.request.delete(
        origin + `/api/team-chat/messages/${message._id}`,
      );
      const fresh = await context.request.get(
        origin + `/api/team-chat/requests/${request._id}`,
      );
      if (fresh.status() === 200)
        await context.request.delete(
          origin + `/api/team-chat/requests/${request._id}`,
          { data: { expectedVersion: (await fresh.json()).request.version } },
        );
    }
  }
}
