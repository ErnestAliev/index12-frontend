// src/utils/tooltipSnapshotBuilder.js
// Build deterministic tooltip snapshot (single source of truth for AI numeric answers).

const ISO_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const extractId = (entityOrId) => {
  if (!entityOrId) return '';
  if (typeof entityOrId === 'object') return String(entityOrId._id || entityOrId.id || '');
  return String(entityOrId);
};

const toDateKey = (dateLike) => {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fromDateKey = (dateKey) => {
  const m = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
};

const parseLocalDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
};

const parseStoreDateKey = (mainStore, dateKey) => {
  if (!dateKey) return null;

  const iso = fromDateKey(String(dateKey));
  if (iso) return iso;

  if (typeof mainStore?._parseDateKey === 'function') {
    const parsed = mainStore._parseDateKey(String(dateKey));
    if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0);
    }
  }

  const m = String(dateKey).match(/^(\d{4})-(\d{1,3})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const dayOfYear = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(dayOfYear)) return null;
  const d = new Date(year, 0, 1, 12, 0, 0, 0);
  d.setDate(dayOfYear);
  return Number.isNaN(d.getTime()) ? null : d;
};

const addDays = (date, diff) => {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(diff || 0));
  return d;
};

const resolveRangeByPeriodFilter = ({ periodFilter, asOf }) => {
  const asOfDate = parseLocalDate(asOf) || new Date();

  if (periodFilter?.mode === 'custom' && periodFilter?.customStart && periodFilter?.customEnd) {
    const start = parseLocalDate(periodFilter.customStart);
    const end = parseLocalDate(periodFilter.customEnd);
    if (start && end) {
      return {
        startDateKey: toDateKey(start),
        endDateKey: toDateKey(end)
      };
    }
  }

  const start = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1, 12, 0, 0, 0);
  const end = new Date(asOfDate.getFullYear(), asOfDate.getMonth() + 1, 0, 12, 0, 0, 0);
  return {
    startDateKey: toDateKey(start),
    endDateKey: toDateKey(end)
  };
};

const dateLabelRu = (dateKey) => {
  const d = fromDateKey(dateKey);
  if (!d) return String(dateKey || '?');
  return d.toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const buildDayKeysInRange = (startDateKey, endDateKey) => {
  const start = fromDateKey(startDateKey);
  const end = fromDateKey(endDateKey);
  if (!start || !end || start.getTime() > end.getTime()) return [];

  const keys = [];
  for (let d = new Date(start); d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    keys.push(toDateKey(d));
  }
  return keys;
};

const isPersonalTransferWithdrawal = (op) => !!op
  && op.transferPurpose === 'personal'
  && op.transferReason === 'personal_use'
  && (op.isWithdrawal === true || op.isTransfer === true || op.type === 'transfer');

const isTransferLike = (op) => !!op && (op.isTransfer === true || op.type === 'transfer');

const resolveVisibilityMode = (mainStore, visibilityMode) => {
  const raw = String(visibilityMode || mainStore?.accountVisibilityMode || 'all').toLowerCase();
  if (raw === 'open' || raw === 'hidden' || raw === 'all') return raw;
  return 'all';
};

const buildAccountMaps = (accounts) => {
  const byId = new Map();
  (Array.isArray(accounts) ? accounts : []).forEach((acc) => {
    const id = String(acc?._id || acc?.id || '');
    if (!id) return;
    byId.set(id, {
      id,
      name: String(acc?.name || 'Счет'),
      isExcluded: !!acc?.isExcluded,
      initialBalance: toNum(acc?.initialBalance),
    });
  });
  return byId;
};

const isAccountAllowedByMode = (account, visibilityMode) => {
  if (!account) return false;
  if (visibilityMode === 'all') return true;
  if (visibilityMode === 'open') return !account.isExcluded;
  if (visibilityMode === 'hidden') return !!account.isExcluded;
  return true;
};

const opMatchesVisibilityMode = (op, visibilityMode, accountById) => {
  if (!op) return false;
  if (visibilityMode === 'all') return true;

  const linkedAccountIds = [
    extractId(op.accountId),
    extractId(op.fromAccountId),
    extractId(op.toAccountId)
  ].filter(Boolean);

  if (!linkedAccountIds.length) return true;

  return linkedAccountIds.some((id) => {
    const account = accountById.get(String(id));
    if (!account) return true;
    return isAccountAllowedByMode(account, visibilityMode);
  });
};

const isOpVisibleForSnapshot = (mainStore, op, visibilityMode, accountById) => {
  if (!op) return false;
  if (op.isDeleted) return false;
  if (op.excludeFromTotals && !op.offsetIncomeId) return false;
  if (op.isSplitParent) return false;

  return opMatchesVisibilityMode(op, visibilityMode, accountById);
};

const normalizeAmountForType = (op) => {
  const raw = toNum(op?.amount);
  if (isTransferLike(op)) return Math.abs(raw);
  if (op?.isWithdrawal || op?.type === 'expense') return -Math.abs(raw);
  if (op?.type === 'income') return raw;
  return raw;
};

const listEntryFromOperation = (mainStore, op) => {
  if (!op) return null;

  if (isTransferLike(op)) {
    const outOfSystem = isPersonalTransferWithdrawal(op);
    return {
      isTransfer: true,
      isOutOfSystemTransfer: outOfSystem,
      fromAccName: op.fromAccountId?.name || op.accountId?.name || '???',
      toAccName: outOfSystem
        ? (op.destination || 'Вне системы')
        : (op.toAccountId?.name || '???'),
      amount: Math.abs(toNum(op.amount)),
      desc: op.description || ''
    };
  }

  const isTax = typeof mainStore?._isTaxPayment === 'function' ? mainStore._isTaxPayment(op) : false;
  const isCredit = typeof mainStore?._isCreditIncome === 'function' ? mainStore._isCreditIncome(op) : false;

  let catName = op.categoryId?.name || 'Без категории';
  if (isTax) {
    catName = 'Налог';
  } else if (op.isClosed) {
    catName = 'Сделка закрыта (Факт)';
  } else if (isCredit) {
    catName = 'Кредит';
  } else if (op.isWithdrawal) {
    catName = 'Вывод средств';
  } else if (op.type === 'income') {
    const prepayIds = Array.isArray(mainStore?.getPrepaymentCategoryIds)
      ? mainStore.getPrepaymentCategoryIds
      : [];
    const catId = extractId(op.categoryId);
    const prepId = extractId(op.prepaymentId);
    const indId = extractId(op.counterpartyIndividualId);
    const retailId = extractId(mainStore?.retailIndividualId);
    const isRetailPrepay = retailId && indId && String(retailId) === String(indId);
    const isPrepayCategory = (catId && prepayIds.includes(catId))
      || (prepId && prepayIds.includes(prepId))
      || !!op?.categoryId?.isPrepayment;

    if (isRetailPrepay || isPrepayCategory) {
      catName = isRetailPrepay ? 'Предоплата (Розница)' : 'Предоплата / Транш';
    }
  }

  let compName = '---';
  if (isTax) {
    compName = op.companyId?.name || op.individualId?.name || 'Компания';
  }

  return {
    isIncome: op.type === 'income',
    isWithdrawal: !!op.isWithdrawal,
    isTax,
    accName: op.accountId?.name || '???',
    contName: op.contractorId?.name || op.counterpartyIndividualId?.name || '---',
    projName: op.projectId?.name || '---',
    catName,
    amount: normalizeAmountForType(op),
    compName,
    desc: op.description || ''
  };
};

const classifyDayOperations = (mainStore, operations) => {
  const incomeOps = [];
  const expenseOps = [];
  const withdrawalOps = [];
  const transferOps = [];

  (Array.isArray(operations) ? operations : []).forEach((op) => {
    if (!op || op.isDeleted) return;

    if (isTransferLike(op)) {
      transferOps.push(op);
      return;
    }

    if (op.isWithdrawal) {
      withdrawalOps.push(op);
      return;
    }

    if (op.type === 'expense') {
      if (typeof mainStore?._isRetailWriteOff === 'function' && mainStore._isRetailWriteOff(op)) return;
      expenseOps.push(op);
      return;
    }

    if (op.type === 'income') {
      incomeOps.push(op);
    }
  });

  return {
    income: incomeOps,
    expense: expenseOps,
    withdrawal: withdrawalOps,
    transfer: transferOps
  };
};

const calculateDayTotals = (mainStore, operations) => {
  let income = 0;
  let expense = 0;

  (Array.isArray(operations) ? operations : []).forEach((op) => {
    if (!op) return;
    const absAmt = Math.abs(toNum(op.amount));
    const outOfSystem = isPersonalTransferWithdrawal(op);

    if (isTransferLike(op) && outOfSystem) {
      expense += absAmt;
      return;
    }

    if (op.isWithdrawal) {
      expense += absAmt;
      return;
    }

    if (op.type === 'expense') {
      if (typeof mainStore?._isRetailWriteOff === 'function' && mainStore._isRetailWriteOff(op)) return;
      if (typeof mainStore?._isInterCompanyOp === 'function' && mainStore._isInterCompanyOp(op)) return;
      expense += absAmt;
      return;
    }

    if (op.type === 'income') {
      income += absAmt;
    }
  });

  return { income, expense };
};

const applyOperationToRunningBalances = (runningByAccountId, op, options = {}) => {
  if (!op) return;
  const { mainStore, visibility = 'all', accountById = new Map() } = options;

  const addDelta = (accountId, delta) => {
    const key = String(accountId || '');
    if (!key || !runningByAccountId.has(key)) return;
    const prev = toNum(runningByAccountId.get(key));
    runningByAccountId.set(key, prev + toNum(delta));
  };

  if (isTransferLike(op)) {
    const amount = Math.abs(toNum(op.amount));
    const fromId = extractId(op.fromAccountId);
    const toId = extractId(op.toAccountId);

    if (fromId) addDelta(fromId, -amount);
    if (!isPersonalTransferWithdrawal(op) && toId) addDelta(toId, amount);
    return;
  }

  // Align with GraphRenderer tooltip logic:
  // regular income/expense/withdrawal affect running balances only if op is visible in current mode.
  if (!isOpVisibleForSnapshot(mainStore, op, visibility, accountById)) return;

  const accountId = extractId(op.accountId);
  if (!accountId) return;

  if (op.isWithdrawal || op.type === 'expense') {
    addDelta(accountId, -Math.abs(toNum(op.amount)));
    return;
  }

  if (op.type === 'income') {
    addDelta(accountId, toNum(op.amount));
  }
};

export async function buildTooltipSnapshotForRange({
  mainStore,
  periodFilter = null,
  asOf = null,
  visibilityMode = null,
}) {
  if (!mainStore) {
    throw new Error('mainStore is required for tooltip snapshot builder');
  }

  const range = resolveRangeByPeriodFilter({ periodFilter, asOf });
  const startDateKey = range.startDateKey;
  const endDateKey = range.endDateKey;

  if (!ISO_DATE_KEY_RE.test(startDateKey) || !ISO_DATE_KEY_RE.test(endDateKey)) {
    throw new Error('Invalid range for tooltip snapshot');
  }

  const rangeStartDate = fromDateKey(startDateKey);
  const rangeEndDate = fromDateKey(endDateKey);
  if (!rangeStartDate || !rangeEndDate) {
    throw new Error('Failed to parse date range for tooltip snapshot');
  }

  const userMinDate = parseLocalDate(mainStore?.user?.minEventDate || mainStore?.user?.createdAt);
  const preloadStart = userMinDate && userMinDate.getTime() < rangeStartDate.getTime()
    ? userMinDate
    : rangeStartDate;

  if (typeof mainStore.fetchOperationsRange === 'function') {
    await mainStore.fetchOperationsRange(preloadStart, rangeEndDate, { sparse: true });
  }

  const accounts = Array.isArray(mainStore.accounts) ? mainStore.accounts : [];
  const accountById = buildAccountMaps(accounts);
  const visibility = resolveVisibilityMode(mainStore, visibilityMode);

  const runningByAccountId = new Map();
  accountById.forEach((acc, id) => {
    runningByAccountId.set(id, toNum(acc.initialBalance));
  });

  const calcCache = mainStore?.calculationCache?.value || mainStore?.calculationCache || {};
  const opsByIsoDateKey = new Map();

  Object.entries(calcCache || {}).forEach(([rawDateKey, rawOps]) => {
    const parsedDate = parseStoreDateKey(mainStore, rawDateKey);
    if (!parsedDate) return;
    const isoDateKey = toDateKey(parsedDate);
    if (!isoDateKey || isoDateKey > endDateKey) return;

    const list = Array.isArray(rawOps) ? rawOps : [];
    if (!opsByIsoDateKey.has(isoDateKey)) {
      opsByIsoDateKey.set(isoDateKey, []);
    }
    opsByIsoDateKey.get(isoDateKey).push(...list);
  });

  const sortedKeys = Array.from(opsByIsoDateKey.keys()).sort((a, b) => a.localeCompare(b));

  let ptr = 0;
  while (ptr < sortedKeys.length && sortedKeys[ptr] < startDateKey) {
    const key = sortedKeys[ptr];
    const dayOps = opsByIsoDateKey.get(key) || [];
    dayOps.forEach((op) => applyOperationToRunningBalances(runningByAccountId, op, {
      mainStore,
      visibility,
      accountById
    }));
    ptr += 1;
  }

  const days = [];
  const dayKeysInRange = buildDayKeysInRange(startDateKey, endDateKey);

  dayKeysInRange.forEach((dayKey) => {
    while (ptr < sortedKeys.length && sortedKeys[ptr] === dayKey) {
      const key = sortedKeys[ptr];
      const dayOps = opsByIsoDateKey.get(key) || [];
      dayOps.forEach((op) => applyOperationToRunningBalances(runningByAccountId, op, {
        mainStore,
        visibility,
        accountById
      }));
      ptr += 1;
    }

    const opsForDayRaw = opsByIsoDateKey.get(dayKey) || [];

    const visibleOps = (Array.isArray(opsForDayRaw) ? opsForDayRaw : [])
      .filter((op) => isOpVisibleForSnapshot(mainStore, op, visibility, accountById));

    const classified = classifyDayOperations(mainStore, visibleOps);
    const totals = calculateDayTotals(mainStore, visibleOps);

    const accountBalances = [];
    accountById.forEach((acc, id) => {
      if (!isAccountAllowedByMode(acc, visibility)) return;
      const current = Math.max(0, toNum(runningByAccountId.get(id)));
      accountBalances.push({
        accountId: id,
        name: acc.name,
        balance: current,
        isOpen: !acc.isExcluded
      });
    });

    const totalBalance = accountBalances.reduce((sum, acc) => sum + toNum(acc.balance), 0);

    days.push({
      dateKey: dayKey,
      dateLabel: dateLabelRu(dayKey),
      totalBalance,
      accountBalances,
      totals,
      lists: {
        income: classified.income.map((op) => listEntryFromOperation(mainStore, op)).filter(Boolean),
        expense: classified.expense.map((op) => listEntryFromOperation(mainStore, op)).filter(Boolean),
        withdrawal: classified.withdrawal.map((op) => listEntryFromOperation(mainStore, op)).filter(Boolean),
        transfer: classified.transfer.map((op) => listEntryFromOperation(mainStore, op)).filter(Boolean)
      }
    });
  });

  return {
    schemaVersion: 1,
    range: {
      startDateKey,
      endDateKey
    },
    visibilityMode: visibility,
    days
  };
}

export default {
  buildTooltipSnapshotForRange
};
