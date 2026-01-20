import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';

export function useWidgetData() {
    const mainStore = useMainStore();

    // Robust number parser for values that may be formatted as strings like "2 400 000 ₸".
    const toNum = (v) => {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
        if (typeof v === 'boolean') return v ? 1 : 0;

        let s = String(v)
            .replace(/\u00A0/g, ' ')           // NBSP
            .replace(/[\s\u2009\u202F]/g, '') // spaces / thin spaces
            .trim();
        if (!s) return 0;

        // Keep digits and minus only
        s = s.replace(/[^0-9-]/g, '');
        // Allow only one leading minus
        s = s.replace(/(?!^)-/g, '');
        if (s === '' || s === '-') return 0;

        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    };

    // Helper for ID
    const getId = (field) => {
        if (!field) return null;
        if (typeof field === 'object' && field._id) return field._id;
        return field;
    };

    // 1. Financial Stats (System Benchmark)
    const financialStats = computed(() => {
        const balances = new Map();
        let systemTotalBalance = 0;

        // Берем уже отфильтрованные счета из mainStore
        const sourceAccounts = mainStore.currentAccountBalances || [];

        sourceAccounts.forEach(acc => {
            const balance = toNum(acc.balance);

            systemTotalBalance += balance;

            const cId = getId(acc.companyId);
            const iId = getId(acc.individualId);
            const ownerId = cId || iId;

            if (ownerId) {
                const current = balances.get(ownerId) || 0;
                balances.set(ownerId, current + balance);
            }
        });

        const maxBalance = systemTotalBalance > 0 ? systemTotalBalance : 1;
        return { balances, maxBalance };
    });

    // 2. Color Definition
    const getStatusColor = (currentBalance, totalSystemBalance) => {
        const safeBalance = toNum(currentBalance);
        if (safeBalance <= 0) return '#FF3B30'; // Red

        const ratio = safeBalance / totalSystemBalance;

        if (ratio >= 0.5) return '#34C759'; // Green
        if (ratio > 0.1) return '#FFCC00';  // Yellow
        return '#FF3B30';                   // Red
    };

    // 3. Main Data Retrieval Function
    const getWidgetItems = (widgetKey, isForecastActive = false) => {
        const k = widgetKey;
        const { balances, maxBalance } = financialStats.value;
        const pickNum = (obj) => toNum(obj?.balance ?? obj?.futureBalance ?? obj?.endBalance ?? obj?.totalForecast ?? obj?.total ?? obj?.value ?? obj?.sum ?? obj?.amount);
        const getItemKey = (obj) => String(getId(obj) ?? obj?._id ?? obj?.id ?? obj?.key ?? '');

        // Internal mapping function
        const mapItem = (item, futureMap, mode = 'delta') => {
            const itemKey = getItemKey(item);
            const currentVal = pickNum(item);

            const hasFuture = futureMap && itemKey && futureMap.has(itemKey);
            const futureRaw = hasFuture ? futureMap.get(itemKey) : null;

            // delta = what will happen in the forecast window
            // endTotal = currentVal + delta (for delta-mode), or absolute future balance (for absolute-mode)
            let delta = 0;
            let endTotal = currentVal;

            if (mode === 'absolute') {
                if (futureRaw !== null && futureRaw !== undefined) {
                    endTotal = toNum(futureRaw);
                    delta = endTotal - currentVal;
                }
            } else {
                if (futureRaw !== null && futureRaw !== undefined) {
                    delta = toNum(futureRaw);
                    endTotal = currentVal + delta;
                }
            }

            // What we show in the "forecast" column:
            // - accounts/companies/credits: show future absolute balance
            // - everything else: show only delta (forecast change)
            const futureDisplay = (mode === 'absolute') ? endTotal : delta;

            // --- COLOR / LINK LOGIC ---
            let color = null;
            let hasLink = false;
            let tooltipText = '';
            const itemId = getId(item);

            // ACCOUNTS
            if (k === 'accounts') {
                const cId = getId(item.companyId);
                const iId = getId(item.individualId);
                const ownerId = cId || iId;

                color = getStatusColor(currentVal, maxBalance);

                if (ownerId) {
                    hasLink = true;
                    let ownerName = 'Владелец';

                    const companies = Array.isArray(mainStore.companies) ? mainStore.companies : [];
                    const individuals = Array.isArray(mainStore.individuals) ? mainStore.individuals : [];

                    if (cId) {
                        const c = companies.find(x => String(x._id) === String(cId));
                        if (c) ownerName = c.name;
                    } else if (iId) {
                        const i = individuals.find(x => String(x._id) === String(iId));
                        if (i) ownerName = i.name;
                    }
                    tooltipText = `Владелец: ${ownerName}`;
                }
            }

            // COMPANIES
            else if (k === 'companies') {
                const accounts = Array.isArray(mainStore.accounts) ? mainStore.accounts : [];
                const companyAccounts = accounts.filter(acc => String(getId(acc.companyId)) === String(itemId));

                if (companyAccounts.length > 0) {
                    hasLink = true;
                    const accNames = companyAccounts.map(a => a.name).join(', ');
                    tooltipText = `Счета: ${accNames}`;

                    const totalBalance = balances.get(itemId) || 0;
                    color = getStatusColor(totalBalance, maxBalance);
                } else {
                    tooltipText = 'Нет связанных счетов';
                    color = null;
                }
            }

            // INDIVIDUALS
            else if (k === 'individuals') {
                const accounts = Array.isArray(mainStore.accounts) ? mainStore.accounts : [];
                const linkedAccounts = accounts.filter(acc => String(getId(acc.individualId)) === String(itemId));

                if (linkedAccounts.length > 0) {
                    hasLink = true;
                    const accNames = linkedAccounts.map(a => a.name).join(', ');
                    tooltipText = `Связан со счетом: ${accNames}`;

                    const totalBalance = balances.get(itemId) || 0;
                    color = getStatusColor(totalBalance, maxBalance);
                } else {
                    hasLink = false;
                    color = null;
                }
            }

            return {
                ...item,
                currentBalance: currentVal,
                futureChange: delta,
                totalForecast: endTotal,
                futureBalance: futureDisplay,
                linkMarkerColor: color,
                isLinked: hasLink,
                linkTooltip: tooltipText
            };
        };

        // DATA SOURCE SELECTION
        if (k === 'accounts') {
            const current = Array.isArray(mainStore.currentAccountBalances) ? mainStore.currentAccountBalances : [];
            const future = Array.isArray(mainStore.futureAccountBalances) ? mainStore.futureAccountBalances : [];

            // futureAccountBalances must contain absolute balances at the forecast end-date
            const futureMap = new Map(future.map(i => [getItemKey(i), pickNum(i)]));
            return current.map(item => mapItem(item, futureMap, 'absolute'));
        }

        if (k === 'companies') {
            const current = Array.isArray(mainStore.currentCompanyBalances) ? mainStore.currentCompanyBalances : [];
            const future = Array.isArray(mainStore.futureCompanyBalances) ? mainStore.futureCompanyBalances : [];

            // futureCompanyBalances must contain absolute balances at the forecast end-date
            const futureMap = new Map(future.map(i => [getItemKey(i), pickNum(i)]));
            return current.map(item => mapItem(item, futureMap, 'absolute'));
        }

        if (k === 'individuals') {
            const current = Array.isArray(mainStore.currentIndividualBalances) ? mainStore.currentIndividualBalances : [];
            const future = Array.isArray(mainStore.futureIndividualChanges) ? mainStore.futureIndividualChanges : [];

            // futureIndividualChanges returns deltas: [{ _id, balance }]
            const futureMap = new Map(future.map(i => [getItemKey(i), pickNum(i)]));
            return current.map(item => mapItem(item, futureMap, 'delta'));
        }

        if (k === 'contractors') {
            const current = Array.isArray(mainStore.currentContractorBalances) ? mainStore.currentContractorBalances : [];
            const future = Array.isArray(mainStore.futureContractorChanges) ? mainStore.futureContractorChanges : [];
            const futureMap = new Map(future.map(c => [getItemKey(c), pickNum(c)]));

            let list = current.map(item => mapItem(item, futureMap, 'delta'));

            const companies = Array.isArray(mainStore.companies) ? mainStore.companies : [];
            const myCompanyNames = new Set(companies.map(c => (c.name || '').trim().toLowerCase()));

            return list.filter(c => !myCompanyNames.has((c.name || '').trim().toLowerCase()));
        }

        if (k === 'projects') {
            const current = Array.isArray(mainStore.currentProjectBalances) ? mainStore.currentProjectBalances : [];
            const future = Array.isArray(mainStore.futureProjectChanges) ? mainStore.futureProjectChanges : [];
            const futureMap = new Map(future.map(p => [getItemKey(p), pickNum(p)]));
            return current.map(item => mapItem(item, futureMap, 'delta'));
        }

        if (k === 'categories') {
            const current = Array.isArray(mainStore.currentCategoryBalances) ? mainStore.currentCategoryBalances : [];

            // Prefer "*Changes" (deltas) if present; otherwise fallback to "*Balances"
            const future = Array.isArray(mainStore.futureCategoryChanges) ? mainStore.futureCategoryChanges
                : (Array.isArray(mainStore.futureCategoryBalances) ? mainStore.futureCategoryBalances : []);

            const futureMap = new Map(future.map(c => [getItemKey(c), pickNum(c)]));
            let list = current.map(item => mapItem(item, futureMap, 'delta'));

            const visibleCategories = Array.isArray(mainStore.visibleCategories) ? mainStore.visibleCategories : [];
            const visibleIds = new Set(visibleCategories.map(c => c._id));

            return list.filter(c => visibleIds.has(c._id));
        }

        if (k === 'credits') {
            const current = Array.isArray(mainStore.currentCreditBalances) ? mainStore.currentCreditBalances : [];
            const future = Array.isArray(mainStore.futureCreditBalances) ? mainStore.futureCreditBalances : [];

            // futureCreditBalances contains absolute future balances
            const futureMap = new Map(future.map(c => [getItemKey(c), pickNum(c)]));
            return current.map(item => mapItem(item, futureMap, 'absolute'));
        }


        // LIABILITIES
        if (k === 'liabilities') {
            const weOweCurrent = mainStore.liabilitiesWeOwe || 0;
            const weOweFuture = mainStore.liabilitiesWeOweFuture || 0;
            const theyOweCurrent = mainStore.liabilitiesTheyOwe || 0;
            const theyOweFuture = mainStore.liabilitiesTheyOweFuture || 0;
            return [
                {
                    _id: 'we', name: 'Мы должны',
                    currentBalance: weOweCurrent,
                    futureChange: weOweFuture - weOweCurrent,
                    totalForecast: weOweFuture,
                    futureBalance: weOweFuture
                },
                {
                    _id: 'they', name: 'Нам должны',
                    currentBalance: theyOweCurrent,
                    futureChange: theyOweFuture - theyOweCurrent,
                    totalForecast: theyOweFuture,
                    futureBalance: theyOweFuture,
                    isIncome: true
                }
            ];
        }

        const isListWidget = ['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(k);
        if (isListWidget) {
            const arr = (v) => Array.isArray(v) ? v : [];
            const pickStoreArray = (...names) => {
                for (const n of names) {
                    const v = mainStore?.[n];
                    if (Array.isArray(v)) return v;
                }
                return null;
            };

            const rangeEndDate = mainStore.projection?.rangeEndDate ? new Date(mainStore.projection.rangeEndDate) : null;
            if (rangeEndDate) rangeEndDate.setHours(23, 59, 59, 999);

            const allOps = arr(mainStore.operations ?? mainStore.allOperations ?? mainStore.transactions ?? mainStore.ops ?? mainStore.items);

            const getOpType = (op) => String(op?.type ?? op?.kind ?? op?.operationType ?? op?.opType ?? op?.categoryType ?? op?.action ?? '').toLowerCase();
            const getOpDate = (op) => {
                const d = op?.date ?? op?.dt ?? op?.operationDate ?? op?.createdAt ?? op?.ts ?? null;
                const nd = d ? new Date(d) : null;
                return (nd && !Number.isNaN(nd.getTime())) ? nd : null;
            };
            const isPlanned = (op) => Boolean(op?.isPlanned ?? op?.planned ?? op?.isForecast ?? op?.forecast ?? op?.plan ?? op?.isPlan);

            const matchType = (t) => {
                if (!t) return false;
                if (k === 'incomeList') return t.includes('income') || t.includes('доход') || t.includes('revenue');
                if (k === 'expenseList') return t.includes('expense') || t.includes('расход');
                if (k === 'withdrawalList') return t.includes('withdraw') || t.includes('вывод') || t.includes('cashout');
                if (k === 'transfers') return t.includes('transfer') || t.includes('перевод');
                return false;
            };

            // Prefer already-prepared lists from mainStore (desktop uses them)
            let currentList = [];
            if (k === 'incomeList') currentList = pickStoreArray('currentIncomes', 'currentIncome', 'incomesCurrent') || [];
            else if (k === 'expenseList') currentList = pickStoreArray('currentExpenses', 'currentExpense', 'expensesCurrent') || [];
            else if (k === 'withdrawalList') currentList = pickStoreArray('currentWithdrawals', 'currentWithdrawal', 'withdrawalsCurrent') || [];
            else if (k === 'transfers') currentList = pickStoreArray('currentTransfers', 'currentTransfer', 'transfersCurrent') || [];

            let futureList = [];
            if (k === 'incomeList') futureList = pickStoreArray('futureIncomes', 'incomesFuture') || [];
            else if (k === 'expenseList') futureList = pickStoreArray('futureExpenses', 'expensesFuture') || [];
            else if (k === 'withdrawalList') futureList = pickStoreArray('futureWithdrawals', 'withdrawalsFuture') || [];
            else if (k === 'transfers') futureList = pickStoreArray('futureTransfers', 'transfersFuture') || [];

            // Fallback if lists are empty in mobile (but operations exist)
            if (currentList.length === 0 && allOps.length > 0) {
                const now = new Date();
                currentList = allOps.filter(op => {
                    const t = getOpType(op);
                    if (!matchType(t)) return false;
                    if (isPlanned(op)) return false;
                    const d = getOpDate(op);
                    return d ? d <= now : true;
                });
            }
            if (futureList.length === 0 && allOps.length > 0) {
                const now = new Date();
                futureList = allOps.filter(op => {
                    const t = getOpType(op);
                    if (!matchType(t)) return false;
                    const d = getOpDate(op);
                    const isFutureByDate = d ? d > now : false;
                    if (!isPlanned(op) && !isFutureByDate) return false;
                    if (rangeEndDate && d) return d <= rangeEndDate;
                    return true;
                });
            }

            const currentSum = arr(currentList).reduce((acc, op) => acc + Math.abs(toNum(op?.amount ?? op?.sum ?? op?.value ?? op?.balance)), 0);
            const futureSum = arr(futureList).reduce((acc, op) => acc + Math.abs(toNum(op?.amount ?? op?.sum ?? op?.value ?? op?.balance)), 0);

            return [{
                _id: 'total',
                name: 'Всего',
                currentBalance: currentSum,

                // ✅ forecast column for lists is DELTA only
                futureChange: futureSum,
                futureBalance: futureSum,
                totalForecast: currentSum + futureSum,

                balance: isForecastActive ? (currentSum + futureSum) : currentSum,

                isList: true,
                isIncome: k === 'incomeList'
            }];
        }

        return [];
    };

    return {
        getWidgetItems
    };
}