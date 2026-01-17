import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import axios from 'axios';
import { useUiStore } from './uiStore';
import { useProjectionStore } from './projectionStore';
import { useTransferStore } from './transferStore';
import { useSocketStore } from './socketStore';
import { useWidgetStore } from './widgetStore';
import { useDealStore } from './dealStore'; // 🟢 Integration

axios.defaults.withCredentials = true;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';



export const useMainStore = defineStore('mainStore', () => {


    // 🟢 CONNECT SUB-STORES
    const uiStore = useUiStore();
    const widgetStore = useWidgetStore();

    const user = ref(null);

    // 🟢 NEW: Role-based access computed properties
    // 🟢 NEW: Role-based access using Workspace Role
    // workspaceRole comes from GET /api/auth/me
    const workspaceRole = computed(() => {
        const role = user.value?.workspaceRole;
        return role || null; // Return null instead of 'admin' as default
    });

    // Global admin or workspace admin
    const isGlobalAdmin = computed(() => user.value?.role === 'admin');
    const isWorkspaceAdmin = computed(() => workspaceRole.value === 'admin');
    const isWorkspaceOwner = computed(() => {
        // Check if user owns the current workspace (not just invited as admin)
        if (!user.value?.currentWorkspaceId) return true; // No workspace = owner of default
        // If workspace has userId field and it matches user's ID = owner
        // This will be set by backend based on workspace.userId === req.user.id
        return user.value?.isWorkspaceOwner === true;
    });
    const isManager = computed(() => workspaceRole.value === 'manager');
    const isAnalyst = computed(() => workspaceRole.value === 'analyst');

    // Permissions
    // Workspace admin has FULL access (same as global admin)
    const canEdit = computed(() => isWorkspaceAdmin.value || isManager.value || isGlobalAdmin.value);
    const canDelete = computed(() => isWorkspaceAdmin.value || isManager.value || isGlobalAdmin.value); // Admin can delete, Manager can delete own
    const canManageWorkspace = computed(() => isWorkspaceAdmin.value || isGlobalAdmin.value);
    const canInvite = computed(() => isWorkspaceAdmin.value || isGlobalAdmin.value);

    // 🟢 Aliases for UI/Export compatibility
    const userRole = workspaceRole;
    const isAdmin = computed(() => isWorkspaceAdmin.value || isGlobalAdmin.value);
    const isFullAccess = isAdmin;
    const isTimelineOnly = isManager;

    // 🟢 NEW: Effective user ID (for employees, use admin's ID to access data)
    const effectiveUserId = computed(() => user.value?.effectiveUserId || user.value?.id || user.value?._id);

    const isAuthLoading = ref(true);

    // 🟢 CACHE VERSIONING (Для принудительного обновления графиков)
    const cacheVersion = ref(0);

    // 🟢 PERIOD FILTER (Фильтр периода для виджетов)
    const periodFilter = ref({
        mode: 'all', // 'all' | 'currentMonth' | 'previousMonth' | 'custom' - RESET: showing all data
        customStart: null,
        customEnd: null
    });

    // --- 1. UI STORE BRIDGES ---
    const isHeaderExpanded = computed({
        get: () => uiStore.isHeaderExpanded,
        set: (v) => uiStore.isHeaderExpanded = v
    });
    const toggleHeaderExpansion = () => uiStore.toggleHeaderExpansion();

    // 🔥 CRITICAL: Excluded accounts MUST be hidden from invited users
    // Only owner or admin can toggle visibility
    const includeExcludedInTotal = computed({
        get: () => {
            // Invited users NEVER see excluded accounts, only workspace owner or admin can
            if (!isWorkspaceOwner.value && !isWorkspaceAdmin.value) {
                return false; // Force hidden for invited users
            }
            // Owner or admin can toggle
            return uiStore.includeExcludedInTotal;
        },
        set: (v) => {
            // Only owner or admin can change this setting
            if (isWorkspaceOwner.value || isWorkspaceAdmin.value) {
                uiStore.includeExcludedInTotal = v;
            }
            // Invited users: setting is ignored
        }
    });
    const toggleExcludedInclusion = () => {
        // Only workspace owner or admin can toggle
        if (isWorkspaceOwner.value || isWorkspaceAdmin.value) {
            uiStore.toggleExcludedInclusion();
        }
        // Invited users: no-op
    };

    // --- 2. WIDGET STORE BRIDGES ---
    const dashboardLayout = computed({
        get: () => widgetStore.dashboardLayout,
        set: (v) => widgetStore.updateDashboardLayout(v)
    });
    const allWidgets = computed(() => widgetStore.staticWidgets);
    const dashboardForecastState = computed(() => widgetStore.dashboardForecastState);

    const widgetSortMode = computed({
        get: () => widgetStore.widgetSortMode,
        set: (v) => widgetStore.setWidgetSortMode(v)
    });
    const widgetFilterMode = computed({
        get: () => widgetStore.widgetFilterMode,
        set: (v) => widgetStore.setWidgetFilterMode(v)
    });

    const replaceWidget = (i, k) => widgetStore.replaceWidget(i, k);
    const setForecastState = (k, v) => widgetStore.setForecastState(k, v);
    const setWidgetSortMode = (m) => widgetStore.setWidgetSortMode(m);
    const setWidgetFilterMode = (m) => widgetStore.setWidgetFilterMode(m);

    // --- 3. PROJECTION STORE BRIDGES ---
    const projection = computed({
        get: () => useProjectionStore().projection,
        set: (v) => useProjectionStore().projection = v
    });

    // --- 4. DATA STATE ---
    const snapshot = ref({
        totalBalance: 0,
        accountBalances: {},
        companyBalances: {},
        individualBalances: {},
        contractorBalances: {},
        projectBalances: {},
        categoryTotals: {},
        timestamp: null
    });

    const displayCache = ref({});
    const calculationCache = ref({});

    // --- TAX OPS CACHE (ALL-TIME) ---
    // Taxes widget must show cumulative fact for the whole history, independent of projection range.
    const taxOpsCache = ref([]);            // full-history operations (merged transfers + populated)
    const taxOpsMaxDate = ref(null);        // ISO string of the max loaded date
    const isTaxOpsLoading = ref(false);
    let taxOpsLoadPromise = null;


    const earliestEventDate = ref(null); // earliest operation date (from /auth/me)
    const accounts = ref([]);
    const companies = ref([]);
    const contractors = ref([]);
    const projects = ref([]);
    const individuals = ref([]);
    const categories = ref([]);
    const credits = ref([]);
    const taxes = ref([]);

    // 🟢 Prepayments are stored in categories with isPrepayment: true
    const prepayments = computed(() => categories.value.filter(c => c.isPrepayment === true));

    // 🟢 Recurring operations (future feature - currently empty)
    const recurringOperations = ref([]);

    const dealOperations = ref([]);

    // --- Helpers ---
    const _toStr = (val) => {
        if (!val) return '';
        if (typeof val === 'object') {
            return val._id ? String(val._id) : '';
        }
        return String(val);
    };

    const _idsMatch = (id1, id2) => {
        if (!id1 || !id2) return false;
        const s1 = (typeof id1 === 'object' && id1 !== null) ? id1._id : id1;
        const s2 = (typeof id2 === 'object' && id2 !== null) ? id2._id : id2;
        return String(s1) === String(s2);
    };

    const _getDayOfYear = (date) => {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000);
        return Math.floor(diff / 86400000);
    };

    const _getDateKey = (date) => {
        const year = date.getFullYear();
        const doy = _getDayOfYear(date);
        return `${year}-${doy}`;
    };

    const _parseDateKey = (dateKey) => {
        if (typeof dateKey !== 'string' || !dateKey.includes('-')) {
            const now = new Date();
            now.setHours(12, 0, 0, 0);
            return now;
        }
        const [year, doy] = dateKey.split('-').map(Number);
        const date = new Date(year, 0, 1);
        date.setDate(doy);
        date.setHours(12, 0, 0, 0);
        return date;
    };

    const _isEffectivelyPastOrToday = (dateInput) => {
        if (!dateInput) return false;
        const d = new Date(dateInput);
        const cutoff = new Date();
        cutoff.setHours(23, 59, 59, 999);
        return d.getTime() <= cutoff.getTime();
    };

    // --- EXCLUDED ACCOUNTS ---
    const excludedAccountIds = computed(() => {
        const set = new Set();
        accounts.value.forEach(a => {
            if (a && a.isExcluded) set.add(String(a._id));
        });
        return set;
    });

    const allKnownOperations = computed(() => {
        const uniqueMap = new Map();
        const contentMap = new Map(); // Secondary deduplication by content

        const addOperation = (op) => {
            if (!op || !op._id) return;

            const id = String(op._id);

            // Primary deduplication by ID
            if (uniqueMap.has(id)) return;

            // Secondary deduplication by content
            // Normalize function to compare values case-insensitively
            const normalize = (v) => String(v || '').trim().toLowerCase();

            const contentKey = [
                op.date ? new Date(op.date).toISOString().slice(0, 10) : '',
                Math.abs(Number(op.amount ?? 0)), // Normalize amount to absolute value
                normalize(op.type),
                normalize(op.contractorId ?? op.contractorName ?? op.contractor ?? ''),
                normalize(op.categoryId ?? op.categoryName ?? op.category ?? ''),
                normalize(op.accountId ?? op.accountName ?? op.account ?? ''),
                normalize(op.description ?? op.desc ?? op.note ?? '')
            ].join('|');

            if (contentMap.has(contentKey)) {
                const existingId = contentMap.get(contentKey);
                console.warn('[DEDUP] Skipping duplicate operation:', {
                    duplicateId: id,
                    originalId: existingId,
                    date: op.date,
                    amount: op.amount,
                    type: op.type,
                    contractor: op.contractorName ?? op.contractor
                });
                return;
            }

            uniqueMap.set(id, op);
            contentMap.set(contentKey, id);
        };

        // Include operations from displayCache (loaded via fetchOperationsRange)
        Object.values(displayCache.value).forEach(dayOps => {
            if (Array.isArray(dayOps)) {
                dayOps.forEach(addOperation);
            }
        });

        // Include deal operations
        dealOperations.value.forEach(addOperation);

        // Include tax operations
        taxKnownOperations.value.forEach(addOperation);

        return Array.from(uniqueMap.values());
    });

    const allOpsMap = computed(() => {
        const map = new Map();
        allKnownOperations.value.forEach(op => map.set(String(op._id), op));
        return map;
    });

    const _isOpVisible = (op) => {
        if (includeExcludedInTotal.value) return true;
        if (!op) return false;

        const isExcludedId = (id) => {
            if (!id) return false;
            const idStr = typeof id === 'object' ? String(id._id) : String(id);
            return excludedAccountIds.value.has(idStr);
        };

        if (op.accountId && isExcludedId(op.accountId)) return false;

        // IMPORTANT: some ops (prepayments/deals/legacy) may carry account routing in from/to fields
        // even when they are NOT marked as transfer. If any related account is excluded, hide the op.
        if (op.fromAccountId && isExcludedId(op.fromAccountId)) return false;
        if (op.toAccountId && isExcludedId(op.toAccountId)) return false;

        // Fallback for older payloads
        if (op.account && isExcludedId(op.account)) return false;

        if (op.relatedEventId && !op.accountId) {
            const parentId = typeof op.relatedEventId === 'object'
                ? String(op.relatedEventId._id)
                : String(op.relatedEventId);

            let parent = allOpsMap.value.get(parentId);
            if (!parent) {
                parent = dealOperations.value.find(d => _idsMatch(d._id, parentId));
            }

            if (parent) {
                if (parent.accountId && isExcludedId(parent.accountId)) return false;
                if (parent.fromAccountId && isExcludedId(parent.fromAccountId)) return false;
                if (parent.toAccountId && isExcludedId(parent.toAccountId)) return false;
                if (parent.account && isExcludedId(parent.account)) return false;
            }
        }

        return true;
    };

    const _calculateAggregatedBalance = (ops, groupByField, sumField = 'amount') => {
        const map = new Map();
        ops.forEach(op => {
            if (!op) return;

            // 🔥 FIX: WorkAct is a marker op for deal closing, it must NOT affect balances
            if (op.isWorkAct) return;

            if (!_isOpVisible(op)) return;

            let key = null;
            const rawKey = op[groupByField];
            key = _toStr(rawKey);
            if (!key) return;

            // transfers are handled separately (except individual grouping)
            if ((op.type === 'transfer' || op.isTransfer) && groupByField !== 'individualId') return;

            const amt = Math.abs(op[sumField] || 0);
            const sign = op.type === 'income' ? 1 : -1;
            const value = amt * sign;
            map.set(key, (map.get(key) || 0) + value);
        });
        return map;
    };

    // --- Categories Logic ---
    const _isTransferCategory = (cat) => {
        if (!cat) return false;
        const name = cat.name.toLowerCase().trim();
        return name === 'перевод' || name === 'transfer';
    };

    const _isInterCompanyCategory = (cat) => {
        if (!cat) return false;
        const name = cat.name.toLowerCase().trim();
        return ['меж.комп', 'межкомпаний', 'inter-comp', 'inter_company'].includes(name);
    };

    const _isInterCompanyOp = (op) => {
        if (!op || !op.categoryId) return false;
        const name = (op.categoryId.name || '').toLowerCase().trim();
        if (!name && typeof op.categoryId === 'string') {
            const cat = categories.value.find(c => _idsMatch(c._id, op.categoryId));
            if (cat) {
                const n = cat.name.toLowerCase().trim();
                return ['меж.комп', 'межкомпаний', 'inter-comp'].includes(n);
            }
        }
        return ['меж.комп', 'межкомпаний', 'inter-comp'].includes(name);
    };

    const prepaymentCategoryIdsSet = computed(() => {
        const ids = new Set();
        categories.value.forEach(c => {
            const n = c.name.toLowerCase().trim();
            if (n.includes('предоплата') || n.includes('prepayment') || n.includes('аванс')) {
                ids.add(c._id);
            }
        });
        return ids;
    });

    const getPrepaymentCategoryIds = computed(() => Array.from(prepaymentCategoryIdsSet.value));

    const _isPrepaymentOp = (op) => {
        if (!op) return false;
        const prepayIds = prepaymentCategoryIdsSet.value;
        const catId = op.categoryId?._id || op.categoryId;
        const prepId = op.prepaymentId?._id || op.prepaymentId;
        if ((catId && prepayIds.has(catId)) || (prepId && prepayIds.has(prepId))) return true;
        if (op.categoryId && op.categoryId.isPrepayment) return true;
        return false;
    };

    // 🟢 SAFE SORT (ROBUST)
    const _sortByOrder = (arr) => {
        if (!Array.isArray(arr)) return [];
        const safeArr = arr.filter(x => x && typeof x === 'object');
        return safeArr.sort((a, b) => {
            const orderA = (a.order !== undefined && a.order !== null) ? Number(a.order) : 0;
            const orderB = (b.order !== undefined && b.order !== null) ? Number(b.order) : 0;

            const orderDiff = orderA - orderB;
            if (orderDiff !== 0) return orderDiff;

            const idA = a._id ? String(a._id) : '';
            const idB = b._id ? String(b._id) : '';
            return idA.localeCompare(idB);
        });
    };

    // --- Special Entities ---
    const retailIndividualId = computed(() => {
        const retail = individuals.value.find(i => {
            const n = i.name.trim().toLowerCase();
            return n === 'розничные клиенты' || n === 'розница';
        });
        return retail ? retail._id : null;
    });

    const realizationCategoryId = computed(() => {
        const cat = categories.value.find(c => c.name.trim().toLowerCase() === 'реализация');
        return cat ? cat._id : null;
    });

    const creditCategoryId = computed(() => {
        const cat = categories.value.find(c => {
            const n = c.name.trim().toLowerCase();
            return n === 'кредиты' || n === 'credit' || n === 'credits';
        });
        return cat ? cat._id : null;
    });

    const loanRepaymentCategoryId = computed(() => {
        const cat = categories.value.find(c => {
            const n = c.name.trim().toLowerCase();
            return n === 'погашение займов' || n === 'loan repayment' || n === 'выплата кредита' || n === 'погашение кредита';
        });
        return cat ? cat._id : null;
    });

    const _isCreditIncome = (op) => {
        if (!op) return false;
        if (op.type !== 'income') return false;
        const catId = op.categoryId?._id || op.categoryId;
        return catId && creditCategoryId.value && String(catId) === String(creditCategoryId.value);
    };

    const remainingDebtCategoryId = computed(() => {
        const cat = categories.value.find(c => c.name.trim().toLowerCase() === 'остаток долга');
        return cat ? cat._id : null;
    });

    const refundCategoryId = computed(() => {
        const cat = categories.value.find(c => c.name.trim().toLowerCase() === 'возврат');
        return cat ? cat._id : null;
    });

    const _isRetailWriteOff = (op) => {
        if (!op) return false;
        if (op.type !== 'expense') return false;
        if (op.accountId) return false;
        const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
        if (indId && retailIndividualId.value && _idsMatch(indId, retailIndividualId.value)) return true;
        return false;
    };

    const _isRetailRefund = (op) => {
        if (!op) return false;
        if (op.type !== 'expense') return false;
        const catId = op.categoryId?._id || op.categoryId;
        if (catId && refundCategoryId.value && _idsMatch(catId, refundCategoryId.value)) {
            const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
            return indId && retailIndividualId.value && _idsMatch(indId, retailIndividualId.value);
        }
        return false;
    };

    const _isTaxPayment = (op) => {
        if (!op) return false;
        if (op.type !== 'expense') return false;
        return taxes.value.some(t => {
            const relId = typeof t.relatedEventId === 'object' ? t.relatedEventId._id : t.relatedEventId;
            return _idsMatch(relId, op._id);
        });
    };

    function _updateDealCache(op, mode = 'add') {
        // 🟢 FIX: Добавлена проверка op.isPrepayment === true
        // Теперь одиночные предоплаты без бюджета сразу попадают в кэш сделок и видны в виджете
        const isDealRelated = (op.totalDealAmount || 0) > 0 || op.isDealTranche === true || op.isWorkAct === true || op.isPrepayment === true;
        if (!isDealRelated) return;

        if (mode === 'add') {
            const idx = dealOperations.value.findIndex(d => _idsMatch(d._id, op._id));
            if (idx === -1) {
                dealOperations.value = [...dealOperations.value, op];
            }
        } else if (mode === 'update') {
            const idx = dealOperations.value.findIndex(d => _idsMatch(d._id, op._id));
            if (idx !== -1) {
                const newArr = [...dealOperations.value];
                newArr[idx] = op;
                dealOperations.value = newArr;
            } else {
                dealOperations.value = [...dealOperations.value, op];
            }
        } else if (mode === 'delete') {
            dealOperations.value = dealOperations.value.filter(d => !_idsMatch(d._id, op._id));
        }
    }

    const getAllRelevantOps = computed(() => {
        return allKnownOperations.value.filter(op => _isOpVisible(op));
    });

    const liabilitiesTheyOwe = computed(() => useDealStore().liabilitiesTheyOweCurrent);
    const liabilitiesWeOwe = computed(() => useDealStore().liabilitiesWeOweCurrent);
    const liabilitiesWeOweFuture = computed(() => useDealStore().liabilitiesWeOweTotal);
    const liabilitiesTheyOweFuture = computed(() => useDealStore().liabilitiesTheyOweTotal);

    function getProjectDealStatus(projectId, categoryId = null, contractorId = null, counterpartyIndividualId = null) {
        return useDealStore().getDealStatus(projectId, categoryId, contractorId || counterpartyIndividualId);
    }

    // 🟢 🔴 FIX: ULTRA-STRICT CLOSING LOGIC
    // 1. Exclude the CURRENT operation from closing (it must remain orange)
    // 2. Ignore pure "Fact" operations (no deal flags)
    async function closeDealScope(projectId, categoryId, contractorId, counterpartyIndividualId, excludeOpId = null) {
        console.log('Smart Closing: Updating tranches for deal scope...', { excludeOpId });

        const pId = _toStr(projectId);
        const cId = _toStr(categoryId);
        const targetContrId = contractorId ? _toStr(contractorId) : (counterpartyIndividualId ? _toStr(counterpartyIndividualId) : null);

        if (!pId || !cId || !targetContrId) return;

        const candidates = allKnownOperations.value.filter(op => {
            if (op.type !== 'income') return false;
            if (op.isTransfer) return false;

            // 🟢 1. SELF-PROTECTION: Exclude the operation we just created/are creating
            if (excludeOpId && _idsMatch(op._id, excludeOpId)) {
                return false;
            }

            // 🟢 2. FACT PROTECTION: Exclude pure facts
            // Only close things that are explicitly part of a deal structure
            const isExplicitPrepay = op.isPrepayment === true;
            const isTranche = op.isDealTranche === true;
            const hasBudget = (op.totalDealAmount || 0) > 0;

            if (!isExplicitPrepay && !isTranche && !hasBudget) {
                return false; // This is a FACT (Clean Income), don't touch it.
            }

            const opPid = _toStr(op.projectId?._id || op.projectId);
            const opCid = _toStr(op.categoryId?._id || op.categoryId);

            if (opPid !== pId || opCid !== cId) return false;

            const opContr = op.contractorId ? (op.contractorId._id || op.contractorId) : (op.counterpartyIndividualId?._id || op.counterpartyIndividualId);
            return _toStr(opContr) === targetContrId;
        });

        for (const op of candidates) {
            if (!op.isClosed) {
                await updateOperation(op._id, { ...op, isClosed: true });
            }
        }
    }

    async function reopenDealScope(closingOp) {
        console.log('Rollback: Reopening deal scope...', closingOp);

        const projectId = closingOp.projectId;
        const categoryId = closingOp.categoryId;
        const contractorId = closingOp.contractorId;
        const counterpartyIndividualId = closingOp.counterpartyIndividualId;

        const pId = _toStr(projectId);
        const cId = _toStr(categoryId);
        const targetContrId = contractorId ? _toStr(contractorId) : (counterpartyIndividualId ? _toStr(counterpartyIndividualId) : null);

        if (!pId || !cId || !targetContrId) return;

        const candidates = allKnownOperations.value.filter(op => {
            if (op.type !== 'income') return false;
            if (op.isTransfer) return false;

            // Strict check here too for consistency
            const isExplicitPrepay = op.isPrepayment === true;
            const isTranche = op.isDealTranche === true;
            const hasBudget = (op.totalDealAmount || 0) > 0;

            if (!isExplicitPrepay && !isTranche && !hasBudget) {
                return false;
            }

            const opPid = _toStr(op.projectId?._id || op.projectId);
            const opCid = _toStr(op.categoryId?._id || op.categoryId);

            if (opPid !== pId || opCid !== cId) return false;

            const opContr = op.contractorId ? (op.contractorId._id || op.contractorId) : (op.counterpartyIndividualId?._id || op.counterpartyIndividualId);
            return _toStr(opContr) === targetContrId;
        });

        for (const op of candidates) {
            if (op.isClosed === true) {
                await updateOperation(op._id, { ...op, isClosed: false });
            }
        }
    }

    async function closePreviousTranches(p, c, co, ci, excludeOpId) {
        return closeDealScope(p, c, co, ci, excludeOpId);
    }

    // ... (Categories/Contractors getters remain unchanged) ...

    const getActCategoryIds = computed(() => {
        return categories.value
            .filter(c => {
                const n = c.name.toLowerCase().trim();
                return n.includes('акт') || n.includes('act') || n.includes('выполненных работ') || n.includes('реализация');
            })
            .map(c => c._id);
    });

    const visibleCategories = computed(() => {
        return categories.value.filter(c => {
            if (_isTransferCategory(c)) return false;
            if (_isInterCompanyCategory(c)) return false;
            if (c.isPrepayment) return false;
            const n = c.name.toLowerCase().trim();
            if (n === 'предоплата' || n === 'prepayment') return false;
            return true;
        });
    });

    const visibleContractors = computed(() => {
        const myEntityNames = new Set([
            ...companies.value.map(c => c.name.toLowerCase().trim()),
            ...individuals.value.map(i => i.name.toLowerCase().trim())
        ]);

        return contractors.value.filter(c => {
            const n = c.name.toLowerCase().trim();
            if (n === 'физлица' || n === 'individuals') return false;
            if (myEntityNames.has(n)) return false;
            return true;
        });
    });

    // ... (Data Caching Logic remains unchanged) ...
    const allOperationsFlat = computed(() => {
        const allOps = [];
        Object.values(calculationCache.value).forEach(dayOps => {
            if (Array.isArray(dayOps)) {
                dayOps.forEach(op => { if (op && typeof op === 'object') { allOps.push(op); } });
            }
        });
        return allOps;
    });



    // --- TAX CALC SOURCE OPS (ALL-TIME + currently loaded/optimistic) ---
    // We merge:
    // 1) taxOpsCache (all-time history loaded in background)
    // 2) allOperationsFlat (current range + optimistic ops)
    // 3) dealOperations (may include older ops outside current range)
    // This guarantees calculateTaxForPeriod works even before the full history is loaded.
    const taxKnownOperations = computed(() => {
        const map = new Map();
        (taxOpsCache.value || []).forEach(op => {
            if (op && op._id) map.set(String(op._id), op);
        });
        (allOperationsFlat.value || []).forEach(op => {
            if (op && op._id && !map.has(String(op._id))) map.set(String(op._id), op);
        });
        (dealOperations.value || []).forEach(op => {
            if (op && op._id && !map.has(String(op._id))) map.set(String(op._id), op);
        });
        return Array.from(map.values());
    });

    async function _fetchOperationsListChunked(startDate, endDate, chunkDays = 120) {
        const out = [];

        const cursor = new Date(startDate);
        cursor.setHours(0, 0, 0, 0);

        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        while (cursor <= end) {
            const chunkStart = new Date(cursor);
            const chunkEnd = new Date(chunkStart);
            chunkEnd.setDate(chunkEnd.getDate() + (chunkDays - 1));
            if (chunkEnd > end) chunkEnd.setTime(end.getTime());

            const response = await axios.get(`${API_BASE_URL}/events`, {
                params: {
                    startDate: chunkStart.toISOString(),
                    endDate: chunkEnd.toISOString()
                }
            });

            const rawOps = Array.isArray(response.data) ? response.data : [];
            const processedOps = _mergeTransfers(rawOps).map(op => {
                const dk = op.dateKey || _getDateKey(new Date(op.date));
                return _populateOp({ ...op, dateKey: dk });
            });

            out.push(...processedOps);

            cursor.setDate(cursor.getDate() + chunkDays);
        }

        return out;
    }

    async function ensureTaxOpsUntil(endDateInput = null, startDateInput = null) {
        if (!user.value) return;

        const endDate = endDateInput ? new Date(endDateInput) : new Date();
        endDate.setHours(23, 59, 59, 999);

        // already covered
        if (taxOpsMaxDate.value && endDate.getTime() <= new Date(taxOpsMaxDate.value).getTime()) return;

        // if a load is in-flight, await it, then re-check
        if (isTaxOpsLoading.value && taxOpsLoadPromise) {
            await taxOpsLoadPromise;
            if (taxOpsMaxDate.value && endDate.getTime() <= new Date(taxOpsMaxDate.value).getTime()) return;
        }

        // Lower bound for "all-time" taxes history:
        // - Prefer backend-provided earliest operation date (minEventDate)
        // - Fallback to user createdAt
        // - Fallback to min date already present in known ops (if any)
        // - Final safety fallback: 5 years back (avoid loading from year 2000)
        let hardMinDate = null;
        if (earliestEventDate.value) {
            hardMinDate = new Date(earliestEventDate.value);
        } else if (user.value?.minEventDate || user.value?.createdAt) {
            const raw = user.value.minEventDate || user.value.createdAt;
            const d = new Date(raw);
            if (!Number.isNaN(d.getTime())) hardMinDate = d;
        } else {
            const ops = (taxKnownOperations?.value || []).filter(o => o && o.date);
            if (ops.length) {
                let minT = null;
                for (const o of ops) {
                    const dt = new Date(o.date);
                    if (Number.isNaN(dt.getTime())) continue;
                    const t = dt.getTime();
                    if (minT === null || t < minT) minT = t;
                }
                if (minT !== null) hardMinDate = new Date(minT);
            }
        }
        if (!hardMinDate || Number.isNaN(hardMinDate.getTime())) {
            hardMinDate = new Date(new Date().getFullYear() - 5, 0, 1);
        }
        hardMinDate.setHours(0, 0, 0, 0);

        // 🚀 PERFORMANCE: If startDateInput provided, use it for range loading
        let startDate;
        if (startDateInput) {
            startDate = new Date(startDateInput);
            startDate.setHours(0, 0, 0, 0);
            console.log(`[PERF] Loading operations range: ${startDate.toISOString()} -> ${endDate.toISOString()}`);
        } else {
            // Original logic: incremental loading from where we left off
            startDate = taxOpsMaxDate.value
                ? (() => {
                    const d = new Date(taxOpsMaxDate.value);
                    d.setDate(d.getDate() + 1);
                    d.setHours(0, 0, 0, 0);
                    return d;
                })()
                : hardMinDate;
        }

        // Safety clamp: never request earlier than hardMinDate
        if (startDate.getTime() < hardMinDate.getTime()) {
            startDate.setTime(hardMinDate.getTime());
        }

        isTaxOpsLoading.value = true;
        taxOpsLoadPromise = (async () => {
            try {
                const newOps = await _fetchOperationsListChunked(startDate, endDate);

                const map = new Map();
                (taxOpsCache.value || []).forEach(op => {
                    if (op && op._id) map.set(String(op._id), op);
                });
                newOps.forEach(op => {
                    if (op && op._id) map.set(String(op._id), op);
                });

                taxOpsCache.value = Array.from(map.values());
                taxOpsMaxDate.value = endDate.toISOString();
            } catch (e) {
                console.error('[tax] ensureTaxOpsUntil failed:', e);
            } finally {
                isTaxOpsLoading.value = false;
                taxOpsLoadPromise = null;
            }
        })();

        await taxOpsLoadPromise;
    }

    // Keep tax cache extended when user changes projection range
    watch(
        () => projection.value?.rangeEndDate,
        (d) => {
            const end = d ? new Date(d) : new Date();
            // do not block UI
            void ensureTaxOpsUntil(end);
        },
        { immediate: true }
    );
    const futureOps = computed(() => {
        const rawFuture = useProjectionStore().futureOps;
        return rawFuture.filter(op => _isOpVisible(op));
    });

    const displayOperationsFlat = computed(() => {
        const displayOps = [];
        Object.values(displayCache.value).forEach(dayOps => {
            if (Array.isArray(dayOps)) {
                displayOps.push(...dayOps.filter(op => op && typeof op === 'object'));
            }
        });
        return displayOps;
    });

    const isTransfer = (op) => !!op && (op.type === 'transfer' || op.isTransfer === true);

    // Helper function to calculate period date range
    function _getPeriodRange(period) {
        const now = new Date();
        let startDate, endDate;

        if (period.mode === 'currentMonth') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            endDate = new Date(now.getFullYear(), now.getMonth(), lastDay);
            endDate.setHours(23, 59, 59, 999);
        } else if (period.mode === 'previousMonth') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            startDate.setHours(0, 0, 0, 0);
            const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
            endDate = new Date(now.getFullYear(), now.getMonth() - 1, lastDay);
            endDate.setHours(23, 59, 59, 999);
        } else if (period.mode === 'custom' && period.customStart && period.customEnd) {
            // 🔥 CRITICAL: ISO strings convert to UTC, causing timezone shift
            // Example: "2025-12-31T00:00:00.000Z" (UTC) becomes Dec 30 19:00 in GMT+5
            // Solution: Extract YYYY-MM-DD and create Date in local timezone

            const parseLocalDate = (isoString) => {
                const date = new Date(isoString);
                // Get local date components
                const year = date.getFullYear();
                const month = date.getMonth();
                const day = date.getDate();
                // Create new Date in local timezone with these components
                return new Date(year, month, day);
            };

            startDate = parseLocalDate(period.customStart);
            startDate.setHours(0, 0, 0, 0); // Start of day
            endDate = parseLocalDate(period.customEnd);
            endDate.setHours(23, 59, 59, 999); // End of day - includes last day fully

            // 🔍 DEBUG: Log parsed dates
            console.log('[PERIOD FILTER DEBUG]', {
                customStart: period.customStart,
                customEnd: period.customEnd,
                parsedStartDate: startDate.toISOString(),
                parsedEndDate: endDate.toISOString(),
                localStartDate: startDate.toString(),
                localEndDate: endDate.toString()
            });
        }

        return { startDate, endDate };
    }

    const currentOps = computed(() => {
        const _tick = snapshot.value.timestamp;
        // 🔥 FIX: Explicitly read periodFilter fields for proper Vue reactivity
        const filterMode = periodFilter.value.mode;
        const filterStart = periodFilter.value.customStart;
        const filterEnd = periodFilter.value.customEnd;

        const result = allKnownOperations.value.filter(op => {
            if (!op?.date) return false;
            if (!_isOpVisible(op)) return false;

            // 🟢 Period filter: Show only operations within selected period
            if (filterMode === 'custom') {
                const opDate = new Date(op.date);
                const { startDate, endDate } = _getPeriodRange(periodFilter.value);
                if (startDate && endDate) {
                    // 🔍 DEBUG: Log comparison for operations near end of period
                    if (opDate.getDate() >= 30 || opDate.getDate() === 1) {
                        console.log('[OP FILTER DEBUG]', {
                            opId: op._id,
                            opDateRaw: op.date,
                            opDateParsed: opDate.toISOString(),
                            opDateLocal: opDate.toString(),
                            startDate: startDate.toISOString(),
                            endDate: endDate.toISOString(),
                            comparison: {
                                beforeStart: opDate < startDate,
                                afterEnd: opDate > endDate,
                                willFilter: opDate < startDate || opDate > endDate
                            }
                        });
                    }
                    if (opDate < startDate || opDate > endDate) return false;
                }
            }

            return _isEffectivelyPastOrToday(op.date);
        });

        return result;
    });

    async function fetchSnapshot() {
        try {
            const clientDate = new Date().toISOString();
            const res = await axios.get(`${API_BASE_URL}/snapshot`, {
                params: { date: clientDate }
            });
            snapshot.value = res.data;
        } catch (e) {
            console.error('Failed to fetch snapshot:', e);
        }
    }

    // ... (Snapshot optimistics logic remains unchanged) ...
    const _applyOptimisticSnapshotUpdate = (op, sign) => {
        const s = snapshot.value;
        s.timestamp = new Date().toISOString();

        if (op.isWorkAct) return;

        const absAmt = Math.abs(Number(op.amount) || 0);
        const updateMap = (map, id, delta) => {
            if (!id) return;
            const key = (typeof id === 'object' ? id._id : id).toString();
            if (map[key] === undefined) map[key] = 0;
            map[key] += delta;
        };

        if (isTransfer(op)) {
            updateMap(s.accountBalances, op.fromAccountId, -absAmt * sign);
            updateMap(s.accountBalances, op.toAccountId, absAmt * sign);
            updateMap(s.companyBalances, op.fromCompanyId, -absAmt * sign);
            updateMap(s.companyBalances, op.toCompanyId, absAmt * sign);
            updateMap(s.individualBalances, op.fromIndividualId, -absAmt * sign);
            updateMap(s.individualBalances, op.toIndividualId, absAmt * sign);
        } else {
            if (_isRetailWriteOff(op)) return;
            const isIncome = op.type === 'income';
            const signedAmt = (isIncome ? absAmt : -absAmt);
            const netChange = signedAmt * sign;
            if (op.accountId) {
                updateMap(s.accountBalances, op.accountId, netChange);
            }
            updateMap(s.companyBalances, op.companyId, netChange);
            updateMap(s.individualBalances, op.individualId, netChange);
            updateMap(s.individualBalances, op.counterpartyIndividualId, netChange);
            updateMap(s.contractorBalances, op.contractorId, netChange);
            updateMap(s.projectBalances, op.projectId, netChange);

            const catId = op.categoryId ? (typeof op.categoryId === 'object' ? op.categoryId._id : op.categoryId).toString() : null;
            if (catId) {
                if (!s.categoryTotals[catId]) s.categoryTotals[catId] = { income: 0, expense: 0, total: 0 };
                const catEntry = s.categoryTotals[catId];
                if (isIncome) {
                    catEntry.income += (absAmt * sign);
                    catEntry.total += (absAmt * sign);
                } else {
                    catEntry.expense += (absAmt * sign);
                    catEntry.total -= (absAmt * sign);
                }
            }
        }
    };

    // ... (Computed lists for widgets remain unchanged) ...
    const currentTransfers = computed(() => currentOps.value.filter(op => isTransfer(op)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

    const currentIncomes = computed(() => currentOps.value.filter(op =>
        !isTransfer(op) &&
        op.type === 'income' &&
        !op.isWithdrawal &&
        !_isInterCompanyOp(op) &&
        !_isCreditIncome(op)
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

    const currentExpenses = computed(() => currentOps.value.filter(op => !isTransfer(op) && op.type === 'expense' && !op.isWithdrawal && !_isInterCompanyOp(op) && !_isRetailWriteOff(op) && !op.isWorkAct).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    const currentWithdrawals = computed(() => currentOps.value.filter(op => op.isWithdrawal).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

    const futureTransfers = computed(() => futureOps.value.filter(op => isTransfer(op)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));

    const futureIncomes = computed(() => futureOps.value.filter(op =>
        !isTransfer(op) &&
        op.type === 'income' &&
        !op.isWithdrawal &&
        !_isInterCompanyOp(op) &&
        !_isCreditIncome(op)
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));

    const futureExpenses = computed(() => futureOps.value.filter(op => !isTransfer(op) && op.type === 'expense' && !op.isWithdrawal && !_isInterCompanyOp(op) && !_isRetailWriteOff(op) && !op.isWorkAct).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    const futureWithdrawals = computed(() => futureOps.value.filter(op => op.isWithdrawal).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));

    const getCategoryById = (id) => categories.value.find(c => _idsMatch(c._id, id));

    const currentCategoryBreakdowns = computed(() => {
        if (includeExcludedInTotal.value) {
            const raw = snapshot.value.categoryTotals || {};
            const mapped = {};
            Object.keys(raw).forEach(id => { mapped[`cat_${id}`] = raw[id]; });
            return mapped;
        }

        const aggregated = _calculateAggregatedBalance(currentOps.value, 'categoryId');

        const mapped = {};
        aggregated.forEach((val, key) => {
            mapped[`cat_${key}`] = { total: val };
        });
        return mapped;
    });

    const futureCategoryBreakdowns = computed(() => {
        const map = {};
        for (const op of futureOps.value) {
            if (isTransfer(op)) continue;
            if (!op?.categoryId) continue;
            const cId = op.categoryId._id || op.categoryId;
            if (!map[cId]) map[cId] = { income: 0, expense: 0, total: 0 };
            const amt = Math.abs(Number(op.amount) || 0);
            if (op.type === 'income') { map[cId].income += (Number(op.amount) || 0); map[cId].total += (Number(op.amount) || 0); }
            else if (op.type === 'expense' && !op.isWorkAct) { map[cId].expense += amt; map[cId].total -= amt; }
        }
        const widgetMap = {};
        Object.keys(map).forEach(id => { widgetMap[`cat_${id}`] = map[id]; });
        return widgetMap;
    });

    const canToggleAccountVisibility = computed(() => {
        if (isWorkspaceOwner.value || isWorkspaceAdmin.value) {
            return true;
        }
        return false;
    });

    const currentAccountBalances = computed(() => {
        return accounts.value.reduce((acc, a) => {
            if (!includeExcludedInTotal.value && a.isExcluded) {
                return acc;
            }
            acc.push({
                ...a,
                balance: Number(snapshot.value.accountBalances[a._id] || 0) + Number(a.initialBalance || 0)
            });
            return acc;
        }, []);
    });

    const futureAccountBalances = computed(() => {
        const futureMap = _calculateFutureEntityBalance(snapshot.value.accountBalances, 'accountId');
        return accounts.value.reduce((acc, a) => {
            if (!includeExcludedInTotal.value && a.isExcluded) return acc;
            acc.push({
                ...a,
                balance: Number(futureMap[a._id] || 0) + Number(a.initialBalance || 0)
            });
            return acc;
        }, []);
    });

    const currentCompanyBalances = computed(() => {
        return companies.value.map(comp => {
            const targetId = _toStr(comp._id);
            const linked = currentAccountBalances.value.filter(a => {
                return _toStr(a.companyId) === targetId;
            });
            const total = linked.reduce((sum, acc) => sum + acc.balance, 0);
            return { ...comp, balance: total };
        });
    });

    const futureCompanyBalances = computed(() => {
        return companies.value.map(comp => {
            const targetId = _toStr(comp._id);
            const linked = futureAccountBalances.value.filter(a => {
                return _toStr(a.companyId) === targetId;
            });
            const total = linked.reduce((sum, acc) => sum + acc.balance, 0);
            return { ...comp, balance: total };
        });
    });

    const currentContractorBalances = computed(() => {
        // Always calculate from filtered currentOps to respect period filter
        const aggregated = _calculateAggregatedBalance(currentOps.value, 'contractorId');
        return contractors.value.map(c => ({
            ...c,
            balance: aggregated.get(String(c._id)) || 0
        }));
    });

    const futureContractorBalances = computed(() => {
        return futureContractorChanges.value;
    });

    const currentProjectBalances = computed(() => {
        // Always calculate from filtered currentOps to respect period filter
        const aggregated = _calculateAggregatedBalance(currentOps.value, 'projectId');
        return projects.value.map(p => ({
            ...p,
            balance: aggregated.get(String(p._id)) || 0
        }));
    });

    const futureProjectBalances = computed(() => futureProjectChanges.value);

    const currentCategoryBalances = computed(() => {
        // Always calculate from filtered currentOps to respect period filter
        const aggregated = _calculateAggregatedBalance(currentOps.value, 'categoryId');
        return categories.value.map(c => ({
            ...c,
            balance: aggregated.get(String(c._id)) || 0
        }));
    });

    const futureCategoryBalances = computed(() => {
        const breakdown = futureCategoryBreakdowns.value;
        return categories.value.map(c => ({ ...c, balance: (breakdown[`cat_${c._id}`]?.total || 0) }));
    });

    const _calculateFutureEntityChange = (entityIdField) => {
        const futureMap = {};
        for (const op of futureOps.value) {
            if (_isRetailWriteOff(op) || op.isWorkAct) continue;
            const amt = Math.abs(Number(op.amount) || 0);
            if (entityIdField === 'accountId' && !op.accountId && !op.fromAccountId && !op.toAccountId) continue;
            if (isTransfer(op)) {
                let fromId, toId;
                if (entityIdField === 'accountId') { fromId = op.fromAccountId; toId = op.toAccountId; }
                else if (entityIdField === 'companyId') { fromId = op.fromCompanyId; toId = op.toCompanyId; }
                else if (entityIdField === 'individualId') { fromId = op.fromIndividualId; toId = op.toIndividualId; }
                else continue;
                fromId = fromId?._id || fromId; toId = toId?._id || toId;
                if (fromId) { if (futureMap[fromId] === undefined) futureMap[fromId] = 0; futureMap[fromId] -= amt; }
                if (toId) { if (futureMap[toId] === undefined) futureMap[toId] = 0; futureMap[toId] += amt; }
            } else {
                if (entityIdField === 'individualId') {
                    const ownerId = op.individualId?._id || op.individualId;
                    const contrId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
                    if (ownerId) { if (futureMap[ownerId] === undefined) futureMap[ownerId] = 0; if (op.type === 'income') futureMap[ownerId] += (Number(op.amount) || 0); else futureMap[ownerId] -= amt; }
                    if (contrId) { if (futureMap[contrId] === undefined) futureMap[contrId] = 0; if (op.type === 'income') futureMap[contrId] += (Number(op.amount) || 0); else futureMap[contrId] -= amt; }
                } else {
                    let id = op[entityIdField]; id = id?._id || id; if (!id) continue;
                    if (futureMap[id] === undefined) futureMap[id] = 0;
                    if (op.type === 'income') futureMap[id] += (Number(op.amount) || 0); else futureMap[id] -= amt;
                }
            }
        }
        return futureMap;
    };

    const futureContractorChanges = computed(() => {
        const futureMap = _calculateFutureEntityChange('contractorId');
        return contractors.value.map(c => ({ ...c, balance: futureMap[c._id] || 0 }));
    });

    const futureProjectChanges = computed(() => {
        const futureMap = _calculateFutureEntityChange('projectId');
        return projects.value.map(p => ({ ...p, balance: futureMap[p._id] || 0 }));
    });

    const futureIndividualChanges = computed(() => {
        const futureMap = _calculateFutureEntityChange('individualId');
        return individuals.value.map(i => ({ ...i, balance: futureMap[i._id] || 0 }));
    });

    const futureCategoryChanges = computed(() => futureCategoryBalances.value);

    const totalInitialBalance = computed(() => (accounts.value || []).reduce((s, a) => s + Number(a.initialBalance || 0), 0));

    const _calculateFutureEntityBalance = (snapshotMap, entityIdField) => {
        const futureMap = { ...snapshotMap };
        for (const op of futureOps.value) {
            if (_isRetailWriteOff(op) || op.isWorkAct) continue;
            const amt = Math.abs(Number(op.amount) || 0);
            if (entityIdField === 'accountId' && !op.accountId && !op.fromAccountId && !op.toAccountId) continue;
            if (isTransfer(op)) {
                let fromId, toId;
                if (entityIdField === 'accountId') { fromId = op.fromAccountId; toId = op.toAccountId; }
                else if (entityIdField === 'companyId') { fromId = op.fromCompanyId; toId = op.toCompanyId; }
                else if (entityIdField === 'individualId') { fromId = op.fromIndividualId; toId = op.toIndividualId; }
                else continue;
                fromId = fromId?._id || fromId; toId = toId?._id || toId;
                if (fromId) { if (futureMap[fromId] === undefined) futureMap[fromId] = 0; futureMap[fromId] -= amt; }
                if (toId) { if (futureMap[toId] === undefined) futureMap[toId] = 0; futureMap[toId] += amt; }
            } else {
                if (entityIdField === 'individualId') {
                    const ownerId = op.individualId?._id || op.individualId;
                    const contrId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
                    if (ownerId) { if (futureMap[ownerId] === undefined) futureMap[ownerId] = 0; if (op.type === 'income') futureMap[ownerId] += (Number(op.amount) || 0); else futureMap[ownerId] -= amt; }
                    if (contrId) { if (futureMap[contrId] === undefined) futureMap[contrId] = 0; if (op.type === 'income') futureMap[contrId] += (Number(op.amount) || 0); else futureMap[contrId] -= amt; }
                } else {
                    let id = op[entityIdField]; id = id?._id || id; if (!id) continue;
                    if (futureMap[id] === undefined) futureMap[id] = 0;
                    if (op.type === 'income') futureMap[id] += (Number(op.amount) || 0); else futureMap[id] -= amt;
                }
            }
        }
        return futureMap;
    };

    const currentCreditBalances = computed(() => {
        const repaymentCatId = loanRepaymentCategoryId.value;
        if (!repaymentCatId) {
            return credits.value.map(c => ({ ...c, balance: c.totalDebt, futureBalance: c.totalDebt }));
        }
        return credits.value.map(credit => {
            const initialDebt = credit.totalDebt || 0;
            let repaidTotal = 0;

            currentOps.value.forEach(op => {
                if (op.type !== 'expense') return;
                const opCatId = op.categoryId?._id || op.categoryId;
                if (String(opCatId) !== String(repaymentCatId)) return;
                const opContractorId = op.contractorId?._id || op.contractorId;
                const opIndId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
                const isContractorMatch = credit.contractorId && opContractorId && _idsMatch(opContractorId, credit.contractorId._id || credit.contractorId);
                const isIndividualMatch = credit.individualId && opIndId && _idsMatch(opIndId, credit.individualId._id || credit.individualId);
                if (isContractorMatch || isIndividualMatch) {
                    repaidTotal += Math.abs(Number(op.amount) || 0);
                }
            });
            const currentDebt = Math.max(0, initialDebt - repaidTotal);
            return {
                ...credit,
                balance: currentDebt,
                futureBalance: currentDebt
            };
        });
    });

    const futureCreditBalances = computed(() => {
        const repaymentCatId = loanRepaymentCategoryId.value;
        const futureOpsList = futureOps.value;
        return currentCreditBalances.value.map(credit => {
            let projectedRepayment = 0;
            futureOpsList.forEach(op => {
                if (op.type !== 'expense') return;
                const opCatId = op.categoryId?._id || op.categoryId;
                if (String(opCatId) !== String(repaymentCatId)) return;
                const opContractorId = op.contractorId?._id || op.contractorId;
                const opIndId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
                const isContractorMatch = credit.contractorId && opContractorId && _idsMatch(opContractorId, credit.contractorId._id || credit.contractorId);
                const isIndividualMatch = credit.individualId && opIndId && _idsMatch(opIndId, credit.individualId._id || credit.individualId);
                if (isContractorMatch || isIndividualMatch) {
                    projectedRepayment += Math.abs(Number(op.amount) || 0);
                }
            });
            const futureDebt = Math.max(0, credit.balance - projectedRepayment);
            return { ...credit, futureBalance: futureDebt };
        });
    });

    const currentIndividualBalances = computed(() => {
        const opsMap = new Map();
        currentOps.value.forEach(op => {
            const amt = Math.abs(Number(op.amount) || 0);
            if (op.type === 'transfer' || op.isTransfer) {
                if (op.fromIndividualId) {
                    const key = _toStr(op.fromIndividualId);
                    opsMap.set(key, (opsMap.get(key) || 0) - amt);
                }
                if (op.toIndividualId) {
                    const key = _toStr(op.toIndividualId);
                    opsMap.set(key, (opsMap.get(key) || 0) + amt);
                }
            } else {
                const sign = op.type === 'income' ? 1 : -1;
                const value = amt * sign;
                if (op.individualId) {
                    const key = _toStr(op.individualId);
                    opsMap.set(key, (opsMap.get(key) || 0) + value);
                }
                if (op.counterpartyIndividualId) {
                    const key = _toStr(op.counterpartyIndividualId);
                    opsMap.set(key, (opsMap.get(key) || 0) + value);
                }
            }
        });

        const hiddenIndividualIds = new Set();
        if (!includeExcludedInTotal.value) {
            accounts.value.forEach(a => {
                if (a && a.isExcluded && a.individualId) {
                    const iId = typeof a.individualId === 'object' ? a.individualId._id : a.individualId;
                    if (iId) hiddenIndividualIds.add(String(iId));
                }
            });
        }

        return individuals.value.reduce((acc, i) => {
            if (hiddenIndividualIds.has(String(i._id))) return acc;

            const linkedAccounts = currentAccountBalances.value.filter(a => {
                const indId = (a.individualId && typeof a.individualId === 'object') ? a.individualId._id : a.individualId;
                return indId === i._id;
            });

            const accountsInitialSum = linkedAccounts.reduce((sum, acc) => sum + Number(acc.initialBalance || 0), 0);
            const opsBalance = opsMap.get(String(i._id)) || 0;

            acc.push({ ...i, balance: accountsInitialSum + opsBalance });
            return acc;
        }, []);
    });

    const futureIndividualBalances = computed(() => {
        const hiddenIndividualIds = new Set();
        if (!includeExcludedInTotal.value) {
            accounts.value.forEach(a => {
                if (a && a.isExcluded && a.individualId) {
                    const iId = typeof a.individualId === 'object' ? a.individualId._id : a.individualId;
                    if (iId) hiddenIndividualIds.add(String(iId));
                }
            });
        }

        return individuals.value.reduce((acc, i) => {
            if (hiddenIndividualIds.has(String(i._id))) return acc;

            const curr = currentIndividualBalances.value.find(c => c._id === i._id);
            const base = curr ? curr.balance : 0;
            const change = futureIndividualChanges.value.find(f => f._id === i._id)?.balance || 0;
            acc.push({ ...i, balance: base + change });
            return acc;
        }, []);
    });

    const currentTotalBalance = computed(() => {
        return currentAccountBalances.value.reduce((sum, a) => sum + a.balance, 0);
    });

    // 🟢 Period-aware total: if analytics filter active, sum operations instead of balances
    const currentTotalForPeriod = computed(() => {
        // If no custom period filter, use regular balance
        if (!periodFilter.value || periodFilter.value.mode !== 'custom') {
            return currentTotalBalance.value;
        }

        // For analytics: sum only operations in the period
        const incomes = currentIncomes.value.reduce((sum, op) => {
            return sum + Math.abs(Number(op.amount) || 0);
        }, 0);

        const expenses = currentExpenses.value.reduce((sum, op) => {
            return sum + Math.abs(Number(op.amount) || 0);
        }, 0);

        return incomes - expenses;
    });

    const futureTotalForPeriod = computed(() => {
        // If no custom period filter, use regular balance
        if (!periodFilter.value || periodFilter.value.mode !== 'custom') {
            return futureTotalBalance.value;
        }

        // For analytics: sum only future operations in the period
        const incomes = futureIncomes.value.reduce((sum, op) => {
            return sum + Math.abs(Number(op.amount) || 0);
        }, 0);

        const expenses = futureExpenses.value.reduce((sum, op) => {
            return sum + Math.abs(Number(op.amount) || 0);
        }, 0);

        return incomes - expenses;
    });

    const futureTotalBalance = computed(() => {
        let total = currentTotalBalance.value;
        for (const op of futureOps.value) {
            if (isTransfer(op)) continue;
            if (!op.accountId) continue;
            if (op.isWorkAct) continue;
            const amt = Math.abs(Number(op.amount) || 0);
            if (op.type === 'income') total += (Number(op.amount) || 0); else total -= amt;
        }
        return total;
    });

    function _populateOp(op) {
        const populated = { ...op };

        if (populated.date) {
            if (typeof populated.date === 'string') {
                populated.date = new Date(populated.date);
            }
            if (populated.dateKey) {
                const calculatedKey = _getDateKey(populated.date);
                if (calculatedKey !== populated.dateKey) {
                    populated.date = _parseDateKey(populated.dateKey);
                }
            }
        }
        else if (populated.dateKey) {
            populated.date = _parseDateKey(populated.dateKey);
        }
        else {
            const d = new Date();
            d.setHours(12, 0, 0, 0);
            populated.date = d;
        }

        const bindEntity = (field, storeRef) => {
            const raw = populated[field];
            if (!raw) {
                populated[field] = null;
                return;
            }
            const id = (typeof raw === 'object') ? raw._id : raw;
            const found = storeRef.value.find(item => _idsMatch(item._id, id));

            if (found) {
                populated[field] = found;
            } else {
                if (typeof raw === 'object') {
                    populated[field] = raw;
                } else {
                    populated[field] = { _id: raw, name: '...', isMissing: true };
                }
            }
        };

        bindEntity('accountId', accounts);
        bindEntity('projectId', projects);
        bindEntity('categoryId', categories);
        bindEntity('companyId', companies);
        bindEntity('contractorId', contractors);
        bindEntity('individualId', individuals);
        bindEntity('counterpartyIndividualId', individuals);

        if (populated.isTransfer) {
            bindEntity('fromAccountId', accounts);
            bindEntity('toAccountId', accounts);
        }

        return populated;
    }

    const _triggerProjectionUpdate = () => {
        cacheVersion.value++;
    };

    const onSocketOperationAdded = async (op) => {
        if (op.categoryId) {
            const catId = typeof op.categoryId === 'object' ? op.categoryId._id : op.categoryId;
            const exists = categories.value.find(c => _idsMatch(c._id, catId));
            if (!exists) {
                await fetchAllEntities();
            }
        }

        const existingOp = allOperationsFlat.value.find(o => _idsMatch(o._id, op._id));
        if (existingOp) return;

        const richOp = _populateOp(op);
        const dk = richOp.dateKey;

        if (!displayCache.value[dk]) displayCache.value[dk] = [];

        if (richOp.transferGroupId) {
            const existingHalfIndex = displayCache.value[dk].findIndex(o =>
                o.transferGroupId === richOp.transferGroupId && !_idsMatch(o._id, richOp._id)
            );

            if (existingHalfIndex !== -1) {
                const otherHalf = displayCache.value[dk][existingHalfIndex];
                const incomeOp = richOp.amount > 0 ? richOp : otherHalf;
                const expenseOp = richOp.amount < 0 ? richOp : otherHalf;

                const mergedTransfer = {
                    _id: incomeOp._id,
                    _id2: expenseOp._id,
                    type: 'transfer',
                    isTransfer: true,
                    transferGroupId: richOp.transferGroupId,
                    amount: Math.abs(Number(incomeOp.amount)),
                    fromAccountId: expenseOp.accountId,
                    toAccountId: incomeOp.accountId,
                    fromCompanyId: expenseOp.companyId,
                    toCompanyId: incomeOp.companyId,
                    fromIndividualId: expenseOp.individualId,
                    toIndividualId: incomeOp.individualId,
                    dayOfYear: incomeOp.dayOfYear || expenseOp.dayOfYear,
                    cellIndex: incomeOp.cellIndex || expenseOp.cellIndex || 0,
                    categoryId: { _id: 'transfer', name: 'Перевод' },
                    date: incomeOp.date || expenseOp.date,
                    dateKey: dk
                };

                displayCache.value[dk][existingHalfIndex] = _populateOp(mergedTransfer);
            } else {
                displayCache.value[dk].push(richOp);
            }
        } else {
            displayCache.value[dk].push(richOp);
        }

        displayCache.value[dk].sort((a, b) => (a.cellIndex || 0) - (b.cellIndex || 0));

        calculationCache.value[dk] = [...displayCache.value[dk]];

        if (_isEffectivelyPastOrToday(richOp.date)) {
            _applyOptimisticSnapshotUpdate(richOp, 1);
        }
        _updateDealCache(richOp, 'add');
        _triggerProjectionUpdate();
    };

    const onSocketOperationUpdated = (op) => {
        let oldOp = null;
        let oldDateKey = null;

        for (const dk in displayCache.value) {
            const found = displayCache.value[dk].find(o => _idsMatch(o._id, op._id));
            if (found) { oldOp = found; oldDateKey = dk; break; }
        }
        if (!oldOp) oldOp = allOperationsFlat.value.find(o => _idsMatch(o._id, op._id));

        if (oldOp && _isEffectivelyPastOrToday(oldOp.date)) {
            _applyOptimisticSnapshotUpdate(oldOp, -1);
        }

        const newDateKey = op.dateKey || (op.date ? _getDateKey(new Date(op.date)) : oldDateKey);
        const richOp = _populateOp({ ...op, date: new Date(op.date) });

        if (oldDateKey && displayCache.value[oldDateKey]) {
            displayCache.value[oldDateKey] = displayCache.value[oldDateKey].filter(o => !_idsMatch(o._id, op._id));
            calculationCache.value[oldDateKey] = [...displayCache.value[oldDateKey]];
        }

        if (!displayCache.value[newDateKey]) displayCache.value[newDateKey] = [];

        const existsIndex = displayCache.value[newDateKey].findIndex(o => _idsMatch(o._id, op._id));
        if (existsIndex !== -1) {
            displayCache.value[newDateKey][existsIndex] = { ...displayCache.value[newDateKey][existsIndex], ...richOp };
        } else {
            if (richOp.transferGroupId) {
                const existingHalfIndex = displayCache.value[newDateKey].findIndex(o =>
                    o.transferGroupId === richOp.transferGroupId && !_idsMatch(o._id, richOp._id)
                );
                if (existingHalfIndex !== -1) {
                    const otherHalf = displayCache.value[newDateKey][existingHalfIndex];
                    const incomeOp = richOp.amount > 0 ? richOp : otherHalf;
                    const expenseOp = richOp.amount < 0 ? richOp : otherHalf;
                    const merged = { ...richOp, ...otherHalf, _id: incomeOp._id, _id2: expenseOp._id, type: 'transfer', isTransfer: true, amount: Math.abs(Number(incomeOp.amount)) };
                    displayCache.value[newDateKey][existingHalfIndex] = _populateOp(merged);
                } else {
                    displayCache.value[newDateKey].push(richOp);
                }
            } else {
                displayCache.value[newDateKey].push(richOp);
            }
        }

        displayCache.value[newDateKey].sort((a, b) => (a.cellIndex || 0) - (b.cellIndex || 0));
        calculationCache.value[newDateKey] = [...displayCache.value[newDateKey]];

        if (_isEffectivelyPastOrToday(richOp.date)) {
            _applyOptimisticSnapshotUpdate(richOp, 1);
        }

        _updateDealCache(richOp, 'update');
        _triggerProjectionUpdate();
    };

    const onSocketOperationDeleted = (opId) => {
        let oldOp = null;
        let oldDateKey = null;

        for (const dk in displayCache.value) {
            const found = displayCache.value[dk].find(o => _idsMatch(o._id, opId) || _idsMatch(o._id2, opId));
            if (found) { oldOp = found; oldDateKey = dk; break; }
        }
        if (!oldOp) return;

        if (_isEffectivelyPastOrToday(oldOp.date)) {
            _applyOptimisticSnapshotUpdate(oldOp, -1);
        }

        if (oldDateKey && displayCache.value[oldDateKey]) {
            displayCache.value[oldDateKey] = displayCache.value[oldDateKey].filter(o =>
                !_idsMatch(o._id, opId) && !_idsMatch(o._id2, opId)
            );
            calculationCache.value[oldDateKey] = [...displayCache.value[oldDateKey]];
        }

        _updateDealCache(oldOp, 'delete');
        _triggerProjectionUpdate();
    };

    const _getListRefByType = (type) => {
        if (type === 'account') return accounts;
        if (type === 'company') return companies;
        if (type === 'contractor') return contractors;
        if (type === 'project') return projects;
        if (type === 'individual') return individuals;
        if (type === 'category') return categories;
        return null;
    }

    const onSocketEntityAdded = (type, item) => {
        const listRef = _getListRefByType(type);
        if (listRef) {
            const exists = listRef.value.find(i => _idsMatch(i._id, item._id));
            if (!exists) listRef.value.push(item);
            listRef.value = _sortByOrder(listRef.value);
        }
    };

    const onSocketEntityDeleted = (type, id) => {
        const listRef = _getListRefByType(type);
        if (listRef) {
            listRef.value = listRef.value.filter(i => !_idsMatch(i._id, id));
        }
    };

    const onSocketEntityListUpdated = (type, newList) => {
        const listRef = _getListRefByType(type);
        if (listRef && Array.isArray(newList)) {
            listRef.value = _sortByOrder(newList);
        }
    };

    async function createEvent(eventData) {
        try {
            if (!eventData.dateKey && eventData.date) eventData.dateKey = _getDateKey(new Date(eventData.date));
            if (eventData.cellIndex === undefined) {
                eventData.cellIndex = await getFirstFreeCellIndex(eventData.dateKey);
            }

            if (eventData.type === 'income' && !eventData.isTransfer && eventData.totalDealAmount === undefined) {
                const isOver = useDealStore().checkOverpayment(eventData.projectId, eventData.categoryId, eventData.contractorId || eventData.counterpartyIndividualId, eventData.amount);
                if (isOver) {
                    console.warn('Overpayment detected! (Logging warning only)');
                }
            }

            const tempId = `temp_${Date.now()}`;
            const tempOp = {
                ...eventData,
                _id: tempId,
                date: new Date(eventData.date),
                isOptimistic: true
            };

            const richOp = _populateOp(tempOp);

            const dk = richOp.dateKey;
            if (!displayCache.value[dk]) displayCache.value[dk] = [];
            displayCache.value[dk].push(richOp);
            calculationCache.value[dk] = [...displayCache.value[dk]];

            if (_isEffectivelyPastOrToday(richOp.date)) {
                _applyOptimisticSnapshotUpdate(richOp, 1);
            }

            _updateDealCache(richOp, 'add');
            _triggerProjectionUpdate();

            const response = await axios.post(`${API_BASE_URL}/events`, eventData);
            const serverOp = response.data;

            const idx = displayCache.value[dk].findIndex(o => _idsMatch(o._id, tempId));
            if (idx !== -1) {
                displayCache.value[dk][idx] = _populateOp(serverOp);
                calculationCache.value[dk] = [...displayCache.value[dk]];
            }

            const dealIdx = dealOperations.value.findIndex(d => _idsMatch(d._id, tempId));
            if (dealIdx !== -1) {
                const newDeals = [...dealOperations.value];
                newDeals[dealIdx] = serverOp;
                dealOperations.value = newDeals;
            }


            await fetchSnapshot();

            return serverOp;
        } catch (error) {
            console.error("Create Event Error (Optimistic):", error);
            if (eventData.dateKey) refreshDay(eventData.dateKey);
            fetchSnapshot();
            throw error;
        }
    }

    async function updateOperation(opId, opData) {
        // 🟢 NEW: Check edit permission
        if (!canEdit.value) {
            throw new Error('У вас нет прав на редактирование операций');
        }

        let oldOp = null;
        let oldDateKey = null;

        for (const dk in displayCache.value) {
            const found = displayCache.value[dk].find(o => _idsMatch(o._id, opId));
            if (found) { oldOp = found; oldDateKey = dk; break; }
        }

        if (!oldOp) oldOp = allOperationsFlat.value.find(o => _idsMatch(o._id, opId));

        if (!oldOp) {
            const res = await axios.put(`${API_BASE_URL}/events/${opId}`, opData);
            await refreshDay(res.data.dateKey);
            // 🔴 REMOVED: fetchSnapshot() returns empty data before aggregation completes
            // await fetchSnapshot();
            return res.data;
        }

        try {
            const newDateKey = opData.date ? _getDateKey(new Date(opData.date)) : (opData.dateKey || oldOp.dateKey);
            const isDateChanged = oldDateKey !== newDateKey;

            if (_isEffectivelyPastOrToday(oldOp.date)) {
                _applyOptimisticSnapshotUpdate(oldOp, -1);
            }

            const mergedOp = { ...oldOp, ...opData };
            if (opData.date) mergedOp.date = new Date(opData.date);

            const richOp = _populateOp(mergedOp);

            if (isDateChanged) {
                if (displayCache.value[oldDateKey]) {
                    displayCache.value[oldDateKey] = displayCache.value[oldDateKey].filter(o => !_idsMatch(o._id, opId));
                    calculationCache.value[oldDateKey] = [...displayCache.value[oldDateKey]];
                }
                if (!displayCache.value[newDateKey]) displayCache.value[newDateKey] = [];
                displayCache.value[newDateKey].push(richOp);
                calculationCache.value[newDateKey] = [...displayCache.value[newDateKey]];
            } else {
                const list = displayCache.value[oldDateKey];
                const idx = list.findIndex(o => _idsMatch(o._id, opId));
                if (idx !== -1) list[idx] = richOp;
                calculationCache.value[oldDateKey] = [...list];
            }

            if (_isEffectivelyPastOrToday(richOp.date)) {
                _applyOptimisticSnapshotUpdate(richOp, 1);
            }

            _updateDealCache(richOp, 'update');
            _triggerProjectionUpdate();

            const updatePayload = { ...opData, dateKey: newDateKey };

            const response = await axios.put(`${API_BASE_URL}/events/${opId}`, updatePayload);

            const serverOp = response.data;
            const targetList = displayCache.value[newDateKey];
            if (targetList) {
                const i = targetList.findIndex(o => _idsMatch(o._id, opId));
                if (i !== -1) {
                    targetList[i] = _populateOp(serverOp);
                    calculationCache.value[newDateKey] = [...targetList];
                }
            }

            // 🔴 REMOVED: fetchSnapshot() returns empty data before MongoDB aggregation completes
            // Optimistic updates work correctly, socket events provide sync after 4-6 sec
            // await fetchSnapshot();

            return serverOp;
        } catch (e) {
            console.error("Optimistic Update Failed:", e);
            refreshDay(oldDateKey);
            fetchSnapshot();
            throw e;
        }
    }

    const deleteOperation = async (operation) => {
        // 🟢 NEW: Check delete permission
        if (!canDelete.value) {
            throw new Error('У вас нет прав на удаление операций');
        }

        const opId = operation._id || operation.id;
        const dateKey = operation.dateKey;
        if (!dateKey) return;

        try {
            if (_isTaxPayment(operation)) {
                taxes.value = taxes.value.filter(t => {
                    const relId = typeof t.relatedEventId === 'object' ? t.relatedEventId._id : t.relatedEventId;
                    return !_idsMatch(relId, operation._id);
                });
            }

            // Удаляем из кэша отображения
            if (displayCache.value[dateKey]) {
                displayCache.value[dateKey] = displayCache.value[dateKey].filter(o => !_idsMatch(o._id, operation._id));
                calculationCache.value[dateKey] = [...displayCache.value[dateKey]];
            }

            // 🟢 IMPORTANT: Update dealCache BEFORE recalculating anything
            // This ensures dealOperations is in sync with displayCache
            _updateDealCache(operation, 'delete');
            _triggerProjectionUpdate();

            if (operation.isWorkAct) {
                await reopenDealScope(operation);
            }

            // 🟢 NEW: Reopen deal when deleting a closed income operation (tranche)
            if (operation.isClosed && operation.type === 'income' && !operation.isWorkAct) {
                await reopenDealScope(operation);
            }

            if (isTransfer(operation) && operation._id2) {
                await Promise.all([axios.delete(`${API_BASE_URL}/events/${operation._id}`), axios.delete(`${API_BASE_URL}/events/${operation._id2}`)]);
            } else {
                await axios.delete(`${API_BASE_URL}/events/${operation._id}`);
            }

            // 🟢 FIX: Fetch fresh snapshot from backend instead of manual recalculation
            // This prevents data inconsistency between displayCache and allKnownOperations
            await fetchSnapshot();

        } catch (e) {
            if (e.response && (e.response.status === 404 || e.response.status === 200)) {
                return;
            }
            console.error("Delete Failed:", e);
            refreshDay(dateKey);
            fetchSnapshot();
            const taxesRes = await axios.get(`${API_BASE_URL}/taxes`);
            taxes.value = taxesRes.data;
        }
    }

    async function fetchOperationsRange(startDate, endDate, options = {}) {
        try {
            if (!startDate || !endDate) return;

            const s0 = new Date(startDate);
            const e0 = new Date(endDate);
            if (Number.isNaN(s0.getTime()) || Number.isNaN(e0.getTime())) return;

            // Normalize order
            let start = s0;
            let end = e0;
            if (start.getTime() > end.getTime()) {
                const t = start;
                start = end;
                end = t;
            }

            start = new Date(start);
            end = new Date(end);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);

            const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

            // For very large history requests (years), DO NOT iterate day-by-day (it freezes UI).
            // Also fetch in chunks to avoid backend/timeouts.
            const chunkDays = Number(options?.chunkDays || 120);
            const sparseOpt = options?.sparse;
            const useSparse = (sparseOpt === true) || (sparseOpt !== false && dayCount > 200);

            let processedOps = [];

            if (dayCount > chunkDays) {
                // Chunked fetch (safe for big histories)
                processedOps = await _fetchOperationsListChunked(start, end, chunkDays);
            } else {
                // Small range: one request is OK
                const response = await axios.get(`${API_BASE_URL}/events`, {
                    params: {
                        startDate: start.toISOString(),
                        endDate: end.toISOString()
                    }
                });

                const rawOps = Array.isArray(response.data) ? response.data : [];
                processedOps = _mergeTransfers(rawOps).map(op => {
                    const dk = op.dateKey || _getDateKey(new Date(op.date));
                    return _populateOp({ ...op, dateKey: dk });
                });
            }

            // Group by day key
            const fetchedMap = new Map();
            processedOps.forEach(op => {
                if (!op) return;
                const dk = op.dateKey || (op.date ? _getDateKey(new Date(op.date)) : null);
                if (!dk) return;
                if (!fetchedMap.has(dk)) fetchedMap.set(dk, []);
                fetchedMap.get(dk).push(op);
            });

            const applyDay = (dateKey, serverOps) => {
                const existing = Array.isArray(displayCache.value[dateKey]) ? displayCache.value[dateKey] : [];
                const existingOptimistic = existing.filter(o => o && o.isOptimistic);

                const finalOps = [...existingOptimistic, ...(serverOps || [])]
                    .filter(o => o && typeof o === 'object')
                    .sort((a, b) => (a.cellIndex || 0) - (b.cellIndex || 0));

                displayCache.value[dateKey] = finalOps;
                calculationCache.value[dateKey] = [...finalOps];
            };

            if (useSparse) {
                // Large history preload: update ONLY days that actually have operations
                fetchedMap.forEach((ops, dk) => {
                    applyDay(dk, ops);
                });
            } else {
                // Small visible range: keep old behavior (fill every day) so UI shows empty days consistently
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    const dateKey = _getDateKey(d);
                    const serverOps = fetchedMap.get(dateKey) || [];
                    applyDay(dateKey, serverOps);
                }
            }

        } catch (error) {
            if (error.response && error.response.status === 401) user.value = null;
            console.error('Bulk Fetch Error:', error);
        }
    }

    const _syncCaches = (key, ops) => {
        displayCache.value[key] = [...ops];
        calculationCache.value[key] = [...ops];
        cacheVersion.value++;
    };

    async function updateFutureProjectionWithData(mode, today = new Date()) {
        await loadCalculationData(mode, today);
    }

    async function loadCalculationData(mode, date = new Date()) {
        const ps = useProjectionStore();
        ps.setCalculationStatus('calculating');

        try {
            const anchorDate = new Date(date);
            const { startDate, endDate } = ps._calculateDateRangeWithYear(mode, anchorDate);

            await fetchOperationsRange(startDate, endDate);

            console.log('✅ [loadCalculationData] Fetch complete. Cache keys:', Object.keys(displayCache.value).length);

            ps.updateProjectionState(mode, anchorDate);
            recalculateGlobalBalance(endDate);
            ps.setCalculationStatus('done');

        } catch (e) {
            console.error("Projection Calculation Failed:", e);
            ps.setCalculationStatus('idle');
        }
    }

    function recalculateGlobalBalance(endDate) {
        const ps = useProjectionStore();
        const currentBal = currentTotalBalance.value;
        const futureOperations = futureOps.value;

        let futureSum = 0;
        futureOperations.forEach(op => {
            if (op.type === 'income') {
                futureSum += (Number(op.amount) || 0);
            } else if (op.type === 'expense') {
                futureSum -= Math.abs(Number(op.amount) || 0);
            }
        });

        const finalBalance = currentBal + futureSum;
        ps.setGlobalProjectedBalance(finalBalance, endDate);
    }

    async function fetchAllEntities() {
        if (!user.value) return;
        try {
            const [accRes, compRes, contrRes, projRes, indRes, catRes, prepRes, credRes, dealsRes, taxesRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/accounts`), axios.get(`${API_BASE_URL}/companies`),
                axios.get(`${API_BASE_URL}/contractors`), axios.get(`${API_BASE_URL}/projects`),
                axios.get(`${API_BASE_URL}/individuals`), axios.get(`${API_BASE_URL}/categories`),
                axios.get(`${API_BASE_URL}/prepayments`),
                axios.get(`${API_BASE_URL}/credits`),
                axios.get(`${API_BASE_URL}/deals/all`),
                axios.get(`${API_BASE_URL}/taxes`)
            ]);

            accounts.value = _sortByOrder(accRes.data);
            companies.value = _sortByOrder(compRes.data);
            contractors.value = _sortByOrder(contrRes.data);
            projects.value = _sortByOrder(projRes.data);
            individuals.value = _sortByOrder(indRes.data);
            credits.value = _sortByOrder(credRes.data);
            dealOperations.value = dealsRes.data;
            taxes.value = taxesRes.data;

            const normalCategories = catRes.data.map(c => ({ ...c, isPrepayment: false }));
            const prepaymentCategories = prepRes.data.map(p => ({ ...p, isPrepayment: true }));
            categories.value = _sortByOrder([...normalCategories, ...prepaymentCategories]);

            await ensureSystemEntities();
            await fetchSnapshot();

            // 🚀 PERFORMANCE: Load only current month for fast startup (1-2 seconds)
            const today = new Date();
            today.setHours(23, 59, 59, 999);

            const currentMonthStart = new Date(today);
            currentMonthStart.setDate(1);
            currentMonthStart.setHours(0, 0, 0, 0);

            try {
                console.log('[PERF] Loading current month operations for fast startup...');
                // Load ONLY current month - this makes initial load fast
                await ensureTaxOpsUntil(today, currentMonthStart);
                console.log('[PERF] Current month loaded ✓');
            } catch (err) {
                console.error('[mainStore] Failed to load current month operations:', err);
            }

            // 🔄 Background loading: Previous month (for history/analytics)
            setTimeout(async () => {
                try {
                    console.log('[PERF] Background loading: previous month...');
                    const prevMonthEnd = new Date(currentMonthStart);
                    prevMonthEnd.setMilliseconds(-1); // Last ms of previous month

                    const prevMonthStart = new Date(prevMonthEnd);
                    prevMonthStart.setDate(1);
                    prevMonthStart.setHours(0, 0, 0, 0);

                    await ensureTaxOpsUntil(prevMonthEnd, prevMonthStart);
                    console.log('[PERF] Previous month loaded ✓');
                } catch (err) {
                    console.error('[mainStore] Failed to load previous month:', err);
                }
            }, 100);

            // 🔄 Background loading: Next month (for forecast)
            setTimeout(async () => {
                try {
                    console.log('[PERF] Background loading: next month...');
                    const nextMonthStart = new Date(today);
                    nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);
                    nextMonthStart.setDate(1);
                    nextMonthStart.setHours(0, 0, 0, 0);

                    const nextMonthEnd = new Date(nextMonthStart);
                    nextMonthEnd.setMonth(nextMonthEnd.getMonth() + 1);
                    nextMonthEnd.setDate(0); // Last day of next month
                    nextMonthEnd.setHours(23, 59, 59, 999);

                    await ensureTaxOpsUntil(nextMonthEnd, nextMonthStart);
                    console.log('[PERF] Next month loaded ✓');
                } catch (err) {
                    console.error('[mainStore] Failed to load next month:', err);
                }
            }, 500);

            // 🔄 Background loading: Full history (lower priority)
            setTimeout(async () => {
                try {
                    console.log('[PERF] Background loading: full history...');
                    let historicalStart = null;

                    if (earliestEventDate.value) {
                        historicalStart = new Date(earliestEventDate.value);
                    } else if (user.value?.createdAt) {
                        historicalStart = new Date(user.value.createdAt);
                    } else {
                        // Fallback: 1 year ago
                        historicalStart = new Date();
                        historicalStart.setFullYear(historicalStart.getFullYear() - 1);
                    }
                    historicalStart.setHours(0, 0, 0, 0);

                    // Load everything before current month
                    const beforeCurrentMonth = new Date(currentMonthStart);
                    beforeCurrentMonth.setMilliseconds(-1);

                    await ensureTaxOpsUntil(beforeCurrentMonth, historicalStart);
                    console.log('[PERF] Full history loaded ✓');
                } catch (err) {
                    console.error('[mainStore] Failed to load full history:', err);
                }
            }, 2000);

            // Preload for projection range (low priority)
            void ensureTaxOpsUntil(projection.value?.rangeEndDate ? new Date(projection.value.rangeEndDate) : new Date());

            if (user.value) {
                useSocketStore().connect(user.value._id);
            }

        } catch (e) { if (e.response && e.response.status === 401) user.value = null; }
    }

    async function fetchOperations(dateKey, force = false) {
        if (!dateKey) return;
        if (displayCache.value[dateKey] && !force) return;
        try {
            const res = await axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`);
            const raw = Array.isArray(res.data) ? res.data.slice() : [];
            const processedOps = _mergeTransfers(raw).map(op => ({ ...op, dateKey: dateKey }));
            displayCache.value[dateKey] = processedOps.map(_populateOp);
            calculationCache.value[dateKey] = [...displayCache.value[dateKey]];
        } catch (e) { if (e.response && e.response.status === 401) user.value = null; }
    }

    function getOperationsForDay(dateKey) {
        const ops = displayCache.value[dateKey];
        if (!Array.isArray(ops)) return []; // Safety check
        // Filter out deleted operations and null/undefined entries
        // Work acts are now visible on timeline with special styling
        // Also filter by visibility (excluded accounts)
        return ops.filter(op => op && !op.isDeleted && _isOpVisible(op));
    }

    /**
     * Get phantom operations for a given day
     * Returns placeholder objects for operations on excluded accounts that are currently hidden
     * This prevents users from creating operations in occupied cells
     */
    function getPhantomOperations(dateKey) {
        // If excluded accounts are visible, no phantoms needed
        if (includeExcludedInTotal.value) return [];

        const ops = displayCache.value[dateKey];
        if (!Array.isArray(ops)) return [];
        const phantoms = [];

        ops.forEach(op => {
            if (!op || op.isDeleted) return;

            // Check if operation belongs to an excluded account
            let accountIdToCheck = null;

            // Extract account ID (could be populated object or raw ID)
            if (op.accountId) {
                accountIdToCheck = typeof op.accountId === 'object' ? op.accountId._id : op.accountId;
            } else if (op.fromAccountId) {
                accountIdToCheck = typeof op.fromAccountId === 'object' ? op.fromAccountId._id : op.fromAccountId;
            } else if (op.toAccountId) {
                accountIdToCheck = typeof op.toAccountId === 'object' ? op.toAccountId._id : op.toAccountId;
            }

            if (!accountIdToCheck) return;

            // Find account and check if excluded
            const account = accounts.value.find(a => _idsMatch(a._id, accountIdToCheck));

            if (account?.isExcluded) {
                phantoms.push({
                    _id: `phantom - ${op._id} `,
                    isPhantom: true,
                    cellIndex: op.cellIndex,
                    dateKey: op.dateKey || dateKey
                });
            }
        });

        return phantoms;
    }

    function _mergeTransfers(list) {
        const normalOps = list.filter(o => !o?.isTransfer && !o?.transferGroupId);
        const transferGroups = new Map();
        list.forEach(o => {
            if (o?.isTransfer || o?.transferGroupId) {
                const groupId = o.transferGroupId || `transfer_${o._id} `;
                if (!transferGroups.has(groupId)) { transferGroups.set(groupId, []); }
                transferGroups.get(groupId).push(o);
            }
        });
        const mergedTransfers = [];
        for (const [groupId, transferOps] of transferGroups) {
            if (transferOps.length === 2) {
                const expenseOp = transferOps.find(o => o.amount < 0);
                const incomeOp = transferOps.find(o => o.amount > 0);
                if (expenseOp && incomeOp) {
                    mergedTransfers.push({
                        _id: incomeOp._id, _id2: expenseOp._id, type: 'transfer', isTransfer: true,
                        transferGroupId: groupId, amount: Math.abs(Number(incomeOp.amount)),
                        fromAccountId: expenseOp.accountId, toAccountId: incomeOp.accountId,
                        fromCompanyId: expenseOp.companyId, toCompanyId: incomeOp.companyId,
                        fromIndividualId: expenseOp.individualId, toIndividualId: incomeOp.individualId,
                        dayOfYear: incomeOp.dayOfYear || expenseOp.dayOfYear,
                        cellIndex: incomeOp.cellIndex || expenseOp.cellIndex || 0,
                        categoryId: { _id: 'transfer', name: 'Перевод' },
                        date: incomeOp.date || expenseOp.date
                    });
                    continue;
                }
            }
            const firstOp = transferOps[0];
            mergedTransfers.push({
                ...firstOp, type: 'transfer', isTransfer: true,
                transferGroupId: groupId, amount: Math.abs(Number(firstOp.amount)),
                categoryId: { _id: 'transfer', name: 'Перевод' }
            });
        }
        return [...normalOps, ...mergedTransfers];
    }
    async function _getOrCreateTransferCategory() {
        let transferCategory = categories.value.find(c => c.name.toLowerCase() === 'перевод');
        if (!transferCategory) transferCategory = await addCategory('Перевод');
        return transferCategory._id;
    }

    async function refreshDay(dateKey) {
        if (!dateKey) return;
        try {
            const res = await axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`);
            const raw = Array.isArray(res.data) ? res.data.slice() : [];
            const processedOps = _mergeTransfers(raw).map(op => ({ ...op, dateKey: dateKey }));
            _syncCaches(dateKey, processedOps.map(_populateOp));
        } catch (e) { if (e.response && e.response.status === 401) user.value = null; }
    }

    async function moveOperation(operation, oldDateKey, newDateKey, desiredCellIndex, specificTargetDate = null) {
        if (!oldDateKey || !newDateKey) return;
        if (!displayCache.value[oldDateKey]) await fetchOperations(oldDateKey);
        if (!displayCache.value[newDateKey]) await fetchOperations(newDateKey);
        const targetIndex = Number.isInteger(desiredCellIndex) ? desiredCellIndex : 0;
        const isMerged = operation.isTransfer && operation._id2;

        if (oldDateKey === newDateKey) {
            const ops = [...(displayCache.value[oldDateKey] || [])];
            const sourceOp = ops.find(o => _idsMatch(o._id, operation._id));
            const targetOp = ops.find(o => o.cellIndex === targetIndex && !_idsMatch(o._id, operation._id));
            if (sourceOp) {
                if (targetOp) {
                    const originalSourceIndex = sourceOp.cellIndex;
                    sourceOp.cellIndex = targetIndex; targetOp.cellIndex = originalSourceIndex;
                    _syncCaches(oldDateKey, ops);
                    const promises = [
                        axios.put(`${API_BASE_URL}/events/${sourceOp._id}`, { cellIndex: targetIndex }),
                        axios.put(`${API_BASE_URL}/events/${targetOp._id}`, { cellIndex: originalSourceIndex })
                    ];
                    if (isMerged) promises.push(axios.put(`${API_BASE_URL}/events/${operation._id2}`, { cellIndex: targetIndex }));
                    Promise.all(promises).catch(() => refreshDay(oldDateKey));
                } else {
                    sourceOp.cellIndex = targetIndex;
                    _syncCaches(oldDateKey, ops);
                    const promises = [
                        axios.put(`${API_BASE_URL}/events/${sourceOp._id}`, { cellIndex: targetIndex })
                    ];
                    if (isMerged) promises.push(axios.put(`${API_BASE_URL}/events/${operation._id2}`, { cellIndex: targetIndex }));
                    Promise.all(promises).catch(() => refreshDay(oldDateKey));
                }
            }
        }
        else {
            let oldOps = [...(displayCache.value[oldDateKey] || [])];
            const sourceOpData = oldOps.find(o => _idsMatch(o._id, operation._id));
            oldOps = oldOps.filter(o => !_idsMatch(o._id, operation._id));
            _syncCaches(oldDateKey, oldOps);
            let newOps = [...(displayCache.value[newDateKey] || [])];
            const occupant = newOps.find(o => o.cellIndex === targetIndex);
            let finalIndex = targetIndex;
            if (occupant) {
                const usedIndices = new Set(newOps.map(o => o.cellIndex));
                while (usedIndices.has(finalIndex)) finalIndex++;
            }

            const newDateObj = specificTargetDate ? new Date(specificTargetDate) : _parseDateKey(newDateKey);

            const moved = { ...sourceOpData, dateKey: newDateKey, date: newDateObj, cellIndex: finalIndex };
            newOps.push(moved);
            _syncCaches(newDateKey, newOps);

            const wasInSnapshot = _isEffectivelyPastOrToday(_parseDateKey(oldDateKey));
            const isInSnapshot = _isEffectivelyPastOrToday(newDateObj);

            const needsSnapshotUpdate = wasInSnapshot !== isInSnapshot;
            if (needsSnapshotUpdate) {
                const sign = isInSnapshot ? 1 : -1;
                const opToUpdate = moved || sourceOpData;
                if (opToUpdate) {
                    _applyOptimisticSnapshotUpdate(opToUpdate, sign);
                }
            }
            _triggerProjectionUpdate();

            const payload = { dateKey: newDateKey, cellIndex: finalIndex, date: moved.date };
            const promises = [
                axios.put(`${API_BASE_URL}/events/${moved._id}`, payload)
            ];
            if (isMerged) {
                promises.push(axios.put(`${API_BASE_URL}/events/${operation._id2}`, payload));
            }

            await Promise.all(promises)
                .then(() => {
                })
                .catch(() => {
                    refreshDay(oldDateKey);
                    refreshDay(newDateKey);
                    fetchSnapshot();
                });
        }
    }

    function _generateTransferGroupId() { return `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

    async function createTransfer(transferData) {
        try {
            const finalDate = new Date(transferData.date);
            const dateKey = _getDateKey(finalDate);
            const transferCategory = await _getOrCreateTransferCategory();

            let expenseContractorId = null;
            let incomeContractorId = null;

            const tempId = `temp_tr_${Date.now()}`;

            let optimisticOps = [];

            if (transferData.transferPurpose === 'personal' && transferData.transferReason === 'personal_use') {
                optimisticOps.push({
                    _id: tempId,
                    type: 'expense',
                    isWithdrawal: true,
                    amount: -Math.abs(Number(transferData.amount)),
                    accountId: transferData.fromAccountId,
                    companyId: transferData.fromCompanyId,
                    individualId: transferData.fromIndividualId,
                    dateKey: dateKey,
                    date: finalDate,
                    isOptimistic: true
                });
            }
            else {
                optimisticOps.push({
                    _id: tempId,
                    type: 'transfer',
                    isTransfer: true,
                    amount: Math.abs(Number(transferData.amount)),
                    fromAccountId: transferData.fromAccountId,
                    toAccountId: transferData.toAccountId,
                    fromCompanyId: transferData.fromCompanyId,
                    toCompanyId: transferData.toCompanyId,
                    fromIndividualId: transferData.fromIndividualId,
                    toIndividualId: transferData.toIndividualId,
                    dateKey: dateKey,
                    date: finalDate,
                    isOptimistic: true
                });
            }

            if (!displayCache.value[dateKey]) displayCache.value[dateKey] = [];

            optimisticOps.forEach(rawOp => {
                const richOp = _populateOp(rawOp);
                displayCache.value[dateKey].push(richOp);

                if (_isEffectivelyPastOrToday(richOp.date)) {
                    _applyOptimisticSnapshotUpdate(richOp, 1);
                }
            });
            calculationCache.value[dateKey] = [...displayCache.value[dateKey]];

            _triggerProjectionUpdate();

            if (transferData.transferPurpose === 'inter_company') {
                const fromCompObj = companies.value.find(c => _idsMatch(c._id, transferData.fromCompanyId));
                const toCompObj = companies.value.find(c => _idsMatch(c._id, transferData.toCompanyId));
                if (toCompObj) {
                    let c = contractors.value.find(cnt => cnt.name.toLowerCase() === toCompObj.name.toLowerCase());
                    if (!c) c = await addContractor(toCompObj.name);
                    expenseContractorId = c._id;
                }
                if (fromCompObj) {
                    let c = contractors.value.find(cnt => cnt.name.toLowerCase() === fromCompObj.name.toLowerCase());
                    if (!c) c = await addContractor(fromCompObj.name);
                    incomeContractorId = c._id;
                }
            }

            const payload = {
                ...transferData,
                dateKey,
                categoryId: transferData.categoryId || transferCategory,
                expenseContractorId,
                incomeContractorId
            };

            const response = await axios.post(`${API_BASE_URL}/transfers`, payload);
            const data = response.data;

            await refreshDay(dateKey);

            // 🔴 REMOVED: fetchSnapshot() returns empty data before aggregation completes
            // await fetchSnapshot();

            return data;
        } catch (error) {
            console.error("Create Transfer Error (Optimistic):", error);
            if (transferData.date) {
                const k = _getDateKey(new Date(transferData.date));
                refreshDay(k);
            }
            throw error;
        }
    }

    async function updateTransfer(transferId, transferData) {
        try {
            const finalDate = new Date(transferData.date);
            const newDateKey = _getDateKey(finalDate);
            const oldOp = allOperationsFlat.value.find(o => _idsMatch(o._id, transferId));
            let newCellIndex;
            if (oldOp && oldOp.dateKey === newDateKey) newCellIndex = oldOp.cellIndex || 0;
            else newCellIndex = await getFirstFreeCellIndex(newDateKey);
            const response = await axios.put(`${API_BASE_URL}/events/${transferId}`, { ...transferData, dateKey: newDateKey, cellIndex: newCellIndex, type: 'transfer', isTransfer: true });
            if (oldOp && oldOp.dateKey !== newDateKey) await refreshDay(oldOp.dateKey);
            await refreshDay(newDateKey);
            _triggerProjectionUpdate();

            // 🔴 REMOVED: fetchSnapshot() returns empty data before aggregation completes
            // await fetchSnapshot();

            return response.data;
        } catch (error) { throw error; }
    }

    async function addOperation(op) {
        if (!op.dateKey) return;
        await refreshDay(op.dateKey);
        _triggerProjectionUpdate();
    }

    async function deleteEntity(path, id, deleteOperations = false) {
        try {
            await axios.delete(`${API_BASE_URL}/${path}/${id}`, { params: { deleteOperations } });

            if (path === 'accounts') accounts.value = accounts.value.filter(i => !_idsMatch(i._id, id));
            if (path === 'companies') companies.value = companies.value.filter(i => !_idsMatch(i._id, id));
            if (path === 'contractors') contractors.value = contractors.value.filter(i => !_idsMatch(i._id, id));
            if (path === 'projects') projects.value = projects.value.filter(i => !_idsMatch(i._id, id));
            if (path === 'individuals') individuals.value = individuals.value.filter(i => !_idsMatch(i._id, id));
            if (path === 'categories') categories.value = categories.value.filter(i => !_idsMatch(i._id, id));
            if (path === 'credits') credits.value = credits.value.filter(i => !_idsMatch(i._id, id));
            if (path === 'taxes') taxes.value = taxes.value.filter(i => !_idsMatch(i._id, id));
            if (deleteOperations) await forceRefreshAll(); else await forceRefreshAll();
        } catch (error) { throw error; }
    }

    async function addCategory(name) { const res = await axios.post(`${API_BASE_URL}/categories`, { name }); categories.value.push(res.data); return res.data; }

    async function addAccount(data) {
        let payload;
        if (typeof data === 'string') {
            payload = { name: data, initialBalance: 0 };
        } else {
            payload = {
                name: data.name,
                initialBalance: data.initialBalance || 0,
                companyId: data.companyId || null,
                individualId: data.individualId || null,
                isExcluded: !!data.isExcluded
            };
        }
        const res = await axios.post(`${API_BASE_URL}/accounts`, payload);
        if (!accounts.value.find(a => _idsMatch(a._id, res.data._id))) accounts.value.push(res.data);
        return res.data;
    }

    async function addCompany(name) { const res = await axios.post(`${API_BASE_URL}/companies`, { name }); if (!companies.value.find(i => _idsMatch(i._id, res.data._id))) companies.value.push(res.data); return res.data; }
    async function addContractor(name) { const res = await axios.post(`${API_BASE_URL}/contractors`, { name }); if (!contractors.value.find(i => _idsMatch(i._id, res.data._id))) contractors.value.push(res.data); return res.data; }
    async function addProject(name) { const res = await axios.post(`${API_BASE_URL}/projects`, { name }); if (!projects.value.find(i => _idsMatch(i._id, res.data._id))) projects.value.push(res.data); return res.data; }
    async function addIndividual(name) { const res = await axios.post(`${API_BASE_URL}/individuals`, { name }); if (!individuals.value.find(i => _idsMatch(i._id, res.data._id))) individuals.value.push(res.data); return res.data; }
    async function addCredit(data) { const res = await axios.post(`${API_BASE_URL}/credits`, data); if (!credits.value.find(i => _idsMatch(i._id, res.data._id))) credits.value.push(res.data); return res.data; }

    async function batchUpdateEntities(path, items) {
        try {
            if (path === 'categories') {
                const normalCategories = items.filter(i => !i.isPrepayment);
                const prepaymentCategories = items.filter(i => i.isPrepayment);
                await Promise.all([
                    axios.put(`${API_BASE_URL}/categories/batch-update`, normalCategories),
                    axios.put(`${API_BASE_URL}/prepayments/batch-update`, prepaymentCategories)
                ]);
                await fetchAllEntities();
                return;
            }
            const res = await axios.put(`${API_BASE_URL}/${path}/batch-update`, items);
            const sortedData = _sortByOrder(res.data);
            if (path === 'accounts') accounts.value = sortedData;
            else if (path === 'companies') companies.value = sortedData;
            else if (path === 'contractors') contractors.value = sortedData;
            else if (path === 'projects') projects.value = sortedData;
            else if (path === 'individuals') individuals.value = sortedData;
        } catch (e) { await fetchAllEntities(); }
    }

    async function getFirstFreeCellIndex(dateKey, startIndex = 0) {
        if (!displayCache.value[dateKey]) await fetchOperations(dateKey);
        const arr = displayCache.value[dateKey] || [];
        const used = new Set(arr.map(o => Number.isInteger(o?.cellIndex) ? o.cellIndex : -1));
        let idx = Math.max(0, startIndex | 0);
        while (used.has(idx)) idx++;
        return idx;
    }

    function startAutoRefresh(intervalMs = 30000) {

    }
    function stopAutoRefresh() { }

    async function forceRefreshAll() {
        try {
            displayCache.value = {}; calculationCache.value = {};
            await fetchAllEntities();

            const ps = useProjectionStore();
            if (ps.projection.mode) {
                await loadCalculationData(ps.projection.mode, new Date(ps.currentYear, 0, ps.todayDayOfYear));
            }
        } catch (error) { }
    }

    async function importOperations(operations, selectedIndices, progressCallback) {
        return useTransferStore().importOperations(operations, selectedIndices, progressCallback);
    }

    async function exportAllOperations() {
        return useTransferStore().exportAllOperations();
    }

    async function checkAuth() {
        try {
            isAuthLoading.value = true;
            const res = await axios.get(`${API_BASE_URL}/auth/me`);
            user.value = res.data;

            // Capture user's earliest operation date (backend should provide `minEventDate`)
            const minDateRaw = res.data?.minEventDate || res.data?.createdAt || null;
            if (minDateRaw) {
                const d = new Date(minDateRaw);
                if (!Number.isNaN(d.getTime())) {
                    d.setHours(0, 0, 0, 0);
                    earliestEventDate.value = d;
                }
            } else {
                earliestEventDate.value = null;
            }
        } catch (error) {
            user.value = null;
        } finally {
            isAuthLoading.value = false;
        }
    }

    async function logout() {
        try {
            await axios.post(`${API_BASE_URL}/auth/logout`, {}, { withCredentials: true });
        } catch (error) {
            console.error('Logout error:', error);
        }

        // Clear user data
        user.value = null;

        // Disconnect socket
        useSocketStore().disconnect();

        // Clear all caches
        displayCache.value = {};
        calculationCache.value = {};

        // 🟢 FIX: Clear all workspace and entity data to prevent conflicts between accounts
        accounts.value = [];
        companies.value = [];
        individuals.value = [];
        contractors.value = [];
        categories.value = [];
        projects.value = [];
        credits.value = [];
        operations.value = [];
        events.value = [];
        taxes.value = [];

        // Clear workspace state
        currentWorkspaceId.value = null;
        workspaceRole.value = null;

        // Clear localStorage
        localStorage.removeItem('currentWorkspaceId');
        localStorage.removeItem('workspaceRole');

        // Clear projection
        projection.value = null;
    }

    async function ensureSystemEntities() {
        let retailDuplicates = individuals.value.filter(i => {
            const n = i.name.trim().toLowerCase();
            return n === 'розничные клиенты' || n === 'розница';
        });
        let retailInd = null;
        if (retailDuplicates.length === 0) {
            retailInd = await addIndividual('Розничные клиенты');
        } else {
            retailInd = retailDuplicates[0];
            if (retailDuplicates.length > 1) {
                for (let i = 1; i < retailDuplicates.length; i++) {
                    try { await deleteEntity('individuals', retailDuplicates[i]._id, false); }
                    catch (e) { }
                }
            }
        }
        let realizationDuplicates = categories.value.filter(c => c.name.trim().toLowerCase() === 'реализация');
        let realizationCat = null;
        if (realizationDuplicates.length === 0) {
            realizationCat = await addCategory('Реализация');
        } else {
            realizationCat = realizationDuplicates[0];
            if (realizationDuplicates.length > 1) {
                for (let i = 1; i < realizationDuplicates.length; i++) {
                    try { await deleteEntity('categories', realizationDuplicates[i]._id, false); }
                    catch (e) { }
                }
            }
        }
        let debtDuplicates = categories.value.filter(c => c.name.trim().toLowerCase() === 'остаток долга');
        let debtCat = null;
        if (debtDuplicates.length === 0) {
            debtCat = await addCategory('Остаток долга');
        } else {
            debtCat = debtDuplicates[0];
            if (debtDuplicates.length > 1) {
                for (let i = 1; i < debtDuplicates.length; i++) {
                    try { await deleteEntity('categories', debtDuplicates[i]._id, false); }
                    catch (e) { }
                }
            }
        }
        let refundDuplicates = categories.value.filter(c => c.name.trim().toLowerCase() === 'возврат');
        let refundCat = null;
        if (refundDuplicates.length === 0) {
            refundCat = await addCategory('Возврат');
        } else {
            refundCat = refundDuplicates[0];
            if (refundDuplicates.length > 1) {
                for (let i = 1; i < refundDuplicates.length; i++) {
                    try { await deleteEntity('categories', refundDuplicates[i]._id, false); }
                    catch (e) { }
                }
            }
        }
        let creditProject = projects.value.find(p => p.name.trim().toLowerCase() === 'мои кредиты');
        if (!creditProject) creditProject = await addProject('Мои кредиты');
        let repaymentCat = categories.value.find(c => c.name.trim().toLowerCase() === 'погашение займов');
        if (!repaymentCat) repaymentCat = await addCategory('Погашение займов');
        let creditIncomeCat = categories.value.find(c => c.name.trim().toLowerCase() === 'кредиты');
        if (!creditIncomeCat) creditIncomeCat = await addCategory('Кредиты');

        let taxCat = categories.value.find(c => c.name.trim().toLowerCase() === 'налоги');
        if (!taxCat) taxCat = await addCategory('Налоги');

        return { retailInd, realizationCat, debtCat, refundCat, creditProject, repaymentCat, creditIncomeCat, taxCat };
    }

    async function closeRetailDaily(amount, date, projectId = null) {
        try {
            const { retailInd, realizationCat } = await ensureSystemEntities();

            let inferredCompanyId = null;
            if (projectId) {
                const pIdStr = _toStr(projectId);
                const relatedOp = allOperationsFlat.value.find(op =>
                    op.type === 'income' &&
                    _toStr(op.projectId) === pIdStr &&
                    _idsMatch(op.counterpartyIndividualId, retailInd._id) &&
                    op.companyId
                );
                if (relatedOp) {
                    inferredCompanyId = _toStr(relatedOp.companyId);
                }
            }

            if (!inferredCompanyId && companies.value.length > 0) {
                inferredCompanyId = companies.value[0]._id;
            }

            const opData = {
                type: 'expense',
                amount: -Math.abs(Number(amount)),
                accountId: null,
                counterpartyIndividualId: retailInd._id,
                categoryId: realizationCat._id,
                projectId: projectId,
                companyId: inferredCompanyId,
                date: date,
                description: 'Закрытие смены (Розница)'
            };
            await createEvent(opData);
        } catch (e) { throw e; }
    }

    async function closePrepaymentDeal(originalOp) {
        try {
            // 🟢 NEW: Просто закрываем операции без создания расхода
            // Расчеты теперь используют isClosed флаг
            await closeDealScope(
                originalOp.projectId,
                originalOp.categoryId,
                originalOp.contractorId,
                originalOp.counterpartyIndividualId
            );
        } catch (e) { throw e; }
    }

    // 🟢 NEW: Simplified - only close scope, no work act creation
    async function createWorkAct(projectId, categoryId, contractorId, counterpartyIndividualId, amount, date, opIdToClose, skipFetch = false, companyId = null, individualId = null) {
        try {
            // 🟢 Закрываем ВСЕ операции сделки (включая финальный транш)
            // Больше не исключаем текущую операцию, т.к. акт не создается
            await closeDealScope(
                projectId,
                categoryId,
                contractorId,
                counterpartyIndividualId,
                null  // ← Закрываем ВСЕ без исключений
            );

            return null; // Больше не создаем операцию
        } catch (e) {
            throw e;
        }
    }

    const projectsWithRetailDebts = computed(() => {
        const retailId = retailIndividualId.value;
        if (!retailId) return [];

        const balances = new Map();

        taxKnownOperations.value.forEach(op => {
            const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
            if (!_idsMatch(indId, retailId)) return;

            const pId = _toStr(op.projectId?._id || op.projectId);
            if (!pId) return;

            if (!balances.has(pId)) balances.set(pId, 0);

            if (op.type === 'income') {
                if (op.isClosed !== true) {
                    balances.set(pId, balances.get(pId) + (Number(op.amount) || 0));
                }
            } else if (op.type === 'expense' && !op.accountId) {
                balances.set(pId, balances.get(pId) - Math.abs(Number(op.amount) || 0));
            }
        });

        const ids = [];
        balances.forEach((bal, key) => {
            if (bal > 0) ids.push(key);
        });
        return ids;
    }
    );

    const getRetailWriteOffs = computed(() => {
        const retail = individuals.value.find(i => {
            const n = i.name.trim().toLowerCase();
            return n === 'розничные клиенты' || n === 'розница';
        });
        if (!retail) return [];
        return allOperationsFlat.value.filter(op => {
            if (op.type !== 'expense') return false;
            if (op.accountId) return false;
            const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
            return _idsMatch(indId, retail._id);
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    const calculateTaxForPeriod = (companyId, startDate = null, endDate = null) => {
        const company = companies.value.find(c => _idsMatch(c._id, companyId));
        if (!company) return { base: 0, tax: 0, income: 0, expense: 0 };

        const regime = company.taxRegime || 'simplified';
        const percent = company.taxPercent || (regime === 'simplified' ? 3 : 10);

        let totalIncome = 0;
        let totalExpense = 0;

        let effectiveEndDate;
        if (endDate) {
            effectiveEndDate = new Date(endDate);
            effectiveEndDate.setHours(23, 59, 59, 999);
        } else {
            effectiveEndDate = new Date();
            effectiveEndDate.setHours(23, 59, 59, 999);
        }

        let effectiveStartDate = startDate ? new Date(startDate) : null;
        if (effectiveStartDate) effectiveStartDate.setHours(0, 0, 0, 0);

        taxKnownOperations.value.forEach(op => {
            const opDate = new Date(op.date);
            if (effectiveStartDate && opDate < effectiveStartDate) return;
            if (effectiveEndDate && opDate > effectiveEndDate) return;

            if (op.type === 'transfer' || op.isTransfer) {
                const toId = op.toCompanyId ? _toStr(op.toCompanyId) : null;
                const fromId = op.fromCompanyId ? _toStr(op.fromCompanyId) : null;
                const targetId = String(companyId);

                if (toId === targetId) {
                    if (fromId !== targetId) {
                        totalIncome += (Number(op.amount) || 0);
                    }
                }
                if (fromId === targetId) {
                    if (toId !== targetId) {
                        totalExpense += Math.abs(Number(op.amount) || 0);
                    }
                }
                return;
            }

            const opCompId = op.companyId ? (op.companyId._id || op.companyId) : null;
            if (String(opCompId) !== String(companyId)) return;

            if (!op.accountId) return;

            if (op.type === 'income') {
                const catId = op.categoryId?._id || op.categoryId;
                if (creditCategoryId.value && String(catId) === String(creditCategoryId.value)) {
                    return;
                }
                totalIncome += (Number(op.amount) || 0);
            } else if (op.type === 'expense') {
                totalExpense += Math.abs(Number(op.amount) || 0);
            }
        });

        let taxBase = 0;
        if (regime === 'simplified') {
            taxBase = totalIncome;
        } else {
            taxBase = Math.max(0, totalIncome - totalExpense);
        }

        const taxAmount = taxBase * (percent / 100);

        return {
            base: taxBase,
            tax: taxAmount,
            income: totalIncome,
            expense: totalExpense,
            percent,
            regime
        };
    };

    function checkInsufficientFunds(accountId, expenseAmount) {
        const acc = accounts.value.find(a => _idsMatch(a._id, accountId));
        if (!acc) return null;

        if (!acc.companyId) return null;

        const currentBal = (snapshot.value.accountBalances[acc._id] || 0) + (acc.initialBalance || 0);

        if (expenseAmount > currentBal) {
            return {
                accountName: acc.name,
                currentBalance: currentBal,
                diff: expenseAmount - currentBal
            };
        }
        return null;
    }

    async function createTaxPayment(payload) {
        try {
            const { taxCat } = await ensureSystemEntities();

            const expenseData = {
                type: 'expense',
                amount: -Math.abs(Number(payload.amount)),
                date: payload.date,
                accountId: payload.accountId,
                companyId: payload.companyId,
                categoryId: taxCat._id,
                description: `Налог за период ${new Date(payload.periodFrom).toLocaleDateString()} - ${new Date(payload.periodTo).toLocaleDateString()}`
            };

            const expenseOp = await createEvent(expenseData);

            const taxRecord = {
                companyId: payload.companyId,
                periodFrom: payload.periodFrom,
                periodTo: payload.periodTo,
                amount: payload.amount,
                status: 'paid',
                date: payload.date,
                relatedEventId: expenseOp._id
            };

            const res = await axios.post(`${API_BASE_URL}/taxes`, taxRecord);
            if (!taxes.value.find(t => _idsMatch(t._id, res.data._id))) taxes.value.push(res.data);

            return res.data;
        } catch (e) {
            throw e;
        }
    }

    function getBalanceAtDate(accountId, targetDate) {
        const acc = currentAccountBalances.value.find(a => _idsMatch(a._id, accountId));
        if (!acc) return 0;
        let balance = acc.balance;

        const targetTime = new Date(targetDate).getTime();

        const relevantOps = futureOps.value.filter(op => {
            if (!op.date) return false;
            let isMatch = false;
            let amountChange = 0;

            if (isTransfer(op)) {
                if (_idsMatch(op.fromAccountId, accountId)) {
                    isMatch = true;
                } else if (_idsMatch(op.toAccountId, accountId)) {
                    isMatch = true;
                }
            } else {
                const opAccId = op.accountId?._id || op.accountId;
                if (_idsMatch(opAccId, accountId)) {
                    isMatch = true;
                }
            }

            if (!isMatch) return false;

            const opTime = new Date(op.date).getTime();
            return opTime <= targetTime;
        });

        relevantOps.forEach(op => {
            if (isTransfer(op)) {
                if (_idsMatch(op.fromAccountId, accountId)) {
                    balance -= Math.abs(Number(op.amount) || 0);
                } else if (_idsMatch(op.toAccountId, accountId)) {
                    balance += Math.abs(Number(op.amount) || 0);
                }
            } else {
                if (op.type === 'income') {
                    balance += Math.abs(Number(op.amount) || 0);
                } else {
                    balance -= Math.abs(Number(op.amount) || 0);
                }
            }
        });

        return balance;
    }

    function validateTransaction(accountId, amount, targetDate) {
        const isFuture = !_isEffectivelyPastOrToday(targetDate);

        let available = 0;

        if (isFuture) {
            available = getBalanceAtDate(accountId, targetDate);
        } else {
            const acc = currentAccountBalances.value.find(a => _idsMatch(a._id, accountId));
            available = acc ? acc.balance : 0;
        }

        if (available < amount) {
            return {
                isValid: false,
                availableBalance: available,
                message: `Недостаточно средств${isFuture ? ' (по плану)' : ''}. Доступно: ${available} ₸`
            };
        }

        return {
            isValid: true,
            availableBalance: available,
            message: ''
        };
    }

    // ================================ RETURN ================================

    // Period filter functions
    function setPeriodFilter(config) {
        periodFilter.value = config;
    }

    function getPeriodFilter() {
        return periodFilter.value;
    }

    // 🔥 SINGLE SOURCE OF TRUTH FOR DATE RANGES
    // This computed property unifies periodFilter and projection into one effective range
    // ALL calculations, visualizations, and balance widgets MUST use this
    const effectiveDateRange = computed(() => {
        // If user explicitly set custom period filter - use it
        if (periodFilter.value.mode === 'custom' && periodFilter.value.customStart && periodFilter.value.customEnd) {
            return {
                start: new Date(periodFilter.value.customStart),
                end: new Date(periodFilter.value.customEnd),
                source: 'periodFilter'
            };
        }

        // Otherwise use projection range (default behavior)
        if (projection.value && projection.value.rangeStartDate && projection.value.rangeEndDate) {
            return {
                start: new Date(projection.value.rangeStartDate),
                end: new Date(projection.value.rangeEndDate),
                source: 'projection'
            };
        }

        // Fallback: today -> end of current month
        const today = new Date();
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return {
            start: today,
            end: endOfMonth,
            source: 'fallback'
        };
    });

    // Set projection to end of current month (default startup behavior)
    async function setProjectionToEndOfMonth() {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        console.log('[Date Range] Setting projection to end of current month:', {
            from: startOfMonth.toDateString(),
            to: endOfMonth.toDateString()
        });

        // Calculate days in month
        const diffTime = endOfMonth.getTime() - startOfMonth.getTime();
        const totalDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

        projection.value = {
            mode: 'current_month',
            totalDays: totalDays,
            rangeStartDate: startOfMonth,
            rangeEndDate: endOfMonth,
            futureIncomeSum: 0,
            futureExpenseSum: 0
        };

        // Fetch operations for this range (without loadCalculationData which overwrites projection)
        const ps = useProjectionStore();
        ps.setCalculationStatus('calculating');
        try {
            await fetchOperationsRange(startOfMonth, endOfMonth);
            recalculateGlobalBalance(endOfMonth);
            ps.setCalculationStatus('done');
        } catch (e) {
            console.error('[setProjectionToEndOfMonth] Error:', e);
            ps.setCalculationStatus('idle');
        }
    }

    // 🟢 EXPORT ALL
    return {
        cacheVersion,

        // Period filter
        periodFilter,
        setPeriodFilter,
        getPeriodFilter,

        // 🔥 Unified date range (SINGLE SOURCE OF TRUTH)
        effectiveDateRange,
        setProjectionToEndOfMonth,

        // 🟢 Exporting helper so other stores (projectionStore) can use it
        _idsMatch,

        accounts, companies, contractors, projects, categories, individuals,
        prepayments, // 🟢 Computed from categories where isPrepayment: true
        recurringOperations, // 🟢 Recurring operations for future projections
        credits, taxes,
        visibleCategories, visibleContractors,
        operationsCache: displayCache, displayCache, calculationCache,

        // UI Store Bridges
        isHeaderExpanded, toggleHeaderExpansion, includeExcludedInTotal, toggleExcludedInclusion,

        // Widget Store Bridges
        allWidgets, dashboardLayout, dashboardForecastState,
        widgetSortMode, widgetFilterMode,
        replaceWidget, setForecastState, setWidgetSortMode, setWidgetFilterMode,

        // Projection Store Bridges
        projection,

        user, isAuthLoading,
        // 🟢 NEW: Role-based access
        workspaceRole, isWorkspaceAdmin, isWorkspaceOwner, isManager, isAnalyst, // Export role and role checks
        userRole, isAdmin, isFullAccess, isTimelineOnly, canDelete, canEdit, canInvite,

        currentAccountBalances, currentCompanyBalances, currentContractorBalances, currentProjectBalances,
        currentIndividualBalances, currentTotalBalance, futureTotalBalance, currentCategoryBreakdowns,
        currentTotalForPeriod, futureTotalForPeriod,

        dailyChartData: computed(() => useProjectionStore().dailyChartData),

        futureAccountBalances, futureCompanyBalances, futureContractorBalances, futureProjectBalances,
        futureIndividualBalances,

        currentCreditBalances, futureCreditBalances, creditCategoryId,

        liabilitiesWeOwe: computed(() => useDealStore().liabilitiesWeOweCurrent), // Fact
        liabilitiesTheyOwe: computed(() => useDealStore().liabilitiesTheyOweCurrent), // Fact
        liabilitiesWeOweFuture: computed(() => useDealStore().liabilitiesWeOweTotal), // Forecast (Plan)
        liabilitiesTheyOweFuture: computed(() => useDealStore().liabilitiesTheyOweTotal), // Forecast (Plan)

        getPrepaymentCategoryIds, getActCategoryIds,

        currentCategoryBalances, futureCategoryBalances,

        futureContractorChanges, futureProjectChanges, futureIndividualChanges, futureCategoryChanges,

        currentOps,

        currentTransfers, futureTransfers,
        currentIncomes, futureIncomes,
        currentExpenses, futureExpenses,
        currentWithdrawals, futureWithdrawals,

        getCategoryById, futureCategoryBreakdowns,

        getOperationsForDay,
        getPhantomOperations,

        setToday: (d) => useProjectionStore().setToday(d),
        setCurrentViewDate: (d) => useProjectionStore().setCurrentViewDate(d),

        fetchAllEntities, fetchOperations, refreshDay,

        addOperation, deleteOperation, moveOperation,
        addAccount, addCompany, addContractor, addProject, addCategory,
        addIndividual, deleteEntity, batchUpdateEntities,
        addCredit,

        computeTotalDaysForMode: (mode) => useProjectionStore().computeTotalDaysForMode(mode),
        updateFutureProjectionByMode: (m, t) => useProjectionStore().updateFutureProjectionByMode(m, t),
        setProjectionRange: (s, e) => useProjectionStore().setProjectionRange(s, e),

        loadCalculationData,

        createTransfer, updateTransfer, updateOperation, createEvent,
        createWorkAct,
        closeDealScope, closePreviousTranches,

        fetchOperationsRange, updateFutureProjectionWithData,

        startAutoRefresh, stopAutoRefresh, forceRefreshAll,

        getFirstFreeCellIndex, _parseDateKey, _getDateKey, _isEffectivelyPastOrToday, // Exported helper

        _isRetailWriteOff,

        allOperationsFlat, displayOperationsFlat,

        importOperations, exportAllOperations,
        fetchSnapshot,
        checkAuth, logout,
        _sortByOrder,

        closeRetailDaily, closePrepaymentDeal, ensureSystemEntities,
        getRetailWriteOffs,

        retailIndividualId, realizationCategoryId, remainingDebtCategoryId, refundCategoryId,
        _isRetailWriteOff, _isRetailRefund, _isCreditIncome, loanRepaymentCategoryId,
        getProjectDealStatus,

        dealOperations, getAllRelevantOps,
        projectsWithRetailDebts,

        calculateTaxForPeriod,
        checkInsufficientFunds, // 🟢 Export
        createTaxPayment,
        _isTaxPayment,

        totalInitialBalance,

        getBalanceAtDate,
        validateTransaction,

        onSocketOperationAdded,
        onSocketOperationUpdated,
        onSocketOperationDeleted,
        onSocketEntityAdded,
        onSocketEntityDeleted,
        onSocketEntityListUpdated,

        // 🟢 NEW: Project Management Methods
        async createProject(projectData) {
            try {
                const response = await axios.post(`${API_BASE_URL}/projects`, projectData, {
                    withCredentials: true
                });

                const newProject = response.data;
                projects.value = [...projects.value, newProject];

                return newProject;
            } catch (error) {
                console.error('Failed to create project:', error);
                throw error;
            }
        },

        async updateProject(projectId, updates) {
            try {
                const response = await axios.put(
                    `${API_BASE_URL}/projects/${projectId}`,
                    updates,
                    { withCredentials: true }
                );

                const updatedProject = response.data;
                const index = projects.value.findIndex(p => p._id === projectId);

                if (index !== -1) {
                    projects.value[index] = updatedProject;
                    projects.value = [...projects.value]; // Trigger reactivity
                }

                return updatedProject;
            } catch (error) {
                console.error('Failed to update project:', error);
                throw error;
            }
        },

        async deleteProject(projectId) {
            try {
                await axios.delete(`${API_BASE_URL}/projects/${projectId}`, {
                    withCredentials: true
                });

                projects.value = projects.value.filter(p => p._id !== projectId);
            } catch (error) {
                console.error('Failed to delete project:', error);
                throw error;
            }
        },

        async reorderProjects(projectsWithOrder) {
            try {
                await axios.post(
                    `${API_BASE_URL}/projects/reorder`,
                    { projects: projectsWithOrder },
                    { withCredentials: true }
                );

                // Update local state
                projectsWithOrder.forEach(({ _id, order }) => {
                    const project = projects.value.find(p => p._id === _id);
                    if (project) project.order = order;
                });

                projects.value = [...projects.value]; // Trigger reactivity
            } catch (error) {
                console.error('Failed to reorder projects:', error);
                throw error;
            }
        },

        // 🟢 NEW: Workspace switching
        async resetStore() {
            allEvents.value = [];
            accounts.value = [];
            companies.value = [];
            contractors.value = [];
            projects.value = [];
            individuals.value = [];
            categories.value = [];
            prepayments.value = [];
            credits.value = [];
            deals.value = [];

            snapshot.value = {
                timestamp: null,
                totalBalance: 0,
                accountBalances: {},
                companyBalances: {},
                individualBalances: {},
                contractorBalances: {},
                projectBalances: {},
                categoryTotals: {}
            };
        },

        async reloadWorkspace() {
            await this.resetStore();
            await fetchUser();
            await fetchAllEntities();

            const today = new Date();
            const year = today.getFullYear();
            const dayOfYear = getDayOfYear(today);

            currentYear.value = year;
            currentDayOfYear.value = dayOfYear;

            await loadEventsForDay(year, dayOfYear);
            await loadSnapshot();
        }
    };
});