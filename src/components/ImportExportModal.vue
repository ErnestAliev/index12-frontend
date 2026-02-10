<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import DateRangePicker from '@/components/DateRangePicker.vue';

const emit = defineEmits(['close', 'import-complete']);
const mainStore = useMainStore();

const isLoading = ref(false);
const loadError = ref('');
const operations = ref([]);
const showCopySuccess = ref(false);
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

const closeModal = () => {
  emit('close');
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

const normalizeTypeLabel = (op) => {
  if (op?.isWorkAct) return 'Акт выполненных работ';
  if (op?.type === 'transfer' || op?.isTransfer) return 'Перевод';
  if (op?.type === 'withdrawal' || op?.isWithdrawal) return 'Вывод средств';
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

  const categoryName = resolveEntityName(op?.categoryId, mainStore.categories, 'Без категории');
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
    type: typeLabel,
    amount: amountForDisplay,
    dateTs,
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

const loadOperations = async () => {
  isLoading.value = true;
  loadError.value = '';

  try {
    const { operations: exportedOperations } = await mainStore.exportAllOperations();
    const sorted = Array.isArray(exportedOperations) ? [...exportedOperations] : [];

    sorted.sort((a, b) => {
      const dateA = new Date(a?.date).getTime() || 0;
      const dateB = new Date(b?.date).getTime() || 0;
      if (dateA !== dateB) return dateA - dateB;

      const createdA = new Date(a?.createdAt).getTime() || 0;
      const createdB = new Date(b?.createdAt).getTime() || 0;
      return createdA - createdB;
    });

    operations.value = sorted.map(buildOperationRow);
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
    } else if (row.type === 'Перевод') {
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

onMounted(() => {
  document.body.style.overflow = 'hidden';
  loadOperations();
});

onBeforeUnmount(() => {
  document.body.style.overflow = '';
});
</script>

<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="editor-modal operations-editor-modal">
      <div class="modal-header">
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
          <button class="close-btn" @click="closeModal" aria-label="Закрыть">&times;</button>
        </div>
      </div>

      <div class="modal-body">
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
                  <span class="cell-text" :title="row.values[column]">{{ row.values[column] }}</span>
                </td>
              </tr>
            </tbody>
          </table>
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
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
  overflow-x: hidden;
  border-top: 1px solid var(--editor-border);
  background: var(--editor-row-bg);
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

@media (max-width: 1024px) {
  .editor-modal {
    width: 98vw;
    height: 95vh;
    border-radius: 10px;
  }

  .modal-header {
    padding: 14px 16px;
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
