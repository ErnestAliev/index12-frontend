import {
  selectSection,
  hasSection,
  closeChatMenu,
} from "./team-chat-navigation.mjs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import process from "node:process";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
export async function verifyTeamChat({
  origin,
  cookie,
  token,
  category,
  subcategory,
  project,
}) {
  const root = fileURLToPath(new URL("../../", import.meta.url)),
    output = root + "output/playwright";
  const server = await createServer({
    root,
    envDir: "/private/tmp",
    cacheDir: "/private/tmp/index12-team-vite-cache",
    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(origin + "/api"),
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/team-manifest": {
          target: origin,
          rewrite: (path) =>
            path.replace("/team-manifest", "/api/team-chat/manifest"),
        },
      },
    },
  });
  let browser, page;
  try {
    await server.listen();
    await mkdir(output, { recursive: true });
    browser = await chromium.launch({
      executablePath:
        process.env.SCROLL_TEST_CHROME ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    });
    await context.addCookies([
      { name: "connect.sid", value: cookie, url: origin },
    ]);
    await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) =>
      r.abort(),
    );
    page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/", {
      waitUntil: "domcontentloaded",
    });
    const launcher = page.getByRole("button", {
      name: "Открыть чат сотрудников",
      exact: true,
    });
    await launcher.waitFor();
    const pos = await launcher.boundingBox();
    assert.ok(
      pos.x < 60 && pos.y > 800,
      "Chat launcher is below the graph at bottom left",
    );
    await launcher.click();
    const chat = page.getByRole("dialog", {
      name: "Чат Сотрудники",
      exact: true,
    });
    await chat.waitFor();
    await chat
      .getByLabel("Сообщение сотрудникам", { exact: true })
      .fill("Browser message");
    await chat.getByRole("button", { name: "Отправить", exact: true }).click();
    await chat.getByText("Browser message", { exact: true }).waitFor();
    for (const theme of ["dark", "light"]) {
      await page.evaluate(
        (t) => document.documentElement.setAttribute("data-theme", t),
        theme,
      );
      const centers = await chat
        .locator("button:has(svg)")
        .evaluateAll((btns) =>
          btns
            .filter((b) => b.getClientRects().length)
            .map((b) => {
              const r = b.getBoundingClientRect(),
                s = b.querySelector("svg").getBoundingClientRect();
              return Math.abs(r.y + r.height / 2 - s.y - s.height / 2);
            }),
        );
      assert.ok(centers.every((x) => x < 2));
      await page.screenshot({
        path: `${output}/team-chat-desktop-${theme}.png`,
        animations: "disabled",
      });
    }
    await selectSection(chat, "Участники");
    await chat
      .getByRole("button", { name: "Пригласить по ссылке", exact: true })
      .click();
    const inviteField = chat.getByLabel("Ссылка приглашения в чат", {
      exact: true,
    });
    await inviteField.waitFor();
    const generated = await inviteField.inputValue();
    await chat
      .getByRole("button", { name: "Закрыть приглашение", exact: true })
      .click();
    assert.ok(generated.includes("/team/"));
    token = generated.split("/").at(-1);
    for (const role of ["director", "employee", "manager"]) {
      const saved = page.waitForResponse(
        (r) =>
          r.url().endsWith("/team-chat/settings") &&
          r.request().method() === "PATCH" &&
          r.status() === 200,
      );
      await chat
        .getByLabel("Моя роль в чате", { exact: true })
        .selectOption(role);
      await saved;
      await page.waitForFunction(
        (role) =>
          document.querySelector('[aria-label="Моя роль в чате"]')?.value ===
            role &&
          !document.querySelector('[aria-label="Моя роль в чате"]').disabled,
        role,
      );
      assert.equal(await hasSection(chat, "Участники"), 1);
      await closeChatMenu(chat);
      assert.equal(
        await chat
          .getByRole("button", { name: "Пригласить по ссылке", exact: true })
          .isEnabled(),
        true,
      );
    }
    for (const theme of ["dark", "light"]) {
      await page.evaluate(
        (t) => document.documentElement.setAttribute("data-theme", t),
        theme,
      );
      await chat.screenshot({
        path: `${output}/team-chat-members-panel-${theme}.png`,
        animations: "disabled",
      });
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await launcher.waitFor();
    await launcher.click();
    await selectSection(chat, "Участники");
    assert.equal(
      await chat.getByLabel("Моя роль в чате", { exact: true }).inputValue(),
      "manager",
    );
    await closeChatMenu(chat);
    await selectSection(chat, "Сообщения");
    // A fresh invitee registers from a different browser context, with no INDEX12 access.
    const employee = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await employee.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) =>
      r.abort(),
    );
    const phone = await employee.newPage();
    phone.on("pageerror", (e) => errors.push(e.message));
    // Read the original server response, not the DOM after JS has swapped links.
    // The former implementation passed start_url checks but exposed the root
    // INDEX12 manifest to the installer while it was parsing the page.
    const initial = await employee.request.get(
      "http://127.0.0.1:5173/team/" + token,
    );
    const initialHtml = await initial.text();
    assert.match(initialHtml, new RegExp(`href="/team-manifest/${token}"`));
    assert.doesNotMatch(initialHtml, /href="\/manifest\.webmanifest"/);
    const manifestsRequested = [];
    phone.on("request", (request) => {
      if (/manifest/.test(new URL(request.url()).pathname))
        manifestsRequested.push(new URL(request.url()).pathname);
    });
    await phone.goto("http://127.0.0.1:5173/team/" + token, {
      waitUntil: "domcontentloaded",
    });
    const setupDialog = phone.getByRole("dialog", {
      name: "Chat",
      exact: true,
    });
    await setupDialog.waitFor();
    await phone.evaluate(() => {
      const event = new Event("beforeinstallprompt");
      event.prompt = async () => {
        window.installPromptCount = (window.installPromptCount || 0) + 1;
      };
      event.userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(event);
    });
    await setupDialog
      .getByRole("button", { name: "Установить Chat", exact: true })
      .click();
    assert.equal(await phone.evaluate(() => window.installPromptCount), 1);
    await phone.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await setupDialog
      .getByText("Chat добавлен на главный экран", { exact: true })
      .waitFor();
    await phone.screenshot({ path: `${output}/team-chat-install.png` });
    await setupDialog
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    await phone
      .getByText("Приглашает Calendar owner", { exact: false })
      .waitFor();
    await phone.getByLabel("Имя", { exact: true }).fill("Browser employee");
    await phone
      .getByLabel("Номер телефона", { exact: true })
      .fill("7010000003");
    assert.equal(
      await phone.getByLabel("Номер телефона", { exact: true }).inputValue(),
      "701 000 00 03",
    );
    await phone
      .getByLabel("Пароль", { exact: true })
      .fill("browser-test-passphrase");
    await phone
      .getByRole("button", { name: "Запросить доступ", exact: true })
      .click();
    await phone
      .getByText("Ожидается одобрение владельца", { exact: true })
      .waitFor();
    await setupDialog
      .getByRole("button", { name: "Закрыть настройку чата", exact: true })
      .click();
    const approval = page.getByRole("dialog", {
      name: "Запрос на добавление в чат",
      exact: true,
    });
    await approval.waitFor();
    await approval.getByText("Browser employee", { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/team-chat-approval.png` });
    await approval
      .getByRole("button", { name: "Одобрить", exact: true })
      .click();
    // Focus recovers a member approved while their phone was asleep.
    await phone.evaluate(() => window.dispatchEvent(new Event("focus")));
    const mobile = phone.getByRole("dialog", {
      name: "Чат Сотрудники",
      exact: true,
    });
    await mobile.waitFor();
    const box = await mobile.boundingBox();
    assert.equal(Math.round(box.width), 390);
    assert.equal(Math.round(box.height), 844);
    let releaseMessage;
    await employee.route("**/team-chat/messages", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((resolve) => (releaseMessage = resolve));
      await route.continue();
    });
    await mobile
      .getByLabel("Сообщение сотрудникам", { exact: true })
      .fill("Mobile employee online");
    await mobile
      .getByRole("button", { name: "Отправить", exact: true })
      .click();
    assert.equal(
      await mobile
        .getByLabel("Сообщение сотрудникам", { exact: true })
        .inputValue(),
      "",
    );
    await mobile.getByText("Mobile employee online", { exact: true }).waitFor();
    await mobile
      .locator(".team-delivery")
      .getByText("Отправляется…", { exact: true })
      .waitFor();
    await mobile
      .getByLabel("Сообщение сотрудникам", { exact: true })
      .fill("Следующий черновик");
    assert.equal(
      await mobile
        .getByRole("button", { name: "Отправить", exact: true })
        .isEnabled(),
      true,
    );
    for (let i = 0; i < 50 && !releaseMessage; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(releaseMessage);
    releaseMessage();
    await employee.unroute("**/team-chat/messages");
    await chat.getByText("Mobile employee online", { exact: true }).waitFor();
    assert.equal(await hasSection(mobile, "Заявки"), 1);
    assert.equal(await hasSection(mobile, "Участники"), 0);
    assert.equal(
      await mobile
        .getByRole("button", { name: "Закрыть чат Сотрудники", exact: true })
        .count(),
      1,
    );
    const manifestUrl = await phone
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    const manifestResponse = await employee.request.get(
      new URL(manifestUrl, phone.url()).href,
    );
    const manifestData = await manifestResponse.json();
    assert.equal(manifestData.start_url, "/team/" + token);
    assert.equal(manifestData.name, "Chat");
    assert.equal(manifestData.short_name, "Chat");
    assert.equal(manifestData.icons[0].src, "/chat-192.png");
    const session = await employee.newCDPSession(phone);
    const discovered = await session.send("Page.getAppManifest");
    assert.equal(discovered.url, new URL(manifestUrl, phone.url()).href);
    assert.equal(JSON.parse(discovered.data).start_url, "/team/" + token);
    assert.ok(!manifestsRequested.includes("/manifest.webmanifest"));
    await session.detach();
    // iOS may create an isolated app storage context. Even without cookies or
    // localStorage, the captured launch URL must still open this chat's login.
    const isolated = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await isolated.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { get: () => true });
    });
    const isolatedPage = await isolated.newPage();
    await isolatedPage.goto(
      new URL(JSON.parse(discovered.data).start_url, phone.url()).href,
    );
    await isolatedPage.getByLabel("Номер телефона", { exact: true }).waitFor();
    assert.equal(new URL(isolatedPage.url()).pathname, "/team/" + token);
    assert.equal(await isolatedPage.title(), "Chat");
    assert.equal(
      await isolatedPage
        .getByRole("heading", { name: "Chat", exact: true })
        .count(),
      1,
    );
    await isolated.close();
    assert.equal(
      await mobile
        .getByLabel("Сообщение сотрудникам", { exact: true })
        .inputValue(),
      "Следующий черновик",
    );
    const persisted = await employee.storageState();
    const persistentCookie = persisted.cookies.find(
      (c) => c.name === "index12_team",
    );
    assert.ok(
      persistentCookie &&
        persistentCookie.httpOnly &&
        persistentCookie.expires > Date.now() / 1000 + 300 * 86400,
    );
    const reopenedDevice = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: persisted,
    });
    const resumedPage = await reopenedDevice.newPage();
    await resumedPage.goto("http://127.0.0.1:5173" + manifestData.start_url, {
      waitUntil: "domcontentloaded",
    });
    await resumedPage
      .getByRole("dialog", { name: "Чат Сотрудники", exact: true })
      .waitFor();
    assert.equal(
      await resumedPage
        .getByRole("button", { name: "Войти", exact: true })
        .count(),
      0,
    );
    await reopenedDevice.close();
    await phone.reload();
    await mobile.waitFor();
    await phone.keyboard.press("Escape");
    await phone.reload();
    await mobile.waitFor();
    assert.equal(await hasSection(mobile, "Заявки"), 1);
    const { verifyReplies } = await import("./team-chat-replies.mjs");
    await verifyReplies({ page, phone, chat, mobile, context, origin, output });
    async function holdMessage(targetPage, bubble) {
      await targetPage.bringToFront();
      await bubble.locator(".team-delivery").waitFor({ state: "hidden" });
      await bubble.scrollIntoViewIfNeeded();
      const box = await bubble.boundingBox();
      await targetPage.mouse.move(
        box.x + box.width / 2,
        box.y + Math.min(30, box.height / 2),
      );
      await targetPage.mouse.down();
      const menu = targetPage.getByRole("dialog", {
        name: "Сообщение",
        exact: true,
      });
      await menu.waitFor();
      await targetPage.mouse.up();
      return menu;
    }
    assert.equal(await mobile.locator(".team-message-actions").count(), 0);
    const originalMobile = () =>
      mobile
        .locator(".team-message")
        .filter({ hasNot: phone.locator(".team-forwarded") })
        .filter({ hasText: "Mobile employee online" })
        .locator(".team-bubble");
    let menu = await holdMessage(phone, originalMobile());
    assert.equal(
      await menu.getByRole("button", { name: /Согласовать/ }).count(),
      0,
    );
    for (const theme of ["dark", "light"]) {
      await phone.evaluate(
        (t) => document.documentElement.setAttribute("data-theme", t),
        theme,
      );
      await phone.screenshot({
        path: `${output}/team-message-menu-${theme}.png`,
      });
    }
    await menu.getByRole("button", { name: "Реакция 👍", exact: true }).click();
    await originalMobile()
      .getByRole("button", { name: "Реакция 👍: 1", exact: true })
      .waitFor();
    const ownerBubble = () =>
      chat
        .locator(".team-message")
        .filter({ hasNot: page.locator(".team-forwarded") })
        .filter({ hasText: "Mobile employee online" })
        .locator(".team-bubble");
    menu = await holdMessage(page, ownerBubble());
    assert.equal(
      await menu
        .getByRole("button", { name: "Редактировать", exact: true })
        .count(),
      0,
    );
    await menu
      .getByRole("button", { name: "Согласовать → руководителю", exact: true })
      .click();
    await ownerBubble()
      .getByText("Согласовано Управляющим (Calendar owner)", { exact: true })
      .waitFor();
    const directorContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      directorPhone = await directorContext.newPage();
    directorPhone.on("pageerror", (e) => errors.push(e.message));
    await directorPhone.goto("http://127.0.0.1:5173/team/" + token, {
      waitUntil: "domcontentloaded",
    });
    await directorPhone
      .getByRole("dialog", { name: "Chat", exact: true })
      .getByRole("button", { name: "Позже", exact: true })
      .click();
    await directorPhone
      .getByRole("button", { name: "Уже зарегистрирован", exact: true })
      .click();
    await directorPhone
      .getByLabel("Номер телефона", { exact: true })
      .fill("+77010000002");
    await directorPhone
      .getByLabel("Пароль", { exact: true })
      .fill("test-passphrase-2026");
    await directorPhone
      .getByRole("button", { name: "Войти", exact: true })
      .click();
    const directorChat = directorPhone.getByRole("dialog", {
      name: "Чат Сотрудники",
      exact: true,
    });
    await directorChat.waitFor();
    await directorPhone
      .getByRole("dialog", { name: "Chat", exact: true })
      .getByRole("button", { name: "Позже", exact: true })
      .click();
    assert.equal(await hasSection(directorChat, "Участники"), 0);
    const directorBubble = directorChat
      .locator(".team-message")
      .filter({ hasText: "Mobile employee online" })
      .locator(".team-bubble");
    menu = await holdMessage(directorPhone, directorBubble);
    await menu
      .getByRole("button", {
        name: "Согласовать как руководитель",
        exact: true,
      })
      .click();
    await directorBubble
      .getByText("Согласовано Директором (Director)", { exact: true })
      .waitFor();
    menu = await holdMessage(directorPhone, directorBubble);
    await menu
      .getByRole("button", { name: "История согласования", exact: true })
      .click();
    const approvalHistory = directorPhone.getByRole("dialog", {
      name: "Согласование",
      exact: true,
    });
    assert.equal(
      await approvalHistory.locator(".message-approval-history li").count(),
      2,
    );
    await approvalHistory
      .getByRole("button", { name: "Закрыть меню сообщения", exact: true })
      .click();
    await directorContext.close();
    await phone.bringToFront();
    await phone.evaluate(() => window.dispatchEvent(new Event("focus")));
    await originalMobile()
      .getByText("Согласовано Директором (Director)", { exact: true })
      .waitFor();
    menu = await holdMessage(phone, originalMobile());
    await menu
      .getByRole("button", { name: "Редактировать", exact: true })
      .click();
    const editMessage = phone.getByRole("dialog", {
      name: "Редактировать",
      exact: true,
    });
    await editMessage
      .getByLabel("Текст сообщения", { exact: true })
      .fill("Mobile employee online — edited");
    await editMessage
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await originalMobile()
      .getByText("Mobile employee online — edited", { exact: true })
      .waitFor();
    assert.equal(
      await originalMobile()
        .getByText("Согласовано Директором (Director)", { exact: true })
        .count(),
      0,
    );
    menu = await holdMessage(phone, originalMobile());
    await menu.getByRole("button", { name: "Переслать", exact: true }).click();
    await phone
      .getByRole("dialog", { name: "Переслать", exact: true })
      .getByRole("button", { name: "Calendar", exact: true })
      .click();
    const forwardedBubble = mobile
      .locator(".team-message")
      .filter({ has: phone.locator(".team-forwarded") })
      .filter({ hasText: "Mobile employee online — edited" })
      .locator(".team-bubble");
    await forwardedBubble.waitFor();
    menu = await holdMessage(phone, forwardedBubble);
    await menu.getByRole("button", { name: "Удалить", exact: true }).click();
    await phone
      .getByRole("dialog", { name: "Удалить сообщение?", exact: true })
      .getByRole("button", { name: "Удалить для всех", exact: true })
      .click();
    await forwardedBubble.waitFor({ state: "hidden" });
    const mentionText = mobile.getByLabel("Сообщение сотрудникам", {
      exact: true,
    });
    await mentionText.fill("@Cal");
    const mentionList = mobile.getByRole("listbox", {
      name: "Отметить сотрудника",
      exact: true,
    });
    await mentionList.getByRole("option", { name: /Calendar owner/ }).click();
    assert.equal(await mentionText.inputValue(), "@Calendar owner ");
    const mentionedSend = phone.waitForResponse(
      (r) =>
        r.url().endsWith("/team-chat/messages") &&
        r.request().method() === "POST",
    );
    await mobile
      .getByRole("button", { name: "Отправить", exact: true })
      .click();
    const mentionedMessage = (await (await mentionedSend).json()).message;
    assert.equal(mentionedMessage.mentions[0].name, "Calendar owner");
    await phone.screenshot({ path: `${output}/team-chat-phone.png` });
    await mobile.locator(".team-compose-area input[type=file]").setInputFiles({
      name: "invoice-ui.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\ncontrolled UI fixture"),
    });
    await mobile
      .getByRole("button", { name: "Отправить", exact: true })
      .click();
    await mobile.getByText("Это счёт на оплату?", { exact: true }).waitFor();
    await mobile
      .getByRole("button", { name: "Не обрабатывать", exact: true })
      .click();
    await mobile
      .getByText("Это счёт на оплату?", { exact: true })
      .waitFor({ state: "hidden" });
    const { verifyMessageDeletion } = await import(
      "./team-chat-message-deletion.mjs"
    );
    await verifyMessageDeletion({
      page,
      phone,
      chat,
      mobile,
      context,
      origin,
      category,
      output,
    });
    await selectSection(mobile, "Заявки");
    assert.equal(await mobile.locator(".request-card").count(), 0);
    const createOnly = mobile.getByRole("button", {
      name: "Создать заявку",
      exact: true,
    });
    const createPosition = await createOnly.boundingBox();
    assert.ok(
      createPosition.y > 700 &&
        Math.abs(createPosition.x + createPosition.width / 2 - 195) < 2,
    );
    await selectSection(mobile, "Сообщения");
    const addButton = mobile.getByRole("button", {
      name: "Добавить в чат",
      exact: true,
    });
    await addButton.click();
    assert.equal(await mobile.getByRole("menuitem").count(), 2);
    await phone.screenshot({
      path: `${output}/team-chat-add-menu.png`,
      animations: "disabled",
    });
    await mobile
      .getByRole("menuitem", { name: "Создать заявку", exact: true })
      .click();
    const requestForm = phone.getByRole("dialog", {
      name: "Заявка на расход",
      exact: true,
    });
    await requestForm.waitFor();
    await requestForm.getByLabel("Сумма, ₸", { exact: true }).fill("12500.50");
    assert.equal(
      await requestForm.getByLabel("Сумма, ₸", { exact: true }).inputValue(),
      "12 500.50",
    );
    await requestForm
      .getByRole("combobox", { name: "Контрагент", exact: true })
      .fill("ламп");
    await requestForm
      .getByRole("button", { name: "Поставщик лампочек", exact: true })
      .click();
    await requestForm
      .getByLabel("Проект", { exact: true })
      .selectOption(project);
    await requestForm
      .getByLabel("Категория", { exact: true })
      .selectOption(category);
    await requestForm
      .getByLabel("Подкатегория", { exact: true })
      .selectOption(subcategory);
    assert.equal(
      await requestForm
        .getByLabel("Что оплатить / купить", { exact: true })
        .inputValue(),
      "",
    );
    assert.equal(
      await requestForm.getByLabel("Компания", { exact: true }).count(),
      0,
    );
    const fieldOrder = await requestForm
      .locator("input:not([hidden]),select,textarea")
      .evaluateAll((fields) => fields.map((f) => f.getAttribute("aria-label")));
    assert.ok(
      fieldOrder.indexOf("Сумма, ₸") < fieldOrder.indexOf("Контрагент"),
    );
    assert.ok(fieldOrder.indexOf("Проект") < fieldOrder.indexOf("Категория"));
    assert.equal(fieldOrder.at(-1), "Дата оплаты");
    await phone.screenshot({
      path: `${output}/team-chat-request-form.png`,
      animations: "disabled",
    });
    await phone.evaluate(() => {
      Object.defineProperty(window.visualViewport, "height", {
        configurable: true,
        value: 360,
      });
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await requestForm
      .getByLabel("Комментарий к заявке", { exact: true })
      .fill("Уборка после ремонта");
    await requestForm
      .getByRole("button", { name: "Отправить на согласование", exact: true })
      .scrollIntoViewIfNeeded();
    for (const width of [390, 320])
      for (const theme of ["dark", "light"]) {
        await phone.setViewportSize({ width, height: 844 });
        await phone.evaluate(
          (t) => document.documentElement.setAttribute("data-theme", t),
          theme,
        );
        await phone.waitForFunction(() => {
          const r = document
            .querySelector('dialog[aria-label="Заявка на расход"]')
            .getBoundingClientRect();
          return (
            r.y >= 0 &&
            r.bottom <= 360.5 &&
            r.x >= 0 &&
            r.right <= window.innerWidth + 0.5
          );
        });
        const box = await requestForm.boundingBox(),
          sendBox = await requestForm
            .getByRole("button", {
              name: "Отправить на согласование",
              exact: true,
            })
            .boundingBox();
        assert.ok(
          box.y >= 0 &&
            box.y + box.height <= 360 &&
            box.x >= 0 &&
            box.x + box.width <= width,
        );
        assert.ok(
          sendBox.y >= 0 && sendBox.y + sendBox.height <= 360,
          "Submit remains reachable above the keyboard",
        );
        assert.ok(
          await requestForm
            .getByLabel("Сумма, ₸", { exact: true })
            .evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 16),
        );
        await phone.screenshot({
          path: `${output}/team-chat-mobile-keyboard-${width}-${theme}.png`,
          animations: "disabled",
        });
      }
    await phone.setViewportSize({ width: 390, height: 844 });
    await requestForm
      .getByRole("button", { name: "Отправить на согласование", exact: true })
      .click();
    await requestForm.waitFor({ state: "hidden" });
    await selectSection(mobile, "Задачи");
    await mobile.getByText("Обслуживание", { exact: true }).waitFor();
    await phone.evaluate(() => {
      delete window.visualViewport.height;
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    const compactCard = mobile
      .locator(".request-card")
      .filter({ hasText: "Обслуживание" });
    assert.equal(await compactCard.locator(".request-branch").count(), 0);
    assert.equal(
      await compactCard.getByText("Автор", { exact: true }).count(),
      0,
    );
    if (
      (await compactCard
        .locator(".request-card-head")
        .getAttribute("aria-expanded")) !== "true"
    )
      await compactCard.locator(".request-card-head").click();
    assert.equal(
      await compactCard
        .getByRole("button", { name: "Удалить заявку", exact: true })
        .innerText(),
      "",
    );
    await compactCard
      .getByRole("button", { name: "Реквизиты и история заявки", exact: true })
      .click();
    await compactCard.getByText("Автор", { exact: true }).waitFor();
    await compactCard
      .getByRole("button", { name: "Реквизиты и история заявки", exact: true })
      .click();
    await phone.screenshot({ path: `${output}/team-chat-request-mobile.png` });
    await selectSection(chat, "Задачи");
    const requestCard = chat
      .locator(".request-card")
      .filter({ hasText: "Обслуживание" });
    await requestCard.waitFor();
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Almaty",
    }).format(new Date());
    const year = date.slice(0, 4),
      doy =
        Math.round(
          (Date.parse(date) - Date.parse(year + "-01-01")) / 86400000,
        ) + 1;
    const target = page.locator(
      `.hour-cell[data-date-key="${year}-${doy}"][data-cell-index="3"]`,
    );
    await page.bringToFront();
    const sourceBox = await requestCard
      .locator(".request-card-head")
      .boundingBox();
    const targetBox = await target.boundingBox();
    await page.mouse.move(sourceBox.x + 30, sourceBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + 45, sourceBox.y + 10, { steps: 5 });
    await page.waitForFunction(
      () => document.body.dataset.teamRequestDragging === "true",
    );
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
      { steps: 15 },
    );
    await page.mouse.move(
      targetBox.x + targetBox.width / 2 + 2,
      targetBox.y + targetBox.height / 2,
      { steps: 3 },
    );
    await target.locator(":scope.drag-over").waitFor();
    await page.mouse.up();
    const popup = page.locator(".request-draft-popup");
    await popup.waitFor();
    await popup
      .locator(".base-select")
      .filter({ hasText: "Счет списания" })
      .locator(".select-trigger")
      .click();
    await popup
      .locator(".options-list")
      .getByText("Team cash", { exact: true })
      .click();
    await popup
      .locator(".selected-text")
      .filter({ hasText: "Обслуживание" })
      .waitFor();
    await popup
      .locator('[data-testid="subcategory-field"] .select-trigger')
      .click();
    await popup
      .locator(".options-list")
      .getByText("Лампочки", { exact: true })
      .click();
    await popup
      .getByLabel("Комментарий к расходу", { exact: true })
      .fill("Проверено управляющим");
    await page.screenshot({
      path: `${output}/team-request-placement.png`,
      animations: "disabled",
    });
    await popup
      .getByRole("button", { name: "Разместить заявку", exact: true })
      .click();
    await popup.waitFor({ state: "hidden" });
    await page.locator(".operation-chip.team-request-chip").waitFor();
    const refreshed = page.getByRole("dialog", {
      name: "Чат Сотрудники",
      exact: true,
    });
    await refreshed.waitFor();
    const staged = refreshed
      .locator(".request-card")
      .filter({ hasText: "Обслуживание" });
    await staged
      .locator(".request-account-balances")
      .getByText("Team cash / Team company", { exact: true })
      .waitFor();
    const accountNumbers = await staged
      .locator(".request-account-balances dd")
      .allTextContents();
    const amounts = accountNumbers.map((t) =>
      Number(
        t
          .replace("−", "-")
          .replace(/[^0-9,.-]/g, "")
          .replace(",", "."),
      ),
    );
    assert.ok(
      amounts[2] <= amounts[1] && amounts[2] < amounts[0],
      "Today's requests must reduce the account, including the request just placed",
    );
    // Another participant changes the request while this form is open.
    await staged
      .getByRole("button", { name: "Изменить реквизиты", exact: true })
      .click();
    await popup.waitFor();
    const snapshot = await context.request.get(origin + "/api/team-chat/state");
    const pendingRequest = (await snapshot.json()).requests.find(
      (r) => r.title === "Обслуживание",
    );
    const competing = await context.request.post(
      origin + `/api/team-chat/requests/${pendingRequest._id}/placement`,
      {
        data: {
          expectedVersion: pendingRequest.version,
          operation: {
            ...pendingRequest.placement,
            comment: "Обновлено с другого устройства",
          },
        },
      },
    );
    assert.equal(competing.status(), 200);
    await popup
      .getByLabel("Комментарий к расходу", { exact: true })
      .fill("Мой несохранённый комментарий");
    await popup
      .getByRole("button", {
        name: "Согласовано мной → руководителю",
        exact: true,
      })
      .click();
    await popup.getByText(/Другой участник изменил заявку/).waitFor();
    assert.equal(
      await popup
        .getByLabel("Комментарий к расходу", { exact: true })
        .inputValue(),
      "Мой несохранённый комментарий",
    );
    await popup
      .getByRole("button", {
        name: "Загрузить актуальные реквизиты",
        exact: true,
      })
      .click();
    await popup.getByLabel("Комментарий к расходу", { exact: true }).waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Комментарий к расходу"]')
          ?.value === "Обновлено с другого устройства",
    );
    for (const theme of ["dark", "light"]) {
      await page.evaluate(
        (t) => document.documentElement.setAttribute("data-theme", t),
        theme,
      );
      const colors = await popup
        .getByLabel("Комментарий к расходу", { exact: true })
        .evaluate((el) => ({
          color: getComputedStyle(el).color,
          background: getComputedStyle(el).backgroundColor,
        }));
      assert.notEqual(colors.color, colors.background);
      if (theme === "dark") assert.notEqual(colors.color, "rgb(0, 0, 0)");
      await page.screenshot({
        path: `${output}/team-request-editor-${theme}.png`,
      });
    }
    let submissions = 0;
    await context.route(
      `**/team-chat/requests/${pendingRequest._id}/placement`,
      async (route) => {
        submissions++;
        await route.continue();
      },
    );
    let failedIdentity = false;
    await context.route("**/team-chat/me", async (route) => {
      if (!failedIdentity) {
        failedIdentity = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"message":"controlled refresh failure"}',
        });
      } else await route.continue();
    });
    // Two immediate clicks must produce one committed save; an identity-refresh error cannot undo it.
    await popup
      .getByRole("button", {
        name: "Согласовано мной → руководителю",
        exact: true,
      })
      .evaluate((button) => {
        button.click();
        button.click();
      });
    await popup.waitFor({ state: "hidden" });
    await staged
      .getByText("Согласовано Управляющим (Calendar owner)", { exact: true })
      .waitFor();
    await chat
      .getByRole("status")
      .getByText(/Передано руководителю/)
      .waitFor();
    assert.equal(submissions, 1);
    assert.equal(
      failedIdentity,
      false,
      "A successful mutation no longer waits for a redundant identity request",
    );
    await context.unroute("**/team-chat/me");
    await context.unroute(
      `**/team-chat/requests/${pendingRequest._id}/placement`,
    );
    const rejectedTitle = "Проверка отклонения в чате";
    const rejectedResponse = await employee.request.post(
      origin + "/api/team-chat/requests",
      {
        data: {
          id: randomUUID(),
          title: rejectedTitle,
          amount: "3500",
          dueDate: date,
          contractorId: pendingRequest.contractorId,
          categoryId: category,
        },
      },
    );
    assert.equal(rejectedResponse.status(), 201);
    await selectSection(chat, "Задачи");
    const rejectedCard = chat
      .locator(".request-card")
      .filter({ hasText: rejectedTitle });
    await rejectedCard.waitFor();
    await rejectedCard.locator(".request-card-head").click();
    await rejectedCard
      .getByRole("button", { name: "Отклонить", exact: true })
      .click();
    const rejectDialog = page.getByRole("dialog", {
      name: "Причина отклонения",
      exact: true,
    });
    assert.equal(
      await rejectDialog
        .getByRole("button", { name: "Отклонить", exact: true })
        .isDisabled(),
      true,
    );
    await rejectDialog
      .getByLabel("Причина отклонения", { exact: true })
      .fill("Перенести закупку на следующий месяц");
    await rejectDialog
      .getByRole("button", { name: "Отклонить", exact: true })
      .click();
    await rejectDialog.waitFor({ state: "hidden" });
    await selectSection(mobile, "Сообщения");
    const authorRejection = mobile
      .locator(".request-card")
      .filter({ hasText: rejectedTitle });
    await authorRejection
      .getByText("Перенести закупку на следующий месяц", { exact: true })
      .waitFor();
    await authorRejection
      .getByText("Отклонено Управляющим (Calendar owner)", { exact: true })
      .waitFor();
    // The sender can delete their own message; all viewers lose it.
    await selectSection(mobile, "Сообщения");
    menu = await holdMessage(phone, originalMobile());
    await menu.getByRole("button", { name: "Удалить", exact: true }).click();
    await phone
      .getByRole("dialog", { name: "Удалить сообщение?", exact: true })
      .getByRole("button", { name: "Удалить для всех", exact: true })
      .click();
    await selectSection(chat, "Сообщения");
    await chat
      .getByText("Mobile employee online — edited", { exact: true })
      .waitFor({ state: "hidden" });
    await selectSection(chat, "Задачи");
    await staged
      .getByRole("button", { name: "Удалить заявку", exact: true })
      .waitFor();
    await chat
      .getByRole("button", { name: "Закрыть чат Сотрудники", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:5173/mobile", {
      waitUntil: "domcontentloaded",
    });
    await page.locator(".chart-controls-row").waitFor();
    const labels = await page
      .locator(".chart-controls-row>button")
      .evaluateAll((btns) => btns.map((b) => b.getAttribute("aria-label")));
    assert.deepEqual(labels, [
      "Открыть чат Codex",
      "Открыть календарь задач",
      "Открыть чат сотрудников",
      "Выбор месяца",
      "Открыть меню",
      "Виджеты",
    ]);
    await page
      .getByRole("button", { name: "Выбор месяца", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Переключение месяцев", exact: true })
      .waitFor();
    await page.screenshot({
      path: `${output}/team-chat-mobile-navigation.png`,
    });
    const { verifyOnboardingBrowser } = await import(
      "./team-chat-onboarding.mjs"
    );
    await verifyOnboardingBrowser({
      browser,
      base: "http://127.0.0.1:5173",
      origin,
      token,
      output,
    });
    const { verifyAdministrationBrowser } = await import(
      "./team-chat-administration.mjs"
    );
    await verifyAdministrationBrowser({
      context,
      browser,
      base: "http://127.0.0.1:5173",
      origin,
      token,
      employeePage: phone,
      output,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: real UI owner/phone registration/approval, live messages, expense request, bottom-left placement, centered icons, dark/light themes, fullscreen phone and six mobile navigation icons",
    );
  } catch (e) {
    await page
      ?.screenshot({ path: `${output}/team-chat-failure.png` })
      .catch(() => {});
    throw e;
  } finally {
    await browser?.close();
    await server.close();
  }
}
