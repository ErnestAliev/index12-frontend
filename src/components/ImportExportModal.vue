<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Papa from 'papaparse';
import { useMainStore } from '@/stores/mainStore';
import DateRangePicker from '@/components/DateRangePicker.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v11.3 - STYLE FIX & HEADER WIDTH ---
 * * ВЕРСИЯ: 11.3
 * * ДАТА: 2025-12-03
 * * ЧТО ИЗМЕНЕНО:
 * 1. (CSS) Усилены стили сетки (!important) для предотвращения "ступенек" из-за глобальных стилей.
 * 2. (LOGIC) calculateColumnWidths теперь учитывает длину заголовка, чтобы шапка не ломалась.
 */

const emit = defineEmits(['close', 'import-complete']);
const mainStore = useMainStore();

// --- UI Refs ---
const scrollContainerRef = ref(null); // Ссылка на контейнер таблицы для авто-скролла

const currentTab = ref('import');
const isExporting = ref(false);
const exportError = ref(null);

// Единое состояние данных
const isDataReady = ref(false);
const processedAllData = ref({}); 
const showExportPreview = ref(false);

const showDebugIds = ref(false);
const isFitContent = ref(true);
const isColorized = ref(false);

const colorSettings = ref({
  income: true,
  expense: true,
  prepayment: true,
  transfer: true,
  withdrawal: true,
  act: true,   // 🟢 Новый тип: Акт
  shift: true  // 🟢 Новый тип: Смена
});

watch(isColorized, (newVal) => {
  if (newVal) {
    colorSettings.value = {
      income: true,
      expense: true,
      prepayment: true,
      transfer: true,
      withdrawal: true,
      act: true,
      shift: true
    };
  }
});

// --- Блокировка скролла страницы (Body Lock) ---
onMounted(() => {
  document.body.style.overflow = 'hidden';
});

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  stopAutoScroll(); // Очистка таймера при уничтожении
});

// --- Логика Авто-Скролла ---
let scrollAnimationFrame = null;
const SCROLL_SPEED = 15; // Скорость прокрутки
const SENSOR_SIZE = 60; // Размер зоны срабатывания в пикселях от края

const startAutoScrollCheck = (e) => {
  if (!scrollContainerRef.value) return;

  const container = scrollContainerRef.value;
  const rect = container.getBoundingClientRect();
  
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const w = rect.width;
  const h = rect.height;

  let dx = 0;
  let dy = 0;

  // Горизонталь
  if (x < SENSOR_SIZE) dx = -SCROLL_SPEED;
  else if (x > w - SENSOR_SIZE) dx = SCROLL_SPEED;

  // Вертикаль
  if (y < SENSOR_SIZE) dy = -SCROLL_SPEED;
  else if (y > h - SENSOR_SIZE) dy = SCROLL_SPEED;

  if (dx !== 0 || dy !== 0) {
    if (!scrollAnimationFrame) {
      const scrollLoop = () => {
        if (container) {
          container.scrollLeft += dx;
          container.scrollTop += dy;
        }
        scrollAnimationFrame = requestAnimationFrame(scrollLoop);
      };
      scrollAnimationFrame = requestAnimationFrame(scrollLoop);
    }
  } else {
    stopAutoScroll();
  }
};

const stopAutoScroll = () => {
  if (scrollAnimationFrame) {
    cancelAnimationFrame(scrollAnimationFrame);
    scrollAnimationFrame = null;
  }
};


// Фильтры экспорта
const exportFilters = ref({
  dateFrom: '',
  dateTo: '',
  type: '',
  category: '',
  account: '',
  project: '',
  status: '',
  contractor: '',
  owner: ''
});

const dateRangeFilter = computed({
  get: () => ({
    from: exportFilters.value.dateFrom || null,
    to: exportFilters.value.dateTo || null
  }),
  set: (val) => {
    exportFilters.value.dateFrom = val?.from || '';
    exportFilters.value.dateTo = val?.to || '';
  }
});

const hasActiveFilters = computed(() => {
  const f = exportFilters.value;
  return f.dateFrom || f.dateTo || f.type || f.category || f.account || f.project || f.status || f.contractor || f.owner;
});

// --- Шаги (Импорт) ---
const step = ref('upload'); 
const error = ref(null);
const isLoading = ref(false);

const file = ref(null);
const fileInputRef = ref(null);
const dragOver = ref(false);
const csvHeaders = ref([]);
const csvData = ref([]); 
const previewData = computed(() => csvData.value);
const selectedRows = ref(new Set()); 
const isAllSelected = computed(() => {
  const validRowCount = csvData.value.filter(isValidRow).length;
  return validRowCount > 0 && selectedRows.value.size === validRowCount;
});

const columnMapping = ref({});

const systemFields = [
  { key: 'date', label: 'Дата', entity: null, aliases: ['дата', 'date'] },
  { key: 'type', label: 'Тип', entity: null, aliases: ['тип', 'операция', 'type', 'тип операции'] },
  { key: 'category', label: 'Категория', entity: 'categories', aliases: ['категория', 'category'] },
  { key: 'project', label: 'Проект', entity: 'projects', aliases: ['проект', 'project', 'мои проекты'] },
  { key: 'amount', label: 'Сумма', entity: null, aliases: ['сумма', 'amount'] },
  { key: 'forecast', label: 'Прогноз', entity: null, aliases: ['прогноз', 'forecast', 'баланс'] },
  { key: 'account', label: 'Счет', entity: 'accounts', aliases: ['счет', 'account', 'мои счета'] },
  { key: 'contractor', label: 'Контрагент', entity: 'contractors', aliases: ['контрагент', 'contractor', 'мои контрагенты'] },
  { key: 'company', label: 'Компания/Физлицо', entity: 'companies', aliases: ['компания', 'company', 'мои компании', 'компания/физлицо'] },
  { key: 'description', label: 'Описание', entity: null, aliases: ['описание', 'description', 'назначение', 'комментарий'] },
  { key: 'status', label: 'Статус', entity: null, aliases: ['статус', 'status'] },
  { key: 'individual', label: 'Физлицо', entity: 'individuals', aliases: ['физлицо', 'individual', 'мои физлица'] },
];

const newEntities = ref({
  categories: [],
  projects: [],
  accounts: [],
  companies: [],
  contractors: [],
  individuals: [],
});
const operationsToImport = ref([]);

const importProgress = ref(0);
const isReviewDisabled = computed(() => {
  const mappedKeys = Object.values(columnMapping.value);
  const hasMinFields = mappedKeys.includes('date') && mappedKeys.includes('amount') && mappedKeys.includes('type');
  return !hasMinFields || selectedRows.value.size === 0;
});


// --- Хелперы ---

function resetState() {
  step.value = 'upload';
  error.value = null;
  isLoading.value = false;
  file.value = null;
  csvHeaders.value = [];
  csvData.value = [];
  columnMapping.value = {};
  operationsToImport.value = [];
  selectedRows.value.clear(); 
  isExporting.value = false;
  exportError.value = null;
  isDataReady.value = false;
  processedAllData.value = {};
  showExportPreview.value = false;
  resetExportFilters(); 
  if (fileInputRef.value) fileInputRef.value.value = null;
}

function resetExport() {
  isExporting.value = false;
  exportError.value = null;
  isDataReady.value = false;
  processedAllData.value = {};
  showExportPreview.value = false; 
  resetExportFilters(); 
}

function resetExportFilters() {
  exportFilters.value = {
    dateFrom: '',
    dateTo: '',
    type: '',
    category: '',
    account: '',
    project: '',
    status: '',
    contractor: '',
    owner: ''
  };
}

function closeModal() {
  resetState(); 
  emit('close');
}

function previousStep() {
  if (step.value === 'mapping') {
    resetState(); 
  } else if (step.value === 'review') {
    step.value = 'mapping';
    operationsToImport.value = [];
  }
}

function handleFileSelect(event) {
  const f = event.target.files[0];
  if (f) {
    if (f.type !== 'text/csv' && !f.name.endsWith('.csv')) {
      error.value = 'Пожалуйста, выберите файл в формате .csv';
      return;
    }
    file.value = f;
    parseCsv();
  }
  if (event.target) {
    event.target.value = null;
  }
}

function handleDrop(event) {
  dragOver.value = false;
  const f = event.dataTransfer.files[0];
  if (f) {
    if (f.type !== 'text/csv' && !f.name.endsWith('.csv')) {
      error.value = 'Пожалуйста, выберите файл в формате .csv';
      return;
    }
    file.value = f;
    parseCsv();
  }
}

function parseCsv() {
  csvData.value = [];
  csvHeaders.value = [];
  selectedRows.value.clear(); 
  isLoading.value = true;
  error.value = null;

  Papa.parse(file.value, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      if (results.errors.length) {
        error.value = 'Ошибка парсинга CSV: ' + results.errors[0].message;
        isLoading.value = false;
        return;
      }
      csvHeaders.value = results.meta.fields;
      csvData.value = results.data;
      autoMapHeaders();
      autoSelectValidRows(); 
      isLoading.value = false;
      step.value = 'mapping';
    },
    error: (err) => {
      error.value = 'Не удалось прочитать файл: ' + err.message;
      isLoading.value = false;
    }
  });
}

function autoMapHeaders() {
  const mapping = {};
  const usedSystemKeys = new Set();
  for (const csvHeader of csvHeaders.value) {
    const csvHeaderLower = csvHeader.trim().toLowerCase();
    const foundField = systemFields.find(field => 
      field.aliases.includes(csvHeaderLower) && !usedSystemKeys.has(field.key)
    );
    if (foundField) {
      mapping[csvHeader] = foundField.key;
      usedSystemKeys.add(foundField.key); 
    } else {
      mapping[csvHeader] = null;
    }
  }
  columnMapping.value = mapping;
}

function isValidRow(row) {
  const reverseMapping = getReverseMapping();
  const dateHeader = reverseMapping['date'];
  const amountHeader = reverseMapping['amount'];
  const typeHeader = reverseMapping['type'];
  return dateHeader && row[dateHeader] && amountHeader && row[amountHeader] && typeHeader && row[typeHeader];
}

function autoSelectValidRows() {
  selectedRows.value.clear();
  csvData.value.forEach((row, index) => {
    if (isValidRow(row)) {
      selectedRows.value.add(index);
    }
  });
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedRows.value.clear();
  } else {
    autoSelectValidRows();
  }
}

function goToReviewStep() {
  error.value = null;
  if (isReviewDisabled.value) {
    error.value = 'Необходимо сопоставить обязательные поля (Дата, Сумма, Тип) и выбрать хотя бы одну строку.';
    return;
  }
  operationsToImport.value = transformDataForImport(selectedRows.value);
  identifyNewEntities();
  step.value = 'review';
}

function identifyNewEntities() {
  const newFound = {
    categories: new Set(),
    projects: new Set(),
    accounts: new Set(),
    companies: new Set(),
    contractors: new Set(),
    individuals: new Set(), 
  };
  const entityFields = systemFields.filter(f => f.entity);
  
  for (const field of entityFields) {
    const fieldKey = field.key; 
    const entityName = field.entity;
    const storeEntities = mainStore[entityName].value || [];
    const storeEntityNames = new Set(storeEntities.map(e => e.name.toLowerCase().trim()));
    
    for (const op of operationsToImport.value) {
      if (fieldKey === 'category' && op.type === 'transfer') continue;
      const value = op[fieldKey]; 
      if (value) {
        const trimmedValue = value.trim();
        const lowerValue = trimmedValue.toLowerCase();
        if (!storeEntityNames.has(lowerValue) && !newFound[entityName].has(trimmedValue)) {
          newFound[entityName].add(trimmedValue);
        }
      }
    }
  }
  newEntities.value.categories = Array.from(newFound.categories);
  newEntities.value.projects = Array.from(newFound.projects);
  newEntities.value.accounts = Array.from(newFound.accounts);
  newEntities.value.companies = Array.from(newFound.companies);
  newEntities.value.contractors = Array.from(newFound.contractors);
  newEntities.value.individuals = Array.from(newFound.individuals); 
}

function getEntityName(entityType) {
  const names = {
    categories: 'Категории',
    projects: 'Проекты',
    accounts: 'Счета',
    companies: 'Компании',
    contractors: 'Контрагенты',
    individuals: 'Физлица',
  };
  return names[entityType] || entityType;
}

async function startImport() {
  step.value = 'importing';
  error.value = null;
  importProgress.value = 0;
  try {
    const allTransformedOperations = transformDataForImport(null); 
    const selectedIndices = Array.from(selectedRows.value); 

    const createdDocs = await mainStore.importOperations(
      allTransformedOperations, 
      selectedIndices,
      (progress) => { importProgress.value = progress; }
    );
    importProgress.value = createdDocs.length;
    emit('import-complete');
  } catch (err) {
    console.error('Ошибка импорта:', err);
    error.value = `Ошибка импорта: ${err.message || 'Неизвестная ошибка'}`;
    step.value = 'review';
  }
}

function getReverseMapping() {
  const reverseMapping = {};
  for (const header in columnMapping.value) {
    const systemKey = columnMapping.value[header];
    if (systemKey) reverseMapping[systemKey] = header;
  }
  return reverseMapping;
}

function transformDataForImport(selectedIndices) {
  const operations = [];
  const reverseMapping = getReverseMapping();
  
  const dataToProcess = selectedIndices 
    ? csvData.value.filter((_, index) => selectedIndices.has(index))
    : csvData.value;
    
  for (const row of dataToProcess) {
    const op = {};
    const typeHeader = reverseMapping['type'];
    let opType = null;
    if (typeHeader && row[typeHeader]) {
      opType = normalizeType(String(row[typeHeader]).trim());
      op['type'] = opType;
    }

    for (const field of systemFields) {
      if (field.key === 'type') continue; 
      const systemKey = field.key;
      const csvHeader = reverseMapping[systemKey];
      
      if (csvHeader && row[csvHeader] !== undefined && row[csvHeader] !== null && row[csvHeader] !== '') {
        let value = String(row[csvHeader]).trim();
        if (systemKey === 'amount') {
          value = cleanAmount(value);
          if (opType === 'expense' && value > 0) value = -value;
        } else if (systemKey === 'date') {
          value = parseDate(value); 
        }
        op[systemKey] = value;
      }
    }
    if (op.date && op.amount !== null && op.type) operations.push(op);
  }
  return operations;
}

function cleanAmount(value) {
  if (typeof value !== 'string') return null;
  let cleaned = value.replace(/₸/g, '').replace(/[^\d.,-]/g, ''); 
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma > lastDot) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma) cleaned = cleaned.replace(/,/g, '');
  else if (lastComma !== -1 && lastDot === -1) {
    if (cleaned.match(/,/g).length === 1 && lastComma > cleaned.length - 4) cleaned = cleaned.replace(',', '.');
    else cleaned = cleaned.replace(/,/g, '');
  }
  else if (lastDot !== -1 && lastComma === -1) {
    if (cleaned.match(/\./g).length > 1) cleaned = cleaned.replace(/\./g, (match, offset) => offset === lastDot ? '.' : '');
  }
  cleaned = cleaned.replace(/\s/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(value) {
  if (typeof value !== 'string') return null;
  let parts = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1; 
    const year = parseInt(parts[3], 10);
    const date = new Date(year, month, day);
    return date.toISOString();
  }
  parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) {
     const year = parseInt(parts[1], 10);
     const month = parseInt(parts[2], 10) - 1;
     const day = parseInt(parts[3], 10);
     const date = new Date(year, month, day);
     return date.toISOString();
  }
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

function normalizeType(value) {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase().trim();
  if (['доход', 'income', 'приход', 'поступление'].includes(lower)) return 'income';
  if (['расход', 'expense', 'убыток', 'трата', 'списание'].includes(lower)) return 'expense';
  if (['перевод', 'transfer'].includes(lower)) return 'transfer';
  if (['вывод', 'вывод средств', 'withdrawal'].includes(lower)) return 'withdrawal';
  if (['предоплата', 'prepayment'].includes(lower)) return 'prepayment';
  return null;
}

const UNIFIED_COLUMNS = [
  'Дата', 'Тип', 'Категория', 'Проект', 'Сумма', 'Прогноз', 'Счет', 'Контрагент',
  'Компания/Физлицо', 'Описание', 'Статус', 'account_id', 'category_id', 'project_id'
];

function downloadTemplate() {
  const csvString = UNIFIED_COLUMNS.join(",");
  triggerCsvDownload(csvString, "Import_Template_IncomeExpense");
}

function resolveEntityName(entityOrId, storeList) {
  if (!entityOrId) return '';
  if (typeof entityOrId === 'object' && entityOrId.name) return entityOrId.name;
  if (typeof entityOrId === 'string' && storeList) {
    const found = storeList.find(item => item._id === entityOrId);
    return found ? found.name : '';
  }
  return '';
}

function resolveEntityId(entityOrId, storeList) {
  if (!entityOrId) return '';
  if (typeof entityOrId === 'object' && entityOrId._id) return entityOrId._id;
  if (typeof entityOrId === 'string') {
      const foundById = storeList.find(item => item._id === entityOrId);
      if (foundById) return foundById._id;
      const foundByName = storeList.find(item => item.name && item.name.toLowerCase() === entityOrId.toLowerCase());
      if (foundByName) return foundByName._id;
      return entityOrId; 
  }
  return '';
}

// 🟢 Хелпер для цветов
const getRowColorClass = (row) => {
    if (!isColorized.value) return '';
    const type = row['Тип'];
    
    if (type === 'Доход' && colorSettings.value.income) return 'row-income';
    if (type === 'Расход' && colorSettings.value.expense) return 'row-expense';
    if (type === 'Предоплата' && colorSettings.value.prepayment) return 'row-prepayment';
    if (type === 'Вывод средств' && colorSettings.value.withdrawal) return 'row-withdrawal';
    if ((type === 'Перевод (Исх)' || type === 'Перевод (Вх)') && colorSettings.value.transfer) return 'row-transfer';
    if (type === 'Акт выполненных работ' && colorSettings.value.act) return 'row-act'; // 🟢 NEW
    if (type === 'Закрытие смены' && colorSettings.value.shift) return 'row-shift'; // 🟢 NEW
    
    return '';
};

// 🟢 Новая функция для раскраски ИМПОРТА
const getImportRowColorClass = (row) => {
    if (!isColorized.value) return '';
    
    const reverseMapping = getReverseMapping();
    const typeHeader = reverseMapping['type'];
    
    if (!typeHeader || !row[typeHeader]) return '';
    
    const rawType = String(row[typeHeader]).trim();
    const type = normalizeType(rawType);
    
    if (type === 'income' && colorSettings.value.income) return 'row-income';
    if (type === 'expense' && colorSettings.value.expense) return 'row-expense';
    if (type === 'prepayment' && colorSettings.value.prepayment) return 'row-prepayment';
    if (type === 'withdrawal' && colorSettings.value.withdrawal) return 'row-withdrawal';
    if (type === 'transfer' && colorSettings.value.transfer) return 'row-transfer';
    
    return '';
};

// 🟢 Статистика для ревью импорта
const importStats = computed(() => {
  const ops = operationsToImport.value;
  const stats = {
    count: ops.length,
    income: { count: 0, sum: 0 },
    expense: { count: 0, sum: 0 },
    transfer: { count: 0, sum: 0 },
    prepayment: { count: 0, sum: 0 },
    withdrawal: { count: 0, sum: 0 },
  };

  ops.forEach(op => {
    const amt = Math.abs(op.amount || 0);
    if (op.type === 'income') { stats.income.count++; stats.income.sum += amt; }
    else if (op.type === 'expense') { stats.expense.count++; stats.expense.sum += amt; }
    else if (op.type === 'transfer') { stats.transfer.count++; stats.transfer.sum += amt; }
    else if (op.type === 'prepayment') { stats.prepayment.count++; stats.prepayment.sum += amt; }
    else if (op.type === 'withdrawal') { stats.withdrawal.count++; stats.withdrawal.sum += amt; }
  });
  return stats;
});

async function prepareExportData() {
  isExporting.value = true;
  exportError.value = null;
  showExportPreview.value = false;
  resetExportFilters(); 
  
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0); const todayTimestamp = today.getTime();
    const { operations } = await mainStore.exportAllOperations(); 
    const runningBalances = new Map(); mainStore.accounts.forEach(acc => { runningBalances.set(acc._id, acc.initialBalance || 0); });
    const allRows = [];
    operations.sort((a, b) => {
      const dateA = new Date(a.date).getTime(); const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0; const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return createdA - createdB;
    });

    // 🟢 1. Индексируем операции для быстрого поиска
    const opsMap = new Map();
    operations.forEach(op => opsMap.set(op._id, op));
    
    for (const op of operations) {
      if (!op.date) continue; 
      let dateStr = ''; let opTimestamp = 0;
      try { const d = new Date(op.date); opTimestamp = d.getTime(); const day = String(d.getDate()).padStart(2, '0'); const month = String(d.getMonth() + 1).padStart(2, '0'); const year = d.getFullYear(); dateStr = `${day}.${month}.${year}`; } catch (e) { continue; }

      const isFuture = opTimestamp > todayTimestamp; const status = isFuture ? 'План' : 'Исполнено'; const opAmount = op.amount || 0;
      let catName = resolveEntityName(op.categoryId, mainStore.categories); let projName = resolveEntityName(op.projectId, mainStore.projects);
      let contrName = resolveEntityName(op.contractorId, mainStore.contractors) || resolveEntityName(op.counterpartyIndividualId, mainStore.individuals);
      let ownerName = resolveEntityName(op.companyId, mainStore.companies) || resolveEntityName(op.individualId, mainStore.individuals);
      
      if (!ownerName && op.accountId) { const accIdRaw = resolveEntityId(op.accountId, mainStore.accounts); const accObj = mainStore.accounts.find(a => a._id === accIdRaw); if (accObj) { ownerName = resolveEntityName(accObj.companyId, mainStore.companies) || resolveEntityName(accObj.individualId, mainStore.individuals); } }

      let catId = resolveEntityId(op.categoryId, mainStore.categories); let projId = resolveEntityId(op.projectId, mainStore.projects); let accountId = resolveEntityId(op.accountId, mainStore.accounts);
      if (!projName || projName.trim() === '') projName = 'Без проекта';

      // 🟢 2. SMART ACCOUNT RESOLUTION (Fix for Acts/Shifts)
      if (!accountId) {
           // Case A: Work Act -> Find Tranche -> Take Account
           if (op.isWorkAct && op.relatedEventId) {
               const relatedId = typeof op.relatedEventId === 'object' ? op.relatedEventId._id : op.relatedEventId;
               const parentOp = opsMap.get(relatedId);
               if (parentOp && parentOp.accountId) {
                   accountId = resolveEntityId(parentOp.accountId, mainStore.accounts);
               }
           }
           // Case B: Retail Shift -> Find Income for Project+Client -> Take Account
           else if (mainStore._isRetailWriteOff(op)) {
               const pId = resolveEntityId(op.projectId, mainStore.projects);
               const cIndId = resolveEntityId(op.counterpartyIndividualId, mainStore.individuals);
               
               if (pId && cIndId) {
                   // Search for any income with this Project and Retail Client
                   const match = operations.find(candidate => 
                       candidate.type === 'income' &&
                       resolveEntityId(candidate.projectId, mainStore.projects) === pId &&
                       resolveEntityId(candidate.counterpartyIndividualId, mainStore.individuals) === cIndId &&
                       candidate.accountId
                   );
                   if (match) {
                       accountId = resolveEntityId(match.accountId, mainStore.accounts);
                   }
               }
           }
      }

      const addRow = (accId, amountChange, typeLabel, desc, overrides = {}) => {
         let currentBalance = 0; let accName = '';
         if (accId) { const prev = runningBalances.get(accId) || 0; currentBalance = prev + amountChange; runningBalances.set(accId, currentBalance); accName = mainStore.accounts.find(a => a._id === accId)?.name || '???'; }
         let finalCatId = catId; if (overrides.category && overrides.category !== catName) finalCatId = resolveEntityId(overrides.category, mainStore.categories);

         allRows.push({ 'Дата': dateStr, 'Тип': typeLabel, 'Категория': overrides.category !== undefined ? overrides.category : catName, 'Проект': projName, 'Сумма': amountChange, 'Прогноз': accId ? currentBalance : '', 'Счет': accName, 'Контрагент': overrides.contractor !== undefined ? overrides.contractor : contrName, 'Компания/Физлицо': overrides.owner !== undefined ? overrides.owner : ownerName, 'Описание': desc, 'Статус': status, 'account_id': accId || '', 'category_id': finalCatId || '', 'project_id': projId || '' });
      };

      if (op.type === 'transfer' || op.isTransfer) {
         const fromAccId = resolveEntityId(op.fromAccountId, mainStore.accounts); const toAccId = resolveEntityId(op.toAccountId, mainStore.accounts);
         const fromOwner = resolveEntityName(op.fromCompanyId, mainStore.companies) || resolveEntityName(op.fromIndividualId, mainStore.individuals);
         const toOwner = resolveEntityName(op.toCompanyId, mainStore.companies) || resolveEntityName(op.toIndividualId, mainStore.individuals);
         const absAmount = Math.abs(opAmount); const transferCategory = catName || 'Перевод';
         const isInterCompany = op.fromCompanyId && op.toCompanyId && ((op.fromCompanyId._id || op.fromCompanyId) !== (op.toCompanyId._id || op.toCompanyId)); const isToPersonal = !!op.toIndividualId; 

         if (isInterCompany) {
             if (fromAccId) addRow(fromAccId, -absAmount, 'Расход', `Перевод в ${toOwner}`, { owner: fromOwner, contractor: toOwner, category: transferCategory });
             if (toAccId) addRow(toAccId, absAmount, 'Доход', `Поступление от ${fromOwner}`, { owner: toOwner, contractor: fromOwner, category: transferCategory });
         } else if (isToPersonal) {
             const personalDesc = "На развитие бизнеса";
             if (fromAccId) addRow(fromAccId, -absAmount, 'Перевод (Исх)', personalDesc, { owner: fromOwner, contractor: toOwner, category: transferCategory });
             if (toAccId) addRow(toAccId, absAmount, 'Перевод (Вх)', personalDesc, { owner: toOwner, contractor: fromOwner, category: transferCategory });
         } else {
             const stdDesc = op.description || `Перевод: ${fromOwner || 'Счет'} -> ${toOwner || 'Счет'}`;
             if (fromAccId) addRow(fromAccId, -absAmount, 'Перевод (Исх)', stdDesc, { owner: fromOwner, contractor: toOwner, category: transferCategory });
             if (toAccId) addRow(toAccId, absAmount, 'Перевод (Вх)', stdDesc, { owner: toOwner, contractor: fromOwner, category: transferCategory });
         }
      } else if (op.type === 'withdrawal' || op.isWithdrawal) {
          const acc = mainStore.accounts.find(a => a._id === accountId); let withdrawalContr = contrName; 
          if (!withdrawalContr && acc && acc.individualId) withdrawalContr = resolveEntityName(acc.individualId, mainStore.individuals);
          const desc = op.description || `Вывод средств (${withdrawalContr})`; const withdrawalCategory = catName || 'Вывод средств';
          addRow(accountId, opAmount, 'Вывод средств', desc, { contractor: withdrawalContr, category: withdrawalCategory });
      } else {
         let typeLabel = 'Расход'; let finalDesc = op.description || '';
         let displayAmount = opAmount; // 🟢 Переменная для отображаемой суммы

         const isRealPrepayment = op.type === 'prepayment' || (op.type === 'income' && (op.totalDealAmount > 0 || op.prepaymentId));
         const isWorkAct = op.isWorkAct === true;
         const isRetailShift = mainStore._isRetailWriteOff(op);

         // 🟢 Иерархия проверок
         if (isWorkAct) {
             typeLabel = 'Акт выполненных работ';
             if (!finalDesc) finalDesc = `Акт по проекту: ${projName}`;
             displayAmount = Math.abs(opAmount); // 🟢 Убираем минус
         }
         else if (isRetailShift) {
             typeLabel = 'Закрытие смены';
             if (!finalDesc) finalDesc = 'Списание выручки (Розница)';
             displayAmount = Math.abs(opAmount); // 🟢 Убираем минус
         }
         else if (isRealPrepayment) { 
             typeLabel = 'Предоплата'; 
             if (!finalDesc) finalDesc = `Предоплата: ${projName !== 'Без проекта' ? projName : catName}`; 
         }
         else if (op.type === 'income') { 
             typeLabel = 'Доход'; 
             if (!finalDesc) finalDesc = `Доход: ${catName}`; 
         }
         else { 
             typeLabel = 'Расход'; 
             if (!finalDesc) finalDesc = `Расход: ${catName}`; 
         }
         
         // 🟢 Используем displayAmount вместо opAmount
         addRow(accountId, displayAmount, typeLabel, finalDesc, {} );
      }
    }
    processedAllData.value = { data: allRows, columns: UNIFIED_COLUMNS }; isDataReady.value = true;
  } catch (err) { console.error("Ошибка при подготовке экспорта:", err); exportError.value = `Не удалось подготовить данные: ${err.message || 'Неизвестная ошибка'}`; } finally { isExporting.value = false; }
}

function downloadAllData() { const csvString = Papa.unparse(processedAllData.value.data, { header: true, columns: processedAllData.value.columns, transform: (value) => (value === null || value === undefined) ? "" : value, }); triggerCsvDownload(csvString, "Full_Statement"); }
function triggerCsvDownload(csvString, filenamePrefix = "export") { const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement('a'); const url = URL.createObjectURL(blob); link.setAttribute('href', url); const d = new Date(); const pad = (num) => String(num).padStart(2, '0'); const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; link.setAttribute('download', `index12_${filenamePrefix}_${timestamp}.csv`); link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); }

const exportFilterOptions = computed(() => { const data = processedAllData.value.data || []; const options = { type: new Set(), category: new Set(), account: new Set(), project: new Set(), status: new Set(), contractor: new Set(), owner: new Set() }; data.forEach(row => { if (row['Тип']) options.type.add(row['Тип']); if (row['Категория']) options.category.add(row['Категория']); if (row['Счет']) options.account.add(row['Счет']); if (row['Проект']) options.project.add(row['Проект']); if (row['Статус']) options.status.add(row['Статус']); if (row['Контрагент']) options.contractor.add(row['Контрагент']); if (row['Компания/Физлицо']) options.owner.add(row['Компания/Физлицо']); }); return { type: Array.from(options.type).sort(), category: Array.from(options.category).sort(), account: Array.from(options.account).sort(), project: Array.from(options.project).sort(), status: Array.from(options.status).sort(), contractor: Array.from(options.contractor).sort(), owner: Array.from(options.owner).sort() }; });
function parseRowDate(dateStr) { if (!dateStr) return null; const parts = dateStr.split('.'); if (parts.length !== 3) return null; return new Date(parts[2], parts[1] - 1, parts[0]); }
const filteredExportData = computed(() => { let data = processedAllData.value.data || []; const f = exportFilters.value; if (f.type) data = data.filter(r => r['Тип'] === f.type); if (f.category) data = data.filter(r => r['Категория'] === f.category); if (f.account) data = data.filter(r => r['Счет'] === f.account); if (f.project) data = data.filter(r => r['Проект'] === f.project); if (f.status) data = data.filter(r => r['Статус'] === f.status); if (f.contractor) data = data.filter(r => r['Контрагент'] === f.contractor); if (f.owner) data = data.filter(r => r['Компания/Физлицо'] === f.owner); if (f.dateFrom || f.dateTo) { const from = f.dateFrom ? new Date(f.dateFrom) : null; const to = f.dateTo ? new Date(f.dateTo) : null; if (from) from.setHours(0,0,0,0); if (to) to.setHours(23,59,59,999); data = data.filter(r => { const rDate = parseRowDate(r['Дата']); if (!rDate) return false; if (from && rDate < from) return false; if (to && rDate > to) return false; return true; }); } return data; });

// 🟢 1. CALCULATE DYNAMIC COLUMN WIDTHS (Function)
const calculateColumnWidths = (headers, data) => {
  const checkboxWidth = '48px'; 
  const widths = [];
  headers.forEach(header => {
     // 🟢 FIX: Start with header length to ensure header text fits
     let maxLen = header.length; 
     
     const sample = data.slice(0, 20);
     sample.forEach(row => {
        const val = row[header] ? String(row[header]).length : 0;
        if (val > maxLen) maxLen = val;
     });
     
     let fr = 1;
     if (maxLen <= 10) fr = 0.5;      
     else if (maxLen <= 20) fr = 1;   
     else if (maxLen <= 40) fr = 2;   
     else fr = 3;                     
     widths.push(`minmax(max-content, ${fr}fr)`);
  });
  return widths;
};

const gridTemplate = computed(() => { 
   const widths = calculateColumnWidths(visibleColumns.value, filteredExportData.value);
   return widths.join(' ');
});

const visibleColumns = computed(() => { const cols = [...UNIFIED_COLUMNS]; if (!showDebugIds.value) { return cols.filter(c => !c.includes('_id')); } return cols; });
const visibleCsvHeaders = computed(() => { if (showDebugIds.value) return csvHeaders.value; return csvHeaders.value.filter(h => { const lower = h.trim().toLowerCase(); return !lower.endsWith('_id') && lower !== 'id' && lower !== '_id'; }); });

const importGridTemplate = computed(() => { 
  const checkboxWidth = '48px'; 
  const cols = calculateColumnWidths(visibleCsvHeaders.value, csvData.value);
  return [checkboxWidth, ...cols].join(' '); 
});
</script>

<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="modal-content">
      <button class="close-btn" @click="closeModal" title="Закрыть">&times;</button>
      <h2>{{ currentTab === 'import' ? 'Импорт операций' : 'Экспорт Отчетов' }}</h2>
      <div class="modal-tabs">
        <button class="tab-btn" :class="{ active: currentTab === 'import' }" @click="currentTab = 'import'">Импорт (CSV)</button>
        <button class="tab-btn" :class="{ active: currentTab === 'export' }" @click="currentTab = 'export'">Экспорт (CSV)</button>
      </div>

      <!-- ИМПОРТ -->
      <div v-if="currentTab === 'import'" class="import-content-wrapper">
        <div v-if="step === 'upload'" class="modal-step-content">
          <div 
            class="drop-zone" 
            @dragover.prevent="dragOver = true"
            @dragleave.prevent="dragOver = false"
            @drop.prevent="handleDrop"
            :class="{ 'drag-over': dragOver }"
          >
            <div v-if="!isLoading">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <p>Перетащите CSV файл сюда</p>
              <label class="file-input-label">
                Выберите файл
                <input ref="fileInputRef" type="file" accept=".csv" @change="handleFileSelect" class="file-input" />
              </label>
              <button type="button" class="btn-secondary download-template-btn" @click.stop="downloadTemplate">
                Скачать шаблон
              </button>
            </div>
            <div v-if="isLoading" class="loading-indicator">
              <div class="spinner"></div>
              <p>Парсинг файла...</p>
            </div>
          </div>
          <div v-if="error" class="error-message">{{ error }}</div>
        </div>

        <!-- ИМПОРТ: MAPPING -->
        <div v-if="step === 'mapping'" class="export-preview-container">
           <div class="preview-header-bar">
              <h3>Сопоставьте колонки</h3>
              <div class="header-controls">
                  <div class="color-controls-wrapper">
                      <label class="debug-toggle"><input type="checkbox" v-model="isColorized"> Показать цвета</label>
                      <div v-if="isColorized" class="sub-color-toggles">
                         <label class="sub-toggle income" title="Доход"><input type="checkbox" v-model="colorSettings.income">Доход</label>
                         <label class="sub-toggle expense" title="Расход"><input type="checkbox" v-model="colorSettings.expense">Расход</label>
                         <label class="sub-toggle prepayment" title="Предоплата"><input type="checkbox" v-model="colorSettings.prepayment">Предоплата</label>
                         <label class="sub-toggle transfer" title="Перевод"><input type="checkbox" v-model="colorSettings.transfer">Перевод</label>
                         <label class="sub-toggle withdrawal" title="Вывод"><input type="checkbox" v-model="colorSettings.withdrawal">Вывод</label>
                      </div>
                  </div>
                  <label class="debug-toggle"><input type="checkbox" v-model="showDebugIds"> Показать ID</label>
                  <span class="count-label">Строк: {{ csvData.length }}</span>
                  <button class="btn-secondary" @click="resetState">&times; Сброс</button>
              </div>
           </div>
           <div class="grid-table-container" ref="scrollContainerRef" @mousemove="startAutoScrollCheck" @mouseleave="stopAutoScroll">
              <div class="unified-grid" :class="{ 'fit-mode': isFitContent, 'colorized': isColorized }" :style="{ gridTemplateColumns: importGridTemplate }">
                 <div class="header-group contents-display">
                     <div class="grid-header-cell center-content sticky"><input type="checkbox" @change="toggleSelectAll" :checked="isAllSelected" /></div>
                     <div v-for="header in visibleCsvHeaders" :key="header" class="grid-header-cell import-grid-header sticky">
                         <span class="csv-header-name" :title="header">{{ header }}</span>
                         <select v-model="columnMapping[header]" class="mapping-select"><option v-for="field in systemFields" :key="field.key" :value="field.key">{{ field.label }}</option></select>
                     </div>
                 </div>
                 <div v-for="(row, rowIndex) in previewData" :key="rowIndex" class="row-group contents-display">
                    <div class="grid-cell center-content" :class="{ 'row-disabled': !isValidRow(row) }"><input type="checkbox" :value="rowIndex" v-model="selectedRows" :disabled="!isValidRow(row)" /></div>
                    <div v-for="(header, colIndex) in visibleCsvHeaders" :key="colIndex" class="grid-cell" :class="[{ 'row-disabled': !isValidRow(row) }, getImportRowColorClass(row)]" :title="row[header]">{{ row[header] }}</div>
                 </div>
              </div>
           </div>
           <div v-if="error" class="error-message" style="margin: 10px 24px;">{{ error }}</div>
        </div>

        <!-- ИМПОРТ: REVIEW -->
        <div v-if="step === 'review'" class="modal-step-content review-step">
          <div class="review-dashboard">
              <div class="review-intro">
                  <div class="stat-big">
                      <span class="stat-val">{{ importStats.count }}</span>
                      <span class="stat-lbl">операций к импорту</span>
                  </div>
              </div>

              <div class="review-cards compact-cards">
                  <div class="review-card card-income">
                      <div class="card-head">Доходы</div>
                      <div class="card-body">
                          <div class="card-row"><span>Кол:</span> <b>{{ importStats.income.count }}</b></div>
                          <div class="card-row"><span>Сум:</span> <b>{{ Math.round(importStats.income.sum).toLocaleString() }}</b></div>
                      </div>
                  </div>
                  <div class="review-card card-expense">
                      <div class="card-head">Расходы</div>
                      <div class="card-body">
                          <div class="card-row"><span>Кол:</span> <b>{{ importStats.expense.count }}</b></div>
                          <div class="card-row"><span>Сум:</span> <b>{{ Math.round(importStats.expense.sum).toLocaleString() }}</b></div>
                      </div>
                  </div>
                  <div class="review-card card-prepayment">
                      <div class="card-head">Предоплаты</div>
                      <div class="card-body">
                          <div class="card-row"><span>Кол:</span> <b>{{ importStats.prepayment.count }}</b></div>
                          <div class="card-row"><span>Сум:</span> <b>{{ Math.round(importStats.prepayment.sum).toLocaleString() }}</b></div>
                      </div>
                  </div>
                  <div class="review-card card-withdrawal">
                      <div class="card-head">Выводы</div>
                      <div class="card-body">
                          <div class="card-row"><span>Кол:</span> <b>{{ importStats.withdrawal.count }}</b></div>
                          <div class="card-row"><span>Сум:</span> <b>{{ Math.round(importStats.withdrawal.sum).toLocaleString() }}</b></div>
                      </div>
                  </div>
                  <div class="review-card card-transfer">
                      <div class="card-head">Переводы</div>
                      <div class="card-body">
                          <div class="card-row"><span>Кол:</span> <b>{{ importStats.transfer.count }}</b></div>
                          <div class="card-row"><span>Сум:</span> <b>{{ Math.round(importStats.transfer.sum).toLocaleString() }}</b></div>
                      </div>
                  </div>
              </div>

              <div class="new-entities-section" v-if="Object.values(newEntities).some(arr => arr.length > 0)">
                  <h4>Будут созданы новые справочники:</h4>
                  <div class="entities-grid">
                    <div v-for="entityType in Object.keys(newEntities)" :key="entityType" class="entity-block">
                      <div v-if="newEntities[entityType].length > 0">
                        <div class="entity-title">{{ getEntityName(entityType) }} ({{ newEntities[entityType].length }})</div>
                        <ul class="entity-items">
                           <li v-for="item in newEntities[entityType]" :key="item">{{ item }}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
              </div>
          </div>
          <div v-if="error" class="error-message">{{ error }}</div>
        </div>
        
        <div v-if="step === 'importing'" class="modal-step-content">
          <div class="loading-indicator"><div class="spinner"></div><p>Импорт... {{ importProgress }} / {{ operationsToImport.length }}</p></div>
        </div>
      </div>
      
      <!-- ЭКСПОРТ -->
      <div v-if="currentTab === 'export'" class="modal-step-content export-step">
        <div v-if="!showExportPreview" class="export-controls-container">
            <p class="export-description">Скачайте единый отчет по всем операциям.</p>
            <button v-if="!isDataReady" @click="prepareExportData" class="btn-primary export-btn prepare-btn" :disabled="isExporting">Подготовить данные</button>
            <div v-if="isExporting" class="loading-indicator"><div class="spinner"></div></div>
            <div v-if="isDataReady && !isExporting" class="download-section">
              <div class="download-buttons">
                <button class="btn-primary export-btn" @click="downloadAllData">Скачать выписку</button>
                <button class="btn-primary export-btn view-btn" @click="showExportPreview = true">Смотреть выписку</button>
              </div>
              <button class="btn-secondary" @click="resetExport" style="margin-top: 20px;">Начать заново</button>
            </div>
            <div v-if="exportError" class="error-message">{{ exportError }}</div>
        </div>

        <!-- ЭКСПОРТ: ПРЕДПРОСМОТР -->
        <div v-if="showExportPreview" class="export-preview-container">
            <div class="preview-header-bar">
                <button class="btn-secondary" @click="showExportPreview = false">← Назад</button>
                
                <div class="header-controls">
                    <div class="color-controls-wrapper">
                        <label class="debug-toggle"><input type="checkbox" v-model="isColorized"> Показать цвета</label>
                        <div v-if="isColorized" class="sub-color-toggles">
                           <label class="sub-toggle income" title="Доход"><input type="checkbox" v-model="colorSettings.income">Доход</label>
                           <label class="sub-toggle expense" title="Расход"><input type="checkbox" v-model="colorSettings.expense">Расход</label>
                           <label class="sub-toggle prepayment" title="Предоплата"><input type="checkbox" v-model="colorSettings.prepayment">Предоплата</label>
                           <label class="sub-toggle transfer" title="Перевод"><input type="checkbox" v-model="colorSettings.transfer">Перевод</label>
                           <label class="sub-toggle withdrawal" title="Вывод"><input type="checkbox" v-model="colorSettings.withdrawal">Вывод</label>
                           
                           <!-- 🟢 НОВЫЕ ТИПЫ -->
                           <label class="sub-toggle act" title="Акт"><input type="checkbox" v-model="colorSettings.act">Акт</label>
                           <label class="sub-toggle shift" title="Смена"><input type="checkbox" v-model="colorSettings.shift">Смена</label>
                        </div>
                    </div>
                    <label class="debug-toggle"><input type="checkbox" v-model="showDebugIds"> Показать ID</label>
                    <span class="count-label">Строк: {{ filteredExportData.length }}</span>
                    <button v-if="hasActiveFilters" class="btn-secondary btn-small" @click="resetExportFilters">&times; Сброс</button>
                </div>
            </div>
            <div class="grid-table-container" ref="scrollContainerRef" @mousemove="startAutoScrollCheck" @mouseleave="stopAutoScroll">
                <!-- 🟢 FIX: Добавлены !important классы для сетки -->
                <div class="unified-grid" :class="{ 'fit-mode': isFitContent, 'colorized': isColorized }" :style="{ gridTemplateColumns: gridTemplate }">
                    <div class="header-group contents-display">
                        <div v-for="col in visibleColumns" :key="col" class="grid-header-cell sticky">
                            <div v-if="col === 'Дата'" class="filter-wrapper"><DateRangePicker v-model="dateRangeFilter" placeholder="Дата" class="header-filter-control no-bg-hover"/></div>
                            <div v-else-if="col === 'Тип'" class="filter-wrapper"><select v-model="exportFilters.type" class="header-filter-control has-arrow"><option value="">Тип</option><option v-for="opt in exportFilterOptions.type" :key="opt" :value="opt">{{ opt }}</option></select></div>
                            <div v-else-if="col === 'Категория'" class="filter-wrapper"><select v-model="exportFilters.category" class="header-filter-control has-arrow"><option value="">Категория</option><option v-for="opt in exportFilterOptions.category" :key="opt" :value="opt">{{ opt }}</option></select></div>
                            <div v-else-if="col === 'Проект'" class="filter-wrapper"><select v-model="exportFilters.project" class="header-filter-control has-arrow"><option value="">Проект</option><option v-for="opt in exportFilterOptions.project" :key="opt" :value="opt">{{ opt }}</option></select></div>
                            <div v-else-if="col === 'Счет'" class="filter-wrapper"><select v-model="exportFilters.account" class="header-filter-control has-arrow"><option value="">Счет</option><option v-for="opt in exportFilterOptions.account" :key="opt" :value="opt">{{ opt }}</option></select></div>
                            <div v-else-if="col === 'Контрагент'" class="filter-wrapper"><select v-model="exportFilters.contractor" class="header-filter-control has-arrow"><option value="">Контрагент</option><option v-for="opt in exportFilterOptions.contractor" :key="opt" :value="opt">{{ opt }}</option></select></div>
                            <div v-else-if="col === 'Компания/Физлицо'" class="filter-wrapper"><select v-model="exportFilters.owner" class="header-filter-control has-arrow"><option value="">Комп./Физ.</option><option v-for="opt in exportFilterOptions.owner" :key="opt" :value="opt">{{ opt }}</option></select></div>
                            <div v-else-if="col === 'Статус'" class="filter-wrapper"><select v-model="exportFilters.status" class="header-filter-control has-arrow"><option value="">Статус</option><option v-for="opt in exportFilterOptions.status" :key="opt" :value="opt">{{ opt }}</option></select></div>
                            <span v-else class="header-label">{{ col }}</span>
                        </div>
                    </div>
                    <div v-for="(row, idx) in filteredExportData" :key="idx" class="row-group contents-display">
                        <div v-for="col in visibleColumns" :key="col" class="grid-cell" :class="getRowColorClass(row)" :title="row[col]">{{ row[col] }}</div>
                    </div>
                    <div v-if="filteredExportData.length === 0" class="empty-state" style="grid-column: 1 / -1;">Нет данных</div>
                </div>
            </div>
            
            <div class="modal-actions export-preview-footer">
                <button class="btn-primary btn-green" @click="downloadAllData">Экспорт таблицы</button>
            </div>
        </div>
      </div>

      <div v-if="currentTab === 'import' && step !== 'review' && step !== 'importing'" class="modal-actions">
        <button @click="closeModal" class="btn-secondary">Отмена</button>
        <button @click="previousStep" v-if="step !== 'upload'" class="btn-secondary">Назад</button>
        <button @click="goToReviewStep" v-if="step === 'mapping'" class="btn-primary" :disabled="isReviewDisabled">Проверить</button>
      </div>
      
      <div v-if="currentTab === 'import' && step === 'review'" class="modal-actions review-actions-footer">
          <button class="btn-primary btn-green" @click="startImport" :disabled="operationsToImport.length === 0">Подтвердить и Загрузить</button>
          <div class="spacer"></div>
          <button class="btn-secondary" @click="previousStep">Назад к таблице</button>
      </div>

      <div v-if="currentTab === 'export' && !showExportPreview" class="modal-actions">
        <button @click="closeModal" class="btn-secondary">Закрыть</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 🟢 МОДАЛЬНОЕ ОКНО - ШИРОКОЕ */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { width: 95vw; max-width: 1400px; height: 90vh; max-height: 900px; background: var(--color-background); border-radius: 8px; border: 1px solid var(--color-border); box-shadow: 0 10px 30px rgba(0,0,0,0.2); display: flex; flex-direction: column; position: relative; }

/* 🟢 Grid Container: СКРЫТЫЙ СКРОЛЛБАР, НО РАБОЧИЙ СКРОЛЛ */
.grid-table-container { 
  display: block; 
  overflow-x: auto; 
  overflow-y: auto; 
  flex: 1; 
  position: relative; 
  border-top: 1px solid var(--color-border); 
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none;  /* IE 10+ */
}
.grid-table-container::-webkit-scrollbar { display: none; /* Chrome/Safari */ }


/* 🟢 Unified Grid: принудительная сетка */
.unified-grid { 
  display: grid !important; 
  align-items: center; 
  width: max-content; 
  min-width: 100%; 
}

/* 🟢 Группировка содержимого (строки и заголовки) - принудительно unwrap */
.contents-display { 
  display: contents !important; 
}

.grid-header-cell { 
  background: var(--color-background-soft); 
  border-bottom: 1px solid var(--color-border); 
  border-right: 1px solid var(--color-border-hover); 
  padding: 4px; 
  height: 50px; 
  display: flex; 
  align-items: center; 
  overflow: visible; 
  box-sizing: border-box; 
  margin: 0 !important; /* 🟢 FIX: Сброс маржинов */
}

.grid-header-cell.sticky { position: sticky; top: 0; z-index: 20; }

.grid-cell { 
  padding: 0 8px; 
  font-size: 13px; 
  border-bottom: 1px solid var(--color-border); 
  border-right: 1px solid transparent; 
  white-space: nowrap; 
  overflow: hidden; 
  text-overflow: ellipsis; 
  background: var(--color-background); 
  height: 40px; 
  display: flex; 
  align-items: center; 
  box-sizing: border-box; 
  margin: 0 !important; /* 🟢 FIX: Сброс маржинов */
}

.unified-grid.fit-mode .grid-cell { overflow: visible; text-overflow: clip; }
.grid-header-cell.import-grid-header { flex-direction: column; justify-content: center; align-items: flex-start; padding-top: 0; padding: 4px 8px; }
.csv-header-name { font-size: 11px; font-weight: 600; color: var(--color-text-soft); margin-bottom: 4px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
.mapping-select { width: 100%; height: 24px; font-size: 12px; border: 1px solid transparent; border-radius: 4px; background-color: transparent; color: var(--color-heading); font-weight: 600; appearance: none; -webkit-appearance: none; -moz-appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; padding: 0 20px 0 4px !important; cursor: pointer; transition: all 0.2s ease; }
.mapping-select:hover { background-color: var(--color-background); border-color: var(--color-border); }
.mapping-select:focus { background-color: var(--color-background); border-color: var(--color-accent); outline: none; }
.mapping-select option { background-color: var(--color-background-soft); color: var(--color-text); padding: 4px; }
.center-content { justify-content: center; padding-top: 0; }
.row-disabled { opacity: 0.5; background: #fafafa; } 
.filter-wrapper { width: 100%; position: relative; margin-top: 10px;}
.header-filter-control { height: 28px; width: 100%; padding: 0 6px; font-size: 12px; background: transparent; border: 1px solid transparent; border-radius: 4px; color: var(--color-text); font-weight: 600; cursor: pointer; box-sizing: border-box; }
.header-filter-control:hover, .header-filter-control:focus { background: var(--color-background); border-color: var(--color-border); }
.no-bg-hover:hover { background: transparent !important; border-color: transparent !important; }
.has-arrow { appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 4px center; padding-right: 16px; }
:deep(.picker-trigger) { height: 28px !important; border: 1px solid transparent; background: transparent; padding: 0 4px !important; margin-bottom: 10px; font-size: 12px; font-weight: 600; color: var(--color-text) !important; }
:deep(.value-text) { color: var(--color-text) !important; }
:deep(.picker-trigger:hover) { border-color: var(--color-border); background: var(--color-background); }
.preview-header-bar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.header-controls { display: flex; gap: 12px; align-items: center; }
.debug-toggle { font-size: 12px; color: var(--color-text-soft); cursor: pointer; display: flex; align-items: center; gap: 4px; }
.count-label { font-size: 12px; color: var(--color-text-soft); }
.header-label { display: flex; align-items: center; height: 28px; width: 100%; padding: 0 6px; font-size: 12px; font-weight: 600; color: var(--color-text); box-sizing: border-box; margin-top: 8px;; }
.close-btn { position: absolute; top: 10px; right: 15px; font-size: 32px; color: var(--color-text-soft); background: none; border: none; cursor: pointer; z-index: 1001; }
h2 { padding: 20px 24px; margin: 0; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.modal-tabs { display: flex; padding: 0 24px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.tab-btn { padding: 12px 16px; background: none; border: none; color: var(--color-text-soft); cursor: pointer; border-bottom: 2px solid transparent; }
.tab-btn.active { color: var(--color-accent); border-bottom-color: var(--color-accent); }
.import-content-wrapper { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.modal-step-content { flex: 1; padding: 24px; overflow-y: auto; }
.export-step { padding: 0; display: flex; flex-direction: column; } 
.export-controls-container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.export-preview-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.empty-state { padding: 20px; text-align: center; color: var(--color-text-soft); }
.modal-actions { padding: 16px 24px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 12px; flex-shrink: 0; }

/* 🟢 Special Footer Layout for Review */
.review-actions-footer, .export-preview-footer { display: flex; justify-content: space-between; align-items: center; }
.export-preview-footer { justify-content: flex-start; } /* Кнопка слева */
.spacer { flex-grow: 1; }

.export-description { margin-bottom: 32px; } 
.btn-primary { padding: 8px 16px; background: #3b3b3b; color: white; border: none; border-radius: 6px; cursor: pointer; margin-right: 10px; }
.btn-secondary { padding: 8px 16px; background: var(--color-background-mute); border: 1px solid var(--color-border); color: var(--color-text); border-radius: 6px; cursor: pointer; }

/* 🟢 Зеленая кнопка */
.btn-green { background-color: #10b981; color: white; }
.btn-green:hover { background-color: #059669; }
.btn-green:disabled { background-color: #6ee7b7; cursor: not-allowed; }

.btn-small { padding: 4px 8px; font-size: 11px; height: 24px; }
.loading-indicator { display: flex; flex-direction: column; align-items: center; }
.spinner { width: 30px; height: 30px; border: 3px solid var(--color-border); border-top-color: var(--color-accent); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.drop-zone { border: 2px dashed var(--color-border); padding: 40px; text-align: center; margin-bottom: 20px; }
.file-input { display: none; }
.file-input-label { background: var(--color-accent); color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; display: inline-block; margin: 10px 0; }
/* 🟢 3. СТИЛИ ДЛЯ ЦВЕТНЫХ СТРОК (В КОНЦЕ ФАЙЛА) */
.unified-grid.colorized .row-income { background-color: rgba(16, 185, 129, 1); color:#000000; }
.unified-grid.colorized .row-expense { background-color: rgba(239, 68, 68, 1); color:#ffffff;}
.unified-grid.colorized .row-prepayment { background-color: rgba(245, 158, 11, 1); color:#000000;}
.unified-grid.colorized .row-transfer { background-color: rgba(55, 65, 81, 1); color:#ffffff;}
.unified-grid.colorized .row-withdrawal { background-color: rgba(216, 180, 254, 1); color:#000000; }

/* 🟢 НОВЫЕ ЦВЕТА */
.unified-grid.colorized .row-act { background-color: #E2E8F0; color: #1e293b; } /* Нейтральный серо-синий */
.unified-grid.colorized .row-shift { background-color: #E9D5FF; color: #581c87; } /* Светло-фиолетовый */

.unified-grid.colorized .grid-cell { border-bottom-color: #fff; border-right-color: #fff; }
.color-controls-wrapper { display: flex; align-items: center; gap: 12px; margin-right: 12px; padding-right: 12px; border-right: 1px solid var(--color-border); }
.sub-color-toggles { display: flex; gap: 8px; align-items: center; }
.sub-toggle { font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer; color: var(--color-text-soft); user-select: none; }
.sub-toggle input { margin: 0; width: 14px; height: 14px; }
.sub-toggle.income { color: #10b981; } .sub-toggle.expense { color: #ef4444; } .sub-toggle.prepayment { color: #f59e0b; } .sub-toggle.transfer { color: #6b7280; } .sub-toggle.withdrawal { color: #a855f7; }
.sub-toggle.act { color: #64748b; } .sub-toggle.shift { color: #a855f7; } /* Цвета тогглов */

/* REVIEW DASHBOARD STYLES */
.review-dashboard { width: 100%; padding-bottom: 30px; }
.review-intro { display: flex; justify-content: center; margin-bottom: 20px; border-bottom: 1px solid var(--color-border); padding-bottom: 20px; }
.stat-big { display: flex; flex-direction: column; align-items: center; }
.stat-val { font-size: 2.5em; font-weight: 800; color: var(--color-heading); line-height: 1; }
.stat-lbl { font-size: 1em; color: var(--color-text-soft); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 5px; }

.review-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 30px; }
.review-card { background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; }
.card-head { font-size: 0.8em; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px; }
.card-income .card-head { color: #10b981; } .card-expense .card-head { color: #ef4444; }
.card-prepayment .card-head { color: #f59e0b; } .card-transfer .card-head { color: #6b7280; }
.card-withdrawal .card-head { color: #a855f7; }
.card-body { font-size: 0.85em; color: var(--color-text); }
.card-row { display: flex; justify-content: space-between; margin-bottom: 2px; }

.new-entities-section { margin-top: 20px; background: rgba(255,255,255,0.03); padding: 20px; border-radius: 8px; border: 1px dashed var(--color-border); }
.new-entities-section h4 { margin: 0 0 15px 0; font-size: 1.1em; color: var(--color-heading); }
.entities-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
.entity-block { background: var(--color-background); border: 1px solid var(--color-border); padding: 10px; border-radius: 6px; }
.entity-title { font-weight: 600; margin-bottom: 8px; font-size: 0.9em; color: var(--color-text-soft); }
.entity-items { list-style: none; padding: 0; margin: 0; font-size: 0.9em; color: var(--color-text); max-height: 150px; overflow-y: auto; }
.entity-items li { padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
</style>