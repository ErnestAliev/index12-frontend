<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import BaseSelect from './BaseSelect.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import InfoModal from './InfoModal.vue';
import { useMainStore } from '@/stores/mainStore';
import { accountSuggestions } from '@/data/accountSuggestions.js';

/**
 * * --- МЕТКА ВЕРСИИ: v30.1 - ACCOUNT OWNER DISPLAY ---
 * * ВЕРСИЯ: 30.1
 * * ДАТА: 2025-12-14
 * * ИЗМЕНЕНИЯ:
 * 1. (UI) В выпадающем списке счетов теперь отображается владелец (Компания/Физлицо) в поле subLabel.
 */

const mainStore = useMainStore();
const props = defineProps({
  initialData: { type: Object, default: () => ({}) },
  operationToEdit: { type: Object, default: null }
});

const emit = defineEmits(['close', 'save']);

const amount = ref(0);
const formattedAmount = ref('');
const reason = ref('Личные нужды');
const isSaving = ref(false);

const fromAccountId = ref(null);
const selectedIndividualId = ref(null);

// Состояния создания (Счет, Физлицо)
const isCreatingIndividual = ref(false);
const newIndividualName = ref('');
const newIndividualInputRef = ref(null);

const isCreatingAccount = ref(false);
const newAccountName = ref('');
const newAccountInputRef = ref(null);
const showAccountSuggestions = ref(false);

// 🟢 CASH REGISTER LOGIC (Новое)
const showCashChoiceModal = ref(false);
const showSpecialCashInfo = ref(false);
const accountCreationPlaceholder = ref('Название счета'); 
const isCreatingSpecialAccount = ref(false); 

// InfoModal
const showInfoModal = ref(false);
const infoModalTitle = ref('Внимание');
const infoModalMessage = ref('');
const showError = (msg) => {
    infoModalTitle.value = 'Внимание';
    infoModalMessage.value = msg;
    showInfoModal.value = true;
};

const reasonOptions = [
  { value: 'Личные нужды', label: 'Личные нужды' },
  { value: 'Дивиденды', label: 'Дивиденды' },
  { value: 'Развитие бизнеса (Наличные)', label: 'Развитие бизнеса (Наличные)' },
  { value: 'Другое', label: 'Другое' }
];

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

// Опции Счетов
const accountOptions = computed(() => {
  const opts = mainStore.currentAccountBalances.map(acc => {
    const owner = getOwnerName(acc);
    return {
        value: acc._id,
        label: acc.name,
        subLabel: owner, // 🟢 Передаем владельца в subLabel
        rightText: `${formatNumber(Math.abs(acc.balance))} ₸`,
        tooltip: owner ? `Владелец: ${owner}` : 'Нет привязки',
        isSpecial: false
    };
  });
  // 🟢 Sticky button via slot
  opts.push({ isActionRow: true });
  return opts;
});

// Опции Физлиц
const individualOptions = computed(() => {
  const opts = mainStore.individuals
    .filter(i => {
        const name = i.name.toLowerCase().trim();
        return name !== 'розничные клиенты' && name !== 'розница';
    })
    .map(i => ({ value: i._id, label: i.name }));
  // 🟢 Sticky button
  opts.push({ value: '--CREATE_NEW--', label: '+ Создать Физлицо', isSpecial: true });
  return opts;
});

const isCloneMode = ref(false);
const isDeleteConfirmVisible = ref(false);
const editableDate = ref('');

const isEditMode = computed(() => !!props.operationToEdit && !isCloneMode.value);
const title = computed(() => isCloneMode.value ? 'Копия: Вывод денег' : (isEditMode.value ? 'Редактировать Вывод денег' : 'Оформление вывода'));
const btnText = computed(() => isSaving.value ? 'Сохранение...' : (isCloneMode.value ? 'Создать копию вывода' : (isEditMode.value ? 'Сохранить' : 'Подтвердить')));

const toInputDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const toDisplayDate = (dateStr) => { if (!dateStr) return ''; const [year, month, day] = dateStr.split('-'); return `${day}.${month}.${year}`; };

const onAmountInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = Number(raw);
  formattedAmount.value = formatNumber(Number(raw));
};

// 🟢 NEW CASH LOGIC HANDLERS
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
    isCreatingSpecialAccount.value = (type === 'special');
    showAccountInput();
};

const showAccountInput = () => {
    if (!isCreatingSpecialAccount.value) accountCreationPlaceholder.value = 'Название счета';
    fromAccountId.value = null;
    isCreatingAccount.value = true;
    newAccountName.value = '';
    nextTick(() => newAccountInputRef.value?.focus());
};

// --- HANDLERS СЧЕТА ---
const handleAccountChange = (val) => {
    if (val === '--CREATE_NEW--') {
        showAccountInput();
    }
};

const saveNewAccount = async () => {
    const name = newAccountName.value.trim();
    if (!name) return;
    try {
        // 🟢 Pass excluded flag
        const newAcc = await mainStore.addAccount({ 
            name, 
            isExcluded: isCreatingSpecialAccount.value 
        });
        fromAccountId.value = newAcc._id;
        cancelCreateAccount();
    } catch (e) {
        showError('Ошибка создания счета: ' + e.message);
    }
};

const cancelCreateAccount = () => {
    isCreatingAccount.value = false;
    newAccountName.value = '';
    isCreatingSpecialAccount.value = false;
};

// Подсказки для счета
const accountSuggestionsList = computed(() => {
    const q = newAccountName.value.trim().toLowerCase();
    if (q.length < 2) return [];
    return accountSuggestions.filter(acc => acc.name.toLowerCase().includes(q)).slice(0, 4);
});
const selectAccountSuggestion = (acc) => {
    newAccountName.value = acc.name;
    showAccountSuggestions.value = false;
    nextTick(() => newAccountInputRef.value?.focus());
};

// --- HANDLERS ФИЗЛИЦА ---
const handleIndividualChange = (val) => {
    if (val === '--CREATE_NEW--') {
        selectedIndividualId.value = null;
        isCreatingIndividual.value = true;
        nextTick(() => newIndividualInputRef.value?.focus());
    }
};

const createIndividual = async () => {
    const name = newIndividualName.value.trim();
    if (!name) return;
    try {
        const newInd = await mainStore.addIndividual(name);
        selectedIndividualId.value = newInd._id;
        isCreatingIndividual.value = false;
        newIndividualName.value = '';
    } catch (e) {
        showError('Ошибка создания: ' + e.message);
    }
};

const cancelCreateIndividual = () => {
    isCreatingIndividual.value = false;
    newIndividualName.value = '';
};

const handleSave = async () => {
  if (amount.value <= 0 || isSaving.value || !fromAccountId.value) {
      if(amount.value<=0) showError('Введите сумму');
      else if(!fromAccountId.value) showError('Выберите счет');
      return;
  }
  if (!selectedIndividualId.value) { showError('Выберите получателя (Физлицо)'); return; }
  
  isSaving.value = true;
  
  const [year, month, day] = editableDate.value.split('-').map(Number);
  const finalDate = new Date(year, month - 1, day, 12, 0, 0);

  let withdrawalCat = mainStore.categories.find(c => {
      const n = c.name.toLowerCase().trim();
      return n === 'вывод средств' || n === 'вывод' || n === 'withdrawal';
  });
  if (!withdrawalCat) { try { withdrawalCat = await mainStore.addCategory('Вывод средств'); } catch (e) { console.error(e); } }

  const payload = {
    amount: amount.value, destination: reason.value, reason: reason.value, description: reason.value, 
    type: 'expense', isWithdrawal: true, accountId: fromAccountId.value,
    date: finalDate, categoryId: withdrawalCat ? withdrawalCat._id : null,
    counterpartyIndividualId: selectedIndividualId.value, individualId: null, contractorId: null
  };

  const mode = (!isEditMode.value || isCloneMode.value) ? 'create' : 'edit';
  const opId = (mode === 'edit') ? props.operationToEdit._id : null;

  emit('save', { mode, id: opId, data: payload, originalOperation: props.operationToEdit });
  setTimeout(() => { isSaving.value = false; }, 3000);
};

const handleCopy = () => { isCloneMode.value = true; editableDate.value = toInputDate(new Date()); nextTick(() => { document.querySelector('.wd-amount')?.focus(); }); };
const handleDeleteClick = () => { isDeleteConfirmVisible.value = true; };
const confirmDelete = () => {
    if (!props.operationToEdit?._id) return;
    isDeleteConfirmVisible.value = false;
    emit('close'); 
    mainStore.deleteOperation(props.operationToEdit).catch(e => console.error(e));
};

onMounted(() => {
  if (props.operationToEdit) {
      const op = props.operationToEdit;
      amount.value = Math.abs(op.amount || 0);
      fromAccountId.value = op.accountId?._id || op.accountId;
      reason.value = op.reason || op.description || 'Личные нужды';
      selectedIndividualId.value = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
      editableDate.value = toInputDate(new Date(op.date));
  } else {
      amount.value = props.initialData.amount || 0;
      fromAccountId.value = props.initialData.fromAccountId || null;
      editableDate.value = toInputDate(new Date());
  }
  formattedAmount.value = formatNumber(amount.value);
  nextTick(() => document.querySelector('.wd-amount')?.focus());
});
</script>

<template>
  <div class="withdrawal-overlay" @mousedown.self="$emit('close')">
    <div class="withdrawal-content theme-withdrawal">
      <h3>{{ title }}</h3>
      
      <div class="wd-info-box" v-if="!isEditMode && !isCloneMode && initialData.fromAccountName">
        Вывод средств со счета <b>{{ initialData.fromAccountName }}</b>.
      </div>
      
      <!-- СУММА -->
      <div class="custom-input-box input-spacing" :class="{ 'has-value': !!amount }">
          <div class="input-inner-content">
             <span v-if="amount" class="floating-label">Сумма к выводу, ₸</span>
             <input type="text" v-model="formattedAmount" @input="onAmountInput" class="real-input wd-amount" placeholder="Сумма вывода ₸" />
          </div>
      </div>
      
      <!-- СЧЕТ СПИСАНИЯ -->
      <BaseSelect 
         v-if="!isCreatingAccount"
         v-model="fromAccountId" 
         :options="accountOptions" 
         label="Счет списания" 
         placeholder="Откуда (Счет)" 
         class="input-spacing"
         @change="handleAccountChange"
      >
          <!-- 🟢 Slot for Dual Create Buttons -->
          <template #action-item>
              <div class="dual-action-row">
                  <button @click="showAccountInput" class="btn-dual-action left">Создать счет</button>
                  <button @click="openCashChoice" class="btn-dual-action right"> Создать кассу</button>
              </div>
          </template>
      </BaseSelect>
      <div v-else class="inline-create-form input-spacing relative">
          <input type="text" v-model="newAccountName" :placeholder="accountCreationPlaceholder" ref="newAccountInputRef" class="create-input" @keyup.enter="saveNewAccount" @keyup.esc="cancelCreateAccount" @focus="showAccountSuggestions=true" @blur="setTimeout(()=>showAccountSuggestions=false, 200)" />
          <button @click="saveNewAccount" class="btn-inline-save">✓</button>
          <button @click="cancelCreateAccount" class="btn-inline-cancel">✕</button>
          <ul v-if="showAccountSuggestions && accountSuggestionsList.length > 0" class="bank-suggestions-list">
              <li v-for="(acc, i) in accountSuggestionsList" :key="i" @mousedown.prevent="selectAccountSuggestion(acc)">{{ acc.name }}</li>
          </ul>
      </div>

      <!-- ПОЛУЧАТЕЛЬ (ФИЗЛИЦО) -->
      <template v-if="!isCreatingIndividual">
          <BaseSelect
            v-model="selectedIndividualId"
            :options="individualOptions"
            label="Получатель (Физлицо)"
            placeholder="Выберите получателя"
            class="input-spacing"
            @change="handleIndividualChange"
          />
      </template>
      <div v-else class="inline-create-form input-spacing">
          <input type="text" v-model="newIndividualName" placeholder="Имя нового физлица" ref="newIndividualInputRef" class="create-input" @keyup.enter="createIndividual" @keyup.esc="cancelCreateIndividual" />
          <button @click="createIndividual" class="btn-inline-save">✓</button>
          <button @click="cancelCreateIndividual" class="btn-inline-cancel">✕</button>
      </div>

      <BaseSelect v-model="reason" :options="reasonOptions" label="Причина / Цель" placeholder="Выберите причину" class="input-spacing" />

      <div class="custom-input-box input-spacing has-value date-box">
         <div class="input-inner-content">
             <span class="floating-label">Дата вывода</span>
             <div class="date-display-row">
                 <span class="date-value-text">{{ toDisplayDate(editableDate) }}</span>
                 <input type="date" v-model="editableDate" class="real-input date-overlay" />
                 <svg class="calendar-icon-svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
             </div>
         </div>
      </div>

      <div class="popup-actions-row">
        <button class="btn-submit save-wide wd-btn-confirm" @click="handleSave" :disabled="amount <= 0 || isSaving || !fromAccountId || !selectedIndividualId">
          {{ btnText }}
        </button>

        <div class="icon-actions" v-if="isEditMode">
            <button class="icon-btn copy-btn" title="Копировать" @click="handleCopy" :disabled="isSaving"><svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 17H8V7h11v15Z"/></svg></button>
            <button class="icon-btn delete-btn" title="Удалить" @click="handleDeleteClick" :disabled="isSaving"><svg class="icon-stroke" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>
      </div>
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

    <InfoModal v-if="showInfoModal && !showSpecialCashInfo" :title="infoModalTitle" :message="infoModalMessage" @close="showInfoModal = false" />
    <ConfirmationPopup v-if="isDeleteConfirmVisible" title="Удаление вывода" message="Вы действительно хотите удалить этот вывод? Средства вернутся на баланс." confirmText="Удалить" @close="isDeleteConfirmVisible = false" @confirm="confirmDelete" />
  </div>
</template>

<style scoped>
/* 🟢 CSS ПЕРЕМЕННЫЕ */
.withdrawal-content {
    --color-withdrawal: #DE8FFF; 
    --color-danger: #FF3B30;
    --focus-shadow: rgba(222, 143, 255, 0.2);
    /* 🟢 Цвет фокуса селекта = цвету кнопки */
    --focus-color: #DE8FFF;
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
}
:deep(*), :deep(input), :deep(button), :deep(select) { font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important; }

.withdrawal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 3000; backdrop-filter: blur(2px); }
.withdrawal-content { background: #F4F4F4; padding: 2rem; border-radius: 12px; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem; display: flex; flex-direction: column; }
.theme-withdrawal { border-top: 4px solid var(--color-withdrawal); }

h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 2rem; text-align: left; font-size: 22px; font-weight: 700; }
.wd-info-box { background: #F3E5F5; border: 1px solid #E1BEE7; padding: 12px; border-radius: 8px; font-size: 13px; color: #4A148C; line-height: 1.4; margin-bottom: 1rem; }

.custom-input-box { width: 100%; height: 54px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; padding: 0 14px; display: flex; align-items: center; position: relative; transition: all 0.2s ease; box-sizing: border-box; }
.custom-input-box:focus-within { border-color: var(--color-withdrawal) !important; box-shadow: 0 0 0 1px var(--focus-shadow) !important; }
.input-inner-content { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.floating-label { font-size: 11px; color: #999; margin-bottom: -2px; margin-top: 4px; }
.real-input { width: 100%; border: none; background: transparent; font-size: 15px !important; color: #1a1a1a; font-weight: 500; outline: none; height: auto; line-height: 1.3; padding: 0; font-family: inherit; }
.wd-amount { font-weight: 500; font-size: 16px; }
.input-spacing { margin-bottom: 12px; }

/* Date */
.date-display-row { display: flex; justify-content: space-between; align-items: center; position: relative; width: 100%; }
.date-value-text { font-size: 15px; font-weight: 500; color: #1a1a1a; }
.date-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; z-index: 2; }
.calendar-icon-svg { width: 18px; height: 18px; stroke: #999; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

/* Inline Create */
.inline-create-form { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.create-input { flex-grow: 1; height: 48px; padding: 0 10px; border: 1px solid #E0E0E0; background: #fff; border-radius: 8px; font-size: 15px; margin: 0; font-family: inherit; box-sizing: border-box; }
.create-input:focus { outline: none; border-color: var(--color-withdrawal); box-shadow: 0 0 0 1px var(--focus-shadow); }

/* Unified Buttons */
.btn-inline-save { width: 48px; height: 48px; background-color: transparent; border: 1px solid var(--color-withdrawal); color: var(--color-withdrawal); border-radius: 8px; font-size: 20px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; }
.btn-inline-save:hover { background-color: var(--color-withdrawal); color: #fff; }
.btn-inline-cancel { width: 48px; height: 48px; background-color: transparent; border: 1px solid var(--color-danger); color: var(--color-danger); border-radius: 8px; font-size: 20px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; }
.btn-inline-cancel:hover { background-color: var(--color-danger); color: #fff; }

.popup-actions-row { display: flex; align-items: center; gap: 10px; margin-top: 2rem; }
.save-wide { flex: 1 1 auto; height: 54px; }
.icon-actions { display: flex; gap: 10px; }
.wd-btn-confirm { padding: 0 1rem; height: 50px; border: none; background: var(--color-withdrawal); color: #fff; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 16px; transition: background 0.2s; }
.wd-btn-confirm:hover:not(:disabled) { background: #8E24AA; }
.wd-btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }

.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 10px; cursor: pointer; background: #F4F4F4; border: 1px solid #E0E0E0; color: #333; transition: all 0.2s; padding: 0; }
.copy-btn:hover { background: #E8F5E9; border-color: #A5D6A7; color: #34C759; }
.delete-btn:hover { background: #FFF0F0; border-color: #FFD0D0; color: #FF3B30; }
.delete-btn:hover .icon-stroke { stroke: #FF3B30; }
.icon { width: 20px; height: 20px; fill: currentColor; display: block; }
.icon-stroke { width: 20px; height: 20px; stroke: #333; fill: none; transition: stroke 0.2s; }

/* Sticky buttons */
:deep(.list-item-wrapper.is-special) { color: var(--color-withdrawal); font-weight: 600; position: sticky !important; bottom: 0 !important; z-index: 10; background-color: #fff; border-top: 1px solid #eee; }
:deep(.list-item-wrapper.is-special:hover) { background-color: #F3E5F5; }

.relative { position: relative; }
.bank-suggestions-list { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #E0E0E0; border-top: none; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); z-index: 2000; list-style: none; padding: 0; margin: 0; max-height: 160px; overflow-y: auto; }
.bank-suggestions-list li { padding: 10px 14px; font-size: 14px; color: #333; cursor: pointer; border-bottom: 1px solid #f5f5f5; }
.bank-suggestions-list li:last-child { border-bottom: none; }
.bank-suggestions-list li:hover { background-color: #f9f9f9; }

/* 🟢 СТИЛИ ДЛЯ МОДАЛКИ ВЫБОРА (CHOICE BOX) */
.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 2100; }
.choice-box { background: #fff; padding: 24px; border-radius: 12px; width: 340px; text-align: center; box-shadow: 0 5px 30px rgba(0,0,0,0.3); }
.choice-box h4 { margin: 0 0 15px 0; color: #222; font-size: 18px; font-weight: 700; }
.choice-desc { font-size: 14px; color: #666; margin-bottom: 20px; }
.choice-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; }
.btn-choice-option { 
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 12px; background: #F9F9F9; border: 1px solid #E0E0E0; border-radius: 8px; cursor: pointer; transition: all 0.2s;
}
.btn-choice-option:hover { background: #f0f8ff; border-color: #DE8FFF; }
.opt-title { font-size: 15px; font-weight: 600; color: #222; margin-bottom: 4px; }
.btn-cancel-link { background: none; border: none; font-size: 14px; color: #888; cursor: pointer; text-decoration: underline; }
.btn-cancel-link:hover { color: #555; }

/* 🟢 Dual Action in Select */
.dual-action-row { display: flex; width: 100%; height: 46px; border-top: 1px solid #eee; }
.btn-dual-action { flex: 1; border: none; background-color: #fff; font-size: 13px; font-weight: 600; color: var(--color-withdrawal); cursor: pointer; transition: background-color 0.2s; white-space: nowrap; }
.btn-dual-action:hover { background-color: #f0f8ff; }
.btn-dual-action.left { border-right: 1px solid #eee; border-bottom-left-radius: 8px; }
.btn-dual-action.right { border-bottom-right-radius: 8px; }
</style>