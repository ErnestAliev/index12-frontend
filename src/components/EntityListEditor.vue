<script setup>
import { ref, onMounted } from 'vue';
import draggable from 'vuedraggable';
// --- 1. Импортируем mainStore ---
import { useMainStore } from '@/stores/mainStore';

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true }
});
const emit = defineEmits(['close', 'save']);

// --- 2. Инициализируем mainStore ---
const mainStore = useMainStore();
const localItems = ref([]);

// --- !!! НОВАЯ ЛОГИКА: Форматирование чисел !!! ---
// Проверяем, в каком режиме попап
const isAccountEditor = props.title === 'Редактировать счета';
// --- 🔴 НОВОЕ: Определяем режим Контрагентов ---
const isContractorEditor = props.title === 'Редактировать контрагентов';

const formatNumber = (numStr) => {
  // Убираем все, кроме цифр
  const clean = `${numStr}`.replace(/[^0-9]/g, '');
  // Добавляем пробелы
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const onAmountInput = (item) => {
  // 1. "Чистим" и форматируем
  const rawValue = String(item.initialBalanceFormatted).replace(/[^0-9]/g, '');
  item.initialBalanceFormatted = formatNumber(rawValue);
  // 2. Сразу же обновляем "сырое" значение для сохранения
  item.initialBalance = Number(rawValue) || 0;
};
// --- КОНЕЦ НОВОЙ ЛОГИКИ ---

onMounted(() => {
  // Глубокое копирование
  localItems.value = JSON.parse(JSON.stringify(props.items)).map(item => {
    // --- Режим "СЧЕТА" ---
    if (isAccountEditor) {
        const balance = item.initialBalance || 0;
        // 3. Стандартизируем companyId
        const cId = (item.companyId && typeof item.companyId === 'object')
            ? item.companyId._id
            : item.companyId;
            
        return {
            ...item,
            initialBalance: balance, 
            initialBalanceFormatted: formatNumber(balance),
            companyId: cId || null
        }
    }
    
    // --- 🔴 НОВОЕ: Режим "КОНТРАГЕНТЫ" ---
    if (isContractorEditor) {
        // Стандартизируем ID (на случай, если придут объекты)
        const pId = (item.defaultProjectId && typeof item.defaultProjectId === 'object')
            ? item.defaultProjectId._id
            : item.defaultProjectId;
        const cId = (item.defaultCategoryId && typeof item.defaultCategoryId === 'object')
            ? item.defaultCategoryId._id
            : item.defaultCategoryId;

        return {
            ...item,
            defaultProjectId: pId || null,
            defaultCategoryId: cId || null
        }
    }
    // --- КОНЕЦ НОВОГО ---

    // Для остальных (Проекты, Категории)
    return item;
  });
});

const handleSave = () => {
  const itemsToSave = localItems.value.map((item, index) => {
    // Собираем базовые данные
    const data = {
      _id: item._id,
      name: item.name,
      order: index
    };
    
    // !!! Добавляем доп. поля для Счетов !!!
    if (isAccountEditor) {
        data.initialBalance = item.initialBalance || 0; 
        data.companyId = item.companyId || null;
    }
    
    // --- 🔴 НОВОЕ: Добавляем доп. поля для Контрагентов ---
    if (isContractorEditor) {
        data.defaultProjectId = item.defaultProjectId || null;
        data.defaultCategoryId = item.defaultCategoryId || null;
    }
    // --- КОНЕЦ НОВОГО ---
    
    return data;
  });
  emit('save', itemsToSave);
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content" :class="{ 'wide': isContractorEditor }">
      <h3>{{ title }}</h3>
      
      <p class="editor-hint">
        Перетащите, чтобы изменить порядок. Кликните, чтобы изменить название.
      </p>
      
      <div v-if="isAccountEditor" class="editor-header account-header">
        <span class="header-name">Название счета</span>
        <span class="header-company">Компания</span>
        <span class="header-balance">Нач. баланс</span>
      </div>
      
      <div v-if="isContractorEditor" class="editor-header contractor-header">
        <span class="header-name">Название контрагента</span>
        <span class="header-project">Проект по умолч.</span>
        <span class="header-category">Категория по умолч.</span>
      </div>
      
      <div class="list-editor">
        <draggable 
          v-model="localItems" 
          item-key="_id" 
          handle=".drag-handle"
          ghost-class="ghost"
        >
          <template #item="{ element: item }">
            <div class="edit-item">
              <span class="drag-handle">⠿</span>
              
              <input type="text" v-model="item.name" class="edit-input edit-name" />
              
              <template v-if="isAccountEditor">
                <select
                  v-model="item.companyId"
                  class="edit-input edit-company"
                >
                  <option :value="null">Без компании</option>
                  <option v-for="comp in mainStore.companies" :key="comp._id" :value="comp._id">
                    {{ comp.name }}
                  </option>
                </select>
                
                <input 
                  type="text" 
                  inputmode="decimal"
                  v-model="item.initialBalanceFormatted"
                  @input="onAmountInput(item)"
                  class="edit-input edit-balance" 
                  placeholder="0"
                />
              </template>
              
              <template v-if="isContractorEditor">
                <select
                  v-model="item.defaultProjectId"
                  class="edit-input edit-project"
                >
                  <option :value="null">Без проекта</option>
                  <option v-for="p in mainStore.projects" :key="p._id" :value="p._id">
                    {{ p.name }}
                  </option>
                </select>
                
                <select
                  v-model="item.defaultCategoryId"
                  class="edit-input edit-category"
                >
                  <option :value="null">Без категории</option>
                  <option v-for="c in mainStore.categories" :key="c._id" :value="c._id">
                    {{ c.name }}
                  </option>
                </select>
              </template>
              
            </div>
          </template>
        </draggable>
      </div>
          
      <div class="popup-actions">
        <button @click="handleSave" class="btn-submit btn-submit-edit">
          Сохранить
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* (Стили базового попапа - без изменений) */
.popup-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex; justify-content: center; align-items: center;
  z-index: 1000; overflow-y: auto;
}
.popup-content {
  /* ❗ Стандартная ширина */
  max-width: 580px; 
  background: #F4F4F4; padding: 2rem; border-radius: 12px;
  color: #1a1a1a; width: 100%;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem;
  transition: max-width 0.2s ease; /* 🔴 Плавная смена ширины */
}
/* 🔴 НОВОЕ: Широкий класс для Контрагентов */
.popup-content.wide {
  max-width: 680px;
}

h3 {
  color: #1a1a1a; margin-top: 0; margin-bottom: 1.5rem;
  text-align: left; font-size: 22px; font-weight: 600;
}
.popup-actions { display: flex; margin-top: 2rem; }
.btn-submit {
  width: 100%; height: 50px; padding: 0 1rem;
  color: white; border: none; border-radius: 8px;
  font-size: 16px; font-weight: 600; cursor: pointer;
  transition: background-color 0.2s ease;
}
.btn-submit-edit { background-color: #222222; }
.btn-submit-edit:hover { background-color: #444444; }

/* --- !!! ИЗМЕНЕНИЕ СТИЛЕЙ РЕДАКТОРА !!! --- */
.editor-hint {
  font-size: 0.9em; color: #666; text-align: center;
  margin-top: -10px; margin-bottom: 1rem;
}

/* 7. Обновлены стили заголовка */
.editor-header {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    font-size: 0.8em;
    color: #666;
    margin-left: 32px; /* Выравнивание с drag-handle */
    margin-bottom: 5px;
}
.header-name {
    flex-grow: 1;
}
/* Заголовки "Счетов" */
.account-header .header-company {
    flex-shrink: 0;
    width: 150px;
}
.account-header .header-balance {
    flex-shrink: 0;
    width: 120px;
    text-align: right;
    padding-right: 14px; /* Совпадает с padding поля */
}
/* 🔴 НОВЫЕ: Заголовки "Контрагентов" */
.contractor-header .header-project {
    flex-shrink: 0;
    width: 150px;
}
.contractor-header .header-category {
    flex-shrink: 0;
    width: 150px;
}


.list-editor {
  max-height: 400px;
  overflow-y: auto;
  padding-right: 5px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.list-editor::-webkit-scrollbar { display: none; }

.edit-item {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  gap: 10px; /* Отступ между полями */
}
.drag-handle {
  cursor: grab;
  font-size: 1.5em;
  color: #999;
  user-select: none;
  flex-shrink: 0;
  width: 22px; /* Фиксируем ширину для выравнивания */
}
.edit-item:active { cursor: grabbing; }

/* --- !!! Стили для 3-х полей !!! --- */
.edit-input {
  height: 48px; padding: 0 14px; background: #FFFFFF;
  border: 1px solid #E0E0E0; border-radius: 8px;
  color: #1a1a1a; font-size: 15px; font-family: inherit;
  box-sizing: border-box;
}
.edit-input:focus {
  outline: none; border-color: #222222; 
  box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.2);
}
/* Поле "Название" */
.edit-name {
  flex-grow: 1; 
  min-width: 100px;
}

/* Общий стиль для <select> */
.edit-company, .edit-project, .edit-category {
  flex-shrink: 0;
  width: 150px;
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.41 0.589844L6 5.16984L10.59 0.589844L12 2.00019L6 8.00019L0 2.00019L1.41 0.589844Z' fill='%23333'%3E%3C/path%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 40px;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}

/* Поле "Баланс" */
.edit-balance {
  flex-shrink: 0;
  width: 120px; 
  text-align: right;
}
/* --- КОНЕЦ ИЗМЕНЕНИЙ --- */

.ghost { opacity: 0.5; background: #c0c0c0; }
</style>