<script setup>
import { ref, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v3.0 - INLINE CREATE ---
 * * ВЕРСИЯ: 3.0 - Добавлено создание счета внутри пикера
 * * ДАТА: 2025-11-19
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (FEAT) Добавлена кнопка "+ Создать новый счет".
 * 2. (LOGIC) Реализовано inline-создание через mainStore.addAccount.
 * 3. (UX) Новый счет сразу выбирается (чекится).
 */

const props = defineProps({
  initialSelectedIds: {
    type: Array,
    default: () => []
  },
  allAccounts: {
    type: Array,
    default: () => []
  },
  hintText: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['close', 'save']);
const mainStore = useMainStore();

const localSelectedIds = ref(new Set(props.initialSelectedIds));

const toggleAccount = (accountId) => {
  if (localSelectedIds.value.has(accountId)) {
    localSelectedIds.value.delete(accountId);
  } else {
    localSelectedIds.value.add(accountId);
  }
};

const handleSave = () => {
  emit('save', Array.from(localSelectedIds.value));
  emit('close');
};

const handleCancel = () => {
  emit('close');
};

// --- ЛОГИКА СОЗДАНИЯ НОВОГО СЧЕТА ---
const isCreating = ref(false);
const newAccountName = ref('');
const newAccountInputRef = ref(null);
const isSavingNew = ref(false);

const startCreation = () => {
  isCreating.value = true;
  newAccountName.value = '';
  nextTick(() => {
    if (newAccountInputRef.value) newAccountInputRef.value.focus();
  });
};

const cancelCreation = () => {
  isCreating.value = false;
  newAccountName.value = '';
};

const createAccount = async () => {
  const name = newAccountName.value.trim();
  if (!name) return;
  
  isSavingNew.value = true;
  try {
    // Создаем счет через стор
    const newAccount = await mainStore.addAccount(name);
    
    if (newAccount && newAccount._id) {
      // Сразу выбираем созданный счет
      localSelectedIds.value.add(newAccount._id);
      cancelCreation();
    }
  } catch (e) {
    console.error(e);
    alert('Ошибка при создании счета: ' + e.message);
  } finally {
    isSavingNew.value = false;
  }
};
</script>

<template>
  <div class="picker-overlay" @click.self="handleCancel">
    <div class="picker-content">
      
      <h4>Выберите счета</h4>
      
      <div v-if="hintText" class="picker-hint" v-html="hintText"></div>
      
      <!-- 🟢 Секция создания -->
      <div class="create-section">
        <button v-if="!isCreating" class="btn-add-new" @click="startCreation">
          + Создать новый счет
        </button>
        
        <div v-else class="inline-create-row">
           <input 
             type="text" 
             v-model="newAccountName" 
             placeholder="Название счета" 
             ref="newAccountInputRef" 
             class="create-input" 
             @keyup.enter="createAccount" 
             @keyup.esc="cancelCreation" 
           />
           <button class="btn-icon-save" @click="createAccount" :disabled="isSavingNew">✓</button>
           <button class="btn-icon-cancel" @click="cancelCreation" :disabled="isSavingNew">✕</button>
        </div>
      </div>
      
      <div class="account-list-scroll">
        <label v-for="acc in allAccounts" :key="acc._id" class="account-item">
          <input
            type="checkbox"
            :checked="localSelectedIds.has(acc._id)"
            @change="toggleAccount(acc._id)"
          />
          <span class="account-name">{{ acc.name }}</span>
        </label>
        <div v-if="!allAccounts.length" class="account-item-empty">
          Счетов пока нет.
        </div>
      </div>
      
      <div class="picker-footer">
        <button @click="handleCancel" class="btn btn-secondary">
          Отмена
        </button>
        <button @click="handleSave" class="btn btn-primary">
          Готово
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7); 
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1002; 
  overflow-y: auto;
}

.picker-content {
  width: 100%;
  max-width: 400px;
  background: #F4F4F4;
  border-radius: 12px;
  color: #1a1a1a;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  margin: 1rem;
  display: flex;
  flex-direction: column;
  overflow: hidden; 
}

h4 {
  color: #1a1a1a;
  margin: 0;
  padding: 1.5rem 1.5rem 0.5rem 1.5rem; /* Уменьшен отступ снизу */
  font-size: 20px;
  font-weight: 600;
  text-align: center;
}

.picker-hint {
  padding: 0 1.5rem 1rem;
  font-size: 0.9em;
  color: #666;
  text-align: center;
  line-height: 1.4;
  border-bottom: 1px solid #E0E0E0;
}

/* --- СТИЛИ ДЛЯ СОЗДАНИЯ (как в EntityListEditor) --- */
.create-section {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #E0E0E0;
  background-color: #fafafa;
}
.btn-add-new {
  width: 100%;
  padding: 10px;
  border: 1px dashed #aaa;
  background-color: transparent;
  border-radius: 8px;
  color: #555;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-add-new:hover {
  border-color: #222;
  color: #222;
  background-color: #e9e9e9;
}

.inline-create-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.create-input {
  flex-grow: 1;
  height: 40px;
  padding: 0 10px;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
  color: #1a1a1a;
  margin: 0; /* Сброс margin из base.css */
}
.create-input:focus {
  outline: none;
  border-color: #222;
}
.btn-icon-save, .btn-icon-cancel {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #fff;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.btn-icon-save { background-color: #34C759; }
.btn-icon-save:hover { background-color: #2da84e; }
.btn-icon-cancel { background-color: #FF3B30; }
.btn-icon-cancel:hover { background-color: #d63025; }


.account-list-scroll {
  padding: 1rem 1.5rem;
  max-height: 40vh; 
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.account-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: background-color 0.2s;
}
.account-item:hover {
  background-color: #E9E9E9;
}
.account-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  margin-right: 12px;
  accent-color: #222222; 
}
.account-name {
  font-size: 16px;
  color: #333;
  font-weight: 500;
}
.account-item-empty {
  text-align: center;
  color: #888;
  padding: 1rem;
}

.picker-footer {
  display: flex;
  gap: 10px;
  padding: 1rem 1.5rem;
  border-top: 1px solid #E0E0E0;
  background-color: #F9F9F9;
}

.btn {
  flex: 1; 
  height: 48px;
  padding: 0 1rem;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-secondary {
  background-color: #e0e0e0;
  color: #333;
  font-weight: 500;
}
.btn-secondary:hover {
  background-color: #d1d1d1;
}

.btn-primary {
  background-color: #222222;
  color: white;
}
.btn-primary:hover {
  background-color: #444444;
}
</style>
