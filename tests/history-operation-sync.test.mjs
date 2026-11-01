import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createServer } from "vite";
import { createPinia, setActivePinia, disposePinia } from "pinia";
import axios from "axios";
let server, useMainStore, useWidgetData, pinia;
const originalAdapter = axios.defaults.adapter;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const copy = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, no) => {
    resolve = ok;
    reject = no;
  });
  return { promise, resolve, reject };
};
before(async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  server = await createServer({
    server: { middlewareMode: true, ws: false },
    appType: "custom",
  });
  ({ useMainStore } = await server.ssrLoadModule("/src/stores/mainStore.js"));
  ({ useWidgetData } = await server.ssrLoadModule(
    "/src/composables/useWidgetData.js",
  ));
});
after(async () => {
  if (pinia) disposePinia(pinia);
  axios.defaults.adapter = originalAdapter;
  await server?.close();
  delete globalThis.localStorage;
});
function fixture(extra = []) {
  if (pinia) disposePinia(pinia);
  pinia = createPinia();
  setActivePinia(pinia);
  const store = useMainStore();
  store.user = { role: "admin" };
  store.accountVisibilityMode = "all";
  const date = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(12, 0, 0, 0);
    return d;
  };
  store.accounts = [
    { _id: "cash", name: "Касса", initialBalance: 10000, companyId: "owner" },
    { _id: "bank", name: "Банк", initialBalance: 5000, individualId: "person" },
  ];
  store.companies = [{ _id: "owner", name: "Компания" }];
  store.individuals = [{ _id: "person", name: "Физлицо" }];
  store.contractors = [{ _id: "contractor", name: "Поставщик" }];
  store.projects = [
    { _id: "project", name: "Проект" },
    { _id: "second", name: "Другой проект" },
  ];
  store.categories = [{ _id: "category", name: "Аренда" }];
  store.projection = {
    mode: "3m",
    totalDays: 90,
    rangeStartDate: date(-40),
    rangeEndDate: date(49),
    futureIncomeSum: 0,
    futureExpenseSum: 0,
  };
  store.periodFilter = { mode: "all", customStart: null, customEnd: null };
  const op = (id, days, amount, additional = {}) => ({
    _id: id,
    type: amount < 0 ? "expense" : "income",
    amount,
    date: date(days),
    dateKey: store._getDateKey(date(days)),
    cellIndex: 0,
    syncVersion: 1,
    accountId: "cash",
    companyId: "owner",
    projectId: "project",
    contractorId: "contractor",
    categoryId: "category",
    ...additional,
  });
  const source = op("source", -3, -100, { description: "Первое описание" }),
    neighbor = op("neighbor", -3, 800, { cellIndex: 4 }),
    target = op("target", -2, -500, { cellIndex: 6 }),
    older = op("historical", -500, 7000),
    future = op("planned", 3, 900);
  const operations = [
    source,
    neighbor,
    target,
    older,
    future,
    ...extra.map((make) => make(op)),
  ];
  store.displayCache = {};
  for (const item of operations)
    (store.displayCache[item.dateKey] ||= []).push(item);
  store.calculationCache = copy(store.displayCache);
  const reads = [];
  axios.defaults.adapter = async (config) => {
    reads.push(config);
    throw Error(`Unexpected request: ${config.method} ${config.url}`);
  };
  const widgets = useWidgetData();
  const numbers = () =>
    copy({
      current: store.currentTotalBalance,
      future: store.futureTotalBalance,
      accounts: store.currentAccountBalances.map((a) => [a._id, a.balance]),
      futureAccounts: store.futureAccountBalances.map((a) => [
        a._id,
        a.balance,
      ]),
      widgets: Object.fromEntries(
        [
          "accounts",
          "companies",
          "projects",
          "contractors",
          "individuals",
          "categories",
        ].map((key) => [
          key,
          widgets.getWidgetItems(key).map((r) => ({
            id: r.id ?? r._id,
            current: r.currentBalance,
            future: r.futureChange,
            balance: r.balance,
            futureBalance: r.futureBalance,
          })),
        ]),
      ),
    });
  const chart = () => copy([...store.dailyChartData]);
  const positions = () =>
    copy(
      store.allKnownOperations
        .map((o) => ({
          id: o._id,
          dateKey: o.dateKey,
          cellIndex: o.cellIndex,
          amount: o.amount,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  const row = (
    before,
    after,
    keys = ["date", "dateKey", "dayOfYear", "cellIndex"],
  ) => ({
    id: "history",
    kind: "operation",
    action: "updated",
    operationId: before._id,
    snapshot: after,
    change: {
      field: keys[0] === "amount" ? "amount" : "date",
      before: Object.fromEntries(
        keys.filter((k) => before[k] !== undefined).map((k) => [k, before[k]]),
      ),
      after: Object.fromEntries(keys.map((k) => [k, after[k]])),
    },
  });
  return {
    store,
    source,
    neighbor,
    target,
    operations,
    reads,
    date,
    op,
    numbers,
    chart,
    positions,
    row,
  };
}
async function move(f, source, targetDate, index = 2) {
  const final = {
    ...source,
    date: targetDate,
    dateKey: f.store._getDateKey(targetDate),
    cellIndex: index,
    syncVersion: source.syncVersion + 1,
  };
  axios.defaults.adapter = async (config) => {
    assert.equal(config.method, "put");
    return { data: final, status: 200 };
  };
  await f.store.moveOperation(
    source,
    source.dateKey,
    final.dateKey,
    index,
    targetDate,
  );
  axios.defaults.adapter = async (config) => {
    f.reads.push(config);
    throw Error("Undo must not reload financial data");
  };
  return final;
}
test("history reverses a normal move locally, preserving every widget, chart, old cache and unrelated chip", async () => {
  const f = fixture(),
    baseline = f.numbers(),
    chart = f.chart(),
    positions = f.positions(),
    projection = copy(f.store.projection),
    days = Object.keys(f.store.displayCache).sort();
  const moved = await move(f, f.source, f.date(-2));
  assert.deepEqual(f.numbers(), baseline);
  const response = deferred();
  let calls = 0;
  const restored = { ...f.source, syncVersion: 3 };
  const undo = f.store.undoOperationChange(f.row(f.source, moved), () => {
    calls++;
    return response.promise;
  });
  assert.equal(
    f.store
      .getOperationsForDay(f.source.dateKey)
      .find((o) => o._id === "source").cellIndex,
    0,
    "reverse preview is immediate",
  );
  assert.deepEqual(f.numbers(), baseline);
  assert.deepEqual(f.positions(), positions);
  await tick();
  assert.equal(calls, 1);
  response.resolve({ changes: [{ before: moved, after: restored }] });
  await undo;
  assert.deepEqual(f.numbers(), baseline);
  assert.deepEqual(f.chart(), chart);
  assert.deepEqual(f.positions(), positions);
  assert.deepEqual(copy(f.store.projection), projection);
  assert.deepEqual(Object.keys(f.store.displayCache).sort(), days);
  assert.deepEqual(f.reads, []);
});
test("crossing fact/forecast boundary and undo restores all figures without resetting the selected period", async () => {
  const f = fixture(),
    baseline = f.numbers(),
    chart = f.chart(),
    projection = copy(f.store.projection);
  const moved = await move(f, f.source, f.date(2));
  assert.equal(f.store.currentTotalBalance, baseline.current + 100);
  assert.equal(f.store.futureTotalBalance, baseline.future);
  const response = deferred(),
    undo = f.store.undoOperationChange(
      f.row(f.source, moved),
      () => response.promise,
    );
  assert.deepEqual(f.numbers(), baseline);
  await tick();
  response.resolve({
    changes: [{ before: moved, after: { ...f.source, syncVersion: 3 } }],
  });
  await undo;
  assert.deepEqual(f.numbers(), baseline);
  assert.deepEqual(f.chart(), chart);
  assert.deepEqual(copy(f.store.projection), projection);
  assert.deepEqual(f.reads, []);
});
test("amount undo preserves a later description and handles socket receipt before HTTP exactly once", async () => {
  const f = fixture(),
    baseline = f.numbers(),
    chart = f.chart(),
    original = f.positions();
  const edited = {
    ...f.source,
    amount: -300,
    description: "Более позднее описание",
    syncVersion: 2,
  };
  axios.defaults.adapter = async () => ({ data: edited, status: 200 });
  await f.store.updateOperation("source", {
    amount: -300,
    description: edited.description,
  });
  axios.defaults.adapter = async (config) => {
    f.reads.push(config);
    throw Error("Unexpected request");
  };
  assert.equal(f.store.currentTotalBalance, baseline.current - 200);
  const restored = { ...edited, amount: -100, syncVersion: 3 },
    changes = [{ before: edited, after: restored }],
    response = deferred();
  const undo = f.store.undoOperationChange(
    f.row(f.source, edited, ["amount"]),
    () => response.promise,
  );
  assert.deepEqual(f.numbers(), baseline);
  f.store.applyHistoryOperationChanges(changes);
  await tick();
  response.resolve({ changes });
  await undo;
  f.store.applyHistoryOperationChanges(changes);
  f.store.applyHistoryOperationChanges(changes);
  assert.equal(
    f.store.allKnownOperations.find((o) => o._id === "source").description,
    edited.description,
  );
  assert.deepEqual(f.numbers(), baseline);
  assert.deepEqual(f.chart(), chart);
  assert.deepEqual(f.positions(), original);
  assert.deepEqual(f.reads, []);
});
test("deletion undo restores the same ID, slot and totals; duplicate receipts and older deleted state cannot reverse it", async () => {
  const f = fixture(),
    baseline = f.numbers(),
    chart = f.chart(),
    positions = f.positions();
  axios.defaults.adapter = async () => ({ data: f.source, status: 200 });
  await f.store.deleteOperation(f.source);
  axios.defaults.adapter = async (config) => {
    f.reads.push(config);
    throw Error("Unexpected request");
  };
  assert.equal(
    f.store
      .getOperationsForDay(f.source.dateKey)
      .some((o) => o._id === "source"),
    false,
  );
  const restored = { ...f.source, syncVersion: 2 },
    changes = [{ before: null, after: restored }];
  await f.store.undoOperationChange(
    { action: "deleted", snapshot: f.source },
    async () => ({ changes }),
  );
  f.store.applyHistoryOperationChanges(changes);
  f.store.applyHistoryOperationChanges([{ before: f.source, after: null }]);
  assert.deepEqual(f.numbers(), baseline);
  assert.deepEqual(f.chart(), chart);
  assert.deepEqual(f.positions(), positions);
  assert.deepEqual(f.reads, []);
});
test("a rejected undo rolls back its own preview without changing any other chip or total", async () => {
  const f = fixture(),
    moved = await move(f, f.source, f.date(-2)),
    numbers = f.numbers(),
    chart = f.chart(),
    positions = f.positions();
  await assert.rejects(
    f.store.undoOperationChange(f.row(f.source, moved), async () => {
      throw Error("Поле уже изменено");
    }),
    /Поле уже изменено/,
  );
  assert.deepEqual(f.numbers(), numbers);
  assert.deepEqual(f.chart(), chart);
  assert.deepEqual(f.positions(), positions);
  assert.deepEqual(f.reads, []);
});
test("committed history socket receipt survives a lost undo HTTP response", async () => {
  const f = fixture(),
    baseline = f.numbers(),
    chart = f.chart(),
    moved = await move(f, f.source, f.date(-2)),
    response = deferred();
  const undo = f.store.undoOperationChange(
      f.row(f.source, moved),
      () => response.promise,
    ),
    rejected = assert.rejects(undo, /network lost/);
  await tick();
  f.store.applyHistoryOperationChanges([
    { before: moved, after: { ...f.source, syncVersion: 3 } },
  ]);
  response.reject(Error("network lost"));
  await rejected;
  assert.deepEqual(f.numbers(), baseline);
  assert.deepEqual(f.chart(), chart);
  assert.equal(
    f.store.allKnownOperations.find((o) => o._id === "source").dateKey,
    f.source.dateKey,
  );
  assert.deepEqual(f.reads, []);
});
test("undo creation removes only that operation, including when socket confirms before a lost HTTP response", async () => {
  const f = fixture(),
    baseline = f.numbers(),
    response = deferred();
  const undo = f.store.undoOperationChange(
      { action: "created", operationId: "source" },
      () => response.promise,
    ),
    rejected = assert.rejects(undo, /network lost/);
  assert.equal(f.store.currentTotalBalance, baseline.current + 100);
  await tick();
  f.store.applyHistoryOperationChanges([{ before: f.source, after: null }]);
  response.reject(Error("network lost"));
  await rejected;
  assert.equal(
    f.store.allKnownOperations.some((o) => o._id === "source"),
    false,
  );
  assert.equal(f.store.currentTotalBalance, baseline.current + 100);
  assert.equal(f.store.allKnownOperations.length, f.operations.length - 1);
  assert.deepEqual(f.reads, []);
});
test("split date undo moves parent and shares through the existing edit path and preserves occupied neighbours", async () => {
  const f = fixture([
    (op) =>
      op("parent", -2, -400, {
        isSplitParent: true,
        excludeFromTotals: true,
        cellIndex: 2,
        projectId: null,
        splitMeta: [
          { projectId: "project", amount: -200 },
          { projectId: "second", amount: -200 },
        ],
      }),
    (op) =>
      op("child-a", -2, -200, {
        isSplitChild: true,
        parentOpId: "parent",
        cellIndex: 2,
      }),
    (op) =>
      op("child-b", -2, -200, {
        isSplitChild: true,
        parentOpId: "parent",
        projectId: "second",
        cellIndex: 2,
      }),
  ]);
  const baseline = f.numbers(),
    parent = f.operations.find((o) => o._id === "parent"),
    before = {
      ...parent,
      date: f.date(-3),
      dateKey: f.source.dateKey,
      cellIndex: 0,
    },
    response = deferred();
  const undo = f.store.undoOperationChange(
    f.row(before, parent),
    () => response.promise,
  );
  assert.equal(
    f.store
      .getOperationsForDay(f.source.dateKey)
      .find((o) => o._id === "source").cellIndex,
    0,
  );
  for (const id of ["parent", "child-a", "child-b"])
    assert.equal(
      f.store.allKnownOperations.find((o) => o._id === id).dateKey,
      f.source.dateKey,
    );
  await tick();
  const changes = f.operations
    .filter((o) => o._id === "parent" || o.parentOpId === "parent")
    .map((op) => ({
      before: op,
      after: {
        ...op,
        date: before.date,
        dateKey: before.dateKey,
        cellIndex: 1,
        syncVersion: 2,
      },
    }));
  response.resolve({ changes });
  await undo;
  for (const id of ["parent", "child-a", "child-b"])
    assert.equal(
      f.store.allKnownOperations.find((o) => o._id === id).cellIndex,
      1,
    );
  assert.deepEqual(f.numbers(), baseline);
  assert.deepEqual(f.reads, []);
});
for (const legacy of [false, true])
  test(`restoring ${legacy ? "legacy paired" : "single"} transfer restores both account legs once`, async () => {
    const f = fixture(),
      base = f.source;
    const merged = {
      ...base,
      _id: "transfer",
      type: "transfer",
      isTransfer: true,
      amount: 350,
      accountId: null,
      companyId: null,
      fromAccountId: "cash",
      fromCompanyId: "owner",
      toAccountId: "bank",
      toIndividualId: "person",
      ...(legacy ? { _id2: "transfer-out", transferGroupId: "pair" } : {}),
    };
    f.store.displayCache[base.dateKey] = [
      merged,
      ...f.store.displayCache[base.dateKey],
    ];
    f.store.calculationCache = copy(f.store.displayCache);
    const baseline = f.numbers(),
      chart = f.chart();
    axios.defaults.adapter = async () => ({ data: merged, status: 200 });
    await f.store.deleteOperation(merged);
    axios.defaults.adapter = async (config) => {
      f.reads.push(config);
      throw Error("Unexpected request");
    };
    const restored = legacy
      ? [
          {
            ...base,
            _id: "transfer",
            amount: 350,
            isTransfer: true,
            transferGroupId: "pair",
            accountId: "bank",
            individualId: "person",
            companyId: null,
            syncVersion: 2,
          },
          {
            ...base,
            _id: "transfer-out",
            amount: -350,
            isTransfer: true,
            transferGroupId: "pair",
            accountId: "cash",
            companyId: "owner",
            syncVersion: 2,
          },
        ]
      : [{ ...merged, syncVersion: 2 }];
    const changes = restored.map((after) => ({ before: null, after }));
    await f.store.undoOperationChange({ action: "deleted" }, async () => ({
      changes,
    }));
    f.store.applyHistoryOperationChanges(changes);
    assert.deepEqual(f.numbers(), baseline);
    assert.deepEqual(f.chart(), chart);
    assert.equal(
      f.store.allKnownOperations.filter((o) => o._id === "transfer").length,
      1,
    );
    assert.deepEqual(f.reads, []);
  });

test("another device applies the history receipt once while retaining every financial view", () => {
  const f = fixture(),
    baseline = f.numbers(),
    chart = f.chart(),
    positions = f.positions(),
    moved = {
      ...f.source,
      date: f.date(-2),
      dateKey: f.target.dateKey,
      cellIndex: 2,
      syncVersion: 2,
    };
  f.store.onSocketOperationUpdated(moved);
  const changes = [{ before: moved, after: { ...f.source, syncVersion: 3 } }];
  f.store.applyHistoryOperationChanges(changes);
  f.store.applyHistoryOperationChanges(changes);
  assert.deepEqual(f.numbers(), baseline);
  assert.deepEqual(f.chart(), chart);
  assert.deepEqual(f.positions(), positions);
  assert.deepEqual(f.reads, []);
});
test("split amount undo updates the shares once and never counts the excluded parent", async () => {
  const f = fixture([
    (op) =>
      op("parent", -2, -400, {
        isSplitParent: true,
        excludeFromTotals: true,
        projectId: null,
        splitMeta: [
          { projectId: "project", amount: -200 },
          { projectId: "second", amount: -200 },
        ],
      }),
    (op) =>
      op("share-a", -2, -200, { isSplitChild: true, parentOpId: "parent" }),
    (op) =>
      op("share-b", -2, -200, {
        isSplitChild: true,
        parentOpId: "parent",
        projectId: "second",
      }),
  ]);
  const current = f.numbers(),
    parent = f.operations.find((o) => o._id === "parent"),
    before = { ...parent, amount: -200 },
    changes = f.operations
      .filter((o) => o._id === "parent" || o.parentOpId === "parent")
      .map((op) => ({
        before: op,
        after: { ...op, amount: op.amount / 2, syncVersion: 2 },
      }));
  await f.store.undoOperationChange(
    f.row(before, parent, ["amount"]),
    async () => ({ changes }),
  );
  f.store.applyHistoryOperationChanges(changes);
  assert.equal(f.store.currentTotalBalance, current.current + 200);
  assert.equal(f.store.futureTotalBalance, current.future + 200);
  assert.equal(
    f.store.allKnownOperations.find((o) => o._id === "share-a").amount,
    -100,
  );
  assert.deepEqual(f.reads, []);
});

test("an unloaded operation uses the server before-state for its cash delta without loading all history", async () => {
  const f = fixture(),
    snapshot = {
      timestamp: new Date().toISOString(),
      accountBalances: { cash: 500 },
      companyBalances: { owner: 500 },
      individualBalances: {},
      contractorBalances: {},
      projectBalances: {},
      categoryTotals: {},
    };
  axios.defaults.adapter = async () => ({ data: snapshot, status: 200 });
  await f.store.fetchSnapshot();
  axios.defaults.adapter = async (config) => {
    f.reads.push(config);
    throw Error("Unexpected request");
  };
  const before = f.op("unloaded", -400, -100),
    after = { ...before, amount: -200, syncVersion: 2 };
  f.store.applyHistoryOperationChanges([{ before, after }]);
  assert.equal(
    f.store.checkInsufficientFunds("cash", 1e9).currentBalance,
    10400,
  );
  f.store.applyHistoryOperationChanges([{ before, after }]);
  assert.equal(
    f.store.checkInsufficientFunds("cash", 1e9).currentBalance,
    10400,
  );
  assert.deepEqual(f.reads, []);
});
test("an unloaded deletion applies its actual cash delta once", async () => {
  const f = fixture(),
    snapshot = {
      timestamp: new Date().toISOString(),
      accountBalances: { cash: 500 },
      companyBalances: { owner: 500 },
      individualBalances: {},
      contractorBalances: {},
      projectBalances: {},
      categoryTotals: {},
    };
  axios.defaults.adapter = async () => ({ data: snapshot, status: 200 });
  await f.store.fetchSnapshot();
  axios.defaults.adapter = async (config) => {
    f.reads.push(config);
    throw Error("Unexpected request");
  };
  const before = f.op("unloaded", -400, -100);
  f.store.applyHistoryOperationChanges([{ before, after: null }]);
  assert.equal(
    f.store.checkInsufficientFunds("cash", 1e9).currentBalance,
    10600,
  );
  f.store.applyHistoryOperationChanges([{ before, after: null }]);
  assert.equal(
    f.store.checkInsufficientFunds("cash", 1e9).currentBalance,
    10600,
  );
  assert.deepEqual(f.reads, []);
});

test("a delayed receipt from a workspace the user has left cannot enter the current caches", () => {
  const f = fixture(),
    baseline = f.numbers(),
    positions = f.positions();
  f.store.user.currentWorkspaceId = "current-workspace";
  f.store.applyHistoryOperationChanges(
    [
      {
        before: f.source,
        after: { ...f.source, amount: -500, syncVersion: 2 },
      },
    ],
    "previous-workspace",
  );
  assert.deepEqual(f.numbers(), baseline);
  assert.deepEqual(f.positions(), positions);
  assert.deepEqual(f.reads, []);
});
