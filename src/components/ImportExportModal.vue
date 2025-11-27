<script setup>
import { ref, computed } from 'vue';
import Papa from 'papaparse';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

// --- Компонент ---
const emit = defineEmits(['close', 'import-complete']);
const mainStore = useMainStore();

const currentTab = ref('import');
const isExporting = ref(false);
const exportError = ref(null);

// Единое состояние данных
const isDataReady = ref(false);
const processedAllData = ref({}); 

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
  console.log("Очистка состояния ImportExportModal...");
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
  
  if (fileInputRef.value) {
    fileInputRef.value.value = null;
  }
}

function resetExport() {
  isExporting.value = false;
  exportError.value = null;
  isDataReady.value = false;
  processedAllData.value = {};
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
  
  let cleaned = value
    .replace(/₸/g, '')      
    .replace(/[^\d.,-]/g, ''); 

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
  
  if (['доход', 'income', 'приход', 'поступление'].includes(lower)) {
    return 'income';
  }
  if (['расход', 'expense', 'убыток', 'трата', 'списание'].includes(lower)) {
    return 'expense';
  }
  if (['перевод', 'transfer'].includes(lower)) {
    return 'transfer';
  }
  if (['вывод', 'вывод средств', 'withdrawal'].includes(lower)) {
    return 'withdrawal';
  }
  // 🟢 v10.22: Добавлена "предоплата" для корректного обратного импорта
  if (['предоплата', 'prepayment'].includes(lower)) {
    return 'prepayment';
  }
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
  'Прогноз', // 🟢 v10.22: Переименовано из "Остаток"
  'Счет',
  'Контрагент',
  'Компания/Физлицо',
  'Описание',
  'Статус',
  // Технические поля
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

// 🟢 v10.23: Функция для получения ID сущности (по объекту, ID или имени)
function resolveEntityId(entityOrId, storeList) {
  if (!entityOrId) return '';
  // Если это объект и у него есть ID
  if (typeof entityOrId === 'object' && entityOrId._id) return entityOrId._id;
  // Если это ID (строка 24 символа или меньше/больше, но точно не имя)
  // Для надежности: если это имя, то пытаемся найти ID по имени
  if (typeof entityOrId === 'string') {
      // Если это похоже на ID (простая проверка на длину или формат, но тут просто ищем совпадение)
      const foundById = storeList.find(item => item._id === entityOrId);
      if (foundById) return foundById._id;
      
      // Если по ID не нашли, ищем по имени
      const foundByName = storeList.find(item => item.name && item.name.toLowerCase() === entityOrId.toLowerCase());
      if (foundByName) return foundByName._id;
      
      // Если ничего не нашли, возвращаем как есть (хотя это скорее всего ошибка, но лучше чем ничего)
      // или пустую строку, если мы уверены что это мусор
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
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    // 1. Загружаем ВСЕ операции
    const { operations } = await mainStore.exportAllOperations(); 
    
    // Инициализируем балансы начальными значениями счетов
    const runningBalances = new Map();
    mainStore.accounts.forEach(acc => {
      runningBalances.set(acc._id, acc.initialBalance || 0);
    });

    const allRows = [];
    
    // Сортировка по хронологии
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

      // Резолвим базовые поля (ИМЕНА)
      let catName = resolveEntityName(op.categoryId, mainStore.categories);
      let projName = resolveEntityName(op.projectId, mainStore.projects);
      let contrName = resolveEntityName(op.contractorId, mainStore.contractors);
      let ownerName = resolveEntityName(op.companyId, mainStore.companies) || resolveEntityName(op.individualId, mainStore.individuals);

      // Резолвим базовые поля (ID) - 🟢 v10.23: Гарантируем получение ID
      let catId = resolveEntityId(op.categoryId, mainStore.categories);
      let projId = resolveEntityId(op.projectId, mainStore.projects);
      let accountId = resolveEntityId(op.accountId, mainStore.accounts);

      // 🟢 v10.22: Логика "Без проекта"
      if (!projName || projName.trim() === '') {
        projName = 'Без проекта';
      }

      // 🟢 Вспомогательная функция для добавления строки
      const addRow = (accId, amountChange, typeLabel, desc, overrides = {}) => {
         let currentBalance = 0;
         let accName = '';
         
         if (accId) {
            const prev = runningBalances.get(accId) || 0;
            currentBalance = prev + amountChange;
            runningBalances.set(accId, currentBalance);
            accName = mainStore.accounts.find(a => a._id === accId)?.name || '???';
         }

         // Используем override значения или базовые, но при этом для ID тоже должна быть логика
         // Если override.category (имя) задано, нам нужно найти его ID для полноты данных
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
            // 🟢 v10.23: Технические поля теперь заполняются надежно
            'account_id': accId || '',
            'category_id': finalCatId || '', 
            'project_id': projId || ''
         });
      };

      // ------------------------------------------
      // 1. ЛОГИКА ПЕРЕВОДОВ (v10.22 REWORK)
      // ------------------------------------------
      if (op.type === 'transfer' || op.isTransfer) {
         const fromAccId = resolveEntityId(op.fromAccountId, mainStore.accounts);
         const toAccId = resolveEntityId(op.toAccountId, mainStore.accounts);
         
         const fromOwner = resolveEntityName(op.fromCompanyId, mainStore.companies) || resolveEntityName(op.fromIndividualId, mainStore.individuals);
         const toOwner = resolveEntityName(op.toCompanyId, mainStore.companies) || resolveEntityName(op.toIndividualId, mainStore.individuals);
         
         const absAmount = Math.abs(opAmount);

         // 🟢 FIX: Принудительная категория "Перевод", если пусто
         const transferCategory = catName || 'Перевод';

         // Сценарий Б: Между разными компаниями (Разбиваем на Расход и Доход)
         const isInterCompany = op.fromCompanyId && op.toCompanyId && (
            (op.fromCompanyId._id || op.fromCompanyId) !== (op.toCompanyId._id || op.toCompanyId)
         );

         // Сценарий В: Перевод на личную карту (Если получатель - физлицо, а отправитель - нет?)
         const isToPersonal = !!op.toIndividualId; 

         if (isInterCompany) {
             // 1. У Отправителя -> РАСХОД
             if (fromAccId) {
                addRow(fromAccId, -absAmount, 'Расход', `Перевод в ${toOwner}`, {
                    owner: fromOwner,
                    contractor: toOwner, // Контрагент = получатель
                    category: transferCategory 
                });
             }
             // 2. У Получателя -> ДОХОД
             if (toAccId) {
                 addRow(toAccId, absAmount, 'Доход', `Поступление от ${fromOwner}`, {
                     owner: toOwner,
                     contractor: fromOwner, // Контрагент = отправитель
                     category: transferCategory 
                 });
             }
         }
         else if (isToPersonal) {
             const personalDesc = "На развитие бизнеса";
             // Списание
             if (fromAccId) {
                 addRow(fromAccId, -absAmount, 'Перевод (Исх)', personalDesc, { 
                     owner: fromOwner, 
                     contractor: toOwner,
                     category: transferCategory 
                 });
             }
             // Пополнение
             if (toAccId) {
                 addRow(toAccId, absAmount, 'Перевод (Вх)', personalDesc, { 
                     owner: toOwner, 
                     contractor: fromOwner,
                     category: transferCategory 
                 });
             }
         }
         else {
             // Сценарий А: Обычный перевод между своими счетами
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
      
      // ------------------------------------------
      // 2. ВЫВОД СРЕДСТВ (v10.22)
      // ------------------------------------------
      else if (op.type === 'withdrawal') {
          // Контрагент = Владелец счета списания (Физлицо)
          const acc = mainStore.accounts.find(a => a._id === accountId);
          let withdrawalContr = '';
          if (acc && acc.individualId) {
              withdrawalContr = resolveEntityName(acc.individualId, mainStore.individuals);
          }
          const desc = op.description || `Вывод средств (${withdrawalContr})`;
          // 🟢 FIX: Категория для вывода
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

      // ------------------------------------------
      // 3. ОБЫЧНЫЕ ОПЕРАЦИИ (Доход, Расход, Предоплата)
      // ------------------------------------------
      else {
         let typeLabel = 'Расход';
         let finalDesc = op.description || '';

         if (op.type === 'income') {
             // 🟢 v10.22: Логика ПРЕДОПЛАТЫ
             // Проверяем имя категории
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
             // Расход
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

      <!-- ============================================= -->
      <!-- Вкладка "ИМПОРТ"                            -->
      <!-- ============================================= -->
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
              <p class="small-text">или</p>
              <label class="file-input-label">
                Выберите файл
                <input 
                  ref="fileInputRef"
                  type="file" 
                  accept=".csv" 
                  @change="handleFileSelect" 
                  class="file-input" 
                />
              </label>
              
              <button 
                type="button" 
                class="btn-secondary download-template-btn" 
                @click.stop="downloadTemplate"
              >
                Скачать шаблон (Доход/Расход)
              </button>
              
            </div>
            <div v-if="isLoading" class="loading-indicator">
              <div class="spinner"></div>
              <p>Парсинг файла...</p>
            </div>
          </div>
          <div v-if="error" class="error-message">{{ error }}</div>
        </div>

        <div v-if="step === 'mapping'" class="modal-step-content mapping-step">
          <p class="step-description">
            Сопоставьте колонки из вашего CSV-файла с полями системы.
          </p>
          <div class="mapping-table-container">
            <table>
              <thead>
                <tr>
                  <th class="checkbox-col">
                    <input 
                      type="checkbox" 
                      @change="toggleSelectAll" 
                      :checked="isAllSelected"
                      title="Выбрать все/Снять все"
                    />
                  </th>
                  <th v-for="header in csvHeaders" :key="header">
                    <div class="header-cell">
                      <span class="csv-header-name" :title="header">{{ header }}</span>
                      <select v-model="columnMapping[header]" class="mapping-select">
                        <option :value="null">-- Не использовать --</option>
                        <option disabled>-----------------</option>
                        <option v-for="field in systemFields" :key="field.key" :value="field.key">
                          {{ field.label }}
                        </option>
                      </select>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rowIndex) in previewData" :key="rowIndex" :class="{ 'row-disabled': !isValidRow(row) }">
                  <td class="checkbox-col">
                    <input 
                      type="checkbox" 
                      :value="rowIndex" 
                      v-model="selectedRows"
                      :disabled="!isValidRow(row)"
                    />
                  </td>
                  <td v-for="(header, colIndex) in csvHeaders" :key="colIndex" :title="row[header]">
                    {{ row[header] }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="error" class="error-message">{{ error }}</div>
        </div>

        <div v-if="step === 'review'" class="modal-step-content review-step">
          <p class="step-description">
            Будет импортировано **{{ operationsToImport.length }}** операций (выбрано {{ selectedRows.size }} из {{ csvData.length }} строк).
          </p>
          <p>Следующие новые элементы будут созданы автоматически. Пожалуйста, проверьте:</p>
          
          <div class="new-entities-container">
            <div v-for="entityType in Object.keys(newEntities)" :key="entityType">
              <div v-if="newEntities[entityType].length > 0" class="entity-list">
                <h4>Новые {{ getEntityName(entityType) }}:</h4>
                <ul>
                  <li v-for="item in newEntities[entityType]" :key="item">{{ item }}</li>
                </ul>
              </div>
            </div>
            <p v-if="Object.values(newEntities).every(arr => arr.length === 0)">
              Новых элементов для создания не найдено. Все данные ссылаются на существующие сущности.
            </p>
          </div>
          <div v-if="error" class="error-message">{{ error }}</div>
        </div>
        
        <div v-if="step === 'importing'" class="modal-step-content">
          <div class="loading-indicator">
            <div class="spinner"></div>
            <p>Идет импорт данных... Пожалуйста, подождите.</p>
            <p class="small-text">{{ importProgress }} / {{ operationsToImport.length }}</p>
          </div>
        </div>

      </div>
      
      <!-- =========================================== -->
      <!-- Вкладка "ЭКСПОРТ (CSV)"                     -->
      <!-- =========================================== -->
      <div v-if="currentTab === 'export'" class="modal-step-content export-step">
        
        <p>
          Скачайте единый отчет по всем операциям (Прошлые + Будущие) в формате CSV.<br>
          <small style="color: var(--color-text-soft);">
            Включает: Доходы, Расходы, Переводы (в т.ч. между компаниями), Вывод средств, Предоплаты.<br>
            Колонка "Прогноз" показывает остаток с учетом будущих операций.
          </small>
        </p>
        
        <!-- Шаг 1: Кнопка подготовки -->
        <button 
          v-if="!isDataReady"
          @click="prepareExportData" 
          class="btn-primary export-btn prepare-btn" 
          :disabled="isExporting"
        >
          Подготовить данные
        </button>

        <div v-if="isExporting" class="loading-indicator">
          <div class="spinner"></div>
          <p>Формирование единого отчета и расчет прогноза...</p>
        </div>

        <!-- Шаг 2: Кнопка скачивания -->
        <div v-if="isDataReady && !isExporting" class="download-section">
          <p class="step-description">
            Данные готовы. Вы можете скачать полный отчет ({{ processedAllData.data.length }} строк).
          </p>
          <div class="download-buttons">
            <button class="btn-primary export-btn" @click="downloadAllData">
              Скачать Выписку (Все операции)
            </button>
          </div>
          <button class="btn-secondary" @click="resetExport" style="margin-top: 20px;">
            Начать заново
          </button>
        </div>
        
        <div v-if="exportError" class="error-message">
          {{ exportError }}
        </div>
      </div>

      <!-- Футер для ИМПОРТА -->
      <div v-if="currentTab === 'import'" class="modal-actions">
        <button 
          @click="closeModal" 
          class="btn-secondary"
          :disabled="step === 'importing'"
        >
          Отмена
        </button>
        
        <button 
          @click="previousStep" 
          v-if="step === 'mapping' || step === 'review'" 
          class="btn-secondary"
          :disabled="step === 'importing'"
        >
          Назад
        </button>
        
        <button 
          @click="goToReviewStep" 
          v-if="step === 'mapping'" 
          class="btn-primary"
          :disabled="isReviewDisabled"
        >
          Проверить ({{ selectedRows.size }})
        </button>
        
        <button 
          @click="startImport" 
          v-if="step === 'review'" 
          class="btn-primary"
          :disabled="operationsToImport.length === 0"
        >
          Начать импорт ({{ operationsToImport.length }})
        </button>
      </div>

      <!-- Футер для ЭКСПОРТА -->
      <div v-if="currentTab === 'export'" class="modal-actions">
        <button 
          @click="closeModal" 
          class="btn-secondary"
          :disabled="isExporting"
        >
          Закрыть
        </button>
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
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  width: 90vw;
  max-width: 1200px;
  height: 90vh;
  max-height: 800px;
  background: var(--color-background);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 🟢 ИСПРАВЛЕНО: Кнопка закрытия (увеличен хитбокс, добавлен z-index, pointer) */
.close-btn {
  position: absolute;
  top: 10px;
  right: 15px;
  background: none;
  border: none;
  font-size: 32px; /* Чуть крупнее символ */
  color: var(--color-text-soft);
  cursor: pointer;
  padding: 10px; /* Увеличенный паддинг для клика */
  line-height: 0.8;
  z-index: 1001; /* Чтобы точно была поверх всего */
  transition: color 0.2s;
}
.close-btn:hover {
  color: var(--color-text);
}

h2 {
  padding: 20px 24px;
  margin: 0;
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
  flex-shrink: 0; 
}

.modal-tabs {
  display: flex;
  padding: 0 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.tab-btn {
  padding: 12px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-soft);
  cursor: pointer;
  font-size: 15px;
  margin-bottom: -1px; /* Нахлест на border-bottom */
}
.tab-btn.active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}


.import-content-wrapper {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* Важно для flex-grow */
}

.modal-step-content {
  flex-grow: 1;
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* --- Шаг 1: Загрузка --- */
.drop-zone {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
  color: var(--color-text-soft);
  transition: background-color 0.2s, border-color 0.2s;
}
.drop-zone.drag-over {
  border-color: var(--color-accent);
  background: var(--color-background-mute);
}
.drop-zone p {
  margin: 8px 0;
  font-size: 16px;
  color: var(--color-text);
}
.drop-zone .small-text {
  font-size: 14px;
  color: var(--color-text-soft);
}
.drop-zone svg {
  color: var(--color-text-soft);
  margin-bottom: 16px;
}

.file-input {
  display: none;
}
.file-input-label {
  display: inline-block;
  padding: 10px 20px;
  background: var(--color-accent);
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
  margin-top: 16px;
}
.file-input-label:hover {
  background: var(--color-accent-hover);
}

.download-template-btn {
  margin-top: 16px;
  font-size: 14px;
  padding: 8px 16px;
  background: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.download-template-btn:hover {
  background: var(--color-background-soft);
  border-color: var(--color-border-hover);
}


/* --- Шаг 2: Сопоставление --- */
.mapping-step {
  padding: 0;
}
.step-description {
  padding: 16px 24px;
  margin: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
  background-color: #34c759; /* Основной цвет кнопки */
  flex-shrink: 0; 
}

.download-section {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.download-section .step-description {
  border: none;
  background: none;
  padding-bottom: 0;
  text-align: center;
  color: var(--color-text);
}
.download-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
  margin-top: 20px;
}

/* 🟢 v10.14: Улучшенные стили для кнопок экспорта */
.download-buttons .export-btn {
  margin-top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 200px;
  padding: 16px 24px;
  transition: all 0.2s ease-in-out; /* Плавный переход */
  background-color: #34c759; /* Основной цвет кнопки */
  box-shadow: 0 2px 4px rgb(14, 14, 14); /* Легкая тень по умолчанию */
}

/* 🟢 v10.14: Явная реакция на наведение */
.download-buttons .export-btn:hover {
  transform: translateY(-2px); /* Приподнимаем кнопку */
  box-shadow: 0 6px 12px rgba(0,0,0,0.15); /* Усиливаем тень */
  background-color: var(--color-accent-hover); /* Убеждаемся в смене цвета */
  background-color: #00ec3b; /* Основной цвет кнопки */
  filter: brightness(1.05); /* Дополнительная подсветка */
}

.download-buttons .export-btn span {
  font-size: 0.8em;
  font-weight: 400;
  opacity: 0.7;
  margin-top: 4px;
}

/* 🟢 ОБНОВЛЕННЫЙ СТИЛЬ для кнопки "Подготовить данные" */
.prepare-btn {
  /* Стиль контурной кнопки как "Скачать шаблон" */
  background-color: transparent !important; /* Прозрачный фон */
  border: 1px solid var(--color-border) !important; /* Рамка цвета бордера */
  color: var(--color-text) !important; /* Цвет текста обычный */
  
  padding: 14px 28px;
  font-size: 1.1em;
  cursor: pointer;
  border-radius: 8px; /* Скругление */
  transition: all 0.2s ease;
}

/* Hover для .prepare-btn */
.prepare-btn:hover {
  background-color: var(--color-background-soft) !important; /* Светлее фон */
  border-color: var(--color-text) !important; /* Рамка ярче (белее) */
  transform: translateY(-1px); /* Легкий подъем */
  box-shadow: 0 4px 12px rgba(0,0,0,0.3); /* Тень */
}

/* Active (нажатие) */
.prepare-btn:active {
  transform: translateY(0);
  background-color: var(--color-background-mute) !important;
}

.mapping-table-container {
  overflow-x: auto;
  flex-grow: 1;
}

table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  font-size: 13px;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
thead th {
  background: var(--color-background-soft);
  border-bottom: 2px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.checkbox-col {
  width: 40px;
  max-width: 40px;
  padding: 10px;
  text-align: center;
}
.row-disabled {
  background-color: var(--color-background-soft);
  color: var(--color-text-faded);
  opacity: 0.6;
}
.row-disabled .mapping-select {
  opacity: 0.7;
}


.header-cell {
  display: flex;
  flex-direction: column;
  min-width: 150px;
}
.csv-header-name {
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mapping-select {
  width: 100%;
  padding: 6px 8px;
  background: var(--color-background);
  border: 1px solid var(--color-border-hover);
  border-radius: 4px;
  color: var(--color-text);
  font-size: 12px;
}

/* --- Шаг 3: Подтверждение --- */
.review-step {
  padding: 24px;
}
.new-entities-container {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  overflow-y: auto;
  max-height: 400px; /* Ограничиваем высоту */
  padding: 10px;
  background: var(--color-background-soft);
  border-radius: 6px;
  margin-top: 16px;
}
.entity-list {
  min-width: 200px;
}
.entity-list h4 {
  margin: 0 0 10px 0;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 5px;
}
.entity-list ul {
  margin: 0;
  padding-left: 20px;
  max-height: 200px;
  overflow-y: auto;
}
.entity-list li {
  font-size: 14px;
  color: var(--color-text-soft);
}

.export-step {
  justify-content: center;
  align-items: center;
  text-align: center;
  font-size: 16px;
}
.export-step p {
  max-width: 500px;
  color: var(--color-text-soft);
  line-height: 1.6;
}
.export-btn {
  padding: 12px 24px;
  font-size: 16px;
  margin-top: 24px;
}

/* --- Загрузка / Спиннер --- */
.loading-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text);
}
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* --- Футер --- */
.modal-actions {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: var(--color-background);
  flex-shrink: 0; 
}

/* --- Общие элементы --- */
.error-message {
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger);
  padding: 12px;
  border-radius: 6px;
  margin-top: 16px;
}

/* --- Стили кнопок (для модалки) --- */
.btn-primary, .btn-secondary {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background-color: #00ec3b; /* Основной цвет кнопки */
  
  transition: background-color 0.2s, opacity 0.2s;
}
.btn-primary {
  background-color: #00ec3b; /* Основной цвет кнопки */
  color: #fff;
  
}
.btn-primary:hover {
  background: var(--color-accent-hover);
}
.btn-primary:disabled {
  background: var(--color-accent);
  opacity: 0.5;
  cursor: not-allowed;
  
}
.btn-secondary {
  background: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.btn-secondary:hover {
  background: var(--color-background-soft);
  border-color: var(--color-border-hover);
}
.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>