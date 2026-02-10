<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { detectCompanyLegalForm, getDefaultTaxPercentByName } from '@/utils/companyTax';
import { accountSuggestions } from '@/data/accountSuggestions.js';

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const isSaving = ref(false);
const saveMessage = ref('');
const saveError = ref('');
const rows = ref([]);
const showDeletePopup = ref(false);
const deleteCandidate = ref(null);
const isDeletingAccount = ref(false);
const isCreatingOwner = ref(false);
const activeAccountSuggestionRowId = ref(null);
const accountSuggestionQuery = ref('');
let accountSuggestionBlurTimer = null;

const CREATE_OWNER_COMPANY_VALUE = '__create_company__';
const CREATE_OWNER_INDIVIDUAL_VALUE = '__create_individual__';

const LEGAL_FORM_OPTIONS = [
  { value: 'too', label: 'ТОО' },
  { value: 'ip', label: 'ИП' },
  { value: 'individual', label: 'Физлицо' },
  { value: 'other', label: 'Другое' }
];

const COMPANY_TAX_REGIME_OPTIONS = [
  { value: 'our', label: 'ОУР' },
  { value: 'simplified', label: 'Упрощенка' }
];

const INDIVIDUAL_TAX_REGIME_OPTIONS = [
  { value: 'none', label: 'Нет' },
  { value: 'our', label: 'ОУР' },
  { value: 'simplified', label: 'Упрощенка' }
];

const CASH_TAX_REGIME_OPTIONS = [
  { value: 'none', label: 'Нет' },
  { value: 'our', label: 'ОУР' },
  { value: 'simplified', label: 'Упрощенка' }
];

const closeModal = () => {
  emit('close');
};

const ownerTypeFromKey = (ownerKey) => {
  if (!ownerKey) return null;
  if (ownerKey.startsWith('company-')) return 'company';
  if (ownerKey.startsWith('individual-')) return 'individual';
  return null;
};

const ownerIdFromKey = (ownerKey) => {
  if (!ownerKey) return null;
  const idx = ownerKey.indexOf('-');
  if (idx === -1) return null;
  return ownerKey.slice(idx + 1);
};

const normalizeLegalForm = (value, fallback = 'other') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'too' || normalized === 'ip' || normalized === 'individual' || normalized === 'other') {
    return normalized;
  }
  return fallback;
};

const normalizeOwnerTaxRegime = (value, ownerType = 'company') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (ownerType === 'company') {
    return normalized === 'our' ? 'our' : 'simplified';
  }
  if (normalized === 'our' || normalized === 'simplified' || normalized === 'none') {
    return normalized;
  }
  return 'none';
};

const normalizeCashTaxRegime = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'our' || normalized === 'simplified' || normalized === 'none') {
    return normalized;
  }
  return 'none';
};

const getDefaultCashTaxPercent = (ownerKey, regime) => {
  const normalizedRegime = normalizeCashTaxRegime(regime);
  if (normalizedRegime === 'none') return 0;

  const ownerType = ownerTypeFromKey(ownerKey);
  const ownerId = ownerIdFromKey(ownerKey);

  if (ownerType === 'company') {
    const company = mainStore.companies.find((item) => String(item._id) === String(ownerId));
    return getDefaultTaxPercentByName(company?.name || '', normalizedRegime);
  }

  return normalizedRegime === 'our' ? 10 : 3;
};

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(num);
};

const formatMoneyInputLive = (value) => {
  const source = String(value ?? '');
  if (!source.trim()) return '';

  const hasMinus = source.includes('-');
  const normalized = source.replace(/[^0-9,.\-]/g, '').replace(/-/g, '');
  const [rawInteger = '', ...fractionParts] = normalized.split(/[.,]/);

  const integerDigits = rawInteger.replace(/\D/g, '');
  const integerNormalized = integerDigits.replace(/^0+(?=\d)/, '');
  const groupedInteger = (integerNormalized || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const fractionDigits = fractionParts.join('').replace(/\D/g, '').slice(0, 2);
  let result = groupedInteger;
  if (fractionDigits.length > 0) result += `,${fractionDigits}`;
  if (hasMinus && result !== '0') result = `-${result}`;

  return result;
};

const parseMoney = (value) => {
  const source = String(value ?? '').trim();
  if (!source) return 0;
  const normalized = source
    .replace(/\s+/g, '')
    .replace(/[^0-9,.-]/g, '')
    .replace(/,/g, '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
};

const normalizeIinBinDigits = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 12);

const formatIinBin = (value) => {
  const digits = normalizeIinBinDigits(value);
  if (!digits) return '';
  return digits.match(/.{1,3}/g)?.join(' ') || '';
};

const COLUMN_HEADERS = Object.freeze({
  account: 'Счет',
  hidden: 'Скрыть',
  initialBalance: 'Нач баланс',
  currency: 'Валюта',
  currentBalance: 'Текущий баланс',
  owner: 'Владелец счета',
  iinBin: 'ИИН/БИН',
  legalForm: 'Форма лица',
  taxRegime: 'Режим налог',
  taxPercent: 'Ставка'
});

const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));
const textLength = (value) => String(value ?? '').trim().length;

const toPercent = (weight, totalWeight) => `${((weight / totalWeight) * 100).toFixed(3)}%`;

const growthByContent = (chars, headerChars, scale = 0.6, maxGrowth = 8) => {
  const delta = Math.max(0, Number(chars || 0) - Number(headerChars || 0));
  return clampNumber(delta * scale, 0, maxGrowth);
};

const findOptionLabel = (options, value) =>
  options.find((option) => option.value === value)?.label || '';

const normalizeSearch = (value) => String(value ?? '').toLowerCase().trim();

const accountSuggestionsList = computed(() => {
  const query = normalizeSearch(accountSuggestionQuery.value);
  if (query.length < 2) return [];

  return accountSuggestions
    .filter((item) => {
      const name = normalizeSearch(item?.name);
      const keywords = Array.isArray(item?.keywords) ? item.keywords.map(normalizeSearch) : [];
      return name.includes(query) || keywords.some((keyword) => keyword.includes(query) || keyword.startsWith(query));
    })
    .slice(0, 6);
});

const getOwnerDisplayName = (ownerKey) => {
  const ownerType = ownerTypeFromKey(ownerKey);
  const ownerId = ownerIdFromKey(ownerKey);
  if (!ownerType || !ownerId) return '';
  if (ownerType === 'company') {
    return mainStore.companies.find((item) => String(item._id) === String(ownerId))?.name || '';
  }
  return mainStore.individuals.find((item) => String(item._id) === String(ownerId))?.name || '';
};

const columnWidths = computed(() => {
  const allRows = Array.isArray(rows.value) ? rows.value : [];
  const longest = (list) => list.reduce((max, value) => Math.max(max, textLength(value)), 0);

  const accountChars = Math.max(textLength(COLUMN_HEADERS.account), longest(allRows.map((row) => row.accountName)));
  const initialBalanceChars = Math.max(
    textLength(COLUMN_HEADERS.initialBalance),
    longest(allRows.map((row) => `₸${row.initialBalanceInput || ''}`))
  );
  const currentBalanceChars = Math.max(
    textLength(COLUMN_HEADERS.currentBalance),
    longest(allRows.map((row) => `₸${formatMoney(row.currentBalance)}`))
  );
  const ownerChars = Math.max(
    textLength(COLUMN_HEADERS.owner),
    textLength('Не выбран'),
    longest(allRows.map((row) => getOwnerDisplayName(row.ownerKey))),
    longest((mainStore.companies || []).map((company) => company?.name)),
    longest((mainStore.individuals || []).map((individual) => individual?.name))
  );
  const iinBinChars = Math.max(textLength(COLUMN_HEADERS.iinBin), longest(allRows.map((row) => row.iinBin)));
  const legalFormChars = Math.max(
    textLength(COLUMN_HEADERS.legalForm),
    longest(LEGAL_FORM_OPTIONS.map((option) => option.label)),
    longest(allRows.map((row) => findOptionLabel(LEGAL_FORM_OPTIONS, row.legalForm)))
  );
  const taxRegimeChars = Math.max(
    textLength(COLUMN_HEADERS.taxRegime),
    longest(COMPANY_TAX_REGIME_OPTIONS.map((option) => option.label)),
    longest(INDIVIDUAL_TAX_REGIME_OPTIONS.map((option) => option.label)),
    longest(
      allRows.map((row) =>
        findOptionLabel(getTaxRegimeOptions(row), row.taxRegime)
      )
    )
  );
  const taxPercentChars = Math.max(
    textLength(COLUMN_HEADERS.taxPercent),
    longest(allRows.map((row) => `${row.taxPercent ?? ''}%`))
  );

  const weights = {
    account: 19 + growthByContent(accountChars, textLength(COLUMN_HEADERS.account), 0.3, 3),
    hidden: 5.5,
    initialBalance: 13 + growthByContent(initialBalanceChars, textLength(COLUMN_HEADERS.initialBalance), 0.2, 2.5),
    currency: 6.2,
    currentBalance: 13 + growthByContent(currentBalanceChars, textLength(COLUMN_HEADERS.currentBalance), 0.2, 2.5),
    owner: 15 + growthByContent(ownerChars, textLength(COLUMN_HEADERS.owner), 0.28, 3),
    iinBin: 11 + growthByContent(iinBinChars, textLength(COLUMN_HEADERS.iinBin), 0.3, 2),
    legalForm: 8 + growthByContent(legalFormChars, textLength(COLUMN_HEADERS.legalForm), 0.25, 1.5),
    taxRegime: 10 + growthByContent(taxRegimeChars, textLength(COLUMN_HEADERS.taxRegime), 0.3, 2),
    taxPercent: 5.5 + growthByContent(taxPercentChars, textLength(COLUMN_HEADERS.taxPercent), 0.25, 1),
    delete: 7
  };

  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);

  return {
    account: toPercent(weights.account, totalWeight),
    hidden: toPercent(weights.hidden, totalWeight),
    initialBalance: toPercent(weights.initialBalance, totalWeight),
    currency: toPercent(weights.currency, totalWeight),
    currentBalance: toPercent(weights.currentBalance, totalWeight),
    owner: toPercent(weights.owner, totalWeight),
    iinBin: toPercent(weights.iinBin, totalWeight),
    legalForm: toPercent(weights.legalForm, totalWeight),
    taxRegime: toPercent(weights.taxRegime, totalWeight),
    taxPercent: toPercent(weights.taxPercent, totalWeight),
    delete: toPercent(weights.delete, totalWeight)
  };
});

const currentBalanceMap = computed(() => {
  const map = new Map();
  (mainStore.currentAccountBalances || []).forEach((acc) => {
    map.set(String(acc._id), Number(acc.balance || 0));
  });
  return map;
});

const getOwnerMetaByKey = (ownerKey) => {
  const ownerType = ownerTypeFromKey(ownerKey);
  const ownerId = ownerIdFromKey(ownerKey);

  if (!ownerType || !ownerId) {
    return {
      identificationNumber: '',
      legalForm: 'other',
      taxRegime: 'none',
      taxPercent: 0
    };
  }

  if (ownerType === 'company') {
    const company = mainStore.companies.find((item) => String(item._id) === String(ownerId));
    const taxRegime = normalizeOwnerTaxRegime(company?.taxRegime, 'company');
    const taxPercent = company?.taxPercent != null
      ? Number(company.taxPercent)
      : getDefaultTaxPercentByName(company?.name || '', taxRegime);

    return {
      identificationNumber: company?.identificationNumber || '',
      legalForm: normalizeLegalForm(company?.legalForm, normalizeLegalForm(detectCompanyLegalForm(company?.name || ''), 'other')),
      taxRegime,
      taxPercent: Number.isFinite(taxPercent) ? taxPercent : 0
    };
  }

  const individual = mainStore.individuals.find((item) => String(item._id) === String(ownerId));
  const taxRegime = normalizeOwnerTaxRegime(individual?.taxRegime, 'individual');
  const defaultTaxPercent = taxRegime === 'our' ? 10 : taxRegime === 'simplified' ? 3 : 0;

  return {
    identificationNumber: individual?.identificationNumber || '',
    legalForm: normalizeLegalForm(individual?.legalForm, 'individual'),
    taxRegime,
    taxPercent: individual?.taxPercent != null ? Number(individual.taxPercent) : defaultTaxPercent
  };
};

const buildRows = () => {
  const previousRowsById = new Map(
    (rows.value || []).map((row) => [String(row._id), row])
  );

  const sortedAccounts = [...(mainStore.accounts || [])].sort(
    (a, b) => Number(a?.order || 0) - Number(b?.order || 0)
  );

  rows.value = sortedAccounts.map((account, index) => {
    const companyId = account?.companyId && typeof account.companyId === 'object'
      ? account.companyId._id
      : account?.companyId;

    const individualId = account?.individualId && typeof account.individualId === 'object'
      ? account.individualId._id
      : account?.individualId;

    const ownerKey = companyId
      ? `company-${companyId}`
      : individualId
        ? `individual-${individualId}`
        : '';

    const ownerMeta = getOwnerMetaByKey(ownerKey);
    const isCashRegister = !!account?.isCashRegister;
    const cashTaxRegime = normalizeCashTaxRegime(account?.taxRegime);
    const rawCashTaxPercent = Number(account?.taxPercent);
    const effectiveTaxRegime = isCashRegister ? cashTaxRegime : ownerMeta.taxRegime;
    const effectiveTaxPercent = isCashRegister
      ? (
        Number.isFinite(rawCashTaxPercent)
          ? rawCashTaxPercent
          : getDefaultCashTaxPercent(ownerKey, cashTaxRegime)
      )
      : ownerMeta.taxPercent;
    const baseRow = {
      _id: account._id,
      order: Number(account.order || index),
      accountName: account.name || '',
      isExcluded: !!account.isExcluded,
      isCashRegister,
      initialBalanceInput: formatMoney(account.initialBalance || 0),
      currency: 'KZT',
      currentBalance: currentBalanceMap.value.get(String(account._id)) ?? Number(account.initialBalance || 0),
      ownerKey,
      iinBin: formatIinBin(ownerMeta.identificationNumber),
      legalForm: ownerMeta.legalForm,
      taxRegime: effectiveTaxRegime,
      taxPercent: effectiveTaxPercent,
      lastOwnerKey: ownerKey,
      ownerCreationType: null,
      ownerCreationName: ''
    };

    const previous = previousRowsById.get(String(account._id));
    if (!previous) return baseRow;

    return {
      ...baseRow,
      accountName: previous.accountName ?? baseRow.accountName,
      isExcluded: typeof previous.isExcluded === 'boolean' ? previous.isExcluded : baseRow.isExcluded,
      isCashRegister: typeof previous.isCashRegister === 'boolean' ? previous.isCashRegister : baseRow.isCashRegister,
      initialBalanceInput: previous.initialBalanceInput ?? baseRow.initialBalanceInput,
      currency: previous.currency || baseRow.currency,
      ownerKey: previous.ownerKey ?? baseRow.ownerKey,
      iinBin: previous.iinBin ?? baseRow.iinBin,
      legalForm: previous.legalForm ?? baseRow.legalForm,
      taxRegime: previous.taxRegime ?? baseRow.taxRegime,
      taxPercent: previous.taxPercent ?? baseRow.taxPercent,
      lastOwnerKey: previous.lastOwnerKey ?? previous.ownerKey ?? baseRow.ownerKey,
      ownerCreationType: previous.ownerCreationType || null,
      ownerCreationName: previous.ownerCreationName || ''
    };
  });
};

const getTaxRegimeOptions = (row) => {
  if (row?.isCashRegister) return CASH_TAX_REGIME_OPTIONS;
  return ownerTypeFromKey(row.ownerKey) === 'company'
    ? COMPANY_TAX_REGIME_OPTIONS
    : INDIVIDUAL_TAX_REGIME_OPTIONS;
};

const focusOwnerCreateInput = async (row) => {
  await nextTick();
  const selector = `[data-owner-create-id="owner-create-${String(row?._id || '')}"]`;
  const inputEl = document.querySelector(selector);
  if (inputEl && typeof inputEl.focus === 'function') {
    inputEl.focus();
    if (typeof inputEl.select === 'function') inputEl.select();
  }
};

const startOwnerInlineCreate = (row, ownerType) => {
  row.ownerCreationType = ownerType;
  row.ownerCreationName = '';
  row.ownerKey = row.lastOwnerKey || '';
  void focusOwnerCreateInput(row);
};

const cancelOwnerInlineCreate = (row) => {
  row.ownerCreationType = null;
  row.ownerCreationName = '';
  row.ownerKey = row.lastOwnerKey || '';
};

const saveOwnerInlineCreate = async (row) => {
  if (!row?.ownerCreationType || isCreatingOwner.value) return;

  const rowId = row._id;
  const ownerType = row.ownerCreationType;
  const name = String(row.ownerCreationName || '').trim();
  if (!name) {
    saveError.value = 'Введите название владельца';
    setTimeout(() => { saveError.value = ''; }, 2000);
    void focusOwnerCreateInput(row);
    return;
  }

  saveError.value = '';
  saveMessage.value = '';

  // Сначала закрываем инлайн-режим, чтобы watch/buildRows не "вернул" его обратно.
  row.ownerCreationType = null;
  row.ownerCreationName = '';
  row.ownerKey = row.lastOwnerKey || '';

  try {
    isCreatingOwner.value = true;
    const owner = ownerType === 'company'
      ? await mainStore.addCompany({ name })
      : await mainStore.addIndividual({ name });

    const ownerKey = ownerType === 'company'
      ? `company-${owner._id}`
      : `individual-${owner._id}`;

    const targetRow = rows.value.find((item) => String(item._id) === String(rowId));
    if (targetRow) {
      targetRow.ownerCreationType = null;
      targetRow.ownerCreationName = '';
      targetRow.ownerKey = ownerKey;
      targetRow.lastOwnerKey = ownerKey;
      onOwnerChange(targetRow);
    }

    saveMessage.value = ownerType === 'company' ? 'Компания создана' : 'Физлицо создано';
  } catch (err) {
    const targetRow = rows.value.find((item) => String(item._id) === String(rowId));
    if (targetRow) {
      targetRow.ownerCreationType = ownerType;
      targetRow.ownerCreationName = name;
      targetRow.ownerKey = targetRow.lastOwnerKey || '';
      void focusOwnerCreateInput(targetRow);
    }
    saveError.value = `Ошибка создания владельца: ${err?.message || 'Неизвестная ошибка'}`;
  } finally {
    isCreatingOwner.value = false;
    setTimeout(() => {
      saveMessage.value = '';
      saveError.value = '';
    }, 2500);
  }
};

const onOwnerChange = (row) => {
  if (row.ownerKey === CREATE_OWNER_COMPANY_VALUE) {
    startOwnerInlineCreate(row, 'company');
    return;
  }
  if (row.ownerKey === CREATE_OWNER_INDIVIDUAL_VALUE) {
    startOwnerInlineCreate(row, 'individual');
    return;
  }

  row.lastOwnerKey = row.ownerKey || '';
  row.ownerCreationType = null;
  row.ownerCreationName = '';

  const ownerMeta = getOwnerMetaByKey(row.ownerKey);
  row.iinBin = formatIinBin(ownerMeta.identificationNumber);
  row.legalForm = ownerMeta.legalForm;
  if (row.isCashRegister) {
    row.taxRegime = normalizeCashTaxRegime(row.taxRegime);
    if (row.taxRegime === 'none') {
      row.taxPercent = 0;
    } else if (!Number.isFinite(Number(row.taxPercent))) {
      row.taxPercent = getDefaultCashTaxPercent(row.ownerKey, row.taxRegime);
    }
    return;
  }

  row.taxRegime = ownerMeta.taxRegime;
  row.taxPercent = ownerMeta.taxPercent;
};

const onIinBinInput = (row) => {
  row.iinBin = formatIinBin(row.iinBin);
};

const onAccountNameFocus = (row) => {
  if (accountSuggestionBlurTimer) {
    clearTimeout(accountSuggestionBlurTimer);
    accountSuggestionBlurTimer = null;
  }
  activeAccountSuggestionRowId.value = row?._id || null;
  accountSuggestionQuery.value = row?.accountName || '';
};

const onAccountNameInput = (row) => {
  activeAccountSuggestionRowId.value = row?._id || null;
  accountSuggestionQuery.value = row?.accountName || '';
};

const onAccountNameBlur = () => {
  accountSuggestionBlurTimer = setTimeout(() => {
    activeAccountSuggestionRowId.value = null;
    accountSuggestionQuery.value = '';
    accountSuggestionBlurTimer = null;
  }, 180);
};

const isAccountSuggestionOpen = (row) =>
  activeAccountSuggestionRowId.value === row?._id && accountSuggestionsList.value.length > 0;

const selectAccountSuggestion = (row, suggestion) => {
  if (!row || !suggestion) return;
  row.accountName = suggestion.name;
  accountSuggestionQuery.value = suggestion.name;
  activeAccountSuggestionRowId.value = null;
};

const onInitialBalanceFocus = (row, event) => {
  const normalized = String(row?.initialBalanceInput || '').replace(/\s+/g, '');
  if (normalized === '0' || normalized === '0,00' || normalized === '0.00') {
    row.initialBalanceInput = '';
  } else {
    const inputEl = event?.target;
    if (inputEl && typeof inputEl.select === 'function') {
      setTimeout(() => inputEl.select(), 0);
    }
  }
};

const onInitialBalanceInput = (row) => {
  row.initialBalanceInput = formatMoneyInputLive(row.initialBalanceInput);
};

const onInitialBalanceBlur = (row) => {
  row.initialBalanceInput = formatMoney(parseMoney(row.initialBalanceInput));
};

const onTaxRegimeChange = (row) => {
  if (row?.isCashRegister) {
    const normalizedRegime = normalizeCashTaxRegime(row.taxRegime);
    row.taxRegime = normalizedRegime;
    row.taxPercent = normalizedRegime === 'none'
      ? 0
      : getDefaultCashTaxPercent(row.ownerKey, normalizedRegime);
    return;
  }

  const ownerType = ownerTypeFromKey(row.ownerKey);
  const normalizedRegime = normalizeOwnerTaxRegime(row.taxRegime, ownerType || 'individual');
  row.taxRegime = normalizedRegime;

  if (ownerType === 'company') {
    const ownerId = ownerIdFromKey(row.ownerKey);
    const company = mainStore.companies.find((item) => String(item._id) === String(ownerId));
    row.taxPercent = getDefaultTaxPercentByName(company?.name || '', normalizedRegime);
    return;
  }

  row.taxPercent = normalizedRegime === 'our' ? 10 : normalizedRegime === 'simplified' ? 3 : 0;
};

const addAccountRow = async (kind = 'account') => {
  if (isSaving.value) return;

  saveMessage.value = '';
  saveError.value = '';

  try {
    isSaving.value = true;
    const isCashRegister = kind === 'cash';
    await mainStore.addAccount({
      name: isCashRegister ? 'Новая касса' : 'Новый счет',
      initialBalance: 0,
      isExcluded: false,
      isCashRegister
    });
    saveMessage.value = isCashRegister ? 'Касса добавлена' : 'Счет добавлен';
  } catch (err) {
    saveError.value = `Ошибка добавления: ${err?.message || 'Неизвестная ошибка'}`;
  } finally {
    isSaving.value = false;
    setTimeout(() => {
      saveMessage.value = '';
      saveError.value = '';
    }, 2500);
  }
};

const openDeleteDialog = (row) => {
  if (!row?._id || isSaving.value || isDeletingAccount.value) return;
  deleteCandidate.value = row;
  showDeletePopup.value = true;
};

const cancelDelete = () => {
  if (isDeletingAccount.value) return;
  showDeletePopup.value = false;
  deleteCandidate.value = null;
};

const confirmDeleteAccount = async (deleteOperations = false) => {
  if (!deleteCandidate.value?._id || isDeletingAccount.value) return;

  const accountId = deleteCandidate.value._id;
  saveMessage.value = '';
  saveError.value = '';

  try {
    isDeletingAccount.value = true;
    await mainStore.deleteEntity('accounts', accountId, !!deleteOperations);
    saveMessage.value = 'Счет удален';
    showDeletePopup.value = false;
    deleteCandidate.value = null;
  } catch (err) {
    const backendMessage = err?.response?.data?.message;
    saveError.value = `Ошибка удаления счета: ${backendMessage || err?.message || 'Неизвестная ошибка'}`;
  } finally {
    isDeletingAccount.value = false;
    setTimeout(() => {
      saveMessage.value = '';
      saveError.value = '';
    }, 2500);
  }
};

const saveSettings = async () => {
  if (isSaving.value) return;

  saveMessage.value = '';
  saveError.value = '';

  try {
    isSaving.value = true;

    const accountsById = new Map((mainStore.accounts || []).map((item) => [String(item._id), item]));
    const companiesById = new Map((mainStore.companies || []).map((item) => [String(item._id), item]));
    const individualsById = new Map((mainStore.individuals || []).map((item) => [String(item._id), item]));

    const accountPayload = rows.value
      .map((row, index) => {
        const source = accountsById.get(String(row._id));
        if (!source) return null;

        const ownerType = ownerTypeFromKey(row.ownerKey);
        const ownerId = ownerIdFromKey(row.ownerKey);
        const cashTaxRegime = row.isCashRegister ? normalizeCashTaxRegime(row.taxRegime) : null;
        const parsedCashTaxPercent = Number(row.taxPercent);
        const cashTaxPercent = row.isCashRegister
          ? (
            cashTaxRegime === 'none'
              ? 0
              : (
                Number.isFinite(parsedCashTaxPercent)
                  ? parsedCashTaxPercent
                  : getDefaultCashTaxPercent(row.ownerKey, cashTaxRegime)
              )
          )
          : null;

        return {
          ...source,
          order: Number(source.order ?? index),
          name: String(row.accountName || '').trim() || 'Без названия',
          isExcluded: !!row.isExcluded,
          isCashRegister: !!row.isCashRegister,
          initialBalance: parseMoney(row.initialBalanceInput),
          companyId: ownerType === 'company' ? ownerId : null,
          individualId: ownerType === 'individual' ? ownerId : null,
          taxRegime: cashTaxRegime,
          taxPercent: cashTaxPercent,
          currency: 'KZT'
        };
      })
      .filter(Boolean);

    const companyUpdates = new Map();
    const individualUpdates = new Map();

    rows.value.forEach((row) => {
      const ownerType = ownerTypeFromKey(row.ownerKey);
      const ownerId = ownerIdFromKey(row.ownerKey);
      const iinBinDigits = normalizeIinBinDigits(row.iinBin);
      if (!ownerType || !ownerId) return;

      if (ownerType === 'company') {
        const source = companiesById.get(String(ownerId));
        if (!source) return;

        const taxRegime = row.isCashRegister
          ? normalizeOwnerTaxRegime(source.taxRegime, 'company')
          : normalizeOwnerTaxRegime(row.taxRegime, 'company');
        const fallbackTaxPercent = getDefaultTaxPercentByName(source.name || '', taxRegime);
        const parsedTaxPercent = row.isCashRegister
          ? Number(source.taxPercent)
          : Number(row.taxPercent);

        companyUpdates.set(String(ownerId), {
          ...source,
          identificationNumber: iinBinDigits,
          legalForm: normalizeLegalForm(row.legalForm, normalizeLegalForm(detectCompanyLegalForm(source.name || ''), 'other')),
          taxRegime,
          taxPercent: Number.isFinite(parsedTaxPercent) ? parsedTaxPercent : fallbackTaxPercent
        });
        return;
      }

      const source = individualsById.get(String(ownerId));
      if (!source) return;

      const taxRegime = row.isCashRegister
        ? normalizeOwnerTaxRegime(source.taxRegime, 'individual')
        : normalizeOwnerTaxRegime(row.taxRegime, 'individual');
      const fallbackTaxPercent = taxRegime === 'our' ? 10 : taxRegime === 'simplified' ? 3 : 0;
      const parsedTaxPercent = row.isCashRegister
        ? Number(source.taxPercent)
        : Number(row.taxPercent);

      individualUpdates.set(String(ownerId), {
        ...source,
        identificationNumber: iinBinDigits,
        legalForm: normalizeLegalForm(row.legalForm, 'individual'),
        taxRegime,
        taxPercent: Number.isFinite(parsedTaxPercent) ? parsedTaxPercent : fallbackTaxPercent
      });
    });

    await mainStore.batchUpdateEntities('accounts', accountPayload);

    if (companyUpdates.size > 0) {
      await mainStore.batchUpdateEntities('companies', Array.from(companyUpdates.values()));
    }

    if (individualUpdates.size > 0) {
      await mainStore.batchUpdateEntities('individuals', Array.from(individualUpdates.values()));
    }

    saveMessage.value = 'Изменения сохранены';
  } catch (err) {
    saveError.value = `Ошибка сохранения: ${err?.message || 'Неизвестная ошибка'}`;
  } finally {
    isSaving.value = false;
    setTimeout(() => {
      saveMessage.value = '';
      saveError.value = '';
    }, 2500);
  }
};

watch(
  () => [mainStore.accounts, mainStore.companies, mainStore.individuals, mainStore.currentAccountBalances],
  () => {
    buildRows();
  },
  { deep: true, immediate: true }
);
</script>

<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="editor-modal">
      <div class="modal-header">
        <h2>Редактор</h2>

        <div class="header-actions">
          <button class="btn-save" :disabled="isSaving || isDeletingAccount" @click="saveSettings">
            {{ isSaving ? 'Сохранение...' : 'Сохранить' }}
          </button>
          <button class="close-btn" @click="closeModal" aria-label="Закрыть">&times;</button>
        </div>
      </div>

      <div class="modal-body">
        <div v-if="saveMessage || saveError" class="status-row">
          <span v-if="saveMessage" class="status-text success">{{ saveMessage }}</span>
          <span v-if="saveError" class="status-text error">{{ saveError }}</span>
        </div>

        <div class="table-wrap">
          <table class="settings-table">
            <colgroup>
              <col class="col-account" :style="{ width: columnWidths.account }" />
              <col class="col-hidden" :style="{ width: columnWidths.hidden }" />
              <col class="col-initial-balance" :style="{ width: columnWidths.initialBalance }" />
              <col class="col-currency" :style="{ width: columnWidths.currency }" />
              <col class="col-current-balance" :style="{ width: columnWidths.currentBalance }" />
              <col class="col-owner" :style="{ width: columnWidths.owner }" />
              <col class="col-iin-bin" :style="{ width: columnWidths.iinBin }" />
              <col class="col-legal-form" :style="{ width: columnWidths.legalForm }" />
              <col class="col-tax-regime" :style="{ width: columnWidths.taxRegime }" />
              <col class="col-tax-percent" :style="{ width: columnWidths.taxPercent }" />
              <col class="col-delete" :style="{ width: columnWidths.delete }" />
            </colgroup>
            <thead>
              <tr>
                <th>Счет</th>
                <th>Скрыть</th>
                <th>Нач баланс</th>
                <th>Валюта</th>
                <th>Текущий баланс</th>
                <th>Владелец счета</th>
                <th>ИИН/БИН</th>
                <th>Форма лица</th>
                <th>Режим налог</th>
                <th>Ставка</th>
                <th class="delete-header-cell">Удалить</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="row in rows" :key="row._id" :class="{ 'is-hidden': row.isExcluded }">
                <td class="account-cell">
                  <div class="account-input-wrap">
                    <input
                      v-model="row.accountName"
                      type="text"
                      class="cell-input"
                      autocomplete="off"
                      @focus="onAccountNameFocus(row)"
                      @input="onAccountNameInput(row)"
                      @blur="onAccountNameBlur"
                    />
                    <ul v-if="isAccountSuggestionOpen(row)" class="account-suggestions-list">
                      <li
                        v-for="(suggestion, idx) in accountSuggestionsList"
                        :key="`${row._id}-acc-suggestion-${idx}`"
                        @mousedown.prevent="selectAccountSuggestion(row, suggestion)"
                      >
                        {{ suggestion.name }}
                      </li>
                    </ul>
                  </div>
                </td>

                <td class="center-cell">
                  <button
                    type="button"
                    class="visibility-btn"
                    :class="{ active: !row.isExcluded }"
                    :title="row.isExcluded ? 'Показать счет' : 'Скрыть счет'"
                    @click="row.isExcluded = !row.isExcluded"
                  >
                    <svg
                      v-if="!row.isExcluded"
                      class="eye-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <svg
                      v-else
                      class="eye-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="2" y1="22" x2="22" y2="2" />
                    </svg>
                  </button>
                </td>

                <td>
                  <div class="money-input-wrap">
                    <span class="money-currency">₸</span>
                    <input
                      v-model="row.initialBalanceInput"
                      type="text"
                      inputmode="decimal"
                      class="cell-input money-input"
                      @focus="onInitialBalanceFocus(row, $event)"
                      @input="onInitialBalanceInput(row)"
                      @blur="onInitialBalanceBlur(row)"
                    />
                  </div>
                </td>

                <td class="currency-cell">
                  <select v-model="row.currency" class="cell-select currency-select">
                    <option value="KZT">KZT</option>
                  </select>
                </td>

                <td>
                  <div class="readonly-cell">₸{{ formatMoney(row.currentBalance) }}</div>
                </td>

                <td class="owner-cell">
                  <template v-if="!row.ownerCreationType">
                    <select v-model="row.ownerKey" class="cell-select" @change="onOwnerChange(row)">
                      <option value="">Не выбран</option>
                      <optgroup label="Компании">
                        <option
                          v-for="company in mainStore.companies"
                          :key="`company-${company._id}`"
                          :value="`company-${company._id}`"
                        >
                          {{ company.name }}
                        </option>
                        <option :value="CREATE_OWNER_COMPANY_VALUE">+ Создать компанию</option>
                      </optgroup>
                      <optgroup label="Физлица">
                        <option
                          v-for="individual in mainStore.individuals"
                          :key="`individual-${individual._id}`"
                          :value="`individual-${individual._id}`"
                        >
                          {{ individual.name }}
                        </option>
                        <option :value="CREATE_OWNER_INDIVIDUAL_VALUE">+ Создать физлицо</option>
                      </optgroup>
                    </select>
                  </template>
                  <template v-else>
                    <div class="owner-create-inline">
                      <input
                        v-model="row.ownerCreationName"
                        type="text"
                        class="owner-create-input"
                        :placeholder="row.ownerCreationType === 'company' ? 'Название компании' : 'Имя физлица'"
                        :data-owner-create-id="`owner-create-${row._id}`"
                        @keyup.enter="saveOwnerInlineCreate(row)"
                        @keyup.esc="cancelOwnerInlineCreate(row)"
                      />
                      <button
                        type="button"
                        class="owner-inline-btn owner-inline-save"
                        :disabled="isCreatingOwner"
                        title="Создать"
                        @click="saveOwnerInlineCreate(row)"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        class="owner-inline-btn owner-inline-cancel"
                        :disabled="isCreatingOwner"
                        title="Отмена"
                        @click="cancelOwnerInlineCreate(row)"
                      >
                        ✕
                      </button>
                    </div>
                  </template>
                </td>

                <td>
                  <input
                    v-model="row.iinBin"
                    type="text"
                    inputmode="numeric"
                    maxlength="15"
                    class="cell-input iin-input"
                    placeholder="000 000 000 000"
                    @input="onIinBinInput(row)"
                  />
                </td>

                <td>
                  <select v-model="row.legalForm" class="cell-select">
                    <option
                      v-for="option in LEGAL_FORM_OPTIONS"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </td>

                <td>
                  <select
                    v-model="row.taxRegime"
                    class="cell-select"
                    @change="onTaxRegimeChange(row)"
                  >
                    <option
                      v-for="option in getTaxRegimeOptions(row)"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </td>

                <td>
                  <input v-model.number="row.taxPercent" type="number" step="0.01" class="cell-input" />
                </td>

                <td class="delete-cell">
                  <button
                    type="button"
                    class="row-delete-btn"
                    :disabled="isSaving || isDeletingAccount"
                    title="Удалить счет"
                    @click="openDeleteDialog(row)"
                  >
                    <svg
                      class="delete-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </td>
              </tr>

              <tr>
                <td class="add-row add-row-account">
                  <div class="add-actions">
                    <button class="add-btn" :disabled="isSaving" @click="addAccountRow('account')">+ Счет</button>
                    <button class="add-btn" :disabled="isSaving" @click="addAccountRow('cash')">+ Касса</button>
                  </div>
                </td>
                <td class="add-row-empty" colspan="10"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="showDeletePopup" class="inner-overlay" @click.self="cancelDelete">
        <div class="delete-confirm-box">
          <div v-if="isDeletingAccount" class="deleting-state">
            <h4>Удаление...</h4>
            <p class="sub-note">Пожалуйста, подождите, обновляем данные.</p>
            <div class="progress-container">
              <div class="progress-bar"></div>
            </div>
          </div>
          <div v-else>
            <h4>Удалить счет?</h4>
            <p>
              Вы собираетесь удалить
              <strong>«{{ deleteCandidate?.accountName || 'Без названия' }}»</strong>.
              <br />
              Что делать со связанными операциями?
            </p>
            <div class="delete-actions">
              <button class="btn-choice btn-keep" @click="confirmDeleteAccount(false)">
                <span class="main-text">Только счет</span>
                <span class="sub-text">Операции останутся (связь исчезнет)</span>
              </button>
              <button class="btn-choice btn-nuke" @click="confirmDeleteAccount(true)">
                <span class="main-text">Счет + операции</span>
                <span class="sub-text">Удалится всё безвозвратно</span>
              </button>
            </div>
            <button class="btn-cancel" @click="cancelDelete">Отмена</button>
          </div>
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
  --editor-readonly-bg: var(--color-background-soft);
  --editor-cell-text: var(--text-main, var(--color-text));
  --editor-muted-text: var(--text-soft, var(--color-heading));
  --editor-placeholder: var(--text-mute, #8b8b8b);

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

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-background-soft);
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
  gap: 12px;
}

.btn-save {
  height: 30px;
  min-width: 108px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-sm, 13px);
  font-weight: var(--fw-semi, 600);
  cursor: pointer;
  transition: opacity 0.2s, filter 0.2s;
}

.btn-save:hover:not(:disabled) {
  filter: brightness(1.05);
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: default;
}

.close-btn {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--editor-muted-text);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--editor-cell-text);
}

.modal-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  min-height: 0;
}

.status-row {
  min-height: 30px;
  padding: 6px 16px;
  display: flex;
  align-items: center;
}

.status-text {
  font-size: var(--font-sm, 13px);
  font-weight: var(--fw-semi, 600);
}

.status-text.success {
  color: #10b981;
}

.status-text.error {
  color: #ef4444;
}

.table-wrap {
  flex: 1;
  overflow: auto;
  border-top: 1px solid var(--editor-border);
  background: var(--editor-row-bg);
}

.settings-table {
  width: 100%;
  min-width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  color: var(--editor-cell-text);
}

.settings-table th,
.settings-table td {
  border: 1px solid var(--editor-border);
  padding: 0;
  min-width: 0;
  height: 46px;
  background: var(--editor-row-bg);
  color: var(--editor-cell-text);
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
  font-size: 14px;
  font-weight: var(--fw-semi, 600);
  padding: 0 10px;
  text-align: left;
  white-space: nowrap;
  letter-spacing: 0.01em;
}

.settings-table th::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  border-bottom: 1px solid var(--editor-border);
}

.settings-table th:nth-child(2),
.settings-table td:nth-child(2),
.settings-table th:nth-child(4),
.settings-table td:nth-child(4),
.settings-table th:nth-child(11),
.settings-table td:nth-child(11) {
  text-align: center;
}

.settings-table th:nth-child(4) {
  text-align: left !important;
}

.settings-table th:nth-child(5) {
  text-align: right !important;
}

.settings-table th:nth-child(1),
.settings-table td:nth-child(1) { min-width: 120px; }

.settings-table th:nth-child(2),
.settings-table td:nth-child(2) { min-width: 64px; }

.settings-table th:nth-child(3),
.settings-table td:nth-child(3),
.settings-table th:nth-child(5),
.settings-table td:nth-child(5) {
  min-width: 150px;
}

.settings-table th:nth-child(4),
.settings-table td:nth-child(4) { min-width: 86px; }

.settings-table th:nth-child(6),
.settings-table td:nth-child(6) { min-width: 140px; }

.settings-table th:nth-child(7),
.settings-table td:nth-child(7) { min-width: 132px; }

.settings-table th:nth-child(8),
.settings-table td:nth-child(8) { min-width: 94px; }

.settings-table th:nth-child(9),
.settings-table td:nth-child(9) { min-width: 108px; }

.settings-table th:nth-child(10),
.settings-table td:nth-child(10) { min-width: 70px; }

.settings-table th:nth-child(11),
.settings-table td:nth-child(11) { min-width: 74px; }

.cell-input,
.cell-select {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  padding: 0 12px;
  color: var(--editor-cell-text);
  font-size: 14px;
  font-weight: var(--fw-medium, 500);
  outline: none;
  margin: 0;
  border-radius: 0;
}

.iin-input {
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  text-align: left;
  padding-right: 12px;
}

.cell-input::placeholder {
  color: var(--editor-placeholder);
}

.cell-select {
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding-right: 34px;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--editor-muted-text) 50%),
    linear-gradient(135deg, var(--editor-muted-text) 50%, transparent 50%);
  background-position:
    calc(100% - 15px) calc(50% + 1px),
    calc(100% - 10px) calc(50% + 1px);
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}

.cell-select option,
.cell-select optgroup {
  color: var(--editor-cell-text);
  background: var(--editor-row-bg);
}

.currency-cell {
  text-align: center;
}

.currency-select {
  font-weight: var(--fw-semi, 600);
  letter-spacing: 0.02em;
  padding-right: 24px;
  background-position:
    calc(100% - 12px) calc(50% + 1px),
    calc(100% - 8px) calc(50% + 1px);
}

.account-cell {
  overflow: visible;
}

.account-input-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.account-suggestions-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow-y: auto;
  z-index: 2100;
  border: 1px solid var(--color-border);
  border-top: none;
  background: var(--color-background);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}

.account-suggestions-list li {
  padding: 8px 10px;
  font-size: 13px;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

.account-suggestions-list li:last-child {
  border-bottom: none;
}

.account-suggestions-list li:hover {
  background: var(--color-background-soft);
}

.owner-cell {
  overflow: visible;
}

.owner-create-inline {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
}

.owner-create-input {
  flex: 1;
  min-width: 0;
  height: 30px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  padding: 0 9px;
  font-size: 13px;
}

.owner-create-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.owner-inline-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  padding: 0;
  line-height: 1;
}

.owner-inline-btn:hover:not(:disabled) {
  background: var(--color-background-mute);
}

.owner-inline-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.owner-inline-save {
  border-color: rgba(52, 199, 89, 0.45);
  color: #34c759;
}

.owner-inline-save:hover:not(:disabled) {
  background: rgba(52, 199, 89, 0.12);
}

.owner-inline-cancel {
  border-color: rgba(255, 59, 48, 0.4);
  color: #ff3b30;
}

.owner-inline-cancel:hover:not(:disabled) {
  background: rgba(255, 59, 48, 0.1);
}

.money-input-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 10px;
}

.money-currency {
  position: static;
  color: var(--editor-muted-text);
  font-size: 13px;
  font-weight: var(--fw-semi, 600);
  pointer-events: none;
  flex: 0 0 auto;
}

.money-input {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  padding: 0;
  text-align: left;
  font-variant-numeric: tabular-nums;
}

.cell-input:focus,
.cell-select:focus {
  background: rgba(52, 199, 89, 0.12);
}

.readonly-cell {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 12px;
  font-size: 14px;
  font-weight: var(--fw-semi, 600);
  color: var(--editor-cell-text);
  background: var(--editor-readonly-bg);
  font-variant-numeric: tabular-nums;
}

.center-cell {
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.visibility-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--btn-widget-border, var(--editor-border));
  background: var(--btn-widget-bg, var(--editor-row-alt-bg));
  color: var(--btn-widget-color, var(--editor-muted-text));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  transition: all 0.18s ease;
}

.visibility-btn:hover {
  border-color: var(--color-border-hover, var(--editor-border));
  background: var(--btn-widget-bg-hover, var(--editor-readonly-bg));
  color: var(--btn-widget-color-hover, var(--editor-cell-text));
}

.visibility-btn.active {
  background: var(--btn-widget-bg-active, var(--color-primary));
  border-color: var(--btn-widget-border-active, transparent);
  color: var(--btn-widget-color-active, #fff);
}

.eye-icon {
  width: 14px;
  height: 14px;
  display: block;
}

tr.is-hidden td {
  background: var(--editor-row-alt-bg);
}

tr.is-hidden .cell-input,
tr.is-hidden .cell-select,
tr.is-hidden .readonly-cell {
  color: var(--editor-muted-text);
  opacity: 0.82;
}

tr.is-hidden .money-currency {
  opacity: 0.72;
}

.delete-cell {
  text-align: center;
}

.delete-header-cell {
  text-align: center !important;
  font-size: 12px !important;
  font-weight: var(--fw-semi, 600) !important;
}

.row-delete-btn {
  width: 28px;
  height: 28px;
  margin: 0 auto;
  border-radius: 6px;
  border: 1px solid var(--editor-border);
  background: transparent;
  color: var(--editor-muted-text);
  padding: 0;
  cursor: pointer;
  transition: all 0.18s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.delete-icon {
  width: 14px;
  height: 14px;
  display: block;
}

.row-delete-btn:hover:not(:disabled) {
  border-color: #ff3b30;
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.row-delete-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.inner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4000;
}

.delete-confirm-box {
  background: var(--color-background);
  padding: 20px;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
  text-align: center;
  border: 1px solid var(--color-border);
}

.delete-confirm-box h4 {
  margin: 0 0 10px;
  color: var(--color-heading);
  font-size: 18px;
  font-weight: var(--fw-semi, 600);
}

.delete-confirm-box p {
  color: var(--color-text-soft);
  font-size: 14px;
  margin-bottom: 20px;
  line-height: 1.4;
}

.delete-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 15px;
}

.btn-choice {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
  padding: 12px;
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  transition: border-color 0.2s, background 0.2s;
}

.btn-choice:hover {
  border-color: var(--color-border-hover);
  background: var(--color-background-mute);
}

.btn-choice .main-text {
  font-weight: var(--fw-semi, 600);
  color: var(--color-text);
  font-size: 15px;
  margin-bottom: 2px;
}

.btn-choice .sub-text {
  font-size: 12px;
  color: var(--color-text-soft);
}

.btn-nuke:hover {
  border-color: #ff3b30;
  background: rgba(255, 59, 48, 0.12);
}

.btn-nuke .main-text {
  color: #ff3b30;
}

.btn-cancel {
  background: none;
  border: none;
  color: var(--color-text-soft);
  cursor: pointer;
  font-size: 14px;
  text-decoration: underline;
}

.btn-cancel:hover {
  color: var(--color-text);
}

.deleting-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem 0;
}

.sub-note {
  font-size: 13px;
  color: var(--color-text-soft);
  margin-top: -5px;
  margin-bottom: 20px;
}

.progress-container {
  width: 100%;
  height: 6px;
  background-color: var(--color-background-soft);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.progress-bar {
  width: 100%;
  height: 100%;
  background-color: var(--color-heading);
  position: absolute;
  left: -100%;
  animation: indeterminate 1.5s infinite ease-in-out;
}

@keyframes indeterminate {
  0% { left: -100%; width: 50%; }
  50% { left: 25%; width: 50%; }
  100% { left: 100%; width: 50%; }
}

.add-row {
  padding: 0;
  background: var(--editor-row-bg);
}

.add-row-account {
  overflow: hidden;
}

.add-row-empty {
  background: var(--editor-row-bg);
}

.add-actions {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
}

.add-btn {
  flex: 1 1 50%;
  height: 100%;
  border: none;
  background: transparent;
  text-align: center;
  padding: 0 6px;
  font-size: 15px;
  font-weight: var(--fw-semi, 600);
  color: var(--editor-cell-text);
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.add-btn + .add-btn {
  border-left: 1px solid var(--editor-border);
}

.add-btn:hover:not(:disabled) {
  background: rgba(52, 199, 89, 0.12);
}

.add-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

@media (max-width: 768px) {
  .editor-modal {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
  }

  .modal-header {
    padding: 12px 14px;
  }

  .header-actions {
    gap: 8px;
  }

  .settings-table th,
  .settings-table td {
    min-width: 0;
    height: 42px;
  }

  .cell-input,
  .cell-select,
  .readonly-cell {
    font-size: 13px;
    padding: 0 10px;
  }

  .cell-select {
    padding-right: 30px;
    background-position:
      calc(100% - 13px) calc(50% + 1px),
      calc(100% - 8px) calc(50% + 1px);
  }

  .currency-select {
    padding-right: 22px;
    background-position:
      calc(100% - 10px) calc(50% + 1px),
      calc(100% - 6px) calc(50% + 1px);
  }

  .visibility-btn {
    width: 24px;
    height: 24px;
  }

  .eye-icon {
    width: 13px;
    height: 13px;
  }

  .add-btn {
    font-size: 14px;
  }

  .row-delete-btn {
    width: 24px;
    height: 24px;
  }

  .delete-icon {
    width: 13px;
    height: 13px;
  }
}
</style>
