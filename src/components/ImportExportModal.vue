<script setup>
import { ref, computed, onMounted } from 'vue';
import Papa from 'papaparse';
import { useMainStore } from '@/stores/mainStore';
// 🟢 Импортируем компонент
import DateRangePicker from '@/components/DateRangePicker.vue';

// --- Компонент ---
const emit = defineEmits(['close', 'import-complete']);
const mainStore = useMainStore();

const currentTab = ref('import');
const isExporting = ref(false);
const exportError = ref(null);

// Единое состояние данных
const isDataReady = ref(false);
const processedAllData = ref({}); 
const showExportPreview = ref(false);

// 🟢 v10.28: Состояние отображения ID для отладки
const showDebugIds = ref(false);
// 🟢 v10.29: Состояние "По ширине текста"
const isFitContent = ref(false);

// 🟢 v10.25: Фильтры экспорта
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

// Адаптер для DateRangePicker
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

// Хелпер: есть ли активные фильтры
const hasActiveFilters = computed(() => {
  const f = exportFilters.value;
  return f.dateFrom || f.dateTo || f.type || f.category || f.account || f.project || f.status || f.contractor || f.owner;
});

// --- Шаги (Импорт) ---
const step = ref('upload'); 
const error = ref(null);
const isLoading = ref(false);

// --- CSV Данные (Импорт) ---
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

// --- Сопоставление (Mapping) ---
const columnMapping = ref({});

const systemFields = [
  { key: 'date', label: 'Дата', entity: null, aliases: ['дата', 'date'] },
  { key: 'type', label: 'Тип операции', entity: null, aliases: ['тип', 'операция', 'type', 'тип операции'] },
  { key: 'amount', label: 'Сумма', entity: null, aliases: ['сумма', 'amount'] },
  { key: 'category', label: 'Категория', entity: 'categories', aliases: ['категория', 'category'] },
  { key: 'project', label: 'Проект', entity: 'projects', aliases: ['проект', 'project', 'мои проекты'] },
  { key: 'account', label: 'Счет', entity: 'accounts', aliases: ['счет', 'account', 'мои счета'] },
  { key: 'company', label: 'Компания', entity: 'companies', aliases: ['компания', 'company', 'мои компании', 'компания/физлицо'] },
  { key: 'individual', label: 'Физлицо', entity: 'individuals', aliases: ['физлицо', 'individual', 'мои физлица'] },
  { key: 'contractor', label: 'Контрагент', entity: 'contractors', aliases: ['контрагент', 'contractor', 'мои контрагенты'] },
];

// --- Подтверждение (Review) ---
const newEntities = ref({
  categories: [],
  projects: [],
  accounts: [],
  companies: [],
  contractors: [],
  individuals: [],
});
const operationsToImport = ref([]);

// --- Импорт (Importing) ---
const importProgress = ref(0);
const isReviewDisabled = computed(() => {
  const mappedKeys = Object.values(columnMapping.value);
  const hasMinFields = mappedKeys.includes('date') && mappedKeys.includes('amount') && mappedKeys.includes('type');
  return !hasMinFields || selectedRows.value.size === 0;
});


// --- Функции ---

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
  
  if (fileInputRef.value) {
    fileInputRef.value.value = null;
  }
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
  
  return dateHeader && row[dateHeader] &&
         amountHeader && row[amountHeader] &&
         typeHeader && row[typeHeader];
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
      (progress) => {
        importProgress.value = progress;
      }
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
    if (systemKey) {
      reverseMapping[systemKey] = header;
    }
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
          if (opType === 'expense' && value > 0) {
            value = -value;
          }
        } else if (systemKey === 'date') {
          value = parseDate(value); 
        }
        op[systemKey] = value;
      }
    }
    
    if (op.date && op.amount !== null && op.type) {
      operations.push(op);
    }
  }
  return operations;
}

function cleanAmount(value) {
  if (typeof value !== 'string') return null;
  let cleaned = value.replace(/₸/g, '').replace(/[^\d.,-]/g, ''); 
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  
  if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } 
  else if (lastDot > lastComma) {
    cleaned = cleaned.replace(/,/g, '');
  }
  else if (lastComma !== -1 && lastDot === -1) {
    if (cleaned.match(/,/g).length === 1 && lastComma > cleaned.length - 4) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  else if (lastDot !== -1 && lastComma === -1) {
    if (cleaned.match(/\./g).length > 1) {
       cleaned = cleaned.replace(/\./g, (match, offset) => offset === lastDot ? '.' : '');
    }
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
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
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


// ----------------------------------------------
// 🔴 ФУНКЦИИ ДЛЯ ЭКСПОРТА (v10.23 ID FIX)
// ----------------------------------------------

const UNIFIED_COLUMNS = [
  'Дата',
  'Тип',
  'Категория',
  'Проект',
  'Сумма',
  'Прогноз',
  'Счет',
  'Контрагент',
  'Компания/Физлицо',
  'Описание',
  'Статус',
  'account_id',
  'category_id',
  'project_id'
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

/**
 * 🟢 v10.23: Полностью обновленная функция подготовки данных
 */
async function prepareExportData() {
  isExporting.value = true;
  exportError.value = null;
  showExportPreview.value = false;
  resetExportFilters(); 
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const { operations } = await mainStore.exportAllOperations(); 
    
    const runningBalances = new Map();
    mainStore.accounts.forEach(acc => {
      runningBalances.set(acc._id, acc.initialBalance || 0);
    });

    const allRows = [];
    
    operations.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return createdA - createdB;
    });
    
    for (const op of operations) {
      if (!op.date) continue; 
      let dateStr = '';
      let opTimestamp = 0;
      
      try {
        const d = new Date(op.date);
        opTimestamp = d.getTime();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        dateStr = `${day}.${month}.${year}`;
      } catch (e) { continue; }

      const isFuture = opTimestamp > todayTimestamp;
      const status = isFuture ? 'План' : 'Исполнено';
      const opAmount = op.amount || 0;

      let catName = resolveEntityName(op.categoryId, mainStore.categories);
      let projName = resolveEntityName(op.projectId, mainStore.projects);
      let contrName = resolveEntityName(op.contractorId, mainStore.contractors);
      let ownerName = resolveEntityName(op.companyId, mainStore.companies) || resolveEntityName(op.individualId, mainStore.individuals);

      let catId = resolveEntityId(op.categoryId, mainStore.categories);
      let projId = resolveEntityId(op.projectId, mainStore.projects);
      let accountId = resolveEntityId(op.accountId, mainStore.accounts);

      if (!projName || projName.trim() === '') {
        projName = 'Без проекта';
      }

      const addRow = (accId, amountChange, typeLabel, desc, overrides = {}) => {
         let currentBalance = 0;
         let accName = '';
         
         if (accId) {
            const prev = runningBalances.get(accId) || 0;
            currentBalance = prev + amountChange;
            runningBalances.set(accId, currentBalance);
            accName = mainStore.accounts.find(a => a._id === accId)?.name || '???';
         }

         let finalCatId = catId;
         if (overrides.category && overrides.category !== catName) {
             finalCatId = resolveEntityId(overrides.category, mainStore.categories);
         }

         allRows.push({
            'Дата': dateStr,
            'Тип': typeLabel,
            'Категория': overrides.category !== undefined ? overrides.category : catName, 
            'Проект': projName, 
            'Сумма': amountChange,
            'Прогноз': accId ? currentBalance : '', 
            'Счет': accName,
            'Контрагент': overrides.contractor !== undefined ? overrides.contractor : contrName,
            'Компания/Физлицо': overrides.owner !== undefined ? overrides.owner : ownerName,
            'Описание': desc, 
            'Статус': status,
            'account_id': accId || '',
            'category_id': finalCatId || '', 
            'project_id': projId || ''
         });
      };

      if (op.type === 'transfer' || op.isTransfer) {
         const fromAccId = resolveEntityId(op.fromAccountId, mainStore.accounts);
         const toAccId = resolveEntityId(op.toAccountId, mainStore.accounts);
         
         const fromOwner = resolveEntityName(op.fromCompanyId, mainStore.companies) || resolveEntityName(op.fromIndividualId, mainStore.individuals);
         const toOwner = resolveEntityName(op.toCompanyId, mainStore.companies) || resolveEntityName(op.toIndividualId, mainStore.individuals);
         
         const absAmount = Math.abs(opAmount);
         const transferCategory = catName || 'Перевод';

         const isInterCompany = op.fromCompanyId && op.toCompanyId && (
            (op.fromCompanyId._id || op.fromCompanyId) !== (op.toCompanyId._id || op.toCompanyId)
         );
         const isToPersonal = !!op.toIndividualId; 

         if (isInterCompany) {
             if (fromAccId) {
                addRow(fromAccId, -absAmount, 'Расход', `Перевод в ${toOwner}`, {
                    owner: fromOwner,
                    contractor: toOwner, 
                    category: transferCategory 
                });
             }
             if (toAccId) {
                 addRow(toAccId, absAmount, 'Доход', `Поступление от ${fromOwner}`, {
                     owner: toOwner,
                     contractor: fromOwner,
                     category: transferCategory 
                 });
             }
         }
         else if (isToPersonal) {
             const personalDesc = "На развитие бизнеса";
             if (fromAccId) {
                 addRow(fromAccId, -absAmount, 'Перевод (Исх)', personalDesc, { 
                     owner: fromOwner, 
                     contractor: toOwner,
                     category: transferCategory 
                 });
             }
             if (toAccId) {
                 addRow(toAccId, absAmount, 'Перевод (Вх)', personalDesc, { 
                     owner: toOwner, 
                     contractor: fromOwner,
                     category: transferCategory 
                 });
             }
         }
         else {
             const stdDesc = op.description || `Перевод: ${fromOwner || 'Счет'} -> ${toOwner || 'Счет'}`;
             if (fromAccId) {
                addRow(fromAccId, -absAmount, 'Перевод (Исх)', stdDesc, { 
                    owner: fromOwner, 
                    contractor: toOwner,
                    category: transferCategory 
                });
             }
             if (toAccId) {
                addRow(toAccId, absAmount, 'Перевод (Вх)', stdDesc, { 
                    owner: toOwner, 
                    contractor: fromOwner,
                    category: transferCategory 
                });
             }
         }
      }
      else if (op.type === 'withdrawal') {
          const acc = mainStore.accounts.find(a => a._id === accountId);
          let withdrawalContr = '';
          if (acc && acc.individualId) {
              withdrawalContr = resolveEntityName(acc.individualId, mainStore.individuals);
          }
          const desc = op.description || `Вывод средств (${withdrawalContr})`;
          const withdrawalCategory = catName || 'Вывод средств';
          addRow(
             accountId,
             opAmount,
             'Вывод средств',
             desc,
             { 
                 contractor: withdrawalContr,
                 category: withdrawalCategory 
             }
          );
      }
      else {
         let typeLabel = 'Расход';
         let finalDesc = op.description || '';

         if (op.type === 'income') {
             const catNameLower = catName.toLowerCase().trim();
             if (catNameLower.includes('розничн') || catNameLower.includes('реализация')) {
                 typeLabel = 'Предоплата';
                 if (!finalDesc) finalDesc = `Предоплата: ${catName}`;
             } else {
                 typeLabel = 'Доход';
                 if (!finalDesc) finalDesc = `Доход: ${catName}`;
             }
         }
         else if (op.type === 'prepayment') {
             typeLabel = 'Предоплата';
             if (!finalDesc) finalDesc = `Предоплата по проекту ${projName}`;
         }
         else {
             if (!finalDesc) finalDesc = `Расход: ${catName}`;
         }

         addRow(
            accountId, 
            opAmount, 
            typeLabel,
            finalDesc,
            {} 
         );
      }
    }
    
    processedAllData.value = { data: allRows, columns: UNIFIED_COLUMNS };
    isDataReady.value = true;
    
  } catch (err) {
    console.error("Ошибка при подготовке экспорта:", err);
    exportError.value = `Не удалось подготовить данные: ${err.message || 'Неизвестная ошибка'}`;
  } finally {
    isExporting.value = false;
  }
}

function downloadAllData() {
  const csvString = Papa.unparse(processedAllData.value.data, {
    header: true,
    columns: processedAllData.value.columns,
    transform: (value) => (value === null || value === undefined) ? "" : value,
  });
  triggerCsvDownload(csvString, "Full_Statement");
}

function triggerCsvDownload(csvString, filenamePrefix = "export") {
  const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  const d = new Date();
  const pad = (num) => String(num).padStart(2, '0');
  const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  link.setAttribute('download', `index12_${filenamePrefix}_${timestamp}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ----------------------------------------------
// 🟢 v10.25: ФИЛЬТРАЦИЯ
// ----------------------------------------------

const exportFilterOptions = computed(() => {
  const data = processedAllData.value.data || [];
  const options = {
    type: new Set(),
    category: new Set(),
    account: new Set(),
    project: new Set(),
    status: new Set(),
    contractor: new Set(),
    owner: new Set()
  };

  data.forEach(row => {
    if (row['Тип']) options.type.add(row['Тип']);
    if (row['Категория']) options.category.add(row['Категория']);
    if (row['Счет']) options.account.add(row['Счет']);
    if (row['Проект']) options.project.add(row['Проект']);
    if (row['Статус']) options.status.add(row['Статус']);
    if (row['Контрагент']) options.contractor.add(row['Контрагент']);
    if (row['Компания/Физлицо']) options.owner.add(row['Компания/Физлицо']);
  });

  return {
    type: Array.from(options.type).sort(),
    category: Array.from(options.category).sort(),
    account: Array.from(options.account).sort(),
    project: Array.from(options.project).sort(),
    status: Array.from(options.status).sort(),
    contractor: Array.from(options.contractor).sort(),
    owner: Array.from(options.owner).sort()
  };
});

function parseRowDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;
  return new Date(parts[2], parts[1] - 1, parts[0]);
}

const filteredExportData = computed(() => {
  let data = processedAllData.value.data || [];
  const f = exportFilters.value;

  if (f.type) data = data.filter(r => r['Тип'] === f.type);
  if (f.category) data = data.filter(r => r['Категория'] === f.category);
  if (f.account) data = data.filter(r => r['Счет'] === f.account);
  if (f.project) data = data.filter(r => r['Проект'] === f.project);
  if (f.status) data = data.filter(r => r['Статус'] === f.status);
  if (f.contractor) data = data.filter(r => r['Контрагент'] === f.contractor);
  if (f.owner) data = data.filter(r => r['Компания/Физлицо'] === f.owner);

  if (f.dateFrom || f.dateTo) {
    const from = f.dateFrom ? new Date(f.dateFrom) : null;
    const to = f.dateTo ? new Date(f.dateTo) : null;
    if (from) from.setHours(0,0,0,0);
    if (to) to.setHours(23,59,59,999);

    data = data.filter(r => {
      const rDate = parseRowDate(r['Дата']);
      if (!rDate) return false;
      if (from && rDate < from) return false;
      if (to && rDate > to) return false;
      return true;
    });
  }
  return data;
});

// 🟢 КОНФИГУРАЦИЯ СЕТКИ (GRID) - ЭКСПОРТ
// Определяем ширину каждой колонки
const gridTemplate = computed(() => {
  if (isFitContent.value) {
    // 🟢 Если включен режим "По ширине текста", используем max-content для всех колонок
    const colCount = visibleColumns.value.length;
    return Array(colCount).fill('max-content').join(' ');
  }

  const widths = [
    '140px', // Дата
    '90px',  // Тип
    '130px', // Категория
    '120px', // Проект
    '90px',  // Сумма
    '90px',  // Прогноз
    '130px', // Счет
    '130px', // Контрагент
    '130px', // Компания/Физлицо
    'minmax(200px, 1fr)', // Описание
    '90px',  // Статус
  ];
  
  if (showDebugIds.value) {
    widths.push('200px'); // account_id
    widths.push('200px'); // category_id
    widths.push('200px'); // project_id
  }
  
  return widths.join(' ');
});

const visibleColumns = computed(() => {
  const cols = [...UNIFIED_COLUMNS];
  if (!showDebugIds.value) {
    // Убираем ID-колонки, если отладка выключена
    return cols.filter(c => !c.includes('_id'));
  }
  return cols;
});

// 🟢 КОНФИГУРАЦИЯ СЕТКИ (GRID) - ИМПОРТ
const visibleCsvHeaders = computed(() => {
  if (showDebugIds.value) return csvHeaders.value;
  // Скрываем колонки, оканчивающиеся на _id или равные id
  return csvHeaders.value.filter(h => {
      const lower = h.trim().toLowerCase();
      return !lower.endsWith('_id') && lower !== 'id' && lower !== '_id';
  });
});

const importGridTemplate = computed(() => {
  // 🟢 Чекбокс: фиксированные 48px
  const widths = ['48px']; 
  const size = isFitContent.value ? 'max-content' : 'minmax(200px, 1fr)';
  
  if (visibleCsvHeaders.value.length) {
    for (let i = 0; i < visibleCsvHeaders.value.length; i++) {
       widths.push(size);
    }
  }
  return widths.join(' ');
});

</script>
<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="modal-content">
      <button class="close-btn" @click="closeModal" title="Закрыть">&times;</button>
      
      <h2>{{ currentTab === 'import' ? 'Импорт операций' : 'Экспорт Отчетов' }}</h2>
      
      <div class="modal-tabs">
        <button 
          class="tab-btn" 
          :class="{ active: currentTab === 'import' }"
          @click="currentTab = 'import'"
        >
          Импорт (CSV)
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: currentTab === 'export' }"
          @click="currentTab = 'export'"
        >
          Экспорт (CSV)
        </button>
      </div>

      <!-- Вкладка ИМПОРТ -->
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

        <!-- 🟢 ИМПОРТ: STEP MAPPING (UNIFIED GRID LAYOUT) -->
        <div v-if="step === 'mapping'" class="export-preview-container">
           <!-- HEADER BAR -->
           <div class="preview-header-bar">
              <h3>Сопоставьте колонки</h3>
              <div class="header-controls">
                  <label class="debug-toggle">
                    <input type="checkbox" v-model="isFitContent"> ↔ По ширине
                  </label>
                  <label class="debug-toggle">
                    <input type="checkbox" v-model="showDebugIds"> Показать ID
                  </label>
                  <span class="count-label">Строк: {{ csvData.length }}</span>
                  <button class="btn-secondary" @click="resetState">
                      &times; Сброс
                  </button>
              </div>
           </div>
           
           <!-- GRID TABLE CONTAINER (SCROLLABLE) -->
           <div class="grid-table-container">
              <!-- UNIFIED GRID (PARENT) -->
              <div class="unified-grid" :class="{ 'fit-mode': isFitContent }" :style="{ gridTemplateColumns: importGridTemplate }">
                 
                 <!-- HEADER GROUP (STICKY) -->
                 <div class="header-group contents-display">
                     <div class="grid-header-cell center-content sticky">
                        <input type="checkbox" @change="toggleSelectAll" :checked="isAllSelected" />
                     </div>
                     <div v-for="header in visibleCsvHeaders" :key="header" class="grid-header-cell import-grid-header sticky">
                         <span class="csv-header-name" :title="header">{{ header }}</span>
                         <select v-model="columnMapping[header]" class="mapping-select">
                            <option :value="null">-- Не использовать --</option>
                            <option v-for="field in systemFields" :key="field.key" :value="field.key">{{ field.label }}</option>
                         </select>
                     </div>
                 </div>

                 <!-- BODY ROWS (FLATTENED via contents) -->
                 <div v-for="(row, rowIndex) in previewData" :key="rowIndex" class="row-group contents-display">
                    <!-- Checkbox Cell -->
                    <div class="grid-cell center-content" :class="{ 'row-disabled': !isValidRow(row) }">
                       <input type="checkbox" :value="rowIndex" v-model="selectedRows" :disabled="!isValidRow(row)" />
                    </div>
                    <!-- Data Cells -->
                    <div v-for="(header, colIndex) in visibleCsvHeaders" :key="colIndex" class="grid-cell" :class="{ 'row-disabled': !isValidRow(row) }" :title="row[header]">
                       {{ row[header] }}
                    </div>
                 </div>

              </div>
           </div>
           <div v-if="error" class="error-message" style="margin: 10px 24px;">{{ error }}</div>
        </div>

        <div v-if="step === 'review'" class="modal-step-content review-step">
          <p class="step-description">Проверка перед импортом</p>
          <div class="new-entities-container">
            <div v-for="entityType in Object.keys(newEntities)" :key="entityType">
              <div v-if="newEntities[entityType].length > 0" class="entity-list">
                <h4>Новые {{ getEntityName(entityType) }}:</h4>
                <ul><li v-for="item in newEntities[entityType]" :key="item">{{ item }}</li></ul>
              </div>
            </div>
          </div>
          <div v-if="error" class="error-message">{{ error }}</div>
        </div>
        
        <div v-if="step === 'importing'" class="modal-step-content">
          <div class="loading-indicator">
            <div class="spinner"></div>
            <p>Импорт... {{ importProgress }} / {{ operationsToImport.length }}</p>
          </div>
        </div>
      </div>
      
      <!-- Вкладка ЭКСПОРТ -->
      <div v-if="currentTab === 'export'" class="modal-step-content export-step">
        <div v-if="!showExportPreview" class="export-controls-container">
            <!-- 🟢 Отдельный стиль для описания -->
            <p class="export-description">Скачайте единый отчет по всем операциям.</p>
            <button v-if="!isDataReady" @click="prepareExportData" class="btn-primary export-btn prepare-btn" :disabled="isExporting">
              Подготовить данные
            </button>
            <div v-if="isExporting" class="loading-indicator"><div class="spinner"></div></div>
            <div v-if="isDataReady && !isExporting" class="download-section">
              <div class="download-buttons">
                <!-- 🟢 Кнопка Скачать -->
                <button class="btn-primary export-btn" @click="downloadAllData">Скачать выписку</button>
                <button class="btn-primary export-btn view-btn" @click="showExportPreview = true">Смотреть выписку</button>
              </div>
              <button class="btn-secondary" @click="resetExport" style="margin-top: 20px;">Начать заново</button>
            </div>
            <div v-if="exportError" class="error-message">{{ exportError }}</div>
        </div>

        <!-- 🟢 ПРЕДПРОСМОТР (UNIFIED GRID LAYOUT) -->
        <div v-if="showExportPreview" class="export-preview-container">
            <div class="preview-header-bar">
                <h3>Предпросмотр</h3>
                <div class="header-controls">
                    <label class="debug-toggle">
                      <input type="checkbox" v-model="isFitContent"> ↔ По ширине
                    </label>
                    <label class="debug-toggle">
                      <input type="checkbox" v-model="showDebugIds"> Показать ID
                    </label>
                    <span class="count-label">Строк: {{ filteredExportData.length }}</span>
                    <button v-if="hasActiveFilters" class="btn-secondary btn-small" @click="resetExportFilters">
                      &times; Сброс
                    </button>
                    <button class="btn-secondary" @click="showExportPreview = false">
                        &larr; Назад
                    </button>
                </div>
            </div>

            <!-- GRID TABLE CONTAINER (SCROLLABLE) -->
            <div class="grid-table-container">
                <!-- UNIFIED GRID (PARENT) -->
                <div class="unified-grid" :class="{ 'fit-mode': isFitContent }" :style="{ gridTemplateColumns: gridTemplate }">
                    
                    <!-- HEADER GROUP (STICKY) -->
                    <div class="header-group contents-display">
                        <div v-for="col in visibleColumns" :key="col" class="grid-header-cell sticky">
                            
                            <!-- Filters (unchanged) -->
                            <div v-if="col === 'Дата'" class="filter-wrapper">
                               <DateRangePicker v-model="dateRangeFilter" placeholder="Дата" class="header-filter-control no-bg-hover"/>
                            </div>
                            <div v-else-if="col === 'Тип'" class="filter-wrapper">
                               <select v-model="exportFilters.type" class="header-filter-control has-arrow">
                                  <option value="">Тип</option>
                                  <option v-for="opt in exportFilterOptions.type" :key="opt" :value="opt">{{ opt }}</option>
                               </select>
                            </div>
                            <div v-else-if="col === 'Категория'" class="filter-wrapper">
                                <select v-model="exportFilters.category" class="header-filter-control has-arrow">
                                  <option value="">Категория</option>
                                  <option v-for="opt in exportFilterOptions.category" :key="opt" :value="opt">{{ opt }}</option>
                               </select>
                            </div>
                            <div v-else-if="col === 'Проект'" class="filter-wrapper">
                                <select v-model="exportFilters.project" class="header-filter-control has-arrow">
                                  <option value="">Проект</option>
                                  <option v-for="opt in exportFilterOptions.project" :key="opt" :value="opt">{{ opt }}</option>
                               </select>
                            </div>
                            <div v-else-if="col === 'Счет'" class="filter-wrapper">
                                <select v-model="exportFilters.account" class="header-filter-control has-arrow">
                                  <option value="">Счет</option>
                                  <option v-for="opt in exportFilterOptions.account" :key="opt" :value="opt">{{ opt }}</option>
                               </select>
                            </div>
                            <div v-else-if="col === 'Контрагент'" class="filter-wrapper">
                                <select v-model="exportFilters.contractor" class="header-filter-control has-arrow">
                                  <option value="">Контрагент</option>
                                  <option v-for="opt in exportFilterOptions.contractor" :key="opt" :value="opt">{{ opt }}</option>
                               </select>
                            </div>
                            <div v-else-if="col === 'Компания/Физлицо'" class="filter-wrapper">
                                <select v-model="exportFilters.owner" class="header-filter-control has-arrow">
                                  <option value="">Комп./Физ.</option>
                                  <option v-for="opt in exportFilterOptions.owner" :key="opt" :value="opt">{{ opt }}</option>
                               </select>
                            </div>
                            <div v-else-if="col === 'Статус'" class="filter-wrapper">
                                <select v-model="exportFilters.status" class="header-filter-control has-arrow">
                                  <option value="">Статус</option>
                                  <option v-for="opt in exportFilterOptions.status" :key="opt" :value="opt">{{ opt }}</option>
                               </select>
                            </div>
                            
                            <!-- Simple Header -->
                            <span v-else class="header-label">{{ col }}</span>
                        </div>
                    </div>

                    <!-- BODY ROWS (FLATTENED via contents) -->
                    <div v-for="(row, idx) in filteredExportData" :key="idx" class="row-group contents-display">
                        <div v-for="col in visibleColumns" :key="col" class="grid-cell" :title="row[col]">
                            {{ row[col] }}
                        </div>
                    </div>
                    
                    <div v-if="filteredExportData.length === 0" class="empty-state" style="grid-column: 1 / -1;">
                        Нет данных
                    </div>
                </div>
            </div>
        </div>
      </div>

      <!-- Футер -->
      <div v-if="currentTab === 'import'" class="modal-actions">
        <button @click="closeModal" class="btn-secondary">Отмена</button>
        <button @click="previousStep" v-if="step !== 'upload' && step !== 'importing'" class="btn-secondary">Назад</button>
        <button @click="goToReviewStep" v-if="step === 'mapping'" class="btn-primary" :disabled="isReviewDisabled">Проверить</button>
        <button @click="startImport" v-if="step === 'review'" class="btn-primary" :disabled="operationsToImport.length === 0">Начать</button>
      </div>
      <div v-if="currentTab === 'export'" class="modal-actions">
        <button @click="closeModal" class="btn-secondary">Закрыть</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 🟢 МОДАЛЬНОЕ ОКНО - ШИРОКОЕ */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal-content {
  width: 95vw; max-width: 1400px; height: 90vh; max-height: 900px;
  background: var(--color-background); border-radius: 8px; border: 1px solid var(--color-border);
  box-shadow: 0 10px 30px rgba(0,0,0,0.2); display: flex; flex-direction: column; position: relative;
}

/* 🟢 GRID TABLE STYLES (UNIFIED) */
.grid-table-container {
  display: block; /* Важно: блок для скролла */
  overflow: auto; 
  flex: 1;
  position: relative;
  border-top: 1px solid var(--color-border);
}

/* Сам грид */
.unified-grid {
  display: grid;
  /* Columns задаются инлайново через computed */
  align-items: center;
  min-width: 100%; /* Растягиваемся, если контента мало */
  width: max-content; /* Позволяем расти, если контента много (для fit-content) */
}

/* Группы (Header Row, Body Row) исчезают из потока грида */
.contents-display {
  display: contents;
}

/* Ячейки заголовка */
.grid-header-cell {
  background: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
  border-right: 1px solid var(--color-border-hover);
  padding: 4px;
  height: 50px; /* 🟢 FIX: Фикс. высота заголовка */
  display: flex; 
  align-items: center;
  overflow: visible; 
  box-sizing: border-box;
}

/* Sticky Header */
.grid-header-cell.sticky {
  position: sticky;
  top: 0;
  z-index: 20;
}

/* Ячейки тела */
.grid-cell {
  padding: 0 8px; /* 🟢 FIX: Отступы только по бокам */
  font-size: 13px;
  border-bottom: 1px solid var(--color-border);
  border-right: 1px solid transparent;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--color-background); /* Фон нужен, чтобы не просвечивало при скролле */
  height: 40px; /* 🟢 FIX: Фикс. высота строки */
  display: flex;
  align-items: center; /* 🟢 FIX: Вертикальное центрирование */
  box-sizing: border-box;
}

/* 🟢 FIT MODE: Убираем обрезание */
.unified-grid.fit-mode .grid-cell {
  overflow: visible;
  text-overflow: clip;
}

/* 🟢 Специфично для заголовков импорта в Grid */
.grid-header-cell.import-grid-header {
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding-top: 0; 
  padding: 4px 8px;
}
.csv-header-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-soft);
  margin-bottom: 4px;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

/* 🟢 FIX: Force styles for mapping select to ensure visibility */
.mapping-select {
  width: 100%;
  height: 24px;
  font-size: 12px;
  border: 1px solid transparent; /* Изменено: прозрачная рамка по умолчанию */
  border-radius: 4px;
  background-color: transparent; /* Изменено: прозрачный фон */
  color: var(--color-heading);   /* Изменено: яркий цвет текста (белый) */
  font-weight: 600;              /* Добавлено: жирность для читаемости */
  appearance: none; /* Remove default browser styling */
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding: 0 20px 0 4px !important; /* 🟢 FIX: Принудительный сброс вертикальных отступов */
  cursor: pointer;
  transition: all 0.2s ease;
}

.mapping-select:hover {
  background-color: var(--color-background); /* Фон при наведении */
  border-color: var(--color-border);
}

.mapping-select:focus {
  background-color: var(--color-background);
  border-color: var(--color-accent);
  outline: none;
}

/* Ensure options are also styled */
.mapping-select option {
  background-color: var(--color-background-soft); /* Явный фон для выпадающего списка */
  color: var(--color-text);
  padding: 4px;
}

.center-content {
  justify-content: center;
  padding-top: 0;
}

/* Disabled Rows Style */
.row-disabled { opacity: 0.5; background: #fafafa; } 

/* 🟢 FILTERS & INPUTS (Strict 28px) */
.filter-wrapper { width: 100%; position: relative; margin-top: 10px;}

.header-filter-control {
  height: 28px; width: 100%;
  padding: 0 6px; font-size: 12px;
  background: transparent; border: 1px solid transparent; border-radius: 4px;
  color: var(--color-text); font-weight: 600;
  cursor: pointer; box-sizing: border-box;
}
.header-filter-control:hover, .header-filter-control:focus {
  background: var(--color-background); border-color: var(--color-border);
}

/* 🟢 FIX: Стили для отключения фона у обертки даты */
.no-bg-hover:hover {
  background: transparent !important;
  border-color: transparent !important;
}

.has-arrow {
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 4px center;
  padding-right: 16px;
}

/* Date Picker Overrides */
:deep(.picker-trigger) {
  height: 28px !important; 
  border: 1px solid transparent; 
  background: transparent; 
  padding: 0 4px !important;
  margin-bottom: 10px; 
  font-size: 12px; 
  font-weight: 600; 
  color: var(--color-text) !important; 
}

/* 🟢 FIX: Force text color specifically for value text elements */
:deep(.value-text) {
  color: var(--color-text) !important; 
}

:deep(.picker-trigger:hover) {
  border-color: var(--color-border); background: var(--color-background);
}

/* PREVIEW HEADER */
.preview-header-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.header-controls { display: flex; gap: 12px; align-items: center; }
.debug-toggle { font-size: 12px; color: var(--color-text-soft); cursor: pointer; display: flex; align-items: center; gap: 4px; }
.count-label { font-size: 12px; color: var(--color-text-soft); }

/* Unified Header Label Style */
.header-label {
  display: flex;
  align-items: center;
  height: 28px; 
  width: 100%;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  box-sizing: border-box;
  margin-top: 0 px;;
}

/* OTHER STYLES (Keep existing) */
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
.export-description { margin-bottom: 32px; } 
.btn-primary { 
  padding: 8px 16px; 
  background: #3b3b3b; 
  color: white; 
  border: none; 
  border-radius: 6px; 
  cursor: pointer; 
  margin-right: 10px; 
}
.btn-secondary { padding: 8px 16px; background: var(--color-background-mute); border: 1px solid var(--color-border); color: var(--color-text); border-radius: 6px; cursor: pointer; }
.btn-small { padding: 4px 8px; font-size: 11px; height: 24px; }
.loading-indicator { display: flex; flex-direction: column; align-items: center; }
.spinner { width: 30px; height: 30px; border: 3px solid var(--color-border); border-top-color: var(--color-accent); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.drop-zone { border: 2px dashed var(--color-border); padding: 40px; text-align: center; margin-bottom: 20px; }
.file-input { display: none; }
.file-input-label { background: var(--color-accent); color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; display: inline-block; margin: 10px 0; }
</style>