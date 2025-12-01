<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber as formatBalance } from '@/utils/formatters.js'; 
import ConfirmationPopup from './ConfirmationPopup.vue';
import BaseSelect from './BaseSelect.vue'; 
import { knownBanks } from '@/data/knownBanks.js'; 
import { accountSuggestions } from '@/data/accountSuggestions.js'; 
import { categorySuggestions } from '@/data/categorySuggestions.js'; 

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
const selectedContractorValue = ref(null); 
const selectedCategoryId = ref(null);
const selectedProjectId = ref(null);

// 🟢 НОВОЕ ПОЛЕ: Статус операции (по Сценарию 1)
const operationStatus = ref('fact'); // 'fact' | 'prepayment'
const statusOptions = [
    { value: 'fact', label: 'Факт (Исполнено)' },
    { value: 'prepayment', label: 'Предоплата' }
];

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
const contractorTypeToCreate = ref('contractor'); 
const newContractorNameInput = ref('');
const newContractorInputRef = ref(null);

const isDeleteConfirmVisible = ref(false);
const isCloneMode = ref(false);

const isIncome = computed(() => props.type === 'income');

/* --- АВТОПОДСТАНОВКА БАНКОВ (КОНТРАГЕНТЫ) --- */
const showBankSuggestions = ref(false);
const bankSuggestions = computed(() => {
    if (contractorTypeToCreate.value !== 'contractor') return [];
    const query = newContractorNameInput.value.trim().toLowerCase();
    if (query.length < 2) return [];
    return knownBanks.filter(bank => {
        if (bank.name.toLowerCase().includes(query)) return true;
        if (bank.keywords.some(k => k.startsWith(query))) return true;
        return false;
    }).slice(0, 4);
});
const selectBankSuggestion = (bank) => {
    newContractorNameInput.value = bank.name;
    showBankSuggestions.value = false;
    nextTick(() => newContractorInputRef.value?.focus());
};
const handleInputBlur = () => { setTimeout(() => { showBankSuggestions.value = false; }, 200); };
const handleInputFocus = () => { if (newContractorNameInput.value.length >= 2) showBankSuggestions.value = true; };
watch(newContractorNameInput, (val) => { showBankSuggestions.value = val.length >= 2; });


/* --- АВТОПОДСТАНОВКА СЧЕТОВ --- */
const showAccountSuggestions = ref(false);
const accountSuggestionsList = computed(() => {
    const query = newAccountName.value.trim().toLowerCase();
    if (query.length < 2) return [];
    return accountSuggestions.filter(acc => {
        if (acc.name.toLowerCase().includes(query)) return true;
        if (acc.keywords.some(k => k.startsWith(query))) return true;
        return false;
    }).slice(0, 4);
});
const selectAccountSuggestion = (acc) => {
    newAccountName.value = acc.name;
    showAccountSuggestions.value = false;
    nextTick(() => newAccountInput.value?.focus());
};
const handleAccountInputBlur = () => { setTimeout(() => { showAccountSuggestions.value = false; }, 200); };
const handleAccountInputFocus = () => { if (newAccountName.value.length >= 2) showAccountSuggestions.value = true; };
watch(newAccountName, (val) => { showAccountSuggestions.value = val.length >= 2; });


/* --- АВТОПОДСТАНОВКА КАТЕГОРИЙ --- */
const showCategorySuggestions = ref(false);
const categorySuggestionsList = computed(() => {
    const query = newCategoryName.value.trim().toLowerCase();
    if (query.length < 2) return [];

    return categorySuggestions.filter(cat => {
        if (cat.name.toLowerCase().includes(query)) return true;
        if (cat.keywords.some(k => k.startsWith(query))) return true;
        return false;
    }).slice(0, 4);
});
const selectCategorySuggestion = (cat) => {
    newCategoryName.value = cat.name;
    showCategorySuggestions.value = false;
    nextTick(() => newCategoryInput.value?.focus());
};
const handleCategoryInputBlur = () => { setTimeout(() => { showCategorySuggestions.value = false; }, 200); };
const handleCategoryInputFocus = () => { if (newCategoryName.value.length >= 2) showCategorySuggestions.value = true; };
watch(newCategoryName, (val) => { showCategorySuggestions.value = val.length >= 2; });


// 🟢 COMPUTED: ID проекта "Мои кредиты"
const myCreditsProjectId = computed(() => {
    const p = mainStore.projects.find(x => x.name.trim().toLowerCase() === 'мои кредиты');
    return p ? p._id : null;
});

// 🟢 WATCH: Логика авто-подстановки и УМНЫХ СВЯЗЕЙ
watch([selectedContractorValue, selectedProjectId, () => props.type], ([newContr, newProj, newType]) => {
    if (isInitialLoad.value) return;

    // 1. БАНК -> Проект "Мои кредиты"
    if (newType === 'income' && newContr) {
        const [prefix, id] = newContr.split('_');
        if (prefix === 'contr') {
            const contrObj = mainStore.contractors.find(c => c._id === id);
            if (contrObj) {
                const nameLower = contrObj.name.toLowerCase().trim();
                const isBank = knownBanks.some(b => b.name.toLowerCase() === nameLower);
                if (isBank && myCreditsProjectId.value) {
                    if (selectedProjectId.value !== myCreditsProjectId.value) {
                        selectedProjectId.value = myCreditsProjectId.value;
                        return;
                    }
                }
            }
        }
    }

    // 2. Проект "Мои кредиты" (Доход) -> Категория "Кредиты"
    if (newType === 'income' && newProj && myCreditsProjectId.value) {
        if (newProj === myCreditsProjectId.value) {
            if (mainStore.creditCategoryId) {
                selectedCategoryId.value = mainStore.creditCategoryId;
                return;
            }
        }
    }

    // 3. Проект "Мои кредиты" (Расход) -> Категория "Погашение займов"
    if (newType === 'expense' && newProj && myCreditsProjectId.value) {
        if (newProj === myCreditsProjectId.value) {
            if (mainStore.loanRepaymentCategoryId) {
                selectedCategoryId.value = mainStore.loanRepaymentCategoryId;
                return;
            }
        }
    }

    // 4. "Розничные клиенты" (Доход) -> Категория "Реализация"
    if (newType === 'income' && newContr && mainStore.retailIndividualId) {
        if (newContr === `ind_${mainStore.retailIndividualId}`) {
            if (mainStore.realizationCategoryId) {
                selectedCategoryId.value = mainStore.realizationCategoryId;
                return;
            }
        }
    }
});

watch([showCreateContractorModal, showCreateOwnerModal], ([creatingContr, creatingOwner]) => {
    if (creatingContr || creatingOwner) {
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

// ТЕКСТЫ
const txtAmount = computed(() => ({ 
  ph: isIncome.value ? 'Вношу сумму ₸' : 'Трачу сумму ₸', 
  lbl: 'Сумма, ₸' 
}));

const txtAccount = computed(() => {
    const base = isIncome.value ? 'На счет' : 'Со счета';
    return { ph: base, lbl: base };
});

const txtOwner = computed(() => ({ ph: 'Владелец счета', lbl: 'Владелец счета' }));

const contractorLabel = computed(() => {
    if (selectedContractorValue.value && selectedContractorValue.value.startsWith('ind_')) {
        return isIncome.value ? 'От физлица' : 'Физлицу';
    }
    return isIncome.value ? 'От контрагента' : 'Контрагенту';
});

const txtContractor = computed(() => ({ ph: contractorLabel.value, lbl: contractorLabel.value }));
const txtProject = computed(() => ({ ph: isIncome.value ? 'Из проекта' : 'В проект', lbl: 'Проект' }));
const txtCategory = computed(() => ({ ph: 'По категории', lbl: 'Категория' }));
const txtDate = computed(() => ({ ph: '', lbl: 'Дата операции' }));

// OPTIONS
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
          const nameLower = i.name.trim().toLowerCase();
          if (nameLower === 'розничные клиенты' || nameLower === 'розница') return;
          opts.push({ value: `individual-${i._id}`, label: i.name, rightText: `${formatBalance(Math.abs(i.balance || 0))} ₸` }); 
      });
  }
  opts.push({ isActionRow: true }); 
  return opts;
});

const contractorOptions = computed(() => {
  const opts = [];
  const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
  const filteredContractors = mainStore.contractors.filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));

  opts.push({ label: 'Контрагенты - ТОО, ИП', isHeader: true });
  filteredContractors.forEach(c => {
      opts.push({ value: `contr_${c._id}`, label: c.name });
  });
  
  const filteredIndividuals = mainStore.individuals.filter(i => {
      const name = i.name.trim().toLowerCase();
      return name !== 'розничные клиенты' && name !== 'розница';
  });

  opts.push({ label: 'Физлица (Контрагенты)', isHeader: true });
  filteredIndividuals.forEach(i => {
      opts.push({ value: `ind_${i._id}`, label: i.name });
  });

  // Системные (Розница)
  if (mainStore.retailIndividualId) {
      const sysInd = mainStore.individuals.find(i => i._id === mainStore.retailIndividualId);
      if (sysInd) {
          opts.push({ label: 'Системные', isHeader: true });
          opts.push({ value: `ind_${sysInd._id}`, label: sysInd.name });
      }
  }

  opts.push({ isActionRow: true });
  return opts;
});

const projectOptions = computed(() => {
  const creditProjId = myCreditsProjectId.value;
  let isBankSelected = false;
  if (selectedContractorValue.value) {
      const [prefix, id] = selectedContractorValue.value.split('_');
      let nameToCheck = '';
      if (prefix === 'contr') {
          const c = mainStore.contractors.find(x => x._id === id);
          if (c) nameToCheck = c.name;
      } else if (prefix === 'ind') {
          const i = mainStore.individuals.find(x => x._id === id);
          if (i) nameToCheck = i.name;
      }
      if (nameToCheck) {
          const lowerName = nameToCheck.trim().toLowerCase();
          isBankSelected = knownBanks.some(b => {
             if (b.name.toLowerCase() === lowerName) return true;
             if (b.keywords.some(k => k.startsWith(lowerName))) return true;
             return false;
          });
      }
  }

  const filteredProjects = mainStore.projects.filter(p => {
      if (creditProjId && p._id === creditProjId) {
          return isBankSelected;
      }
      return true;
  });

  const opts = filteredProjects.map(p => ({ value: p._id, label: p.name }));
  opts.unshift({ value: null, label: txtProject.value.ph });
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать проект', isSpecial: true });
  return opts;
});

const categoryOptions = computed(() => {
  const prepayIds = mainStore.getPrepaymentCategoryIds;
  const currentOpCatId = props.operationToEdit ? (props.operationToEdit.categoryId?._id || props.operationToEdit.categoryId || props.operationToEdit.prepaymentId?._id || props.operationToEdit.prepaymentId) : null;
  const isCreating = showCreateContractorModal.value || showCreateOwnerModal.value;
  const isRetailSelected = !isCreating && mainStore.retailIndividualId && selectedContractorValue.value === `ind_${mainStore.retailIndividualId}`;
  const isCreditIncomeProjectSelected = !isCreating && isIncome.value && myCreditsProjectId.value && selectedProjectId.value === myCreditsProjectId.value;
  const isCreditExpenseProjectSelected = !isCreating && !isIncome.value && myCreditsProjectId.value && selectedProjectId.value === myCreditsProjectId.value;

  const validCats = mainStore.categories.filter(c => {
    const name = c.name.toLowerCase().trim();
    if (isIncome.value && isRetailSelected) return c._id === mainStore.realizationCategoryId;
    if (isCreditIncomeProjectSelected) return c._id === mainStore.creditCategoryId;
    if (isCreditExpenseProjectSelected) return c._id === mainStore.loanRepaymentCategoryId;

    if (name === 'перевод' || name === 'transfer') return false;
    if (c.isPrepayment || prepayIds.includes(c._id)) return false;
    if (['меж.комп', 'межкомпаний', 'inter-comp'].includes(name)) return false;

    if (c._id === mainStore.realizationCategoryId) {
        if (props.operationToEdit && c._id === currentOpCatId) return true;
        return false;
    }

    if (isIncome.value) {
        if (name === 'погашение займов' || name === 'loan repayment') return false;
    } else {
        if (name === 'кредиты' || name === 'credit' || name === 'credits') return false;
    }
    
    if (name === 'остаток долга') return true;
    if (props.operationToEdit && c._id === currentOpCatId) return true;
    return true;
  });
  
  const opts = validCats.map(c => ({ value: c._id, label: c.name }));
  opts.unshift({ value: null, label: txtCategory.value.ph });
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать категорию', isSpecial: true });
  return opts;
});

const handleAccountChange = (val) => { if (val === '--CREATE_NEW--') { selectedAccountId.value = null; showAccountInput(); } else { onAccountSelected(val); } };
const handleOwnerChange = (val) => { /* Logic handled by v-model */ };
const handleContractorChange = (val) => { /* Auto logic via watcher */ };
const handleProjectChange = (val) => { if (val === '--CREATE_NEW--') { selectedProjectId.value = null; showProjectInput(); } };
const handleCategoryChange = (val) => { if (val === '--CREATE_NEW--') { selectedCategoryId.value = null; showCategoryInput(); } };

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
    
    if (op.contractorId) { 
        const cId = op.contractorId._id || op.contractorId;
        selectedContractorValue.value = `contr_${cId}`;
    } else if (op.counterpartyIndividualId) {
        const iId = op.counterpartyIndividualId._id || op.counterpartyIndividualId;
        selectedContractorValue.value = `ind_${iId}`;
    }

    const catId = op.categoryId?._id || op.categoryId; const prepId = op.prepaymentId?._id || op.prepaymentId; 
    selectedCategoryId.value = catId || prepId || null;
    selectedProjectId.value = op.projectId?._id || op.projectId;
    if (op.date) editableDate.value = toInputDate(new Date(op.date));
    
    // Если это предоплата, выставляем статус
    if (op.totalDealAmount > 0) {
        operationStatus.value = 'prepayment';
    } else {
        operationStatus.value = 'fact';
    }
  } else { 
      setTimeout(() => { if (amountInput.value) amountInput.value.focus(); }, 100); 
      operationStatus.value = 'fact'; // По умолчанию
  }
  await nextTick(); isInitialLoad.value = false;
});

// 🟢 ГЛАВНЫЙ ОБРАБОТЧИК ДЕЙСТВИЯ (Кнопка внизу)
const handleMainAction = () => {
    // 1. Сценарий: Предоплата (Вход в зону риска)
    if (operationStatus.value === 'prepayment' && isIncome.value) {
        errorMessage.value = '';
        const rawAmount = parseFloat((amount.value || '').replace(/\s/g, '')) || 0;
        
        if (rawAmount <= 0 || !selectedAccountId.value || !selectedOwner.value || !selectedContractorValue.value) {
            errorMessage.value = 'Заполните: Сумма, Счет, Владелец, Контрагент.';
            return;
        }

        let cId = null, indId = null;
        if (selectedContractorValue.value) {
            const [prefix, id] = selectedContractorValue.value.split('_');
            if (prefix === 'contr') cId = id; else indId = id;
        }

        // Подготовка данных для модалки PrepaymentModal
        const prepaymentData = {
            amount: rawAmount,
            accountId: selectedAccountId.value,
            contractorId: cId,
            counterpartyIndividualId: indId,
            projectId: selectedProjectId.value,
            categoryId: selectedCategoryId.value,
            companyId: selectedOwner.value?.startsWith('company') ? selectedOwner.value.split('-')[1] : null,
            individualId: selectedOwner.value?.startsWith('individual') ? selectedOwner.value.split('-')[1] : null,
            date: editableDate.value,
            cellIndex: props.cellIndex,
            operationToEdit: props.operationToEdit
        };
        
        // Открытие PrepaymentModal через HomeView
        emit('trigger-prepayment', prepaymentData);
    } 
    // 2. Сценарий: Обычное сохранение (Факт)
    else {
        handleSave();
    }
};

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
          // Сбрасываем флаги предоплаты, если выбран "Факт"
          prepaymentId: undefined,
          totalDealAmount: 0 
      };

      // Логика обновления владельца счета, если изменился
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

      const isEdit = !!props.operationToEdit && !isCloneMode.value;
      emit('save', { mode: isEdit ? 'edit' : 'create', id: isEdit ? props.operationToEdit._id : null, data: payload, originalOperation: isEdit ? props.operationToEdit : null });
      emit('close');

  } catch (e) {
      console.error("Save error:", e);
      errorMessage.value = "Ошибка при сохранении: " + e.message;
  }
};

// ... (INLINE CREATE HANDLERS - без изменений)
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
const saveNewOwner = async () => { if (isInlineSaving.value) return; const name = newOwnerName.value.trim(); const type = ownerTypeToCreate.value; if (!name) return; isInlineSaving.value = true; try { let newItem; if (type === 'company') { const existing = mainStore.companies.find(c => c.name.toLowerCase() === name.toLowerCase()); newItem = existing ? existing : await mainStore.addCompany(name); } else { const existing = mainStore.individuals.find(i => i.name.toLowerCase() === name.toLowerCase()); newItem = existing ? existing : await mainStore.addIndividual(name); } selectedOwner.value = `${type}-${newItem._id}`; if (selectedAccountId.value) { const currentAccount = mainStore.accounts.find(a => a._id === selectedAccountId.value); if (currentAccount) { const updateData = { _id: currentAccount._id, name: currentAccount.name, order: currentAccount.order }; if (type === 'company') { updateData.companyId = newItem._id; updateData.individualId = null; } else { updateData.companyId = null; updateData.individualId = newItem._id; } mainStore.batchUpdateEntities('accounts', [updateData]); } } showCreateOwnerModal.value = false; newOwnerName.value = ''; } catch (e) { console.error(e); } finally { isInlineSaving.value = false; } };
const openCreateContractorModal = (type) => { contractorTypeToCreate.value = type; newContractorNameInput.value = ''; showCreateContractorModal.value = true; nextTick(() => newContractorInputRef.value?.focus()); };
const cancelCreateContractorModal = () => { showCreateContractorModal.value = false; newContractorNameInput.value = ''; if (!selectedContractorValue.value) selectedContractorValue.value = null; };
const saveNewContractorModal = async () => { if (isInlineSaving.value) return; const name = newContractorNameInput.value.trim(); const type = contractorTypeToCreate.value; if (!name) return; isInlineSaving.value = true; try { let newItem; if (type === 'contractor') { const existing = mainStore.contractors.find(c => c.name.toLowerCase() === name.toLowerCase()); newItem = existing ? existing : await mainStore.addContractor(name); selectedContractorValue.value = `contr_${newItem._id}`; } else { const existing = mainStore.individuals.find(i => i.name.toLowerCase() === name.toLowerCase()); newItem = existing ? existing : await mainStore.addIndividual(name); selectedContractorValue.value = `ind_${newItem._id}`; } showCreateContractorModal.value = false; newContractorNameInput.value = ''; } catch (e) { console.error(e); } finally { isInlineSaving.value = false; } };

const closePopup = () => { if (!isInlineSaving.value) emit('close'); };
const handleDeleteClick = () => { isDeleteConfirmVisible.value = true; };
const onDeleteConfirmed = () => { if (!props.operationToEdit?._id) return; isDeleteConfirmVisible.value = false; emit('operation-deleted', { dateKey: props.operationToEdit.dateKey }); emit('close'); mainStore.deleteOperation(props.operationToEdit).catch(e => console.error(e)); };
const handleCopyClick = () => { isCloneMode.value = true; editableDate.value = toInputDate(props.date); nextTick(() => { amountInput.value?.focus(); }); };

const isEditMode = computed(() => !!props.operationToEdit && !isCloneMode.value);
const title = computed(() => { 
    if (isCloneMode.value) return `Копия: ${isIncome.value ? 'Доход' : 'Расход'}`; 
    if (isEditMode.value) return isIncome.value ? 'Редактировать Доход' : 'Редактировать Расход'; 
    return `Новый ${isIncome.value ? 'Доход' : 'Расход'}`; 
});
const popupTheme = computed(() => { if (isEditMode.value) return 'theme-edit'; return isIncome.value ? 'theme-income' : 'theme-expense'; });

// 🟢 ДИНАМИЧЕСКИЙ ТЕКСТ КНОПКИ
const mainButtonText = computed(() => {
    if (operationStatus.value === 'prepayment' && isIncome.value) {
        return 'Оформить предоплату...';
    }
    if (isCloneMode.value) return isIncome.value ? 'Создать копию дохода' : 'Создать копию расхода';
    if (isEditMode.value) return 'Сохранить';
    return isIncome.value ? 'Добавить доход' : 'Добавить расход';
});

// 🟢 ДИНАМИЧЕСКИЙ КЛАСС КНОПКИ
const mainButtonClass = computed(() => {
    if (operationStatus.value === 'prepayment' && isIncome.value) return 'btn-submit-prepayment';
    if (isEditMode.value) return 'btn-submit-edit';
    return isIncome.value ? 'btn-submit-income' : 'btn-submit-expense';
});
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
        
        <div v-else class="inline-create-form input-spacing input-wrapper relative">
           <input type="text" v-model="newAccountName" placeholder="Название счета" ref="newAccountInput" @keyup.enter="saveNewAccount" @keyup.esc="cancelCreateAccount" @blur="handleAccountInputBlur" @focus="handleAccountInputFocus" />
           <button @click="saveNewAccount" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
           <button @click="cancelCreateAccount" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
           <ul v-if="showAccountSuggestions && accountSuggestionsList.length > 0" class="bank-suggestions-list">
               <li v-for="(acc, idx) in accountSuggestionsList" :key="idx" @mousedown.prevent="selectAccountSuggestion(acc)">{{ acc.name }}</li>
           </ul>
        </div>
      
        <BaseSelect v-model="selectedOwner" :options="ownerOptions" :placeholder="txtOwner.ph" :label="txtOwner.lbl" class="input-spacing" @change="handleOwnerChange">
          <template #action-item>
             <div class="dual-action-row">
                <button @click="openCreateOwnerModal('company')" class="btn-dual-action left">+ Создать Компанию</button>
                <button @click="openCreateOwnerModal('individual')" class="btn-dual-action right">+ Создать Физлицо</button>
             </div>
          </template>
        </BaseSelect>

        <BaseSelect v-model="selectedContractorValue" :options="contractorOptions" :placeholder="txtContractor.ph" :label="txtContractor.lbl" class="input-spacing" @change="handleContractorChange">
          <template #action-item>
             <div class="dual-action-row">
                <button @click="openCreateContractorModal('contractor')" class="btn-dual-action left">+ Созд. контрагента</button>
                <button @click="openCreateContractorModal('individual')" class="btn-dual-action right">+ Созд. физлицо</button>
             </div>
          </template>
        </BaseSelect>

        <BaseSelect v-if="!isCreatingProject" v-model="selectedProjectId" :options="projectOptions" :placeholder="txtProject.ph" :label="txtProject.lbl" class="input-spacing" @change="handleProjectChange" />
        <div v-else class="inline-create-form input-spacing">
          <input type="text" v-model="newProjectName" placeholder="Название проекта" ref="newProjectInput" @keyup.enter="saveNewProject" @keyup.esc="cancelCreateProject" />
          <button @click="saveNewProject" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
          <button @click="cancelCreateProject" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>

        <BaseSelect v-if="!isCreatingCategory" v-model="selectedCategoryId" :options="categoryOptions" :placeholder="txtCategory.ph" :label="txtCategory.lbl" class="input-spacing" @change="handleCategoryChange" />
        <div v-else class="inline-create-form input-spacing input-wrapper relative">
           <input type="text" v-model="newCategoryName" placeholder="Название категории" ref="newCategoryInput" @keyup.enter="saveNewCategory" @keyup.esc="cancelCreateCategory" @blur="handleCategoryInputBlur" @focus="handleCategoryInputFocus" />
           <button @click="saveNewCategory" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
           <button @click="cancelCreateCategory" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
           <ul v-if="showCategorySuggestions && categorySuggestionsList.length > 0" class="bank-suggestions-list">
               <li v-for="(cat, idx) in categorySuggestionsList" :key="idx" @mousedown.prevent="selectCategorySuggestion(cat)">{{ cat.name }}</li>
           </ul>
        </div>
      </template>

      <!-- 🟢 СТАТУС ОПЕРАЦИИ -->
      <div class="input-spacing" v-if="isIncome && !isCloneMode && !isEditMode">
          <BaseSelect 
              v-model="operationStatus" 
              :options="statusOptions" 
              placeholder="Статус денег" 
              label="Статус денег"
          />
      </div>

      <!-- Остальные модалки создания (Owner/Contractor) остаются как есть -->
      <!-- ... -->

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
             <!-- 🟢 ЕДИНСТВЕННАЯ ГЛАВНАЯ КНОПКА -->
             <button 
                @click="handleMainAction" 
                class="btn-submit save-wide" 
                :class="mainButtonClass" 
                :disabled="isInlineSaving"
             >
                {{ mainButtonText }}
             </button>

          <div v-if="props.operationToEdit && !isCloneMode" class="icon-actions">
            <button class="icon-btn copy-btn" title="Копировать" @click="handleCopyClick" :disabled="isInlineSaving"><svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg></button>
            <button class="icon-btn delete-btn" title="Удалить" @click="handleDeleteClick" :disabled="isInlineSaving"><svg class="icon-stroke" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
          </div>
        </div>
      </template>
    </div>
  </div>

  <ConfirmationPopup v-if="isDeleteConfirmVisible" title="Подтвердите удаление" message="Вы уверены?" @close="isDeleteConfirmVisible = false" @confirm="onDeleteConfirmed" />
</template>

<style scoped>
/* СТИЛИ */
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
.btn-submit { width: 100%; height: 50px; padding: 0 1rem; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background-color 0.2s ease; background-color: #333; }
.btn-submit:hover:not(:disabled) { background-color: var(--btn-hover); }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
/* 🟢 Стили для кнопки Предоплаты */
.btn-submit-prepayment { background-color: #FF9D00; color: white; }
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
.btn-dual-action { flex: 1; border: none; background-color: #fff; font-size: 13px; font-weight: 600; color: #007AFF; cursor: pointer; transition: background-color 0.2s; white-space: nowrap; }
.btn-dual-action:hover { background-color: #f0f8ff; }
.btn-dual-action.left { border-right: 1px solid #eee; border-bottom-left-radius: 8px; }
.btn-dual-action.right { border-bottom-right-radius: 8px; }
.btn-create-green { background-color: #34c759 !important; color: white !important; }
.btn-create-green:hover:not(:disabled) { background-color: #2da84e !important; }
.btn-cancel-white { background-color: #ffffff !important; color: #333333 !important; border: 1px solid #dddddd !important; }
.btn-cancel-white:hover:not(:disabled) { background-color: #f5f5f5 !important; }
.relative { position: relative; }
.bank-suggestions-list { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #E0E0E0; border-top: none; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); z-index: 2000; list-style: none; padding: 0; margin: 0; max-height: 160px; overflow-y: auto; }
.bank-suggestions-list li { padding: 10px 14px; font-size: 14px; color: #333; cursor: pointer; border-bottom: 1px solid #f5f5f5; }
.bank-suggestions-list li:last-child { border-bottom: none; }
.bank-suggestions-list li:hover { background-color: #f9f9f9; }
</style>