export function accountLabel(account, companies = []) {
  const owner =
    account.ownerName ||
    companies.find((c) => String(c._id) === String(account.companyId))?.name;
  return [account.name, owner].filter(Boolean).join(" / ");
}
export function liveRequestCosts(snapshot = [], requests = []) {
  return [
    ...new Map([...snapshot, ...requests].map((r) => [r._id, r])).values(),
  ];
}
export function accountRequestForecast(account, requests, asOf) {
  const active = requests.filter(
    (r) =>
      ["manager_review", "director_review", "ready"].includes(r.state) &&
      !r.operationId &&
      String(r.placement?.accountId || "") === String(account._id) &&
      String(r.companyId || "") === String(account.companyId || ""),
  );
  const requestedCents = active.reduce((sum, r) => sum + r.amountCents, 0),
    approvedCents = active
      .filter((r) => r.state === "ready")
      .reduce((sum, r) => sum + r.amountCents, 0),
    dueRequestedCents = active
      .filter((r) => r.dueDate <= asOf)
      .reduce((sum, r) => sum + r.amountCents, 0),
    monthRequestedCents = active
      .filter((r) => r.dueDate.slice(0, 7) <= asOf.slice(0, 7))
      .reduce((sum, r) => sum + r.amountCents, 0);
  return {
    ...account,
    requestedCents,
    approvedCents,
    pendingCents: requestedCents - approvedCents,
    dueRequestedCents,
    monthRequestedCents,
    afterRequestsCents: account.balanceCents - requestedCents,
    afterDueRequestsCents: account.balanceCents - dueRequestedCents,
    afterMonthRequestsCents: account.balanceCents - monthRequestedCents,
  };
}
