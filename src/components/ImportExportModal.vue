<script setup>
import { transferLabels, isSystemWithdrawal } from '@/utils/transferLabels.js';
import { ALL_PROJECTS, projectFields, projectSelection } from '@/utils/projectScope';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import DateRangePicker from '@/components/DateRangePicker.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import SubcategorySelect from '@/components/SubcategorySelect.vue';
import JournalChartsPanel from '@/components/JournalChartsPanel.vue';

const emit = defineEmits(['close', 'import-complete']);
const mainStore = useMainStore();

const isLoading = ref(false);
const loadError = ref('');
const operations = ref([]);
const showCopySuccess = ref(false);
const showHeaderActionsMenu = ref(false);
const isEditMode = ref(false);
const isSavingEdits = ref(false);
const editRows = ref({});
const baseEditRows = ref({});

const isChartsPaneCollapsed = ref(false);
const chartsPaneWidth = ref(25);
const isResizingChartsPane = ref(false);
const modalBodyRef = ref(null);

const filters = ref({
  dateFrom: '',
  dateTo: '',
  type: [],
  category: [],
  subcategory: [],
  project: [],
  account: [],
  contractor: [],
  owner: [],
  status: []
});

const MULTI_FILTER_FIELDS = new Set([
  'type',
  'category',
  'subcategory',
  'project',
  'account',
  'contractor',
  'owner',
  'status'
]);

const TABLE_COLUMNS = Object.freeze([
  'Дата',
  'Тип',
  'Категория',
  'Подкатегория',
  'Проект',
  'Сумма',
  'Счет',
  'Контрагент',
  'Компания/Физлицо',
  'Статус'
]);


const closeModal = () => {
  emit('close');
};



const normalizeString = (value) => String(value || '').trim();
const normalizeNameKey = (value) => normalizeString(value).toLowerCase();

const getTodayIso = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const shiftIsoDate = (isoDate, diffDays) => {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setDate(date.getDate() + diffDays);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date - offset).toISOString().slice(0, 10);
};

const normalizeDateByStatus = (isoDate, statusLabel) => {
  const input = normalizeString(isoDate);
  if (!input) return input;

  const todayIso = getTodayIso();
  if (statusLabel === 'План' && input <= todayIso) return shiftIsoDate(todayIso, 1);
  if (statusLabel === 'Исполнено' && input > todayIso) return todayIso;
  return input;
};

const toDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date - offset).toISOString().slice(0, 10);
};

const parseAmountInput = (value) => {
  const raw = String(value ?? '');
  const cleaned = raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(parsed);
};

const extractId = (entityOrId) => {
  if (!entityOrId) return '';
  if (typeof entityOrId === 'object') {
    return String(entityOrId._id || entityOrId.id || '');
  }
  return String(entityOrId);
};

const toOwnerKey = (companyId, individualId) => {
  if (companyId) return `company-${companyId}`;
  if (individualId) return `individual-${individualId}`;
  return '';
};

const parseOwnerKey = (ownerKey) => {
  const value = normalizeString(ownerKey);
  if (!value) return { companyId: null, individualId: null };
  if (value.startsWith('company-')) return { companyId: value.slice(8), individualId: null };
  if (value.startsWith('individual-')) return { companyId: null, individualId: value.slice(11) };
  return { companyId: null, individualId: null };
};

const toCounterpartyKey = (contractorId, individualId) => {
  if (contractorId) return `contractor-${contractorId}`;
  if (individualId) return `individual-${individualId}`;
  return '';
};

const parseCounterpartyKey = (counterpartyKey) => {
  const value = normalizeString(counterpartyKey);
  if (!value) return { contractorId: null, counterpartyIndividualId: null };
  if (value.startsWith('contractor-')) return { contractorId: value.slice(11), counterpartyIndividualId: null };
  if (value.startsWith('individual-')) return { contractorId: null, counterpartyIndividualId: value.slice(11) };
  return { contractorId: null, counterpartyIndividualId: null };
};

const isTransferOperation = (op) => !!(op?.isTransfer || op?.type === 'transfer');
const isWithdrawalTransfer = (op) => !!op?.isWithdrawal || isSystemWithdrawal(op);
const shouldIncludeInOperationsEditor = (op) => {
  if (!op) return false;
  if (op.isSplitParent) return false;
  if (op.excludeFromTotals && !op.offsetIncomeId) return false;
  return true;
};

const resolveEntityName = (entityOrId, sourceList, fallback = '') => {
  if (!entityOrId) return fallback;

  if (typeof entityOrId === 'object') {
    if (entityOrId._id) {
      const targetId = extractId(entityOrId);
      const found = sourceList.find((item) => extractId(item) === targetId);
      if (found?.name) return found.name;
    }
    if (entityOrId.name) {
      return entityOrId.name;
    }
  }

  if (typeof entityOrId === 'string') {
    const foundById = sourceList.find((item) => extractId(item) === entityOrId);
    if (foundById?.name) return foundById.name;

    const foundByName = sourceList.find(
      (item) => item && typeof item.name === 'string' && item.name.toLowerCase() === entityOrId.toLowerCase()
    );
    if (foundByName?.name) return foundByName.name;
  }

  return fallback;
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const formatAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₸0';

  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(abs);
  return amount < 0 ? `-₸${formatted}` : `₸${formatted}`;
};

const formatSummaryAmount = (value) => {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(safeAmount);
  return `₸${formatted}`;
};

const isPersonalTransferWithdrawal = (op) => isSystemWithdrawal(op);

const normalizeTypeLabel = (op) => {
  if (op?.isWorkAct) return 'Акт выполненных работ';
  if (op?.type === 'withdrawal' || op?.isWithdrawal) return 'Вывод средств';
  if (op?.type === 'transfer' || op?.isTransfer || isPersonalTransferWithdrawal(op)) return 'Перевод';
  if (op?.type === 'prepayment') return 'Предоплата';
  if (op?.type === 'income') return 'Доход';
  if (op?.type === 'expense') return 'Расход';
  return 'Операция';
};

const resolveStatusMeta = (op) => {
  const raw = normalizeString(op?.status).toLowerCase();
  if (raw) {
    if (['plan', 'planned', 'forecast', 'прогноз', 'план'].includes(raw)) {
      return { label: 'План', code: 'plan', source: 'explicit_status' };
    }
    if (['fact', 'done', 'executed', 'исполнено', 'выполнено'].includes(raw)) {
      return { label: 'Исполнено', code: 'fact', source: 'explicit_status' };
    }
  }

  if (op?.isPlanned === true || op?.planned === true || op?.isForecast === true || op?.forecast === true || op?.isPlan === true) {
    return { label: 'План', code: 'plan', source: 'explicit_flag' };
  }

  if (op?.isPlanned === false || op?.planned === false || op?.isForecast === false || op?.forecast === false || op?.isPlan === false) {
    return { label: 'Исполнено', code: 'fact', source: 'explicit_flag' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const opDate = new Date(op?.date);
  if (!Number.isNaN(opDate.getTime())) {
    opDate.setHours(0, 0, 0, 0);
  }

  const isPlan = !Number.isNaN(opDate.getTime()) && opDate.getTime() > today.getTime();
  return isPlan
    ? { label: 'План', code: 'plan', source: 'date_fallback' }
    : { label: 'Исполнено', code: 'fact', source: 'date_fallback' };
};

const normalizeStatusLabel = (op) => {
  const statusMeta = resolveStatusMeta(op);
  return statusMeta.label;
};

const buildAccountFilterMeta = (op, fallbackLabel = '') => {
  const tokens = new Set();
  const entriesByValue = new Map();

  const pushAccount = (accountRef, fallback = '') => {
    const id = extractId(accountRef);
    const label = normalizeString(resolveEntityName(accountRef, mainStore.accounts, fallback || ''));

    if (id) {
      tokens.add(id);
      if (!entriesByValue.has(id)) {
        entriesByValue.set(id, {
          value: id,
          label: label || fallback || 'Счет',
          entityPath: 'accounts',
          entityId: id
        });
      }
    }

    if (label) {
      tokens.add(label);
    }
  };

  pushAccount(op?.accountId, fallbackLabel);
  pushAccount(op?.fromAccountId);
  pushAccount(op?.toAccountId);

  if (entriesByValue.size === 0) {
    const label = normalizeString(fallbackLabel || 'Без счета');
    if (label) {
      tokens.add(label);
      entriesByValue.set(`label:${label}`, {
        value: label,
        label
      });
    }
  }

  return {
    tokens: Array.from(tokens),
    entries: Array.from(entriesByValue.values())
  };
};

const buildOperationRow = (op) => {
  const typeLabel = normalizeTypeLabel(op);
  const statusMeta = resolveStatusMeta(op);
  const statusLabel = statusMeta.label;
  const parsedDate = new Date(op?.date);
  const dateTs = Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime();
  const isTransfer = isTransferOperation(op);
  const isWithdrawal = isWithdrawalTransfer(op);

  const categoryFallback = isPersonalTransferWithdrawal(op) ? 'Вывод средств' : 'Без категории';
  const categoryName = resolveEntityName(op?.categoryId, mainStore.categories, categoryFallback);
  const projectName = mainStore.getOperationProjectName(op);

  let accountName = resolveEntityName(op?.accountId, mainStore.accounts, 'Без счета');
  let ownerName =
    resolveEntityName(op?.companyId, mainStore.companies) ||
    resolveEntityName(op?.individualId, mainStore.individuals, 'Без компании/физлица');

  if (typeLabel === 'Перевод') {
    const labels = transferLabels(op, mainStore);
    accountName = labels.routeLabel;
    ownerName = `${labels.fromOwnerName || 'Не указан'} → ${labels.toOwnerName || 'Не указан'}`;
  }

  const contractorName =
    resolveEntityName(op?.contractorId, mainStore.contractors) ||
    resolveEntityName(op?.counterpartyIndividualId, mainStore.individuals, 'Без контрагента');

  const rawAmount = Number(op?.amount);
  const amountForDisplay = Number.isFinite(rawAmount)
    ? typeLabel === 'Перевод'
      ? Math.abs(rawAmount)
      : rawAmount
    : 0;
  const accountFilterMeta = buildAccountFilterMeta(op, accountName);

  return {
    rowId: String(op?._id || op?.id || `${op?.date || 'op'}-${Math.random().toString(16).slice(2)}`),
    operationId: String(op?._id || op?.id || ''),
    type: typeLabel,
    isTransfer,
    isWithdrawal,
    source: op,
    amount: amountForDisplay,
    statusCode: statusMeta.code,
    statusSource: statusMeta.source,
    dateTs,
    accountFilterTokens: accountFilterMeta.tokens,
    accountFilterEntries: accountFilterMeta.entries,
    editable: {
      date: toDateInputValue(op?.date),
      type: typeLabel,
      categoryId: extractId(op?.categoryId),
      subcategoryId: extractId(op?.subcategoryId),
      projectId: projectSelection(op)[0] || '',
      amount: amountForDisplay ? String(Math.abs(amountForDisplay)) : '',
      accountId: extractId(op?.accountId),
      counterpartyKey: toCounterpartyKey(extractId(op?.contractorId), extractId(op?.counterpartyIndividualId)),
      ownerKey: toOwnerKey(extractId(op?.companyId), extractId(op?.individualId)),
      status: statusLabel,
      fromAccountId: extractId(op?.fromAccountId),
      toAccountId: extractId(op?.toAccountId),
      fromOwnerKey: toOwnerKey(extractId(op?.fromCompanyId), extractId(op?.fromIndividualId)),
      toOwnerKey: toOwnerKey(extractId(op?.toCompanyId), extractId(op?.toIndividualId))
    },
    values: {
      'Дата': formatDate(op?.date),
      'Тип': typeLabel,
      'Категория': categoryName,
      'Подкатегория': mainStore.getOperationSubcategoryName(op) || 'Без подкатегории',
      'Детализация категории': mainStore.getOperationCategoryLabel(op),
      'Проект': projectName,
      'Сумма': formatAmount(amountForDisplay),
      'Счет': accountName,
      'Контрагент': contractorName,
      'Компания/Физлицо': ownerName,
      'Статус': statusLabel
    }
  };
};

const cloneDraft = (draft) => JSON.parse(JSON.stringify(draft || {}));

const buildEditStateFromRows = (rows) => {
  const nextDrafts = {};
  const nextBase = {};

  rows.forEach((row) => {
    const draft = cloneDraft(row.editable);
    nextDrafts[row.rowId] = draft;
    nextBase[row.rowId] = cloneDraft(draft);
  });

  editRows.value = nextDrafts;
  baseEditRows.value = nextBase;
};

const openEditMode = () => {
  buildEditStateFromRows(operations.value);
  isEditMode.value = true;
};

const cancelEditMode = () => {
  isEditMode.value = false;
  editRows.value = {};
  baseEditRows.value = {};
};

const toggleEditMode = () => {
  if (isSavingEdits.value) return;
  if (isEditMode.value) {
    cancelEditMode();
    return;
  }
  openEditMode();
};

const normalizedDraftSnapshot = (draft) => ({
  date: normalizeString(draft?.date),
  type: normalizeString(draft?.type),
  categoryId: normalizeString(draft?.categoryId),
  subcategoryId: normalizeString(draft?.subcategoryId),
  projectId: normalizeString(draft?.projectId),
  amount: parseAmountInput(draft?.amount),
  accountId: normalizeString(draft?.accountId),
  counterpartyKey: normalizeString(draft?.counterpartyKey),
  ownerKey: normalizeString(draft?.ownerKey),
  status: normalizeString(draft?.status),
  fromAccountId: normalizeString(draft?.fromAccountId),
  toAccountId: normalizeString(draft?.toAccountId),
  fromOwnerKey: normalizeString(draft?.fromOwnerKey),
  toOwnerKey: normalizeString(draft?.toOwnerKey)
});

const isRowChanged = (rowId) => {
  const current = normalizedDraftSnapshot(editRows.value[rowId]);
  const base = normalizedDraftSnapshot(baseEditRows.value[rowId]);
  return JSON.stringify(current) !== JSON.stringify(base);
};

const loadOperations = async () => {
  isLoading.value = true;
  loadError.value = '';

  try {
    const { operations: exportedOperations } = await mainStore.exportAllOperations();
    const source = Array.isArray(exportedOperations) ? exportedOperations : [];
    const sorted = source.filter(shouldIncludeInOperationsEditor);

    sorted.sort((a, b) => {
      const dateA = new Date(a?.date).getTime() || 0;
      const dateB = new Date(b?.date).getTime() || 0;
      if (dateA !== dateB) return dateA - dateB;

      const createdA = new Date(a?.createdAt).getTime() || 0;
      const createdB = new Date(b?.createdAt).getTime() || 0;
      return createdA - createdB;
    });

    operations.value = sorted.map(buildOperationRow);
    if (isEditMode.value) {
      buildEditStateFromRows(operations.value);
    }
  } catch (error) {
    loadError.value = `Не удалось загрузить операции: ${error?.message || 'Неизвестная ошибка'}`;
    operations.value = [];
  } finally {
    isLoading.value = false;
  }
};

const dateRangeFilter = computed({
  get: () => ({
    from: filters.value.dateFrom || null,
    to: filters.value.dateTo || null
  }),
  set: (range) => {
    filters.value.dateFrom = range?.from || '';
    filters.value.dateTo = range?.to || '';
  }
});

const filterOptions = computed(() => {
  const source = operations.value;
  const toSortedList = (set) => Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));

  const type = new Set();
  const category = new Set();
  const subcategory = new Set();
  const project = new Set();
  const account = new Set();
  const contractor = new Set();
  const owner = new Set();
  const status = new Set();

  source.forEach((row) => {
    if (row.values['Тип']) type.add(row.values['Тип']);
    if (row.values['Категория']) category.add(row.values['Категория']);
    subcategory.add(row.values['Подкатегория']);
    if (row.values['Проект']) project.add(row.values['Проект']);
    if (row.values['Счет']) account.add(row.values['Счет']);
    if (row.values['Контрагент']) contractor.add(row.values['Контрагент']);
    if (row.values['Компания/Физлицо']) owner.add(row.values['Компания/Физлицо']);
    if (row.values['Статус']) status.add(row.values['Статус']);
  });

  return {
    type: toSortedList(type),
    category: toSortedList(category),
    subcategory: toSortedList(subcategory),
    project: toSortedList(project),
    account: toSortedList(account),
    contractor: toSortedList(contractor),
    owner: toSortedList(owner),
    status: toSortedList(status)
  };
});

const ownerOptions = computed(() => {
  const companyOpts = (mainStore.companies || []).map((item) => ({
    value: `company-${item._id}`,
    label: item.name || 'Компания',
    entityPath: 'companies',
    entityId: String(item._id)
  }));
  const individualOpts = (mainStore.individuals || []).map((item) => ({
    value: `individual-${item._id}`,
    label: item.name || 'Физлицо',
    entityPath: 'individuals',
    entityId: String(item._id)
  }));
  return [...companyOpts, ...individualOpts];
});

const accountOptions = computed(() =>
  (mainStore.accounts || []).map((item) => ({
    value: String(item._id),
    label: item.name || 'Счет',
    entityPath: 'accounts',
    entityId: String(item._id)
  }))
);

const categoryOptions = computed(() =>
  (mainStore.categories || []).map((item) => ({
    value: String(item._id),
    label: item.name || 'Категория',
    entityPath: 'categories',
    entityId: String(item._id)
  }))
);

const projectOptions = computed(() =>
  [{ _id: ALL_PROJECTS, name: 'Все проекты' }, ...(mainStore.projects || [])].map((item) => ({
    value: String(item._id),
    label: item.name || 'Проект',
    entityPath: item._id === ALL_PROJECTS ? null : 'projects',
    entityId: item._id === ALL_PROJECTS ? null : String(item._id)
  }))
);

const counterpartyOptions = computed(() => {
  const contractorOpts = (mainStore.contractors || []).map((item) => ({
    value: `contractor-${item._id}`,
    label: item.name || 'Контрагент',
    entityPath: 'contractors',
    entityId: String(item._id)
  }));
  const individualOpts = (mainStore.individuals || []).map((item) => ({
    value: `individual-${item._id}`,
    label: item.name || 'Физлицо',
    entityPath: 'individuals',
    entityId: String(item._id)
  }));
  return [...contractorOpts, ...individualOpts];
});

const openInlineDropdownId = ref('');
const inlineRenameState = ref({
  dropdownId: '',
  optionValue: '',
  entityPath: '',
  entityId: '',
  draftName: '',
  saving: false
});
const inlineRenameInputRef = ref(null);
const inlineSearchByDropdown = ref({});
const inlineDeleteState = ref({
  show: false,
  dropdownId: '',
  optionValue: '',
  entityPath: '',
  entityId: '',
  label: '',
  deleting: false
});

const entityListByPath = (path) => {
  if (path === 'accounts') return Array.isArray(mainStore.accounts) ? mainStore.accounts : [];
  if (path === 'companies') return Array.isArray(mainStore.companies) ? mainStore.companies : [];
  if (path === 'individuals') return Array.isArray(mainStore.individuals) ? mainStore.individuals : [];
  if (path === 'contractors') return Array.isArray(mainStore.contractors) ? mainStore.contractors : [];
  if (path === 'projects') return Array.isArray(mainStore.projects) ? mainStore.projects : [];
  if (path === 'categories') return Array.isArray(mainStore.categories) ? mainStore.categories : [];
  return [];
};

const findFirstEntityMatch = (list, name) => {
  const key = normalizeNameKey(name);
  if (!key) return null;
  return (list || []).find((item) => normalizeNameKey(item?.name) === key) || null;
};

const mapFilterOptionWithRename = (label, candidates = []) => {
  const normalizedLabel = normalizeString(label);
  const match = candidates
    .map(({ path, list }) => {
      const found = findFirstEntityMatch(list, normalizedLabel);
      if (!found?._id) return null;
      return { path, id: String(found._id) };
    })
    .find(Boolean);

  if (!match) {
    return { value: normalizedLabel, label: normalizedLabel };
  }

  return {
    value: normalizedLabel,
    label: normalizedLabel,
    entityPath: match.path,
    entityId: match.id
  };
};

const categoryFilterOptions = computed(() =>
  (filterOptions.value.category || []).map((label) =>
    mapFilterOptionWithRename(label, [{ path: 'categories', list: mainStore.categories }]))
);

const projectFilterOptions = computed(() =>
  (filterOptions.value.project || []).map((label) =>
    mapFilterOptionWithRename(label, [{ path: 'projects', list: mainStore.projects }]))
);

const accountFilterOptions = computed(() =>
  operations.value
    .flatMap((row) => (Array.isArray(row.accountFilterEntries) ? row.accountFilterEntries : []))
    .reduce((acc, option) => {
      const value = normalizeString(option?.value);
      if (!value || acc.some((item) => String(item.value) === value)) return acc;
      acc.push(option);
      return acc;
    }, [])
    .sort((a, b) => normalizeString(a?.label).localeCompare(normalizeString(b?.label), 'ru'))
);

const contractorFilterOptions = computed(() =>
  (filterOptions.value.contractor || []).map((label) =>
    mapFilterOptionWithRename(label, [
      { path: 'contractors', list: mainStore.contractors },
      { path: 'individuals', list: mainStore.individuals }
    ]))
);

const ownerFilterOptions = computed(() =>
  (filterOptions.value.owner || []).map((label) =>
    mapFilterOptionWithRename(label, [
      { path: 'companies', list: mainStore.companies },
      { path: 'individuals', list: mainStore.individuals }
    ]))
);

const typeFilterOptions = computed(() =>
  (filterOptions.value.type || []).map((label) => ({
    value: normalizeString(label),
    label: normalizeString(label)
  }))
);

const statusFilterOptions = computed(() =>
  (filterOptions.value.status || []).map((label) => ({
    value: normalizeString(label),
    label: normalizeString(label)
  }))
);

const isInlineDropdownOpen = (dropdownId) => openInlineDropdownId.value === dropdownId;
const isInlineRenameActive = (dropdownId, optionValue) =>
  inlineRenameState.value.dropdownId === dropdownId &&
  inlineRenameState.value.optionValue === String(optionValue || '');

const resetInlineRenameState = () => {
  inlineRenameState.value = {
    dropdownId: '',
    optionValue: '',
    entityPath: '',
    entityId: '',
    draftName: '',
    saving: false
  };
};

const resetInlineDeleteState = () => {
  inlineDeleteState.value = {
    show: false,
    dropdownId: '',
    optionValue: '',
    entityPath: '',
    entityId: '',
    label: '',
    deleting: false
  };
};

const getInlineSearchValue = (dropdownId) => String(inlineSearchByDropdown.value[dropdownId] || '');
const setInlineSearchValue = (dropdownId, value) => {
  inlineSearchByDropdown.value = {
    ...inlineSearchByDropdown.value,
    [dropdownId]: String(value || '')
  };
};

const clearInlineSearchValue = (dropdownId) => {
  if (!dropdownId) return;
  const next = { ...inlineSearchByDropdown.value };
  delete next[dropdownId];
  inlineSearchByDropdown.value = next;
};

const getFilteredInlineOptions = (dropdownId, options = []) => {
  const query = normalizeNameKey(getInlineSearchValue(dropdownId));
  if (!query) return Array.isArray(options) ? options : [];
  return (Array.isArray(options) ? options : []).filter((opt) => normalizeNameKey(opt?.label).includes(query));
};

const closeInlineDropdown = () => {
  const activeDropdownId = openInlineDropdownId.value;
  openInlineDropdownId.value = '';
  clearInlineSearchValue(activeDropdownId);
  resetInlineRenameState();
  resetInlineDeleteState();
};

const toggleInlineDropdown = (dropdownId) => {
  if (isInlineDropdownOpen(dropdownId)) {
    closeInlineDropdown();
    return;
  }
  if (openInlineDropdownId.value) {
    clearInlineSearchValue(openInlineDropdownId.value);
  }
  openInlineDropdownId.value = dropdownId;
  setInlineSearchValue(dropdownId, '');
  resetInlineRenameState();
  resetInlineDeleteState();
};

const INLINE_SYSTEM_LABEL_KEYS = new Set([
  'без категории',
  'без проекта',
  'без счета',
  'без контрагента',
  'без владельца',
  'без компании/физлица',
  'вне системы'
]);

const isSystemInlineLabel = (label) => INLINE_SYSTEM_LABEL_KEYS.has(normalizeNameKey(label));

const canInlineRenameOption = (option) => {
  const label = normalizeString(option?.label);
  if (!label || isSystemInlineLabel(label)) return false;
  return !!(option?.entityPath && option?.entityId);
};

const canInlineDeleteOption = (option) => canInlineRenameOption(option);

const getInlineSelectedLabel = (value, options, emptyLabel) => {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) return emptyLabel;
  const found = (options || []).find((opt) => String(opt.value) === normalizedValue);
  if (found?.label) return found.label;
  return normalizedValue;
};

const normalizeFilterList = (value) => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => normalizeString(item)).filter(Boolean)));
  }

  const single = normalizeString(value);
  return single ? [single] : [];
};

const getFilterFieldValues = (field) => {
  if (!Object.prototype.hasOwnProperty.call(filters.value, field)) return [];
  if (MULTI_FILTER_FIELDS.has(field)) return normalizeFilterList(filters.value[field]);
  const single = normalizeString(filters.value[field]);
  return single ? [single] : [];
};

const isFilterOptionSelected = (field, value) => {
  const target = normalizeString(value);
  if (!target) return false;
  return getFilterFieldValues(field).includes(target);
};

const getFilterTriggerLabel = (field, options, emptyLabel) => {
  const selectedValues = getFilterFieldValues(field);
  if (selectedValues.length === 0) return emptyLabel;

  const labels = selectedValues.map((selectedValue) => {
    const found = (options || []).find((opt) => String(opt?.value) === selectedValue);
    return normalizeString(found?.label || selectedValue);
  }).filter(Boolean);

  if (labels.length === 0) return emptyLabel;
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1}`;
};

const estimateMenuLabelWidth = (text) => {
  const value = String(text || '');
  if (!value) return 0;
  return Math.ceil(value.length * 8.2);
};

const getHeaderMenuStyle = (options = []) => {
  const labels = (Array.isArray(options) ? options : [])
    .map((opt) => normalizeString(opt?.label))
    .filter(Boolean);

  const longestLabelPx = labels.reduce((max, label) => Math.max(max, estimateMenuLabelWidth(label)), 120);
  const reservedButtonsPx = 76; // two icon slots + gaps/padding
  const widthPx = Math.min(760, Math.max(250, Math.ceil(longestLabelPx + reservedButtonsPx)));
  return { '--header-inline-menu-width': `${widthPx}px` };
};

const setFilterField = (field, value, { closeDropdown = true } = {}) => {
  if (!Object.prototype.hasOwnProperty.call(filters.value, field)) return;
  if (MULTI_FILTER_FIELDS.has(field)) {
    filters.value[field] = normalizeFilterList(value);
  } else {
    filters.value[field] = normalizeString(value);
  }

  if (closeDropdown) closeInlineDropdown();
};

const clearFilterField = (field) => {
  if (!Object.prototype.hasOwnProperty.call(filters.value, field)) return;
  if (MULTI_FILTER_FIELDS.has(field)) {
    setFilterField(field, [], { closeDropdown: false });
  } else {
    setFilterField(field, '', { closeDropdown: false });
  }
};

const toggleFilterFieldValue = (field, value) => {
  if (!Object.prototype.hasOwnProperty.call(filters.value, field)) return;

  if (!MULTI_FILTER_FIELDS.has(field)) {
    setFilterField(field, value);
    return;
  }

  const target = normalizeString(value);
  if (!target) return;

  const current = getFilterFieldValues(field);
  const next = current.includes(target)
    ? current.filter((item) => item !== target)
    : [...current, target];

  setFilterField(field, next, { closeDropdown: false });
};

const setRowDraftField = (rowId, field, value) => {
  if (!rowId || !field || !editRows.value[rowId]) return;
  editRows.value[rowId][field] = normalizeString(value);
  closeInlineDropdown();
};

const replaceFilterValue = (field, oldValue, newValue) => {
  if (!MULTI_FILTER_FIELDS.has(field)) return;
  const current = getFilterFieldValues(field);
  if (!current.includes(oldValue)) return;
  const next = current.map((item) => (item === oldValue ? newValue : item));
  setFilterField(field, next, { closeDropdown: false });
};

const removeFilterValue = (field, targetValue) => {
  if (!MULTI_FILTER_FIELDS.has(field)) return;
  const current = getFilterFieldValues(field);
  if (!current.includes(targetValue)) return;
  const next = current.filter((item) => item !== targetValue);
  setFilterField(field, next, { closeDropdown: false });
};

const syncFiltersAfterRename = ({ entityPath, oldName, newName }) => {
  const safeOld = normalizeString(oldName);
  const safeNew = normalizeString(newName);
  if (!safeOld || !safeNew || safeOld === safeNew) return;

  if (entityPath === 'categories') replaceFilterValue('category', safeOld, safeNew);
  if (entityPath === 'projects') replaceFilterValue('project', safeOld, safeNew);
  if (entityPath === 'accounts') replaceFilterValue('account', safeOld, safeNew);
  if (entityPath === 'contractors') replaceFilterValue('contractor', safeOld, safeNew);
  if (entityPath === 'companies') replaceFilterValue('owner', safeOld, safeNew);
  if (entityPath === 'individuals') {
    replaceFilterValue('owner', safeOld, safeNew);
    replaceFilterValue('contractor', safeOld, safeNew);
  }
};

const syncFiltersAfterDelete = ({ entityPath, deletedName }) => {
  const safeDeletedName = normalizeString(deletedName);
  if (!safeDeletedName) return;

  if (entityPath === 'categories') removeFilterValue('category', safeDeletedName);
  if (entityPath === 'projects') removeFilterValue('project', safeDeletedName);
  if (entityPath === 'accounts') removeFilterValue('account', safeDeletedName);
  if (entityPath === 'contractors') removeFilterValue('contractor', safeDeletedName);
  if (entityPath === 'companies') removeFilterValue('owner', safeDeletedName);
  if (entityPath === 'individuals') {
    removeFilterValue('owner', safeDeletedName);
    removeFilterValue('contractor', safeDeletedName);
  }
};

const refreshOperationLabelsFromStore = () => {
  operations.value = operations.value.map((row) => {
    const rebuilt = buildOperationRow(row.source);
    return {
      ...row,
      type: rebuilt.type,
      isTransfer: rebuilt.isTransfer,
      isWithdrawal: rebuilt.isWithdrawal,
      amount: rebuilt.amount,
      statusCode: rebuilt.statusCode,
      statusSource: rebuilt.statusSource,
      dateTs: rebuilt.dateTs,
      values: rebuilt.values
    };
  });
};

const startInlineRename = (dropdownId, option) => {
  if (!canInlineRenameOption(option)) return;
  inlineRenameState.value = {
    dropdownId,
    optionValue: String(option.value),
    entityPath: String(option.entityPath),
    entityId: String(option.entityId),
    draftName: String(option.label || ''),
    saving: false
  };

  nextTick(() => {
    inlineRenameInputRef.value?.focus?.();
    inlineRenameInputRef.value?.select?.();
  });
};

const cancelInlineRename = () => {
  resetInlineRenameState();
};

const confirmInlineRename = async () => {
  const state = inlineRenameState.value;
  if (!state.dropdownId || !state.entityPath || !state.entityId || state.saving) return;

  const list = entityListByPath(state.entityPath);
  const source = list.find((item) => extractId(item) === state.entityId);
  if (!source) {
    alert('Сущность не найдена. Обновите список.');
    cancelInlineRename();
    return;
  }

  const nextName = normalizeString(state.draftName);
  if (!nextName) {
    alert('Введите название');
    return;
  }

  const currentName = normalizeString(source.name);
  if (normalizeNameKey(nextName) === normalizeNameKey(currentName)) {
    cancelInlineRename();
    return;
  }

  const duplicate = list.find((item) =>
    extractId(item) !== state.entityId &&
    normalizeNameKey(item?.name) === normalizeNameKey(nextName)
  );

  if (duplicate) {
    alert('Такое название уже существует. Выберите существующую запись из списка.');
    return;
  }

  inlineRenameState.value = { ...state, saving: true };

  try {
    await mainStore.batchUpdateEntities(state.entityPath, [{ ...source, name: nextName }]);
    syncFiltersAfterRename({
      entityPath: state.entityPath,
      oldName: currentName,
      newName: nextName
    });
    refreshOperationLabelsFromStore();
    cancelInlineRename();
  } catch (error) {
    inlineRenameState.value = { ...state, saving: false };
    alert(`Не удалось переименовать: ${error?.message || 'Неизвестная ошибка'}`);
  }
};

const inlineDeleteMessage = computed(() => {
  const label = normalizeString(inlineDeleteState.value.label);
  if (!label) {
    return 'Удалить выбранную сущность? Связи в операциях будут сняты автоматически.';
  }
  return `Удалить «${label}»? Связи в операциях будут сняты автоматически.`;
});

const requestInlineDelete = (dropdownId, option) => {
  if (!canInlineDeleteOption(option)) return;

  inlineDeleteState.value = {
    show: true,
    dropdownId: String(dropdownId || ''),
    optionValue: String(option.value || ''),
    entityPath: String(option.entityPath || ''),
    entityId: String(option.entityId || ''),
    label: String(option.label || ''),
    deleting: false
  };
};

const requestInlineDeleteFromRename = () => {
  const state = inlineRenameState.value;
  if (!state?.dropdownId || !state?.entityPath || !state?.entityId) return;

  const list = entityListByPath(state.entityPath);
  const source = list.find((item) => extractId(item) === state.entityId);
  const label = normalizeString(source?.name || state.draftName || '');
  requestInlineDelete(state.dropdownId, {
    value: state.optionValue || state.entityId,
    entityPath: state.entityPath,
    entityId: state.entityId,
    label
  });
};

const closeInlineDeleteDialog = () => {
  if (inlineDeleteState.value.deleting) return;
  resetInlineDeleteState();
};

const confirmInlineDelete = async () => {
  const state = inlineDeleteState.value;
  if (!state.show || !state.entityPath || !state.entityId || state.deleting) return;

  inlineDeleteState.value = { ...state, deleting: true };
  try {
    await mainStore.deleteEntity(state.entityPath, state.entityId, false);
    syncFiltersAfterDelete({
      entityPath: state.entityPath,
      deletedName: state.label
    });
    resetInlineDeleteState();
    closeInlineDropdown();
    await loadOperations();
  } catch (error) {
    inlineDeleteState.value = { ...state, deleting: false };
    const backendError = normalizeString(error?.response?.data?.error || error?.response?.data?.message);
    const httpStatus = Number(error?.response?.status || 0);
    const fallback = normalizeString(error?.message) || 'Неизвестная ошибка';
    const detail = backendError || fallback;
    alert(`${httpStatus === 409 ? 'Удаление отклонено' : 'Не удалось удалить'}: ${detail}`);
  }
};

const handleInlineDropdownGlobalPointerDown = (event) => {
  const target = event?.target;
  if (target && typeof target.closest === 'function' && target.closest('.dialog-overlay')) return;
  if (target && typeof target.closest === 'function' && target.closest('.inline-entity-select')) return;
  if (target && typeof target.closest === 'function' && target.closest('.header-actions-menu')) return;
  closeHeaderActionsMenu();
  closeInlineDropdown();
};

const typeOptionsForRow = (row) => {
  if (row?.isTransfer) return ['Перевод', 'Вывод средств'];
  const base = ['Доход', 'Расход'];
  const currentType = normalizeString(editRows.value[row.rowId]?.type || row.type);
  if (currentType && !base.includes(currentType)) return [...base, currentType];
  return base;
};

const statusOptions = Object.freeze(['Исполнено', 'План']);

const typeLabelToPayload = (label) => {
  const normalized = normalizeString(label);
  if (normalized === 'Расход') return { type: 'expense', isWithdrawal: false };
  if (normalized === 'Вывод средств') return { type: 'expense', isWithdrawal: true };
  if (normalized === 'Предоплата') return { type: 'income', isWithdrawal: false };
  return { type: 'income', isWithdrawal: false };
};

const buildOperationPayload = (row, draft) => {
  const adjustedDate = normalizeDateByStatus(draft.date, draft.status);
  const fallbackDate = toDateInputValue(row?.source?.date);
  const finalDate = adjustedDate || fallbackDate || getTodayIso();
  const amount = parseAmountInput(draft.amount);
  const owner = parseOwnerKey(draft.ownerKey);
  const counterparty = parseCounterpartyKey(draft.counterpartyKey);
  const typeMeta = typeLabelToPayload(draft.type || row.type);

  return {
    date: `${finalDate}T00:00:00`,
    amount,
    type: typeMeta.type,
    accountId: normalizeString(draft.accountId) || null,
    companyId: owner.companyId || null,
    individualId: owner.individualId || null,
    contractorId: counterparty.contractorId || null,
    counterpartyIndividualId: counterparty.counterpartyIndividualId || null,
    categoryId: normalizeString(draft.categoryId) || null,
    subcategoryId: normalizeString(draft.subcategoryId) || null,
    ...projectFields(draft.projectId),
    isTransfer: false,
    isWithdrawal: typeMeta.isWithdrawal
  };
};

const buildTransferPayload = (row, draft) => {
  const adjustedDate = normalizeDateByStatus(draft.date, draft.status);
  const fallbackDate = toDateInputValue(row?.source?.date);
  const finalDate = adjustedDate || fallbackDate || getTodayIso();
  const amount = parseAmountInput(draft.amount);
  const selectedType = normalizeString(draft.type || row.type);
  const isWithdrawal = selectedType === 'Вывод средств';
  const fromOwner = parseOwnerKey(draft.fromOwnerKey);
  const toOwner = parseOwnerKey(draft.toOwnerKey);

  return {
    date: `${finalDate}T00:00:00`,
    amount,
    ...projectFields(draft.projectId),
    categoryId: normalizeString(draft.categoryId) || null,
    subcategoryId: normalizeString(draft.subcategoryId) || null,
    fromAccountId: normalizeString(draft.fromAccountId) || extractId(row?.source?.fromAccountId) || null,
    toAccountId: isWithdrawal ? null : (normalizeString(draft.toAccountId) || extractId(row?.source?.toAccountId) || null),
    fromCompanyId: fromOwner.companyId || null,
    fromIndividualId: fromOwner.individualId || null,
    toCompanyId: isWithdrawal ? null : (toOwner.companyId || null),
    toIndividualId: isWithdrawal ? null : (toOwner.individualId || null),
    transferPurpose: isWithdrawal ? 'withdrawal' : (isSystemWithdrawal(row?.source) ? 'internal' : row?.source?.transferPurpose || 'internal'),
    transferReason: isWithdrawal || isSystemWithdrawal(row?.source) ? null : (row?.source?.transferReason || null),
    description: row?.source?.description || ''
  };
};

const saveEdits = async () => {
  if (isSavingEdits.value || !isEditMode.value) return;

  isSavingEdits.value = true;
  loadError.value = '';

  try {
    const rowsToSave = operations.value.filter((row) => isRowChanged(row.rowId));

    for (const row of rowsToSave) {
      const draft = editRows.value[row.rowId];
      if (!draft || !row.operationId) continue;

      if (row.isTransfer) {
        const payload = buildTransferPayload(row, draft);
        await mainStore.updateTransfer(row.operationId, payload);
      } else {
        const payload = buildOperationPayload(row, draft);
        await mainStore.updateOperation(row.operationId, payload);
      }
    }

    await loadOperations();
    cancelEditMode();
  } catch (error) {
    loadError.value = `Не удалось сохранить изменения: ${error?.message || 'Неизвестная ошибка'}`;
  } finally {
    isSavingEdits.value = false;
  }
};

const canManageAccountVisibility = computed(() =>
  !mainStore.workspaceRole || mainStore.isWorkspaceOwner || mainStore.isWorkspaceAdmin
);
const visibilityMode = computed(() => mainStore.accountVisibilityMode);
const showOpenActive = computed(() => visibilityMode.value === 'all' || visibilityMode.value === 'open');
const showHiddenActive = computed(() => visibilityMode.value === 'all' || visibilityMode.value === 'hidden');
const openEyeIcon = computed(() => (showOpenActive.value ? 'eye' : 'eye-off'));
const hiddenEyeIcon = computed(() => (showHiddenActive.value ? 'eye' : 'eye-off'));
const accountExcludedById = computed(() => {
  const map = new Map();
  (Array.isArray(mainStore.accounts) ? mainStore.accounts : []).forEach((acc) => {
    const id = extractId(acc);
    if (!id) return;
    map.set(id, !!acc?.isExcluded);
  });
  return map;
});

const isRowVisibleByAccountMode = (row) => {
  const mode = String(visibilityMode.value || 'all');
  if (mode === 'all') return true;
  if (mode === 'none') return false;

  const op = row?.source || {};
  const accountFlags = [];
  const pushFlag = (accountRef) => {
    const id = extractId(accountRef);
    if (!id || !accountExcludedById.value.has(id)) return;
    accountFlags.push(Boolean(accountExcludedById.value.get(id)));
  };

  pushFlag(op.accountId);
  pushFlag(op.fromAccountId);
  pushFlag(op.toAccountId);
  pushFlag(op.account);

  if (accountFlags.length === 0) return true;
  if (mode === 'open') return accountFlags.every((isExcluded) => !isExcluded);
  if (mode === 'hidden') return accountFlags.every((isExcluded) => isExcluded);
  return true;
};

const filteredOperations = computed(() => {
  const fromTs = filters.value.dateFrom
    ? new Date(`${filters.value.dateFrom}T00:00:00`).getTime()
    : null;
  const toTs = filters.value.dateTo
    ? new Date(`${filters.value.dateTo}T23:59:59.999`).getTime()
    : null;
  const typeFilter = getFilterFieldValues('type');
  const categoryFilter = getFilterFieldValues('category');
  const subcategoryFilter = getFilterFieldValues('subcategory');
  const projectFilter = getFilterFieldValues('project');
  const accountFilter = getFilterFieldValues('account');
  const contractorFilter = getFilterFieldValues('contractor');
  const ownerFilter = getFilterFieldValues('owner');
  const statusFilter = getFilterFieldValues('status');

  return operations.value.filter((row) => {
    if (!isRowVisibleByAccountMode(row)) return false;

    if (fromTs !== null && (row.dateTs === null || row.dateTs < fromTs)) return false;
    if (toTs !== null && (row.dateTs === null || row.dateTs > toTs)) return false;
    if (typeFilter.length > 0 && !typeFilter.includes(row.values['Тип'])) return false;
    if (categoryFilter.length > 0 && !categoryFilter.includes(row.values['Категория'])) return false;
    if (subcategoryFilter.length && !subcategoryFilter.includes(row.values['Подкатегория'])) return false;
    if (projectFilter.length > 0 && !projectFilter.includes(row.values['Проект'])) return false;
    if (accountFilter.length > 0) {
      const rowAccountTokens = Array.isArray(row.accountFilterTokens) ? row.accountFilterTokens : [];
      if (!accountFilter.some((value) => rowAccountTokens.includes(value))) return false;
    }
    if (contractorFilter.length > 0 && !contractorFilter.includes(row.values['Контрагент'])) return false;
    if (ownerFilter.length > 0 && !ownerFilter.includes(row.values['Компания/Физлицо'])) return false;
    if (statusFilter.length > 0 && !statusFilter.includes(row.values['Статус'])) return false;

    return true;
  });
});

const hasDirtyEdits = computed(() => {
  if (!isEditMode.value) return false;
  return operations.value.some((row) => isRowChanged(row.rowId));
});

const filteredCount = computed(() => filteredOperations.value.length);
const totalCount = computed(() => operations.value.length);
const summaryTotals = computed(() => {
  const totals = {
    income: 0,
    expense: 0,
    transfer: 0
  };

  filteredOperations.value.forEach((row) => {
    const amount = Math.abs(Number(row.amount) || 0);

    if (row.type === 'Доход') {
      totals.income += amount;
    } else if (row.type === 'Расход') {
      totals.expense += amount;
    } else if (row.type === 'Перевод' || row.type === 'Вывод средств') {
      totals.transfer += amount;
    }
  });

  return totals;
});

const getAmountClass = (row) => {
  if (row.type === 'Доход') return 'amount-income';
  if (row.type === 'Расход') return 'amount-expense';
  if (row.type === 'Вывод средств') return 'amount-withdrawal';
  if (row.type === 'Предоплата') return 'amount-prepayment';
  if (row.type === 'Перевод') return 'amount-transfer';
  return '';
};

const exportToCSV = () => {
  if (filteredOperations.value.length === 0) {
    alert('Нет данных для экспорта');
    return;
  }

  const escapeCsvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = filteredOperations.value.map((row) =>
    TABLE_COLUMNS.map((column) => row.values[column] ?? '')
  );

  const csvContent = [
    TABLE_COLUMNS.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().split('T')[0];

  link.setAttribute('href', url);
  link.setAttribute('download', `operations_${dateStr}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const copyToClipboard = async () => {
  if (filteredOperations.value.length === 0) {
    alert('Нет данных для копирования');
    return;
  }

  const lines = [
    `Операции: ${filteredCount.value} / ${totalCount.value}`,
    `Доход: ${formatSummaryAmount(summaryTotals.value.income)}`,
    `Расход: ${formatSummaryAmount(summaryTotals.value.expense)}`,
    `Перевод: ${formatSummaryAmount(summaryTotals.value.transfer)}`,
    '────────────────────'
  ];

  filteredOperations.value.forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.values['Дата']} | ${row.values['Тип']} | ${row.values['Сумма']} | ${row.values['Счет']} | ${row.values['Контрагент']} | ${row.values['Компания/Физлицо']} | ${row.values['Категория']} | ${row.values['Проект']} | ${row.values['Статус']}`
    );
  });

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    showCopySuccess.value = true;
    setTimeout(() => {
      showCopySuccess.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Ошибка копирования в буфер обмена');
  }
};

const closeHeaderActionsMenu = () => {
  showHeaderActionsMenu.value = false;
};

const toggleHeaderActionsMenu = () => {
  showHeaderActionsMenu.value = !showHeaderActionsMenu.value;
};

const handleExportToCSV = () => {
  closeHeaderActionsMenu();
  exportToCSV();
};

const handleCopyToClipboard = async () => {
  closeHeaderActionsMenu();
  await copyToClipboard();
};

const handleToggleEditMode = () => {
  closeHeaderActionsMenu();
  toggleEditMode();
};

const toggleChartsPane = () => {
  isChartsPaneCollapsed.value = !isChartsPaneCollapsed.value;
};

const MIN_CHARTS_PANE_WIDTH = 18;
const MAX_CHARTS_PANE_WIDTH = 60;

const clampChartsPaneWidth = (value) => Math.min(MAX_CHARTS_PANE_WIDTH, Math.max(MIN_CHARTS_PANE_WIDTH, value));

const stopChartsPaneResize = () => {
  if (!isResizingChartsPane.value) return;
  isResizingChartsPane.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  window.removeEventListener('pointermove', onChartsPaneResizeMove);
  window.removeEventListener('pointerup', stopChartsPaneResize);
  window.removeEventListener('pointercancel', stopChartsPaneResize);
};

const onChartsPaneResizeMove = (event) => {
  if (!isResizingChartsPane.value || isChartsPaneCollapsed.value) return;
  const container = modalBodyRef.value;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  if (!rect.width) return;

  const widthPercent = ((rect.right - event.clientX) / rect.width) * 100;
  chartsPaneWidth.value = clampChartsPaneWidth(widthPercent);
};

const startChartsPaneResize = (event) => {
  if (isChartsPaneCollapsed.value) return;
  event.preventDefault();
  isResizingChartsPane.value = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', onChartsPaneResizeMove);
  window.addEventListener('pointerup', stopChartsPaneResize);
  window.addEventListener('pointercancel', stopChartsPaneResize);
};

onMounted(() => {
  document.body.style.overflow = 'hidden';
  document.addEventListener('pointerdown', handleInlineDropdownGlobalPointerDown);
  loadOperations();

});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleInlineDropdownGlobalPointerDown);
  closeInlineDropdown();
  stopChartsPaneResize();

  document.body.style.overflow = '';
});
</script>

<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="editor-modal operations-editor-modal">
      <div
        class="modal-header"
        :class="{ 'charts-collapsed': isChartsPaneCollapsed }"
        :style="{ '--charts-pane-width': `${chartsPaneWidth}%` }"
      >
        <div class="modal-header-main">
          <h3 class="modal-header-title">Журнал</h3>

          <div class="header-actions">
            <div class="summary-line">
              <span class="summary-item income header-hover-tip" data-tooltip="Доход">{{ formatSummaryAmount(summaryTotals.income) }}</span>
              <span class="summary-item expense header-hover-tip" data-tooltip="Расход">{{ formatSummaryAmount(summaryTotals.expense) }}</span>
              <span class="summary-item transfer header-hover-tip" data-tooltip="Перевод">{{ formatSummaryAmount(summaryTotals.transfer) }}</span>
            </div>
            <span class="counter-label header-hover-tip" data-tooltip="Всего операций за выбранный период">{{ filteredCount }} / {{ totalCount }}</span>
            <div class="header-actions-menu">
              <button
                class="header-menu-btn"
                :class="{ active: showHeaderActionsMenu }"
                @click.stop="toggleHeaderActionsMenu"
                title="Меню"
                aria-label="Меню"
                :aria-expanded="showHeaderActionsMenu ? 'true' : 'false'"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 7h16"></path>
                  <path d="M7 12h10"></path>
                  <path d="M10 17h4"></path>
                </svg>
                <span>Меню</span>
                <svg class="menu-trigger-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div v-if="showHeaderActionsMenu" class="header-actions-dropdown" @click.stop>
                <button class="header-actions-item" @click="handleExportToCSV">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  <span>CSV</span>
                </button>
                <button class="header-actions-item" @click="handleCopyToClipboard">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span>Копировать</span>
                </button>
                <button
                  class="header-actions-item"
                  :class="{ active: isEditMode }"
                  :disabled="isSavingEdits"
                  @click="handleToggleEditMode"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                  </svg>
                  <span>{{ isEditMode ? 'Завершить редакт.' : 'Редактировать' }}</span>
                </button>
              </div>
              <transition name="fade">
                <div v-if="showCopySuccess" class="copy-success">✓ Скопировано!</div>
              </transition>
            </div>
            <button
              v-if="isEditMode"
              class="save-edit-btn"
              :disabled="isSavingEdits || !hasDirtyEdits"
              @click="saveEdits"
            >
              {{ isSavingEdits ? 'Сохранение...' : 'Сохранить' }}
            </button>
            <div v-if="canManageAccountVisibility" class="header-visibility-toggle" aria-label="Показ счетов">
              <button
                class="header-eye-btn icon-only header-hover-tip"
                @click="mainStore.toggleOpenVisibility()"
                :class="{ active: showOpenActive }"
                :data-tooltip="showOpenActive ? 'Отключить открытые счета' : 'Включить открытые счета'"
              >
                <svg v-if="openEyeIcon === 'eye'" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
                  <line x1="2" y1="22" x2="22" y2="2"></line>
                </svg>
              </button>
              <button
                class="header-eye-btn icon-only header-hover-tip"
                @click="mainStore.toggleHiddenVisibility()"
                :class="{ active: showHiddenActive }"
                :data-tooltip="showHiddenActive ? 'Отключить скрытые счета' : 'Включить скрытые счета'"
              >
                <svg v-if="hiddenEyeIcon === 'eye'" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
                  <line x1="2" y1="22" x2="22" y2="2"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="modal-header-charts">
          <span class="sidebar-panel-title">Графики</span>
          <button class="close-btn modal-close-btn" @click="closeModal" aria-label="Закрыть">&times;</button>
        </div>
      </div>

      <button
        v-if="isChartsPaneCollapsed"
        class="close-btn modal-close-floating"
        @click="closeModal"
        aria-label="Закрыть"
      >
        &times;
      </button>

      <div
        class="modal-body"
        ref="modalBodyRef"
        :class="{ 'charts-collapsed': isChartsPaneCollapsed, 'charts-resizing': isResizingChartsPane }"
        :style="{ '--charts-pane-width': `${chartsPaneWidth}%` }"
      >
        <section class="operations-pane">
          <div v-if="loadError" class="status-row">
            <span class="status-text error">{{ loadError }}</span>
          </div>

          <div class="table-wrap">
            <table class="settings-table operations-table">
              <colgroup>
                <col class="col-date" />
                <col class="col-type" />
                <col class="col-category" />
                <col class="col-subcategory" />
                <col class="col-project" />
                <col class="col-amount" />
                <col class="col-account" />
                <col class="col-contractor" />
                <col class="col-owner" />
                <col class="col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    <DateRangePicker
                      v-model="dateRangeFilter"
                      placeholder="Дата"
                      class="header-date-filter"
                    />
                  </th>

                  <th>
                    <div class="inline-entity-select header-inline-select">
                      <button
                        type="button"
                        class="inline-select-trigger header-filter-control"
                        @click.stop="toggleInlineDropdown('filter-type')"
                      >
                        <span class="inline-select-trigger-text">
                          {{ getFilterTriggerLabel('type', typeFilterOptions, 'Тип') }}
                        </span>
                        <span class="inline-select-trigger-arrow">▾</span>
                      </button>
                      <div
                        v-if="isInlineDropdownOpen('filter-type')"
                        class="inline-select-menu"
                        :style="getHeaderMenuStyle(typeFilterOptions)"
                        @click.stop
                      >
                        <div class="inline-select-search-row">
                          <input
                            :value="getInlineSearchValue('filter-type')"
                            class="inline-select-search-input"
                            type="text"
                            placeholder="Поиск..."
                            @input="setInlineSearchValue('filter-type', $event.target.value)"
                            @keydown.stop
                          />
                        </div>
                        <button type="button" class="inline-select-option inline-select-meta-option" @click="clearFilterField('type')">
                          Все
                        </button>
                        <div v-for="opt in getFilteredInlineOptions('filter-type', typeFilterOptions)" :key="`filter-type-${opt.value}`" class="inline-select-row">
                          <button
                            type="button"
                            class="inline-select-option"
                            :class="{ selected: isFilterOptionSelected('type', opt.value) }"
                            @click="toggleFilterFieldValue('type', opt.value)"
                          >
                            {{ opt.label }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </th>

                  <th>
                    <div class="inline-entity-select header-inline-select">
                      <button
                        type="button"
                        class="inline-select-trigger header-filter-control"
                        @click.stop="toggleInlineDropdown('filter-category')"
                      >
                        <span class="inline-select-trigger-text">
                          {{ getFilterTriggerLabel('category', categoryFilterOptions, 'Категория') }}
                        </span>
                        <span class="inline-select-trigger-arrow">▾</span>
                      </button>
                      <div
                        v-if="isInlineDropdownOpen('filter-category')"
                        class="inline-select-menu"
                        :style="getHeaderMenuStyle(categoryFilterOptions)"
                        @click.stop
                      >
                        <div class="inline-select-search-row">
                          <input
                            :value="getInlineSearchValue('filter-category')"
                            class="inline-select-search-input"
                            type="text"
                            placeholder="Поиск..."
                            @input="setInlineSearchValue('filter-category', $event.target.value)"
                            @keydown.stop
                          />
                        </div>
                        <button type="button" class="inline-select-option inline-select-meta-option" @click="clearFilterField('category')">
                          Все
                        </button>
                        <div v-for="opt in getFilteredInlineOptions('filter-category', categoryFilterOptions)" :key="`filter-category-${opt.value}`" class="inline-select-row">
                          <template v-if="isInlineRenameActive('filter-category', opt.value)">
                            <input
                              ref="inlineRenameInputRef"
                              v-model="inlineRenameState.draftName"
                              class="inline-rename-input"
                              type="text"
                              @keydown.enter.prevent="confirmInlineRename"
                              @keydown.esc.prevent="cancelInlineRename"
                            />
                            <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                            <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                          </template>
                          <template v-else>
                            <button
                              type="button"
                              class="inline-select-option"
                              :class="{ selected: isFilterOptionSelected('category', opt.value) }"
                              @click="toggleFilterFieldValue('category', opt.value)"
                            >
                              {{ opt.label }}
                            </button>
                            <button
                              type="button"
                              class="inline-icon-btn rename"
                              v-if="canInlineRenameOption(opt)"
                              @click.stop="startInlineRename('filter-category', opt)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 20h9"></path>
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="inline-icon-btn delete"
                              :disabled="!canInlineDeleteOption(opt)"
                              @click.stop="requestInlineDelete('filter-category', opt)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </template>
                        </div>
                      </div>
                    </div>
                  </th>
                  <th>
                    <select class="filter-input" aria-label="Фильтр по подкатегории" :value="getFilterFieldValues('subcategory')[0] || ''" @change="setFilterField('subcategory', $event.target.value ? [$event.target.value] : [])">
                      <option value="">Подкатегория</option>
                      <option v-for="label in filterOptions.subcategory" :key="label" :value="label">{{ label }}</option>
                    </select>
                  </th>

                  <th>
                    <div class="inline-entity-select header-inline-select">
                      <button
                        type="button"
                        class="inline-select-trigger header-filter-control"
                        @click.stop="toggleInlineDropdown('filter-project')"
                      >
                        <span class="inline-select-trigger-text">
                          {{ getFilterTriggerLabel('project', projectFilterOptions, 'Проект') }}
                        </span>
                        <span class="inline-select-trigger-arrow">▾</span>
                      </button>
                      <div
                        v-if="isInlineDropdownOpen('filter-project')"
                        class="inline-select-menu"
                        :style="getHeaderMenuStyle(projectFilterOptions)"
                        @click.stop
                      >
                        <div class="inline-select-search-row">
                          <input
                            :value="getInlineSearchValue('filter-project')"
                            class="inline-select-search-input"
                            type="text"
                            placeholder="Поиск..."
                            @input="setInlineSearchValue('filter-project', $event.target.value)"
                            @keydown.stop
                          />
                        </div>
                        <button type="button" class="inline-select-option inline-select-meta-option" @click="clearFilterField('project')">
                          Все
                        </button>
                        <div v-for="opt in getFilteredInlineOptions('filter-project', projectFilterOptions)" :key="`filter-project-${opt.value}`" class="inline-select-row">
                          <template v-if="isInlineRenameActive('filter-project', opt.value)">
                            <input
                              ref="inlineRenameInputRef"
                              v-model="inlineRenameState.draftName"
                              class="inline-rename-input"
                              type="text"
                              @keydown.enter.prevent="confirmInlineRename"
                              @keydown.esc.prevent="cancelInlineRename"
                            />
                            <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                            <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                          </template>
                          <template v-else>
                            <button
                              type="button"
                              class="inline-select-option"
                              :class="{ selected: isFilterOptionSelected('project', opt.value) }"
                              @click="toggleFilterFieldValue('project', opt.value)"
                            >
                              {{ opt.label }}
                            </button>
                            <button
                              type="button"
                              class="inline-icon-btn rename"
                              v-if="canInlineRenameOption(opt)"
                              @click.stop="startInlineRename('filter-project', opt)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 20h9"></path>
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="inline-icon-btn delete"
                              :disabled="!canInlineDeleteOption(opt)"
                              @click.stop="requestInlineDelete('filter-project', opt)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </template>
                        </div>
                      </div>
                    </div>
                  </th>

                  <th class="align-right">
                    <span class="header-static">Сумма</span>
                  </th>

                  <th>
                    <div class="inline-entity-select header-inline-select">
                      <button
                        type="button"
                        class="inline-select-trigger header-filter-control"
                        @click.stop="toggleInlineDropdown('filter-account')"
                      >
                        <span class="inline-select-trigger-text">
                          {{ getFilterTriggerLabel('account', accountFilterOptions, 'Счет') }}
                        </span>
                        <span class="inline-select-trigger-arrow">▾</span>
                      </button>
                      <div
                        v-if="isInlineDropdownOpen('filter-account')"
                        class="inline-select-menu"
                        :style="getHeaderMenuStyle(accountFilterOptions)"
                        @click.stop
                      >
                        <div class="inline-select-search-row">
                          <input
                            :value="getInlineSearchValue('filter-account')"
                            class="inline-select-search-input"
                            type="text"
                            placeholder="Поиск..."
                            @input="setInlineSearchValue('filter-account', $event.target.value)"
                            @keydown.stop
                          />
                        </div>
                        <button type="button" class="inline-select-option inline-select-meta-option" @click="clearFilterField('account')">
                          Все
                        </button>
                        <div v-for="opt in getFilteredInlineOptions('filter-account', accountFilterOptions)" :key="`filter-account-${opt.value}`" class="inline-select-row">
                          <template v-if="isInlineRenameActive('filter-account', opt.value)">
                            <input
                              ref="inlineRenameInputRef"
                              v-model="inlineRenameState.draftName"
                              class="inline-rename-input"
                              type="text"
                              @keydown.enter.prevent="confirmInlineRename"
                              @keydown.esc.prevent="cancelInlineRename"
                            />
                            <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                            <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                          </template>
                          <template v-else>
                            <button
                              type="button"
                              class="inline-select-option"
                              :class="{ selected: isFilterOptionSelected('account', opt.value) }"
                              @click="toggleFilterFieldValue('account', opt.value)"
                            >
                              {{ opt.label }}
                            </button>
                            <button
                              type="button"
                              class="inline-icon-btn rename"
                              v-if="canInlineRenameOption(opt)"
                              @click.stop="startInlineRename('filter-account', opt)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 20h9"></path>
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="inline-icon-btn delete"
                              :disabled="!canInlineDeleteOption(opt)"
                              @click.stop="requestInlineDelete('filter-account', opt)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </template>
                        </div>
                      </div>
                    </div>
                  </th>

                  <th>
                    <div class="inline-entity-select header-inline-select">
                      <button
                        type="button"
                        class="inline-select-trigger header-filter-control"
                        @click.stop="toggleInlineDropdown('filter-contractor')"
                      >
                        <span class="inline-select-trigger-text">
                          {{ getFilterTriggerLabel('contractor', contractorFilterOptions, 'Контрагент') }}
                        </span>
                        <span class="inline-select-trigger-arrow">▾</span>
                      </button>
                      <div
                        v-if="isInlineDropdownOpen('filter-contractor')"
                        class="inline-select-menu"
                        :style="getHeaderMenuStyle(contractorFilterOptions)"
                        @click.stop
                      >
                        <div class="inline-select-search-row">
                          <input
                            :value="getInlineSearchValue('filter-contractor')"
                            class="inline-select-search-input"
                            type="text"
                            placeholder="Поиск..."
                            @input="setInlineSearchValue('filter-contractor', $event.target.value)"
                            @keydown.stop
                          />
                        </div>
                        <button type="button" class="inline-select-option inline-select-meta-option" @click="clearFilterField('contractor')">
                          Все
                        </button>
                        <div v-for="opt in getFilteredInlineOptions('filter-contractor', contractorFilterOptions)" :key="`filter-contractor-${opt.value}`" class="inline-select-row">
                          <template v-if="isInlineRenameActive('filter-contractor', opt.value)">
                            <input
                              ref="inlineRenameInputRef"
                              v-model="inlineRenameState.draftName"
                              class="inline-rename-input"
                              type="text"
                              @keydown.enter.prevent="confirmInlineRename"
                              @keydown.esc.prevent="cancelInlineRename"
                            />
                            <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                            <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                          </template>
                          <template v-else>
                            <button
                              type="button"
                              class="inline-select-option"
                              :class="{ selected: isFilterOptionSelected('contractor', opt.value) }"
                              @click="toggleFilterFieldValue('contractor', opt.value)"
                            >
                              {{ opt.label }}
                            </button>
                            <button
                              type="button"
                              class="inline-icon-btn rename"
                              v-if="canInlineRenameOption(opt)"
                              @click.stop="startInlineRename('filter-contractor', opt)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 20h9"></path>
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="inline-icon-btn delete"
                              :disabled="!canInlineDeleteOption(opt)"
                              @click.stop="requestInlineDelete('filter-contractor', opt)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </template>
                        </div>
                      </div>
                    </div>
                  </th>

                  <th>
                    <div class="inline-entity-select header-inline-select">
                      <button
                        type="button"
                        class="inline-select-trigger header-filter-control"
                        @click.stop="toggleInlineDropdown('filter-owner')"
                      >
                        <span class="inline-select-trigger-text">
                          {{ getFilterTriggerLabel('owner', ownerFilterOptions, 'Компания/Физлицо') }}
                        </span>
                        <span class="inline-select-trigger-arrow">▾</span>
                      </button>
                      <div
                        v-if="isInlineDropdownOpen('filter-owner')"
                        class="inline-select-menu"
                        :style="getHeaderMenuStyle(ownerFilterOptions)"
                        @click.stop
                      >
                        <div class="inline-select-search-row">
                          <input
                            :value="getInlineSearchValue('filter-owner')"
                            class="inline-select-search-input"
                            type="text"
                            placeholder="Поиск..."
                            @input="setInlineSearchValue('filter-owner', $event.target.value)"
                            @keydown.stop
                          />
                        </div>
                        <button type="button" class="inline-select-option inline-select-meta-option" @click="clearFilterField('owner')">
                          Все
                        </button>
                        <div v-for="opt in getFilteredInlineOptions('filter-owner', ownerFilterOptions)" :key="`filter-owner-${opt.value}`" class="inline-select-row">
                          <template v-if="isInlineRenameActive('filter-owner', opt.value)">
                            <input
                              ref="inlineRenameInputRef"
                              v-model="inlineRenameState.draftName"
                              class="inline-rename-input"
                              type="text"
                              @keydown.enter.prevent="confirmInlineRename"
                              @keydown.esc.prevent="cancelInlineRename"
                            />
                            <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                            <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                          </template>
                          <template v-else>
                            <button
                              type="button"
                              class="inline-select-option"
                              :class="{ selected: isFilterOptionSelected('owner', opt.value) }"
                              @click="toggleFilterFieldValue('owner', opt.value)"
                            >
                              {{ opt.label }}
                            </button>
                            <button
                              type="button"
                              class="inline-icon-btn rename"
                              v-if="canInlineRenameOption(opt)"
                              @click.stop="startInlineRename('filter-owner', opt)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 20h9"></path>
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="inline-icon-btn delete"
                              :disabled="!canInlineDeleteOption(opt)"
                              @click.stop="requestInlineDelete('filter-owner', opt)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </template>
                        </div>
                      </div>
                    </div>
                  </th>

                  <th>
                    <div class="inline-entity-select header-inline-select">
                      <button
                        type="button"
                        class="inline-select-trigger header-filter-control"
                        @click.stop="toggleInlineDropdown('filter-status')"
                      >
                        <span class="inline-select-trigger-text">
                          {{ getFilterTriggerLabel('status', statusFilterOptions, 'Статус') }}
                        </span>
                        <span class="inline-select-trigger-arrow">▾</span>
                      </button>
                      <div
                        v-if="isInlineDropdownOpen('filter-status')"
                        class="inline-select-menu"
                        :style="getHeaderMenuStyle(statusFilterOptions)"
                        @click.stop
                      >
                        <div class="inline-select-search-row">
                          <input
                            :value="getInlineSearchValue('filter-status')"
                            class="inline-select-search-input"
                            type="text"
                            placeholder="Поиск..."
                            @input="setInlineSearchValue('filter-status', $event.target.value)"
                            @keydown.stop
                          />
                        </div>
                        <button type="button" class="inline-select-option inline-select-meta-option" @click="clearFilterField('status')">
                          Все
                        </button>
                        <div v-for="opt in getFilteredInlineOptions('filter-status', statusFilterOptions)" :key="`filter-status-${opt.value}`" class="inline-select-row">
                          <button
                            type="button"
                            class="inline-select-option"
                            :class="{ selected: isFilterOptionSelected('status', opt.value) }"
                            @click="toggleFilterFieldValue('status', opt.value)"
                          >
                            {{ opt.label }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody>
                <tr v-if="isLoading" class="placeholder-row">
                  <td :colspan="TABLE_COLUMNS.length">Загрузка операций...</td>
                </tr>

                <tr v-else-if="operations.length === 0" class="placeholder-row">
                  <td :colspan="TABLE_COLUMNS.length">Нет операций</td>
                </tr>

                <tr v-else-if="filteredOperations.length === 0" class="placeholder-row">
                  <td :colspan="TABLE_COLUMNS.length">По фильтрам ничего не найдено</td>
                </tr>

                <tr v-for="row in filteredOperations" :key="row.rowId">
                  <td
                    v-for="column in TABLE_COLUMNS"
                    :key="`${row.rowId}-${column}`"
                    :class="[
                      column === 'Сумма' ? 'align-right amount-cell' : '',
                      column === 'Сумма' ? getAmountClass(row) : ''
                    ]"
                  >
                    <template v-if="isEditMode && editRows[row.rowId]">
                      <template v-if="column === 'Дата'">
                        <input v-model="editRows[row.rowId].date" type="date" class="cell-edit-control" />
                      </template>

                      <template v-else-if="column === 'Тип'">
                        <select v-model="editRows[row.rowId].type" class="cell-edit-control has-arrow">
                          <option v-for="typeOption in typeOptionsForRow(row)" :key="`${row.rowId}-${typeOption}`" :value="typeOption">
                            {{ typeOption }}
                          </option>
                        </select>
                      </template>

                      <template v-else-if="column === 'Категория'">
                        <div class="inline-entity-select cell-inline-select">
                          <button
                            type="button"
                            class="inline-select-trigger cell-edit-control"
                            @click.stop="toggleInlineDropdown(`row-${row.rowId}-category`)"
                          >
                            <span class="inline-select-trigger-text">
                              {{ getInlineSelectedLabel(editRows[row.rowId].categoryId, categoryOptions, 'Без категории') }}
                            </span>
                            <span class="inline-select-trigger-arrow">▾</span>
                          </button>
                          <div v-if="isInlineDropdownOpen(`row-${row.rowId}-category`)" class="inline-select-menu" @click.stop>
                            <div class="inline-select-search-row">
                              <input
                                :value="getInlineSearchValue(`row-${row.rowId}-category`)"
                                class="inline-select-search-input"
                                type="text"
                                placeholder="Поиск..."
                                @input="setInlineSearchValue(`row-${row.rowId}-category`, $event.target.value)"
                                @keydown.stop
                              />
                            </div>
                            <button
                              type="button"
                              class="inline-select-option inline-select-meta-option"
                              @click="setRowDraftField(row.rowId, 'categoryId', '')"
                            >
                              Без категории
                            </button>
                            <div
                              v-for="opt in getFilteredInlineOptions(`row-${row.rowId}-category`, categoryOptions)"
                              :key="`${row.rowId}-category-opt-${opt.value}`"
                              class="inline-select-row"
                            >
                              <template v-if="isInlineRenameActive(`row-${row.rowId}-category`, opt.value)">
                                <input
                                  ref="inlineRenameInputRef"
                                  v-model="inlineRenameState.draftName"
                                  class="inline-rename-input"
                                  type="text"
                                  @keydown.enter.prevent="confirmInlineRename"
                                  @keydown.esc.prevent="cancelInlineRename"
                                />
                                <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                                <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                              </template>
                              <template v-else>
                                <button
                                  type="button"
                                  class="inline-select-option"
                                  :class="{ selected: editRows[row.rowId].categoryId === opt.value }"
                                  @click="setRowDraftField(row.rowId, 'categoryId', opt.value)"
                                >
                                  {{ opt.label }}
                                </button>
                                <button
                                  type="button"
                                  class="inline-icon-btn rename"
                                  v-if="canInlineRenameOption(opt)"
                                  @click.stop="startInlineRename(`row-${row.rowId}-category`, opt)"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  class="inline-icon-btn delete"
                                  :disabled="!canInlineDeleteOption(opt)"
                                  @click.stop="requestInlineDelete(`row-${row.rowId}-category`, opt)"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              </template>
                            </div>
                          </div>
                        </div>
                      </template>

                      <template v-else-if="column === 'Подкатегория'">
                        <SubcategorySelect v-model="editRows[row.rowId].subcategoryId" :category-ids="[editRows[row.rowId].categoryId]" />
                      </template>

                      <template v-else-if="column === 'Проект'">
                        <div class="inline-entity-select cell-inline-select">
                          <button
                            type="button"
                            class="inline-select-trigger cell-edit-control"
                            @click.stop="toggleInlineDropdown(`row-${row.rowId}-project`)"
                          >
                            <span class="inline-select-trigger-text">
                              {{ getInlineSelectedLabel(editRows[row.rowId].projectId, projectOptions, 'Без проекта') }}
                            </span>
                            <span class="inline-select-trigger-arrow">▾</span>
                          </button>
                          <div v-if="isInlineDropdownOpen(`row-${row.rowId}-project`)" class="inline-select-menu" @click.stop>
                            <div class="inline-select-search-row">
                              <input
                                :value="getInlineSearchValue(`row-${row.rowId}-project`)"
                                class="inline-select-search-input"
                                type="text"
                                placeholder="Поиск..."
                                @input="setInlineSearchValue(`row-${row.rowId}-project`, $event.target.value)"
                                @keydown.stop
                              />
                            </div>
                            <button
                              type="button"
                              class="inline-select-option inline-select-meta-option"
                              @click="setRowDraftField(row.rowId, 'projectId', '')"
                            >
                              Без проекта
                            </button>
                            <div
                              v-for="opt in getFilteredInlineOptions(`row-${row.rowId}-project`, projectOptions)"
                              :key="`${row.rowId}-project-opt-${opt.value}`"
                              class="inline-select-row"
                            >
                              <template v-if="isInlineRenameActive(`row-${row.rowId}-project`, opt.value)">
                                <input
                                  ref="inlineRenameInputRef"
                                  v-model="inlineRenameState.draftName"
                                  class="inline-rename-input"
                                  type="text"
                                  @keydown.enter.prevent="confirmInlineRename"
                                  @keydown.esc.prevent="cancelInlineRename"
                                />
                                <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                                <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                              </template>
                              <template v-else>
                                <button
                                  type="button"
                                  class="inline-select-option"
                                  :class="{ selected: editRows[row.rowId].projectId === opt.value }"
                                  @click="setRowDraftField(row.rowId, 'projectId', opt.value)"
                                >
                                  {{ opt.label }}
                                </button>
                                <button
                                  type="button"
                                  class="inline-icon-btn rename"
                                  v-if="canInlineRenameOption(opt)"
                                  @click.stop="startInlineRename(`row-${row.rowId}-project`, opt)"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  class="inline-icon-btn delete"
                                  :disabled="!canInlineDeleteOption(opt)"
                                  @click.stop="requestInlineDelete(`row-${row.rowId}-project`, opt)"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              </template>
                            </div>
                          </div>
                        </div>
                      </template>

                      <template v-else-if="column === 'Сумма'">
                        <input
                          v-model="editRows[row.rowId].amount"
                          type="text"
                          inputmode="decimal"
                          class="cell-edit-control align-right"
                          placeholder="0"
                        />
                      </template>

                      <template v-else-if="column === 'Счет'">
                        <div v-if="row.isTransfer" class="cell-dual-control">
                          <div class="inline-entity-select cell-inline-select">
                            <button
                              type="button"
                              class="inline-select-trigger cell-edit-control"
                              @click.stop="toggleInlineDropdown(`row-${row.rowId}-from-account`)"
                            >
                              <span class="inline-select-trigger-text">
                                {{ getInlineSelectedLabel(editRows[row.rowId].fromAccountId, accountOptions, 'Откуда') }}
                              </span>
                              <span class="inline-select-trigger-arrow">▾</span>
                            </button>
                            <div v-if="isInlineDropdownOpen(`row-${row.rowId}-from-account`)" class="inline-select-menu" @click.stop>
                              <div class="inline-select-search-row">
                                <input
                                  :value="getInlineSearchValue(`row-${row.rowId}-from-account`)"
                                  class="inline-select-search-input"
                                  type="text"
                                  placeholder="Поиск..."
                                  @input="setInlineSearchValue(`row-${row.rowId}-from-account`, $event.target.value)"
                                  @keydown.stop
                                />
                              </div>
                              <button
                                type="button"
                                class="inline-select-option inline-select-meta-option"
                                @click="setRowDraftField(row.rowId, 'fromAccountId', '')"
                              >
                                Откуда
                              </button>
                              <div
                                v-for="acc in getFilteredInlineOptions(`row-${row.rowId}-from-account`, accountOptions)"
                                :key="`${row.rowId}-from-${acc.value}`"
                                class="inline-select-row"
                              >
                                <template v-if="isInlineRenameActive(`row-${row.rowId}-from-account`, acc.value)">
                                  <input
                                    ref="inlineRenameInputRef"
                                    v-model="inlineRenameState.draftName"
                                    class="inline-rename-input"
                                    type="text"
                                    @keydown.enter.prevent="confirmInlineRename"
                                    @keydown.esc.prevent="cancelInlineRename"
                                  />
                                  <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                                  <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                                </template>
                                <template v-else>
                                  <button
                                    type="button"
                                    class="inline-select-option"
                                    :class="{ selected: editRows[row.rowId].fromAccountId === acc.value }"
                                    @click="setRowDraftField(row.rowId, 'fromAccountId', acc.value)"
                                  >
                                    {{ acc.label }}
                                  </button>
                                  <button
                                    type="button"
                                    class="inline-icon-btn rename"
                                    v-if="canInlineRenameOption(acc)"
                                    @click.stop="startInlineRename(`row-${row.rowId}-from-account`, acc)"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                      <path d="M12 20h9"></path>
                                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    class="inline-icon-btn delete"
                                    :disabled="!canInlineDeleteOption(acc)"
                                    @click.stop="requestInlineDelete(`row-${row.rowId}-from-account`, acc)"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                      <polyline points="3 6 5 6 21 6"></polyline>
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                  </button>
                                </template>
                              </div>
                            </div>
                          </div>
                          <span class="dual-separator">→</span>
                          <div class="inline-entity-select cell-inline-select">
                            <button
                              type="button"
                              class="inline-select-trigger cell-edit-control"
                              :disabled="editRows[row.rowId].type === 'Вывод средств'"
                              @click.stop="toggleInlineDropdown(`row-${row.rowId}-to-account`)"
                            >
                              <span class="inline-select-trigger-text">
                                {{ getInlineSelectedLabel(editRows[row.rowId].toAccountId, accountOptions, editRows[row.rowId].type === 'Вывод средств' ? 'Вне системы' : 'Куда') }}
                              </span>
                              <span class="inline-select-trigger-arrow">▾</span>
                            </button>
                            <div v-if="isInlineDropdownOpen(`row-${row.rowId}-to-account`) && editRows[row.rowId].type !== 'Вывод средств'" class="inline-select-menu" @click.stop>
                              <div class="inline-select-search-row">
                                <input
                                  :value="getInlineSearchValue(`row-${row.rowId}-to-account`)"
                                  class="inline-select-search-input"
                                  type="text"
                                  placeholder="Поиск..."
                                  @input="setInlineSearchValue(`row-${row.rowId}-to-account`, $event.target.value)"
                                  @keydown.stop
                                />
                              </div>
                              <button
                                type="button"
                                class="inline-select-option inline-select-meta-option"
                                @click="setRowDraftField(row.rowId, 'toAccountId', '')"
                              >
                                Куда
                              </button>
                              <div
                                v-for="acc in getFilteredInlineOptions(`row-${row.rowId}-to-account`, accountOptions)"
                                :key="`${row.rowId}-to-${acc.value}`"
                                class="inline-select-row"
                              >
                                <template v-if="isInlineRenameActive(`row-${row.rowId}-to-account`, acc.value)">
                                  <input
                                    ref="inlineRenameInputRef"
                                    v-model="inlineRenameState.draftName"
                                    class="inline-rename-input"
                                    type="text"
                                    @keydown.enter.prevent="confirmInlineRename"
                                    @keydown.esc.prevent="cancelInlineRename"
                                  />
                                  <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                                  <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                                </template>
                                <template v-else>
                                  <button
                                    type="button"
                                    class="inline-select-option"
                                    :class="{ selected: editRows[row.rowId].toAccountId === acc.value }"
                                    @click="setRowDraftField(row.rowId, 'toAccountId', acc.value)"
                                  >
                                    {{ acc.label }}
                                  </button>
                                  <button
                                    type="button"
                                    class="inline-icon-btn rename"
                                    v-if="canInlineRenameOption(acc)"
                                    @click.stop="startInlineRename(`row-${row.rowId}-to-account`, acc)"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                      <path d="M12 20h9"></path>
                                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    class="inline-icon-btn delete"
                                    :disabled="!canInlineDeleteOption(acc)"
                                    @click.stop="requestInlineDelete(`row-${row.rowId}-to-account`, acc)"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                      <polyline points="3 6 5 6 21 6"></polyline>
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                  </button>
                                </template>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div v-else class="inline-entity-select cell-inline-select">
                          <button
                            type="button"
                            class="inline-select-trigger cell-edit-control"
                            @click.stop="toggleInlineDropdown(`row-${row.rowId}-account`)"
                          >
                            <span class="inline-select-trigger-text">
                              {{ getInlineSelectedLabel(editRows[row.rowId].accountId, accountOptions, 'Без счета') }}
                            </span>
                            <span class="inline-select-trigger-arrow">▾</span>
                          </button>
                          <div v-if="isInlineDropdownOpen(`row-${row.rowId}-account`)" class="inline-select-menu" @click.stop>
                            <div class="inline-select-search-row">
                              <input
                                :value="getInlineSearchValue(`row-${row.rowId}-account`)"
                                class="inline-select-search-input"
                                type="text"
                                placeholder="Поиск..."
                                @input="setInlineSearchValue(`row-${row.rowId}-account`, $event.target.value)"
                                @keydown.stop
                              />
                            </div>
                            <button
                              type="button"
                              class="inline-select-option inline-select-meta-option"
                              @click="setRowDraftField(row.rowId, 'accountId', '')"
                            >
                              Без счета
                            </button>
                            <div
                              v-for="acc in getFilteredInlineOptions(`row-${row.rowId}-account`, accountOptions)"
                              :key="`${row.rowId}-account-${acc.value}`"
                              class="inline-select-row"
                            >
                              <template v-if="isInlineRenameActive(`row-${row.rowId}-account`, acc.value)">
                                <input
                                  ref="inlineRenameInputRef"
                                  v-model="inlineRenameState.draftName"
                                  class="inline-rename-input"
                                  type="text"
                                  @keydown.enter.prevent="confirmInlineRename"
                                  @keydown.esc.prevent="cancelInlineRename"
                                />
                                <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                                <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                              </template>
                              <template v-else>
                                <button
                                  type="button"
                                  class="inline-select-option"
                                  :class="{ selected: editRows[row.rowId].accountId === acc.value }"
                                  @click="setRowDraftField(row.rowId, 'accountId', acc.value)"
                                >
                                  {{ acc.label }}
                                </button>
                                <button
                                  type="button"
                                  class="inline-icon-btn rename"
                                  v-if="canInlineRenameOption(acc)"
                                  @click.stop="startInlineRename(`row-${row.rowId}-account`, acc)"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  class="inline-icon-btn delete"
                                  :disabled="!canInlineDeleteOption(acc)"
                                  @click.stop="requestInlineDelete(`row-${row.rowId}-account`, acc)"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              </template>
                            </div>
                          </div>
                        </div>
                      </template>

                      <template v-else-if="column === 'Контрагент'">
                        <div class="inline-entity-select cell-inline-select">
                          <button
                            type="button"
                            class="inline-select-trigger cell-edit-control"
                            @click.stop="toggleInlineDropdown(`row-${row.rowId}-counterparty`)"
                          >
                            <span class="inline-select-trigger-text">
                              {{ getInlineSelectedLabel(editRows[row.rowId].counterpartyKey, counterpartyOptions, 'Без контрагента') }}
                            </span>
                            <span class="inline-select-trigger-arrow">▾</span>
                          </button>
                          <div v-if="isInlineDropdownOpen(`row-${row.rowId}-counterparty`)" class="inline-select-menu" @click.stop>
                            <div class="inline-select-search-row">
                              <input
                                :value="getInlineSearchValue(`row-${row.rowId}-counterparty`)"
                                class="inline-select-search-input"
                                type="text"
                                placeholder="Поиск..."
                                @input="setInlineSearchValue(`row-${row.rowId}-counterparty`, $event.target.value)"
                                @keydown.stop
                              />
                            </div>
                            <button
                              type="button"
                              class="inline-select-option inline-select-meta-option"
                              @click="setRowDraftField(row.rowId, 'counterpartyKey', '')"
                            >
                              Без контрагента
                            </button>
                            <div
                              v-for="opt in getFilteredInlineOptions(`row-${row.rowId}-counterparty`, counterpartyOptions)"
                              :key="`${row.rowId}-counterparty-opt-${opt.value}`"
                              class="inline-select-row"
                            >
                              <template v-if="isInlineRenameActive(`row-${row.rowId}-counterparty`, opt.value)">
                                <input
                                  ref="inlineRenameInputRef"
                                  v-model="inlineRenameState.draftName"
                                  class="inline-rename-input"
                                  type="text"
                                  @keydown.enter.prevent="confirmInlineRename"
                                  @keydown.esc.prevent="cancelInlineRename"
                                />
                                <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                                <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                              </template>
                              <template v-else>
                                <button
                                  type="button"
                                  class="inline-select-option"
                                  :class="{ selected: editRows[row.rowId].counterpartyKey === opt.value }"
                                  @click="setRowDraftField(row.rowId, 'counterpartyKey', opt.value)"
                                >
                                  {{ opt.label }}
                                </button>
                                <button
                                  type="button"
                                  class="inline-icon-btn rename"
                                  v-if="canInlineRenameOption(opt)"
                                  @click.stop="startInlineRename(`row-${row.rowId}-counterparty`, opt)"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  class="inline-icon-btn delete"
                                  :disabled="!canInlineDeleteOption(opt)"
                                  @click.stop="requestInlineDelete(`row-${row.rowId}-counterparty`, opt)"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              </template>
                            </div>
                          </div>
                        </div>
                      </template>

                      <template v-else-if="column === 'Компания/Физлицо'">
                        <div v-if="row.isTransfer" class="cell-dual-control">
                          <div class="inline-entity-select cell-inline-select">
                            <button
                              type="button"
                              class="inline-select-trigger cell-edit-control"
                              @click.stop="toggleInlineDropdown(`row-${row.rowId}-from-owner`)"
                            >
                              <span class="inline-select-trigger-text">
                                {{ getInlineSelectedLabel(editRows[row.rowId].fromOwnerKey, ownerOptions, 'От кого') }}
                              </span>
                              <span class="inline-select-trigger-arrow">▾</span>
                            </button>
                            <div v-if="isInlineDropdownOpen(`row-${row.rowId}-from-owner`)" class="inline-select-menu" @click.stop>
                              <div class="inline-select-search-row">
                                <input
                                  :value="getInlineSearchValue(`row-${row.rowId}-from-owner`)"
                                  class="inline-select-search-input"
                                  type="text"
                                  placeholder="Поиск..."
                                  @input="setInlineSearchValue(`row-${row.rowId}-from-owner`, $event.target.value)"
                                  @keydown.stop
                                />
                              </div>
                              <button
                                type="button"
                                class="inline-select-option inline-select-meta-option"
                                @click="setRowDraftField(row.rowId, 'fromOwnerKey', '')"
                              >
                                От кого
                              </button>
                              <div
                                v-for="owner in getFilteredInlineOptions(`row-${row.rowId}-from-owner`, ownerOptions)"
                                :key="`${row.rowId}-from-owner-${owner.value}`"
                                class="inline-select-row"
                              >
                                <template v-if="isInlineRenameActive(`row-${row.rowId}-from-owner`, owner.value)">
                                  <input
                                    ref="inlineRenameInputRef"
                                    v-model="inlineRenameState.draftName"
                                    class="inline-rename-input"
                                    type="text"
                                    @keydown.enter.prevent="confirmInlineRename"
                                    @keydown.esc.prevent="cancelInlineRename"
                                  />
                                  <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                                  <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                                </template>
                                <template v-else>
                                  <button
                                    type="button"
                                    class="inline-select-option"
                                    :class="{ selected: editRows[row.rowId].fromOwnerKey === owner.value }"
                                    @click="setRowDraftField(row.rowId, 'fromOwnerKey', owner.value)"
                                  >
                                    {{ owner.label }}
                                  </button>
                                  <button
                                    type="button"
                                    class="inline-icon-btn rename"
                                    v-if="canInlineRenameOption(owner)"
                                    @click.stop="startInlineRename(`row-${row.rowId}-from-owner`, owner)"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                      <path d="M12 20h9"></path>
                                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    class="inline-icon-btn delete"
                                    :disabled="!canInlineDeleteOption(owner)"
                                    @click.stop="requestInlineDelete(`row-${row.rowId}-from-owner`, owner)"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                      <polyline points="3 6 5 6 21 6"></polyline>
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                  </button>
                                </template>
                              </div>
                            </div>
                          </div>
                          <span class="dual-separator">→</span>
                          <div class="inline-entity-select cell-inline-select">
                            <button
                              type="button"
                              class="inline-select-trigger cell-edit-control"
                              :disabled="editRows[row.rowId].type === 'Вывод средств'"
                              @click.stop="toggleInlineDropdown(`row-${row.rowId}-to-owner`)"
                            >
                              <span class="inline-select-trigger-text">
                                {{ getInlineSelectedLabel(editRows[row.rowId].toOwnerKey, ownerOptions, editRows[row.rowId].type === 'Вывод средств' ? 'Вне системы' : 'Кому') }}
                              </span>
                              <span class="inline-select-trigger-arrow">▾</span>
                            </button>
                            <div v-if="isInlineDropdownOpen(`row-${row.rowId}-to-owner`) && editRows[row.rowId].type !== 'Вывод средств'" class="inline-select-menu" @click.stop>
                              <div class="inline-select-search-row">
                                <input
                                  :value="getInlineSearchValue(`row-${row.rowId}-to-owner`)"
                                  class="inline-select-search-input"
                                  type="text"
                                  placeholder="Поиск..."
                                  @input="setInlineSearchValue(`row-${row.rowId}-to-owner`, $event.target.value)"
                                  @keydown.stop
                                />
                              </div>
                              <button
                                type="button"
                                class="inline-select-option inline-select-meta-option"
                                @click="setRowDraftField(row.rowId, 'toOwnerKey', '')"
                              >
                                Кому
                              </button>
                              <div
                                v-for="owner in getFilteredInlineOptions(`row-${row.rowId}-to-owner`, ownerOptions)"
                                :key="`${row.rowId}-to-owner-${owner.value}`"
                                class="inline-select-row"
                              >
                                <template v-if="isInlineRenameActive(`row-${row.rowId}-to-owner`, owner.value)">
                                  <input
                                    ref="inlineRenameInputRef"
                                    v-model="inlineRenameState.draftName"
                                    class="inline-rename-input"
                                    type="text"
                                    @keydown.enter.prevent="confirmInlineRename"
                                    @keydown.esc.prevent="cancelInlineRename"
                                  />
                                  <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                                  <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                                </template>
                                <template v-else>
                                  <button
                                    type="button"
                                    class="inline-select-option"
                                    :class="{ selected: editRows[row.rowId].toOwnerKey === owner.value }"
                                    @click="setRowDraftField(row.rowId, 'toOwnerKey', owner.value)"
                                  >
                                    {{ owner.label }}
                                  </button>
                                  <button
                                    type="button"
                                    class="inline-icon-btn rename"
                                    v-if="canInlineRenameOption(owner)"
                                    @click.stop="startInlineRename(`row-${row.rowId}-to-owner`, owner)"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                      <path d="M12 20h9"></path>
                                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    class="inline-icon-btn delete"
                                    :disabled="!canInlineDeleteOption(owner)"
                                    @click.stop="requestInlineDelete(`row-${row.rowId}-to-owner`, owner)"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                      <polyline points="3 6 5 6 21 6"></polyline>
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                  </button>
                                </template>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div v-else class="inline-entity-select cell-inline-select">
                          <button
                            type="button"
                            class="inline-select-trigger cell-edit-control"
                            @click.stop="toggleInlineDropdown(`row-${row.rowId}-owner`)"
                          >
                            <span class="inline-select-trigger-text">
                              {{ getInlineSelectedLabel(editRows[row.rowId].ownerKey, ownerOptions, 'Без владельца') }}
                            </span>
                            <span class="inline-select-trigger-arrow">▾</span>
                          </button>
                          <div v-if="isInlineDropdownOpen(`row-${row.rowId}-owner`)" class="inline-select-menu" @click.stop>
                            <div class="inline-select-search-row">
                              <input
                                :value="getInlineSearchValue(`row-${row.rowId}-owner`)"
                                class="inline-select-search-input"
                                type="text"
                                placeholder="Поиск..."
                                @input="setInlineSearchValue(`row-${row.rowId}-owner`, $event.target.value)"
                                @keydown.stop
                              />
                            </div>
                            <button
                              type="button"
                              class="inline-select-option inline-select-meta-option"
                              @click="setRowDraftField(row.rowId, 'ownerKey', '')"
                            >
                              Без владельца
                            </button>
                            <div
                              v-for="owner in getFilteredInlineOptions(`row-${row.rowId}-owner`, ownerOptions)"
                              :key="`${row.rowId}-owner-${owner.value}`"
                              class="inline-select-row"
                            >
                              <template v-if="isInlineRenameActive(`row-${row.rowId}-owner`, owner.value)">
                                <input
                                  ref="inlineRenameInputRef"
                                  v-model="inlineRenameState.draftName"
                                  class="inline-rename-input"
                                  type="text"
                                  @keydown.enter.prevent="confirmInlineRename"
                                  @keydown.esc.prevent="cancelInlineRename"
                                />
                                <button type="button" class="inline-icon-btn confirm" :disabled="inlineRenameState.saving" @click="confirmInlineRename">✓</button>
                                <button type="button" class="inline-icon-btn rename-delete" :disabled="inlineRenameState.saving" @click.stop="requestInlineDeleteFromRename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                              </template>
                              <template v-else>
                                <button
                                  type="button"
                                  class="inline-select-option"
                                  :class="{ selected: editRows[row.rowId].ownerKey === owner.value }"
                                  @click="setRowDraftField(row.rowId, 'ownerKey', owner.value)"
                                >
                                  {{ owner.label }}
                                </button>
                                <button
                                  type="button"
                                  class="inline-icon-btn rename"
                                  v-if="canInlineRenameOption(owner)"
                                  @click.stop="startInlineRename(`row-${row.rowId}-owner`, owner)"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  class="inline-icon-btn delete"
                                  :disabled="!canInlineDeleteOption(owner)"
                                  @click.stop="requestInlineDelete(`row-${row.rowId}-owner`, owner)"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              </template>
                            </div>
                          </div>
                        </div>
                      </template>

                      <template v-else-if="column === 'Статус'">
                        <select v-model="editRows[row.rowId].status" class="cell-edit-control has-arrow">
                          <option v-for="statusOption in statusOptions" :key="`${row.rowId}-${statusOption}`" :value="statusOption">
                            {{ statusOption }}
                          </option>
                        </select>
                      </template>

                      <template v-else>
                        <span class="cell-text" :title="row.values[column]">{{ row.values[column] }}</span>
                      </template>
                    </template>
                    <template v-else>
                      <span class="cell-text" :title="row.values[column]">{{ row.values[column] }}</span>
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <aside class="journal-charts-pane">
          <JournalChartsPanel :rows="filteredOperations" />
        </aside>

        <div
          v-if="!isChartsPaneCollapsed"
          class="charts-pane-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Изменить ширину правой панели"
          @pointerdown="startChartsPaneResize"
        ></div>

        <button
          class="charts-pane-toggle-btn"
          type="button"
          @click="toggleChartsPane"
          :title="isChartsPaneCollapsed ? 'Развернуть правую панель' : 'Свернуть правую панель'"
          :aria-label="isChartsPaneCollapsed ? 'Развернуть правую панель' : 'Свернуть правую панель'"
          :aria-expanded="String(!isChartsPaneCollapsed)"
        >
          {{ isChartsPaneCollapsed ? '<' : '>' }}
        </button>
      </div>

      <ConfirmDialog
        :show="inlineDeleteState.show"
        :loading="inlineDeleteState.deleting"
        title="Удаление сущности"
        :message="inlineDeleteMessage"
        confirm-text="Удалить"
        cancel-text="Отмена"
        @confirm="confirmInlineDelete"
        @cancel="closeInlineDeleteDialog"
      />
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.68);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  backdrop-filter: blur(3px);
}

.editor-modal {
  --editor-border: var(--day-column-border, var(--color-border));
  --editor-header-bg: var(--day-header-bg, var(--color-background-soft));
  --editor-header-text: var(--day-header-text, var(--text-soft, var(--color-heading)));
  --editor-row-bg: var(--day-column-bg, var(--color-background));
  --editor-row-alt-bg: var(--ui-panel-bg, var(--color-background-soft));
  --editor-cell-text: var(--text-main, var(--color-text));
  --editor-muted-text: var(--text-soft, var(--color-heading));
  --charts-pane-bg: var(--color-background-soft);
  --charts-pane-surface: var(--color-background);
  --charts-pane-surface-soft: var(--color-background-soft);
  --charts-pane-hover: var(--color-background-mute, var(--color-background-soft));
  --charts-pane-border: var(--editor-border);
  --charts-pane-text: var(--color-text);
  --charts-pane-muted: var(--editor-muted-text);

  width: 95vw;
  height: 90vh;
  background: var(--color-background);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

:global([data-theme="dark"]) .editor-modal {
  --charts-pane-bg: #181818;
  --charts-pane-surface: #181818;
  --charts-pane-surface-soft: #181818;
  --charts-pane-hover: #1d2632;
  --charts-pane-border: #2a3442;
  --charts-pane-text: #d5dfeb;
  --charts-pane-muted: #99a8bb;
}

:global(html[data-theme="dark"]) .journal-charts-pane {
  background: #181818 !important;
  border-left-color: #1e2a39 !important;
}


.modal-header {
  --charts-pane-width: 25%;
  display: grid;
  grid-template-columns: calc(100% - var(--charts-pane-width)) var(--charts-pane-width);
  align-items: stretch;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-background-soft);
  min-width: 0;
}

.modal-header.charts-collapsed {
  grid-template-columns: 1fr 0;
}

.modal-header-main {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  min-width: 0;
  padding: 12px 18px;
}

.modal-header-charts {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 12px;
  min-width: 0;
  border-left: 1px solid var(--color-border);
  background: var(--color-background-soft);
  gap: 10px;
}

.modal-header-title,
.modal-header-charts-title {
  margin: 0;
  font-size: 13px;
  font-weight: var(--fw-semi, 600);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.modal-header-title {
  color: var(--editor-cell-text);
  flex-shrink: 0;
}

.modal-header-charts-title {
  color: var(--charts-pane-text);
}

.sidebar-tabs {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
}

.sidebar-tab-btn {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--editor-muted-text);
  font-size: 12px;
  font-weight: var(--fw-semi, 600);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.sidebar-tab-btn:hover {
  color: var(--editor-cell-text);
  background: var(--color-background-mute);
}

.sidebar-tab-btn.active {
  background: rgba(34, 197, 94, 0.12);
  color: var(--color-primary);
}

.modal-header.charts-collapsed .modal-header-charts {
  opacity: 0;
  pointer-events: none;
  padding: 0;
  border-left-color: transparent;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.3rem;
  color: var(--editor-cell-text);
  font-weight: var(--fw-semi, 600);
}

.header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
  flex: 1;
  border-left: 1px solid var(--color-border);
  padding-left: 10px;
}

.summary-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.summary-item {
  height: 24px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid var(--editor-border);
  background: var(--editor-row-bg);
  gap: 5px;
  font-size: 11px;
  font-weight: var(--fw-semi, 600);
  white-space: nowrap;
}

.summary-item.income {
  color: #10b981;
}

.summary-item.expense {
  color: #ef4444;
}

.summary-item.transfer {
  color: #9ca3af;
}

.counter-label {
  font-size: 12px;
  color: var(--editor-muted-text);
  font-weight: var(--fw-medium, 500);
  white-space: nowrap;
}

.header-hover-tip {
  position: relative;
  cursor: help;
}

.header-hover-tip[data-tooltip]::before {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  transform: translateX(-50%);
  padding: 6px 10px;
  background: var(--color-primary, #34c759);
  color: #fff;
  font-size: 12px;
  font-weight: var(--fw-medium, 500);
  white-space: nowrap;
  border-radius: 6px;
  opacity: 0;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  z-index: 100;
}

.header-hover-tip[data-tooltip]:hover::before {
  opacity: 1;
}

.header-visibility-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-eye-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--editor-muted-text);
  padding: 0;
  cursor: pointer;
  transition: all 0.2s ease;
}

.header-eye-btn.icon-only {
  gap: 0;
}

.header-eye-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.header-eye-btn.active {
  background: var(--color-primary, #34c759);
  border-color: transparent;
  color: #fff;
}

.header-actions-menu {
  display: flex;
  align-items: center;
  position: relative;
}

.header-menu-btn {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 12px;
  font-weight: var(--fw-semi, 600);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.header-menu-btn svg:first-child {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.header-menu-btn:hover {
  background: var(--color-background-mute);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.header-menu-btn.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: rgba(34, 197, 94, 0.1);
}

.menu-trigger-caret {
  width: 12px;
  height: 12px;
}

.header-actions-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 176px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.16),
    0 6px 16px rgba(0, 0, 0, 0.12);
  z-index: 40;
}

.header-actions-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: var(--fw-semi, 600);
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  text-align: left;
}

.header-actions-item svg {
  width: 14px;
  height: 14px;
  stroke: var(--editor-muted-text);
  transition: stroke 0.2s;
  flex-shrink: 0;
}

.header-actions-item:hover:not(:disabled) {
  background: var(--color-background-mute);
  color: #10b981;
}

.header-actions-item:hover:not(:disabled) svg,
.header-actions-item.active svg {
  stroke: #10b981;
}

.header-actions-item.active {
  color: #10b981;
  background: rgba(34, 197, 94, 0.1);
}

.header-actions-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.copy-success {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  background: #10b981;
  color: white;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  white-space: nowrap;
  z-index: 1000;
}

.icon-action-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--editor-cell-text);
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
  line-height: 0;
}

.icon-action-btn svg {
  display: block;
  width: 15px;
  height: 15px;
  margin: 0 auto;
}

.icon-action-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.icon-action-btn.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: rgba(34, 197, 94, 0.14);
}

.icon-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-edit-btn {
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #16a34a;
  background: #22c55e;
  color: #fff;
  font-size: 12px;
  font-weight: var(--fw-semi, 600);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.save-edit-btn:hover:not(:disabled) {
  background: #16a34a;
}

.save-edit-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.close-btn {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  font-size: 20px;
  color: var(--editor-cell-text);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s, border-color 0.2s, color 0.2s;
}

.close-btn:hover {
  background: var(--color-background-mute);
  border-color: var(--color-border-hover, var(--color-border));
}

.modal-close-btn {
  margin-left: auto;
  flex-shrink: 0;
}

.modal-close-floating {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 30;
}

.modal-body {
  --charts-pane-width: 25%;
  flex: 1;
  display: grid;
  grid-template-columns: calc(100% - var(--charts-pane-width)) var(--charts-pane-width);
  background: var(--color-background);
  min-height: 0;
  position: relative;
}

.modal-body.charts-collapsed {
  grid-template-columns: 1fr 0;
}

.operations-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.status-row {
  min-height: 34px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--editor-border);
}

.status-text {
  font-size: var(--font-sm, 13px);
  font-weight: var(--fw-semi, 600);
}

.status-text.error {
  color: #ef4444;
}

.table-wrap {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  border-top: 1px solid var(--editor-border);
  background: var(--editor-row-bg);
}

.table-wrap,
.journal-charts-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--charts-pane-border);
  background: var(--charts-pane-bg);
  overflow: hidden;
  transition: opacity 0.22s ease, border-color 0.22s ease;
}

.modal-body.charts-collapsed .journal-charts-pane {
  opacity: 0;
  pointer-events: none;
  border-left-color: transparent;
}

.charts-pane-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(100% - var(--charts-pane-width));
  width: 10px;
  transform: translateX(-50%);
  cursor: col-resize;
  z-index: 6;
  touch-action: none;
}

.charts-pane-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: var(--charts-pane-border);
  transition: background-color 0.15s, width 0.15s;
}

.charts-pane-resizer:hover::before,
.modal-body.charts-resizing .charts-pane-resizer::before {
  width: 2px;
  background: var(--color-primary);
}

.charts-pane-toggle-btn {
  position: absolute;
  top: 10px;
  right: calc(var(--charts-pane-width) - 14px);
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--charts-pane-border);
  background: var(--charts-pane-surface);
  color: var(--charts-pane-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 7;
  transition: right 0.22s ease, background-color 0.2s ease, border-color 0.2s ease;
}

.charts-pane-toggle-btn:hover {
  background: var(--charts-pane-hover);
  border-color: var(--color-primary);
}

.modal-body.charts-collapsed .charts-pane-toggle-btn {
  right: 8px;
}


.settings-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  color: var(--editor-cell-text);
}

.settings-table th,
.settings-table td {
  border: 1px solid var(--editor-border);
  min-width: 0;
  padding: 0;
  color: var(--editor-cell-text);
}

.settings-table td {
  height: 44px;
  background: var(--editor-row-bg);
}

.settings-table tbody tr:nth-child(even) td {
  background: var(--editor-row-alt-bg);
}

.settings-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--editor-header-bg);
  color: var(--editor-header-text);
  font-size: 13px;
  font-weight: var(--fw-semi, 600);
  vertical-align: middle;
  padding: 5px 6px;
  height: 44px;
}

.header-filter-control {
  width: 100%;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--editor-cell-text);
  font-size: 13px;
  font-weight: var(--fw-semi, 600);
  outline: none;
  padding: 0 8px;
  box-sizing: border-box;
  margin: 0;
}

.header-filter-control:hover,
.header-filter-control:focus {
  border-color: var(--editor-border);
  background: var(--editor-row-bg);
}

.header-filter-control option {
  background: var(--editor-row-bg);
  color: var(--editor-cell-text);
}

.has-arrow {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--editor-muted-text) 50%),
    linear-gradient(135deg, var(--editor-muted-text) 50%, transparent 50%);
  background-position:
    calc(100% - 14px) calc(50% + 1px),
    calc(100% - 9px) calc(50% + 1px);
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  padding-right: 28px;
}

.inline-entity-select {
  position: relative;
  width: 100%;
}

.inline-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  text-align: left;
  cursor: pointer;
}

.inline-select-trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.inline-select-trigger-text {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inline-select-trigger-arrow {
  flex-shrink: 0;
  color: var(--editor-muted-text);
  font-size: 10px;
  line-height: 1;
}

.inline-select-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--editor-border);
  border-radius: 8px;
  background: var(--editor-row-bg);
  box-shadow:
    0 22px 48px rgba(0, 0, 0, 0.34),
    0 6px 16px rgba(0, 0, 0, 0.24);
  z-index: 30;
}

.header-inline-select .inline-select-menu {
  left: 0;
  right: auto;
  width: var(--header-inline-menu-width, calc(100% + 88px));
  min-width: calc(100% + 88px);
  max-width: min(92vw, 760px);
}

.header-inline-select .inline-select-row {
  width: 100%;
}

.header-inline-select .inline-select-option {
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-inline-select .inline-select-menu {
  min-width: 190px;
}

.inline-select-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px 30px;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  min-width: 0;
}

.inline-select-option {
  grid-column: 1 / 2;
  width: 100%;
  min-width: 0;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--editor-cell-text);
  font-size: 13px;
  font-weight: var(--fw-medium, 500);
  text-align: left;
  padding: 0 8px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inline-select-row > .inline-icon-btn.rename {
  grid-column: 3;
  justify-self: end;
}

.inline-select-row > .inline-icon-btn.delete {
  grid-column: 3;
  justify-self: end;
  display: none;
}

.inline-select-row > .inline-icon-btn.rename-delete {
  grid-column: 3;
  justify-self: end;
}

.inline-select-option:hover {
  background: var(--editor-row-alt-bg);
}

.inline-select-option.selected {
  background: rgba(34, 197, 94, 0.18);
  color: var(--color-primary, #22c55e);
  font-weight: var(--fw-semi, 600);
}

.inline-select-search-row {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px;
  border-bottom: 1px solid var(--editor-border);
  background: var(--editor-row-bg);
}

.inline-select-search-input {
  width: 100%;
  height: 30px;
  border: 1px solid var(--editor-border);
  border-radius: 6px;
  background: var(--editor-row-bg);
  color: var(--editor-cell-text);
  font-size: 13px;
  font-weight: var(--fw-medium, 500);
  outline: none;
  padding: 0 8px;
  box-sizing: border-box;
}

.inline-select-search-input:focus {
  border-color: var(--color-primary, #22c55e);
}

.inline-select-option.inline-select-meta-option {
  display: block;
  border-radius: 0;
  border-bottom: 1px solid var(--editor-border);
  color: var(--editor-muted-text);
  font-weight: var(--fw-semi, 600);
}

.inline-icon-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--editor-muted-text);
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
  line-height: 0;
  transition: all 0.2s;
}

.inline-icon-btn svg {
  display: block;
  width: 15px;
  height: 15px;
  margin: 0 auto;
}

.inline-icon-btn.rename:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.inline-icon-btn.rename {
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--editor-cell-text);
  opacity: 1;
}

.inline-icon-btn.delete {
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: #ef4444;
  opacity: 1;
}

.inline-icon-btn.delete:hover {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.inline-icon-btn.rename-delete {
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: #ef4444;
  opacity: 1;
}

.inline-icon-btn.rename-delete:hover {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.inline-icon-btn.confirm {
  color: #16a34a;
}

.inline-icon-btn.confirm:hover {
  background: rgba(22, 163, 74, 0.14);
}

.inline-icon-btn.cancel {
  color: #ef4444;
}

.inline-icon-btn.cancel:hover {
  background: rgba(239, 68, 68, 0.14);
}

.inline-icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.inline-rename-input {
  grid-column: 1 / 2;
  width: 100%;
  min-width: 0;
  height: 30px;
  border: 1px solid var(--editor-border);
  border-radius: 6px;
  background: var(--editor-row-bg);
  color: var(--editor-cell-text);
  font-size: 13px;
  font-weight: var(--fw-medium, 500);
  outline: none;
  padding: 0 8px;
}

.inline-select-row > .inline-icon-btn.confirm {
  grid-column: 2;
  justify-self: end;
}

.inline-select-row > .inline-icon-btn.cancel {
  grid-column: 3;
  justify-self: end;
}

.inline-rename-input:focus {
  border-color: var(--color-primary, #22c55e);
}

.header-static {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  box-sizing: border-box;
  font-size: 13px;
  font-weight: var(--fw-semi, 600);
}

.align-right {
  text-align: right;
}

.operations-table .col-date { width: 12%; }
.operations-table .col-type { width: 11%; }
.operations-table .col-category { width: 10%; }
.operations-table .col-subcategory { width: 10%; }
.operations-table .col-project { width: 11%; }
.operations-table .col-amount { width: 12%; }
.operations-table .col-account { width: 13%; }
.operations-table .col-contractor { width: 11%; }
.operations-table .col-owner { width: 12%; }
.operations-table .col-status { width: 6%; }

.cell-text {
  display: block;
  width: 100%;
  padding: 0 10px;
  line-height: 44px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: var(--fw-medium, 500);
}

.cell-edit-control {
  width: 100%;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--editor-cell-text);
  font-size: 13px;
  font-weight: var(--fw-medium, 500);
  outline: none;
  padding: 0 8px;
  box-sizing: border-box;
}

.cell-edit-control:hover,
.cell-edit-control:focus {
  border-color: var(--editor-border);
  background: var(--editor-row-bg);
}

.cell-edit-control:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.cell-dual-control {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
}

.dual-separator {
  color: var(--editor-muted-text);
  font-size: 12px;
  user-select: none;
}

.amount-cell .cell-text {
  text-align: right;
}

.placeholder-row td {
  text-align: center;
  color: var(--editor-muted-text);
  font-size: 14px;
}

.amount-income .cell-text {
  color: #10b981;
  font-weight: 700;
}

.amount-expense .cell-text,
.amount-withdrawal .cell-text {
  color: #ef4444;
  font-weight: 700;
}

.amount-prepayment .cell-text {
  color: #f59e0b;
  font-weight: 700;
}

.amount-transfer .cell-text {
  color: #6b7280;
  font-weight: 700;
}

.header-date-filter {
  display: block;
  width: 100%;
}

.header-date-filter :deep(.picker-trigger) {
  height: 32px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  padding: 0 8px;
}

.header-date-filter :deep(.picker-trigger:hover),
.header-date-filter :deep(.picker-trigger:focus-within) {
  border-color: var(--editor-border);
  background: var(--editor-row-bg);
}

.header-date-filter :deep(.trigger-content) {
  font-size: 12px;
  color: var(--editor-cell-text);
  text-align: left;
}

.header-date-filter :deep(.value-text) {
  text-align: left;
}

.header-date-filter :deep(.placeholder) {
  color: var(--editor-muted-text);
  font-size: 13px;
}

.header-date-filter :deep(.calendar-dropdown) {
  z-index: 3200;
}

:global(html[data-theme="dark"]) .operations-editor-modal .journal-charts-pane { background: #181818 !important; }

@media (max-width: 1024px) {
  .editor-modal {
    width: 98vw;
    height: 95vh;
    border-radius: 10px;
  }

  .modal-header-main {
    padding: 12px 14px;
  }

  .modal-header-charts {
    padding: 14px 8px;
  }

  .sidebar-tabs {
    gap: 4px;
    padding: 3px;
  }

  .sidebar-tab-btn {
    padding: 0 10px;
    font-size: 11px;
  }

  .modal-close-btn {
    margin-left: auto;
  }

  .modal-close-floating {
    top: 10px;
    right: 10px;
  }

  .modal-header h2 {
    font-size: 1.1rem;
  }

  .summary-line {
    gap: 6px;
  }

  .summary-item {
    height: 24px;
    padding: 0 8px;
    font-size: 11px;
  }

  .header-actions-dropdown {
    min-width: 164px;
  }

  .settings-table th {
    font-size: 12px;
    padding: 6px;
  }

  .cell-text {
    font-size: 13px;
    padding: 0 8px;
  }
}
</style>
