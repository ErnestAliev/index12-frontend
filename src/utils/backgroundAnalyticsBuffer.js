import { buildTooltipSnapshotForRange } from '@/utils/tooltipSnapshotBuilder.js';

const DEFAULT_PAST_MONTHS = 3;
const DEFAULT_FUTURE_MONTHS = 3;
const LAZY_PREFETCH_MIN_MS = 5000;
const LAZY_PREFETCH_MAX_MS = 7000;
const MUTATION_REBUILD_DELAY_MS = 350;

const bufferState = {
  entriesByPeriod: new Map(),
  generatedAt: '',
  lastBuildReason: '',
  stale: true,
  buildInFlight: null,
  scheduledTimer: null,
};

const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toPositiveMoney = (value) => Math.abs(toNum(value));

const pad2 = (value) => String(Number(value || 0)).padStart(2, '0');

const toDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const toPeriodKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
};

const startOfMonth = (dateLike) => {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
};

const endOfMonth = (dateLike) => {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
};

const shiftMonth = (dateLike, months) => {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth() + Number(months || 0), 1, 12, 0, 0, 0);
};

const normalizeCategoryKey = (value) => String(value || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^a-zа-я0-9]+/gi, '')
  .replace(/(.)\1+/g, '$1')
  .trim();

const NON_OPERATIONAL_CATEGORIES = ['Вывод средств', 'Перевод'];
const NON_OPERATIONAL_CATEGORY_KEYS = NON_OPERATIONAL_CATEGORIES
  .map((item) => normalizeCategoryKey(item))
  .filter(Boolean);

const isNonOperationalCategory = (value) => {
  const key = normalizeCategoryKey(value);
  if (!key) return false;
  return NON_OPERATIONAL_CATEGORY_KEYS.some((baseKey) => (
    key === baseKey || key.includes(baseKey) || baseKey.includes(key)
  ));
};

const normalizeDepth = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(12, Math.round(n)));
};

const dateFromPeriodFilter = (periodFilter) => {
  if (!periodFilter || typeof periodFilter !== 'object') return null;

  if (periodFilter.mode === 'custom') {
    const fromStart = periodFilter.customStart ? new Date(periodFilter.customStart) : null;
    if (fromStart instanceof Date && !Number.isNaN(fromStart.getTime())) return fromStart;

    const fromEnd = periodFilter.customEnd ? new Date(periodFilter.customEnd) : null;
    if (fromEnd instanceof Date && !Number.isNaN(fromEnd.getTime())) return fromEnd;
  }

  return null;
};

const resolveCenterMonthDate = ({ mainStore, periodFilter = null }) => {
  const filterDate = dateFromPeriodFilter(periodFilter || mainStore?.periodFilter);
  const refDate = filterDate || new Date();
  return startOfMonth(refDate) || startOfMonth(new Date());
};

const buildMonthDescriptors = ({ centerMonthDate, pastMonths, futureMonths }) => {
  const past = normalizeDepth(pastMonths, DEFAULT_PAST_MONTHS);
  const future = normalizeDepth(futureMonths, DEFAULT_FUTURE_MONTHS);
  const center = startOfMonth(centerMonthDate) || startOfMonth(new Date());

  const list = [];
  for (let offset = -past; offset <= future; offset += 1) {
    const monthDate = shiftMonth(center, offset);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    if (!monthStart || !monthEnd) continue;

    list.push({
      offsetMonths: offset,
      relation: offset < 0 ? 'past' : (offset > 0 ? 'future' : 'current'),
      period: toPeriodKey(monthStart),
      startDateKey: toDateKey(monthStart),
      endDateKey: toDateKey(monthEnd),
      startIso: monthStart.toISOString(),
      endIso: monthEnd.toISOString(),
    });
  }

  return list;
};

const getDaysForRange = ({ allDays, startDateKey, endDateKey }) => {
  return (Array.isArray(allDays) ? allDays : []).filter((day) => {
    const key = String(day?.dateKey || '');
    return key >= startDateKey && key <= endDateKey;
  });
};

const pushByCategory = (map, name, amount) => {
  const value = toPositiveMoney(amount);
  if (value <= 0) return;
  const key = String(name || 'Без категории');
  map.set(key, toNum(map.get(key)) + value);
};

const mapToSortedRows = (map) => {
  return Array.from(map.entries())
    .map(([category, amount]) => ({
      category: String(category || 'Без категории'),
      amount: toNum(amount),
    }))
    .sort((a, b) => toNum(b?.amount) - toNum(a?.amount));
};

const aggregatePeriodDays = ({ days }) => {
  let income = 0;
  let operationalExpense = 0;
  const topCategoryMap = new Map();
  const ownerDrawByCategoryMap = new Map();

  const pushExpense = (categoryName, amountValue) => {
    const amount = toPositiveMoney(amountValue);
    if (amount <= 0) return;
    const category = String(categoryName || 'Без категории');
    if (isNonOperationalCategory(category)) {
      pushByCategory(ownerDrawByCategoryMap, category, amount);
      return;
    }
    operationalExpense += amount;
    pushByCategory(topCategoryMap, category, amount);
  };

  (Array.isArray(days) ? days : []).forEach((day) => {
    const lists = day?.lists || {};
    (Array.isArray(lists?.income) ? lists.income : []).forEach((item) => {
      income += toPositiveMoney(item?.amount);
    });

    (Array.isArray(lists?.expense) ? lists.expense : []).forEach((item) => {
      pushExpense(item?.catName || 'Без категории', item?.amount);
    });

    (Array.isArray(lists?.withdrawal) ? lists.withdrawal : []).forEach((item) => {
      pushExpense(item?.catName || 'Вывод средств', item?.amount);
    });

    (Array.isArray(lists?.transfer) ? lists.transfer : []).forEach((item) => {
      if (!item?.isOutOfSystemTransfer) return;
      pushExpense(item?.catName || 'Перевод', item?.amount);
    });
  });

  const ownerDrawByCategory = mapToSortedRows(ownerDrawByCategoryMap);
  const ownerDrawAmount = ownerDrawByCategory.reduce((sum, row) => sum + toNum(row?.amount), 0);
  const topCategoriesRaw = mapToSortedRows(topCategoryMap);
  const operationalExpenseSafe = toNum(operationalExpense);
  const topCategories = topCategoriesRaw.slice(0, 5).map((row) => ({
    category: String(row?.category || 'Без категории'),
    amount: toNum(row?.amount),
    sharePct: operationalExpenseSafe > 0
      ? Math.round((toNum(row?.amount) / operationalExpenseSafe) * 10000) / 100
      : 0
  }));

  const lastDay = (Array.isArray(days) ? days : [])[days.length - 1] || null;
  const balances = Array.isArray(lastDay?.accountBalances) ? lastDay.accountBalances : [];
  const endOpen = balances
    .filter((acc) => acc?.isOpen === true)
    .reduce((sum, acc) => sum + toNum(acc?.balance), 0);
  const endHidden = balances
    .filter((acc) => acc?.isOpen !== true)
    .reduce((sum, acc) => sum + toNum(acc?.balance), 0);

  return {
    totals: {
      income: toNum(income),
      operational_expense: operationalExpenseSafe,
      net: toNum(income) - operationalExpenseSafe
    },
    topCategories,
    ownerDraw: {
      amount: toNum(ownerDrawAmount),
      byCategory: ownerDrawByCategory
    },
    endBalances: {
      open: toNum(endOpen),
      hidden: toNum(endHidden),
      total: toNum(endOpen) + toNum(endHidden)
    }
  };
};

const computeEffectiveDelay = ({ delayMs, jitterMs }) => {
  if (Number.isFinite(Number(delayMs)) && Number(delayMs) >= 0) {
    const jitter = Math.max(0, Number(jitterMs || 0));
    const randJitter = jitter > 0 ? Math.floor(Math.random() * jitter) : 0;
    return Math.round(Number(delayMs) + randJitter);
  }

  const span = Math.max(0, LAZY_PREFETCH_MAX_MS - LAZY_PREFETCH_MIN_MS);
  const offset = span > 0 ? Math.floor(Math.random() * (span + 1)) : 0;
  return LAZY_PREFETCH_MIN_MS + offset;
};

const hasFullCoverage = ({ centerMonthDate, pastMonths, futureMonths }) => {
  const descriptors = buildMonthDescriptors({ centerMonthDate, pastMonths, futureMonths });
  if (!descriptors.length) return false;
  return descriptors.every((descriptor) => bufferState.entriesByPeriod.has(descriptor.period));
};

const buildHistoricalContextPayload = ({ centerMonthDate, pastMonths, futureMonths }) => {
  const descriptors = buildMonthDescriptors({ centerMonthDate, pastMonths, futureMonths });
  const periods = descriptors
    .map((descriptor) => bufferState.entriesByPeriod.get(descriptor.period))
    .filter(Boolean);

  return {
    meta: {
      source: 'background_analytics_buffer',
      generatedAt: bufferState.generatedAt || null,
      centerPeriod: toPeriodKey(centerMonthDate),
      expectedPeriods: descriptors.length,
      availablePeriods: periods.length,
      isWarm: periods.length === descriptors.length && bufferState.stale !== true,
      isStale: bufferState.stale === true,
      lastBuildReason: bufferState.lastBuildReason || ''
    },
    periods
  };
};

const buildBufferEntries = async ({
  mainStore,
  periodFilter = null,
  asOf = null,
  reason = 'manual',
  pastMonths = DEFAULT_PAST_MONTHS,
  futureMonths = DEFAULT_FUTURE_MONTHS
}) => {
  if (!mainStore) {
    throw new Error('mainStore is required for background analytics buffer');
  }

  const centerMonthDate = resolveCenterMonthDate({ mainStore, periodFilter });
  const descriptors = buildMonthDescriptors({
    centerMonthDate,
    pastMonths,
    futureMonths
  });
  if (!descriptors.length) return buildHistoricalContextPayload({ centerMonthDate, pastMonths, futureMonths });

  const globalStartIso = descriptors[0].startIso;
  const globalEndIso = descriptors[descriptors.length - 1].endIso;
  const globalPeriodFilter = {
    mode: 'custom',
    customStart: globalStartIso,
    customEnd: globalEndIso
  };

  const globalSnapshot = await buildTooltipSnapshotForRange({
    mainStore,
    periodFilter: globalPeriodFilter,
    asOf,
    visibilityMode: 'all'
  });

  const daysSorted = (Array.isArray(globalSnapshot?.days) ? globalSnapshot.days : [])
    .slice()
    .sort((a, b) => String(a?.dateKey || '').localeCompare(String(b?.dateKey || '')));

  const nextMap = new Map();
  descriptors.forEach((descriptor) => {
    const periodDays = getDaysForRange({
      allDays: daysSorted,
      startDateKey: descriptor.startDateKey,
      endDateKey: descriptor.endDateKey
    });
    const aggregated = aggregatePeriodDays({ days: periodDays });

    nextMap.set(descriptor.period, {
      period: descriptor.period,
      relation: descriptor.relation,
      offsetMonths: descriptor.offsetMonths,
      range: {
        startDateKey: descriptor.startDateKey,
        endDateKey: descriptor.endDateKey
      },
      totals: aggregated.totals,
      topCategories: aggregated.topCategories,
      ownerDraw: aggregated.ownerDraw,
      endBalances: aggregated.endBalances
    });
  });

  bufferState.entriesByPeriod = nextMap;
  bufferState.generatedAt = new Date().toISOString();
  bufferState.lastBuildReason = String(reason || 'manual');
  bufferState.stale = false;

  return buildHistoricalContextPayload({
    centerMonthDate,
    pastMonths,
    futureMonths
  });
};

const clearScheduledTimer = () => {
  if (bufferState.scheduledTimer) {
    clearTimeout(bufferState.scheduledTimer);
    bufferState.scheduledTimer = null;
  }
};

export const stopBackgroundAnalyticsPrefetchTimer = () => {
  clearScheduledTimer();
};

export const scheduleBackgroundAnalyticsPrefetch = ({
  mainStore,
  periodFilter = null,
  asOf = null,
  reason = 'lazy_prefetch',
  delayMs = null,
  jitterMs = 0,
  force = false,
  pastMonths = DEFAULT_PAST_MONTHS,
  futureMonths = DEFAULT_FUTURE_MONTHS
} = {}) => {
  clearScheduledTimer();
  const effectiveDelay = computeEffectiveDelay({ delayMs, jitterMs });

  bufferState.scheduledTimer = setTimeout(() => {
    primeBackgroundAnalyticsBuffer({
      mainStore,
      periodFilter,
      asOf,
      reason,
      force,
      pastMonths,
      futureMonths
    }).catch((error) => {
      console.warn('[backgroundAnalyticsBuffer] prefetch failed:', error?.message || error);
    });
  }, effectiveDelay);

  return effectiveDelay;
};

export const primeBackgroundAnalyticsBuffer = async ({
  mainStore,
  periodFilter = null,
  asOf = null,
  reason = 'manual',
  force = false,
  pastMonths = DEFAULT_PAST_MONTHS,
  futureMonths = DEFAULT_FUTURE_MONTHS
} = {}) => {
  if (!mainStore) {
    return {
      meta: {
        source: 'background_analytics_buffer',
        generatedAt: null,
        expectedPeriods: 0,
        availablePeriods: 0,
        isWarm: false,
        isStale: true,
        error: 'mainStore_missing'
      },
      periods: []
    };
  }

  const centerMonthDate = resolveCenterMonthDate({ mainStore, periodFilter });
  const shouldRebuild = force
    || bufferState.stale
    || !hasFullCoverage({ centerMonthDate, pastMonths, futureMonths });

  if (!shouldRebuild) {
    return buildHistoricalContextPayload({ centerMonthDate, pastMonths, futureMonths });
  }

  if (bufferState.buildInFlight) {
    return bufferState.buildInFlight;
  }

  bufferState.buildInFlight = buildBufferEntries({
    mainStore,
    periodFilter,
    asOf,
    reason,
    pastMonths,
    futureMonths
  }).finally(() => {
    bufferState.buildInFlight = null;
  });

  return bufferState.buildInFlight;
};

export const signalBackgroundAnalyticsMutation = ({
  mainStore,
  periodFilter = null,
  asOf = null,
  reason = 'mutation',
  delayMs = MUTATION_REBUILD_DELAY_MS,
  pastMonths = DEFAULT_PAST_MONTHS,
  futureMonths = DEFAULT_FUTURE_MONTHS
} = {}) => {
  bufferState.stale = true;
  return scheduleBackgroundAnalyticsPrefetch({
    mainStore,
    periodFilter,
    asOf,
    reason,
    delayMs,
    jitterMs: 180,
    force: true,
    pastMonths,
    futureMonths
  });
};

export const getHistoricalContextFromBuffer = ({
  mainStore,
  periodFilter = null,
  pastMonths = DEFAULT_PAST_MONTHS,
  futureMonths = DEFAULT_FUTURE_MONTHS
} = {}) => {
  const centerMonthDate = resolveCenterMonthDate({ mainStore, periodFilter });
  return buildHistoricalContextPayload({
    centerMonthDate,
    pastMonths,
    futureMonths
  });
};

export const getHistoricalContextForRequest = async ({
  mainStore,
  periodFilter = null,
  asOf = null,
  reason = 'request',
  pastMonths = DEFAULT_PAST_MONTHS,
  futureMonths = DEFAULT_FUTURE_MONTHS
} = {}) => {
  const centerMonthDate = resolveCenterMonthDate({ mainStore, periodFilter });
  const hasCoverage = hasFullCoverage({ centerMonthDate, pastMonths, futureMonths });
  if (!hasCoverage || bufferState.stale) {
    await primeBackgroundAnalyticsBuffer({
      mainStore,
      periodFilter,
      asOf,
      reason,
      force: true,
      pastMonths,
      futureMonths
    });
  }

  return buildHistoricalContextPayload({
    centerMonthDate,
    pastMonths,
    futureMonths
  });
};

export default {
  scheduleBackgroundAnalyticsPrefetch,
  stopBackgroundAnalyticsPrefetchTimer,
  primeBackgroundAnalyticsBuffer,
  signalBackgroundAnalyticsMutation,
  getHistoricalContextFromBuffer,
  getHistoricalContextForRequest
};
