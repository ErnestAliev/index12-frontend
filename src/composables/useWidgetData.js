import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

export function useWidgetData() {
    const mainStore = useMainStore();

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
            const rawBalance = Number(acc.balance);
            const balance = isNaN(rawBalance) ? 0 : rawBalance; 
            
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
        const safeBalance = Number(currentBalance) || 0;
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

        // Internal mapping function
        const mapItem = (item, futureMap) => {
            const currentVal = item.balance || 0;
            const itemIdStr = String(item._id);
            
            // Получаем будущее значение или дельту (зависит от логики store для конкретной сущности)
            // Для Accounts/Companies mainStore возвращает полные балансы.
            // Для Projects/Contractors/Categories mainStore возвращает изменения (deltas).
            
            let delta = 0;
            let rawFutureVal = currentVal;

            if (['accounts', 'companies', 'credits'].includes(k)) {
                if (futureMap && futureMap.has(itemIdStr)) {
                    rawFutureVal = futureMap.get(itemIdStr);
                    delta = rawFutureVal - currentVal;
                }
            } else {
                // Для остальных (Projects, Contractors, Categories) futureMap содержит изменение
                if (futureMap && futureMap.has(itemIdStr)) {
                    delta = futureMap.get(itemIdStr);
                    rawFutureVal = currentVal + delta;
                }
            }

            // --- COLOR LOGIC ---
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
                    if (cId) {
                        const c = mainStore.companies.find(x => x._id === cId);
                        if (c) ownerName = c.name;
                    } else if (iId) {
                        const i = mainStore.individuals.find(x => x._id === iId);
                        if (i) ownerName = i.name;
                    }
                    tooltipText = `Владелец: ${ownerName}`;
                }
            }
            
            // COMPANIES
            else if (k === 'companies') {
                const companyAccounts = mainStore.accounts.filter(acc => getId(acc.companyId) === itemId);
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
                const linkedAccounts = mainStore.accounts.filter(acc => getId(acc.individualId) === itemId);
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
                totalForecast: currentVal + delta,
                futureBalance: rawFutureVal, 
                linkMarkerColor: color,
                isLinked: hasLink,
                linkTooltip: tooltipText
            };
        };

        // DATA SOURCE SELECTION
        if (k === 'accounts') {
            const current = mainStore.currentAccountBalances || [];
            const future = mainStore.futureAccountBalances || []; 
            const futureMap = new Map(future.map(i => [String(i._id), i.balance]));
            return current.map(item => mapItem(item, futureMap));
        }

        if (k === 'companies') {
            const current = mainStore.currentCompanyBalances || [];
            const future = mainStore.futureCompanyBalances || []; 
            const futureMap = new Map(future.map(i => [String(i._id), i.balance]));
            return current.map(item => mapItem(item, futureMap));
        }
        
        if (k === 'individuals') {
            const current = mainStore.currentIndividualBalances || [];
            const future = mainStore.futureIndividualChanges || []; 
            const futureMap = new Map(future.map(i => [String(i._id), i.balance]));
            return current.map(item => mapItem(item, futureMap));
        }

        if (k === 'contractors') {
            const current = mainStore.currentContractorBalances || [];
            const future = mainStore.futureContractorChanges || []; 
            const futureMap = new Map(future.map(c => [String(c._id), c.balance]));
            let list = current.map(item => mapItem(item, futureMap));
            const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
            return list.filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));
        }
        
        if (k === 'projects') {
            const current = mainStore.currentProjectBalances || [];
            const future = mainStore.futureProjectChanges || []; 
            const futureMap = new Map(future.map(p => [String(p._id), p.balance]));
            return current.map(item => mapItem(item, futureMap));
        }
        
        if (k === 'categories') {
            const current = mainStore.currentCategoryBalances || [];
            const future = mainStore.futureCategoryBalances || []; 
            const futureMap = new Map(future.map(c => [String(c._id), c.balance]));
            let list = current.map(item => mapItem(item, futureMap));
            const visibleIds = new Set(mainStore.visibleCategories.map(c => c._id));
            return list.filter(c => visibleIds.has(c._id));
        }

        if (k === 'credits') {
            const current = mainStore.currentCreditBalances || [];
            const future = mainStore.futureCreditBalances || [];
            const futureMap = new Map(future.map(c => [String(c._id), c.futureBalance]));
            return current.map(item => mapItem(item, futureMap));
        }

        // TAXES
        if (k === 'taxes') {
            const rangeEndDate = mainStore.projection?.rangeEndDate ? new Date(mainStore.projection.rangeEndDate) : null;
            if (rangeEndDate) {
                rangeEndDate.setHours(23, 59, 59, 999);
            }

            return mainStore.companies.map(comp => {
                const now = new Date();
                const currentData = mainStore.calculateTaxForPeriod(comp._id, null, now);
                const paidCurrent = mainStore.taxes
                    .filter(t => {
                        const tCompId = getId(t.companyId);
                        if (String(tCompId) !== String(comp._id) || t.status !== 'paid') return false;
                        const tDate = t.date ? new Date(t.date) : new Date(0);
                        return tDate <= now;
                    })
                    .reduce((acc, t) => acc + (t.amount || 0), 0);
                
                const currentDebt = Math.max(0, currentData.tax - paidCurrent);

                const totalCalc = mainStore.calculateTaxForPeriod(comp._id, null, rangeEndDate);
                const paidTotal = mainStore.taxes
                    .filter(t => {
                        const tCompId = getId(t.companyId);
                        const tDate = t.date ? new Date(t.date) : new Date(0);
                        const isInRange = rangeEndDate ? tDate <= rangeEndDate : true;
                        return String(tCompId) === String(comp._id) && t.status === 'paid' && isInRange;
                    })
                    .reduce((acc, t) => acc + (t.amount || 0), 0);

                const totalForecastDebt = Math.max(0, totalCalc.tax - paidTotal);

                const currentVal = -Math.abs(currentDebt); 
                const futureVal = -Math.abs(totalForecastDebt);
                const change = futureVal - currentVal;

                return {
                    _id: comp._id,
                    name: comp.name,
                    regime: currentData.regime === 'simplified' ? 'УПР' : 'ОУР',
                    percent: currentData.percent,
                    currentBalance: currentVal,
                    futureChange: change, 
                    totalForecast: futureVal,
                    futureBalance: futureVal,
                    balance: isForecastActive ? futureVal : currentVal,
                    linkMarkerColor: null,
                    isLinked: false
                };
            });
        }

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
            let currentList = [];
            if (k === 'incomeList') currentList = mainStore.currentIncomes;
            else if (k === 'expenseList') currentList = mainStore.currentExpenses;
            else if (k === 'withdrawalList') currentList = mainStore.currentWithdrawals;
            else if (k === 'transfers') currentList = mainStore.currentTransfers;
            
            const currentSum = currentList.reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);

            let futureList = [];
            if (k === 'incomeList') futureList = mainStore.futureIncomes;
            else if (k === 'expenseList') futureList = mainStore.futureExpenses;
            else if (k === 'withdrawalList') futureList = mainStore.futureWithdrawals;
            else if (k === 'transfers') futureList = mainStore.futureTransfers;

            const futureSum = futureList.reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
            
            return [{
                _id: 'total', name: 'Всего',
                currentBalance: currentSum, futureChange: futureSum, totalForecast: currentSum + futureSum,
                balance: isForecastActive ? (currentSum + futureSum) : currentSum,
                futureBalance: currentSum + futureSum, 
                isList: true, isIncome: k === 'incomeList'
            }];
        }
        
        return [];
    };

    return {
        getWidgetItems
    };
}