<script setup>
import { ref, onMounted, computed } from 'vue'; // (v4.2) Добавлен computed
import { useMainStore } from '@/stores/mainStore';
import axios from 'axios';

/**
 * * --- МЕТКА ВЕРСII: v4.2-API-URL-FIX ---
 * * ВЕРСIA: 4.2 - Исправлен "зашитый" localhost
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (FIX) `const API_BASE_URL` теперь читает
 * `import.meta.env.VITE_API_BASE_URL` (из "сейфа" Vercel).
 */

// !!! ИСПРАВЛЕНИЕ: Читаем "боевой" URL из Vercel !!!
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
// (Старый код: const API_BASE_URL = 'http://localhost:3000/api';)


const props = defineProps({
  date: Date,
  cellIndex: Number,
  transferToEdit: Object
});
const emit = defineEmits(['close', 'transfer-complete', 'operation-deleted']); // (v4.2) Добавлен 'operation-deleted'

const mainStore = useMainStore();

// --- STATE ---
const newTransfer = ref({
  amount: null,
  fromAccountId: null,
  toAccountId: null,
  fromCompanyId: null,
  toCompanyId: null,
  date: props.date ? new Date(props.date) : new Date(),
  cellIndex: props.cellIndex || 0,
  description: '' // (v4.2) Добавлено поле description
});

// (v4.2) Логика для быстрого добавления
const showAddAccount = ref(false);
const showAddCompany = ref(false);
const newAccountName = ref('');
const newCompanyName = ref('');

// --- (v4.2) COMPUTED ДЛЯ ФИЛЬТРАЦИИ СЕЛЕКТОВ ---
const availableToAccounts = computed(() => {
  return mainStore.accounts.filter(a => a._id !== newTransfer.value.fromAccountId);
});
const availableFromAccounts = computed(() => {
  return mainStore.accounts.filter(a => a._id !== newTransfer.value.toAccountId);
});
// --- КОНЕЦ COMPUTED ---


// --- (v4.2) HELPERS ДЛЯ БЫСТРОГО ДОБАВЛЕНИЯ ---
async function handleAddAccount(type) {
  if (!newAccountName.value.trim()) return;
  try {
    const newAcc = await mainStore.addAccount(newAccountName.value.trim());
    if (type === 'from') {
      newTransfer.value.fromAccountId = newAcc._id;
    } else {
      newTransfer.value.toAccountId = newAcc._id;
    }
    newAccountName.value = '';
    showAddAccount.value = false;
  } catch (e) { console.error("Ошибка добавления счета:", e); }
}
async function handleAddCompany(type) {
  if (!newCompanyName.value.trim()) return;
  try {
    const newComp = await mainStore.addCompany(newCompanyName.value.trim());
    if (type === 'from') {
      newTransfer.value.fromCompanyId = newComp._id;
    } else {
      newTransfer.value.toCompanyId = newComp._id;
    }
    newCompanyName.value = '';
    showAddCompany.value = false;
  } catch (e) { console.error("Ошибка добавления компании:", e); }
}
// --- КОНЕЦ HELPERS ---

// --- LOGIC ---
const onFromAccountSelected = (accountId) => {
  const account = mainStore.accounts.find(a => a._id === accountId);
  // (v4.2) Проверяем, что companyId существует (может быть null)
  if (account && account.companyId) {
    newTransfer.value.fromCompanyId = account.companyId;
  } else {
    // (v4.2) Не сбрасываем, если у счета нет компании
    // newTransfer.value.fromCompanyId = null;
  }
};
const onToAccountSelected = (accountId) => {
  const account = mainStore.accounts.find(a => a._id === accountId);
  // (v4.2) Проверяем, что companyId существует (может быть null)
  if (account && account.companyId) {
    newTransfer.value.toCompanyId = account.companyId;
  } else {
     // (v4.2) Не сбрасываем
    // newTransfer.value.toCompanyId = null;
  }
};

const handleSave = async () => {
  let dataToSend = { ...newTransfer.value };
  
  const finalDate = new Date(dataToSend.date);
  
  // (v4.2) Гарантируем, что dateKey передается
  // (v4.2) Используем _parseDateKey (из mainStore), чтобы получить правильный DayOfYear
  // (v4.2) Используем _getDateKey (из mainStore), чтобы получить правильный YYYY-DOY
  const dateKey = mainStore._getDateKey(finalDate);
  dataToSend.dateKey = dateKey;
  dataToSend.dayOfYear = mainStore._getDayOfYear(finalDate); // (v4.2) Получаем dayOfYear из даты

  try {
    if (props.transferToEdit) {
      // --- РЕДАКТИРОВАНИЕ ---
      console.log(`[TransferPopup] 🚀 PUT ${API_BASE_URL}/events/${props.transferToEdit._id}`);
      
      // !!! ИСПРАВЛЕНИЕ: Используем `API_BASE_URL` (из `import.meta.env`) !!!
      const response = await axios.put(`${API_BASE_URL}/events/${props.transferToEdit._id}`, dataToSend);
      
      emit('transfer-complete', { ...response.data, dateKey: dateKey });
    
    } else {
      // --- СОЗДАНИЕ ---
      console.log(`[TransferPopup] 🚀 POST ${API_BASE_URL}/transfers`);
      
      // !!! ИСПРАВЛЕНИЕ: Используем `API_BASE_URL` (из `import.meta.env`) !!!
      const response = await axios.post(`${API_BASE_URL}/transfers`, dataToSend);
      
      emit('transfer-complete', { ...response.data, dateKey: dateKey });
    }
  } catch (error) {
    console.error('TransferPopup: ошибка handleSave', error);
  }
};

// --- LIFECYCLE ---
onMounted(() => {
  if (props.transferToEdit) {
    // (v4.2) Глубокое копирование и исправление null/undefined
    newTransfer.value = {
      ...props.transferToEdit,
      date: new Date(props.transferToEdit.date),
      amount: Math.abs(props.transferToEdit.amount || 0),
      // (v4.2) Проверяем ID (с _id и без)
      fromAccountId: props.transferToEdit.fromAccountId?._id || props.transferToEdit.fromAccountId || null,
      toAccountId: props.transferToEdit.toAccountId?._id || props.transferToEdit.toAccountId || null,
      fromCompanyId: props.transferToEdit.fromCompanyId?._id || props.transferToEdit.fromCompanyId || null,
      toCompanyId: props.transferToEdit.toCompanyId?._id || props.transferToEdit.toCompanyId || null,
      description: props.transferToEdit.description || '',
    };
  }
});
</script>

<template>
  <div class="popup-overlay" @click.self="emit('close')">
    <div class="popup-content">
      <button class="close-btn" @click="emit('close')">&times;</button>
      
      <h2>{{ transferToEdit ? 'Редактировать Перевод' : 'Новый Перевод' }}</h2>

      <div class="form-group">
        <label>Сумма:</label>
        <input type="number" v-model.number="newTransfer.amount" placeholder="0.00" />
      </div>

      <div class="form-group">
        <label>Описание (необязательно):</label>
        <input type="text" v-model="newTransfer.description" placeholder="Назначение перевода..." />
      </div>

      <div class="form-group-inline">
        <label>Со счета:</label>
        <div class="input-with-add">
          <select v-model="newTransfer.fromAccountId" @change="onFromAccountSelected(newTransfer.fromAccountId)">
            <option :value="null" disabled>Откуда</option>
            <option v-for="acc in availableFromAccounts" :key="acc._id" :value="acc._id">
              {{ acc.name }}
            </option>
          </select>
          <button class="add-btn" @click.prevent="showAddAccount = 'from'">+</button>
        </div>
        <div v-if="showAddAccount === 'from'" class="add-inline-form">
          <input v-model="newAccountName" placeholder="Новый счет" @keyup.enter="handleAddAccount('from')"/>
          <button @click.prevent="handleAddAccount('from')">ОК</button>
        </div>
      </div>

      <div class="form-group-inline">
        <label>На счет:</label>
        <div class="input-with-add">
          <select v-model="newTransfer.toAccountId" @change="onToAccountSelected(newTransfer.toAccountId)">
            <option :value="null" disabled>Куда</option>
            <option v-for="acc in availableToAccounts" :key="acc._id" :value="acc._id">
              {{ acc.name }}
            </option>
          </select>
          <button class="add-btn" @click.prevent="showAddAccount = 'to'">+</button>
        </div>
         <div v-if="showAddAccount === 'to'" class="add-inline-form">
          <input v-model="newAccountName" placeholder="Новый счет" @keyup.enter="handleAddAccount('to')"/>
          <button @click.prevent="handleAddAccount('to')">ОК</button>
        </div>
      </div>
      
      <div class="form-group-inline">
        <label>От компании:</label>
         <div class="input-with-add">
          <select v-model="newTransfer.fromCompanyId">
            <option :value="null" disabled>(Авто)</option>
            <option v-for="comp in mainStore.companies" :key="comp._id" :value="comp._id">
              {{ comp.name }}
            </option>
          </select>
          <button class="add-btn" @click.prevent="showAddCompany = 'from'">+</button>
        </div>
        <div v-if="showAddCompany === 'from'" class="add-inline-form">
          <input v-model="newCompanyName" placeholder="Новая компания" @keyup.enter="handleAddCompany('from')"/>
          <button @click.prevent="handleAddCompany('from')">ОК</button>
        </div>
      </div>

      <div class="form-group-inline">
        <label>Компании:</label>
        <div class="input-with-add">
          <select v-model="newTransfer.toCompanyId">
            <option :value="null" disabled>(Авто)</option>
            <option v-for="comp in mainStore.companies" :key="comp._id" :value="comp._id">
              {{ comp.name }}
            </option>
          </select>
          <button class="add-btn" @click.prevent="showAddCompany = 'to'">+</button>
        </div>
        <div v-if="showAddCompany === 'to'" class="add-inline-form">
          <input v-model="newCompanyName" placeholder="Новая компания" @keyup.enter="handleAddCompany('to')"/>
          <button @click.prevent="handleAddCompany('to')">ОК</button>
        </div>
      </div>

      <hr />
      
      <div class="form-group form-group-inline">
        <label>Дата:</label>
        <input type="date" :value="newTransfer.date.toISOString().split('T')[0]" @input="newTransfer.date = new Date($event.target.value)" />
      </div>

      <div class="form-group form-group-inline">
        <label>Индекс:</label>
        <input type="number" v-model.number="newTransfer.cellIndex" />
      </div>

      <div class="popup-actions">
        <button v-if="transferToEdit" class="btn-danger" @click="emit('operation-deleted')">Удалить</button>
        <button class="btn-primary" @click="handleSave">{{ transferToEdit ? 'Сохранить' : 'Создать' }}</button>
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
  /* (v4.2) Добавлена максимальная высота и скролл */
  max-height: 90vh;
  overflow-y: auto;
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
.form-group input[type="text"], /* (v4.2) Добавлен text */
.form-group input[type="date"],
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 15px;
  box-sizing: border-box; 
}

.form-group-inline {
  display: inline-block;
  width: calc(50% - 5px);
  margin-bottom: 15px;
}
/* (v4.2) Исправлен селектор для 3-го и 4-го (компании) */
.form-group-inline:first-of-type,
.form-group-inline:nth-of-type(3) {
  margin-right: 10px;
}
.form-group-inline label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-mute);
}
.form-group-inline select,
.form-group-inline input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 15px;
  box-sizing: border-box;
}

hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 10px 0 20px 0; /* (v4.2) Уменьшен отступ */
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

/* (v4.2) Стили для кнопки + */
.input-with-add {
  display: flex;
  align-items: center;
}
.input-with-add select {
  flex-grow: 1;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
}
.add-btn {
  flex-shrink: 0;
  width: 40px;
  height: 40px; /* (v4.2) Выровнено по высоте input */
  padding: 0;
  margin: 0;
  border: 1px solid var(--color-border);
  border-top-right-radius: 5px;
  border-bottom-right-radius: 5px;
  background: var(--color-background-mute);
  color: var(--color-text);
  font-size: 20px;
  font-weight: 600;
  cursor: pointer;
}
.add-btn:hover {
  background-color: var(--color-border);
}

/* (v4.2) Стили для инлайн-формы добавления */
.add-inline-form {
  display: flex;
  margin-top: 8px;
}
.add-inline-form input {
  flex-grow: 1;
  padding: 8px 10px;
  border: 1px solid var(--color-border-hover);
  border-right: none;
  border-top-left-radius: 5px;
  border-bottom-left-radius: 5px;
  background: var(--color-background);
  color: var(--color-text);
}
.add-inline-form button {
  flex-shrink: 0;
  padding: 0 15px;
  border: 1px solid var(--color-border-hover);
  border-top-right-radius: 5px;
  border-bottom-right-radius: 5px;
  background: var(--color-background-mute);
  color: var(--color-text);
  font-weight: 600;
  cursor: pointer;
}
.add-inline-form button:hover {
  background-color: var(--color-border);
}
</style>
