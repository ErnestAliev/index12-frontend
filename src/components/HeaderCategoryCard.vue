<script setup>
import { ref, watch, computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import axios from 'axios';

/**
 * * --- МЕТКА ВЕРСII: v4.3-API-URL-FIX ---
 * * ВЕРСIA: 4.3 - Исправлен "зашитый" localhost
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (FIX) Удален `const API_BASE_URL = 'http://localhost:3000/api';`
 * 2. (FIX) `axios.post` и `axios.put` теперь используют
 * `import.meta.env.VITE_API_BASE_URL` (из "сейфа" Vercel).
 */

// !!! ИСПРАВЛЕНИЕ: Читаем "боевой" URL из Vercel !!!
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
// (Старый код: const API_BASE_URL = 'http://localhost:3000/api';)


const props = defineProps({
  type: String,
  date: Date,
  cellIndex: Number,
  operationToEdit: Object
});
const emit = defineEmits(['close', 'operation-added', 'operation-deleted', 'operation-moved', 'operation-updated']);

const mainStore = useMainStore();

// (Ваша логика `newOperation` и `isExpense` - без изменений)
const newOperation = ref({
  type: props.type || 'income',
  amount: null,
  categoryId: null,
  accountId: null,
  companyId: null,
  contractorId: null,
  projectId: null,
  date: props.date ? new Date(props.date) : new Date(),
  cellIndex: props.cellIndex || 0
});
const isExpense = computed(() => newOperation.value.type === 'expense');

// (Ваша логика `onAccountSelected` и `onContractorSelected` - без изменений)
const onAccountSelected = (accountId) => {
  console.log(`[OperationPopup] 🕵️‍♂️ onAccountSelected CALLED with accountId: ${accountId}`);
  const account = mainStore.accounts.find(a => a._id === accountId);
  if (account && account.companyId) {
    newOperation.value.companyId = account.companyId;
  } else {
    console.log(`[OperationPopup] ⚠️ Account has NO companyId.`);
  }
};
const onContractorSelected = (contractorId) => {
  console.log(`[OperationPopup] 🕵️‍♂️ onContractorSelected CALLED with contractorId: ${contractorId}`);
  const contractor = mainStore.contractors.find(c => c._id === contractorId);
  if (contractor) {
    if (contractor.defaultProjectId) {
      newOperation.value.projectId = contractor.defaultProjectId._id;
    } else {
      console.log(`[OperationPopup] ⚠️ Contractor has NO defaultProjectId.`);
    }
    if (contractor.defaultCategoryId) {
      newOperation.value.categoryId = contractor.defaultCategoryId._id;
    } else {
      console.log(`[OperationPopup] ⚠️ Contractor has NO defaultCategoryId.`);
    }
  }
};

// (Ваша логика `handleSave` - ИСПРАВЛЕНА)
const handleSave = async () => {
  let dataToSend = { ...newOperation.value };
  
  if (isExpense.value && dataToSend.amount > 0) {
    dataToSend.amount = -Math.abs(dataToSend.amount);
  } else if (!isExpense.value && dataToSend.amount < 0) {
    dataToSend.amount = Math.abs(dataToSend.amount);
  }
  
  const finalDate = new Date(dataToSend.date);
  // (v4.3) Используем _parseDateKey, чтобы получить правильный DayOfYear
  // (v4.3) Используем _getDateKey, чтобы получить правильный YYYY-DOY
  const dateKey = mainStore._getDateKey(finalDate);
  dataToSend.dateKey = dateKey;
  dataToSend.dayOfYear = mainStore._getDayOfYear(finalDate);

  try {
    if (props.operationToEdit) {
      // --- РЕДАКТИРОВАНИЕ ---
      console.log(`[OperationPopup] 🚀 PUT ${API_BASE_URL}/events/${props.operationToEdit._id}`);
      
      // !!! ИСПРАВЛЕНИЕ: Используем `API_BASE_URL` (из `import.meta.env`) !!!
      const response = await axios.put(`${API_BASE_URL}/events/${props.operationToEdit._id}`, dataToSend);
      
      emit('operation-updated', { ...response.data, dayOfYear: dataToSend.dayOfYear });
    
    } else {
      // --- СОЗДАНИЕ ---
      console.log(`[OperationPopup] 🚀 POST ${API_BASE_URL}/events`);
      
      // !!! ИСПРАВЛЕНИЕ: Используем `API_BASE_URL` (из `import.meta.env`) !!!
      const response = await axios.post(`${API_BASE_URL}/events`, dataToSend);
      
      emit('operation-added', response.data);
    }
  } catch (error) {
    console.error('OperationPopup: ошибка handleSave', error);
    // (Лог, который вы видели: net::ERR_CONNECTION_REFUSED)
  }
};

// (Ваша логика `handleMove` - без изменений)
const handleMove = () => {
  emit('operation-moved', {
    operation: props.operationToEdit,
    // (v4.3) Используем _getDayOfYear для правильного dayOfYear
    toDayOfYear: mainStore._getDayOfYear(newOperation.value.date),
    toCellIndex: newOperation.value.cellIndex
  });
};

// (Ваша логика `onMounted` - без изменений)
onMounted(() => {
  if (props.operationToEdit) {
    newOperation.value = {
      ...props.operationToEdit,
      date: new Date(props.operationToEdit.date),
      amount: Math.abs(props.operationToEdit.amount || 0),
      categoryId: props.operationToEdit.categoryId?._id || null,
      accountId: props.operationToEdit.accountId?._id || null,
      companyId: props.operationToEdit.companyId?._id || null,
      contractorId: props.operationToEdit.contractorId?._id || null,
      projectId: props.operationToEdit.projectId?._id || null,
    };
  }
});
</script>

<template>
  <div class="popup-overlay" @click.self="emit('close')">
    <div class="popup-content">
      <button class="close-btn" @click="emit('close')">&times;</button>
      
      <h2>{{ operationToEdit ? 'Редактировать' : 'Добавить' }} {{ type === 'income' ? 'Доход' : 'Расход' }}</h2>

      <div class="form-group">
        <label>Сумма:</label>
        <input type="number" v-model.number="newOperation.amount" placeholder="0.00" />
      </div>

      <div class="form-group">
        <label>Категория:</label>
        <select v-model="newOperation.categoryId">
          <option :value="null" disabled>Выберите категорию</option>
          <option v-for="cat in mainStore.categories" :key="cat._id" :value="cat._id">
            {{ cat.name }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label>Счет:</label>
        <select v-model="newOperation.accountId" @change="onAccountSelected(newOperation.accountId)">
          <option :value="null" disabled>Выберите счет</option>
          <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">
            {{ acc.name }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label>Компания:</label>
        <select v-model="newOperation.companyId">
          <option :value="null" disabled>Выберите компанию</option>
          <option v-for="comp in mainStore.companies" :key="comp._id" :value="comp._id">
            {{ comp.name }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label>Контрагент:</label>
        <select v-model="newOperation.contractorId" @change="onContractorSelected(newOperation.contractorId)">
          <option :value="null" disabled>Выберите контрагента</option>
          <option v-for="cont in mainStore.contractors" :key="cont._id" :value="cont._id">
            {{ cont.name }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label>Проект:</label>
        <select v-model="newOperation.projectId">
          <option :value="null" disabled>Выберите проект</option>
          <option v-for="proj in mainStore.projects" :key="proj._id" :value="proj._id">
            {{ proj.name }}
          </option>
        </select>
      </div>

      <hr />
      
      <div class="form-group form-group-inline">
        <label>Дата:</label>
        <input type="date" :value="newOperation.date.toISOString().split('T')[0]" @input="newOperation.date = new Date($event.target.value)" />
      </div>

      <div class="form-group form-group-inline">
        <label>Индекс:</label>
        <input type="number" v-model.number="newOperation.cellIndex" />
      </div>

      <div class="popup-actions">
        <button v-if="operationToEdit" class="btn-secondary" @click="handleMove">Переместить</button>
        <button v-if="operationToEdit" class="btn-danger" @click="emit('operation-deleted')">Удалить</button>
        <button class="btn-primary" @click="handleSave">{{ operationToEdit ? 'Сохранить' : 'Создать' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* (Стили карточки v4.1 - без изменений) */
.dashboard-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-right: 1.5rem;
  border-right: 1px solid var(--color-border);
  /* min-width: 150px; (🟢 УДАЛЕНО: Позволяем карточке сжиматься) */
  position: relative; 
  min-height: 0;
}

.dashboard-card:last-child {
  border-right: none;
  padding-right: 0;
}
.card-title-container {
  height: 30px; 
  margin-bottom: 0.5rem;
  flex-shrink: 0;
  cursor: pointer;
}
.card-title {
  font-size: 0.85em;
  color: #aaa;
  transition: color 0.2s;
}
.card-title:hover {
  color: #ddd;
}
.card-title span {
  font-size: 0.8em;
  margin-left: 4px;
}

/* (Стили списка v4.1 - без изменений) */
.category-breakdown-list {
  display: flex;
  flex-direction: column;
  flex-grow: 1; 
  gap: 0.25rem; 
}
.category-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.9em;
  margin-bottom: 0.25rem; 
}
.category-item span:first-child {
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 10px;
}
.category-item span:last-child {
  color: var(--color-text);
  font-weight: 500;
  white-space: nowrap;
}
.category-item span.income {
  color: var(--color-primary); /* Зеленый */
}
.category-item span.expense {
  color: var(--color-danger); /* Оранжевый/Красный */
}

/* (Стили списка v4.1 - без изменений) */
.category-items-list-scroll {
  flex-grow: 1;
  overflow-y: auto;
  padding-right: 5px; 
  scrollbar-width: none;
  -ms-overflow-style: none;
  min-height: 0;
}

.category-items-list-scroll::-webkit-scrollbar {
  display: none;
}
.category-item-empty {
  font-size: 0.9em;
  color: #666;
}


/* --- 🔴 ИСПРАВЛЕНИЕ v2.3: Стили для Dropdown --- */
.widget-dropdown {
  position: absolute;
  top: 35px;
  left: 0;
  width: 220px; /* (Чуть шире) */
  background-color: #f4f4f4;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  z-index: 100;
  padding: 8px;
  box-sizing: border-box;
  
  /* 🔴 НОВОЕ: Ограничение высоты */
  max-height: 400px;
  display: flex;
  flex-direction: column;
}

/* 🔴 ИСПРАВЛЕНИЕ v2.4: Стили для поиска */
.widget-search-input {
  flex-shrink: 0;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 0.7em;
  box-sizing: border-box;
  width: 100%;

  /* --- 🔴 НОВОЕ: Исправление цвета --- */
  background-color: #FFFFFF;
  color: #333;
  /* --- КОНЕЦ НОВОГО --- */
}
.widget-search-input:focus {
  outline: none;
  border-color: #007AFF; /* (Цвет как у "Создать") */
}
/* --- */

.widget-dropdown ul {
  list-style: none;
  margin: 0;
  padding: 0;
  
  /* 🔴 НОВОЕ: Скролл */
  flex-grow: 1;
  overflow-y: auto;
}
/* --- КОНЕЦ ИСПРАВЛЕНИЯ --- */

.widget-dropdown li {
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.7em;
  color: #333;
  cursor: pointer;
  
  /* --- 🔴 ИСПРАВЛЕНИЕ v2.5: !important --- */
  font-weight: 500 !important;
}
.widget-dropdown li:hover {
  background-color: #e9e9e9;
}
.widget-dropdown li.active {
  color: #333;
  background-color: #e0e0e0;
}
.widget-dropdown li.disabled {
  color: #aaa;
  background-color: transparent;
  cursor: not-allowed;
}

/* === 🟢 НАЧАЛО ИЗМЕНЕНИЙ (ШРИФТЫ ДЛЯ ПЛАНШЕТА v4.5) === */
@media (max-height: 900px) {
  .dashboard-card {
    min-width: 100px; 
    padding-right: 0.8rem; /* 🔴 ИСПРАВЛЕНИЕ v4.5: Чуть меньше отступ */
  }
  .card-title {
    font-size: 0.75em;
  }
  .category-item {
    font-size: 0.7em; /* 🔴 ИСПРАВЛЕНИЕ v4.5: Агрессивное уменьшение */
    margin-bottom: 0.2rem;
  }
  .category-item span:first-child {
    padding-right: 5px; /* Уменьшаем отступ у имени */
  }
}

/* 🔴 НОВОЕ (v4.4): Адаптация под ширину (960px - 1440px) */
@media (max-width: 1440px) {
  .card-title {
    font-size: 0.75em; /* 🔴 Уменьшаем шрифт заголовка */
  }
  .category-item {
    font-size: 0.75em; /* 🔴 Уменьшаем шрифт списка */
  }
}
/* === 🟢 КОНЕЦ ИЗМЕНЕНИЙ === */
</style>
