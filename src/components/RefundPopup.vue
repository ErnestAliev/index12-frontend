<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';
import BaseSelect from './BaseSelect.vue';
import ConfirmationPopup from './ConfirmationPopup.vue'; 

/**
 * * --- МЕТКА ВЕРСИИ: v1.3 - TOOLTIPS ---
 * * ВЕРСИЯ: 1.3
 * * ДАТА: 2025-12-05
 * * ИЗМЕНЕНИЯ:
 * 1. (UI) Добавлены тултипы для счетов (показывают владельца).
 */

const props = defineProps({
  initialData: { type: Object, default: () => ({}) },
  operationToEdit: { type: Object, default: null }
});

const emit = defineEmits(['close', 'save', 'delete']);
const mainStore = useMainStore();

const amount = ref('');
const formattedAmount = ref('');
const dateValue = ref(new Date().toISOString().slice(0, 10));
const isSaving = ref(false);

// Поля выбора
const selectedAccountId = ref(null);
const selectedOwner = ref(null);
const selectedContractorValue = ref(null); 
const selectedProjectId = ref(null);
const selectedCategoryId = ref(null); 

// Состояние удаления
const showDeleteConfirm = ref(false); 

// Состояние
const isEditMode = computed(() => !!props.operationToEdit);
const title = computed(() => isEditMode.value ? 'Редактирование возврата' : 'Оформить возврат');
const btnText = computed(() => isEditMode.value ? 'Сохранить' : 'Подтвердить возврат');

// 🟢 1. Хелпер для названия владельца (для Tooltip)
const getOwnerName = (acc) => {
    if (acc.companyId) {
        const cId = (typeof acc.companyId === 'object') ? acc.companyId._id : acc.companyId;
        const c = mainStore.companies.find(comp => comp._id === cId);
        return c ? `Компания: ${c.name}` : 'Компания';
    }
    if (acc.individualId) {
        const iId = (typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
        const i = mainStore.individuals.find(ind => ind._id === iId);
        return i ? `Физлицо: ${i.name}` : 'Физлицо';
    }
    return 'Нет привязки';
};

// --- ОПЦИИ СЕЛЕКТОВ ---
const accountOptions = computed(() => {
  return mainStore.currentAccountBalances.map(acc => ({
    value: acc._id,
    label: acc.name,
    rightText: `${formatNumber(Math.abs(acc.balance))} ₸`,
    tooltip: getOwnerName(acc), // 🟢 Добавлена подсказка
  }));
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
          if (i._id === mainStore.retailIndividualId) return;
          opts.push({ value: `individual-${i._id}`, label: i.name, rightText: `${formatNumber(Math.abs(i.balance || 0))} ₸` }); 
      });
  }
  return opts;
});

const contractorOptions = computed(() => {
  const opts = [];
  const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
  const filteredContractors = mainStore.contractors.filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));
  
  if (filteredContractors.length > 0) {
      opts.push({ label: 'Контрагенты', isHeader: true });
      filteredContractors.forEach(c => opts.push({ value: `contr_${c._id}`, label: c.name }));
  }

  const ownerIds = new Set();
  mainStore.accounts.forEach(acc => {
      if (acc.individualId) {
          const iId = (typeof acc.individualId === 'object') ? acc.individualId._id : acc.individualId;
          ownerIds.add(iId);
      }
  });
  const filteredIndividuals = mainStore.individuals.filter(i => !ownerIds.has(i._id));
  
  if (filteredIndividuals.length > 0) {
      opts.push({ label: 'Физлица', isHeader: true });
      filteredIndividuals.forEach(i => opts.push({ value: `ind_${i._id}`, label: i.name }));
  }
  return opts;
});

const projectOptions = computed(() => {
  return mainStore.projects.map(p => ({ value: p._id, label: p.name }));
});

// --- HANDLERS ---
const onAmountInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = Number(raw);
  formattedAmount.value = formatNumber(Number(raw));
};

const handleAccountChange = (accId) => {
  const account = mainStore.accounts.find(a => a._id === accId);
  if (account) {
    if (account.companyId) { 
        const cId = (typeof account.companyId === 'object') ? account.companyId._id : account.companyId; 
        selectedOwner.value = `company-${cId}`; 
    } else if (account.individualId) { 
        const iId = (typeof account.individualId === 'object') ? account.individualId._id : account.individualId; 
        selectedOwner.value = `individual-${iId}`; 
    }
  }
};

const handleSave = async () => {
    if (amount.value <= 0 || !selectedAccountId.value || !selectedOwner.value || !selectedContractorValue.value) {
        alert('Заполните все обязательные поля (Сумма, Счет, Владелец, Контрагент)');
        return;
    }
    isSaving.value = true;

    let companyId = null, individualId = null;
    const [ownerType, ownerId] = selectedOwner.value.split('-');
    if (ownerType === 'company') companyId = ownerId; else individualId = ownerId;

    let contractorId = null, counterpartyIndividualId = null;
    const [contrType, contrId] = selectedContractorValue.value.split('_');
    if (contrType === 'contr') contractorId = contrId; else counterpartyIndividualId = contrId;

    let catId = mainStore.refundCategoryId;
    if (!catId) {
        // 🔥 DISABLED: System categories removed
        // const res = await mainStore.ensureSystemEntities();
        throw new Error('RefundPopup disabled - system categories removed');
        catId = res.refundCat._id;
    }

    const payload = {
        type: 'expense', 
        amount: -Math.abs(amount.value),
        date: new Date(dateValue.value),
        accountId: selectedAccountId.value,
        companyId, individualId,
        contractorId, counterpartyIndividualId,
        categoryId: catId,
        projectId: selectedProjectId.value || null,
        description: 'Возврат средств'
    };

    emit('save', { 
        mode: isEditMode.value ? 'edit' : 'create', 
        id: props.operationToEdit?._id, 
        data: payload 
    });
};

const askDelete = () => {
    showDeleteConfirm.value = true;
};

const confirmDelete = () => {
    emit('delete', props.operationToEdit);
    showDeleteConfirm.value = false;
};

onMounted(async () => {
    // 🔥 DISABLED: System categories removed
    // if (!mainStore.refundCategoryId) await mainStore.ensureSystemEntities();
    throw new Error('RefundPopup disabled - refundCategoryId not available');
    selectedCategoryId.value = mainStore.refundCategoryId;

    if (isEditMode.value) {
        const op = props.operationToEdit;
        amount.value = Math.abs(op.amount);
        formattedAmount.value = formatNumber(amount.value);
        dateValue.value = new Date(op.date).toISOString().slice(0, 10);
        selectedAccountId.value = op.accountId?._id || op.accountId;
        selectedProjectId.value = op.projectId?._id || op.projectId;
        
        if (op.companyId) selectedOwner.value = `company-${op.companyId._id || op.companyId}`;
        else if (op.individualId) selectedOwner.value = `individual-${op.individualId._id || op.individualId}`;

        if (op.contractorId) selectedContractorValue.value = `contr_${op.contractorId._id || op.contractorId}`;
        else if (op.counterpartyIndividualId) selectedContractorValue.value = `ind_${op.counterpartyIndividualId._id || op.counterpartyIndividualId}`;
    } else {
        if (props.initialData.contractorValue) {
            selectedContractorValue.value = props.initialData.contractorValue;
        }
    }
    nextTick(() => document.querySelector('.amount-input')?.focus());
});
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <div class="header-row">
         <h3>{{ title }}</h3>
         <!-- Кнопка удаления -->
         <button v-if="isEditMode" class="btn-icon-delete" @click="askDelete" title="Удалить">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
         </button>
      </div>

      <!-- СУММА -->
      <div class="input-box">
         <label class="field-label">Сумма возврата</label>
         <input type="text" v-model="formattedAmount" @input="onAmountInput" class="amount-input" placeholder="0 ₸" />
      </div>

      <!-- СЧЕТ -->
      <BaseSelect
          v-model="selectedAccountId"
          :options="accountOptions"
          label="Со счета"
          placeholder="Выберите счет"
          class="input-spacing"
          @change="handleAccountChange"
      />

      <!-- ВЛАДЕЛЕЦ -->
      <BaseSelect
          v-model="selectedOwner"
          :options="ownerOptions"
          label="От кого (Владелец)"
          placeholder="Владелец счета"
          class="input-spacing"
      />

      <!-- КОНТРАГЕНТ -->
      <BaseSelect
          v-model="selectedContractorValue"
          :options="contractorOptions"
          label="Кому (Контрагент)"
          placeholder="Выберите получателя"
          class="input-spacing"
      />

      <!-- ПРОЕКТ -->
      <BaseSelect
          v-model="selectedProjectId"
          :options="projectOptions"
          label="Проект"
          placeholder="Без проекта"
          class="input-spacing"
      />
      
      <!-- ДАТА -->
      <div class="input-box">
         <label class="field-label">Дата</label>
         <input type="date" v-model="dateValue" class="date-input" />
      </div>

      <div class="actions">
        <button class="btn-cancel" @click="$emit('close')">Отмена</button>
        <button class="btn-confirm" @click="handleSave" :disabled="isSaving">
            {{ isSaving ? 'Сохранение...' : btnText }}
        </button>
      </div>
    </div>

    <ConfirmationPopup 
        v-if="showDeleteConfirm" 
        title="Удаление возврата" 
        message="Вы действительно хотите удалить операцию возврата?" 
        confirmText="Удалить"
        @close="showDeleteConfirm = false" 
        @confirm="confirmDelete" 
    />
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 3000; pointer-events: auto; }
.popup-content { background: #F4F4F4; padding: 20px; border-radius: 12px; width: 420px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 10px; }

.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
h3 { margin: 0; color: #222; font-size: 1.2rem; font-weight: 700; }

.input-box { margin-bottom: 5px; }
.field-label { display: block; font-size: 11px; color: #888; margin-bottom: 2px; margin-left: 2px; font-weight: 500; }
.input-spacing { margin-bottom: 8px; }

.amount-input { width: 100%; font-size: 18px; font-weight: 700; padding: 10px; border: 1px solid #ddd; border-radius: 8px; outline: none; text-align: right; color: #222; box-sizing: border-box; background-color: #ffffff; }
.amount-input:focus { border-color: #7B1FA2; }

.date-input { width: 100%; height: 42px; padding: 0 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; color: #222; background: #fff; box-sizing: border-box; }

.actions { display: flex; gap: 10px; margin-top: 15px; }
.btn-cancel { flex: 1; padding: 12px; background: #eee; border: none; border-radius: 6px; cursor: pointer; color: #333; font-weight: 500; }
.btn-confirm { flex: 1; padding: 12px; background: #7B1FA2; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; white-space: nowrap; }
.btn-confirm:disabled { opacity: 0.6; }

.btn-icon-delete { background: none; border: none; cursor: pointer; color: #ff3b30; }
.btn-icon-delete svg { width: 20px; height: 20px; }
</style>