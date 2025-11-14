<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="modal-content">
      <button class="close-btn" @click="closeModal">&times;</button>
      <h2>Импорт операций</h2>

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

      <div class="modal-actions">
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

// --- Шаги ---
const step = ref('upload'); // 'upload', 'mapping', 'review', 'importing'
const error = ref(null);
const isLoading = ref(false);

// --- CSV Данные ---
const file = ref(null);
const fileInputRef = ref(null); // <-- ref для input
const dragOver = ref(false);
const csvHeaders = ref([]);
const csvData = ref([]); // Полный набор данных
// !!! ИЗМЕНЕНИЕ: Убрано .slice(0, 5) !!!
const previewData = computed(() => csvData.value); // Теперь показывает ВСЕ строки
// --- КОНЕЦ ИЗМЕНЕНИЯ ---

// !!! НОВЫЙ КОД: Чекбоксы !!!
// Храним ИНДЕКСЫ выбранных строк
const selectedRows = ref(new Set()); 
const isAllSelected = computed(() => {
  const validRowCount = csvData.value.filter(isValidRow).length;
  return validRowCount > 0 && selectedRows.value.size === validRowCount;
});
// --- КОНЕЦ НОВОГО КОДА ---


// --- Сопоставление (Mapping) ---
const columnMapping = ref({}); // { 'CSV Header Name': 'systemFieldKey' }

/**
 * Определения полей нашей системы, с которыми мы можем сопоставить CSV.
 */
const systemFields = [
  { key: 'date', label: 'Дата', entity: null, aliases: ['дата', 'date'] },
  { key: 'type', label: 'Тип операции', entity: null, aliases: ['тип', 'операция', 'type'] },
  { key: 'amount', label: 'Сумма', entity: null, aliases: ['сумма', 'amount'] },
  { key: 'category', label: 'Категория', entity: 'categories', aliases: ['категория', 'category'] },
  { key: 'project', label: 'Проект', entity: 'projects', aliases: ['проект', 'project', 'мои проекты'] },
  { key: 'account', label: 'Счет', entity: 'accounts', aliases: ['счет', 'account', 'мои счета'] },
  { key: 'company', label: 'Компания', entity: 'companies', aliases: ['компания', 'company', 'мои компании'] },
  { key: 'contractor', label: 'Контрагент', entity: 'contractors', aliases: ['контрагент', 'contractor', 'мои контрагенты'] },
  // TODO: Добавить поля для переводов (fromAccount, toAccount и т.д.)
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

// !!! НОВЫЙ КОД: Функция принудительной очистки состояния !!!
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
  
  // Очищаем <input type="file">
  if (fileInputRef.value) {
    fileInputRef.value.value = null;
  }
}
// --- КОНЕЦ НОВОГО КОДА ---


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
  
  // !!! ИСПРАВЛЕНИЕ: Очищаем input, чтобы @change сработал,
  // если пользователь выберет тот же файл снова.
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
  // !!! ИСПРАВЛЕНИЕ: Очищаем старые данные перед парсингом
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

// --- !!! НОВЫЙ КОД: Функции для чекбоксов !!! ---

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
// --- !!! КОНЕЦ НОВОГО КОДА ---


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
  // !!! ИЗМЕНЕНИЕ: Передаем 'selectedRows'
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
    // 1. Данные уже подготовлены в operationsToImport
    
    // 2. Отправить в mainStore (который отправит на сервер)
    // !!! ИЗМЕНЕНИЕ v2.7:
    // Мы отправляем *ВСЕ* operations (transformDataForImport)
    // И *отдельно* индексы (selectedRows)
    
    const allTransformedOperations = transformDataForImport(null); // Все операции
    const selectedIndices = Array.from(selectedRows.value); // Только индексы

    await mainStore.importOperations(
      allTransformedOperations, 
      selectedIndices, // <-- !!! НОВЫЙ КОД: Передаем индексы
      (progress) => {
        importProgress.value = progress;
      }
    );

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

</script>

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

/* !!! НОВЫЙ КОД: Стили для чекбоксов !!! */
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
/* --- КОНЕЦ НОВЫХ СТИЛЕЙ --- */


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