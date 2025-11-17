<!--
 * * --- МЕТКА ВЕРСИИ: v10.6-SUMMARY-DATE-FIX ---
 * * ВЕРСИЯ: 10.6 - Исправление RangeError: Invalid time value
 * ДАТА: 2025-11-18
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (REMOVED) Удален локальный helper `_parseDateKey`.
 * 2. (UPDATE) `handleExport` (Export):
 * - `today` теперь определяется через `new Date()`,
 * а не через `mainStore.todayDayOfYear`,
 * что предотвращает ошибку до инициализации.
 * - Даты операций (`opDate`) теперь
 * получаются из `new Date(op.date)`,
 * а не через парсинг `op.dateKey`.
 * - Добавлены проверки `if (!op.date)` и
 * `if (isNaN(opDate.getTime()))`
 * для защиты от некорректных данных.
 -->
<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="modal-content">
      <button class="close-btn" @click="closeModal">&times;</button>
      
      <h2>{{ currentTab === 'import' ? 'Импорт операций' : 'Экспорт (Сводка)' }}</h2>
      
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
          Экспорт (Сводка)
        </button>
      </div>

      <!-- ============================================= -->
      <!-- Вкладка "ИМПОРТ" (Без изменений)         -->
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
      <!-- Вкладка "ЭКСПОРТ (СВОДКА)"                  -->
      <!-- =========================================== -->
      <div v-if="currentTab === 'export'" class="modal-step-content export-step">
        <p>
          Вы можете экспортировать **сводный отчет** с текущим балансом и прогнозом поступлений.
        </p>
        <p>
          Отчет будет основан на данных, загруженных в приложение.
        </p>
        
        <div v-if="isExporting" class="loading-indicator">
          <div class="spinner"></div>
          <p>Подготовка сводки...</p>
        </div>
        
        <button 
          @click="handleExport" 
          class="btn-primary export-btn" 
          :disabled="isExporting"
        >
          Экспортировать сводку
        </button>
        
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

<script setup>
import { ref, computed } from 'vue';
import Papa from 'papaparse';
import { useMainStore } from '@/stores/mainStore';
// 🟢 v10.5: Импортируем форматер чисел
import { formatNumber } from '@/utils/formatters.js';

// --- Компонент ---
const emit = defineEmits(['close', 'import-complete']);
const mainStore = useMainStore();

const currentTab = ref('import'); // 'import' or 'export'
const isExporting = ref(false);
const exportError = ref(null);

// --- Шаги (Импорт) ---
const step = ref('upload'); // 'upload', 'mapping', 'review', 'importing'
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
  { key: 'type', label: 'Тип операции', entity: null, aliases: ['тип', 'операция', 'type'] },
  { key: 'amount', label: 'Сумма', entity: null, aliases: ['сумма', 'amount'] },
  { key: 'category', label: 'Категория', entity: 'categories', aliases: ['категория', 'category'] },
  { key: 'project', label: 'Проект', entity: 'projects', aliases: ['проект', 'project', 'мои проекты'] },
  { key: 'account', label: 'Счет', entity: 'accounts', aliases: ['счет', 'account', 'мои счета'] },
  { key: 'company', label: 'Компания', entity: 'companies', aliases: ['компания', 'company', 'мои компании'] },
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
  
  if (fileInputRef.value) {
    fileInputRef.value.value = null;
  }
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
  return null;
}


// ----------------------------------------------
// 🔴 ФУНКЦИИ ДЛЯ ЭКСПОРТА (v10.6 - Исправление)
// ----------------------------------------------

/**
 * 🟢 v10.6: Полностью переписанная функция handleExport
 */
async function handleExport() {
  isExporting.value = true;
  exportError.value = null;
  
  try {
    // 1. 🟢 FIX: Получаем "сегодня" надежным способом
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 2. Получаем текущий баланс
    const currentBalance = mainStore.currentTotalBalance;

    // 3. 🟢 FIX: Фильтруем будущие операции, используя op.date
    const allFutureOps = mainStore.allOperationsFlat.filter(op => {
      if (!op.date) return false; // Защита
      try {
        const opDate = new Date(op.date);
        if (isNaN(opDate.getTime())) return false; // Защита от Invalid Date
        return opDate.getTime() > today.getTime();
      } catch (e) {
        return false; // Защита от ошибки конструктора
      }
    });

    // 4. Считаем даты для прогноза
    const ruFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
    
    // Хелперы для дат
    const addDays = (d, days) => { const n = new Date(d); n.setDate(n.getDate() + days); return n; };
    const addMonths = (d, months) => { const n = new Date(d); n.setMonth(n.getMonth() + months); return n; };
    const addYears = (d, years) => { const n = new Date(d); n.setFullYear(n.getFullYear() + years); return n; };

    // Рассчитываем 5 дат в будущем
    const date12d = addDays(today, 12);
    const date1m = addMonths(today, 1);
    const date3m = addMonths(today, 3);
    const date6m = addMonths(today, 6);
    const date1y = addYears(today, 1);

    // 5. Считаем КУМУЛЯТИВНЫЕ поступления
    let income12d = 0;
    let income1m = 0;
    let income3m = 0;
    let income6m = 0;
    let income1y = 0;

    for (const op of allFutureOps) {
      // Считаем только 'income'
      if (op.type === 'income' && op.amount > 0) {
        // 🟢 FIX: Используем op.date
        const opDate = new Date(op.date);
        
        // Суммы кумулятивные (включают предыдущие)
        if (opDate <= date1y) income1y += op.amount;
        if (opDate <= date6m) income6m += op.amount;
        if (opDate <= date3m) income3m += op.amount;
        if (opDate <= date1m) income1m += op.amount;
        if (opDate <= date12d) income12d += op.amount;
      }
    }

    // 6. Форматируем данные для CSV (2 колонки)
    const csvData = [
      { "Параметр": `Сегодня`, "Значение": ruFormatter.format(today) },
      { "Параметр": "Текущий Остаток", "Значение": formatNumber(currentBalance) },
      { "Параметр": `Поступления до ${ruFormatter.format(date12d)} (12 д)`, "Значение": formatNumber(income12d) },
      { "Параметр": `Поступления до ${ruFormatter.format(date1m)} (1 мес)`, "Значение": formatNumber(income1m) },
      { "Параметр": `Поступления до ${ruFormatter.format(date3m)} (3 мес)`, "Значение": formatNumber(income3m) },
      { "Параметр": `Поступления до ${ruFormatter.format(date6m)} (6 мес)`, "Значение": formatNumber(income6m) },
      { "Параметр": `Поступления до ${ruFormatter.format(date1y)} (1 год)`, "Значение": formatNumber(income1y) }
    ];
    
    // 7. Конвертируем в CSV
    const csvString = Papa.unparse(csvData, {
      header: true,
    });
    
    // 8. Скачиваем (имя файла с датой и временем)
    triggerCsvDownload(csvString);
    
  } catch (err) {
    console.error("Ошибка при экспорте сводки:", err);
    exportError.value = `Не удалось создать сводку: ${err.message || 'Неизвестная ошибка'}`;
  } finally {
    isExporting.value = false;
  }
}


/**
 * 🟢 v10.3: Имя файла включает время
 */
function triggerCsvDownload(csvString) {
  const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  
  const d = new Date();
  const pad = (num) => String(num).padStart(2, '0');
  const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  
  // 🟢 v10.5: Меняем имя файла на "summary"
  link.setAttribute('download', `index12_summary_${timestamp}.csv`);
  
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}
// ----------------------------------------------
// 🔴 КОНЕЦ: ФУНКЦИИ ДЛЯ ЭКСПОРТА
// ----------------------------------------------
</script>

<style scoped>
/* (Стили не изменялись) */

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

.close-btn {
  position: absolute;
  top: 10px;
  right: 15px;
  background: none;
  border: none;
  font-size: 24px;
  color: var(--color-text-soft);
  cursor: pointer;
  padding: 5px;
  line-height: 1;
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
  margin-bottom: -1px; 
}
.tab-btn.active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

.import-content-wrapper {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
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

/* --- Шаг 2: Сопоставление --- */
.mapping-step {
  padding: 0;
}
.step-description {
  padding: 16px 24px;
  margin: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
  flex-shrink: 0; 
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
  max-height: 400px; 
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
  transition: background-color 0.2s, opacity 0.2s;
}
.btn-primary {
  background: var(--color-accent);
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
