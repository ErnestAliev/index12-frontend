<script setup>
import { ref, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import axios from 'axios';

/**
 * * --- МЕТКА ВЕРСII: v4.2-API-URL-FIX ---
 * * ВЕРСIA: 4.2 - Исправлен "зашитый" localhost
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
  date: Date,
  cellIndex: Number,
  transferToEdit: Object
});
const emit = defineEmits(['close', 'transfer-complete', 'operation-deleted']); // (v4.2) Добавлен 'operation-deleted'

const mainStore = useMainStore();

// (Ваша логика `newTransfer` - без изменений)
const newTransfer = ref({
  amount: null,
  fromAccountId: null,
  toAccountId: null,
  fromCompanyId: null,
  toCompanyId: null,
  date: props.date ? new Date(props.date) : new Date(),
  cellIndex: props.cellIndex || 0,
});

// (Ваша логика `onFromAccountSelected` и `onToAccountSelected` - без изменений)
const onFromAccountSelected = (accountId) => {
  const account = mainStore.accounts.find(a => a._id === accountId);
  if (account && account.companyId) {
    newTransfer.value.fromCompanyId = account.companyId;
  }
};
const onToAccountSelected = (accountId) => {
  const account = mainStore.accounts.find(a => a._id === accountId);
  if (account && account.companyId) {
    newTransfer.value.toCompanyId = account.companyId;
  }
};

// (Ваша логика `handleSave` - ИСПРАВЛЕНА)
const handleSave = async () => {
  let dataToSend = { ...newTransfer.value };
  
  const finalDate = new Date(dataToSend.date);
  // (v4.2) Гарантируем, что dateKey передается
  // (v4.2) Используем _parseDateKey, чтобы получить правильный DayOfYear
  // (v4.2) Используем _getDateKey, чтобы получить правильный YYYY-DOY
  const dateKey = mainStore._getDateKey(finalDate);
  dataToSend.dateKey = dateKey;
  dataToSend.dayOfYear = mainStore._getDayOfYear(finalDate);

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

// (Ваша логика `onMounted` - без изменений)
onMounted(() => {
  if (props.transferToEdit) {
    newTransfer.value = {
      ...props.transferToEdit,
      date: new Date(props.transferToEdit.date),
      amount: Math.abs(props.transferToEdit.amount || 0),
      fromAccountId: props.transferToEdit.fromAccountId?._id || props.transferToEdit.fromAccountId || null,
      toAccountId: props.transferToEdit.toAccountId?._id || props.transferToEdit.toAccountId || null,
      fromCompanyId: props.transferToEdit.fromCompanyId?._id || props.transferToEdit.fromCompanyId || null,
      toCompanyId: props.transferToEdit.toCompanyId?._id || props.transferToEdit.toCompanyId || null,
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

      <div class="form-group-inline">
        <label>Со счета:</label>
        <select v-model="newTransfer.fromAccountId" @change="onFromAccountSelected(newTransfer.fromAccountId)">
          <option :value="null" disabled>Откуда</option>
          <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">
            {{ acc.name }}
          </option>
        </select>
      </div>

      <div class="form-group-inline">
        <label>На счет:</label>
        <select v-model="newTransfer.toAccountId" @change="onToAccountSelected(newTransfer.toAccountId)">
          <option :value="null" disabled>Куда</option>
          <option v-for="acc in mainStore.accounts" :key="acc._id" :value="acc._id">
            {{ acc.name }}
          </option>
        </select>
      </div>
      
      <div class="form-group-inline">
        <label>От компании:</label>
        <select v-model="newTransfer.fromCompanyId">
          <option :value="null" disabled>(Авто)</option>
          <option v-for="comp in mainStore.companies" :key="comp._id" :value="comp._id">
            {{ comp.name }}
          </option>
        </select>
      </div>

      <div class="form-group-inline">
        <label>Компании:</label>
        <select v-model="newTransfer.toCompanyId">
          <option :value="null" disabled>(Авто)</option>
          <option v-for="comp in mainStore.companies" :key="comp._id" :value="comp._id">
            {{ comp.name }}
          </option>
        </select>
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
  box-sizing: border-box; 
}

.form-group-inline {
  display: inline-block;
  width: calc(50% - 5px);
  margin-bottom: 15px;
}
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
  margin: 10px 0 20px 0;
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
</style>
