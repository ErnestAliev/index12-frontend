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
