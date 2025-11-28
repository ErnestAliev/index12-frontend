<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber as formatBalance } from '@/utils/formatters.js'; 
import ConfirmationPopup from './ConfirmationPopup.vue';
import BaseSelect from './BaseSelect.vue'; 

/**
 * * --- МЕТКА ВЕРСИИ: v27.1 - CONTRACTOR FILTER FIX ---
 * * ВЕРСИЯ: 27.1 - Исправление списка физлиц-контрагентов
 * * ДАТА: 2025-11-28
 * * ЧТО ИЗМЕНЕНО:
 * 1. (LOGIC) В `contractorOptions` убрана фильтрация `!ownerIds.has(i._id)`. 
 * Теперь любое физлицо может быть выбрано как контрагент (получатель расхода), 
 * даже если оно владеет каким-то счетом.
 */

const mainStore = useMainStore();

const props = defineProps({
  type: { type: String, required: true },
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  operationToEdit: { type: Object, default: null },
  minAllowedDate: { type: Date, default: null },
  maxAllowedDate: { type: Date, default: null }
});

const emit = defineEmits([
  'close', 'operation-deleted', 'operation-moved', 'trigger-prepayment', 'save'
]);

// --- ДАННЫЕ ---
const amount = ref('');
const selectedAccountId = ref(null);
const selectedOwner = ref(null);
const selectedContractorValue = ref(null); // ID контрагента или физлица (prefix)
const selectedCategoryId = ref(null);
const selectedProjectId = ref(null);

const errorMessage = ref('');
const amountInput = ref(null);
const isInlineSaving = ref(false);
const isInitialLoad = ref(true); 

// --- INLINE CREATE STATES ---
const isCreatingAccount = ref(false); const newAccountName = ref(''); const newAccountInput = ref(null);
const isCreatingProject = ref(false); const newProjectName = ref(''); const newProjectInput = ref(null);
const isCreatingCategory = ref(false); const newCategoryName = ref(''); const newCategoryInput = ref(null);

const showCreateOwnerModal = ref(false);
const ownerTypeToCreate = ref('company'); 
const newOwnerName = ref('');
const newOwnerInputRef = ref(null);

const showCreateContractorModal = ref(false);
const contractorTypeToCreate = ref('contractor'); // 'contractor' | 'individual'
const newContractorNameInput = ref('');
const newContractorInputRef = ref(null);

const isDeleteConfirmVisible = ref(false);
const isCloneMode = ref(false);

// Наблюдатель за типом операции
watch(() => props.type, (newType, oldType) => {
  if (newType !== oldType) {
    selectedCategoryId.value = null;
  }
});

// --- FORMATTERS ---
const formatNumber = (numStr) => {
  const clean = `${numStr}`.replace(/[^0-9]/g, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const toInputDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const toDisplayDate = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}
const toInputDateString = (date) => date ? toInputDate(date) : null;

const editableDate = ref(toInputDate(props.date));
const minDateString = computed(() => toInputDateString(props.minAllowedDate));
const maxDateString = computed(() => toInputDateString(props.maxAllowedDate));

// 🟢 ТЕКСТЫ ДЛЯ ИНТЕРФЕЙСА
const isIncome = computed(() => props.type === 'income');

const txtAmount = computed(() => ({ 
  ph: isIncome.value ? 'Вношу сумму ₸' : 'Трачу сумму ₸', 
  lbl: 'Сумма, ₸' 
}));

const isIndividualAccount = computed(() => {
    if (!selectedAccountId.value) return false;
    const acc = mainStore.accounts.find(a => a._id === selectedAccountId.value);
    return acc && !!acc.individualId;
});

const txtAccount = computed(() => {
    const suffix = isIndividualAccount.value ? ' (Физлица)' : '';
    const base = isIncome.value ? 'На счет' : 'Со счета';
    return { ph: base + suffix, lbl: base + suffix };
});

const txtOwner = computed(() => {
    const suffix = isIndividualAccount.value ? ' (Физлицо)' : '';
    return { ph: 'Владелец счета' + suffix, lbl: 'Владелец счета' + suffix };
});

const contractorLabel = computed(() => {
    if (selectedContractorValue.value && selectedContractorValue.value.startsWith('ind_')) {
        return isIncome.value ? 'От физлица' : 'Физлицу';
    }
    return isIncome.value ? 'От контрагента' : 'Контрагенту';
});

const txtContractor = computed(() => ({ 
    ph: contractorLabel.value, 
    lbl: contractorLabel.value 
}));

const txtProject = computed(() => ({ ph: isIncome.value ? 'Из проекта' : 'В проект', lbl: isIncome.value ? 'От проекта' : 'В проект' }));
const txtCategory = computed(() => ({ ph: 'По категории', lbl: 'Категория' }));
const txtDate = computed(() => ({ ph: '', lbl: 'Дата поступления денег' }));

// 🟢 OPTIONS
const accountOptions = computed(() => {
  const opts = mainStore.currentAccountBalances.map(acc => ({
    value: acc._id,
    label: acc.name,
    rightText: `${formatBalance(Math.abs(acc.balance))} ₸`, 
    isSpecial: false
  }));
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать новый счет', isSpecial: true });
  return opts;
});

// Владельцы (Разделены)
const ownerOptions = computed(() => {
  const opts = [];
  
  if (mainStore.currentCompanyBalances.length) {
      opts.push({ label: 'Компании', isHeader: true });
      mainStore.currentCompanyBalances.forEach(c => { 
          opts.push({ value: `company-${c._id}`, label: c.name, rightText: `${formatBalance(Math.abs(c.balance || 0))} ₸` }); 
      });
  }
  
  if (mainStore.currentIndividualBalances.length) {
      opts.push({ label: 'Физлица', isHeader: true });
      mainStore.currentIndividualBalances.forEach(i => { 
          // ФИЛЬТР: Скрываем системную сущность "Розничные клиенты"
          const nameLower = i.name.trim().toLowerCase();
          if (nameLower === 'розничные клиенты' || nameLower === 'розница') {
              return;
          }

          opts.push({ value: `individual-${i._id}`, label: i.name, rightText: `${formatBalance(Math.abs(i.balance || 0))} ₸` }); 
      });
  }

  opts.push({ isActionRow: true }); 
  return opts;
});

// 🟢 ИСПРАВЛЕНО: ФИЛЬТРАЦИЯ СПИСКА КОНТРАГЕНТОВ И ФИЗЛИЦ
const contractorOptions = computed(() => {
  const opts = [];
  
  // 1. Юрлица
  const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
  const filteredContractors = mainStore.contractors.filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));

  opts.push({ label: 'Контрагенты - ТОО, ИП', isHeader: true });
  filteredContractors.forEach(c => {
      opts.push({ value: `contr_${c._id}`, label: c.name });
  });
  
  // 2. Физлица (Убрана фильтрация владельцев счетов!)
  const filteredIndividuals = mainStore.individuals.filter(i => {
      const name = i.name.trim().toLowerCase();
      // Скрываем только системные сущности розницы, всех остальных показываем
      return name !== 'розничные клиенты' && name !== 'розница';
  });

  opts.push({ label: 'Физлица (Контрагенты)', isHeader: true });
  filteredIndividuals.forEach(i => {
      opts.push({ value: `ind_${i._id}`, label: i.name });
  });

  opts.push({ isActionRow: true });
  return opts;
});

const projectOptions = computed(() => {
  const opts = mainStore.projects.map(p => ({ value: p._id, label: p.name }));
  opts.unshift({ value: null, label: txtProject.value.ph });
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать проект', isSpecial: true });
  return opts;
});

const categoryOptions = computed(() => {
  const prepayIds = mainStore.getPrepaymentCategoryIds;
  const currentOpCatId = props.operationToEdit ? (props.operationToEdit.categoryId?._id || props.operationToEdit.categoryId || props.operationToEdit.prepaymentId?._id || props.operationToEdit.prepaymentId) : null;

  const validCats = mainStore.categories.filter(c => {
    const name = c.name.toLowerCase().trim();
    const isTransfer = name === 'перевод' || name === 'transfer';
    if (name === 'остаток долга') return true;

    const isPrepay = prepayIds.includes(c._id) || c.isPrepayment;
    const isInterComp = ['меж.комп', 'межкомпаний', 'inter-comp'].includes(name);

    if (props.operationToEdit && c._id === currentOpCatId) return true;
    return !isTransfer && !isPrepay && !isInterComp;
  });
  
  const opts = validCats.map(c => ({ value: c._id, label: c.name }));
  opts.unshift({ value: null, label: txtCategory.value.ph });
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать категорию', isSpecial: true });
  return opts;
});

// 🟢 AUTOFILL WATCHER (РОЗНИЦА -> РЕАЛИЗАЦИЯ)
watch(selectedContractorValue, (newValue) => {
    if (!newValue) return;
    if (mainStore.retailIndividualId) {
        const retailVal = `ind_${mainStore.retailIndividualId}`;
        if (newValue === retailVal) {
            if (mainStore.realizationCategoryId && !selectedCategoryId.value) {
                selectedCategoryId.value = mainStore.realizationCategoryId;
            }
        }
    }
});

// 🟢 HANDLERS
const handleAccountChange = (val) => { if (val === '--CREATE_NEW--') { selectedAccountId.value = null; showAccountInput(); } else { onAccountSelected(val); } };
const handleOwnerChange = (val) => { /* Logic handled by v-model */ };
const handleContractorChange = (val) => { onContractorSelected(val, true, true); };
const handleProjectChange = (val) => { if (val === '--CREATE_NEW--') { selectedProjectId.value = null; showProjectInput(); } };
const handleCategoryChange = (val) => { if (val === '--CREATE_NEW--') { selectedCategoryId.value = null; showCategoryInput(); } };

const triggerPrepaymentFlow = (catId) => {
    const rawAmount = parseFloat(amount.value.replace(/\s/g, '')) || 0;
    let cId = null;
    let indId = null;
    if (selectedContractorValue.value) {
        const [prefix, id] = selectedContractorValue.value.split('_');
        if (prefix === 'contr') cId = id;
        else if (prefix === 'ind') indId = id;
    }

    const currentData = {
        amount: rawAmount, accountId: selectedAccountId.value, 
        contractorId: cId,
        counterpartyIndividualId: indId, 
        projectId: selectedProjectId.value, categoryId: catId,
        companyId: selectedOwner.value?.startsWith('company') ? selectedOwner.value.split('-')[1] : null,
        individualId: selectedOwner.value?.startsWith('individual') ? selectedOwner.value.split('-')[1] : null,
        date: editableDate.value, cellIndex: props.cellIndex, operationToEdit: props.operationToEdit
    };
    emit('trigger-prepayment', currentData);
};

const handlePrepaymentClick = () => {
    errorMessage.value = '';
    const amountFromState = (amount.value || '').replace(/ /g, '');
    const amountParsed = parseFloat(amountFromState);
    if (isNaN(amountParsed) || amountParsed <= 0 || !selectedAccountId.value || !selectedOwner.value || !selectedContractorValue.value) {
        errorMessage.value = 'Для предоплаты заполните: Сумма, Счет, Владелец, Контрагент.';
        return;
    }
    const targetCatId = selectedCategoryId.value || null;
    triggerPrepaymentFlow(targetCatId);
};

const onAmountInput = (event) => {
  const input = event.target; const value = input.value; const cursorPosition = input.selectionStart;
  const rawValue = value.replace(/[^0-9]/g, ''); const formattedValue = formatNumber(rawValue);
  const cursorOffset = formattedValue.length - value.length; amount.value = formattedValue;
  if (input.value !== formattedValue) input.value = formattedValue;
  nextTick(() => { if (input.selectionStart !== undefined) input.setSelectionRange(cursorPosition + cursorOffset, cursorPosition + cursorOffset); });
};

const onAccountSelected = (accountId) => {
  const account = mainStore.accounts.find(a => a._id === accountId);
  if (account) {
    if (account.companyId) { 
        const cId = (typeof account.companyId === 'object') ? account.companyId._id : account.companyId; 
        selectedOwner.value = `company-${cId}`; 
    } 
    else if (account.individualId) { 
        const iId = (typeof account.individualId === 'object') ? account.individualId._id : account.individualId; 
        selectedOwner.value = `individual-${iId}`; 
    } 
    else { selectedOwner.value = null; }
  } else { selectedOwner.value = null; }
};

const onContractorSelected = (val, setProject = false, setCategory = false) => {
  if (!val) return;
  const [prefix, id] = val.split('_');
  
  const applyDefaults = (entity) => {
      if (entity) {
        if (setProject && entity.defaultProjectId) { 
            const pId = (entity.defaultProjectId && typeof entity.defaultProjectId === 'object') ? entity.defaultProjectId._id : entity.defaultProjectId; 
            selectedProjectId.value = pId; 
        }
        if (setCategory && entity.defaultCategoryId && entity._id !== mainStore.retailIndividualId) { 
            const cId = (entity.defaultCategoryId && typeof entity.defaultCategoryId === 'object') ? entity.defaultCategoryId._id : entity.defaultCategoryId;
            selectedCategoryId.value = cId; 
        }
      }
  };

  if (prefix === 'contr') {
      const contractor = mainStore.contractors.find(c => c._id === id);
      applyDefaults(contractor);
  } else if (prefix === 'ind') {
      const individual = mainStore.individuals.find(i => i._id === id);
      applyDefaults(individual);
  }
};

onMounted(async () => {
  isInitialLoad.value = true; 
  if (props.operationToEdit) {
    const op = props.operationToEdit; 
    amount.value = formatNumber(Math.abs(op.amount || 0)); 
    selectedAccountId.value = op.accountId?._id || op.accountId;
    
    if (op.companyId) { const cId = op.companyId?._id || op.companyId; selectedOwner.value = `company-${cId}`; } 
    else if (op.individualId) { 
        const iId = op.individualId?._id || op.individualId; selectedOwner.value = `individual-${iId}`; 
    }
    
    // ВОССТАНОВЛЕНИЕ КОНТРАГЕНТА
    if (op.contractorId) { 
        const cId = op.contractorId._id || op.contractorId;
        selectedContractorValue.value = `contr_${cId}`;
    } else if (op.counterpartyIndividualId) {
        const iId = op.counterpartyIndividualId._id || op.counterpartyIndividualId;
        selectedContractorValue.value = `ind_${iId}`;
    } else if (op.individualId && op.companyId) {
        // Fallback for some legacy records
        const iId = op.individualId._id || op.individualId;
        selectedContractorValue.value = `ind_${iId}`;
    }

    const catId = op.categoryId?._id || op.categoryId; const prepId = op.prepaymentId?._id || op.prepaymentId; 
    selectedCategoryId.value = catId || prepId || null;
    selectedProjectId.value = op.projectId?._id || op.projectId;
    if (op.date) editableDate.value = toInputDate(new Date(op.date));
  } else { setTimeout(() => { if (amountInput.value) amountInput.value.focus(); }, 100); }
  await nextTick(); isInitialLoad.value = false;
});

const handleSave = () => {
  if (isInlineSaving.value) return; 
  errorMessage.value = '';
  
  try {
      const amountFromState = (amount.value || '').replace(/ /g, ''); 
      const amountParsed = parseFloat(amountFromState);
      
      if (isNaN(amountParsed) || amountParsed <= 0 || !selectedAccountId.value || !selectedOwner.value || !selectedContractorValue.value) { 
          errorMessage.value = 'Заполните: Сумма, Счет, Владелец, Контрагент.'; 
          return; 
      }
      
      const [year, month, day] = editableDate.value.split('-').map(Number); 
      const finalDate = new Date(year, month - 1, day, 12, 0, 0); 
      
      let companyId = null; let individualOwnerId = null;
      if (selectedOwner.value) { 
          const [type, id] = selectedOwner.value.split('-'); 
          if (type === 'company') companyId = id; 
          else if (type === 'individual') individualOwnerId = id; 
      }
      
      let contractorId = null;
      let counterpartyIndividualId = null;
      
      if (selectedContractorValue.value) {
          const parts = selectedContractorValue.value.split('_');
          if (parts.length === 2) {
              const [contrPrefix, contrId] = parts;
              if (contrPrefix === 'contr') contractorId = contrId; 
              else if (contrPrefix === 'ind') counterpartyIndividualId = contrId;
          }
      }

      const payload = { 
          type: props.type, 
          amount: props.type === 'income' ? amountParsed : -Math.abs(amountParsed), 
          categoryId: selectedCategoryId.value || null, 
          accountId: selectedAccountId.value, 
          companyId: companyId, 
          individualId: individualOwnerId, 
          contractorId: contractorId,      
          counterpartyIndividualId: counterpartyIndividualId, 
          projectId: selectedProjectId.value || null, 
          date: finalDate,
          prepaymentId: props.operationToEdit ? props.operationToEdit.prepaymentId : undefined,
          totalDealAmount: props.operationToEdit ? props.operationToEdit.totalDealAmount : undefined
      };

      if (selectedAccountId.value && selectedOwner.value) {
          const acc = mainStore.accounts.find(a => a._id === selectedAccountId.value);
          if (acc) {
              const [ownerType, ownerId] = selectedOwner.value.split('-');
              const currentCompId = (acc.companyId && typeof acc.companyId === 'object') ? acc.companyId._id : acc.companyId;
              const currentIndId = (acc.individualId && typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
              
              let needsUpdate = false;
              if (ownerType === 'company' && currentCompId !== ownerId) needsUpdate = true;
              if (ownerType === 'individual' && currentIndId !== ownerId) needsUpdate = true;
              
              if (needsUpdate) {
                  const updateData = { _id: acc._id, name: acc.name, order: acc.order };
                  if (ownerType === 'company') { updateData.companyId = ownerId; updateData.individualId = null; }
                  else { updateData.companyId = null; updateData.individualId = ownerId; }
                  mainStore.batchUpdateEntities('accounts', [updateData]).catch(e => console.error(e));
              }
          }
      }

      const updateDefaults = (entity, storePath) => {
          const currentProjId = (entity.defaultProjectId && typeof entity.defaultProjectId === 'object') ? entity.defaultProjectId._id : entity.defaultProjectId;
          const currentCatId = (entity.defaultCategoryId && typeof entity.defaultCategoryId === 'object') ? entity.defaultCategoryId._id : entity.defaultCategoryId;
          
          let updateNeeded = false;
          const updateData = { _id: entity._id, name: entity.name, order: entity.order };
          if (selectedProjectId.value && selectedProjectId.value !== currentProjId) { updateData.defaultProjectId = selectedProjectId.value; updateNeeded = true; }
          else { updateData.defaultProjectId = currentProjId; }
          if (selectedCategoryId.value && selectedCategoryId.value !== currentCatId) { updateData.defaultCategoryId = selectedCategoryId.value; updateNeeded = true; }
          else { updateData.defaultCategoryId = currentCatId; }
          
          if (updateNeeded) { mainStore.batchUpdateEntities(storePath, [updateData]).catch(e => console.error(e)); }
      };

      if (contractorId) {
          const contr = mainStore.contractors.find(c => c._id === contractorId);
          if (contr) updateDefaults(contr, 'contractors');
      } else if (counterpartyIndividualId) {
          const ind = mainStore.individuals.find(i => i._id === counterpartyIndividualId);
          if (ind) updateDefaults(ind, 'individuals');
      }

      const isEdit = !!props.operationToEdit && !isCloneMode.value;
      emit('save', { mode: isEdit ? 'edit' : 'create', id: isEdit ? props.operationToEdit._id : null, data: payload, originalOperation: isEdit ? props.operationToEdit : null });
      emit('close');

  } catch (e) {
      console.error("Save error:", e);
      errorMessage.value = "Ошибка при сохранении: " + e.message;
  }
};

// INLINE CREATE HANDLERS
const showAccountInput = () => { isCreatingAccount.value = true; nextTick(() => newAccountInput.value?.focus()); };
const cancelCreateAccount = () => { isCreatingAccount.value = false; newAccountName.value = ''; };

const saveNewAccount = async () => {
  if (isInlineSaving.value) return; const name = newAccountName.value.trim(); if (!name) return; isInlineSaving.value = true; 
  try { 
    const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase()); 
    let cId = null, iId = null; 
    if (selectedOwner.value) { 
        const [type, id] = selectedOwner.value.split('-'); 
        if (type === 'company') cId = id; else iId = id; 
    } 
    if (existing) { selectedAccountId.value = existing._id; onAccountSelected(existing._id); } 
    else { const newItem = await mainStore.addAccount({ name: name, companyId: cId, individualId: iId }); selectedAccountId.value = newItem._id; onAccountSelected(newItem._id); } 
    cancelCreateAccount(); 
  } catch (e) { console.error(e); } finally { isInlineSaving.value = false; } 
};

const showProjectInput = () => { isCreatingProject.value = true; nextTick(() => newProjectInput.value?.focus()); };
const cancelCreateProject = () => { isCreatingProject.value = false; newProjectName.value = ''; };
const saveNewProject = async () => { if (isInlineSaving.value) return; const name = newProjectName.value.trim(); if (!name) return; isInlineSaving.value = true; try { const existing = mainStore.projects.find(p => p.name.toLowerCase() === name.toLowerCase()); if (existing) selectedProjectId.value = existing._id; else { const newItem = await mainStore.addProject(name); selectedProjectId.value = newItem._id; } cancelCreateProject(); } catch (e) { console.error(e); } finally { isInlineSaving.value = false; } };
const showCategoryInput = () => { isCreatingCategory.value = true; nextTick(() => newCategoryInput.value?.focus()); };
const cancelCreateCategory = () => { isCreatingCategory.value = false; newCategoryName.value = ''; };
const saveNewCategory = async () => { if (isInlineSaving.value) return; const name = newCategoryName.value.trim(); if (!name) return; isInlineSaving.value = true; try { const existing = mainStore.categories.find(c => c.name.toLowerCase() === name.toLowerCase()); if (existing) selectedCategoryId.value = existing._id; else { const newItem = await mainStore.addCategory(name); selectedCategoryId.value = newItem._id; } cancelCreateCategory(); } catch (e) { console.error(e); } finally { isInlineSaving.value = false; } };

const openCreateOwnerModal = (type) => { ownerTypeToCreate.value = type; newOwnerName.value = ''; showCreateOwnerModal.value = true; nextTick(() => newOwnerInputRef.value?.focus()); };
const cancelCreateOwner = () => { if (isInlineSaving.value) return; showCreateOwnerModal.value = false; newOwnerName.value = ''; if (!selectedOwner.value) selectedOwner.value = null; };
const saveNewOwner = async () => { 
  if (isInlineSaving.value) return; const name = newOwnerName.value.trim(); const type = ownerTypeToCreate.value; if (!name) return; isInlineSaving.value = true; 
  try { 
    let newItem; 
    if (type === 'company') { 
        const existing = mainStore.companies.find(c => c.name.toLowerCase() === name.toLowerCase()); 
        newItem = existing ? existing : await mainStore.addCompany(name); 
    } else { 
        const existing = mainStore.individuals.find(i => i.name.toLowerCase() === name.toLowerCase()); 
        newItem = existing ? existing : await mainStore.addIndividual(name); 
    } 
    selectedOwner.value = `${type}-${newItem._id}`; 
    if (selectedAccountId.value) {
        const currentAccount = mainStore.accounts.find(a => a._id === selectedAccountId.value);
        if (currentAccount) {
            const updateData = { _id: currentAccount._id, name: currentAccount.name, order: currentAccount.order };
            if (type === 'company') { updateData.companyId = newItem._id; updateData.individualId = null; }
            else { updateData.companyId = null; updateData.individualId = newItem._id; }
            mainStore.batchUpdateEntities('accounts', [updateData]);
        }
    }
    showCreateOwnerModal.value = false; newOwnerName.value = ''; 
  } catch (e) { console.error(e); } finally { isInlineSaving.value = false; } 
};

const openCreateContractorModal = (type) => { contractorTypeToCreate.value = type; newContractorNameInput.value = ''; showCreateContractorModal.value = true; nextTick(() => newContractorInputRef.value?.focus()); };
const cancelCreateContractorModal = () => { showCreateContractorModal.value = false; newContractorNameInput.value = ''; if (!selectedContractorValue.value) selectedContractorValue.value = null; };
const saveNewContractorModal = async () => {
    if (isInlineSaving.value) return; const name = newContractorNameInput.value.trim(); const type = contractorTypeToCreate.value; if (!name) return; isInlineSaving.value = true;
    try {
        let newItem;
        if (type === 'contractor') {
            const existing = mainStore.contractors.find(c => c.name.toLowerCase() === name.toLowerCase());
            newItem = existing ? existing : await mainStore.addContractor(name);
            selectedContractorValue.value = `contr_${newItem._id}`;
        } else {
            const existing = mainStore.individuals.find(i => i.name.toLowerCase() === name.toLowerCase());
            newItem = existing ? existing : await mainStore.addIndividual(name);
            selectedContractorValue.value = `ind_${newItem._id}`;
        }
        showCreateContractorModal.value = false; newContractorNameInput.value = '';
    } catch (e) { console.error(e); } finally { isInlineSaving.value = false; }
};

const closePopup = () => { if (!isInlineSaving.value) emit('close'); };
const handleDeleteClick = () => { isDeleteConfirmVisible.value = true; };

const onDeleteConfirmed = () => { 
  if (!props.operationToEdit?._id) return; 
  isDeleteConfirmVisible.value = false; 
  emit('operation-deleted', { dateKey: props.operationToEdit.dateKey });
  emit('close'); 
  mainStore.deleteOperation(props.operationToEdit).catch(e => {
      console.error("Ошибка при фоновом удалении:", e);
  });
};

const handleCopyClick = () => { isCloneMode.value = true; editableDate.value = toInputDate(props.date); nextTick(() => { amountInput.value?.focus(); }); };

const isPrepaymentOp = computed(() => {
  if (!props.operationToEdit) return false;
  if (props.operationToEdit.totalDealAmount > 0) return true;
  const prepayIds = mainStore.getPrepaymentCategoryIds;
  const catId = props.operationToEdit.categoryId?._id || props.operationToEdit.categoryId;
  const prepId = props.operationToEdit.prepaymentId?._id || props.operationToEdit.prepaymentId;
  return (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || props.operationToEdit.categoryId?.isPrepayment;
});

const isEditMode = computed(() => !!props.operationToEdit && !isCloneMode.value);
const title = computed(() => { 
    if (isCloneMode.value) return `Копия: ${isIncome.value ? 'Доход' : 'Расход'}`; 
    if (isEditMode.value) {
        if (isPrepaymentOp.value) return 'Редактировать Предоплату';
        return isIncome.value ? 'Редактировать Доход' : 'Редактировать Расход'; 
    }
    return `Новый ${isIncome.value ? 'Доход' : 'Расход'}`; 
});
const popupTheme = computed(() => { if (isEditMode.value) return 'theme-edit'; return isIncome.value ? 'theme-income' : 'theme-expense'; });

const buttonText = computed(() => { 
    if (isCloneMode.value) {
        if (isPrepaymentOp.value) return 'Создать копию предоплаты';
        return isIncome.value ? 'Создать копию дохода' : 'Создать копию расхода';
    }
    if (isEditMode.value) return 'Сохранить';
    return isIncome.value ? 'Добавить доход' : 'Добавить расход'; 
});

const buttonClass = computed(() => { if (isEditMode.value) return 'btn-submit-edit'; return isIncome.value ? 'btn-submit-income' : 'btn-submit-expense'; });
</script>

<template>
  <div class="popup-overlay" @click.self="closePopup">
    <div class="popup-content" :class="popupTheme">
      <h3>{{ title }}</h3>

      <div class="custom-input-box input-spacing" :class="{ 'has-value': !!amount }">
        <div class="input-inner-content">
           <span v-if="amount" class="floating-label">{{ txtAmount.lbl }}</span>
           <input 
             type="text" 
             inputmode="decimal" 
             v-model="amount" 
             :placeholder="amount ? '' : txtAmount.ph"
             ref="amountInput" 
             class="real-input" 
             @input="onAmountInput" 
           />
        </div>
      </div>

      <template v-if="props.type !== 'transfer' && !showCreateOwnerModal && !showCreateContractorModal">
        <BaseSelect
          v-if="!isCreatingAccount"
          v-model="selectedAccountId"
          :options="accountOptions"
          :placeholder="txtAccount.ph"
          :label="txtAccount.lbl"
          class="input-spacing"
          @change="handleAccountChange"
        />
        <div v-else class="inline-create-form input-spacing">
          <input type="text" v-model="newAccountName" placeholder="Название счета" ref="newAccountInput" @keyup.enter="saveNewAccount" @keyup.esc="cancelCreateAccount" />
          <button @click="saveNewAccount" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateAccount" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>
      
        <BaseSelect
          v-model="selectedOwner"
          :options="ownerOptions"
          :placeholder="txtOwner.ph"
          :label="txtOwner.lbl"
          class="input-spacing"
          @change="handleOwnerChange"
        >
          <template #action-item>
             <div class="dual-action-row">
                <button @click="openCreateOwnerModal('company')" class="btn-dual-action left">+ Создать Компанию</button>
                <button @click="openCreateOwnerModal('individual')" class="btn-dual-action right">+ Создать Физлицо</button>
             </div>
          </template>
        </BaseSelect>

        <BaseSelect
          v-model="selectedContractorValue"
          :options="contractorOptions"
          :placeholder="txtContractor.ph"
          :label="txtContractor.lbl"
          class="input-spacing"
          @change="handleContractorChange"
        >
          <template #action-item>
             <div class="dual-action-row">
                <button @click="openCreateContractorModal('contractor')" class="btn-dual-action left">+ Созд. контрагента</button>
                <button @click="openCreateContractorModal('individual')" class="btn-dual-action right">+ Созд. физлицо</button>
             </div>
          </template>
        </BaseSelect>

        <BaseSelect
          v-if="!isCreatingProject"
          v-model="selectedProjectId"
          :options="projectOptions"
          :placeholder="txtProject.ph"
          :label="txtProject.lbl"
          class="input-spacing"
          @change="handleProjectChange"
        />
        <div v-else class="inline-create-form input-spacing">
          <input type="text" v-model="newProjectName" placeholder="Название проекта" ref="newProjectInput" @keyup.enter="saveNewProject" @keyup.esc="cancelCreateProject" />
          <button @click="saveNewProject" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateProject" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>

        <BaseSelect
          v-if="!isCreatingCategory"
          v-model="selectedCategoryId"
          :options="categoryOptions"
          :placeholder="txtCategory.ph"
          :label="txtCategory.lbl"
          class="input-spacing"
          @change="handleCategoryChange"
        />
        <div v-else class="inline-create-form input-spacing">
          <input type="text" v-model="newCategoryName" placeholder="Название категории" ref="newCategoryInput" @keyup.enter="saveNewCategory" @keyup.esc="cancelCreateCategory" />
          <button @click="saveNewCategory" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateCategory" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>
      </template>

      <template v-if="showCreateOwnerModal">
        <div class="smart-create-owner">
          <h4 class="smart-create-title">Создать: {{ ownerTypeToCreate === 'company' ? 'Компанию' : 'Физлицо' }}</h4>
          <input type="text" v-model="newOwnerName" :placeholder="ownerTypeToCreate === 'company' ? 'Название компании' : 'Имя Физлица'" ref="newOwnerInputRef" class="form-input input-spacing" @keyup.enter="saveNewOwner" @keyup.esc="cancelCreateOwner" />
          <div class="smart-create-actions">
            <button @click="cancelCreateOwner" class="btn-submit btn-submit-secondary" :disabled="isInlineSaving">Отмена</button>
            <button @click="saveNewOwner" class="btn-submit btn-submit-edit" :disabled="isInlineSaving">Создать</button>
          </div>
        </div>
      </template>

      <template v-if="showCreateContractorModal">
        <div class="smart-create-owner">
          <h4 class="smart-create-title">Создать: {{ contractorTypeToCreate === 'contractor' ? 'Контрагента' : 'Физлицо' }}</h4>
          <input type="text" v-model="newContractorNameInput" :placeholder="contractorTypeToCreate === 'contractor' ? 'Название контрагента' : 'Имя Физлица'" ref="newContractorInputRef" class="form-input input-spacing" @keyup.enter="saveNewContractorModal" @keyup.esc="cancelCreateContractorModal" />
          <div class="smart-create-actions">
            <button @click="cancelCreateContractorModal" class="btn-submit btn-submit-secondary" :disabled="isInlineSaving">Отмена</button>
            <button @click="saveNewContractorModal" class="btn-submit btn-submit-edit" :disabled="isInlineSaving">Создать</button>
          </div>
        </div>
      </template>

      <template v-if="!showCreateOwnerModal && !showCreateContractorModal">
        <div class="custom-input-box input-spacing has-value date-box">
           <div class="input-inner-content">
              <span class="floating-label">{{ txtDate.lbl }}</span>
              <div class="date-display-row">
                 <span class="date-value-text">{{ toDisplayDate(editableDate) }}</span>
                 <input type="date" v-model="editableDate" class="real-input date-overlay" :min="minDateString" :max="maxDateString" />
                 <span class="calendar-icon">📅</span> 
              </div>
           </div>
        </div>

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

        <div class="popup-actions-row">
          <template v-if="!isEditMode || isCloneMode">
             <template v-if="isPrepaymentOp || (props.type === 'income' && !isEditMode && !isCloneMode)">
                 <button v-if="!isPrepaymentOp" @click="handleSave" class="btn-submit btn-submit-income" :disabled="isInlineSaving">Добавить доход</button>
                 <button @click="handlePrepaymentClick" class="btn-submit btn-submit-prepayment" :disabled="isInlineSaving">{{ isPrepaymentOp ? 'Создать копию предоплаты' : 'Предоплата' }}</button>
             </template>
             <template v-else-if="props.type === 'income'">
                 <button @click="handleSave" class="btn-submit btn-submit-income" :disabled="isInlineSaving">Создать копию дохода</button>
             </template>
             <template v-else>
                 <button @click="handleSave" class="btn-submit save-wide" :class="buttonClass" :disabled="isInlineSaving">{{ buttonText }}</button>
             </template>
          </template>
          
          <template v-else>
             <button @click="handleSave" class="btn-submit save-wide" :class="buttonClass" :disabled="isInlineSaving">{{ buttonText }}</button>
          </template>

          <div v-if="props.operationToEdit && !isCloneMode" class="icon-actions">
            <button class="icon-btn copy-btn" title="Копировать" @click="handleCopyClick" :disabled="isInlineSaving">
              <svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg>
            </button>
            <button class="icon-btn delete-btn" title="Удалить" @click="handleDeleteClick" :disabled="isInlineSaving">
              <svg class="icon-stroke" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>

  <ConfirmationPopup v-if="isDeleteConfirmVisible" title="Подтвердите удаление" message="Вы уверены?" @close="isDeleteConfirmVisible = false" @confirm="onDeleteConfirmed" />
</template>

<style scoped>
.theme-income { --focus-color: #28B8A0; --focus-shadow: rgba(40, 184, 160, 0.2); --btn-bg: #28B8A0; --btn-hover: #1f9c88; }
.theme-expense { --focus-color: #F36F3F; --focus-shadow: rgba(243, 111, 63, 0.2); --btn-bg: #F36F3F; --btn-hover: #d95a30; }
.theme-edit { --focus-color: #000000; --focus-shadow: rgba(0,0,0, 0.2); --btn-bg: #000000; --btn-hover: #333333; }
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; color: #1a1a1a; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem; }
h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 2rem; text-align: left; font-size: 22px; font-weight: 700; }
.custom-input-box { width: 100%; height: 54px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; padding: 0 14px; display: flex; align-items: center; position: relative; transition: all 0.2s ease; }
.custom-input-box:focus-within { border-color: var(--focus-color, #222); box-shadow: 0 0 0 1px var(--focus-shadow, rgba(34,34,34,0.2)); }
.custom-input-box:not(.has-value) .real-input { padding-top: 10px; }
.input-inner-content { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.floating-label { font-size: 11px; color: #999; margin-bottom: -2px; margin-top: 4px; }
.real-input { width: 100%; border: none; background: transparent; padding: 0; font-size: 15px; color: #1a1a1a; font-weight: 500; height: auto; line-height: 1.3; outline: none; }
.real-input::placeholder { font-weight: 400; color: #aaa; }
.date-display-row { display: flex; justify-content: space-between; align-items: center; position: relative; width: 100%; }
.date-value-text { font-size: 15px; font-weight: 500; color: #1a1a1a; }
.date-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; z-index: 2; }
.calendar-icon { font-size: 16px; color: #999; }
.input-spacing { margin-bottom: 12px; }
.btn-submit { width: 100%; height: 50px; padding: 0 1rem; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background-color 0.2s ease; background-color: var(--btn-bg); }
.btn-submit:hover:not(:disabled) { background-color: var(--btn-hover); }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-submit-prepayment { background-color: #FF9D00; color: white; margin-left: 10px; }
.btn-submit-prepayment:hover:not(:disabled) { background-color: #e68a00; }
.btn-submit-income { background-color: #28B8A0; }
.btn-submit-income:hover:not(:disabled) { background-color: #1f9c88; }
.inline-create-form { display: flex; align-items: center; gap: 8px; margin-bottom: 15px; }
.inline-create-form input { flex: 1; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; box-sizing: border-box; }
.inline-create-form input:focus { outline: none; border-color: var(--focus-color); }
.inline-create-form button { flex-shrink: 0; border: none; border-radius: 8px; color: white; font-size: 16px; cursor: pointer; height: 48px; width: 48px; padding: 0; line-height: 1; display: flex; align-items: center; justify-content: center; }
.btn-inline-save { background-color: #34C759; }
.btn-inline-cancel { background-color: #FF3B30; }
.error-message { color: #FF3B30; text-align: center; margin-top: 1rem; font-size: 14px; }
.popup-actions-row { display: flex; align-items: center; gap: 10px; margin-top: 2rem; }
.save-wide { flex: 1 1 auto; height: 54px; }
.icon-actions { display: flex; gap: 10px; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 10px; cursor: pointer; background: #F4F4F4; border: 1px solid #E0E0E0; color: #333; transition: all 0.2s; padding: 0; }
.copy-btn:hover { background: #E8F5E9; border-color: #A5D6A7; color: #34C759; }
.delete-btn:hover { background: #FFF0F0; border-color: #FFD0D0; color: #FF3B30; }
.delete-btn:hover .icon-stroke { stroke: #FF3B30; }
.icon { width: 70%; height: 70%; fill: currentColor; display: block; pointer-events: none; }
.icon-stroke { width: 20px; height: 20px; stroke: #333; fill: none; transition: stroke 0.2s; }
.smart-create-owner { border-top: 1px solid #E0E0E0; margin-top: 1.5rem; padding-top: 1.5rem; }
.smart-create-title { font-size: 18px; font-weight: 600; color: #1a1a1a; text-align: center; margin-top: 0; margin-bottom: 1.5rem; }
.smart-create-tabs { display: flex; justify-content: center; gap: 10px; margin-bottom: 1.5rem; }
.smart-create-tabs button { flex: 1; padding: 12px; font-size: 14px; font-weight: 500; border: 1px solid #E0E0E0; border-radius: 8px; background: #FFFFFF; color: #333; cursor: pointer; transition: all 0.2s; }
.smart-create-tabs button.active { background: #222222; color: #FFFFFF; border-color: #222222; }
.smart-create-actions { display: flex; gap: 10px; margin-top: 1rem; }
.smart-create-actions .btn-submit { flex: 1; }
.form-input { width: 100%; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.form-input:focus { outline: none; border-color: var(--focus-color, #222); box-shadow: 0 0 0 2px var(--focus-shadow, rgba(34,34,34,0.2)); }
.dual-action-row { display: flex; width: 100%; height: 46px; border-top: 1px solid #eee; }
.btn-dual-action { flex: 1; border: none; background-color: #fff; font-size: 13px; font-weight: 600; color: #007AFF; cursor: pointer; transition: background-color 0.2s; }
.btn-dual-action:hover { background-color: #f0f8ff; }
.btn-dual-action.left { border-right: 1px solid #eee; border-bottom-left-radius: 8px; }
.btn-dual-action.right { border-bottom-right-radius: 8px; }
@media (max-width: 400px) { .btn-dual-action { font-size: 12px; padding: 0 5px; } }
</style>