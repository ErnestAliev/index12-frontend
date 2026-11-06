import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountLabel,
  accountRequestForecast,
  liveRequestCosts,
} from "../src/utils/teamCashForecast.js";
test("account and owner use one label", () =>
  assert.equal(
    accountLabel({ name: "BCC UU", companyId: "c" }, [
      { _id: "c", name: "ТОО UU" },
    ]),
    "BCC UU / ТОО UU",
  ));
test("all and today's balances use live requests once, including a just-enriched request", () => {
  const account = { _id: "a", companyId: "c", balanceCents: 100000 };
  const request = {
    _id: "r",
    state: "manager_review",
    companyId: "c",
    dueDate: "2026-11-06",
    amountCents: 10000,
    placement: { accountId: "a" },
  };
  const future = {
    ...request,
    _id: "future",
    dueDate: "2026-11-07",
    amountCents: 20000,
  };
  const costs = liveRequestCosts(
    [request, future],
    [
      { ...request, amountCents: 15000 },
      { ...request, _id: "new", amountCents: 90000 },
    ],
  );
  let result = accountRequestForecast(account, costs, "2026-11-06");
  assert.equal(result.afterRequestsCents, -25000);
  assert.equal(result.afterDueRequestsCents, -5000);
  result = accountRequestForecast(
    account,
    liveRequestCosts(costs, [{ ...request, state: "rejected" }]),
    "2026-11-06",
  );
  assert.equal(result.afterDueRequestsCents, 10000);
  assert.equal(
    accountRequestForecast(
      account,
      [
        { ...request, operationId: "saved" },
        { ...request, placement: { accountId: "other" } },
      ],
      "2026-11-06",
    ).requestedCents,
    0,
  );
});
test("today and month-end horizons include overdue requests and exclude later months", () => {
  const account = { _id: "a", companyId: "c", balanceCents: 10000 };
  for (const [today, monthEnd, nextMonth] of [
    ["2026-11-06", "2026-11-30", "2026-12-01"],
    ["2026-12-31", "2026-12-31", "2027-01-01"],
    ["2028-02-28", "2028-02-29", "2028-03-01"],
  ]) {
    const request = {
      state: "manager_review",
      companyId: "c",
      placement: { accountId: "a" },
      amountCents: 3000,
    };
    const result = accountRequestForecast(
      account,
      [
        { ...request, dueDate: "2025-12-31" },
        { ...request, dueDate: today },
        { ...request, dueDate: monthEnd },
        { ...request, dueDate: nextMonth },
        { ...request, dueDate: monthEnd, state: "rejected" },
        { ...request, dueDate: monthEnd, operationId: "saved" },
        { ...request, dueDate: monthEnd, companyId: "other" },
        { ...request, dueDate: monthEnd, placement: { accountId: "other" } },
      ],
      today,
    );
    assert.equal(
      result.afterDueRequestsCents,
      today === monthEnd ? 1000 : 4000,
    );
    assert.equal(result.afterMonthRequestsCents, 1000);
    assert.equal(result.monthRequestedCents, 9000);
    assert.equal(result.afterRequestsCents, -2000);
  }
});
