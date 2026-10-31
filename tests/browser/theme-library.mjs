import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { createAppearanceAPI } from "./appearance-api.mjs";
import { defaultPreferences, presetTheme } from "../../src/utils/appearance.js";
const root = fileURLToPath(new URL("../../", import.meta.url)),
  api = createAppearanceAPI(),
  errors = [];
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 5194, strictPort: true },
});
let browser;
const date = new Date(),
  tomorrow = new Date(date);
tomorrow.setDate(date.getDate() + 1);
const key = (d) =>
  `${d.getFullYear()}-${Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 0)) / 86400000)}`;
const events = [
  {
    _id: "income",
    type: "income",
    amount: 600000,
    date: date.toISOString(),
    dateKey: key(date),
    cellIndex: 0,
  },
  {
    _id: "expense",
    type: "expense",
    amount: 100000,
    date: date.toISOString(),
    dateKey: key(date),
    cellIndex: 1,
  },
  {
    _id: "next",
    type: "income",
    amount: 300000,
    date: tomorrow.toISOString(),
    dateKey: key(tomorrow),
    cellIndex: 0,
  },
].map((t) => ({
  ...t,
  accountId: "cash",
  companyId: "owner",
  categoryId: "rent",
}));
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  async function device(type, actor = "alice", legacy = null) {
    const mobile = type === "mobile",
      tablet = type === "tablet";
    const context = await browser.newContext({
      viewport: {
        width: mobile ? 390 : tablet ? 834 : 1512,
        height: mobile ? 844 : 1194,
      },
      hasTouch: mobile || tablet,
      isMobile: mobile,
      userAgent: mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
        : tablet
          ? "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1"
          : undefined,
    });
    await context.addInitScript(
      ({ actor, legacy }) => {
        localStorage.setItem("app_data_version", "1");
        localStorage.setItem("theme", "light");
        localStorage.setItem("accountVisibilityMode", "all");
        if (legacy && !localStorage.getItem("legacy-seeded")) {
          localStorage.setItem(
            `index12-appearance-v1:${actor}`,
            JSON.stringify(legacy),
          );
          localStorage.setItem("legacy-seeded", "1");
        }
      },
      { actor, legacy },
    );
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      if (await api.handle(route, actor)) return;
      const path = new URL(route.request().url()).pathname;
      let data = [];
      if (path.endsWith("/auth/me"))
        data = {
          _id: actor,
          role: "admin",
          workspaceRole: "admin",
          createdAt: "2026-01-01",
        };
      if (path.endsWith("/accounts"))
        data = [
          {
            _id: "cash",
            name: "Касса",
            companyId: "owner",
            initialBalance: 2000000,
          },
          {
            _id: "bank",
            name: "Банк",
            companyId: "owner",
            initialBalance: 1000000,
          },
        ];
      if (path.endsWith("/companies"))
        data = [{ _id: "owner", name: "Владелец" }];
      if (path.endsWith("/categories"))
        data = [{ _id: "rent", name: "Аренда" }];
      if (path.endsWith("/events")) data = events;
      if (path.endsWith("/snapshot"))
        data = {
          accountBalances: { cash: 2000000, bank: 1000000 },
          companyBalances: { owner: 3000000 },
          individualBalances: {},
          contractorBalances: {},
          timestamp: date.toISOString(),
        };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    await page.goto(`http://127.0.0.1:5194/${mobile ? "mobile" : ""}`);
    await page.evaluate(async (mobile) => {
      const { useMainStore } = await import("/src/stores/mainStore.js");
      const store = useMainStore();
      store.setForecastState("accounts", true);
      if (mobile) store.isHeaderExpanded = true;
    }, mobile);
    if (mobile) {
      await page.getByTitle("Профиль", { exact: true }).click();
      await page
        .getByRole("button", { name: "Настройки", exact: true })
        .click();
    } else
      await page
        .getByRole("button", { name: "Настройки оформления", exact: true })
        .click();
    const panel = page.getByRole("dialog", {
        name: "Настройки оформления",
        exact: true,
      }),
      list = panel.getByLabel("Мои темы", { exact: true });
    const ready = () =>
      page.waitForFunction(
        () =>
          !document.querySelector('[aria-label="Обновить список тем"]')
            .disabled,
      );
    await ready();
    const token = (k) =>
      page.evaluate(
        (k) =>
          getComputedStyle(document.documentElement).getPropertyValue(k).trim(),
        k,
      );
    const mode = (m) =>
      panel
        .getByRole("button", {
          name: m === "light" ? "Светлая" : "Тёмная",
          exact: true,
        })
        .click();
    const part = (p) =>
      panel.getByLabel("Часть виджета", { exact: true }).selectOption(p);
    const color = (label, value) =>
      panel.getByLabel(label, { exact: true }).evaluate((el, v) => {
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    const size = async (p, label, value) => {
      await part(p);
      await panel
        .getByRole("slider", { name: `Виджеты: ${label}: Размер`, exact: true })
        .evaluate((el, v) => {
          el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }, value);
    };
    const font = (selector) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize);
    const refresh = async () => {
      await panel
        .getByRole("button", { name: "Обновить список тем", exact: true })
        .click();
      await ready();
    };
    const save = async () => {
      const name = (await list.inputValue())
        ? `Сохранить: ${{ desktop: "Десктоп", tablet: "Планшет", mobile: "Мобилка" }[type]}`
        : "Сохранить тему";
      await panel.getByRole("button", { name, exact: true }).click();
      await panel
        .getByRole("status")
        .filter({ hasText: "Сохранено:" })
        .waitFor();
    };
    return {
      page,
      panel,
      list,
      ready,
      token,
      mode,
      part,
      color,
      size,
      font,
      refresh,
      save,
    };
  }
  const pc = await device("desktop");
  assert.deepEqual(
    await pc.panel.locator(".theme-scope-tabs button").allTextContents(),
    ["Виджеты", "Таблица", "Графики"],
  );
  for (const [mode, bg, font] of [
    ["light", "#fff4dd", 14],
    ["dark", "#242c34", 15],
  ]) {
    await pc.mode(mode);
    await pc.panel
      .getByRole("button", { name: "Спокойная", exact: true })
      .click();
    await pc.part("card");
    await pc.color("Виджеты: Карточка: Фон виджетов", bg);
    await pc.size("rowLabel", "Название в строке", font);
  }
  await pc.panel
    .getByRole("textbox", { name: "Название темы", exact: true })
    .fill("Шаблон INDEX12");
  await pc.save();
  const id = await pc.list.inputValue();
  assert.ok(id);
  assert.equal(
    await pc.list.locator("option").nth(1).textContent(),
    "Шаблон INDEX12",
  );
  const tablet = await device("tablet");
  assert.equal(
    await tablet.list.inputValue(),
    id,
    "tablet automatically applies account selection",
  );
  assert.equal(await tablet.token("--widget-background"), "#fff4dd");
  for (const [mode, base] of [
    ["light", 18],
    ["dark", 19],
  ]) {
    await tablet.mode(mode);
    await tablet.size("rowLabel", "Название в строке", base);
    assert.equal(await tablet.font(".card-items-list .item-name"), `${base}px`);
    await tablet.size("rowValue", "Текущая сумма", base - 2);
    assert.equal(
      await tablet.font(".card-items-list .current-cell"),
      `${base - 2}px`,
    );
    await tablet.size("rowForecast", "Прогноз", base + 2);
    assert.equal(
      await tablet.font(".card-items-list .future-cell"),
      `${base + 2}px`,
    );
    await tablet.size("rowAux", "Валюта и разделитель", base - 9);
    assert.equal(
      await tablet.font(".card-items-list .currency"),
      `${base - 9}px`,
    );
    await tablet.size("title", "Название виджета", base - 6);
    assert.equal(
      await tablet.font(".dashboard-card .card-title"),
      `${base - 6}px`,
    );
    await tablet.size("subtitle", "Подпись главной суммы", base - 8);
    assert.equal(
      await tablet.font(".dashboard-card .card-sub-balance"),
      `${base - 8}px`,
    );
    assert.equal(
      await tablet.font(".card-items-list .item-name"),
      `${base}px`,
      "subtitle and title controls do not resize row names",
    );
    await tablet.part("rowLabel");
    await tablet.panel
      .getByRole("button", { name: "Наследовать: Размер", exact: true })
      .click();
    assert.equal(
      await tablet.font(".card-items-list .item-name"),
      mode === "light" ? "14px" : "15px",
    );
    assert.equal(
      await tablet.font(".card-items-list .current-cell"),
      `${base - 2}px`,
    );
    await tablet.size("rowLabel", "Название в строке", base);
  }
  await tablet.save();
  assert.equal(
    await tablet.list.locator("option").count(),
    2,
    "both tablet palettes save inside the original template",
  );
  const mobile = await device("mobile");
  assert.equal(await mobile.list.inputValue(), id);
  for (const [mode, size] of [
    ["light", 15],
    ["dark", 16],
  ]) {
    await mobile.mode(mode);
    await mobile.size("rowLabel", "Название в строке", size);
    assert.equal(
      await mobile.font(".mobile-widget-card .col-center"),
      `${size}px`,
    );
  }
  await mobile.save();
  await pc.refresh();
  await pc.mode("light");
  assert.equal(await pc.font(".card-items-list .item-name"), "14px");
  await pc.part("card");
  await pc.color("Виджеты: Карточка: Фон виджетов", "#e8f0e9");
  await pc.color("Цвета операций: Доходы", "#206aaa");
  await pc.save();
  await tablet.refresh();
  await tablet.mode("light");
  assert.equal(await tablet.font(".card-items-list .item-name"), "18px");
  assert.equal(await tablet.token("--widget-background"), "#e8f0e9");
  await mobile.refresh();
  await mobile.mode("light");
  assert.equal(await mobile.font(".mobile-widget-card .col-center"), "15px");
  assert.equal(await mobile.token("--widget-background"), "#e8f0e9");
  for (const d of [pc, tablet, mobile])
    for (const name of [
      "--op-income-color",
      "--op-income-meta",
      "--widget-income-color",
      "--graph-bar-income",
      "--day-summary-income",
    ])
      assert.equal(await d.token(name), "#206aaa", name);
  await pc.page.getByTitle("21 день", { exact: true }).click();
  await pc.page.locator(".day-column.today .operation-chip.income").hover();
  await pc.page.locator(".op-tooltip-value--income").first().waitFor();
  assert.equal(
    await pc.page
      .locator(".op-tooltip-value--income")
      .first()
      .evaluate((el) => getComputedStyle(el).color),
    "rgb(32, 106, 170)",
  );
  assert.equal(await pc.font(".card-items-list .future-cell"), "13px");
  const snapshot = structuredClone(
    api.library("alice").themes[0].config.devices.desktop,
  );
  await tablet.panel
    .getByRole("button", { name: "Наследовать десктоп", exact: true })
    .click();
  await tablet.save();
  assert.deepEqual(
    api.library("alice").themes[0].config.devices.desktop,
    snapshot,
  );
  assert.deepEqual(api.library("alice").themes[0].config.devices.tablet, {
    light: {},
    dark: {},
  });
  await tablet.mode("dark");
  assert.equal(await tablet.font(".card-items-list .item-name"), "15px");
  api.setOffline(true);
  await mobile.refresh();
  await mobile.panel.getByRole("alert").waitFor();
  assert.equal(await mobile.list.locator("option").count(), 2);
  api.setOffline(false);
  await mobile.refresh();
  const bob = await device("desktop", "bob");
  assert.equal(await bob.list.locator("option").count(), 1);
  await pc.panel
    .getByRole("button", { name: "По умолчанию", exact: true })
    .click();
  await pc.ready();
  await pc.page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-appearance-custom"),
  );
  await pc.mode("dark");
  assert.equal(
    await pc.page.locator("html").getAttribute("data-appearance-custom"),
    null,
  );
  assert.equal(await pc.list.locator("option").count(), 2);
  await tablet.refresh();
  assert.equal(await tablet.list.inputValue(), "");
  await pc.list.selectOption(id);
  await pc.ready();
  assert.equal(await pc.token("--widget-background"), "#242c34");
  await pc.panel
    .getByRole("button", { name: "Удалить тему", exact: true })
    .click();
  await pc.panel.getByRole("alert").waitFor();
  await pc.refresh();
  await pc.panel
    .getByRole("button", { name: "Удалить тему", exact: true })
    .click();
  await pc.page.waitForFunction(
    () => document.querySelector("#personal-theme-list").options.length === 1,
  );
  await mobile.refresh();
  assert.equal(await mobile.list.locator("option").count(), 1);
  assert.equal(
    await mobile.page.locator("html").getAttribute("data-appearance-custom"),
    null,
  );
  const legacy = defaultPreferences();
  legacy.mode = "light";
  legacy.themes.light = presetTheme("warm", "light");
  legacy.themes.dark = presetTheme("crisp", "dark");
  legacy.saved = [
    {
      id: "legacy-pair",
      name: "Сохранённая",
      mode: "light",
      theme: legacy.themes.light,
      revision: 1,
    },
  ];
  const migrated = await device("desktop", "legacy", legacy);
  assert.equal(await migrated.list.inputValue(), "legacy-pair");
  assert.equal(await migrated.token("--widget-background"), "#fffefa");
  await migrated.mode("dark");
  assert.equal(await migrated.token("--widget-background"), "#222b38");
  assert.equal(api.library("legacy").themes.length, 1);
  await migrated.panel
    .getByRole("button", { name: "Удалить тему", exact: true })
    .click();
  await migrated.page.waitForFunction(
    () => document.querySelector("#personal-theme-list").options.length === 1,
  );
  await migrated.page.evaluate(() =>
    localStorage.removeItem("index12-appearance-v2:legacy"),
  );
  await migrated.page.reload();
  await migrated.page
    .getByRole("button", { name: "Настройки оформления", exact: true })
    .click();
  await migrated.ready();
  assert.equal(
    await migrated.list.locator("option").count(),
    1,
    "stale local legacy cache cannot resurrect a deleted template",
  );
  await mkdir(`${root}/output/playwright`, { recursive: true });
  for (const [name, d] of [
    ["desktop", pc],
    ["tablet", tablet],
    ["mobile", mobile],
  ])
    await d.page.screenshot({
      path: `${root}/output/playwright/templates-${name}.png`,
    });
  assert.deepEqual(errors, []);
  console.log(
    "PASS one template / two palettes / three devices, automatic selection, inherited desktop changes, independent device typography, tablet title/rows/values/forecast/currency/subtitle, synchronized tooltip and graph colours, default/reset/delete, offline and account isolation",
  );
} catch (error) {
  await mkdir(`${root}/output/playwright`, { recursive: true });
  for (const page of browser?.contexts().flatMap((c) => c.pages()) || [])
    await page
      .screenshot({
        path: `${root}/output/playwright/templates-failure-${page.viewportSize().width}.png`,
      })
      .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
