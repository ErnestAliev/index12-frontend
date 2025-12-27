// src/ai/aiContextBuilder.js
// Единственный источник правды для AI = то, что уже посчитано/показано в виджетах (mainStore).
// Файл read-only: ничего не пишет, ничего не запрашивает по сети.

function _unwrap(v) {
  // Pinia/Vue computed/refs in components can come as primitives or { value }
  if (v && typeof v === 'object' && 'value' in v) return v.value;
  return v;
}

function _toId(x) {
  if (!x) return null;
  if (typeof x === 'string') return x;
  if (typeof x === 'object') return x._id ? String(x._id) : null;
  return null;
}

function _toLocalYmd(d) {
  // Local date -> YYYY-MM-DD
  const dt = (d instanceof Date) ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _toDdMmYy(d) {
  const ymd = _toLocalYmd(d);
  if (!ymd) return null;
  const [y, m, day] = ymd.split('-');
  return `${day}.${m}.${y.slice(2)}`;
}

function _parseDateMaybe(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function _safeNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function _buildIndexById(list) {
  const map = new Map();
  (list || []).forEach((x) => {
    const id = _toId(x?._id || x);
    if (id) map.set(id, x);
  });
  return map;
}

function _resolveOwner(mainStore, op) {
  // Возвращает { companyId, individualId } по операции, максимально как в UI
  const companyId = _toId(op?.companyId);
  const individualId = _toId(op?.individualId);
  if (companyId || individualId) return { companyId, individualId };

  // Иногда владелец берётся через account
  const accId = _toId(op?.accountId);
  if (!accId) return { companyId: null, individualId: null };

  const accounts = _unwrap(mainStore.accounts) || [];
  const acc = accounts.find(a => _toId(a?._id) === accId);
  return {
    companyId: _toId(acc?.companyId),
    individualId: _toId(acc?.individualId),
  };
}

function _resolveCounterpartyKey(op) {
  // Для контрагентов: либо contractorId (юр/ип), либо counterpartyIndividualId (физлицо-контрагент)
  const cId = _toId(op?.contractorId);
  if (cId) return `contr_${cId}`;
  const iId = _toId(op?.counterpartyIndividualId);
  if (iId) return `ind_${iId}`;
  return null;
}

function _accumulateBreakdowns({ incomes, expenses }, mainStore) {
  // Считаем income/expense/net по ключам: projectId/categoryId/owner/company/individual/counterparty
  const byProject = new Map();
  const byCategory = new Map();
  const byCompany = new Map();
  const byIndividual = new Map();
  const byCounterparty = new Map();

  const add = (map, key, inc, exp) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, { income: 0, expense: 0, net: 0 });
    const obj = map.get(key);
    obj.income += inc;
    obj.expense += exp;
    obj.net += (inc - exp);
  };

  (incomes || []).forEach(op => {
    const amt = _safeNumber(op?.amount);

    const pId = _toId(op?.projectId);
    const catId = _toId(op?.categoryId);
    const cpKey = _resolveCounterpartyKey(op);
    const owner = _resolveOwner(mainStore, op);

    add(byProject, pId, amt, 0);
    add(byCategory, catId, amt, 0);
    add(byCompany, owner.companyId, amt, 0);
    add(byIndividual, owner.individualId, amt, 0);
    add(byCounterparty, cpKey, amt, 0);
  });

  (expenses || []).forEach(op => {
    // В расходах держим положительное значение (как в UI)
    const amt = Math.abs(_safeNumber(op?.amount));

    const pId = _toId(op?.projectId);
    const catId = _toId(op?.categoryId);
    const cpKey = _resolveCounterpartyKey(op);
    const owner = _resolveOwner(mainStore, op);

    add(byProject, pId, 0, amt);
    add(byCategory, catId, 0, amt);
    add(byCompany, owner.companyId, 0, amt);
    add(byIndividual, owner.individualId, 0, amt);
    add(byCounterparty, cpKey, 0, amt);
  });

  const toObj = (map) => {
    const out = {};
    map.forEach((v, k) => { out[k] = v; });
    return out;
  };

  return {
    byProject: toObj(byProject),
    byCategory: toObj(byCategory),
    byCompany: toObj(byCompany),
    byIndividual: toObj(byIndividual),
    byCounterparty: toObj(byCounterparty),
  };
}

export function buildAiContext(mainStore, options = {}) {
  const includeOperations = !!options.includeOperations; // по умолчанию false

  const today = new Date();
  const todayYmd = _toLocalYmd(today);
  const todayDdMmYy = _toDdMmYy(today);

  const widgetFilterMode = _unwrap(mainStore.widgetFilterMode);
  const includeExcludedInTotal = !!_unwrap(mainStore.includeExcludedInTotal);

  const projection = _unwrap(mainStore.projection);
  const rangeEndRaw = projection?.rangeEndDate;
  const rangeEndDate = _parseDateMaybe(rangeEndRaw) || today;
  const rangeEndYmd = _toLocalYmd(rangeEndDate);
  const rangeEndDdMmYy = _toDdMmYy(rangeEndDate);

  // Сущности
  const accounts = _unwrap(mainStore.accounts) || [];

  // Accounts split (UI often shows hidden/excluded separately)
  const activeAccounts = accounts.filter(a => !a?.isExcluded);
  const hiddenAccounts = accounts.filter(a => !!a?.isExcluded);

  // Snapshot map to compute current balances for ALL accounts (even if excluded not included in totals)
  const snapshot = _unwrap(mainStore.snapshot) || {};
  const snapshotAccountBalances = snapshot.accountBalances || {};

  const currentAccountBalancesAll = accounts.map(a => ({
    ...a,
    balance: Number(snapshotAccountBalances[a._id] || 0) + Number(a.initialBalance || 0)
  }));

  const companies = _unwrap(mainStore.companies) || [];
  const contractors = _unwrap(mainStore.contractors) || [];
  const projects = _unwrap(mainStore.projects) || [];
  const individuals = _unwrap(mainStore.individuals) || [];
  const categories = _unwrap(mainStore.categories) || [];
  const visibleCategories = _unwrap(mainStore.visibleCategories) || categories;
  const visibleContractors = _unwrap(mainStore.visibleContractors) || contractors;

  // Балансы как в UI
  const currentTotalBalance = _safeNumber(_unwrap(mainStore.currentTotalBalance));
  const futureTotalBalance = _safeNumber(_unwrap(mainStore.futureTotalBalance));

  const currentAccountBalances = _unwrap(mainStore.currentAccountBalances) || [];
  const futureAccountBalances = _unwrap(mainStore.futureAccountBalances) || [];

  const currentCompanyBalances = _unwrap(mainStore.currentCompanyBalances) || [];
  const futureCompanyBalances = _unwrap(mainStore.futureCompanyBalances) || [];

  const currentProjectBalances = _unwrap(mainStore.currentProjectBalances) || [];
  const futureProjectBalances = _unwrap(mainStore.futureProjectBalances) || [];

  const currentIndividualBalances = _unwrap(mainStore.currentIndividualBalances) || [];
  const futureIndividualBalances = _unwrap(mainStore.futureIndividualBalances) || [];

  // Операции (факт/прогноз) — уже отфильтрованы логикой UI
  const currentIncomes = _unwrap(mainStore.currentIncomes) || [];
  const currentExpenses = _unwrap(mainStore.currentExpenses) || [];
  const futureIncomes = _unwrap(mainStore.futureIncomes) || [];
  const futureExpenses = _unwrap(mainStore.futureExpenses) || [];

  // Агрегаты income/expense/net по сущностям
  const factBreakdowns = _accumulateBreakdowns({ incomes: currentIncomes, expenses: currentExpenses }, mainStore);
  const forecastBreakdowns = _accumulateBreakdowns({ incomes: futureIncomes, expenses: futureExpenses }, mainStore);

  // Короткие списки сущностей (чтобы AI мог отвечать “дай список …”)
  const slimList = (arr) => (arr || []).map(x => ({ _id: _toId(x?._id || x), name: x?.name })).filter(x => x._id && x.name);

  // For accounts we also expose isExcluded so AI can group Active vs Hidden
  const slimAccounts = (arr) => (arr || [])
    .map(x => ({ _id: _toId(x?._id || x), name: x?.name, isExcluded: !!x?.isExcluded }))
    .filter(x => x._id && x.name);

  // Опционально: операции (может быть тяжело по токенам)
  const opsPack = includeOperations
    ? {
        currentIncomes: currentIncomes,
        currentExpenses: currentExpenses,
        futureIncomes: futureIncomes,
        futureExpenses: futureExpenses,
      }
    : undefined;

  return {
    meta: {
      version: 'aiContextBuilder.v1',
      currency: 'KZT',
      todayYmd,
      todayDdMmYy,
      widgetFilterMode,
      includeExcludedInTotal,
      // IMPORTANT: факт всегда “до сегодня”, прогноз — “до конца диапазона”
      factTo: todayDdMmYy,
      forecastTo: rangeEndDdMmYy,
    },

    totals: {
      currentTotalBalance,
      futureTotalBalance,
    },

    entities: {
      counts: {
        accounts: accounts.length,
        companies: companies.length,
        contractors: contractors.length,
        projects: projects.length,
        individuals: individuals.length,
        categories: categories.length,
      },

      lists: {
        accounts: slimAccounts(accounts),
        accountsActive: slimAccounts(activeAccounts),
        accountsHidden: slimAccounts(hiddenAccounts),
        companies: slimList(companies),
        contractors: slimList(visibleContractors),
        projects: slimList(projects),
        individuals: slimList(individuals),
        categories: slimList(visibleCategories),
      },

      // балансы как в UI
      balances: {
        accounts: {
          current: currentAccountBalances,
          currentAll: currentAccountBalancesAll,
          forecast: futureAccountBalances,
        },
        companies: {
          current: currentCompanyBalances,
          forecast: futureCompanyBalances,
        },
        projects: {
          current: currentProjectBalances,
          forecast: futureProjectBalances,
        },
        individuals: {
          current: currentIndividualBalances,
          forecast: futureIndividualBalances,
        },
      },
    },

    breakdowns: {
      fact: factBreakdowns,
      forecast: forecastBreakdowns,
    },

    ...(opsPack ? { operations: opsPack } : {}),
  };
}

export default buildAiContext;