<script setup>
import { ref, onMounted } from 'vue';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v9.0-step4-REVISED ---
 * * ВЕРСИЯ: 9.0 (Ревизия Шага 4/7) - Возврат к логике Шага 4 + Фикс стилей
 * ДАТА: 2025-11-17
 *
 * ЧТО ИЗМЕНЕНО (На основе отзыва):
 * 1. (REVERT) Логика Шага 7 (чекбоксы в Компании/Физлица) ОТМЕНЕНА.
 * 2. (RESTORE) Восстановлена логика Шага 4: Редактор "Мои Счета" снова содержит <select>
 * для "Компании" и "Физлица" с взаимным исключением.
 * 3. (STYLE-FIX) Восстановлен `transform: translateY(-5px);` для `.delete-btn`.
 * 4. (STYLE-FIX) Скорректированы стили SVG внутри `.delete-btn` для лучшего вида.
 */

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true }
});
const emit = defineEmits(['close', 'save']);

const mainStore = useMainStore();
const localItems = ref([]);

// Определяем путь для API
let entityPath = '';
const t = props.title.toLowerCase();
if (t.includes('счета')) entityPath = 'accounts';
else if (t.includes('компании')) entityPath = 'companies';
else if (t.includes('контрагент')) entityPath = 'contractors';
else if (t.includes('проекты')) entityPath = 'projects';
else if (t.includes('категор')) entityPath = 'categories';
else if (t.includes('физлиц')) entityPath = 'individuals'; 

const isAccountEditor = props.title === 'Редактировать счета';
const isContractorEditor = props.title === 'Редактировать контрагентов';
// (Логика 'isCompanyEditor' / 'isIndividualEditor' больше не нужна для UI)

const formatNumber = (numStr) => {
  const clean = `${numStr}`.replace(/[^0-9]/g, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const onAmountInput = (item) => {
  const rawValue = String(item.initialBalanceFormatted).replace(/[^0-9]/g, '');
  item.initialBalanceFormatted = formatNumber(rawValue);
  item.initialBalance = Number(rawValue) || 0;
};

// 🟢 Восстановлена логика onMounted из Шага 4
onMounted(() => {
  localItems.value = JSON.parse(JSON.stringify(props.items)).map(item => {
    
    // Режим "Счета": (Логика Шага 4)
    if (isAccountEditor) {
        const balance = item.initialBalance || 0;
        const cId = (item.companyId && typeof item.companyId === 'object') ? item.companyId._id : item.companyId;
        const iId = (item.individualId && typeof item.individualId === 'object') ? item.individualId._id : item.individualId;
        return { 
            ...item, 
            initialBalance: balance, 
            initialBalanceFormatted: formatNumber(balance), 
            companyId: cId || null,
            individualId: iId || null
        }
    }
    
    // Режим "Контрагенты": (Без изменений)
    if (isContractorEditor) {
        const pId = (item.defaultProjectId && typeof item.defaultProjectId === 'object') ? item.defaultProjectId._id : item.defaultProjectId;
        const cId = (item.defaultCategoryId && typeof item.defaultCategoryId === 'object') ? item.defaultCategoryId._id : item.defaultCategoryId;
        return { ...item, defaultProjectId: pId || null, defaultCategoryId: cId || null }
    }
    
    // Другие редакторы (Компании, Физлица, Проекты...)
    return item;
  });
});

// 🟢 Восстановлена логика handleSave из Шага 4
const handleSave = () => {
  const itemsToSave = localItems.value.map((item, index) => {
    // Базовые данные
    const data = { _id: item._id, name: item.name, order: index };
    
    // Данные для "Счетов"
    if (isAccountEditor) { 
      data.initialBalance = item.initialBalance || 0; 
      data.companyId = item.companyId || null; 
      data.individualId = item.individualId || null;
    }
    
    // Данные для "Контрагентов"
    if (isContractorEditor) { 
      data.defaultProjectId = item.defaultProjectId || null; 
      data.defaultCategoryId = item.defaultCategoryId || null; 
    }
    
    return data;
  });
  
  // Отправляем ОДНО сохранение (Шаг 7 отменен)
  emit('save', itemsToSave);
};


// --- ЛОГИКА УДАЛЕНИЯ (Без изменений) ---
const itemToDelete = ref(null);
const showDeletePopup = ref(false);
const isDeleting = ref(false);

const openDeleteDialog = (item) => {
  itemToDelete.value = item;
  showDeletePopup.value = true;
};

const confirmDelete = async (deleteOperations) => {
  if (!itemToDelete.value || !entityPath) return;
  isDeleting.value = true;
  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    await mainStore.deleteEntity(entityPath, itemToDelete.value._id, deleteOperations);
    localItems.value = localItems.value.filter(i => i._id !== itemToDelete.value._id);
    showDeletePopup.value = false;
    itemToDelete.value = null;
  } catch (e) {
    alert('Ошибка при удалении: ' + e.message);
  } finally {
    isDeleting.value = false;
  }
};

const cancelDelete = () => {
  if (isDeleting.value) return;
  showDeletePopup.value = false;
  itemToDelete.value = null;
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    
    <!-- 🟢 Восстановлен 'wider' для isAccountEditor -->
    <div class="popup-content" :class="{ 'wide': isContractorEditor, 'wider': isAccountEditor }">
      <h3>{{ title }}</h3>
      <p class="editor-hint">Перетащите для сортировки. Нажмите на корзину для удаления.</p>
      
      <!-- 
        // =================================================================
        // --- 🟢 Восстановлены Заголовки из Шага 4 ---
        // =================================================================
      -->
      
      <!-- Режим "Счета" (с Физлицом) -->
      <div v-if="isAccountEditor" class="editor-header account-header">
        <span class="header-name">Название счета</span>
        <span class="header-company">Компания</span>
        <span class="header-individual">Физлицо</span>
        <span class="header-balance">Нач. баланс</span>
        <span class="header-trash"></span> 
      </div>
      
      <!-- Режим "Контрагенты" (Без изменений) -->
      <div v-else-if="isContractorEditor" class="editor-header contractor-header">
        <span class="header-name">Название</span>
        <span class="header-project">Проект</span>
        <span class="header-category">Категория</span>
        <span class="header-trash"></span>
      </div>
      
      <!-- Режим (Компании, Физлица, Проекты...) -->
      <div v-else class="editor-header default-header">
         <span class="header-name">Название</span>
         <span class="header-trash"></span>
      </div>
      
      <!-- 
        // =================================================================
        // --- 🟢 Восстановлен Список Draggable из Шага 4 ---
        // =================================================================
      -->
      <div class="list-editor">
        <draggable 
          v-model="localItems" 
          item-key="_id" 
          handle=".drag-handle"
          ghost-class="ghost"
        >
          <template #item="{ element: item }">
            <!-- Обертка 'list-item-container' из Шага 7 УДАЛЕНА -->
            <div class="edit-item">
              <span class="drag-handle">⠿</span>
              
              <input type="text" v-model="item.name" class="edit-input edit-name" />
              
              <!-- Режим "Счета" (Логика Шага 4) -->
              <template v-if="isAccountEditor">
                <select v-model="item.companyId" class="edit-input edit-company" @change="item.individualId = null">
                  <option :value="null">Без компании</option>
                  <option v-for="comp in mainStore.companies" :key="comp._id" :value="comp._id">{{ comp.name }}</option>
                </select>
                
                <select v-model="item.individualId" class="edit-input edit-individual" @change="item.companyId = null">
                  <option :value="null">Без физлица</option>
                  <option v-for="ind in mainStore.individuals" :key="ind._id" :value="ind._id">{{ ind.name }}</option>
                </select>
                
                <input type="text" inputmode="decimal" v-model="item.initialBalanceFormatted" @input="onAmountInput(item)" class="edit-input edit-balance" placeholder="0" />
              </template>
              
              <!-- Режим "Контрагенты" (Без изменений) -->
              <template v-if="isContractorEditor">
                <select v-model="item.defaultProjectId" class="edit-input edit-project">
                  <option :value="null">Без проекта</option>
                  <option v-for="p in mainStore.projects" :key="p._id" :value="p._id">{{ p.name }}</option>
                </select>
                <select v-model="item.defaultCategoryId" class="edit-input edit-category">
                  <option :value="null">Без категории</option>
                  <option v-for="c in mainStore.categories" :key="c._id" :value="c._id">{{ c.name }}</option>
                </select>
              </template>
              
              <!-- (Чекбоксы из Шага 7 УДАЛЕНЫ) -->
              
              <!-- КНОПКА УДАЛЕНИЯ -->
              <button class="delete-btn" @click="openDeleteDialog(item)" title="Удалить">
                <!-- 🟢 СТИЛЬ-ФИКС: SVG без width/height -->
                <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                   <polyline points="3 6 5 6 21 6"></polyline>
                   <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
              
            </div>
          </template>
        </draggable>
      </div>
          
      <div class="popup-actions">
        <button @click="handleSave" class="btn-submit btn-submit-edit">Сохранить изменения</button>
      </div>
    </div>

    <!-- ВСТРОЕННЫЙ МОДАЛ ПОДТВЕРЖДЕНИЯ + ПРОГРЕСС (Без изменений) -->
    <div v-if="showDeletePopup" class="inner-overlay" @click.self="cancelDelete">
      <div class="delete-confirm-box">
        
        <div v-if="isDeleting" class="deleting-state">
          <h4>Удаление...</h4>
          <p class="sub-note">Пожалуйста, подождите, обновляем данные.</p>
          <div class="progress-container">
            <div class="progress-bar"></div>
          </div>
        </div>

        <div v-else>
          <h4>Удаление сущности</h4>
          <p>
            Вы собираетесь удалить <strong>«{{ itemToDelete?.name }}»</strong>.<br>
            Что делать со связанными операциями?
          </p>
          
          <div class="delete-actions">
            <button class="btn-choice btn-keep" @click="confirmDelete(false)">
              <span class="main-text">Только сущность</span>
              <span class="sub-text">Операции останутся (связь исчезнет)</span>
            </button>
            
            <button class="btn-choice btn-nuke" @click="confirmDelete(true)">
              <span class="main-text">Сущность + Операции</span>
              <span class="sub-text">Удалится всё безвозвратно</span>
            </button>
          </div>
          
          <button class="btn-cancel" @click="cancelDelete">Отмена</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.popup-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex; justify-content: center; align-items: center;
  z-index: 1000; overflow-y: auto;
}
.popup-content {
  max-width: 580px; 
  background: #F4F4F4; padding: 2rem; border-radius: 12px;
  color: #1a1a1a; width: 100%;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem;
  transition: max-width 0.2s ease;
}
/* 🟢 Восстановлен 'wider' для isAccountEditor */
.popup-content.wide { max-width: 680px; }
.popup-content.wider { max-width: 780px; }

h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 1.5rem; text-align: left; font-size: 22px; font-weight: 600; }
.popup-actions { display: flex; margin-top: 2rem; }
.btn-submit {
  width: 100%; height: 50px; padding: 0 1rem;
  color: white; border: none; border-radius: 8px;
  font-size: 16px; font-weight: 600; cursor: pointer;
  transition: background-color 0.2s ease;
}
.btn-submit-edit { background-color: #222222; }
.btn-submit-edit:hover { background-color: #444444; }

.editor-hint { font-size: 0.9em; color: #666; text-align: center; margin-top: -10px; margin-bottom: 1rem; }

/* 🟢 Восстановлены Заголовки из Шага 4 */
.editor-header { display: flex; align-items: flex-end; gap: 10px; font-size: 0.8em; color: #666; margin-left: 32px; margin-bottom: 5px; margin-right: 12px }
.header-name { flex-grow: 1; }

.account-header .header-company { flex-shrink: 0; width: 130px; }
.account-header .header-individual { flex-shrink: 0; width: 130px; }
.account-header .header-balance { flex-shrink: 0; width: 100px; text-align: right; padding-right: 14px; }

.contractor-header .header-project { flex-shrink: 0; width: 150px; }
.contractor-header .header-category { flex-shrink: 0; width: 150px; }
.header-trash { width: 48px; flex-shrink: 0; }
/* --- */


.list-editor { max-height: 400px; overflow-y: auto; padding-right: 5px; scrollbar-width: none; -ms-overflow-style: none; }
.list-editor::-webkit-scrollbar { display: none; }

/* 🟢 Убрана обертка list-item-container */
.edit-item { 
  display: flex; 
  align-items: center; 
  margin-bottom: 10px; /* Восстановлен margin-bottom */
  gap: 10px; 
}
.drag-handle { cursor: grab; font-size: 1.5em; color: #999; user-select: none; flex-shrink: 0; width: 22px; padding-top: 10px; }
.edit-item:active { cursor: grabbing; }

.edit-input {
  height: 48px; padding: 0 14px; background: #FFFFFF;
  border: 1px solid #E0E0E0; border-radius: 8px;
  color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box;
}
.edit-input:focus { outline: none; border-color: #222222; box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.2); }
.edit-name { flex-grow: 1; min-width: 100px; }

/* 🟢 Восстановлены стили для .edit-company и .edit-individual (Логика Шага 4) */
.edit-company, .edit-project, .edit-category, .edit-individual {
  flex-shrink: 0;
  -webkit-appearance: none; -moz-appearance: none; appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.41 0.589844L6 5.16984L10.59 0.589844L12 2.00019L6 8.00019L0 2.00019L1.41 0.589844Z' fill='%23333'%3E%3C/path%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 14px center; padding-right: 40px;
}
.edit-company { width: 130px; }
.edit-individual { width: 130px; }
.edit-project, .edit-category { width: 150px; }
.edit-balance { flex-shrink: 0; width: 100px; text-align: right; }

/* // =================================================================
// --- 🟢 СТИЛЬ-ФИКС: Кнопка "Удалить" (по вашему запросу) ---
// =================================================================
*/
.delete-btn {
  width: 48px;
  height: 48px; 
  flex-shrink: 0;
  border: 1px solid #E0E0E0; background: #fff;
  border-radius: 8px; 
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.2s;
  padding: 10px; /* 🟢 NEW: Добавлен padding, чтобы SVG был меньше кнопки */
  
  /* 🟢 СТИЛЬ-ФИКС: Восстановлен transform (как в оригинальном файле) */
  transform: translateY(-5px);
}
.delete-btn svg {
  /* 🟢 СТИЛЬ-ФИКС: SVG теперь растягивается на доступное место (с padding) */
  width: 100%;
  height: 100%;
  stroke: #999;
  transition: stroke 0.2s;
}
.delete-btn:hover { 
  border-color: #FF3B30; background: #fff5f5; 
}
.delete-btn:hover svg {
  stroke: #FF3B30;
}

.ghost { opacity: 0.5; background: #c0c0c0; }

/* 🟢 Чекбоксы из Шага 7 УДАЛЕНЫ */

/* ВНУТРЕННИЙ МОДАЛ (Overlay внутри Overlay) */
.inner-overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.3);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  z-index: 10;
}
.delete-confirm-box {
  background: #fff; padding: 20px; border-radius: 12px;
  width: 90%; max-width: 400px;
  box-shadow: 0 5px 20px rgba(0,0,0,0.2);
  text-align: center;
}
.delete-confirm-box h4 { margin: 0 0 10px; color: #222; font-size: 18px; }
.delete-confirm-box p { color: #555; font-size: 14px; margin-bottom: 20px; line-height: 1.4; }

.delete-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; }

.btn-choice {
  border: 1px solid #ddd; border-radius: 8px; background: #fff;
  padding: 12px; cursor: pointer; text-align: left;
  display: flex; flex-direction: column;
  transition: border-color 0.2s, background 0.2s;
}
.btn-choice:hover { border-color: #aaa; background: #f9f9f9; }
.btn-choice .main-text { font-weight: 600; color: #333; font-size: 15px; margin-bottom: 2px; }
.btn-choice .sub-text { font-size: 12px; color: #888; }

.btn-nuke:hover { border-color: #FF3B30; background: #FFF0F0; }
.btn-nuke .main-text { color: #FF3B30; }

.btn-cancel { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; text-decoration: underline; }
.btn-cancel:hover { color: #555; }

/* ПРОГРЕСС БАР */
.deleting-state { display: flex; flex-direction: column; align-items: center; padding: 1rem 0; }
.sub-note { font-size: 13px; color: #888; margin-top: -5px; margin-bottom: 20px; }
.progress-container {
  width: 100%; height: 6px; background-color: #eee; border-radius: 3px;
  overflow: hidden; position: relative;
}
.progress-bar {
  width: 100%; height: 100%; background-color: #222;
  position: absolute; left: -100%;
  animation: indeterminate 1.5s infinite ease-in-out;
}
@keyframes indeterminate {
  0% { left: -100%; width: 50%; }
  50% { left: 25%; width: 50%; }
  100% { left: 100%; width: 50%; }
}
</style>
