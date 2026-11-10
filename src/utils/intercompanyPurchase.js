import { equalProjectShares } from "./projectScope.js";
const idOf = (value) => String(value?._id || value || "");
export function purchaseCell(operations, desired, groupId) {
  const used = new Set(
    operations
      .filter((op) => op.purchaseGroupId !== groupId)
      .map((op) => op.cellIndex),
  );
  const start = Math.max(
    0,
    Math.min(30, Number.isInteger(desired) ? desired : 0),
  );
  for (const i of [
    ...Array.from({ length: 31 - start }, (_, n) => start + n),
    ...Array.from({ length: start }, (_, n) => n),
  ])
    if (!used.has(i) && !used.has(i + 1)) return i;
  throw Error("На выбранный день нет двух соседних свободных ячеек.");
}
export function previewPurchase(
  operations,
  source,
  patch,
  accounts,
  date,
  dateKey,
  base,
) {
  const expense = operations.find(
      (op) => op.type === "expense" && !op.isSplitChild,
    ),
    income = operations.find((op) => op.type === "income" && !op.isSplitChild);
  if (!expense || !income)
    throw Error("Не удалось загрузить связанную пару операций. Обновите день.");
  const fromId =
    source.type === "expense"
      ? (patch.accountId ?? expense.accountId)
      : (patch.purchaseAccountId ?? expense.accountId);
  const toId =
    source.type === "income"
      ? (patch.accountId ?? income.accountId)
      : (patch.purchaseAccountId ?? income.accountId);
  const from = accounts.find((account) => idOf(account._id) === idOf(fromId)),
    to = accounts.find((account) => idOf(account._id) === idOf(toId));
  const amount = Math.abs(Number(patch.amount ?? source.amount));
  const common = Object.fromEntries(
    [
      "description",
      "comment",
      "categoryId",
      "categoryIds",
      "subcategoryId",
      "projectId",
      "projectScope",
      "isClosed",
    ]
      .filter((key) => Object.hasOwn(patch, key))
      .map((key) => [key, patch[key]]),
  );
  return operations.map((op) => {
    const owner = op.type === "expense" ? from : to,
      other = op.type === "expense" ? to : from,
      root = op.type === "expense" ? expense : income;
    const shares = root.isSplitParent
      ? equalProjectShares(
          root.splitMeta.map((share) => idOf(share.projectId)),
          op.type === "expense" ? -amount : amount,
        )
      : [];
    const value = op.isSplitChild
      ? (shares.find((share) => idOf(share.projectId) === idOf(op.projectId))
          ?.amount ?? op.amount)
      : op.type === "expense"
        ? -amount
        : amount;
    return {
      ...op,
      ...common,
      date,
      dateKey,
      cellIndex: base + (op.type === "income" ? 1 : 0),
      amount: value,
      accountId: owner?._id || op.accountId,
      companyId: owner?.companyId || null,
      individualId: owner?.individualId || null,
      counterpartyCompanyId: other?.companyId || null,
      counterpartyIndividualId: other?.individualId || null,
      fromAccountId: from?._id || fromId,
      toAccountId: to?._id || toId,
      fromCompanyId: from?.companyId || null,
      toCompanyId: to?.companyId || null,
      fromIndividualId: from?.individualId || null,
      toIndividualId: to?.individualId || null,
    };
  });
}
