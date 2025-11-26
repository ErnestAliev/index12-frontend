<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import AccountPickerModal from './AccountPickerModal.vue';
import MultiSelectModal from './MultiSelectModal.vue'; 

/**
 * * --- МЕТКА ВЕРСИИ: v26.11.16 - HIDE RETAIL & DEBT IN LIST ---
 * * ВЕРСИЯ: 26.11.16 - Скрытие "Розничные клиенты" и "Остаток долга" в списке
 * * ДАТА: 2025-11-26
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (LOGIC) В фильтре onMounted добавлена проверка на имя "остаток долга" (категории).
 */

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true }
});
const emit = defineEmits(['close', 'save']);

const mainStore = useMainStore();
const localItems = ref([]); // Для всех кроме физлиц
const ownerItems = ref([]); // Для физлиц-владельцев
const otherItems = ref([]); // Для остальных физлиц

// --- Логика выбора (AccountPicker старый + MultiSelect новый) ---
const showAccountPicker = ref(false);
const showMultiSelect = ref(false); 
const currentItemForPicker = ref(null);
const multiSelectType = ref(''); // 'projects' | 'categories'

// Открытие старого пикера счетов (для компаний)
const openAccountPicker = (item) => {
  currentItemForPicker.value = item;
  showAccountPicker.value = true;
};
const onAccountPickerSave = (newSelectedIds) => {
  if (currentItemForPicker.value) {
    currentItemForPicker.value.selectedAccountIds = newSelectedIds;
  }
  showAccountPicker.value = false;
  currentItemForPicker.value = null;
};

// Открытие нового мульти-селекта (для контрагентов и физлиц - проекты/категории)
const openMultiSelect = (item, type) => {
  currentItemForPicker.value = item;
  multiSelectType.value = type;
  showMultiSelect.value = true;
};

const onMultiSelectSave = (newIds) => {
  if (currentItemForPicker.value) {
    if (multiSelectType.value === 'projects') {
      currentItemForPicker.value.selectedProjectIds = newIds;
    } else if (multiSelectType.value === 'categories') {
      currentItemForPicker.value.selectedCategoryIds = newIds;
    }
  }
  showMultiSelect.value = false;
  currentItemForPicker.value = null;
};

// 🟢 Данные для мульти-селекта
const multiSelectTitle = computed(() => {
  const contractorName = currentItemForPicker.value?.name || '';
  const styledName = `<span style="color: #000000; font-weight: 800;">"${contractorName}"</span>`;
  
  if (multiSelectType.value === 'projects') {
      return `Выберите Проекты для ${styledName}`;
  }
  if (multiSelectType.value === 'categories') {
      return `Выберите Категории для ${styledName}`;
  }
  return '';
});

const multiSelectItems = computed(() => {
  if (multiSelectType.value === 'projects') return mainStore.projects || [];
  if (multiSelectType.value === 'categories') return mainStore.categories || [];
  return [];
});
const multiSelectInitialIds = computed(() => {
  if (!currentItemForPicker.value) return [];
  if (multiSelectType.value === 'projects') return currentItemForPicker.value.selectedProjectIds || [];
  if (multiSelectType.value === 'categories') return currentItemForPicker.value.selectedCategoryIds || [];
  return [];
});


// Определяем тип сущности
let entityPath = '';
const t = props.title.toLowerCase();
if (t.includes('счета')) entityPath = 'accounts';
else if (t.includes('компании')) entityPath = 'companies';
else if (t.includes('контрагент')) entityPath = 'contractors';
else if (t.includes('проекты')) entityPath = 'projects';
else if (t.includes('категор')) entityPath = 'categories';
else if (t.includes('физлиц')) entityPath = 'individuals';

const isAccountEditor = props.title.includes('счета');
const isContractorEditor = props.title.includes('контрагентов');
const isCompanyEditor = props.title.includes('компании');
const isIndividualEditor = props.title.includes('Физлиц');
const isProjectEditor = props.title.includes('проекты');
const isCategoryEditor = props.title.includes('категории');

// 🟢 Флаг для отображения пикеров Проектов/Категорий
const showDefaultsPickers = computed(() => isContractorEditor || isIndividualEditor);

// Название сущности для кнопки
let entityNameSingular = 'объект';
if (isAccountEditor) entityNameSingular = 'счет';
else if (isCompanyEditor) entityNameSingular = 'компанию';
else if (isContractorEditor) entityNameSingular = 'контрагента';
else if (isProjectEditor) entityNameSingular = 'проект';
else if (isCategoryEditor) entityNameSingular = 'категорию';
else if (isIndividualEditor) entityNameSingular = 'физлицо';

// Динамический текст подсказки с HTML для цвета
const pickerHintText = computed(() => {
    const name = currentItemForPicker.value?.name || '...';
    const coloredName = `<span style="color: var(--color-primary); font-weight: 600;">${name}</span>`;
    
    if (isCompanyEditor) return `Привяжите ${coloredName} к вашим счетам.`;
    return "";
});

// Опции владельцев (для счетов)
const companiesList = computed(() => mainStore.companies || []);
const individualsList = computed(() => mainStore.individuals || []);

// --- ЛОГИКА СОЗДАНИЯ ВЛАДЕЛЬЦА "НА ЛЕТУ" ---
const showCreateOwnerPopup = ref(false);
const ownerTypeToCreate = ref('company');
const newOwnerNameInput = ref('');
const pendingAccountItem = ref(null);
const newOwnerInputRef = ref(null);
const isSavingOwner = ref(false);

const handleOwnerSelectChange = (item) => {
  const val = item.ownerValue;
  if (val === 'create-company') {
    item.ownerValue = null;
    openCreateOwnerModal('company', item);
  } else if (val === 'create-individual') {
    item.ownerValue = null;
    openCreateOwnerModal('individual', item);
  }
};

const openCreateOwnerModal = (type, item) => {
  ownerTypeToCreate.value = type;
  pendingAccountItem.value = item;
  newOwnerNameInput.value = '';
  showCreateOwnerPopup.value = true;
  nextTick(() => {
    if (newOwnerInputRef.value) newOwnerInputRef.value.focus();
  });
};

const cancelCreateOwner = () => {
  showCreateOwnerPopup.value = false;
  newOwnerNameInput.value = '';
  pendingAccountItem.value = null;
};

const saveNewOwner = async () => {
  const name = newOwnerNameInput.value.trim();
  if (!name) return;
  isSavingOwner.value = true;
  try {
    let newItem = null;
    const type = ownerTypeToCreate.value;
    if (type === 'company') { newItem = await mainStore.addCompany(name); } 
    else { newItem = await mainStore.addIndividual(name); }

    if (newItem && pendingAccountItem.value) {
      pendingAccountItem.value.ownerValue = `${type}-${newItem._id}`;
    }
    cancelCreateOwner();
  } catch (e) { console.error(e); alert('Ошибка создания: ' + e.message); } 
  finally { isSavingOwner.value = false; }
};

// --- ЛОГИКА СОЗДАНИЯ СУЩНОСТИ (ВЕРХНЯЯ ПАНЕЛЬ) ---
const isCreating = ref(false);
const newItemName = ref('');
const newItemInputRef = ref(null);
const isSavingNew = ref(false);

const startCreation = () => {
  isCreating.value = true;
  newItemName.value = '';
  nextTick(() => { if (newItemInputRef.value) newItemInputRef.value.focus(); });
};
const cancelCreation = () => { isCreating.value = false; newItemName.value = ''; };

const handleCreateNew = async () => {
  const name = newItemName.value.trim(); if (!name) return;
  isSavingNew.value = true;
  try {
    let newItem = null;
    if (isAccountEditor) newItem = await mainStore.addAccount(name);
    else if (isCompanyEditor) newItem = await mainStore.addCompany(name);
    else if (isContractorEditor) newItem = await mainStore.addContractor(name);
    else if (isProjectEditor) newItem = await mainStore.addProject(name);
    else if (isCategoryEditor) newItem = await mainStore.addCategory(name);
    else if (isIndividualEditor) newItem = await mainStore.addIndividual(name);

    if (newItem) {
      const mappedItem = { ...newItem };
      if (isAccountEditor) { mappedItem.initialBalance = 0; mappedItem.initialBalanceFormatted = '0'; mappedItem.ownerValue = null; }
      
      if (isContractorEditor || isIndividualEditor) { 
          mappedItem.defaultProjectId = null; 
          mappedItem.defaultCategoryId = null; 
          mappedItem.selectedProjectIds = []; 
          mappedItem.selectedCategoryIds = []; 
      } 
      
      if (isCompanyEditor) { mappedItem.selectedAccountIds = []; }

      // Если это физлицо - добавляем в список "Остальные"
      if (isIndividualEditor) {
        otherItems.value.push(mappedItem);
      } else {
        localItems.value.push(mappedItem);
      }
      
      cancelCreation();
    }
  } catch (e) { console.error(e); alert('Ошибка при создании: ' + e.message); } 
  finally { isSavingNew.value = false; }
};

const formatNumber = (numStr) => {
  const clean = `${numStr}`.replace(/[^0-9]/g, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const onAmountInput = (item) => {
  const rawValue = String(item.initialBalanceFormatted).replace(/[^0-9]/g, '');
  item.initialBalanceFormatted = formatNumber(rawValue);
  item.initialBalance = Number(rawValue) || 0;
};

onMounted(() => {
  const allAccounts = mainStore.accounts;
  let rawItems = JSON.parse(JSON.stringify(props.items));
  
  // 🟢 FIX: Скрываем системные сущности из списка
  rawItems = rawItems.filter(item => {
      const name = item.name.trim().toLowerCase();
      
      // Скрываем "Розница" и "Розничные клиенты" в физлицах
      if (isIndividualEditor) {
          if (mainStore.retailIndividualId && item._id === mainStore.retailIndividualId) return false;
          if (name === 'розница' || name === 'розничные клиенты') return false;
      }
      
      // Скрываем "Реализация" и "Остаток долга" в категориях
      if (isCategoryEditor) {
          if (name === 'реализация') return false;
          if (name === 'остаток долга') return false;
      }
      return true;
  });

  rawItems.sort((a, b) => (a.order || 0) - (b.order || 0));

  // Предобработка элементов
  const processedItems = rawItems.map(item => {
    if (isAccountEditor) {
      const balance = item.initialBalance || 0;
      let ownerVal = null;
      const cId = (item.companyId && typeof item.companyId === 'object') ? item.companyId._id : item.companyId;
      const iId = (item.individualId && typeof item.individualId === 'object') ? item.individualId._id : item.individualId;
      if (cId) ownerVal = `company-${cId}`;
      else if (iId) ownerVal = `individual-${iId}`;
      return { ...item, initialBalance: balance, initialBalanceFormatted: formatNumber(balance), ownerValue: ownerVal }
    }
    
    if (isContractorEditor || isIndividualEditor) {
      let pIds = item.defaultProjectIds || [];
      if (!pIds.length && item.defaultProjectId) {
          const pId = (typeof item.defaultProjectId === 'object') ? item.defaultProjectId._id : item.defaultProjectId;
          if(pId) pIds.push(pId);
      }

      let cIds = item.defaultCategoryIds || [];
      if (!cIds.length && item.defaultCategoryId) {
          const cId = (typeof item.defaultCategoryId === 'object') ? item.defaultCategoryId._id : item.defaultCategoryId;
          if(cId) cIds.push(cId);
      }
      
      return { 
          ...item, 
          selectedProjectIds: pIds,
          selectedCategoryIds: cIds
      };
    }

    if (isCompanyEditor) {
      const selectedAccountIds = allAccounts.filter(a => (a.companyId?._id || a.companyId) === item._id).map(a => a._id);
      return { ...item, selectedAccountIds: selectedAccountIds };
    }
    
    return item;
  });

  // 🟢 Разделение списков для физлиц
  if (isIndividualEditor) {
      const ownerIds = new Set();
      mainStore.accounts.forEach(acc => {
          if (acc.individualId) {
              const iId = (typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
              if (iId) ownerIds.add(iId);
          }
      });
      
      ownerItems.value = processedItems.filter(item => ownerIds.has(item._id));
      otherItems.value = processedItems.filter(item => !ownerIds.has(item._id));
  } else {
      localItems.value = processedItems;
  }
});

const handleSave = async () => {
  // Собираем все элементы (для физлиц - из двух списков)
  const finalItems = isIndividualEditor 
    ? [...ownerItems.value, ...otherItems.value]
    : localItems.value;

  const itemsToSave = finalItems.map((item, index) => {
    const data = { _id: item._id, name: item.name, order: index };
    
    if (isAccountEditor) {
        data.initialBalance = item.initialBalance || 0;
        if (item.ownerValue) {
            const [type, id] = item.ownerValue.split('-');
            if (type === 'company') { data.companyId = id; data.individualId = null; } 
            else if (type === 'individual') { data.companyId = null; data.individualId = id; }
        } else { data.companyId = null; data.individualId = null; }
    }
    
    if (isContractorEditor || isIndividualEditor) { 
        data.defaultProjectIds = item.selectedProjectIds || [];
        data.defaultCategoryIds = item.selectedCategoryIds || [];
        data.defaultProjectId = data.defaultProjectIds[0] || null;
        data.defaultCategoryId = data.defaultCategoryIds[0] || null;
    }
    return data;
  });
  
  emit('save', itemsToSave);

  if (isCompanyEditor) {
    const accountsToUpdate = new Map();
    const allStoreAccounts = JSON.parse(JSON.stringify(mainStore.accounts));
    
    for (const ownerItem of localItems.value) {
      const ownerId = ownerItem._id;
      const newAccountIds = new Set(ownerItem.selectedAccountIds);
      
      for (const acc of allStoreAccounts) {
        const accId = acc._id;
        const isSelected = newAccountIds.has(accId);
        const currentCompanyOwner = acc.companyId?._id || acc.companyId;
        
        if (isSelected) {
          if (currentCompanyOwner !== ownerId) {
             acc.companyId = ownerId; acc.individualId = null;
             accountsToUpdate.set(accId, acc);
          }
        } else {
          if (currentCompanyOwner === ownerId) {
            acc.companyId = null; accountsToUpdate.set(accId, acc);
          }
        }
      }
    }
    const updates = Array.from(accountsToUpdate.values());
    if (updates.length > 0) await mainStore.batchUpdateEntities('accounts', updates);
  }
};

const itemToDelete = ref(null);
const showDeletePopup = ref(false);
const isDeleting = ref(false);

const openDeleteDialog = (item) => { itemToDelete.value = item; showDeletePopup.value = true; };
const confirmDelete = async (deleteOperations) => {
  if (!itemToDelete.value || !entityPath) return;
  isDeleting.value = true;
  try {
    await new Promise(resolve => setTimeout(resolve, 500)); 
    await mainStore.deleteEntity(entityPath, itemToDelete.value._id, deleteOperations);
    
    if (isIndividualEditor) {
        ownerItems.value = ownerItems.value.filter(i => i._id !== itemToDelete.value._id);
        otherItems.value = otherItems.value.filter(i => i._id !== itemToDelete.value._id);
    } else {
        localItems.value = localItems.value.filter(i => i._id !== itemToDelete.value._id);
    }
    
  } catch (e) { alert('Ошибка при удалении: ' + e.message); isDeleting.value = false; return; }
  isDeleting.value = false; await nextTick(); showDeletePopup.value = false; itemToDelete.value = null;
};
const cancelDelete = () => { if (isDeleting.value) return; showDeletePopup.value = false; itemToDelete.value = null; };
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content" :class="{ 'wide': isContractorEditor || isCompanyEditor || isIndividualEditor || isAccountEditor }">
      <h3>{{ title }}</h3>
      
      <div class="create-section">
        <button v-if="!isCreating" class="btn-add-new" @click="startCreation">
          + Создать {{ entityNameSingular }}
        </button>
        
        <div v-else class="inline-create-row">
           <input type="text" v-model="newItemName" :placeholder="`Название (${entityNameSingular})`" ref="newItemInputRef" class="create-input" @keyup.enter="handleCreateNew" @keyup.esc="cancelCreation" />
           <button class="btn-icon-save" @click="handleCreateNew" :disabled="isSavingNew">✓</button>
           <button class="btn-icon-cancel" @click="cancelCreation" :disabled="isSavingNew">✕</button>
        </div>
      </div>

      <!-- ЗАГОЛОВОК (ОБЩИЙ ИЛИ СКРЫТ ДЛЯ ФИЗЛИЦ) -->
      <template v-if="!isIndividualEditor && localItems.length > 0">
        <div v-if="isAccountEditor" class="editor-header account-header-simple">
          <span class="header-name">Название счета</span>
          <span class="header-owner">Владелец</span>
          <span class="header-balance">Нач. баланс</span>
          <span class="header-trash"></span>
        </div>
        <div v-else-if="isCompanyEditor" class="editor-header owner-header">
          <span class="header-name">Название Компании</span>
          <span class="header-accounts">Привязанные счета</span>
          <span class="header-trash"></span>
        </div>
        <div v-else-if="isContractorEditor" class="editor-header contractor-header">
          <span class="header-name">Название</span>
          <span class="header-project">Проекты</span>
          <span class="header-category">Категории</span>
          <span class="header-trash"></span>
        </div>
        <div v-else class="editor-header default-header">
          <span class="header-name">Название</span>
          <span class="header-trash"></span>
        </div>
      </template>
      
      <div class="list-editor">
        <!-- 🟢 СПЕЦИАЛЬНЫЙ РЕЖИМ ДЛЯ ФИЗЛИЦ: ДВЕ ГРУППЫ -->
        <template v-if="isIndividualEditor">
            <!-- Группа 1: Владельцы -->
            <div v-if="ownerItems.length > 0" class="group-section">
                <div class="group-title">Владельцы счетов (Привязка через счета)</div>
                <!-- Заголовок столбцов для владельцев -->
                 <div class="editor-header contractor-header small-header">
                    <span class="header-name">Имя</span>
                    <span class="header-project">Проекты</span>
                    <span class="header-category">Категории</span>
                    <span class="header-trash"></span>
                </div>
                
                <draggable v-model="ownerItems" item-key="_id" handle=".drag-handle" ghost-class="ghost">
                    <template #item="{ element: item }">
                        <div class="edit-item">
                            <span class="drag-handle">⠿</span>
                            <input type="text" v-model="item.name" class="edit-input edit-name" />
                            <button type="button" class="edit-input edit-picker-btn" @click="openMultiSelect(item, 'projects')">
                                {{ item.selectedProjectIds.length ? `Проекты (${item.selectedProjectIds.length})` : 'Нет' }}
                            </button>
                            <button type="button" class="edit-input edit-picker-btn" @click="openMultiSelect(item, 'categories')">
                                {{ item.selectedCategoryIds.length ? `Категории (${item.selectedCategoryIds.length})` : 'Нет' }}
                            </button>
                            <button class="delete-btn" @click="openDeleteDialog(item)" title="Удалить">
                                <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </template>
                </draggable>
            </div>

            <!-- Группа 2: Остальные -->
            <div class="group-section">
                <div class="group-title">Физлица (Контрагенты)</div>
                 <div class="editor-header contractor-header small-header">
                    <span class="header-name">Имя</span>
                    <span class="header-project">Проекты</span>
                    <span class="header-category">Категории</span>
                    <span class="header-trash"></span>
                </div>
                <div v-if="otherItems.length === 0" class="empty-list">Нет контрагентов</div>

                <draggable v-model="otherItems" item-key="_id" handle=".drag-handle" ghost-class="ghost">
                    <template #item="{ element: item }">
                        <div class="edit-item">
                            <span class="drag-handle">⠿</span>
                            <input type="text" v-model="item.name" class="edit-input edit-name" />
                            <button type="button" class="edit-input edit-picker-btn" @click="openMultiSelect(item, 'projects')">
                                {{ item.selectedProjectIds.length ? `Проекты (${item.selectedProjectIds.length})` : 'Нет' }}
                            </button>
                            <button type="button" class="edit-input edit-picker-btn" @click="openMultiSelect(item, 'categories')">
                                {{ item.selectedCategoryIds.length ? `Категории (${item.selectedCategoryIds.length})` : 'Нет' }}
                            </button>
                            <button class="delete-btn" @click="openDeleteDialog(item)" title="Удалить">
                                <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </template>
                </draggable>
            </div>
        </template>

        <!-- ОБЫЧНЫЙ РЕЖИМ (НЕ ФИЗЛИЦА) -->
        <draggable v-else v-model="localItems" item-key="_id" handle=".drag-handle" ghost-class="ghost">
          <template #item="{ element: item }">
            <div class="edit-item">
              <span class="drag-handle">⠿</span>
              <input type="text" v-model="item.name" class="edit-input edit-name" />
              
              <template v-if="isAccountEditor">
                <select v-model="item.ownerValue" @change="handleOwnerSelectChange(item)" class="edit-input edit-owner">
                    <option :value="null">Нет владельца</option>
                    <option value="create-company" class="create-option">+ Создать Компанию</option>
                    <option value="create-individual" class="create-option">+ Создать Физлицо</option>
                    <optgroup label="Компании"><option v-for="c in companiesList" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option></optgroup>
                    <optgroup label="Физлица"><option v-for="i in individualsList" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option></optgroup>
                </select>
                <input type="text" inputmode="decimal" v-model="item.initialBalanceFormatted" @input="onAmountInput(item)" @focus="$event.target.select()" class="edit-input edit-balance" placeholder="0" />
              </template>
              
              <!-- Пикеры для Контрагентов (не физлиц) -->
              <template v-if="isContractorEditor">
                <button type="button" class="edit-input edit-picker-btn" @click="openMultiSelect(item, 'projects')">
                   {{ item.selectedProjectIds.length ? `Проекты (${item.selectedProjectIds.length})` : 'Нет' }}
                </button>
                <button type="button" class="edit-input edit-picker-btn" @click="openMultiSelect(item, 'categories')">
                   {{ item.selectedCategoryIds.length ? `Категории (${item.selectedCategoryIds.length})` : 'Нет' }}
                </button>
              </template>

              <template v-if="isCompanyEditor">
                <button type="button" class="edit-input edit-account-picker" @click="openAccountPicker(item)">
                  Выбрано ({{ item.selectedAccountIds.length }})
                </button>
              </template>
              
              <button class="delete-btn" @click="openDeleteDialog(item)" title="Удалить">
                <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </template>
        </draggable>
      </div>
      
      <div class="popup-actions">
        <button @click="handleSave" class="btn-submit btn-submit-edit">Сохранить изменения</button>
      </div>
    </div>

    <!-- ОСТАЛЬНОЙ КОД МОДАЛКИ БЕЗ ИЗМЕНЕНИЙ -->
    <div v-if="showDeletePopup" class="inner-overlay" @click.self="cancelDelete">
      <div class="delete-confirm-box">
        <div v-if="isDeleting" class="deleting-state">
          <h4>Удаление...</h4>
          <p class="sub-note">Пожалуйста, подождите, обновляем данные.</p>
          <div class="progress-container"><div class="progress-bar"></div></div>
        </div>
        <div v-else>
          <h4>Удаление сущности</h4>
          <p>Вы собираетесь удалить <strong>«{{ itemToDelete?.name }}»</strong>.<br>Что делать со связанными операциями?</p>
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

    <div v-if="showCreateOwnerPopup" class="inner-overlay" @click.self="cancelCreateOwner">
      <div class="create-owner-box">
        <h4>Новый владелец</h4>
        <p class="sub-text">
          Создание: <b>{{ ownerTypeToCreate === 'company' ? 'Компания' : 'Физлицо' }}</b>
        </p>
        <input 
          type="text" 
          v-model="newOwnerNameInput" 
          class="create-owner-input"
          placeholder="Введите название"
          ref="newOwnerInputRef"
          @keyup.enter="saveNewOwner"
          @keyup.esc="cancelCreateOwner"
        />
        <div class="owner-actions">
           <button class="btn-cancel" @click="cancelCreateOwner">Отмена</button>
           <button class="btn-save-owner" @click="saveNewOwner" :disabled="isSavingOwner">
             {{ isSavingOwner ? '...' : 'Создать' }}
           </button>
        </div>
      </div>
    </div>

    <AccountPickerModal
      v-if="showAccountPicker"
      :all-accounts="mainStore.accounts"
      :initial-selected-ids="currentItemForPicker ? currentItemForPicker.selectedAccountIds : []"
      :hint-text="pickerHintText"
      @close="showAccountPicker = false"
      @save="onAccountPickerSave"
    />

    <MultiSelectModal
      v-if="showMultiSelect"
      :title="multiSelectTitle"
      :items="multiSelectItems"
      :initial-selected-ids="multiSelectInitialIds"
      @close="showMultiSelect = false"
      @save="onMultiSelectSave"
    />
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { max-width: 580px; background: #F4F4F4; padding: 2rem; border-radius: 12px; color: #1a1a1a; width: 100%; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem; transition: max-width 0.2s ease; }
.popup-content.wide { max-width: 900px; }
h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 1.5rem; text-align: left; font-size: 22px; font-weight: 600; }
.popup-actions { display: flex; margin-top: 2rem; }
.btn-submit { width: 100%; height: 50px; padding: 0 1rem; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background-color 0.2s ease; }
.btn-submit-edit { padding: 0 16px; height: 28px; background: #111827; color: white; border: none; border-radius: 6px; font-weight: 600; border: none; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; width: 240px;}
.btn-submit-edit:hover { background-color: #444444; }
.create-section { margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #e0e0e0; }

/* 🟢 УНИФИКАЦИЯ UI: Высота 28px */
.btn-add-new { 
  width: 100%; padding: 0 12px; height: 28px; 
  border: 1px dashed #aaa; background-color: transparent; 
  border-radius: 6px; color: #555; font-size: 13px; 
  cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; 
}
.btn-add-new:hover { border-color: #222; color: #222; background-color: #e9e9e9; }

.inline-create-row { display: flex; gap: 8px; align-items: center; }
.create-input { flex-grow: 1; height: 28px; padding: 0 10px; background: #fff; border: 1px solid #222; border-radius: 6px; font-size: 13px; color: #1a1a1a; margin-bottom: 0 !important; }
.create-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(34,34,34,0.2); }

.btn-icon-save, .btn-icon-cancel { 
  width: 28px; height: 28px; border: none; border-radius: 6px; 
  cursor: pointer; color: #fff; font-size: 14px; 
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; 
}
.btn-icon-save { background-color: #34C759; }
.btn-icon-save:hover { background-color: #2da84e; }
.btn-icon-cancel { background-color: #FF3B30; }
.btn-icon-cancel:hover { background-color: #d63025; }

.editor-header { display: flex; align-items: flex-end; gap: 10px; font-size: 0.8em; color: #666; margin-left: 32px; margin-bottom: 5px; margin-right: 12px }
.header-name { flex-grow: 1; }
.account-header-simple .header-name { width: 100%; }
.account-header-simple .header-balance { flex-shrink: 0; width: 130px; text-align: right; padding-right: 14px; }
.account-header-simple .header-owner { flex-shrink: 0; width: 200px; }

.owner-header .header-accounts { flex-shrink: 0; width: 310px; }

.contractor-header .header-project { flex-shrink: 0; width: 200px; } 
.contractor-header .header-category { flex-shrink: 0; width: 200px; } 
.small-header { margin-left: 32px; margin-top: 5px; margin-bottom: 5px; }

.header-trash { width: 28px; flex-shrink: 0; }

.list-editor { max-height: 400px; overflow-y: auto; padding-right: 5px; scrollbar-width: none; -ms-overflow-style: none; }
.list-editor::-webkit-scrollbar { display: none; }
.edit-item { display: flex; align-items: center; margin-bottom: 6px; gap: 10px; }
.drag-handle { cursor: grab; font-size: 1.2em; color: #999; user-select: none; flex-shrink: 0; width: 22px; height: 28px; display: flex; align-items: center; justify-content: center; margin: 0; }
.edit-item:active { cursor: grabbing; }

/* 🟢 УНИФИКАЦИЯ UI: Высота 28px и шрифт 13px */
.edit-input { 
  height: 28px; padding: 0 10px; background: #FFFFFF; 
  border: 1px solid #E0E0E0; border-radius: 6px; 
  color: #1a1a1a; font-size: 13px; font-family: inherit; 
  box-sizing: border-box; margin: 0; 
}
.edit-input:focus { outline: none; border-color: #222222; box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.2); }
.edit-name { flex-grow: 1; min-width: 100px; }

.edit-picker-btn {
  flex-shrink: 0; width: 200px; 
  text-align: left; cursor: pointer; 
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center;
  padding-right: 20px;
  display: flex; align-items: center; 
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.edit-picker-btn:hover { border-color: #222; }

.edit-owner { flex-shrink: 0; width: 200px; -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.41 0.589844L6 5.16984L10.59 0.589844L12 2.00019L6 8.00019L0 2.00019L1.41 0.589844Z' fill='%23333'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 25px; }

.create-option { font-weight: 600; color: #007AFF; background-color: #f0f8ff; }

.edit-balance { flex-shrink: 0; width: 130px; text-align: right; }
.edit-account-picker { flex-shrink: 0; width: 310px; text-align: left; color: #333; cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.41 0.589844L6 5.16984L10.59 0.589844L12 2.00019L6 8.00019L0 2.00019L1.41 0.589844Z' fill='%23333'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 25px; font-size: 13px; display: flex; align-items: center; margin: 0; padding: 0 10px; height: 28px; background-color: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 6px; font-family: inherit; }
.edit-account-picker:hover { border-color: #222222; }

.delete-btn { 
  width: 28px; height: 28px; flex-shrink: 0; border: 1px solid #E0E0E0; background: #fff; 
  border-radius: 6px; display: flex; align-items: center; justify-content: center; 
  cursor: pointer; transition: all 0.2s; padding: 0; box-sizing: border-box; margin: 0; 
}
.delete-btn svg { width: 14px; height: 14px; stroke: #999; transition: stroke 0.2s; }
.delete-btn:hover { border-color: #FF3B30; background: #fff5f5; }
.delete-btn:hover svg { stroke: #FF3B30; }

.ghost { opacity: 0.5; background: #c0c0c0; }
.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 10; }
.delete-confirm-box { background: #fff; padding: 20px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 5px 20px rgba(0,0,0,0.2); text-align: center; }
.delete-confirm-box h4 { margin: 0 0 10px; color: #222; font-size: 18px; }
.delete-confirm-box p { color: #555; font-size: 14px; margin-bottom: 20px; line-height: 1.4; }
.delete-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; }
.btn-choice { border: 1px solid #ddd; border-radius: 8px; background: #fff; padding: 12px; cursor: pointer; text-align: left; display: flex; flex-direction: column; transition: border-color 0.2s, background 0.2s; }
.btn-choice:hover { border-color: #aaa; background: #f9f9f9; }
.btn-choice .main-text { font-weight: 600; color: #333; font-size: 15px; margin-bottom: 2px; }
.btn-choice .sub-text { font-size: 12px; color: #888; }
.btn-nuke:hover { border-color: #FF3B30; background: #FFF0F0; }
.btn-nuke .main-text { color: #FF3B30; }
.btn-cancel { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; text-decoration: underline; }
.btn-cancel:hover { color: #555; }
.deleting-state { display: flex; flex-direction: column; align-items: center; padding: 1rem 0; }
.sub-note { font-size: 13px; color: #888; margin-top: -5px; margin-bottom: 20px; }
.progress-container { width: 100%; height: 6px; background-color: #eee; border-radius: 3px; overflow: hidden; position: relative; }
.progress-bar { width: 100%; height: 100%; background-color: #222; position: absolute; left: -100%; animation: indeterminate 1.5s infinite ease-in-out; }
@keyframes indeterminate { 0% { left: -100%; width: 50%; } 50% { left: 25%; width: 50%; } 100% { left: 100%; width: 50%; } }

.create-owner-box { background: #fff; padding: 24px; border-radius: 12px; width: 90%; max-width: 350px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center; }
.create-owner-box h4 { margin: 0 0 10px; color: #222; font-size: 18px; }
.sub-text { font-size: 14px; color: #666; margin-bottom: 15px; }
.create-owner-input { 
  width: 100%; 
  height: 40px; 
  border: 1px solid #ccc; 
  border-radius: 6px; 
  padding: 0 10px; 
  font-size: 15px; 
  margin-bottom: 20px; 
  box-sizing: border-box; 
  background-color: #ffffff; 
  color: #1a1a1a;
}
.create-owner-input:focus { outline: none; border-color: #222; }
.owner-actions { display: flex; justify-content: space-between; align-items: center; }
.btn-save-owner { padding: 10px 20px; background-color: #34C759; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; }
.btn-save-owner:hover { background-color: #2da84e; }
.btn-save-owner:disabled { opacity: 0.7; cursor: wait; }

/* 🟢 Стили групп */
.group-section { margin-bottom: 25px; }
.group-title { font-size: 14px; font-weight: 600; color: #888; text-transform: uppercase; margin-bottom: 8px; padding-left: 36px; letter-spacing: 0.5px; }
.empty-list { padding: 20px; text-align: center; color: #999; font-style: italic; background: #fcfcfc; border: 1px dashed #ddd; border-radius: 8px; margin-left: 36px; }
</style>