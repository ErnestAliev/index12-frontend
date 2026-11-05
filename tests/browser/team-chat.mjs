import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";
export async function verifyTeamChat({
  origin,
  cookie,
  scope,
  token,
  company,
  account,
  contractor,
  category,
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
    await chat.getByRole("tab", { name: /^Участники/ }).click();
    await chat
      .getByRole("button", { name: "Пригласить по ссылке", exact: true })
      .click();
    const generated = await chat
      .getByLabel("Ссылка приглашения в чат", { exact: true })
      .inputValue();
    assert.ok(generated.includes("/team/"));
    token = generated.split("/").at(-1);
    await chat
      .getByLabel("Моя роль в чате", { exact: true })
      .selectOption("director");
    await page.waitForResponse(
      (r) => r.url().includes("/team-chat/me") && r.status() === 200,
    );
    await chat
      .getByLabel("Моя роль в чате", { exact: true })
      .selectOption("manager");
    await page.waitForResponse(
      (r) => r.url().includes("/team-chat/me") && r.status() === 200,
    );
    await chat.getByRole("tab", { name: "Сообщения", exact: true }).click();
    // A fresh invitee registers from a different browser context, with no INDEX12 access.
    const employee = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await employee.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) =>
      r.abort(),
    );
    const phone = await employee.newPage();
    phone.on("pageerror", (e) => errors.push(e.message));
    await phone.goto("http://127.0.0.1:5173/team/" + token, {
      waitUntil: "domcontentloaded",
    });
    await phone
      .getByRole("button", { name: "Зарегистрироваться", exact: true })
      .click();
    await phone.getByLabel("Имя", { exact: true }).fill("Browser employee");
    await phone
      .getByLabel("Номер телефона", { exact: true })
      .fill("+77010000003");
    await phone
      .getByLabel("Пароль", { exact: true })
      .fill("browser-test-passphrase");
    await phone
      .getByRole("button", { name: "Запросить доступ", exact: true })
      .click();
    await phone
      .getByText("Ожидается одобрение владельца", { exact: true })
      .waitFor();
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
    await mobile
      .getByLabel("Сообщение сотрудникам", { exact: true })
      .fill("Mobile employee online");
    await mobile
      .getByRole("button", { name: "Отправить", exact: true })
      .click();
    await chat.getByText("Mobile employee online", { exact: true }).waitFor();
    assert.equal(await mobile.getByRole("tab", { name: /^Заявки/ }).count(), 1);
    assert.equal(
      await mobile.getByRole("tab", { name: /^Участники/ }).count(),
      0,
    );
    assert.equal(
      await mobile
        .getByRole("button", { name: "Закрыть чат Сотрудники", exact: true })
        .count(),
      0,
    );
    const manifestUrl = await phone
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    const manifestResponse = await employee.request.get(
      new URL(manifestUrl, phone.url()).href,
    );
    const manifestData = await manifestResponse.json();
    assert.equal(manifestData.start_url, "/team/" + token);
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
    assert.equal(await mobile.getByRole("tab", { name: /^Заявки/ }).count(), 1);
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
    await mobile.getByRole("tab", { name: /^Заявки/ }).click();
    await mobile
      .getByRole("button", { name: "Заявка на расход", exact: true })
      .click();
    await mobile
      .getByLabel("Что оплатить / купить", { exact: true })
      .fill("обсл");
    await mobile
      .getByRole("option", { name: "Обслуживание", exact: true })
      .click();
    assert.equal(
      await mobile
        .getByLabel("Что оплатить / купить", { exact: true })
        .inputValue(),
      "Обслуживание",
    );
    // Emulate the visible area above an on-screen keyboard, without clearing any entered values.
    await phone.evaluate(() => {
      Object.defineProperty(window.visualViewport, "height", {
        configurable: true,
        value: 360,
      });
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await phone.waitForFunction(
      () =>
        Math.round(
          document.querySelector("#team-chat-public").getBoundingClientRect()
            .height,
        ) === 360,
    );
    const headerGeometry = await mobile.evaluate((el) => ({
      header: el.querySelector(".codex-window-header").getBoundingClientRect()
        .height,
      tabs: el.querySelector(".team-tabs").getBoundingClientRect().bottom,
      duplicateIdentity: !!el.querySelector(".team-identity"),
    }));
    assert.ok(
      headerGeometry.header <= 48 &&
        headerGeometry.tabs <= 100 &&
        !headerGeometry.duplicateIdentity,
    );
    const tabPositions = await mobile.getByRole("tab").evaluateAll((tabs) =>
      tabs.map((t) => ({
        x: t.getBoundingClientRect().x,
        right: t.getBoundingClientRect().right,
      })),
    );
    assert.ok(
      tabPositions[1].x - tabPositions[0].right < 12,
      "Tabs stay together at the left",
    );
    await mobile.getByLabel("Сумма, ₸", { exact: true }).fill("12500.50");
    assert.equal(
      await mobile.getByLabel("Сумма, ₸", { exact: true }).inputValue(),
      "12 500.50",
    );
    assert.equal(
      await mobile.getByLabel("Компания", { exact: true }).count(),
      0,
    );
    await mobile
      .getByRole("combobox", { name: "Контрагент", exact: true })
      .fill("ламп");
    await mobile
      .getByRole("button", { name: "Поставщик лампочек", exact: true })
      .click();
    await mobile
      .getByLabel("Комментарий к заявке", { exact: true })
      .fill("Уборка после ремонта");
    await phone.waitForFunction(() => {
      const field = document.querySelector(
          '[aria-label="Комментарий к заявке"]',
        ),
        area = document.querySelector("#team-chat-public .team-scroll");
      return (
        field &&
        area &&
        field.getBoundingClientRect().bottom <=
          area.getBoundingClientRect().bottom &&
        field.getBoundingClientRect().top >= area.getBoundingClientRect().top
      );
    });
    const keyboardSend = await mobile
      .getByRole("button", { name: "Отправить на согласование", exact: true })
      .boundingBox();
    assert.ok(
      keyboardSend.y + keyboardSend.height <= 360 &&
        keyboardSend.y > headerGeometry.tabs,
      "The submit action stays above the keyboard",
    );
    for (const theme of ["dark", "light"]) {
      await phone.evaluate(
        (t) => document.documentElement.setAttribute("data-theme", t),
        theme,
      );
      const selectedTab = await mobile
        .getByRole("tab", { name: /^Заявки/ })
        .evaluate((el) => ({
          text: getComputedStyle(el).color,
          bg: getComputedStyle(el).backgroundColor,
        }));
      assert.notEqual(selectedTab.text, selectedTab.bg);
      if (theme === "light") assert.notEqual(selectedTab.bg, "rgb(26, 26, 26)");
      await phone.screenshot({
        path: `${output}/team-chat-mobile-keyboard-${theme}.png`,
      });
    }
    assert.equal(
      await mobile
        .getByLabel("Сумма, ₸", { exact: true })
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16),
      true,
    );
    const dateBox = await mobile.locator(".team-payment-date").boundingBox(),
      amountBox = await mobile.locator(".team-amount-field").boundingBox();
    assert.ok(
      Math.abs(dateBox.height - amountBox.height) < 1 &&
        Math.abs(dateBox.y - amountBox.y) < 1,
    );
    await phone.setViewportSize({ width: 320, height: 568 });
    await mobile.getByLabel("Комментарий к заявке", { exact: true }).focus();
    await mobile
      .getByRole("button", { name: "Отправить на согласование", exact: true })
      .scrollIntoViewIfNeeded();
    const sendBox = await mobile
      .getByRole("button", { name: "Отправить на согласование", exact: true })
      .boundingBox();
    assert.ok(
      sendBox.y >= 0 && sendBox.y + sendBox.height <= 360,
      "Submission is reachable above the keyboard on a narrow phone",
    );
    await phone.setViewportSize({ width: 390, height: 844 });
    await mobile
      .getByRole("button", { name: "Отправить на согласование", exact: true })
      .click();
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
    await chat.getByRole("tab", { name: /^Заявки/ }).click();
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
      `.hour-cell[data-date-key="${year}-${doy}"][data-cell-index="0"]`,
    );
    await requestCard.dragTo(target);
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
      .getByText("Team cash", { exact: true })
      .waitFor();
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
    await staged.getByText("У руководителя", { exact: true }).waitFor();
    await chat
      .getByRole("status")
      .getByText(/Передано руководителю/)
      .waitFor();
    assert.equal(submissions, 1);
    assert.equal(failedIdentity, true);
    await context.unroute("**/team-chat/me");
    await context.unroute(
      `**/team-chat/requests/${pendingRequest._id}/placement`,
    );
    // The sender can delete their own message; all viewers lose it.
    await mobile.getByRole("tab", { name: "Сообщения", exact: true }).click();
    phone.once("dialog", (dialog) => dialog.accept());
    await mobile
      .locator(".team-message")
      .filter({ hasText: "Mobile employee online" })
      .getByRole("button", { name: "Удалить сообщение", exact: true })
      .click();
    await chat.getByRole("tab", { name: "Сообщения", exact: true }).click();
    await chat
      .getByText("Mobile employee online", { exact: true })
      .waitFor({ state: "hidden" });
    await chat.getByRole("tab", { name: /^Заявки/ }).click();
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
