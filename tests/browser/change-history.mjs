import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { createAppearanceAPI } from "./appearance-api.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 5195, strictPort: true },
});
const now = new Date(),
  day = `${now.getFullYear()}-${Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(now.getFullYear(), 0, 0)) / 86400000)}`;
const key = (d) =>
  `${d.getFullYear()}-${Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 0)) / 86400000)}`;
const movedDate = new Date(now);
movedDate.setDate(movedDate.getDate() - 2);
const beforeDate = new Date(movedDate);
beforeDate.setDate(beforeDate.getDate() - 1);
const operation = {
  _id: "income",
  type: "income",
  amount: 1400000,
  date: movedDate.toISOString(),
  dateKey: key(movedDate),
  syncVersion: 2,
  cellIndex: 0,
  accountId: "cash",
  companyId: "owner",
  categoryId: "rent",
  description: "Оплата аренды за октябрь",
};
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  await mkdir(`${root}/output/playwright`, { recursive: true });
  for (const fixture of [
    { name: "desktop", width: 1512, height: 982 },
    { name: "tablet", width: 834, height: 1194, touch: true },
    { name: "phone", width: 390, height: 844, touch: true, mobile: true },
  ]) {
    const context = await browser.newContext({
      viewport: { width: fixture.width, height: fixture.height },
      hasTouch: !!fixture.touch,
      isMobile: !!fixture.mobile,
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
    const page = await context.newPage(),
      api = createAppearanceAPI(),
      errors = [],
      undoCalls = [],
      queries = [];
    let deviceId;
    const records = Array.from({ length: 180 }, (_, i) => ({
      ...operation,
      _id: i ? `income-${i}` : "income",
      date: i ? now.toISOString() : operation.date,
      dateKey: i ? day : operation.dateKey,
      cellIndex: i,
      amount: i ? 1000 + i : 1400000,
    }));
    const allRequests = [];
    const rows = [
      {
        id: "move",
        operationId: "income",
        kind: "operation",
        operationType: "income",
        action: "updated",
        actorName: "Эрнест",
        createdAt: now.toISOString(),
        snapshot: operation,
        canUndo: true,
        change: {
          field: "date",
          before: {
            date: beforeDate.toISOString(),
            dateKey: key(beforeDate),
            cellIndex: 0,
          },
          after: {
            date: operation.date,
            dateKey: operation.dateKey,
            cellIndex: 0,
          },
        },
      },
      {
        id: "amount",
        operationId: "income",
        kind: "operation",
        operationType: "income",
        action: "updated",
        actorName: "Эрнест",
        createdAt: now.toISOString(),
        snapshot: operation,
        details: { accountId: "Касса", categoryId: "Аренда" },
        canUndo: true,
        change: {
          field: "amount",
          before: { amount: 1200000 },
          after: { amount: 1400000 },
        },
      },
      {
        id: "deleted",
        kind: "operation",
        operationType: "transfer",
        action: "deleted",
        actorName: "Эрнест",
        createdAt: now.toISOString(),
        snapshot: {
          ...operation,
          _id: "deleted-transfer",
          type: "transfer",
          isTransfer: true,
          accountId: null,
          companyId: null,
          fromAccountId: "cash",
          fromCompanyId: "owner",
          toAccountId: "bank",
          toCompanyId: "owner",
          amount: 250000,
          description: "Перевод на банковский счёт",
        },
        details: { fromAccountId: "Касса", toAccountId: "Банк" },
        canUndo: true,
      },
      {
        id: "local",
        kind: "setting",
        target: "preference",
        key: "theme",
        action: "updated",
        createdAt: now.toISOString(),
        deviceId: "",
        deviceLabel: "Десктоп",
        canUndo: true,
        changes: [
          {
            path: [],
            before: { exists: true, value: "dark" },
            after: { exists: true, value: "light" },
          },
        ],
      },
    ];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      allRequests.push(url.href);
      let data = [];
      if (await api.handle(route, "history-user")) return;
      if (path.includes("/change-history")) {
        if (req.method() === "GET") {
          queries.push(Object.fromEntries(url.searchParams));
          let items = rows.filter(
            (row) =>
              (!url.searchParams.get("kind") ||
                row.kind === url.searchParams.get("kind")) &&
              (!url.searchParams.get("operationType") ||
                row.operationType === url.searchParams.get("operationType")),
          );
          data = { items, nextCursor: null };
        } else if (path.endsWith("/undo")) {
          const body = req.postDataJSON();
          undoCalls.push({ path, body });
          assert.equal(body.confirm, true);
          const row = rows.find((r) => path.includes(`/${r.id}/`));
          if (row.target === "preference")
            data = {
              preference: {
                id: row.id,
                key: row.key,
                requestId: "receipt",
                changes: row.changes,
              },
            };
          else {
            row.undoneAt = now.toISOString();
            if (row.action === "deleted") {
              const after = {
                ...row.snapshot,
                syncVersion: row.snapshot.syncVersion + 1,
              };
              records.push(after);
              data = {
                ok: true,
                kind: "operation",
                changes: [{ before: null, after }],
              };
            } else {
              const before = { ...records[0] };
              if (row.id === "amount") records[0].amount = 1200000;
              if (row.id === "move")
                Object.assign(records[0], row.change.before);
              records[0].syncVersion++;
              data = {
                ok: true,
                kind: row.kind,
                changes: [{ before, after: { ...records[0] } }],
              };
            }
          }
        } else if (path.endsWith("/complete")) {
          const body = req.postDataJSON();
          assert.equal(body.applied, true);
          rows.find((r) => path.includes(`/${r.id}/`)).undoneAt =
            now.toISOString();
          data = { ok: true };
        } else data = { ok: true };
      } else if (path.endsWith("/auth/me"))
        data = {
          _id: "history-user",
          role: "admin",
          workspaceRole: "admin",
          name: "Эрнест",
          createdAt: "2026-01-01",
        };
      else if (path.endsWith("/accounts"))
        data = [
          {
            _id: "cash",
            name: "Касса",
            companyId: "owner",
            initialBalance: 100000,
          },
          { _id: "bank", name: "Банк", companyId: "owner", initialBalance: 0 },
        ];
      else if (path.endsWith("/companies"))
        data = [{ _id: "owner", name: "Компания" }];
      else if (path.endsWith("/categories"))
        data = [{ _id: "rent", name: "Аренда" }];
      else if (
        path.endsWith("/events") ||
        path.endsWith("/events/all-for-export")
      )
        data = records.filter(
          (op) =>
            !url.searchParams.get("dateKey") ||
            op.dateKey === url.searchParams.get("dateKey"),
        );
      else if (path.endsWith("/snapshot"))
        data = {
          timestamp: now.toISOString(),
          accountBalances: { cash: 100000 },
          companyBalances: { owner: 100000 },
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
    await page.goto(`http://127.0.0.1:5195/${fixture.mobile ? "mobile" : ""}`);
    await page
      .locator(fixture.mobile ? ".op-chip.income" : ".operation-chip.income")
      .first()
      .waitFor();
    deviceId = await page.evaluate(() =>
      localStorage.getItem("index12-history-device"),
    );
    rows.find((row) => row.id === "local").deviceId = deviceId;
    if (!fixture.mobile) {
      await page
        .locator('.home-right-panel [data-tooltip="Журнал операций"]')
        .click();
      const wrap = page.locator(".editor-modal .table-wrap");
      await wrap.locator("tbody tr").nth(100).waitFor({ state: "attached" });
      const before = await wrap.evaluate((el) => ({
        top: el.scrollTop,
        height: el.clientHeight,
        scroll: el.scrollHeight,
      }));
      assert.ok(before.scroll > before.height);
      const box = await wrap.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 600);
      await page.waitForFunction(
        () =>
          document.querySelector(".editor-modal .table-wrap").scrollTop > 100,
      );
      await page.keyboard.press("Escape");
      if (await page.locator(".editor-modal").count())
        await page.locator(".editor-modal .close-btn:visible").first().click();
    }
    const open = async () => {
      if (fixture.mobile) {
        await page.getByTitle("Профиль", { exact: true }).click();
        await page
          .getByRole("button", { name: "История изменений", exact: true })
          .click();
      } else
        await page
          .getByRole("button", { name: "История изменений", exact: true })
          .click();
    };
    await open();
    const panel = page.getByRole("dialog", {
      name: "История изменений",
      exact: true,
    });
    await panel.locator('[data-history-id="amount"]').waitFor();
    const financialState = () =>
      page.evaluate(async () => {
        const { useMainStore } = await import("/src/stores/mainStore.js");
        const s = useMainStore();
        return {
          current: s.currentTotalBalance,
          future: s.futureTotalBalance,
          projection: JSON.parse(JSON.stringify(s.projection)),
          cacheKeys: Object.keys(s.displayCache).sort(),
          others: s.allKnownOperations
            .filter((o) => o._id !== "income")
            .map((o) => ({
              id: o._id,
              dateKey: o.dateKey,
              amount: o.amount,
              cellIndex: o.cellIndex,
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        };
      });
    const baseline = await financialState(),
      requestStart = allRequests.length;
    await page.evaluate(() => {
      window.removedHistoryChips = [];
      window.historyChipObserver = new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.removedNodes) {
            if (node.nodeType !== 1) continue;
            const chips = [
              ...(node.matches(".operation-chip,.op-chip") ? [node] : []),
              ...node.querySelectorAll(".operation-chip,.op-chip"),
            ];
            for (const chip of chips)
              window.removedHistoryChips.push(
                chip.dataset.operationId || chip.title,
              );
          }
      });
      window.historyChipObserver.observe(document.body, {
        subtree: true,
        childList: true,
      });
    });
    await panel
      .locator('[data-history-id="move"]')
      .getByRole("button", { name: "Отменить", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Да, отменить изменение", exact: true })
      .click();
    await panel
      .locator('[data-history-id="move"]')
      .getByRole("button", { name: "Отменено", exact: true })
      .waitFor();
    const { cacheKeys: nextKeys, ...nextFinancial } = await financialState(),
      { cacheKeys: priorKeys, ...priorFinancial } = baseline;
    assert.deepEqual(
      nextFinancial,
      priorFinancial,
      "date undo must preserve all other operations, totals and projection",
    );
    assert.ok(
      priorKeys.every((key) => nextKeys.includes(key)) &&
        nextKeys.every(
          (day) => priorKeys.includes(day) || day === key(beforeDate),
        ),
      "all loaded history stays cached",
    );
    assert.ok(
      allRequests
        .slice(requestStart)
        .every(
          (path) =>
            path.includes("/change-history") ||
            path.includes(`/events?dateKey=${key(beforeDate)}`),
        ),
      `unexpected financial reload: ${JSON.stringify(allRequests.slice(requestStart))}`,
    );
    const removed = await page.evaluate(() => {
      window.historyChipObserver.disconnect();
      return window.removedHistoryChips;
    });
    assert.ok(
      removed.every((id) => id === "income" || id.includes("1 400 000")),
      "unrelated chips cannot disappear during undo: " +
        JSON.stringify(removed),
    );
    await panel.getByRole("button", { name: "Перевод", exact: true }).hover();
    await page.getByRole("tooltip").waitFor();
    assert.ok(
      (await page.getByRole("tooltip").innerText()).includes(
        "Перевод на банковский счёт",
      ),
    );
    await panel
      .locator('[data-history-id="amount"]')
      .getByRole("button", { name: "Отменить", exact: true })
      .click();
    await page.getByRole("alertdialog").waitFor();
    await page.screenshot({
      path: `${root}/output/playwright/history-confirm-${fixture.name}.png`,
    });
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Отмена", exact: true })
      .click();
    assert.equal(undoCalls.length, 1);
    await panel
      .locator('[data-history-id="amount"]')
      .getByRole("button", { name: "Отменить", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Да, отменить изменение", exact: true })
      .click();
    await panel
      .locator('[data-history-id="amount"]')
      .getByRole("button", { name: "Отменено", exact: true })
      .waitFor();
    assert.equal(undoCalls.length, 2);
    const afterAmount = await financialState();
    assert.equal(afterAmount.current, baseline.current - 200000);
    assert.deepEqual(afterAmount.others, baseline.others);
    assert.deepEqual(afterAmount.projection, baseline.projection);
    await page.evaluate(
      async (snapshot) => {
        const { useMainStore } = await import("/src/stores/mainStore.js");
        const store = useMainStore();
        store.applyHistoryOperationChanges([{ before: null, after: snapshot }]);
        await store.deleteOperation(snapshot);
      },
      rows.find((row) => row.id === "deleted").snapshot,
    );
    const beforeRestore = await financialState(),
      restoreRequestStart = allRequests.length;
    await panel
      .locator('[data-history-id="deleted"]')
      .getByRole("button", { name: "Отменить", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Да, отменить изменение", exact: true })
      .click();
    await panel
      .locator('[data-history-id="deleted"]')
      .getByRole("button", { name: "Отменено", exact: true })
      .waitFor();
    const afterRestore = await financialState();
    assert.equal(afterRestore.current, beforeRestore.current);
    assert.equal(afterRestore.future, beforeRestore.future);
    assert.deepEqual(afterRestore.projection, beforeRestore.projection);
    assert.deepEqual(
      afterRestore.others.filter((op) => op.id !== "deleted-transfer"),
      beforeRestore.others,
    );
    assert.equal(
      afterRestore.others.filter((op) => op.id === "deleted-transfer").length,
      1,
    );
    assert.ok(
      allRequests
        .slice(restoreRequestStart)
        .every((url) => url.includes("/change-history")),
      "restoration cannot reload the ledger",
    );
    await panel.getByLabel("Раздел", { exact: true }).selectOption("setting");
    await panel.locator('[data-history-id="local"]').waitFor();
    assert.equal(await panel.locator(".history-row").count(), 1);
    await panel.getByLabel("Порядок", { exact: true }).selectOption("asc");
    await page.waitForFunction(() =>
      document.querySelector('.history-list[aria-busy="false"]'),
    );
    assert.equal(queries.at(-1).kind, "setting");
    assert.equal(queries.at(-1).order, "asc");
    await panel
      .locator('[data-history-id="local"]')
      .getByRole("button", { name: "Отменить", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Да, отменить изменение", exact: true })
      .click();
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    await panel
      .locator('[data-history-id="local"]')
      .getByRole("button", { name: "Отменено", exact: true })
      .waitFor();
    await page.screenshot({
      path: `${root}/output/playwright/change-history-${fixture.name}.png`,
    });
    assert.deepEqual(errors, []);
    assert.equal(undoCalls.length, 4);
    console.log(
      `PASS ${fixture.name}: history filters, confirmed date/amount undo, deleted-transfer restoration, stable totals/cache/period, local-setting undo${fixture.mobile ? "" : ", central journal scrolling"}`,
    );
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
