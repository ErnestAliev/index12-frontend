<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
import { usePermissions } from '@/composables/usePermissions';
import AccountPickerModal from './AccountPickerModal.vue';
import MultiSelectModal from './MultiSelectModal.vue'; 

// 🟢 ИМПОРТ ДАННЫХ ДЛЯ АВТОПОДСТАНОВКИ
import { accountSuggestions } from '@/data/accountSuggestions.js';
import { categorySuggestions } from '@/data/categorySuggestions.js';
import { knownBanks } from '@/data/knownBanks.js';

/**
 * * --- МЕТКА ВЕРСИИ: v38.1 - EXCLUDED ACCOUNTS ROBUST SAVE ---
 * * ВЕРСИЯ: 38.1
 * * ДАТА: 2025-12-07
 * * ИЗМЕНЕНИЯ:
 * 1. (LOGIC) Усилена логика сохранения флага isExcluded.
 * 2. (UI) Область исключенных счетов теперь всегда видна в редакторе счетов.
 */

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true },
  entityType: { type: String, default: '' }, // 'accounts', 'companies', etc.
  widgetKey: { type: String, default: null } // Optional: corresponding widget key for dashboard toggle
});
const emit = defineEmits(['close', 'save']);

const mainStore = useMainStore();
const permissions = usePermissions();
const localItems = ref([]); 
const ownerItems = ref([]); 
const otherItems = ref([]); 

// 🟢 СПИСОК: Исключенные элементы (только для счетов)
const excludedItems = ref([]);

// --- Тип редактора ---
const titleLower = props.title.toLowerCase();
// Use prop if available, otherwise guess from title
const isAccountEditor = props.entityType === 'accounts' || titleLower.includes('счет');
const isContractorEditor = props.entityType === 'contractors' || titleLower.includes('контрагент');
const isCompanyEditor = props.entityType === 'companies' || titleLower.includes('компани');
const isIndividualEditor = props.entityType === 'individuals' || titleLower.includes('физлиц');
const isProjectEditor = props.entityType === 'projects' || titleLower.includes('проект');
const isCategoryEditor = props.entityType === 'categories' || titleLower.includes('категор');

let entityPath = props.entityType || '';
if (!entityPath) {
  const t = titleLower;
  if (t.includes('счет')) entityPath = 'accounts'; // Fixed from 'счета' to 'счет' to match 'счетов'
  else if (t.includes('компани')) entityPath = 'companies';
  else if (t.includes('контрагент')) entityPath = 'contractors';
  else if (t.includes('проект')) entityPath = 'projects';
  else if (t.includes('категор')) entityPath = 'categories';
  else if (t.includes('физлиц')) entityPath = 'individuals';
}

let entityNameSingular = 'объект';
if (isAccountEditor) entityNameSingular = 'счет';
else if (isCompanyEditor) entityNameSingular = 'компанию';
else if (isContractorEditor) entityNameSingular = 'контрагента';
else if (isProjectEditor) entityNameSingular = 'проект';
else if (isCategoryEditor) entityNameSingular = 'категорию';
else if (isIndividualEditor) entityNameSingular = 'физлицо';

// --- Логика выбора (AccountPicker + MultiSelect) ---
const showAccountPicker = ref(false);
const showMultiSelect = ref(false); 
const currentItemForPicker = ref(null);
const multiSelectType = ref('');

const openAccountPicker = (item) => { currentItemForPicker.value = item; showAccountPicker.value = true; };
const onAccountPickerSave = (newSelectedIds) => { 
  if (currentItemForPicker.value) { 
    currentItemForPicker.value.selectedAccountIds = newSelectedIds; 
  } 
  showAccountPicker.value = false; 
  currentItemForPicker.value = null; 
  debouncedSave(); // Auto-save after selection
};
const openMultiSelect = (item, type) => { currentItemForPicker.value = item; multiSelectType.value = type; showMultiSelect.value = true; };
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
  debouncedSave(); // Auto-save after selection
};

const multiSelectTitle = computed(() => {
  const contractorName = currentItemForPicker.value?.name || '';
  const styledName = `<span style="color: #000000; font-weight: 800;">"${contractorName}"</span>`;
  if (multiSelectType.value === 'projects') return `Выберите Проекты для ${styledName}`;
  if (multiSelectType.value === 'categories') return `Выберите Категории для ${styledName}`;
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
const pickerHintText = computed(() => {
    const name = currentItemForPicker.value?.name || '...';
    const coloredName = `<span style="color: var(--color-primary); font-weight: 600;">${name}</span>`;
    if (isCompanyEditor) return `Привяжите ${coloredName} к вашим счетам.`;
    return "";
});

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
  if (val === 'create-company') { item.ownerValue = null; openCreateOwnerModal('company', item); } 
  else if (val === 'create-individual') { item.ownerValue = null; openCreateOwnerModal('individual', item); }
};
const openCreateOwnerModal = (type, item) => { ownerTypeToCreate.value = type; pendingAccountItem.value = item; newOwnerNameInput.value = ''; showCreateOwnerPopup.value = true; nextTick(() => { if (newOwnerInputRef.value) newOwnerInputRef.value.focus(); }); };
const cancelCreateOwner = () => { showCreateOwnerPopup.value = false; newOwnerNameInput.value = ''; pendingAccountItem.value = null; };
const saveNewOwner = async () => {
  const name = newOwnerNameInput.value.trim(); if (!name) return; isSavingOwner.value = true;
  try {
    let newItem = null; const type = ownerTypeToCreate.value;
    if (type === 'company') { newItem = await mainStore.addCompany(name); } else { newItem = await mainStore.addIndividual(name); }
    if (newItem && pendingAccountItem.value) { pendingAccountItem.value.ownerValue = `${type}-${newItem._id}`; }
    cancelCreateOwner();
  } catch (e) { console.error(e); alert('Ошибка создания: ' + e.message); } 
  finally { isSavingOwner.value = false; }
};

// --- ЛОГИКА СОЗДАНИЯ СУЩНОСТИ ---
const isCreating = ref(false);
const newItemName = ref('');
const newItemInputRef = ref(null);
const isSavingNew = ref(false);

// 🟢 АВТОПОДСТАНОВКА
const showSuggestions = ref(false);
const isProgrammaticUpdate = ref(false); // Флаг

const suggestionsList = computed(() => {
    const query = newItemName.value.trim().toLowerCase();
    if (query.length < 2) return [];
    
    let sourceData = [];
    if (isAccountEditor) sourceData = accountSuggestions;
    else if (isCategoryEditor) sourceData = categorySuggestions;
    else if (isContractorEditor) sourceData = knownBanks; // Контрагенты часто банки/организации
    else return [];

    return sourceData.filter(item => {
        const nameMatch = item.name.toLowerCase().includes(query);
        const keywordMatch = item.keywords && item.keywords.some(k => k.toLowerCase().includes(query));
        return nameMatch || keywordMatch;
    }).slice(0, 4);
});

const selectSuggestion = (item) => {
    isProgrammaticUpdate.value = true;
    newItemName.value = item.name;
    showSuggestions.value = false;
    nextTick(() => { 
        if (newItemInputRef.value) newItemInputRef.value.focus(); 
        isProgrammaticUpdate.value = false;
    });
};

const handleBlur = () => { setTimeout(() => { showSuggestions.value = false; }, 200); };
const handleFocus = () => { if (newItemName.value.length >= 2) showSuggestions.value = true; };

watch(newItemName, (val) => { 
    if (isProgrammaticUpdate.value) return;
    showSuggestions.value = val.length >= 2; 
});

const startCreation = () => { isCreating.value = true; newItemName.value = ''; nextTick(() => { if (newItemInputRef.value) newItemInputRef.value.focus(); }); };
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
      if (isContractorEditor || isIndividualEditor) { mappedItem.defaultProjectId = null; mappedItem.defaultCategoryId = null; mappedItem.selectedProjectIds = []; mappedItem.selectedCategoryIds = []; }
      if (isContractorEditor) { mappedItem.identificationNumber = ''; mappedItem.contractNumber = ''; mappedItem.contractDate = null; } 
      
      if (isCompanyEditor) { 
          mappedItem.selectedAccountIds = [];
          mappedItem.taxRegime = 'simplified';
          mappedItem.taxPercent = 3;
          mappedItem.identificationNumber = '';
      }

      if (isIndividualEditor) { otherItems.value.push(mappedItem); } else { localItems.value.push(mappedItem); }
      cancelCreation();
    }
  } catch (e) { console.error(e); alert('Ошибка при создании: ' + e.message); } 
  finally { isSavingNew.value = false; }
};

const onRegimeChange = (item) => {
    if (item.taxRegime === 'simplified') {
        item.taxPercent = 3;
    } else if (item.taxRegime === 'our') {
        item.taxPercent = 10;
    }
};

const formatNumber = (numStr) => { const clean = `${numStr}`.replace(/[^0-9]/g, ''); return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
const onAmountInput = (item) => { const rawValue = String(item.initialBalanceFormatted).replace(/[^0-9]/g, ''); item.initialBalanceFormatted = formatNumber(rawValue); item.initialBalance = Number(rawValue) || 0; };

onMounted(() => {
  const allAccounts = mainStore.accounts;
  let rawItems = JSON.parse(JSON.stringify(props.items));
  rawItems = rawItems.filter(item => {
      const name = item.name.trim().toLowerCase();
      if (isIndividualEditor) {
          if (mainStore.retailIndividualId && item._id === mainStore.retailIndividualId) return false;
          if (name === 'розница' || name === 'розничные клиенты') return false;
      }
      if (isCategoryEditor) {
          if (name === 'реализация') return false;
          if (name === 'остаток долга') return false;
          if (name === 'возврат') return false; 
      }
      return true;
  });
  rawItems.sort((a, b) => (a.order || 0) - (b.order || 0));

  const processedItems = rawItems.map(item => {
    if (isAccountEditor) {
      const balance = item.initialBalance || 0;
      let ownerVal = null;
      const cId = (item.companyId && typeof item.companyId === 'object') ? item.companyId._id : item.companyId;
      const iId = (item.individualId && typeof item.individualId === 'object') ? item.individualId._id : item.individualId;
      if (cId) ownerVal = `company-${cId}`; else if (iId) ownerVal = `individual-${iId}`;
      
      // 🟢 Убедимся, что isExcluded инициализировано
      const isExcluded = !!item.isExcluded;
      
      return { ...item, initialBalance: balance, initialBalanceFormatted: formatNumber(balance), ownerValue: ownerVal, isExcluded }
    }
    if (isContractorEditor || isIndividualEditor) {
      let pIds = item.defaultProjectIds || [];
      if (!pIds.length && item.defaultProjectId) { const pId = (typeof item.defaultProjectId === 'object') ? item.defaultProjectId._id : item.defaultProjectId; if(pId) pIds.push(pId); }
      let cIds = item.defaultCategoryIds || [];
      if (!cIds.length && item.defaultCategoryId) { const cId = (typeof item.defaultCategoryId === 'object') ? item.defaultCategoryId._id : item.defaultCategoryId; if(cId) cIds.push(cId); }
      // 🟢 NEW: Initialize legal data fields
      const identificationNumber = item.identificationNumber || '';
      const contractNumber = item.contractNumber || '';
      const contractDate = item.contractDate || null;
      return { ...item, selectedProjectIds: pIds, selectedCategoryIds: cIds, identificationNumber, contractNumber, contractDate };
    }
    if (isCompanyEditor) {
      const selectedAccountIds = allAccounts.filter(a => (a.companyId?._id || a.companyId) === item._id).map(a => a._id);
      const identificationNumber = item.identificationNumber || '';
      return { 
          ...item, 
          selectedAccountIds: selectedAccountIds,
          taxRegime: item.taxRegime || 'simplified',
          taxPercent: item.taxPercent !== undefined ? item.taxPercent : 3,
          identificationNumber
      };
    }
    return item;
  });

  if (isIndividualEditor) {
      const ownerIds = new Set();
      mainStore.accounts.forEach(acc => {
          if (acc.individualId) { const iId = (typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId; if (iId) ownerIds.add(iId); }
      });
      ownerItems.value = processedItems.filter(item => ownerIds.has(item._id));
      otherItems.value = processedItems.filter(item => !ownerIds.has(item._id));
  } 
  // 🟢 РАЗДЕЛЕНИЕ СЧЕТОВ НА АКТИВНЫЕ И ИСКЛЮЧЕННЫЕ
  else if (isAccountEditor) {
      localItems.value = processedItems.filter(item => !item.isExcluded);
      excludedItems.value = processedItems.filter(item => item.isExcluded);
  }
  else { 
      localItems.value = processedItems; 
  }
});

// Watch for changes in items prop to update local lists
watch(() => props.items, (newItems) => {
  console.log('📝 Items updated, refreshing local list');
  const allAccounts = mainStore.accounts;
  let rawItems = JSON.parse(JSON.stringify(newItems));
  rawItems = rawItems.filter(item => {
      const name = item.name.trim().toLowerCase();
      if (isIndividualEditor) {
          if (mainStore.retailIndividualId && item._id === mainStore.retailIndividualId) return false;
          if (name === 'розница' || name === 'розничные клиенты') return false;
      }
      if (isCategoryEditor) {
          if (name === 'реализация') return false;
          if (name === 'остаток долга') return false;
          if (name === 'возврат') return false; 
      }
      return true;
  });
  rawItems.sort((a, b) => (a.order || 0) - (b.order || 0));

  const processedItems = rawItems.map(item => {
    if (isAccountEditor) {
      const balance = item.initialBalance || 0;
      let ownerVal = null;
      const cId = (item.companyId && typeof item.companyId === 'object') ? item.companyId._id : item.companyId;
      const iId = (item.individualId && typeof item.individualId === 'object') ? item.individualId._id : item.individualId;
      if (cId) ownerVal = `company-${cId}`; else if (iId) ownerVal = `individual-${iId}`;
      const isExcluded = !!item.isExcluded;
      return { ...item, initialBalance: balance, initialBalanceFormatted: formatNumber(balance), ownerValue: ownerVal, isExcluded }
    }
    if (isContractorEditor || isIndividualEditor) {
      let pIds = item.defaultProjectIds || [];
      if (!pIds.length && item.defaultProjectId) { const pId = (typeof item.defaultProjectId === 'object') ? item.defaultProjectId._id : item.defaultProjectId; if(pId) pIds.push(pId); }
      let cIds = item.defaultCategoryIds || [];
      if (!cIds.length && item.defaultCategoryId) { const cId = (typeof item.defaultCategoryId === 'object') ? item.defaultCategoryId._id : item.defaultCategoryId; if(cId) cIds.push(cId); }
      const identificationNumber = item.identificationNumber || '';
      const contractNumber = item.contractNumber || '';
      const contractDate = item.contractDate || null;
      return { ...item, selectedProjectIds: pIds, selectedCategoryIds: cIds, identificationNumber, contractNumber, contractDate };
    }
    if (isCompanyEditor) {
      const selectedAccountIds = allAccounts.filter(a => (a.companyId?._id || a.companyId) === item._id).map(a => a._id);
      const identificationNumber = item.identificationNumber || '';
      return { 
          ...item, 
          selectedAccountIds: selectedAccountIds,
          taxRegime: item.taxRegime || 'simplified',
          taxPercent: item.taxPercent !== undefined ? item.taxPercent : 3,
          identificationNumber
      };
    }
    return item;
  });

  if (isIndividualEditor) {
      const ownerIds = new Set();
      mainStore.accounts.forEach(acc => {
          if (acc.individualId) { const iId = (typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId; if (iId) ownerIds.add(iId); }
      });
      ownerItems.value = processedItems.filter(item => ownerIds.has(item._id));
      otherItems.value = processedItems.filter(item => !ownerIds.has(item._id));
  } 
  else if (isAccountEditor) {
      localItems.value = processedItems.filter(item => !item.isExcluded);
      excludedItems.value = processedItems.filter(item => item.isExcluded);
  }
  else { 
      localItems.value = processedItems; 
  }
}, { deep: true });

// 🟢 AUTO-SAVE WHEN DRAGGING ACCOUNTS BETWEEN LISTS
// Watch localItems for changes (e.g., when dragging from excluded to active)
watch(() => localItems.value.length, () => {
  if (isAccountEditor) {
    debouncedSave();
  }
});

// Watch excludedItems for changes (e.g., when dragging from active to excluded)
watch(() => excludedItems.value.length, () => {
  if (isAccountEditor) {
    debouncedSave();
  }
});

// Auto-save: debounced version of handleSave for selectors and inputs
let saveTimeout = null;
const debouncedSave = () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    handleSave();
  }, 500); // 500ms delay to avoid excessive API calls
};

const handleSave = async () => {
  let finalItems = [];

  // 🟢 ОБЪЕДИНЕНИЕ СПИСКОВ СЧЕТОВ ПЕРЕД СОХРАНЕНИЕМ
  if (isAccountEditor) {
      // Обновляем флаги isExcluded перед слиянием
      localItems.value.forEach(i => i.isExcluded = false);
      excludedItems.value.forEach(i => i.isExcluded = true);
      finalItems = [...localItems.value, ...excludedItems.value];
  }
  else if (isIndividualEditor) {
      finalItems = [...ownerItems.value, ...otherItems.value];
  } 
  else {
      finalItems = localItems.value;
  }

  const itemsToSave = finalItems.map((item, index) => {
    const data = { _id: item._id, name: item.name, order: index };
    if (isAccountEditor) {
        data.initialBalance = item.initialBalance || 0;
        // 🟢 Явно сохраняем флаг исключения
        data.isExcluded = !!item.isExcluded;
        
        if (item.ownerValue) { 
            const [type, id] = item.ownerValue.split('-'); 
            if (type === 'company') { data.companyId = id; data.individualId = null; } 
            else if (type === 'individual') { data.companyId = null; data.individualId = id; } 
        } else { 
            data.companyId = null; data.individualId = null; 
        }
    }
    if (isContractorEditor || isIndividualEditor) { 
        data.defaultProjectIds = item.selectedProjectIds || []; data.defaultCategoryIds = item.selectedCategoryIds || [];
        data.defaultProjectId = data.defaultProjectIds[0] || null; data.defaultCategoryId = data.defaultCategoryIds[0] || null;
    }
    if (isContractorEditor) {
        // 🟢 NEW: Include legal data fields in save
        data.identificationNumber = item.identificationNumber || null;
        data.contractNumber = item.contractNumber || null;
        data.contractDate = item.contractDate || null;
    }
    if (isCompanyEditor) {
        data.taxRegime = item.taxRegime;
        data.taxPercent = Number(item.taxPercent);
        data.identificationNumber = item.identificationNumber || null;
    }
    return data;
  });
  
  emit('save', itemsToSave);
  
  if (isCompanyEditor) {
    const accountsToUpdate = new Map();
    const allStoreAccounts = JSON.parse(JSON.stringify(mainStore.accounts));
    for (const ownerItem of localItems.value) {
      const ownerId = ownerItem._id; const newAccountIds = new Set(ownerItem.selectedAccountIds);
      for (const acc of allStoreAccounts) {
        const accId = acc._id; const isSelected = newAccountIds.has(accId); const currentCompanyOwner = acc.companyId?._id || acc.companyId;
        if (isSelected) { if (currentCompanyOwner !== ownerId) { acc.companyId = ownerId; acc.individualId = null; accountsToUpdate.set(accId, acc); } } 
        else { if (currentCompanyOwner === ownerId) { acc.companyId = null; accountsToUpdate.set(accId, acc); } }
      }
    }
    const updates = Array.from(accountsToUpdate.values());
    if (updates.length > 0) await mainStore.batchUpdateEntities('accounts', updates);
  }
};

const itemToDelete = ref(null); const showDeletePopup = ref(false); const isDeleting = ref(false);
const openDeleteDialog = (item) => { itemToDelete.value = item; showDeletePopup.value = true; };
const confirmDelete = async (deleteOperations) => {
  console.log('🗑️ confirmDelete triggered', { deleteOperations, item: itemToDelete.value, entityPath });
  
  if (!itemToDelete.value) {
    console.warn('❌ confirmDelete aborted: No item to delete');
    return;
  }
  
  if (!entityPath) {
    console.warn('❌ confirmDelete aborted: No entityPath (entityType prop missing?)');
    return;
  }
  
  isDeleting.value = true;
  try {
    console.log('⏳ Starting delete process...');
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay for UX
    
    console.log('🔌 Calling mainStore.deleteEntity...');
    await mainStore.deleteEntity(entityPath, itemToDelete.value._id, deleteOperations);
    console.log('✅ mainStore.deleteEntity success');
    
    if (isIndividualEditor) { 
        ownerItems.value = ownerItems.value.filter(i => i._id !== itemToDelete.value._id); 
        otherItems.value = otherItems.value.filter(i => i._id !== itemToDelete.value._id); 
    } 
    else if (isAccountEditor) {
        localItems.value = localItems.value.filter(i => i._id !== itemToDelete.value._id);
        excludedItems.value = excludedItems.value.filter(i => i._id !== itemToDelete.value._id);
    }
    else { 
      localItems.value = localItems.value.filter(i => i._id !== itemToDelete.value._id); 
    }
    
    console.log('🧹 Local state updated');
  } catch (e) { 
    console.error('❌ Delete error:', e);
    alert('Ошибка при удалении: ' + e.message); 
    isDeleting.value = false; 
    return; 
  }
  
  isDeleting.value = false; 
  await nextTick(); 
  showDeletePopup.value = false; 
  itemToDelete.value = null;
  console.log('✨ Delete process completed');
};
const cancelDelete = () => { if (isDeleting.value) return; showDeletePopup.value = false; itemToDelete.value = null; };

// --- WIDGET TOGGLE LOGIC ---
const isWidgetOnDashboard = computed(() => {
  if (!props.widgetKey) return null; // No widget key provided
  return mainStore.dashboardLayout.includes(props.widgetKey);
});

const toggleWidgetOnDashboard = () => {
  if (!props.widgetKey) return;
  
  if (isWidgetOnDashboard.value) {
    // Remove widget completely - don't replace with placeholder
    const layout = mainStore.dashboardLayout.filter(k => k !== props.widgetKey && !k?.startsWith('placeholder_'));
    mainStore.dashboardLayout = layout;
  } else {
    // Add widget to end - placeholders are generated in localWidgets, not stored
    const layout = mainStore.dashboardLayout.filter(k => !k?.startsWith('placeholder_'));
    layout.push(props.widgetKey);
    
    mainStore.dashboardLayout = layout;
  }
};

// Expose methods for parent components
defineExpose({
  triggerCreate: startCreation
});
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content" :class="{ 'wide': isContractorEditor || isCompanyEditor || isIndividualEditor || isAccountEditor }">
      <div class="header-with-toggle">
        <h3>{{ title }}</h3>
        <button 
          v-if="widgetKey && isWidgetOnDashboard !== null"
          class="widget-toggle-btn"
          @click.stop="toggleWidgetOnDashboard"
          :title="isWidgetOnDashboard ? 'Скрыть виджет с рабочего стола' : 'Показать виджет на рабочем столе'"
        >
          <svg v-if="isWidgetOnDashboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
          <span class="toggle-label">{{ isWidgetOnDashboard ? 'На столе' : 'Скрыт' }}</span>
        </button>
      </div>
      
      <template v-if="!isIndividualEditor && localItems.length > 0">
        <div v-if="isAccountEditor" class="editor-header account-header-simple">
          <span class="header-name">Название счета</span><span class="header-owner">Владелец</span><span class="header-balance">Нач. баланс</span><span class="header-trash"></span>
        </div>
        
        <div v-else-if="isCompanyEditor" class="editor-header owner-header">
          <span class="header-name">Название Компании</span>
          <span class="header-accounts">Привязанные счета</span>
          <span class="header-tax">Налоги</span>
          <span class="header-percent">%</span>
          <span class="header-bin">ИИН/БИН</span>
          <span class="header-trash"></span>
        </div>
        
        <div v-else-if="isContractorEditor" class="editor-header contractor-header">
          <span class="header-name">Название</span><span class="header-project">Проекты</span><span class="header-category">Категории</span><span class="header-bin">БИН/ИИН</span><span class="header-contract-num">Номер договора</span><span class="header-contract-date">Дата договора</span><span class="header-trash"></span>
        </div>
        <div v-else class="editor-header default-header">
          <span class="header-name">Название</span><span class="header-trash"></span>
        </div>
      </template>
      
      <div class="list-editor">
        
        <!-- СТАНДАРТНЫЙ DRAGGABLE -->
        <!-- 🟢 Добавлен group="accounts" для счетов -->
        <template v-if="isIndividualEditor">
            <!-- Блок физлиц пропущен для краткости, он не меняется -->
            <div v-if="ownerItems.length > 0" class="group-section">
                <div class="group-title">Владельцы счетов (Привязка через счета)</div>
                <draggable v-model="ownerItems" item-key="_id" handle=".drag-handle" ghost-class="ghost">
                    <template #item="{ element: item }">
                        <div class="edit-item">
                            <span class="drag-handle">⠿</span>
                            <input type="text" v-model="item.name" class="edit-input edit-name" />
                            <button class="delete-btn" @click="openDeleteDialog(item)"><svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                        </div>
                    </template>
                </draggable>
            </div>
            <div class="group-section">
                <div class="group-title">Физлица (Контрагенты)</div>
                <draggable v-model="otherItems" item-key="_id" handle=".drag-handle" ghost-class="ghost">
                    <template #item="{ element: item }">
                        <div class="edit-item">
                            <span class="drag-handle">⠿</span>
                            <input type="text" v-model="item.name" class="edit-input edit-name" />
                            <button class="delete-btn" @click="openDeleteDialog(item)"><svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                        </div>
                    </template>
                </draggable>
            </div>
        </template>

        <template v-else>
            <!-- АКТИВНЫЕ ЭЛЕМЕНТЫ -->
            <draggable 
                v-model="localItems" 
                item-key="_id" 
                handle=".drag-handle" 
                ghost-class="ghost"
                :group="isAccountEditor ? 'accounts' : null"
            >
              <template #item="{ element: item }">
                <div class="edit-item">
                  <span class="drag-handle">⠿</span>
                  <input type="text" v-model="item.name" class="edit-input edit-name" @blur="debouncedSave" />
                  
                  <template v-if="isAccountEditor">
                    <select v-model="item.ownerValue" @change="handleOwnerSelectChange(item); debouncedSave()" class="edit-input edit-owner">
                        <option :value="null">Нет владельца</option>
                        <option value="create-company" class="create-option">+ Создать Компанию</option>
                        <option value="create-individual" class="create-option">+ Создать Физлицо</option>
                        <optgroup label="Компании"><option v-for="c in companiesList" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option></optgroup>
                        <optgroup label="Физлица"><option v-for="i in individualsList" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option></optgroup>
                    </select>
                    <input type="text" inputmode="decimal" v-model="item.initialBalanceFormatted" @input="onAmountInput(item)" @focus="$event.target.select()" @blur="debouncedSave" class="edit-input edit-balance" placeholder="0" />
                  </template>
                  
                  <template v-if="isContractorEditor">
                    <button type="button" class="edit-input edit-picker-btn" @click="openMultiSelect(item, 'projects')">{{ item.selectedProjectIds.length ? `Проекты (${item.selectedProjectIds.length})` : 'Нет' }}</button>
                    <button type="button" class="edit-input edit-picker-btn" @click="openMultiSelect(item, 'categories')">{{ item.selectedCategoryIds.length ? `Категории (${item.selectedCategoryIds.length})` : 'Нет' }}</button>
                    <input type="text" v-model="item.identificationNumber" class="edit-input edit-bin" placeholder="БИН/ИИН" @blur="debouncedSave" />
                    <input type="text" v-model="item.contractNumber" class="edit-input edit-contract-num" placeholder="Номер договора" @blur="debouncedSave" />
                    <input type="date" v-model="item.contractDate" class="edit-input edit-contract-date" @change="debouncedSave" />
                  </template>
                  
                  <template v-if="isCompanyEditor">
                    <button type="button" class="edit-input edit-account-picker" @click="openAccountPicker(item)">Выбрано ({{ item.selectedAccountIds.length }})</button>
                    <select v-model="item.taxRegime" class="edit-input edit-tax" @change="onRegimeChange(item); debouncedSave()">
                        <option value="simplified">Упрощенка</option>
                        <option value="our">ОУР</option>
                    </select>
                    <input type="number" v-model="item.taxPercent" class="edit-input edit-percent" placeholder="%" min="0" max="100" @blur="debouncedSave" />
                    <input type="text" v-model="item.identificationNumber" class="edit-input edit-company-bin" placeholder="ИИН/БИН" @blur="debouncedSave" />
                  </template>
                  
                  <button class="delete-btn" @click="openDeleteDialog(item)" title="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div>
              </template>
            </draggable>

            <!-- 🟢 DROP ZONE ДЛЯ ИСКЛЮЧЕННЫХ СЧЕТОВ -->
            <div v-if="isAccountEditor" class="excluded-accounts-section">
                <div class="excluded-divider">
                    <span class="divider-text">Не учитываются в общем балансе</span>
                    <div class="divider-line"></div>
                </div>
                
                <draggable 
                    v-model="excludedItems" 
                    item-key="_id" 
                    handle=".drag-handle" 
                    ghost-class="ghost"
                    group="accounts"
                    class="excluded-drop-zone"
                >
                    <template #item="{ element: item }">
                        <div class="edit-item excluded-item">
                            <span class="drag-handle">⠿</span>
                            <input type="text" v-model="item.name" class="edit-input edit-name faded" />
                            <select v-model="item.ownerValue" class="edit-input edit-owner faded" disabled>
                                <option :value="item.ownerValue">{{ item.ownerValue ? 'Владелец скрыт' : 'Нет владельца' }}</option>
                            </select>
                            <input type="text" v-model="item.initialBalanceFormatted" class="edit-input edit-balance faded" disabled />
                            <button class="delete-btn" @click="openDeleteDialog(item)"><svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                        </div>
                    </template>
                    
                    <template #footer>
                         <div v-if="excludedItems.length === 0" class="empty-drop-zone">
                             Перетащите сюда счета, чтобы исключить их из "Всего"
                         </div>
                    </template>
                </draggable>
            </div>
        </template>

      </div>
      
      <!-- Sticky Footer with Actions -->
      <div class="editor-footer">
        <!-- Left: Create button -->
        <div class="footer-left">
          <button v-if="!isCreating" class="btn-add-new" @click="startCreation">
            + Создать {{ entityNameSingular }}
          </button>
          
          <div v-else class="inline-create-row relative">
             <input 
               type="text" 
               v-model="newItemName" 
               :placeholder="`Название (${entityNameSingular})`" 
               ref="newItemInputRef" 
               class="create-input" 
               @keyup.enter="handleCreateNew" 
               @keyup.esc="cancelCreation"
               @blur="handleBlur"
               @focus="handleFocus"
             />
             <button class="btn-icon-save" @click="handleCreateNew" :disabled="isSavingNew">✓</button>
             <button class="btn-icon-cancel" @click="cancelCreation" :disabled="isSavingNew">✕</button>

             <ul v-if="showSuggestions && suggestionsList.length > 0" class="suggestions-list">
                <li v-for="(item, idx) in suggestionsList" :key="idx" @mousedown.prevent="selectSuggestion(item)">
                    {{ item.name }}
                </li>
             </ul>
          </div>
        </div>
        
        <!-- Right: Save button -->
        <div class="footer-right">
          <button @click="handleSave" class="btn-submit btn-submit-edit">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Диалоги удаления и создания (без изменений) -->
    <div v-if="showDeletePopup" class="inner-overlay" @click.self="cancelDelete"><div class="delete-confirm-box"><div v-if="isDeleting" class="deleting-state"><h4>Удаление...</h4><p class="sub-note">Пожалуйста, подождите, обновляем данные.</p><div class="progress-container"><div class="progress-bar"></div></div></div><div v-else><h4>Удаление сущности</h4><p>Вы собираетесь удалить <strong>«{{ itemToDelete?.name }}»</strong>.<br>Что делать со связанными операциями?</p><div class="delete-actions"><button class="btn-choice btn-keep" @click="confirmDelete(false)"><span class="main-text">Только сущность</span><span class="sub-text">Операции останутся (связь исчезнет)</span></button><button class="btn-choice btn-nuke" @click="confirmDelete(true)"><span class="main-text">Сущность + Операции</span><span class="sub-text">Удалится всё безвозвратно</span></button></div><button class="btn-cancel" @click="cancelDelete">Отмена</button></div></div></div>
    <div v-if="showCreateOwnerPopup" class="inner-overlay" @click.self="cancelCreateOwner"><div class="create-owner-box"><h4>Новый владелец</h4><p class="sub-text">Создание: <b>{{ ownerTypeToCreate === 'company' ? 'Компания' : 'Физлицо' }}</b></p><input type="text" v-model="newOwnerNameInput" class="create-owner-input" placeholder="Введите название" ref="newOwnerInputRef" @keyup.enter="saveNewOwner" @keyup.esc="cancelCreateOwner"/><div class="owner-actions"><button class="btn-cancel" @click="cancelCreateOwner">Отмена</button><button class="btn-save-owner" @click="saveNewOwner" :disabled="isSavingOwner">{{ isSavingOwner ? '...' : 'Создать' }}</button></div></div></div>
    <AccountPickerModal v-if="showAccountPicker" :all-accounts="mainStore.accounts" :initial-selected-ids="currentItemForPicker ? currentItemForPicker.selectedAccountIds : []" :hint-text="pickerHintText" @close="showAccountPicker = false" @save="onAccountPickerSave"/>
    <MultiSelectModal v-if="showMultiSelect" :title="multiSelectTitle" :items="multiSelectItems" :initial-selected-ids="multiSelectInitialIds" @close="showMultiSelect = false" @save="onMultiSelectSave"/>
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { max-width: 580px; background: var(--color-background-soft); padding: 2rem; border-radius: 12px; color: var(--color-text); width: 100%; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem; transition: max-width 0.2s ease; }
.popup-content.wide { width: 90%; max-width: 1400px; }
h3 { color: var(--color-heading); margin-top: 0; margin-bottom: 1.5rem; text-align: left; font-size: 22px; font-weight: 600; }

/* Widget Toggle Button */
.header-with-toggle {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 1.5rem;
}

.header-with-toggle h3 {
  margin-bottom: 0;
}

.widget-toggle-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  color: var(--color-text-soft);
}

.widget-toggle-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-background-mute);
}

.widget-toggle-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.widget-toggle-btn .toggle-label {
  font-weight: 500;
}

/* Sticky Footer */
.editor-footer {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  gap: 1rem;
  padding: 1rem 2rem;
  background: var(--color-background-soft);
  border-top: 2px solid var(--color-border);
  margin: 0 -2rem -2rem -2rem;
  z-index: 10;
}

.footer-left {
  flex: 1;
  display: flex;
  align-items: center;
}

.footer-right {
  flex-shrink: 0;
}

.btn-submit { width: 100%; height: 50px; padding: 0 1rem; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background-color 0.2s ease; }
.btn-submit-edit { padding: 0 24px; height: 38px; background: #111827; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; min-width: 160px;}
.btn-submit-edit:hover { background-color: #444444; }
.create-section { margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); }
.btn-add-new { padding: 0 20px; height: 38px; border: 1px dashed var(--color-border); background-color: transparent; border-radius: 8px; color: var(--color-text-soft); font-size: 14px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; white-space: nowrap; }
.btn-add-new:hover { border-color: var(--color-text); color: var(--color-text); background-color: var(--color-background-mute); }
.inline-create-row { display: flex; gap: 8px; align-items: center; }
.create-input { flex-grow: 1; height: 28px; padding: 0 10px; background: var(--color-background); border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; color: var(--color-text); margin-bottom: 0 !important; }
.create-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(34,34,34,0.2); }
.btn-icon-save, .btn-icon-cancel { width: 28px; height: 28px; border: none; border-radius: 6px; cursor: pointer; color: #fff; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.btn-icon-save { background-color: #34C759; }
.btn-icon-save:hover { background-color: #2da84e; }
.btn-icon-cancel { background-color: #FF3B30; }
.btn-icon-cancel:hover { background-color: #d63025; }
.editor-header { display: flex; align-items: flex-end; gap: 10px; font-size: 0.8em; color: var(--color-text-soft); margin-left: 32px; margin-bottom: 5px; margin-right: 12px }
.header-name { flex-grow: 1; }
.account-header-simple .header-name { width: 100%; }
.account-header-simple .header-balance { flex-shrink: 0; width: 130px; text-align: right; padding-right: 14px; }
.account-header-simple .header-owner { flex-shrink: 0; width: 200px; }

.owner-header .header-accounts { flex-shrink: 0; width: 220px; }
.owner-header .header-tax { flex-shrink: 0; width: 100px; }
.owner-header .header-percent { flex-shrink: 0; width: 60px; }
.owner-header .header-bin { flex-shrink: 0; width: 150px; }

.contractor-header .header-project { flex-shrink: 0; width: 200px; } 
.contractor-header .header-category { flex-shrink: 0; width: 200px; }
.contractor-header .header-bin { flex-shrink: 0; width: 150px; }
.contractor-header .header-contract-num { flex-shrink: 0; width: 150px; }
.contractor-header .header-contract-date { flex-shrink: 0; width: 150px; } 
.small-header { margin-left: 32px; margin-top: 5px; margin-bottom: 5px; }
.header-trash { width: 28px; flex-shrink: 0; }
.list-editor { 
  overflow-y: auto; 
  padding-right: 5px; 
  scrollbar-width: none; 
  -ms-overflow-style: none;
  max-height: none;
}
.list-editor::-webkit-scrollbar { display: none; }
.edit-item { display: flex; align-items: center; margin-bottom: 6px; gap: 10px; }
.drag-handle { cursor: grab; font-size: 1.2em; color: var(--color-text-soft); user-select: none; flex-shrink: 0; width: 22px; height: 28px; display: flex; align-items: center; justify-content: center; margin: 0; }
.edit-item:active { cursor: grabbing; }
.edit-input { height: 28px; padding: 0 10px; background: var(--color-background); border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text); font-size: 13px; font-family: inherit; box-sizing: border-box; margin: 0; }
.edit-input:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.2); }
.edit-name { flex-grow: 1; min-width: 100px; }
.edit-picker-btn { flex-shrink: 0; width: 200px; text-align: left; cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 20px; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.edit-picker-btn:hover { border-color: #222; }
.edit-owner { flex-shrink: 0; width: 200px; -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.41 0.589844L6 5.16984L10.59 0.589844L12 2.00019L6 8.00019L0 2.00019L1.41 0.589844Z' fill='%23333'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 25px; }
.create-option { font-weight: 600; color: var(--color-primary); background-color: var(--color-background-soft); }
.edit-balance { flex-shrink: 0; width: 130px; text-align: right; }
.edit-account-picker { flex-shrink: 0; width: 220px; text-align: left; color: var(--color-text); cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.41 0.589844L6 5.16984L10.59 0.589844L12 2.00019L6 8.00019L0 2.00019L1.41 0.589844Z' fill='%23666'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 25px; font-size: 13px; display: flex; align-items: center; margin: 0; padding: 0 10px; height: 28px; background-color: var(--color-background); border: 1px solid var(--color-border); border-radius: 6px; font-family: inherit; }
.edit-account-picker:hover { border-color: var(--color-primary); }

.edit-tax { flex-shrink: 0; width: 100px; }
.edit-percent { flex-shrink: 0; width: 60px; text-align: center; }

.edit-bin { flex-shrink: 0; width: 150px; }
.edit-contract-num { flex-shrink: 0; width: 150px; }
.edit-contract-date { flex-shrink: 0; width: 150px; }
.edit-company-bin { flex-shrink: 0; width: 150px; }

.delete-btn { width: 28px; height: 28px; flex-shrink: 0; border: 1px solid var(--color-border); background: var(--color-background); border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; padding: 0; box-sizing: border-box; margin: 0; }
.delete-btn svg { width: 14px; height: 14px; stroke: var(--color-text-soft); transition: stroke 0.2s; }
.delete-btn:hover { border-color: #FF3B30; background: rgba(255, 59, 48, 0.1); }
.delete-btn:hover svg { stroke: #FF3B30; }
.ghost { opacity: 0.5; background: #c0c0c0; }
.inner-overlay { 
  position: absolute !important; 
  top: 0 !important; 
  left: 0 !important; 
  width: 100% !important; 
  height: 100% !important; 
  background: rgba(0,0,0,0.3) !important; 
  border-radius: 12px; 
  display: flex !important; 
  align-items: center; 
  justify-content: center; 
  z-index: 1000 !important; 
}
.delete-confirm-box { background: var(--color-background); padding: 20px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 5px 20px rgba(0,0,0,0.5); text-align: center; border: 1px solid var(--color-border); }
.delete-confirm-box h4 { margin: 0 0 10px; color: var(--color-heading); font-size: 18px; }
.delete-confirm-box p { color: var(--color-text-soft); font-size: 14px; margin-bottom: 20px; line-height: 1.4; }
.delete-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; }
.btn-choice { border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-background-soft); padding: 12px; cursor: pointer; text-align: left; display: flex; flex-direction: column; transition: border-color 0.2s, background 0.2s; }
.btn-choice:hover { border-color: var(--color-border-hover); background: var(--color-background-mute); }
.btn-choice .main-text { font-weight: 600; color: var(--color-text); font-size: 15px; margin-bottom: 2px; }
.btn-choice .sub-text { font-size: 12px; color: var(--color-text-soft); }
.btn-nuke:hover { border-color: #FF3B30; background: #FFF0F0; }
.btn-nuke .main-text { color: #FF3B30; }
.btn-cancel { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; text-decoration: underline; }
.btn-cancel:hover { color: #555; }
.deleting-state { display: flex; flex-direction: column; align-items: center; padding: 1rem 0; }
.sub-note { font-size: 13px; color: #888; margin-top: -5px; margin-bottom: 20px; }
.progress-container { width: 100%; height: 6px; background-color: #eee; border-radius: 3px; overflow: hidden; position: relative; }
.progress-bar { width: 100%; height: 100%; background-color: #222; position: absolute; left: -100%; animation: indeterminate 1.5s infinite ease-in-out; }
@keyframes indeterminate { 0% { left: -100%; width: 50%; } 50% { left: 25%; width: 50%; } 100% { left: 100%; width: 50%; } }
.create-owner-box { background: var(--color-background); padding: 24px; border-radius: 12px; width: 90%; max-width: 350px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); text-align: center; border: 1px solid var(--color-border); }
.create-owner-box h4 { margin: 0 0 10px; color: var(--color-heading); font-size: 18px; }
.sub-text { font-size: 14px; color: var(--color-text-soft); margin-bottom: 15px; }
.create-owner-input { width: 100%; height: 40px; border: 1px solid var(--color-border); border-radius: 6px; padding: 0 10px; font-size: 15px; margin-bottom: 20px; box-sizing: border-box; background-color: var(--color-background); color: var(--color-text); }
.create-owner-input:focus { outline: none; border-color: var(--color-primary); }
.owner-actions { display: flex; justify-content: space-between; align-items: center; }
.btn-save-owner { padding: 10px 20px; background-color: #34C759; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; }
.btn-save-owner:hover { background-color: #2da84e; }
.btn-save-owner:disabled { opacity: 0.7; cursor: wait; }
.group-section { margin-bottom: 25px; }
.group-title { font-size: 14px; font-weight: 600; color: var(--color-text-soft); text-transform: uppercase; margin-bottom: 8px; padding-left: 36px; letter-spacing: 0.5px; }
.empty-list { padding: 20px; text-align: center; color: var(--color-text-soft); font-style: italic; background: var(--color-background-soft); border: 1px dashed var(--color-border); border-radius: 8px; margin-left: 36px; }

.relative { position: relative; }
.suggestions-list { position: absolute; top: 100%; left: 0; right: 48px; background: var(--color-background); border: 1px solid var(--color-border); border-top: none; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); z-index: 2000; list-style: none; padding: 0; margin: 0; max-height: 160px; overflow-y: auto; }
.suggestions-list li { padding: 10px 14px; font-size: 14px; color: var(--color-text); cursor: pointer; border-bottom: 1px solid var(--color-border); }
.suggestions-list li:last-child { border-bottom: none; }
.suggestions-list li:hover { background-color: var(--color-background-soft); }

/* 🟢 СТИЛИ ДЛЯ ИСКЛЮЧЕННЫХ СЧЕТОВ */
.excluded-accounts-section {
    margin-top: 2rem;
    padding-top: 1rem;
}
.excluded-divider {
    display: flex;
    align-items: center;
    margin-bottom: 1rem;
    gap: 12px;
}
.divider-text {
    font-size: 12px;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    white-space: nowrap;
}
.divider-line {
    flex-grow: 1;
    height: 1px;
    background-color: #e0e0e0;
}
.excluded-drop-zone {
    background-color: var(--color-background-soft);
    border: 1px dashed var(--color-border);
    border-radius: 8px;
    padding: 10px;
    transition: background-color 0.2s;
    min-height: 60px;
    max-height: none;
}
.excluded-item {
    opacity: 0.8;
}
.faded {
    color: var(--color-text-soft) !important;
    background-color: var(--color-background-mute) !important;
    opacity: 0.7;
}
.empty-drop-zone {
    color: #aaa;
    font-size: 13px;
    text-align: center;
    padding: 20px;
    font-style: italic;
}
</style>