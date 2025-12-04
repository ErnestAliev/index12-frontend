<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import BaseSelect from './BaseSelect.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import { accountSuggestions } from '@/data/accountSuggestions.js'; 
import { categorySuggestions } from '@/data/categorySuggestions.js'; 
import { knownBanks } from '@/data/knownBanks.js'; 

/**
 * * --- МЕТКА ВЕРСИИ: v3.0 - FULL CODE & AUTOCOMPLETE ---
 * * ВЕРСИЯ: 3.0
 * * ДАТА: 2025-12-04
 * * ИЗМЕНЕНИЯ:
 * 1. Внедрена автоподстановка для Счетов, Категорий, Контрагентов, Владельцев.
 * 2. Добавлен фикс isProgrammaticUpdate (список сворачивается при выборе).
 * 3. КОД ПОЛНЫЙ, БЕЗ СОКРАЩЕНИЙ.
 */

const mainStore = useMainStore();
const props = defineProps({
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  operationToEdit: { type: Object, default: null },
  minAllowedDate: { type: Date, default: null },
  maxAllowedDate: { type: Date, default: null }
});

const emit = defineEmits(['close', 'save', 'operation-deleted']);

// --- ДАННЫЕ ---
const amount = ref('');
const amountInput = ref(null);

const selectedAccountId = ref(null);
const selectedOwner = ref(null); // Company or Individual (Payer)
const selectedContractorValue = ref(null); // Contractor or Individual (Payee)
const selectedProjectId = ref(null);
const selectedCategoryId = ref(null);
const description = ref('');

const isSaving = ref(false);
const errorMessage = ref('');
const isCloneMode = ref(false);
const editableDate = ref('');
const isInlineSaving = ref(false);
const isInitialLoad = ref(true);
const isDateChanged = ref(false); 
const isDeleteConfirmVisible = ref(false);

// --- СОСТОЯНИЯ СОЗДАНИЯ ---
const isCreatingAccount = ref(false); const newAccountName = ref(''); const newAccountInput = ref(null);
const isCreatingProject = ref(false); const newProjectName = ref(''); const newProjectInput = ref(null);
const isCreatingCategory = ref(false); const newCategoryName = ref(''); const newCategoryInput = ref(null);
const showAccountSuggestions = ref(false); const showCategorySuggestions = ref(false);

const showCreateOwnerModal = ref(false);
const ownerTypeToCreate = ref('company'); 
const newOwnerName = ref('');
const newOwnerInputRef = ref(null);

const showCreateContractorModal = ref(false);
const contractorTypeToCreate = ref('contractor'); 
const newContractorNameInput = ref('');
const newContractorInputRef = ref(null);

// 🟢 FIX: Флаги программного обновления (чтобы список не открывался после выбора)
const isProgrammaticAccount = ref(false);
const isProgrammaticCategory = ref(false);
const isProgrammaticContractor = ref(false);
const isProgrammaticOwner = ref(false);

// --- АВТОПОДСТАНОВКИ ---

// 1. Контрагенты (Банки/Орг)
const showContractorBankSuggestions = ref(false);
const contractorBankSuggestionsList = computed(() => {
    if (contractorTypeToCreate.value !== 'contractor') return [];
    const query = newContractorNameInput.value.trim().toLowerCase();
    if (query.length < 2) return [];
    return knownBanks.filter(bank => {
        const nameMatch = bank.name.toLowerCase().includes(query);
        const keywordMatch = bank.keywords && bank.keywords.some(k => k.toLowerCase().includes(query));
        return nameMatch || keywordMatch;
    }).slice(0, 5);
});
const selectContractorBankSuggestion = (bank) => {
    isProgrammaticContractor.value = true;
    newContractorNameInput.value = bank.name;
    showContractorBankSuggestions.value = false;
    nextTick(() => {
        newContractorInputRef.value?.focus();
        isProgrammaticContractor.value = false;
    });
};
watch(newContractorNameInput, (val) => {
    if (isProgrammaticContractor.value) return;
    showContractorBankSuggestions.value = val.length >= 2;
});

// 2. Владельцы (Банки/Орг)
const showOwnerBankSuggestions = ref(false);
const ownerBankSuggestionsList = computed(() => {
    if (ownerTypeToCreate.value !== 'company') return [];
    const query = newOwnerName.value.trim().toLowerCase();
    if (query.length < 2) return [];
    return knownBanks.filter(bank => {
        const nameMatch = bank.name.toLowerCase().includes(query);
        const keywordMatch = bank.keywords && bank.keywords.some(k => k.toLowerCase().includes(query));
        return nameMatch || keywordMatch;
    }).slice(0, 5);
});
const selectOwnerBankSuggestion = (bank) => {
    isProgrammaticOwner.value = true;
    newOwnerName.value = bank.name;
    showOwnerBankSuggestions.value = false;
    nextTick(() => {
        newOwnerInputRef.value?.focus();
        isProgrammaticOwner.value = false;
    });
};
watch(newOwnerName, (val) => {
    if (isProgrammaticOwner.value) return;
    showOwnerBankSuggestions.value = val.length >= 2;
});

// 3. Счета
const accountSuggestionsList = computed(() => {
    const query = newAccountName.value.trim().toLowerCase();
    if (query.length < 2) return [];
    return accountSuggestions.filter(acc => acc.name.toLowerCase().includes(query)).slice(0, 4);
});
const selectAccountSuggestion = (acc) => {
    isProgrammaticAccount.value = true;
    newAccountName.value = acc.name;
    showAccountSuggestions.value = false;
    nextTick(() => {
        newAccountInput.value?.focus();
        isProgrammaticAccount.value = false;
    });
};
const handleAccountInputBlur = () => { setTimeout(() => { showAccountSuggestions.value = false; }, 200); };
const handleAccountInputFocus = () => { if (newAccountName.value.length >= 2) showAccountSuggestions.value = true; };
watch(newAccountName, (val) => { 
    if (isProgrammaticAccount.value) return;
    showAccountSuggestions.value = val.length >= 2; 
});

// 4. Категории
const categorySuggestionsList = computed(() => {
    const query = newCategoryName.value.trim().toLowerCase();
    if (query.length < 2) return [];
    return categorySuggestions.filter(c => c.name.toLowerCase().includes(query)).slice(0, 4);
});
const selectCategorySuggestion = (c) => {
    isProgrammaticCategory.value = true;
    newCategoryName.value = c.name;
    showCategorySuggestions.value = false;
    nextTick(() => {
        newCategoryInput.value?.focus();
        isProgrammaticCategory.value = false;
    });
};
const handleCategoryInputBlur = () => { setTimeout(() => { showCategorySuggestions.value = false; }, 200); };
const handleCategoryInputFocus = () => { if (newCategoryName.value.length >= 2) showCategorySuggestions.value = true; };
watch(newCategoryName, (val) => {
    if (isProgrammaticCategory.value) return;
    showCategorySuggestions.value = val.length >= 2;
});


// --- COMPUTED: OPTIONS ---
const accountOptions = computed(() => {
  const opts = mainStore.currentAccountBalances.map(acc => ({
    value: acc._id,
    label: acc.name,
    rightText: `${formatNumber(Math.abs(acc.balance))} ₸`, 
    isSpecial: false
  }));
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать новый счет', isSpecial: true });
  return opts;
});

const ownerOptions = computed(() => {
  const opts = [];
  if (mainStore.currentCompanyBalances.length) {
      opts.push({ label: 'Компании', isHeader: true });
      mainStore.currentCompanyBalances.forEach(c => { 
          opts.push({ value: `company-${c._id}`, label: c.name, rightText: `${formatNumber(Math.abs(c.balance || 0))} ₸` }); 
      });
  }
  if (mainStore.currentIndividualBalances.length) {
      opts.push({ label: 'Физлица', isHeader: true });
      mainStore.currentIndividualBalances.forEach(i => { 
          const nameLower = i.name.trim().toLowerCase();
          if (nameLower === 'розничные клиенты' || nameLower === 'розница') return;
          opts.push({ value: `individual-${i._id}`, label: i.name, rightText: `${formatNumber(Math.abs(i.balance || 0))} ₸` }); 
      });
  }
  opts.push({ isActionRow: true }); 
  return opts;
});

const contractorOptions = computed(() => {
  const opts = [];
  const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
  const filteredContractors = mainStore.contractors.filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));

  opts.push({ label: 'Контрагенты (Кому платим)', isHeader: true });
  filteredContractors.forEach(c => {
      opts.push({ value: `contr_${c._id}`, label: c.name });
  });
  
  const filteredIndividuals = mainStore.individuals.filter(i => {
      const name = i.name.trim().toLowerCase();
      return name !== 'розничные клиенты' && name !== 'розница';
  });

  opts.push({ label: 'Физлица (Кому платим)', isHeader: true });
  filteredIndividuals.forEach(i => {
      opts.push({ value: `ind_${i._id}`, label: i.name });
  });

  opts.push({ isActionRow: true });
  return opts;
});

const projectOptions = computed(() => {
  const opts = mainStore.projects.map(p => ({ value: p._id, label: p.name }));
  opts.unshift({ value: null, label: 'Без проекта' });
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать проект', isSpecial: true });
  return opts;
});

const categoryOptions = computed(() => {
  const prepayIds = mainStore.getPrepaymentCategoryIds;
  const validCats = mainStore.categories.filter(c => {
    const name = c.name.toLowerCase().trim();
    if (['перевод', 'transfer', 'остаток долга', 'возврат', 'вывод', 'вывод средств'].includes(name)) return false;
    if (c.isPrepayment || prepayIds.includes(c._id)) return false;
    return true;
  });
  
  const opts = validCats.map(c => ({ value: c._id, label: c.name }));
  opts.unshift({ value: null, label: 'Без категории' });
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать категорию', isSpecial: true });
  return opts;
});

// --- HELPER COMPUTED ---
const isEditMode = computed(() => !!props.operationToEdit && !isCloneMode.value);
const title = computed(() => isCloneMode.value ? 'Копия: Расход' : (isEditMode.value ? 'Редактировать Расход' : 'Новый Расход'));
const buttonText = computed(() => isEditMode.value ? 'Сохранить' : 'Добавить расход');

const myCreditsProjectId = computed(() => {
    const p = mainStore.projects.find(x => x.name.trim().toLowerCase() === 'мои кредиты');
    return p ? p._id : null;
});

// --- LOGIC WATCHERS ---

// 1. Авто-выбор владельца по счету
watch(selectedAccountId, (newVal) => {
    if (!newVal || isInitialLoad.value) return;
    const acc = mainStore.accounts.find(a => a._id === newVal);
    if (acc) {
        if (acc.companyId) selectedOwner.value = `company-${typeof acc.companyId === 'object' ? acc.companyId._id : acc.companyId}`;
        else if (acc.individualId) selectedOwner.value = `individual-${typeof acc.individualId === 'object' ? acc.individualId._id : acc.individualId}`;
    }
});

// 2. Умная связь: Контрагент -> Проект/Категория (особенно для Кредитов)
watch(selectedContractorValue, (newVal) => {
    if (isInitialLoad.value || !newVal) return;

    // Проверка на Банк
    const [prefix, id] = newVal.split('_');
    let isBank = false;
    if (prefix === 'contr') {
        const c = mainStore.contractors.find(x => x._id === id);
        if (c) {
            const nameLower = c.name.toLowerCase().trim();
            isBank = knownBanks.some(b => b.name.toLowerCase() === nameLower || (b.keywords && b.keywords.some(k => nameLower.includes(k))));
        }
    }

    if (isBank) {
        // Если Банк -> Проект "Мои кредиты", Категория "Погашение займов"
        if (myCreditsProjectId.value) selectedProjectId.value = myCreditsProjectId.value;
        if (mainStore.loanRepaymentCategoryId) selectedCategoryId.value = mainStore.loanRepaymentCategoryId;
        return;
    }

    // Если обычный контрагент - можно подтянуть defaults (если есть в базе)
    let entity = null;
    if (prefix === 'contr') entity = mainStore.contractors.find(c => c._id === id);
    else entity = mainStore.individuals.find(i => i._id === id);

    if (entity) {
        if (entity.defaultProjectId) selectedProjectId.value = typeof entity.defaultProjectId === 'object' ? entity.defaultProjectId._id : entity.defaultProjectId;
        if (entity.defaultCategoryId) selectedCategoryId.value = typeof entity.defaultCategoryId === 'object' ? entity.defaultCategoryId._id : entity.defaultCategoryId;
    }
});

// 3. Умная связь: Проект "Мои кредиты" -> Категория "Погашение займов"
watch(selectedProjectId, (newProj) => {
    if (isInitialLoad.value) return;
    if (newProj && myCreditsProjectId.value && newProj === myCreditsProjectId.value) {
        if (mainStore.loanRepaymentCategoryId) selectedCategoryId.value = mainStore.loanRepaymentCategoryId;
    }
});

// 🟢 Следим за изменением даты вручную
watch(editableDate, (newVal, oldVal) => {
    if (!isInitialLoad.value && oldVal && newVal !== oldVal) isDateChanged.value = true;
});

// --- METHODS ---
const onAmountInput = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    amount.value = formatNumber(raw);
};

// 🟢 ИСПОЛЬЗУЕМ ЛОКАЛЬНОЕ ВРЕМЯ
const toInputDate = (dateObj) => { 
    if (!dateObj) return '';
    const d = new Date(dateObj);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const toDisplayDate = (d) => { if (!d) return ''; const [y,m,d_] = d.split('-'); return `${d_}.${m}.${y}`; };

const handleSave = async () => {
    if (isSaving.value || isInlineSaving.value) return;
    errorMessage.value = '';
    
    const rawAmount = parseFloat(amount.value.replace(/\s/g, ''));
    if (!rawAmount || rawAmount <= 0) { errorMessage.value = 'Введите сумму'; return; }
    if (!selectedAccountId.value) { errorMessage.value = 'Выберите счет'; return; }
    
    isSaving.value = true;
    
    // Владелец
    let cId = null, iId = null;
    if (selectedOwner.value) {
        const [type, id] = selectedOwner.value.split('-');
        if (type === 'company') cId = id; else iId = id;
    }

    // Контрагент (Получатель)
    let contrId = null, contrIndId = null;
    if (selectedContractorValue.value) {
        const [type, id] = selectedContractorValue.value.split('_');
        if (type === 'contr') contrId = id; else contrIndId = id;
    }

    // Расход всегда с минусом
    const finalAmount = -Math.abs(rawAmount);

    let targetCellIndex = undefined;
    if (!isDateChanged.value && (!isEditMode.value || !isCloneMode.value)) {
        targetCellIndex = props.cellIndex;
    }

    const [y, m, d] = editableDate.value.split('-').map(Number);
    // Инициализируем дату
    let finalDate = new Date(y, m - 1, d, 12, 0, 0);

    if (!isDateChanged.value) {
        if (typeof props.cellIndex === 'number' && props.cellIndex >= 0 && props.cellIndex <= 23) {
             finalDate.setHours(props.cellIndex, 0, 0, 0);
        }
        else if (props.date) {
             const original = new Date(props.date);
             finalDate.setHours(original.getHours(), original.getMinutes(), 0, 0);
        }
    }

    const payload = {
        type: 'expense',
        amount: finalAmount,
        date: finalDate, 
        accountId: selectedAccountId.value,
        companyId: cId,
        individualId: iId,
        contractorId: contrId,
        counterpartyIndividualId: contrIndId,
        categoryId: selectedCategoryId.value,
        projectId: selectedProjectId.value,
        description: description.value,
        cellIndex: targetCellIndex, 
        totalDealAmount: 0,
        prepaymentId: undefined
    };
    
    // Сохраняем Defaults для контрагента (Обучение системы)
    if (contrId || contrIndId) {
         const type = contrId ? 'contractors' : 'individuals';
         const id = contrId || contrIndId;
         const updateData = { _id: id };
         let needsUpdate = false;
         if (selectedProjectId.value) { updateData.defaultProjectId = selectedProjectId.value; needsUpdate = true; }
         if (selectedCategoryId.value) { updateData.defaultCategoryId = selectedCategoryId.value; needsUpdate = true; }
         if (needsUpdate) mainStore.batchUpdateEntities(type, [updateData]);
    }

    emit('save', { 
        mode: isEditMode.value ? 'edit' : 'create', 
        id: props.operationToEdit?._id, 
        data: payload,
        originalOperation: props.operationToEdit
    });
};

// --- INLINE CREATE HANDLERS ---
const handleAccountChange = (val) => { if (val === '--CREATE_NEW--') { selectedAccountId.value = null; isCreatingAccount.value = true; nextTick(() => newAccountInput.value?.focus()); } else { selectedAccountId.value = val; } };
const handleProjectChange = (val) => { if (val === '--CREATE_NEW--') { selectedProjectId.value = null; isCreatingProject.value = true; nextTick(() => newProjectInput.value?.focus()); } };
const handleCategoryChange = (val) => { if (val === '--CREATE_NEW--') { selectedCategoryId.value = null; isCreatingCategory.value = true; nextTick(() => newCategoryInput.value?.focus()); } };

const cancelCreateAccount = () => { isCreatingAccount.value = false; newAccountName.value = ''; };
const saveNewAccount = async () => {
    if (isInlineSaving.value) return; const name = newAccountName.value.trim(); if (!name) return;
    isInlineSaving.value = true;
    try {
        let cId = null, iId = null; 
        if (selectedOwner.value) { const [t, id] = selectedOwner.value.split('-'); if (t==='company') cId=id; else iId=id; }
        const newItem = await mainStore.addAccount({ name, companyId: cId, individualId: iId });
        selectedAccountId.value = newItem._id; cancelCreateAccount();
    } catch(e) { console.error(e); } finally { isInlineSaving.value = false; }
};

const cancelCreateProject = () => { isCreatingProject.value = false; newProjectName.value = ''; };
const saveNewProject = async () => {
    if (isInlineSaving.value) return; const name = newProjectName.value.trim(); if (!name) return;
    isInlineSaving.value = true; try { const item = await mainStore.addProject(name); selectedProjectId.value = item._id; cancelCreateProject(); } catch(e){ console.error(e); } finally { isInlineSaving.value = false; }
};

const cancelCreateCategory = () => { isCreatingCategory.value = false; newCategoryName.value = ''; };
const saveNewCategory = async () => {
    if (isInlineSaving.value) return; const name = newCategoryName.value.trim(); if (!name) return;
    isInlineSaving.value = true; try { const item = await mainStore.addCategory(name); selectedCategoryId.value = item._id; cancelCreateCategory(); } catch(e){ console.error(e); } finally { isInlineSaving.value = false; }
};

// --- MODAL CREATE HANDLERS ---
const openCreateOwnerModal = (type) => { ownerTypeToCreate.value = type; newOwnerName.value = ''; showCreateOwnerModal.value = true; nextTick(() => newOwnerInputRef.value?.focus()); };
const cancelCreateOwner = () => { showCreateOwnerModal.value = false; newOwnerName.value = ''; if (!selectedOwner.value) selectedOwner.value = null; };
const saveNewOwner = async () => {
    if (isInlineSaving.value) return; const name = newOwnerName.value.trim(); if (!name) return;
    isInlineSaving.value = true; try { 
        let item; if (ownerTypeToCreate.value === 'company') item = await mainStore.addCompany(name); else item = await mainStore.addIndividual(name);
        selectedOwner.value = `${ownerTypeToCreate.value}-${item._id}`; showCreateOwnerModal.value = false;
    } catch(e){ console.error(e); } finally { isInlineSaving.value = false; }
};

const openCreateContractorModal = (type) => { contractorTypeToCreate.value = type; newContractorNameInput.value = ''; showCreateContractorModal.value = true; nextTick(() => newContractorInputRef.value?.focus()); };
const cancelCreateContractorModal = () => { showCreateContractorModal.value = false; newContractorNameInput.value = ''; if (!selectedContractorValue.value) selectedContractorValue.value = null; };
const saveNewContractorModal = async () => {
    if (isInlineSaving.value) return; const name = newContractorNameInput.value.trim(); if (!name) return;
    isInlineSaving.value = true; try {
        let item; if (contractorTypeToCreate.value === 'contractor') { item = await mainStore.addContractor(name); selectedContractorValue.value = `contr_${item._id}`; } 
        else { item = await mainStore.addIndividual(name); selectedContractorValue.value = `ind_${item._id}`; }
        showCreateContractorModal.value = false;
    } catch(e){ console.error(e); } finally { isInlineSaving.value = false; }
};

// --- UTILS ---
const handleCopyClick = () => { isCloneMode.value = true; editableDate.value = toInputDate(new Date()); nextTick(() => amountInput.value?.focus()); };
const handleDeleteClick = () => { isDeleteConfirmVisible.value = true; };
const onDeleteConfirmed = () => { if (props.operationToEdit) { emit('operation-deleted', props.operationToEdit); mainStore.deleteOperation(props.operationToEdit); } emit('close'); };

// --- INIT ---
onMounted(async () => {
    isInitialLoad.value = true;
    if (props.date) editableDate.value = toInputDate(props.date);
    
    if (props.operationToEdit) {
        const op = props.operationToEdit;
        amount.value = formatNumber(Math.abs(op.amount));
        selectedAccountId.value = op.accountId?._id || op.accountId;
        selectedProjectId.value = op.projectId?._id || op.projectId;
        selectedCategoryId.value = op.categoryId?._id || op.categoryId;
        description.value = op.description || '';
        if (op.date) editableDate.value = toInputDate(new Date(op.date));

        if (op.companyId) selectedOwner.value = `company-${op.companyId._id || op.companyId}`;
        else if (op.individualId) selectedOwner.value = `individual-${op.individualId._id || op.individualId}`;

        if (op.contractorId) selectedContractorValue.value = `contr_${op.contractorId._id || op.contractorId}`;
        else if (op.counterpartyIndividualId) selectedContractorValue.value = `ind_${op.counterpartyIndividualId._id || op.counterpartyIndividualId}`;
    } else {
        nextTick(() => amountInput.value?.focus());
    }
    await nextTick();
    isInitialLoad.value = false;
});
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content theme-expense">
      <h3>{{ title }}</h3>
      
      <!-- СУММА -->
      <div class="custom-input-box input-spacing" :class="{ 'has-value': !!amount }">
          <div class="input-inner-content">
             <span v-if="amount" class="floating-label">Сумма расхода, ₸</span>
             <input type="text" inputmode="decimal" v-model="amount" placeholder="0 ₸" class="real-input" ref="amountInput" @input="onAmountInput" />
          </div>
      </div>

      <template v-if="!showCreateOwnerModal && !showCreateContractorModal">
          <!-- СЧЕТ -->
          <div v-if="!isCreatingAccount" class="input-spacing">
              <BaseSelect v-model="selectedAccountId" :options="accountOptions" placeholder="Счет списания" label="Счет списания" @change="handleAccountChange" />
          </div>
          <div v-else class="inline-create-form input-spacing relative">
              <input 
                  type="text" 
                  v-model="newAccountName" 
                  placeholder="Название счета" 
                  ref="newAccountInput" 
                  @keyup.enter="saveNewAccount" 
                  @keyup.esc="cancelCreateAccount" 
                  @blur="handleAccountInputBlur"
                  @focus="handleAccountInputFocus"
              />
              <button @click="saveNewAccount" class="btn-inline-save">✓</button>
              <button @click="cancelCreateAccount" class="btn-inline-cancel">✕</button>
              <ul v-if="showAccountSuggestions && accountSuggestionsList.length" class="bank-suggestions-list"><li v-for="(acc, i) in accountSuggestionsList" :key="i" @mousedown.prevent="selectAccountSuggestion(acc)">{{ acc.name }}</li></ul>
          </div>

          <!-- ВЛАДЕЛЕЦ -->
          <div class="input-spacing">
              <BaseSelect v-model="selectedOwner" :options="ownerOptions" placeholder="Кто платит" label="Кто платит (Владелец)">
                  <template #action-item>
                      <div class="dual-action-row">
                          <button @click="openCreateOwnerModal('company')" class="btn-dual-action left">+ Создать Компанию</button>
                          <button @click="openCreateOwnerModal('individual')" class="btn-dual-action right">+ Создать Физлицо</button>
                      </div>
                  </template>
              </BaseSelect>
          </div>

          <!-- КОНТРАГЕНТ (Кому) -->
          <div class="input-spacing">
              <BaseSelect v-model="selectedContractorValue" :options="contractorOptions" placeholder="Кому (Контрагент)" label="Кому (Контрагент)">
                  <template #action-item>
                      <div class="dual-action-row">
                          <button @click="openCreateContractorModal('contractor')" class="btn-dual-action left">+ Созд. контрагента</button>
                          <button @click="openCreateContractorModal('individual')" class="btn-dual-action right">+ Созд. физлицо</button>
                      </div>
                  </template>
              </BaseSelect>
          </div>

          <!-- ПРОЕКТ -->
          <div v-if="!isCreatingProject" class="input-spacing">
              <BaseSelect v-model="selectedProjectId" :options="projectOptions" placeholder="Проект" label="Проект" @change="handleProjectChange" />
          </div>
          <div v-else class="inline-create-form input-spacing">
              <input type="text" v-model="newProjectName" placeholder="Название проекта" ref="newProjectInput" @keyup.enter="saveNewProject" @keyup.esc="cancelCreateProject" />
              <button @click="saveNewProject" class="btn-inline-save">✓</button>
              <button @click="cancelCreateProject" class="btn-inline-cancel">✕</button>
          </div>

          <!-- КАТЕГОРИЯ -->
          <div v-if="!isCreatingCategory" class="input-spacing">
              <BaseSelect v-model="selectedCategoryId" :options="categoryOptions" placeholder="Категория" label="Категория" @change="handleCategoryChange" />
          </div>
          <div v-else class="inline-create-form input-spacing relative">
              <input 
                  type="text" 
                  v-model="newCategoryName" 
                  placeholder="Название категории" 
                  ref="newCategoryInput" 
                  @keyup.enter="saveNewCategory" 
                  @keyup.esc="cancelCreateCategory" 
                  @blur="handleCategoryInputBlur"
                  @focus="handleCategoryInputFocus"
              />
              <button @click="saveNewCategory" class="btn-inline-save">✓</button>
              <button @click="cancelCreateCategory" class="btn-inline-cancel">✕</button>
              <ul v-if="showCategorySuggestions && categorySuggestionsList.length" class="bank-suggestions-list"><li v-for="(c, i) in categorySuggestionsList" :key="i" @mousedown.prevent="selectCategorySuggestion(c)">{{ c.name }}</li></ul>
          </div>

        

          <!-- ДАТА -->
          <div class="custom-input-box input-spacing has-value date-box">
             <div class="input-inner-content">
                <span class="floating-label">Дата операции</span>
                <div class="date-display-row">
                   <span class="date-value-text">{{ toDisplayDate(editableDate) }}</span>
                   <input type="date" v-model="editableDate" class="real-input date-overlay" :min="minAllowedDate ? toInputDate(minAllowedDate) : null" :max="maxAllowedDate ? toInputDate(maxAllowedDate) : null" />
                   <span class="calendar-icon">📅</span> 
                </div>
             </div>
          </div>
          
          <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

          <!-- 🟢 НИЖНЯЯ ПАНЕЛЬ ДЕЙСТВИЙ (ОБЩИЙ СТИЛЬ С IncomePopup) -->
          <div class="popup-actions-row">
              <!-- СЛЕВА: Основное действие (Сохранить) -->
              <button class="btn-submit btn-expense save-wide" @click="handleSave" :disabled="isSaving || isInlineSaving">
                  {{ buttonText }}
              </button>
              
              <!-- СПРАВА: Иконки Копировать/Удалить (только в режиме редактирования) -->
              <div v-if="isEditMode" class="icon-actions">
                  <button class="icon-btn copy-btn" title="Копировать" @click="handleCopyClick" :disabled="isSaving">
                      <svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg>
                  </button>
                  <button class="icon-btn delete-btn" title="Удалить" @click="handleDeleteClick" :disabled="isSaving">
                      <svg class="icon-stroke" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
              </div>
          </div>
      </template>

      <!-- МОДАЛКИ СОЗДАНИЯ -->
      <template v-if="showCreateOwnerModal">
        <div class="smart-create-owner">
          <h4 class="smart-create-title">Новый владелец</h4>
          <div class="smart-create-tabs">
            <button :class="{ active: ownerTypeToCreate === 'company' }" @click="ownerTypeToCreate = 'company'">Компания</button>
            <button :class="{ active: ownerTypeToCreate === 'individual' }" @click="ownerTypeToCreate = 'individual'">Физлицо</button>
          </div>
          <div class="input-wrapper relative">
              <input type="text" v-model="newOwnerName" :placeholder="ownerTypeToCreate === 'company' ? 'Название компании' : 'Имя Физлица'" ref="newOwnerInputRef" class="form-input input-spacing" @keyup.enter="saveNewOwner" @keyup.esc="cancelCreateOwner" @blur="handleOwnerInputBlur" @focus="handleOwnerInputFocus" />
              <ul v-if="showOwnerBankSuggestions && ownerBankSuggestionsList.length > 0" class="bank-suggestions-list">
                  <li v-for="(bank, idx) in ownerBankSuggestionsList" :key="idx" @mousedown.prevent="selectOwnerBankSuggestion(bank)">{{ bank.name }}</li>
              </ul>
          </div>
          <div class="smart-create-actions">
            <button @click="cancelCreateOwner" class="btn-cancel-white">Отмена</button>
            <button @click="saveNewOwner" class="btn-create-green">Создать</button>
          </div>
        </div>
      </template>

      <template v-if="showCreateContractorModal">
        <div class="smart-create-owner">
          <h4 class="smart-create-title">Новый контрагент</h4>
          <div class="smart-create-tabs">
            <button :class="{ active: contractorTypeToCreate === 'contractor' }" @click="contractorTypeToCreate = 'contractor'">ТОО / ИП / БАНК</button>
            <button :class="{ active: contractorTypeToCreate === 'individual' }" @click="contractorTypeToCreate = 'individual'">Физлицо</button>
          </div>
          <div class="input-wrapper relative">
              <input type="text" v-model="newContractorNameInput" :placeholder="contractorTypeToCreate === 'contractor' ? 'Название организации' : 'Имя Физлица'" ref="newContractorInputRef" class="form-input input-spacing" @keyup.enter="saveNewContractorModal" @keyup.esc="cancelCreateContractorModal" @blur="handleContractorInputBlur" @focus="handleContractorInputFocus" />
              <ul v-if="showContractorBankSuggestions && contractorBankSuggestionsList.length > 0" class="bank-suggestions-list">
                  <li v-for="(bank, idx) in contractorBankSuggestionsList" :key="idx" @mousedown.prevent="selectContractorBankSuggestion(bank)">{{ bank.name }}</li>
              </ul>
          </div>
          <div class="smart-create-actions">
            <button @click="cancelCreateContractorModal" class="btn-cancel-white">Отмена</button>
            <button @click="saveNewContractorModal" class="btn-create-green">Создать</button>
          </div>
        </div>
      </template>

    </div>
    
    <ConfirmationPopup v-if="isDeleteConfirmVisible" title="Подтвердите удаление" message="Вы уверены?" @close="isDeleteConfirmVisible = false" @confirm="onDeleteConfirmed" />
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); margin: 1rem; }
.theme-expense { border-top: 4px solid #F36F3F; }
h3 { margin: 0; margin-bottom: 1.5rem; font-size: 22px; font-weight: 700; color: #1a1a1a; }

.custom-input-box { width: 100%; height: 54px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; padding: 0 14px; display: flex; align-items: center; position: relative; transition: all 0.2s ease; box-sizing: border-box; }
.custom-input-box:focus-within { border-color: #F36F3F; box-shadow: 0 0 0 1px rgba(243, 111, 63, 0.2); }
.input-inner-content { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; }
/* 🟢 Цвет шрифтов темнее */
.floating-label { font-size: 11px; color: #555; margin-bottom: -2px; margin-top: 4px; font-weight: 500; }
.real-input { width: 100%; border: none; background: transparent; padding: 0; font-size: 15px; color: #111; font-weight: 600; outline: none; }
/* 🟢 Цвет шрифтов темнее */
.main-input { width: 100%; height: 48px; padding: 0 14px; border: 1px solid #E0E0E0; border-radius: 8px; font-size: 15px; background: #fff; box-sizing: border-box; color: #111; font-weight: 500; }
.main-input:focus { outline: none; border-color: #222; }
/* 🟢 Плейсхолдер темнее */
.real-input::placeholder, .main-input::placeholder { color: #777; font-weight: 400; }

.input-spacing { margin-bottom: 12px; }
.date-display-row { display: flex; justify-content: space-between; align-items: center; position: relative; width: 100%; }
.date-value-text { font-size: 15px; font-weight: 500; color: #1a1a1a; }
.date-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; z-index: 2; }
.calendar-icon { font-size: 16px; color: #555; }

/* 🟢 Actions Row (ОБЩИЙ СТИЛЬ С IncomePopup) */
.popup-actions-row { 
    display: flex; 
    align-items: center; 
    /* justify-content: space-between - Убрано, чтобы flex-grow работало корректно */
    gap: 10px; 
    margin-top: 2rem; 
}

/* 🟢 Кнопка Сохранить (ОБЩИЙ СТИЛЬ) */
.save-wide { 
    flex: 1 1 auto; 
    height: 54px; /* Увеличено до 54px, как в IncomePopup */
}

.btn-submit { 
    width: 100%; 
    /* height: 50px; - Переопределяется save-wide */
    border-radius: 8px; 
    border: none; 
    color: white; 
    font-size: 16px; 
    font-weight: 600; 
    cursor: pointer; 
    transition: background-color 0.2s; 
}
.btn-expense { background-color: #F36F3F; }
.btn-expense:hover { background-color: #d95a30; }

/* 🟢 Иконки действий (ОБЩИЙ СТИЛЬ: margin-left: auto) */
.icon-actions { 
    display: flex; 
    gap: 10px; 
    margin-left: auto; /* Прижимает иконки вправо */
}

.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 10px; cursor: pointer; background: #F4F4F4; border: 1px solid #E0E0E0; color: #333; transition: all 0.2s; padding: 0; }
.copy-btn:hover { background: #E8F5E9; border-color: #A5D6A7; color: #34C759; }
.copy-btn:hover { background: #E8F5E9; border-color: #A5D6A7; color: #34C759; }
.delete-btn:hover { border-color: #ff3b30; background: #fff5f5; }
.delete-btn svg { stroke: #555; }
.delete-btn:hover svg { stroke: #ff3b30; }
.icon-stroke { width: 20px; height: 20px; stroke: #333; fill: none; transition: stroke 0.2s; }
.icon { width: 20px; height: 20px; fill: currentColor; display: block; }
.error-message { color: #FF3B30; text-align: center; margin-top: 1rem; font-size: 14px; }
.inline-create-form { display: flex; align-items: center; gap: 8px; margin-bottom: 15px; }
.inline-create-form input { flex: 1; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; box-sizing: border-box; }
.inline-create-form input:focus { outline: none; border-color: #222; }
.inline-create-form button { flex-shrink: 0; border: none; border-radius: 8px; color: white; font-size: 16px; cursor: pointer; height: 48px; width: 48px; padding: 0; line-height: 1; display: flex; align-items: center; justify-content: center; }
.btn-inline-save { background-color: #34C759; }
.btn-inline-cancel { background-color: #FF3B30; }

.smart-create-owner { border-top: 1px solid #E0E0E0; margin-top: 1.5rem; padding-top: 1.5rem; }
.smart-create-title { font-size: 18px; font-weight: 600; text-align: center; margin-bottom: 1.5rem; }
.smart-create-tabs { display: flex; justify-content: center; gap: 10px; margin-bottom: 1.5rem; }
.smart-create-tabs button { flex: 1; padding: 12px; font-size: 14px; font-weight: 500; border: 1px solid #E0E0E0; border-radius: 8px; background: #FFFFFF; color: #333; cursor: pointer; transition: all 0.2s; }
.smart-create-tabs button.active { background: #34C759; color: #FFFFFF;  }
.smart-create-actions { display: flex; gap: 10px; margin-top: 1rem; }
.smart-create-actions .btn-submit { flex: 1; }

.form-input { width: 100%; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; font-size: 15px; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.form-input:focus { outline: none; border-color: #2da84e;  }
.dual-action-row { display: flex; width: 100%; height: 46px; border-top: 1px solid #eee; }
.btn-dual-action { flex: 1; border: none; background-color: #fff; font-size: 13px; font-weight: 600; color: #007AFF; cursor: pointer; transition: background-color 0.2s; white-space: nowrap; }
.btn-dual-action:hover { background-color: #f0f8ff; }
.btn-dual-action.left { border-right: 1px solid #eee; border-bottom-left-radius: 8px; }
.btn-dual-action.right { border-bottom-right-radius: 8px; }
.btn-create-green { background-color: #34c759; color: white; width: 50%;}
.btn-create-green:hover:not(:disabled) { background-color: #2da84e; width: 50%;}
.btn-cancel-white { background-color: #ffffff; color: #333333; border: 1px solid #dddddd !important; width: 50%;}
.btn-cancel-white:hover:not(:disabled) { background-color: #f5f5f5; }
.bank-suggestions-list { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #E0E0E0; border-top: none; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); z-index: 2000; list-style: none; padding: 0; margin: 0; max-height: 160px; overflow-y: auto; }
.bank-suggestions-list li { padding: 10px 14px; font-size: 14px; color: #333; cursor: pointer; border-bottom: 1px solid #f5f5f5; }
.bank-suggestions-list li:last-child { border-bottom: none; }
.bank-suggestions-list li:hover { background-color: #f9f9f9; }
.relative { position: relative; }
.error { color: #FF3B30; text-align: center; margin-top: 10px; font-size: 13px; }
</style>