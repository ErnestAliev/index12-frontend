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
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.popup-content {
  background: var(--color-background-soft);
  padding: 25px;
  border-radius: 10px;
  width: 90%;
  max-width: 450px;
  box-shadow: 0 5px 20px rgba(0,0,0,0.3);
  border: 1px solid var(--color-border);
  position: relative;
}
.close-btn {
  position: absolute;
  top: 10px;
  right: 15px;
  background: none;
  border: none;
  font-size: 28px;
  color: var(--color-text-mute);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.close-btn:hover {
  color: var(--color-text);
}
h2 {
  margin-top: 0;
  margin-bottom: 20px;
  color: var(--color-heading-text);
  font-weight: 600;
}
.form-group {
  margin-bottom: 15px;
}
.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-mute);
}
.form-group input[type="number"],
.form-group input[type="date"],
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 15px;
  box-sizing: border-box; /* Важно для padding */
}
.form-group-inline {
  display: inline-block;
  width: calc(50% - 5px);
}
.form-group-inline:first-of-type {
  margin-right: 10px;
}

hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 20px 0;
}

.popup-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 25px;
}
.popup-actions button {
  padding: 10px 18px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  margin-left: 10px;
  transition: background-color 0.2s, opacity 0.2s;
}
.btn-primary {
  background-color: var(--color-accent);
  color: white;
}
.btn-primary:hover {
  opacity: 0.85;
}
.btn-danger {
  background-color: #e53e3e;
  color: white;
}
.btn-danger:hover {
  background-color: #c53030;
}
.btn-secondary {
  background-color: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.btn-secondary:hover {
  background-color: var(--color-border);
}
</style>
