<!--
 * * --- МЕТКА ВЕРСИИ: v10.12-IMPORT-TEMPLATE ---
 * * ВЕРСИЯ: 10.12 - Добавлена кнопка
 * "Скачать шаблон" для импорта
 * Доходов/Расходов.
 * ДАТА: 2025-11-18
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (NEW) В <template> (step === 'upload')
 * добавлена кнопка "Скачать шаблон".
 * 2. (NEW) Добавлена функция `downloadTemplate`,
 * которая генерирует CSV-строку
 * с правильными заголовками и примерами
 * для Дохода/Расхода.
 * 3. (NEW) Эта функция использует
 * существующий `triggerCsvDownload`.
 -->
<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="modal-content">
      <button class="close-btn" @click="closeModal">&times;</button>
      
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
      <!-- Вкладка "ИМПОРТ" (🟢 ИЗМЕНЕНО v10.12)       -->
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
              
              <!-- 🟢 v10.12: НОВАЯ КНОПКА СКАЧАТЬ ШАБЛОН -->
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
          <!-- ... (mapping content) ... -->
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
          <!-- ... (review content) ... -->
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
          <!-- ... (importing content) ... -->
          <div class="loading-indicator">
            <div class="spinner"></div>
            <p>Идет импорт данных... Пожалуйста, подождите.</p>
            <p class="small-text">{{ importProgress }} / {{ operationsToImport.length }}</p>
          </div>
        </div>

      </div>
      
      <!-- =========================================== -->
      <!-- 🟢 v10.9: Вкладка "ЭКСПОРТ (CSV)"            -->
      <!-- =========================================== -->
      <div v-if="currentTab === 'export'" class="modal-step-content export-step">
        
        <p>
          Экспорт разделен на 3 файла: Прошлые Доходы/Расходы, Прошлые Переводы и Будущая Сводка.
        </p>
        
        <!-- Шаг 1: Кнопка подготовки -->
        <button 
          v-if="!isDataReady"
          @click="prepareExportData" 
          class="btn-primary export-btn" 
          :disabled="isExporting"
        >
          1. Подготовить данные для экспорта
        </button>

        <div v-if="isExporting" class="loading-indicator">
          <div class="spinner"></div>
          <p>Подготовка отчетов... (Это может занять время)</p>
        </div>

        <!-- Шаг 2: Кнопки скачивания -->
        <div v-if="isDataReady && !isExporting" class="download-section">
          <p class="step-description">
            Данные готовы. Теперь вы можете скачать 3 отдельных CSV-файла:
          </p>
          <div class="download-buttons">
            <button class="btn-primary export-btn" @click="downloadIncomeExpense">
              Скачать Доходы/Расходы
              <span>({{ processedIncomeExpense.data.length }} строк)</span>
            </button>
            <button class="btn-primary export-btn" @click="downloadTransfers">
              Скачать Переводы
              <span>({{ processedTransfers.data.length }} строк)</span>
            </button>
            <button class="btn-primary export-btn" @click="downloadSummary">
              Скачать Будущую Сводку
              <span>({{ processedSummary.data.length }} строк)</span>
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
        <!-- ... (кнопки импорта) ... -->
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
// 🟢 v10.7: Импортируем форматер чисел
import { formatNumber } from '@/utils/formatters.js';

// --- Компонент ---
const emit = defineEmits(['close', 'import-complete']);
const mainStore = useMainStore();

const currentTab = ref('import');
const isExporting = ref(false);
const exportError = ref(null);

// 🟢 v10.9: Новые состояния для 3-х файлов
const isDataReady = ref(false);
const processedIncomeExpense = ref({}); // { data: [], columns: [] }
const processedTransfers = ref({}); // { data: [], columns: [] }
const processedSummary = ref({}); // { data: [], columns: [], title: "" }


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
  
  // 🟢 v10.9: Сброс состояния экспорта
  isExporting.value = false;
  exportError.value = null;
  isDataReady.value = false;
  processedIncomeExpense.value = {};
  processedTransfers.value = {};
  processedSummary.value = {};
  
  if (fileInputRef.value) {
    fileInputRef.value.value = null;
  }
}

// 🟢 v10.9: Отдельная функция сброса для экспорта
function resetExport() {
  isExporting.value = false;
  exportError.value = null;
  isDataReady.value = false;
  processedIncomeExpense.value = {};
  processedTransfers.value = {};
  processedSummary.value = {};
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
// 🔴 ФУНКЦИИ ДЛЯ ЭКСПОРТА (v10.11 - TODAY FIX)
// ----------------------------------------------

/**
 * 🟢 v10.12: Новая функция для скачивания шаблона
 */
function downloadTemplate() {
  const headers = [
    "Дата",
    "Тип",
    "Сумма",
    "Категория",
    "Проект",
    "Счет",
    "Компания",
    "Физлицо",
    "Контрагент"
  ];
  
  // 🔴 ИЗМЕНЕНИЕ: Удаляем примеры, оставляем пустой массив
  //               чтобы Papa.unparse вывел только заголовки
  const exampleData = [];

  const csvString = Papa.unparse(exampleData, {
    header: true,
    columns: headers,
  });

  triggerCsvDownload(csvString, "Import_Template_IncomeExpense");
}


/**
 * 🟢 v10.11: Шаг 1. Подготовка всех 3-х отчетов
 */
async function prepareExportData() {
  isExporting.value = true;
  exportError.value = null;
  
  try {
    // === 1. ПОДГОТОВКА ДАТ И ПРОГНОЗА ===
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 🟢 v10.11: Получаем timestamp (T00:00:00) для СЕГОДНЯ
    const todayTimestamp = today.getTime();

    // Хелперы
    const addDays = (d, days) => { const n = new Date(d); n.setDate(n.getDate() + days); return n; };
    const addMonths = (d, months) => { const n = new Date(d); n.setMonth(n.getMonth() + months); return n; };
    const addYears = (d, years) => { const n = new Date(d); n.setFullYear(n.getFullYear() + years); return n; };
    const ruFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });

    // Даты прогноза
    const periods = [
      { label: '12 д', date: addDays(today, 12) },
      { label: '1 мес', date: addMonths(today, 1) },
      { label: '3 мес', date: addMonths(today, 3) },
      { label: '6 мес', date: addMonths(today, 6) },
      { label: '1 год', date: addYears(today, 1) }
    ];

    // === 2. ПОЛУЧЕНИЕ И РАЗДЕЛЕНИЕ ДАННЫХ ===
    const { operations } = await mainStore.exportAllOperations(); // date: 1

    const pastOps = [];
    const futureOps = []; // Уже отсортированы по date: 1

    for (const op of operations) {
      if (!op.date) continue; 
      try {
        const opDate = new Date(op.date);
        // 🟢 v10.11: Нормализуем дату операции до 00:00:00
        opDate.setHours(0, 0, 0, 0); 
        
        if (isNaN(opDate.getTime())) continue; 
        
        // 🟢 v10.11: Сравниваем T00 > T00
        if (opDate.getTime() > todayTimestamp) {
          futureOps.push(op);
        } else {
          pastOps.push(op); // Включая "сегодня"
        }
      } catch (e) { continue; }
    }

    // === 3. ОБРАБОТКА ПРОШЛЫХ ОПЕРАЦИЙ (Файлы 1 и 2) ===
    const runningBalances = new Map();
    mainStore.accounts.forEach(acc => {
      runningBalances.set(acc._id, acc.initialBalance || 0);
    });

    const incomeExpenseRows = [];
    const transferRows = [];
    const commonColumns = ['Тип', 'Категория', 'Сумма', 'Остаток', 'Дата', 'Счет', 'Компании/Физлица', 'Контрагент', 'Проект'];
    
    for (const op of pastOps) { // pastOps уже отсортированы по дате
      let dateStr = '';
      if (op.date) {
        try {
          const d = new Date(op.date);
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          dateStr = `${day}.${month}.${year}`;
        } catch (e) { dateStr = op.date; }
      }
      
      const opAmount = op.amount || 0;
      let opBalance = 0;

      if (op.type === 'income' || op.type === 'expense') {
        const opAccountId = op.accountId?._id || null;
        if (opAccountId) {
          const currentBalance = runningBalances.get(opAccountId) || 0;
          opBalance = currentBalance + opAmount;
          runningBalances.set(opAccountId, opBalance);
        }
        
        incomeExpenseRows.push({
          'Тип': op.type === 'income' ? 'Доход' : 'Расход',
          'Категория': op.categoryId?.name || '',
          'Сумма': opAmount,
          'Остаток': opBalance,
          'Дата': dateStr,
          'Счет': op.accountId?.name || '',
          'Компании/Физлица': op.companyId?.name || op.individualId?.name || '',
          'Контрагент': op.contractorId?.name || '',
          'Проект': op.projectId?.name || '',
        });
      } 
      else if (op.type === 'transfer' || op.isTransfer) {
        const fromAccountId = op.fromAccountId?._id || null;
        const toAccountId = op.toAccountId?._id || null;
        const fromOwnerName = op.fromCompanyId?.name || op.fromIndividualId?.name || '';
        const toOwnerName = op.toCompanyId?.name || op.toIndividualId?.name || '';
        
        let fromBalance = 0;
        let toBalance = 0;
        const absAmount = Math.abs(opAmount);

        if (fromAccountId) {
          const currentBalance = runningBalances.get(fromAccountId) || 0;
          fromBalance = currentBalance - absAmount; 
          runningBalances.set(fromAccountId, fromBalance);
        }
        
        if (toAccountId) {
          const currentBalance = runningBalances.get(toAccountId) || 0;
          toBalance = currentBalance + absAmount;
          runningBalances.set(toAccountId, toBalance);
        }

        transferRows.push({
          'Тип': 'Перевод',
          'Категория': 'Исходящий',
          'Сумма': -absAmount,
          'Остаток': fromBalance,
          'Дата': dateStr,
          'Счет': op.fromAccountId?.name || '',
          'Компании/Физлица': fromOwnerName,
          'Контрагент': toOwnerName, 
          'Проект': '',
        });
        
        transferRows.push({
          'Тип': 'Перевод',
          'Категория': 'Входящий',
          'Сумма': absAmount,
          'Остаток': toBalance,
          'Дата': dateStr,
          'Счет': op.toAccountId?.name || '',
          'Компании/Физлица': toOwnerName,
          'Контрагент': fromOwnerName, 
          'Проект': '',
        });
      }
    }
    
    // Сохраняем результаты для кнопок 1 и 2
    processedIncomeExpense.value = { data: incomeExpenseRows, columns: commonColumns };
    processedTransfers.value = { data: transferRows, columns: commonColumns };

    // === 4. 🔴 v10.10: ОБРАБОТКА БУДУЩЕЙ СВОДКИ (Файл 3 - PIVOT) ===
    
    const accounts = mainStore.accounts; // [ { _id, name }, ... ]
    const accountNames = accounts.map(a => a.name); // [ "Счет 1", "Счет 2" ]
    const summaryColumns = ["Период", ...accountNames];
    const summaryRows = [];

    // Базовые балансы = Текущие балансы на "сегодня"
    // 🟢 v10.11: Мы используем `runningBalances`, так как они 
    // УЖЕ включают операции на "сегодня"
    const baseBalances = new Map(runningBalances);

    // 1. Строка "Текущий Остаток"
    const todayRow = { "Период": "Текущий Остаток" };
    accounts.forEach(acc => {
      todayRow[acc.name] = formatNumber(baseBalances.get(acc._id) || 0);
    });
    summaryRows.push(todayRow);
    
    // Хелпер для применения операции к карте балансов
    const applyOpToBalances = (balances, op) => {
      const absAmount = Math.abs(op.amount || 0);
      
      if (op.type === 'income') {
        const accId = op.accountId?._id || null;
        if (accId) balances.set(accId, (balances.get(accId) || 0) + absAmount);
      } 
      else if (op.type === 'expense') {
        const accId = op.accountId?._id || null;
        if (accId) balances.set(accId, (balances.get(accId) || 0) - absAmount);
      }
      else if (op.type === 'transfer' || op.isTransfer) {
        const fromId = op.fromAccountId?._id || null;
        const toId = op.toAccountId?._id || null;
        if (fromId) balances.set(fromId, (balances.get(fromId) || 0) - absAmount);
        if (toId) balances.set(toId, (balances.get(toId) || 0) + absAmount);
      }
    };

    // 2. Строки "Будущих Периодов"
    for (const period of periods) {
      const periodLabel = `до ${ruFormatter.format(period.date)} (${period.label})`;
      const periodRow = { "Период": periodLabel };
      
      // Создаем КОПИЮ текущих балансов для этого периода
      const periodBalances = new Map(baseBalances);
      
      // Пробегаем по ВСЕМ будущим операциям
      for (const op of futureOps) {
        const opDate = new Date(op.date);
        // Если операция попадает в этот период
        if (opDate <= period.date) {
          applyOpToBalances(periodBalances, op);
        }
      }
      
      // Заполняем строку
      accounts.forEach(acc => {
        periodRow[acc.name] = formatNumber(periodBalances.get(acc._id) || 0);
      });
      summaryRows.push(periodRow);
    }
    
    // Сохраняем результат для кнопки 3
    processedSummary.value = {
      data: summaryRows,
      columns: summaryColumns,
      title: "Всего на счетах с учетом будущих операций" // 🟢 v10.10
    };

    // === 5. ЗАВЕРШЕНИЕ ===
    isDataReady.value = true;
    
  } catch (err) {
    console.error("Ошибка при подготовке экспорта:", err);
    exportError.value = `Не удалось подготовить данные: ${err.message || 'Неизвестная ошибка'}`;
  } finally {
    isExporting.value = false;
  }
}

/**
 * 🟢 v10.9: Шаг 2. Функции скачивания
 */
function downloadIncomeExpense() {
  const csvString = Papa.unparse(processedIncomeExpense.value.data, {
    header: true,
    columns: processedIncomeExpense.value.columns,
    transform: (value) => (value === null || value === undefined) ? "" : value,
  });
  triggerCsvDownload(csvString, "Income_Expense");
}

function downloadTransfers() {
  const csvString = Papa.unparse(processedTransfers.value.data, {
    header: true,
    columns: processedTransfers.value.columns,
    transform: (value) => (value === null || value === undefined) ? "" : value,
  });
  triggerCsvDownload(csvString, "Transfers");
}

/**
 * 🟢 v10.10: Обновлено для скачивания Сводки (с заголовком)
 */
function downloadSummary() {
  // 1. Создаем CSV-строку (без BOM)
  let csvString = Papa.unparse(processedSummary.value.data, {
    header: true,
    columns: processedSummary.value.columns,
    transform: (value) => (value === null || value === undefined) ? 0 : value,
  });
  
  // 2. Добавляем кастомный заголовок
  const title = processedSummary.value.title || "Сводный отчет";
  // Создаем пустые запятые для выравнивания
  const commas = ",".repeat(processedSummary.value.columns.length - 1);
  const titleRow = `"${title}"${commas}\n\n`; // Две новых строки для отступа

  // 3. Передаем в скачивание (BOM + Заголовок + CSV)
  triggerCsvDownload(titleRow + csvString, "Future_Summary");
}


/**
 * 🟢 v10.10: triggerCsvDownload (обновлен)
 */
function triggerCsvDownload(csvString, filenamePrefix = "export") {
  // 🟢 v10.10: BOM добавляется здесь, чтобы titleRow не сломал его
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
// 🔴 КОНЕЦ: ФУНКЦИИ ДЛЯ ЭКСПОРТА
// ----------------------------------------------
</script>

<style scoped>
/* 🔴 v10.8: СТИЛИ ВОЗВРАЩЕНЫ К ОРИГИНАЛУ v10.0 */

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

/* 🟢 v10.12: Стили для кнопки "Скачать шаблон" */
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
  flex-shrink: 0; 
}

/* 🟢 v10.9: Стили для секции скачивания */
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
.download-buttons .export-btn {
  margin-top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 200px;
  padding: 16px 24px;
}
.download-buttons .export-btn span {
  font-size: 0.8em;
  font-weight: 400;
  opacity: 0.7;
  margin-top: 4px;
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
