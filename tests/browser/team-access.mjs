import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
import assert from "node:assert/strict";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  cacheDir: "/private/tmp/index12-access-vite",
  server: { host: "127.0.0.1", port: 5220, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        });
  for (const width of [320, 390, 1280])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: 950 },
        hasTouch: width < 1000,
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(
        "http://127.0.0.1:5220/tests/browser/fixtures/team-access.html",
      );
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.setProperty("--safe-area-left", "16px");
        document.documentElement.style.setProperty("--safe-area-right", "16px");
        document.documentElement.style.setProperty(
          "--safe-area-bottom",
          "34px",
        );
      }, theme);
      const activate = (el) => (width < 1000 ? el.tap() : el.click());
      await page
        .getByRole("button", { name: "Права ролей", exact: true })
        .waitFor();
      const toolbar = await page.locator(".access-toolbar").evaluate((el) => {
        const [add, roles] = el.querySelectorAll("button");
        return {
          add: add.getBoundingClientRect().toJSON(),
          roles: roles.getBoundingClientRect().toJSON(),
          background: [...el.querySelectorAll("button")].map(
            (button) => getComputedStyle(button).backgroundColor,
          ),
          addText: add.textContent.trim(),
        };
      });
      assert.ok(toolbar.roles.left - toolbar.add.right >= 16);
      assert.equal(toolbar.add.width, 44);
      assert.ok(toolbar.add.height >= 44 && toolbar.roles.height >= 44);
      assert.equal(toolbar.addText, "");
      assert.ok(
        toolbar.background.every((color) => color === "rgba(0, 0, 0, 0)"),
      );
      const rows = await page.locator(".access-row").evaluateAll((rows) =>
        rows.map((row) => {
          const bounds = row.getBoundingClientRect();
          const controls = [...row.children]
            .filter((el) => getComputedStyle(el).display !== "none")
            .map((el) => el.getBoundingClientRect());
          return {
            row: bounds.toJSON(),
            controls: controls.map((rect) => rect.toJSON()),
          };
        }),
      );
      assert.ok(
        rows.every(
          ({ row, controls }) =>
            row.height <= 52 &&
            controls.every(
              (rect) =>
                rect.top >= row.top &&
                rect.bottom <= row.bottom &&
                rect.left >= 16 &&
                rect.right <= width - 16,
            ),
        ),
        JSON.stringify(rows),
      );
      await activate(
        page.getByRole("button", { name: "Права ролей", exact: true }),
      );
      const dialog = page.getByRole("dialog", {
        name: "Права ролей",
        exact: true,
      });
      await dialog.waitFor();
      assert.equal(await dialog.getByRole("checkbox").count(), 3);
      assert.equal(
        await dialog.getByRole("checkbox", { name: /Финансы/ }).isChecked(),
        false,
      );
      assert.equal(
        await dialog.getByRole("checkbox", { name: /1С/ }).isChecked(),
        false,
      );
      assert.match(await dialog.innerText(), /Codex владельца · закрыт/);
      assert.match(await dialog.innerText(), /Личный календарь · закрыт/);
      await activate(dialog.getByRole("checkbox", { name: /1С/ }));
      await activate(
        dialog.getByRole("button", { name: "Сохранить", exact: true }),
      );
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        (await page.evaluate(() => accessWrites.at(-1))).body.roleAccess.manager
          .onec,
        true,
      );
      const rowMenu = page.getByRole("button", {
        name: "Доступы и действия: Сотрудник",
        exact: true,
      });
      const compact = await rowMenu.isVisible();
      let accessDialog;
      if (compact) {
        await activate(rowMenu);
        accessDialog = page.getByRole("dialog", {
          name: "Доступы: Сотрудник",
          exact: true,
        });
        await accessDialog.waitFor();
        await accessDialog
          .getByRole("button", { name: "Пароль", exact: true })
          .waitFor();
        await accessDialog
          .getByRole("button", { name: "Заблокировать", exact: true })
          .waitFor();
        await accessDialog
          .getByRole("button", { name: "Удалить сотрудника", exact: true })
          .waitFor();
      }
      const rights = page.getByRole("group", {
        name: "Права Сотрудник",
        exact: true,
      });
      const finance = rights.getByRole("button", {
        name: "Финансы: Сотрудник",
        exact: true,
      });
      const onec = rights.getByRole("button", {
        name: "1С: Сотрудник",
        exact: true,
      });
      assert.equal(await finance.getAttribute("aria-pressed"), "false");
      assert.equal(
        await rights
          .getByRole("button", { name: "Чат: Сотрудник", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await page.evaluate(() => (window.accessHold = true));
      await activate(finance);
      assert.equal(
        await finance.getAttribute("aria-pressed"),
        "true",
        "selection is immediate while saving",
      );
      assert.equal(await finance.isDisabled(), true);
      await page.evaluate(() => {
        window.accessHold = false;
        window.releaseAccess();
      });
      await rights
        .locator('[aria-label="Финансы: Сотрудник"]:enabled')
        .waitFor();
      assert.deepEqual(
        (await page.evaluate(() => accessWrites.at(-1))).body.access,
        { system: true },
      );
      assert.equal(
        await page.evaluate(
          () =>
            searchChat.state.members.find(
              (member) => member.name === "Другой сотрудник",
            ).access?.system || false,
        ),
        false,
      );
      await page.evaluate(() => (window.accessReject = true));
      await activate(onec);
      await page
        .getByRole("alert")
        .filter({ hasText: "Не удалось сохранить доступ" })
        .waitFor();
      assert.equal(
        await onec.getAttribute("aria-pressed"),
        "false",
        "failed saves restore confirmed access",
      );
      assert.equal(await finance.getAttribute("aria-pressed"), "true");
      await page.evaluate(() => (window.accessReject = false));
      await activate(onec);
      await rights.locator('[aria-label="1С: Сотрудник"]:enabled').waitFor();
      assert.deepEqual(
        (await page.evaluate(() => accessWrites.at(-1))).body.access,
        { system: true, onec: true },
      );
      const chips = await rights
        .getByRole("button")
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getBoundingClientRect().toJSON()),
        );
      assert.ok(
        chips.every(
          (r) =>
            r.width >= 44 &&
            r.height >= 44 &&
            r.x >= 16 &&
            r.right <= width - 16,
        ),
        JSON.stringify(chips),
      );
      await activate(finance);
      await rights
        .locator('[aria-label="Финансы: Сотрудник"]:enabled')
        .waitFor();
      await activate(onec);
      await rights.locator('[aria-label="1С: Сотрудник"]:enabled').waitFor();
      if (compact)
        await activate(
          accessDialog.getByRole("button", { name: "Профиль", exact: true }),
        );
      else
        await activate(
          page.getByRole("button", {
            name: "Редактировать Сотрудник",
            exact: true,
          }),
        );
      const profile = page.getByRole("dialog", {
        name: "Профиль сотрудника",
        exact: true,
      });
      await profile.waitFor();
      await activate(
        profile.getByRole("checkbox", {
          name: "Собственные права",
          exact: true,
        }),
      );
      assert.equal(
        await profile.getByRole("checkbox", { name: /Финансы/ }).isDisabled(),
        true,
      );
      await activate(
        profile.getByRole("checkbox", {
          name: "Собственные права",
          exact: true,
        }),
      );
      await activate(profile.getByRole("checkbox", { name: /Финансы/ }));
      const geometry = await profile
        .locator(".access-permissions label")
        .evaluateAll((labels) =>
          labels.map((el) => ({
            label: el.getBoundingClientRect().toJSON(),
            input: el.querySelector("input").getBoundingClientRect().toJSON(),
          })),
        );
      assert.ok(
        geometry.every(
          ({ label, input }) =>
            label.height >= 44 &&
            input.width <= 20 &&
            input.height <= 20 &&
            label.left >= 16 &&
            label.right <= width - 16,
        ),
        JSON.stringify(geometry),
      );
      await activate(
        profile.getByRole("button", { name: "Сохранить", exact: true }),
      );
      await profile.waitFor({ state: "hidden" });
      assert.deepEqual(
        (await page.evaluate(() => accessWrites.at(-1))).body.access,
        { chat: true, system: true, onec: false },
      );
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${engine} ${theme} ${width}: role defaults, personal overrides, private areas locked and compact checkbox geometry`,
      );
      await context.close();
    }
} finally {
  await browser?.close();
  await server.close();
}
