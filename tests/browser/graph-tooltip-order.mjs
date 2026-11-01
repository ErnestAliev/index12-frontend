// Exercise the real charts and operation forms with isolated financial data.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { createAppearanceAPI } from "./appearance-api.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 5196, strictPort: true },
});
const date = new Date();
date.setHours(12, 0, 0, 0);
const dateKey = `${date.getFullYear()}-${Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 86400000) + 1}`;
const fixtures = [
  { name: "desktop", width: 1512, height: 982 },
  { name: "tablet", width: 834, height: 1194, touch: true },
  { name: "phone", width: 390, height: 844, touch: true, mobile: true },
];
const seed = [
  ["parking", "income", 2500000],
  ["lounge", "income", 3500000],
  ["banquet", "income", 600000],
  ["kindergarten", "income", 1700000],
  ["withdrawal", "expense", 120000],
  ["expense", "expense", 240000],
  ["transfer-small", "transfer", 300000],
  ["transfer-big", "transfer", 500000],
].map(([id, type, amount], cellIndex) => ({
  _id: id,
  type,
  amount,
  cellIndex,
  dateKey,
  date: date.toISOString(),
  syncVersion: 1,
  accountId: type === "transfer" ? null : "cash",
  companyId: "owner",
  contractorId: "tenant",
  projectId: "project",
  categoryId: id,
  description: "",
  isWithdrawal: id === "withdrawal",
  isTransfer: type === "transfer",
  ...(type === "transfer"
    ? {
        fromAccountId: "cash",
        toAccountId: "bank",
        fromCompanyId: "owner",
        toCompanyId: "owner",
      }
    : {}),
}));
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  await mkdir(`${root}/output/playwright`, { recursive: true });
  for (const fixture of fixtures) {
    const records = structuredClone(seed),
      api = createAppearanceAPI(),
      errors = [];
    const context = await browser.newContext({
      viewport: { width: fixture.width, height: fixture.height },
      hasTouch: !!fixture.touch,
      isMobile: !!fixture.mobile,
      permissions: ["clipboard-read", "clipboard-write"],
      userAgent: fixture.mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
        : fixture.touch
          ? "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1"
          : undefined,
    });
    await context.addInitScript(() => {
      localStorage.setItem("app_data_version", "1");
      localStorage.setItem("theme", "light");
      localStorage.setItem("accountVisibilityMode", "all");
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.stack);
    });
    await page.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      if (!["127.0.0.1", "localhost"].includes(url.hostname))
        return route.abort();
      if (!path.includes("/api/")) return route.continue();
      if (await api.handle(route, "tooltip-user")) return;
      let data = [];
      if (path.endsWith("/auth/me"))
        data = {
          _id: "tooltip-user",
          role: "admin",
          workspaceRole: "admin",
          createdAt: "2026-01-01",
        };
      else if (path.endsWith("/accounts"))
        data = [
          {
            _id: "cash",
            name: "Касса",
            companyId: "owner",
            initialBalance: 10000000,
          },
          { _id: "bank", name: "Банк", companyId: "owner", initialBalance: 0 },
        ];
      else if (path.endsWith("/companies"))
        data = [{ _id: "owner", name: "Владелец" }];
      else if (path.endsWith("/contractors"))
        data = [{ _id: "tenant", name: "Арендатор" }];
      else if (path.endsWith("/projects"))
        data = [
          { _id: "project", name: "Проект" },
          { _id: "none", name: "Без проекта" },
        ];
      else if (path.endsWith("/categories"))
        data = [
          ...seed.map((op) => ({ _id: op._id, name: op._id, type: op.type })),
          { _id: "transfer-category", name: "Перевод" },
        ];
      else if (path.endsWith("/events")) data = records;
      else if (/\/events\/[^/]+$/.test(path) && req.method() === "PUT") {
        const record = records.find((op) => op._id === path.split("/").at(-1));
        Object.assign(record, req.postDataJSON());
        record.syncVersion++;
        data = record;
      } else if (path.endsWith("/snapshot"))
        data = {
          timestamp: date.toISOString(),
          accountBalances: { cash: 17140000, bank: 800000 },
          companyBalances: { owner: 17940000 },
          individualBalances: {},
          contractorBalances: {},
          projectBalances: {},
          categoryTotals: {},
        };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    await page.goto(
      server.resolvedUrls.local[0] + (fixture.mobile ? "mobile" : ""),
    );
    const chipSelector = fixture.mobile ? ".op-chip" : ".operation-chip";
    await page.locator(`${chipSelector}.income`).first().waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".section-loading-overlay"),
    );
    await page.waitForTimeout(700);
    await page.evaluate(async () => {
      const { Chart } = await import(
        "/node_modules/.vite/deps/chart__js_auto.js"
      );
      window.__orderChart = [...document.querySelectorAll("canvas")]
        .map((c) => Chart.getChart(c))
        .find((c) => c?.data.datasets.some((d) => d.label === "Баланс"));
    });
    const chartState = () =>
      page.evaluate(() => {
        const c = window.__orderChart;
        c.setActiveElements([]);
        c.tooltip.setActiveElements([], { x: 0, y: 0 });
        c.update("none");
        return {
          datasets: JSON.parse(JSON.stringify(c.data)),
          bars: c.data.datasets.map((_, i) =>
            c
              .getDatasetMeta(i)
              .data.map((b) =>
                b.getProps(["x", "y", "base", "width", "height"], true),
              ),
          ),
          pixels: c.canvas.toDataURL(),
        };
      });
    const before = await chartState();
    const tooltipLines = () =>
      page.evaluate(() => {
        const c = window.__orderChart;
        const label = new Date().toLocaleDateString("ru-RU", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const index = c.data.labels.indexOf(label);
        if (index < 0) throw Error("Today is missing from chart");
        return c.options.plugins.tooltip.callbacks.label({
          chart: c,
          datasetIndex: 0,
          dataIndex: index,
        });
      });
    const incomeOrder = (lines) =>
      lines
        .filter((line) => /^\+/.test(line) && line.includes(" < "))
        .map((line) => line.split(" < ").at(-1));
    const initialLines = await tooltipLines();
    assert.deepEqual(incomeOrder(initialLines), [
      "parking",
      "lounge",
      "banquet",
      "kindergarten",
    ]);
    assert.ok(
      initialLines[initialLines.indexOf("РАСХОДЫ") + 1].includes("120"),
      "withdrawal precedes expense in the original table",
    );
    assert.ok(
      initialLines[initialLines.indexOf("ПЕРЕВОДЫ") + 1].includes("300"),
      "smaller transfer precedes the larger transfer in the original table",
    );
    // Use the existing move/swap path; amounts, dates and chart heights must stay identical.
    const swap = (id, target) =>
      page.evaluate(
        async ({ id, target, dateKey }) => {
          const { useMainStore } = await import("/src/stores/mainStore.js");
          const s = useMainStore(),
            op = s.allKnownOperations.find((o) => o._id === id);
          await s.moveOperation(op, dateKey, dateKey, target);
        },
        { id, target, dateKey },
      );
    await swap("lounge", 0);
    await swap("kindergarten", 2);
    await swap("expense", 4);
    await swap("transfer-big", 6);
    await page.waitForTimeout(700);
    assert.deepEqual(
      await chartState(),
      before,
      "same-day reordering must preserve every dataset, bar geometry and canvas pixel",
    );
    const lines = await tooltipLines();
    assert.deepEqual(incomeOrder(lines), [
      "lounge",
      "parking",
      "kindergarten",
      "banquet",
    ]);
    const expenses = lines
      .slice(lines.indexOf("РАСХОДЫ") + 1, lines.indexOf("ПЕРЕВОДЫ"))
      .filter((line) => line.startsWith("-"));
    assert.ok(
      expenses[0].includes("expense"),
      "expense and withdrawal rows follow their shared table positions",
    );
    const transfers = lines
      .slice(lines.indexOf("ПЕРЕВОДЫ") + 1)
      .filter((line) => line.includes("т"));
    assert.ok(
      transfers[0].includes("500"),
      "transfer details follow their swapped table positions",
    );
    const displayedOrder = await page
      .locator(
        `${fixture.mobile ? ".mobile-day-col.today" : ".day-column.today"} ${chipSelector}.income`,
      )
      .allTextContents();
    assert.deepEqual(
      displayedOrder.map((text) =>
        ["parking", "lounge", "banquet", "kindergarten"].find((name) =>
          text.includes(name),
        ),
      ),
      ["lounge", "parking", "kindergarten", "banquet"],
      "table and tooltip use the same order",
    );

    // Open the actual tooltip via its canvas, including touch interaction.
    const point = await page.evaluate(() => {
      const c = window.__orderChart,
        label = new Date().toLocaleDateString("ru-RU", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      const b = c.getDatasetMeta(0).data[c.data.labels.indexOf(label)],
        r = c.canvas.getBoundingClientRect();
      return {
        x: r.x + (b.x * r.width) / c.width,
        y: r.y + (((b.y + b.base) / 2) * r.height) / c.height,
      };
    });
    if (fixture.touch) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.move(point.x, point.y);
    const tooltip = page
      .locator('div[id^="chartjs-custom-tooltip-"]')
      .filter({ hasText: "ДОХОДЫ" })
      .first();
    await tooltip.waitFor({ state: "visible" });
    const text = await tooltip.innerText();
    const order = ["lounge", "parking", "kindergarten", "banquet"].map((name) =>
      text.indexOf(name),
    );
    assert.ok(
      order.every((index, i) => index >= 0 && (!i || index > order[i - 1])),
      "visible tooltip matches the table",
    );
    await page.screenshot({
      path: `${root}/output/playwright/graph-tooltip-order-${fixture.name}.png`,
    });
    if (!fixture.touch) {
      await tooltip.locator("#chartjs-tooltip-copy-btn").dispatchEvent("click");
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert.ok(
        copied.indexOf("kindergarten") < copied.indexOf("banquet"),
        "copied tooltip retains cell order",
      );
    }

    // All operation amount inputs are borderless children of one focused field.
    for (const [id, form] of [
      ["parking", "income"],
      ["expense", "expense"],
      ["transfer-small", "transfer"],
    ]) {
      const chip = fixture.mobile
        ? page.locator(
            `.mobile-day-col.today .mobile-cell[data-cell-index="${records.find((op) => op._id === id).cellIndex}"] .op-chip`,
          )
        : page.locator(`${chipSelector}[data-operation-id="${id}"]`).first();
      await chip.click();
      const popup = page.locator(`.popup-content.theme-${form}`);
      await popup.waitFor();
      const input = popup.locator("input.real-input").first();
      await input.fill("2 500 000");
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (theme) => (document.documentElement.dataset.theme = theme),
          theme,
        );
        await input.focus();
        const focus = await input.evaluate((el) => {
          const s = getComputedStyle(el),
            outer = getComputedStyle(el.closest(".custom-input-box"));
          return {
            outline: s.outlineStyle,
            border: s.borderTopWidth,
            shadow: s.boxShadow,
            outerBorder: outer.borderTopWidth,
            outerShadow: outer.boxShadow,
          };
        });
        assert.equal(
          focus.outline,
          "none",
          `${theme} ${form}: no nested focus outline`,
        );
        assert.equal(focus.border, "0px", `${theme} ${form}: no inner border`);
        assert.equal(focus.shadow, "none", `${theme} ${form}: no inner shadow`);
        assert.notEqual(
          focus.outerBorder,
          "0px",
          "the field retains its own visible boundary",
        );
        assert.notEqual(
          focus.outerShadow,
          "none",
          "focus stays visible on the field wrapper",
        );
        if (form === "income")
          await page.screenshot({
            path: `${root}/output/playwright/input-focus-${fixture.name}-${theme}.png`,
          });
      }
      await page.evaluate(
        () => (document.documentElement.dataset.theme = "light"),
      );
      await page.locator(".popup-overlay").click({ position: { x: 3, y: 3 } });
      await popup.waitFor({ state: "detached" });
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${fixture.name}: tooltip cell order, swaps, unchanged chart datasets/geometry/pixels, light/dark income/expense/transfer focus`,
    );
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
