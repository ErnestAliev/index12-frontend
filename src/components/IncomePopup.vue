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
 * * --- МЕТКА ВЕРСИИ: v4.0 - CREDIT THEME & EXPENSE CLEANUP ---
 * * ВЕРСИЯ: 4.0
 * * ДАТА: 2025-12-03
 * * ИЗМЕНЕНИЯ:
 * 1. (UI) Добавлена тема 'theme-credit' (фиолетовая) для операций получения кредита.
 * 2. (UI) Заголовок меняется на "Редактор кредита" если это кредит.
 */

const mainStore = useMainStore();
const props = defineProps({
  date: { type: Date, required: true },
  cellIndex: { type: Number, required: true },
  operationToEdit: { type: Object, default: null },
  minAllowedDate: { type: Date, default: null },
  maxAllowedDate: { type: Date, default: null }
});

const emit = defineEmits(['close', 'save', 'operation-deleted', 'trigger-prepayment', 'trigger-smart-deal']);

// --- ДАННЫЕ ---
const amount = ref('');
const amountInput = ref(null);
const selectedAccountId = ref(null);
const selectedOwner = ref(null); 
const selectedContractorValue = ref(null); 
const selectedProjectId = ref(null);
const selectedCategoryId = ref(null);

// СТАТУС ОПЕРАЦИИ (По умолчанию Факт)
const operationStatus = ref('fact'); 

// 🟢 ПРОВЕРКА: Выбрана ли Розница
const isRetailClientSelected = computed(() => {
    if (!selectedContractorValue.value) return false;
    return mainStore.retailIndividualId && selectedContractorValue.value === `ind_${mainStore.retailIndividualId}`;
});

// 🟢 ДИНАМИЧЕСКИЕ ОПЦИИ СТАТУСА
const statusOptions = computed(() => {
    if (isRetailClientSelected.value) {
        return [
            { value: 'fact', label: 'Факт (Просто оплата)' },
            { value: 'retail_prepayment', label: 'Предоплата / Розница' }
        ];
    }
    return [
        { value: 'fact', label: 'Факт (Просто доход)' },
        { value: 'prepayment', label: 'Предоплата / Сделка' },
        { value: 'credit_receipt', label: 'Получение кредита' }
    ];
});

// Сброс статуса при переключении на розницу/обратно
watch(isRetailClientSelected, (isRetail) => {
    if (isRetail) {
        // Если переключились на розницу, дефолт - Факт
        operationStatus.value = 'fact';
    } else {
        // Если ушли с розницы - тоже Факт (безопасно)
        operationStatus.value = 'fact';
    }
});

const isSaving = ref(false);
const errorMessage = ref('');
const isCloneMode = ref(false);
const editableDate = ref('');
const isInlineSaving = ref(false);
const isInitialLoad = ref(true);
const isDateChanged = ref(false);

// --- INLINE CREATE STATES ---
const isCreatingAccount = ref(false); const newAccountName = ref(''); const newAccountInput = ref(null);
const isCreatingProject = ref(false); const newProjectName = ref(''); const newProjectInput = ref(null);
const isCreatingCategory = ref(false); const newCategoryName = ref(''); const newCategoryInput = ref(null);
const showAccountSuggestions = ref(false); const showCategorySuggestions = ref(false);

// Создание Владельца
const showCreateOwnerModal = ref(false);
const ownerTypeToCreate = ref('company'); 
const newOwnerName = ref('');
const newOwnerInputRef = ref(null);

// Создание Контрагента
const showCreateContractorModal = ref(false);
const contractorTypeToCreate = ref('contractor'); 
const newContractorNameInput = ref('');
const newContractorInputRef = ref(null);

// 🟢 АВТОПОДСТАНОВКА БАНКОВ (НОВЫЙ КОНТРАГЕНТ)
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
    newContractorNameInput.value = bank.name;
    showContractorBankSuggestions.value = false;
    nextTick(() => newContractorInputRef.value?.focus());
};

const handleContractorInputBlur = () => { setTimeout(() => { showContractorBankSuggestions.value = false; }, 200); };
const handleContractorInputFocus = () => { if (newContractorNameInput.value.length >= 2) showContractorBankSuggestions.value = true; };
watch(newContractorNameInput, (val) => { showContractorBankSuggestions.value = val.length >= 2; });

// 🟢 АВТОПОДСТАНОВКА БАНКОВ (НОВЫЙ ВЛАДЕЛЕЦ)
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
    newOwnerName.value = bank.name;
    showOwnerBankSuggestions.value = false;
    nextTick(() => newOwnerInputRef.value?.focus());
};

const handleOwnerInputBlur = () => { setTimeout(() => { showOwnerBankSuggestions.value = false; }, 200); };
const handleOwnerInputFocus = () => { if (newOwnerName.value.length >= 2) showOwnerBankSuggestions.value = true; };
watch(newOwnerName, (val) => { showOwnerBankSuggestions.value = val.length >= 2; });


const isEditMode = computed(() => !!props.operationToEdit && !isCloneMode.value);
const isProtectedMode = computed(() => {
    if (!isEditMode.value) return false;
    const op = props.operationToEdit;
    if (!op) return false;
    if ((op.totalDealAmount || 0) > 0) return true;
    if (op.isDealTranche) return true;
    if (mainStore._isRetailWriteOff(op)) return true;
    return false;
});

const title = computed(() => {
    if (isCloneMode.value) return 'Копия: Доход';
    if (isProtectedMode.value) return 'Редактировать сделку';
    
    // 🟢 Если это кредит, меняем заголовок
    if (operationStatus.value === 'credit_receipt') {
        return isEditMode.value ? 'Редактировать Кредит' : 'Новый Кредит';
    }
    
    return isEditMode.value ? 'Редактировать Доход' : 'Новый Доход';
});

// 🟢 COMPUTED: CSS CLASS ДЛЯ ТЕМЫ ПОПАПА
const popupThemeClass = computed(() => {
    if (isProtectedMode.value) return 'theme-readonly';
    if (operationStatus.value === 'credit_receipt') return 'theme-credit';
    return 'theme-income';
});

// SMART DEAL LOGIC
const localDealStatus = computed(() => {
    if (!selectedProjectId.value || !selectedCategoryId.value || !selectedContractorValue.value) return null;
    let searchCId = null, searchIndId = null;
    const [prefix, id] = selectedContractorValue.value.split('_');
    if (prefix === 'contr') searchCId = id; else searchIndId = id;
    const status = mainStore.getProjectDealStatus(selectedProjectId.value, selectedCategoryId.value, searchCId, searchIndId);
    if (!status || status.totalDeal === 0) return null;
    return status;
});

const isDealDetected = computed(() => !!localDealStatus.value);
const nextTrancheNumber = computed(() => (localDealStatus.value?.tranchesCount || 0) + 1);

const mainButtonText = computed(() => {
    if (isCloneMode.value) return 'Создать копию';
    if (isEditMode.value) return 'Сохранить изменения';
    if (isDealDetected.value) return `Внести ${nextTrancheNumber.value}-й транш...`;
    
    // Если розница
    if (isRetailClientSelected.value) {
        if (operationStatus.value === 'retail_prepayment') {
            return 'Предоплата от розницы';
        }
        return 'Добавить доход';
    }

    if (operationStatus.value === 'prepayment') return 'Оформить предоплату...';
    if (operationStatus.value === 'credit_receipt') return 'Получить кредит'; 
    return 'Добавить доход';
});

const mainButtonClass = computed(() => {
    if (isRetailClientSelected.value && operationStatus.value === 'retail_prepayment') {
        return 'btn-submit-prepayment';
    }

    if (isDealDetected.value || operationStatus.value === 'prepayment') return 'btn-submit-prepayment';
    if (operationStatus.value === 'credit_receipt') return 'btn-submit-credit';
    return 'btn-submit-income';
});

watch(editableDate, (newVal, oldVal) => {
    if (!isInitialLoad.value && oldVal && newVal !== oldVal) isDateChanged.value = true;
});

const myCreditsProjectId = computed(() => {
    const p = mainStore.projects.find(x => x.name.trim().toLowerCase() === 'мои кредиты');
    return p ? p._id : null;
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
          // Из списка ВЛАДЕЛЬЦЕВ розницу убираем (они не владеют нашими счетами)
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
  
  // Показываем всех физлиц, включая "Розничных клиентов"
  const allIndividuals = mainStore.individuals;

  opts.push({ label: 'Физлица (Кому платим)', isHeader: true });
  allIndividuals.forEach(i => {
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

// Проверка: Является ли контрагент банком
const isSelectedContractorBank = computed(() => {
    if (!selectedContractorValue.value) return false;
    const [prefix, id] = selectedContractorValue.value.split('_');
    if (prefix === 'contr') {
        const contrObj = mainStore.contractors.find(c => c._id === id);
        if (contrObj) {
            const nameLower = contrObj.name.toLowerCase().trim();
            return knownBanks.some(b => b.name.toLowerCase() === nameLower || (b.keywords && b.keywords.some(k => nameLower.includes(k))));
        }
    }
    return false;
});

// Строгая фильтрация категорий
const categoryOptions = computed(() => { 
    const prepayIds = mainStore.getPrepaymentCategoryIds; 
    
    // Если выбран банк (проект "Мои кредиты") - показываем ТОЛЬКО "Кредиты"
    if (isSelectedContractorBank.value) {
        if (mainStore.creditCategoryId) {
             const creditCat = mainStore.categories.find(c => c._id === mainStore.creditCategoryId);
             if (creditCat) {
                 return [{ value: creditCat._id, label: creditCat.name }];
             }
        }
        return [];
    }

    // Если НЕ банк - Скрываем служебные и "Кредиты". Оставляем "Получение займов".
    const excludedNames = [
        'перевод', 'transfer', 
        'остаток долга', 'возврат', 
        'погашение займов', 'выплата кредита', 'погашение кредита',
        'кредиты', 'credit' // Скрываем категорию "Кредиты" для не-банков
    ];
    
    const valid = mainStore.visibleCategories.filter(c => {
        const name = c.name.toLowerCase().trim();
        if (excludedNames.includes(name)) return false;
        if (c.isPrepayment || prepayIds.includes(c._id)) return false;
        return true;
    }); 
    
    const opts = valid.map(c => ({ value: c._id, label: c.name })); 
    opts.unshift({ value: null, label: 'По категории' }); 
    opts.push({ value: '--CREATE_NEW--', label: '+ Создать категорию', isSpecial: true }); 
    return opts; 
});

// --- LOGIC WATCHERS ---

// 1. Авто-выбор владельца по счету
const onAccountSelected = (accId) => {
    const acc = mainStore.accounts.find(a => a._id === accId);
    if (acc) {
        if (acc.companyId) selectedOwner.value = `company-${typeof acc.companyId === 'object' ? acc.companyId._id : acc.companyId}`;
        else if (acc.individualId) selectedOwner.value = `individual-${typeof acc.individualId === 'object' ? acc.individualId._id : acc.individualId}`;
    }
};

watch(selectedAccountId, (newVal) => {
    if (!newVal || isInitialLoad.value) return;
    onAccountSelected(newVal);
});

// 2. Умная связь: Контрагент -> Проект/Категория (особенно для Кредитов)
watch(selectedContractorValue, (newVal) => {
    if (isInitialLoad.value || !newVal) return;

    // 🟢 1. Проверка на "Розничные клиенты"
    if (mainStore.retailIndividualId && newVal === `ind_${mainStore.retailIndividualId}`) {
        if (mainStore.realizationCategoryId) {
            selectedCategoryId.value = mainStore.realizationCategoryId;
        }
    }

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
        // Если Банк -> Проект "Мои кредиты", Категория "Кредиты", Статус "Получение кредита"
        if (myCreditsProjectId.value) selectedProjectId.value = myCreditsProjectId.value;
        if (mainStore.creditCategoryId) selectedCategoryId.value = mainStore.creditCategoryId;
        operationStatus.value = 'credit_receipt';
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
        if (mainStore.creditCategoryId) selectedCategoryId.value = mainStore.creditCategoryId;
    }
});

watch([showCreateContractorModal, showCreateOwnerModal], ([creatingContr, creatingOwner]) => {
    if (creatingContr || creatingOwner) selectedCategoryId.value = null;
});

// --- Formatters & Handlers ---
const toInputDate = (dateObj) => { 
    if (!dateObj) return '';
    const d = new Date(dateObj);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const createNoonDate = (str) => { if(!str) return new Date(); const [y,m,d]=str.split('-'); return new Date(y,m-1,d,12,0,0); };
const toDisplayDate = (str) => { if(!str) return ''; const [y,m,d]=str.split('-'); return `${d}.${m}.${y}`; };
const onAmountInput = (e) => { amount.value = formatNumber(e.target.value.replace(/[^0-9]/g,'')); };
const handleAccountChange = (val) => { 
    if (val==='--CREATE_NEW--') { 
        selectedAccountId.value=null; 
        showAccountInput(); 
    } else {
        selectedAccountId.value = val; 
        onAccountSelected(val); 
    }
};
const handleProjectChange = (val) => { if (val==='--CREATE_NEW--') { selectedProjectId.value=null; showProjectInput(); } };
const handleCategoryChange = (val) => { if (val==='--CREATE_NEW--') { selectedCategoryId.value=null; showCategoryInput(); } };

const showAccountInput = () => { isCreatingAccount.value = true; nextTick(() => newAccountInput.value?.focus()); };
const cancelCreateAccount = () => { isCreatingAccount.value = false; newAccountName.value = ''; };

const saveNewAccount = async () => {
  if (isInlineSaving.value) return; 
  const name = newAccountName.value.trim(); 
  if (!name) return; 
  isInlineSaving.value = true; 
  try { 
    const existing = mainStore.accounts.find(a => a.name.toLowerCase() === name.toLowerCase()); 
    let cId = null, iId = null; 
    if (selectedOwner.value) { 
        const [type, id] = selectedOwner.value.split('-'); 
        if (type === 'company') cId = id; else iId = id; 
    } 
    if (existing) { 
        selectedAccountId.value = existing._id; 
        onAccountSelected(existing._id); 
    } else { 
        const newItem = await mainStore.addAccount({ name: name, companyId: cId, individualId: iId }); 
        selectedAccountId.value = newItem._id; 
        onAccountSelected(newItem._id); 
    } 
    cancelCreateAccount(); 
  } catch (e) { console.error(e); alert('Ошибка при создании счета: ' + e.message); } 
  finally { isInlineSaving.value = false; } 
};

const showProjectInput = () => { isCreatingProject.value = true; nextTick(() => newProjectInput.value?.focus()); };
const cancelCreateProject = () => { isCreatingProject.value = false; newProjectName.value = ''; };
const saveNewProject = async () => {
    if (isInlineSaving.value) return; const name = newProjectName.value.trim(); if (!name) return;
    isInlineSaving.value = true; try { const item = await mainStore.addProject(name); selectedProjectId.value = item._id; cancelCreateProject(); } catch(e){ console.error(e); } finally { isInlineSaving.value = false; }
};

const showCategoryInput = () => { isCreatingCategory.value = true; nextTick(() => newCategoryInput.value?.focus()); };
const cancelCreateCategory = () => { isCreatingCategory.value = false; newCategoryName.value = ''; };
const saveNewCategory = async () => {
    if (isInlineSaving.value) return; const name = newCategoryName.value.trim(); if (!name) return;
    isInlineSaving.value = true; try { const item = await mainStore.addCategory(name); selectedCategoryId.value = item._id; cancelCreateCategory(); } catch(e){ console.error(e); } finally { isInlineSaving.value = false; }
};

// --- ЛОГИКА СОЗДАНИЯ ВЛАДЕЛЬЦА ---
const handleOwnerChange = (val) => { };

const openCreateOwnerModal = (type) => {
    ownerTypeToCreate.value = type;
    newOwnerName.value = '';
    showCreateOwnerModal.value = true;
    nextTick(() => newOwnerInputRef.value?.focus());
};

const cancelCreateOwner = () => {
    if (isInlineSaving.value) return;
    showCreateOwnerModal.value = false;
    newOwnerName.value = '';
    if (!selectedOwner.value) selectedOwner.value = null;
};

const saveNewOwner = async () => {
    if (isInlineSaving.value) return;
    const name = newOwnerName.value.trim();
    const type = ownerTypeToCreate.value;
    if (!name) return;
    
    isInlineSaving.value = true;
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
                if (type === 'company') {
                    updateData.companyId = newItem._id;
                    updateData.individualId = null;
                } else {
                    updateData.companyId = null;
                    updateData.individualId = newItem._id;
                }
                mainStore.batchUpdateEntities('accounts', [updateData]);
            }
        }
        showCreateOwnerModal.value = false;
        newOwnerName.value = '';
    } catch (e) {
        console.error(e);
        alert('Ошибка при создании владельца: ' + e.message);
    } finally {
        isInlineSaving.value = false;
    }
};

// --- ЛОГИКА СОЗДАНИЯ КОНТРАГЕНТА ---
const handleContractorChange = (val) => { /* Logic in template slot */ };

const openCreateContractorModal = (type) => {
    contractorTypeToCreate.value = type;
    newContractorNameInput.value = '';
    showCreateContractorModal.value = true;
    nextTick(() => newContractorInputRef.value?.focus());
};

const cancelCreateContractorModal = () => {
    showCreateContractorModal.value = false;
    newContractorNameInput.value = '';
    if (!selectedContractorValue.value) selectedContractorValue.value = null;
};

const saveNewContractorModal = async () => {
    if (isInlineSaving.value) return;
    const name = newContractorNameInput.value.trim();
    const type = contractorTypeToCreate.value;
    if (!name) return;
    
    isInlineSaving.value = true;
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
        showCreateContractorModal.value = false;
        newContractorNameInput.value = '';
    } catch (e) {
        console.error(e);
        alert('Ошибка при создании контрагента: ' + e.message);
    } finally {
        isInlineSaving.value = false;
    }
};

const handleMainAction = () => {
    if (isProtectedMode.value) return;

    const rawAmount = parseFloat(String(amount.value).replace(/\s/g, '')) || 0;
    if (rawAmount <= 0 || !selectedAccountId.value || !selectedOwner.value || !selectedContractorValue.value) {
        alert('Заполните обязательные поля: Сумма, Счет, Владелец, Контрагент.');
        return;
    }

    let cId = null, indId = null;
    let contractorName = 'Контрагент';
    
    if (selectedContractorValue.value) {
        const [p, id] = selectedContractorValue.value.split('_');
        if (p === 'contr') {
            cId = id;
            const c = mainStore.contractors.find(x => x._id === id);
            if (c) contractorName = c.name;
        } else {
            indId = id;
            const i = mainStore.individuals.find(x => x._id === id);
            if (i) contractorName = i.name;
        }
    }
    const [oType, oId] = selectedOwner.value.split('-');

    let projectName = 'Проект';
    if (selectedProjectId.value) {
        const p = mainStore.projects.find(x => x._id === selectedProjectId.value);
        if (p) projectName = p.name;
    }
    
    let categoryName = 'Категория';
    if (selectedCategoryId.value) {
        const c = mainStore.categories.find(x => x._id === selectedCategoryId.value);
        if (c) categoryName = c.name;
    }

    let targetCellIndex = undefined;
    if (!isDateChanged.value && !isEditMode.value) {
        targetCellIndex = props.cellIndex;
    }

    const payload = {
        amount: rawAmount,
        accountId: selectedAccountId.value,
        contractorId: cId,
        counterpartyIndividualId: indId,
        projectId: selectedProjectId.value,
        categoryId: selectedCategoryId.value,
        companyId: oType === 'company' ? oId : null,
        individualId: oType === 'individual' ? oId : null,
        date: createNoonDate(editableDate.value), 
        cellIndex: targetCellIndex, 
        operationToEdit: props.operationToEdit,
        dealStatus: localDealStatus.value,
        nextTrancheNum: nextTrancheNumber.value,
        contractorName: contractorName,
        projectName: projectName,
        categoryName: categoryName
    };

    if (isDealDetected.value) {
        // Умная сделка не должна срабатывать для розницы (обычно у них нет проектов)
        emit('trigger-smart-deal', payload);
        return;
    }

    // 🟢 ЕСЛИ СТАТУС "Предоплата / Сделка" (B2B) -> Открыть Wizard
    // Для Розницы (Retail) окно предоплаты НЕ ОТКРЫВАЕТСЯ, все идет через handleSave
    if (operationStatus.value === 'prepayment' && !isRetailClientSelected.value) {
        emit('trigger-prepayment', payload);
        return;
    }
    
    handleSave(); 
};

const handleCopyClick = () => { isCloneMode.value = true; nextTick(() => amountInput.value?.focus()); };
const handleDeleteClick = () => { emit('operation-deleted', props.operationToEdit); };

const handleSave = async () => {
    if (isSaving.value) return;
    isSaving.value = true;
    try {
        const rawAmount = parseFloat(String(amount.value).replace(/\s/g, ''));
        const [oType, oId] = selectedOwner.value.split('-');
        let cId = null, indId = null;
        if (selectedContractorValue.value) { const [p, id] = selectedContractorValue.value.split('_'); if (p === 'contr') cId = id; else indId = id; }

        let targetCellIndex = undefined;
        if (!isDateChanged.value && (!isEditMode.value || !isCloneMode.value)) {
            targetCellIndex = props.cellIndex;
        }

        // 🟢 ОПРЕДЕЛЕНИЕ ФЛАГА "ЗАКРЫТО" И "СДЕЛКА" ДЛЯ РОЗНИЦЫ
        let isClosedState = false;
        let isDealTrancheForce = undefined;

        if (isRetailClientSelected.value) {
            isDealTrancheForce = false;
            if (operationStatus.value === 'fact') {
                isClosedState = true;
            } else {
                isClosedState = false;
            }
        }

        const payload = {
            type: 'income',
            amount: rawAmount,
            date: createNoonDate(editableDate.value), 
            accountId: selectedAccountId.value,
            companyId: oType === 'company' ? oId : null,
            individualId: oType === 'individual' ? oId : null,
            contractorId: cId,
            counterpartyIndividualId: indId,
            projectId: selectedProjectId.value,
            categoryId: selectedCategoryId.value,
            totalDealAmount: 0,
            isDealTranche: isDealTrancheForce !== undefined ? isDealTrancheForce : false, // 🟢
            isClosed: isClosedState, 
            cellIndex: targetCellIndex
        };
        emit('save', { mode: isEditMode.value ? 'edit' : 'create', id: props.operationToEdit?._id, data: payload });
        
        if (!isSelectedContractorBank.value && (cId || indId)) {
             const type = cId ? 'contractors' : 'individuals';
             const updateData = { _id: cId || indId };
             let needsUpdate = false;
             if (selectedProjectId.value) { updateData.defaultProjectId = selectedProjectId.value; needsUpdate = true; }
             if (selectedCategoryId.value) { updateData.defaultCategoryId = selectedCategoryId.value; needsUpdate = true; }
             if (needsUpdate) {
                 mainStore.batchUpdateEntities(type, [updateData]);
             }
        }
    } catch (e) { alert(e.message); isSaving.value = false; }
};

onMounted(() => {
    isInitialLoad.value = true;
    if (props.date) editableDate.value = toInputDate(props.date);
    
    if (props.operationToEdit) {
        const op = props.operationToEdit;
        amount.value = formatNumber(op.amount);
        selectedAccountId.value = op.accountId?._id || op.accountId;
        selectedProjectId.value = op.projectId?._id || op.projectId;
        selectedCategoryId.value = op.categoryId?._id || op.categoryId;
        
        if (op.companyId) selectedOwner.value = `company-${op.companyId._id || op.companyId}`;
        else if (op.individualId) selectedOwner.value = `individual-${op.individualId._id || op.individualId}`;
        
        if (op.contractorId) selectedContractorValue.value = `contr_${op.contractorId._id || op.contractorId}`;
        else if (op.counterpartyIndividualId) selectedContractorValue.value = `ind_${op.counterpartyIndividualId._id || op.counterpartyIndividualId}`;
        
        if (op.totalDealAmount > 0 || op.isDealTranche) {
            operationStatus.value = 'prepayment';
        } else {
            const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
            if (indId && indId === mainStore.retailIndividualId && op.isClosed === false) {
                operationStatus.value = 'retail_prepayment';
            } else if (mainStore._isCreditIncome(op)) { // 🟢 ПРОВЕРКА НА КРЕДИТ
                operationStatus.value = 'credit_receipt';
            } else {
                operationStatus.value = 'fact';
            }
        }
    } else { 
        setTimeout(() => amountInput.value?.focus(), 100); 
        operationStatus.value = 'fact'; 
    }
    nextTick(() => isInitialLoad.value = false);
});

const closePopup = () => emit('close');

const accountSuggestionsList = computed(() => { const q = newAccountName.value.trim().toLowerCase(); if (q.length<2) return []; return accountSuggestions.filter(acc => acc.name.toLowerCase().includes(q)).slice(0,4); });
const selectAccountSuggestion = (acc) => { newAccountName.value = acc.name; showAccountSuggestions.value = false; nextTick(() => newAccountInput.value?.focus()); };
const handleAccountInputBlur = () => { setTimeout(() => { showAccountSuggestions.value = false; }, 200); };
const handleAccountInputFocus = () => { if (newAccountName.value.length >= 2) showAccountSuggestions.value = true; };
watch(newAccountName, (val) => { showAccountSuggestions.value = val.length >= 2; });
const categorySuggestionsList = computed(() => { const q = newCategoryName.value.trim().toLowerCase(); if (q.length<2) return []; return categorySuggestions.filter(c => c.name.toLowerCase().includes(q)).slice(0,4); });
const selectCategorySuggestion = (c) => { newCategoryName.value = c.name; showCategorySuggestions.value = false; nextTick(() => newCategoryInput.value?.focus()); };
const handleCategoryInputBlur = () => { setTimeout(() => { showCategorySuggestions.value = false; }, 200); };
const handleCategoryInputFocus = () => { if (newCategoryName.value.length >= 2) showCategorySuggestions.value = true; };
watch(newCategoryName, (val) => { showCategorySuggestions.value = val.length >= 2; });
</script>

<template>
  <div class="popup-overlay" @click.self="closePopup">
    <!-- 🟢 Используем computed popupThemeClass для темы -->
    <div class="popup-content" :class="popupThemeClass">
      <h3>{{ title }}</h3>

      <div class="custom-input-box input-spacing" :class="{ 'has-value': !!amount, 'is-disabled': isProtectedMode }">
        <div class="input-inner-content">
           <span v-if="amount" class="floating-label">Сумма, ₸</span>
           <input type="text" inputmode="decimal" v-model="amount" placeholder="Вношу сумму ₸" class="real-input" ref="amountInput" @input="onAmountInput" :disabled="isProtectedMode" />
        </div>
      </div>

      <template v-if="!showCreateOwnerModal && !showCreateContractorModal">
        <div v-if="!isCreatingAccount" class="input-spacing">
            <BaseSelect v-model="selectedAccountId" :options="accountOptions" placeholder="На счет" label="На счет" @change="handleAccountChange" :disabled="isProtectedMode" />
        </div>
        <div v-else class="inline-create-form input-spacing input-wrapper relative">
            <input type="text" v-model="newAccountName" placeholder="Название счета" ref="newAccountInput" @keyup.enter="saveNewAccount" @keyup.esc="cancelCreateAccount" />
            <button @click="saveNewAccount" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
            <button @click="cancelCreateAccount" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
            <ul v-if="showAccountSuggestions && accountSuggestionsList.length" class="bank-suggestions-list"><li v-for="(acc, i) in accountSuggestionsList" :key="i" @mousedown.prevent="selectAccountSuggestion(acc)">{{ acc.name }}</li></ul>
        </div>

        <div class="input-spacing">
            <BaseSelect v-model="selectedOwner" :options="ownerOptions" placeholder="Владелец" label="Владелец" :disabled="isProtectedMode" @change="handleOwnerChange">
                <template #action-item>
                    <div class="dual-action-row">
                        <button @click="openCreateOwnerModal('company')" class="btn-dual-action left">+ Создать Компанию</button>
                        <button @click="openCreateOwnerModal('individual')" class="btn-dual-action right">+ Создать Физлицо</button>
                    </div>
                </template>
            </BaseSelect>
        </div>

        <div class="input-spacing">
            <BaseSelect v-model="selectedContractorValue" :options="contractorOptions" placeholder="От кого" label="От кого" :disabled="isProtectedMode">
                <template #action-item>
                    <div class="dual-action-row">
                        <button @click="openCreateContractorModal('contractor')" class="btn-dual-action left">+ Созд. контрагента</button>
                        <button @click="openCreateContractorModal('individual')" class="btn-dual-action right">+ Созд. физлицо</button>
                    </div>
                </template>
            </BaseSelect>
        </div>
        
        <!-- INLINE PROJECT CREATION -->
        <div v-if="!isCreatingProject" class="input-spacing">
            <BaseSelect v-model="selectedProjectId" :options="projectOptions" placeholder="Из проекта" label="Проект" @change="handleProjectChange" :disabled="isProtectedMode" />
        </div>
        <div v-else class="inline-create-form input-spacing">
            <input type="text" v-model="newProjectName" placeholder="Название проекта" ref="newProjectInput" @keyup.enter="saveNewProject" @keyup.esc="cancelCreateProject" />
            <button @click="saveNewProject" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
            <button @click="cancelCreateProject" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
        </div>

        <!-- INLINE CATEGORY CREATION -->
        <div v-if="!isCreatingCategory" class="input-spacing">
            <BaseSelect v-model="selectedCategoryId" :options="categoryOptions" placeholder="По категории" label="Категория" @change="handleCategoryChange" :disabled="isProtectedMode" />
        </div>
        <div v-else class="inline-create-form input-spacing input-wrapper relative">
            <input type="text" v-model="newCategoryName" placeholder="Название категории" ref="newCategoryInput" @keyup.enter="saveNewCategory" @keyup.esc="cancelCreateCategory" />
            <button @click="saveNewCategory" class="btn-inline-save" :disabled="isInlineSaving">✓</button>
            <button @click="cancelCreateCategory" class="btn-inline-cancel" :disabled="isInlineSaving">✕</button>
            <ul v-if="showCategorySuggestions && categorySuggestionsList.length" class="bank-suggestions-list"><li v-for="(c, i) in categorySuggestionsList" :key="i" @mousedown.prevent="selectCategorySuggestion(c)">{{ c.name }}</li></ul>
        </div>

        <!-- 🟢 СТАТУС ДЕНЕГ (ВИДИМ ВСЕГДА, НО МЕНЯЕТСЯ СОДЕРЖИМОЕ) -->
        <template v-if="!isProtectedMode && !isEditMode && !isDealDetected">
            <div class="input-spacing">
                <BaseSelect 
                    v-model="operationStatus" 
                    :options="statusOptions" 
                    label="Статус денег" 
                    placeholder="Статус денег" 
                />
            </div>
        </template>
        
        <div class="custom-input-box input-spacing has-value date-box" :class="{ 'is-disabled': isProtectedMode }">
            <div class="input-inner-content">
                <span class="floating-label">Дата операции</span>
                <div class="date-display-row">
                    <span class="date-value-text">{{ toDisplayDate(editableDate) }}</span>
                    <input type="date" v-model="editableDate" class="real-input date-overlay" :min="minAllowedDate ? toInputDate(minAllowedDate) : null" :max="maxAllowedDate ? toInputDate(maxAllowedDate) : null" :disabled="isProtectedMode" />
                    <span class="calendar-icon">📅</span> 
                </div>
            </div>
        </div>
        
        <div class="popup-actions-row">
            <button v-if="!isProtectedMode" class="btn-submit save-wide" :class="mainButtonClass" @click="handleMainAction" :disabled="isSaving || isInlineSaving">
                {{ mainButtonText }}
            </button>
            <div v-else class="read-only-info">Только чтение</div>
            <div class="icon-actions">
                <button class="icon-btn copy-btn" title="Копировать" @click="handleCopyClick" :disabled="isSaving"><svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg></button>
                <button v-if="props.operationToEdit" class="icon-btn delete-btn" title="Удалить" @click="handleDeleteClick" :disabled="isSaving"><svg class="icon-stroke" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
        </div>
      </template>

      <template v-if="showCreateOwnerModal">
        <div class="smart-create-owner">
          <h4 class="smart-create-title">Новый владелец</h4>
          <div class="smart-create-tabs">
            <button :class="{ active: ownerTypeToCreate === 'company' }" @click="ownerTypeToCreate = 'company'">Компания</button>
            <button :class="{ active: ownerTypeToCreate === 'individual' }" @click="ownerTypeToCreate = 'individual'">Физлицо</button>
          </div>
          <div class="input-wrapper relative">
              <input type="text" v-model="newOwnerName" :placeholder="ownerTypeToCreate === 'company' ? 'Название компании' : 'Имя Физлица'" ref="newOwnerInputRef" class="form-input input-spacing" @keyup.enter="saveNewOwner" @keyup.esc="cancelCreateOwner" @blur="handleOwnerInputBlur" @focus="handleOwnerInputFocus"/>
              <ul v-if="showOwnerBankSuggestions && ownerBankSuggestionsList.length > 0" class="bank-suggestions-list">
                  <li v-for="(bank, idx) in ownerBankSuggestionsList" :key="idx" @mousedown.prevent="selectOwnerBankSuggestion(bank)">{{ bank.name }}</li>
              </ul>
          </div>
          <div class="smart-create-actions">
            <button @click="cancelCreateOwner" class="btn-cancel-white" :disabled="isInlineSaving">Отмена</button>
            <button @click="saveNewOwner" class="btn-create-green" :disabled="isInlineSaving">Создать</button>
          </div>
        </div>
      </template>

      <template v-if="showCreateContractorModal">
        <div class="smart-create-owner">
          <h4 class="smart-create-title">Новый контрагент</h4>
          <div class="smart-create-tabs">
            <button :class="{ active: contractorTypeToCreate === 'contractor' }" @click="contractorTypeToCreate = 'contractor'">ТОО / ИП</button>
            <button :class="{ active: contractorTypeToCreate === 'individual' }" @click="contractorTypeToCreate = 'individual'">Физлицо</button>
          </div>
          <div class="input-wrapper relative">
              <input type="text" v-model="newContractorNameInput" :placeholder="contractorTypeToCreate === 'contractor' ? 'Название организации' : 'Имя Физлица'" ref="newContractorInputRef" class="form-input input-spacing" @keyup.enter="saveNewContractorModal" @keyup.esc="cancelCreateContractorModal" @blur="handleContractorInputBlur" @focus="handleContractorInputFocus"/>
              <ul v-if="showContractorBankSuggestions && contractorBankSuggestionsList.length > 0" class="bank-suggestions-list">
                  <li v-for="(bank, idx) in contractorBankSuggestionsList" :key="idx" @mousedown.prevent="selectContractorBankSuggestion(bank)">{{ bank.name }}</li>
              </ul>
          </div>
          <div class="smart-create-actions">
            <button @click="cancelCreateContractorModal" class="btn-cancel-white" :disabled="isInlineSaving">Отмена</button>
            <button @click="saveNewContractorModal" class="btn-create-green" :disabled="isInlineSaving">Создать</button>
          </div>
        </div>
      </template>

    </div>
  </div>
</template>

<style scoped>
/* Стили без изменений */
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; }
.popup-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); margin: 1rem; transition: border-top-color 0.3s; }
h3 { margin: 0; margin-bottom: 1.5rem; font-size: 22px; font-weight: 700; color: #1a1a1a; text-align: left; }

.theme-income { border-top: 4px solid #28B8A0; }
.theme-readonly { border-top: 4px solid #999; }
/* 🟢 ТЕМА КРЕДИТА */
.theme-credit { border-top: 4px solid #8FD4FF; }

.custom-input-box { width: 100%; height: 54px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; padding: 0 14px; display: flex; align-items: center; position: relative; transition: all 0.2s ease; box-sizing: border-box; }
.custom-input-box:focus-within { border-color: #222; box-shadow: 0 0 0 1px rgba(34,34,34,0.2); }
.is-disabled { background-color: #e9e9e9; color: #777; cursor: not-allowed; }
.is-disabled input { cursor: not-allowed; color: #555; }
.input-inner-content { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.floating-label { font-size: 11px; color: #999; margin-bottom: -2px; margin-top: 4px; }
.real-input { width: 100%; border: none; background: transparent; padding: 0; font-size: 15px; color: #1a1a1a; font-weight: 500; height: auto; line-height: 1.3; outline: none; }
.input-spacing { margin-bottom: 12px; }
.date-display-row { display: flex; justify-content: space-between; align-items: center; position: relative; width: 100%; }
.date-value-text { font-size: 15px; font-weight: 500; color: #1a1a1a; }
.date-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; z-index: 2; }
.calendar-icon { font-size: 16px; color: #999; }
.popup-actions-row { display: flex; align-items: center; gap: 10px; margin-top: 2rem; }
.save-wide { flex: 1 1 auto; height: 54px; }
.btn-submit { width: 100%; height: 50px; border-radius: 8px; border: none; color: white; font-size: 16px; font-weight: 600; cursor: pointer; transition: background-color 0.2s; }
.btn-submit-income { background-color: #28B8A0; }
.btn-submit-income:hover { background-color: #229c87; }
.btn-submit-prepayment { background-color: #FF9D00; } 
.btn-submit-prepayment:hover { background-color: #fb8c00; }

/* 🟢 СТИЛЬ КНОПКИ ДЛЯ КРЕДИТА (ФИОЛЕТОВЫЙ) */
.btn-submit-credit { background-color: #8FD4FF; color: #fff; }
.btn-submit-credit:hover { background-color: #8FD4FF; }

.icon-actions { display: flex; gap: 10px; margin-left: auto; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 10px; cursor: pointer; background: #F4F4F4; border: 1px solid #E0E0E0; color: #333; transition: all 0.2s; padding: 0; }
.copy-btn:hover { background: #E8F5E9; border-color: #A5D6A7; color: #34C759; }
.delete-btn:hover { background: #FFF0F0; border-color: #FFD0D0; color: #FF3B30; }
.delete-btn:hover .icon-stroke { stroke: #FF3B30; }
.icon-stroke { width: 20px; height: 20px; stroke: #333; fill: none; transition: stroke 0.2s; }
.icon { width: 20px; height: 20px; fill: currentColor; display: block; }
.error-message { color: #FF3B30; text-align: center; margin-top: 1rem; font-size: 14px; }
.inline-create-form { display: flex; align-items: center; gap: 8px; margin-bottom: 15px; }
.inline-create-form input { flex: 1; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; box-sizing: border-box; }
.inline-create-form input:focus { outline: none; border-color: #222; }
.inline-create-form button { flex-shrink: 0; border: none; border-radius: 8px; color: white; font-size: 16px; cursor: pointer; height: 48px; width: 48px; padding: 0; line-height: 1; display: flex; align-items: center; justify-content: center; }
.btn-inline-save { background-color: #34C759; }
.btn-inline-cancel { background-color: #FF3B30; }
.relative { position: relative; }
.bank-suggestions-list { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #E0E0E0; border-top: none; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); z-index: 2000; list-style: none; padding: 0; margin: 0; max-height: 160px; overflow-y: auto; }
.bank-suggestions-list li { padding: 10px 14px; font-size: 14px; color: #333; cursor: pointer; border-bottom: 1px solid #f5f5f5; }
.bank-suggestions-list li:last-child { border-bottom: none; }
.bank-suggestions-list li:hover { background-color: #f9f9f9; }
.read-only-info { flex: 1 1 auto; display: flex; align-items: center; color: #777; font-size: 14px; font-style: italic; }

.smart-create-owner { border-top: 1px solid #E0E0E0; margin-top: 1.5rem; padding-top: 1.5rem; }
.smart-create-title { font-size: 18px; font-weight: 600; color: #1a1a1a; text-align: center; margin-top: 0; margin-bottom: 1.5rem; }
.smart-create-tabs { display: flex; justify-content: center; gap: 10px; margin-bottom: 1.5rem; }
.smart-create-tabs button { flex: 1; padding: 12px; font-size: 14px; font-weight: 500; border: 1px solid #E0E0E0; border-radius: 8px; background: #FFFFFF; color: #333; cursor: pointer; transition: all 0.2s; }
.smart-create-tabs button.active { background: #222222; color: #FFFFFF; border-color: #222222; }
.smart-create-actions { display: flex; gap: 10px; margin-top: 1rem; }
.smart-create-actions .btn-submit { flex: 1; }

.form-input { width: 100%; height: 48px; padding: 0 14px; margin: 0; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; color: #1a1a1a; font-size: 15px; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.form-input:focus { outline: none; border-color: #222; box-shadow: 0 0 0 2px rgba(34,34,34,0.2); }
.dual-action-row { display: flex; width: 100%; height: 46px; border-top: 1px solid #eee; }
.btn-dual-action { flex: 1; border: none; background-color: #fff; font-size: 13px; font-weight: 600; color: #007AFF; cursor: pointer; transition: background-color 0.2s; white-space: nowrap; }
.btn-dual-action:hover { background-color: #f0f8ff; }
.btn-dual-action.left { border-right: 1px solid #eee; border-bottom-left-radius: 8px; }
.btn-dual-action.right { border-bottom-right-radius: 8px; }
.btn-create-green { background-color: #34c759; color: white; }
.btn-create-green:hover:not(:disabled) { background-color: #2da84e; }
.btn-cancel-white { background-color: #ffffff; color: #333333; border: 1px solid #dddddd !important; }
.btn-cancel-white:hover:not(:disabled) { background-color: #f5f5f5; }
</style>