import { test } from "node:test";
import assert from "node:assert/strict";
import { ref, effectScope, nextTick } from "vue";
import { useManagedCounterparty } from "../src/composables/useManagedCounterparty.js";
import {
  purchaseCell,
  previewPurchase,
} from "../src/utils/intercompanyPurchase.js";
const companies = [
    { _id: "a", name: "UUU" },
    { _id: "b", name: "YYY" },
  ],
  individuals = [{ _id: "person", name: "Владелец" }];
const accounts = [
  { _id: "a1", companyId: "a" },
  { _id: "a2", companyId: "a" },
  { _id: "b1", companyId: "b" },
  { _id: "b2", companyId: "b" },
  { _id: "p1", individualId: "person" },
  { _id: "broken", companyId: "missing" },
];
test("managed counterparty uses actual owners, excludes the payer and requires a receiving account when several exist", async () => {
  const scope = effectScope(),
    selected = ref("ownc_b"),
    accountId = ref("a1");
  let model;
  scope.run(
    () =>
      (model = useManagedCounterparty({
        store: { companies, individuals, accounts },
        selected,
        accountId,
        operation: () => null,
        canChoose: () => true,
        canAccess: (id) => id !== "b2",
        direction: "expense",
      })),
  );
  assert.deepEqual(
    model.ownOptions.value.map((row) => row.value),
    ["ownc_b", "owni_person"],
  );
  selected.value = "owni_person";
  await nextTick();
  assert.equal(model.peerAccountId.value, "p1");
  assert.equal(model.validate(), null);
  selected.value = "ownc_b";
  await nextTick();
  assert.equal(model.peerAccountId.value, "b1");
  assert.equal(model.validate(), null);
  accountId.value = "b1";
  await nextTick();
  assert.match(model.validate(), /другого владельца/);
  scope.stop();
});
test("editing restores a precise peer account and cannot detach an existing pair", async () => {
  const scope = effectScope(),
    selected = ref(null),
    accountId = ref("a1");
  let model;
  scope.run(
    () =>
      (model = useManagedCounterparty({
        store: { companies, individuals, accounts },
        selected,
        accountId,
        operation: () => ({ purchaseGroupId: "pair" }),
        canChoose: () => true,
        canAccess: () => true,
        direction: "expense",
      })),
  );
  model.restore({
    purchaseGroupId: "pair",
    counterpartyCompanyId: { _id: "b" },
    toAccountId: { _id: "b2" },
  });
  await nextTick();
  assert.equal(selected.value, "ownc_b");
  assert.equal(model.peerAccountId.value, "b2");
  assert.equal(model.validate(), null);
  selected.value = "contr_external";
  await nextTick();
  assert.match(model.validate(), /связанной операции/);
  scope.stop();
});
test("a pair always reserves two adjacent visible rows and does not cover other operations", () => {
  assert.equal(
    purchaseCell([{ cellIndex: 0 }, { cellIndex: 2 }], 0, "pair"),
    3,
  );
  assert.equal(
    purchaseCell(
      [
        { cellIndex: 30, purchaseGroupId: "pair" },
        { cellIndex: 31, purchaseGroupId: "pair" },
      ],
      31,
      "pair",
    ),
    30,
  );
  assert.throws(
    () =>
      purchaseCell(
        Array.from({ length: 16 }, (_, i) => ({ cellIndex: i * 2 })),
        0,
        "pair",
      ),
    /соседних/,
  );
});
test("editing the income previews both signed amounts, owner routes and row offsets without mutating the originals", () => {
  const rows = [
      {
        _id: "expense",
        type: "expense",
        amount: -100,
        accountId: "a1",
        purchaseGroupId: "pair",
      },
      {
        _id: "income",
        type: "income",
        amount: 100,
        accountId: "b1",
        purchaseGroupId: "pair",
      },
    ],
    date = new Date("2026-11-11T07:00:00Z");
  const result = previewPurchase(
    rows,
    rows[1],
    { amount: 1234.56, purchaseAccountId: "a2", description: "Общее" },
    accounts,
    date,
    "2026-315",
    5,
  );
  assert.deepEqual(
    result.map((row) => row.amount),
    [-1234.56, 1234.56],
  );
  assert.deepEqual(
    result.map((row) => row.cellIndex),
    [5, 6],
  );
  assert.deepEqual(
    result.map((row) => row.accountId),
    ["a2", "b1"],
  );
  assert.deepEqual(
    result.map((row) => row.companyId),
    ["a", "b"],
  );
  assert.deepEqual(
    result.map((row) => row.counterpartyCompanyId),
    ["b", "a"],
  );
  assert.ok(
    result.every(
      (row) => row.description === "Общее" && row.dateKey === "2026-315",
    ),
  );
  assert.equal(rows[0].amount, -100);
});
