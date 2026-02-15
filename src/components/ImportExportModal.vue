<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import DateRangePicker from '@/components/DateRangePicker.vue';
import { sendAiRequest } from '@/utils/aiClient.js';

const emit = defineEmits(['close', 'import-complete']);
const mainStore = useMainStore();
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (isLocalhost ? 'http://localhost:3000/api' : `${window.location.origin}/api`);

const isLoading = ref(false);
const loadError = ref('');
const operations = ref([]);
const showCopySuccess = ref(false);
const isEditMode = ref(false);
const isSavingEdits = ref(false);
const editRows = ref({});
const baseEditRows = ref({});
const aiInput = ref('');
const aiMessages = ref([]);
const aiLoading = ref(false);
const aiMessagesRef = ref(null);
const aiInputRef = ref(null);
const showAiLogModal = ref(false);
const aiLogText = ref('');
const isAiPaneCollapsed = ref(false);
const aiPaneWidth = ref(25);
const isResizingAiPane = ref(false);
const modalBodyRef = ref(null);
const aiSpeechSupported = ref(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
const isAiRecording = ref(false);
let aiRecognition = null;
let aiVoiceConfirmedText = '';
const filters = ref({
  dateFrom: '',
  dateTo: '',
  type: '',
  category: '',
  project: '',
  account: '',
  contractor: '',
  owner: '',
  status: ''
});

const TABLE_COLUMNS = Object.freeze([
  'Дата',
  'Тип',
  'Категория',
  'Проект',
  'Сумма',
  'Счет',
  'Контрагент',
  'Компания/Физлицо',
  'Статус'
]);
const QUICK_PROMPTS = Object.freeze([
  { label: 'Счета', prompt: 'покажи счета' },
  { label: 'Доходы', prompt: 'покажи доходы' },
  { label: 'Расходы', prompt: 'покажи расходы' },
  { label: 'Переводы', prompt: 'покажи переводы' },
  { label: 'Компании', prompt: 'покажи компании' },
  { label: 'Проекты', prompt: 'покажи проекты' },
  { label: 'Контрагенты', prompt: 'покажи контрагентов' },
  { label: 'Категории', prompt: 'покажи категории' },
  { label: 'Физлица', prompt: 'покажи физлица' }
]);

const closeModal = () => {
  emit('close');
};
const createAiMessage = (role, text, extra = {}) => ({
  id: `${role}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  role,
  text: String(text || ''),
  copied: false,
  ...extra
});

const scrollAiToBottom = () => {
  nextTick(() => {
    const el = aiMessagesRef.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });
};

const resizeAiInput = () => {
  nextTick(() => {
    const input = aiInputRef.value;
    if (!input) return;

    const paneEl = input.closest('.journal-ai-pane');
    const paneHeight = paneEl?.clientHeight || window.innerHeight || 0;
    const maxHeight = Math.max(96, Math.floor(paneHeight * 0.3));

    input.style.height = 'auto';
    const contentHeight = input.scrollHeight;
    const nextHeight = Math.min(contentHeight, maxHeight);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  });
};

const normalizeString = (value) => String(value || '').trim();
const normalizeNameKey = (value) => normalizeString(value).toLowerCase();

const toUtcIsoStart = (dateIso) => {
  const safe = normalizeString(dateIso);
  if (!safe) return null;
  const date = new Date(`${safe}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const toUtcIsoEnd = (dateIso) => {
  const safe = normalizeString(dateIso);
  if (!safe) return null;
  const date = new Date(`${safe}T23:59:59.999`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const getTodayIso = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 10);
};

const buildPeriodFilterForAi = () => {
  const from = normalizeString(filters.value.dateFrom);
  const to = normalizeString(filters.value.dateTo);

  if (from || to) {
    const startIso = toUtcIsoStart(from || to || getTodayIso());
    const endIso = toUtcIsoEnd(to || from || getTodayIso());
    if (startIso && endIso) {
      return {
        mode: 'custom',
        customStart: startIso,
        customEnd: endIso
      };
    }
  }

  const storeFilter = mainStore?.periodFilter;
  if (storeFilter && storeFilter.mode === 'custom' && (storeFilter.customStart || storeFilter.customEnd)) {
    return storeFilter;
  }

  return null;
};

const buildAiSnapshot = () => ({
  accounts: Array.isArray(mainStore.currentAccountBalances) && mainStore.currentAccountBalances.length
    ? mainStore.currentAccountBalances
    : (Array.isArray(mainStore.accounts) ? mainStore.accounts : []),
  companies: Array.isArray(mainStore.companies) ? mainStore.companies : []
});

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

const isTransferOperation = (op) => !!(op?.isTransfer || op?.type === 'transfer');
const isWithdrawalTransfer = (op) => !!(op?.isWithdrawal || (op?.transferPurpose === 'personal' && op?.transferReason === 'personal_use'));
const shouldIncludeInOperationsEditor = (op) => {
  if (!op) return false;
  if (op.isSplitParent) return false;
  if (op.excludeFromTotals && !op.offsetIncomeId) return false;
  return true;
};

const resolveEntityName = (entityOrId, sourceList, fallback = '') => {
  if (!entityOrId) return fallback;

  if (typeof entityOrId === 'object') {
    if (entityOrId.name) return entityOrId.name;
    if (entityOrId._id) {
      const found = sourceList.find((item) => item && item._id === entityOrId._id);
      return found?.name || fallback;
    }
  }

  if (typeof entityOrId === 'string') {
    const foundById = sourceList.find((item) => item && item._id === entityOrId);
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

const isPersonalTransferWithdrawal = (op) => !!op &&
  op.transferPurpose === 'personal' &&
  op.transferReason === 'personal_use';

const normalizeTypeLabel = (op) => {
  if (op?.isWorkAct) return 'Акт выполненных работ';
  if (op?.type === 'withdrawal' || op?.isWithdrawal) return 'Вывод средств';
  if (op?.type === 'transfer' || op?.isTransfer || isPersonalTransferWithdrawal(op)) return 'Перевод';
  if (op?.type === 'prepayment') return 'Предоплата';
  if (op?.type === 'income') return 'Доход';
  if (op?.type === 'expense') return 'Расход';
  return 'Операция';
};

const normalizeStatusLabel = (op) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const opDate = new Date(op?.date);
  if (!Number.isNaN(opDate.getTime())) {
    opDate.setHours(0, 0, 0, 0);
  }

  const isPlan = op?.status === 'plan' || (!Number.isNaN(opDate.getTime()) && opDate.getTime() > today.getTime());
  return isPlan ? 'План' : 'Исполнено';
};

const buildOperationRow = (op) => {
  const typeLabel = normalizeTypeLabel(op);
  const statusLabel = normalizeStatusLabel(op);
  const parsedDate = new Date(op?.date);
  const dateTs = Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime();
  const isTransfer = isTransferOperation(op);
  const isWithdrawal = isWithdrawalTransfer(op);

  const categoryFallback = isPersonalTransferWithdrawal(op) ? 'Вывод средств' : 'Без категории';
  const categoryName = resolveEntityName(op?.categoryId, mainStore.categories, categoryFallback);
  const projectName = resolveEntityName(op?.projectId, mainStore.projects, 'Без проекта');

  let accountName = resolveEntityName(op?.accountId, mainStore.accounts, 'Без счета');
  let ownerName =
    resolveEntityName(op?.companyId, mainStore.companies) ||
    resolveEntityName(op?.individualId, mainStore.individuals, 'Без компании/физлица');

  if (typeLabel === 'Перевод') {
    const fromAccount = resolveEntityName(op?.fromAccountId, mainStore.accounts);
    const toAccount = resolveEntityName(op?.toAccountId, mainStore.accounts);

    if (fromAccount && toAccount) accountName = `${fromAccount} -> ${toAccount}`;
    else if (fromAccount) accountName = fromAccount;
    else if (toAccount) accountName = toAccount;

    const fromOwner =
      resolveEntityName(op?.fromCompanyId, mainStore.companies) ||
      resolveEntityName(op?.fromIndividualId, mainStore.individuals);
    const toOwner =
      resolveEntityName(op?.toCompanyId, mainStore.companies) ||
      resolveEntityName(op?.toIndividualId, mainStore.individuals);

    if (fromOwner && toOwner) ownerName = `${fromOwner} -> ${toOwner}`;
    else if (fromOwner || toOwner) ownerName = fromOwner || toOwner;
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

  return {
    rowId: String(op?._id || op?.id || `${op?.date || 'op'}-${Math.random().toString(16).slice(2)}`),
    operationId: String(op?._id || op?.id || ''),
    type: typeLabel,
    isTransfer,
    isWithdrawal,
    source: op,
    amount: amountForDisplay,
    dateTs,
    editable: {
      date: toDateInputValue(op?.date),
      type: typeLabel,
      categoryName: categoryName === 'Без категории' ? '' : categoryName,
      projectName: projectName === 'Без проекта' ? '' : projectName,
      amount: amountForDisplay ? String(Math.abs(amountForDisplay)) : '',
      accountId: extractId(op?.accountId),
      contractorName: contractorName === 'Без контрагента' ? '' : contractorName,
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
  categoryName: normalizeString(draft?.categoryName),
  projectName: normalizeString(draft?.projectName),
  amount: parseAmountInput(draft?.amount),
  accountId: normalizeString(draft?.accountId),
  contractorName: normalizeString(draft?.contractorName),
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
  const project = new Set();
  const account = new Set();
  const contractor = new Set();
  const owner = new Set();
  const status = new Set();

  source.forEach((row) => {
    if (row.values['Тип']) type.add(row.values['Тип']);
    if (row.values['Категория']) category.add(row.values['Категория']);
    if (row.values['Проект']) project.add(row.values['Проект']);
    if (row.values['Счет']) account.add(row.values['Счет']);
    if (row.values['Контрагент']) contractor.add(row.values['Контрагент']);
    if (row.values['Компания/Физлицо']) owner.add(row.values['Компания/Физлицо']);
    if (row.values['Статус']) status.add(row.values['Статус']);
  });

  return {
    type: toSortedList(type),
    category: toSortedList(category),
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
    label: item.name || 'Компания'
  }));
  const individualOpts = (mainStore.individuals || []).map((item) => ({
    value: `individual-${item._id}`,
    label: item.name || 'Физлицо'
  }));
  return [...companyOpts, ...individualOpts];
});

const accountOptions = computed(() =>
  (mainStore.accounts || []).map((item) => ({
    value: String(item._id),
    label: item.name || 'Счет'
  }))
);

const typeOptionsForRow = (row) => {
  if (row?.isTransfer) return ['Перевод', 'Вывод средств'];
  const base = ['Доход', 'Расход'];
  const currentType = normalizeString(editRows.value[row.rowId]?.type || row.type);
  if (currentType && !base.includes(currentType)) return [...base, currentType];
  return base;
};

const statusOptions = Object.freeze(['Исполнено', 'План']);

const resolveEntityByName = (list, name) => {
  const key = normalizeNameKey(name);
  if (!key) return null;
  return (list || []).find((item) => normalizeNameKey(item?.name) === key) || null;
};

const ensureCategoryIdByName = async (name, cache) => {
  const normalized = normalizeString(name);
  if (!normalized || normalized.toLowerCase() === 'без категории') return null;
  const key = normalizeNameKey(normalized);
  if (cache.categories.has(key)) return cache.categories.get(key);

  const existing = resolveEntityByName(mainStore.categories, normalized);
  if (existing?._id) {
    const id = String(existing._id);
    cache.categories.set(key, id);
    return id;
  }

  const created = await mainStore.addCategory(normalized);
  const id = created?._id ? String(created._id) : null;
  if (id) cache.categories.set(key, id);
  return id;
};

const ensureProjectIdByName = async (name, cache) => {
  const normalized = normalizeString(name);
  if (!normalized || normalized.toLowerCase() === 'без проекта') return null;
  const key = normalizeNameKey(normalized);
  if (cache.projects.has(key)) return cache.projects.get(key);

  const existing = resolveEntityByName(mainStore.projects, normalized);
  if (existing?._id) {
    const id = String(existing._id);
    cache.projects.set(key, id);
    return id;
  }

  const created = await mainStore.addProject(normalized);
  const id = created?._id ? String(created._id) : null;
  if (id) cache.projects.set(key, id);
  return id;
};

const resolveCounterpartyByName = async (name, cache) => {
  const normalized = normalizeString(name);
  if (!normalized || normalized.toLowerCase() === 'без контрагента') {
    return { contractorId: null, counterpartyIndividualId: null };
  }

  const key = normalizeNameKey(normalized);
  if (cache.counterparties.has(key)) return cache.counterparties.get(key);

  const contractor = resolveEntityByName(mainStore.contractors, normalized);
  if (contractor?._id) {
    const value = { contractorId: String(contractor._id), counterpartyIndividualId: null };
    cache.counterparties.set(key, value);
    return value;
  }

  const individual = resolveEntityByName(mainStore.individuals, normalized);
  if (individual?._id) {
    const value = { contractorId: null, counterpartyIndividualId: String(individual._id) };
    cache.counterparties.set(key, value);
    return value;
  }

  const created = await mainStore.addContractor(normalized);
  const value = { contractorId: created?._id ? String(created._id) : null, counterpartyIndividualId: null };
  cache.counterparties.set(key, value);
  return value;
};

const typeLabelToPayload = (label) => {
  const normalized = normalizeString(label);
  if (normalized === 'Расход') return { type: 'expense', isWithdrawal: false };
  if (normalized === 'Вывод средств') return { type: 'expense', isWithdrawal: true };
  if (normalized === 'Предоплата') return { type: 'income', isWithdrawal: false };
  return { type: 'income', isWithdrawal: false };
};

const buildOperationPayload = async (row, draft, entityCache) => {
  const adjustedDate = normalizeDateByStatus(draft.date, draft.status);
  const fallbackDate = toDateInputValue(row?.source?.date);
  const finalDate = adjustedDate || fallbackDate || getTodayIso();
  const amount = parseAmountInput(draft.amount);
  const owner = parseOwnerKey(draft.ownerKey);
  const categoryId = await ensureCategoryIdByName(draft.categoryName, entityCache);
  const projectId = await ensureProjectIdByName(draft.projectName, entityCache);
  const counterparty = await resolveCounterpartyByName(draft.contractorName, entityCache);
  const typeMeta = typeLabelToPayload(draft.type || row.type);

  return {
    date: `${finalDate}T00:00:00`,
    amount,
    type: typeMeta.type,
    accountId: normalizeString(draft.accountId) || null,
    companyId: owner.companyId || null,
    individualId: owner.individualId || null,
    contractorId: counterparty.contractorId,
    counterpartyIndividualId: counterparty.counterpartyIndividualId,
    categoryId: categoryId || null,
    projectId: projectId || null,
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
    fromAccountId: normalizeString(draft.fromAccountId) || extractId(row?.source?.fromAccountId) || null,
    toAccountId: isWithdrawal ? null : (normalizeString(draft.toAccountId) || extractId(row?.source?.toAccountId) || null),
    fromCompanyId: fromOwner.companyId || null,
    fromIndividualId: fromOwner.individualId || null,
    toCompanyId: isWithdrawal ? null : (toOwner.companyId || null),
    toIndividualId: isWithdrawal ? null : (toOwner.individualId || null),
    transferPurpose: isWithdrawal ? 'personal' : (row?.source?.transferPurpose || 'inter_company'),
    transferReason: isWithdrawal ? 'personal_use' : (row?.source?.transferReason || null)
  };
};

const saveEdits = async () => {
  if (isSavingEdits.value || !isEditMode.value) return;

  isSavingEdits.value = true;
  loadError.value = '';

  const entityCache = {
    categories: new Map(),
    projects: new Map(),
    counterparties: new Map()
  };

  try {
    const rowsToSave = operations.value.filter((row) => isRowChanged(row.rowId));

    for (const row of rowsToSave) {
      const draft = editRows.value[row.rowId];
      if (!draft || !row.operationId) continue;

      if (row.isTransfer) {
        const payload = buildTransferPayload(row, draft);
        await mainStore.updateTransfer(row.operationId, payload);
      } else {
        const payload = await buildOperationPayload(row, draft, entityCache);
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

const filteredOperations = computed(() => {
  const fromTs = filters.value.dateFrom
    ? new Date(`${filters.value.dateFrom}T00:00:00`).getTime()
    : null;
  const toTs = filters.value.dateTo
    ? new Date(`${filters.value.dateTo}T23:59:59.999`).getTime()
    : null;

  return operations.value.filter((row) => {
    if (fromTs !== null && (row.dateTs === null || row.dateTs < fromTs)) return false;
    if (toTs !== null && (row.dateTs === null || row.dateTs > toTs)) return false;

    if (filters.value.type && row.values['Тип'] !== filters.value.type) return false;
    if (filters.value.category && row.values['Категория'] !== filters.value.category) return false;
    if (filters.value.project && row.values['Проект'] !== filters.value.project) return false;
    if (filters.value.account && row.values['Счет'] !== filters.value.account) return false;
    if (filters.value.contractor && row.values['Контрагент'] !== filters.value.contractor) return false;
    if (filters.value.owner && row.values['Компания/Физлицо'] !== filters.value.owner) return false;
    if (filters.value.status && row.values['Статус'] !== filters.value.status) return false;

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

const uniqueSorted = (list) => Array.from(new Set(list.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'ru'));

const buildJournalPacketForAi = () => {
  const rows = filteredOperations.value;
  const summaryByStatus = {
    fact: { count: 0, income: 0, expense: 0, transfer: 0, net: 0 },
    plan: { count: 0, income: 0, expense: 0, transfer: 0, net: 0 }
  };

  rows.forEach((row) => {
    const bucket = row.values['Статус'] === 'План' ? summaryByStatus.plan : summaryByStatus.fact;
    const amount = Math.abs(Number(row.amount) || 0);
    bucket.count += 1;

    if (row.type === 'Доход') bucket.income += amount;
    else if (row.type === 'Расход') bucket.expense += amount;
    else if (row.type === 'Перевод' || row.type === 'Вывод средств') bucket.transfer += amount;
  });

  summaryByStatus.fact.net = summaryByStatus.fact.income - summaryByStatus.fact.expense;
  summaryByStatus.plan.net = summaryByStatus.plan.income - summaryByStatus.plan.expense;

  const operationsPayload = rows.map((row) => ({
    id: row.operationId || row.rowId,
    date: row.editable?.date || '',
    dateLabel: row.values['Дата'] || '',
    type: row.values['Тип'] || '',
    status: row.values['Статус'] || '',
    amount: Number(row.amount) || 0,
    account: row.values['Счет'] || '',
    contractor: row.values['Контрагент'] || '',
    owner: row.values['Компания/Физлицо'] || '',
    category: row.values['Категория'] || '',
    project: row.values['Проект'] || ''
  }));

  const dictionary = {
    accounts: uniqueSorted(rows.map((row) => row.values['Счет'] || '')),
    categories: uniqueSorted(rows.map((row) => row.values['Категория'] || '')),
    projects: uniqueSorted(rows.map((row) => row.values['Проект'] || '')),
    contractors: uniqueSorted(rows.map((row) => row.values['Контрагент'] || '')),
    owners: uniqueSorted(rows.map((row) => row.values['Компания/Физлицо'] || ''))
  };

  return {
    source: 'operations_editor',
    generatedAt: new Date().toISOString(),
    periodFilter: buildPeriodFilterForAi(),
    filters: {
      dateFrom: filters.value.dateFrom || null,
      dateTo: filters.value.dateTo || null,
      type: filters.value.type || null,
      category: filters.value.category || null,
      project: filters.value.project || null,
      account: filters.value.account || null,
      contractor: filters.value.contractor || null,
      owner: filters.value.owner || null,
      status: filters.value.status || null
    },
    counters: {
      filtered: filteredCount.value,
      total: totalCount.value
    },
    summary: {
      income: Number(summaryTotals.value.income) || 0,
      expense: Number(summaryTotals.value.expense) || 0,
      transfer: Number(summaryTotals.value.transfer) || 0,
      net: (Number(summaryTotals.value.income) || 0) - (Number(summaryTotals.value.expense) || 0)
    },
    summaryByStatus,
    dictionary,
    operations: operationsPayload
  };
};

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

const copyAiText = async (message) => {
  if (!message?.text) return;
  try {
    await navigator.clipboard.writeText(message.text);
    message.copied = true;
    setTimeout(() => { message.copied = false; }, 1200);
  } catch (error) {
    console.error('Failed to copy AI text:', error);
  }
};

const openAiLog = (message) => {
  aiLogText.value = String(message?.log || '');
  showAiLogModal.value = true;
};

const closeAiLog = () => {
  showAiLogModal.value = false;
  aiLogText.value = '';
};

const toggleAiPane = () => {
  isAiPaneCollapsed.value = !isAiPaneCollapsed.value;
};

const MIN_AI_PANE_WIDTH = 18;
const MAX_AI_PANE_WIDTH = 60;

const clampAiPaneWidth = (value) => Math.min(MAX_AI_PANE_WIDTH, Math.max(MIN_AI_PANE_WIDTH, value));

const stopAiPaneResize = () => {
  if (!isResizingAiPane.value) return;
  isResizingAiPane.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  window.removeEventListener('pointermove', onAiPaneResizeMove);
  window.removeEventListener('pointerup', stopAiPaneResize);
  window.removeEventListener('pointercancel', stopAiPaneResize);
};

const onAiPaneResizeMove = (event) => {
  if (!isResizingAiPane.value || isAiPaneCollapsed.value) return;
  const container = modalBodyRef.value;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  if (!rect.width) return;

  const widthPercent = ((rect.right - event.clientX) / rect.width) * 100;
  aiPaneWidth.value = clampAiPaneWidth(widthPercent);
};

const startAiPaneResize = (event) => {
  if (isAiPaneCollapsed.value) return;
  event.preventDefault();
  isResizingAiPane.value = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', onAiPaneResizeMove);
  window.addEventListener('pointerup', stopAiPaneResize);
  window.addEventListener('pointercancel', stopAiPaneResize);
};

const sendAiMessage = async (forcedMessage = null, options = {}) => {
  const source = String(options?.source || 'chat');
  const text = String(forcedMessage === null ? aiInput.value : forcedMessage || '').trim();
  if (!text || aiLoading.value) return;

  aiMessages.value.push(createAiMessage('user', text));
  if (forcedMessage === null) aiInput.value = '';
  aiLoading.value = true;
  scrollAiToBottom();

  try {
    const periodFilter = buildPeriodFilterForAi();
    const isQuickButton = source === 'quick_button';
    const journalPacket = buildJournalPacketForAi();
    const { text: answerText, backendResponse, debug, request } = await sendAiRequest({
      apiBaseUrl: API_BASE_URL,
      message: text,
      source,
      mode: isQuickButton ? 'quick' : 'chat',
      asOf: new Date().toISOString(),
      includeHidden: true,
      visibleAccountIds: null,
      snapshot: buildAiSnapshot(),
      journalPacket,
      debugAi: false,
      periodFilter,
      timeline: null
    });

    const responseText = String(answerText || backendResponse?.text || '').trim() || 'Нет ответа от AI.';
    aiMessages.value.push(createAiMessage('assistant', responseText, {
      log: (debug || backendResponse || request)
        ? JSON.stringify({ backendResponse, debug, request }, null, 2)
        : null
    }));
  } catch (error) {
    const serverText = String(error?.response?.data?.error || '').trim();
    const fallbackText = serverText || 'Ошибка AI. Проверьте backend и доступ к AI.';
    aiMessages.value.push(createAiMessage('assistant', fallbackText));
  } finally {
    aiLoading.value = false;
    scrollAiToBottom();
  }
};

const onAiInputKeydown = (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendAiMessage();
  }
};

const useQuickPrompt = (promptText) => {
  if (aiLoading.value) return;
  aiInput.value = '';
  nextTick(() => {
    sendAiMessage(promptText, { source: 'quick_button' });
  });
};

const ensureAiRecognition = () => {
  if (aiRecognition) return aiRecognition;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return null;

  const rec = new SpeechRec();
  rec.lang = 'ru-RU';
  rec.interimResults = true;
  rec.continuous = true;

  rec.onresult = (event) => {
    if (!isAiRecording.value) return;

    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const res = event.results[i];
      const transcript = String(res?.[0]?.transcript || '').trim();
      if (!transcript) continue;

      if (res.isFinal) aiVoiceConfirmedText = `${aiVoiceConfirmedText} ${transcript}`.trim();
      else interimText = transcript;
    }

    aiInput.value = `${aiVoiceConfirmedText}${interimText ? ` ${interimText}` : ''}`.trim();
  };

  rec.onend = () => {
    isAiRecording.value = false;
    aiVoiceConfirmedText = '';
  };

  rec.onerror = () => {
    isAiRecording.value = false;
    aiVoiceConfirmedText = '';
  };

  aiRecognition = rec;
  return rec;
};

const toggleAiRecording = async () => {
  if (aiLoading.value || !aiSpeechSupported.value) return;
  const rec = ensureAiRecognition();
  if (!rec) return;

  if (isAiRecording.value) {
    try { rec.stop(); } catch (_) {}
    isAiRecording.value = false;
    aiVoiceConfirmedText = '';
    return;
  }

  aiVoiceConfirmedText = '';
  isAiRecording.value = true;
  try {
    rec.start();
    await nextTick();
    aiInputRef.value?.focus?.();
  } catch (_) {
    isAiRecording.value = false;
    aiVoiceConfirmedText = '';
  }
};

watch(() => aiMessages.value.length, () => {
  scrollAiToBottom();
});

watch(() => aiInput.value, () => {
  resizeAiInput();
});

onMounted(() => {
  document.body.style.overflow = 'hidden';
  loadOperations();
  resizeAiInput();
  window.addEventListener('resize', resizeAiInput);
});

onBeforeUnmount(() => {
  stopAiPaneResize();
  if (aiRecognition) {
    try { aiRecognition.stop(); } catch (_) {}
    aiRecognition = null;
  }
  window.removeEventListener('resize', resizeAiInput);
  document.body.style.overflow = '';
});
</script>

<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="editor-modal operations-editor-modal">
      <div
        class="modal-header"
        :class="{ 'ai-collapsed': isAiPaneCollapsed }"
        :style="{ '--ai-pane-width': `${aiPaneWidth}%` }"
      >
        <div class="modal-header-main">
          <h2>Редактор операций</h2>

          <div class="header-actions">
            <div class="summary-line">
              <span class="summary-item income">Доход: {{ formatSummaryAmount(summaryTotals.income) }}</span>
              <span class="summary-item expense">Расход: {{ formatSummaryAmount(summaryTotals.expense) }}</span>
              <span class="summary-item transfer">Перевод: {{ formatSummaryAmount(summaryTotals.transfer) }}</span>
            </div>
            <span class="counter-label">Записей: {{ filteredCount }} / {{ totalCount }}</span>
            <div class="export-buttons">
              <button class="export-btn" @click="exportToCSV" title="Экспорт в CSV">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                CSV
              </button>
              <button class="export-btn copy-btn" @click="copyToClipboard" title="Копировать">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Копировать
              </button>
              <transition name="fade">
                <div v-if="showCopySuccess" class="copy-success">✓ Скопировано!</div>
              </transition>
            </div>
            <div class="edit-actions">
              <button
                class="icon-action-btn"
                :class="{ active: isEditMode }"
                :disabled="isSavingEdits"
                @click="toggleEditMode"
                title="Редактировать сущности"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                </svg>
              </button>
              <button
                v-if="isEditMode"
                class="save-edit-btn"
                :disabled="isSavingEdits || !hasDirtyEdits"
                @click="saveEdits"
              >
                {{ isSavingEdits ? 'Сохранение...' : 'Сохранить' }}
              </button>
            </div>
          </div>
        </div>
        <div class="modal-header-ai">
          <span class="modal-header-ai-title">AI Ассистент</span>
          <button class="close-btn modal-close-btn" @click="closeModal" aria-label="Закрыть">&times;</button>
        </div>
      </div>

      <button
        v-if="isAiPaneCollapsed"
        class="close-btn modal-close-floating"
        @click="closeModal"
        aria-label="Закрыть"
      >
        &times;
      </button>

      <div
        class="modal-body"
        ref="modalBodyRef"
        :class="{ 'ai-collapsed': isAiPaneCollapsed, 'ai-resizing': isResizingAiPane }"
        :style="{ '--ai-pane-width': `${aiPaneWidth}%` }"
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
                    <select v-model="filters.type" class="header-filter-control has-arrow">
                      <option value="">Тип</option>
                      <option v-for="opt in filterOptions.type" :key="`type-${opt}`" :value="opt">{{ opt }}</option>
                    </select>
                  </th>

                  <th>
                    <select v-model="filters.category" class="header-filter-control has-arrow">
                      <option value="">Категория</option>
                      <option v-for="opt in filterOptions.category" :key="`category-${opt}`" :value="opt">{{ opt }}</option>
                    </select>
                  </th>

                  <th>
                    <select v-model="filters.project" class="header-filter-control has-arrow">
                      <option value="">Проект</option>
                      <option v-for="opt in filterOptions.project" :key="`project-${opt}`" :value="opt">{{ opt }}</option>
                    </select>
                  </th>

                  <th class="align-right">
                    <span class="header-static">Сумма</span>
                  </th>

                  <th>
                    <select v-model="filters.account" class="header-filter-control has-arrow">
                      <option value="">Счет</option>
                      <option v-for="opt in filterOptions.account" :key="`account-${opt}`" :value="opt">{{ opt }}</option>
                    </select>
                  </th>

                  <th>
                    <select v-model="filters.contractor" class="header-filter-control has-arrow">
                      <option value="">Контрагент</option>
                      <option
                        v-for="opt in filterOptions.contractor"
                        :key="`contractor-${opt}`"
                        :value="opt"
                      >
                        {{ opt }}
                      </option>
                    </select>
                  </th>

                  <th>
                    <select v-model="filters.owner" class="header-filter-control has-arrow">
                      <option value="">Компания/Физлицо</option>
                      <option v-for="opt in filterOptions.owner" :key="`owner-${opt}`" :value="opt">{{ opt }}</option>
                    </select>
                  </th>

                  <th>
                    <select v-model="filters.status" class="header-filter-control has-arrow">
                      <option value="">Статус</option>
                      <option v-for="opt in filterOptions.status" :key="`status-${opt}`" :value="opt">{{ opt }}</option>
                    </select>
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
                        <input
                          v-model="editRows[row.rowId].categoryName"
                          type="text"
                          class="cell-edit-control"
                          placeholder="Категория"
                        />
                      </template>

                      <template v-else-if="column === 'Проект'">
                        <input
                          v-model="editRows[row.rowId].projectName"
                          type="text"
                          class="cell-edit-control"
                          placeholder="Проект"
                        />
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
                          <select v-model="editRows[row.rowId].fromAccountId" class="cell-edit-control has-arrow">
                            <option value="">Откуда</option>
                            <option v-for="acc in accountOptions" :key="`${row.rowId}-from-${acc.value}`" :value="acc.value">
                              {{ acc.label }}
                            </option>
                          </select>
                          <span class="dual-separator">→</span>
                          <select
                            v-model="editRows[row.rowId].toAccountId"
                            class="cell-edit-control has-arrow"
                            :disabled="editRows[row.rowId].type === 'Вывод средств'"
                          >
                            <option value="">{{ editRows[row.rowId].type === 'Вывод средств' ? 'Вне системы' : 'Куда' }}</option>
                            <option v-for="acc in accountOptions" :key="`${row.rowId}-to-${acc.value}`" :value="acc.value">
                              {{ acc.label }}
                            </option>
                          </select>
                        </div>
                        <select v-else v-model="editRows[row.rowId].accountId" class="cell-edit-control has-arrow">
                          <option value="">Без счета</option>
                          <option v-for="acc in accountOptions" :key="`${row.rowId}-account-${acc.value}`" :value="acc.value">
                            {{ acc.label }}
                          </option>
                        </select>
                      </template>

                      <template v-else-if="column === 'Контрагент'">
                        <input
                          v-model="editRows[row.rowId].contractorName"
                          type="text"
                          class="cell-edit-control"
                          placeholder="Контрагент"
                        />
                      </template>

                      <template v-else-if="column === 'Компания/Физлицо'">
                        <div v-if="row.isTransfer" class="cell-dual-control">
                          <select v-model="editRows[row.rowId].fromOwnerKey" class="cell-edit-control has-arrow">
                            <option value="">От кого</option>
                            <option v-for="owner in ownerOptions" :key="`${row.rowId}-from-owner-${owner.value}`" :value="owner.value">
                              {{ owner.label }}
                            </option>
                          </select>
                          <span class="dual-separator">→</span>
                          <select
                            v-model="editRows[row.rowId].toOwnerKey"
                            class="cell-edit-control has-arrow"
                            :disabled="editRows[row.rowId].type === 'Вывод средств'"
                          >
                            <option value="">{{ editRows[row.rowId].type === 'Вывод средств' ? 'Вне системы' : 'Кому' }}</option>
                            <option v-for="owner in ownerOptions" :key="`${row.rowId}-to-owner-${owner.value}`" :value="owner.value">
                              {{ owner.label }}
                            </option>
                          </select>
                        </div>
                        <select v-else v-model="editRows[row.rowId].ownerKey" class="cell-edit-control has-arrow">
                          <option value="">Без владельца</option>
                          <option v-for="owner in ownerOptions" :key="`${row.rowId}-owner-${owner.value}`" :value="owner.value">
                            {{ owner.label }}
                          </option>
                        </select>
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

        <aside class="journal-ai-pane">
          <div class="journal-ai-quick-row">
            <button
              v-for="item in QUICK_PROMPTS"
              :key="item.prompt"
              class="ai-quick-btn"
              :disabled="aiLoading"
              @click="useQuickPrompt(item.prompt)"
            >
              {{ item.label }}
            </button>
          </div>

          <div class="journal-ai-messages" ref="aiMessagesRef">
            <div v-if="aiMessages.length === 0" class="journal-ai-empty">
              Спросите по операциям за выбранный период.
            </div>

            <div v-for="message in aiMessages" :key="message.id" class="journal-ai-message" :class="message.role">
              <div class="journal-ai-bubble">
                <div class="journal-ai-text">{{ message.text }}</div>
                <div class="journal-ai-actions" v-if="message.role === 'assistant'">
                  <button class="journal-ai-copy-btn" @click="copyAiText(message)">
                    {{ message.copied ? '✅' : 'Копировать' }}
                  </button>
                  <button v-if="message.log" class="journal-ai-log-btn" @click="openAiLog(message)">Log</button>
                </div>
              </div>
            </div>

            <div v-if="aiLoading" class="journal-ai-typing">Думаю...</div>
          </div>

          <div class="ai-input-container">
            <button class="ai-attach-btn" disabled title="Прикрепить файл (скоро)">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
            </button>

            <textarea
              ref="aiInputRef"
              v-model="aiInput"
              class="ai-input"
              placeholder="Спросите AI Как дела?"
              rows="1"
              @input="resizeAiInput"
              @keydown="onAiInputKeydown"
            ></textarea>

            <div class="ai-input-buttons">
              <button
                class="ai-mic-btn"
                :class="{ recording: isAiRecording }"
                :disabled="aiLoading || !aiSpeechSupported"
                @click="toggleAiRecording"
                :title="aiSpeechSupported ? (isAiRecording ? 'Остановить запись' : 'Голосовой ввод') : 'Голосовой ввод не поддерживается'"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
                  <path d="M19 11a7 7 0 0 1-14 0" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>

              <button
                class="ai-send-btn"
                :disabled="aiLoading || !(aiInput || '').trim()"
                @click="sendAiMessage"
                title="Отправить"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
        </aside>

        <div
          v-if="!isAiPaneCollapsed"
          class="ai-pane-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Изменить ширину панели чата"
          @pointerdown="startAiPaneResize"
        ></div>

        <button
          class="ai-pane-toggle-btn"
          type="button"
          @click="toggleAiPane"
          :title="isAiPaneCollapsed ? 'Развернуть чат' : 'Свернуть чат'"
          :aria-label="isAiPaneCollapsed ? 'Развернуть чат' : 'Свернуть чат'"
          :aria-expanded="String(!isAiPaneCollapsed)"
        >
          {{ isAiPaneCollapsed ? '<' : '>' }}
        </button>
      </div>

      <div v-if="showAiLogModal" class="journal-ai-log-modal" @click.self="closeAiLog">
        <div class="journal-ai-log-content">
          <div class="journal-ai-log-header">
            <span>AI лог</span>
            <button class="journal-ai-log-close" @click="closeAiLog">×</button>
          </div>
          <pre class="journal-ai-log-body">{{ aiLogText }}</pre>
        </div>
      </div>
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
  --ai-pane-bg: var(--color-background-soft);
  --ai-pane-surface: var(--color-background);
  --ai-pane-surface-soft: var(--color-background-soft);
  --ai-pane-hover: var(--color-background-mute, var(--color-background-soft));
  --ai-pane-border: var(--editor-border);
  --ai-pane-text: var(--color-text);
  --ai-pane-muted: var(--editor-muted-text);

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
  --ai-pane-bg: #181818;
  --ai-pane-surface: #181818;
  --ai-pane-surface-soft: #181818;
  --ai-pane-hover: #1d2632;
  --ai-pane-border: #2a3442;
  --ai-pane-text: #d5dfeb;
  --ai-pane-muted: #99a8bb;
}

:global(html[data-theme="dark"]) .journal-ai-pane {
  background: #181818 !important;
  border-left-color: #1e2a39 !important;
}

:global(html[data-theme="dark"]) .editor-modal .journal-ai-messages {
  background: #181818 !important;
}

:global([data-theme="dark"]) .ai-input-container {
  background: #181818;
  border-top-color: #253140;
}

:global([data-theme="dark"]) .journal-ai-bubble {
  background: #232323;
  border-color: #2c394b;
}

:global([data-theme="dark"]) .journal-ai-copy-btn,
:global([data-theme="dark"]) .journal-ai-log-btn {
  background: #17212d;
  border-color: #2c394b;
  color: #c8d3e2;
}

.modal-header {
  --ai-pane-width: 25%;
  display: grid;
  grid-template-columns: calc(100% - var(--ai-pane-width)) var(--ai-pane-width);
  align-items: stretch;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-background-soft);
  min-width: 0;
}

.modal-header.ai-collapsed {
  grid-template-columns: 1fr 0;
}

.modal-header-main {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 16px 24px;
}

.modal-header-ai {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 16px 12px;
  min-width: 0;
  border-left: 1px solid var(--color-border);
  background: var(--color-background-soft);
  gap: 10px;
}

.modal-header-ai-title {
  color: var(--ai-pane-text);
  font-size: 13px;
  font-weight: var(--fw-semi, 600);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.modal-header.ai-collapsed .modal-header-ai {
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
  justify-content: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
  border-left: 1px solid var(--color-border);
  padding-left: 12px;
}

.summary-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-item {
  height: 28px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid var(--editor-border);
  background: var(--editor-row-bg);
  font-size: 12px;
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
  font-size: var(--font-sm, 13px);
  color: var(--editor-muted-text);
  font-weight: var(--fw-medium, 500);
}

.export-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.export-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 12px;
  font-weight: var(--fw-semi, 600);
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.export-btn svg {
  width: 14px;
  height: 14px;
  stroke: var(--editor-muted-text);
  transition: stroke 0.2s;
}

.export-btn:hover {
  background: var(--color-background-mute);
  border-color: #10b981;
  color: #10b981;
}

.export-btn:hover svg {
  stroke: #10b981;
}

.export-btn:active {
  transform: scale(0.98);
}

.copy-success {
  position: absolute;
  right: 0;
  top: -30px;
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

.edit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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
  --ai-pane-width: 25%;
  flex: 1;
  display: grid;
  grid-template-columns: calc(100% - var(--ai-pane-width)) var(--ai-pane-width);
  background: var(--color-background);
  min-height: 0;
  position: relative;
}

.modal-body.ai-collapsed {
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

.journal-ai-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--ai-pane-border);
  background: var(--ai-pane-bg);
  overflow: hidden;
  transition: opacity 0.22s ease, border-color 0.22s ease;
}

.modal-body.ai-collapsed .journal-ai-pane {
  opacity: 0;
  pointer-events: none;
  border-left-color: transparent;
}

.ai-pane-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(100% - var(--ai-pane-width));
  width: 10px;
  transform: translateX(-50%);
  cursor: col-resize;
  z-index: 6;
  touch-action: none;
}

.ai-pane-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: var(--ai-pane-border);
  transition: background-color 0.15s, width 0.15s;
}

.ai-pane-resizer:hover::before,
.modal-body.ai-resizing .ai-pane-resizer::before {
  width: 2px;
  background: var(--color-primary);
}

.ai-pane-toggle-btn {
  position: absolute;
  top: 10px;
  right: calc(var(--ai-pane-width) - 14px);
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--ai-pane-border);
  background: var(--ai-pane-surface);
  color: var(--ai-pane-text);
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

.ai-pane-toggle-btn:hover {
  background: var(--ai-pane-hover);
  border-color: var(--color-primary);
}

.modal-body.ai-collapsed .ai-pane-toggle-btn {
  right: 8px;
}

.journal-ai-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--ai-pane-bg);
}

.journal-ai-empty {
  color: var(--ai-pane-muted);
  font-size: 13px;
  text-align: center;
  padding: 24px 8px;
}

.journal-ai-message {
  display: flex;
}

.journal-ai-message.user {
  justify-content: flex-end;
}

.journal-ai-message.assistant {
  justify-content: flex-start;
}

.journal-ai-bubble {
  max-width: 92%;
  border-radius: 12px;
  border: 1px solid var(--ai-pane-border);
  background: var(--ai-pane-surface);
  padding: 10px 12px;
}

.journal-ai-message.user .journal-ai-bubble {
  background: rgba(16, 185, 129, 0.18);
  border-color: rgba(16, 185, 129, 0.45);
}

.journal-ai-text {
  white-space: pre-wrap;
  color: var(--ai-pane-text);
  font-size: 13px;
  line-height: 1.45;
}

.journal-ai-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.journal-ai-copy-btn,
.journal-ai-log-btn {
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--ai-pane-border);
  background: var(--ai-pane-surface-soft);
  color: var(--ai-pane-text);
  font-size: 11px;
  cursor: pointer;
  padding: 0 8px;
}

.journal-ai-copy-btn:hover,
.journal-ai-log-btn:hover {
  background: var(--ai-pane-hover);
}

.journal-ai-typing {
  color: var(--ai-pane-muted);
  font-size: 12px;
  padding: 0 2px 4px;
}

.journal-ai-quick-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 8px 10px;
  border-bottom: 1px solid var(--ai-pane-border);
  background: var(--ai-pane-surface-soft);
  flex-shrink: 0;
}

.ai-quick-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--ai-pane-border);
  background: var(--ai-pane-surface-soft);
  color: var(--ai-pane-text);
  font-size: 12px;
  font-weight: var(--fw-semi, 600);
  white-space: nowrap;
  cursor: pointer;
}

.ai-quick-btn:hover:not(:disabled) {
  background: var(--ai-pane-hover);
  border-color: var(--color-primary);
}

.ai-quick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-input-container {
  padding: 8px 10px;
  border-top: 1px solid var(--ai-pane-border);
  background: var(--ai-pane-surface-soft);
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 32px 1fr auto;
  align-items: end;
  gap: 8px;
}

.ai-attach-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--ai-pane-muted);
  cursor: not-allowed;
  display: grid;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.5;
}

.ai-input {
  flex: 1;
  min-height: 32px;
  max-height: none;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--ai-pane-text);
  padding: 6px 2px;
  outline: none;
  resize: none;
  overflow-y: hidden;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
}

.ai-input::placeholder {
  color: var(--ai-pane-muted);
}

.ai-input-buttons {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: end;
  margin-bottom: 1px;
}

.ai-send-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s, transform 0.08s;
}

.ai-send-btn:hover {
  background: #28a745;
}

.ai-send-btn:active {
  transform: scale(0.96);
}

.ai-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--ai-pane-hover);
  color: var(--ai-pane-muted);
  transform: none;
}

.ai-mic-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--ai-pane-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s, transform 0.08s;
}

.ai-mic-btn:hover {
  background: var(--ai-pane-hover);
}

.ai-mic-btn:active {
  transform: scale(0.96);
}

.ai-mic-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-mic-btn.recording {
  color: #fff;
  background: var(--color-primary);
  animation: aiPulse 1.5s ease-in-out infinite, aiWave 2s ease-in-out infinite;
}

@keyframes aiPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}

@keyframes aiWave {
  0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.6); }
  50% { box-shadow: 0 0 0 12px rgba(52, 199, 89, 0); }
  100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); }
}

.ai-send-btn svg,
.ai-mic-btn svg {
  width: 20px;
  height: 20px;
  display: block;
  flex: none;
}

.journal-ai-log-modal {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3100;
}

.journal-ai-log-content {
  width: min(760px, 92vw);
  max-height: 78vh;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.journal-ai-log-header {
  height: 42px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  color: var(--color-heading);
  font-weight: var(--fw-semi, 600);
}

.journal-ai-log-close {
  border: 0;
  background: transparent;
  color: var(--color-text);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.journal-ai-log-body {
  margin: 0;
  padding: 12px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text);
  background: var(--color-background-soft);
  white-space: pre-wrap;
  word-break: break-word;
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
.operations-table .col-category { width: 12%; }
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

:global(html[data-theme="dark"]) .operations-editor-modal .journal-ai-pane,
:global(html[data-theme="dark"]) .operations-editor-modal .journal-ai-messages,
:global(html[data-theme="dark"]) .operations-editor-modal .ai-input-container,
:global(html[data-theme="dark"]) .operations-editor-modal .journal-ai-bubble,
:global(html[data-theme="dark"]) .operations-editor-modal .journal-ai-copy-btn,
:global(html[data-theme="dark"]) .operations-editor-modal .journal-ai-log-btn,
:global(html[data-theme="dark"]) .operations-editor-modal .journal-ai-log-content,
:global(html[data-theme="dark"]) .operations-editor-modal .journal-ai-log-header,
:global(html[data-theme="dark"]) .operations-editor-modal .journal-ai-log-body {
  background: #181818 !important;
}

:global(html[data-theme="dark"]) .operations-editor-modal .journal-ai-message.user .journal-ai-bubble,
:global(html[data-theme="dark"]) .operations-editor-modal .journal-ai-message.assistant .journal-ai-bubble {
  background: #232323 !important;
  border-color: #2f2f2f !important;
}

@media (max-width: 1024px) {
  .editor-modal {
    width: 98vw;
    height: 95vh;
    border-radius: 10px;
  }

  .modal-header-main {
    padding: 14px 16px;
  }

  .modal-header-ai {
    padding: 14px 8px;
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

  .counter-label {
    display: none;
  }

  .export-btn {
    height: 28px;
    padding: 0 8px;
    font-size: 11px;
  }

  .summary-line {
    gap: 6px;
  }

  .summary-item {
    height: 24px;
    padding: 0 8px;
    font-size: 11px;
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
