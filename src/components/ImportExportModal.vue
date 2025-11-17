<!--
 * * --- МЕТКА ВЕРСИИ: v10.0-TRANSFER-LOGIC ---
 * * ВЕРСИЯ: 10.0 - Новая логика импорта/экспорта переводов
 * ДАТА: 2025-11-17
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. normalizeType (Импорт): Теперь распознает
 * "Доход", "Расход", "Перевод".
 * 2. formatDataForExport (Экспорт): Полностью
 * переписана.
 * - 'income' -> "Доход", 'expense' -> "Расход".
 * - 'transfer' (1 строка из БД) теперь
 * превращается в 2 строки в CSV (Расход + Доход)
 * с правильной логикой Компании/Контрагента
 * согласно ТЗ.
 -->
<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="modal-content">
      <button class="close-btn" @click="closeModal">&times;</button>
      
      <!-- 🔴 ИЗМЕНЕНИЕ: Динамический заголовок -->
      <h2>{{ currentTab === 'import' ? 'Импорт операций' : 'Экспорт операций' }}</h2>
      
      <!-- 🔴 НАЧАЛО: Переключатель вкладок -->
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
      <!-- 🔴 КОНЕЦ: Переключатель вкладок -->

      <!-- ============================================= -->
      <!-- 🔴 НАЧАЛО: Вкладка "ИМПОРТ" (Существующий код) -->
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
      <!-- 🔴 КОНЕЦ: Вкладка "ИМПОРТ"                  -->
      <!-- =========================================== -->
      
      <!-- =========================================== -->
      <!-- 🔴 НАЧАЛО: Вкладка "ЭКСПОРТ" (Новый код)     -->
      <!-- =========================================== -->
      <div v-if="currentTab === 'export'" class="modal-step-content export-step">
        <p>
          Вы можете экспортировать **все операции** из вашей базы данных в один CSV-файл.
        </p>
        <p>
          Этот процесс извлечет все записи о доходах, расходах и переводах (переводы будут раздвоены на 2 строки).
        </p>
        
        <div v-if="isExporting" class="loading-indicator">
          <div class="spinner"></div>
          <p>Подготовка данных...</p>
          <p class="small-text">Это может занять некоторое время, если у вас много операций.</p>
        </div>
        
        <button 
          @click="handleExport" 
          class="btn-primary export-btn" 
          :disabled="isExporting"
        >
          Экспортировать все операции
        </button>
        
        <div v-if="exportError" class="error-message">
          {{ exportError }}
        </div>
      </div>
      <!-- =========================================== -->
      <!-- 🔴 КОНЕЦ: Вкладка "ЭКСПОРТ"                 -->
      <!-- =========================================== -->


      <!-- 🔴 ИЗМЕНЕНИЕ: Футер теперь зависит от вкладки -->
      
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

// --- Компонент ---
const emit = defineEmits(['close', 'import-complete']);
const mainStore = useMainStore();

// 🔴 НАЧАЛО: Новое состояние для вкладок и экспорта
const currentTab = ref('import'); // 'import' or 'export'
const isExporting = ref(false);
const exportError = ref(null);
// 🔴 КОНЕЦ: Новое состояние

// --- Шаги (Импорт) ---
const step = ref('upload'); // 'upload', 'mapping', 'review', 'importing'
const error = ref(null);
const isLoading = ref(false);

// --- CSV Данные (Импорт) ---
const file = ref(null);
const fileInputRef = ref(null); // <-- ref для input
const dragOver = ref(false);
const csvHeaders = ref([]);
const csvData = ref([]); // Полный набор данных
const previewData = computed(() => csvData.value); // Теперь показывает ВСЕ строки
const selectedRows = ref(new Set()); 
const isAllSelected = computed(() => {
  const validRowCount = csvData.value.filter(isValidRow).length;
  return validRowCount > 0 && selectedRows.value.size === validRowCount;
});


// --- Сопоставление (Mapping) ---
const columnMapping = ref({}); // { 'CSV Header Name': 'systemFieldKey' }
const systemFields = [
  { key: 'date', label: 'Дата', entity: null, aliases: ['дата', 'date'] },
  { key: 'type', label: 'Тип операции', entity: null, aliases: ['тип', 'операция', 'type'] },
  { key: 'amount', label: 'Сумма', entity: null, aliases: ['сумма', 'amount'] },
  { key: 'category', label: 'Категория', entity: 'categories', aliases: ['категория', 'category'] },
  { key: 'project', label: 'Проект', entity: 'projects', aliases: ['проект', 'project', 'мои проекты'] },
  { key: 'account', label: 'Счет', entity: 'accounts', aliases: ['счет', 'account', 'мои счета'] },
  { key: 'company', label: 'Компания', entity: 'companies', aliases: ['компания', 'company', 'мои компании'] },
  { key: 'contractor', label: 'Контрагент', entity: 'contractors', aliases: ['контрагент', 'contractor', 'мои контрагенты'] },
];

// --- Подтверждение (Review) ---
const newEntities = ref({
  categories: [],
  projects: [],
  accounts: [],
  companies: [],
  contractors: [],
});
// Готовые к импорту операции
const operationsToImport = ref([]);

// --- Импорт (Importing) ---
const importProgress = ref(0);
const isReviewDisabled = computed(() => {
  // Блокируем импорт, если не сопоставлены обязательные поля
  const mappedKeys = Object.values(columnMapping.value);
  const hasMinFields = mappedKeys.includes('date') && mappedKeys.includes('amount') && mappedKeys.includes('type');
  
  // Кнопка "Проверить" активна, если:
  // 1. Поля сопоставлены
  // 2. Хотя бы одна строка выбрана
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
  
  selectedRows.value.clear(); // <-- Очищаем чекбоксы
  
  // 🔴 НАЧАЛО: Очистка состояния экспорта
  isExporting.value = false;
  exportError.value = null;
  // 🔴 КОНЕЦ
  
  // Очищаем <input type="file">
  if (fileInputRef.value) {
    fileInputRef.value.value = null;
  }
}

function closeModal() {
  resetState(); // <-- !!! ИЗМЕНЕНИЕ: Очищаем состояние при закрытии
  emit('close');
}

function previousStep() {
  if (step.value === 'mapping') {
    resetState(); // <-- !!! ИЗМЕНЕНИЕ: Очищаем состояние при возврате к загрузке
  } else if (step.value === 'review') {
    step.value = 'mapping';
    // Не очищаем, чтобы пользователь мог исправить сопоставление (но очищаем операции)
    operationsToImport.value = [];
  }
}

/**
 * Обработка выбора файла через input
 */
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

/**
 * Обработка файла через Drag-n-drop
 */
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

/**
 * Парсинг CSV с помощью PapaParse
 */
function parseCsv() {
  csvData.value = [];
  csvHeaders.value = [];
  selectedRows.value.clear(); // <-- Очищаем чекбоксы
  
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
      autoSelectValidRows(); // <-- !!! НОВЫЙ КОД: Авто-выбор строк
      
      isLoading.value = false;
      step.value = 'mapping';
    },
    error: (err) => {
      error.value = 'Не удалось прочитать файл: ' + err.message;
      isLoading.value = false;
    }
  });
}

/**
 * Автоматическое сопоставление заголовков CSV с полями системы.
 * Ищет совпадения в 'aliases' (в нижнем регистре).
 */
function autoMapHeaders() {
  const mapping = {};
  const usedSystemKeys = new Set();

  for (const csvHeader of csvHeaders.value) {
    const csvHeaderLower = csvHeader.trim().toLowerCase();
    
    // Ищем точное совпадение в псевдонимах
    const foundField = systemFields.find(field => 
      field.aliases.includes(csvHeaderLower) && !usedSystemKeys.has(field.key)
    );
    
    if (foundField) {
      mapping[csvHeader] = foundField.key;
      usedSystemKeys.add(foundField.key); // Убеждаемся, что одно поле системы не сопоставлено дважды
    } else {
      mapping[csvHeader] = null; // Не сопоставлено
    }
  }
  columnMapping.value = mapping;
}

/**
 * Проверяет, можно ли импортировать строку (есть ли у нее дата, сумма, тип)
 */
function isValidRow(row) {
  const reverseMapping = getReverseMapping();
  const dateHeader = reverseMapping['date'];
  const amountHeader = reverseMapping['amount'];
  const typeHeader = reverseMapping['type'];
  
  // Проверяем, что необходимые колонки сопоставлены И что в строке есть данные
  return dateHeader && row[dateHeader] &&
         amountHeader && row[amountHeader] &&
         typeHeader && row[typeHeader];
}

/**
 * Автоматически выбирает все валидные строки при загрузке
 */
function autoSelectValidRows() {
  selectedRows.value.clear();
  csvData.value.forEach((row, index) => {
    if (isValidRow(row)) {
      selectedRows.value.add(index);
    }
  });
}

/**
 * Логика для чекбокса "Выбрать все"
 */
function toggleSelectAll() {
  if (isAllSelected.value) {
    // Если все выбраны -> снять все
    selectedRows.value.clear();
  } else {
    // Если выбраны не все -> выбрать все валидные
    autoSelectValidRows();
  }
}

/**
 * Переход к шагу "Подтверждение".
 * Анализирует данные и ищет новые сущности.
 */
function goToReviewStep() {
  error.value = null;
  
  // 1. Валидация: Проверяем, что обязательные поля сопоставлены
  if (isReviewDisabled.value) {
    error.value = 'Необходимо сопоставить обязательные поля (Дата, Сумма, Тип) и выбрать хотя бы одну строку.';
    return;
  }
  
  // 2. Преобразуем данные (это заполнит operationsToImport)
  operationsToImport.value = transformDataForImport(selectedRows.value);
  
  // 3. Идентификация новых сущностей (на основе operationsToImport)
  identifyNewEntities();
  
  step.value = 'review';
}

/**
 * Ищет сущности (категории, проекты и т.д.) в CSV, 
 * которых нет в mainStore.
 */
function identifyNewEntities() {
  const newFound = {
    categories: new Set(),
    projects: new Set(),
    accounts: new Set(),
    companies: new Set(),
    contractors: new Set(),
  };

  // Поля, которые являются сущностями
  const entityFields = systemFields.filter(f => f.entity);
  
  for (const field of entityFields) {
    const fieldKey = field.key; // 'category'
    const entityName = field.entity; // 'categories'

    // Получаем текущий список сущностей из store (v3.9/v4.4 mainStore[entityName] - это ref)
    const storeEntities = mainStore[entityName].value || [];
    const storeEntityNames = new Set(storeEntities.map(e => e.name.toLowerCase().trim()));
    
    // Пробегаем по всем подготовленным операциям
    for (const op of operationsToImport.value) {
      // Игнорируем "Перевод" при поиске новых категорий
      if (fieldKey === 'category' && op.type === 'transfer') continue;

      const value = op[fieldKey]; // 'Название Категории'
      
      if (value) {
        const trimmedValue = value.trim();
        const lowerValue = trimmedValue.toLowerCase();
        
        // Если в store нет такого имени, и мы еще не добавили его в Set
        if (!storeEntityNames.has(lowerValue) && !newFound[entityName].has(trimmedValue)) {
          newFound[entityName].add(trimmedValue);
        }
      }
    }
  }

  // Преобразуем Set'ы в массивы для ref
  newEntities.value.categories = Array.from(newFound.categories);
  newEntities.value.projects = Array.from(newFound.projects);
  newEntities.value.accounts = Array.from(newFound.accounts);
  newEntities.value.companies = Array.from(newFound.companies);
  newEntities.value.contractors = Array.from(newFound.contractors);
}

/**
 * Вспомогательная функция для отображения русских названий.
 */
function getEntityName(entityType) {
  const names = {
    categories: 'Категории',
    projects: 'Проекты',
    accounts: 'Счета',
    companies: 'Компании',
    contractors: 'Контрагенты',
  };
  return names[entityType] || entityType;
}

/**
 * Начинает процесс импорта.
 */
async function startImport() {
  step.value = 'importing';
  error.value = null;
  importProgress.value = 0;

  try {
    const allTransformedOperations = transformDataForImport(null); // Все операции
    const selectedIndices = Array.from(selectedRows.value); // Только индексы

    const createdDocs = await mainStore.importOperations(
      allTransformedOperations, 
      selectedIndices, // <-- !!! НОВЫЙ КОД: Передаем индексы
      (progress) => {
        // Эта коллбэк-функция больше не используется в v10,
        // так как сервер обрабатывает все сразу.
        // Оставим ее для обратной совместимости, если решим вернуть.
        importProgress.value = progress;
      }
    );
    
    // Сервер v10 возвращает массив созданных документов.
    // Мы можем использовать его длину для отображения прогресса.
    importProgress.value = createdDocs.length;

    // 3. Успех
    emit('import-complete');
    
  } catch (err) {
    console.error('Ошибка импорта:', err);
    error.value = `Ошибка импорта: ${err.message || 'Неизвестная ошибка'}`;
    step.value = 'review'; // Возвращаем на шаг подтверждения
  }
}

/**
 * (Helper) Создает обратную карту (systemKey -> csvHeader)
 */
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

/**
 * Преобразует `csvData` + `columnMapping` в массив объектов операций,
 * готовых для отправки на API.
 * @param {Set<number>|null} selectedIndices - Set индексов строк для обработки. 
 * Если null, обрабатывает ВСЕ строки.
 */
function transformDataForImport(selectedIndices) {
  const operations = [];
  const reverseMapping = getReverseMapping();
  
  // Если selectedIndices == null, обрабатываем ВСЕ строки (для отправки на бэк)
  // Если selectedIndices != null, обрабатываем только ВЫБРАННЫЕ (для шага Review)
  const dataToProcess = selectedIndices 
    ? csvData.value.filter((_, index) => selectedIndices.has(index))
    : csvData.value;
    
  for (const row of dataToProcess) {
    const op = {};
    
    // Сначала ищем ТИП, так как он влияет на СУММУ
    const typeHeader = reverseMapping['type'];
    let opType = null;
    if (typeHeader && row[typeHeader]) {
      opType = normalizeType(String(row[typeHeader]).trim());
      op['type'] = opType;
    }

    for (const field of systemFields) {
      // Пропускаем 'type', так как мы его уже обработали
      if (field.key === 'type') continue; 

      const systemKey = field.key;
      const csvHeader = reverseMapping[systemKey];
      
      if (csvHeader && row[csvHeader] !== undefined && row[csvHeader] !== null && row[csvHeader] !== '') {
        let value = String(row[csvHeader]).trim();
        
        // Очистка и преобразование данных
        if (systemKey === 'amount') {
          value = cleanAmount(value);
          // !!! ИСПРАВЛЕНИЕ: (Проблема с красным цветом) !!!
          // Если тип 'expense' и сумма положительная, делаем ее отрицательной
          if (opType === 'expense' && value > 0) {
            value = -value;
          }
          // Для "Перевод" сумма может быть как < 0, так и > 0
          
        } else if (systemKey === 'date') {
          value = parseDate(value); // Должен вернуть ISO строку
        }
        
        op[systemKey] = value;
      }
    }
    
    // Пропускаем строки без даты, суммы или типа
    if (op.date && op.amount !== null && op.type) {
      operations.push(op);
    }
  }
  
  return operations;
}

/**
 * Очищает строку с суммой от валюты, пробелов и приводит к числу.
 */
function cleanAmount(value) {
  if (typeof value !== 'string') return null;
  
  let cleaned = value
    .replace(/₸/g, '')      // Убираем символ тенге
    .replace(/[^\d.,-]/g, ''); // Оставляем только цифры, точки, запятые и минус

  // Определяем, что используется как разделитель тысяч, а что - десятичный
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

/**
 * Преобразует дату из "dd.MM.yyyy" в ISO-строку.
 */
function parseDate(value) {
  if (typeof value !== 'string') return null;
  
  // Формат 1: dd.MM.yyyy
  let parts = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (parts) {
    // parts = ["07.08.2025", "07", "08", "2025"]
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1; // Месяцы в JS с 0
    const year = parseInt(parts[3], 10);
    
    const date = new Date(year, month, day);
    return date.toISOString();
  }
  
  // Формат 2: yyyy-MM-dd (ISO-like)
  parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) {
     const year = parseInt(parts[1], 10);
     const month = parseInt(parts[2], 10) - 1;
     const day = parseInt(parts[3], 10);
     const date = new Date(year, month, day);
     return date.toISOString();
  }

  // Попробовать парсить как стандартный Date (может быть не надежно)
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  
  return null;
}

/**
 * 🔴 ИЗМЕНЕНИЕ v10.0: Добавлены русские варианты
 * Приводит тип операции к системным 'income', 'expense', 'transfer'.
 */
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
  return null; // Неизвестный тип
}


// ----------------------------------------------
// 🔴 НАЧАЛО: НОВЫЕ ФУНКЦИИ ДЛЯ ЭКСПОРТА (v10.0)
// ----------------------------------------------

/**
 * Главная функция экспорта
 */
async function handleExport() {
  isExporting.value = true;
  exportError.value = null;
  
  try {
    // 1. Получаем все операции из store (который дергает API)
    const operations = await mainStore.exportAllOperations();
    
    if (!operations || operations.length === 0) {
      exportError.value = "Нет операций для экспорта.";
      isExporting.value = false;
      return;
    }
    
    // 2. Форматируем данные для CSV (🔴 ЛОГИКА v10.0)
    const formattedData = formatDataForExport(operations);
    
    // 3. Конвертируем JSON в CSV строку
    const csvString = Papa.unparse(formattedData, {
      header: true,
    });
    
    // 4. Запускаем скачивание файла
    triggerCsvDownload(csvString);
    
  } catch (err) {
    console.error("Ошибка экспорта:", err);
    exportError.value = `Не удалось экспортировать данные: ${err.message || 'Ошибка сервера'}`;
  } finally {
    isExporting.value = false;
  }
}

/**
 * 🔴 ИЗМЕНЕНИЕ v10.0: Новая логика
 * Преобразует массив операций с сервера в плоский массив 
 * объектов для Papa.unparse
 */
function formatDataForExport(operations) {
  const csvRows = [];

  for (const op of operations) {
    let dateStr = '';
    if (op.date) {
      try {
        const d = new Date(op.date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        dateStr = `${day}.${month}.${year}`;
      } catch (e) {
        dateStr = op.date; // fallback
      }
    }

    if (op.type === 'income' || op.type === 'expense') {
      csvRows.push({
        'Дата': dateStr,
        'Тип': op.type === 'income' ? 'Доход' : 'Расход',
        'Сумма': op.amount,
        'Категория': op.categoryId ? op.categoryId.name : '',
        'Проект': op.projectId ? op.projectId.name : '',
        'Счет': op.accountId ? op.accountId.name : '',
        'Компания': op.companyId ? op.companyId.name : '',
        'Контрагент': op.contractorId ? op.contractorId.name : '',
      });
    } 
    else if (op.type === 'transfer' || op.isTransfer) {
      // Это ОДНА операция "Перевод" из БД.
      // Создаем ДВЕ строки в CSV.

      // Строка 1: РАСХОД (Отправитель)
      const expenseRow = {
        'Дата': dateStr,
        'Тип': 'Перевод',
        'Сумма': -Math.abs(op.amount),
        'Категория': op.categoryId ? op.categoryId.name : 'Перевод',
        'Проект': '', // Переводы обычно не имеют проектов
        'Счет': op.fromAccountId ? op.fromAccountId.name : '',
        'Компания': op.fromCompanyId ? op.fromCompanyId.name : '',
        'Контрагент': op.toCompanyId ? op.toCompanyId.name : '', // 🔴 Логика: Контрагент = Получатель
      };
      
      // Строка 2: ДОХОД (Получатель)
      const incomeRow = {
        'Дата': dateStr,
        'Тип': 'Перевод',
        'Сумма': Math.abs(op.amount),
        'Категория': op.categoryId ? op.categoryId.name : 'Перевод',
        'Проект': '', // Переводы обычно не имеют проектов
        'Счет': op.toAccountId ? op.toAccountId.name : '',
        'Компания': op.toCompanyId ? op.toCompanyId.name : '',
        'Контрагент': op.fromCompanyId ? op.fromCompanyId.name : '', // 🔴 Логика: Контрагент = Отправитель
      };

      csvRows.push(expenseRow, incomeRow);
    }
  }

  return csvRows;
}

/**
 * Создает Blob и инициирует скачивание CSV файла
 */
function triggerCsvDownload(csvString) {
  // \uFEFF - это BOM (Byte Order Mark), он помогает Excel
  // правильно определить кодировку UTF-8 и отобразить кириллицу.
  const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  
  // Генерируем имя файла
  const formattedDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
  link.setAttribute('download', `index12_export_${formattedDate}.csv`);
  
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}
// ----------------------------------------------
// 🔴 КОНЕЦ: НОВЫЕ ФУНКЦИИ ДЛЯ ЭКСПОРТА
// ----------------------------------------------
</script>

<style scoped>
/* * --- ПРИМЕЧАНИЕ ---
 * Стили не изменялись, только добавлялись новые.
 * Существующие стили сохранены без изменений.
 */

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

/* 🔴 НАЧАЛО: Стили для вкладок (Добавлено в v9.0) */
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
/* 🔴 КОНЕЦ: Стили для вкладок */


/* 🔴 НАЧАЛО: Обёртка для контента импорта (Добавлено в v9.0) */
.import-content-wrapper {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* Важно для flex-grow */
}
/* 🔴 КОНЕЦ */

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

/* 🔴 НАЧАЛО: Стили для вкладки Экспорта (Добавлено в v9.0) */
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
/* 🔴 КОНЕЦ: Стили для вкладки Экспорта */

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
