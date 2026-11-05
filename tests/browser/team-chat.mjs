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
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
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
    await chat.getByRole("button", { name: /^Участники/ }).click();
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
    await chat.getByRole("button", { name: "Сообщения", exact: true }).click();
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
    await phone.screenshot({ path: `${output}/team-chat-phone.png` });
    await mobile
      .locator(".team-compose-area input[type=file]")
      .setInputFiles({
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
    await mobile.getByRole("button", { name: /^Заявки/ }).click();
    await mobile
      .getByRole("button", { name: "Заявка на расход", exact: true })
      .click();
    await mobile
      .getByLabel("Что оплатить / купить", { exact: true })
      .fill("Browser cleaning");
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
    await mobile
      .getByRole("button", { name: "На согласование", exact: true })
      .click();
    await mobile.getByText("Browser cleaning", { exact: true }).waitFor();
    await phone.screenshot({ path: `${output}/team-chat-request-mobile.png` });
    await chat.getByRole("button", { name: /^Заявки/ }).click();
    const requestCard = chat
      .locator(".request-card")
      .filter({ hasText: "Browser cleaning" });
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
      .locator(".base-select")
      .filter({ hasText: "Категория" })
      .filter({ hasNotText: "Подкатегория" })
      .first()
      .locator(".select-trigger")
      .click();
    await popup
      .locator(".options-list")
      .getByText("Обслуживание", { exact: true })
      .click();
    await popup
      .locator(".base-select")
      .filter({ hasText: "Категория" })
      .filter({ hasNotText: "Подкатегория" })
      .first()
      .locator(".select-trigger")
      .click();
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
      .filter({ hasText: "Browser cleaning" });
    await staged.getByText("Team cash", { exact: true }).waitFor();
    await staged
      .getByRole("button", {
        name: "Согласовано мной → руководителю",
        exact: true,
      })
      .click();
    await staged.getByText("У руководителя", { exact: true }).waitFor();
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
