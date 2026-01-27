<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { usePermissions } from '@/composables/usePermissions';
import { formatNumber } from '@/utils/formatters.js';
import BaseSelect from './BaseSelect.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import InfoModal from './InfoModal.vue'; 


import { accountSuggestions } from '@/data/accountSuggestions.js'; 
import { categorySuggestions } from '@/data/categorySuggestions.js'; 
import { knownBanks } from '@/data/knownBanks.js'; 

/**
 * * --- МЕТКА ВЕРСИИ: v60.0 - FUTURE VALIDATION ---
 * * ВЕРСИЯ: 60.0
 * * ДАТА: 2025-12-16
 * * ИЗМЕНЕНИЯ:
 * 1. (LOGIC) Интеграция с mainStore.validateTransaction для проверки баланса на конкретную дату.
 * 2. (UI) Динамический заголовок ("Запланировать расход" vs "Новый расход").
 * 3. (UI) accountOptions теперь показывают прогнозируемый баланс, если выбрана будущая дата.
 * 4. (UI) Блокировка сохранения при недостатке средств.
 */

const props = defineProps({
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  operationToEdit: { type: Object, default: null },
  minAllowedDate: { type: Date, default: null },
  maxAllowedDate: { type: Date, default: null }
});

const emit = defineEmits(['close', 'save', 'operation-deleted', 'move-expense']);

const mainStore = useMainStore();
const permissions = usePermissions();
// --- ДАННЫЕ ---
const amount = ref('');
const amountInput = ref(null);

const selectedAccountId = ref(null);
const selectedOwner = ref(null); 
const selectedContractorValue = ref(null); 
const selectedProjectIds = ref([]);
const primaryProjectId = computed(() => (selectedProjectIds.value && selectedProjectIds.value.length ? selectedProjectIds.value[0] : null));
const normalizeId = (val) => {
    if (!val) return null;
    if (typeof val === 'object') return val._id ? String(val._id) : String(val);
    return String(val);
};
const selectedCategoryId = ref(null);

// Default project "Без проекта"
const defaultProjectId = computed(() => {
    const p = mainStore.projects.find(x => x.name && x.name.trim().toLowerCase() === 'без проекта');
    return p ? p._id : null;
});
const description = ref('');

const isSaving = ref(false);
const errorMessage = ref('');
const isCloneMode = ref(false);
const editableDate = ref('');
const isInlineSaving = ref(false);
const isInitialLoad = ref(true);
const isDateChanged = ref(false); 
const isDeleteConfirmVisible = ref(false);

const isCreditWarningVisible = ref(false);
const creditWarningMessage = ref('');
const isLocalWizardVisible = ref(false);

// InfoModal
const showInfoModal = ref(false);
const infoModalTitle = ref('Внимание');
const infoModalMessage = ref('');

const showError = (msg, title = 'Внимание') => {
    infoModalTitle.value = title;
    infoModalMessage.value = msg;
    showInfoModal.value = true;
};

// --- СОСТОЯНИЯ СОЗДАНИЯ ---
const isCreatingAccount = ref(false); const newAccountName = ref(''); const newAccountInput = ref(null);
const isCreatingProject = ref(false); const newProjectName = ref(''); const newProjectInput = ref(null);
const isCreatingCategory = ref(false); const newCategoryName = ref(''); const newCategoryInput = ref(null);
const showAccountSuggestions = ref(false); const showCategorySuggestions = ref(false);

// 🟢 CASH REGISTER LOGIC (Новое)
const showCashChoiceModal = ref(false); // Модал выбора (Обычная/Особая)
const showSpecialCashInfo = ref(false); // Инфо про особую кассу
const accountCreationPlaceholder = ref('Название счета'); 
const isCreatingSpecialAccount = ref(false); // Флаг для isExcluded

const showCreateOwnerModal = ref(false);
const ownerTypeToCreate = ref('company'); 
const newOwnerName = ref('');
const newOwnerInputRef = ref(null);

const showCreateContractorModal = ref(false);
const contractorTypeToCreate = ref('contractor'); 
const newContractorNameInput = ref('');
const newContractorInputRef = ref(null);

const isProgrammaticAccount = ref(false);
const isProgrammaticCategory = ref(false);
const isProgrammaticContractor = ref(false);
const isProgrammaticOwner = ref(false);

// --- 🟢 TIME LOGIC ---
const toInputDate = (dateObj) => { 
    if (!dateObj) return '';
    const d = new Date(dateObj);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// 🟢 ИСТИННОЕ ВРЕМЯ (TRUE TIME)
const createSmartDate = (str) => {
    if (!str) return new Date();
    const [y, m, d] = str.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const now = new Date();
    const isToday = now.getFullYear() === y && now.getMonth() === (m - 1) && now.getDate() === d;
    
    if (isToday) {
        return now;
    } else {
        date.setHours(12, 0, 0, 0);
        return date;
    }
};

// Определяем, является ли выбранная дата "Будущим"
const isFutureDate = computed(() => {
    const targetDate = createSmartDate(editableDate.value);
    return !mainStore._isEffectivelyPastOrToday(targetDate);
});


// --- АВТОПОДСТАНОВКИ ---
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
    nextTick(() => { newContractorInputRef.value?.focus(); isProgrammaticContractor.value = false; });
};
const handleContractorInputBlur = () => { setTimeout(() => { showContractorBankSuggestions.value = false; }, 200); };
const handleContractorInputFocus = () => { if (newContractorNameInput.value.length >= 2) showContractorBankSuggestions.value = true; };
watch(newContractorNameInput, (val) => { if (!isProgrammaticContractor.value) showContractorBankSuggestions.value = val.length >= 2; });

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
    nextTick(() => { newOwnerInputRef.value?.focus(); isProgrammaticOwner.value = false; });
};
const handleOwnerInputBlur = () => { setTimeout(() => { showOwnerBankSuggestions.value = false; }, 200); };
const handleOwnerInputFocus = () => { if (newOwnerName.value.length >= 2) showOwnerBankSuggestions.value = true; };
watch(newOwnerName, (val) => { if (!isProgrammaticOwner.value) showOwnerBankSuggestions.value = val.length >= 2; });

const accountSuggestionsList = computed(() => {
    const query = newAccountName.value.trim().toLowerCase();
    if (query.length < 2) return [];
    return accountSuggestions.filter(acc => acc.name.toLowerCase().includes(query)).slice(0, 4);
});
const selectAccountSuggestion = (acc) => {
    isProgrammaticAccount.value = true;
    newAccountName.value = acc.name;
    showAccountSuggestions.value = false;
    nextTick(() => { newAccountInput.value?.focus(); isProgrammaticAccount.value = false; });
};
const handleAccountInputBlur = () => { setTimeout(() => { showAccountSuggestions.value = false; }, 200); };
const handleAccountInputFocus = () => { if (newAccountName.value.length >= 2) showAccountSuggestions.value = true; };
watch(newAccountName, (val) => { if (!isProgrammaticAccount.value) showAccountSuggestions.value = val.length >= 2; });

const categorySuggestionsList = computed(() => {
    const query = newCategoryName.value.trim().toLowerCase();
    if (query.length < 2) return [];
    return categorySuggestions.filter(c => c.name.toLowerCase().includes(query)).slice(0, 4);
});
const selectCategorySuggestion = (c) => {
    isProgrammaticCategory.value = true;
    newCategoryName.value = c.name;
    showCategorySuggestions.value = false;
    nextTick(() => { newCategoryInput.value?.focus(); isProgrammaticCategory.value = false; });
};
const handleCategoryInputBlur = () => { setTimeout(() => { showCategorySuggestions.value = false; }, 200); };
const handleCategoryInputFocus = () => { if (newCategoryName.value.length >= 2) showCategorySuggestions.value = true; };
watch(newCategoryName, (val) => { if (isProgrammaticCategory.value) return; showCategorySuggestions.value = val.length >= 2; });

const getOwnerName = (acc) => {
    if (acc.companyId) {
        const cId = (typeof acc.companyId === 'object') ? acc.companyId._id : acc.companyId;
        const c = mainStore.companies.find(comp => comp._id === cId);
        return c ? c.name : 'Компания';
    }
    if (acc.individualId) {
        const iId = (typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
        const i = mainStore.individuals.find(ind => ind._id === iId);
        return i ? i.name : 'Физлицо';
    }
    return null;
};

// 🟢 OPTIONS С ДИНАМИЧЕСКИМ БАЛАНСОМ 🟢
const accountOptions = computed(() => {
  const targetDate = createSmartDate(editableDate.value);
  const isFuture = isFutureDate.value;

  const opts = mainStore.currentAccountBalances.map(acc => {
    const owner = getOwnerName(acc);
    
    let displayBalance = acc.balance || 0;
    if (isFuture) {
        displayBalance = mainStore.getBalanceAtDate(acc._id, targetDate);
    }
    
    const option = {
        value: acc._id,
        label: acc.name, 
        subLabel: owner, 
        tooltip: owner ? `Владелец: ${owner}` : 'Нет привязки',
        isSpecial: false
    };
    if (permissions.shouldShowBalance.value) {
        option.rightText = `${formatNumber(Math.round(displayBalance))} ₸`;
    }
    return option;
  });
  opts.push({ isActionRow: true }); 
  return opts;
});

const ownerOptions = computed(() => {
  const opts = [];
  
  if (mainStore.currentCompanyBalances.length) {
      opts.push({ label: 'Компании', isHeader: true });
      mainStore.currentCompanyBalances.forEach(c => { 
          const option = { value: `company-${c._id}`, label: c.name };
          if (permissions.shouldShowBalance.value) {
              option.rightText = `${formatNumber(Math.abs(c.balance || 0))} ₸`;
          }
          opts.push(option); 
      });
  }
  if (mainStore.currentIndividualBalances.length) {
      opts.push({ label: 'Физлица', isHeader: true });
      mainStore.currentIndividualBalances.forEach(i => { 
          const nameLower = i.name.trim().toLowerCase();
          if (nameLower === 'розничные клиенты' || nameLower  === 'розница') return;
          const option = { value: `individual-${i._id}`, label: i.name };
          if (permissions.shouldShowBalance.value) {
              option.rightText = `${formatNumber(Math.abs(i.balance || 0))} ₸`;
          }
          opts.push(option); 
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

const isEditMode = computed(() => !!props.operationToEdit && !isCloneMode.value);

// 🟢 PERMISSIONS
const canEdit = computed(() => mainStore.canEdit);
const canDelete = computed(() => mainStore.canDelete);
const isReadOnly = computed(() => !canEdit.value);

// 🟢 ДИНАМИЧЕСКИЙ ЗАГОЛОВОК
const title = computed(() => {
    if (isCloneMode.value) return 'Копия: Расход';
    if (isEditMode.value) return 'Редактировать Расход';
    
    // Если будущее - пишем "Запланировать"
    if (isFutureDate.value) return 'Запланировать расход';
    
    return 'Новый Расход';
});

const buttonText = computed(() => {
    if (isEditMode.value) return 'Сохранить';
    if (isFutureDate.value) return 'Запланировать';
    return 'Добавить расход';
});

const myCreditsProjectId = computed(() => {
    const p = mainStore.projects.find(x => x.name.trim().toLowerCase() === 'мои кредиты');
    return p ? p._id : null;
});

// 🟢 ВАЛИДАЦИЯ БАЛАНСА 🟢
const validationResult = computed(() => {
    // Не валидируем, если не выбран счет или сумма некорректна
    if (!selectedAccountId.value) return { isValid: true };
    const rawAmount = parseFloat(amount.value.replace(/\s/g, ''));
    if (!rawAmount || rawAmount <= 0) return { isValid: true };

    const targetDate = createSmartDate(editableDate.value);
    
    // Вызываем проверку из Store
    return mainStore.validateTransaction(selectedAccountId.value, rawAmount, targetDate);
});

// 🟢 ЛОГИКА СКРЫТИЯ ВЛАДЕЛЬЦА
const isOwnerSelectVisible = computed(() => {
    // 1. Если создаем новый счет - нужно дать выбрать/создать владельца
    if (isCreatingAccount.value) return true;
    
    // 2. Если счет не выбран - показываем
    if (!selectedAccountId.value) return true;

    // 3. Если счет выбран, проверяем, есть ли у него привязанный владелец
    const acc = mainStore.accounts.find(a => a._id === selectedAccountId.value);
    
    // Если у счета есть companyId или individualId - скрываем
    if (acc && (acc.companyId || acc.individualId)) {
        return false;
    }
    
    // Иначе показываем (счет-сирота)
    return true;
});

// --- LOGIC WATCHERS ---

watch(selectedAccountId, (newVal) => {
    if (!newVal || isInitialLoad.value) return;
    const acc = mainStore.accounts.find(a => a._id === newVal);
    if (acc) {
        if (acc.companyId) selectedOwner.value = `company-${typeof acc.companyId === 'object' ? acc.companyId._id : acc.companyId}`;
        else if (acc.individualId) selectedOwner.value = `individual-${typeof acc.individualId === 'object' ? acc.individualId._id : acc.individualId}`;
    }
});

watch(selectedContractorValue, (newVal) => {
    if (isInitialLoad.value || !newVal) return;
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
        if (myCreditsProjectId.value) selectedProjectIds.value = [normalizeId(myCreditsProjectId.value)];
        if (mainStore.loanRepaymentCategoryId) selectedCategoryId.value = mainStore.loanRepaymentCategoryId;
        return;
    }
    let entity = null;
    if (prefix === 'contr') entity = mainStore.contractors.find(c => c._id === id);
    else entity = mainStore.individuals.find(i => i._id === id);
    if (entity) {
        if (entity.defaultProjectId) {
            const pid = normalizeId(entity.defaultProjectId);
            selectedProjectIds.value = pid ? [pid] : [];
        }
        if (entity.defaultCategoryId) selectedCategoryId.value = typeof entity.defaultCategoryId === 'object' ? entity.defaultCategoryId._id : entity.defaultCategoryId;
    }
});

watch(editableDate, (newVal, oldVal) => {
    if (!isInitialLoad.value && oldVal && newVal !== oldVal) isDateChanged.value = true;
});

const onAmountInput = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    amount.value = formatNumber(raw);
};

const toDisplayDate = (d) => { if (!d) return ''; const [y,m,d_] = d.split('-'); return `${d_}.${m}.${y}`; };

const processSave = () => {
    let cId = null, iId = null;
    if (selectedOwner.value) { const [type, id] = selectedOwner.value.split('-'); if (type === 'company') cId = id; else iId = id; }
    let contrId = null, contrIndId = null;
    if (selectedContractorValue.value) { const [type, id] = selectedContractorValue.value.split('_'); if (type === 'contr') contrId = id; else contrIndId = id; }

    const rawAmount = parseFloat(amount.value.replace(/\s/g, ''));
    const finalAmount = -Math.abs(rawAmount);

    let targetCellIndex = undefined;
    if (!isDateChanged.value && (!isEditMode.value || !isCloneMode.value)) targetCellIndex = props.cellIndex;

    let projectIdsClean = (selectedProjectIds.value || []).map(normalizeId).filter(Boolean);
    if (!projectIdsClean.length && defaultProjectId.value) {
        projectIdsClean = [defaultProjectId.value];
    }
    const payload = {
        type: 'expense', 
        amount: finalAmount, 
        // 🟢 ИСПОЛЬЗУЕМ УМНУЮ ДАТУ
        date: createSmartDate(editableDate.value), 
        accountId: selectedAccountId.value, companyId: cId, individualId: iId,
        contractorId: contrId, counterpartyIndividualId: contrIndId,
        categoryId: selectedCategoryId.value,
        projectId: projectIdsClean.length === 1 ? projectIdsClean[0] : primaryProjectId.value,
        projectIds: projectIdsClean.length > 1 ? projectIdsClean : (projectIdsClean.length === 1 ? undefined : (defaultProjectId.value ? [defaultProjectId.value] : undefined)),
        description: description.value, cellIndex: targetCellIndex
    };
    
    if (contrId || contrIndId) {
         const type = contrId ? 'contractors' : 'individuals';
         const id = contrId || contrIndId;
         const updateData = { _id: id };
         let needsUpdate = false;
         if (primaryProjectId.value) { updateData.defaultProjectId = primaryProjectId.value; needsUpdate = true; }
         if (selectedCategoryId.value) { updateData.defaultCategoryId = selectedCategoryId.value; needsUpdate = true; }
         if (needsUpdate) mainStore.batchUpdateEntities(type, [updateData]);
    }

    emit('save', { mode: isEditMode.value ? 'edit' : 'create', id: props.operationToEdit?._id, data: payload, originalOperation: props.operationToEdit });
    isSaving.value = false;
    isCreditWarningVisible.value = false;
};


const handleSave = async () => {
    if (isSaving.value || isInlineSaving.value) return;
    
    // 🟢 ВАЛИДАЦИЯ ПЕРЕД СОХРАНЕНИЕМ
    if (validationResult.value && !validationResult.value.isValid) {
        showError(validationResult.value.message);
        return;
    }

    const rawAmount = parseFloat(amount.value.replace(/\s/g, ''));
    if (!rawAmount || rawAmount <= 0) { showError('Введите сумму'); return; }
    if (!selectedAccountId.value) { showError('Выберите счет'); return; }
    const projectIdsClean = (selectedProjectIds.value || []).map(normalizeId).filter(Boolean);
    if (projectIdsClean.length > 1 && (selectedCategoryId.value === null || selectedCategoryId.value === undefined)) {
        showError('Укажите категорию для разбиения по проектам');
        return;
    }
    
    // 🟢 UPDATE ACCOUNT OWNERSHIP if owner is selected (even if account was created earlier)
    if (selectedAccountId.value && selectedOwner.value) {
        const acc = mainStore.accounts.find(a => a._id === selectedAccountId.value);
        if (acc) {
            const [type, id] = selectedOwner.value.split('-');
            const currentCompId = (acc.companyId && typeof acc.companyId === 'object') ? acc.companyId._id : acc.companyId;
            const currentIndId = (acc.individualId && typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
            
            let needsUpdate = false;
            if (type === 'company' && currentCompId !== id) needsUpdate = true;
            if (type === 'individual' && currentIndId !== id) needsUpdate = true;
            
            if (needsUpdate) {
                const updateData = { _id: acc._id, name: acc.name, order: acc.order };
                if (type === 'company') { 
                    updateData.companyId = id; 
                    updateData.individualId = null; 
                } else { 
                    updateData.companyId = null; 
                    updateData.individualId = id; 
                }
                await mainStore.batchUpdateEntities('accounts', [updateData]);
            }
        }
    }
    
    isSaving.value = true;

    if (mainStore.loanRepaymentCategoryId && selectedCategoryId.value === mainStore.loanRepaymentCategoryId) {
        let contrObj = null; let isContr = false;
        if (selectedContractorValue.value) {
            const [type, id] = selectedContractorValue.value.split('_');
            if (type === 'contr') { contrObj = mainStore.contractors.find(c => c._id === id); isContr = true; } 
            else { contrObj = mainStore.individuals.find(i => i._id === id); }
        }
        if (contrObj) {
            const nameLower = contrObj.name.toLowerCase().trim();
            const isKnownBank = knownBanks.some(b => nameLower.includes(b.name.toLowerCase()) || (b.keywords && b.keywords.some(k => nameLower.includes(k)))) || accountSuggestions.some(a => nameLower.includes(a.name.toLowerCase()) || (a.keywords && a.keywords.some(k => nameLower.includes(k))));

            if (isKnownBank) {
                const hasActiveCredit = mainStore.currentCreditBalances.some(c => {
                    const cId = c.contractorId?._id || c.contractorId;
                    const iId = c.individualId?._id || c.individualId;
                    let isMatch = false;
                    if (isContr && cId && String(cId) === String(contrObj._id)) isMatch = true;
                    if (!isContr && iId && String(iId) === String(contrObj._id)) isMatch = true;
                    return isMatch && c.balance > 0;
                });
                if (!hasActiveCredit) {
                    creditWarningMessage.value = `Вы собираетесь оплатить кредит "${contrObj.name}", которого нет в системе.`;
                    isCreditWarningVisible.value = true; isSaving.value = false; return;
                }
            }
        }
    }
    processSave();
};

const confirmCreditWarning = () => { isSaving.value = true; processSave(); };
const launchCreditWizard = () => { isCreditWarningVisible.value = false; isLocalWizardVisible.value = true; };
const handleLocalWizardSave = async (payload) => {
    try { await mainStore.addCredit(payload); await mainStore.fetchAllEntities(); isLocalWizardVisible.value = false; handleSave(); } 
    catch (e) { console.error(e); showError("Не удалось создать кредит: " + e.message); }
};

// --- CASH REGISTER LOGIC (Новое) ---
const openCashChoice = () => {
    showCashChoiceModal.value = true;
};

const handleCashChoice = (type) => {
    showCashChoiceModal.value = false;
    if (type === 'special') {
        showSpecialCashInfo.value = true;
    } else {
        startCashCreation('regular');
    }
};

const confirmSpecialCash = () => {
    showSpecialCashInfo.value = false;
    startCashCreation('special');
};

const startCashCreation = (type) => {
    accountCreationPlaceholder.value = type === 'special' ? 'Название спец. кассы' : 'Название кассы';
    newAccountName.value = '';
    isCreatingSpecialAccount.value = (type === 'special');
    isCreatingAccount.value = true;
    // Очищаем селект
    selectedAccountId.value = null;
    nextTick(() => newAccountInput.value?.focus());
};

const handleAccountChange = (val) => { 
    if (val === '--CREATE_NEW--') { 
        selectedAccountId.value = null; 
        accountCreationPlaceholder.value = 'Название счета';
        showAccountInput();
    } else { 
        selectedAccountId.value = val; 
    } 
};

const showAccountInput = () => { 
    isCreatingSpecialAccount.value = false;
    accountCreationPlaceholder.value = 'Название счета';
    isCreatingAccount.value = true; 
    nextTick(() => newAccountInput.value?.focus()); 
};

const cancelCreateAccount = () => { 
    isCreatingAccount.value = false; 
    newAccountName.value = ''; 
    isCreatingSpecialAccount.value = false;
};

const saveNewAccount = async () => {
    if (isInlineSaving.value) return; const name = newAccountName.value.trim(); if (!name) return;
    isInlineSaving.value = true;
    try {
        let cId = null, iId = null; if (selectedOwner.value) { const [t, id] = selectedOwner.value.split('-'); if (t==='company') cId=id; else iId=id; }
        // 🟢 Передаем isExcluded
        const newItem = await mainStore.addAccount({ 
            name, 
            companyId: cId, 
            individualId: iId,
            isExcluded: isCreatingSpecialAccount.value
        });
        selectedAccountId.value = newItem._id; cancelCreateAccount();
    } catch(e) { console.error(e); showError('Ошибка при создании счета: ' + e.message); } finally { isInlineSaving.value = false; }
};

// Inline Creates Handlers
const handleProjectChange = (val) => { 
    if (Array.isArray(val) && val.includes('--CREATE_NEW--')) {
        selectedProjectIds.value = [];
        isCreatingProject.value = true; 
        nextTick(() => newProjectInput.value?.focus()); 
    }
};
const handleCategoryChange = (val) => { if (val === '--CREATE_NEW--') { selectedCategoryId.value = null; isCreatingCategory.value = true; nextTick(() => newCategoryInput.value?.focus()); } };

const cancelCreateProject = () => { isCreatingProject.value = false; newProjectName.value = ''; };
const saveNewProject = async () => {
    if (isInlineSaving.value) return; const name = newProjectName.value.trim(); if (!name) return;
    isInlineSaving.value = true; try { const item = await mainStore.addProject(name); selectedProjectIds.value = [item._id]; cancelCreateProject(); } catch(e){ console.error(e); showError('Ошибка создания проекта: ' + e.message); } finally { isInlineSaving.value = false; }
};

const cancelCreateCategory = () => { isCreatingCategory.value = false; newCategoryName.value = ''; };
const saveNewCategory = async () => {
    if (isInlineSaving.value) return; const name = newCategoryName.value.trim(); if (!name) return;
    isInlineSaving.value = true; try { const item = await mainStore.addCategory(name); selectedCategoryId.value = item._id; cancelCreateCategory(); } catch(e){ console.error(e); showError('Ошибка создания категории: ' + e.message); } finally { isInlineSaving.value = false; } };

const openCreateOwnerModal = (type) => { ownerTypeToCreate.value = type; newOwnerName.value = ''; showCreateOwnerModal.value = true; nextTick(() => newOwnerInputRef.value?.focus()); };
const cancelCreateOwner = () => { showCreateOwnerModal.value = false; newOwnerName.value = ''; if (!selectedOwner.value) selectedOwner.value = null; };
const saveNewOwner = async () => {
    if (isInlineSaving.value) return; const name = newOwnerName.value.trim(); if (!name) return;
    isInlineSaving.value = true; try { 
        let item; if (ownerTypeToCreate.value === 'company') item = await mainStore.addCompany(name); else item = await mainStore.addIndividual(name);
        selectedOwner.value = `${ownerTypeToCreate.value}-${item._id}`; showCreateOwnerModal.value = false;
    } catch(e){ console.error(e); showError('Ошибка создания владельца: ' + e.message); } finally { isInlineSaving.value = false; }
};

const openCreateContractorModal = (type) => { contractorTypeToCreate.value = type; newContractorNameInput.value = ''; showCreateContractorModal.value = true; nextTick(() => newContractorInputRef.value?.focus()); };
const cancelCreateContractorModal = () => { showCreateContractorModal.value = false; newContractorNameInput.value = ''; if (!selectedContractorValue.value) selectedContractorValue.value = null; };
const saveNewContractorModal = async () => {
    if (isInlineSaving.value) return; const name = newContractorNameInput.value.trim(); if (!name) return;
    isInlineSaving.value = true; try {
        let item; if (contractorTypeToCreate.value === 'contractor') { item = await mainStore.addContractor(name); selectedContractorValue.value = `contr_${item._id}`; } 
        else { item = await mainStore.addIndividual(name); selectedContractorValue.value = `ind_${item._id}`; }
        showCreateContractorModal.value = false;
    } catch(e){ console.error(e); showError('Ошибка создания контрагента: ' + e.message); } finally { isInlineSaving.value = false; }
};

const handleCopyClick = () => { isCloneMode.value = true; editableDate.value = toInputDate(new Date()); nextTick(() => amountInput.value?.focus()); };
const handleDeleteClick = () => { isDeleteConfirmVisible.value = true; };
const onDeleteConfirmed = () => { isDeleteConfirmVisible.value = false; emit('close'); emit('operation-deleted', props.operationToEdit); mainStore.deleteOperation(props.operationToEdit); };

onMounted(async () => {
    isInitialLoad.value = true;
    if (props.date) editableDate.value = toInputDate(props.date);
    
    if (props.operationToEdit) {
        const op = props.operationToEdit;
        amount.value = formatNumber(Math.abs(op.amount));
        selectedAccountId.value = op.accountId?._id || op.accountId;
        const projIds = Array.isArray(op.projectIds)
            ? op.projectIds.map(normalizeId).filter(Boolean)
            : [];
        if (projIds.length) {
            selectedProjectIds.value = projIds;
        } else {
            const projId = normalizeId(op.projectId?._id || op.projectId);
            selectedProjectIds.value = projId ? [projId] : [];
        }
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
    // Автоподстановка "Без проекта" при отсутствии выбора
    if (!selectedProjectIds.value.length) {
        selectedProjectIds.value = [defaultProjectId.value ?? null];
    }
    await nextTick();
    isInitialLoad.value = false;
});

// Не позволяем оставить поле проектов пустым — подставляем "Без проекта"
watch(selectedProjectIds, (val) => {
    if (!val || !val.length) {
        selectedProjectIds.value = [defaultProjectId.value ?? null];
    }
});

// Если проект "Без проекта" станет доступен позже (после загрузки справочников) — подставить его
watch(defaultProjectId, (defId) => {
    if (!selectedProjectIds.value || !selectedProjectIds.value.length) {
        selectedProjectIds.value = [defId ?? null];
    }
}, { immediate: true });
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content theme-expense">
      <h3>{{ title }}</h3>
      
      <!-- СУММА + ВАЛИДАЦИЯ -->
      <div class="custom-input-box input-spacing" :class="{ 'has-value': !!amount, 'is-invalid': validationResult && !validationResult.isValid }">
          <div class="input-inner-content">
             <span v-if="amount" class="floating-label">Сумма расхода, ₸</span>
             <input type="text" inputmode="decimal" v-model="amount" placeholder="0 ₸" class="real-input" ref="amountInput" @input="onAmountInput" :disabled="isReadOnly" />
          </div>
      </div>
      
      <!-- 🟢 Блок ошибки валидации -->
      <div v-if="validationResult && !validationResult.isValid" class="validation-error">
          {{ validationResult.message }}
      </div>

      <template v-if="!showCreateOwnerModal && !showCreateContractorModal">
          <!-- СЧЕТ -->
          <div v-if="!isCreatingAccount" class="input-spacing" :class="{ 'is-disabled': isReadOnly }">
              <BaseSelect v-model="selectedAccountId" :options="accountOptions" placeholder="Счет списания" label="Счет списания" @change="handleAccountChange" :disabled="isReadOnly">
                  <!-- 🟢 Slot for Dual Create Buttons -->
                  <template #action-item v-if="canEdit">
                      <div class="dual-action-row">
                          <button @click="showAccountInput" class="btn-dual-action left">Создать счет</button>
                          <button @click="openCashChoice" class="btn-dual-action right"> Создать кассу</button>
                      </div>
                  </template>
              </BaseSelect>
          </div>
          <div v-else class="inline-create-form input-spacing relative">
              <input type="text" v-model="newAccountName" :placeholder="accountCreationPlaceholder" ref="newAccountInput" @keyup.enter="saveNewAccount" @keyup.esc="cancelCreateAccount" @blur="handleAccountInputBlur" @focus="handleAccountInputFocus" />
              <button @click="saveNewAccount" class="btn-inline-save">✓</button>
              <button @click="cancelCreateAccount" class="btn-inline-cancel">✕</button>
              <ul v-if="showAccountSuggestions && accountSuggestionsList.length" class="bank-suggestions-list"><li v-for="(acc, i) in accountSuggestionsList" :key="i" @mousedown.prevent="selectAccountSuggestion(acc)">{{ acc.name }}</li></ul>
          </div>

          <!-- 🟢 ВЛАДЕЛЕЦ (СКРЫВАЕМ ЕСЛИ ЕСТЬ ПРИВЯЗКА) -->
          <div v-if="isOwnerSelectVisible" class="input-spacing" :class="{ 'is-disabled': isReadOnly }">
              <BaseSelect v-model="selectedOwner" :options="ownerOptions" placeholder="Владельцы счетов" label="Владельцы счетов" :disabled="isReadOnly">
                  <template #action-item v-if="canEdit">
                      <div class="dual-action-row">
                          <button @click="openCreateOwnerModal('company')" class="btn-dual-action left">+ Создать Компанию</button>
                          <button @click="openCreateOwnerModal('individual')" class="btn-dual-action right">+ Создать Физлицо</button>
                      </div>
                  </template>
              </BaseSelect>
          </div>

          <!-- КОНТРАГЕНТ (Кому) -->
          <div class="input-spacing" :class="{ 'is-disabled': isReadOnly }">
              <BaseSelect v-model="selectedContractorValue" :options="contractorOptions" placeholder="Кому (Контрагент)" label="Кому (Контрагент)" :disabled="isReadOnly">
                  <template #action-item v-if="canEdit">
                      <div class="dual-action-row">
                          <button @click="openCreateContractorModal('contractor')" class="btn-dual-action left">+ Созд. контрагента</button>
                          <button @click="openCreateContractorModal('individual')" class="btn-dual-action right">+ Созд. физлицо</button>
                      </div>
                  </template>
              </BaseSelect>
          </div>

          <!-- ПРОЕКТ -->
          <div v-if="!isCreatingProject" class="input-spacing" :class="{ 'is-disabled': isReadOnly }">
              <BaseSelect v-model="selectedProjectIds" :multiple="true" :options="projectOptions" placeholder="Проект" label="Проект" @change="handleProjectChange" :disabled="isReadOnly || props.operationToEdit?.isSplitChild" />
          </div>
          <div v-else class="inline-create-form input-spacing">
              <input type="text" v-model="newProjectName" placeholder="Название проекта" ref="newProjectInput" @keyup.enter="saveNewProject" @keyup.esc="cancelCreateProject" />
              <button @click="saveNewProject" class="btn-inline-save">✓</button>
              <button @click="cancelCreateProject" class="btn-inline-cancel">✕</button>
          </div>

          <!-- КАТЕГОРИЯ -->
          <div v-if="!isCreatingCategory" class="input-spacing" :class="{ 'is-disabled': isReadOnly }">
              <BaseSelect v-model="selectedCategoryId" :options="categoryOptions" placeholder="Категория" label="Категория" @change="handleCategoryChange" :disabled="isReadOnly" />
          </div>
          <div v-else class="inline-create-form input-spacing relative">
              <input type="text" v-model="newCategoryName" placeholder="Название категории" ref="newCategoryInput" @keyup.enter="saveNewCategory" @keyup.esc="cancelCreateCategory" @blur="handleCategoryInputBlur" @focus="handleCategoryInputFocus" />
              <button @click="saveNewCategory" class="btn-inline-save">✓</button>
              <button @click="cancelCreateCategory" class="btn-inline-cancel">✕</button>
              <ul v-if="showCategorySuggestions && categorySuggestionsList.length" class="bank-suggestions-list"><li v-for="(c, i) in categorySuggestionsList" :key="i" @mousedown.prevent="selectCategorySuggestion(c)">{{ c.name }}</li></ul>
          </div>

          <!-- ДАТА + ИНДИКАТОР -->
          <div class="custom-input-box input-spacing has-value date-box">
             <div class="input-inner-content">
                <span class="floating-label">Дата операции</span>
                <div class="date-display-row">
                   <span class="date-value-text">{{ toDisplayDate(editableDate) }}</span>
                   
                   <!-- 🟢 Индикатор ПЛАН/ФАКТ -->
                   <span class="date-badge" :class="isFutureDate ? 'plan-badge' : 'fact-badge'">
                       {{ isFutureDate ? 'ПЛАН' : 'ФАКТ' }}
                   </span>

                   <input type="date" v-model="editableDate" class="real-input date-overlay" :min="minAllowedDate ? toInputDate(minAllowedDate) : null" :max="maxAllowedDate ? toInputDate(maxAllowedDate) : null" :disabled="isReadOnly" />
                   
                   <svg class="calendar-icon-svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </div>
             </div>
          </div>
          
          <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

          <!-- НИЖНЯЯ ПАНЕЛЬ ДЕЙСТВИЙ -->
          <div class="popup-actions-row">
              <button v-if="canEdit" class="btn-submit btn-expense save-wide" @click="handleSave" :disabled="isSaving || isInlineSaving || (validationResult && !validationResult.isValid)">
                  {{ buttonText }}
              </button>
              <div v-else class="read-only-info">Режим просмотра ({{ mainStore.workspaceRole }})</div>
              
              <div v-if="props.operationToEdit && !isCloneMode" class="icon-actions">
                  <button v-if="canEdit" class="icon-btn copy-btn" title="Копировать" @click="handleCopyClick" :disabled="isSaving"><svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg></button>
                  <button v-if="canDelete" class="icon-btn delete-btn" title="Удалить" @click="handleDeleteClick" :disabled="isSaving"><svg class="icon-stroke" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
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
            <!-- 🟢 УНИФИЦИРОВАННЫЕ КНОПКИ -->
            <button @click="cancelCreateOwner" class="btn-modal-action btn-modal-cancel">Отмена</button>
            <button @click="saveNewOwner" class="btn-modal-action btn-modal-create">Создать</button>
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
            <!-- 🟢 УНИФИЦИРОВАННЫЕ КНОПКИ -->
            <button @click="cancelCreateContractorModal" class="btn-modal-action btn-modal-cancel">Отмена</button>
            <button @click="saveNewContractorModal" class="btn-modal-action btn-modal-create">Создать</button>
          </div>
        </div>
      </template>
    </div>
    
    <!-- 🟢 CHOICE MODAL: ВЫБОР ТИПА КАССЫ -->
    <div v-if="showCashChoiceModal" class="inner-overlay" @click.self="showCashChoiceModal = false">
        <div class="choice-box">
            <h4>Создание кассы</h4>
            <p class="choice-desc">Отображаются в виджете 
                <br> "Счета/Кассы"</p>
            <div class="choice-actions">
                <button class="btn-choice-option" @click="handleCashChoice('regular')">
                    <span class="opt-title">Обычная касса</span>
                </button>
                <button class="btn-choice-option" @click="handleCashChoice('special')">
                    <span class="opt-title">Особая касса</span>
                </button>
            </div>
            <button class="btn-cancel-link" @click="showCashChoiceModal = false">Отмена</button>
        </div>
    </div>

    <!-- 🟢 INFO MODAL: ОСОБАЯ КАССА -->
    <InfoModal 
       v-if="showSpecialCashInfo" 
       title="Особая касса" 
       message="Вы создаёте особый вид кассы, которую можно исключать из общих расчётов. Сделать это можно в настройках 'Счета/Кассы'." 
       buttonText="Продолжить создание"
       @close="confirmSpecialCash"
    />

    <ConfirmationPopup v-if="isDeleteConfirmVisible" title="Подтвердите удаление" message="Вы уверены?" @close="isDeleteConfirmVisible = false" @confirm="onDeleteConfirmed" />
    
    <InfoModal v-if="showInfoModal && !showSpecialCashInfo" :title="infoModalTitle" :message="infoModalMessage" @close="showInfoModal = false" />
    
    <div v-if="isCreditWarningVisible" class="inner-overlay" @click.self="isCreditWarningVisible = false">
        <div class="warning-box">
            <h4>Кредит не найден</h4>
            <p class="warning-text">{{ creditWarningMessage }}</p>
            <div class="warning-actions">
                <button class="btn-warning-create" @click="launchCreditWizard">Внести действующий кредит в систему</button>
                <button class="btn-warning-continue" @click="confirmCreditWarning">Все равно оплатить</button>
            </div>
        </div>
    </div>
    <CreditWizardPopup v-if="isLocalWizardVisible" @close="isLocalWizardVisible = false" @save="handleLocalWizardSave" />
  </div>
</template>

<style scoped>
/* 🟢 CSS ПЕРЕМЕННЫЕ ДЛЯ РАСХОДА */
.popup-content {
    --color-expense: #F36F3F; /* Оранжевый */
    --color-danger: #FF3B30;
    --focus-shadow: rgba(243, 111, 63, 0.2); /* Оранжевая тень */
    /* 🟢 Передаем focus-color в BaseSelect для переопределения */
    --focus-color: #F36F3F;
    /* 🟢 SYSTEM APPLE FONT */
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
}

/* Force Apple Font globally inside popup */
:deep(*), :deep(input), :deep(button), :deep(select), :deep(textarea) {
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
}

.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  overflow-y: auto;
  pointer-events: auto; /* 🟢 Prevent click-through to graphs */
}
.popup-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); margin: 2rem 1rem; }
.theme-expense { border-top: 4px solid #F36F3F; }
h3 { margin: 0; margin-bottom: 1.5rem; font-size: 22px; font-weight: 700; color: #1a1a1a; text-align: left; }

.custom-input-box { width: 100%; height: 54px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; padding: 0 14px; display: flex; align-items: center; position: relative; transition: all 0.2s ease; box-sizing: border-box; }
/* 🟢 2. ФОКУС СУММЫ - ЦВЕТ РАСХОДА */
.custom-input-box:focus-within { border-color: var(--color-expense) !important; box-shadow: 0 0 0 1px var(--focus-shadow) !important; }
/* 🟢 Ошибка валидации */
.custom-input-box.is-invalid { border-color: #FF3B30 !important; box-shadow: 0 0 0 2px rgba(255, 59, 48, 0.2) !important; }
.validation-error { color: #FF3B30; font-size: 13px; margin-top: 6px; font-weight: 500; margin-left: 2px; }

.input-inner-content { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.floating-label { font-size: 11px; color: #999; margin-bottom: -2px; margin-top: 4px; font-weight: 500; }
.real-input { width: 100%; border: none; background: transparent; padding: 0; font-size: 15px !important; color: #1a1a1a; font-weight: 500; outline: none; height: auto; line-height: 1.3; font-family: inherit; }
.input-spacing { margin-bottom: 12px; }

/* 🟢 НОВАЯ ИКОНКА КАЛЕНДАРЯ */
.calendar-icon-svg { width: 18px; height: 18px; stroke: #999; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.date-display-row { display: flex; justify-content: space-between; align-items: center; position: relative; width: 100%; }
.date-value-text { font-size: 15px; font-weight: 500; color: #1a1a1a; }
.date-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; z-index: 2; }
/* 🟢 БЕЙДЖ ДАТЫ */
.date-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 8px; display: inline-block; vertical-align: middle; }
.fact-badge { background-color: rgba(52, 199, 89, 0.15); color: #34c759; }
.plan-badge { background-color: rgba(0, 122, 255, 0.15); color: #007AFF; }


.popup-actions-row { display: flex; align-items: center; gap: 10px; margin-top: 2rem; }
.save-wide { flex: 1 1 auto; height: 54px; }
.btn-submit { width: 100%; height: 50px; border-radius: 8px; border: none; color: white; font-size: 16px; font-weight: 600; cursor: pointer; transition: background-color 0.2s; }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; background-color: #aaa; }

/* 🟢 ЦВЕТ КНОПКИ СОХРАНИТЬ (КРАСНЫЙ/ОРАНЖЕВЫЙ) */
.btn-expense { background-color: var(--color-expense); }
.btn-expense:hover:not(:disabled) { background-color: #E05A2D; }

.icon-actions { display: flex; gap: 10px; margin-left: auto; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 10px; cursor: pointer; background: #F4F4F4; border: 1px solid #E0E0E0; color: #333; transition: all 0.2s; padding: 0; }
.copy-btn:hover { background: #E8F5E9; border-color: #A5D6A7; color: #34C759; }
.delete-btn:hover { border-color: #ff3b30; background: #fff5f5; }
.delete-btn:hover .icon-stroke { stroke: #FF3B30; }
.icon-stroke { width: 20px; height: 20px; stroke: #333; fill: none; transition: stroke 0.2s; }
.icon { width: 20px; height: 20px; fill: currentColor; display: block; }
.error-message { color: #FF3B30; text-align: center; margin-top: 1rem; font-size: 14px; }

/* 🟢 ИНЛАЙН СОЗДАНИЕ - УНИФИЦИРОВАННЫЕ КНОПКИ */
.inline-create-form { display: flex; align-items: center; gap: 8px; margin-bottom: 15px; }
.inline-create-form input { flex: 1; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; box-sizing: border-box; }
.inline-create-form input:focus { outline: none; border-color: var(--color-expense); }

/* Кнопка "Сохранить" (Галочка) */
.btn-inline-save { 
    width: 48px; height: 48px; 
    background-color: transparent; 
    border: 1px solid var(--color-expense); /* Оранжевый */
    color: var(--color-expense); 
    border-radius: 8px; 
    font-size: 20px; 
    cursor: pointer;
    transition: all 0.2s;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;
}
.btn-inline-save:hover:not(:disabled) { background-color: var(--color-expense); color: #fff; }
.btn-inline-save:disabled { opacity: 0.6; cursor: not-allowed; }

/* Кнопка "Отмена" (Крестик) */
.btn-inline-cancel { 
    width: 48px; height: 48px; 
    background-color: transparent; 
    border: 1px solid var(--color-danger); 
    color: var(--color-danger); 
    border-radius: 8px; 
    font-size: 20px; 
    cursor: pointer;
    transition: all 0.2s;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;
}
.btn-inline-cancel:hover { background-color: var(--color-danger); color: #fff; }

/* 🟢 Dual Action (BaseSelect Footer) */
.dual-action-row { display: flex; width: 100%; height: 46px; border-top: 1px solid #eee; }
.btn-dual-action { 
    flex: 1; border: none; background-color: #fff; 
    font-size: 13px; font-weight: 600; 
    color: var(--color-expense); /* Оранжевый */
    cursor: pointer; transition: background-color 0.2s; white-space: nowrap; 
}
.btn-dual-action:hover { background-color: #fff3e0; }
.btn-dual-action.left { border-right: 1px solid #eee; border-bottom-left-radius: 8px; }
.btn-dual-action.right { border-bottom-right-radius: 8px; }

/* 🟢 МОДАЛЬНЫЕ КНОПКИ */
.smart-create-owner { border-top: 1px solid #E0E0E0; margin-top: 1.5rem; padding-top: 1.5rem; }
.smart-create-title { font-size: 18px; font-weight: 600; text-align: center; margin-bottom: 1.5rem; }
.smart-create-tabs { display: flex; justify-content: center; gap: 10px; margin-bottom: 1.5rem; }
.smart-create-tabs button { flex: 1; padding: 12px; font-size: 14px; font-weight: 500; border: 1px solid #E0E0E0; border-radius: 8px; background: #FFFFFF; color: #333; cursor: pointer; transition: all 0.2s; }
.smart-create-tabs button.active { background: #222; color: #FFFFFF; } /* Черный активный таб - нейтрально */
.smart-create-actions { display: flex; gap: 10px; margin-top: 1rem; }
.form-input { width: 100%; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; font-size: 15px; font-family: inherit; box-sizing: border-box; }

.btn-modal-action { flex: 1; height: 48px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; }
.btn-modal-cancel { background-color: #f0f0f0; color: #333; border: 1px solid #ddd; }
.btn-modal-create { background-color: var(--color-expense); color: white; } 
.btn-modal-create:hover:not(:disabled) { background-color: #E05A2D; }
.btn-modal-create:disabled { opacity: 0.6; cursor: not-allowed; }

/* 🟢 СТИЛЬ ДЛЯ КНОПКИ 'СОЗДАТЬ' ВНУТРИ BASESELECT */
/* Sticky Action Row */
:deep(.list-item-wrapper.is-action-row) {
    position: sticky;
    bottom: 0;
    z-index: 10;
    background-color: #fff;
    border-top: 1px solid #eee;
}

:deep(.list-item-wrapper.is-special) { 
    color: var(--color-expense); 
    font-weight: 600;
    position: sticky !important;
    bottom: 0 !important;
    z-index: 10;
    background-color: #fff;
    border-top: 1px solid #eee;
}
:deep(.list-item-wrapper.is-special:hover) {
    background-color: #fff3e0;
}

.relative { position: relative; }
.bank-suggestions-list { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #E0E0E0; border-top: none; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); z-index: 2000; list-style: none; padding: 0; margin: 0; max-height: 160px; overflow-y: auto; }
.bank-suggestions-list li { padding: 10px 14px; font-size: 14px; color: #333; cursor: pointer; border-bottom: 1px solid #f5f5f5; }
.bank-suggestions-list li:last-child { border-bottom: none; }
.bank-suggestions-list li:hover { background-color: #f9f9f9; }

/* Warning Box */
.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 2100; }
.warning-box { background: #fff; padding: 24px; border-radius: 12px; width: 340px; text-align: center; box-shadow: 0 5px 30px rgba(0,0,0,0.3); }
.warning-box h4 { margin: 0 0 10px; color: #222; font-size: 18px; font-weight: 600; }
.warning-text { font-size: 14px; margin-bottom: 24px; color: #555; line-height: 1.5; }
.warning-actions { display: flex; flex-direction: column; gap: 10px; }
.btn-warning-create { background: #8FD4FF; color: #004472; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 700; transition: background 0.2s; }
.btn-warning-create:hover { background: #6EBAFF; }
.btn-warning-continue { background: #34c759; color: #ffffff; border: 1px solid #dddddd; padding: 8px 20px; border-radius: 8px; cursor: pointer; font-size: 13px; }
.btn-warning-continue:hover { border-color: #aaa; color: #555; }

/* 🟢 СТИЛИ ДЛЯ МОДАЛКИ ВЫБОРА (CHOICE BOX) */
.choice-box { background: #fff; padding: 24px; border-radius: 12px; width: 340px; text-align: center; box-shadow: 0 5px 30px rgba(0,0,0,0.3); }
.choice-box h4 { margin: 0 0 15px 0; color: #222; font-size: 18px; font-weight: 700; }
.choice-desc { font-size: 14px; color: #666; margin-bottom: 20px; }
.choice-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; }
.btn-choice-option { 
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 12px; background: #F9F9F9; border: 1px solid #E0E0E0; border-radius: 8px; cursor: pointer; transition: all 0.2s;
}
.btn-choice-option:hover { background: #f0f8ff; border-color: #28B8A0; }
.opt-title { font-size: 15px; font-weight: 600; color: #222; margin-bottom: 4px; }
.btn-cancel-link { background: none; border: none; font-size: 14px; color: #888; cursor: pointer; text-decoration: underline; }
.btn-cancel-link:hover { color: #555; }

/* 🟢 Dual Action in Select */
.dual-action-row { display: flex; width: 100%; height: 46px; border-top: 1px solid #eee; }
.btn-dual-action { flex: 1; border: none; background-color: #fff; font-size: 13px; font-weight: 600; color: var(--color-withdrawal); cursor: pointer; transition: background-color 0.2s; white-space: nowrap; }
.btn-dual-action:hover { background-color: #f0f8ff; }
.btn-dual-action.left { border-right: 1px solid #eee; border-bottom-left-radius: 8px; }
.btn-dual-action.right { border-bottom-right-radius: 8px; }

/* 🟢 MOBILE OPTIMIZATION */
@media (max-width: 600px), (max-height: 900px) {
  .popup-content { padding: 1.5rem; margin: 1rem; }
  h3 { font-size: 18px; margin-bottom: 1rem; }
  .custom-input-box { height: 44px; }
  .input-spacing { margin-bottom: 8px; }
  .btn-submit, .btn-modal-action, .btn-inline-save, .btn-inline-cancel { height: 44px; font-size: 15px; }
  .icon-btn { width: 44px; height: 44px; }
  .form-input { height: 44px; }
  .floating-label { font-size: 10px; margin-bottom: 0; }
  .real-input { font-size: 14px !important; }
  .popup-actions-row { margin-top: 1.5rem; }
}
@media (max-width: 600px) {
  .popup-content { width: 100%; max-width: none; }
}
</style>
